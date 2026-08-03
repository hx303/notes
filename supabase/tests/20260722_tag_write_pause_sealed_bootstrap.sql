-- Read-only proof that Supabase CLI built the exact pre-00150 baseline.

\set ON_ERROR_STOP on

DO $tag_write_pause_sealed_bootstrap$
DECLARE
  actual_versions text[];
  expected_versions constant text[] := ARRAY[
    '20260712', '20260714', '20260715', '20260716', '20260717',
    '20260718000100', '20260718000200', '20260718000300',
    '20260718000400', '20260718000500', '20260718000600',
    '20260718000700', '20260718000800', '20260718000900',
    '20260718001000', '20260718001100', '20260718001200',
    '20260721000100', '20260722000100'
  ]::text[];
BEGIN
  IF current_database() <> 'postgres'
     OR current_setting('server_version_num')::integer < 170000
     OR current_setting('server_version_num')::integer >= 180000
     OR to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'wouldkeep_tag_write_pause_sealed_cli_baseline_missing';
  END IF;

  SELECT array_agg(version::text ORDER BY version::text)
  INTO actual_versions
  FROM supabase_migrations.schema_migrations;

  IF actual_versions IS DISTINCT FROM expected_versions
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 19
     OR (SELECT count(DISTINCT version) FROM supabase_migrations.schema_migrations) <> 19
     OR EXISTS (
       SELECT 1 FROM supabase_migrations.schema_migrations
       WHERE version::text IN ('20260722000150', '20260722000200')
     )
     OR (SELECT count(*) FROM auth.users) <> 1
     OR NOT EXISTS (
       SELECT 1 FROM auth.users
       WHERE id = 'b154d7e9-07c9-4412-8673-86239bbbe367'::uuid
         AND email = '2149665127@qq.com'
     )
     OR (SELECT count(*) FROM public.knowledge_bases) <> 0
     OR (SELECT count(*) FROM public.documents) <> 0
     OR (SELECT count(*) FROM public.tags) <> 0
     OR (SELECT count(*) FROM public.document_tags) <> 0
     OR (SELECT relowner FROM pg_catalog.pg_class WHERE oid = 'public.tags'::regclass)
       <> (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user)
     OR (SELECT relowner FROM pg_catalog.pg_class WHERE oid = 'public.document_tags'::regclass)
       <> (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'wouldkeep_tag_write_pause_sealed_cli_baseline_drift';
  END IF;
END;
$tag_write_pause_sealed_bootstrap$;

SELECT
  'tag_write_pause_sealed_bootstrap_passed' AS result,
  control.system_identifier::text AS system_identifier,
  19::integer AS ledger_versions,
  (
    SELECT owner.rolname
    FROM pg_catalog.pg_database database
    JOIN pg_catalog.pg_roles owner ON owner.oid = database.datdba
    WHERE database.datname = 'postgres'
  ) AS database_owner,
  (
    SELECT role.rolsuper
    FROM pg_catalog.pg_roles role
    WHERE role.rolname = 'supabase_admin'
  ) AS admin_superuser,
  (
    SELECT role.rolcanlogin
    FROM pg_catalog.pg_roles role
    WHERE role.rolname = 'supabase_admin'
  ) AS admin_login
FROM pg_catalog.pg_control_system() control;
