-- wouldkeep document-link integrity hardening.
-- Forward-only repair after 20260718001200_publication_write_acl_hardening.sql.

-- Do not silently discard existing organization data. Cross-account or cross-library
-- rows require an explicit operator review before this migration may continue.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.document_links link
    JOIN public.documents source_document
      ON source_document.id = link.from_document_id
    JOIN public.documents target_document
      ON target_document.id = link.to_document_id
    WHERE source_document.owner_id <> link.owner_id
       OR target_document.owner_id <> link.owner_id
       OR source_document.knowledge_base_id <> target_document.knowledge_base_id
  ) THEN
    RAISE EXCEPTION
      'document_links contains cross-owner or cross-knowledge-base rows; review them before retrying this migration'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

-- RLS protects browser access, while this trigger preserves the endpoint invariant for
-- every writer, including privileged service-role and maintenance connections. FOR SHARE
-- serializes link writes with a concurrent soft delete (a non-key document UPDATE).
CREATE OR REPLACE FUNCTION public.require_valid_document_link_endpoints()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  source_owner_id UUID;
  source_knowledge_base_id UUID;
  source_deleted_at TIMESTAMPTZ;
  target_owner_id UUID;
  target_knowledge_base_id UUID;
  target_deleted_at TIMESTAMPTZ;
BEGIN
  PERFORM document.id
  FROM public.documents document
  WHERE document.id IN (NEW.from_document_id, NEW.to_document_id)
  ORDER BY document.id
  FOR SHARE;

  SELECT
    source_document.owner_id,
    source_document.knowledge_base_id,
    source_document.deleted_at,
    target_document.owner_id,
    target_document.knowledge_base_id,
    target_document.deleted_at
  INTO
    source_owner_id,
    source_knowledge_base_id,
    source_deleted_at,
    target_owner_id,
    target_knowledge_base_id,
    target_deleted_at
  FROM public.documents source_document
  JOIN public.documents target_document
    ON target_document.id = NEW.to_document_id
  WHERE source_document.id = NEW.from_document_id;

  IF NOT FOUND
    OR source_owner_id IS DISTINCT FROM NEW.owner_id
    OR target_owner_id IS DISTINCT FROM NEW.owner_id
    OR source_knowledge_base_id IS DISTINCT FROM target_knowledge_base_id
    OR source_deleted_at IS NOT NULL
    OR target_deleted_at IS NOT NULL
  THEN
    RAISE EXCEPTION
      'document link endpoints must be live documents owned by the same account and knowledge base'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.require_valid_document_link_endpoints()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS document_links_require_valid_endpoints
  ON public.document_links;
CREATE TRIGGER document_links_require_valid_endpoints
  BEFORE INSERT OR UPDATE ON public.document_links
  FOR EACH ROW
  EXECUTE FUNCTION public.require_valid_document_link_endpoints();

ALTER TABLE public.document_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can manage own document links" ON public.document_links;
DROP POLICY IF EXISTS "Owners can read own document links" ON public.document_links;
DROP POLICY IF EXISTS "Owners can create own document links" ON public.document_links;
DROP POLICY IF EXISTS "Owners can update own document links" ON public.document_links;
DROP POLICY IF EXISTS "Owners can delete own document links" ON public.document_links;

-- Owners retain SELECT and DELETE for links whose endpoint was soft-deleted. The UI can
-- therefore render a removable tombstone instead of losing the relationship silently.
CREATE POLICY "Owners can read own document links"
  ON public.document_links FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = owner_id);

CREATE POLICY "Owners can create own document links"
  ON public.document_links FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = owner_id);

CREATE POLICY "Owners can update own document links"
  ON public.document_links FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = owner_id)
  WITH CHECK ((SELECT auth.uid()) = owner_id);

CREATE POLICY "Owners can delete own document links"
  ON public.document_links FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = owner_id);

REVOKE ALL ON TABLE public.document_links FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.document_links TO authenticated;

COMMENT ON FUNCTION public.require_valid_document_link_endpoints() IS
  'Rejects link writes unless both endpoints are live documents owned by the link owner in one knowledge base.';
