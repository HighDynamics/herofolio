import { describe, expect, it } from "vitest";

import { characterContributions } from "./contributions";
import { createStatEngine } from "./engine";
import { makeCharacter } from "./testing";

const skill = (id: string, name: string, ability: Ability): CompendiumSkill => ({
  id,
  name,
  ability,
  armorCheck: false,
  isDefault: true,
});
const skills = [
  skill("bluff", "Bluff", "charisma"),
  skill("diplomacy", "Diplomacy", "charisma"),
  skill("disguise", "Disguise", "charisma"),
  skill("senseMotive", "Sense Motive", "wisdom"),
];

const synergy = (
  id: string,
  fromSkillId: string,
  toSkillId: string,
  condition?: string,
): CompendiumSkillSynergy => ({
  id,
  fromSkillId,
  toSkillId,
  ranksRequired: 5,
  bonus: 2,
  condition,
  isDefault: true,
});
const synergies = [
  synergy("bluffDiplomacy", "bluff", "diplomacy"),
  synergy("senseMotiveDiplomacy", "senseMotive", "diplomacy"),
  synergy("bluffDisguise", "bluff", "disguise", "to act in character"),
];

const ranks = (id: string, ranks: number): SkillRef => ({
  id,
  ranks,
  miscModifier: 0,
  classSkill: true,
});

function engineFor(character: ICharacter) {
  return createStatEngine(characterContributions(character, skills, synergies));
}

describe("skill synergies", () => {
  const allSynergies = synergies.map((s) => s.id);

  it("gives +2 to the target skill from 5 ranks", () => {
    const engine = engineFor(
      makeCharacter({
        skillRefs: [ranks("bluff", 5), ranks("diplomacy", 4)],
        skillSynergyRefs: allSynergies,
      }),
    );
    const diplomacy = engine.resolve("skill.diplomacy");
    expect(diplomacy.total).toBe(6);
    expect(diplomacy.lines.map((l) => l.label)).toContain("Bluff synergy");
  });

  it("needs the ranks", () => {
    const engine = engineFor(
      makeCharacter({
        skillRefs: [ranks("bluff", 4), ranks("diplomacy", 4)],
        skillSynergyRefs: allSynergies,
      }),
    );
    expect(engine.resolve("skill.diplomacy").total).toBe(4);
  });

  it("stacks synergies from different skills", () => {
    const engine = engineFor(
      makeCharacter({
        skillRefs: [ranks("bluff", 5), ranks("senseMotive", 5), ranks("diplomacy", 1)],
        skillSynergyRefs: allSynergies,
      }),
    );
    expect(engine.resolve("skill.diplomacy").total).toBe(5);
  });

  it("makes conditional synergies conditional lines", () => {
    const engine = engineFor(
      makeCharacter({
        skillRefs: [ranks("bluff", 5), ranks("disguise", 3)],
        skillSynergyRefs: allSynergies,
      }),
    );
    const disguise = engine.resolve("skill.disguise");
    expect(disguise.total).toBe(3);
    expect(disguise.lines.find((l) => l.condition)).toMatchObject({
      status: "conditional",
      amount: 2,
      condition: "to act in character",
    });
  });

  it("only uses the character's synergies", () => {
    const engine = engineFor(
      makeCharacter({
        skillRefs: [ranks("bluff", 5), ranks("diplomacy", 1)],
        skillSynergyRefs: [],
      }),
    );
    expect(engine.resolve("skill.diplomacy").total).toBe(1);
  });
});
