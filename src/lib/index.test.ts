import { signed } from ".";
import { expect, it } from "vitest";

it("signs bonuses, including 0 and penalties", () => {
  expect(signed(3)).toBe("+3");
  expect(signed(0)).toBe("+0");
  expect(signed(-5)).toBe("-5");
});
