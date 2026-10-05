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

- **API**: a Render web service (`herofolio-api`) running
  `tsx server/server.ts` with `NODE_ENV=production`.
- **Frontend**: a Render static site (`herofolio`) built with `vite build`. It
  rewrites `/api/*` to the API's public URL and everything else to
  `/index.html`.
- Because the static site proxies `/api`, the browser only ever talks to one
  origin. Cookies stay first-party and `SameSite=Lax` works as it does in
  development, so the API needs **no CORS** and no `SameSite=None` cookie.
  (onrender.com is on the Public Suffix List, so a cross-origin setup would
  have needed both.)

### Alternative: one web service serving both

One web service that also serves `build/` would be simpler and costs the
same (static sites are free; it's one web service either way):

- one origin with no proxy hop, so the client IP and `Secure` cookies work
  without depending on how Render's rewrite proxy forwards headers;
- one deploy instead of two, so the frontend and API can't drift apart;
- but there's no CDN for the assets, and a frontend-only change restarts the
  API.

I've built the split plan as chosen, but flagged it. The client-IP check in
the runbook decides whether the split works as-is (see "Client IP" below).

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
  - `GET /api/health` before the session middleware (no DB or session work)
    for Render's health check.
  - Trust proxy stays at 1 hop, so `req.secure` is true behind Render and the
    `Secure` session cookie is sent.
- Client IP for the login rate limit: Render runs behind Cloudflare and its
  proxy appends to `X-Forwarded-For`, so with `trust proxy 1`, `req.ip` is a
  Cloudflare edge address and many users would share one rate-limit bucket.
  In production, use the `True-Client-IP` header (which Cloudflare sets and
  overwrites), falling back to `req.ip`. Failed sign-ins log the IP they
  counted against, so the runbook can check that two networks get different
  IPs through the static-site proxy.
- `render.yaml`: both services, env vars by name only (`sync: false`).
- `.env.example`: note the production-only settings.
- `package.json`: a `start:prod` script (`tsx server/server.ts`).

The repo has no test suite, so instead of adding one the checks run against a
scratch local Postgres 18 cluster that mimics Render: a non-superuser
`CREATEROLE` admin, an `ethics_reports` schema it owns, and the runbook's role
SQL run verbatim. Then `npm run migrate`, the startup check (pending versus up
to date), and the access checks run against it. After that, `npm run
typecheck` and `npm run build`.

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
