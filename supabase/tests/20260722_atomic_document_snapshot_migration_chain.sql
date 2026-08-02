-- Disposable/non-production rollback-only migration-chain proof.
-- Run from the exact 20260722000100 schema and 19-row ledger baseline with:
--   -v wouldkeep_p1b_20260722000200_chain_disposable=true

\set ON_ERROR_STOP on
\if :{?wouldkeep_p1b_20260722000200_chain_disposable}
\else
\set wouldkeep_p1b_20260722000200_chain_disposable false
\endif
\if :wouldkeep_p1b_20260722000200_chain_disposable
\else
\echo 'Refusing to run: pass the exact disposable migration-chain confirmation variable.'
DO $atomic_save_chain_disposable_guard$
BEGIN
  RAISE EXCEPTION 'Disposable migration-chain confirmation is required';
END;
$atomic_save_chain_disposable_guard$;
\endif

BEGIN;

CREATE TEMP TABLE atomic_save_chain_results (
  test_name TEXT PRIMARY KEY,
  passed BOOLEAN NOT NULL,
  detail TEXT NOT NULL
) ON COMMIT DROP;

DO $atomic_save_chain_initial$
DECLARE
  expected_ledger CONSTANT TEXT[] := ARRAY[
    '20260712', '20260714', '20260715', '20260716', '20260717',
    '20260718000100', '20260718000200', '20260718000300',
    '20260718000400', '20260718000500', '20260718000600',
    '20260718000700', '20260718000800', '20260718000900',
    '20260718001000', '20260718001100', '20260718001200',
    '20260721000100', '20260722000100'
  ]::TEXT[];
  actual_ledger TEXT[];
BEGIN
  SELECT array_agg(version ORDER BY version)
  INTO actual_ledger
  FROM supabase_migrations.schema_migrations;

  IF actual_ledger IS DISTINCT FROM expected_ledger
    OR (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 19
    OR (
      SELECT count(DISTINCT version)
      FROM supabase_migrations.schema_migrations
    ) <> 19
    OR (
      SELECT count(*)
      FROM supabase_migrations.schema_migrations
      WHERE version = '20260722000100'
        AND name = 'site_owner_role_invariant'
    ) <> 1
    OR EXISTS (
      SELECT 1
      FROM supabase_migrations.schema_migrations
      WHERE version IN ('20260722000150', '20260722000200')
    )
  THEN
    RAISE EXCEPTION 'migration-chain fixture is not at the exact 19-row 00100 baseline';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = 'a2000000-0000-4000-8000-000000000150'::UUID
       OR email = 'p1b-atomic-save-chain@example.test'
  ) OR EXISTS (
    SELECT 1
    FROM public.knowledge_bases
    WHERE id = 'b2000000-0000-4000-8000-000000000150'::UUID
  ) OR EXISTS (
    SELECT 1
    FROM public.documents
    WHERE id = 'd2000000-0000-4000-8000-000000000150'::UUID
  ) OR EXISTS (
    SELECT 1
    FROM public.tags
    WHERE id = 'c2000000-0000-4000-8000-000000000150'::UUID
  ) THEN
    RAISE EXCEPTION 'migration-chain fixture residue exists before the test';
  END IF;

  INSERT INTO atomic_save_chain_results VALUES (
    'ledger_starts_at_exact_19', TRUE,
    'The disposable ledger contains exactly the reviewed versions through 00100.'
  );
END;
$atomic_save_chain_initial$;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000'::UUID,
  'a2000000-0000-4000-8000-000000000150'::UUID,
  'authenticated',
  'authenticated',
  'p1b-atomic-save-chain@example.test',
  '',
  clock_timestamp(),
  '{"provider":"email","providers":["email"]}'::JSONB,
  '{"display_name":"Synthetic atomic save chain owner"}'::JSONB,
  clock_timestamp(),
  clock_timestamp()
);

