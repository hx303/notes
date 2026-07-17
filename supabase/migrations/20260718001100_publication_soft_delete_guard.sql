-- wouldkeep publication safety: a soft-deleted source must never retain a readable snapshot.
-- Forward-only repair after 20260718001000_ai_runtime_safety.sql.

CREATE OR REPLACE FUNCTION public.revoke_publication_on_document_soft_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF OLD.deleted_at IS NOT DISTINCT FROM NEW.deleted_at THEN
    RETURN NEW;
  END IF;

  DELETE FROM public.document_publications publication
  WHERE publication.document_id = OLD.id;

  IF NEW.deleted_at IS NOT NULL THEN
    NEW.status := 'archived';
  ELSIF NEW.status = 'published' THEN
    NEW.status := 'draft';
  END IF;
  NEW.visibility := 'private';
  NEW.published_at := NULL;
  NEW.published_revision := NULL;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_publication_on_document_soft_delete()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS documents_revoke_publication_on_soft_delete ON public.documents;
CREATE TRIGGER documents_revoke_publication_on_soft_delete
  BEFORE UPDATE OF deleted_at ON public.documents
  FOR EACH ROW
  WHEN (OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
  EXECUTE FUNCTION public.revoke_publication_on_document_soft_delete();

-- Remove snapshots that predate the trigger and normalize only their affected sources.
WITH revoked_publications AS (
  DELETE FROM public.document_publications publication
  USING public.documents document
  WHERE document.id = publication.document_id
    AND document.deleted_at IS NOT NULL
  RETURNING publication.document_id
)
UPDATE public.documents document
SET status = 'archived',
    visibility = 'private',
    published_at = NULL,
    published_revision = NULL
WHERE document.id IN (SELECT document_id FROM revoked_publications)
  AND document.deleted_at IS NOT NULL;

-- Coordinate direct publication table writes with document soft deletion. INSERT locks
-- the source first; UPDATE avoids taking a reverse document lock and cannot move identity.
CREATE OR REPLACE FUNCTION public.require_live_source_for_document_publication()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.document_id IS DISTINCT FROM OLD.document_id
    OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
  ) THEN
    RAISE EXCEPTION 'A publication cannot move to another source or owner'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- INSERT has not locked a publication row yet, so lock the source first.
    PERFORM 1
    FROM public.documents document
    WHERE document.id = NEW.document_id
      AND document.owner_id = NEW.owner_id
      AND document.deleted_at IS NULL
    FOR UPDATE;
  ELSE
    -- UPDATE already owns the publication row. A non-locking liveness check avoids
    -- publication -> document lock inversion; a concurrent soft delete will wait,
    -- then remove this row before it commits.
    PERFORM 1
    FROM public.documents document
    WHERE document.id = NEW.document_id
      AND document.owner_id = NEW.owner_id
      AND document.deleted_at IS NULL;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A publication requires a live source document owned by the same account'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.require_live_source_for_document_publication()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS document_publications_require_live_source
  ON public.document_publications;
CREATE TRIGGER document_publications_require_live_source
  BEFORE INSERT OR UPDATE ON public.document_publications
  FOR EACH ROW
  EXECUTE FUNCTION public.require_live_source_for_document_publication();

-- Preserve the public RPC contracts while making these mixed RPC operations lock
-- the document row before the publication row.
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

  PERFORM 1
  FROM public.documents document
  WHERE document.id = p_document_id
    AND document.owner_id = (SELECT auth.uid())
  FOR UPDATE;

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

