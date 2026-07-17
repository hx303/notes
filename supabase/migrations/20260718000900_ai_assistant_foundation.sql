-- wouldkeep AI assistant foundation
-- Safe first phase: preferences, owner-visible audit records, suggestions, and document chunks.
-- This migration does not connect a model and does not create any paid calls.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.ai_preferences (
  owner_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  allow_private_content BOOLEAN NOT NULL DEFAULT FALSE,
  monthly_budget_cents INTEGER NOT NULL DEFAULT 0
    CHECK (monthly_budget_cents BETWEEN 0 AND 10000),
  grounding_mode TEXT NOT NULL DEFAULT 'selected_only'
    CHECK (grounding_mode IN ('selected_only', 'knowledge_base')),
  provider TEXT NOT NULL DEFAULT 'openai'
    CHECK (char_length(btrim(provider)) BETWEEN 1 AND 40),
  model TEXT NOT NULL DEFAULT 'unconfigured'
    CHECK (char_length(btrim(model)) BETWEEN 1 AND 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_preferences_private_requires_enabled
    CHECK (NOT allow_private_content OR enabled)
);

DROP TRIGGER IF EXISTS ai_preferences_set_updated_at ON public.ai_preferences;
CREATE TRIGGER ai_preferences_set_updated_at
  BEFORE UPDATE ON public.ai_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_knowledge_workspace_updated_at();

CREATE TABLE IF NOT EXISTS public.document_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  knowledge_base_id UUID NOT NULL REFERENCES public.knowledge_bases(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  document_version BIGINT NOT NULL DEFAULT 0 CHECK (document_version >= 0),
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  heading_path TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  content TEXT NOT NULL CHECK (char_length(btrim(content)) > 0),
  content_hash TEXT NOT NULL CHECK (char_length(btrim(content_hash)) BETWEEN 16 AND 128),
  embedding extensions.vector(1536),
  embedding_model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_chunks_document_version_index_unique
    UNIQUE (document_id, document_version, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_document_chunks_owner_document
  ON public.document_chunks(owner_id, document_id, document_version DESC);

DROP TRIGGER IF EXISTS document_chunks_set_updated_at ON public.document_chunks;
CREATE TRIGGER document_chunks_set_updated_at
  BEFORE UPDATE ON public.document_chunks
  FOR EACH ROW EXECUTE FUNCTION public.set_knowledge_workspace_updated_at();

CREATE TABLE IF NOT EXISTS public.ai_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  knowledge_base_id UUID REFERENCES public.knowledge_bases(id) ON DELETE SET NULL,
  document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  capability TEXT NOT NULL CHECK (char_length(btrim(capability)) BETWEEN 1 AND 60),
  provider TEXT NOT NULL CHECK (char_length(btrim(provider)) BETWEEN 1 AND 40),
  model TEXT NOT NULL CHECK (char_length(btrim(model)) BETWEEN 1 AND 120),
  prompt_version TEXT NOT NULL DEFAULT 'v1'
    CHECK (char_length(btrim(prompt_version)) BETWEEN 1 AND 40),
  input_hash TEXT NOT NULL CHECK (char_length(btrim(input_hash)) BETWEEN 16 AND 128),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'blocked', 'cancelled')),
  input_tokens INTEGER CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
  cost_cents INTEGER CHECK (cost_cents IS NULL OR cost_cents >= 0),
  latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_runs_owner_created
  ON public.ai_runs(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_runs_owner_status
  ON public.ai_runs(owner_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_suggestions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  knowledge_base_id UUID REFERENCES public.knowledge_bases(id) ON DELETE CASCADE,
  document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
  run_id UUID REFERENCES public.ai_runs(id) ON DELETE SET NULL,
  base_version BIGINT NOT NULL DEFAULT 0 CHECK (base_version >= 0),
  suggestion_type TEXT NOT NULL
    CHECK (char_length(btrim(suggestion_type)) BETWEEN 1 AND 60),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  evidence JSONB NOT NULL DEFAULT '[]'::JSONB,
  confidence NUMERIC(4, 3) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_owner_status
  ON public.ai_suggestions(owner_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_document
  ON public.ai_suggestions(owner_id, document_id, created_at DESC);

ALTER TABLE public.ai_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage own AI preferences" ON public.ai_preferences;
CREATE POLICY "Owners manage own AI preferences"
  ON public.ai_preferences FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners read own document chunks" ON public.document_chunks;
CREATE POLICY "Owners read own document chunks"
  ON public.document_chunks FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners read own AI runs" ON public.ai_runs;
CREATE POLICY "Owners read own AI runs"
  ON public.ai_runs FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners read own AI suggestions" ON public.ai_suggestions;
CREATE POLICY "Owners read own AI suggestions"
  ON public.ai_suggestions FOR SELECT
  USING (auth.uid() = owner_id);

REVOKE ALL ON public.ai_preferences FROM anon;
REVOKE ALL ON public.document_chunks FROM anon;
REVOKE ALL ON public.ai_runs FROM anon;
REVOKE ALL ON public.ai_suggestions FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_preferences TO authenticated;
GRANT SELECT ON public.document_chunks TO authenticated;
GRANT SELECT ON public.ai_runs TO authenticated;
GRANT SELECT ON public.ai_suggestions TO authenticated;

COMMENT ON TABLE public.ai_preferences IS
  'Owner-controlled AI consent, data scope, and monthly budget. Defaults to disabled and zero budget.';
COMMENT ON TABLE public.document_chunks IS
  'Owner-only retrieval chunks. Browser clients can read but cannot write; service functions manage indexing.';
COMMENT ON TABLE public.ai_runs IS
  'Owner-visible audit and cost records written only by trusted server-side functions.';
COMMENT ON TABLE public.ai_suggestions IS
  'Owner-visible AI suggestions that require an explicit later acceptance flow before changing documents.';
