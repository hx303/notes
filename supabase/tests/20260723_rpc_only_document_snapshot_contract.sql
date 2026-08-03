-- Production-safe, read-only postflight for 20260723000100.
-- Verifies effective (including inherited), direct PUBLIC, column, RPC, owner,
-- RLS, private-schema, publication, and service-role contracts.

DO $rpc_only_contract$
DECLARE
  save_rpc REGPROCEDURE :=
    'public.save_document_snapshot_v1(text,uuid,uuid,bigint,jsonb)'::REGPROCEDURE;
  replace_sources_rpc REGPROCEDURE :=
    'public.replace_document_sources(uuid,jsonb)'::REGPROCEDURE;
  publish_rpc REGPROCEDURE := 'public.publish_document(uuid,text)'::REGPROCEDURE;
  unpublish_rpc REGPROCEDURE := 'public.unpublish_document(uuid)'::REGPROCEDURE;
  receipt_relation REGCLASS :=
    'wouldkeep_private.document_save_receipts'::REGCLASS;
  save_owner OID;
  relation_name TEXT;
  column_name TEXT;
  application_role TEXT;
  allowed_update_columns CONSTANT TEXT[] := ARRAY[
    'deleted_at', 'status', 'visibility', 'published_at', 'published_revision'
  ]::TEXT[];
