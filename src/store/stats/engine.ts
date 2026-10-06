import type {
  Contribution,
  ResolvedStat,
  StatKey,
  StatLine,
  StatSelector,
} from "./types";

const ALWAYS_STACKS: BonusType[] = ["dodge", "circumstance", "untyped"];

const abilityModifier = (score: number) => Math.floor((score - 10) / 2);

export function matches(selector: StatSelector, key: StatKey) {
  if (selector === key) return true;
  return selector.endsWith(".*") && key.startsWith(selector.slice(0, -1));
}

const describe = (line: StatLine) => `${line.label} (${line.sourceLabel})`;

function suppress(line: StatLine, reason: string) {
  line.status = "suppressed";
  line.reason = reason;
}

// Lines in the same group don't stack; only one of them applies.
function stackingGroup(line: StatLine): string {
  if (line.op === "base") return "base";
  // Penalties stack regardless of type, except with the same source.
  if (line.amount < 0) return `penalty|${line.sourceKey}`;
  const type = line.enhances
    ? `enhancement(${line.enhances})`
    : line.bonusType;
  return ALWAYS_STACKS.includes(line.bonusType)
    ? `${type}|${line.sourceKey}`
    : type;
}

function applyStacking(lines: StatLine[]) {
  const groups = new Map<string, StatLine[]>();
  for (const line of lines) {
    if (line.status !== "applied" || line.op === "set") continue;
    const key = stackingGroup(line);
    groups.set(key, [...(groups.get(key) ?? []), line]);
  }

  for (const [key, group] of groups) {
    // The worst penalty wins within a penalty group; otherwise the highest value.
    const strength = (l: StatLine) =>
      key.startsWith("penalty|") ? -l.amount : l.amount;
    const winner = group.reduce((a, b) => (strength(b) > strength(a) ? b : a));
    for (const line of group) {
      if (line !== winner) {
        suppress(line, `Doesn't stack with ${describe(winner)}`);
      }
    }
  }
}

// Stats that only exist with a base. Speed bonuses (haste's +30 to every mode)
// only improve movement modes the character already has, and raising a max
// Dex cap (mithral) needs armor that imposes one.
const NEEDS_BASE: Record<string, (name: string) => string> = {
  speed: (mode) => `No ${mode} speed`,
  maxDex: (slot) => `No ${slot} max Dex to raise`,
};

function requireBase(key: StatKey, lines: StatLine[]) {
  const [stat, name] = key.split(".");
  const reason = NEEDS_BASE[stat];
  if (!reason) return;
  const applied = lines.filter((l) => l.status === "applied");
  if (applied.some((l) => l.op === "base")) return;
  for (const line of applied) suppress(line, reason(name));
}

// A set overrides the stat's base and every bonus and penalty. It never gives
// a creature an ability score it lacks (an undead's Con stays a nonability).
// With several sets, the last one wins: contributions come in activeSources
// order, which is activation order, and in effect order within a source. Sets
// from other sources with different values are reported as a collision for
// the user to sort out; one source's own sets are its author's call.
function applySet(
  key: StatKey,
  lines: StatLine[],
): ResolvedStat["setCollision"] {
  const applied = lines.filter((l) => l.status === "applied");
  const sets = applied.filter((l) => l.op === "set");
  const set = sets.at(-1);
  if (!set) return;
  if (key.startsWith("ability.") && !applied.some((l) => l.op === "base")) {
    for (const line of sets) suppress(line, "No score to set");
    return;
  }
  for (const line of applied) {
    if (line === set) continue;
    suppress(
      line,
      line.op !== "set"
        ? `Overridden by ${describe(set)}`
        : line.sourceKey === set.sourceKey
          ? `Replaced by ${describe(set)}, listed later`
          : `Replaced by ${describe(set)}, activated later`,
    );
  }
  // A conditional bonus can't apply while the stat is set, but a conditional
  // set still could.
  for (const line of lines) {
    if (line.status === "conditional" && line.op !== "set") {
      suppress(line, `Overridden by ${describe(set)}`);
    }
  }
  const others = sets.filter(
    (l) => l.sourceKey !== set.sourceKey && l.amount !== set.amount,
  );
  return others.length ? { winner: set, others } : undefined;
}

