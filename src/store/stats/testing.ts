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
