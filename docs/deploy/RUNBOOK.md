# Deploying Herofolio to Render: runbook

Read [PLAN.md](PLAN.md) first. "Dinos and Donuts" also holds ethics-reports'
hand-entered data, so **do the steps in order**. Nothing writes to the database
before step 3, and the first Herofolio migration runs in step 5.

**Who:** **[Daniel · dashboard]** means the Render dashboard. **[Daniel ·
terminal]** means a command on Daniel's machine, run from the repo root on a
checkout that has this branch.

Facts checked read-only on 2026-10-05: Postgres 18.6. `highdynamics` owns the
database and both schemas. It isn't a superuser but has `CREATEROLE`, and
Render allows roles created with `CREATE ROLE` (they're "not managed by
Render": they don't appear in the dashboard and credential rotation skips
them). `ethics_reports` grants nothing beyond its owner. No `herofolio` role or
schema exists yet.

## 0. Prerequisites [Daniel · terminal]

- `pg_dump --version` and `psql --version` show 18.x (Homebrew `postgresql@18`).
- Passwords never go on a command line or into an exported variable.
  `psql`, `pg_dump`, `pg_restore`, and the app's `pg` driver all read them
  from `~/.pgpass`, so the URLs below carry no password.
- **Connection variables.** These hold no secrets. Paste this block again in
  any new shell before running a later step. Take the host from the
  dashboard (Dinos and Donuts → Connect → External); it should be
  `dpg-dadju76q1p3s73e0f650-a.oregon-postgres.render.com`.

  ```zsh
  PGHOST_EXT=dpg-dadju76q1p3s73e0f650-a.oregon-postgres.render.com
  PGURL="postgresql://highdynamics@$PGHOST_EXT/dinos_and_donuts?sslmode=require"
  HFURL="postgresql://herofolio@$PGHOST_EXT/dinos_and_donuts"   # add ?sslmode=require for psql
  ```

- **Add `highdynamics` to `~/.pgpass`.** Copy the password from the
  dashboard's External URL, then:

  ```zsh
  touch ~/.pgpass && chmod 600 ~/.pgpass
  read -rs 'PW?highdynamics password: '
  print -r -- "$PGHOST_EXT:5432:dinos_and_donuts:highdynamics:$PW" >> ~/.pgpass
  unset PW
  psql "$PGURL" -X -tAc "select current_user"   # expect: highdynamics
  ```

## 1. Export `ethics_reports` (before anything else)

ethics-reports stays live throughout, so its row counts can grow while you
work. Each count below is taken at a known point, and the checks allow for
that.

1. **[Daniel · terminal]** Count rows, then take the dump straight away. It
   holds donor names and addresses, so keep it out of every git repo:

   ```zsh
   mkdir -p "$HOME/Backups/dinos-and-donuts" && chmod 700 "$HOME/Backups/dinos-and-donuts"
   DUMP="$HOME/Backups/dinos-and-donuts/ethics_reports-$(date +%Y%m%d-%H%M).dump"
   psql "$PGURL" -X -f docs/deploy/ethics-reports-row-counts.sql > "$DUMP.before-counts.txt"
   pg_dump "$PGURL" --schema=ethics_reports --format=custom --file="$DUMP"
   chmod 600 "$DUMP" "$DUMP.before-counts.txt"
   pg_restore --list "$DUMP" | grep -c "TABLE DATA"   # expect 12
   ```

2. **[Daniel · terminal]** Prove the dump restores:

   ```zsh
   createdb ethics_restore_check
   pg_restore --no-owner --dbname=ethics_restore_check "$DUMP"
   psql -d ethics_restore_check -X -f docs/deploy/ethics-reports-row-counts.sql
   cat "$DUMP.before-counts.txt"
   ```

   Every table must be listed in both, and each restored count must be
   **at least** the count taken just before the dump. It's equal unless
   someone entered data in the seconds between them, so a higher count is fine
   and a lower one isn't. If any table has fewer rows, or is missing, stop and
   take the dump again. Then run `dropdb ethics_restore_check`.
