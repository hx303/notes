-- ============================================================
-- Phase 4: Role Management RPC Functions
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. RPC: Grant a role to a user (only callable by existing admins)
CREATE OR REPLACE FUNCTION public.grant_role(
  admin_uid UUID,
  target_email TEXT,
  target_role TEXT
)
RETURNS TEXT AS $$
DECLARE
  target_uid UUID;
BEGIN
  -- Check if caller is admin
  IF NOT public.is_admin(admin_uid) THEN
    RETURN 'Error: 你不是管理员，无权授权';
  END IF;

  -- Validate role
  IF target_role NOT IN ('editor', 'admin') THEN
    RETURN 'Error: 无效的角色，只支持 editor 或 admin';
  END IF;

  -- Find target user
  SELECT id INTO target_uid FROM auth.users WHERE email = target_email;
  IF target_uid IS NULL THEN
    RETURN 'Error: 找不到该邮箱的用户';
  END IF;

  -- Upsert role
  INSERT INTO public.user_roles (user_id, role, granted_by)
  VALUES (target_uid, target_role, admin_uid)
  ON CONFLICT (user_id)
  DO UPDATE SET role = target_role, granted_by = admin_uid, granted_at = NOW();

  RETURN 'OK: 已将 ' || target_email || ' 设为 ' || target_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 2. RPC: Revoke a role from a user
CREATE OR REPLACE FUNCTION public.revoke_role(
  admin_uid UUID,
  target_email TEXT
)
RETURNS TEXT AS $$
DECLARE
  target_uid UUID;
BEGIN
  IF NOT public.is_admin(admin_uid) THEN
    RETURN 'Error: 你不是管理员，无权撤销';
  END IF;

  SELECT id INTO target_uid FROM auth.users WHERE email = target_email;
  IF target_uid IS NULL THEN
    RETURN 'Error: 找不到该邮箱的用户';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = target_uid;

  RETURN 'OK: 已撤销 ' || target_email || ' 的权限';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 3. RPC: List all users with roles (for admin management UI)
CREATE OR REPLACE FUNCTION public.list_roles(
  admin_uid UUID
)
RETURNS TABLE(
  user_id UUID,
  email TEXT,
  role TEXT,
  display_name TEXT,
  granted_at TIMESTAMPTZ
) AS $$
BEGIN
  IF NOT public.is_admin(admin_uid) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    ur.user_id,
    au.email::TEXT,
    ur.role,
    p.display_name,
    ur.granted_at
  FROM public.user_roles ur
  JOIN auth.users au ON au.id = ur.user_id
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  ORDER BY
    CASE ur.role WHEN 'admin' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END,
    p.display_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
