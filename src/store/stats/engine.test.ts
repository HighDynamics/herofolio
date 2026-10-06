import { describe, expect, it } from "vitest";

import { createStatEngine, resolveArmorClass } from "./engine";
import { base, contribution as c } from "./testing";

const dexToAc = c(
  "ac",
  { from: "ability.dexterity", as: "modifier", max: "maxDex" },
  { label: "Dexterity" },
);

describe("stacking", () => {
  it("applies only the highest bonus of a type", () => {
    const engine = createStatEngine([
      base("save.will", 5),
      c("save.will", 2, { bonusType: "resistance" }),
      c("save.will", 4, { bonusType: "resistance" }),
    ]);
    const will = engine.resolve("save.will");
    expect(will.total).toBe(9);
    expect(will.lines.filter((l) => l.status === "suppressed")).toHaveLength(1);
  });

  it("stacks dodge bonuses from different sources but not the same one", () => {
    const engine = createStatEngine([
      base("ac", 10),
      c("ac", 1, { bonusType: "dodge", sourceKey: "a" }),
      c("ac", 1, { bonusType: "dodge", sourceKey: "b" }),
      c("ac", 1, { bonusType: "dodge", sourceKey: "b" }),
    ]);
    expect(engine.resolve("ac").total).toBe(12);
  });

  it("stacks penalties regardless of type", () => {
    const engine = createStatEngine([
      base("save.reflex", 5),
      c("save.reflex", -1, { bonusType: "morale" }),
      c("save.reflex", -2, { bonusType: "morale" }),
    ]);
    expect(engine.resolve("save.reflex").total).toBe(2);
  });

  it("uses the highest base", () => {
    const engine = createStatEngine([base("sr", 20), base("sr", 25)]);
    expect(engine.resolve("sr").total).toBe(25);
  });

  it("shows conditional lines without adding them", () => {
    const engine = createStatEngine([
      base("save.will", 5),
      c("save.will", 2, { condition: "vs. evil" }),
    ]);
    const will = engine.resolve("save.will");
    expect(will.total).toBe(5);
    expect(will.lines[1].status).toBe("conditional");
  });

  it("matches wildcard selectors", () => {
    const engine = createStatEngine([
      base("save.fortitude", 3),
      c("save.*", 1, { bonusType: "luck" }),
    ]);
    expect(engine.resolve("save.fortitude").total).toBe(4);
  });
});

