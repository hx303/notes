-- Disposable/non-production rollback-only behavior matrix for 20260722000150.
-- Run from the exact 20260722000100 baseline with:
--   -v wouldkeep_p1b_20260722000150_disposable=true

\set ON_ERROR_STOP on
\if :{?wouldkeep_p1b_20260722000150_disposable}
\else
\set wouldkeep_p1b_20260722000150_disposable false
\endif
\if :wouldkeep_p1b_20260722000150_disposable
\else
\echo 'Refusing to run: pass the exact disposable-environment confirmation variable.'
DO $tag_normalization_disposable_guard$
BEGIN
  RAISE EXCEPTION 'Disposable environment confirmation is required';
END;
$tag_normalization_disposable_guard$;
\endif

BEGIN;

CREATE TEMP TABLE tag_normalization_results (
  test_name TEXT PRIMARY KEY,
  passed BOOLEAN NOT NULL,
  detail TEXT NOT NULL
) ON COMMIT DROP;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = 'a1500000-0000-4000-8000-000000000100'::UUID
       OR email LIKE 'p1b-tag-normalization-%@example.test'
  ) OR EXISTS (
    SELECT 1 FROM public.knowledge_bases
    WHERE id = 'b1500000-0000-4000-8000-000000000100'::UUID
  ) OR EXISTS (
    SELECT 1 FROM public.tags
    WHERE id::TEXT LIKE 'c1500000-0000-4000-8000-%'
  ) OR EXISTS (
    SELECT 1 FROM public.documents
    WHERE id::TEXT LIKE 'd1500000-0000-4000-8000-%'
  ) THEN
    RAISE EXCEPTION 'rollback fixture residue exists before the matrix';
  END IF;
END;
$$;

INSERT INTO tag_normalization_results VALUES (
  'rollback_fixture_namespace_clean_before_run',
  TRUE,
  'The fixed synthetic UUID and example.test namespace was empty.'
);

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000'::UUID,
  'a1500000-0000-4000-8000-000000000100'::UUID,
  'authenticated',
  'authenticated',
  'p1b-tag-normalization-owner@example.test',
  '',
  clock_timestamp(),
  '{"provider":"email","providers":["email"]}'::JSONB,
  '{"display_name":"Synthetic tag normalization owner"}'::JSONB,
  clock_timestamp(),
  clock_timestamp()
);

INSERT INTO public.knowledge_bases (id, owner_id, name)
VALUES (
  'b1500000-0000-4000-8000-000000000100'::UUID,
  'a1500000-0000-4000-8000-000000000100'::UUID,
  'Synthetic tag normalization knowledge base'
);

INSERT INTO public.documents (id, knowledge_base_id, owner_id, title)
SELECT
  ('d1500000-0000-4000-8000-' || lpad(series::TEXT, 12, '0'))::UUID,
  'b1500000-0000-4000-8000-000000000100'::UUID,
  'a1500000-0000-4000-8000-000000000100'::UUID,
  'Synthetic tag normalization document ' || series::TEXT
FROM generate_series(1, 65) series;

-- The first two normalized keys are deliberately swapped. A direct UPDATE can
-- violate the non-deferrable unique constraint even though the final set is unique.
INSERT INTO public.tags (
  id, knowledge_base_id, owner_id, name, normalized_name, created_at
) VALUES
  (
    'c1500000-0000-4000-8000-000000000001'::UUID,
    'b1500000-0000-4000-8000-000000000100'::UUID,
    'a1500000-0000-4000-8000-000000000100'::UUID,
    'Ａ', 'b', '2026-07-22T00:01:50Z'::TIMESTAMPTZ
  ),
  (
    'c1500000-0000-4000-8000-000000000002'::UUID,
    'b1500000-0000-4000-8000-000000000100'::UUID,
    'a1500000-0000-4000-8000-000000000100'::UUID,
    'Ｂ', 'a', '2026-07-22T00:01:51Z'::TIMESTAMPTZ
  ),
  (
    'c1500000-0000-4000-8000-000000000003'::UUID,
    'b1500000-0000-4000-8000-000000000100'::UUID,
    'a1500000-0000-4000-8000-000000000100'::UUID,
    'ＣＣ', 'legacy-cc', '2026-07-22T00:01:52Z'::TIMESTAMPTZ
  ),
  (
    'c1500000-0000-4000-8000-000000000004'::UUID,
    'b1500000-0000-4000-8000-000000000100'::UUID,
    'a1500000-0000-4000-8000-000000000100'::UUID,
    'Ｄ　Ｅ', 'legacy-de', '2026-07-22T00:01:53Z'::TIMESTAMPTZ
  ),
  (
    'c1500000-0000-4000-8000-000000000005'::UUID,
    'b1500000-0000-4000-8000-000000000100'::UUID,
    'a1500000-0000-4000-8000-000000000100'::UUID,
    'Ｆ  Ｇ', 'legacy-fg', '2026-07-22T00:01:54Z'::TIMESTAMPTZ
  ),
  (
    'c1500000-0000-4000-8000-000000000006'::UUID,
    'b1500000-0000-4000-8000-000000000100'::UUID,
    'a1500000-0000-4000-8000-000000000100'::UUID,
    'Ｈ', 'legacy-h', '2026-07-22T00:01:55Z'::TIMESTAMPTZ
  ),
  (
    'c1500000-0000-4000-8000-000000000007'::UUID,
    'b1500000-0000-4000-8000-000000000100'::UUID,
    'a1500000-0000-4000-8000-000000000100'::UUID,
    'Stable', 'stable', '2026-07-22T00:01:56Z'::TIMESTAMPTZ
  );

