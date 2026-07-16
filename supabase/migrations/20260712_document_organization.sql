-- wouldkeep A4: account-scoped tags and directed knowledge links.

CREATE TABLE IF NOT EXISTS public.tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  knowledge_base_id UUID NOT NULL REFERENCES public.knowledge_bases(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  normalized_name TEXT NOT NULL CHECK (char_length(normalized_name) BETWEEN 1 AND 80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tags_knowledge_base_normalized_unique UNIQUE (knowledge_base_id, normalized_name)
);

CREATE TABLE IF NOT EXISTS public.document_tags (
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (document_id, tag_id)
);

CREATE TABLE IF NOT EXISTS public.document_links (
  from_document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  to_document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL CHECK (relation_type IN ('prerequisite', 'related', 'continues')),
  note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 240),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (from_document_id, to_document_id, relation_type),
  CONSTRAINT document_links_no_self_link CHECK (from_document_id <> to_document_id)
);

CREATE INDEX IF NOT EXISTS idx_tags_owner_name ON public.tags(owner_id, normalized_name);
CREATE INDEX IF NOT EXISTS idx_document_tags_owner ON public.document_tags(owner_id, document_id);
CREATE INDEX IF NOT EXISTS idx_document_links_owner_from ON public.document_links(owner_id, from_document_id);
CREATE INDEX IF NOT EXISTS idx_document_links_owner_to ON public.document_links(owner_id, to_document_id);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can manage own tags" ON public.tags;
CREATE POLICY "Owners can manage own tags" ON public.tags
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can manage own document tags" ON public.document_tags;
CREATE POLICY "Owners can manage own document tags" ON public.document_tags
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can manage own document links" ON public.document_links;
CREATE POLICY "Owners can manage own document links" ON public.document_links
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

