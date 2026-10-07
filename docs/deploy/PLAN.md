# Deploying Herofolio to Render: plan

Herofolio has never been deployed. It will share the "Dinos and Donuts" Render
Postgres database with ethics-reports, whose data is hand-entered and can't be
recreated. The plan puts that data first. The exact production steps are in
[RUNBOOK.md](RUNBOOK.md).

## What's there today (read-only checks, 2026-10-05)

- Database `dinos_and_donuts`, Postgres 18.6, Oregon, plan `basic-256mb`
  (`dpg-dadju76q1p3s73e0f650-a`).
- Default user `highdynamics`: not a superuser, but has `CREATEROLE` and
  `CREATEDB`. It owns the `public` and `ethics_reports` schemas.
- `ethics_reports` has no grants beyond its owner (null ACL), and neither do
  its tables. A new role gets no access to it unless someone grants it.
- `public` grants `USAGE` (not `CREATE`) to everyone; it has no tables. The
  database ACL is the default (everyone may `CONNECT` and create temp tables).
- There's no `herofolio` schema yet.
- ethics-reports is a free web service whose start command is
  `npm run migrate && node server/server.js`. It keeps its `knex_migrations`
  table in `ethics_reports`, so Herofolio's migrations (which keep theirs in
  `herofolio`) can't collide with it.

## Shape

One Render web service, `herofolio`, runs `tsx server/server.ts` with
`NODE_ENV=production`. Express serves the API under `/api` and the Vite build
(`build/`) everywhere else, with an SPA fallback to `index.html` for
client-side routes. Daniel chose this over a static site plus an API service
because:

- the browser sees one origin, so there's no proxy hop, no CORS, and the
  `SameSite=Lax`, `Secure` session cookie works as it does in development;
- the client IP reaches the API through one known proxy chain (Cloudflare,
  then Render), not through a static-site rewrite whose forwarding isn't
  documented;
- there's one deploy, so the frontend and API can't drift apart. Cost is the
  same.

It gives up a CDN for the assets (they're fingerprinted and cached for a year
instead), and a frontend-only change restarts the API.

## Database safety

1. **Export `ethics_reports` before anything touches the database.** Run
   `pg_dump --schema=ethics_reports -Fc` from Daniel's machine (pg_dump 18.6
   matches the server). Check the dump with `pg_restore --list`, restore it
   into a scratch local database to prove it's usable, and keep two copies
   outside any git repo.
2. **Give Herofolio its own login role, `herofolio`**, created by
   `highdynamics` (Render allows this: roles made with `CREATE ROLE` are
   "not managed by Render" but are permitted, and `highdynamics` has
   `CREATEROLE`).
   - `highdynamics` creates and owns the `herofolio` schema and grants the
     role `USAGE, CREATE` on it. Herofolio's tables are then owned by
     `herofolio`, but the schema stays under `highdynamics`, so rolling back
     is just `DROP SCHEMA herofolio CASCADE; DROP ROLE herofolio;`.
   - `ALTER ROLE herofolio SET search_path = herofolio`, plus a connection
     limit of 25 so Herofolio can't use up the shared database's
     connections. The knex pool is cut from 10 to 5, so one instance uses at
     most 8 (5 knex + 3 sessions). A deploy briefly runs the old instance, the
     new one, and a migrate: 21 at worst.
   - No grants on `ethics_reports`. Its ACL is already owner-only, so nothing
     there needs revoking, and the runbook never touches it. The verification
     script lists every privilege the role holds in any schema but its own
     (tables, columns, sequences, functions, schema `USAGE`/`CREATE`) and
     expects none. The one exception is `USAGE` on `public`, which every role
     gets from `PUBLIC`. `public` has no tables, and revoking that from
     `PUBLIC` could affect ethics-reports, so it stays.
   - The role script prompts for the password only after the role and schema
     are created, so running it again stops at "role already exists" and
     can't reset the password.
   - Passwords stay out of argv, exported variables, and shell history.
     Database passwords go in `~/.pgpass`, which `psql`, `pg_dump`, and the
     app's `pg` driver all read.
