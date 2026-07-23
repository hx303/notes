-- Production-safe, read-only preflight for 20260723000100.
-- Run only after backup, a zero-pending linked ledger check, and confirmation that
-- 20260722000200 is deployed. This script performs no DDL or business-data writes.

DO $rpc_only_production_preflight$
DECLARE
  save_rpc REGPROCEDURE := to_regprocedure(
    'public.save_document_snapshot_v1(text,uuid,uuid,bigint,jsonb)'
  );
  publish_rpc REGPROCEDURE := to_regprocedure('public.publish_document(uuid,text)');
  unpublish_rpc REGPROCEDURE := to_regprocedure('public.unpublish_document(uuid)');
  replace_sources_rpc REGPROCEDURE := to_regprocedure(
    'public.replace_document_sources(uuid,jsonb)'
  );
  receipt_relation REGCLASS := to_regclass(
    'wouldkeep_private.document_save_receipts'
  );
  save_owner OID;
  relation_name TEXT;
  privilege_name TEXT;
  application_role TEXT;
  expected_document_columns TEXT[] := ARRAY[
    'id', 'knowledge_base_id', 'owner_id', 'title', 'summary', 'body',
    'topic', 'maturity', 'status', 'visibility', 'slug', 'deleted_at',
    'created_at', 'updated_at', 'revision', 'published_at',
    'published_revision'
  ]::TEXT[];
