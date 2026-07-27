-- Owner, idempotency, CAS, atomicity, organization, and publication verification.
-- Run as postgres after 20260722000200 with:
--   -v wouldkeep_p1b_20260722000200_disposable=true
-- Every fixture and receipt is rolled back.

\set ON_ERROR_STOP on
\if :{?wouldkeep_p1b_20260722000200_disposable}
\else
\set wouldkeep_p1b_20260722000200_disposable false
\endif
\if :wouldkeep_p1b_20260722000200_disposable
\else
\echo 'Refusing to run: pass the exact disposable-environment confirmation variable.'
DO $p1b_disposable_guard$
BEGIN
  RAISE EXCEPTION 'Disposable environment confirmation is required';
END;
$p1b_disposable_guard$;
\endif

BEGIN;

-- These read grants exist only inside this rollback-only evidence transaction so
-- role-switched assertions can inspect their own business rows. The RPC itself is
-- separately proven to work without authenticated DML grants.
GRANT SELECT ON public.knowledge_bases, public.documents, public.document_versions,
  public.tags, public.document_tags, public.document_links, public.document_sources,
  public.document_publications TO authenticated;
GRANT INSERT ON public.tags TO authenticated;

CREATE TEMP TABLE atomic_save_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE atomic_save_snapshots (
  key TEXT PRIMARY KEY,
  snapshot JSONB NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE atomic_save_responses (
  key TEXT PRIMARY KEY,
  response JSONB NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE atomic_save_results (
  test_name TEXT PRIMARY KEY,
  passed BOOLEAN NOT NULL,
  detail TEXT NOT NULL
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE ON atomic_save_state
  TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE ON atomic_save_snapshots
  TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE ON atomic_save_responses
  TO authenticated, anon;
GRANT SELECT, INSERT ON atomic_save_results
  TO authenticated, anon;

CREATE FUNCTION pg_temp.atomic_receipt_count(p_owner_id UUID, p_operation_id TEXT)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT count(*)
  FROM wouldkeep_private.document_save_receipts receipt
  WHERE receipt.owner_id = p_owner_id
    AND (p_operation_id IS NULL OR receipt.operation_id = p_operation_id);
$$;

REVOKE ALL ON FUNCTION pg_temp.atomic_receipt_count(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.atomic_receipt_count(UUID, TEXT)
  TO authenticated, anon;

INSERT INTO atomic_save_state (key, value)
SELECT 'owner_id', id::TEXT
FROM public.profiles
ORDER BY created_at
LIMIT 1;

INSERT INTO atomic_save_state (key, value)
SELECT 'other_id', id::TEXT
FROM public.profiles
WHERE id <> (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_id')
ORDER BY created_at
LIMIT 1;

DO $$
BEGIN
  IF (SELECT count(*) FROM atomic_save_state WHERE key IN ('owner_id', 'other_id')) <> 2 THEN
    RAISE EXCEPTION 'atomic-save verification requires two profiles';
  END IF;
END;
$$;

WITH inserted AS (
  INSERT INTO public.knowledge_bases (owner_id, name, description)
  VALUES
    (
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_id'),
      'Atomic save owner library',
      'Rollback-only owner fixture'
    ),
    (
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_id'),
      'Atomic save second owner library',
      'Rollback-only cross-library fixture'
    ),
    (
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'other_id'),
      'Atomic save other library',
      'Rollback-only other-account fixture'
    )
  RETURNING id, name
)
INSERT INTO atomic_save_state (key, value)
SELECT CASE name
  WHEN 'Atomic save owner library' THEN 'owner_kb_id'
  WHEN 'Atomic save second owner library' THEN 'owner_second_kb_id'
  ELSE 'other_kb_id'
END, id::TEXT
FROM inserted;

DO $$
DECLARE
  historical_rejected BOOLEAN := FALSE;
BEGIN
  BEGIN
    ALTER TABLE public.tags
      DROP CONSTRAINT tags_knowledge_base_owner_fkey;

    INSERT INTO public.tags (knowledge_base_id, owner_id, name, normalized_name)
    VALUES (
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_kb_id'),
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'other_id'),
      'p1b historical cross owner squat',
      'p1b historical cross owner squat'
    );

    IF EXISTS (
      SELECT 1
      FROM public.tags tag
      LEFT JOIN public.knowledge_bases knowledge_base
        ON knowledge_base.id = tag.knowledge_base_id
       AND knowledge_base.owner_id = tag.owner_id
      WHERE knowledge_base.id IS NULL
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P1B01',
        MESSAGE = 'tag owner/knowledge-base owner invariant preflight failed';
    END IF;
  EXCEPTION WHEN SQLSTATE 'P1B01' THEN
    historical_rejected := TRUE;
  END;

  INSERT INTO atomic_save_results VALUES (
    'historical_cross_owner_tag_is_detected_without_residue',
    historical_rejected
      AND EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint catalog_constraint
        WHERE catalog_constraint.conrelid = 'public.tags'::REGCLASS
          AND catalog_constraint.conname = 'tags_knowledge_base_owner_fkey'
          AND catalog_constraint.convalidated
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.tags
        WHERE normalized_name = 'p1b historical cross owner squat'
      ),
    'The migration/preflight invariant rejects a simulated historical mismatch and its subtransaction leaves no row or DDL residue.'
  );
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT value FROM atomic_save_state WHERE key = 'owner_id'),
  TRUE
);

DO $$
DECLARE
  returned_state TEXT;
BEGIN
  BEGIN
    INSERT INTO public.tags (knowledge_base_id, owner_id, name, normalized_name)
    VALUES (
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'other_kb_id'),
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_id'),
      'p1b authenticated cross account squat',
      'p1b authenticated cross account squat'
    );
  EXCEPTION WHEN foreign_key_violation THEN
    GET STACKED DIAGNOSTICS returned_state = RETURNED_SQLSTATE;
  END;

  INSERT INTO atomic_save_results VALUES (
    'authenticated_cross_account_tag_squat_is_rejected',
    returned_state = '23503'
      AND NOT EXISTS (
        SELECT 1 FROM public.tags
        WHERE normalized_name = 'p1b authenticated cross account squat'
      ),
    'An authenticated owner passing RLS still cannot place a tag in another account knowledge base.'
  );
END;
$$;

RESET ROLE;

DO $$
DECLARE
  returned_state TEXT;
BEGIN
  BEGIN
    INSERT INTO public.tags (knowledge_base_id, owner_id, name, normalized_name)
    VALUES (
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_kb_id'),
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'other_id'),
      'p1b cross owner squat',
      'p1b cross owner squat'
    );
  EXCEPTION WHEN foreign_key_violation THEN
    GET STACKED DIAGNOSTICS returned_state = RETURNED_SQLSTATE;
  END;

  INSERT INTO atomic_save_results VALUES (
    'cross_owner_tag_insert_is_rejected_without_residue',
    returned_state = '23503'
      AND NOT EXISTS (
        SELECT 1 FROM public.tags
        WHERE normalized_name = 'p1b cross owner squat'
      ),
    'The composite tag owner FK rejects an account-scoped tag squat with SQLSTATE 23503 and zero residue.'
  );
