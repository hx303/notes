-- Run immediately after the rollback-only 20260722000100 behavior matrix.
-- This production-safe, read-only probe must return zero for every fixture class.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM auth.users
    WHERE id IN (
      'a7220000-0000-4000-8000-000000000101'::UUID,
      'a7220000-0000-4000-8000-000000000102'::UUID
    ) OR email LIKE 'p1a-role-gate-%@example.test'
  ) OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id IN (
      'a7220000-0000-4000-8000-000000000101'::UUID,
      'a7220000-0000-4000-8000-000000000102'::UUID
    )
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id IN (
      'a7220000-0000-4000-8000-000000000101'::UUID,
      'a7220000-0000-4000-8000-000000000102'::UUID
    )
  ) OR EXISTS (
    SELECT 1 FROM public.site_owners
    WHERE user_id = 'a7220000-0000-4000-8000-000000000101'::UUID
  ) THEN
    RAISE EXCEPTION 'rollback-only site-owner role matrix left fixture residue';
  END IF;
END;
$$;

SELECT
  (SELECT count(*) FROM auth.users
   WHERE id IN (
     'a7220000-0000-4000-8000-000000000101'::UUID,
     'a7220000-0000-4000-8000-000000000102'::UUID
   ) OR email LIKE 'p1a-role-gate-%@example.test') AS users,
  (SELECT count(*) FROM public.profiles
   WHERE id IN (
     'a7220000-0000-4000-8000-000000000101'::UUID,
     'a7220000-0000-4000-8000-000000000102'::UUID
   )) AS profiles,
  (SELECT count(*) FROM public.user_roles
   WHERE user_id IN (
     'a7220000-0000-4000-8000-000000000101'::UUID,
     'a7220000-0000-4000-8000-000000000102'::UUID
   )) AS roles,
  (SELECT count(*) FROM public.site_owners
   WHERE user_id =
     'a7220000-0000-4000-8000-000000000101'::UUID) AS site_owners,
  'site_owner_role_invariant_rollback_residue_zero' AS result;
