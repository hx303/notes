-- Read-only production-safe verification for 20260718001200.

DO $$
DECLARE
  write_rpc REGPROCEDURE;
  read_rpc REGPROCEDURE;
  trigger_rpc REGPROCEDURE;
  required_role NAME;
BEGIN
  IF (
    SELECT COUNT(*)
    FROM pg_catalog.pg_proc procedure
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname IN (
        'publish_document', 'unpublish_document', 'moderate_publication'
      )
  ) <> 3 THEN
    RAISE EXCEPTION 'publication write RPC overload set changed unexpectedly';
  END IF;

  FOREACH write_rpc IN ARRAY ARRAY[
    'public.publish_document(uuid,text)'::REGPROCEDURE,
    'public.unpublish_document(uuid)'::REGPROCEDURE,
    'public.moderate_publication(uuid,text)'::REGPROCEDURE
  ]
  LOOP
    IF has_function_privilege('anon', write_rpc, 'EXECUTE') THEN
      RAISE EXCEPTION 'anon retains EXECUTE on %', write_rpc;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc procedure,
           LATERAL pg_catalog.aclexplode(
             COALESCE(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
           ) acl
      WHERE procedure.oid = write_rpc
        AND acl.grantee IN (0, (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'anon'))
        AND acl.privilege_type = 'EXECUTE'
    ) THEN
      RAISE EXCEPTION 'PUBLIC or anon retains a direct EXECUTE grant on %', write_rpc;
    END IF;

    FOREACH required_role IN ARRAY ARRAY['authenticated'::NAME, 'service_role'::NAME]
    LOOP
      IF NOT has_function_privilege(required_role, write_rpc, 'EXECUTE') OR NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc procedure,
             LATERAL pg_catalog.aclexplode(
               COALESCE(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
             ) acl
        WHERE procedure.oid = write_rpc
          AND acl.grantee = (
            SELECT oid FROM pg_catalog.pg_roles WHERE rolname = required_role
          )
          AND acl.privilege_type = 'EXECUTE'
      ) THEN
        RAISE EXCEPTION '% lacks the required direct EXECUTE grant on %',
          required_role, write_rpc;
      END IF;
    END LOOP;
  END LOOP;

  IF (
    SELECT COUNT(*)
    FROM pg_catalog.pg_proc procedure
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname IN ('read_published_document', 'list_public_documents')
  ) <> 2 THEN
    RAISE EXCEPTION 'publication reader RPC overload set changed unexpectedly';
  END IF;

  FOREACH read_rpc IN ARRAY ARRAY[
    'public.read_published_document(uuid,uuid)'::REGPROCEDURE,
    'public.list_public_documents(integer,integer)'::REGPROCEDURE
  ]
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc procedure,
           LATERAL pg_catalog.aclexplode(
             COALESCE(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
           ) acl
      WHERE procedure.oid = read_rpc
        AND acl.grantee = 0
        AND acl.privilege_type = 'EXECUTE'
    ) THEN
      RAISE EXCEPTION 'PUBLIC unexpectedly has EXECUTE on reader %', read_rpc;
    END IF;

    FOREACH required_role IN ARRAY ARRAY['anon'::NAME, 'authenticated'::NAME]
    LOOP
      IF NOT has_function_privilege(required_role, read_rpc, 'EXECUTE') OR NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc procedure,
             LATERAL pg_catalog.aclexplode(
               COALESCE(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
             ) acl
        WHERE procedure.oid = read_rpc
          AND acl.grantee = (
            SELECT oid FROM pg_catalog.pg_roles WHERE rolname = required_role
          )
          AND acl.privilege_type = 'EXECUTE'
      ) THEN
        RAISE EXCEPTION '% lost the direct reader EXECUTE grant on %',
          required_role, read_rpc;
      END IF;
    END LOOP;
  END LOOP;

  IF (
    SELECT COUNT(*)
    FROM pg_catalog.pg_proc procedure
    WHERE (
      procedure.oid = 'public.publish_document(uuid,text)'::REGPROCEDURE
      AND procedure.prorettype = 'jsonb'::REGTYPE
      AND NOT procedure.prosecdef
      AND procedure.provolatile = 'v'
      AND procedure.pronargdefaults = 0
      AND procedure.proargnames = ARRAY['p_document_id', 'p_audience']::TEXT[]
      AND procedure.proconfig @> ARRAY['search_path=public']::TEXT[]
    ) OR (
      procedure.oid = 'public.unpublish_document(uuid)'::REGPROCEDURE
      AND procedure.prorettype = 'boolean'::REGTYPE
      AND NOT procedure.prosecdef
      AND procedure.provolatile = 'v'
      AND procedure.pronargdefaults = 0
      AND procedure.proargnames = ARRAY['p_document_id']::TEXT[]
      AND procedure.proconfig @> ARRAY['search_path=public']::TEXT[]
    ) OR (
      procedure.oid = 'public.moderate_publication(uuid,text)'::REGPROCEDURE
      AND procedure.prorettype = 'boolean'::REGTYPE
      AND procedure.prosecdef
      AND procedure.provolatile = 'v'
      AND procedure.pronargdefaults = 1
      AND pg_catalog.pg_get_expr(procedure.proargdefaults, 0) = $default$''::text$default$
      AND procedure.proargnames = ARRAY['p_document_id', 'p_reason']::TEXT[]
      AND procedure.proconfig @> ARRAY['search_path=pg_catalog, pg_temp']::TEXT[]
    )
  ) <> 3 THEN
    RAISE EXCEPTION 'publication write RPC ABI or security mode changed unexpectedly';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM pg_catalog.pg_proc procedure
    WHERE (
      procedure.oid = 'public.read_published_document(uuid,uuid)'::REGPROCEDURE
      AND procedure.prorettype = 'jsonb'::REGTYPE
      AND procedure.prosecdef
      AND procedure.provolatile = 's'
      AND procedure.pronargdefaults = 2
      AND pg_catalog.pg_get_expr(procedure.proargdefaults, 0) = 'NULL::uuid, NULL::uuid'
      AND procedure.proargnames = ARRAY['p_document_id', 'p_share_token']::TEXT[]
      AND procedure.proconfig @> ARRAY['search_path=pg_catalog, pg_temp']::TEXT[]
    ) OR (
      procedure.oid = 'public.list_public_documents(integer,integer)'::REGPROCEDURE
      AND procedure.prorettype = 'jsonb'::REGTYPE
      AND procedure.prosecdef
      AND procedure.provolatile = 's'
      AND procedure.pronargdefaults = 2
      AND pg_catalog.pg_get_expr(procedure.proargdefaults, 0) = '24, 0'
      AND procedure.proargnames = ARRAY['p_limit', 'p_offset']::TEXT[]
      AND procedure.proconfig @> ARRAY['search_path=pg_catalog, pg_temp']::TEXT[]
    )
  ) <> 2 THEN
    RAISE EXCEPTION 'publication reader RPC ABI or security mode changed unexpectedly';
  END IF;

  IF NOT (
    SELECT relrowsecurity
    FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'document_publications'
  ) THEN
    RAISE EXCEPTION 'document_publications RLS is disabled';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM pg_catalog.pg_policies policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = 'document_publications'
      AND policy.roles = ARRAY['authenticated']::NAME[]
      AND (
        (policy.policyname = 'Owners can read own publications'
          AND policy.cmd = 'SELECT'
          AND policy.qual LIKE '%deleted_at IS NULL%')
        OR (policy.policyname = 'Owners can create own publications'
          AND policy.cmd = 'INSERT'
          AND policy.with_check LIKE '%deleted_at IS NULL%')
        OR (policy.policyname = 'Owners can update own publications'
          AND policy.cmd = 'UPDATE'
          AND policy.qual LIKE '%deleted_at IS NULL%'
          AND policy.with_check LIKE '%deleted_at IS NULL%')
        OR (policy.policyname = 'Owners can delete own publications'
          AND policy.cmd = 'DELETE')
      )
  ) <> 4 THEN
    RAISE EXCEPTION 'publication owner RLS policy set changed unexpectedly';
  END IF;

  IF (
    SELECT COUNT(*) <> 4 OR md5(string_agg(
      policy.policyname || chr(31) || policy.permissive || chr(31)
        || array_to_string(policy.roles, ',') || chr(31) || policy.cmd || chr(31)
        || COALESCE(policy.qual, '<null>') || chr(31)
        || COALESCE(policy.with_check, '<null>'),
      chr(30) ORDER BY policy.policyname
    )) <> '34ff34f94156bd86101f813721c31116'
    FROM pg_catalog.pg_policies policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = 'document_publications'
  ) THEN
    RAISE EXCEPTION 'publication owner RLS policy fingerprint changed unexpectedly';
  END IF;

  IF has_table_privilege('anon', 'public.document_publications', 'SELECT')
    OR has_table_privilege('anon', 'public.document_publications', 'INSERT')
    OR has_table_privilege('anon', 'public.document_publications', 'UPDATE')
    OR has_table_privilege('anon', 'public.document_publications', 'DELETE') THEN
    RAISE EXCEPTION 'anon unexpectedly has direct publication table access';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM pg_catalog.pg_trigger trigger
    JOIN pg_catalog.pg_class relation ON relation.oid = trigger.tgrelid
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND NOT trigger.tgisinternal
      AND trigger.tgenabled = 'O'
      AND (
        (relation.relname = 'documents'
          AND trigger.tgname = 'documents_revoke_publication_on_soft_delete')
        OR (relation.relname = 'document_publications'
          AND trigger.tgname = 'document_publications_require_live_source')
      )
  ) <> 2 THEN
    RAISE EXCEPTION 'publication safety triggers changed unexpectedly';
  END IF;

  FOREACH trigger_rpc IN ARRAY ARRAY[
    'public.revoke_publication_on_document_soft_delete()'::REGPROCEDURE,
    'public.require_live_source_for_document_publication()'::REGPROCEDURE
  ]
  LOOP
    IF NOT (
      SELECT procedure.prosecdef
        AND procedure.proconfig @> ARRAY['search_path=pg_catalog, pg_temp']::TEXT[]
      FROM pg_catalog.pg_proc procedure
      WHERE procedure.oid = trigger_rpc
    ) OR has_function_privilege('anon', trigger_rpc, 'EXECUTE')
      OR has_function_privilege('authenticated', trigger_rpc, 'EXECUTE')
      OR EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc procedure,
             LATERAL pg_catalog.aclexplode(
               COALESCE(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
             ) acl
        WHERE procedure.oid = trigger_rpc
          AND acl.grantee = 0
          AND acl.privilege_type = 'EXECUTE'
      ) THEN
      RAISE EXCEPTION 'publication trigger function security changed for %', trigger_rpc;
    END IF;
  END LOOP;
END;
$$;