BEGIN
  IF (
    SELECT count(*)
    FROM pg_catalog.pg_proc procedure
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'save_document_snapshot_v1'
  ) <> 1 OR NOT (
    SELECT procedure.prosecdef
      AND procedure.prorettype = 'jsonb'::REGTYPE
      AND procedure.provolatile = 'v'
      AND procedure.proconfig = ARRAY['search_path=pg_catalog, pg_temp']::TEXT[]
    FROM pg_catalog.pg_proc procedure
    WHERE procedure.oid = save_rpc
  ) THEN
    RAISE EXCEPTION 'atomic save RPC ABI or security mode changed';
  END IF;

  SELECT procedure.proowner INTO save_owner
  FROM pg_catalog.pg_proc procedure
  WHERE procedure.oid = save_rpc;

  FOREACH relation_name IN ARRAY ARRAY[
    'public.knowledge_bases',
    'public.documents',
    'public.document_versions',
    'public.tags',
    'public.document_tags',
    'public.document_links',
    'public.document_sources',
    'wouldkeep_private.document_save_receipts'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class relation
      WHERE relation.oid = relation_name::REGCLASS
        AND relation.relowner = save_owner
        AND relation.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'atomic save owner/RLS contract failed for %', relation_name;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_namespace namespace
    WHERE namespace.nspname = 'wouldkeep_private'
      AND namespace.nspowner = save_owner
  ) THEN
    RAISE EXCEPTION 'atomic save owner does not own wouldkeep_private';
  END IF;

  IF NOT has_function_privilege('authenticated', save_rpc, 'EXECUTE')
    OR has_function_privilege('anon', save_rpc, 'EXECUTE')
    OR has_function_privilege('service_role', save_rpc, 'EXECUTE')
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc procedure,
           LATERAL pg_catalog.aclexplode(
             COALESCE(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
           ) acl
      WHERE procedure.oid = save_rpc
        AND acl.grantee = 0
        AND acl.privilege_type = 'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'atomic save RPC execute ACL is not authenticated-only';
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
      RAISE EXCEPTION '% has private receipt access', application_role;
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
  ) OR EXISTS (
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
    RAISE EXCEPTION 'private atomic-save objects are exposed to an API role';
  END IF;

  IF has_table_privilege('authenticated', 'public.documents', 'INSERT')
    OR has_table_privilege('authenticated', 'public.documents', 'UPDATE')
    OR NOT has_table_privilege('authenticated', 'public.documents', 'SELECT')
    OR NOT has_table_privilege('authenticated', 'public.documents', 'DELETE')
    OR has_table_privilege('anon', 'public.documents', 'INSERT')
    OR has_table_privilege('anon', 'public.documents', 'UPDATE')
    OR has_table_privilege('anon', 'public.documents', 'DELETE')
    OR NOT has_table_privilege('service_role', 'public.documents', 'SELECT')
    OR NOT has_table_privilege('service_role', 'public.documents', 'INSERT')
    OR NOT has_table_privilege('service_role', 'public.documents', 'UPDATE')
    OR NOT has_table_privilege('service_role', 'public.documents', 'DELETE')
  THEN
    RAISE EXCEPTION 'documents effective table ACL is not RPC-only';
  END IF;

  FOR column_name IN
    SELECT attribute.attname::TEXT
    FROM pg_catalog.pg_attribute attribute
    WHERE attribute.attrelid = 'public.documents'::REGCLASS
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
  LOOP
    IF has_column_privilege('authenticated', 'public.documents', column_name, 'INSERT')
      OR (
        has_column_privilege('authenticated', 'public.documents', column_name, 'UPDATE')
        <> (column_name = ANY(allowed_update_columns))
      )
      OR has_column_privilege('anon', 'public.documents', column_name, 'INSERT')
      OR has_column_privilege('anon', 'public.documents', column_name, 'UPDATE')
    THEN
      RAISE EXCEPTION 'documents effective column ACL mismatch for %', column_name;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class relation,
         LATERAL pg_catalog.aclexplode(
           COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
         ) acl
    WHERE relation.oid IN (
      'public.documents'::REGCLASS,
      'public.document_versions'::REGCLASS,
      'public.tags'::REGCLASS,
      'public.document_tags'::REGCLASS,
      'public.document_links'::REGCLASS,
      'public.document_sources'::REGCLASS
    )
      AND acl.grantee = 0
      AND acl.privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute attribute,
         LATERAL pg_catalog.aclexplode(attribute.attacl) acl
    WHERE attribute.attrelid IN (
      'public.documents'::REGCLASS,
      'public.document_versions'::REGCLASS,
      'public.tags'::REGCLASS,
      'public.document_tags'::REGCLASS,
      'public.document_links'::REGCLASS,
      'public.document_sources'::REGCLASS
    )
      AND acl.grantee = 0
      AND acl.privilege_type IN ('INSERT', 'UPDATE')
  ) THEN
    RAISE EXCEPTION 'PUBLIC retains a direct snapshot-write grant';
  END IF;

  FOREACH relation_name IN ARRAY ARRAY[
    'public.document_versions',
    'public.tags',
    'public.document_tags',
    'public.document_links',
    'public.document_sources'
  ]
  LOOP
    IF has_table_privilege('authenticated', relation_name, 'INSERT')
      OR has_table_privilege('authenticated', relation_name, 'UPDATE')
      OR has_table_privilege('authenticated', relation_name, 'DELETE')
      OR has_table_privilege('anon', relation_name, 'INSERT')
      OR has_table_privilege('anon', relation_name, 'UPDATE')
      OR has_table_privilege('anon', relation_name, 'DELETE')
      OR NOT has_table_privilege('authenticated', relation_name, 'SELECT')
      OR NOT has_table_privilege('service_role', relation_name, 'SELECT')
      OR NOT has_table_privilege('service_role', relation_name, 'INSERT')
      OR NOT has_table_privilege('service_role', relation_name, 'UPDATE')
      OR NOT has_table_privilege('service_role', relation_name, 'DELETE')
    THEN
      RAISE EXCEPTION 'child-table ACL mismatch for %', relation_name;
    END IF;
  END LOOP;

  IF has_function_privilege('authenticated', replace_sources_rpc, 'EXECUTE')
    OR has_function_privilege('anon', replace_sources_rpc, 'EXECUTE')
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc procedure,
           LATERAL pg_catalog.aclexplode(
             COALESCE(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
           ) acl
      WHERE procedure.oid = replace_sources_rpc
        AND acl.grantee = 0
        AND acl.privilege_type = 'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'replace_document_sources remains browser-executable';
  END IF;

  IF NOT (
    SELECT NOT procedure.prosecdef
      AND procedure.proconfig @> ARRAY['search_path=public']::TEXT[]
      AND md5(regexp_replace(procedure.prosrc, '[[:space:]]+', ' ', 'g')) =
        'ad486b52a196dc8311fd76d6d42d72c5'
    FROM pg_catalog.pg_proc procedure
    WHERE procedure.oid = publish_rpc
  ) OR NOT (
    SELECT NOT procedure.prosecdef
      AND procedure.proconfig @> ARRAY['search_path=public']::TEXT[]
      AND md5(regexp_replace(procedure.prosrc, '[[:space:]]+', ' ', 'g')) =
        '9adc92ad6fa93f0611378370a23e650b'
    FROM pg_catalog.pg_proc procedure
    WHERE procedure.oid = unpublish_rpc
  ) OR NOT has_function_privilege('authenticated', publish_rpc, 'EXECUTE')
    OR NOT has_function_privilege('authenticated', unpublish_rpc, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'publication RPC behavior or authenticated execution changed';
  END IF;

  PERFORM pg_catalog.set_config('search_path', 'public, pg_catalog', true);

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_policies policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = 'documents'
  ) <> 4 OR (
    SELECT md5(string_agg(
      policy.policyname || chr(31) ||
      policy.permissive || chr(31) ||
      array_to_string(policy.roles, ',') || chr(31) ||
      policy.cmd || chr(31) ||
      COALESCE(policy.qual, '<null>') || chr(31) ||
      COALESCE(policy.with_check, '<null>'),
      chr(30) ORDER BY policy.policyname
    ))
    FROM pg_catalog.pg_policies policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = 'documents'
  ) IS DISTINCT FROM 'd2447c03b8963da71b4b0f6a3f3c43c4' OR (
    SELECT bool_and(
      policy.permissive = 'PERMISSIVE'
      AND policy.roles = ARRAY['public']::NAME[]
      AND CASE policy.policyname
        WHEN 'Owners can read own documents' THEN
          policy.cmd = 'SELECT'
          AND policy.qual = '(auth.uid() = owner_id)'
          AND policy.with_check IS NULL
        WHEN 'Owners can create own documents' THEN
          policy.cmd = 'INSERT'
          AND policy.qual IS NULL
          AND policy.with_check IS NOT NULL
          AND regexp_replace(policy.with_check, '[[:space:]]+', '', 'g') LIKE
            '%auth.uid()=owner_id%'
          AND regexp_replace(policy.with_check, '[[:space:]]+', '', 'g') LIKE
            '%kb.id=documents.knowledge_base_id%'
          AND regexp_replace(policy.with_check, '[[:space:]]+', '', 'g') LIKE
            '%kb.owner_id=auth.uid()%'
          AND policy.with_check !~* '(^|[^[:alnum:]_])OR([^[:alnum:]_]|$)'
        WHEN 'Owners can update own documents' THEN
          policy.cmd = 'UPDATE'
          AND policy.qual = '(auth.uid() = owner_id)'
          AND policy.with_check IS NOT NULL
          AND regexp_replace(policy.with_check, '[[:space:]]+', '', 'g') LIKE
            '%auth.uid()=owner_id%'
          AND regexp_replace(policy.with_check, '[[:space:]]+', '', 'g') LIKE
            '%kb.id=documents.knowledge_base_id%'
          AND regexp_replace(policy.with_check, '[[:space:]]+', '', 'g') LIKE
            '%kb.owner_id=auth.uid()%'
          AND policy.with_check !~* '(^|[^[:alnum:]_])OR([^[:alnum:]_]|$)'
        WHEN 'Owners can delete own documents' THEN
          policy.cmd = 'DELETE'
          AND policy.qual = '(auth.uid() = owner_id)'
          AND policy.with_check IS NULL
        ELSE false
      END
    )
    FROM pg_catalog.pg_policies policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = 'documents'
  ) IS DISTINCT FROM true OR NOT (
    SELECT relation.relrowsecurity
    FROM pg_catalog.pg_class relation
    WHERE relation.oid = 'public.documents'::REGCLASS
  ) THEN
    RAISE EXCEPTION 'documents owner RLS policy set or expressions drifted';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_trigger trigger
    WHERE trigger.tgrelid = 'public.documents'::REGCLASS
      AND trigger.tgname = 'documents_revoke_publication_on_soft_delete'
      AND trigger.tgenabled = 'O'
      AND NOT trigger.tgisinternal
  ) <> 1 THEN
    RAISE EXCEPTION 'soft-delete publication revocation trigger is missing';
  END IF;
END;
$rpc_only_contract$;

SELECT
  (SELECT count(*) FROM public.documents) AS documents_after,
  (SELECT count(*) FROM public.document_versions) AS versions_after,
  (SELECT count(*) FROM public.tags) AS tags_after,
  (SELECT count(*) FROM public.document_tags) AS document_tags_after,
  (SELECT count(*) FROM public.document_links) AS document_links_after,
  (SELECT count(*) FROM public.document_sources) AS document_sources_after,
  (SELECT count(*) FROM public.document_publications) AS publications_after,
  (SELECT count(*) FROM wouldkeep_private.document_save_receipts) AS receipts_after,
  'rpc_only_document_snapshot_contract_passed' AS result;
