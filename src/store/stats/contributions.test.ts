import { describe, expect, it } from "vitest";

import { activateSource, deactivateSource } from "./activeSources";
import {
  characterContributions,
  sourceContributions,
  type SourceEntry,
} from "./contributions";
import {
  abilityModifierOf,
  createStatEngine,
  resolveArmorClass,
} from "./engine";
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

describe("active sources on a character sheet", () => {
  const entries: Record<string, SourceEntry> = {
    paralyzed: {
      label: "Paralyzed",
      effects: [
        { target: "ability.strength", op: "set", bonusType: "untyped", value: 0 },
        { target: "ability.dexterity", op: "set", bonusType: "untyped", value: 0 },
      ],
    },
    cursedDex: {
      label: "Curse of clumsiness",
      effects: [
        { target: "ability.dexterity", op: "set", bonusType: "untyped", value: 3 },
      ],
    },
    haste: {
      label: "Haste",
      effects: [{ target: "speed.*", bonusType: "enhancement", value: 30 }],
    },
    fullPlate: {
      label: "Full plate",
      effects: [
        { target: "ac", bonusType: "armor", value: 8 },
        { target: "maxDex.armor", op: "base", bonusType: "untyped", value: 1 },
      ],
    },
  };

  function engineWith(character: ICharacter, ...ids: string[]) {
    return createStatEngine([
      ...characterContributions(character, skills, synergies),
      ...sourceContributions(
        character,
        ids.map((id) => ({ instanceId: id, ref: { kind: "item", id } })),
        (ref) => entries[ref.id],
      ),
    ]);
  }

  const dex18 = makeCharacter({
    abilities: {
      score: {
        strength: 16,
        dexterity: 18,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      },
      primary: "dexterity",
    },
    saves: {
      fortitude: { base: 2, magic: 0, misc: 0, ability: "constitution" },
      reflex: { base: 2, magic: 0, misc: 0, ability: "dexterity" },
      will: { base: 0, magic: 0, misc: 0, ability: "wisdom" },
    },
  });

  it("paralysis sets Str and Dex to 0, and Dex-based stats follow", () => {
    const engine = engineWith(dex18, "paralyzed");
    expect(engine.resolve("ability.strength").total).toBe(0);
    expect(resolveArmorClass(engine).total.total).toBe(5);
    expect(engine.resolve("initiative").total).toBe(-5);
    expect(engine.resolve("save.reflex").total).toBe(-3);
  });

  it("lets the most recently activated set win, in activeSources order", () => {
    const paralyzedLast = engineWith(dex18, "cursedDex", "paralyzed");
    expect(paralyzedLast.resolve("ability.dexterity").total).toBe(0);

    const cursedLast = engineWith(dex18, "paralyzed", "cursedDex");
    const dex = cursedLast.resolve("ability.dexterity");
    expect(dex.total).toBe(3);
    expect(dex.setCollision?.winner.sourceLabel).toBe("Curse of clumsiness");
    expect(dex.setCollision?.others[0].sourceLabel).toBe("Paralyzed");
  });

  it("lets the latest activation win through activate and deactivate", () => {
    const item = (id: string) => ({ ref: { kind: "item" as const, id } });
    const dexOf = (character: ICharacter) =>
      createStatEngine([
        ...characterContributions(character, skills, synergies),
        ...sourceContributions(
          character,
          character.activeSources,
          (ref) => entries[ref.id],
        ),
      ]).resolve("ability.dexterity").total;

    let character = activateSource(dex18, item("paralyzed"), "first");
    character = activateSource(character, item("cursedDex"), "second");
    expect(dexOf(character)).toBe(3);

    // Reactivating paralysis makes it the latest, so it wins now.
    character = deactivateSource(character, "first");
    character = activateSource(character, item("paralyzed"), "third");
    expect(character.activeSources.map((s) => s.instanceId)).toEqual([
      "second",
      "third",
    ]);
    expect(dexOf(character)).toBe(0);
  });

  it("haste raises land speed only", () => {
    const engine = engineWith(dex18, "haste");
    expect(engine.resolve("speed.land").total).toBe(60);
    expect(engine.resolve("speed.fly").total).toBe(0);
  });

  it("full plate caps Dex to AC but not Reflex", () => {
    const engine = engineWith(dex18, "fullPlate");
    const ac = resolveArmorClass(engine);
    expect(ac.total.total).toBe(19);
    expect(ac.touch.total).toBe(11);
    expect(engine.resolve("save.reflex").total).toBe(6);
  });

  it("treats a sheet score of 0 as a score, not a nonability", () => {
    const dex0 = makeCharacter({
      abilities: {
        ...dex18.abilities,
        score: { ...dex18.abilities.score, dexterity: 0 },
      },
    });
    const engine = engineWith(dex0);
    const dex = engine.resolve("ability.dexterity");
    expect(dex).toMatchObject({ hasBase: true, total: 0 });
    expect(abilityModifierOf(engine, "dexterity")).toBe(-5);
    expect(resolveArmorClass(engine).total.total).toBe(5);
  });
});
