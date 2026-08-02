-- Disposable-only exact PostgreSQL 17 / 20260722000100 baseline guard.

\set ON_ERROR_STOP on
\if :{?wouldkeep_p1b_tag_write_pause_disposable}
\else
\set wouldkeep_p1b_tag_write_pause_disposable false
\endif
\if :wouldkeep_p1b_tag_write_pause_disposable
\else
\echo 'Refusing to run: exact disposable confirmation is required.'
DO $disposable_confirmation_required$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'wouldkeep_tag_write_pause_disposable_confirmation_required';
END;
$disposable_confirmation_required$;
\endif

DO $tag_write_pause_disposable_baseline$
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
  operator_oid oid := (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user);
  server_address inet := pg_catalog.inet_server_addr();
BEGIN
  IF server_address IS NULL
     OR NOT (
       server_address <<= '127.0.0.0/8'::inet
       OR server_address = '::1'::inet
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'wouldkeep_tag_write_pause_literal_loopback_server_required';
  END IF;

  IF current_database() !~ '^wouldkeep_p1b_tag_write_pause_[a-z0-9_]+$' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'wouldkeep_tag_write_pause_disposable_database_name_required';
  END IF;

  IF current_setting('server_version_num')::integer < 170000
     OR current_setting('server_version_num')::integer >= 180000 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'wouldkeep_tag_write_pause_postgresql_17_required';
  END IF;

  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'wouldkeep_tag_write_pause_migration_ledger_missing';
  END IF;

  SELECT array_agg(version::text ORDER BY version::text)
  INTO actual_versions
  FROM (
    SELECT DISTINCT version
    FROM supabase_migrations.schema_migrations
  ) ledger;

  IF actual_versions IS DISTINCT FROM expected_versions THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'wouldkeep_tag_write_pause_exact_00100_ledger_required';
  END IF;

  IF to_regclass('public.tags') IS NULL
     OR to_regclass('public.document_tags') IS NULL
     OR to_regclass('public.documents') IS NULL
     OR to_regclass('public.knowledge_bases') IS NULL
     OR (SELECT relowner FROM pg_catalog.pg_class WHERE oid = 'public.tags'::regclass) <> operator_oid
     OR (SELECT relowner FROM pg_catalog.pg_class WHERE oid = 'public.document_tags'::regclass) <> operator_oid THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'wouldkeep_tag_write_pause_disposable_target_contract_failed';
  END IF;

  IF EXISTS (
       SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'wouldkeep_maintenance'
     )
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_proc procedure
       WHERE procedure.proname IN (
         'reject_tag_write_while_paused',
         'wouldkeep_disposable_tag_pause_definer'
       )
     )
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_trigger trigger
       WHERE trigger.tgname IN (
         'wouldkeep_tags_write_pause',
         'wouldkeep_document_tags_write_pause'
       )
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'wouldkeep_tag_write_pause_disposable_gate_residue';
  END IF;

  IF (SELECT count(*) FROM pg_catalog.pg_roles
      WHERE rolname IN ('anon', 'authenticated', 'service_role')) <> 3 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'wouldkeep_tag_write_pause_disposable_roles_missing';
  END IF;
END;
$tag_write_pause_disposable_baseline$;

SELECT
  'tag_write_pause_disposable_baseline_passed' AS result,
  19::integer AS ledger_versions,
  17::integer AS postgres_major;