INSERT INTO public.document_tags (document_id, tag_id, owner_id, created_at)
SELECT
  ('d1500000-0000-4000-8000-' || lpad(series::TEXT, 12, '0'))::UUID,
  (ARRAY[
    'c1500000-0000-4000-8000-000000000001'::UUID,
    'c1500000-0000-4000-8000-000000000002'::UUID,
    'c1500000-0000-4000-8000-000000000003'::UUID,
    'c1500000-0000-4000-8000-000000000004'::UUID,
    'c1500000-0000-4000-8000-000000000005'::UUID,
    'c1500000-0000-4000-8000-000000000006'::UUID
  ])[((series - 1) % 6) + 1],
  'a1500000-0000-4000-8000-000000000100'::UUID,
  ('2026-07-22T00:02:00Z'::TIMESTAMPTZ + series * INTERVAL '1 second')
FROM generate_series(1, 65) series;

CREATE TEMP TABLE tag_normalization_before_tags ON COMMIT DROP AS
SELECT *
FROM public.tags
WHERE owner_id = 'a1500000-0000-4000-8000-000000000100'::UUID;

CREATE TEMP TABLE tag_normalization_before_references ON COMMIT DROP AS
SELECT *
FROM public.document_tags
WHERE owner_id = 'a1500000-0000-4000-8000-000000000100'::UUID;

\ir ../migrations/20260722000150_normalize_existing_tags_for_atomic_save.sql

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.tags tag
    WHERE tag.id::TEXT LIKE 'c1500000-0000-4000-8000-%'
  ) <> 7 OR EXISTS (
    SELECT 1
    FROM (VALUES
      ('c1500000-0000-4000-8000-000000000001'::UUID, 'A', 'a'),
      ('c1500000-0000-4000-8000-000000000002'::UUID, 'B', 'b'),
      ('c1500000-0000-4000-8000-000000000003'::UUID, 'CC', 'cc'),
      ('c1500000-0000-4000-8000-000000000004'::UUID, 'D E', 'd e'),
      ('c1500000-0000-4000-8000-000000000005'::UUID, 'F G', 'f g'),
      ('c1500000-0000-4000-8000-000000000006'::UUID, 'H', 'h'),
      ('c1500000-0000-4000-8000-000000000007'::UUID, 'Stable', 'stable')
    ) expected(id, name, normalized_name)
    LEFT JOIN public.tags tag ON tag.id = expected.id
    WHERE tag.id IS NULL
       OR tag.name <> expected.name
       OR tag.normalized_name <> expected.normalized_name
  ) THEN
    RAISE EXCEPTION 'six-tag canonicalization result is incomplete';
  END IF;

  INSERT INTO tag_normalization_results VALUES (
    'six_tags_canonicalized_in_place', TRUE,
    'Six synthetic compatibility-form names became canonical without reinsertion.'
  );

  IF EXISTS (
    (SELECT id, knowledge_base_id, owner_id, created_at
     FROM tag_normalization_before_tags)
    EXCEPT
    (SELECT id, knowledge_base_id, owner_id, created_at
     FROM public.tags
     WHERE owner_id = 'a1500000-0000-4000-8000-000000000100'::UUID)
  ) OR EXISTS (
    (SELECT id, knowledge_base_id, owner_id, created_at
     FROM public.tags
     WHERE owner_id = 'a1500000-0000-4000-8000-000000000100'::UUID)
    EXCEPT
    (SELECT id, knowledge_base_id, owner_id, created_at
     FROM tag_normalization_before_tags)
  ) THEN
    RAISE EXCEPTION 'tag identity or immutable metadata changed';
  END IF;

  INSERT INTO tag_normalization_results VALUES (
    'tag_identity_and_metadata_preserved', TRUE,
    'Every synthetic tag ID, owner, knowledge base, and timestamp is unchanged.'
  );

  IF (SELECT count(*) FROM tag_normalization_before_references) <> 65
    OR EXISTS (
      (SELECT * FROM tag_normalization_before_references)
      EXCEPT
      (SELECT * FROM public.document_tags
       WHERE owner_id = 'a1500000-0000-4000-8000-000000000100'::UUID)
    ) OR EXISTS (
      (SELECT * FROM public.document_tags
       WHERE owner_id = 'a1500000-0000-4000-8000-000000000100'::UUID)
      EXCEPT
      (SELECT * FROM tag_normalization_before_references)
    )
  THEN
    RAISE EXCEPTION 'the complete 65-row document-tag set changed';
  END IF;

  INSERT INTO tag_normalization_results VALUES (
    'sixty_five_references_preserved', TRUE,
    'All 65 synthetic document-tag rows are byte-for-byte unchanged.'
  );

  IF NOT EXISTS (
    SELECT 1 FROM public.tags
    WHERE id = 'c1500000-0000-4000-8000-000000000001'::UUID
      AND normalized_name = 'a'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.tags
    WHERE id = 'c1500000-0000-4000-8000-000000000002'::UUID
      AND normalized_name = 'b'
  ) THEN
    RAISE EXCEPTION 'the transient unique-key swap did not complete';
  END IF;

  INSERT INTO tag_normalization_results VALUES (
    'transient_unique_swap_succeeds', TRUE,
    'The deterministic temporary keyspace safely handled a non-deferrable key swap.'
  );
