-- ============================================================
-- wouldkeep.com Comments System - Database Schema
-- Run this in Supabase SQL Editor after creating your project
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. User Profiles (extends auth.users)
-- ============================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: everyone can read profiles, users can update their own
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles are readable by everyone" ON public.profiles
  FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 2. User Roles (admin / user)
-- ============================================================
CREATE TABLE public.user_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: everyone can read roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Roles are readable by everyone" ON public.user_roles
  FOR SELECT USING (true);

-- ============================================================
-- 3. Comments
-- ============================================================
CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_path TEXT NOT NULL,
  section_title TEXT NOT NULL,
  content TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_comments_file ON public.comments(file_path, section_title);
CREATE INDEX idx_comments_user ON public.comments(user_id);

-- RLS policies
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- Everyone can read non-deleted comments
CREATE POLICY "Comments are readable by everyone" ON public.comments
  FOR SELECT USING (is_deleted = FALSE);

-- Authenticated users can insert their own comments
CREATE POLICY "Users can insert own comments" ON public.comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own comments
CREATE POLICY "Users can update own comments" ON public.comments
  FOR UPDATE USING (auth.uid() = user_id);

-- Admins can soft-delete any comment
CREATE POLICY "Admins can delete any comment" ON public.comments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================
-- 4. Helper: Check if user is admin
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin(uid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = uid AND role = 'admin'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- 5. Lookup function: find user by email (for admin management)
-- ============================================================
CREATE OR REPLACE FUNCTION public.find_user_by_email(email_input TEXT)
RETURNS TABLE(user_id UUID, email TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.email::TEXT
  FROM auth.users u
  WHERE u.email = email_input;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- ============================================================
-- 6. View: admin list with display names
-- ============================================================
CREATE OR REPLACE VIEW public.admin_list AS
SELECT ur.user_id, p.display_name, ur.granted_at
FROM public.user_roles ur
LEFT JOIN public.profiles p ON p.id = ur.user_id
WHERE ur.role = 'admin';

-- ============================================================
-- 7. Grant first admin (run this manually after first user signs up)
-- Look up your user ID in auth.users table first!
-- ============================================================
-- INSERT INTO public.user_roles (user_id, role) VALUES ('YOUR_USER_UUID_HERE', 'admin');

-- ============================================================
-- Phase 1: Editor role + Edit logs + Permission RPCs
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
