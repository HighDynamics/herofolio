import { signed } from "../lib";
import { useCharacter, useStat } from "../store/character";
import { useDiceRoll } from "../store/ui";
import { DiceRollButton } from "./DiceRollButton";
import { EntityDisclosure } from "./EntityDisclosure";
import { FadedSeparator } from "./FadedSeparator";
import { Heading } from "./Heading";
import { StatBreakdown } from "./StatBreakdown";

export function MiscInfo() {
  const character = useCharacter();
  const initiativeStat = useStat("initiative");
  const initiative = initiativeStat.total;
  const roll20 = useDiceRoll(20);

  const speeds = (
    [
      ["land", useStat("speed.land").total],
      ["fly", useStat("speed.fly").total],
      ["swim", useStat("speed.swim").total],
      ["burrow", useStat("speed.burrow").total],
    ] as const
  ).filter(([, value]) => value > 0);
  return (
    <section>
      <Heading>Misc</Heading>
      <div className="flex flex-col gap-2">
        <EntityDisclosure
          buttonChildren={
            <div className="flex justify-between text-lg items-center">
              <span>Initiative</span>
              <div className="flex items-center gap-2">
                <span className="tabular-nums">{signed(initiative)}</span>
                <DiceRollButton
                  onClick={() => roll20(initiative, "Initiative")}
                />
              </div>
            </div>
          }
        >
          <FadedSeparator className="my-2" />
          <StatBreakdown stat={initiativeStat} />
        </EntityDisclosure>

        {speeds.length > 1 && <div className="text-label mt-6">Speed</div>}
        <EntityDisclosure
          buttonChildren={
            speeds.length > 1 ? (
              <div className="flex justify-between text-lg">
                {speeds.map(([key, value]) => (
                  <div key={key} className="flex flex-col">
                    <span className="text-label text-sm">{key}</span>
                    <span className="tabular-nums">{value}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex justify-between text-lg items-center">
                <span>Speed</span>
                <span className="tabular-nums">{speeds.at(0)?.at(1)} ft.</span>
              </div>
            )
          }
        ></EntityDisclosure>
      </div>

      <div className="flex flex-col gap-8">
        <div className="flex flex-col">
          <span className="text-label mt-6">Type</span>
          <span className="text-lg">{character.type.join(", ")}</span>
        </div>

        <div className="flex flex-col">
          <span className="text-label">Classes</span>
          <div className="grid grid-cols-2 gap-2">
            {character.classes.map((c) => (
              <span key={c.name} className="text-lg">
                {c.name} ({c.level})
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
