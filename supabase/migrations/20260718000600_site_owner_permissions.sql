-- wouldkeep A7: one protected site owner, least-privilege administration,
-- and auditable moderation of public publications.
-- Apply after 20260714_publication_flow.sql.

CREATE TABLE IF NOT EXISTS public.site_owners (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.site_owners ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.site_owners FROM anon, authenticated;

DO $site_owner_setup$
DECLARE
  target_user UUID;
  matching_users INTEGER;
BEGIN
  SELECT count(*)
  INTO matching_users
  FROM auth.users
  WHERE lower(email) = lower('2149665127@qq.com');

  SELECT id
  INTO target_user
  FROM auth.users
  WHERE lower(email) = lower('2149665127@qq.com')
  LIMIT 1;

  IF matching_users <> 1 OR target_user IS NULL THEN
    RAISE EXCEPTION 'Expected exactly one account for 2149665127@qq.com, found %', matching_users;
  END IF;

  IF target_user <> 'b154d7e9-07c9-4412-8673-86239bbbe367'::UUID THEN
    RAISE EXCEPTION 'Account UUID does not match the verified wouldkeep owner';
  END IF;

  INSERT INTO public.site_owners (user_id)
  VALUES (target_user)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role, granted_by, granted_at)
  VALUES (target_user, 'admin', target_user, NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    role = 'admin',
    granted_by = target_user,
    granted_at = NOW();
END;
$site_owner_setup$;

CREATE OR REPLACE FUNCTION public.is_site_owner(uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT uid IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.site_owners owner WHERE owner.user_id = uid
  );
$$;

REVOKE ALL ON FUNCTION public.is_site_owner(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_site_owner(UUID) TO authenticated, service_role;

DROP POLICY IF EXISTS "Roles are readable by everyone" ON public.user_roles;
DROP POLICY IF EXISTS "Users can read own role" ON public.user_roles;
CREATE POLICY "Users can read own role"
  ON public.user_roles FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.is_site_owner((SELECT auth.uid()))
  );

CREATE OR REPLACE VIEW public.admin_list
WITH (security_invoker = true)
AS
SELECT ur.user_id, p.display_name, ur.granted_at
FROM public.user_roles ur
LEFT JOIN public.profiles p ON p.id = ur.user_id
WHERE ur.role = 'admin';

REVOKE ALL ON public.admin_list FROM anon;
GRANT SELECT ON public.admin_list TO authenticated;

CREATE OR REPLACE FUNCTION public.current_account_capabilities()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN NULL
    ELSE jsonb_build_object(
      'role', COALESCE((
        SELECT role.role FROM public.user_roles role WHERE role.user_id = auth.uid()
      ), 'user'),
      'is_site_owner', public.is_site_owner(auth.uid()),
      'can_edit_site', EXISTS (
        SELECT 1 FROM public.user_roles role
        WHERE role.user_id = auth.uid() AND role.role IN ('editor', 'admin')
      ),
      'can_manage_roles', public.is_site_owner(auth.uid()),
      'can_moderate_comments', EXISTS (
        SELECT 1 FROM public.user_roles role
        WHERE role.user_id = auth.uid() AND role.role = 'admin'
      ),
      'can_moderate_publications', public.is_site_owner(auth.uid()),
      'can_read_other_private_documents', false
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.current_account_capabilities() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_account_capabilities() TO authenticated;

-- Keep the legacy function signatures used by the current admin screen, but
-- never trust the caller-supplied UUID. The signed-in JWT is authoritative.
CREATE OR REPLACE FUNCTION public.find_user_by_email(email_input TEXT)
RETURNS TABLE(user_id UUID, email TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_site_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Site owner permission required';
  END IF;

  RETURN QUERY
  SELECT account.id, account.email::TEXT
  FROM auth.users account
  WHERE lower(account.email) = lower(btrim(email_input));
END;
$$;

REVOKE ALL ON FUNCTION public.find_user_by_email(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_user_by_email(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.grant_role(
  admin_uid UUID,
  target_email TEXT,
  target_role TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  caller UUID := auth.uid();
  target_uid UUID;
BEGIN
  IF caller IS NULL OR admin_uid IS DISTINCT FROM caller OR NOT public.is_site_owner(caller) THEN
    RAISE EXCEPTION 'Site owner permission required';
  END IF;

  IF target_role NOT IN ('editor', 'admin') THEN
    RAISE EXCEPTION 'Role must be editor or admin';
  END IF;

  SELECT account.id INTO target_uid
  FROM auth.users account
  WHERE lower(account.email) = lower(btrim(target_email));

  IF target_uid IS NULL THEN
    RAISE EXCEPTION 'Account not found';
  END IF;

  INSERT INTO public.user_roles (user_id, role, granted_by, granted_at)
  VALUES (target_uid, target_role, caller, NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    role = EXCLUDED.role,
    granted_by = caller,
    granted_at = NOW();

  RETURN 'OK';
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_role(
  admin_uid UUID,
  target_email TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  caller UUID := auth.uid();
  target_uid UUID;
BEGIN
  IF caller IS NULL OR admin_uid IS DISTINCT FROM caller OR NOT public.is_site_owner(caller) THEN
    RAISE EXCEPTION 'Site owner permission required';
  END IF;

  SELECT account.id INTO target_uid
  FROM auth.users account
  WHERE lower(account.email) = lower(btrim(target_email));

  IF target_uid IS NULL THEN
    RAISE EXCEPTION 'Account not found';
  END IF;

  IF public.is_site_owner(target_uid) THEN
    RAISE EXCEPTION 'The site owner role cannot be revoked here';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = target_uid;
  RETURN 'OK';
END;
$$;

CREATE OR REPLACE FUNCTION public.list_roles(admin_uid UUID)
RETURNS TABLE(
  user_id UUID,
  email TEXT,
  role TEXT,
  display_name TEXT,
  granted_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL
    OR admin_uid IS DISTINCT FROM auth.uid()
    OR NOT public.is_site_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Site owner permission required';
  END IF;

  RETURN QUERY
  SELECT
    account.id,
    account.email::TEXT,
    COALESCE(account_role.role, 'user'),
    profile.display_name,
    account_role.granted_at
  FROM auth.users account
  LEFT JOIN public.user_roles account_role ON account_role.user_id = account.id
  LEFT JOIN public.profiles profile ON profile.id = account.id
  ORDER BY
    CASE COALESCE(account_role.role, 'user')
      WHEN 'admin' THEN 0 WHEN 'editor' THEN 1 ELSE 2
    END,
    profile.display_name NULLS LAST,
    account.email;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_role(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_role(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_roles(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_role(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_role(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_roles(UUID) TO authenticated;

-- These legacy helpers contain private email or edit-history data. They are
-- service/owner tools, not anonymous public APIs.
REVOKE ALL ON FUNCTION public.check_write_permission(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_write_permission(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.get_edit_logs(limit_count INT DEFAULT 50)
RETURNS TABLE(
  id BIGINT,
  user_id UUID,
  user_email TEXT,
  user_name TEXT,
  file_path TEXT,
  action TEXT,
  commit_sha TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_site_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Site owner permission required';
  END IF;

  RETURN QUERY
  SELECT log.id, log.user_id, log.user_email, log.user_name,
         log.file_path, log.action, log.commit_sha, log.created_at
  FROM public.edit_logs log
  ORDER BY log.created_at DESC
  LIMIT LEAST(GREATEST(limit_count, 1), 200);
END;
$$;

REVOKE ALL ON FUNCTION public.get_edit_logs(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_edit_logs(INT) TO authenticated;

CREATE TABLE IF NOT EXISTS public.moderation_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  target_owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('unpublish_public_document')),
  reason TEXT NOT NULL DEFAULT '' CHECK (char_length(reason) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_moderation_actions_recent
  ON public.moderation_actions(created_at DESC);

ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Site owners can read moderation actions" ON public.moderation_actions;
CREATE POLICY "Site owners can read moderation actions"
  ON public.moderation_actions FOR SELECT TO authenticated
  USING (public.is_site_owner((SELECT auth.uid())));

REVOKE INSERT, UPDATE, DELETE ON TABLE public.moderation_actions FROM anon, authenticated;
GRANT SELECT ON TABLE public.moderation_actions TO authenticated;

CREATE OR REPLACE FUNCTION public.moderate_publication(
  p_document_id UUID,
  p_reason TEXT DEFAULT ''
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_owner UUID;
BEGIN
  IF NOT public.is_site_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Site owner permission required';
  END IF;

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

REVOKE ALL ON FUNCTION public.moderate_publication(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.moderate_publication(UUID, TEXT) TO authenticated;

COMMENT ON TABLE public.site_owners IS
  'Protected wouldkeep station-owner identity; private document RLS is intentionally unchanged.';
COMMENT ON FUNCTION public.current_account_capabilities() IS
  'Returns only the signed-in account permission flags used by account and station-owner UI.';
COMMENT ON FUNCTION public.moderate_publication(UUID, TEXT) IS
  'Allows the site owner to remove a public snapshot without reading another owner private draft.';
