-- Preserve the protected site-owner role across every browser role change.
-- This is an additive forward repair; transaction ownership remains with the migration runner.

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

  IF public.is_site_owner(target_uid) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'The site owner role cannot be changed here';
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

REVOKE ALL ON FUNCTION public.grant_role(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_role(UUID, TEXT, TEXT) TO authenticated;
