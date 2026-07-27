-- Production-safe, read-only business-state fingerprint for 20260722000200.
-- Migration deployment must not change any row represented here.

WITH state_rows AS (
  SELECT 'knowledge_bases'::TEXT AS table_name, knowledge_base.id::TEXT AS row_key,
    md5(row_to_json(knowledge_base)::TEXT) AS row_hash
  FROM public.knowledge_bases knowledge_base
  UNION ALL
  SELECT 'documents', document.id::TEXT, md5(row_to_json(document)::TEXT)
  FROM public.documents document
  UNION ALL
  SELECT 'document_versions', version.id::TEXT, md5(row_to_json(version)::TEXT)
  FROM public.document_versions version
  UNION ALL
  SELECT 'tags', tag.id::TEXT, md5(row_to_json(tag)::TEXT)
  FROM public.tags tag
  UNION ALL
  SELECT 'document_tags', document_tag.document_id::TEXT || chr(31) || document_tag.tag_id::TEXT,
    md5(row_to_json(document_tag)::TEXT)
  FROM public.document_tags document_tag
  UNION ALL
  SELECT 'document_links', link.from_document_id::TEXT || chr(31) ||
    link.to_document_id::TEXT || chr(31) || link.relation_type,
    md5(row_to_json(link)::TEXT)
  FROM public.document_links link
  UNION ALL
  SELECT 'document_sources', source.id::TEXT, md5(row_to_json(source)::TEXT)
  FROM public.document_sources source
  UNION ALL
  SELECT 'document_publications', publication.document_id::TEXT,
    md5(row_to_json(publication)::TEXT)
  FROM public.document_publications publication
)
SELECT
  md5(COALESCE(string_agg(
    table_name || chr(31) || row_key || chr(31) || row_hash,
    chr(30) ORDER BY table_name, row_key
  ), '')) AS atomic_document_snapshot_state_fingerprint,
  'atomic_document_snapshot_state_fingerprint_passed' AS result
FROM state_rows;
