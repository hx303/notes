-- Read-only attestation for the sealed, single-container PG17 matrix target.

\set ON_ERROR_STOP on
\if :{?wouldkeep_p1b_tag_write_pause_sealed}
\else
\set wouldkeep_p1b_tag_write_pause_sealed false
\endif
\if :wouldkeep_p1b_tag_write_pause_sealed
\else
\echo 'Refusing to run: exact sealed-environment confirmation is required.'
DO $sealed_confirmation_required$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'wouldkeep_tag_write_pause_sealed_confirmation_required';
END;
$sealed_confirmation_required$;
\endif

SELECT pg_catalog.set_config(
  'wouldkeep.sealed_expected_database',
  :'sealed_database_name',
  false
);
SELECT pg_catalog.set_config(
  'wouldkeep.sealed_expected_system_identifier',
  :'sealed_system_identifier',
  false
);

DO $tag_write_pause_sealed_attestation$
DECLARE
  actual_versions text[];
  actual_public_tables text[];
  expected_versions constant text[] := ARRAY[
    '20260712', '20260714', '20260715', '20260716', '20260717',
    '20260718000100', '20260718000200', '20260718000300',
    '20260718000400', '20260718000500', '20260718000600',
    '20260718000700', '20260718000800', '20260718000900',
    '20260718001000', '20260718001100', '20260718001200',
    '20260721000100', '20260722000100'
  ]::text[];
  expected_public_tables constant text[] := ARRAY[
    'ai_preferences', 'ai_runs', 'ai_runtime_config', 'ai_suggestions',
    'comments', 'document_chunks', 'document_links', 'document_publications',
    'document_sources', 'document_tags', 'document_versions', 'documents',
    'edit_logs', 'knowledge_bases', 'moderation_actions', 'profiles',
    'site_owners', 'tags', 'user_roles'
  ]::text[];
  expected_database text := pg_catalog.current_setting(
    'wouldkeep.sealed_expected_database'
  );
  expected_system_identifier text := pg_catalog.current_setting(
    'wouldkeep.sealed_expected_system_identifier'
  );
  relation_record record;
  relation_rows bigint;
  expected_rows bigint;
  operator_oid oid := (
    SELECT role.oid FROM pg_catalog.pg_roles role WHERE role.rolname = current_user
  );
  server_address inet := pg_catalog.inet_server_addr();
  client_address inet := pg_catalog.inet_client_addr();
