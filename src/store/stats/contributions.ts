import type {
  ActiveSource,
  ChoiceTarget,
  Contribution,
  DerivedValue,
  EffectDef,
  EnergyType,
  Operation,
  SaveName,
  ScalingValue,
  SpeedMode,
  StatSelector,
} from "./types";

// ─── Character sheet → contributions ──────────────────────────────────────────
// Stored values become typed contributions so they go through stacking like
// everything else. This is the bridge while totals still live on ICharacter.

const mod = (ability: Ability): DerivedValue => ({
  from: `ability.${ability}`,
  as: "modifier",
});

export function characterContributions(
  character: ICharacter,
  skillCompendium: CompendiumSkill[],
): Contribution[] {
  const out: Contribution[] = [];
  const push = (
    target: StatSelector,
    label: string,
    value: number | DerivedValue,
    bonusType: BonusType = "untyped",
    op: Operation = "add",
  ) => {
    if (value === 0) return;
    out.push({
      target,
      op,
      bonusType,
      value,
      label,
      sourceKey: `character:${target}:${label}`,
      sourceLabel: "Character sheet",
    });
  };

  const { abilities, armorClass: ac, saves } = character;

  for (const [ability, score] of Object.entries(abilities.score)) {
    if (score !== null) {
      push(`ability.${ability as Ability}`, "Score", score, "untyped", "base");
    }
  }

  push("ac", "Base", 10, "untyped", "base");
  push("ac", "Armor", ac.armor, "armor");
  push("ac", "Shield", ac.shield, "shield");
  push("ac", "Natural armor", ac.naturalArmor, "naturalArmor");
  push("ac", "Deflection", ac.deflection, "deflection");
  push("ac", "Size", ac.size, "size");
  push("ac", "Misc", ac.misc);
  push("ac", "Dexterity", { ...mod("dexterity"), max: "maxDex" });

  for (const name of ["fortitude", "reflex", "will"] as SaveName[]) {
    const save = saves[name];
    push(`save.${name}`, "Base", save.base, "untyped", "base");
    push(`save.${name}`, "Magic", save.magic, "resistance");
    push(`save.${name}`, "Misc", save.misc);
    push(`save.${name}`, camelToLabel(save.ability), mod(save.ability));
  }

  push("initiative", "Dexterity", mod("dexterity"));
  push("initiative", "Misc", character.initiative.misc);

  for (const [mode, speed] of Object.entries(character.speed)) {
    push(`speed.${mode as SpeedMode}`, "Base", speed, "untyped", "base");
  }

  push("sr", "Base", character.spellResistance, "untyped", "base");
  push("dr", "Base", character.damageReduction.amount, "untyped", "base");
  for (const [energy, amount] of Object.entries(character.energyResistance)) {
    if (amount !== null) {
      push(`resist.${energy as EnergyType}`, "Base", amount, "untyped", "base");
    }
  }

  push("hp.max", "Base", character.hitPoints.total, "untyped", "base");
  push("hp.temp", "Base", character.hitPoints.temporary, "untyped", "base");

  for (const ref of character.skillRefs) {
    const skill = skillCompendium.find((s) => s.id === ref.id);
    push(`skill.${ref.id}`, "Ranks", ref.ranks, "untyped", "base");
    push(`skill.${ref.id}`, "Misc", ref.miscModifier);
    if (skill) push(`skill.${ref.id}`, camelToLabel(skill.ability), mod(skill.ability));
  }

  for (const ref of character.abilityRefs) {
    push(`uses.${ref.id}`, "Base", ref.uses, "untyped", "base");
  }

  return out;
}

const camelToLabel = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ─── Active sources → contributions ───────────────────────────────────────────

export type SourceEntry = {
  label: string;
  effects: EffectDef[];
  casterLevel?: number; // items carry their own
};

export type SourceLookup = (ref: SourceRef) => SourceEntry | undefined;

export function scale(v: ScalingValue, level: number) {
  const steps = Math.floor(
    Math.max(0, level - (v.startAt ?? 0)) / (v.every ?? 1),
  );
  const amount = (v.base ?? 0) + v.per * steps;
  return v.max !== undefined ? Math.min(amount, v.max) : amount;
}

function highestCasterLevel(character: ICharacter) {
  return Math.max(0, ...character.classes.map((c) => c.magic?.casterLevel ?? 0));
}

function resolveTarget(
  target: StatSelector | ChoiceTarget,
  choices: Record<string, string> = {},
): StatSelector | null {
  if (typeof target === "string") return target;
  const picked = choices[target.choice];
  return picked ? (`${target.prefix}.${picked}` as StatSelector) : null;
}

export function sourceContributions(
  character: ICharacter,
  sources: ActiveSource[],
  lookup: SourceLookup,
): Contribution[] {
  const out: Contribution[] = [];

  for (const source of sources) {
    const entry: SourceEntry | undefined =
      source.custom ?? (source.ref && lookup(source.ref));
    if (!entry) continue;

    // Keyed by compendium id, so two castings of the same spell don't stack.
    const sourceKey = source.ref
      ? `${source.ref.kind}:${source.ref.id}`
      : `custom:${source.instanceId}`;
    const casterLevel =
      source.casterLevel ?? entry.casterLevel ?? highestCasterLevel(character);

    for (const effect of entry.effects) {
      const target = resolveTarget(effect.target, source.choices);
      if (!target) continue;

      let value: number | DerivedValue;
      if (typeof effect.value === "object" && "scale" in effect.value) {
        const s = effect.value.scale;
        const level =
          s === "casterLevel"
            ? casterLevel
            : (character.classes.find((c) => c.name === s.classLevel)?.level ?? 0);
        value = scale(effect.value, level);
      } else {
        value = effect.value;
      }

      out.push({
        target,
        op: effect.op ?? "add",
        bonusType: effect.bonusType,
        enhances: effect.enhances,
        value,
        label: effect.label ?? entry.label,
        sourceKey,
        sourceLabel: entry.label,
        condition: effect.condition,
      });
    }
  }

  return out;
}
