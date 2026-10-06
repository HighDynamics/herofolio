# Effects System

Models D&D 3.5 bonuses: "this source applies this typed bonus to this stat". Every
number on the sheet is resolved from a list of **contributions**, which go through
3.5 stacking rules. The values stored on the character are contributions too, so a
spell or item stacks correctly against what's already on the sheet.

## Pieces

| File | Role |
|---|---|
| `src/store/stats/types.ts` | Stat keys, `EffectDef` (authoring), `ActiveSource` (character), `Contribution`/`ResolvedStat` (engine) |
| `src/store/stats/engine.ts` | `createStatEngine(contributions)` → `resolve(key)` (`{ total, hasBase, lines }`) and `maxDex()`; stacking, set, max Dex; `resolveArmorClass` |
| `src/store/stats/contributions.ts` | `characterContributions` (stored sheet values and skill synergies → contributions), `sourceContributions` (active sources → contributions) |
| `src/store/stats/activeSources.ts` | `activateSource`/`deactivateSource`: keep `activeSources` in activation order (never sort or dedupe it) |
| `src/store/character.ts` | `useStatEngine` (one memoized engine per version of the data); hooks `useStat`, `useArmorClass`, `useActiveSources`, `useActivateSource`, `useDeactivateSource` |
| `src/components/StatBreakdown.tsx` | Renders a stat's lines (applied / suppressed / conditional); a suppressed line's `reason` is its tooltip |
| `src/store/stats/*.test.ts` | Vitest tests for the engine and contributions (`npm test`) |

## Data flow

```
ICharacter (stored values,  ──► characterContributions ─┐
  skill ranks + synergies)                              │
                                                        ├─► createStatEngine ─► resolve("save.will") ─► components
character.activeSources ──► lookup item/spell/ability ──┘
          (effects: EffectDef[] on the compendium entry)
```

## Stat keys

`ac`, `initiative`, `bab`, `attack.melee|ranged`, `damage.melee|ranged`, `casterLevel`,
`hp.max`, `hp.temp`, `sr`, `dr`, `ability.<ability>`, `save.<save>`, `skill.<skillId>`,
`speed.<mode>`, `resist.<energy>`, `uses.<abilityId>`, `maxDex.<slot>` (`armor`, `shield`, `load`, …).

Effects may target wildcards: `ability.*`, `save.*`, `skill.*`, `attack.*`, `damage.*`, `speed.*`, `maxDex.*`.

## Rules implemented

- **op "add"**: typed bonus/penalty. Same bonus type → only the highest applies.
- **Always stack**: `dodge`, `circumstance`, `untyped` — except with the same source.
- **Penalties** (negative amounts) stack regardless of type, except with the same source.
- **Same source** = same compendium id (`spell:haste`), so casting a spell twice doesn't stack. Custom sources are keyed by instance.
- **Enhancement to AC** must say what it `enhances` (`armor`/`shield`/`naturalArmor`); barkskin and an amulet of natural armor don't stack.
- **op "base"**: candidate starting value, highest wins (land speed, SR, DR, temp HP, resist energy).
- **Touch AC** drops armor/shield/natural armor (and enhancements to them). **Flat-footed** drops dodge and positive Dex.
- **condition** (e.g. "vs. evil"): shown in the breakdown, never added to the total.
- **Scaling**: `{ scale: "casterLevel" | { classLevel }, base, per, every, startAt, max }`, rounded down. Caster level = `ActiveSource.casterLevel` override → item's `casterLevel` → character's highest.
- **Derived**: `{ from: "ability.dexterity", as: "modifier", max? }` — Dex to AC/initiative/Reflex, ability to skills. `max` is a number or `"maxDex"`.
- **op "set"**: fixes the stat at a value (paralyzed → Str and Dex 0).
  - It overrides the base and every bonus and penalty; they stay in the breakdown as "Overridden by …". Paralyzed with bull's strength is still Str 0, as the SRD's "effective score of 0" says.
  - With several sets, the **most recently activated wins**; the others show "Replaced by …, activated later". Activation order is `character.activeSources` order: `activateSource` appends and `deactivateSource` filters (`src/store/stats/activeSources.ts`, used by the hooks), so the array is already in activation order (no timestamp needed). Sheet values come before every source.
  - Within one source, the effect listed last wins ("Replaced by …, listed later") and it's not a collision: that's the author's call.
  - Conditional bonuses can't apply while a set does, so they're suppressed too. A conditional set stays conditional.
  - "Source" here is the compendium id (`kind:id`, e.g. `item:ring-of-x`), as in stacking: two active instances of the same item or spell are one source, so their sets resolve as "listed later" and never collide. Custom sources are one source per instance.
  - Sets from **different sources** with **different values** are a collision: the stat's `setCollision` (`{ winner, others }`, as lines) names the competing sources, and the breakdown shows "X sets this to 0, replacing Y (3)". Which should win is case by case, so the user decides, e.g. by deactivating one. Sets with the same value (paralyzed and helpless both Dex 0) aren't a collision.
  - Derived stats read the set value: Dex 0 is a −5 modifier to AC, initiative, Reflex and Dex skills (SRD: helpless defenders). Flat-footed AC keeps the −5.
  - A set never gives a nonability a score: an undead's Con stays none even under an `ability.*` set.
  - A set with a `condition` is shown, never applied.