3. **[Daniel]** Copy the `.dump` somewhere off this machine as well (an
   encrypted cloud drive or a 1Password document).
4. **[Daniel · dashboard]** Optional second copy: Dinos and Donuts → Recovery
   → create a logical backup export. The paid plan also has point-in-time
   recovery (3 days on Hobby), which restores into a *new* database.

## 2. Generate secrets [Daniel · terminal]

Each command prints a value. Save each one in the password manager straight
away; none of them goes in git.

```zsh
openssl rand -hex 32   # herofolio role password (hex, so it needs no URL escaping)
openssl rand -hex 32   # SESSION_SECRET
openssl rand -hex 8    # SIGNUP_INVITE_CODE (or any code you like)

# BOOTSTRAP_USER_PASSWORD_HASH: the password is read silently and passed to
# node through the environment of that one command, never through argv.
read -rs 'PW?Your Herofolio sign-in password: '
PW=$PW node -e "console.log(require('bcryptjs').hashSync(process.env.PW,10))"
unset PW
```

## 3. Create the `herofolio` role and schema [Daniel · terminal]

```zsh
psql "$PGURL" -X -f docs/deploy/create-herofolio-role.sql
```

The script creates the role (no superuser, no createrole/createdb,
connection limit 25), the schema `herofolio` (owned by `highdynamics`),
`GRANT USAGE, CREATE ON SCHEMA herofolio TO herofolio`, and
`ALTER ROLE herofolio SET search_path = herofolio`, all in one transaction.
Only then does it prompt for the role's password: paste the one from step 2.
It doesn't touch `ethics_reports`, `public`, or the database ACL. If the role
or schema already exists, it stops with an error **before** the prompt, so it
can't reset the password. In that case don't run anything else; work out why
it exists first.

If the password prompt was aborted (Ctrl-C, or a mismatched entry), the role
and schema exist but the role has no password, and running the script again
stops at "already exists". To recover, set the password by hand as
`highdynamics`:

```zsh
psql "$PGURL" -X -c '\password herofolio'
```

Add the role to `~/.pgpass`, then verify:

```zsh
read -rs 'PW?herofolio password: '
print -r -- "$PGHOST_EXT:5432:dinos_and_donuts:herofolio:$PW" >> ~/.pgpass
unset PW
psql "$PGURL" -X -f docs/deploy/verify-herofolio-role.sql
```

Every row of the first result must show `ok = t`, and the second result
(every privilege `herofolio` holds outside its own schema) must have **0
rows**. The one privilege it may hold outside its schema is `USAGE` on
`public`, which every role gets from `PUBLIC`; `public` has no tables. If
anything else appears, stop and roll back (below).

Then confirm, **as `herofolio`**, that it can't read `ethics_reports`:

```zsh
psql "$HFURL?sslmode=require" -X -c "select current_user, current_schemas(true)"
psql "$HFURL?sslmode=require" -X -c "select count(*) from ethics_reports.donations"
# expect: ERROR: permission denied for schema ethics_reports
```

## 4. Get the code onto `main` [Daniel or Arbor]

Push `deploy/render`, open a PR, and merge it. The service deploys from
`main`.

## 5. Create the service [Daniel · dashboard]

New → **Blueprint** → repo `HighDynamics/herofolio`. Render reads
`render.yaml` and creates one free web service, `herofolio`, which serves both
the API and the frontend. It manages only the resources in the file, so
ethics-reports and the database are untouched. When prompted, enter:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `postgresql://herofolio:<pw>@dpg-dadju76q1p3s73e0f650-a/dinos_and_donuts`: the **internal** host and the **herofolio** role, never highdynamics, and **no `?sslmode=`** (the URL's sslmode would override the app's TLS settings and fail on the internal self-signed certificate) |
| `SESSION_SECRET` | from step 2 |
| `SIGNUP_INVITE_CODE` | from step 2 (leave empty to keep sign-up off) |
| `BOOTSTRAP_USER_EMAIL` | your login email |
| `BOOTSTRAP_USER_PASSWORD_HASH` | from step 2 |

