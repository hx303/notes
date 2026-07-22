-- P1A publication reliability contract matrix.
-- Run as postgres only on a disposable/local test database after migrations through
-- 20260721000100. Every fixture, grant, and behavior probe is rollback-only.

BEGIN;

-- Local CLI replay does not inherit the Dashboard project's broad public-schema
-- defaults. These grants exist only for this transaction and exercise real RLS.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_bases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT SELECT ON public.document_tags, public.tags, public.document_sources TO authenticated;

CREATE TEMP TABLE publication_reliability_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE publication_reliability_results (
  test_name TEXT PRIMARY KEY,
  passed BOOLEAN NOT NULL,
  detail TEXT NOT NULL
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE ON publication_reliability_state TO authenticated, anon;
GRANT SELECT, INSERT ON publication_reliability_results TO authenticated, anon;

INSERT INTO publication_reliability_state (key, value)
SELECT 'owner_id', id::TEXT FROM public.profiles ORDER BY created_at LIMIT 1;

INSERT INTO publication_reliability_state (key, value)
SELECT 'other_id', id::TEXT
FROM public.profiles
WHERE id <> (
  SELECT value::UUID FROM publication_reliability_state WHERE key = 'owner_id'
)
ORDER BY created_at
LIMIT 1;

DO $$
BEGIN
  IF (
    SELECT COUNT(*)
    FROM publication_reliability_state
    WHERE key IN ('owner_id', 'other_id')
  ) <> 2 THEN
    RAISE EXCEPTION 'publication reliability matrix requires two profiles';
  END IF;
END;
$$;

WITH inserted AS (
  INSERT INTO public.knowledge_bases (owner_id, name, description)
  VALUES (
    (SELECT value::UUID FROM publication_reliability_state WHERE key = 'owner_id'),
    'P1A publication reliability matrix',
    'Rollback-only database fixture'
  )
  RETURNING id
)
INSERT INTO publication_reliability_state (key, value)
SELECT 'knowledge_base_id', id::TEXT FROM inserted;

WITH inserted AS (
  INSERT INTO public.documents (
    knowledge_base_id, owner_id, title, summary, body, status
  )
  VALUES
    (
      (SELECT value::UUID FROM publication_reliability_state WHERE key = 'knowledge_base_id'),
      (SELECT value::UUID FROM publication_reliability_state WHERE key = 'owner_id'),
      'P1A private fixture', '', 'Private fixture body', 'draft'
    ),
    (
      (SELECT value::UUID FROM publication_reliability_state WHERE key = 'knowledge_base_id'),
      (SELECT value::UUID FROM publication_reliability_state WHERE key = 'owner_id'),
      'P1A public fixture', '', 'Public fixture body v1', 'ready'
    ),
    (
      (SELECT value::UUID FROM publication_reliability_state WHERE key = 'knowledge_base_id'),
      (SELECT value::UUID FROM publication_reliability_state WHERE key = 'owner_id'),
      'P1A unlisted fixture', '', 'Unlisted fixture body', 'ready'
    ),
    (
      (SELECT value::UUID FROM publication_reliability_state WHERE key = 'knowledge_base_id'),
      (SELECT value::UUID FROM publication_reliability_state WHERE key = 'owner_id'),
      'P1A soft-delete fixture', '', 'Soft-delete fixture body', 'ready'
    ),
    (
      (SELECT value::UUID FROM publication_reliability_state WHERE key = 'knowledge_base_id'),
      (SELECT value::UUID FROM publication_reliability_state WHERE key = 'owner_id'),
      'P1A stale predicate fixture', '', 'Stale predicate fixture body v1', 'draft'
    )
  RETURNING id, title
)
INSERT INTO publication_reliability_state (key, value)
SELECT CASE title
  WHEN 'P1A private fixture' THEN 'private_document_id'
  WHEN 'P1A public fixture' THEN 'public_document_id'
  WHEN 'P1A unlisted fixture' THEN 'unlisted_document_id'
  WHEN 'P1A soft-delete fixture' THEN 'soft_delete_document_id'
  ELSE 'stale_predicate_document_id'
END, id::TEXT
FROM inserted;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT value FROM publication_reliability_state WHERE key = 'owner_id'),
  TRUE
);

