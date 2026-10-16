-- node-postgres/JSON Date values retain milliseconds, not Postgres microseconds.
-- Canonicalize stored precision so (time,id) cursors cannot skip same-ms records.
begin;
do $$
declare c record;
begin
  for c in select table_name,column_name from information_schema.columns
    where table_schema='nestful' and data_type='timestamp with time zone' and datetime_precision<>3
  loop
    execute format('alter table nestful.%I alter column %I type timestamptz(3)',c.table_name,c.column_name);
  end loop;
end $$;
commit;
