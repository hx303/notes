-- Production-safe, read-only aggregate state for 20260722000150.
-- The output contains only counts and whole-set SHA-256 fingerprints, never tag text,
-- per-row hashes, UUIDs, account content, or document content.

WITH canonical_tags AS (
  SELECT
    tag.*,
    regexp_replace(
      btrim(normalize(tag.name, NFKC)), '[[:space:]]+', ' ', 'g'
    ) AS canonical_name
  FROM public.tags tag
), tag_state AS (
  SELECT
    count(*) AS tag_count,
    count(*) FILTER (
      WHERE name <> canonical_name
         OR normalized_name <> lower(canonical_name)
    ) AS candidate_count,
    encode(sha256(convert_to(COALESCE(string_agg(
      id::TEXT || chr(31) ||
      knowledge_base_id::TEXT || chr(31) ||
      owner_id::TEXT || chr(31) ||
      created_at::TEXT,
      chr(30) ORDER BY id::TEXT COLLATE "C"
    ), ''), 'UTF8')), 'hex') AS immutable_fingerprint,
    encode(sha256(convert_to(COALESCE(string_agg(
      id::TEXT || chr(31) ||
      knowledge_base_id::TEXT || chr(31) ||
      owner_id::TEXT || chr(31) ||
      encode(convert_to(name, 'UTF8'), 'hex') || chr(31) ||
      encode(convert_to(normalized_name, 'UTF8'), 'hex') || chr(31) ||
      created_at::TEXT,
      chr(30) ORDER BY id::TEXT COLLATE "C"
    ), ''), 'UTF8')), 'hex') AS actual_fingerprint,
    encode(sha256(convert_to(COALESCE(string_agg(
      id::TEXT || chr(31) ||
      knowledge_base_id::TEXT || chr(31) ||
      owner_id::TEXT || chr(31) ||
      encode(convert_to(canonical_name, 'UTF8'), 'hex') || chr(31) ||
      encode(convert_to(lower(canonical_name), 'UTF8'), 'hex') || chr(31) ||
      created_at::TEXT,
      chr(30) ORDER BY id::TEXT COLLATE "C"
    ), ''), 'UTF8')), 'hex') AS projected_fingerprint
  FROM canonical_tags
), reference_state AS (
  SELECT
    count(*) AS reference_count,
    encode(sha256(convert_to(COALESCE(string_agg(
      document_tag.document_id::TEXT || chr(31) ||
      document_tag.tag_id::TEXT || chr(31) ||
      document_tag.owner_id::TEXT || chr(31) ||
      document_tag.created_at::TEXT,
      chr(30) ORDER BY
        document_tag.document_id::TEXT COLLATE "C",
        document_tag.tag_id::TEXT COLLATE "C"
    ), ''), 'UTF8')), 'hex') AS reference_fingerprint
  FROM public.document_tags document_tag
), affected_reference_state AS (
  SELECT count(*) AS affected_reference_count
  FROM public.document_tags document_tag
  JOIN canonical_tags tag ON tag.id = document_tag.tag_id
  WHERE tag.name <> tag.canonical_name
     OR tag.normalized_name <> lower(tag.canonical_name)
)
SELECT concat(
  'tag_normalization_state|tags=', tag_state.tag_count,
  '|refs=', reference_state.reference_count,
  '|candidates=', tag_state.candidate_count,
  '|affected_refs=', affected_reference_state.affected_reference_count,
  '|immutable=', tag_state.immutable_fingerprint,
  '|document_tags=', reference_state.reference_fingerprint,
  '|actual=', tag_state.actual_fingerprint,
  '|projected=', tag_state.projected_fingerprint
) AS result
FROM tag_state
CROSS JOIN reference_state
CROSS JOIN affected_reference_state;