export type ResolveOptions = {
  // Drop lines before stacking, e.g. armor bonuses for touch AC.
  exclude?: (line: StatLine) => boolean;
};

export type StatEngine = ReturnType<typeof createStatEngine>;

export function createStatEngine(contributions: Contribution[]) {
  const cache = new Map<StatKey, ResolvedStat>();
  const inProgress = new Set<StatKey>();

  // The cap on Dex to AC: the lowest of the maxDex.* stats that have a base
  // (armor, shield, load), or undefined when nothing caps it.
  function maxDex(): number | undefined {
    const slots = new Set(
      contributions
        .map((c) => c.target)
        .filter((t): t is StatKey => t.startsWith("maxDex.") && t !== "maxDex.*"),
    );
    const caps = [...slots]
      .map((slot) => resolve(slot))
      .filter((cap) => cap.hasBase)
      .map((cap) => Math.max(0, cap.total));
    return caps.length ? Math.min(...caps) : undefined;
  }

  function amountOf(c: Contribution): Pick<StatLine, "amount" | "uncapped"> {
    if (typeof c.value === "number") return { amount: c.value };
    const from = resolve(c.value.from);
    if (!from.hasBase) return { amount: 0 };
    const raw =
      c.value.as === "modifier" ? abilityModifier(from.total) : from.total;
    const cap = c.value.max === "maxDex" ? maxDex() : c.value.max;
    return cap === undefined || raw <= cap
      ? { amount: raw }
      : { amount: cap, uncapped: raw };
  }

  function resolve(key: StatKey, opts: ResolveOptions = {}): ResolvedStat {
    const cacheable = !opts.exclude;
    const cached = cacheable && cache.get(key);
    if (cached) return cached;
    if (inProgress.has(key)) throw new Error(`Stat dependency cycle at ${key}`);

    inProgress.add(key);
    try {
      const lines = contributions
        .filter((c) => matches(c.target, key))
        .map(
          (c): StatLine => ({
            ...c,
            ...amountOf(c),
            status: c.condition ? "conditional" : "applied",
          }),
        )
        .filter((line) => !opts.exclude?.(line));

      requireBase(key, lines);
      applyStacking(lines);
      const setCollision = applySet(key, lines);

      const applied = lines.filter((l) => l.status === "applied");
      const set = applied.find((l) => l.op === "set");
      const base = applied.find((l) => l.op === "base");
      const bonus = applied
        .filter((l) => l.op === "add")
        .reduce((sum, l) => sum + l.amount, 0);

      const result: ResolvedStat = {
        key,
        hasBase: !!(set ?? base),
        total: set ? set.amount : (base?.amount ?? 0) + bonus,
        lines,
        ...(setCollision && { setCollision }),
      };
      if (cacheable) cache.set(key, result);
      return result;
    } finally {
      inProgress.delete(key);
    }
  }

  return { resolve, maxDex };
}

// ─── Stat-specific views ──────────────────────────────────────────────────────

const ARMOR_TYPES: string[] = ["armor", "shield", "naturalArmor"];

const isDexBonus = (l: StatLine) =>
  l.amount > 0 &&
  typeof l.value === "object" &&
  l.value.from === "ability.dexterity";

export function resolveArmorClass(engine: StatEngine) {
  return {
    total: engine.resolve("ac"),
    touch: engine.resolve("ac", {
      exclude: (l) => ARMOR_TYPES.includes(l.enhances ?? l.bonusType),
    }),
    flatFooted: engine.resolve("ac", {
      exclude: (l) => l.bonusType === "dodge" || isDexBonus(l),
    }),
  };
}

export function abilityModifierOf(engine: StatEngine, ability: Ability) {
  const stat = engine.resolve(`ability.${ability}`);
  return stat.hasBase ? abilityModifier(stat.total) : null;
}