3. **Migrations run as `herofolio`**, never as `highdynamics`, so even a buggy
   migration can't reach `ethics_reports`.

## Code changes

- `server/db/migrate.ts`: create the schema only if it's missing. Postgres
  checks the database-level `CREATE` privilege before it checks
  `IF NOT EXISTS`, so `create schema if not exists` would fail for the
  `herofolio` role even though the schema already exists.
- `server/server.ts`:
  - Startup check: before listening, ask Knex for pending migrations (and let
    it validate the list). If any are pending, log which ones and exit 1.
  - `GET /api/health` ahead of the session store (no DB or session work) for
    Render's health check.
  - In production, serve `build/`: `assets/` with a one-year immutable cache,
    other files with revalidation (so `sw.js` and `index.html` update), and
    `index.html` for any other extension-less GET. Missing files (anything
    under `/assets` or with an extension) return 404, and so do unknown `/api`
    paths (as JSON), rather than the app.
  - The JSON body parser and session middleware are now scoped to `/api`, so
    static files never hit the session store.
  - Helmet's CSP now covers the page, so it allows the Font Awesome kit
    (`script-src kit.fontawesome.com`, `connect-src ka-f/ka-p.fontawesome.com`).
    Google Fonts already fit helmet's `https:` style and font defaults.
- Client IP and trust proxy. Render's docs only say traffic "passes through
  Cloudflare and Render's load balancers" and to "read the x-forwarded-for
  header". They give no hop count and don't mention `True-Client-IP`. Reports
  from Render users show `X-Forwarded-For: <client>, <Cloudflare edge>`
  arriving from a Render-internal 10.x address, with Render's proxy appending
  rather than replacing. So:
  - `trust proxy` is **2** (Render's proxy plus Cloudflare). That makes
    `req.ip` the visitor, ignores anything a client puts at the front of
    `X-Forwarded-For`, and makes `req.secure` true so the `Secure` cookie is
    sent. With the old value of 1, `req.ip` was the Cloudflare edge, which
    many visitors share.
  - The login rate limiter keys on `CF-Connecting-IP`, which Cloudflare sets
    on every request and overwrites if a client sends one. If it's ever
    missing, it falls back to `req.ip`, so visitors never collapse into one
    bucket.
  - Failed sign-ins log both values (`Failed auth attempt from <key> (req.ip
<ip>)`). The runbook's verify step checks they match the real client and
    can't be spoofed.
- `render.yaml`: the one web service, env vars by name only (`sync: false`).
- `.env.example`: note the production-only settings.
- `package.json`: a `start:prod` script (`tsx server/server.ts`).

The repo has no test suite, so instead of adding one the checks ran against a
scratch local Postgres 18 cluster that mimics Render: a non-superuser
`CREATEROLE` admin, plus an `ethics_reports` schema it owns. The runbook's
role SQL ran exactly as written. Then: the startup refusal, `npm run migrate`,
`npm run seed`, the verify SQL, the production server (pages, SPA fallback,
caching, CSP, the `Secure` cookie, the rate limit by header and by
`X-Forwarded-For`), and the rollback. After that, `npm run typecheck` and
`npm run build`.

## Migrations on deploy

Render's pre-deploy command is only for paid instances. On the free plan the
start command is `npm run migrate && npm run start:prod`, the same pattern
ethics-reports uses. If a migration fails, the new instance never starts and
the old one keeps serving. If the API is ever started without migrating, the
startup check refuses to run. On a paid plan, move `npm run migrate` to
`preDeployCommand` (noted in `render.yaml`).

## Not doing

- No Render service, database, or role changes, and no production writes. The
  runbook lists them for Daniel.
- Not touching `ethics_reports`, `public`, or the database-level ACL (revoking
  `PUBLIC` rights there could affect ethics-reports).