INSERT INTO publication_reliability_results VALUES (
  'owner_can_read_private_source',
  EXISTS (
    SELECT 1
    FROM public.documents
    WHERE id = (
      SELECT value::UUID FROM publication_reliability_state
      WHERE key = 'private_document_id'
    )
      AND visibility = 'private'
      AND deleted_at IS NULL
  ),
  'The owner can read the private source row through owner RLS.'
);

SELECT public.publish_document(
  (SELECT value::UUID FROM publication_reliability_state WHERE key = 'public_document_id'),
  'public'
);

INSERT INTO publication_reliability_state (key, value)
SELECT
  'unlisted_share_token',
  public.publish_document(
    (SELECT value::UUID FROM publication_reliability_state WHERE key = 'unlisted_document_id'),
    'unlisted'
  )->>'share_token';

SELECT public.publish_document(
  (
    SELECT value::UUID FROM publication_reliability_state
    WHERE key = 'soft_delete_document_id'
  ),
  'public'
);

INSERT INTO publication_reliability_results VALUES (
  'owner_can_publish_public_and_unlisted',
  (
    SELECT COUNT(*) = 2
    FROM public.document_publications
    WHERE document_id IN (
      (SELECT value::UUID FROM publication_reliability_state WHERE key = 'public_document_id'),
      (
        SELECT value::UUID FROM publication_reliability_state
        WHERE key = 'unlisted_document_id'
      )
    )
  )
  AND EXISTS (
    SELECT 1
    FROM public.documents
    WHERE id = (
      SELECT value::UUID FROM publication_reliability_state WHERE key = 'public_document_id'
    )
      AND status = 'published'
      AND visibility = 'public'
  )
  AND EXISTS (
    SELECT 1
    FROM public.documents
    WHERE id = (
      SELECT value::UUID FROM publication_reliability_state WHERE key = 'unlisted_document_id'
    )
      AND status = 'published'
      AND visibility = 'unlisted'
  ),
  'The owner can publish both supported audiences and source metadata follows the snapshot.'
);

INSERT INTO publication_reliability_state (key, value)
SELECT 'initial_public_share_token', share_token::TEXT
FROM public.document_publications
WHERE document_id = (
  SELECT value::UUID FROM publication_reliability_state WHERE key = 'public_document_id'
);

SELECT public.publish_document(
  (SELECT value::UUID FROM publication_reliability_state WHERE key = 'public_document_id'),
  'public'
);

INSERT INTO publication_reliability_results VALUES (
  'duplicate_publish_keeps_one_current_snapshot',
  (
    SELECT COUNT(*) = 1
    FROM public.document_publications
    WHERE document_id = (
      SELECT value::UUID FROM publication_reliability_state WHERE key = 'public_document_id'
    )
  )
  AND EXISTS (
    SELECT 1
    FROM public.document_publications
    WHERE document_id = (
      SELECT value::UUID FROM publication_reliability_state WHERE key = 'public_document_id'
    )
      AND share_token = (
        SELECT value::UUID FROM publication_reliability_state
        WHERE key = 'initial_public_share_token'
      )
      AND source_revision = 0
      AND snapshot->>'body' = 'Public fixture body v1'
  ),
  'A retry converges on one current row and preserves its token; this is not an operation-id guarantee.'
);

UPDATE public.documents
SET body = '', revision = revision + 1
WHERE id = (
  SELECT value::UUID FROM publication_reliability_state WHERE key = 'public_document_id'
)
  AND revision = 0;

DO $$
BEGIN
  BEGIN
    PERFORM public.publish_document(
      (
        SELECT value::UUID FROM publication_reliability_state
        WHERE key = 'public_document_id'
      ),
      'public'
    );
    INSERT INTO publication_reliability_results VALUES (
      'failed_publish_preserves_last_success', FALSE,
      'Publishing an empty source unexpectedly succeeded.'
    );
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM IS DISTINCT FROM 'Body content is required before publishing' THEN
      RAISE;
    END IF;
    INSERT INTO publication_reliability_results VALUES (
      'failed_publish_preserves_last_success',
      EXISTS (
        SELECT 1
        FROM public.document_publications
        WHERE document_id = (
          SELECT value::UUID FROM publication_reliability_state
          WHERE key = 'public_document_id'
        )
          AND source_revision = 0
          AND snapshot->>'body' = 'Public fixture body v1'
      )
      AND (
        public.read_published_document(
          (
            SELECT value::UUID FROM publication_reliability_state
            WHERE key = 'public_document_id'
          ),
          NULL
        )->'content'->>'body'
      ) = 'Public fixture body v1',
      'A validation failure leaves the last successful snapshot readable and unchanged.'
    );
  END;
