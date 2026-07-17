-- wouldkeep A0.3: optimistic revisions and owner-only snapshots.

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0;

ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_revision_nonnegative;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_revision_nonnegative CHECK (revision >= 0);

CREATE TABLE IF NOT EXISTS public.document_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version_no BIGINT NOT NULL CHECK (version_no >= 0),
  snapshot JSONB NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_versions_document_version_unique UNIQUE (document_id, version_no)
);

CREATE INDEX IF NOT EXISTS idx_document_versions_owner_document
  ON public.document_versions(owner_id, document_id, version_no DESC);

ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can read own document versions" ON public.document_versions;
CREATE POLICY "Owners can read own document versions"
  ON public.document_versions FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can create own document versions" ON public.document_versions;
CREATE POLICY "Owners can create own document versions"
  ON public.document_versions FOR INSERT
  WITH CHECK (auth.uid() = owner_id AND auth.uid() = created_by);

COMMENT ON COLUMN public.documents.revision IS
  'Monotonically increasing optimistic-concurrency token owned by the document owner.';
COMMENT ON TABLE public.document_versions IS
  'Immutable owner-only snapshots created after meaningful saves.';
