-- Document-link owner, endpoint, and tombstone behavior verification.
-- Run as postgres after migration 20260721000100. All fixture and grant writes roll back.

BEGIN;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_bases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_links TO authenticated, service_role;

CREATE TEMP TABLE document_link_test_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE document_link_test_results (
  test_name TEXT PRIMARY KEY,
  passed BOOLEAN NOT NULL,
  detail TEXT NOT NULL
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE ON document_link_test_state
  TO authenticated, anon, service_role;
GRANT SELECT, INSERT ON document_link_test_results
  TO authenticated, anon, service_role;

INSERT INTO document_link_test_state (key, value)
SELECT 'owner_id', id::TEXT FROM public.profiles ORDER BY created_at LIMIT 1;

INSERT INTO document_link_test_state (key, value)
SELECT 'other_id', id::TEXT
FROM public.profiles
WHERE id <> (SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_id')
ORDER BY created_at
LIMIT 1;

INSERT INTO document_link_test_state (key, value)
VALUES ('missing_document_id', uuid_generate_v4()::TEXT);

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM document_link_test_state WHERE key IN ('owner_id', 'other_id')) <> 2 THEN
    RAISE EXCEPTION 'document-link verification requires two profiles';
  END IF;
END;
$$;

WITH inserted AS (
  INSERT INTO public.knowledge_bases (owner_id, name, description)
  VALUES
    (
      (SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_id'),
      'Document-link integrity owner library',
      'Rollback-only primary fixture'
    ),
    (
      (SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_id'),
      'Document-link integrity second library',
      'Rollback-only cross-library fixture'
    ),
    (
      (SELECT value::UUID FROM document_link_test_state WHERE key = 'other_id'),
      'Document-link integrity other library',
      'Rollback-only other-account fixture'
    )
  RETURNING id, name
)
INSERT INTO document_link_test_state (key, value)
SELECT CASE name
  WHEN 'Document-link integrity owner library' THEN 'owner_knowledge_base_id'
  WHEN 'Document-link integrity second library' THEN 'owner_second_knowledge_base_id'
  ELSE 'other_knowledge_base_id'
END, id::TEXT
FROM inserted;

WITH inserted AS (
  INSERT INTO public.documents (knowledge_base_id, owner_id, title, body)
  VALUES
    (
      (SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_knowledge_base_id'),
      (SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_id'),
      'Document-link owner source',
      'Rollback-only source fixture'
    ),
    (
      (SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_knowledge_base_id'),
      (SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_id'),
      'Document-link owner target',
      'Rollback-only target fixture'
    ),
    (
      (SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_knowledge_base_id'),
      (SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_id'),
      'Document-link tombstone target',
      'Rollback-only tombstone fixture'
    ),
    (
      (SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_knowledge_base_id'),
      (SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_id'),
      'Document-link service target',
      'Rollback-only privileged-writer fixture'
    ),
    (
      (SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_second_knowledge_base_id'),
      (SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_id'),
      'Document-link cross-library target',
      'Rollback-only cross-library fixture'
    ),
    (
      (SELECT value::UUID FROM document_link_test_state WHERE key = 'other_knowledge_base_id'),
      (SELECT value::UUID FROM document_link_test_state WHERE key = 'other_id'),
      'Document-link other source',
      'Rollback-only other-account source fixture'
    ),
    (
      (SELECT value::UUID FROM document_link_test_state WHERE key = 'other_knowledge_base_id'),
      (SELECT value::UUID FROM document_link_test_state WHERE key = 'other_id'),
      'Document-link other target',
      'Rollback-only other-account target fixture'
    )
  RETURNING id, title
)
INSERT INTO document_link_test_state (key, value)
SELECT CASE title
  WHEN 'Document-link owner source' THEN 'owner_source_id'
  WHEN 'Document-link owner target' THEN 'owner_target_id'
  WHEN 'Document-link tombstone target' THEN 'owner_tombstone_target_id'
  WHEN 'Document-link service target' THEN 'owner_service_target_id'
  WHEN 'Document-link cross-library target' THEN 'owner_cross_library_target_id'
  WHEN 'Document-link other source' THEN 'other_source_id'
  ELSE 'other_target_id'
END, id::TEXT
FROM inserted;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT value FROM document_link_test_state WHERE key = 'owner_id'),
  TRUE
);

INSERT INTO public.document_links (
  from_document_id, to_document_id, owner_id, relation_type
) VALUES (
  (SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_source_id'),
  (SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_target_id'),
  (SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_id'),
  'related'
);

INSERT INTO public.document_links (
  from_document_id, to_document_id, owner_id, relation_type
) VALUES (
  (SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_source_id'),
  (SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_tombstone_target_id'),
  (SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_id'),
  'prerequisite'
);

INSERT INTO document_link_test_results VALUES (
  'owner_can_create_and_read_live_link',
  EXISTS (
    SELECT 1 FROM public.document_links
    WHERE from_document_id = (
      SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_source_id'
    )
      AND to_document_id = (
        SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_target_id'
      )
      AND relation_type = 'related'
  ),
  'An owner can create and read a link between live documents in one knowledge base.'
);

DO $$
DECLARE
  rejected BOOLEAN := FALSE;
BEGIN
  BEGIN
    INSERT INTO public.document_links (
      from_document_id, to_document_id, owner_id, relation_type
    ) VALUES (
      (SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_source_id'),
      (SELECT value::UUID FROM document_link_test_state WHERE key = 'other_target_id'),
      (SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_id'),
      'related'
    );
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    rejected := TRUE;
  END;

  INSERT INTO document_link_test_results VALUES (
    'owner_cannot_create_cross_owner_link', rejected,
    'The endpoint trigger rejects a known document UUID owned by another account.'
  );
END;
$$;

DO $$
DECLARE
  rejected BOOLEAN := FALSE;
BEGIN
  BEGIN
    INSERT INTO public.document_links (
      from_document_id, to_document_id, owner_id, relation_type
    ) VALUES (
      (SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_source_id'),
      (SELECT value::UUID FROM document_link_test_state WHERE key = 'missing_document_id'),
      (SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_id'),
      'related'
    );
  EXCEPTION WHEN check_violation THEN
    rejected := TRUE;
  END;

  INSERT INTO document_link_test_results VALUES (
    'owner_cannot_create_missing_endpoint_link', rejected,
    'The endpoint trigger rejects a UUID that does not identify a document.'
  );
END;
$$;

DO $$
DECLARE
  rejected BOOLEAN := FALSE;
BEGIN
  BEGIN
    INSERT INTO public.document_links (
      from_document_id, to_document_id, owner_id, relation_type
    ) VALUES (
      (SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_source_id'),
      (SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_cross_library_target_id'),
      (SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_id'),
      'related'
    );
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    rejected := TRUE;
  END;

  INSERT INTO document_link_test_results VALUES (
    'owner_cannot_create_cross_knowledge_base_link', rejected,
    'The endpoint trigger rejects documents from two knowledge bases owned by one account.'
  );
END;
$$;
RESET ROLE;

SET LOCAL ROLE service_role;
INSERT INTO public.document_links (
  from_document_id, to_document_id, owner_id, relation_type
) VALUES (
  (SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_source_id'),
  (SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_service_target_id'),
  (SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_id'),
  'related'
);

INSERT INTO document_link_test_results VALUES (
  'service_role_can_create_valid_link',
  EXISTS (
    SELECT 1 FROM public.document_links
    WHERE to_document_id = (
      SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_service_target_id'
    )
  ),
  'The privileged writer remains able to create a valid same-owner, same-library link.'
);

DO $$
DECLARE
  rejected BOOLEAN := FALSE;
BEGIN
  BEGIN
    INSERT INTO public.document_links (
      from_document_id, to_document_id, owner_id, relation_type
    ) VALUES (
      (SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_source_id'),
      (SELECT value::UUID FROM document_link_test_state WHERE key = 'other_target_id'),
      (SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_id'),
      'continues'
    );
  EXCEPTION WHEN check_violation THEN
    rejected := TRUE;
  END;

  INSERT INTO document_link_test_results VALUES (
    'service_role_cannot_bypass_endpoint_integrity', rejected,
    'RLS bypass does not bypass the endpoint trigger.'
  );
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT value FROM document_link_test_state WHERE key = 'other_id'),
  TRUE
);

INSERT INTO document_link_test_results VALUES (
  'other_user_cannot_read_owner_link',
  NOT EXISTS (
    SELECT 1 FROM public.document_links
    WHERE owner_id = (SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_id')
  ),
  'Another authenticated account cannot read owner links.'
);

DO $$
DECLARE
  affected_rows INTEGER;
BEGIN
  DELETE FROM public.document_links
  WHERE owner_id = (SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_id');
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  INSERT INTO document_link_test_results VALUES (
    'other_user_cannot_delete_owner_link', affected_rows = 0,
    'Another authenticated account cannot delete owner links.'
  );
END;
$$;

DO $$
DECLARE
  rejected BOOLEAN := FALSE;
BEGIN
  BEGIN
    INSERT INTO public.document_links (
      from_document_id, to_document_id, owner_id, relation_type
    ) VALUES (
      (SELECT value::UUID FROM document_link_test_state WHERE key = 'other_source_id'),
      (SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_target_id'),
      (SELECT value::UUID FROM document_link_test_state WHERE key = 'other_id'),
      'related'
    );
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    rejected := TRUE;
  END;

  INSERT INTO document_link_test_results VALUES (
    'other_user_cannot_create_cross_owner_link', rejected,
    'A second account cannot point one of its links at the owner document.'
  );
END;
$$;
RESET ROLE;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role', 'anon', TRUE);
SELECT set_config('request.jwt.claim.sub', '', TRUE);
DO $$
DECLARE
  denied BOOLEAN := FALSE;
BEGIN
  BEGIN
    PERFORM 1 FROM public.document_links LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN
    denied := TRUE;
  END;
  INSERT INTO document_link_test_results VALUES (
    'anon_has_no_document_link_access', denied,
    'Anonymous direct document-link table access is revoked.'
  );
END;
$$;
RESET ROLE;

UPDATE public.documents
SET deleted_at = NOW()
WHERE id = (
  SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_tombstone_target_id'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT value FROM document_link_test_state WHERE key = 'owner_id'),
  TRUE
);

INSERT INTO document_link_test_results VALUES (
  'owner_can_read_soft_deleted_endpoint_tombstone',
  EXISTS (
    SELECT 1 FROM public.document_links
    WHERE to_document_id = (
      SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_tombstone_target_id'
    )
  ),
  'Soft deletion preserves owner SELECT so the UI can render a removable tombstone.'
);

DO $$
DECLARE
  rejected BOOLEAN := FALSE;
BEGIN
  BEGIN
    INSERT INTO public.document_links (
      from_document_id, to_document_id, owner_id, relation_type
    ) VALUES (
      (SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_target_id'),
      (SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_tombstone_target_id'),
      (SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_id'),
      'related'
    );
  EXCEPTION WHEN check_violation THEN
    rejected := TRUE;
  END;

  INSERT INTO document_link_test_results VALUES (
    'owner_cannot_create_deleted_endpoint_link', rejected,
    'New links cannot target a soft-deleted document.'
  );
END;
$$;

DO $$
DECLARE
  rejected BOOLEAN := FALSE;
BEGIN
  BEGIN
    UPDATE public.document_links
    SET note = 'must not update a tombstone relation'
    WHERE to_document_id = (
      SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_tombstone_target_id'
    );
  EXCEPTION WHEN check_violation THEN
    rejected := TRUE;
  END;

  INSERT INTO document_link_test_results VALUES (
    'owner_cannot_update_deleted_endpoint_link', rejected,
    'Any UPDATE of a link with a deleted endpoint is rejected.'
  );
END;
$$;

DELETE FROM public.document_links
WHERE to_document_id = (
  SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_tombstone_target_id'
);

INSERT INTO document_link_test_results VALUES (
  'owner_can_delete_soft_deleted_endpoint_tombstone',
  NOT EXISTS (
    SELECT 1 FROM public.document_links
    WHERE to_document_id = (
      SELECT value::UUID FROM document_link_test_state WHERE key = 'owner_tombstone_target_id'
    )
  ),
  'The owner can remove a link after its endpoint is soft-deleted.'
);
RESET ROLE;

SELECT test_name, passed, detail
FROM document_link_test_results
ORDER BY test_name;

DO $$
DECLARE
  expected_names TEXT[] := ARRAY[
    'anon_has_no_document_link_access',
    'other_user_cannot_create_cross_owner_link',
    'other_user_cannot_delete_owner_link',
    'other_user_cannot_read_owner_link',
    'owner_can_create_and_read_live_link',
    'owner_can_delete_soft_deleted_endpoint_tombstone',
    'owner_can_read_soft_deleted_endpoint_tombstone',
    'owner_cannot_create_cross_knowledge_base_link',
    'owner_cannot_create_cross_owner_link',
    'owner_cannot_create_deleted_endpoint_link',
    'owner_cannot_create_missing_endpoint_link',
    'owner_cannot_update_deleted_endpoint_link',
    'service_role_can_create_valid_link',
    'service_role_cannot_bypass_endpoint_integrity'
  ]::TEXT[];
BEGIN
  IF (SELECT array_agg(test_name ORDER BY test_name) FROM document_link_test_results)
    IS DISTINCT FROM (SELECT array_agg(name ORDER BY name) FROM unnest(expected_names) name) THEN
    RAISE EXCEPTION 'document-link assertion set is incomplete or unexpected';
  END IF;

  IF EXISTS (SELECT 1 FROM document_link_test_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'one or more document-link integrity assertions failed';
  END IF;
END;
$$;

ROLLBACK;
