-- wouldkeep A5: structured, owner-only sources for knowledge documents.
-- Apply after 20260712_document_organization.sql.

CREATE TABLE IF NOT EXISTS public.document_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('web', 'personal')),
  url TEXT CHECK (url IS NULL OR char_length(url) <= 2048),
  title TEXT NOT NULL DEFAULT '' CHECK (char_length(title) <= 240),
  author TEXT NOT NULL DEFAULT '' CHECK (char_length(author) <= 160),
  note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 1000),
  accessed_at DATE,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_sources_document_order_unique UNIQUE (document_id, sort_order),
  CONSTRAINT document_sources_required_fields CHECK (
    (kind = 'web' AND url ~* '^https?://[^[:space:]]+$')
    OR
    (kind = 'personal' AND char_length(btrim(title)) > 0 AND url IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_document_sources_document_order
  ON public.document_sources(document_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_document_sources_owner
  ON public.document_sources(owner_id, updated_at DESC);

DROP TRIGGER IF EXISTS document_sources_set_updated_at ON public.document_sources;
CREATE TRIGGER document_sources_set_updated_at
  BEFORE UPDATE ON public.document_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_knowledge_workspace_updated_at();

ALTER TABLE public.document_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can read own document sources" ON public.document_sources;
CREATE POLICY "Owners can read own document sources"
  ON public.document_sources FOR SELECT
  USING (
    auth.uid() = owner_id
    AND EXISTS (
      SELECT 1 FROM public.documents document
      WHERE document.id = document_id
        AND document.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owners can create own document sources" ON public.document_sources;
CREATE POLICY "Owners can create own document sources"
  ON public.document_sources FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id
    AND EXISTS (
      SELECT 1 FROM public.documents document
      WHERE document.id = document_id
        AND document.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owners can update own document sources" ON public.document_sources;
CREATE POLICY "Owners can update own document sources"
  ON public.document_sources FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (
    auth.uid() = owner_id
    AND EXISTS (
      SELECT 1 FROM public.documents document
      WHERE document.id = document_id
        AND document.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owners can delete own document sources" ON public.document_sources;
CREATE POLICY "Owners can delete own document sources"
  ON public.document_sources FOR DELETE
  USING (
    auth.uid() = owner_id
    AND EXISTS (
      SELECT 1 FROM public.documents document
      WHERE document.id = document_id
        AND document.owner_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.replace_document_sources(
  p_document_id UUID,
  p_sources JSONB DEFAULT '[]'::JSONB
)
RETURNS SETOF public.document_sources
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF jsonb_typeof(COALESCE(p_sources, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'Sources must be a JSON array';
  END IF;

  IF jsonb_array_length(COALESCE(p_sources, '[]'::JSONB)) > 50 THEN
    RAISE EXCEPTION 'A document can contain at most 50 sources';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.documents document
    WHERE document.id = p_document_id
      AND document.owner_id = auth.uid()
      AND document.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Document not found or not owned by current user';
  END IF;

  DELETE FROM public.document_sources
  WHERE document_id = p_document_id
    AND owner_id = auth.uid();

  RETURN QUERY
  INSERT INTO public.document_sources (
    document_id,
    owner_id,
    kind,
    url,
    title,
    author,
    note,
    accessed_at,
    sort_order
  )
  SELECT
    p_document_id,
    auth.uid(),
    CASE WHEN source.value->>'kind' = 'personal' THEN 'personal' ELSE 'web' END,
    CASE
      WHEN source.value->>'kind' = 'personal' THEN NULL
      ELSE NULLIF(btrim(source.value->>'url'), '')
    END,
    left(COALESCE(btrim(source.value->>'title'), ''), 240),
    left(COALESCE(btrim(source.value->>'author'), ''), 160),
    left(COALESCE(btrim(source.value->>'note'), ''), 1000),
    CASE WHEN source.value->>'kind' = 'personal' THEN NULL ELSE CURRENT_DATE END,
    source.ordinality::INTEGER - 1
  FROM jsonb_array_elements(COALESCE(p_sources, '[]'::JSONB)) WITH ORDINALITY AS source(value, ordinality)
  ORDER BY source.ordinality
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_document_sources(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_document_sources(UUID, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.replace_document_sources(UUID, JSONB) TO authenticated;

COMMENT ON TABLE public.document_sources IS
  'Ordered owner-only evidence and personal-experience sources attached to a knowledge document.';
COMMENT ON FUNCTION public.replace_document_sources(UUID, JSONB) IS
  'Atomically validates ownership and replaces the current user document source list.';
