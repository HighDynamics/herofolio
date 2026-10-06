// ─── Stat keys ────────────────────────────────────────────────────────────────
// Every number on the sheet that can be modified has a key. Effects target keys
// (or wildcard selectors like "save.*"); the engine resolves keys to totals.

export type SaveName = "fortitude" | "reflex" | "will";
export type EnergyType = keyof ICharacter["energyResistance"];
export type SpeedMode = keyof ICharacter["speed"];

export type StatKey =
  | "ac"
  | "initiative"
  | "bab"
  | "attack.melee"
  | "attack.ranged"
  | "damage.melee"
  | "damage.ranged"
  | "casterLevel"
  | "hp.max"
  | "hp.temp"
  | "sr"
  | "dr"
  | `ability.${Ability}`
  | `save.${SaveName}`
  | `skill.${string}`
  | `speed.${SpeedMode}`
  | `resist.${EnergyType}`
  | `uses.${string}`
  // A cap on the Dex bonus to AC, one per thing imposing it (armor, shield, load).
  | `maxDex.${string}`;

export type StatSelector =
  | StatKey
  | "ability.*"
  | "save.*"
  | "skill.*"
  | "attack.*"
  | "damage.*"
  | "speed.*"
  | "maxDex.*";

// A target whose last segment is picked when the source is activated,
// e.g. resist energy → { prefix: "resist", choice: "energy" } + choices.energy = "fire".
export type ChoiceTarget = {
  prefix: "ability" | "save" | "skill" | "speed" | "resist";
  choice: string;
};

// ─── Effect authoring (compendium side) ───────────────────────────────────────

// add:  a typed bonus or penalty, subject to stacking rules.
// base: a candidate for the stat's starting value — highest wins
//       (racial land speed vs. fly spell, racial SR vs. spell resistance, temp HP).
// set:  fixes the stat at this value, overriding its base and every bonus and
//       penalty (paralysis → Str and Dex 0). With several, the most recently
//       activated wins and the stat reports the collision.
export type Operation = "add" | "base" | "set";

// Enhancement bonuses to AC always improve a specific kind of AC bonus.
export type EnhanceableAc = "armor" | "shield" | "naturalArmor";

// "+2, +1 per 3 caster levels above 3rd (max +5)"
//   → { scale: "casterLevel", base: 2, per: 1, every: 3, startAt: 3, max: 5 }
export type ScalingValue = {
  scale: "casterLevel" | { classLevel: string };
  base?: number;
  per: number;
  every?: number;
  startAt?: number;
  max?: number;
};

// A value read from another stat, e.g. Dex modifier to AC, Cha modifier to saves.
export type DerivedValue = {
  from: StatKey;
  as: "modifier" | "total";
  // Caps the amount: a number, or "maxDex" for the lowest maxDex.* cap (Dex to AC).
  max?: number | "maxDex";
};

export type EffectDef = {
  label?: string; // defaults to the source's label
  target: StatSelector | ChoiceTarget;
  op?: Operation; // default "add"
  bonusType: BonusType;
  enhances?: EnhanceableAc;
  value: number | ScalingValue | DerivedValue;
  condition?: string; // shown in the breakdown, never added to the total
};

// ─── Character side ───────────────────────────────────────────────────────────

// One thing currently affecting the character: a spell cast on them, an item
// worn, an ability in use, or an ad-hoc effect the DM called for.
export type ActiveSource = {
  instanceId: string;
  ref?: SourceRef;
  custom?: { label: string; effects: EffectDef[] };
  casterLevel?: number; // override, e.g. a buff from the party cleric
  choices?: Record<string, string>;
};

// ─── Engine input / output ────────────────────────────────────────────────────

export type Contribution = {
  target: StatSelector;
  op: Operation;
  bonusType: BonusType;
  enhances?: EnhanceableAc;
  value: number | DerivedValue;
  label: string;
  // Stacking identity: contributions with the same sourceKey never stack with
  // each other, even dodge/untyped/circumstance or penalties.
  sourceKey: string;
  sourceLabel: string;
  condition?: string;
};

export type StatLine = Contribution & {
  amount: number;
  status: "applied" | "suppressed" | "conditional";
  reason?: string; // why a suppressed line doesn't apply
  uncapped?: number; // the amount before a max (e.g. armor max Dex) cut it down
};

export type ResolvedStat = {
  key: StatKey;
  hasBase: boolean; // false for e.g. a null Con score
  total: number;
  lines: StatLine[];
  // Two or more sets with different values: the most recently activated won,
  // and the user should know the others were replaced.
  setCollision?: { winner: StatLine; others: StatLine[] };
};
