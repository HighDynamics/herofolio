import { signed } from "../lib";
import { useArmorClass, useCharacter, useStat } from "../store/character";
import type { EnergyType } from "../store/stats/types";
import { useDiceRoll } from "../store/ui";
import { DiceRollButton } from "./DiceRollButton";
import { EntityDisclosure } from "./EntityDisclosure";
import { FadedSeparator } from "./FadedSeparator";
import { Heading } from "./Heading";
import { StatBreakdown } from "./StatBreakdown";

function EnergyResistanceRow(p: { energy: EnergyType }) {
  const { energyResistance } = useCharacter();
  const stat = useStat(`resist.${p.energy}`);
  return (
    <div className="flex justify-between">
      <span className="capitalize">{p.energy}:</span>
      <span className="tabular-nums">
        {energyResistance[p.energy] === null ? "Immune" : stat.total}
      </span>
    </div>
  );
}

export const DefenseInfo = () => {
  const { damageReduction, energyResistance } = useCharacter();
  const ac = useArmorClass();
  const saves = [
    { name: "Fortitude", stat: useStat("save.fortitude") },
    { name: "Reflex", stat: useStat("save.reflex") },
    { name: "Will", stat: useStat("save.will") },
  ];
  const dr = useStat("dr");
  const sr = useStat("sr");
  const roll20 = useDiceRoll(20);

  return (
    <section>
      <Heading>Defense</Heading>
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <span className="text-label">Armor Class</span>
          <EntityDisclosure
            buttonChildren={
              <div className="flex justify-between text-lg">
                <div className="flex flex-col">
                  <span className="text-label text-sm">Total</span>
                  <span className="tabular-nums">{ac.total.total}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-label text-sm">Touch</span>
                  <span className="tabular-nums">{ac.touch.total}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-label text-sm">Flatfooted</span>
                  <span className="tabular-nums">{ac.flatFooted.total}</span>
                </div>
              </div>
            }
          >
            <FadedSeparator className="my-2" />
            <StatBreakdown stat={ac.total} />
          </EntityDisclosure>
        </div>
        <div className="flex flex-col gap-2">
          <div className="text-label">Saves</div>
          {saves.map(({ name, stat }) => (
            <EntityDisclosure
              key={name}
              buttonChildren={
                <div className="flex items-center justify-between">
                  <span className="text-lg">{name}</span>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums text-lg">
                      {signed(stat.total)}
                    </span>
                    <DiceRollButton onClick={() => roll20(stat.total, name)} />
                  </div>
                </div>
              }
            >
              <FadedSeparator className="my-2" />
              <StatBreakdown stat={stat} />
            </EntityDisclosure>
          ))}
        </div>
        <div className="flex justify-between">
          <div className="flex flex-col">
            <span className="text-label">Damage Reduction</span>{" "}
            <span>
              {dr.total} / {damageReduction.weakness}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-label">Spell Resistance</span>
            <span>{sr.total}</span>
          </div>
        </div>
        <div className="flex flex-col">
          <span className="text-label">Energy Resistance</span>
          <div className="flex flex-col gap-1 max-w-[60%]">
            {(Object.keys(energyResistance) as EnergyType[]).map((energy) => (
              <EnergyResistanceRow key={energy} energy={energy} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
