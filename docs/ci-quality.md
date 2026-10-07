# CI quality checks

Every PR and every push to `main` runs the checks below in GitHub Actions
(`.github/workflows/ci.yml`). Each is also a local npm script, so you can run
the same thing before pushing: `npm run check` runs all of them except the
dependency audit.

## What the repo is built with

- **Front end:** React 18, TypeScript 5.9, Vite 7, Tailwind CSS v4, TanStack
  Query, Jotai, React Router 7, a PWA plugin. About 6k lines of app code.
- **Server:** Express 5 on Node 24, Knex over Postgres, run directly with `tsx`
  (no compile step). About 1k lines. It has its own `server/tsconfig.json`.
- **Tests:** Vitest 5 (`src/**/*.test.ts`, `server/**/*.test.ts`). The suites
  are pure logic (the stat engine, helpers) plus one that boots a throwaway
  Express app on `127.0.0.1` to check proxy handling. None need a database.
- **Already in the repo:** Prettier with the Tailwind class sorter and an import
  sorter (`.prettierrc`), `npm run typecheck` (both tsconfigs), `npm test`,
  `npm run build`. No linter and no CI.

Because no test touches Postgres, CI needs no service container and no
secrets. If a database test is added later, add a `postgres` service container
to the `test` job rather than any real credentials.

## Candidates and decisions

| Layer         | Candidates                                              | Decision                              |
| ------------- | ------------------------------------------------------- | ------------------------------------- |
| Formatting    | Prettier (already configured), Biome, dprint            | **Prettier**, `prettier --check`      |
| Linting       | ESLint + typescript-eslint, Biome, oxlint               | **ESLint 10 + typescript-eslint**     |
| Type analysis | `tsc` (already a script)                                | **Keep `npm run typecheck`**          |
| Tests         | Vitest (already used)                                   | **Keep `npm test`**                   |
| Build         | `vite build`                                            | **Run it in CI**                      |
| Dependencies  | `npm audit`, Dependabot (already on), Snyk, OSV-scanner | **`npm audit`**, production deps only |
| Dead code     | knip, ts-prune                                          | Rejected                              |
| Secrets       | gitleaks, trufflehog                                    | Rejected                              |

### Formatting: Prettier

The repo already has a `.prettierrc` with two plugins (Tailwind class order and
import order), but nothing enforced it, so 31 files had drifted. Enforcing the
existing tool beats switching to Biome or dprint and re-deciding the style.
`prettier --check` is the CI step. The one-off reformat of the drifted files
goes in its own commit so reviewers can skip it.

### Linting: ESLint 10 with typescript-eslint

ESLint with typescript-eslint is the standard for a TypeScript and React
codebase, and has the broadest rule set. Current releases: ESLint 10.12,
typescript-eslint 8.71 (peer range covers ESLint 10 and TypeScript below 6.1,
so 5.9 is fine), `eslint-plugin-react-hooks` 7.1 (flat config, ESLint 10
allowed). Choices:

- **Flat config** (`eslint.config.js`), the only format ESLint 10 reads.
- `@eslint/js` recommended + `typescript-eslint` **recommended** (not
  type-checked). The type-aware presets are slower and mostly overlap with
  `tsc --strict`, which already runs; for a repo this size the extra signal
  isn't worth the config. Revisit `recommendedTypeChecked` if floating promises
  become a problem (the rule that matters most there is
  `no-floating-promises`).
- **`react-hooks`** recommended, because stale deps and conditional hooks are
  the bugs a linter catches that `tsc` cannot.
- **`eslint-config-prettier` is not used.** typescript-eslint's recommended
  preset has no formatting rules, and Prettier runs as its own check, so there
  is nothing to switch off. The Prettier ESLint plugin was rejected because it
  makes formatting noise show up as lint errors and is slower than running
  Prettier directly.
- Rejected `eslint-plugin-react` (the new JSX transform and TypeScript cover
  most of what it checked), `jsx-a11y` (a useful idea but a large batch of
  findings in a UI-heavy app; better as its own decision), and
  `eslint-plugin-react-refresh` (only matters for dev-server hot reload
  ergonomics, not correctness).

