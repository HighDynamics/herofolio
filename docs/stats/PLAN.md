# Plan: more ways to adjust stats

Extends the stat engine (`src/store/stats/`) with the four adjustments listed as
"Not yet modeled" in `EFFECTS_SYSTEM.md`, following the 3.5 SRD. The UI is out
of scope, apart from what existing screens need to keep showing the right numbers.

## 0. Test runner

The repo has no tests. Add Vitest (`npm test`) with a small config that skips the
app's Vite plugins, and engine tests in `src/store/stats/*.test.ts`.

## 1. `op: "set"`

An effect that fixes a stat at a value: paralyzed and helpless set Dex (and
paralysis Str) to 0.

- **Bonuses**: a set overrides everything else on the stat — base, bonuses and
  penalties. They stay in the breakdown, marked as overridden. Paralyzed with
  bull's strength is still Str 0, matching the SRD's "effective score of 0".
- **Several sets**: the lowest wins. Sets model restrictive conditions
  (paralysis, helpless, held in place), so the most restrictive one applies.
- **Derived stats** read the set value: Dex 0 gives a −5 modifier to AC,
  initiative, Reflex and Dex skills, as the SRD says for helpless defenders.
- **Nonabilities**: a set never gives a creature an ability score it doesn't
  have (no Con for undead, no Str for incorporeal creatures), so a
  `ability.*` set leaves those alone.
- **Conditional** sets are shown but never applied, like other conditional lines.

## 2. Skill synergies as contributions

`characterContributions` takes the synergy compendium too. For each synergy in
`character.skillSynergyRefs` whose source skill has at least `ranksRequired`
ranks, it adds an untyped +`bonus` line to the target skill, keyed per synergy so
several synergies to one skill stack (Diplomacy can get +2 each from Bluff,
Knowledge (nobility) and Sense Motive). Synergies with a `condition` become
conditional lines. The skills screen stops adding synergies itself and reads the
total from the engine.

## 3. Armor max Dex bonus

- New stat keys `maxDex.<slot>` (`armor`, `shield`, `load`, or any other name).
  A slot's `base` is its cap (full plate: `maxDex.armor` base 1; tower shield:
  `maxDex.shield` base 2); `add` contributions raise it (mithral, armor
  mastery-style features), and `maxDex.*` raises every cap.
- A slot with no base imposes no cap, so raises alone never create one.
- The effective cap is the lowest slot total. Only the Dex line of AC is capped
  (touch AC too); Reflex and initiative are not. Penalties (Dex below 10) pass
  through untouched. The line records the uncapped amount for the breakdown.

## 4. Speed bonuses only for modes the character has

On `speed.*` stats, `add` and `set` lines apply only when the stat has a base
(the character has that movement mode). Haste's +30 to `speed.*` raises land
speed but doesn't grant a fly speed; once the fly spell gives a fly base, haste
raises that too. Inapplicable lines are shown as not applying, with a reason.

## Breakdown reasons

`StatLine.suppressedBy` becomes `reason`: a short sentence for any line that
didn't apply ("Doesn't stack with …", "Overridden by …", "No fly speed").

## UI touch-ups (only what the numbers need)

- Skills: total comes from the engine (no double-counted synergies).
- Ability scores: a score of 0 is a score, not a missing one; negative
  modifiers show as −5, not "+-5". The `AbilityScores.tsx` TODO (show the score
  calculation) is the stat breakdown, so it's filled in.
- Signed numbers on saves, initiative and skills, since a set can make them
  negative.

## Docs and checks

- `EFFECTS_SYSTEM.md`: move the four items out of "Not yet modeled", document
  how to author each.
- Sanity-check Arn's numbers before and after.
- `npm run typecheck`, `npm run build`, `npm test` on the final commit.
