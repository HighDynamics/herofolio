-- Creates Herofolio's own Postgres login role and schema in the shared
-- "Dinos and Donuts" database, then prompts for the role's password. See
-- RUNBOOK.md, step 3. Run it once, as the database's default user
-- (highdynamics):
--
--   psql "$PGURL" -X -f docs/deploy/create-herofolio-role.sql
--
-- It only creates new things (one role, one schema) and touches nothing
-- else. ethics_reports already grants nothing beyond its owner, so the new
-- role has no access to it and nothing there needs revoking.
--
-- If the role or schema already exists, the script stops with an error before
-- the password prompt, so running it again can't reset the password.

\set ON_ERROR_STOP on

begin;

-- A plain login role: not a superuser, can't create roles or databases, and
-- isn't a member of any role. It can't log in until the prompt below sets a
-- password. The connection limit keeps Herofolio from using up the shared
-- database's connections. Each instance uses at most 5 (knex) + 3 (sessions),
-- and a deploy briefly runs two instances plus a migrate (5), so 21 at worst.
create role herofolio
  login
  nosuperuser nocreatedb nocreaterole noreplication nobypassrls
  connection limit 25;

-- highdynamics owns the schema, so it can always drop it with everything in
-- it (the rollback). Herofolio may use it and create its tables there; those
-- tables are owned by herofolio.
create schema herofolio;
grant usage, create on schema herofolio to herofolio;

-- Unqualified names resolve to herofolio's schema only (the app sets the same
-- search_path through knex too).
alter role herofolio set search_path = herofolio;

commit;

-- Reached only if everything above succeeded. psql hashes the password
-- before sending it, so it never appears in logs.
--
-- If this prompt is aborted, the role exists with no password (it can't log
-- in), and running the script again stops at "already exists". Recover by
-- setting the password by hand, connected as highdynamics:
--   psql "$PGURL" -X -c '\password herofolio'
\echo 'Set the password for herofolio (from step 2):'
\password herofolio
