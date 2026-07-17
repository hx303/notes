-- wouldkeep account knowledge workspace foundation
-- A0.1: one owner can create/read private knowledge; anonymous and other users cannot.
-- Apply after supabase/schema.sql and before the workspace UI uses these tables.

CREATE TABLE IF NOT EXISTS public.knowledge_bases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
  default_visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (default_visibility IN ('private', 'unlisted', 'public')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_bases_owner
  ON public.knowledge_bases(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  knowledge_base_id UUID NOT NULL REFERENCES public.knowledge_bases(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '' CHECK (char_length(title) <= 160),
  summary TEXT NOT NULL DEFAULT '' CHECK (char_length(summary) <= 600),
  body TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL DEFAULT '',
  maturity TEXT NOT NULL DEFAULT 'seed'
    CHECK (maturity IN ('seed', 'growing', 'stable')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ready', 'published', 'archived')),
  visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'unlisted', 'public')),
  slug TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT documents_slug_format CHECK (
    slug IS NULL OR slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  )
);

CREATE INDEX IF NOT EXISTS idx_documents_owner_updated
  ON public.documents(owner_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_documents_knowledge_base_updated
  ON public.documents(knowledge_base_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_owner_slug
  ON public.documents(owner_id, slug)
  WHERE slug IS NOT NULL AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.set_knowledge_workspace_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS knowledge_bases_set_updated_at ON public.knowledge_bases;
CREATE TRIGGER knowledge_bases_set_updated_at
  BEFORE UPDATE ON public.knowledge_bases
  FOR EACH ROW EXECUTE FUNCTION public.set_knowledge_workspace_updated_at();

DROP TRIGGER IF EXISTS documents_set_updated_at ON public.documents;
CREATE TRIGGER documents_set_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.set_knowledge_workspace_updated_at();

ALTER TABLE public.knowledge_bases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can read own knowledge bases" ON public.knowledge_bases;
CREATE POLICY "Owners can read own knowledge bases"
  ON public.knowledge_bases FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can create own knowledge bases" ON public.knowledge_bases;
CREATE POLICY "Owners can create own knowledge bases"
  ON public.knowledge_bases FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can update own knowledge bases" ON public.knowledge_bases;
CREATE POLICY "Owners can update own knowledge bases"
  ON public.knowledge_bases FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can delete own knowledge bases" ON public.knowledge_bases;
CREATE POLICY "Owners can delete own knowledge bases"
  ON public.knowledge_bases FOR DELETE
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can read own documents" ON public.documents;
CREATE POLICY "Owners can read own documents"
  ON public.documents FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can create own documents" ON public.documents;
CREATE POLICY "Owners can create own documents"
  ON public.documents FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id
    AND EXISTS (
      SELECT 1
      FROM public.knowledge_bases kb
      WHERE kb.id = knowledge_base_id
        AND kb.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owners can update own documents" ON public.documents;
CREATE POLICY "Owners can update own documents"
  ON public.documents FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (
    auth.uid() = owner_id
    AND EXISTS (
      SELECT 1
      FROM public.knowledge_bases kb
      WHERE kb.id = knowledge_base_id
        AND kb.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owners can delete own documents" ON public.documents;
CREATE POLICY "Owners can delete own documents"
  ON public.documents FOR DELETE
  USING (auth.uid() = owner_id);

COMMENT ON TABLE public.knowledge_bases IS
  'Private knowledge libraries owned by an authenticated wouldkeep user.';
COMMENT ON TABLE public.documents IS
  'Private-first knowledge drafts; public read policy is added only with the publish flow.';