- **Skill synergies**: for each synergy in `character.skillSynergyRefs` whose source skill has at least `ranksRequired` ranks, the target skill gets an untyped +`bonus` line ("Bluff synergy"). Each synergy is its own source, so several to one skill stack (Diplomacy +2 each from Bluff, Knowledge (nobility) and Sense Motive). Synergies with a `condition` are conditional lines. Ranks come from `skillRefs`; the skills screen reads the total from the engine.
- **Armor max Dex**: each `maxDex.<slot>` stat is one cap on the Dex bonus to AC — its `base` is the cap, `add` lines raise it, `maxDex.*` raises every cap.
  - The **lowest** cap among slots that have a base applies (`engine.maxDex()`). A cap of 0 counts (splint mail); a raise on a slot with no base creates no cap ("No armor max Dex to raise").
  - Only AC's Dex line is capped (`max: "maxDex"`), touch AC included. Reflex and initiative aren't. Dex penalties pass through. The capped line keeps `uncapped` for the breakdown.
- **Speed modes**: on `speed.<mode>`, `add` and `set` lines apply only when the mode has a base. Haste's +30 to `speed.*` raises land speed but doesn't grant fly; once the fly spell adds a fly base, haste raises that too. Lines on a missing mode show "No fly speed".

## Authoring an effect

```ts
// server/seed/data/spells — on the ISpell entry
effects: [
  { target: "ac", bonusType: "enhancement", enhances: "naturalArmor",
    value: { scale: "casterLevel", base: 2, per: 1, every: 3, startAt: 3, max: 5 } },
]

// resist energy — target picked on activation
effects: [
  { target: { prefix: "resist", choice: "energy" }, op: "base", bonusType: "untyped",
    value: { scale: "casterLevel", base: 10, per: 10, every: 4, startAt: 3, max: 30 } },
]

// paralyzed (or hold person) — set
effects: [
  { target: "ability.strength", op: "set", bonusType: "untyped", value: 0 },
  { target: "ability.dexterity", op: "set", bonusType: "untyped", value: 0 },
]

// haste — speed bonus to the modes the character has
effects: [
  { target: "speed.*", bonusType: "enhancement", value: 30 },
]

// full plate (an item) — armor bonus and max Dex +1
effects: [
  { target: "ac", bonusType: "armor", value: 8 },
  { target: "maxDex.armor", op: "base", bonusType: "untyped", value: 1 },
]

// tower shield — max Dex +2; heavy load would be maxDex.load base 1
effects: [
  { target: "ac", bonusType: "shield", value: 4 },
  { target: "maxDex.shield", op: "base", bonusType: "untyped", value: 2 },
]

// a feature that raises the armor's max Dex (use maxDex.* to raise every cap)
effects: [
  { target: "maxDex.armor", bonusType: "untyped", value: 1 },
]
```

Skill synergies aren't effects: they're `CompendiumSkillSynergy` entries
(`fromSkillId`, `toSkillId`, `ranksRequired`, `bonus`, optional `condition`) in
`server/seed/data/skills/synergies.ts`, applied when listed in the character's
`skillSynergyRefs`.

## Activating

```ts
const activate = useActivateSource();
activate({ ref: { kind: "spell", id: "haste" } });
activate({ ref: { kind: "spell", id: "resist-energy" }, choices: { energy: "fire" }, casterLevel: 9 });
activate({ custom: { label: "Charging", effects: [{ target: "ac", bonusType: "untyped", value: -2 }] } });

useDeactivateSource()(instanceId);
```

## Next

- **UI**: list `activeSources` with their lines; activate buttons on item/spell/ability panels; a "custom effect" form.
- **Authoring**: add `effects` to compendium entries; move sheet values (armor, cloak "magic" saves) into items/sources as they're modeled.
- **Max Dex from armor**: armor items supply max Dex (`maxDex.armor`/`maxDex.shield` effects) once armor is modeled as items; the sheet has no max Dex field.
