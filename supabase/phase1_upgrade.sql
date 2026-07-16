-- ============================================================
-- Phase 1: Editor role + Edit logs + Permission RPCs
-- Run this in Supabase SQL Editor to upgrade the database
-- ============================================================

-- 1. Modify user_roles CHECK constraint to include 'editor'
ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_role_check
    CHECK (role IN ('user', 'editor', 'admin'));

-- 2. Edit logs table (tracks content edits via GitHub/Worker)
CREATE TABLE IF NOT EXISTS public.edit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT,
  user_name TEXT,
  file_path TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'rename')),
  commit_sha TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: anyone can read, but only service_role can insert
ALTER TABLE public.edit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read edit logs" ON public.edit_logs
  FOR SELECT USING (true);
-- Note: inserts are only done via service_role (Worker), no insert policy needed

-- 3. is_editor helper function
CREATE OR REPLACE FUNCTION public.is_editor(uid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = uid AND role IN ('editor', 'admin')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 4. check_write_permission RPC (called by Worker with service_role key)
CREATE OR REPLACE FUNCTION public.check_write_permission(user_id UUID)
RETURNS TABLE(has_permission BOOLEAN, role TEXT, display_name TEXT, email TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id = $1 AND ur.role IN ('editor', 'admin'))) as has_permission,
    COALESCE((SELECT ur2.role FROM public.user_roles ur2 WHERE ur2.user_id = $1), 'user') as role,
    COALESCE(
      (SELECT p.display_name FROM public.profiles p WHERE p.id = $1),
      split_part((SELECT u.email FROM auth.users u WHERE u.id = $1), '@', 1)
    ) as display_name,
    (SELECT u2.email FROM auth.users u2 WHERE u2.id = $1) as email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 5. get_edit_logs convenience function
CREATE OR REPLACE FUNCTION public.get_edit_logs(limit_count INT DEFAULT 50)
RETURNS TABLE(
  id BIGINT, user_id UUID, user_email TEXT, user_name TEXT,
  file_path TEXT, action TEXT, commit_sha TEXT, created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT el.id, el.user_id, el.user_email, el.user_name,
         el.file_path, el.action, el.commit_sha, el.created_at
  FROM public.edit_logs el
  ORDER BY el.created_at DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';
