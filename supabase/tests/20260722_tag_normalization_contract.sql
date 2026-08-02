-- Production-safe, read-only postflight contract for 20260722000150.

DO $tag_normalization_contract$
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
  IF current_setting('server_encoding') <> 'UTF8'
    OR to_regclass('public.tags') IS NULL
    OR to_regclass('public.document_tags') IS NULL
    OR to_regprocedure('public.grant_role(uuid,text,text)') IS NULL
    OR pg_get_functiondef('public.grant_role(uuid,text,text)'::REGPROCEDURE)
      NOT LIKE '%public.is_site_owner(target_uid)%'
  THEN
    RAISE EXCEPTION 'tag-normalization prerequisite objects or encoding drifted';
  END IF;

  IF to_regnamespace('wouldkeep_private') IS NOT NULL
    OR to_regprocedure(
      'public.save_document_snapshot_v1(text,uuid,uuid,bigint,jsonb)'
    ) IS NOT NULL
  THEN
    RAISE EXCEPTION '20260722000200 must remain absent during 00150 postflight';
  END IF;

  IF (SELECT count(*) FROM public.tags) <> 462
    OR EXISTS (
      SELECT 1
      FROM public.tags tag
      WHERE tag.name <> regexp_replace(
          btrim(normalize(tag.name, NFKC)), '[[:space:]]+', ' ', 'g'
        )
        OR tag.normalized_name <> lower(regexp_replace(
          btrim(normalize(tag.name, NFKC)), '[[:space:]]+', ' ', 'g'
        ))
        OR tag.name ~ '^[[:punct:][:space:]]+$'
        OR left(
          tag.normalized_name,
          char_length('__wouldkeep_tmp_22000150_')
        ) = '__wouldkeep_tmp_22000150_'
    )
  THEN
    RAISE EXCEPTION 'post-deployment tag canonicalization contract failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT tag.knowledge_base_id, tag.normalized_name
      FROM public.tags tag
      GROUP BY tag.knowledge_base_id, tag.normalized_name
      HAVING count(*) > 1
    ) collision
  ) THEN
    RAISE EXCEPTION 'post-deployment canonical tag collision exists';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_constraint catalog_constraint
    WHERE catalog_constraint.conrelid = 'public.tags'::REGCLASS
      AND catalog_constraint.conname = 'tags_knowledge_base_normalized_unique'
      AND catalog_constraint.contype = 'u'
      AND catalog_constraint.convalidated
      AND NOT catalog_constraint.condeferrable
      AND NOT catalog_constraint.condeferred
  ) <> 1 OR (
    SELECT count(*)
    FROM pg_catalog.pg_constraint catalog_constraint
    WHERE catalog_constraint.conrelid = 'public.document_tags'::REGCLASS
      AND catalog_constraint.confrelid = 'public.tags'::REGCLASS
      AND catalog_constraint.contype = 'f'
      AND catalog_constraint.convalidated
      AND catalog_constraint.confdeltype = 'c'
  ) <> 1 THEN
    RAISE EXCEPTION 'tag unique or document-tag foreign-key contract changed';
  END IF;

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
    OR EXISTS (
      SELECT 1
      FROM supabase_migrations.schema_migrations
      WHERE version = '20260722000200'
    )
  THEN
    RAISE EXCEPTION 'post-deployment migration ledger mismatch';
  END IF;

  RAISE NOTICE
    'tag_normalization_contract_passed tags=462 candidates=0 collisions=0 ledger=20';
END;
$tag_normalization_contract$;

SELECT
  'tag_normalization_contract_passed' AS result,
  462::bigint AS tags,
  0::bigint AS candidates,
  0::bigint AS collisions,
  20::bigint AS ledger_versions;
