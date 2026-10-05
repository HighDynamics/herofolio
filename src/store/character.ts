import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useParams } from "react-router";

import { queries, useUpdateCharacter } from "./api";
import {
  characterContributions,
  sourceContributions,
  type SourceLookup,
} from "./stats/contributions";
import {
  abilityModifierOf,
  createStatEngine,
  resolveArmorClass,
} from "./stats/engine";
import type { ActiveSource, StatKey } from "./stats/types";

// These hooks are for components inside the /characters/:characterId route,
// which loads the character and compendiums before rendering (see App.tsx).

export function useCharacterId() {
  const { characterId } = useParams();
  if (!characterId) throw new Error("No character in the URL");
  return characterId;
}

export const useCharacter = () =>
  useSuspenseQuery(queries.character(useCharacterId())).data;

export const useCharacters = () => useSuspenseQuery(queries.characters).data;

export function useSkillCompendium() {
  const skills = useSuspenseQuery(queries.skills).data;
  const skillSynergies = useSuspenseQuery(queries.skillSynergies).data;
  return { skills, skillSynergies };
}

// ─── Stats ────────────────────────────────────────────────────────────────────

// Reuses the last result while every argument is the same object, so all
// components share one engine (and its cache) per version of the data.
function memoizeLast<Args extends unknown[], R>(fn: (...args: Args) => R) {
  let lastArgs: Args | undefined;
  let lastResult: R;
  return (...args: Args) => {
    if (!lastArgs || args.some((arg, i) => arg !== lastArgs![i])) {
      lastArgs = args;
      lastResult = fn(...args);
    }
    return lastResult;
  };
}

const buildStatEngine = memoizeLast(
  (
    character: ICharacter,
    skills: CompendiumSkill[],
    skillSynergies: CompendiumSkillSynergy[],
    items: IItem[],
    spells: ISpell[],
    abilities: CompendiumAbility[],
  ) => {
    const lookup: SourceLookup = (ref) => {
      if (ref.kind === "item") {
        const item = items.find((i) => i.id === ref.id);
        return (
          item && {
            label: item.name,
            effects: item.effects ?? [],
            casterLevel: item.casterLevel,
          }
        );
      }
      const entry =
        ref.kind === "spell"
          ? spells.find((s) => s.id === ref.id)
          : abilities.find((a) => a.id === ref.id);
      return entry && { label: entry.name, effects: entry.effects ?? [] };
    };

    return createStatEngine([
      ...characterContributions(character, skills, skillSynergies),
      ...sourceContributions(character, character.activeSources ?? [], lookup),
    ]);
  },
);

export function useStatEngine() {
  return buildStatEngine(
    useCharacter(),
    useSuspenseQuery(queries.skills).data,
    useSuspenseQuery(queries.skillSynergies).data,
    useSuspenseQuery(queries.items).data,
    useSuspenseQuery(queries.spells).data,
    useSuspenseQuery(queries.abilities).data,
  );
}

export const useStat = (key: StatKey) => useStatEngine().resolve(key);

export const useArmorClass = () => resolveArmorClass(useStatEngine());

export const useActiveSources = () => useCharacter().activeSources ?? [];

export function useActivateSource() {
  const character = useCharacter();
  const updateCharacter = useUpdateCharacter();
  return (source: Omit<ActiveSource, "instanceId">) =>
    updateCharacter({
      ...character,
      activeSources: [
        ...(character.activeSources ?? []),
        { ...source, instanceId: crypto.randomUUID() },
      ],
    });
}

export function useDeactivateSource() {
  const character = useCharacter();
  const updateCharacter = useUpdateCharacter();
  return (instanceId: string) =>
    updateCharacter({
      ...character,
      activeSources: (character.activeSources ?? []).filter(
        (s) => s.instanceId !== instanceId,
      ),
    });
}

export function useAbilityScores() {
  const engine = useStatEngine();
  const { abilities } = useCharacter();
  return useMemo(
    () =>
      (Object.keys(abilities.score) as Ability[]).reduce(
        (acc, ability) => {
          const stat = engine.resolve(`ability.${ability}`);
          return {
            ...acc,
            [ability]: {
              score: stat.hasBase ? stat.total : null,
              modifier: abilityModifierOf(engine, ability),
            },
          };
        },
        {} as Record<Ability, { score: number | null; modifier: number | null }>,
      ),
    [engine, abilities],
  );
}

export const useAbilityScore = (ability: Ability) =>
  useAbilityScores()[ability];

// ─── Skills ───────────────────────────────────────────────────────────────────

type EnrichedSkillSynergy = Omit<CompendiumSkillSynergy, "isDefault"> & {
  fromSkillName: string;
  active: boolean;
};

type CharacterSkill = SkillRef & Omit<CompendiumSkill, "isDefault">;
export type EnrichedSkill = CharacterSkill & {
  total: number;
  synergies: {
    conditionalBonus: number;
    synergiesList: EnrichedSkillSynergy[];
  };
};

