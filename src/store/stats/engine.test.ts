import { describe, expect, it } from "vitest";

import { createStatEngine, resolveArmorClass } from "./engine";
import { base, contribution as c } from "./testing";

const dexToAc = c("ac", { from: "ability.dexterity", as: "modifier" }, {
  label: "Dexterity",
});

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

  it("applies the lowest of several sets", () => {
    const engine = createStatEngine([
      base("speed.land", 30),
      c("speed.land", 10, { op: "set", label: "Slowed form" }),
      c("speed.land", 0, { op: "set", label: "Held" }),
    ]);
    const speed = engine.resolve("speed.land");
    expect(speed.total).toBe(0);
    expect(speed.lines[1].reason).toBe("Doesn't stack with Held (Held)");
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

  it("only shows a conditional set", () => {
    const engine = createStatEngine([
      base("ability.dexterity", 14),
      c("ability.dexterity", 0, { op: "set", condition: "while held" }),
    ]);
    expect(engine.resolve("ability.dexterity").total).toBe(14);
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
