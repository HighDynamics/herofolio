# Herofolio

A D&D 3.5 character management app built with React, TypeScript, Vite, and Tailwind CSS v4, using TanStack Query for server data and Jotai for client state. An Express API serves data from Postgres.

## Tech Stack

- **React 18** with TypeScript
- **Vite** for bundling
- **Tailwind CSS v4** (via `@tailwindcss/vite`)
- **TanStack Query** for server data (fetching, caching, mutations)
- **Jotai** for client-only state (dice rolls, toasts)
- **React Router v7** (`createBrowserRouter`; the character is in the URL: `/characters/:characterId/...`)
- **Express 5 + Knex** API over **Postgres**, run with `tsx`

## Commands

```bash
npm start          # Vite (with --host for LAN access) + API on :4002, proxied at /api
npm run migrate    # Create the schema if needed and apply migrations
npm run seed       # Load server/seed/data (SEED_CONFIRM=1 to overwrite existing data)
npm run typecheck  # Typecheck the frontend and the server
npm run lint       # ESLint
npm run format     # Prettier --write (format:check only checks)
npm test           # Vitest
npm run audit:prod # npm audit for production dependencies
npm run check      # What CI runs: format:check, lint, typecheck, test, build
npm run build      # Production build
npm run serve      # Preview production build
```

CI (`.github/workflows/ci.yml`) runs those checks on every PR and push to main
as separate jobs: Format, Lint, Typecheck, Test, Build and Dependency audit. See
`docs/ci-quality.md` for what each tool is and why.

## Project Structure

- `src/components/` — React UI components
- `src/store/api.ts` — API client, query definitions, and mutations
- `src/store/character.ts` — hooks for the character in the URL and its derived data
- `src/store/ui.ts` — Jotai atoms for client state
- `src/store/stats/` — the stat engine
- `server/` — Express API (`routes.ts`), Knex config, migrations (`db/migrations/`)
- `server/seed/data/` — seed data: Arn and the SRD compendiums

## Database

- All tables live in the `herofolio` Postgres schema (`DB_SCHEMA`); the production database is shared with other apps, so never touch other schemas.
- Compendium rows with a null `owner_id` are SRD content everyone sees. Rows with an owner are that user's private additions. Only SRD content ships as shared data.
- Characters store everything except id, owner, and name in a `data` jsonb column.
- Knex converts camelCase in queries to snake_case columns, and rows back to camelCase.

## Accounts

- Cookie sessions (express-session, stored in the `herofolio.session` table), 30-day rolling, bcrypt password hashes. See `server/auth.ts`.
- Sign-up requires `SIGNUP_INVITE_CODE`; leaving it unset turns sign-up off. Login and sign-up failures are rate-limited per IP.
- Every `/api` route except `/api/auth/*` requires a session and only returns the signed-in user's data (plus SRD compendium entries).
- `BOOTSTRAP_USER_EMAIL` owns Arn and the non-SRD seed data. On boot, the API gives that account `BOOTSTRAP_USER_PASSWORD_HASH` if it has no password yet.
- In the client, `queries.me` holds the signed-in user (null when signed out); any 401 clears it, which sends signed-in pages to `/login`.