END;
$$;

CREATE TEMP TABLE tag_normalization_after_first_apply ON COMMIT DROP AS
SELECT *
FROM public.tags
WHERE owner_id = 'a1500000-0000-4000-8000-000000000100'::UUID;

\ir ../migrations/20260722000150_normalize_existing_tags_for_atomic_save.sql

DO $$
BEGIN
  IF EXISTS (
    (SELECT * FROM tag_normalization_after_first_apply)
    EXCEPT
    (SELECT * FROM public.tags
     WHERE owner_id = 'a1500000-0000-4000-8000-000000000100'::UUID)
  ) OR EXISTS (
    (SELECT * FROM public.tags
     WHERE owner_id = 'a1500000-0000-4000-8000-000000000100'::UUID)
    EXCEPT
    (SELECT * FROM tag_normalization_after_first_apply)
  ) OR EXISTS (
    SELECT 1
    FROM public.tags tag
    WHERE tag.owner_id = 'a1500000-0000-4000-8000-000000000100'::UUID
      AND (
        tag.name <> regexp_replace(
          btrim(normalize(tag.name, NFKC)), '[[:space:]]+', ' ', 'g'
        )
        OR tag.normalized_name <> lower(regexp_replace(
          btrim(normalize(tag.name, NFKC)), '[[:space:]]+', ' ', 'g'
        ))
      )
  ) THEN
    RAISE EXCEPTION 'second migration application was not a zero-write no-op';
  END IF;

  INSERT INTO tag_normalization_results VALUES (
    'second_apply_is_idempotent', TRUE,
    'A second exact migration application leaves every synthetic tag unchanged.'
  );
END;
$$;

SELECT test_name, passed, detail
FROM tag_normalization_results
ORDER BY test_name;

DO $$
DECLARE
  expected_names CONSTANT TEXT[] := ARRAY[
    'rollback_fixture_namespace_clean_before_run',
    'second_apply_is_idempotent',
    'six_tags_canonicalized_in_place',
    'sixty_five_references_preserved',
    'tag_identity_and_metadata_preserved',
    'transient_unique_swap_succeeds'
  ]::TEXT[];
BEGIN
  IF (SELECT array_agg(test_name ORDER BY test_name) FROM tag_normalization_results)
    IS DISTINCT FROM (
      SELECT array_agg(name ORDER BY name) FROM unnest(expected_names) name
    ) OR EXISTS (
      SELECT 1 FROM tag_normalization_results WHERE NOT passed
    ) THEN
    RAISE EXCEPTION 'tag-normalization assertion set is incomplete or failed';
  END IF;
END;
$$;

ROLLBACK;
