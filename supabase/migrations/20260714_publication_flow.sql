-- wouldkeep A6: publication snapshots, revocable share links and public discovery.
-- Apply after 20260714_document_sources.sql.

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS published_revision BIGINT;

ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_published_revision_nonnegative;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_published_revision_nonnegative
  CHECK (published_revision IS NULL OR published_revision >= 0);

CREATE TABLE IF NOT EXISTS public.document_publications (
  document_id UUID PRIMARY KEY REFERENCES public.documents(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  audience TEXT NOT NULL CHECK (audience IN ('public', 'unlisted')),
  share_token UUID NOT NULL DEFAULT uuid_generate_v4(),
  source_revision BIGINT NOT NULL CHECK (source_revision >= 0),
  snapshot JSONB NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_publications_share_token_unique UNIQUE (share_token)
);

CREATE INDEX IF NOT EXISTS idx_document_publications_owner
  ON public.document_publications(owner_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_publications_public_recent
  ON public.document_publications(published_at DESC)
  WHERE audience = 'public';

DROP TRIGGER IF EXISTS document_publications_set_updated_at ON public.document_publications;
CREATE TRIGGER document_publications_set_updated_at
  BEFORE UPDATE ON public.document_publications
  FOR EACH ROW EXECUTE FUNCTION public.set_knowledge_workspace_updated_at();

ALTER TABLE public.document_publications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can read own publications" ON public.document_publications;
CREATE POLICY "Owners can read own publications"
  ON public.document_publications FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = owner_id);

DROP POLICY IF EXISTS "Owners can create own publications" ON public.document_publications;
CREATE POLICY "Owners can create own publications"
  ON public.document_publications FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = owner_id
    AND EXISTS (
      SELECT 1 FROM public.documents document
      WHERE document.id = document_id
        AND document.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Owners can update own publications" ON public.document_publications;
CREATE POLICY "Owners can update own publications"
  ON public.document_publications FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = owner_id)
  WITH CHECK (
    (SELECT auth.uid()) = owner_id
    AND EXISTS (
      SELECT 1 FROM public.documents document
      WHERE document.id = document_id
        AND document.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Owners can delete own publications" ON public.document_publications;
CREATE POLICY "Owners can delete own publications"
  ON public.document_publications FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = owner_id);

REVOKE ALL ON TABLE public.document_publications FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.document_publications TO authenticated;

CREATE OR REPLACE FUNCTION public.publish_document(
  p_document_id UUID,
  p_audience TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  source_document public.documents%ROWTYPE;
  publication public.document_publications%ROWTYPE;
  publication_snapshot JSONB;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_audience NOT IN ('public', 'unlisted') THEN
    RAISE EXCEPTION 'Audience must be public or unlisted';
  END IF;

  SELECT * INTO source_document
  FROM public.documents document
  WHERE document.id = p_document_id
    AND document.owner_id = (SELECT auth.uid())
    AND document.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found or not owned by current user';
  END IF;

  IF char_length(btrim(source_document.title)) = 0 THEN
    RAISE EXCEPTION 'A title is required before publishing';
  END IF;

  IF char_length(btrim(source_document.body)) = 0 THEN
    RAISE EXCEPTION 'Body content is required before publishing';
  END IF;

  publication_snapshot := jsonb_build_object(
    'id', source_document.id,
    'title', source_document.title,
    'summary', CASE
      WHEN char_length(btrim(source_document.summary)) > 0 THEN source_document.summary
      ELSE left(regexp_replace(source_document.body, E'\\s+', ' ', 'g'), 240)
    END,
    'body', source_document.body,
    'topic', source_document.topic,
    'maturity', source_document.maturity,
    'revision', source_document.revision,
    'tags', COALESCE((
      SELECT jsonb_agg(tag.name ORDER BY tag.name)
      FROM public.document_tags document_tag
      JOIN public.tags tag ON tag.id = document_tag.tag_id
      WHERE document_tag.document_id = source_document.id
        AND document_tag.owner_id = (SELECT auth.uid())
    ), '[]'::JSONB),
    'sources', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'kind', source.kind,
        'url', source.url,
        'title', source.title,
        'author', source.author,
        'note', source.note,
        'accessed_at', source.accessed_at
      ) ORDER BY source.sort_order)
      FROM public.document_sources source
      WHERE source.document_id = source_document.id
        AND source.owner_id = (SELECT auth.uid())
    ), '[]'::JSONB)
  );

  INSERT INTO public.document_publications (
    document_id,
    owner_id,
    audience,
    source_revision,
    snapshot,
    published_at
  ) VALUES (
    source_document.id,
    (SELECT auth.uid()),
    p_audience,
    source_document.revision,
    publication_snapshot,
    NOW()
  )
  ON CONFLICT (document_id) DO UPDATE SET
    audience = EXCLUDED.audience,
    source_revision = EXCLUDED.source_revision,
    snapshot = EXCLUDED.snapshot,
    published_at = NOW()
  RETURNING * INTO publication;

  UPDATE public.documents
  SET status = 'published',
      visibility = p_audience,
      published_at = publication.published_at,
      published_revision = source_document.revision
  WHERE id = source_document.id
    AND owner_id = (SELECT auth.uid());

  RETURN jsonb_build_object(
    'document_id', publication.document_id,
    'audience', publication.audience,
    'share_token', CASE WHEN publication.audience = 'unlisted' THEN publication.share_token ELSE NULL END,
    'source_revision', publication.source_revision,
    'published_at', publication.published_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.unpublish_document(p_document_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  DELETE FROM public.document_publications publication
  WHERE publication.document_id = p_document_id
    AND publication.owner_id = (SELECT auth.uid());

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  UPDATE public.documents
  SET status = 'draft',
      visibility = 'private',
      published_at = NULL,
      published_revision = NULL
  WHERE id = p_document_id
    AND owner_id = (SELECT auth.uid());

  RETURN TRUE;
END;
$$;

-- These two functions are intentional read-only public API endpoints. They run
-- with a fixed search_path and return snapshot whitelist fields only.
CREATE OR REPLACE FUNCTION public.read_published_document(
  p_document_id UUID DEFAULT NULL,
  p_share_token UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'document_id', publication.document_id,
    'audience', publication.audience,
    'published_at', publication.published_at,
    'content', publication.snapshot
  )
  FROM public.document_publications publication
  WHERE (
      p_document_id IS NOT NULL
      AND publication.document_id = p_document_id
      AND publication.audience = 'public'
    ) OR (
      p_share_token IS NOT NULL
      AND publication.share_token = p_share_token
      AND publication.audience = 'unlisted'
    )
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.list_public_documents(
  p_limit INTEGER DEFAULT 24,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(jsonb_agg(item ORDER BY item.published_at DESC), '[]'::JSONB)
  FROM (
    SELECT
      publication.document_id,
      publication.published_at,
      publication.snapshot->>'title' AS title,
      publication.snapshot->>'summary' AS summary,
      publication.snapshot->>'topic' AS topic,
      publication.snapshot->>'maturity' AS maturity,
      publication.snapshot->'tags' AS tags
    FROM public.document_publications publication
    WHERE publication.audience = 'public'
    ORDER BY publication.published_at DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 50)
    OFFSET GREATEST(p_offset, 0)
  ) item;
$$;

REVOKE ALL ON FUNCTION public.publish_document(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unpublish_document(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_document(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unpublish_document(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.read_published_document(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_public_documents(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_published_document(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_documents(INTEGER, INTEGER) TO anon, authenticated;

COMMENT ON TABLE public.document_publications IS
  'Owner-managed immutable-at-read publication snapshots; unlisted rows are never directly anonymous-readable.';
COMMENT ON FUNCTION public.read_published_document(UUID, UUID) IS
  'Returns one whitelisted public snapshot by document id or one unlisted snapshot by exact revocable token.';