END;
$$;

UPDATE public.documents
SET body = 'Public fixture body v2'
WHERE id = (
  SELECT value::UUID FROM publication_reliability_state WHERE key = 'public_document_id'
);

-- This is a PostgreSQL stale-revision predicate probe only. It does not execute
-- or establish correctness of the browser editor's multi-write save path.
UPDATE public.documents
SET body = 'Stale predicate fixture body overwritten', revision = revision + 1
WHERE id = (
  SELECT value::UUID FROM publication_reliability_state
  WHERE key = 'stale_predicate_document_id'
)
  AND revision = 99;

INSERT INTO publication_reliability_results VALUES (
  'stale_revision_predicate_is_noop',
  EXISTS (
    SELECT 1
    FROM public.documents
    WHERE id = (
      SELECT value::UUID FROM publication_reliability_state
      WHERE key = 'stale_predicate_document_id'
    )
      AND revision = 0
      AND body = 'Stale predicate fixture body v1'
  ),
  'A stale SQL revision predicate changes neither the source nor its revision; the product save path is out of scope.'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT value FROM publication_reliability_state WHERE key = 'other_id'),
  TRUE
);

DO $$
BEGIN
  BEGIN
    PERFORM public.publish_document(
      (
        SELECT value::UUID FROM publication_reliability_state
        WHERE key = 'private_document_id'
      ),
      'public'
    );
    INSERT INTO publication_reliability_results VALUES (
      'other_user_cannot_publish_owner_document', FALSE,
      'A different account unexpectedly published the owner document.'
    );
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM IS DISTINCT FROM 'Document not found or not owned by current user' THEN
      RAISE;
    END IF;
    INSERT INTO publication_reliability_results VALUES (
      'other_user_cannot_publish_owner_document', TRUE,
      'Ownership and RLS reject a different account at the publication RPC.'
    );
  END;
END;
$$;

INSERT INTO publication_reliability_results VALUES (
  'other_user_visibility_matrix',
  NOT EXISTS (
    SELECT 1
    FROM public.documents
    WHERE owner_id = (
      SELECT value::UUID FROM publication_reliability_state WHERE key = 'owner_id'
    )
  )
  AND public.read_published_document(
    (SELECT value::UUID FROM publication_reliability_state WHERE key = 'private_document_id'),
    NULL
  ) IS NULL
  AND public.read_published_document(
    (SELECT value::UUID FROM publication_reliability_state WHERE key = 'public_document_id'),
    NULL
  ) IS NOT NULL
  AND public.read_published_document(
    (SELECT value::UUID FROM publication_reliability_state WHERE key = 'unlisted_document_id'),
    NULL
  ) IS NULL
  AND public.read_published_document(
    NULL,
    (
      SELECT value::UUID FROM publication_reliability_state
      WHERE key = 'unlisted_share_token'
    )
  ) IS NOT NULL,
  'Another account sees no private source rows, public by ID, and unlisted only by bearer token.'
);

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role', 'anon', TRUE);
SELECT set_config('request.jwt.claim.sub', '', TRUE);

