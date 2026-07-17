-- P1 publication soft-delete verification. Run as postgres after migration 20260718001100.
-- Disposable local/non-production only: the script transactionally disables one trigger
-- to simulate privileged drift. All fixture, grant, trigger-state, and assertion writes roll back.

BEGIN;

-- Local CLI replay does not inherit the Dashboard project's broad public-schema
-- defaults. These rollback-only grants let the test exercise the real RLS policies.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_bases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT SELECT ON public.document_tags, public.tags, public.document_sources TO authenticated;

CREATE TEMP TABLE publication_guard_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE publication_guard_results (
  test_name TEXT PRIMARY KEY,
  passed BOOLEAN NOT NULL,
  detail TEXT NOT NULL
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE ON publication_guard_state TO authenticated, anon;
GRANT SELECT, INSERT ON publication_guard_results TO authenticated, anon;

INSERT INTO publication_guard_state (key, value)
SELECT 'owner_id', id::TEXT FROM public.profiles ORDER BY created_at LIMIT 1;

INSERT INTO publication_guard_state (key, value)
SELECT 'other_id', id::TEXT
FROM public.profiles
WHERE id <> (SELECT value::UUID FROM publication_guard_state WHERE key = 'owner_id')
ORDER BY created_at
LIMIT 1;

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM publication_guard_state WHERE key IN ('owner_id', 'other_id')) <> 2 THEN
    RAISE EXCEPTION 'publication guard verification requires two profiles';
  END IF;
END;
$$;

WITH inserted AS (
  INSERT INTO public.knowledge_bases (owner_id, name, description)
  VALUES (
    (SELECT value::UUID FROM publication_guard_state WHERE key = 'owner_id'),
    'P1 publication soft-delete verification',
    'Rollback-only database fixture'
  )
  RETURNING id
)
INSERT INTO publication_guard_state (key, value)
SELECT 'knowledge_base_id', id::TEXT FROM inserted;

WITH inserted AS (
  INSERT INTO public.documents (knowledge_base_id, owner_id, title, summary, body, status)
  VALUES
    (
      (SELECT value::UUID FROM publication_guard_state WHERE key = 'knowledge_base_id'),
      (SELECT value::UUID FROM publication_guard_state WHERE key = 'owner_id'),
      'P1 public fixture', '', 'Public fixture body', 'ready'
    ),
    (
      (SELECT value::UUID FROM publication_guard_state WHERE key = 'knowledge_base_id'),
      (SELECT value::UUID FROM publication_guard_state WHERE key = 'owner_id'),
      'P1 unlisted fixture', '', 'Unlisted fixture body', 'ready'
    ),
    (
      (SELECT value::UUID FROM publication_guard_state WHERE key = 'knowledge_base_id'),
      (SELECT value::UUID FROM publication_guard_state WHERE key = 'owner_id'),
      'P1 cross-account fixture', '', 'Cross-account fixture body', 'ready'
    )
  RETURNING id, title
)
INSERT INTO publication_guard_state (key, value)
SELECT CASE title
  WHEN 'P1 public fixture' THEN 'public_document_id'
  WHEN 'P1 unlisted fixture' THEN 'unlisted_document_id'
  ELSE 'cross_account_document_id'
END, id::TEXT
FROM inserted;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT value FROM publication_guard_state WHERE key = 'owner_id'),
  TRUE
);

SELECT public.publish_document(
  (SELECT value::UUID FROM publication_guard_state WHERE key = 'public_document_id'),
  'public'
);

INSERT INTO publication_guard_state (key, value)
SELECT
  'unlisted_share_token',
  public.publish_document(
    (SELECT value::UUID FROM publication_guard_state WHERE key = 'unlisted_document_id'),
    'unlisted'
  )->>'share_token';

SELECT public.publish_document(
  (SELECT value::UUID FROM publication_guard_state WHERE key = 'cross_account_document_id'),
  'public'
);
RESET ROLE;

SAVEPOINT soft_delete_rollback_proof;
UPDATE public.documents
SET deleted_at = NOW()
WHERE id = (SELECT value::UUID FROM publication_guard_state WHERE key = 'cross_account_document_id');
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.document_publications
    WHERE document_id = (
      SELECT value::UUID FROM publication_guard_state WHERE key = 'cross_account_document_id'
    )
  ) THEN
    RAISE EXCEPTION 'soft delete did not revoke inside the open transaction';
  END IF;
END;
$$;
ROLLBACK TO SAVEPOINT soft_delete_rollback_proof;