describe("set", () => {
  const paralyzed = (target: "ability.dexterity" | "ability.*", value = 0) =>
    c(target, value, { op: "set", label: "Paralyzed" });

  it("overrides the base and every bonus and penalty", () => {
    const engine = createStatEngine([
      base("ability.strength", 18),
      c("ability.strength", 4, { bonusType: "enhancement" }),
      c("ability.strength", -2),
      c("ability.strength", 0, { op: "set", label: "Paralyzed" }),
    ]);
    const str = engine.resolve("ability.strength");
    expect(str.total).toBe(0);
    expect(str.hasBase).toBe(true);
    expect(
      str.lines.filter((l) => l.reason === "Overridden by Paralyzed (Paralyzed)"),
    ).toHaveLength(3);
  });

  it("applies the most recently activated set and reports the collision", () => {
    const engine = createStatEngine([
      base("speed.land", 30),
      c("speed.land", 0, { op: "set", label: "Held" }),
      c("speed.land", 10, { op: "set", label: "Slowed form" }),
    ]);
    const speed = engine.resolve("speed.land");
    expect(speed.total).toBe(10);
    expect(speed.lines[1].reason).toBe(
      "Replaced by Slowed form (Slowed form), activated later",
    );
    expect(speed.setCollision?.winner.label).toBe("Slowed form");
    expect(speed.setCollision?.others.map((l) => l.label)).toEqual(["Held"]);
  });

  it("doesn't report one source's own sets as a collision", () => {
    const engine = createStatEngine([
      base("ability.dexterity", 14),
      c("ability.*", 0, { op: "set", label: "Petrified", sourceKey: "p" }),
      c("ability.dexterity", 3, { op: "set", label: "Petrified", sourceKey: "p" }),
    ]);
    const dex = engine.resolve("ability.dexterity");
    expect(dex.total).toBe(3);
    expect(dex.setCollision).toBeUndefined();
    expect(dex.lines[1].reason).toBe(
      "Replaced by Petrified (Petrified), listed later",
    );
  });

  it("reports only the other sources' sets in a collision", () => {
    const engine = createStatEngine([
      base("ability.dexterity", 14),
      c("ability.dexterity", 1, { op: "set", label: "Held", sourceKey: "a" }),
      c("ability.dexterity", 0, { op: "set", label: "Curse", sourceKey: "b" }),
      c("ability.dexterity", 3, { op: "set", label: "Curse", sourceKey: "b" }),
    ]);
    const dex = engine.resolve("ability.dexterity");
    expect(dex.total).toBe(3);
    expect(dex.setCollision?.others.map((l) => l.label)).toEqual(["Held"]);
  });

  it("suppresses conditional bonuses, which can't apply while set", () => {
    const engine = createStatEngine([
      base("ability.strength", 12),
      c("ability.strength", 2, { condition: "when raging" }),
      c("ability.strength", 0, { op: "set", label: "Paralyzed" }),
    ]);
    const str = engine.resolve("ability.strength");
    expect(str.total).toBe(0);
    expect(str.lines[1]).toMatchObject({
      status: "suppressed",
      reason: "Overridden by Paralyzed (Paralyzed)",
    });
  });

  it("doesn't report sets with the same value as a collision", () => {
    const engine = createStatEngine([
      base("ability.dexterity", 14),
      c("ability.dexterity", 0, { op: "set", label: "Paralyzed" }),
      c("ability.dexterity", 0, { op: "set", label: "Helpless" }),
    ]);
    const dex = engine.resolve("ability.dexterity");
    expect(dex.total).toBe(0);
    expect(dex.setCollision).toBeUndefined();
    expect(dex.lines[1].status).toBe("suppressed");
  });

  it("feeds derived stats: Dex 0 is a −5 modifier to AC", () => {
    const engine = createStatEngine([
      base("ac", 10),
      base("ability.dexterity", 24),
      dexToAc,
      paralyzed("ability.dexterity"),
    ]);
    const ac = resolveArmorClass(engine);
    expect(ac.total.total).toBe(5);
    expect(ac.flatFooted.total).toBe(5);
  });

  it("doesn't give a nonability a score", () => {
    const engine = createStatEngine([
      base("ability.strength", 10),
      paralyzed("ability.*"),
    ]);
    expect(engine.resolve("ability.strength").total).toBe(0);
    const con = engine.resolve("ability.constitution");
    expect(con.hasBase).toBe(false);
    expect(con.lines[0].reason).toBe("No score to set");
  });

  it("doesn't give a nonability a score from any of several sets", () => {
    const engine = createStatEngine([
      c("ability.constitution", 0, { op: "set" }),
      c("ability.constitution", 3, { op: "set" }),
    ]);
    const con = engine.resolve("ability.constitution");
    expect(con.hasBase).toBe(false);
    expect(con.lines.every((l) => l.reason === "No score to set")).toBe(true);
  });

  it("only shows a conditional set", () => {
    const engine = createStatEngine([
      base("ability.dexterity", 14),
      c("ability.dexterity", 0, { op: "set", condition: "while held" }),
    ]);
    expect(engine.resolve("ability.dexterity").total).toBe(14);
  });
});

describe("speed", () => {
  const haste = c("speed.*", 30, { bonusType: "enhancement", label: "Haste" });

  it("only improves movement modes the character has", () => {
    const engine = createStatEngine([base("speed.land", 30), haste]);
    expect(engine.resolve("speed.land").total).toBe(60);
    const fly = engine.resolve("speed.fly");
    expect(fly.total).toBe(0);
    expect(fly.hasBase).toBe(false);
    expect(fly.lines[0]).toMatchObject({
      status: "suppressed",
      reason: "No fly speed",
    });
  });

  it("improves a mode another effect grants", () => {
    const engine = createStatEngine([
      base("speed.land", 30),
      c("speed.fly", 60, { op: "base", label: "Fly" }),
      haste,
    ]);
    expect(engine.resolve("speed.fly").total).toBe(90);
  });

  it("doesn't let a penalty or a set create a mode", () => {
    const engine = createStatEngine([
      c("speed.swim", -10),
      c("speed.swim", 5, { op: "set" }),
    ]);
    const swim = engine.resolve("speed.swim");
    expect(swim.total).toBe(0);
    expect(swim.hasBase).toBe(false);
  });
});