INSERT INTO public.knowledge_bases (id, owner_id, name)
VALUES (
  'b2000000-0000-4000-8000-000000000150'::UUID,
  'a2000000-0000-4000-8000-000000000150'::UUID,
  'Atomic save migration chain library'
);

INSERT INTO public.documents (id, knowledge_base_id, owner_id, title)
VALUES (
  'd2000000-0000-4000-8000-000000000150'::UUID,
  'b2000000-0000-4000-8000-000000000150'::UUID,
  'a2000000-0000-4000-8000-000000000150'::UUID,
  'Atomic save migration chain document'
);

INSERT INTO public.tags (id, knowledge_base_id, owner_id, name, normalized_name)
VALUES (
  'c2000000-0000-4000-8000-000000000150'::UUID,
  'b2000000-0000-4000-8000-000000000150'::UUID,
  'a2000000-0000-4000-8000-000000000150'::UUID,
  'Ａ　Ｂ',
  'legacy-chain-key'
);

INSERT INTO public.document_tags (document_id, tag_id, owner_id)
VALUES (
  'd2000000-0000-4000-8000-000000000150'::UUID,
  'c2000000-0000-4000-8000-000000000150'::UUID,
  'a2000000-0000-4000-8000-000000000150'::UUID
);

CREATE TEMP TABLE atomic_save_chain_tag_before ON COMMIT DROP AS
SELECT id, knowledge_base_id, owner_id, created_at
FROM public.tags
WHERE id = 'c2000000-0000-4000-8000-000000000150'::UUID;

CREATE TEMP TABLE atomic_save_chain_reference_before ON COMMIT DROP AS
SELECT *
FROM public.document_tags
WHERE document_id = 'd2000000-0000-4000-8000-000000000150'::UUID
  AND tag_id = 'c2000000-0000-4000-8000-000000000150'::UUID;

\ir ../migrations/20260722000150_normalize_existing_tags_for_atomic_save.sql

INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
VALUES (
  '20260722000150',
  ARRAY['disposable rollback-only chain bookkeeping']::TEXT[],
  'normalize_existing_tags_for_atomic_save'
);

DO $atomic_save_chain_after_00150$
DECLARE
  expected_ledger CONSTANT TEXT[] := ARRAY[
    '20260712', '20260714', '20260715', '20260716', '20260717',
    '20260718000100', '20260718000200', '20260718000300',
    '20260718000400', '20260718000500', '20260718000600',
    '20260718000700', '20260718000800', '20260718000900',
    '20260718001000', '20260718001100', '20260718001200',
    '20260721000100', '20260722000100', '20260722000150'
  ]::TEXT[];
  actual_ledger TEXT[];
BEGIN
  SELECT array_agg(version ORDER BY version)
  INTO actual_ledger
  FROM supabase_migrations.schema_migrations;

  IF actual_ledger IS DISTINCT FROM expected_ledger
    OR (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 20
    OR (
      SELECT count(DISTINCT version)
      FROM supabase_migrations.schema_migrations
    ) <> 20
    OR (
      SELECT count(*)
      FROM supabase_migrations.schema_migrations
      WHERE version = '20260722000150'
        AND name = 'normalize_existing_tags_for_atomic_save'
    ) <> 1
  THEN
    RAISE EXCEPTION 'migration-chain ledger did not advance from 19 to exact 20';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tags
    WHERE id = 'c2000000-0000-4000-8000-000000000150'::UUID
      AND name = 'A B'
      AND normalized_name = 'a b'
  ) OR EXISTS (
    (SELECT * FROM atomic_save_chain_tag_before)
    EXCEPT
    (SELECT id, knowledge_base_id, owner_id, created_at
     FROM public.tags
     WHERE id = 'c2000000-0000-4000-8000-000000000150'::UUID)
  ) OR EXISTS (
    (SELECT * FROM atomic_save_chain_reference_before)
    EXCEPT
    (SELECT *
     FROM public.document_tags
     WHERE document_id = 'd2000000-0000-4000-8000-000000000150'::UUID
       AND tag_id = 'c2000000-0000-4000-8000-000000000150'::UUID)
  ) THEN
    RAISE EXCEPTION '00150 did not preserve the synthetic tag identity/reference contract';
  END IF;

  INSERT INTO atomic_save_chain_results VALUES (
    'normalization_advances_ledger_to_exact_20', TRUE,
    '00150 canonicalized the tag in place and preserved its reference.'
  );
