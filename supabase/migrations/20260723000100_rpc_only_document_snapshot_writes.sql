-- wouldkeep P1C: retire browser multi-table snapshot writes after the atomic RPC.
-- Hard deployment prerequisite: 20260722000200_atomic_document_snapshot_save.sql
-- must already be deployed and verified. This migration changes ACL only; it does
-- not rewrite business data, publication state, receipts, policies, or functions.

DO $rpc_only_preflight$
DECLARE
  save_rpc REGPROCEDURE := to_regprocedure(
    'public.save_document_snapshot_v1(text,uuid,uuid,bigint,jsonb)'
  );
  publish_rpc REGPROCEDURE := to_regprocedure(
    'public.publish_document(uuid,text)'
  );
  unpublish_rpc REGPROCEDURE := to_regprocedure(
    'public.unpublish_document(uuid)'
  );
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
  publish_source TEXT;
  unpublish_source TEXT;
  expected_document_columns TEXT[] := ARRAY[
    'id', 'knowledge_base_id', 'owner_id', 'title', 'summary', 'body',
    'topic', 'maturity', 'status', 'visibility', 'slug', 'deleted_at',
    'created_at', 'updated_at', 'revision', 'published_at',
    'published_revision'
  ]::TEXT[];
BEGIN
  -- The exact 22000200 boundary must exist before any ACL changes occur.
  IF save_rpc IS NULL
    OR receipt_relation IS NULL
    OR to_regnamespace('wouldkeep_private') IS NULL
    OR replace_sources_rpc IS NULL
  THEN
    RAISE EXCEPTION
      '20260722000200 atomic save objects are missing; do not apply 20260723000100 out of order'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_proc procedure
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'save_document_snapshot_v1'
  ) <> 1 THEN
    RAISE EXCEPTION 'save_document_snapshot_v1 overload set changed unexpectedly'
      USING ERRCODE = 'object_not_in_prerequisite_state';
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
    RAISE EXCEPTION 'atomic save RPC ABI or security mode changed unexpectedly'
      USING ERRCODE = 'object_not_in_prerequisite_state';
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
      RAISE EXCEPTION 'atomic save owner/RLS contract failed for required relation %', relation_name
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
  END LOOP;

  -- The explicit service_role GRANT below may only materialize permissions that
  -- are already effective. Fail closed before the first ACL mutation so a drifted
  -- environment cannot use this migration to widen trusted-service access.
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
          privilege_name
          USING ERRCODE = 'object_not_in_prerequisite_state';
      END IF;
    END LOOP;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_namespace namespace
    WHERE namespace.nspname = 'wouldkeep_private'
      AND namespace.nspowner = save_owner
  ) THEN
    RAISE EXCEPTION 'atomic save owner does not own wouldkeep_private'
      USING ERRCODE = 'object_not_in_prerequisite_state';
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
    RAISE EXCEPTION 'atomic save RPC must remain authenticated-only'
      USING ERRCODE = 'object_not_in_prerequisite_state';
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
      RAISE EXCEPTION '% has unexpected private receipt access', application_role
        USING ERRCODE = 'object_not_in_prerequisite_state';
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
    RAISE EXCEPTION 'an API role can execute a private atomic-save helper'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  -- Freeze the document column ABI before granting an exact update allowlist.
  IF (
    SELECT array_agg(attribute.attname::TEXT ORDER BY attribute.attnum)
    FROM pg_catalog.pg_attribute attribute
    WHERE attribute.attrelid = 'public.documents'::REGCLASS
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
  ) IS DISTINCT FROM expected_document_columns THEN
    RAISE EXCEPTION 'documents column ABI changed; review the RPC-only update allowlist'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  -- Unexpected pre-existing column grants could survive a table-level REVOKE.
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
    RAISE EXCEPTION 'unexpected API column-level write grant exists; inspect before retrying'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF NOT has_function_privilege('authenticated', replace_sources_rpc, 'EXECUTE') THEN
    RAISE EXCEPTION 'replace_document_sources authenticated baseline drifted'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  -- SECURITY INVOKER publication RPCs must be the reviewed implementations.
  IF publish_rpc IS NULL OR unpublish_rpc IS NULL OR (
    SELECT count(*)
    FROM pg_catalog.pg_proc procedure
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname IN ('publish_document', 'unpublish_document')
  ) <> 2 THEN
    RAISE EXCEPTION 'publication RPC overload set changed unexpectedly'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  SELECT procedure.prosrc INTO publish_source
  FROM pg_catalog.pg_proc procedure
  WHERE procedure.oid = publish_rpc
    AND NOT procedure.prosecdef
    AND procedure.prorettype = 'jsonb'::REGTYPE
    AND procedure.provolatile = 'v'
    AND procedure.proconfig @> ARRAY['search_path=public']::TEXT[];

  SELECT procedure.prosrc INTO unpublish_source
  FROM pg_catalog.pg_proc procedure
  WHERE procedure.oid = unpublish_rpc
    AND NOT procedure.prosecdef
    AND procedure.prorettype = 'boolean'::REGTYPE
    AND procedure.provolatile = 'v'
    AND procedure.proconfig @> ARRAY['search_path=public']::TEXT[];

  IF publish_source IS NULL
    OR unpublish_source IS NULL
    OR md5(regexp_replace(publish_source, '[[:space:]]+', ' ', 'g')) <>
      'ad486b52a196dc8311fd76d6d42d72c5'
    OR md5(regexp_replace(unpublish_source, '[[:space:]]+', ' ', 'g')) <>
      '9adc92ad6fa93f0611378370a23e650b'
    OR regexp_replace(publish_source, '[[:space:]]+', ' ', 'g') NOT LIKE
      '%UPDATE public.documents SET status = ''published'', visibility = p_audience, published_at = publication.published_at, published_revision = source_document.revision WHERE id = source_document.id AND owner_id = (SELECT auth.uid());%'
    OR regexp_replace(unpublish_source, '[[:space:]]+', ' ', 'g') NOT LIKE
      '%UPDATE public.documents SET status = ''draft'', visibility = ''private'', published_at = NULL, published_revision = NULL WHERE id = p_document_id AND owner_id = (SELECT auth.uid());%'
  THEN
    RAISE EXCEPTION
      'publish/unpublish definitions drifted; only status, visibility, published_at, and published_revision may be written'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