END;
$$;

INSERT INTO public.tags (knowledge_base_id, owner_id, name, normalized_name)
VALUES (
  (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_kb_id'),
  (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_id'),
  'p1b reverse owner guard',
  'p1b reverse owner guard'
);

DO $$
DECLARE
  owner_update_state TEXT;
  knowledge_base_update_state TEXT;
BEGIN
  BEGIN
    UPDATE public.tags
    SET owner_id = (SELECT value::UUID FROM atomic_save_state WHERE key = 'other_id')
    WHERE normalized_name = 'p1b reverse owner guard';
  EXCEPTION WHEN foreign_key_violation THEN
    GET STACKED DIAGNOSTICS owner_update_state = RETURNED_SQLSTATE;
  END;

  BEGIN
    UPDATE public.tags
    SET knowledge_base_id = (
      SELECT value::UUID FROM atomic_save_state WHERE key = 'other_kb_id'
    )
    WHERE normalized_name = 'p1b reverse owner guard';
  EXCEPTION WHEN foreign_key_violation THEN
    GET STACKED DIAGNOSTICS knowledge_base_update_state = RETURNED_SQLSTATE;
  END;

  INSERT INTO atomic_save_results VALUES (
    'tag_owner_and_knowledge_base_updates_are_rejected',
    owner_update_state = '23503'
      AND knowledge_base_update_state = '23503'
      AND EXISTS (
        SELECT 1 FROM public.tags
        WHERE normalized_name = 'p1b reverse owner guard'
          AND owner_id = (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_id')
          AND knowledge_base_id = (
            SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_kb_id'
          )
      ),
    'Both child-key columns reject updates that would break the composite owner invariant.'
  );
END;
$$;

WITH inserted AS (
  INSERT INTO public.knowledge_bases (owner_id, name, description)
  VALUES (
    (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_id'),
    'Atomic save cascade library',
    'Rollback-only duplicate FK cascade fixture'
  )
  RETURNING id
)
INSERT INTO atomic_save_state (key, value)
SELECT 'cascade_kb_id', id::TEXT FROM inserted;

INSERT INTO public.tags (knowledge_base_id, owner_id, name, normalized_name)
VALUES (
  (SELECT value::UUID FROM atomic_save_state WHERE key = 'cascade_kb_id'),
  (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_id'),
  'p1b duplicate cascade tag',
  'p1b duplicate cascade tag'
);

DELETE FROM public.knowledge_bases
WHERE id = (SELECT value::UUID FROM atomic_save_state WHERE key = 'cascade_kb_id');

INSERT INTO atomic_save_results VALUES (
  'knowledge_base_deletion_cascades_tag_once',
  NOT EXISTS (
    SELECT 1 FROM public.knowledge_bases
    WHERE id = (SELECT value::UUID FROM atomic_save_state WHERE key = 'cascade_kb_id')
  )
    AND NOT EXISTS (
      SELECT 1 FROM public.tags WHERE normalized_name = 'p1b duplicate cascade tag'
    ),
  'The existing and composite knowledge-base FKs coexist and delete the child tag without error or residue.'
);

DO $$
DECLARE
  returned_state TEXT;
BEGIN
  BEGIN
    UPDATE public.knowledge_bases
    SET owner_id = (SELECT value::UUID FROM atomic_save_state WHERE key = 'other_id')
    WHERE id = (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_kb_id');
  EXCEPTION WHEN foreign_key_violation THEN
    GET STACKED DIAGNOSTICS returned_state = RETURNED_SQLSTATE;
  END;

  INSERT INTO atomic_save_results VALUES (
    'knowledge_base_owner_change_with_tags_is_rejected',
    returned_state = '23503'
      AND EXISTS (
        SELECT 1
        FROM public.knowledge_bases knowledge_base
        WHERE knowledge_base.id = (
          SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_kb_id'
        )
          AND knowledge_base.owner_id = (
            SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_id'
          )
      ),
    'ON UPDATE RESTRICT prevents a knowledge-base owner change from stranding existing tags.'
  );
END;
$$;

WITH inserted AS (
  INSERT INTO public.documents (
    knowledge_base_id, owner_id, title, body, status, visibility, revision
  )
  VALUES
    (
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_kb_id'),
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_id'),
      'Atomic source', 'Before atomic save', 'published', 'public', 0
    ),
    (
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_kb_id'),
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_id'),
      'Live target', 'Live target body', 'draft', 'private', 0
    ),
    (
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_kb_id'),
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_id'),
      'Continues target', 'Continues target body', 'draft', 'private', 0
    ),
    (
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_kb_id'),
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_id'),
      'Retained tombstone target', 'Deleted after link creation', 'draft', 'private', 0
    ),
    (
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_kb_id'),
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_id'),
      'Orphan deleted target', 'Never linked before deletion', 'draft', 'private', 0
    ),
    (
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_second_kb_id'),
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_id'),
      'Cross-library target', 'Cross-library body', 'draft', 'private', 0
    ),
    (
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'other_kb_id'),
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'other_id'),
      'Other document', 'Other-account body', 'draft', 'private', 0
    ),
    (
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_kb_id'),
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_id'),
      'Ready source', 'Ready becomes draft on save', 'ready', 'private', 0
    )
  RETURNING id, title
)
INSERT INTO atomic_save_state (key, value)
SELECT CASE title
  WHEN 'Atomic source' THEN 'source_id'
  WHEN 'Live target' THEN 'live_target_id'
  WHEN 'Continues target' THEN 'continues_target_id'
  WHEN 'Retained tombstone target' THEN 'tombstone_target_id'
  WHEN 'Orphan deleted target' THEN 'orphan_deleted_target_id'
  WHEN 'Cross-library target' THEN 'cross_library_target_id'
  WHEN 'Other document' THEN 'other_document_id'
  ELSE 'ready_source_id'
END, id::TEXT
FROM inserted;

INSERT INTO public.document_links (
  from_document_id, to_document_id, owner_id, relation_type, note
) VALUES
  (
    (SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id'),
    (SELECT value::UUID FROM atomic_save_state WHERE key = 'tombstone_target_id'),
    (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_id'),
    'prerequisite',
    ''
  ),
  (
    (SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id'),
    (SELECT value::UUID FROM atomic_save_state WHERE key = 'continues_target_id'),
    (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_id'),
    'continues',
    'continues-note-sentinel'
  ),
  (
    (SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id'),
    (SELECT value::UUID FROM atomic_save_state WHERE key = 'continues_target_id'),
    (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_id'),
    'related',
    ''
  );

UPDATE public.documents
SET deleted_at = clock_timestamp()
WHERE id IN (
  (SELECT value::UUID FROM atomic_save_state WHERE key = 'tombstone_target_id'),
  (SELECT value::UUID FROM atomic_save_state WHERE key = 'orphan_deleted_target_id')
);

INSERT INTO public.document_publications (
  document_id, owner_id, audience, source_revision, snapshot, published_at
) VALUES (
  (SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id'),
  (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_id'),
  'public',
  0,
  '{"title":"Published sentinel","body":"Published body stays unchanged","revision":0}'::JSONB,
  '2026-07-01T00:00:00Z'::TIMESTAMPTZ
);

UPDATE public.documents
SET published_at = '2026-07-01T00:00:00Z'::TIMESTAMPTZ,
    published_revision = 0
WHERE id = (SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id');

CREATE TEMP TABLE atomic_publication_before ON COMMIT DROP AS
SELECT document_id, audience, share_token, source_revision, snapshot, published_at, updated_at
FROM public.document_publications
WHERE document_id = (SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id');

GRANT SELECT ON atomic_publication_before TO authenticated;

CREATE TEMP TABLE atomic_published_document_before ON COMMIT DROP AS
SELECT id, status, visibility, published_at, published_revision
FROM public.documents
WHERE id = (SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id');

GRANT SELECT ON atomic_published_document_before TO authenticated;

INSERT INTO atomic_save_snapshots (key, snapshot)
SELECT 'first', jsonb_build_object(
  'title', 'Atomic saved title',
  'body', 'Atomic saved body',
  'topic', 'Reliability',
  'maturity', 'growing',
  'visibility', 'public',
  'tags', jsonb_build_array('ＲＣＷＡ', ' optics  '),
  'prerequisites', jsonb_build_array(
    (SELECT value FROM atomic_save_state WHERE key = 'tombstone_target_id')
  ),
  'related', jsonb_build_array(
    (SELECT value FROM atomic_save_state WHERE key = 'live_target_id')
  ),
  'sources', jsonb_build_array(
    jsonb_build_object(
      'kind', 'web', 'url', 'https://example.com/Foo?view=1#one',
      'title', 'Upper-path evidence', 'author', '', 'note', ''
    ),
    jsonb_build_object(
      'kind', 'web', 'url', 'https://example.com/foo?view=1#two',
      'title', 'Lower-path evidence', 'author', '', 'note', ''
    ),
    jsonb_build_object(
      'kind', 'personal', 'url', '', 'title', 'Personal observation',
      'author', '', 'note', 'Local-only experience'
    )
  )
);

-- Keep the NFKC fixture ASCII-file-safe: full-width RCWA normalizes to RCWA.
UPDATE atomic_save_snapshots
SET snapshot = jsonb_set(
  snapshot,
  '{tags}',
  jsonb_build_array(U&'\FF32\FF23\FF37\FF21', ' optics  ')
)
WHERE key = 'first';

INSERT INTO atomic_save_snapshots (key, snapshot)
SELECT 'canonical_equivalent', jsonb_set(
  (SELECT snapshot FROM atomic_save_snapshots WHERE key = 'first'),
  '{tags}',
  '["RCWA","optics"]'::JSONB
);

INSERT INTO atomic_save_snapshots (key, snapshot)
SELECT 'second',
  jsonb_set(
    jsonb_set(
      jsonb_set(
        (SELECT snapshot FROM atomic_save_snapshots WHERE key = 'canonical_equivalent'),
        '{title}', '"Second atomic title"'::JSONB
      ),
      '{body}', '"Second atomic body"'::JSONB
    ),
    '{prerequisites}', '[]'::JSONB
  );

INSERT INTO atomic_save_snapshots (key, snapshot)
SELECT 'orphan_deleted', jsonb_set(
  (SELECT snapshot FROM atomic_save_snapshots WHERE key = 'second'),
  '{prerequisites}',
  jsonb_build_array(
    (SELECT value FROM atomic_save_state WHERE key = 'orphan_deleted_target_id')
  )
);

INSERT INTO atomic_save_snapshots (key, snapshot)
SELECT 'empty', jsonb_build_object(
  'title', 'New idempotent document',
  'body', 'Created exactly once',
  'topic', '',
  'maturity', 'seed',
  'visibility', 'private',
  'tags', '[]'::JSONB,
  'prerequisites', '[]'::JSONB,
  'related', '[]'::JSONB,
  'sources', '[]'::JSONB
);

CREATE FUNCTION pg_temp.reject_forced_atomic_source()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.title = 'Force atomic rollback' THEN
    RAISE EXCEPTION 'forced source failure' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER atomic_save_force_source_failure
  BEFORE INSERT ON public.document_sources
  FOR EACH ROW
  EXECUTE FUNCTION pg_temp.reject_forced_atomic_source();

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT value FROM atomic_save_state WHERE key = 'owner_id'),
  TRUE
);

INSERT INTO atomic_save_responses (key, response)
SELECT 'first', public.save_document_snapshot_v1(
  'op-save-1',
  (SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id'),
  (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_kb_id'),
  0,
  (SELECT snapshot FROM atomic_save_snapshots WHERE key = 'first')
);

INSERT INTO atomic_save_results VALUES (
  'owner_atomic_save_returns_versioned_ack',
  (SELECT
    response->>'status' = 'saved'
    AND response->>'result_version' = '1'
    AND response->>'created' = 'false'
    AND response->>'revision' = '1'
    AND response->>'document_id' = (
      SELECT value FROM atomic_save_state WHERE key = 'source_id'
    )
    AND response->>'knowledge_base_id' = (
      SELECT value FROM atomic_save_state WHERE key = 'owner_kb_id'
    )
    AND response->>'saved_at' IS NOT NULL
    FROM atomic_save_responses WHERE key = 'first'),
  'A successful existing-document save returns the stable v1 acknowledgement shape.'
);

INSERT INTO atomic_save_responses (key, response)
SELECT 'replay', public.save_document_snapshot_v1(
  'op-save-1',
  (SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id'),
  (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_kb_id'),
  0,
  (SELECT snapshot FROM atomic_save_snapshots WHERE key = 'canonical_equivalent')
);

INSERT INTO atomic_save_results VALUES (
  'canonical_replay_returns_exact_saved_response',
  (SELECT first.response = replay.response
   FROM atomic_save_responses first
   CROSS JOIN atomic_save_responses replay
   WHERE first.key = 'first' AND replay.key = 'replay'),
  'NFKC/whitespace-equivalent tags hash identically and replay the byte-equivalent JSONB ack.'
);

DO $$
DECLARE
  rejected BOOLEAN := FALSE;
  message_text TEXT := '';
BEGIN
  BEGIN
    PERFORM public.save_document_snapshot_v1(
      'op-save-1',
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id'),
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_kb_id'),
      0,
      jsonb_set(
        (SELECT snapshot FROM atomic_save_snapshots WHERE key = 'canonical_equivalent'),
        '{body}', '"changed operation payload"'::JSONB
      )
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN
    GET STACKED DIAGNOSTICS message_text = MESSAGE_TEXT;
    rejected := message_text = 'operation_id_reused';
  END;
  INSERT INTO atomic_save_results VALUES (
    'operation_id_hash_mismatch_is_rejected', rejected,
    'A saved operation ID cannot be reused with a different canonical request.'
  );
END;
$$;

INSERT INTO atomic_save_results VALUES (
  'core_and_organization_commit_together',
  EXISTS (
    SELECT 1 FROM public.documents document
    WHERE document.id = (SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id')
      AND document.title = 'Atomic saved title'
      AND document.body = 'Atomic saved body'
      AND document.revision = 1
      AND document.status = 'published'
  )
  AND (
    SELECT array_agg(tag.name ORDER BY tag.normalized_name)
    FROM public.document_tags document_tag
    JOIN public.tags tag ON tag.id = document_tag.tag_id
    WHERE document_tag.document_id = (
      SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id'
    )
  ) = ARRAY['optics', 'RCWA']::TEXT[]
  AND (
    SELECT count(*) FROM public.document_sources source
    WHERE source.document_id = (SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id')
  ) = 3
  AND EXISTS (
    SELECT 1 FROM public.document_sources source
    WHERE source.document_id = (SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id')
      AND source.kind = 'personal'
      AND source.url IS NULL
  )
  AND EXISTS (
    SELECT 1 FROM public.document_versions version
    WHERE version.document_id = (SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id')
      AND version.version_no = 1
      AND version.snapshot->'__sources'->2->>'url' IS NULL
  ),
  'Core, tags, two case-sensitive paths, personal-source normalization, and version 1 committed.'
);

INSERT INTO atomic_save_results VALUES (
  'relationship_tombstone_and_continues_are_preserved',
  EXISTS (
    SELECT 1 FROM public.document_links link
    WHERE link.from_document_id = (SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id')
      AND link.to_document_id = (
        SELECT value::UUID FROM atomic_save_state WHERE key = 'tombstone_target_id'
      )
      AND link.relation_type = 'prerequisite'
  )
  AND EXISTS (
    SELECT 1 FROM public.document_links link
    WHERE link.from_document_id = (SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id')
      AND link.to_document_id = (
        SELECT value::UUID FROM atomic_save_state WHERE key = 'continues_target_id'
      )
      AND link.relation_type = 'continues'
      AND link.note = 'continues-note-sentinel'
  )
  AND EXISTS (
    SELECT 1 FROM public.document_links link
    WHERE link.from_document_id = (SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id')
      AND link.to_document_id = (
        SELECT value::UUID FROM atomic_save_state WHERE key = 'live_target_id'
      )
      AND link.relation_type = 'related'
  ),
  'An existing deleted-target prerequisite is retained while continues is outside synchronization.'
);

INSERT INTO atomic_save_results VALUES (
  'publication_snapshot_is_last_success_unchanged',
  EXISTS (
    SELECT 1
    FROM public.document_publications publication
    JOIN atomic_publication_before before
      ON before.document_id = publication.document_id
    WHERE publication.audience = before.audience
      AND publication.share_token = before.share_token
      AND publication.source_revision = before.source_revision
      AND publication.snapshot = before.snapshot
      AND publication.published_at = before.published_at
      AND publication.updated_at = before.updated_at
  )
  AND EXISTS (
    SELECT 1
    FROM public.documents document
    JOIN atomic_published_document_before before ON before.id = document.id
    WHERE document.status = before.status
      AND document.visibility = before.visibility
      AND document.published_at = before.published_at
      AND document.published_revision = before.published_revision
  ),
  'Editing a published document does not mutate, refresh, or revoke its last successful snapshot.'
);

INSERT INTO atomic_save_responses (key, response)
SELECT 'conflict', public.save_document_snapshot_v1(
  'op-conflict-1',
  (SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id'),
  (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_kb_id'),
  0,
  (SELECT snapshot FROM atomic_save_snapshots WHERE key = 'second')
);

INSERT INTO atomic_save_results VALUES (
  'stale_revision_returns_read_only_conflict',
  (SELECT
    response->>'status' = 'conflict'
    AND response->>'expected_revision' = '0'
    AND response->>'current_revision' = '1'
    AND response->'saved_at' = 'null'::JSONB
    FROM atomic_save_responses WHERE key = 'conflict')
  AND pg_temp.atomic_receipt_count(
    (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_id'),
    'op-conflict-1'
  ) = 0,
  'CAS conflict reports the current owner revision but writes no receipt or business row.'
);

INSERT INTO atomic_save_responses (key, response)
SELECT 'second', public.save_document_snapshot_v1(
  'op-save-2',
  (SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id'),
  (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_kb_id'),
  1,
  (SELECT snapshot FROM atomic_save_snapshots WHERE key = 'second')
);

INSERT INTO atomic_save_results VALUES (
  'omitting_tombstone_removes_it_without_touching_continues',
  NOT EXISTS (
    SELECT 1 FROM public.document_links link
    WHERE link.from_document_id = (SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id')
      AND link.to_document_id = (
        SELECT value::UUID FROM atomic_save_state WHERE key = 'tombstone_target_id'
      )
      AND link.relation_type = 'prerequisite'
  )
  AND EXISTS (
    SELECT 1 FROM public.document_links link
    WHERE link.from_document_id = (SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id')
      AND link.relation_type = 'continues'
      AND link.note = 'continues-note-sentinel'
  ),
  'Omitting an existing tombstone deletes it while the unrelated continues edge remains.'
);

INSERT INTO atomic_save_responses (key, response)
SELECT 'conflict_recomputed', public.save_document_snapshot_v1(
  'op-conflict-1',
  (SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id'),
  (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_kb_id'),
  0,
  (SELECT snapshot FROM atomic_save_snapshots WHERE key = 'second')
);

INSERT INTO atomic_save_results VALUES (
  'unpersisted_conflict_recomputes_without_write_amplification',
  (SELECT response->>'current_revision' = '2'
   FROM atomic_save_responses WHERE key = 'conflict_recomputed')
  AND pg_temp.atomic_receipt_count(
    (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_id'),
    'op-conflict-1'
  ) = 0,
  'A repeated conflict reflects the later revision and still creates no append-only row.'
);

DO $$
DECLARE
  rejected BOOLEAN := FALSE;
  before_revision BIGINT;
BEGIN
  SELECT revision INTO before_revision
  FROM public.documents
  WHERE id = (SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id');
  BEGIN
    PERFORM public.save_document_snapshot_v1(
      'op-orphan-deleted',
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id'),
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_kb_id'),
      before_revision,
      (SELECT snapshot FROM atomic_save_snapshots WHERE key = 'orphan_deleted')
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN
    rejected := TRUE;
  END;
  INSERT INTO atomic_save_results VALUES (
    'new_deleted_target_relationship_is_rejected',
    rejected
      AND (SELECT revision FROM public.documents WHERE id = (
        SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id'
      )) = before_revision
      AND pg_temp.atomic_receipt_count(
        (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_id'),
        'op-orphan-deleted'
      ) = 0,
    'Only a pre-existing tombstone may be retained; a new deleted-target relation is zero-write.'
  );
END;
$$;

DO $$
DECLARE
  rejected BOOLEAN := FALSE;
  before_revision BIGINT;
  before_version_count BIGINT;
  before_tags JSONB;
  before_links JSONB;
  before_sources JSONB;
  failing_snapshot JSONB;
BEGIN
  SELECT revision INTO before_revision
  FROM public.documents
  WHERE id = (SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id');
  SELECT count(*) INTO before_version_count
  FROM public.document_versions version
  WHERE version.document_id = (SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id');
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('name', tag.name, 'key', tag.normalized_name)
    ORDER BY tag.normalized_name
  ), '[]'::JSONB) INTO before_tags
  FROM public.document_tags document_tag
  JOIN public.tags tag ON tag.id = document_tag.tag_id
  WHERE document_tag.document_id = (
    SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id'
  );
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'to', link.to_document_id, 'type', link.relation_type, 'note', link.note
    ) ORDER BY link.relation_type, link.to_document_id
  ), '[]'::JSONB) INTO before_links
  FROM public.document_links link
  WHERE link.from_document_id = (
    SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id'
  );
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'kind', source.kind, 'url', source.url, 'title', source.title,
      'author', source.author, 'note', source.note, 'sort_order', source.sort_order
    ) ORDER BY source.sort_order
  ), '[]'::JSONB) INTO before_sources
  FROM public.document_sources source
  WHERE source.document_id = (
    SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id'
  );
  failing_snapshot := jsonb_set(
    (SELECT snapshot FROM atomic_save_snapshots WHERE key = 'second'),
    '{sources,0,title}',
    '"Force atomic rollback"'::JSONB
  );
  BEGIN
    PERFORM public.save_document_snapshot_v1(
      'op-force-rollback',
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id'),
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_kb_id'),
      before_revision,
      failing_snapshot
    );
  EXCEPTION WHEN check_violation THEN
    rejected := TRUE;
  END;
  INSERT INTO atomic_save_results VALUES (
    'downstream_failure_rolls_back_every_table',
    rejected
      AND (SELECT revision FROM public.documents WHERE id = (
        SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id'
      )) = before_revision
      AND (SELECT body FROM public.documents WHERE id = (
        SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id'
      )) = 'Second atomic body'
      AND (SELECT count(*) FROM public.document_versions version WHERE version.document_id = (
        SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id'
      )) = before_version_count
      AND (SELECT COALESCE(jsonb_agg(
        jsonb_build_object('name', tag.name, 'key', tag.normalized_name)
        ORDER BY tag.normalized_name
      ), '[]'::JSONB)
      FROM public.document_tags document_tag
      JOIN public.tags tag ON tag.id = document_tag.tag_id
      WHERE document_tag.document_id = (
        SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id'
      )) = before_tags
      AND (SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'to', link.to_document_id, 'type', link.relation_type, 'note', link.note
        ) ORDER BY link.relation_type, link.to_document_id
      ), '[]'::JSONB)
      FROM public.document_links link
      WHERE link.from_document_id = (
        SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id'
      )) = before_links
      AND (SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'kind', source.kind, 'url', source.url, 'title', source.title,
          'author', source.author, 'note', source.note, 'sort_order', source.sort_order
        ) ORDER BY source.sort_order
      ), '[]'::JSONB)
      FROM public.document_sources source
      WHERE source.document_id = (
        SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id'
      )) = before_sources
      AND pg_temp.atomic_receipt_count(
        (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_id'),
        'op-force-rollback'
      ) = 0,
    'A forced source failure rolls back core/version/tags/links/sources and the saved receipt.'
  );
END;
$$;

DO $$
DECLARE
  rejected BOOLEAN := FALSE;
  secret_snapshot JSONB;
BEGIN
  secret_snapshot := jsonb_set(
    (SELECT snapshot FROM atomic_save_snapshots WHERE key = 'second'),
    '{sources,0,url}',
    '"https://example.com/evidence?%74oken=secret"'::JSONB
  );
  BEGIN
    PERFORM public.save_document_snapshot_v1(
      'op-secret-url',
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id'),
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_kb_id'),
      2,
      secret_snapshot
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN
    rejected := TRUE;
  END;
  INSERT INTO atomic_save_results VALUES (
    'percent_encoded_sensitive_source_key_is_rejected',
    rejected AND pg_temp.atomic_receipt_count(
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_id'),
      'op-secret-url'
    ) = 0,
    'Percent decoding catches a disguised token query key before any write.'
  );
END;
$$;

DO $$
DECLARE
  rejected BOOLEAN := FALSE;
  duplicate_snapshot JSONB;
BEGIN
  duplicate_snapshot := jsonb_set(
    (SELECT snapshot FROM atomic_save_snapshots WHERE key = 'second'),
    '{sources}',
    jsonb_build_array(
      jsonb_build_object(
        'kind', 'web', 'url', 'https://example.com/same#one',
        'title', '', 'author', '', 'note', ''
      ),
      jsonb_build_object(
        'kind', 'web', 'url', 'https://example.com/same#two',
        'title', '', 'author', '', 'note', ''
      )
    )
  );
  BEGIN
    PERFORM public.save_document_snapshot_v1(
      'op-duplicate-source',
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id'),
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_kb_id'),
      2,
      duplicate_snapshot
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN
    rejected := TRUE;
  END;
  INSERT INTO atomic_save_results VALUES (
    'source_duplicate_ignores_fragment_but_preserves_path_case',
    rejected
      AND EXISTS (
        SELECT 1 FROM public.document_sources source
        WHERE source.document_id = (
          SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id'
        ) AND source.url LIKE 'https://example.com/Foo%'
      )
      AND EXISTS (
        SELECT 1 FROM public.document_sources source
        WHERE source.document_id = (
          SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id'
        ) AND source.url LIKE 'https://example.com/foo%'
      ),
    'Fragments do not distinguish duplicate URLs, while case-sensitive paths remain distinct.'
  );
END;
$$;

INSERT INTO atomic_save_responses (key, response)
SELECT 'new_first', public.save_document_snapshot_v1(
  'op-new-1',
  NULL,
  (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_kb_id'),
  0,
  (SELECT snapshot FROM atomic_save_snapshots WHERE key = 'empty')
);

INSERT INTO atomic_save_responses (key, response)
SELECT 'new_replay', public.save_document_snapshot_v1(
  'op-new-1',
  NULL,
  (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_kb_id'),
  0,
  (SELECT snapshot FROM atomic_save_snapshots WHERE key = 'empty')
);

INSERT INTO atomic_save_results VALUES (
  'new_document_lost_ack_replay_creates_exactly_once',
  (SELECT first.response = replay.response
   FROM atomic_save_responses first
   CROSS JOIN atomic_save_responses replay
   WHERE first.key = 'new_first' AND replay.key = 'new_replay')
  AND (SELECT response->>'created' = 'true' AND response->>'revision' = '0'
       FROM atomic_save_responses WHERE key = 'new_first')
  AND (
    SELECT count(*) FROM public.documents document
    WHERE document.owner_id = (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_id')
      AND document.title = 'New idempotent document'
  ) = 1
  AND pg_temp.atomic_receipt_count(
    (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_id'),
    'op-new-1'
  ) = 1,
  'A lost create acknowledgement replays the same result without a duplicate document or version.'
);

INSERT INTO atomic_save_state (key, value)
SELECT 'hard_deleted_new_document_id', response->>'document_id'
FROM atomic_save_responses
WHERE key = 'new_first';

RESET ROLE;

DELETE FROM public.documents
WHERE id = (
  SELECT value::UUID FROM atomic_save_state WHERE key = 'hard_deleted_new_document_id'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT value FROM atomic_save_state WHERE key = 'owner_id'),
  TRUE
);

INSERT INTO atomic_save_responses (key, response)
SELECT 'new_replay_after_hard_delete', public.save_document_snapshot_v1(
  'op-new-1',
  NULL,
  (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_kb_id'),
  0,
  (SELECT snapshot FROM atomic_save_snapshots WHERE key = 'empty')
);

INSERT INTO atomic_save_results VALUES (
  'new_document_hard_delete_replay_does_not_recreate',
  (SELECT first.response = replay.response
   FROM atomic_save_responses first
   CROSS JOIN atomic_save_responses replay
   WHERE first.key = 'new_first' AND replay.key = 'new_replay_after_hard_delete')
  AND NOT EXISTS (
    SELECT 1 FROM public.documents
    WHERE id = (
      SELECT value::UUID FROM atomic_save_state WHERE key = 'hard_deleted_new_document_id'
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.documents
    WHERE owner_id = (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_id')
      AND title = 'New idempotent document'
  )
  AND pg_temp.atomic_receipt_count(
    (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_id'),
    'op-new-1'
  ) = 1,
  'A successful create receipt survives a single-document hard delete, so a delayed lost-ACK replay cannot create a second document.'
);

INSERT INTO atomic_save_responses (key, response)
SELECT 'ready_save', public.save_document_snapshot_v1(
  'op-ready-1',
  (SELECT value::UUID FROM atomic_save_state WHERE key = 'ready_source_id'),
  (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_kb_id'),
  0,
  (SELECT snapshot FROM atomic_save_snapshots WHERE key = 'empty')
);

INSERT INTO atomic_save_results VALUES (
  'nonpublished_status_returns_to_draft',
  (SELECT status = 'draft'
   FROM public.documents
   WHERE id = (SELECT value::UUID FROM atomic_save_state WHERE key = 'ready_source_id')),
  'The RPC matches the legacy save path: published stays published; every other live status saves as draft.'
);

INSERT INTO atomic_save_responses (key, response)
SELECT 'missing_kb', public.save_document_snapshot_v1(
  'op-missing-kb',
  NULL,
  uuid_generate_v4(),
  0,
  (SELECT snapshot FROM atomic_save_snapshots WHERE key = 'empty')
);

INSERT INTO atomic_save_results VALUES (
  'not_found_is_zero_write',
  (SELECT response->>'status' = 'not_found'
      AND response->>'document_id' IS NULL
      AND response->'saved_at' = 'null'::JSONB
   FROM atomic_save_responses WHERE key = 'missing_kb')
  AND pg_temp.atomic_receipt_count(
    (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_id'),
    'op-missing-kb'
  ) = 0,
  'An unavailable knowledge base yields a non-leaking read-only result with no receipt amplification.'
);

INSERT INTO atomic_save_responses (key, response)
SELECT 'cross_kb_source', public.save_document_snapshot_v1(
  'op-cross-kb-source',
  (SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id'),
  (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_second_kb_id'),
  2,
  (SELECT snapshot FROM atomic_save_snapshots WHERE key = 'second')
);

INSERT INTO atomic_save_results VALUES (
  'owner_document_cannot_move_across_knowledge_bases',
  (SELECT response->>'status' = 'not_found' AND response->>'document_id' IS NULL
   FROM atomic_save_responses WHERE key = 'cross_kb_source')
  AND pg_temp.atomic_receipt_count(
    (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_id'),
    'op-cross-kb-source'
  ) = 0,
  'An owner cannot bind an existing document to another owned knowledge base through this RPC.'
);

INSERT INTO atomic_save_responses (key, response)
SELECT 'deleted_source', public.save_document_snapshot_v1(
  'op-deleted-source',
  (SELECT value::UUID FROM atomic_save_state WHERE key = 'tombstone_target_id'),
  (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_kb_id'),
  0,
  (SELECT snapshot FROM atomic_save_snapshots WHERE key = 'empty')
);

INSERT INTO atomic_save_results VALUES (
  'soft_deleted_source_is_not_writable',
  (SELECT response->>'status' = 'not_found' AND response->>'document_id' IS NULL
   FROM atomic_save_responses WHERE key = 'deleted_source')
  AND pg_temp.atomic_receipt_count(
    (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_id'),
    'op-deleted-source'
  ) = 0,
  'A soft-deleted document cannot be revived or changed through the snapshot save RPC.'
);

DO $$
DECLARE
  rejected BOOLEAN := FALSE;
  cross_library_snapshot JSONB;
BEGIN
  cross_library_snapshot := jsonb_set(
    (SELECT snapshot FROM atomic_save_snapshots WHERE key = 'second'),
    '{related}',
    jsonb_build_array(
      (SELECT value FROM atomic_save_state WHERE key = 'cross_library_target_id')
    )
  );
  BEGIN
    PERFORM public.save_document_snapshot_v1(
      'op-cross-kb-relation',
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id'),
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_kb_id'),
      2,
      cross_library_snapshot
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN
    rejected := TRUE;
  END;
  INSERT INTO atomic_save_results VALUES (
    'cross_knowledge_base_relationship_is_rejected',
    rejected
      AND (SELECT revision FROM public.documents WHERE id = (
        SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id'
      )) = 2
      AND pg_temp.atomic_receipt_count(
        (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_id'),
        'op-cross-kb-relation'
      ) = 0,
    'A relation target in another owned knowledge base fails before all writes.'
  );
END;
$$;

DO $$
DECLARE
  rejected BOOLEAN := FALSE;
  message_text TEXT := '';
BEGIN
  BEGIN
    PERFORM public.save_document_snapshot_v1(
      'op-unsafe-revision',
      NULL,
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_kb_id'),
      9007199254740991,
      (SELECT snapshot FROM atomic_save_snapshots WHERE key = 'empty')
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN
    GET STACKED DIAGNOSTICS message_text = MESSAGE_TEXT;
    rejected := message_text = 'expected_revision must allow a JS-safe next revision';
  END;
  INSERT INTO atomic_save_results VALUES (
    'unsafe_expected_revision_is_rejected',
    rejected AND pg_temp.atomic_receipt_count(
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_id'),
      'op-unsafe-revision'
    ) = 0,
    'The runtime refuses any expected revision that cannot advance within JS safe integers.'
  );
END;
$$;

DO $$
DECLARE
  denied BOOLEAN := FALSE;
BEGIN
  BEGIN
    PERFORM 1 FROM wouldkeep_private.document_save_receipts LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN
    denied := TRUE;
  END;
  INSERT INTO atomic_save_results VALUES (
    'authenticated_cannot_access_private_receipts_directly', denied,
    'The API role has neither private-schema USAGE nor receipt table DML.'
  );
END;
$$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT value FROM atomic_save_state WHERE key = 'other_id'),
  TRUE
);

INSERT INTO atomic_save_responses (key, response)
SELECT 'other_same_operation', public.save_document_snapshot_v1(
  'op-save-1',
  (SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id'),
  (SELECT value::UUID FROM atomic_save_state WHERE key = 'other_kb_id'),
  0,
  (SELECT snapshot FROM atomic_save_snapshots WHERE key = 'canonical_equivalent')
);

INSERT INTO atomic_save_results VALUES (
  'other_user_cannot_replay_or_bind_owner_receipt',
  (SELECT response->>'status' = 'not_found'
      AND response->>'document_id' IS NULL
   FROM atomic_save_responses WHERE key = 'other_same_operation')
  AND pg_temp.atomic_receipt_count(
    (SELECT value::UUID FROM atomic_save_state WHERE key = 'other_id'),
    'op-save-1'
  ) = 0,
  'Receipt identity is owner-scoped; another owner gets no saved replay or document identifier.'
);

RESET ROLE;

INSERT INTO atomic_save_results VALUES (
  'other_user_attempt_leaves_owner_state_unchanged',
  EXISTS (
    SELECT 1 FROM public.documents document
    WHERE document.id = (SELECT value::UUID FROM atomic_save_state WHERE key = 'source_id')
      AND document.body = 'Second atomic body'
      AND document.revision = 2
  )
  AND (
    SELECT count(*) FROM wouldkeep_private.document_save_receipts receipt
    WHERE receipt.owner_id = (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_id')
      AND receipt.operation_id = 'op-save-1'
  ) = 1,
  'Another account using the same operation ID cannot mutate or replace the owner saved receipt.'
);

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role', 'anon', TRUE);
SELECT set_config('request.jwt.claim.sub', '', TRUE);

DO $$
DECLARE
  denied BOOLEAN := FALSE;
BEGIN
  BEGIN
    PERFORM public.save_document_snapshot_v1(
      'op-anon', NULL,
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_kb_id'),
      0,
      (SELECT snapshot FROM atomic_save_snapshots WHERE key = 'empty')
    );
  EXCEPTION WHEN insufficient_privilege THEN
    denied := TRUE;
  END;
  INSERT INTO atomic_save_results VALUES (
    'anonymous_execute_is_denied', denied,
    'Anonymous callers cannot execute the save RPC.'
  );
END;
$$;

RESET ROLE;

INSERT INTO atomic_save_results VALUES (
  'only_successful_commits_have_receipts',
  (
    SELECT array_agg(operation_id ORDER BY operation_id)
    FROM wouldkeep_private.document_save_receipts
    WHERE owner_id = (SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_id')
  ) = ARRAY['op-new-1', 'op-ready-1', 'op-save-1', 'op-save-2']::TEXT[],
  'Conflict, not-found, invalid, and failed operations cannot grow the append-only receipt table.'
);

INSERT INTO atomic_save_results VALUES (
  'saved_receipts_contain_no_document_body',
  NOT EXISTS (
    SELECT 1
    FROM information_schema.columns catalog_column
    WHERE catalog_column.table_schema = 'wouldkeep_private'
      AND catalog_column.table_name = 'document_save_receipts'
      AND catalog_column.column_name IN ('body', 'snapshot', 'payload')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM wouldkeep_private.document_save_receipts receipt
    WHERE receipt.response ? 'body'
      OR receipt.response::TEXT LIKE '%Atomic saved body%'
      OR receipt.response::TEXT LIKE '%Created exactly once%'
  ),
  'The private receipt stores hashes and acknowledgement metadata only, never editor content.'
);

DO $$
DECLARE
  rejected_count INTEGER := 0;
  owner_id_value UUID := (
    SELECT value::UUID FROM atomic_save_state WHERE key = 'owner_id'
  );
BEGIN
  BEGIN
    INSERT INTO wouldkeep_private.document_save_receipts (
      owner_id, operation_id, request_hash, result_version, document_id,
      knowledge_base_id, created, resulting_revision, response, saved_at
    )
    SELECT
      receipt.owner_id,
      'op-forged-extra-key',
      repeat('a', 64),
      receipt.result_version,
      receipt.document_id,
      receipt.knowledge_base_id,
      receipt.created,
      receipt.resulting_revision,
      receipt.response || jsonb_build_object(
        'operation_id', 'op-forged-extra-key', 'body', 'must fail'
      ),
      receipt.saved_at
    FROM wouldkeep_private.document_save_receipts receipt
    WHERE receipt.owner_id = owner_id_value AND receipt.operation_id = 'op-save-1';
  EXCEPTION WHEN check_violation THEN
    rejected_count := rejected_count + 1;
  END;
  BEGIN
    INSERT INTO wouldkeep_private.document_save_receipts (
      owner_id, operation_id, request_hash, result_version, document_id,
      knowledge_base_id, created, resulting_revision, response, saved_at
    )
    SELECT
      receipt.owner_id,
      'op-forged-null-field',
      repeat('b', 64),
      receipt.result_version,
      receipt.document_id,
      receipt.knowledge_base_id,
      receipt.created,
      receipt.resulting_revision,
      jsonb_set(
        receipt.response || jsonb_build_object('operation_id', 'op-forged-null-field'),
        '{created}',
        'null'::JSONB
      ),
      receipt.saved_at
    FROM wouldkeep_private.document_save_receipts receipt
    WHERE receipt.owner_id = owner_id_value AND receipt.operation_id = 'op-save-1';
  EXCEPTION WHEN check_violation THEN
    rejected_count := rejected_count + 1;
  END;
  BEGIN
    INSERT INTO wouldkeep_private.document_save_receipts (
      owner_id, operation_id, request_hash, result_version, document_id,
      knowledge_base_id, created, resulting_revision, response, saved_at
    )
    SELECT
      receipt.owner_id,
      'op-forged-cross-owner-document',
      repeat('c', 64),
      receipt.result_version,
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'other_document_id'),
      (SELECT value::UUID FROM atomic_save_state WHERE key = 'other_kb_id'),
      receipt.created,
      receipt.resulting_revision,
      receipt.response || jsonb_build_object(
        'operation_id', 'op-forged-cross-owner-document',
        'document_id', (SELECT value FROM atomic_save_state WHERE key = 'other_document_id'),
        'knowledge_base_id', (SELECT value FROM atomic_save_state WHERE key = 'other_kb_id')
      ),
      receipt.saved_at
    FROM wouldkeep_private.document_save_receipts receipt
    WHERE receipt.owner_id = owner_id_value AND receipt.operation_id = 'op-save-1';
  EXCEPTION WHEN check_violation THEN
    rejected_count := rejected_count + 1;
  END;

  INSERT INTO atomic_save_results VALUES (
    'saved_receipts_reject_malformed_inserts',
    rejected_count = 3
      AND NOT EXISTS (
        SELECT 1 FROM wouldkeep_private.document_save_receipts
        WHERE operation_id IN (
          'op-forged-extra-key',
          'op-forged-null-field',
          'op-forged-cross-owner-document'
        )
      ),
    'Exact keys/types and owner-document validation reject forged elevated inserts.'
  );
END;
$$;

INSERT INTO atomic_save_results VALUES (
  'publication_last_success_survives_all_save_attempts',
  EXISTS (
    SELECT 1
    FROM public.document_publications publication
    JOIN atomic_publication_before before
      ON before.document_id = publication.document_id
    JOIN public.documents document ON document.id = publication.document_id
    JOIN atomic_published_document_before document_before ON document_before.id = document.id
    WHERE publication.audience = before.audience
      AND publication.share_token = before.share_token
      AND publication.source_revision = before.source_revision
      AND publication.snapshot = before.snapshot
      AND publication.published_at = before.published_at
      AND publication.updated_at = before.updated_at
      AND document.status = document_before.status
      AND document.visibility = document_before.visibility
      AND document.published_at = document_before.published_at
      AND document.published_revision = document_before.published_revision
  ),
  'Second save, replay, conflict, invalid, and other-owner attempts leave all publication metadata unchanged.'
);

WITH inserted AS (
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000'::UUID,
    uuid_generate_v4(),
    'authenticated',
    'authenticated',
    'atomic-save-account-cleanup@example.test',
    '',
    clock_timestamp(),
    '{"provider":"email","providers":["email"]}'::JSONB,
    '{"display_name":"Atomic cleanup fixture"}'::JSONB,
    clock_timestamp(),
    clock_timestamp()
  )
  RETURNING id
)
INSERT INTO atomic_save_state (key, value)
SELECT 'cleanup_owner_id', id::TEXT FROM inserted;

WITH inserted AS (
  INSERT INTO public.knowledge_bases (owner_id, name, description)
  VALUES (
    (SELECT value::UUID FROM atomic_save_state WHERE key = 'cleanup_owner_id'),
    'Atomic cleanup library',
    'Rollback-only account deletion fixture'
  )
  RETURNING id
)
INSERT INTO atomic_save_state (key, value)
SELECT 'cleanup_kb_id', id::TEXT FROM inserted;

INSERT INTO public.tags (knowledge_base_id, owner_id, name, normalized_name)
VALUES (
  (SELECT value::UUID FROM atomic_save_state WHERE key = 'cleanup_kb_id'),
  (SELECT value::UUID FROM atomic_save_state WHERE key = 'cleanup_owner_id'),
  'p1b account cascade tag',
  'p1b account cascade tag'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT value FROM atomic_save_state WHERE key = 'cleanup_owner_id'),
  TRUE
);

INSERT INTO atomic_save_responses (key, response)
SELECT 'cleanup_save', public.save_document_snapshot_v1(
  'op-account-cleanup',
  NULL,
  (SELECT value::UUID FROM atomic_save_state WHERE key = 'cleanup_kb_id'),
  0,
  (SELECT snapshot FROM atomic_save_snapshots WHERE key = 'empty')
);

RESET ROLE;

DO $$
DECLARE
  cleanup_owner UUID := (
    SELECT value::UUID FROM atomic_save_state WHERE key = 'cleanup_owner_id'
  );
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM wouldkeep_private.document_save_receipts
    WHERE owner_id = cleanup_owner AND operation_id = 'op-account-cleanup'
  ) THEN
    RAISE EXCEPTION 'account-cleanup fixture receipt was not created';
  END IF;

  DELETE FROM auth.users WHERE id = cleanup_owner;

  INSERT INTO atomic_save_results VALUES (
    'account_deletion_cascades_saved_receipts',
    NOT EXISTS (
      SELECT 1 FROM auth.users WHERE id = cleanup_owner
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE id = cleanup_owner
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.knowledge_bases WHERE owner_id = cleanup_owner
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.documents WHERE owner_id = cleanup_owner
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.tags WHERE owner_id = cleanup_owner
    )
    AND NOT EXISTS (
      SELECT 1 FROM wouldkeep_private.document_save_receipts WHERE owner_id = cleanup_owner
    ),
    'Deleting an account still cascades private receipts and all rollback-only owner fixtures.'
  );
END;
$$;

INSERT INTO atomic_save_results VALUES (
  'same_owner_tag_save_preserves_global_owner_invariant',
  NOT EXISTS (
    SELECT 1
    FROM public.tags tag
    LEFT JOIN public.knowledge_bases knowledge_base
      ON knowledge_base.id = tag.knowledge_base_id
     AND knowledge_base.owner_id = tag.owner_id
    WHERE knowledge_base.id IS NULL
  ),
  'Normal same-owner RPC saves and direct fixture tags preserve the global owner invariant.'
);

SELECT test_name, passed, detail
FROM atomic_save_results
ORDER BY test_name;

DO $$
DECLARE
  expected_names TEXT[] := ARRAY[
    'account_deletion_cascades_saved_receipts',
    'anonymous_execute_is_denied',
    'authenticated_cross_account_tag_squat_is_rejected',
    'authenticated_cannot_access_private_receipts_directly',
    'canonical_replay_returns_exact_saved_response',
    'core_and_organization_commit_together',
    'cross_owner_tag_insert_is_rejected_without_residue',
    'cross_knowledge_base_relationship_is_rejected',
    'downstream_failure_rolls_back_every_table',
    'historical_cross_owner_tag_is_detected_without_residue',
    'knowledge_base_owner_change_with_tags_is_rejected',
    'knowledge_base_deletion_cascades_tag_once',
    'new_deleted_target_relationship_is_rejected',
    'new_document_hard_delete_replay_does_not_recreate',
    'new_document_lost_ack_replay_creates_exactly_once',
    'nonpublished_status_returns_to_draft',
    'not_found_is_zero_write',
    'omitting_tombstone_removes_it_without_touching_continues',
    'only_successful_commits_have_receipts',
    'operation_id_hash_mismatch_is_rejected',
    'other_user_attempt_leaves_owner_state_unchanged',
    'other_user_cannot_replay_or_bind_owner_receipt',
    'owner_document_cannot_move_across_knowledge_bases',
    'owner_atomic_save_returns_versioned_ack',
    'percent_encoded_sensitive_source_key_is_rejected',
    'publication_last_success_survives_all_save_attempts',
    'publication_snapshot_is_last_success_unchanged',
    'relationship_tombstone_and_continues_are_preserved',
    'saved_receipts_contain_no_document_body',
    'saved_receipts_reject_malformed_inserts',
    'same_owner_tag_save_preserves_global_owner_invariant',
    'soft_deleted_source_is_not_writable',
    'source_duplicate_ignores_fragment_but_preserves_path_case',
    'stale_revision_returns_read_only_conflict',
    'tag_owner_and_knowledge_base_updates_are_rejected',
    'unpersisted_conflict_recomputes_without_write_amplification',
    'unsafe_expected_revision_is_rejected'
  ]::TEXT[];
BEGIN
  IF (SELECT array_agg(test_name ORDER BY test_name) FROM atomic_save_results)
    IS DISTINCT FROM (SELECT array_agg(name ORDER BY name) FROM unnest(expected_names) name)
  THEN
    RAISE EXCEPTION 'atomic-save assertion set is incomplete or unexpected';
  END IF;

  IF EXISTS (SELECT 1 FROM atomic_save_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'one or more atomic-save assertions failed';
  END IF;
END;
$$;

ROLLBACK;