`NODE_ENV=production`, `DB_SCHEMA=herofolio`, and `NODE_VERSION=24` come from
the file.

Its build runs `npm ci --include=dev && npm run build`. Its start command is
`npm run migrate && npm run start:prod`, so its first deploy runs the first
production migration, as `herofolio`. **[Daniel ·
dashboard]** In the service's logs, expect:
`Batch 1 applied to "herofolio": …`, `Bootstrapped account …`,
`API listening …`. If migrations are ever pending at startup, the API logs
`Refusing to start: N pending migration(s)` and exits.

## 6. Load the SRD compendium [Daniel · terminal]

This runs as `herofolio`, so it can't reach `ethics_reports`. The password
comes from `~/.pgpass` (the `pg` driver prints a deprecation notice about it;
that's harmless). Set `DATABASE_SSL=true` explicitly, since a local `.env`
may say false, and leave `sslmode` off the URL: the app sets TLS itself.

```zsh
DATABASE_URL="$HFURL" DATABASE_SSL=true DB_SCHEMA=herofolio \
  BOOTSTRAP_USER_EMAIL=<same email> npm run seed
```

## 7. Verify

1. **[Daniel · terminal]** `curl https://herofolio.onrender.com/api/health`
   returns `{"ok":true}`. (Use the service's real URL if Render assigned
   another one.)
2. **[Daniel · browser]** Sign in at `https://herofolio.onrender.com`. Then
   reload: you should still be signed in. If sign-in "works" but a reload
   sends you back to `/login`, the `Secure` cookie isn't being set (trust
   proxy). Open the browser console too: Font Awesome icons should render,
   with no Content-Security-Policy errors.
