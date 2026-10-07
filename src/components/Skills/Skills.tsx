import { useState } from "react";

import { combine as c, signed } from "../../lib";
import { useAddSkill, useUpdateCharacter, useUpdateSkill } from "../../store/api";
import {
  useCharacter,
  useAbilityScore,
  useCharacterSkills,
  type EnrichedSkill,
  useSkillCompendium,
} from "../../store/character";
import { useDiceRoll } from "../../store/ui";
import { useToast } from "../ActionToast/useToast";
import { Button } from "../Button";
import { Combobox } from "../Combobox";
import { DiceRollButton } from "../DiceRollButton";
import { EntityDisclosure } from "../EntityDisclosure";
import { FadedSeparator } from "../FadedSeparator";
import { Heading } from "../Heading";
import { Input } from "../Input/Input";
import { NumericInput } from "../Input/NumericInput";
import { Select } from "../Select";

const emptySkill: EnrichedSkill = {
  id: "",
  name: "",
  ability: "strength",
  ranks: 0,
  miscModifier: 0,
  total: 0,
  synergies: { conditionalBonus: 0, synergiesList: [] },
  classSkill: false,
  armorCheck: false,
};

function ValueChange(p: { original: number; updated: number }) {
  const diff = p.updated - p.original;
  if (diff === 0) {
    return <div className="h-8" />;
  }

  const sign = diff > 0 ? "+" : "";
  const colorClass = diff > 0 ? "text-emerald-400" : "text-red-400";

  return (
    <span
      className={c("font-mono h-8 pt-2", colorClass)}
    >{`(${sign}${diff})`}</span>
  );
}