Rejected alternatives: **Biome** and **oxlint** are much faster, but the repo is
small enough that ESLint takes seconds, and ESLint has the React-hooks and
TypeScript rule coverage plus plugin ecosystem. Biome would also replace
Prettier, which is already set up with plugins Biome can't run.

### Types, tests, build

`npm run typecheck` already runs `tsc` over `src` and `server` under `strict`,
so it is the type analysis layer; no extra tool needed. `npm test` runs Vitest.
`npm run build` is in CI because a Vite and Tailwind build can fail on things
`tsc` doesn't see (bad imports in CSS, plugin errors).

### Dependency audit: `npm audit`

Cheap and built in. Scoped to what ships (`--omit=dev`) and to high and
critical advisories (`--audit-level=high`), because a moderate advisory in a
build tool shouldn't block merging. It is a **separate job** from the code
checks: it can start failing with no code change when a new advisory is
published, so Daniel can decide whether it should be a required check.
Dependabot already opens version-update PRs, so a second updater (Renovate) or
a paid scanner (Snyk) adds nothing here.

### Rejected

- **knip / ts-prune (dead code):** useful occasionally, but it needs tuning to
  avoid false positives (entry points, `.d.ts` files, seed scripts) and is
  noise in a PR gate. Fine to run by hand later.
- **gitleaks / trufflehog (secret scanning):** GitHub's built-in secret scanning
  and push protection are free on public repos and live in repo settings,
  which this change doesn't touch. Worth confirming they are on.
- **CodeQL:** also free for public repos, but it is a repo setting plus
  scheduled scans rather than a PR gate for a project this size.
- **Coverage thresholds:** the test suite covers the stat engine, not the UI.
  A percentage gate would measure the wrong thing.
- **Playwright / e2e:** needs a database and a seeded account; out of
  proportion for now.

## Running locally

| Command                | What it does                                           |
| ---------------------- | ------------------------------------------------------ |
| `npm run format`       | Rewrite files with Prettier                            |
| `npm run format:check` | Check formatting (CI: **Format**)                      |
| `npm run lint`         | ESLint (CI: **Lint**)                                  |
| `npm run typecheck`    | `tsc` for `src` and `server` (CI: **Typecheck**)       |
| `npm test`             | Vitest (CI: **Test**)                                  |
| `npm run build`        | Vite production build (CI: **Build**)                  |
| `npm run audit:prod`   | Production dependency audit (CI: **Dependency audit**) |
| `npm run check`        | Format check, lint, typecheck, test, and build         |

## Results of the first run

- **Prettier:** 31 files had drifted from the existing `.prettierrc` (code,
  CSS and Markdown). Fixed with `prettier --write` in a formatting-only commit.
  The import sorter needed a second pass on one file (`server/auth.ts`) to
  settle; the check is clean after that.
- **ESLint:** 18 errors and 1 warning, all fixed without changing behaviour:
  unused hook calls and bindings in `Skills.tsx`, `MiscInfo.tsx`, `index.tsx`
  (dropped); `any` in `routes.ts`, `Combobox.tsx`, `Select.tsx` and
  `virtual-pwa-register.d.ts` (typed); a bare `a && b()` statement (made an
  `if`); a stale `eslint-disable` (removed). Two rules are tuned narrowly in
  `eslint.config.js`: `_`-prefixed arguments and rest-sibling destructuring
  may be unused, and `require()` is allowed in the one `.cjs` script. The
  react-hooks rules found nothing.
- **Typecheck, test, build:** clean on `main` before any change.
- **`npm audit` (production dependencies):** fails today with 1 critical, 6
  high and 1 moderate advisory, among them `react-router` and `vite` (direct)
  and `tar`, `rollup`, `postcss` (transitive). `npm audit fix` can resolve
  them with in-range lockfile bumps, but that is a broad dependency change
  that overlaps the open Dependabot PRs, so it is deliberately not part of
  this change. Until it is handled, the **Dependency audit** job is red and
  should not be a required check.