END;
$atomic_save_chain_after_00150$;

\ir 20260722_atomic_document_snapshot_preflight.sql
\ir ../migrations/20260722000200_atomic_document_snapshot_save.sql

INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
VALUES (
  '20260722000200',
  ARRAY['disposable rollback-only chain bookkeeping']::TEXT[],
  'atomic_document_snapshot_save'
);

\ir 20260722_atomic_document_snapshot_contract.sql

DO $atomic_save_chain_after_00200$
DECLARE
  expected_ledger CONSTANT TEXT[] := ARRAY[
    '20260712', '20260714', '20260715', '20260716', '20260717',
    '20260718000100', '20260718000200', '20260718000300',
    '20260718000400', '20260718000500', '20260718000600',
    '20260718000700', '20260718000800', '20260718000900',
    '20260718001000', '20260718001100', '20260718001200',
    '20260721000100', '20260722000100', '20260722000150',
    '20260722000200'
  ]::TEXT[];
  actual_ledger TEXT[];
BEGIN
  SELECT array_agg(version ORDER BY version)
  INTO actual_ledger
  FROM supabase_migrations.schema_migrations;

  IF actual_ledger IS DISTINCT FROM expected_ledger
    OR (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 21
    OR (
      SELECT count(DISTINCT version)
      FROM supabase_migrations.schema_migrations
    ) <> 21
    OR (
      SELECT count(*)
      FROM supabase_migrations.schema_migrations
      WHERE version = '20260722000200'
        AND name = 'atomic_document_snapshot_save'
    ) <> 1
  THEN
    RAISE EXCEPTION 'migration-chain ledger did not advance from 20 to exact 21';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tags
    WHERE id = 'c2000000-0000-4000-8000-000000000150'::UUID
      AND name = 'A B'
      AND normalized_name = 'a b'
  ) OR EXISTS (
    (SELECT * FROM atomic_save_chain_reference_before)
    EXCEPT
    (SELECT *
     FROM public.document_tags
     WHERE document_id = 'd2000000-0000-4000-8000-000000000150'::UUID
       AND tag_id = 'c2000000-0000-4000-8000-000000000150'::UUID)
  ) THEN
    RAISE EXCEPTION '00200 changed the normalized tag or its reference';
  END IF;

  INSERT INTO atomic_save_chain_results VALUES (
    'atomic_save_advances_ledger_to_exact_21', TRUE,
    '00200 passed its preflight and complete postflight contract at exact ledger 21.'
  );
END;
$atomic_save_chain_after_00200$;

SELECT test_name, passed, detail
FROM atomic_save_chain_results
ORDER BY test_name;

DO $atomic_save_chain_complete$
DECLARE
  expected_names CONSTANT TEXT[] := ARRAY[
    'atomic_save_advances_ledger_to_exact_21',
    'ledger_starts_at_exact_19',
    'normalization_advances_ledger_to_exact_20'
  ]::TEXT[];
BEGIN
  IF (SELECT array_agg(test_name ORDER BY test_name) FROM atomic_save_chain_results)
    IS DISTINCT FROM expected_names
    OR EXISTS (SELECT 1 FROM atomic_save_chain_results WHERE NOT passed)
  THEN
    RAISE EXCEPTION 'atomic-save migration-chain assertion set is incomplete';
  END IF;

  RAISE NOTICE '19,20,21,atomic_document_snapshot_migration_chain_passed';
END;
$atomic_save_chain_complete$;

ROLLBACK;
