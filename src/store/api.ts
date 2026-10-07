import {
  MutationCache,
  QueryCache,
  QueryClient,
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import { showToast } from "./ui";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body?.error ?? res.statusText);
  }
  return res.json();
}

const isSignedOut = (error: unknown) =>
  error instanceof ApiError && error.status === 401;

// A 401 means the session ended. Forgetting the user sends every signed-in
// page to the login screen.
function handleSignedOut() {
  queryClient.setQueryData(queries.me.queryKey, null);
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => isSignedOut(error) && handleSignedOut(),
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      // A wrong password at sign-in is also a 401; forgetting the user there
      // is harmless, since nobody is signed in yet.
      if (isSignedOut(error)) handleSignedOut();
      if (mutation.meta?.handlesOwnErrors) return;
      if (isSignedOut(error)) {
        showToast("You've been signed out. Sign in to keep going.");
        return;
      }
      // Failed saves roll back, so say so instead of silently reverting.
      showToast(`Couldn't save: ${error.message}`);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // A missing or forbidden resource won't appear on retry.
      retry: (count, error) =>
        !(error instanceof ApiError && error.status < 500) && count < 2,
    },
  },
});

// ─── Queries ──────────────────────────────────────────────────────────────────

export type User = { id: string; email: string; name: string | null };

export const queries = {
  // The signed-in user, or null when signed out.
  me: queryOptions({
    queryKey: ["me"],
    queryFn: () =>
      apiFetch<{ user: User | null }>("/auth/me").then((r) => r.user),
    staleTime: Infinity,
  }),
  characters: queryOptions({
    queryKey: ["characters"],
    queryFn: () =>
      apiFetch<IServer.GetCharacters.Response>("/characters").then(
        (r) => r.characters,
      ),
  }),
  character: (id: string) =>
    queryOptions({
      queryKey: ["characters", id],
      queryFn: () =>
        apiFetch<IServer.GetCharacter.Response>(`/characters/${id}`).then(
          (r) => r.character,
        ),
    }),
  skills: queryOptions({
    queryKey: ["skills"],
    queryFn: () =>
      apiFetch<IServer.GetSkills.Response>("/skills").then((r) => r.skills),
  }),
  skillSynergies: queryOptions({
    queryKey: ["skillSynergies"],
    queryFn: () =>
      apiFetch<IServer.GetSkillSynergies.Response>("/skill-synergies").then(
        (r) => r.skillSynergies,
      ),
  }),
  abilities: queryOptions({
    queryKey: ["abilities"],
    queryFn: () =>
      apiFetch<IServer.GetAbilities.Response>("/abilities").then(
        (r) => r.abilities,
      ),
  }),
  items: queryOptions({
    queryKey: ["items"],
    queryFn: () =>
      apiFetch<IServer.GetItems.Response>("/items").then((r) => r.items),
  }),
  spells: queryOptions({
    queryKey: ["spells"],
    queryFn: () =>
      apiFetch<IServer.GetSpells.Response>("/spells").then((r) => r.spells),
  }),
};

// ─── Mutations ────────────────────────────────────────────────────────────────

const updateCharacterKey = ["updateCharacter"];

// Saves the whole character. The cache updates immediately so the sheet reacts
// without waiting, and rolls back if the save fails.
export function useUpdateCharacter() {
  const client = useQueryClient();
  const { mutateAsync } = useMutation({
    mutationKey: updateCharacterKey,
    mutationFn: (character: ICharacter) =>
      apiFetch<IServer.PutCharacter.Response>(`/characters/${character.id}`, {
        method: "PUT",
        body: JSON.stringify(character),
      }),
    onMutate: async (character) => {
      const { queryKey } = queries.character(character.id);
      await client.cancelQueries({ queryKey });
      const previous = client.getQueryData(queryKey);
      client.setQueryData(queryKey, character);
      return { previous };
    },
    onError: (_error, character, context) => {
      client.setQueryData(
        queries.character(character.id).queryKey,
        context?.previous,
      );
    },
    onSettled: () => {
      // Refetch only after the last of several quick saves, so an older
      // response can't overwrite newer optimistic changes.
      if (client.isMutating({ mutationKey: updateCharacterKey }) === 1) {
        return client.invalidateQueries({
          queryKey: queries.characters.queryKey,
        });
      }
    },
  });
  return mutateAsync;
}

export function useAddSkill() {
  const client = useQueryClient();
  const { mutateAsync } = useMutation({
    mutationFn: (skill: IServer.PostSkill.Request) =>
      apiFetch<{ skill: CompendiumSkill }>("/skills", {
        method: "POST",
        body: JSON.stringify(skill),
      }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: queries.skills.queryKey }),
  });
  return mutateAsync;
}

export function useUpdateSkill() {
  const client = useQueryClient();
  const { mutateAsync } = useMutation({
    mutationFn: (skill: CompendiumSkill) =>
      apiFetch<IServer.PutSkill.Response>(`/skills/${skill.id}`, {
        method: "PUT",
        body: JSON.stringify(skill),
      }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: queries.skills.queryKey }),
  });
  return mutateAsync;
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

// Signing in or out starts from an empty cache, so no data from one account
// is ever shown to another.
function useSessionChange<Vars>(request: (vars: Vars) => Promise<User | null>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: request,
    meta: { handlesOwnErrors: true },
    onSuccess: (user) => {
      client.clear();
      client.setQueryData(queries.me.queryKey, user);
    },
  });
}

const post = <T>(path: string, body?: unknown) =>
  apiFetch<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });

export const useLogin = () =>
  useSessionChange((vars: { email: string; password: string }) =>
    post<{ user: User }>("/auth/login", vars).then((r) => r.user),
  );

export const useSignUp = () =>
  useSessionChange(
    (vars: {
      email: string;
      password: string;
      name: string;
      inviteCode: string;
    }) => post<{ user: User }>("/auth/signup", vars).then((r) => r.user),
  );

export const useLogout = () =>
  useSessionChange(() => post("/auth/logout").then(() => null));

export const useChangePassword = () =>
  useMutation({
    mutationFn: (vars: { currentPassword: string; newPassword: string }) =>
      post<{ ok: true }>("/auth/password", vars),
    meta: { handlesOwnErrors: true },
  });
