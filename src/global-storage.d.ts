import type { ActiveSource, EffectDef } from "./store/stats/types";

declare global {
  type BonusType =
    | "alchemical"
    | "armor"
    | "circumstance" // always stacks
    | "competence"
    | "deflection"
    | "dodge" // always stacks
    | "enhancement"
    | "insight"
    | "luck"
    | "morale"
    | "naturalArmor"
    | "profane"
    | "racial"
    | "resistance"
    | "sacred"
    | "shield"
    | "size"
    | "untyped"; // always stacks

  type SourceRef = { kind: "item" | "spell" | "ability"; id: string };

  type CompendiumSkillSynergy = {
    id: string;
    fromSkillId: string;
    toSkillId: string;
    ranksRequired: number;
    bonus: number;
    condition?: string;
    isDefault: boolean;
  };

  type CompendiumSkill = {
    id: string;
    name: string;
    ability: Ability;
    armorCheck: boolean;
    isDefault: boolean;
  };

  type CompendiumAbility = {
    id: string;
    name: string;
    description: string;
    effects?: EffectDef[];
  };

  type SkillCompendium = {
    skills: CompendiumSkill[];
    skillSynergies: CompendiumSkillSynergy[];
  };

  type Ability =
    | "strength"
    | "dexterity"
    | "constitution"
    | "intelligence"
    | "wisdom"
    | "charisma";

  type EnergyResistance = { [name: string]: number | null };

  type Save = {
    base: number;
    magic: number;
    misc: number;
    ability: Ability;
  };
  type DNDClass = {
    name: string;
    level: number;
    magic?: {
      spellcastingAbility: Ability;
      casterLevel: number;
      spellRefs: ISpellRef[];
      slotsPerDay: number[];
      slotsUsed: number[];
    };
  };

  type SkillRef = {
    id: string;
    ranks: number;
    miscModifier: number;
    classSkill: boolean;
  };

  type AbilityRef = {
    id: string;
    uses: number;
    frequency: string;
    numUsed: number;
  };

  type SpecialAbilities = { name: string; type: string };

  type MagicRef = { id: string; level: number };

  type ISpellRef = MagicRef & {
    spontaneous: boolean;
    prepped?: number;
    numUsed?: number;
  };

  type ISpellLikeAbilityRef = MagicRef & {
    uses: number;
    frequency: string;
    numUsed: number;
  };

  type IItemRef = {
    id: string;
  };

  type IItem = {
    id: string;
    isSrd: boolean;
    name: string;
    weight?: number;
    casterLevel?: number;
    price?: string;
    description: string;
    effects?: EffectDef[];
  };

  type ISpell = {
    id: string;
    isSrd: boolean;
    name: string;
    school: string;
    level: string;
    description: string;
    subSchool?: string;
    descriptor?: string;
    components?: string;
    castingTime?: string;
    range?: string;
    target?: string;
    effect?: string;
    area?: string;
    targetOrArea?: string;
    duration?: string;
    savingThrow?: string;
    spellResistance?: string;
    effects?: EffectDef[];
  };

  type ICharacter = {
    id: string;
    name: string;
    type: string[];
    hitPoints: {
      dieSize: number;
      total: number;
      damage: number;
      temporary: number;
    };
    initiative: { misc: number };
    armorClass: {
      armor: number;
      shield: number;
      dexterity: number;
      size: number;
      naturalArmor: number;
      deflection: number;
      misc: number;
    };
    damageReduction: {
      amount: number;
      weakness: string;
    };
    spellResistance: number;
    energyResistance: {
      acid: number | null;
      cold: number | null;
      electricity: number | null;
      fire: number | null;
      sonic: number | null;
    };
    saves: {
      fortitude: Save;
      reflex: Save;
      will: Save;
    };
    size: string;
    alignment: string;
    abilities: {
      score: {
        strength: number | null;
        dexterity: number | null;
        constitution: number | null;
        intelligence: number | null;
        wisdom: number | null;
        charisma: number | null;
      };
      primary: Ability;
    };
    speed: { land: number; fly: number; swim: number; burrow: number };
    classes: DNDClass[];
    skillRefs: SkillRef[];
    skillSynergyRefs: string[];
    abilityRefs: AbilityRef[];
    slaRefs: ISpellLikeAbilityRef[];
    itemRefs: IItemRef[];
    activeSources: ActiveSource[];
  };
}

// Vite's import.meta.env typing for TypeScript
interface ImportMetaEnv {
  readonly MODE: string;
  readonly BASE_URL: string;
  readonly PROD?: boolean;
  // add other env vars if used
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