DO $$
BEGIN
  BEGIN
    PERFORM public.publish_document(
      (
        SELECT value::UUID FROM publication_reliability_state
        WHERE key = 'public_document_id'
      ),
      'public'
    );
    INSERT INTO publication_reliability_results VALUES (
      'anon_publish_execute_denied', FALSE,
      'Anonymous unexpectedly executed publish_document.'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO publication_reliability_results VALUES (
      'anon_publish_execute_denied', TRUE,
      'Anonymous EXECUTE on publish_document is denied.'
    );
  END;
END;
$$;

DO $$
BEGIN
  BEGIN
    PERFORM public.unpublish_document(
      (
        SELECT value::UUID FROM publication_reliability_state
        WHERE key = 'public_document_id'
      )
    );
    INSERT INTO publication_reliability_results VALUES (
      'anon_unpublish_execute_denied', FALSE,
      'Anonymous unexpectedly executed unpublish_document.'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO publication_reliability_results VALUES (
      'anon_unpublish_execute_denied', TRUE,
      'Anonymous EXECUTE on unpublish_document is denied.'
    );
  END;
END;
$$;

INSERT INTO publication_reliability_results VALUES (
  'anon_visibility_matrix',
  public.read_published_document(
    (SELECT value::UUID FROM publication_reliability_state WHERE key = 'private_document_id'),
    NULL
  ) IS NULL
  AND public.read_published_document(
    (SELECT value::UUID FROM publication_reliability_state WHERE key = 'public_document_id'),
    NULL
  ) IS NOT NULL
  AND public.list_public_documents(50, 0) @> jsonb_build_array(jsonb_build_object(
    'document_id',
    (SELECT value::UUID FROM publication_reliability_state WHERE key = 'public_document_id')
  ))
  AND public.read_published_document(
    (SELECT value::UUID FROM publication_reliability_state WHERE key = 'unlisted_document_id'),
    NULL
  ) IS NULL
  AND public.read_published_document(
    NULL,
    (
      SELECT value::UUID FROM publication_reliability_state
      WHERE key = 'unlisted_share_token'
    )
  ) IS NOT NULL,
  'Anonymous readers see public by ID/list, unlisted only by exact token, and never private.'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT value FROM publication_reliability_state WHERE key = 'owner_id'),
  TRUE
);

UPDATE public.documents
SET deleted_at = NOW()
WHERE id = (
  SELECT value::UUID FROM publication_reliability_state WHERE key = 'soft_delete_document_id'
);

INSERT INTO publication_reliability_results VALUES (
  'soft_delete_revokes_current_snapshot',
  NOT EXISTS (
    SELECT 1
    FROM public.document_publications
    WHERE document_id = (
      SELECT value::UUID FROM publication_reliability_state
      WHERE key = 'soft_delete_document_id'
    )
  )
  AND EXISTS (
    SELECT 1
    FROM public.documents
    WHERE id = (
      SELECT value::UUID FROM publication_reliability_state
      WHERE key = 'soft_delete_document_id'
    )
      AND status = 'archived'
      AND visibility = 'private'
      AND published_at IS NULL
      AND published_revision IS NULL
  ),
  'Soft delete atomically removes the current pointer and normalizes public metadata.'
);

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role', 'anon', TRUE);
SELECT set_config('request.jwt.claim.sub', '', TRUE);

INSERT INTO publication_reliability_results VALUES (
  'soft_delete_hides_public_reader',
  public.read_published_document(
    (
      SELECT value::UUID FROM publication_reliability_state
      WHERE key = 'soft_delete_document_id'
    ),
    NULL
  ) IS NULL
  AND NOT (
    public.list_public_documents(50, 0) @> jsonb_build_array(jsonb_build_object(
      'document_id',
      (
        SELECT value::UUID FROM publication_reliability_state
        WHERE key = 'soft_delete_document_id'
      )
    ))
  ),
  'Anonymous ID and discovery readers both hide the soft-deleted source.'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT value FROM publication_reliability_state WHERE key = 'owner_id'),
  TRUE
);

UPDATE public.documents
SET deleted_at = NULL
WHERE id = (
  SELECT value::UUID FROM publication_reliability_state WHERE key = 'soft_delete_document_id'
);

INSERT INTO publication_reliability_results VALUES (
  'restore_does_not_republish',
  NOT EXISTS (
    SELECT 1
    FROM public.document_publications
    WHERE document_id = (
      SELECT value::UUID FROM publication_reliability_state
      WHERE key = 'soft_delete_document_id'
    )
  )
  AND EXISTS (
    SELECT 1
    FROM public.documents
    WHERE id = (
      SELECT value::UUID FROM publication_reliability_state
      WHERE key = 'soft_delete_document_id'
    )
      AND deleted_at IS NULL
      AND visibility = 'private'
      AND published_at IS NULL
      AND published_revision IS NULL
  ),
  'Restoring a source never restores its revoked snapshot or public metadata.'
);

INSERT INTO publication_reliability_state (key, value)
SELECT
  'first_withdraw_result',
  public.unpublish_document(
    (SELECT value::UUID FROM publication_reliability_state WHERE key = 'public_document_id')
  )::TEXT;

INSERT INTO publication_reliability_results VALUES (
  'withdraw_revokes_reader_and_resets_draft',
  (SELECT value::BOOLEAN FROM publication_reliability_state WHERE key = 'first_withdraw_result')
  AND public.read_published_document(
    (SELECT value::UUID FROM publication_reliability_state WHERE key = 'public_document_id'),
    NULL
  ) IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.document_publications
    WHERE document_id = (
      SELECT value::UUID FROM publication_reliability_state WHERE key = 'public_document_id'
    )
  )
  AND EXISTS (
    SELECT 1
    FROM public.documents
    WHERE id = (
      SELECT value::UUID FROM publication_reliability_state WHERE key = 'public_document_id'
    )
      AND status = 'draft'
      AND visibility = 'private'
      AND published_at IS NULL
      AND published_revision IS NULL
  ),
  'The first withdrawal revokes the reader and restores private draft metadata.'
);

