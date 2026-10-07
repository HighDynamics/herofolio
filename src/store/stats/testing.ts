import type { Contribution, StatSelector } from "./types";

// Test helper: a contribution with sensible defaults, its own source unless given one.
let nextSource = 0;
export function contribution(
  target: StatSelector,
  value: Contribution["value"],
  rest: Partial<Contribution> = {},
): Contribution {
  const label = rest.label ?? `Source ${++nextSource}`;
  return {
    target,
    op: "add",
    bonusType: "untyped",
    value,
    label,
    sourceKey: label,
    sourceLabel: label,
    ...rest,
  };
}

export const base = (target: StatSelector, value: number) =>
  contribution(target, value, { op: "base", label: "Base" });

// A level 1 human with 10s, no gear and no skills.
export function makeCharacter(overrides: Partial<ICharacter> = {}): ICharacter {
  const save = (ability: Ability): Save => ({
    base: 0,
    magic: 0,
    misc: 0,
    ability,
  });
  return {
    id: "test",
    name: "Test",
    type: ["Human"],
    hitPoints: { dieSize: 8, total: 8, damage: 0, temporary: 0 },
    initiative: { misc: 0 },
    armorClass: {
      armor: 0,
      shield: 0,
      dexterity: 0,
      size: 0,
      naturalArmor: 0,
      deflection: 0,
      misc: 0,
    },
    damageReduction: { amount: 0, weakness: "" },
    spellResistance: 0,
    energyResistance: { acid: 0, cold: 0, electricity: 0, fire: 0, sonic: 0 },
    saves: {
      fortitude: save("constitution"),
      reflex: save("dexterity"),
      will: save("wisdom"),
    },
    size: "Medium",
    alignment: "Neutral",
    abilities: {
      score: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      },
      primary: "strength",
    },
    speed: { land: 30, fly: 0, swim: 0, burrow: 0 },
    classes: [{ name: "Fighter", level: 1 }],
    skillRefs: [],
    skillSynergyRefs: [],
    abilityRefs: [],
    slaRefs: [],
    itemRefs: [],
    activeSources: [],
    ...overrides,
  };
}
