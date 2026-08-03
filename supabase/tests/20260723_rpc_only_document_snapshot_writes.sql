-- Rollback-only runtime matrix for 20260723000100.
-- Run as postgres after the migration. Every user, fixture, receipt, and temporary
-- grant is contained by this transaction and the final top-level ROLLBACK.

BEGIN;

-- The repository's disposable schema bootstrap intentionally omits the legacy
-- authenticated knowledge-base SELECT grant. Production already requires that
-- read for workspace/publication RLS. Keep this harness-only grant transactional.
GRANT SELECT ON public.knowledge_bases TO authenticated;

CREATE TEMP TABLE rpc_only_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE rpc_only_values (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE rpc_only_responses (
  key TEXT PRIMARY KEY,
  response JSONB NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE rpc_only_results (
  test_name TEXT PRIMARY KEY,
  passed BOOLEAN NOT NULL,
  detail TEXT NOT NULL
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE ON rpc_only_state TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE ON rpc_only_values TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE ON rpc_only_responses TO authenticated, anon;
GRANT SELECT, INSERT ON rpc_only_results TO authenticated, anon;

CREATE FUNCTION pg_temp.rpc_only_receipt_count(p_owner_id UUID, p_operation_id TEXT)
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

CREATE FUNCTION pg_temp.rpc_only_owner_fingerprint(p_owner_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT jsonb_build_object(
    'documents', (
      SELECT count(*) FROM public.documents document
      WHERE document.owner_id = p_owner_id
    ),
    'versions', (
      SELECT count(*) FROM public.document_versions version
      WHERE version.owner_id = p_owner_id
    ),
    'tags', (
      SELECT count(*) FROM public.tags tag WHERE tag.owner_id = p_owner_id
    ),
    'document_tags', (
      SELECT count(*) FROM public.document_tags document_tag
      WHERE document_tag.owner_id = p_owner_id
    ),
    'links', (
      SELECT count(*) FROM public.document_links link WHERE link.owner_id = p_owner_id
    ),
    'sources', (
      SELECT count(*) FROM public.document_sources source WHERE source.owner_id = p_owner_id
    ),
    'publications', (
      SELECT count(*) FROM public.document_publications publication
      WHERE publication.owner_id = p_owner_id
    ),
    'receipts', (
      SELECT count(*) FROM wouldkeep_private.document_save_receipts receipt
      WHERE receipt.owner_id = p_owner_id
    ),
    'legacy_source', COALESCE((
      SELECT jsonb_build_object(
        'id', document.id,
        'knowledge_base_id', document.knowledge_base_id,
        'owner_id', document.owner_id,
        'title', document.title,
        'body', document.body,
        'topic', document.topic,
        'maturity', document.maturity,
        'status', document.status,
        'visibility', document.visibility,
        'revision', document.revision,
        'deleted_at', document.deleted_at,
        'published_at', document.published_at,
        'published_revision', document.published_revision,
        'updated_at', document.updated_at
      )
      FROM public.documents document
      WHERE document.id = (
        SELECT value::UUID FROM rpc_only_state WHERE key = 'legacy_source_id'
      )
    ), 'null'::JSONB)
  );
$$;

REVOKE ALL ON FUNCTION pg_temp.rpc_only_receipt_count(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION pg_temp.rpc_only_owner_fingerprint(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.rpc_only_receipt_count(UUID, TEXT)
  TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.rpc_only_owner_fingerprint(UUID)
  TO authenticated, anon;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.knowledge_bases
    WHERE name LIKE 'RPC-only ACL rollback fixture%'
  ) OR EXISTS (
    SELECT 1 FROM wouldkeep_private.document_save_receipts
    WHERE operation_id LIKE 'rpc-only-acl-%'
  ) THEN
    RAISE EXCEPTION 'rollback fixture residue exists before the matrix';
  END IF;
END;
$$;

INSERT INTO rpc_only_results VALUES (
  'rollback_fixture_namespace_clean_before_run',
  TRUE,
  'No fixture name or operation-id residue existed before the rollback-only run.'
);

WITH inserted AS (
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (
      '00000000-0000-0000-0000-000000000000'::UUID,
      uuid_generate_v4(),
      'authenticated',
      'authenticated',
      'rpc-only-acl-owner@example.test',
      '',
      clock_timestamp(),
      '{"provider":"email","providers":["email"]}'::JSONB,
      '{"display_name":"RPC-only ACL owner"}'::JSONB,
      clock_timestamp(),
      clock_timestamp()
    ),
    (
      '00000000-0000-0000-0000-000000000000'::UUID,
      uuid_generate_v4(),
      'authenticated',
      'authenticated',
      'rpc-only-acl-other@example.test',
      '',
      clock_timestamp(),
      '{"provider":"email","providers":["email"]}'::JSONB,
      '{"display_name":"RPC-only ACL other"}'::JSONB,
      clock_timestamp(),
      clock_timestamp()
    )
  RETURNING id, email
)
INSERT INTO rpc_only_state (key, value)
SELECT CASE email
  WHEN 'rpc-only-acl-owner@example.test' THEN 'owner_id'
  ELSE 'other_id'
END, id::TEXT
FROM inserted;

WITH inserted AS (
  INSERT INTO public.knowledge_bases (owner_id, name, description)
  VALUES
    (
      (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_id'),
      'RPC-only ACL rollback fixture owner',
      'Rollback-only owner library'
    ),
    (
      (SELECT value::UUID FROM rpc_only_state WHERE key = 'other_id'),
      'RPC-only ACL rollback fixture other',
      'Rollback-only other-account library'
    )
  RETURNING id, owner_id
)
INSERT INTO rpc_only_state (key, value)
SELECT CASE owner_id
  WHEN (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_id') THEN 'owner_kb_id'
  ELSE 'other_kb_id'
END, id::TEXT
FROM inserted;

WITH inserted AS (
  INSERT INTO public.documents (
    knowledge_base_id, owner_id, title, body, topic, status, visibility, revision
  ) VALUES
    (
      (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_kb_id'),
      (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_id'),
      'RPC-only ACL legacy source', 'Legacy source body', 'Reliability',
      'draft', 'private', 0
    ),
    (
      (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_kb_id'),
      (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_id'),
      'RPC-only ACL relation target', 'Relation target body', '',
      'draft', 'private', 0
    ),
    (
      (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_kb_id'),
      (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_id'),
      'RPC-only ACL publication lifecycle', 'Publication lifecycle body', '',
      'draft', 'private', 0
    ),
    (
      (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_kb_id'),
      (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_id'),
      'RPC-only ACL soft lifecycle', 'Soft lifecycle body', '',
      'draft', 'private', 0
    ),
    (
      (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_kb_id'),
      (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_id'),
      'RPC-only ACL hard delete', 'Hard delete body', '',
      'draft', 'private', 0
    ),
    (
      (SELECT value::UUID FROM rpc_only_state WHERE key = 'other_kb_id'),
      (SELECT value::UUID FROM rpc_only_state WHERE key = 'other_id'),
      'RPC-only ACL other source', 'Other source body', '',
      'draft', 'private', 0
    )
  RETURNING id, title
)
INSERT INTO rpc_only_state (key, value)
SELECT CASE title
  WHEN 'RPC-only ACL legacy source' THEN 'legacy_source_id'
  WHEN 'RPC-only ACL relation target' THEN 'relation_target_id'
  WHEN 'RPC-only ACL publication lifecycle' THEN 'publication_document_id'
  WHEN 'RPC-only ACL soft lifecycle' THEN 'soft_document_id'
  WHEN 'RPC-only ACL hard delete' THEN 'hard_document_id'
  ELSE 'other_document_id'
END, id::TEXT
FROM inserted;

WITH inserted AS (
  INSERT INTO public.tags (knowledge_base_id, owner_id, name, normalized_name)
  VALUES (
    (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_kb_id'),
    (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_id'),
    'baseline',
    'baseline'
  )
  RETURNING id
)
INSERT INTO rpc_only_state (key, value)
SELECT 'baseline_tag_id', id::TEXT FROM inserted;

INSERT INTO public.document_versions (
  document_id, owner_id, version_no, snapshot, created_by
) VALUES (
  (SELECT value::UUID FROM rpc_only_state WHERE key = 'legacy_source_id'),
  (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_id'),
  0,
  '{"title":"RPC-only ACL legacy source","body":"Legacy source body","revision":0}'::JSONB,
  (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_id')
);

INSERT INTO public.document_tags (document_id, tag_id, owner_id) VALUES (
  (SELECT value::UUID FROM rpc_only_state WHERE key = 'legacy_source_id'),
  (SELECT value::UUID FROM rpc_only_state WHERE key = 'baseline_tag_id'),
  (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_id')
);

INSERT INTO public.document_links (
  from_document_id, to_document_id, owner_id, relation_type, note
) VALUES (
  (SELECT value::UUID FROM rpc_only_state WHERE key = 'legacy_source_id'),
  (SELECT value::UUID FROM rpc_only_state WHERE key = 'relation_target_id'),
  (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_id'),
  'related',
  'baseline link'
);

INSERT INTO public.document_sources (
  document_id, owner_id, kind, url, title, author, note, sort_order
) VALUES (
  (SELECT value::UUID FROM rpc_only_state WHERE key = 'legacy_source_id'),
  (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_id'),
  'web',
  'https://example.com/rpc-only-baseline',
  'Baseline source',
  '',
  '',
  0
);

INSERT INTO rpc_only_values (key, value) VALUES
  (
    'atomic_existing_snapshot',
    jsonb_build_object(
      'title', 'RPC-only atomic existing',
      'body', 'Atomic existing body',
      'topic', 'Reliability',
      'maturity', 'growing',
      'visibility', 'public',
      'tags', jsonb_build_array('atomic-tag'),
      'prerequisites', '[]'::JSONB,
      'related', jsonb_build_array(
        (SELECT value FROM rpc_only_state WHERE key = 'relation_target_id')
      ),
      'sources', jsonb_build_array(
        jsonb_build_object(
          'kind', 'web',
          'url', 'https://example.com/rpc-only-atomic',
          'title', 'Atomic source',
          'author', '',
          'note', ''
        )
      )
    )
  ),
  (
    'atomic_new_snapshot',
    jsonb_build_object(
      'title', 'RPC-only atomic new',
      'body', 'Atomic new body',
      'topic', '',
      'maturity', 'seed',
      'visibility', 'private',
      'tags', '[]'::JSONB,
      'prerequisites', '[]'::JSONB,
      'related', '[]'::JSONB,
      'sources', '[]'::JSONB
    )
  );

INSERT INTO rpc_only_values (key, value)
SELECT 'legacy_before', pg_temp.rpc_only_owner_fingerprint(
  (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_id')
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT value FROM rpc_only_state WHERE key = 'owner_id'),
  TRUE
);

DO $$
DECLARE
  returned_state TEXT := '';
BEGIN
  BEGIN
    UPDATE public.documents
    SET title = 'Legacy update must fail',
        body = 'Legacy update must fail',
        topic = 'Legacy',
        maturity = 'stable',
        status = 'draft',
        visibility = 'private',
        revision = 1
    WHERE id = (SELECT value::UUID FROM rpc_only_state WHERE key = 'legacy_source_id');
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS returned_state = RETURNED_SQLSTATE;
  END;

  INSERT INTO rpc_only_results VALUES (
    'legacy_existing_save_denied_42501_zero_write',
    returned_state = '42501'
      AND pg_temp.rpc_only_owner_fingerprint(
        (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_id')
      ) = (SELECT value FROM rpc_only_values WHERE key = 'legacy_before'),
    'An already-open legacy tab cannot update core content or advance any related table/receipt.'
  );
END;
$$;

DO $$
DECLARE
  returned_state TEXT := '';
BEGIN
  BEGIN
    INSERT INTO public.documents (
      knowledge_base_id, owner_id, title, body, topic, maturity, status, visibility
    ) VALUES (
      (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_kb_id'),
      (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_id'),
      'RPC-only ACL legacy new must fail',
      'Legacy create must fail',
      '',
      'seed',
      'draft',
      'private'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS returned_state = RETURNED_SQLSTATE;
  END;

  INSERT INTO rpc_only_results VALUES (
    'legacy_new_save_denied_42501_zero_write',
    returned_state = '42501'
      AND pg_temp.rpc_only_owner_fingerprint(
        (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_id')
      ) = (SELECT value FROM rpc_only_values WHERE key = 'legacy_before')
      AND NOT EXISTS (
        SELECT 1 FROM public.documents
        WHERE title = 'RPC-only ACL legacy new must fail'
      ),
    'An already-open legacy tab cannot create a core row, metadata, version, or receipt.'
  );
END;
$$;

DO $$
DECLARE
  denied_count INTEGER := 0;
BEGIN
  BEGIN
    INSERT INTO public.document_versions (
      document_id, owner_id, version_no, snapshot, created_by
    ) VALUES (
      (SELECT value::UUID FROM rpc_only_state WHERE key = 'legacy_source_id'),
      (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_id'),
      99,
      '{}'::JSONB,
      (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_id')
    );
  EXCEPTION WHEN insufficient_privilege THEN
    denied_count := denied_count + 1;
  END;

  BEGIN
    INSERT INTO public.tags (knowledge_base_id, owner_id, name, normalized_name)
    VALUES (
      (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_kb_id'),
      (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_id'),
      'must-fail',
      'must-fail'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    denied_count := denied_count + 1;
  END;

  BEGIN
    INSERT INTO public.document_tags (document_id, tag_id, owner_id) VALUES (
      (SELECT value::UUID FROM rpc_only_state WHERE key = 'relation_target_id'),
      (SELECT value::UUID FROM rpc_only_state WHERE key = 'baseline_tag_id'),
      (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_id')
    );
  EXCEPTION WHEN insufficient_privilege THEN
    denied_count := denied_count + 1;
  END;

  BEGIN
    INSERT INTO public.document_links (
      from_document_id, to_document_id, owner_id, relation_type, note
    ) VALUES (
      (SELECT value::UUID FROM rpc_only_state WHERE key = 'legacy_source_id'),
      (SELECT value::UUID FROM rpc_only_state WHERE key = 'relation_target_id'),
      (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_id'),
      'prerequisite',
      ''
    );
  EXCEPTION WHEN insufficient_privilege THEN
    denied_count := denied_count + 1;
  END;

  BEGIN
    INSERT INTO public.document_sources (
      document_id, owner_id, kind, url, title, author, note, sort_order
    ) VALUES (
      (SELECT value::UUID FROM rpc_only_state WHERE key = 'legacy_source_id'),
      (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_id'),
      'personal',
      NULL,
      'must fail',
      '',
      '',
      99
    );
  EXCEPTION WHEN insufficient_privilege THEN
    denied_count := denied_count + 1;
  END;

  BEGIN
    PERFORM public.replace_document_sources(
      (SELECT value::UUID FROM rpc_only_state WHERE key = 'legacy_source_id'),
      '[]'::JSONB
    );
  EXCEPTION WHEN insufficient_privilege THEN
    denied_count := denied_count + 1;
  END;

  INSERT INTO rpc_only_results VALUES (
    'child_snapshot_writes_and_replace_rpc_denied',
    denied_count = 6
      AND pg_temp.rpc_only_owner_fingerprint(
        (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_id')
      ) = (SELECT value FROM rpc_only_values WHERE key = 'legacy_before'),
    'Every legacy child insert plus replace_document_sources is denied before mutation.'
  );
END;
$$;

DO $$
DECLARE
  publish_response JSONB;
  unpublish_response BOOLEAN;
BEGIN
  publish_response := public.publish_document(
    (SELECT value::UUID FROM rpc_only_state WHERE key = 'publication_document_id'),
    'unlisted'
  );
  unpublish_response := public.unpublish_document(
    (SELECT value::UUID FROM rpc_only_state WHERE key = 'publication_document_id')
  );

  INSERT INTO rpc_only_results VALUES (
    'publish_unpublish_preserved',
    publish_response->>'audience' = 'unlisted'
      AND unpublish_response
      AND NOT EXISTS (
        SELECT 1 FROM public.document_publications
        WHERE document_id = (
          SELECT value::UUID FROM rpc_only_state WHERE key = 'publication_document_id'
        )
      )
      AND EXISTS (
        SELECT 1 FROM public.documents
        WHERE id = (
          SELECT value::UUID FROM rpc_only_state WHERE key = 'publication_document_id'
        )
          AND status = 'draft'
          AND visibility = 'private'
          AND published_at IS NULL
          AND published_revision IS NULL
      ),
    'The reviewed SECURITY INVOKER publication RPCs still update only their four approved columns.'
  );
END;
$$;

DO $$
DECLARE
  updated_rows BIGINT := 0;
BEGIN
  PERFORM public.publish_document(
    (SELECT value::UUID FROM rpc_only_state WHERE key = 'soft_document_id'),
    'public'
  );

  UPDATE public.documents
  SET deleted_at = clock_timestamp()
  WHERE id = (SELECT value::UUID FROM rpc_only_state WHERE key = 'soft_document_id');
  GET DIAGNOSTICS updated_rows = ROW_COUNT;

  IF updated_rows = 1
    AND NOT EXISTS (
      SELECT 1 FROM public.document_publications
      WHERE document_id = (
        SELECT value::UUID FROM rpc_only_state WHERE key = 'soft_document_id'
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.documents
      WHERE id = (SELECT value::UUID FROM rpc_only_state WHERE key = 'soft_document_id')
        AND deleted_at IS NOT NULL
        AND status = 'archived'
        AND visibility = 'private'
    )
  THEN
    UPDATE public.documents
    SET deleted_at = NULL,
        status = 'draft'
    WHERE id = (SELECT value::UUID FROM rpc_only_state WHERE key = 'soft_document_id');
    GET DIAGNOSTICS updated_rows = ROW_COUNT;
  ELSE
    updated_rows := 0;
  END IF;

  INSERT INTO rpc_only_results VALUES (
    'soft_delete_restore_preserved',
    updated_rows = 1
      AND EXISTS (
        SELECT 1 FROM public.documents
        WHERE id = (SELECT value::UUID FROM rpc_only_state WHERE key = 'soft_document_id')
          AND deleted_at IS NULL
          AND status = 'draft'
          AND visibility = 'private'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.document_publications
        WHERE document_id = (
          SELECT value::UUID FROM rpc_only_state WHERE key = 'soft_document_id'
        )
      ),
    'Column-level lifecycle UPDATE preserves atomic revocation, soft deletion, and explicit restore.'
  );
END;
$$;

DO $$
DECLARE
  deleted_rows BIGINT := 0;
BEGIN
  DELETE FROM public.documents
  WHERE id = (SELECT value::UUID FROM rpc_only_state WHERE key = 'hard_document_id');
  GET DIAGNOSTICS deleted_rows = ROW_COUNT;

  INSERT INTO rpc_only_results VALUES (
    'hard_delete_preserved',
    deleted_rows = 1
      AND NOT EXISTS (
        SELECT 1 FROM public.documents
        WHERE id = (SELECT value::UUID FROM rpc_only_state WHERE key = 'hard_document_id')
      ),
    'Owner hard DELETE remains available and RLS-scoped.'
  );
END;
$$;

SELECT public.publish_document(
  (SELECT value::UUID FROM rpc_only_state WHERE key = 'legacy_source_id'),
  'public'
);

INSERT INTO rpc_only_values (key, value)
SELECT 'atomic_publication_before', to_jsonb(publication)
FROM public.document_publications publication
WHERE publication.document_id = (
  SELECT value::UUID FROM rpc_only_state WHERE key = 'legacy_source_id'
);

INSERT INTO rpc_only_responses (key, response)
SELECT 'atomic_existing', public.save_document_snapshot_v1(
  'rpc-only-acl-existing',
  (SELECT value::UUID FROM rpc_only_state WHERE key = 'legacy_source_id'),
  (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_kb_id'),
  0,
  (SELECT value FROM rpc_only_values WHERE key = 'atomic_existing_snapshot')
);

INSERT INTO rpc_only_results VALUES (
  'atomic_existing_snapshot_and_publication_invariant',
  (SELECT response->>'status' = 'saved'
      AND response->>'revision' = '1'
      AND response->>'created' = 'false'
   FROM rpc_only_responses WHERE key = 'atomic_existing')
  AND EXISTS (
    SELECT 1 FROM public.documents
    WHERE id = (SELECT value::UUID FROM rpc_only_state WHERE key = 'legacy_source_id')
      AND title = 'RPC-only atomic existing'
      AND body = 'Atomic existing body'
      AND revision = 1
      AND status = 'published'
  )
  AND EXISTS (
    SELECT 1 FROM public.document_versions
    WHERE document_id = (
      SELECT value::UUID FROM rpc_only_state WHERE key = 'legacy_source_id'
    ) AND version_no = 1
  )
  AND EXISTS (
    SELECT 1 FROM public.document_tags document_tag
    JOIN public.tags tag ON tag.id = document_tag.tag_id
    WHERE document_tag.document_id = (
      SELECT value::UUID FROM rpc_only_state WHERE key = 'legacy_source_id'
    ) AND tag.normalized_name = 'atomic-tag'
  )
  AND EXISTS (
    SELECT 1 FROM public.document_sources
    WHERE document_id = (
      SELECT value::UUID FROM rpc_only_state WHERE key = 'legacy_source_id'
    ) AND url = 'https://example.com/rpc-only-atomic'
  )
  AND (SELECT to_jsonb(publication)
       FROM public.document_publications publication
       WHERE publication.document_id = (
         SELECT value::UUID FROM rpc_only_state WHERE key = 'legacy_source_id'
       )) = (SELECT value FROM rpc_only_values WHERE key = 'atomic_publication_before')
  AND pg_temp.rpc_only_receipt_count(
    (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_id'),
    'rpc-only-acl-existing'
  ) = 1,
  'The definer RPC atomically updates core/version/organization while leaving the last publication snapshot untouched.'
);

INSERT INTO rpc_only_values (key, value)
SELECT 'atomic_after_first', pg_temp.rpc_only_owner_fingerprint(
  (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_id')
);

INSERT INTO rpc_only_responses (key, response)
SELECT 'atomic_replay', public.save_document_snapshot_v1(
  'rpc-only-acl-existing',
  (SELECT value::UUID FROM rpc_only_state WHERE key = 'legacy_source_id'),
  (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_kb_id'),
  0,
  (SELECT value FROM rpc_only_values WHERE key = 'atomic_existing_snapshot')
);

INSERT INTO rpc_only_results VALUES (
  'atomic_replay_exactly_once',
  (SELECT first.response = replay.response
   FROM rpc_only_responses first
   CROSS JOIN rpc_only_responses replay
   WHERE first.key = 'atomic_existing' AND replay.key = 'atomic_replay')
  AND pg_temp.rpc_only_owner_fingerprint(
    (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_id')
  ) = (SELECT value FROM rpc_only_values WHERE key = 'atomic_after_first'),
  'A lost acknowledgement replays the exact saved response without write amplification.'
);

INSERT INTO rpc_only_responses (key, response)
SELECT 'atomic_conflict', public.save_document_snapshot_v1(
  'rpc-only-acl-conflict',
  (SELECT value::UUID FROM rpc_only_state WHERE key = 'legacy_source_id'),
  (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_kb_id'),
  0,
  jsonb_set(
    (SELECT value FROM rpc_only_values WHERE key = 'atomic_existing_snapshot'),
    '{title}',
    '"stale must not write"'::JSONB
  )
);

INSERT INTO rpc_only_results VALUES (
  'atomic_stale_cas_zero_write',
  (SELECT response->>'status' = 'conflict'
      AND response->>'expected_revision' = '0'
      AND response->>'current_revision' = '1'
      AND response->'saved_at' = 'null'::JSONB
   FROM rpc_only_responses WHERE key = 'atomic_conflict')
  AND pg_temp.rpc_only_owner_fingerprint(
    (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_id')
  ) = (SELECT value FROM rpc_only_values WHERE key = 'atomic_after_first')
  AND pg_temp.rpc_only_receipt_count(
    (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_id'),
    'rpc-only-acl-conflict'
  ) = 0,
  'A stale expected revision returns a read-only conflict with no receipt.'
);

INSERT INTO rpc_only_responses (key, response)
SELECT 'atomic_new', public.save_document_snapshot_v1(
  'rpc-only-acl-new',
  NULL,
  (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_kb_id'),
  0,
  (SELECT value FROM rpc_only_values WHERE key = 'atomic_new_snapshot')
);

INSERT INTO rpc_only_responses (key, response)
SELECT 'atomic_new_replay', public.save_document_snapshot_v1(
  'rpc-only-acl-new',
  NULL,
  (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_kb_id'),
  0,
  (SELECT value FROM rpc_only_values WHERE key = 'atomic_new_snapshot')
);

INSERT INTO rpc_only_results VALUES (
  'atomic_new_and_replay_exactly_once',
  (SELECT first.response = replay.response
   FROM rpc_only_responses first
   CROSS JOIN rpc_only_responses replay
   WHERE first.key = 'atomic_new' AND replay.key = 'atomic_new_replay')
  AND (SELECT response->>'created' = 'true' AND response->>'revision' = '0'
       FROM rpc_only_responses WHERE key = 'atomic_new')
  AND (
    SELECT count(*) FROM public.documents
    WHERE owner_id = (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_id')
      AND title = 'RPC-only atomic new'
  ) = 1
  AND pg_temp.rpc_only_receipt_count(
    (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_id'),
    'rpc-only-acl-new'
  ) = 1,
  'A new-document lost acknowledgement creates one document and one receipt.'
);

DO $$
DECLARE
  denied BOOLEAN := FALSE;
BEGIN
  BEGIN
    PERFORM 1 FROM wouldkeep_private.document_save_receipts LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN
    denied := TRUE;
  END;

  INSERT INTO rpc_only_results VALUES (
    'authenticated_private_receipt_access_denied',
    denied,
    'The browser role cannot read the private idempotency ledger directly.'
  );
END;
$$;

RESET ROLE;

INSERT INTO rpc_only_values (key, value)
SELECT 'owner_before_other', pg_temp.rpc_only_owner_fingerprint(
  (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_id')
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT value FROM rpc_only_state WHERE key = 'other_id'),
  TRUE
);

INSERT INTO rpc_only_responses (key, response)
SELECT 'other_rpc', public.save_document_snapshot_v1(
  'rpc-only-acl-other',
  (SELECT value::UUID FROM rpc_only_state WHERE key = 'legacy_source_id'),
  (SELECT value::UUID FROM rpc_only_state WHERE key = 'other_kb_id'),
  0,
  (SELECT value FROM rpc_only_values WHERE key = 'atomic_existing_snapshot')
);

DO $$
DECLARE
  updated_rows BIGINT := -1;
  deleted_rows BIGINT := -1;
BEGIN
  UPDATE public.documents
  SET deleted_at = clock_timestamp()
  WHERE id = (SELECT value::UUID FROM rpc_only_state WHERE key = 'legacy_source_id');
  GET DIAGNOSTICS updated_rows = ROW_COUNT;

  DELETE FROM public.documents
  WHERE id = (SELECT value::UUID FROM rpc_only_state WHERE key = 'legacy_source_id');
  GET DIAGNOSTICS deleted_rows = ROW_COUNT;

  INSERT INTO rpc_only_values (key, value) VALUES (
    'other_direct_rows',
    jsonb_build_object('updated', updated_rows, 'deleted', deleted_rows)
  );
END;
$$;

RESET ROLE;

INSERT INTO rpc_only_results VALUES (
  'other_user_denied_zero_write',
  (SELECT response->>'status' = 'not_found' AND response->>'document_id' IS NULL
   FROM rpc_only_responses WHERE key = 'other_rpc')
  AND (SELECT value = '{"updated":0,"deleted":0}'::JSONB
       FROM rpc_only_values WHERE key = 'other_direct_rows')
  AND pg_temp.rpc_only_owner_fingerprint(
    (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_id')
  ) = (SELECT value FROM rpc_only_values WHERE key = 'owner_before_other')
  AND pg_temp.rpc_only_receipt_count(
    (SELECT value::UUID FROM rpc_only_state WHERE key = 'other_id'),
    'rpc-only-acl-other'
  ) = 0,
  'Other-account RPC and allowed lifecycle DML remain RLS-denied without owner writes.'
);

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role', 'anon', TRUE);
SELECT set_config('request.jwt.claim.sub', '', TRUE);

DO $$
DECLARE
  denied_count INTEGER := 0;
BEGIN
  BEGIN
    PERFORM public.save_document_snapshot_v1(
      'rpc-only-acl-anon',
      NULL,
      (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_kb_id'),
      0,
      (SELECT value FROM rpc_only_values WHERE key = 'atomic_new_snapshot')
    );
  EXCEPTION WHEN insufficient_privilege THEN
    denied_count := denied_count + 1;
  END;

  BEGIN
    INSERT INTO public.documents (knowledge_base_id, owner_id, title, body)
    VALUES (
      (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_kb_id'),
      (SELECT value::UUID FROM rpc_only_state WHERE key = 'owner_id'),
      'RPC-only ACL anonymous must fail',
      'must fail'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    denied_count := denied_count + 1;
  END;

  BEGIN
    UPDATE public.documents
    SET deleted_at = clock_timestamp()
    WHERE id = (SELECT value::UUID FROM rpc_only_state WHERE key = 'legacy_source_id');
  EXCEPTION WHEN insufficient_privilege THEN
    denied_count := denied_count + 1;
  END;

  INSERT INTO rpc_only_results VALUES (
    'anonymous_denied_zero_write',
    denied_count = 3,
    'Anonymous RPC, new-row, and lifecycle writes all fail with insufficient privilege.'
  );
END;
$$;

RESET ROLE;

DO $$
DECLARE
  expected_names CONSTANT TEXT[] := ARRAY[
    'anonymous_denied_zero_write',
    'atomic_existing_snapshot_and_publication_invariant',
    'atomic_new_and_replay_exactly_once',
    'atomic_replay_exactly_once',
    'atomic_stale_cas_zero_write',
    'authenticated_private_receipt_access_denied',
    'child_snapshot_writes_and_replace_rpc_denied',
    'hard_delete_preserved',
    'legacy_existing_save_denied_42501_zero_write',
    'legacy_new_save_denied_42501_zero_write',
    'other_user_denied_zero_write',
    'publish_unpublish_preserved',
    'rollback_fixture_namespace_clean_before_run',
    'soft_delete_restore_preserved'
  ]::TEXT[];
BEGIN
  IF (
    SELECT array_agg(test_name ORDER BY test_name) FROM rpc_only_results
  ) IS DISTINCT FROM expected_names THEN
    RAISE EXCEPTION 'RPC-only matrix scenario set is incomplete';
  END IF;

  IF EXISTS (SELECT 1 FROM rpc_only_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'RPC-only matrix contains a failed assertion';
  END IF;
END;
$$;

SELECT test_name, passed, detail
FROM rpc_only_results
ORDER BY test_name;

ROLLBACK;
