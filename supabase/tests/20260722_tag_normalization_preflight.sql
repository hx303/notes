-- Production-safe, read-only preflight for 20260722000150.
-- It pins only aggregate observations; it never emits tag text or production UUIDs.

DO $tag_normalization_preflight$
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
  candidate_count BIGINT;
  affected_reference_count BIGINT;
  transient_collision_count BIGINT;
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
    RAISE EXCEPTION '20260722000200 is already present; stop and review ordering';
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
    RAISE EXCEPTION 'tag unique or document-tag foreign-key contract drifted';
  END IF;

  IF (SELECT count(*) FROM public.tags) <> 462 THEN
    RAISE EXCEPTION 'expected the reviewed 462-row production tag baseline';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tags tag
    CROSS JOIN LATERAL (
      SELECT regexp_replace(
        btrim(normalize(tag.name, NFKC)), '[[:space:]]+', ' ', 'g'
      ) AS canonical_name
    ) intended
    WHERE intended.canonical_name = ''
      OR char_length(intended.canonical_name) > 80
      OR intended.canonical_name ~ '^[[:punct:][:space:]]+$'
  ) THEN
    RAISE EXCEPTION 'one or more tags cannot satisfy the v1 canonical contract';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT
        tag.knowledge_base_id,
        lower(regexp_replace(
          btrim(normalize(tag.name, NFKC)), '[[:space:]]+', ' ', 'g'
        )) AS intended_normalized_name
      FROM public.tags tag
      GROUP BY
        tag.knowledge_base_id,
        lower(regexp_replace(
          btrim(normalize(tag.name, NFKC)), '[[:space:]]+', ' ', 'g'
        ))
      HAVING count(*) > 1
    ) collision
  ) THEN
    RAISE EXCEPTION 'projected canonical tag collision count is not zero';
  END IF;

  WITH candidates AS (
    SELECT
      tag.id,
      tag.knowledge_base_id,
      lower(regexp_replace(
        btrim(normalize(tag.name, NFKC)), '[[:space:]]+', ' ', 'g'
      )) AS intended_normalized_name
    FROM public.tags tag
    WHERE tag.name <> regexp_replace(
        btrim(normalize(tag.name, NFKC)), '[[:space:]]+', ' ', 'g'
      )
      OR tag.normalized_name <> lower(regexp_replace(
        btrim(normalize(tag.name, NFKC)), '[[:space:]]+', ' ', 'g'
      ))
  )
  SELECT
    count(DISTINCT candidate.id),
    count(document_tag.tag_id),
    count(DISTINCT other.id)
  INTO candidate_count, affected_reference_count, transient_collision_count
  FROM candidates candidate
  LEFT JOIN public.document_tags document_tag ON document_tag.tag_id = candidate.id
  LEFT JOIN public.tags other
    ON other.knowledge_base_id = candidate.knowledge_base_id
   AND other.id <> candidate.id
   AND other.normalized_name = candidate.intended_normalized_name;

  IF candidate_count <> 6
    OR affected_reference_count <> 65
    OR transient_collision_count <> 0
    OR (
      SELECT count(DISTINCT document_tag.tag_id)
      FROM public.document_tags document_tag
      JOIN public.tags tag ON tag.id = document_tag.tag_id
      WHERE tag.name <> regexp_replace(
          btrim(normalize(tag.name, NFKC)), '[[:space:]]+', ' ', 'g'
        )
        OR tag.normalized_name <> lower(regexp_replace(
          btrim(normalize(tag.name, NFKC)), '[[:space:]]+', ' ', 'g'
        ))
    ) <> 6
  THEN
    RAISE EXCEPTION 'reviewed 6-tag/65-reference aggregate baseline drifted';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tags tag
    WHERE left(
      tag.normalized_name,
      char_length('__wouldkeep_tmp_22000150_')
    ) = '__wouldkeep_tmp_22000150_'
  ) THEN
    RAISE EXCEPTION 'reserved tag-normalization keyspace is not empty';
  END IF;

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
    RAISE EXCEPTION 'pre-deployment migration ledger mismatch';
  END IF;

  RAISE NOTICE
    'tag_normalization_preflight_passed tags=462 candidates=6 affected_references=65 collisions=0';
END;
$tag_normalization_preflight$;
