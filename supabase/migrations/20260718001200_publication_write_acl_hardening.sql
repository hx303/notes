-- wouldkeep publication write RPC ACL hardening.
-- Forward-only repair for direct anonymous EXECUTE grants observed in production.

REVOKE EXECUTE ON FUNCTION public.publish_document(UUID, TEXT)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.unpublish_document(UUID)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.moderate_publication(UUID, TEXT)
  FROM PUBLIC, anon;

-- Preserve the intended signed-in and trusted-service callers explicitly.
GRANT EXECUTE ON FUNCTION public.publish_document(UUID, TEXT)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unpublish_document(UUID)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.moderate_publication(UUID, TEXT)
  TO authenticated, service_role;
