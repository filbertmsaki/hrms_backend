-- Run only on authorized UAT with a read-only role. Schema metadata only; no business rows.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '15s';

-- Environment identity and all application table names (metadata only).
SELECT current_database() AS database_name,
       current_schema() AS default_schema,
       current_setting('server_version') AS postgres_version;
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
  AND table_type = 'BASE TABLE'
ORDER BY table_schema, table_name;

-- TypeORM migration ledger. No application rows are selected.
SELECT name, timestamp
FROM public.migrations
ORDER BY timestamp, name;

-- Relevant column shapes, including old KPI links in shared activity tables.
SELECT table_schema, table_name, column_name, data_type,
       udt_schema, udt_name, is_nullable,
       character_maximum_length, numeric_precision, numeric_scale,
       column_default
FROM information_schema.columns
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
  AND (table_name ~* 'kpi|performance|competency|scorecard'
       OR table_name IN ('daily_activity_entries', 'activity_categories')
       OR column_name ~* 'kpi|performance')
ORDER BY table_schema, table_name, ordinal_position;

-- Constraints, including foreign keys into or out of relevant tables.
SELECT ns.nspname AS table_schema, rel.relname AS table_name,
       con.conname AS constraint_name, con.contype AS constraint_type,
       ref.relname AS referenced_table,
       pg_get_constraintdef(con.oid, true) AS definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace ns ON ns.oid = rel.relnamespace
LEFT JOIN pg_class ref ON ref.oid = con.confrelid
WHERE ns.nspname NOT IN ('pg_catalog', 'information_schema')
  AND (rel.relname ~* 'kpi|performance|competency|scorecard|daily_activity_entries|activity_categories'
       OR ref.relname ~* 'kpi|performance|competency|scorecard')
ORDER BY ns.nspname, rel.relname, con.conname;

-- Relevant indexes and other named schema objects.
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
  AND (tablename ~* 'kpi|performance|competency|scorecard|daily_activity_entries|activity_categories'
       OR indexname ~* 'kpi|performance')
ORDER BY schemaname, tablename, indexname;
SELECT ns.nspname AS object_schema, rel.relname AS object_name,
       rel.relkind AS object_kind
FROM pg_class rel
JOIN pg_namespace ns ON ns.oid = rel.relnamespace
WHERE ns.nspname NOT IN ('pg_catalog', 'information_schema')
  AND rel.relname ~* 'kpi|performance|competency|scorecard'
ORDER BY ns.nspname, rel.relname;

-- Relevant PostgreSQL types and enum labels (schema metadata).
SELECT ns.nspname AS type_schema, typ.typname AS type_name,
       typ.typtype AS type_kind, en.enumlabel, en.enumsortorder
FROM pg_type typ
JOIN pg_namespace ns ON ns.oid = typ.typnamespace
LEFT JOIN pg_enum en ON en.enumtypid = typ.oid
WHERE ns.nspname NOT IN ('pg_catalog', 'information_schema')
  AND typ.typname ~* 'kpi|performance|competency|scorecard'
ORDER BY ns.nspname, typ.typname, en.enumsortorder;

-- Functions and triggers that may collide with forward migrations.
SELECT n.nspname AS function_schema, p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS arguments
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND p.proname ~* 'kpi|performance|competency|scorecard'
ORDER BY n.nspname, p.proname;
SELECT n.nspname AS table_schema, c.relname AS table_name,
       t.tgname AS trigger_name, pg_get_triggerdef(t.oid, true) AS definition
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND (c.relname ~* 'kpi|performance|competency|scorecard'
       OR t.tgname ~* 'kpi|performance|competency|scorecard')
ORDER BY n.nspname, c.relname, t.tgname;

ROLLBACK;