BEGIN
  IF expected_database !~ '^wouldkeep_p1b_tag_write_pause_[a-f0-9]{16}$'
     OR current_database() IS DISTINCT FROM expected_database
     OR expected_system_identifier !~ '^[0-9]+$'
     OR (SELECT control.system_identifier::text FROM pg_catalog.pg_control_system() control)
       IS DISTINCT FROM expected_system_identifier THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'wouldkeep_tag_write_pause_sealed_database_identity_failed';
  END IF;

  IF current_setting('server_version_num')::integer < 170000
     OR current_setting('server_version_num')::integer >= 180000
     OR server_address IS NULL
     OR client_address IS NULL
     OR NOT (
       server_address <<= '127.0.0.0/8'::inet
       OR server_address = '::1'::inet
     )
     OR NOT (
       client_address <<= '127.0.0.0/8'::inet
       OR client_address = '::1'::inet
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'wouldkeep_tag_write_pause_sealed_pg17_loopback_failed';
  END IF;

  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'wouldkeep_tag_write_pause_sealed_ledger_missing';
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
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'wouldkeep_tag_write_pause_sealed_exact_00100_ledger_failed';
  END IF;

  IF to_regclass('public.tags') IS NULL
     OR to_regclass('public.document_tags') IS NULL
     OR (SELECT relowner FROM pg_catalog.pg_class WHERE oid = 'public.tags'::regclass)
       <> operator_oid
     OR (SELECT relowner FROM pg_catalog.pg_class WHERE oid = 'public.document_tags'::regclass)
       <> operator_oid
     OR (SELECT count(*) FROM pg_catalog.pg_roles
         WHERE rolname IN ('anon', 'authenticated', 'service_role')) <> 3 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'wouldkeep_tag_write_pause_sealed_target_contract_failed';
  END IF;

  IF EXISTS (
       SELECT 1 FROM pg_catalog.pg_subscription
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_stat_activity activity
       WHERE activity.datname = current_database()
         AND activity.pid <> pg_backend_pid()
         AND activity.backend_type = 'client backend'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'wouldkeep_tag_write_pause_sealed_external_activity_failed';
  END IF;

  IF EXISTS (
       SELECT 1 FROM pg_catalog.pg_authid role
       WHERE role.rolcanlogin AND role.rolpassword IS NOT NULL
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_db_role_setting setting
       CROSS JOIN LATERAL pg_catalog.unnest(setting.setconfig) value
       WHERE pg_catalog.split_part(value, '=', 1) ~* '(jwt|secret|password|token)'
     )
     OR current_setting('ssl') <> 'off'
     OR current_setting('shared_preload_libraries') <> ''
     OR current_setting('hba_file') <> '/opt/wouldkeep-db/pg_hba.conf' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'wouldkeep_tag_write_pause_sealed_secret_or_config_failed';
  END IF;

  IF (SELECT count(*) FROM auth.users) <> 1
     OR NOT EXISTS (
       SELECT 1 FROM auth.users
       WHERE id = 'b154d7e9-07c9-4412-8673-86239bbbe367'::uuid
         AND email = '2149665127@qq.com'
     )
     OR (SELECT count(*) FROM storage.buckets) <> 1
     OR NOT EXISTS (
       SELECT 1 FROM storage.buckets
       WHERE id = 'avatars' AND name = 'avatars'
     )
     OR (SELECT count(*) FROM storage.objects) <> 0
     OR (SELECT count(*) FROM public.ai_runtime_config
         WHERE singleton AND NOT live_enabled) <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'wouldkeep_tag_write_pause_sealed_synthetic_baseline_failed';
  END IF;

  SELECT array_agg(class.relname::text ORDER BY class.relname::text)
  INTO actual_public_tables
  FROM pg_catalog.pg_class class
  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = class.relnamespace
  WHERE namespace.nspname = 'public'
    AND class.relkind IN ('r', 'p');

  IF actual_public_tables IS DISTINCT FROM expected_public_tables THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'wouldkeep_tag_write_pause_sealed_public_table_set_failed';
  END IF;

  FOR relation_record IN
    SELECT class.oid, class.relname
    FROM pg_catalog.pg_class class
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = class.relnamespace
    WHERE namespace.nspname = 'public'
      AND class.relkind IN ('r', 'p')
    ORDER BY class.relname
  LOOP
    EXECUTE pg_catalog.format('SELECT count(*) FROM %s', relation_record.oid::regclass)
      INTO relation_rows;
    expected_rows := CASE
      WHEN relation_record.relname IN (
        'ai_runtime_config', 'profiles', 'site_owners', 'user_roles'
      ) THEN 1
      ELSE 0
    END;
    IF relation_rows <> expected_rows THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'wouldkeep_tag_write_pause_sealed_public_row_count_failed',
        DETAIL = pg_catalog.format(
          'relation=%I rows=%s expected=%s',
          relation_record.relname,
          relation_rows,
          expected_rows
        );
    END IF;
  END LOOP;

  IF NOT EXISTS (
       SELECT 1 FROM public.site_owners
       WHERE user_id = 'b154d7e9-07c9-4412-8673-86239bbbe367'::uuid
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.user_roles
       WHERE user_id = 'b154d7e9-07c9-4412-8673-86239bbbe367'::uuid
         AND role = 'admin'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles
       WHERE id = 'b154d7e9-07c9-4412-8673-86239bbbe367'::uuid
         AND display_name = 'Sealed synthetic site owner'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'wouldkeep_tag_write_pause_sealed_owner_fixture_failed';
  END IF;
END;
$tag_write_pause_sealed_attestation$;

SELECT
  'tag_write_pause_sealed_attestation_passed' AS result,
  17::integer AS postgres_major,
  19::integer AS ledger_versions,
  1::integer AS synthetic_users,
  0::integer AS knowledge_rows;