function DeleteConfirmation(p: {
  skillName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="absolute z-10 top-0 left-0 size-full flex items-center justify-center bg-black/95 p-4">
      <div className="flex flex-col gap-8">
        <span>Are you sure you want to delete the skill "{p.skillName}"?</span>
        <div className="flex justify-between">
          <Button className="bg-red-700 hover:bg-red-800" onClick={p.onConfirm}>
            Yes, Delete
          </Button>
          <Button
            className="bg-stone-700 hover:bg-stone-800"
            onClick={p.onCancel}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

function SkillsListItem(p: {
  skill: EnrichedSkill;
  setSkillToAdd?: (skill: EnrichedSkill | null) => void;
}) {
  const { skill } = p;
  const isAddingSkill = !!p.setSkillToAdd;
  const [isEditing, setIsEditing] = useState(isAddingSkill);
  const [name, setName] = useState(skill.name);
  const [ranks, setRanks] = useState(skill.ranks.toString());
  const [miscMod, setMiscMod] = useState(skill.miscModifier.toString());
  const [skillAbility] = useState(skill.ability);
  const [isClassSkill, setIsClassSkill] = useState(skill.classSkill);
  const [hasArmorCheckPenalty, setHasArmorCheckPenalty] = useState(
    skill.armorCheck,
  );
  const skillAbilityMod = useAbilityScore(skillAbility).modifier || 0;
  const [isDeleting, setIsDeleting] = useState(false);
  const character = useCharacter();
  const updateCharacter = useUpdateCharacter();
  const updateSkill = useUpdateSkill();
  const addSkill = useAddSkill();
  const toast = useToast();

  const conditions = skill.synergies.synergiesList
    .filter((s) => s.active && s.condition)
    .map((s) => `+${s.bonus} ${s.condition}`);

  const roll20 = useDiceRoll(20, conditions);

  const skillPoints = skill.total;

  const hasGlobalChanges =
    hasArmorCheckPenalty !== skill.armorCheck || name.trim() !== skill.name;

  const hasCharacterChanges =
    ranks !== skill.ranks.toString() ||
    miscMod !== skill.miscModifier.toString() ||
    isClassSkill !== skill.classSkill;

  function onFinishEditing() {
    if (p.setSkillToAdd) {
      p.setSkillToAdd(null);
    }
    setIsEditing(false);
  }

  const onSubmit = () => {
    const updatedSkill: EnrichedSkill = {
      ...skill,
      name: name.trim(),
      ranks: parseInt(ranks) || 0,
      miscModifier: parseInt(miscMod) || 0,
      classSkill: isClassSkill,
      armorCheck: hasArmorCheckPenalty,
    };

    if (!skill.id) {
      return addSkill({
        name: updatedSkill.name,
        ability: updatedSkill.ability,
        armorCheck: updatedSkill.armorCheck,
        isDefault: false,
      }).then(({ skill: newSkill }) => {
        updateCharacter({
          ...character,
          skillRefs: [
            ...character.skillRefs,
            {
              id: newSkill.id,
              ranks: 0,
              miscModifier: 0,
              classSkill: false,
            },
          ],
        }).then(() =>
          toast(
            `Skill "${skill.name}" has been added to ${character.name}'s skill list and your skill compendium`,
          ),
        );
      });
    }

    const existingSkillRefIdx = character.skillRefs.findIndex(
      (s) => s.id === skill.id,
    );

    // Save only the character's own fields, not the derived display data.
    const updatedSkillRef: SkillRef = {
      id: updatedSkill.id,
      ranks: updatedSkill.ranks,
      miscModifier: updatedSkill.miscModifier,
      classSkill: updatedSkill.classSkill,
    };
    const updatedSkillRefs = [...character.skillRefs];
    if (existingSkillRefIdx >= 0) {
      updatedSkillRefs[existingSkillRefIdx] = updatedSkillRef;
    } else {
      updatedSkillRefs.push(updatedSkillRef);
    }

    if (hasGlobalChanges) {
      updateSkill({
        id: updatedSkill.id,
        ability: updatedSkill.ability,
        name: updatedSkill.name,
        armorCheck: updatedSkill.armorCheck,
        isDefault: false,
      }).catch(() => toast(`"${skill.name}" is a shared skill and can't be edited`));
    }
    updateCharacter({ ...character, skillRefs: updatedSkillRefs });
    setName(updatedSkill.name);
    setRanks(updatedSkill.ranks.toString());
    setMiscMod(updatedSkill.miscModifier.toString());
    setIsClassSkill(updatedSkill.classSkill);
    setHasArmorCheckPenalty(updatedSkill.armorCheck);
  };

  return (
    <EntityDisclosure
      defaultOpen={isAddingSkill}
      containerClassName={c(
        "relative",
        skill.classSkill && "border-emerald-800!",
      )}
      buttonChildren={
        <div
          className="flex items-center justify-between"
          onClick={(e) => isEditing && e.stopPropagation()}
        >
          {isEditing && !isAddingSkill ? (
            <Input
              value={name}
              className="text-lg"
              onChange={(e) => setName(e.currentTarget.value)}
            />
          ) : (
            <span className="text-lg">{skill.name}</span>
          )}
          <div className="flex items-center gap-2">
            {skill.synergies.conditionalBonus > 0 && (
              <span className="font-mono opacity-50 italic">
                (+{skill.synergies.conditionalBonus}?)
              </span>
            )}
            <span className="font-mono">{signed(skillPoints)}</span>
            <DiceRollButton
              className="flex size-8 items-center justify-center cursor-pointer"
              onClick={() => roll20(skillPoints, skill.name)}
            >
              <i className="fas fa-dice-d20 opacity-70 duration-100 group-active:opacity-100" />
            </DiceRollButton>
          </div>
        </div>
      }
    >
      <div
        onClick={(e) => {
          if (isEditing) e.stopPropagation();
        }}
      >
        {isDeleting && (
          <DeleteConfirmation
            skillName={skill.name}
            onConfirm={() => {
              const updatedSkillRefs = character.skillRefs.filter(
                (s) => s.id !== skill.id,
              );
              updateCharacter({ ...character, skillRefs: updatedSkillRefs });
            }}
            onCancel={() => setIsDeleting(false)}
          />
        )}
        <FadedSeparator className="my-2" />
        <div className="flex justify-between">
          <div className="w-full flex flex-col gap-4">
            <div className="flex max-w-96 m-auto items-center justify-between w-full">
              <div className="flex flex-col items-center">
                <span className="text-sm font-sans text-stone-500">Ranks</span>
                {isEditing ? (
                  <>
                    <NumericInput
                      className="w-[5ch] text-3xl text-center"
                      value={ranks}
                      onChange={(e) => setRanks(e.currentTarget.value)}
                    />
                    <ValueChange
                      original={skill.ranks}
                      updated={parseInt(ranks) || 0}
                    />
                  </>
                ) : (
                  <span className="text-3xl min-w-[5ch] text-center">
                    {skill.ranks}
                  </span>
                )}
              </div>
              <div className="flex flex-col items-center">
                <span className="text-sm font-sans text-stone-500">
                  Misc Modifiers
                </span>
                {isEditing ? (
                  <>
                    <NumericInput
                      className="w-[5ch] text-3xl text-center"
                      value={miscMod}
                      onChange={(e) => setMiscMod(e.currentTarget.value)}
                    />
                    <ValueChange
                      original={skill.miscModifier}
                      updated={parseInt(miscMod) || 0}
                    />
                  </>
                ) : (
                  <span className="text-3xl min-w-[5ch] text-center">
                    {skill.miscModifier}
                  </span>
                )}
              </div>
              <div
                className={c(
                  "flex flex-col items-center",
                  isEditing && "mb-10",
                )}
              >
                {isEditing ? (
                  <Select
                    options={[
                      { id: "strength", name: "Strength" },
                      { id: "constitution", name: "Constitution" },
                      { id: "dexterity", name: "Dexterity" },
                      { id: "wisdom", name: "Wisdom" },
                      { id: "intelligence", name: "Intelligence" },
                      { id: "charisma", name: "Charisma" },
                    ]}
                  />
                ) : (
                  <span className="text-sm font-sans text-stone-500 capitalize">
                    {skill.ability}
                  </span>
                )}
                <span className="text-3xl min-w-[5ch] text-center">
                  {skillAbilityMod}
                </span>
              </div>
            </div>
            {isEditing && (
              <div>
                <label
                  htmlFor={`class-skill-${skill.name}`}
                  className="flex gap-1 items-center"
                >
                  <input
                    type="checkbox"
                    id={`class-skill-${skill.name}`}
                    checked={isClassSkill}
                    onChange={() => setIsClassSkill(!isClassSkill)}
                  />
                  Class Skill
                </label>
                <label
                  htmlFor={`armor-check-${skill.name}`}
                  className="flex gap-1 items-center"
                >
                  <input
                    type="checkbox"
                    id={`armor-check-${skill.name}`}
                    checked={hasArmorCheckPenalty}
                    onChange={() =>
                      setHasArmorCheckPenalty(!hasArmorCheckPenalty)
                    }
                  />
                  Armor Check Penalty
                </label>
              </div>
            )}
            {skill.synergies.synergiesList.length > 0 && (
              <div>
                <div className="flex gap-2 items-center">
                  <span className="text-label opacity-80">Synergies</span>
                  <FadedSeparator className="grow from-white" />
                </div>
                {skill.synergies.synergiesList
                  .filter((syn) => syn.active)
                  .map((synergy) => (
                    <div key={synergy.id} className="mb-6">
                      <div className="text-sm font-sans text-stone-500">
                        {synergy.ranksRequired} or more ranks in{" "}
                        {synergy.fromSkillName}
                      </div>
                      <div>
                        +{synergy.bonus}{" "}
                        {synergy.condition &&
                          `(on checks ${synergy.condition})`}{" "}
                      </div>
                    </div>
                  ))}
                {skill.synergies.synergiesList
                  .filter((syn) => !syn.active)
                  .map((synergy) => (
                    <div key={synergy.id} className="mb-6">
                      <div className="text-sm font-sans text-stone-500">
                        {synergy.id}: {synergy.ranksRequired} or more ranks in{" "}
                        {synergy.fromSkillName} (not enough ranks)
                      </div>
                      <div className="opacity-50 line-through">
                        +{synergy.bonus}{" "}
                        {synergy.condition &&
                          `(on checks ${synergy.condition})`}{" "}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
          <div className="self-end">
            {isEditing ? (
              <div className="flex flex-col gap-1">
                <Button
                  className="size-8"
                  onClick={() => {
                    onFinishEditing();
                    setRanks(skill.ranks.toString());
                    setMiscMod(skill.miscModifier.toString());
                  }}
                >
                  <i className="fas fa-times"></i>{" "}
                </Button>
                {!isAddingSkill && (
                  <Button
                    className="size-8"
                    onClick={() => setIsDeleting(true)}
                  >
                    <i className="fas fa-trash"></i>
                  </Button>
                )}
                <Button
                  disabled={
                    !isAddingSkill && !hasGlobalChanges && !hasCharacterChanges
                  }
                  onClick={() => {
                    onSubmit();
                    onFinishEditing();
                  }}
                >
                  <i className="fas fa-check"></i>
                </Button>
              </div>
            ) : (
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditing(true);
                }}
              >
                <i className="fas fa-feather"></i>
              </Button>
            )}
          </div>
        </div>
      </div>
    </EntityDisclosure>
  );
}

export function Skills() {
  const skills = useCharacterSkills();
  const unusedSkills = useSkillCompendium()
    .skills.filter((compSkill) => skills.every((s) => s.id !== compSkill.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const [query, setQuery] = useState("");
  const [isAddingSkill, setIsAddingSkill] = useState(false);
  const [skillToAdd, setSkillToAdd] = useState<EnrichedSkill | null>(null);

  const sortedSkills = [...skills].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section className="mt-12">
      <div className="flex justify-between items-center gap-8">
        <Heading>Skills</Heading>
        <div className="flex items-center grow justify-end">
          {isAddingSkill && (
            <>
              <Combobox
                options={unusedSkills}
                optionUnit="Skill"
                query={query}
                setQuery={setQuery}
                useQueryAsNewOptionName={true}
                placeholder="Skill Name"
                onChange={(skill: CompendiumSkill) => {
                  setQuery("");
                  setIsAddingSkill(false);

                  const enrichedSkill = {
                    ...emptySkill,
                    id: skill.id,
                    name: skill.name,
                  };

                  setSkillToAdd(enrichedSkill);
                }}
                className="w-full"
              />
              <div className="border border-stone-800 w-2 h-px" />
            </>
          )}
          <Button
            className="size-8 mr-1 bg-transparent hover:bg-fuchsia-900/50"
            onClick={() => setIsAddingSkill(!isAddingSkill)}
          >
            {isAddingSkill ? (
              <i className="fas fa-minus"></i>
            ) : (
              <i className="fas fa-plus"></i>
            )}
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {skillToAdd?.name && (
          <SkillsListItem skill={skillToAdd} setSkillToAdd={setSkillToAdd} />
        )}
        {sortedSkills.map((s) => (
          <SkillsListItem key={s.name} skill={s} />
        ))}
      </div>
    </section>
  );
}
