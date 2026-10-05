import { combine as c, signed } from "../lib";
import {
  useAbilityScore,
  useCharacter,
  useStatEngine,
} from "../store/character";
import { useDiceRoll } from "../store/ui";
import { DiceRollButton } from "./DiceRollButton";
import { EntityDisclosure } from "./EntityDisclosure";
import { FadedSeparator } from "./FadedSeparator";
import { Heading } from "./Heading";
import { StatBreakdown } from "./StatBreakdown";

export const AbilityScores = () => {
  const { name: characterName } = useCharacter();
  const engine = useStatEngine();
  const roll20 = useDiceRoll(20);
  const str = useAbilityScore("strength");
  const dex = useAbilityScore("dexterity");
  const con = useAbilityScore("constitution");
  const int = useAbilityScore("intelligence");
  const wis = useAbilityScore("wisdom");
  const cha = useAbilityScore("charisma");
  const abilityScores = [
    { name: "Strength", ability: "strength" as const, ...str },
    { name: "Dexterity", ability: "dexterity" as const, ...dex },
    { name: "Constitution", ability: "constitution" as const, ...con },
    { name: "Intelligence", ability: "intelligence" as const, ...int },
    { name: "Wisdom", ability: "wisdom" as const, ...wis },
    { name: "Charisma", ability: "charisma" as const, ...cha },
  ];

  return (
    <section>
      <Heading>Ability Scores</Heading>
      <div className="flex flex-col gap-2">
        {abilityScores.map(({ name, ability, score, modifier }) => (
          <EntityDisclosure
            key={name}
            containerClassName={c(score === null && "opacity-50")}
            buttonChildren={
              <div className="flex items-center justify-between">
                <span className="text-lg">
                  {name} ({`${score}`})
                </span>
                <div className="flex items-center gap-2">
                  {modifier !== null && (
                    <span className="tabular-nums text-lg">
                      {signed(modifier)}
                    </span>
                  )}
                  <DiceRollButton
                    disabled={modifier === null}
                    onClick={() => {
                      if (modifier === null) return;
                      roll20(modifier, name);
                    }}
                  />
                </div>
              </div>
            }
          >
            {score !== null ? (
              <>
                <FadedSeparator className="my-2" />
                <StatBreakdown stat={engine.resolve(`ability.${ability}`)} />
              </>
            ) : (
              <span>
                {characterName} does not have a {name} score
              </span>
            )}
          </EntityDisclosure>
        ))}
      </div>
    </section>
  );
};