3. **Client IP. Do this before you share the invite code with anyone, and
   again after any change to `server/proxy.ts`.** Look up your network's
   public IP first (e.g. at <https://icanhazip.com>). **[Daniel · browser]**
   Make one wrong sign-in. Then **[Daniel · terminal]** try to spoof
   X-Forwarded-For, **once**. Leave `CF-Connecting-IP` out: Cloudflare
   rejected a client-supplied one in our test (`error code: 1000`).
   Both attempts are failed sign-ins from your own IP, so they count toward
   the five-failure lockout:

   ```zsh
   curl -s https://herofolio.onrender.com/api/auth/login \
     -H 'Content-Type: application/json' \
     -H 'X-Forwarded-For: 5.6.7.8' \
     -d '{"email":"nobody@example.com","password":"wrong-password"}'
   ```

   **[Daniel · dashboard]** The service's logs show one line per attempt:
   `Failed auth attempt from <key> (req.ip <ip>, X-Forwarded-For "<chain>")`.
   For both lines, the key and `req.ip` must be **your real public IP**. The
   curl line's chain starts with `5.6.7.8`, but neither address may be
   `5.6.7.8`. Expect a chain like
   `"5.6.7.8, <your IP>, <Cloudflare edge>, 10.x.x.x"`: the edge is often
   172.6x–172.71.x, and the 10.x is Render's load balancer. The request
   reaches the app from another Render 10.x proxy (the socket peer), which
   isn't in the header.

   **If the logged key isn't your real IP, stop:** don't share the invite
   code, and report it. A Cloudflare or 10.x address means every visitor
   shares one lockout bucket (five wrong passwords from anyone would lock
   everybody out for 15 minutes). A spoofed value means the limit can be
   bypassed. If only `req.ip` is wrong and the key is right, report the chain
   from the log: an address in it isn't on the trusted list in
   `server/proxy.ts`, and that needs fixing before launch too.
4. **[Daniel · terminal]** Rerun `verify-herofolio-role.sql` (all `t`, no
   rows in the second result) and `ethics-reports-row-counts.sql`. Every
   table must still be there. Counts can differ from
   `$DUMP.before-counts.txt` only by what was entered (or deleted) in
   ethics-reports since then, since it's live.
5. **[Daniel · browser]** Check that ethics-reports still works.

## Rollback

- **App only:** **[Daniel · dashboard]** Suspend or delete the `herofolio`
  service. The database is unaffected.
- **Remove Herofolio from the database:** suspend the service first, then
  **[Daniel · terminal]** `psql "$PGURL"`:

  ```sql
  begin;
  drop schema herofolio cascade;  -- highdynamics owns it, so this drops every table in it
  drop role herofolio;
  commit;
  ```

  This was tested as a non-superuser `CREATEROLE` owner on Postgres 18. It
  touches nothing outside the `herofolio` schema and role.
- **If `ethics_reports` were ever damaged:** both routes below take
  ethics-reports offline, so decide which one before acting.
  1. **[Daniel · dashboard]** Suspend ethics-reports so nothing writes during
     the restore.
  2. **[Daniel · terminal]** In whatever shell you're in, set everything
     explicitly (a new shell has none of the step 0–1 variables): paste the
     step 0 connection variables again, then point `DUMP` at the step 1
     export and check it's the right file:

     ```zsh
     DUMP="$HOME/Backups/dinos-and-donuts/ethics_reports-YYYYMMDD-HHMM.dump"   # the step 1 export
     ls -l "$DUMP" && pg_restore --list "$DUMP" | grep -c "TABLE DATA"  # expect 12
     ```

  3. **[Daniel · terminal]** Dump the current, damaged state **first**, so
     whatever is there now can still be recovered:

     ```zsh
     PREDUMP="$HOME/Backups/dinos-and-donuts/ethics_reports-pre-restore-$(date +%Y%m%d-%H%M).dump"
     pg_dump "$PGURL" --schema=ethics_reports --format=custom --file="$PREDUMP"
     chmod 600 "$PREDUMP" && pg_restore --list "$PREDUMP" | grep -c "TABLE DATA"
     ```

     If this dump fails, stop: don't restore over production without it.

  4. **[Daniel · terminal]** Restore `$DUMP` into a scratch local database (as
     in step 1.2) and inspect it.
  5. **Either** restore it over production. **`--clean` drops every table in
     `ethics_reports` and recreates it from the dump, so every row entered
     since the dump is lost.** Those rows are still in the pre-restore dump
     from step 3, to re-enter by hand. If only a few rows are damaged,
     copying them across from the scratch restore loses less.

     ```zsh
     pg_restore --dbname="$PGURL" --clean --if-exists --single-transaction \
       --schema=ethics_reports "$DUMP"
     ```

     **Or** use Render's point-in-time recovery (Dinos and Donuts →
     Recovery) to a new database, and repoint ethics-reports at it.
  6. **[Daniel · dashboard]** Resume ethics-reports and check it.

## Troubleshooting

- **Deploy fails with "Migration table is already locked".** Knex holds a lock
  row while it migrates. Our migrations run in a transaction, which also holds
  that lock, so a migration killed mid-run (a deploy cancelled or an instance
  OOM-killed) rolls back cleanly and releases the lock. That was tested by
  `kill -9` on Postgres 18. The lock can only stick if a future migration
  turns its transaction off. First make sure no deploy is in progress, so
  nothing is actually migrating. Then **[Daniel · terminal]**, as `herofolio`:

  ```zsh
  psql "$HFURL?sslmode=require" -X -c "update herofolio.knex_migrations_lock set is_locked = 0"
  ```

  Then redeploy (Manual Deploy → Deploy latest commit).
- **"Refusing to start: N pending migration(s)".** Migrations didn't run
  before the server started. Check the deploy log for the `npm run migrate`
  output above it.