INSERT INTO publication_guard_results VALUES (
  'soft_delete_rollback_restores_snapshot',
  EXISTS (
    SELECT 1 FROM public.document_publications
    WHERE document_id = (
      SELECT value::UUID FROM publication_guard_state WHERE key = 'cross_account_document_id'
    )
  )
  AND EXISTS (
    SELECT 1 FROM public.documents
    WHERE id = (SELECT value::UUID FROM publication_guard_state WHERE key = 'cross_account_document_id')
      AND deleted_at IS NULL
      AND status = 'published'
  ),
  'Rolling back the source update also rolls back snapshot revocation and metadata changes.'
);

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role', 'anon', TRUE);
SELECT set_config('request.jwt.claim.sub', '', TRUE);

INSERT INTO publication_guard_results VALUES (
  'public_rpc_visible_before_soft_delete',
  public.read_published_document(
    (SELECT value::UUID FROM publication_guard_state WHERE key = 'public_document_id'),
    NULL
  ) IS NOT NULL,
  'The public-id RPC exposes the live public fixture before deletion.'
);

INSERT INTO publication_guard_results VALUES (
  'unlisted_rpc_visible_before_soft_delete',
  public.read_published_document(
    NULL,
    (SELECT value::UUID FROM publication_guard_state WHERE key = 'unlisted_share_token')
  ) IS NOT NULL,
  'The exact unlisted token exposes the live unlisted fixture before deletion.'
);

INSERT INTO publication_guard_results VALUES (
  'public_list_visible_before_soft_delete',
  public.list_public_documents(50, 0) @> jsonb_build_array(jsonb_build_object(
    'document_id',
    (SELECT value::UUID FROM publication_guard_state WHERE key = 'public_document_id')
  )),
  'Public discovery includes the live public fixture before deletion.'
);

DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.document_publications LIMIT 1;
    INSERT INTO publication_guard_results VALUES (
      'anon_cannot_select_publication_table', FALSE,
      'Anonymous unexpectedly selected the publication table directly.'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO publication_guard_results VALUES (
      'anon_cannot_select_publication_table', TRUE,
      'Anonymous direct table reads remain denied.'
    );
  END;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT value FROM publication_guard_state WHERE key = 'owner_id'),
  TRUE
);

UPDATE public.documents
SET deleted_at = NOW()
WHERE id IN (
  (SELECT value::UUID FROM publication_guard_state WHERE key = 'public_document_id'),
  (SELECT value::UUID FROM publication_guard_state WHERE key = 'unlisted_document_id')
);

-- A second non-null timestamp is intentionally idempotent and must not republish anything.
UPDATE public.documents
SET deleted_at = deleted_at + INTERVAL '1 second'
WHERE id = (SELECT value::UUID FROM publication_guard_state WHERE key = 'public_document_id');

DO $$
BEGIN
  BEGIN
    INSERT INTO public.document_publications (
      document_id, owner_id, audience, source_revision, snapshot
    ) VALUES (
      (SELECT value::UUID FROM publication_guard_state WHERE key = 'public_document_id'),
      (SELECT value::UUID FROM publication_guard_state WHERE key = 'owner_id'),
      'public', 0, '{}'::JSONB
    );
    INSERT INTO publication_guard_results VALUES (
      'owner_cannot_reinsert_deleted_publication', FALSE,
      'Owner unexpectedly inserted a snapshot for a soft-deleted source.'
    );
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN
    INSERT INTO publication_guard_results VALUES (
      'owner_cannot_reinsert_deleted_publication', TRUE,
      'Publication INSERT policy rejects a soft-deleted source.'
    );
  END;
END;
$$;

-- Restoring the private source does not restore its old snapshot or token.
UPDATE public.documents
SET deleted_at = NULL
WHERE id = (SELECT value::UUID FROM publication_guard_state WHERE key = 'unlisted_document_id');

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT value FROM publication_guard_state WHERE key = 'other_id'),
  TRUE
);
UPDATE public.documents
SET deleted_at = NOW()
WHERE id = (SELECT value::UUID FROM publication_guard_state WHERE key = 'cross_account_document_id');
RESET ROLE;

