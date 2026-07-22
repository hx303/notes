-- Read-only catalog/ACL contract verification for 20260722000200.

DO $$
DECLARE
  save_rpc REGPROCEDURE :=
    'public.save_document_snapshot_v1(text,uuid,uuid,bigint,jsonb)'::REGPROCEDURE;
  receipt_relation REGCLASS :=
    'wouldkeep_private.document_save_receipts'::REGCLASS;
  function_owner TEXT;
  required_table TEXT;
  required_privileges TEXT;
  application_role TEXT;
  expected_columns TEXT[] := ARRAY[
    'created', 'document_id', 'knowledge_base_id', 'operation_id', 'owner_id',
    'request_hash', 'response', 'result_version', 'resulting_revision', 'saved_at'
  ]::TEXT[];
BEGIN
  IF to_regprocedure('public.grant_role(uuid,text,text)') IS NULL
    OR pg_get_functiondef('public.grant_role(uuid,text,text)'::REGPROCEDURE)
      NOT LIKE '%public.is_site_owner(target_uid)%'
  THEN
    RAISE EXCEPTION
      '20260722000100 site-owner invariant is not present; do not apply 20260722000200 out of order';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_proc procedure
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'save_document_snapshot_v1'
  ) <> 1 THEN
    RAISE EXCEPTION 'save_document_snapshot_v1 overload set changed unexpectedly';
  END IF;

  SELECT role.rolname INTO function_owner
  FROM pg_catalog.pg_proc procedure
  JOIN pg_catalog.pg_roles role ON role.oid = procedure.proowner
  WHERE procedure.oid = save_rpc;

  IF NOT (
    SELECT procedure.prosecdef
      AND procedure.prorettype = 'jsonb'::REGTYPE
      AND procedure.provolatile = 'v'
      AND procedure.proconfig = ARRAY['search_path=pg_catalog, pg_temp']::TEXT[]
    FROM pg_catalog.pg_proc procedure
    WHERE procedure.oid = save_rpc
  ) THEN
    RAISE EXCEPTION 'atomic save RPC security mode, return ABI, volatility, or search_path changed';
  END IF;

  IF NOT has_function_privilege('authenticated', save_rpc, 'EXECUTE')
    OR has_function_privilege('anon', save_rpc, 'EXECUTE')
    OR has_function_privilege('service_role', save_rpc, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'atomic save RPC execute ACL is not authenticated-only';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc procedure,
         LATERAL pg_catalog.aclexplode(
           COALESCE(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
         ) acl
    WHERE procedure.oid = save_rpc
      AND acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'PUBLIC can execute the atomic save RPC';
  END IF;

  FOREACH application_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF has_schema_privilege(application_role, 'wouldkeep_private', 'USAGE')
      OR has_schema_privilege(application_role, 'wouldkeep_private', 'CREATE')
      OR has_table_privilege(application_role, receipt_relation, 'SELECT')
      OR has_table_privilege(application_role, receipt_relation, 'INSERT')
      OR has_table_privilege(application_role, receipt_relation, 'UPDATE')
      OR has_table_privilege(application_role, receipt_relation, 'DELETE')
    THEN
      RAISE EXCEPTION '% has direct private receipt access', application_role;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_namespace namespace,
         LATERAL pg_catalog.aclexplode(
           COALESCE(namespace.nspacl, pg_catalog.acldefault('n', namespace.nspowner))
         ) acl
    WHERE namespace.nspname = 'wouldkeep_private'
      AND acl.grantee = 0
      AND acl.privilege_type IN ('USAGE', 'CREATE')
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class relation,
         LATERAL pg_catalog.aclexplode(
           COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
         ) acl
    WHERE relation.oid = receipt_relation
      AND acl.grantee = 0
      AND acl.privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  ) THEN
    RAISE EXCEPTION 'PUBLIC has direct private receipt access';
  END IF;

  IF NOT (
    SELECT relation.relrowsecurity
      AND NOT relation.relforcerowsecurity
      AND relation.relowner = (
        SELECT procedure.proowner FROM pg_catalog.pg_proc procedure WHERE procedure.oid = save_rpc
      )
      AND relation.relowner NOT IN (
        SELECT role.oid FROM pg_catalog.pg_roles role
        WHERE role.rolname IN ('anon', 'authenticated', 'service_role')
      )
    FROM pg_catalog.pg_class relation
    WHERE relation.oid = receipt_relation
  ) THEN
    RAISE EXCEPTION 'receipt RLS or shared non-API owner contract changed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies policy
    WHERE policy.schemaname = 'wouldkeep_private'
      AND policy.tablename = 'document_save_receipts'
  ) THEN
    RAISE EXCEPTION 'receipt table must remain policy-free and fail closed for non-bypass roles';
  END IF;

  IF (
    SELECT array_agg(catalog_column.column_name::TEXT ORDER BY catalog_column.column_name)
    FROM information_schema.columns catalog_column
    WHERE catalog_column.table_schema = 'wouldkeep_private'
      AND catalog_column.table_name = 'document_save_receipts'
  ) IS DISTINCT FROM (
    SELECT array_agg(name ORDER BY name) FROM unnest(expected_columns) name
  ) THEN
    RAISE EXCEPTION 'receipt column ABI changed or gained a content-bearing column';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_trigger trigger
    WHERE trigger.tgrelid = receipt_relation
      AND trigger.tgname = 'document_save_receipts_require_valid_owner_document'
      AND trigger.tgenabled = 'O'
      AND NOT trigger.tgisinternal
      AND trigger.tgtype = 7
      AND pg_catalog.pg_get_triggerdef(trigger.oid) LIKE
        '%BEFORE INSERT ON wouldkeep_private.document_save_receipts%'
  ) <> 1 THEN
    RAISE EXCEPTION 'insert-only receipt owner-document trigger is missing, disabled, or changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint catalog_constraint
    WHERE catalog_constraint.conrelid = receipt_relation
      AND catalog_constraint.conname = 'document_save_receipts_response_exact_keys'
      AND pg_catalog.pg_get_constraintdef(catalog_constraint.oid) LIKE '%operation_id%'
      AND pg_catalog.pg_get_constraintdef(catalog_constraint.oid) LIKE '%saved_at%'
  ) THEN
    RAISE EXCEPTION 'exact saved-response constraint is missing or changed';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_constraint catalog_constraint
    WHERE catalog_constraint.conrelid = receipt_relation
      AND catalog_constraint.contype = 'f'
  ) <> 2
    OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint catalog_constraint
      WHERE catalog_constraint.conrelid = receipt_relation
        AND catalog_constraint.contype = 'f'
        AND catalog_constraint.confrelid = 'auth.users'::REGCLASS
        AND catalog_constraint.confdeltype = 'c'
        AND catalog_constraint.conkey = ARRAY[
          (
            SELECT attribute.attnum
            FROM pg_catalog.pg_attribute attribute
            WHERE attribute.attrelid = receipt_relation
              AND attribute.attname = 'owner_id'
          )::SMALLINT
        ]
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint catalog_constraint
      WHERE catalog_constraint.conrelid = receipt_relation
        AND catalog_constraint.contype = 'f'
        AND catalog_constraint.confrelid = 'public.knowledge_bases'::REGCLASS
        AND catalog_constraint.confdeltype = 'c'
        AND catalog_constraint.conkey = ARRAY[
          (
            SELECT attribute.attnum
            FROM pg_catalog.pg_attribute attribute
            WHERE attribute.attrelid = receipt_relation
              AND attribute.attname = 'knowledge_base_id'
          )::SMALLINT
        ]
    )
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint catalog_constraint
      WHERE catalog_constraint.conrelid = receipt_relation
        AND catalog_constraint.contype = 'f'
        AND catalog_constraint.conkey = ARRAY[
          (
            SELECT attribute.attnum
            FROM pg_catalog.pg_attribute attribute
            WHERE attribute.attrelid = receipt_relation
              AND attribute.attname = 'document_id'
          )::SMALLINT
        ]
    )
  THEN
    RAISE EXCEPTION
      'receipt lifecycle FKs changed: owner/knowledge-base must cascade and document_id must remain historical';
  END IF;

  IF COALESCE(current_setting('pgrst.db_schemas', TRUE), '')
      ~* '(^|[, =])wouldkeep_private([, ]|$)'
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_roles role,
           LATERAL unnest(COALESCE(role.rolconfig, ARRAY[]::TEXT[])) config(value)
      WHERE config.value ~* '^pgrst\.db_schemas='
        AND config.value ~* '(^|[, =])wouldkeep_private([, ]|$)'
    )
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_db_role_setting setting,
           LATERAL unnest(COALESCE(setting.setconfig, ARRAY[]::TEXT[])) config(value)
      WHERE config.value ~* '^pgrst\.db_schemas='
        AND config.value ~* '(^|[, =])wouldkeep_private([, ]|$)'
    )
  THEN
    RAISE EXCEPTION 'wouldkeep_private appears in a PostgREST exposed-schema setting';
  END IF;

  FOR required_table, required_privileges IN
    SELECT * FROM (VALUES
      ('public.knowledge_bases', 'SELECT'),
      ('public.documents', 'SELECT,INSERT,UPDATE'),
      ('public.document_versions', 'INSERT'),
      ('public.tags', 'SELECT,INSERT,UPDATE'),
      ('public.document_tags', 'INSERT,DELETE'),
      ('public.document_links', 'SELECT,INSERT,DELETE'),
      ('public.document_sources', 'INSERT,DELETE'),
      ('wouldkeep_private.document_save_receipts', 'SELECT,INSERT')
    ) AS required(table_name, privileges)
  LOOP
    IF NOT has_table_privilege(function_owner, required_table, required_privileges) THEN
      RAISE EXCEPTION
        'atomic save function owner % lacks % on %',
        function_owner, required_privileges, required_table;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc procedure
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace,
         LATERAL pg_catalog.aclexplode(
           COALESCE(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
         ) acl
    WHERE namespace.nspname = 'wouldkeep_private'
      AND acl.grantee IN (
        0,
        (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'anon'),
        (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'authenticated'),
        (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'service_role')
      )
      AND acl.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'an API role can execute a private atomic-save helper directly';
  END IF;
END;
$$;
