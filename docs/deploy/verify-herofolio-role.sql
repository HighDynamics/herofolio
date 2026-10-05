-- Read-only checks that the herofolio role is confined to its own schema.
-- See RUNBOOK.md. Run as highdynamics:
--   psql "$PGURL" -X -f docs/deploy/verify-herofolio-role.sql
-- Every row of the first result should say ok = t, and the second result
-- (access outside herofolio) should have no rows.

\set ON_ERROR_STOP on

begin read only;

select name, ok from (values
  ('not superuser, createrole, createdb, replication, or bypassrls',
    (select not (rolsuper or rolcreaterole or rolcreatedb or rolreplication or rolbypassrls)
       from pg_roles where rolname = 'herofolio')),
  ('member of no other role',
    not exists (select 1 from pg_auth_members where member = 'herofolio'::regrole)),
  ('search_path is herofolio',
    exists (select 1 from pg_db_role_setting
             where setrole = 'herofolio'::regrole
               and 'search_path=herofolio' = any (setconfig))),
  ('owns nothing outside the herofolio schema',
    not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
       -- pg_toast holds the out-of-line storage for its own tables.
       where c.relowner = 'herofolio'::regrole
         and n.nspname not in ('herofolio', 'pg_toast'))
      and not exists (
        select 1 from pg_namespace where nspowner = 'herofolio'::regrole)
      and not exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where p.proowner = 'herofolio'::regrole and n.nspname <> 'herofolio')),
  ('no create on the database (no new schemas)',
    not has_database_privilege('herofolio', current_database(), 'CREATE')),
  ('usage and create on herofolio',
    has_schema_privilege('herofolio', 'herofolio', 'USAGE, CREATE'))
) as checks(name, ok);

-- Every privilege herofolio holds outside its own schema, across all schemas
-- but herofolio and the system ones. Expect zero rows. The one exception
-- allowed is USAGE on public, which every role gets from PUBLIC. public has no
-- tables, and revoking it from PUBLIC could affect ethics-reports.
with other_schemas as (
  select oid, nspname from pg_namespace
   where nspname not in ('herofolio', 'pg_catalog', 'information_schema', 'pg_toast')
     and nspname not like 'pg\_temp\_%'
     and nspname not like 'pg\_toast\_temp\_%'
)
select s.nspname as schema, 'schema' as kind, s.nspname as object, p.privilege
  from other_schemas s
 cross join (values ('USAGE'), ('CREATE')) as p(privilege)
 where has_schema_privilege('herofolio', s.oid, p.privilege)
   and not (s.nspname = 'public' and p.privilege = 'USAGE')
union all
select s.nspname, 'table', c.relname, p.privilege
  from other_schemas s
  join pg_class c on c.relnamespace = s.oid and c.relkind in ('r', 'p', 'v', 'm', 'f')
 cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'),
                    ('REFERENCES'), ('TRIGGER')) as p(privilege)
 where has_table_privilege('herofolio', c.oid, p.privilege)
union all
select s.nspname, 'column', c.relname, p.privilege
  from other_schemas s
  join pg_class c on c.relnamespace = s.oid and c.relkind in ('r', 'p', 'v', 'm', 'f')
 cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')) as p(privilege)
 where has_any_column_privilege('herofolio', c.oid, p.privilege)
union all
select s.nspname, 'sequence', c.relname, p.privilege
  from other_schemas s
  join pg_class c on c.relnamespace = s.oid and c.relkind = 'S'
 cross join (values ('USAGE'), ('SELECT'), ('UPDATE')) as p(privilege)
 where has_sequence_privilege('herofolio', c.oid, p.privilege)
union all
-- Functions get EXECUTE from PUBLIC by default, so any function outside the
-- system schemas shows up here, reachable or not. Production has none
-- (checked 2026-10-05).
select s.nspname, 'function', p.oid::regprocedure::text, 'EXECUTE'
  from other_schemas s
  join pg_proc p on p.pronamespace = s.oid
 where has_function_privilege('herofolio', p.oid, 'EXECUTE')
 order by 1, 2, 3, 4;

rollback;
