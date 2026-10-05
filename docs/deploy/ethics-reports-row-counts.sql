-- Read-only: exact row counts for every table in ethics_reports. Run it
-- against production and against a local restore of the export; the two
-- outputs should match. See RUNBOOK.md, step 1.
begin read only;
select table_name,
       (xpath('/row/n/text()',
              query_to_xml(format('select count(*) as n from %I.%I',
                                  table_schema, table_name),
                           false, true, '')))[1]::text::bigint as row_count
  from information_schema.tables
 where table_schema = 'ethics_reports' and table_type = 'BASE TABLE'
 order by table_name;
rollback;