END;
$rpc_only_preflight$;

-- Browser-facing snapshot writes now have one and only one entry point:
-- public.save_document_snapshot_v1. SELECT and hard DELETE on documents remain.
REVOKE INSERT, UPDATE ON TABLE public.documents
  FROM PUBLIC, anon, authenticated;
REVOKE DELETE ON TABLE public.documents FROM PUBLIC, anon;
GRANT SELECT, DELETE ON TABLE public.documents TO authenticated;
GRANT UPDATE (
  deleted_at,
  status,
  visibility,
  published_at,
  published_revision
) ON TABLE public.documents TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.document_versions
  FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.tags
  FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.document_tags
  FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.document_links
  FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.document_sources
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE
  public.document_versions,
  public.tags,
  public.document_tags,
  public.document_links,
  public.document_sources
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.replace_document_sources(UUID, JSONB)
  FROM PUBLIC, anon, authenticated;

-- Make the already-effective trusted-service table privileges direct before the
-- PUBLIC grants disappear. The preflight above prevents this from widening access.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.documents,
  public.document_versions,
  public.tags,
  public.document_tags,
  public.document_links,
  public.document_sources
  TO service_role;

-- Fail the migration transaction if role inheritance or unexpected ACLs defeated
-- any REVOKE. The read-only contract file repeats these checks after deployment.
DO $rpc_only_postcondition$
DECLARE
  relation_name TEXT;
  column_name TEXT;
  allowed_update_columns CONSTANT TEXT[] := ARRAY[
    'deleted_at', 'status', 'visibility', 'published_at', 'published_revision'
  ]::TEXT[];
BEGIN
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
    RAISE EXCEPTION 'documents table-level RPC-only ACL postcondition failed'
      USING ERRCODE = 'insufficient_privilege';
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
      RAISE EXCEPTION 'documents column ACL postcondition failed for %', column_name
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END LOOP;

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
      OR NOT has_table_privilege('service_role', relation_name, 'SELECT')
      OR NOT has_table_privilege('service_role', relation_name, 'INSERT')
      OR NOT has_table_privilege('service_role', relation_name, 'UPDATE')
      OR NOT has_table_privilege('service_role', relation_name, 'DELETE')
    THEN
      RAISE EXCEPTION 'RPC-only child-table ACL postcondition failed for %', relation_name
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END LOOP;

  IF has_function_privilege(
      'authenticated',
      'public.replace_document_sources(uuid,jsonb)'::REGPROCEDURE,
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'authenticated',
      'public.save_document_snapshot_v1(text,uuid,uuid,bigint,jsonb)'::REGPROCEDURE,
      'EXECUTE'
    )
    OR has_function_privilege(
      'anon',
      'public.save_document_snapshot_v1(text,uuid,uuid,bigint,jsonb)'::REGPROCEDURE,
      'EXECUTE'
    )
    OR has_function_privilege(
      'service_role',
      'public.save_document_snapshot_v1(text,uuid,uuid,bigint,jsonb)'::REGPROCEDURE,
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'RPC EXECUTE ACL postcondition failed'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$rpc_only_postcondition$;

COMMENT ON FUNCTION public.save_document_snapshot_v1(TEXT, UUID, UUID, BIGINT, JSONB) IS
  'The sole authenticated browser write boundary for core document snapshots, versions, tags, links, and sources. Publication and document lifecycle operations remain separate.';