CREATE OR REPLACE FUNCTION public.moderate_publication(
  p_document_id UUID,
  p_reason TEXT DEFAULT ''
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  target_owner UUID;
BEGIN
  IF NOT public.is_site_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Site owner permission required';
  END IF;

  PERFORM 1
  FROM public.documents document
  WHERE document.id = p_document_id
  FOR UPDATE;

  SELECT publication.owner_id INTO target_owner
  FROM public.document_publications publication
  WHERE publication.document_id = p_document_id
    AND publication.audience = 'public'
  FOR UPDATE;

  IF target_owner IS NULL THEN
    RETURN FALSE;
  END IF;

  DELETE FROM public.document_publications
  WHERE document_id = p_document_id AND audience = 'public';

  UPDATE public.documents
  SET status = 'ready',
      visibility = 'private',
      published_at = NULL,
      published_revision = NULL
  WHERE id = p_document_id;

  INSERT INTO public.moderation_actions (
    actor_id, document_id, target_owner_id, action, reason
  ) VALUES (
    auth.uid(), p_document_id, target_owner,
    'unpublish_public_document', left(btrim(COALESCE(p_reason, '')), 500)
  );

  RETURN TRUE;
END;
$$;

-- Owners may manage publication rows only while the matching source is live.
DROP POLICY IF EXISTS "Owners can read own publications" ON public.document_publications;
CREATE POLICY "Owners can read own publications"
  ON public.document_publications FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) = owner_id
    AND EXISTS (
      SELECT 1
      FROM public.documents document
      WHERE document.id = document_publications.document_id
        AND document.owner_id = (SELECT auth.uid())
        AND document.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Owners can create own publications" ON public.document_publications;
CREATE POLICY "Owners can create own publications"
  ON public.document_publications FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = owner_id
    AND EXISTS (
      SELECT 1
      FROM public.documents document
      WHERE document.id = document_publications.document_id
        AND document.owner_id = (SELECT auth.uid())
        AND document.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Owners can update own publications" ON public.document_publications;
CREATE POLICY "Owners can update own publications"
  ON public.document_publications FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid()) = owner_id
    AND EXISTS (
      SELECT 1
      FROM public.documents document
      WHERE document.id = document_publications.document_id
        AND document.owner_id = (SELECT auth.uid())
        AND document.deleted_at IS NULL
    )
  )
  WITH CHECK (
    (SELECT auth.uid()) = owner_id
    AND EXISTS (
      SELECT 1
      FROM public.documents document
      WHERE document.id = document_publications.document_id
        AND document.owner_id = (SELECT auth.uid())
        AND document.deleted_at IS NULL
    )
  );

-- SECURITY DEFINER readers enforce source liveness directly instead of relying on RLS.
CREATE OR REPLACE FUNCTION public.read_published_document(
  p_document_id UUID DEFAULT NULL,
  p_share_token UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT jsonb_build_object(
    'document_id', publication.document_id,
    'audience', publication.audience,
    'published_at', publication.published_at,
    'content', publication.snapshot
  )
  FROM public.document_publications publication
  JOIN public.documents source_document
    ON source_document.id = publication.document_id
   AND source_document.owner_id = publication.owner_id
   AND source_document.deleted_at IS NULL
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
SET search_path = pg_catalog, pg_temp
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
    JOIN public.documents source_document
      ON source_document.id = publication.document_id
     AND source_document.owner_id = publication.owner_id
     AND source_document.deleted_at IS NULL
    WHERE publication.audience = 'public'
    ORDER BY publication.published_at DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 50)
    OFFSET GREATEST(p_offset, 0)
  ) item;
$$;

REVOKE ALL ON FUNCTION public.read_published_document(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_public_documents(INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unpublish_document(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.moderate_publication(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.document_publications FROM anon;
GRANT EXECUTE ON FUNCTION public.read_published_document(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_documents(INTEGER, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unpublish_document(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.moderate_publication(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.revoke_publication_on_document_soft_delete() IS
  'Atomically revokes publication snapshots and resets public metadata when a document is soft-deleted.';
COMMENT ON FUNCTION public.require_live_source_for_document_publication() IS
  'Serializes publication writes with the live source document and rejects deleted or cross-owner sources.';
COMMENT ON FUNCTION public.read_published_document(UUID, UUID) IS
  'Returns a whitelisted live-source public snapshot or an unlisted snapshot by exact revocable token.';
