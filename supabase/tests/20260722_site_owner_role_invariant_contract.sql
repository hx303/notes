-- Production-safe, read-only postflight contract for 20260722000100.
-- Compare the returned owner-state fingerprint with the preflight value.

DO $p1a_contract$
DECLARE
  grant_rpc REGPROCEDURE :=
    to_regprocedure('public.grant_role(uuid,text,text)');
  owner_rpc REGPROCEDURE :=
    to_regprocedure('public.is_site_owner(uuid)');
  protected_owner CONSTANT UUID :=
    'b154d7e9-07c9-4412-8673-86239bbbe367'::UUID;
  expected_ledger CONSTANT TEXT[] := ARRAY[
    '20260712', '20260714', '20260715', '20260716', '20260717',
    '20260718000100', '20260718000200', '20260718000300',
    '20260718000400', '20260718000500', '20260718000600',
    '20260718000700', '20260718000800', '20260718000900',
    '20260718001000', '20260718001100', '20260718001200',
    '20260721000100', '20260722000100'
  ]::TEXT[];
  actual_ledger TEXT[];
BEGIN
  IF grant_rpc IS NULL OR owner_rpc IS NULL
    OR to_regclass('auth.users') IS NULL
    OR to_regclass('public.site_owners') IS NULL
    OR to_regclass('public.user_roles') IS NULL
  THEN
    RAISE EXCEPTION 'site-owner prerequisite objects are missing';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_proc procedure
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'grant_role'
  ) <> 1 THEN
    RAISE EXCEPTION 'grant_role overload set changed';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_proc procedure
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'is_site_owner'
  ) <> 1 THEN
    RAISE EXCEPTION 'is_site_owner overload set changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc procedure
    JOIN pg_catalog.pg_language language
      ON language.oid = procedure.prolang
    JOIN pg_catalog.pg_roles owner
      ON owner.oid = procedure.proowner
    WHERE procedure.oid = grant_rpc
      AND procedure.prosecdef
      AND procedure.prorettype = 'text'::REGTYPE
      AND procedure.provolatile = 'v'
      AND procedure.proconfig =
        ARRAY['search_path=pg_catalog, public']::TEXT[]
      AND language.lanname = 'plpgsql'
      AND owner.rolname = 'postgres'
      AND md5(regexp_replace(
        procedure.prosrc, '[[:space:]]+', ' ', 'g'
      )) = '5b2324f851dafa4bcdb99af3b511e933'
      AND procedure.prosrc LIKE
        '%IF public.is_site_owner(target_uid) THEN%'
      AND procedure.prosrc LIKE '%ERRCODE = ''42501''%'
      AND procedure.prosrc LIKE
        '%MESSAGE = ''The site owner role cannot be changed here''%'
  ) THEN
    RAISE EXCEPTION 'hardened grant_role contract mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc procedure
    JOIN pg_catalog.pg_language language
      ON language.oid = procedure.prolang
    JOIN pg_catalog.pg_roles owner
      ON owner.oid = procedure.proowner
    WHERE procedure.oid = owner_rpc
      AND procedure.prosecdef
      AND procedure.prorettype = 'boolean'::REGTYPE
      AND procedure.provolatile = 's'
      AND procedure.proconfig =
        ARRAY['search_path=pg_catalog, public']::TEXT[]
      AND language.lanname = 'sql'
      AND owner.rolname = 'postgres'
      AND md5(regexp_replace(
        procedure.prosrc, '[[:space:]]+', ' ', 'g'
      )) = '8ec91e11707949067560ee1b7a5f4389'
  ) THEN
    RAISE EXCEPTION 'is_site_owner changed during deployment';
  END IF;

  IF NOT has_function_privilege('authenticated', grant_rpc, 'EXECUTE')
    OR NOT has_function_privilege('service_role', grant_rpc, 'EXECUTE')
    OR has_function_privilege('anon', grant_rpc, 'EXECUTE')
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc procedure,
           LATERAL pg_catalog.aclexplode(
             COALESCE(
               procedure.proacl,
               pg_catalog.acldefault('f', procedure.proowner)
             )
           ) acl
      WHERE procedure.oid = grant_rpc
        AND acl.privilege_type = 'EXECUTE'
        AND (
          acl.is_grantable
          OR acl.grantee NOT IN (
            procedure.proowner,
            (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'authenticated'),
            (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'service_role')
          )
        )
    )
  THEN
    RAISE EXCEPTION 'post-deployment grant_role ACL mismatch';
  END IF;

  IF NOT has_function_privilege('authenticated', owner_rpc, 'EXECUTE')
    OR NOT has_function_privilege('service_role', owner_rpc, 'EXECUTE')
    OR NOT has_function_privilege('anon', owner_rpc, 'EXECUTE')
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc procedure,
           LATERAL pg_catalog.aclexplode(
             COALESCE(
               procedure.proacl,
               pg_catalog.acldefault('f', procedure.proowner)
             )
           ) acl
      WHERE procedure.oid = owner_rpc
        AND acl.privilege_type = 'EXECUTE'
        AND (
          acl.is_grantable
          OR acl.grantee NOT IN (
            procedure.proowner,
            (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'anon'),
            (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'authenticated'),
            (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'service_role')
          )
        )
    )
  THEN
    RAISE EXCEPTION 'post-deployment is_site_owner ACL mismatch';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = relation.relnamespace
    JOIN pg_catalog.pg_roles owner
      ON owner.oid = relation.relowner
    WHERE namespace.nspname = 'public'
      AND relation.relname IN ('site_owners', 'user_roles')
      AND relation.relkind = 'r'
      AND relation.relrowsecurity
      AND owner.rolname = 'postgres'
  ) <> 2 THEN
    RAISE EXCEPTION 'site-owner relation owner or RLS contract drifted';
  END IF;

  IF has_table_privilege('anon', 'public.site_owners', 'SELECT')
    OR has_table_privilege('anon', 'public.site_owners', 'INSERT')
    OR has_table_privilege('anon', 'public.site_owners', 'UPDATE')
    OR has_table_privilege('anon', 'public.site_owners', 'DELETE')
    OR has_table_privilege('authenticated', 'public.site_owners', 'SELECT')
    OR has_table_privilege('authenticated', 'public.site_owners', 'INSERT')
    OR has_table_privilege('authenticated', 'public.site_owners', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.site_owners', 'DELETE')
    OR NOT has_table_privilege('service_role', 'public.site_owners', 'SELECT')
    OR NOT has_table_privilege('service_role', 'public.site_owners', 'INSERT')
    OR NOT has_table_privilege('service_role', 'public.site_owners', 'UPDATE')
    OR NOT has_table_privilege('service_role', 'public.site_owners', 'DELETE')
  THEN
    RAISE EXCEPTION 'site_owners table ACL contract drifted';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = 'site_owners'
  ) THEN
    RAISE EXCEPTION 'site_owners unexpectedly exposes an RLS policy';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_policies policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = 'user_roles'
  ) <> 1 OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = 'user_roles'
      AND policy.policyname = 'Users can read own role'
      AND policy.permissive = 'PERMISSIVE'
      AND policy.roles = ARRAY['authenticated']::NAME[]
      AND policy.cmd = 'SELECT'
      AND policy.qual LIKE '%auth.uid()%'
      AND policy.qual LIKE '%user_id%'
      AND policy.qual LIKE '%is_site_owner%'
      AND policy.with_check IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = 'user_roles'
      AND policy.cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ) THEN
    RAISE EXCEPTION 'user_roles owner-read-only policy contract drifted';
  END IF;

  IF (SELECT count(*) FROM public.site_owners) <> 1
    OR NOT EXISTS (
      SELECT 1
      FROM public.site_owners site_owner
      JOIN public.user_roles role
        ON role.user_id = site_owner.user_id
      WHERE site_owner.user_id = protected_owner
        AND role.role = 'admin'
        AND role.granted_by = protected_owner
    )
  THEN
    RAISE EXCEPTION 'protected owner state changed';
  END IF;

  SELECT array_agg(version ORDER BY version)
  INTO actual_ledger
  FROM supabase_migrations.schema_migrations;

  IF actual_ledger IS DISTINCT FROM expected_ledger
    OR (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 19
    OR (
      SELECT count(DISTINCT version)
      FROM supabase_migrations.schema_migrations
    ) <> 19
    OR (
      SELECT count(*)
      FROM supabase_migrations.schema_migrations
      WHERE version = '20260722000100'
        AND name = 'site_owner_role_invariant'
    ) <> 1
  THEN
    RAISE EXCEPTION 'post-deployment migration ledger mismatch';
  END IF;

END;
$p1a_contract$;