INSERT INTO publication_guard_results VALUES (
  'soft_delete_revokes_rows_and_metadata',
  NOT EXISTS (
    SELECT 1 FROM public.document_publications
    WHERE document_id IN (
      (SELECT value::UUID FROM publication_guard_state WHERE key = 'public_document_id'),
      (SELECT value::UUID FROM publication_guard_state WHERE key = 'unlisted_document_id')
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.documents
    WHERE id IN (
      (SELECT value::UUID FROM publication_guard_state WHERE key = 'public_document_id'),
      (SELECT value::UUID FROM publication_guard_state WHERE key = 'unlisted_document_id')
    )
      AND (
        status <> 'archived'
        OR visibility <> 'private'
        OR published_at IS NOT NULL
        OR published_revision IS NOT NULL
      )
  ),
  'Soft delete removes both snapshot rows and resets public metadata.'
);

INSERT INTO publication_guard_results VALUES (
  'other_user_cannot_soft_delete_owner_document',
  EXISTS (
    SELECT 1 FROM public.documents
    WHERE id = (SELECT value::UUID FROM publication_guard_state WHERE key = 'cross_account_document_id')
      AND deleted_at IS NULL
  )
  AND EXISTS (
    SELECT 1 FROM public.document_publications
    WHERE document_id = (SELECT value::UUID FROM publication_guard_state WHERE key = 'cross_account_document_id')
  ),
  'Another account cannot soft-delete the owner source or revoke its snapshot.'
);

-- Simulate a privileged/manual orphan while keeping the production trigger enabled afterward.
ALTER TABLE public.document_publications
  DISABLE TRIGGER document_publications_require_live_source;
INSERT INTO public.document_publications (
  document_id, owner_id, audience, source_revision, snapshot
) VALUES (
  (SELECT value::UUID FROM publication_guard_state WHERE key = 'public_document_id'),
  (SELECT value::UUID FROM publication_guard_state WHERE key = 'owner_id'),
  'public', 0, '{"title":"privileged orphan"}'::JSONB
);
ALTER TABLE public.document_publications
  ENABLE TRIGGER document_publications_require_live_source;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT value FROM publication_guard_state WHERE key = 'owner_id'),
  TRUE
);
UPDATE public.documents
SET deleted_at = NULL
WHERE id = (SELECT value::UUID FROM publication_guard_state WHERE key = 'public_document_id');
RESET ROLE;

INSERT INTO publication_guard_results VALUES (
  'restore_clears_privileged_orphan',
  NOT EXISTS (
    SELECT 1 FROM public.document_publications
    WHERE document_id = (
      SELECT value::UUID FROM publication_guard_state WHERE key = 'public_document_id'
    )
  )
  AND EXISTS (
    SELECT 1 FROM public.documents
    WHERE id = (SELECT value::UUID FROM publication_guard_state WHERE key = 'public_document_id')
      AND deleted_at IS NULL
      AND visibility = 'private'
      AND published_at IS NULL
      AND published_revision IS NULL
  ),
  'Restoring a source revokes privileged orphan rows and never republishes them.'
);

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role', 'anon', TRUE);
SELECT set_config('request.jwt.claim.sub', '', TRUE);

INSERT INTO publication_guard_results VALUES (
  'public_rpc_hidden_after_soft_delete',
  public.read_published_document(
    (SELECT value::UUID FROM publication_guard_state WHERE key = 'public_document_id'),
    NULL
  ) IS NULL,
  'The deleted public source is absent from the anonymous read RPC.'
);

INSERT INTO publication_guard_results VALUES (
  'unlisted_token_revoked_after_soft_delete',
  public.read_published_document(
    NULL,
    (SELECT value::UUID FROM publication_guard_state WHERE key = 'unlisted_share_token')
  ) IS NULL,
  'The old share token stays revoked after restoring the private source.'
);

INSERT INTO publication_guard_results VALUES (
  'public_list_hidden_after_soft_delete',
  NOT (
    public.list_public_documents(50, 0) @> jsonb_build_array(jsonb_build_object(
      'document_id',
      (SELECT value::UUID FROM publication_guard_state WHERE key = 'public_document_id')
    ))
  ),
  'Public discovery excludes the soft-deleted fixture.'
);
RESET ROLE;

DELETE FROM public.document_publications
WHERE document_id = (SELECT value::UUID FROM publication_guard_state WHERE key = 'public_document_id');

DELETE FROM public.documents
WHERE id = (SELECT value::UUID FROM publication_guard_state WHERE key = 'cross_account_document_id');
INSERT INTO publication_guard_results VALUES (
  'hard_delete_cascade_is_preserved',
  NOT EXISTS (
    SELECT 1 FROM public.document_publications
    WHERE document_id = (
      SELECT value::UUID FROM publication_guard_state WHERE key = 'cross_account_document_id'
    )
  ),
  'The existing foreign-key cascade still removes a publication on hard delete.'
);

INSERT INTO publication_guard_results VALUES (
  'security_definer_contract_is_pinned',
  (
    SELECT COUNT(*) = 2
    FROM pg_catalog.pg_proc procedure
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.oid IN (
        'public.read_published_document(uuid,uuid)'::REGPROCEDURE,
        'public.list_public_documents(integer,integer)'::REGPROCEDURE
      )
      AND procedure.prorettype = 'jsonb'::REGTYPE
      AND procedure.prosecdef
      AND procedure.provolatile = 's'
      AND procedure.proconfig @> ARRAY['search_path=pg_catalog, pg_temp']::TEXT[]
  )
  AND (
    SELECT COUNT(*) = 2
    FROM pg_catalog.pg_proc procedure
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname IN ('read_published_document', 'list_public_documents')
  ),
  'Both anonymous RPCs retain one stable JSONB SECURITY DEFINER signature and a safe path.'
);

