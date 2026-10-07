import { Listbox } from "@headlessui/react";

type Option = {
  id: string;
  name: string;
  [key: string]: unknown;
};

export function Select<T>(
  p: { options: Array<T & Option>; value?: T & Option } & React.ComponentProps<
    typeof Listbox
  >,
) {
  return (
    <Listbox value={p.value}>
      <Listbox.Button>{p.value?.name}</Listbox.Button>
      <Listbox.Options>
        {p.options.map((o) => (
          <Listbox.Option value={o}>{o.name}</Listbox.Option>
        ))}
      </Listbox.Options>
    </Listbox>
  );
}
