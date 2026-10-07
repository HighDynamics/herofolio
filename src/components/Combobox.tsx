import { Combobox as Combobox_ } from "@headlessui/react";

import { combine as c } from "../lib";

type Option = {
  id: string;
  name: string;
  [key: string]: unknown;
};

export function Combobox<T>(
  p: {
    options: Array<T & Option>;
    query: string;
    setQuery: (query: string) => void;
    useQueryAsNewOptionName?: boolean;
    optionUnit?: string;
    placeholder?: string;
    onChange: (option: T & Option) => void;
  } & React.ComponentProps<typeof Combobox_>,
) {
  const { options, query, setQuery } = p;

  const filteredOptions_ =
    query === ""
      ? options
      : options.filter((option) =>
          option.name.trim().toLowerCase().includes(query.trim().toLowerCase()),
        );

  const filteredOptions =
    p.useQueryAsNewOptionName &&
    query.length > 0 &&
    !options.some((o) => o.name.toLowerCase() === query.toLowerCase())
      ? [...filteredOptions_, { id: "", name: query }]
      : filteredOptions_;

  return (
    <Combobox_ as="div" className={p.className} onChange={p.onChange}>
      <Combobox_.Button className={c("relative", p.className)}>
        <Combobox_.Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={p.placeholder}
          className={c(
            "rounded-xs bg-black bg-opacity-50 px-2 py-1 outline-solid outline-1 outline-stone-800 transition-all duration-100 focus:bg-fuchsia-950 focus:outline-stone-300",
            p.className,
          )}
        />
        <div>
          <i className="fas fa-caret-down text-stone-300/50 absolute bottom-2 right-0 flex items-center pr-2" />
        </div>
      </Combobox_.Button>
      <Combobox_.Options className="absolute mt-1 max-h-60 overflow-auto rounded-sm bg-black bg-opacity-90 py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-10">
        {filteredOptions.map((option) => (
          <Combobox_.Option key={option.id} value={option}>
            {({ active, selected }) => (
              <div
                className={`cursor-pointer select-none px-2 py-1 ${
                  active ? "bg-fuchsia-950 text-white" : "text-stone-300"
                }`}
              >
                {!option.id && p.useQueryAsNewOptionName ? (
                  <div>
                    <span className="italic opacity-80">
                      + New{p.optionUnit ? ` ${p.optionUnit}` : ""}:{" "}
                    </span>
                    <span>{option.name}</span>
                  </div>
                ) : (
                  option.name
                )}
                {selected && <span className="ml-2">✓</span>}
              </div>
            )}
          </Combobox_.Option>
        ))}
      </Combobox_.Options>
    </Combobox_>
  );
}