describe("armor class", () => {
  it("drops armor from touch AC and Dex from flat-footed", () => {
    const engine = createStatEngine([
      base("ac", 10),
      base("ability.dexterity", 14),
      dexToAc,
      c("ac", 5, { bonusType: "armor" }),
      c("ac", 1, { bonusType: "enhancement", enhances: "armor" }),
      c("ac", 1, { bonusType: "dodge" }),
    ]);
    const ac = resolveArmorClass(engine);
    expect(ac.total.total).toBe(19);
    expect(ac.touch.total).toBe(13);
    expect(ac.flatFooted.total).toBe(16);
  });
});

describe("max Dex", () => {
  const cap = (slot: `maxDex.${string}`, value: number, label: string) =>
    c(slot, value, { op: "base", label });
  const withDex = (score: number, ...rest: ReturnType<typeof c>[]) =>
    createStatEngine([
      base("ac", 10),
      base("ability.dexterity", score),
      dexToAc,
      ...rest,
    ]);
  const dexLine = (engine: ReturnType<typeof withDex>) =>
    engine.resolve("ac").lines.find((l) => l.label === "Dexterity")!;

  it("caps the Dex bonus to AC, touch AC included", () => {
    const engine = withDex(18, cap("maxDex.armor", 1, "Full plate"));
    expect(dexLine(engine)).toMatchObject({ amount: 1, uncapped: 4 });
    const ac = resolveArmorClass(engine);
    expect(ac.total.total).toBe(11);
    expect(ac.touch.total).toBe(11);
    expect(ac.flatFooted.total).toBe(10);
  });

  it("uses the lowest cap", () => {
    const engine = withDex(
      20,
      cap("maxDex.armor", 4, "Chain shirt"),
      cap("maxDex.shield", 2, "Tower shield"),
    );
    expect(engine.maxDex()).toBe(2);
    expect(dexLine(engine).amount).toBe(2);
  });

  it("raises one cap, or every cap with maxDex.*", () => {
    const engine = withDex(
      20,
      cap("maxDex.armor", 1, "Full plate"),
      c("maxDex.armor", 2, { label: "Mithral" }),
      cap("maxDex.shield", 2, "Tower shield"),
    );
    expect(engine.maxDex()).toBe(2);

    const raisedEverywhere = withDex(
      20,
      cap("maxDex.armor", 1, "Full plate"),
      cap("maxDex.shield", 2, "Tower shield"),
      c("maxDex.*", 1, { label: "Armor mastery" }),
    );
    expect(raisedEverywhere.maxDex()).toBe(2);
  });

  it("treats a cap of 0 as a cap and a raise without armor as none", () => {
    expect(withDex(16, cap("maxDex.armor", 0, "Splint mail")).maxDex()).toBe(0);

    const unarmored = withDex(16, c("maxDex.armor", 2, { label: "Mithral" }));
    expect(unarmored.maxDex()).toBeUndefined();
    expect(dexLine(unarmored).amount).toBe(3);
    expect(unarmored.resolve("maxDex.armor").lines[0].reason).toBe(
      "No armor max Dex to raise",
    );
  });

  it("lets a Dex penalty through", () => {
    const engine = withDex(6, cap("maxDex.armor", 1, "Full plate"));
    expect(dexLine(engine).amount).toBe(-2);
  });

  it("doesn't cap Dex anywhere but AC", () => {
    const engine = createStatEngine([
      base("ability.dexterity", 18),
      c("initiative", { from: "ability.dexterity", as: "modifier" }),
      cap("maxDex.armor", 1, "Full plate"),
    ]);
    expect(engine.resolve("initiative").total).toBe(4);
  });
});
