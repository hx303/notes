-- Production-safe, read-only owner-state fingerprint for 20260722000100.
-- Run immediately after the preflight or contract assertion statement.

SELECT
  md5(COALESCE(string_agg(
    site_owner.user_id::TEXT || chr(31) ||
    extract(epoch FROM site_owner.granted_at)::TEXT || chr(31) ||
    role.role || chr(31) ||
    role.granted_by::TEXT || chr(31) ||
    extract(epoch FROM role.granted_at)::TEXT,
    chr(30) ORDER BY site_owner.user_id
  ), '')) AS protected_owner_state_fingerprint,
  'site_owner_role_invariant_state_fingerprint_passed' AS result
FROM public.site_owners site_owner
JOIN public.user_roles role ON role.user_id = site_owner.user_id;
