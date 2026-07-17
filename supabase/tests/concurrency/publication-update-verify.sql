\set ON_ERROR_STOP on

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.documents document
    LEFT JOIN public.document_publications publication ON publication.document_id = document.id
    WHERE document.id IN (
      'ad100000-0000-4000-8000-000000000001',
      'ad200000-0000-4000-8000-000000000002'
    )
      AND (document.deleted_at IS NULL OR publication.document_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'publication UPDATE concurrency invariant failed';
  END IF;
END;
$$;

SELECT id, deleted_at IS NOT NULL AS deleted,
  NOT EXISTS (
    SELECT 1 FROM public.document_publications publication
    WHERE publication.document_id = document.id
  ) AS publication_revoked
FROM public.documents document
WHERE document.id IN (
  'ad100000-0000-4000-8000-000000000001',
  'ad200000-0000-4000-8000-000000000002'
)
ORDER BY id;
