import { useCharacterAbilities } from "../../store/character";
import { EntityDisclosure } from "../EntityDisclosure";

const ActiveAndPassiveAbilities = () => {
  const abilities = useCharacterAbilities();
  return (
    <div className="mt-12 flex flex-col gap-12 px-4">
      <div>
        <h2 className="mb-4 text-5xl font-bold opacity-90">Abilities</h2>
        <div className="flex flex-col gap-4">
          {abilities.map((ability) => (
            <EntityDisclosure
              key={ability.id}
              buttonChildren={
                <div className="text-lg">{ability.entry.name}</div>
              }
            >
              {ability.entry.description ||
                "A description of this ability goes here"}
            </EntityDisclosure>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ActiveAndPassiveAbilities;