export function useCharacterSkills() {
  const { skills, skillSynergies } = useSkillCompendium();
  const { skillRefs, skillSynergyRefs } = useCharacter();
  const engine = useStatEngine();

  return useMemo(() => {
    const characterSkills = skillRefs
      .map((skillRef) => {
        const compendiumSkill = skills.find((s) => s.id === skillRef.id);
        if (!compendiumSkill) return;

        return {
          ...skillRef,
          name: compendiumSkill.name || "Unknown Skill",
          ability: compendiumSkill.ability || "strength",
          armorCheck: compendiumSkill.armorCheck || false,
        };
      })
      .filter(Boolean) as CharacterSkill[];

    const characterSkillSynergies = skillSynergyRefs
      .map((synergyId) => skillSynergies.find((s) => s.id === synergyId))
      .filter(Boolean) as CompendiumSkillSynergy[];

    return characterSkills.map((skill): EnrichedSkill => {
      const synergies = characterSkillSynergies
        .map((synergy) => {
          if (synergy.toSkillId !== skill.id) return;

          const fromSkill = characterSkills.find(
            (skill) => skill.id === synergy.fromSkillId,
          );

          if (!fromSkill) return;

          return {
            ...synergy,
            fromSkillName: fromSkill.name,
            active: fromSkill.ranks >= synergy.ranksRequired,
          };
        })
        .filter(Boolean) as EnrichedSkillSynergy[];

      // Unconditional synergies are already in the engine's total.
      const conditionalBonus = synergies
        .filter((synergy) => synergy.active && synergy.condition)
        .reduce((sum, synergy) => sum + synergy.bonus, 0);

      return {
        ...skill,
        total: engine.resolve(`skill.${skill.id}`).total,
        synergies: { conditionalBonus, synergiesList: synergies },
      };
    });
  }, [skills, skillSynergies, skillRefs, skillSynergyRefs, engine]);
}

// ─── Abilities and items ──────────────────────────────────────────────────────

export type EnrichedAbility = AbilityRef & { entry: CompendiumAbility };

export function useCharacterAbilities() {
  const abilityCompendium = useSuspenseQuery(queries.abilities).data;
  const { abilityRefs } = useCharacter();
  const engine = useStatEngine();

  return useMemo(
    () =>
      (abilityRefs ?? [])
        .map((ref) => {
          const entry = abilityCompendium.find((a) => a.id === ref.id);
          if (!entry) return;
          return { ...ref, uses: engine.resolve(`uses.${ref.id}`).total, entry };
        })
        .filter(Boolean) as EnrichedAbility[],
    [abilityCompendium, abilityRefs, engine],
  );
}

export function useCharacterItems() {
  const itemCompendium = useSuspenseQuery(queries.items).data;
  const { itemRefs } = useCharacter();

  return useMemo(
    () =>
      itemRefs
        .map((itemRef) => itemCompendium.find((i) => i.id === itemRef.id))
        .filter(Boolean) as IItem[],
    [itemCompendium, itemRefs],
  );
}

// ─── Magic ────────────────────────────────────────────────────────────────────

export type EnrichedSpell = ISpellRef & {
  characterClass: string;
  entry: ISpell;
};
export type EnrichedSla = ISpellLikeAbilityRef & { entry: ISpell };

type ClassSpells = { characterClass: string; spells: EnrichedSpell[] };
type OrderedMagic = Record<
  number,
  { slas: EnrichedSla[]; classSpells: ClassSpells[] }
>;

export function useMagicByClassByLevel() {
  const spellCompendium = useSuspenseQuery(queries.spells).data;
  const character = useCharacter();

  return useMemo(() => {
    const classMagicMeta = character.classes
      .map((c) => {
        if (!c.magic) return;

        return {
          characterClass: c.name,
          castingAbility: c.magic.spellcastingAbility,
          slotsPerDay: c.magic.slotsPerDay || [],
          slotsUsed: c.magic.slotsUsed || [],
        };
      })
      .filter(Boolean) as {
      characterClass: string;
      castingAbility: Ability;
      slotsPerDay: number[];
      slotsUsed: number[];
    }[];

    const classMagic = character.classes.flatMap((c) =>
      (c.magic?.spellRefs ?? []).map((spellRef) => ({
        ...spellRef,
        characterClass: c.name,
        entry: spellCompendium.find((s) => s.id === spellRef.id),
      })),
    ) as EnrichedSpell[];

    const spellLikeAbilities = character.slaRefs.map((slaRef) => ({
      ...slaRef,
      entry: spellCompendium.find((s) => s.id === slaRef.id),
    })) as EnrichedSla[];

    const magic = [...classMagic, ...spellLikeAbilities];

    const orderedMagic = {} as OrderedMagic;
    for (let i = 0; i < 10; i++) {
      const levelMagic = magic.filter((x) => x.level === i);

      const classSpells = (
        levelMagic.filter((x) => "characterClass" in x) as EnrichedSpell[]
      )
        .sort((a, b) => (a.characterClass < b.characterClass ? -1 : 1))
        .reduce((acc, x) => {
          if (acc.at(-1)?.characterClass === x.characterClass) {
            acc.at(-1)?.spells.push(x);
          } else {
            acc.push({ characterClass: x.characterClass, spells: [x] });
          }
          return acc;
        }, [] as ClassSpells[]);

      const slas = levelMagic.filter(
        (x) => !("characterClass" in x),
      ) as EnrichedSla[];

      orderedMagic[i] = { classSpells, slas };
    }

    return { classMagicMeta, orderedMagic };
  }, [spellCompendium, character]);
}
