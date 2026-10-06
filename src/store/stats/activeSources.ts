import type { ActiveSource } from "./types";

// activeSources is kept in activation order: the most recently activated
// source is last, and the engine relies on that to pick between set effects.
// Never sort or dedupe it.

export const activateSource = (
  character: ICharacter,
  source: Omit<ActiveSource, "instanceId">,
  instanceId: string = crypto.randomUUID(),
): ICharacter => ({
  ...character,
  activeSources: [...(character.activeSources ?? []), { ...source, instanceId }],
});

export const deactivateSource = (
  character: ICharacter,
  instanceId: string,
): ICharacter => ({
  ...character,
  activeSources: (character.activeSources ?? []).filter(
    (s) => s.instanceId !== instanceId,
  ),
});
