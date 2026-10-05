import { useState, Fragment } from "react";

import { combine as c } from "../../lib";
import {
  getCharacterClassDataByName,
  incrementSpellPrep,
  incrementSpellSlots,
} from "../../lib/character";
import { useUpdateCharacter } from "../../store/api";
import {
  useAbilityScores,
  useCharacter,
  useMagicByClassByLevel,
} from "../../store/character";
import { Button } from "../Button";
import { Heading } from "../Heading";
import { Spell } from "./Spell";

const romans = [
  "0",
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
] as const;

export function Spells() {
  const [isPrepping, setIsPrepping] = useState(false);
  const character = useCharacter();
  const updateCharacter = useUpdateCharacter();
  const magicByClassByLevel = useMagicByClassByLevel();
  const abilityScores = useAbilityScores();

  const spellListContainerClasses = "flex flex-col gap-2 my-4";

  function getDifficultyClass(levelNum: number, characterClass: string) {
    const castingAbility = magicByClassByLevel.classMagicMeta.find(
      (c) => c.characterClass === characterClass,
    )?.castingAbility;

    if (!castingAbility) return "unknown";

    const modifier = abilityScores[castingAbility].modifier;

    return modifier !== null ? 10 + levelNum + modifier : "unknown";
  }

  function getRemainingSpells(level: number, characterClass: string) {
    const classMagic = magicByClassByLevel.classMagicMeta.find(
      (c) => c.characterClass === characterClass,
    );

    if (!classMagic) return "unknown";

    return classMagic.slotsPerDay[level] - classMagic.slotsUsed[level];
  }

  function updateClasses(updatedClass: DNDClass) {
    return character.classes.map((c) =>
      c.name === updatedClass.name ? updatedClass : c,
    );
  }

  function mutateCharacterSpellSlots(classData: DNDClass, spellLevel: number) {
    const updatedClass = incrementSpellSlots(classData, spellLevel);
    const updatedClasses = updateClasses(updatedClass);
    updateCharacter({ ...character, classes: updatedClasses });
  }

  function mutateCharacterPreppedSpells(
    classData: DNDClass,
    spellId: string,
    action: "prep" | "cast",
  ) {
    const updatedClass = incrementSpellPrep(classData, spellId, action);
    const updatedClasses = updateClasses(updatedClass);
    updateCharacter({ ...character, classes: updatedClasses });
  }

  return (
    <>
      <div className="mt-2 flex gap-2">
        <Button
          className={c("grow basis-0", isPrepping && "opacity-50")}
          onClick={() => setIsPrepping(false)}
        >
          Cast Spells
        </Button>
        <Button
          className={c("grow basis-0", !isPrepping && "opacity-50")}
          onClick={() => setIsPrepping(true)}
        >
          Prepare Spells
        </Button>
      </div>
      {romans.map((x, i) => {
        const levelMagic = magicByClassByLevel.orderedMagic[i];
        if (
          // No magic at this level
          (levelMagic.classSpells.length === 0 &&
            levelMagic.slas.length === 0) ||
          // No preppable spells at this level
          (isPrepping &&
            !levelMagic.classSpells.some((c) =>
              c.spells.some((s) => !s.spontaneous),
            ))
        )
          return null;

        return (
          <section key={x} className="mt-12">
            <div>
              <Heading className="mb-0">Level {x}</Heading>
            </div>
            {!isPrepping && (
              <div className="flex flex-col gap-4">
                {levelMagic.classSpells.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {levelMagic.classSpells.map((c) => (
                      <Fragment key={c.characterClass}>
                        <div className="flex flex-col">
                          <div>
                            <span className="text-3xl">{c.characterClass}</span>
                            <span className="text-2xl">
                              {" "}
                              – DC {getDifficultyClass(i, c.characterClass)}
                            </span>
                          </div>
                          <div className="italic">
                            {getRemainingSpells(i, c.characterClass)} remaining
                            today
                          </div>
                        </div>
                        {c.spells.some((spell) => spell.prepped) && (
                          <div className={spellListContainerClasses}>
                            <span className="text-label">Prepped</span>
                            {c.spells
                              .filter((s) => s.prepped)
                              .map((spell) => (
                                <Spell
                                  key={spell.id}
                                  remainingUses={
                                    (spell.prepped || 0) - (spell.numUsed || 0)
                                  }
                                  spellEntry={spell.entry}
                                  isPrepping={isPrepping}
                                  incrementMagic={() =>
                                    mutateCharacterPreppedSpells(
                                      getCharacterClassDataByName(
                                        c.characterClass,
                                        character,
                                      ),
                                      spell.id,
                                      "cast",
                                    )
                                  }
                                />
                              ))}
                          </div>
                        )}

                        {c.spells.some((spell) => spell.spontaneous) && (
                          <div className={spellListContainerClasses}>
                            <span className="text-label">Spontaneous</span>
                            {c.spells
                              .filter((s) => s.spontaneous)
                              .map((spell) => (
                                <Spell
                                  key={spell.id}
                                  remainingUses={Number.POSITIVE_INFINITY}
                                  spellEntry={spell.entry}
                                  isPrepping={isPrepping}
                                  incrementMagic={() =>
                                    mutateCharacterSpellSlots(
                                      getCharacterClassDataByName(
                                        c.characterClass,
                                        character,
                                      ),
                                      i,
                                    )
                                  }
                                />
                              ))}
                          </div>
                        )}
                      </Fragment>
                    ))}
                  </div>
                )}
                {levelMagic.slas.length > 0 && (
                  <div className={spellListContainerClasses}>
                    <span className="text-3xl">Spell-Like Abilities</span>
                    {levelMagic.slas.map((sla) => (
                      <Spell
                        key={sla.id}
                        remainingUses={sla.uses - sla.numUsed}
                        spellEntry={sla.entry}
                        isPrepping={isPrepping}
                        incrementMagic={() => {}}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
            {isPrepping && (
              <div className="flex flex-col gap-2">
                {levelMagic.classSpells.map((c) => {
                  if (!c.spells.some((s) => !s.spontaneous)) return null;

                  return (
                    <Fragment key={c.characterClass}>
                      <div className="text-3xl">{c.characterClass}</div>

                      <div className={spellListContainerClasses}>
                        {c.spells
                          .filter((s) => !s.spontaneous)
                          .map((spell) => (
                            <Spell
                              key={spell.id}
                              remainingUses={
                                (spell.prepped || 0) - (spell.numUsed || 0)
                              }
                              spellEntry={spell.entry}
                              isPrepping={isPrepping}
                              incrementMagic={() =>
                                mutateCharacterPreppedSpells(
                                  getCharacterClassDataByName(
                                    c.characterClass,
                                    character,
                                  ),
                                  spell.id,
                                  "prep",
                                )
                              }
                            />
                          ))}
                      </div>
                    </Fragment>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