INSERT INTO publication_guard_results VALUES (
  'function_and_table_privileges_are_minimal',
  NOT has_table_privilege('anon', 'public.document_publications', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.document_publications', 'INSERT')
  AND NOT has_table_privilege('anon', 'public.document_publications', 'UPDATE')
  AND NOT has_table_privilege('anon', 'public.document_publications', 'DELETE')
  AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc procedure,
         LATERAL pg_catalog.aclexplode(
           COALESCE(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
         ) acl
    WHERE procedure.oid = 'public.revoke_publication_on_document_soft_delete()'::REGPROCEDURE
      AND acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon', 'public.revoke_publication_on_document_soft_delete()', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated', 'public.revoke_publication_on_document_soft_delete()', 'EXECUTE'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc procedure,
         LATERAL pg_catalog.aclexplode(
           COALESCE(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
         ) acl
    WHERE procedure.oid = 'public.require_live_source_for_document_publication()'::REGPROCEDURE
      AND acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon', 'public.require_live_source_for_document_publication()', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated', 'public.require_live_source_for_document_publication()', 'EXECUTE'
  )
  AND has_function_privilege(
    'anon', 'public.read_published_document(uuid,uuid)', 'EXECUTE'
  )
  AND has_function_privilege(
    'anon', 'public.list_public_documents(integer,integer)', 'EXECUTE'
  ),
  'Anonymous access is RPC-only and the trigger function is not directly executable.'
);

INSERT INTO publication_guard_results VALUES (
  'publication_write_rpc_contracts_are_pinned',
  (
    SELECT COUNT(*) = 3
    FROM pg_catalog.pg_proc procedure
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.oid IN (
        'public.publish_document(uuid,text)'::REGPROCEDURE,
        'public.unpublish_document(uuid)'::REGPROCEDURE,
        'public.moderate_publication(uuid,text)'::REGPROCEDURE
      )
      AND procedure.provolatile = 'v'
      AND (
        (procedure.oid = 'public.publish_document(uuid,text)'::REGPROCEDURE
          AND procedure.prorettype = 'jsonb'::REGTYPE AND NOT procedure.prosecdef)
        OR (procedure.oid = 'public.unpublish_document(uuid)'::REGPROCEDURE
          AND procedure.prorettype = 'boolean'::REGTYPE AND NOT procedure.prosecdef)
        OR (procedure.oid = 'public.moderate_publication(uuid,text)'::REGPROCEDURE
          AND procedure.prorettype = 'boolean'::REGTYPE AND procedure.prosecdef
          AND procedure.proconfig @> ARRAY['search_path=pg_catalog, pg_temp']::TEXT[])
      )
  )
  AND NOT has_function_privilege('anon', 'public.publish_document(uuid,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.unpublish_document(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.moderate_publication(uuid,text)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.publish_document(uuid,text)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.unpublish_document(uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.moderate_publication(uuid,text)', 'EXECUTE'),
  'Publish, unpublish, and moderation retain their exact ABI, identity mode, and caller ACL.'
);

SELECT test_name, passed, detail
FROM publication_guard_results
ORDER BY test_name;

DO $$
DECLARE
  expected_names TEXT[] := ARRAY[
    'anon_cannot_select_publication_table',
    'function_and_table_privileges_are_minimal',
    'hard_delete_cascade_is_preserved',
    'other_user_cannot_soft_delete_owner_document',
    'owner_cannot_reinsert_deleted_publication',
    'publication_write_rpc_contracts_are_pinned',
    'public_list_hidden_after_soft_delete',
    'public_list_visible_before_soft_delete',
    'public_rpc_hidden_after_soft_delete',
    'public_rpc_visible_before_soft_delete',
    'restore_clears_privileged_orphan',
    'security_definer_contract_is_pinned',
    'soft_delete_revokes_rows_and_metadata',
    'soft_delete_rollback_restores_snapshot',
    'unlisted_rpc_visible_before_soft_delete',
    'unlisted_token_revoked_after_soft_delete'
  ]::TEXT[];
BEGIN
  IF (SELECT array_agg(test_name ORDER BY test_name) FROM publication_guard_results)
    IS DISTINCT FROM (SELECT array_agg(name ORDER BY name) FROM unnest(expected_names) name) THEN
    RAISE EXCEPTION 'publication guard assertion set is incomplete or unexpected';
  END IF;
  IF EXISTS (SELECT 1 FROM publication_guard_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'one or more publication soft-delete assertions failed';
  END IF;
END;
$$;

ROLLBACK;
