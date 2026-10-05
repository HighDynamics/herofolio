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
    if (line.status !== "applied") continue;
    const key = stackingGroup(line);
    groups.set(key, [...(groups.get(key) ?? []), line]);
  }

  for (const [key, group] of groups) {
    // Worst penalty wins within a penalty group; otherwise the highest value.
    const strength = (l: StatLine) =>
      key.startsWith("penalty|") ? -l.amount : l.amount;
    const winner = group.reduce((a, b) => (strength(b) > strength(a) ? b : a));
    for (const line of group) {
      if (line === winner) continue;
      line.status = "suppressed";
      line.reason = `Doesn't stack with ${describe(winner)}`;
    }
  }
}

export type ResolveOptions = {
  // Drop lines before stacking, e.g. armor bonuses for touch AC.
  exclude?: (line: StatLine) => boolean;
};

export type StatEngine = ReturnType<typeof createStatEngine>;

export function createStatEngine(contributions: Contribution[]) {
  const cache = new Map<StatKey, ResolvedStat>();
  const inProgress = new Set<StatKey>();

  function amountOf(c: Contribution): number {
    if (typeof c.value === "number") return c.value;
    const from = resolve(c.value.from);
    if (!from.hasBase) return 0;
    const raw =
      c.value.as === "modifier" ? abilityModifier(from.total) : from.total;
    return c.value.max !== undefined ? Math.min(raw, c.value.max) : raw;
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
            amount: amountOf(c),
            status: c.condition ? "conditional" : "applied",
          }),
        )
        .filter((line) => !opts.exclude?.(line));

      applyStacking(lines);

      const applied = lines.filter((l) => l.status === "applied");
      const base = applied.find((l) => l.op === "base");
      const bonus = applied
        .filter((l) => l.op === "add")
        .reduce((sum, l) => sum + l.amount, 0);

      const result: ResolvedStat = {
        key,
        hasBase: !!base,
        total: (base?.amount ?? 0) + bonus,
        lines,
      };
      if (cacheable) cache.set(key, result);
      return result;
    } finally {
      inProgress.delete(key);
    }
  }

  return { resolve };
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
