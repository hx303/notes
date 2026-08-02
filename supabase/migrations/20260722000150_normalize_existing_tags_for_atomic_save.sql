-- wouldkeep P1B prerequisite: canonicalize legacy tag rows in place before the
-- atomic document snapshot RPC is introduced by 20260722000200.
--
-- The production change set is pinned separately by the read-only preflight.
-- This migration intentionally remains replay-safe: an empty or already canonical
-- database performs zero writes. Transaction ownership remains with the migration
-- runner; the single DO statement makes both update phases atomic on its own.

SET lock_timeout = '5s';
SET statement_timeout = '5min';

DO $tag_normalization$
DECLARE
  affected_ids UUID[] := ARRAY[]::UUID[];
  affected_count BIGINT := 0;
  phase_row_count BIGINT := 0;
  tag_count_before BIGINT;
  document_tag_count_before BIGINT;
  immutable_tag_fingerprint_before TEXT;
  document_tag_fingerprint_before TEXT;
  expected_tag_fingerprint TEXT;
  actual_tag_fingerprint TEXT;
  deployment_gate_present BOOLEAN := false;
  deployment_permit_opened BOOLEAN := false;
BEGIN
  IF current_setting('server_encoding') <> 'UTF8' THEN
    RAISE EXCEPTION 'tag normalization requires a UTF8 database'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF to_regclass('public.tags') IS NULL
    OR to_regclass('public.document_tags') IS NULL
    OR to_regprocedure('public.grant_role(uuid,text,text)') IS NULL
    OR pg_get_functiondef('public.grant_role(uuid,text,text)'::REGPROCEDURE)
      NOT LIKE '%public.is_site_owner(target_uid)%'
  THEN
    RAISE EXCEPTION
      '20260722000100 and the tag relations must exist before 20260722000150'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF to_regnamespace('wouldkeep_private') IS NOT NULL
    OR to_regprocedure(
      'public.save_document_snapshot_v1(text,uuid,uuid,bigint,jsonb)'
    ) IS NOT NULL
  THEN
    RAISE EXCEPTION
      '20260722000200 is already present; do not apply its prerequisite out of order'
      USING ERRCODE = 'object_not_in_prerequisite_state';
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
  ) <> 1 THEN
    RAISE EXCEPTION 'the tag normalized-name unique constraint has drifted'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  -- Freeze both the tag values and every referring row while the before/after
  -- fingerprints are computed. Readers remain available; concurrent DML fails the
  -- five-second lock gate instead of racing this one-time repair.
  LOCK TABLE public.tags, public.document_tags IN SHARE ROW EXCLUSIVE MODE;

  deployment_gate_present :=
    to_regnamespace('wouldkeep_maintenance') IS NOT NULL
    OR to_regprocedure(
      'wouldkeep_maintenance.open_tag_normalization_00150_permit()'
    ) IS NOT NULL
    OR to_regprocedure(
      'wouldkeep_maintenance.reject_tag_write_while_paused()'
    ) IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_trigger trigger
      WHERE trigger.tgname IN (
        'wouldkeep_tags_write_pause',
        'wouldkeep_document_tags_write_pause'
      )
    );

  IF deployment_gate_present THEN
    IF to_regnamespace('wouldkeep_maintenance') IS NULL
       OR to_regprocedure(
         'wouldkeep_maintenance.open_tag_normalization_00150_permit()'
       ) IS NULL
       OR to_regprocedure(
         'wouldkeep_maintenance.reject_tag_write_while_paused()'
       ) IS NULL
       OR (SELECT count(*)
           FROM pg_catalog.pg_trigger trigger
           WHERE trigger.tgname IN (
             'wouldkeep_tags_write_pause',
             'wouldkeep_document_tags_write_pause'
           )
          ) <> 2
       OR (SELECT count(*)
           FROM pg_catalog.pg_trigger trigger
           WHERE (
             (trigger.tgrelid = 'public.tags'::regclass
              AND trigger.tgname = 'wouldkeep_tags_write_pause')
             OR
             (trigger.tgrelid = 'public.document_tags'::regclass
              AND trigger.tgname = 'wouldkeep_document_tags_write_pause')
           )
             AND trigger.tgenabled = 'A'
             AND trigger.tgtype = 62
             AND NOT trigger.tgisinternal
             AND trigger.tgfoid =
               'wouldkeep_maintenance.reject_tag_write_while_paused()'::regprocedure
          ) <> 2 THEN
      RAISE EXCEPTION 'the tag-write pause deployment gate is partial or drifted'
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    PERFORM wouldkeep_maintenance.open_tag_normalization_00150_permit();
    deployment_permit_opened := true;
  END IF;

  SELECT
    count(*),
    md5(COALESCE(string_agg(
      tag.id::TEXT || chr(31) ||
      tag.knowledge_base_id::TEXT || chr(31) ||
      tag.owner_id::TEXT || chr(31) ||
      tag.created_at::TEXT,
      chr(30) ORDER BY tag.id::TEXT COLLATE "C"
    ), ''))
  INTO tag_count_before, immutable_tag_fingerprint_before
  FROM public.tags tag;

  SELECT
    count(*),
    md5(COALESCE(string_agg(
      document_tag.document_id::TEXT || chr(31) ||
      document_tag.tag_id::TEXT || chr(31) ||
      document_tag.owner_id::TEXT || chr(31) ||
      document_tag.created_at::TEXT,
      chr(30) ORDER BY
        document_tag.document_id::TEXT COLLATE "C",
        document_tag.tag_id::TEXT COLLATE "C"
    ), ''))
  INTO document_tag_count_before, document_tag_fingerprint_before
  FROM public.document_tags document_tag;

  IF EXISTS (
    SELECT 1
    FROM public.tags tag
    CROSS JOIN LATERAL (
      SELECT regexp_replace(
        btrim(normalize(tag.name, NFKC)),
        '[[:space:]]+',
        ' ',
        'g'
      ) AS canonical_name
    ) intended
    WHERE intended.canonical_name = ''
      OR char_length(intended.canonical_name) > 80
      OR intended.canonical_name ~ '^[[:punct:][:space:]]+$'
  ) THEN
    RAISE EXCEPTION 'a tag cannot be represented by the v1 canonical contract'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT
        tag.knowledge_base_id,
        lower(regexp_replace(
          btrim(normalize(tag.name, NFKC)),
          '[[:space:]]+',
          ' ',
          'g'
        )) AS intended_normalized_name
      FROM public.tags tag
      GROUP BY
        tag.knowledge_base_id,
        lower(regexp_replace(
          btrim(normalize(tag.name, NFKC)),
          '[[:space:]]+',
          ' ',
          'g'
        ))
      HAVING count(*) > 1
    ) collision
  ) THEN
    RAISE EXCEPTION 'canonical tag names would collide inside a knowledge base'
      USING ERRCODE = 'unique_violation';
  END IF;

  SELECT COALESCE(array_agg(tag.id ORDER BY tag.id), ARRAY[]::UUID[])
  INTO affected_ids
  FROM public.tags tag
  WHERE tag.name <> regexp_replace(
      btrim(normalize(tag.name, NFKC)),
      '[[:space:]]+',
      ' ',
      'g'
    )
    OR tag.normalized_name <> lower(regexp_replace(
      btrim(normalize(tag.name, NFKC)),
      '[[:space:]]+',
      ' ',
      'g'
    ));

  affected_count := cardinality(affected_ids);

  -- The non-deferrable unique constraint can reject a direct key swap even when
  -- the final projection is unique. Reserve a deterministic per-ID keyspace first.
  IF EXISTS (
    SELECT 1
    FROM public.tags tag
    WHERE left(
      tag.normalized_name,
      char_length('__wouldkeep_tmp_22000150_')
    ) = '__wouldkeep_tmp_22000150_'
  ) OR EXISTS (
    SELECT 1
    FROM public.tags candidate
    JOIN public.tags other
      ON other.knowledge_base_id = candidate.knowledge_base_id
     AND other.id <> candidate.id
     AND other.normalized_name =
       '__wouldkeep_tmp_22000150_' || replace(candidate.id::TEXT, '-', '')
    WHERE candidate.id = ANY(affected_ids)
  ) THEN
    RAISE EXCEPTION 'the reserved tag-normalization keyspace is not empty'
      USING ERRCODE = 'unique_violation';
  END IF;

  SELECT md5(COALESCE(string_agg(
    tag.id::TEXT || chr(31) ||
    tag.knowledge_base_id::TEXT || chr(31) ||
    tag.owner_id::TEXT || chr(31) ||
    encode(convert_to(intended.canonical_name, 'UTF8'), 'hex') || chr(31) ||
    encode(convert_to(lower(intended.canonical_name), 'UTF8'), 'hex') || chr(31) ||
    tag.created_at::TEXT,
    chr(30) ORDER BY tag.id::TEXT COLLATE "C"
  ), ''))
  INTO expected_tag_fingerprint
  FROM public.tags tag
  CROSS JOIN LATERAL (
    SELECT regexp_replace(
      btrim(normalize(tag.name, NFKC)),
      '[[:space:]]+',
      ' ',
      'g'
    ) AS canonical_name
  ) intended;

  UPDATE public.tags tag
  SET normalized_name =
    '__wouldkeep_tmp_22000150_' || replace(tag.id::TEXT, '-', '')
  WHERE tag.id = ANY(affected_ids);

  GET DIAGNOSTICS phase_row_count = ROW_COUNT;
  IF phase_row_count <> affected_count THEN
    RAISE EXCEPTION 'tag normalization temporary phase row count drifted'
      USING ERRCODE = 'data_exception';
  END IF;

  UPDATE public.tags tag
  SET
    name = regexp_replace(
      btrim(normalize(tag.name, NFKC)),
      '[[:space:]]+',
      ' ',
      'g'
    ),
    normalized_name = lower(regexp_replace(
      btrim(normalize(tag.name, NFKC)),
      '[[:space:]]+',
      ' ',
      'g'
    ))
  WHERE tag.id = ANY(affected_ids);

  GET DIAGNOSTICS phase_row_count = ROW_COUNT;
  IF phase_row_count <> affected_count THEN
    RAISE EXCEPTION 'tag normalization final phase row count drifted'
      USING ERRCODE = 'data_exception';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tags tag
    WHERE left(
        tag.normalized_name,
        char_length('__wouldkeep_tmp_22000150_')
      ) = '__wouldkeep_tmp_22000150_'
      OR tag.name <> regexp_replace(
        btrim(normalize(tag.name, NFKC)),
        '[[:space:]]+',
        ' ',
        'g'
      )
      OR tag.normalized_name <> lower(regexp_replace(
        btrim(normalize(tag.name, NFKC)),
        '[[:space:]]+',
        ' ',
        'g'
      ))
      OR tag.name ~ '^[[:punct:][:space:]]+$'
  ) THEN
    RAISE EXCEPTION 'tag normalization postcondition failed'
      USING ERRCODE = 'data_exception';
  END IF;

  SELECT md5(COALESCE(string_agg(
    tag.id::TEXT || chr(31) ||
    tag.knowledge_base_id::TEXT || chr(31) ||
    tag.owner_id::TEXT || chr(31) ||
    encode(convert_to(tag.name, 'UTF8'), 'hex') || chr(31) ||
    encode(convert_to(tag.normalized_name, 'UTF8'), 'hex') || chr(31) ||
    tag.created_at::TEXT,
    chr(30) ORDER BY tag.id::TEXT COLLATE "C"
  ), ''))
  INTO actual_tag_fingerprint
  FROM public.tags tag;

  IF actual_tag_fingerprint IS DISTINCT FROM expected_tag_fingerprint
    OR (SELECT count(*) FROM public.tags) <> tag_count_before
    OR (
      SELECT md5(COALESCE(string_agg(
        tag.id::TEXT || chr(31) ||
        tag.knowledge_base_id::TEXT || chr(31) ||
        tag.owner_id::TEXT || chr(31) ||
        tag.created_at::TEXT,
        chr(30) ORDER BY tag.id::TEXT COLLATE "C"
      ), ''))
      FROM public.tags tag
    ) IS DISTINCT FROM immutable_tag_fingerprint_before
    OR (SELECT count(*) FROM public.document_tags) <> document_tag_count_before
    OR (
      SELECT md5(COALESCE(string_agg(
        document_tag.document_id::TEXT || chr(31) ||
        document_tag.tag_id::TEXT || chr(31) ||
        document_tag.owner_id::TEXT || chr(31) ||
        document_tag.created_at::TEXT,
        chr(30) ORDER BY
          document_tag.document_id::TEXT COLLATE "C",
          document_tag.tag_id::TEXT COLLATE "C"
      ), ''))
      FROM public.document_tags document_tag
    ) IS DISTINCT FROM document_tag_fingerprint_before
  THEN
    RAISE EXCEPTION 'tag identity, metadata, or document references changed unexpectedly'
      USING ERRCODE = 'data_exception';
  END IF;

  IF deployment_permit_opened THEN
    EXECUTE 'DROP TABLE pg_temp.wouldkeep_tag_normalization_00150_permit';

    IF to_regclass('pg_temp.wouldkeep_tag_normalization_00150_permit') IS NOT NULL THEN
      RAISE EXCEPTION 'the tag-normalization deployment permit was not closed'
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
  END IF;
END;
$tag_normalization$;

RESET statement_timeout;
RESET lock_timeout;