INSERT INTO publication_reliability_results VALUES (
  'second_withdraw_returns_false_current_contract',
  NOT public.unpublish_document(
    (SELECT value::UUID FROM publication_reliability_state WHERE key = 'public_document_id')
  ),
  'The current unversioned ABI returns false on a lost-ACK retry; this pins a known gap.'
);

SELECT public.publish_document(
  (SELECT value::UUID FROM publication_reliability_state WHERE key = 'public_document_id'),
  'public'
);

INSERT INTO publication_reliability_results VALUES (
  'republish_restores_stable_public_identity',
  EXISTS (
    SELECT 1
    FROM public.document_publications
    WHERE document_id = (
      SELECT value::UUID FROM publication_reliability_state WHERE key = 'public_document_id'
    )
      AND audience = 'public'
      AND source_revision = 1
  )
  AND (
    public.read_published_document(
      (
        SELECT value::UUID FROM publication_reliability_state
        WHERE key = 'public_document_id'
      ),
      NULL
    )->>'document_id'
  ) = (
    SELECT value FROM publication_reliability_state WHERE key = 'public_document_id'
  ),
  'Republishing restores the same document-ID public identity with the latest valid source revision.'
);

SELECT public.unpublish_document(
  (SELECT value::UUID FROM publication_reliability_state WHERE key = 'unlisted_document_id')
);

INSERT INTO publication_reliability_state (key, value)
SELECT
  'republished_unlisted_share_token',
  public.publish_document(
    (SELECT value::UUID FROM publication_reliability_state WHERE key = 'unlisted_document_id'),
    'unlisted'
  )->>'share_token';

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role', 'anon', TRUE);
SELECT set_config('request.jwt.claim.sub', '', TRUE);

INSERT INTO publication_reliability_results VALUES (
  'unlisted_republish_rotates_revoked_token',
  (
    SELECT old.value <> replacement.value
    FROM publication_reliability_state old
    CROSS JOIN publication_reliability_state replacement
    WHERE old.key = 'unlisted_share_token'
      AND replacement.key = 'republished_unlisted_share_token'
  )
  AND public.read_published_document(
    NULL,
    (
      SELECT value::UUID FROM publication_reliability_state
      WHERE key = 'unlisted_share_token'
    )
  ) IS NULL
  AND public.read_published_document(
    NULL,
    (
      SELECT value::UUID FROM publication_reliability_state
      WHERE key = 'republished_unlisted_share_token'
    )
  ) IS NOT NULL,
  'Withdrawal revokes the old bearer token and republishing generates a different working token.'
);

RESET ROLE;

SELECT test_name, passed, detail
FROM publication_reliability_results
ORDER BY test_name;

DO $$
DECLARE
  expected_names TEXT[] := ARRAY[
    'anon_publish_execute_denied',
    'anon_unpublish_execute_denied',
    'anon_visibility_matrix',
    'duplicate_publish_keeps_one_current_snapshot',
    'failed_publish_preserves_last_success',
    'other_user_cannot_publish_owner_document',
    'other_user_visibility_matrix',
    'owner_can_publish_public_and_unlisted',
    'owner_can_read_private_source',
    'republish_restores_stable_public_identity',
    'restore_does_not_republish',
    'second_withdraw_returns_false_current_contract',
    'soft_delete_hides_public_reader',
    'soft_delete_revokes_current_snapshot',
    'stale_revision_predicate_is_noop',
    'unlisted_republish_rotates_revoked_token',
    'withdraw_revokes_reader_and_resets_draft'
  ]::TEXT[];
BEGIN
  IF (
    SELECT array_agg(test_name ORDER BY test_name)
    FROM publication_reliability_results
  ) IS DISTINCT FROM (
    SELECT array_agg(name ORDER BY name) FROM unnest(expected_names) name
  ) THEN
    RAISE EXCEPTION 'publication reliability assertion set is incomplete or unexpected';
  END IF;

  IF EXISTS (SELECT 1 FROM publication_reliability_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'one or more publication reliability assertions failed';
  END IF;
END;
$$;

ROLLBACK;