BEGIN
  IF save_rpc IS NULL
    OR receipt_relation IS NULL
    OR to_regnamespace('wouldkeep_private') IS NULL
  THEN
    RAISE EXCEPTION
      '20260722000200 atomic save objects are missing; do not deploy 20260723000100 out of order';
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

  SELECT procedure.proowner INTO save_owner
  FROM pg_catalog.pg_proc procedure
  WHERE procedure.oid = save_rpc;

  IF save_owner IS NULL OR NOT (
    SELECT procedure.prosecdef
      AND procedure.prorettype = 'jsonb'::REGTYPE
      AND procedure.provolatile = 'v'
      AND procedure.proconfig = ARRAY['search_path=pg_catalog, pg_temp']::TEXT[]
    FROM pg_catalog.pg_proc procedure
    WHERE procedure.oid = save_rpc
  ) THEN
    RAISE EXCEPTION 'atomic save RPC ABI or security mode changed unexpectedly';
  END IF;

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
    IF to_regclass(relation_name) IS NULL OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class relation
      WHERE relation.oid = to_regclass(relation_name)
        AND relation.relowner = save_owner
        AND relation.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'atomic save owner/RLS contract failed for required relation %', relation_name;
    END IF;
  END LOOP;

  -- Deployment is allowed to make these already-effective trusted-service
  -- permissions direct, but it must never create a capability absent at baseline.
  FOREACH relation_name IN ARRAY ARRAY[
    'public.documents',
    'public.document_versions',
    'public.tags',
    'public.document_tags',
    'public.document_links',
    'public.document_sources'
  ]
  LOOP
    FOREACH privilege_name IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']
    LOOP
      IF NOT has_table_privilege('service_role', relation_name, privilege_name) THEN
        RAISE EXCEPTION
          'service_role effective public-table baseline drifted for % privilege %; explicit GRANT would widen access',
          relation_name,
          privilege_name;
      END IF;
    END LOOP;
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
    RAISE EXCEPTION 'atomic save RPC must remain authenticated-only';
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
      RAISE EXCEPTION '% has unexpected private receipt access', application_role;
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
    RAISE EXCEPTION 'an API role can execute a private atomic-save helper';
  END IF;

  IF (
    SELECT array_agg(attribute.attname::TEXT ORDER BY attribute.attnum)
    FROM pg_catalog.pg_attribute attribute
    WHERE attribute.attrelid = 'public.documents'::REGCLASS
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
  ) IS DISTINCT FROM expected_document_columns THEN
    RAISE EXCEPTION 'documents column ABI changed; review the RPC-only update allowlist';
  END IF;

  IF EXISTS (
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
      AND acl.grantee IN (
        0,
        (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'anon'),
        (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'authenticated')
      )
      AND acl.privilege_type IN ('INSERT', 'UPDATE')
  ) THEN
    RAISE EXCEPTION 'unexpected API column-level write grant exists';
  END IF;

  IF publish_rpc IS NULL OR unpublish_rpc IS NULL OR replace_sources_rpc IS NULL OR (
    SELECT count(*)
    FROM pg_catalog.pg_proc procedure
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname IN ('publish_document', 'unpublish_document')
  ) <> 2 THEN
    RAISE EXCEPTION 'publication/source RPC overload set changed unexpectedly';
  END IF;

  IF NOT (
    SELECT NOT procedure.prosecdef
      AND procedure.prorettype = 'jsonb'::REGTYPE
      AND procedure.provolatile = 'v'
      AND procedure.proconfig @> ARRAY['search_path=public']::TEXT[]
      AND md5(regexp_replace(procedure.prosrc, '[[:space:]]+', ' ', 'g')) =
        'ad486b52a196dc8311fd76d6d42d72c5'
      AND regexp_replace(procedure.prosrc, '[[:space:]]+', ' ', 'g') LIKE
        '%UPDATE public.documents SET status = ''published'', visibility = p_audience, published_at = publication.published_at, published_revision = source_document.revision WHERE id = source_document.id AND owner_id = (SELECT auth.uid());%'
    FROM pg_catalog.pg_proc procedure
    WHERE procedure.oid = publish_rpc
  ) OR NOT (
    SELECT NOT procedure.prosecdef
      AND procedure.prorettype = 'boolean'::REGTYPE
      AND procedure.provolatile = 'v'
      AND procedure.proconfig @> ARRAY['search_path=public']::TEXT[]
      AND md5(regexp_replace(procedure.prosrc, '[[:space:]]+', ' ', 'g')) =
        '9adc92ad6fa93f0611378370a23e650b'
      AND regexp_replace(procedure.prosrc, '[[:space:]]+', ' ', 'g') LIKE
        '%UPDATE public.documents SET status = ''draft'', visibility = ''private'', published_at = NULL, published_revision = NULL WHERE id = p_document_id AND owner_id = (SELECT auth.uid());%'
    FROM pg_catalog.pg_proc procedure
    WHERE procedure.oid = unpublish_rpc
  ) THEN
    RAISE EXCEPTION
      'publish/unpublish drifted beyond the four approved document columns';
  END IF;

  IF NOT has_function_privilege('authenticated', replace_sources_rpc, 'EXECUTE') THEN
    RAISE EXCEPTION 'replace_document_sources authenticated baseline drifted';
  END IF;
END;
$rpc_only_production_preflight$;

SELECT
  (SELECT count(*) FROM public.documents) AS documents_before,
  (SELECT count(*) FROM public.document_versions) AS versions_before,
  (SELECT count(*) FROM public.tags) AS tags_before,
  (SELECT count(*) FROM public.document_tags) AS document_tags_before,
  (SELECT count(*) FROM public.document_links) AS document_links_before,
  (SELECT count(*) FROM public.document_sources) AS document_sources_before,
  (SELECT count(*) FROM public.document_publications) AS publications_before,
  (SELECT count(*) FROM wouldkeep_private.document_save_receipts) AS receipts_before,
  has_table_privilege('authenticated', 'public.documents', 'SELECT') AS auth_select_before,
  has_table_privilege('authenticated', 'public.documents', 'INSERT') AS auth_insert_before,
  has_table_privilege('authenticated', 'public.documents', 'UPDATE') AS auth_update_before,
  has_table_privilege('authenticated', 'public.documents', 'DELETE') AS auth_delete_before,
  'rpc_only_document_snapshot_preflight_passed' AS result;
