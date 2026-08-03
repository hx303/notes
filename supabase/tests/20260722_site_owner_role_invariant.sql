-- Disposable/non-production rollback-only behavior matrix for 20260722000100.
-- Run as postgres from the exact 20260721000100 baseline with:
--   -v wouldkeep_p1a_20260722000100_disposable=true
-- The reviewed migration is included twice; every fixture and grant is rolled back.

\set ON_ERROR_STOP on
\if :{?wouldkeep_p1a_20260722000100_disposable}
\else
\set wouldkeep_p1a_20260722000100_disposable false
\endif
\if :wouldkeep_p1a_20260722000100_disposable
\else
\echo 'Refusing to run: pass the exact disposable-environment confirmation variable.'
DO $p1a_disposable_guard$
BEGIN
  RAISE EXCEPTION 'Disposable environment confirmation is required';
END;
$p1a_disposable_guard$;
\endif

BEGIN;

CREATE TEMP TABLE p1a_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE p1a_results (
  test_name TEXT PRIMARY KEY,
  passed BOOLEAN NOT NULL,
  detail TEXT NOT NULL
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE ON p1a_state TO authenticated, anon;
GRANT SELECT, INSERT ON p1a_results TO authenticated, anon;

CREATE FUNCTION pg_temp.p1a_user_roles_fingerprint()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT md5(COALESCE(string_agg(
    role.user_id::TEXT || chr(31) ||
    role.role || chr(31) ||
    COALESCE(role.granted_by::TEXT, '<null>') || chr(31) ||
    COALESCE(extract(epoch FROM role.granted_at)::TEXT, '<null>'),
    chr(30) ORDER BY role.user_id
  ), ''))
  FROM public.user_roles role;
$$;

CREATE FUNCTION pg_temp.p1a_site_owner_state_fingerprint()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT md5(COALESCE(string_agg(
    site_owner.user_id::TEXT || chr(31) ||
    extract(epoch FROM site_owner.granted_at)::TEXT || chr(31) ||
    COALESCE(role.role, '<missing>') || chr(31) ||
    COALESCE(role.granted_by::TEXT, '<null>') || chr(31) ||
    COALESCE(extract(epoch FROM role.granted_at)::TEXT, '<null>'),
    chr(30) ORDER BY site_owner.user_id
  ), ''))
  FROM public.site_owners site_owner
  LEFT JOIN public.user_roles role ON role.user_id = site_owner.user_id;
$$;

CREATE FUNCTION pg_temp.p1a_grant_role_contract_fingerprint()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT md5(
    owner.rolname || chr(31) ||
    language.lanname || chr(31) ||
    procedure.prosecdef::TEXT || chr(31) ||
    procedure.prorettype::REGTYPE::TEXT || chr(31) ||
    procedure.provolatile::TEXT || chr(31) ||
    COALESCE(array_to_string(procedure.proconfig, chr(30)), '<null>') || chr(31) ||
    md5(regexp_replace(procedure.prosrc, '[[:space:]]+', ' ', 'g')) || chr(31) ||
    COALESCE((
      SELECT string_agg(
        COALESCE(grantee.rolname, 'PUBLIC') || ':' ||
        acl.privilege_type || ':' || acl.is_grantable::TEXT,
        chr(30) ORDER BY COALESCE(grantee.rolname, 'PUBLIC'), acl.privilege_type
      )
      FROM pg_catalog.aclexplode(
        COALESCE(
          procedure.proacl,
          pg_catalog.acldefault('f', procedure.proowner)
        )
      ) acl
      LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid = acl.grantee
    ), '')
  )
  FROM pg_catalog.pg_proc procedure
  JOIN pg_catalog.pg_language language ON language.oid = procedure.prolang
  JOIN pg_catalog.pg_roles owner ON owner.oid = procedure.proowner
  WHERE procedure.oid = 'public.grant_role(uuid,text,text)'::REGPROCEDURE;
$$;

REVOKE ALL ON FUNCTION pg_temp.p1a_user_roles_fingerprint() FROM PUBLIC;
REVOKE ALL ON FUNCTION pg_temp.p1a_site_owner_state_fingerprint() FROM PUBLIC;
REVOKE ALL ON FUNCTION pg_temp.p1a_grant_role_contract_fingerprint() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.p1a_user_roles_fingerprint()
  TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.p1a_site_owner_state_fingerprint()
  TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.p1a_grant_role_contract_fingerprint()
  TO authenticated, anon;

DO $$
BEGIN
  IF (
    SELECT md5(regexp_replace(
      procedure.prosrc, '[[:space:]]+', ' ', 'g'
    ))
    FROM pg_catalog.pg_proc procedure
    WHERE procedure.oid =
      'public.grant_role(uuid,text,text)'::REGPROCEDURE
  ) <> '9760c14500ea0d408bb1d6439fef7886' THEN
    RAISE EXCEPTION 'behavior matrix must start from the pre-220001 function body';
  END IF;

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
    RAISE EXCEPTION 'rollback fixture residue exists before the matrix';
  END IF;
END;
$$;

INSERT INTO p1a_results VALUES (
  'rollback_fixture_namespace_clean_before_run',
  TRUE,
  'No fixed UUID or example.test fixture residue existed before the run.'
);

INSERT INTO p1a_state VALUES
  ('roles_before_migration', pg_temp.p1a_user_roles_fingerprint()),
  ('owners_before_migration', pg_temp.p1a_site_owner_state_fingerprint());

\ir ../migrations/20260722000100_site_owner_role_invariant.sql

INSERT INTO p1a_state VALUES
  ('function_after_first_apply', pg_temp.p1a_grant_role_contract_fingerprint());

DO $$
BEGIN
  IF (
    SELECT md5(regexp_replace(
      procedure.prosrc, '[[:space:]]+', ' ', 'g'
    ))
    FROM pg_catalog.pg_proc procedure
    WHERE procedure.oid =
      'public.grant_role(uuid,text,text)'::REGPROCEDURE
  ) <> '5b2324f851dafa4bcdb99af3b511e933' THEN
    RAISE EXCEPTION 'first migration application did not install the reviewed function';
  END IF;

  IF pg_temp.p1a_user_roles_fingerprint() IS DISTINCT FROM (
    SELECT value FROM p1a_state WHERE key = 'roles_before_migration'
  ) OR pg_temp.p1a_site_owner_state_fingerprint() IS DISTINCT FROM (
    SELECT value FROM p1a_state WHERE key = 'owners_before_migration'
  ) THEN
    RAISE EXCEPTION 'first migration application changed site-owner role data';
  END IF;
END;
$$;

\ir ../migrations/20260722000100_site_owner_role_invariant.sql

DO $$
BEGIN
  IF pg_temp.p1a_grant_role_contract_fingerprint() IS DISTINCT FROM (
    SELECT value FROM p1a_state WHERE key = 'function_after_first_apply'
  ) THEN
    RAISE EXCEPTION 'second migration application changed function or ACL state';
  END IF;

  IF pg_temp.p1a_user_roles_fingerprint() IS DISTINCT FROM (
    SELECT value FROM p1a_state WHERE key = 'roles_before_migration'
  ) OR pg_temp.p1a_site_owner_state_fingerprint() IS DISTINCT FROM (
    SELECT value FROM p1a_state WHERE key = 'owners_before_migration'
  ) THEN
    RAISE EXCEPTION 'second migration application changed site-owner role data';
  END IF;

  INSERT INTO p1a_results VALUES (
    'double_apply_idempotent',
    TRUE,
    'Two exact migration applications preserve function, ACL, and role fingerprints.'
  );
END;
$$;

INSERT INTO p1a_state VALUES
  ('protected_owner_id', 'b154d7e9-07c9-4412-8673-86239bbbe367'),
  ('other_site_owner_id', 'a7220000-0000-4000-8000-000000000101'),
  ('ordinary_member_id', 'a7220000-0000-4000-8000-000000000102');

INSERT INTO p1a_state (key, value)
SELECT 'protected_owner_email', account.email
FROM auth.users account
WHERE account.id = 'b154d7e9-07c9-4412-8673-86239bbbe367'::UUID;

DO $$
BEGIN
  IF (SELECT count(*) FROM p1a_state WHERE key = 'protected_owner_email') <> 1
    OR NOT EXISTS (
      SELECT 1
      FROM public.site_owners site_owner
      JOIN public.user_roles role ON role.user_id = site_owner.user_id
      WHERE site_owner.user_id =
        'b154d7e9-07c9-4412-8673-86239bbbe367'::UUID
        AND role.role = 'admin'
        AND role.granted_by = site_owner.user_id
    )
  THEN
    RAISE EXCEPTION 'verified protected owner fixture is missing or drifted';
  END IF;
END;
$$;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  (
    '00000000-0000-0000-0000-000000000000'::UUID,
    'a7220000-0000-4000-8000-000000000101'::UUID,
    'authenticated',
    'authenticated',
    'p1a-role-gate-protected@example.test',
    '',
    clock_timestamp(),
    '{"provider":"email","providers":["email"]}'::JSONB,
    '{"display_name":"P1A protected target"}'::JSONB,
    clock_timestamp(),
    clock_timestamp()
  ),
  (
    '00000000-0000-0000-0000-000000000000'::UUID,
    'a7220000-0000-4000-8000-000000000102'::UUID,
    'authenticated',
    'authenticated',
    'p1a-role-gate-member@example.test',
    '',
    clock_timestamp(),
    '{"provider":"email","providers":["email"]}'::JSONB,
    '{"display_name":"P1A ordinary member"}'::JSONB,
    clock_timestamp(),
    clock_timestamp()
  );

INSERT INTO public.site_owners (user_id)
VALUES ('a7220000-0000-4000-8000-000000000101'::UUID);

INSERT INTO public.user_roles (user_id, role, granted_by, granted_at)
VALUES (
  'a7220000-0000-4000-8000-000000000101'::UUID,
  'admin',
  'a7220000-0000-4000-8000-000000000101'::UUID,
  clock_timestamp()
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT value FROM p1a_state WHERE key = 'protected_owner_id'),
  TRUE
);

DO $$
DECLARE
  before_fingerprint TEXT := pg_temp.p1a_user_roles_fingerprint();
  returned_state TEXT;
  returned_message TEXT;
BEGIN
  BEGIN
    PERFORM public.grant_role(
      (SELECT value::UUID FROM p1a_state WHERE key = 'protected_owner_id'),
      (SELECT value FROM p1a_state WHERE key = 'protected_owner_email'),
      'editor'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS
      returned_state = RETURNED_SQLSTATE,
      returned_message = MESSAGE_TEXT;
  END;

  INSERT INTO p1a_results VALUES (
    'site_owner_self_change_denied_42501_zero_write',
    returned_state = '42501'
      AND returned_message = 'The site owner role cannot be changed here'
      AND before_fingerprint = pg_temp.p1a_user_roles_fingerprint(),
    'The protected owner cannot demote itself and the complete role digest is unchanged.'
  );
END;
$$;

DO $$
DECLARE
  before_fingerprint TEXT := pg_temp.p1a_user_roles_fingerprint();
  returned_state TEXT;
  returned_message TEXT;
BEGIN
  BEGIN
    PERFORM public.grant_role(
      (SELECT value::UUID FROM p1a_state WHERE key = 'protected_owner_id'),
      'p1a-role-gate-protected@example.test',
      'editor'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS
      returned_state = RETURNED_SQLSTATE,
      returned_message = MESSAGE_TEXT;
  END;

  INSERT INTO p1a_results VALUES (
    'other_site_owner_change_denied_42501_zero_write',
    returned_state = '42501'
      AND returned_message = 'The site owner role cannot be changed here'
      AND before_fingerprint = pg_temp.p1a_user_roles_fingerprint(),
    'Any site-owner target is protected and the complete role digest is unchanged.'
  );
END;
$$;

DO $$
DECLARE
  before_fingerprint TEXT := pg_temp.p1a_user_roles_fingerprint();
  returned_state TEXT;
  returned_message TEXT;
BEGIN
  BEGIN
    PERFORM public.grant_role(
      (SELECT value::UUID FROM p1a_state WHERE key = 'ordinary_member_id'),
      'p1a-role-gate-member@example.test',
      'editor'
    );
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS
      returned_state = RETURNED_SQLSTATE,
      returned_message = MESSAGE_TEXT;
  END;

  INSERT INTO p1a_results VALUES (
    'caller_identity_mismatch_denied_zero_write',
    returned_state = 'P0001'
      AND returned_message = 'Site owner permission required'
      AND before_fingerprint = pg_temp.p1a_user_roles_fingerprint(),
    'A caller-supplied admin UUID cannot differ from the authenticated owner.'
  );
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT value FROM p1a_state WHERE key = 'ordinary_member_id'),
  TRUE
);

DO $$
DECLARE
  before_fingerprint TEXT := pg_temp.p1a_user_roles_fingerprint();
  returned_state TEXT;
  returned_message TEXT;
BEGIN
  BEGIN
    PERFORM public.grant_role(
      (SELECT value::UUID FROM p1a_state WHERE key = 'ordinary_member_id'),
      'p1a-role-gate-member@example.test',
      'admin'
    );
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS
      returned_state = RETURNED_SQLSTATE,
      returned_message = MESSAGE_TEXT;
  END;

  INSERT INTO p1a_results VALUES (
    'non_owner_caller_denied_zero_write',
    returned_state = 'P0001'
      AND returned_message = 'Site owner permission required'
      AND before_fingerprint = pg_temp.p1a_user_roles_fingerprint(),
    'An authenticated non-owner cannot grant roles and writes nothing.'
  );
END;
$$;
RESET ROLE;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role', 'anon', TRUE);
SELECT set_config('request.jwt.claim.sub', '', TRUE);

DO $$
DECLARE
  before_fingerprint TEXT := pg_temp.p1a_user_roles_fingerprint();
  returned_state TEXT;
BEGIN
  BEGIN
    PERFORM public.grant_role(
      (SELECT value::UUID FROM p1a_state WHERE key = 'ordinary_member_id'),
      'p1a-role-gate-member@example.test',
      'admin'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS returned_state = RETURNED_SQLSTATE;
  END;

  INSERT INTO p1a_results VALUES (
    'anonymous_execute_denied_42501_zero_write',
    returned_state = '42501'
      AND before_fingerprint = pg_temp.p1a_user_roles_fingerprint(),
    'Anonymous execution is denied by the function ACL before any write.'
  );
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT value FROM p1a_state WHERE key = 'protected_owner_id'),
  TRUE
);

INSERT INTO p1a_state (key, value)
SELECT
  'ordinary_member_response',
  public.grant_role(
    (SELECT value::UUID FROM p1a_state WHERE key = 'protected_owner_id'),
    'p1a-role-gate-member@example.test',
    'editor'
  );
RESET ROLE;

DO $$
BEGIN
  INSERT INTO p1a_results VALUES (
    'ordinary_member_role_change_preserved',
    (SELECT value FROM p1a_state WHERE key = 'ordinary_member_response') = 'OK'
      AND EXISTS (
        SELECT 1
        FROM public.user_roles role
        WHERE role.user_id =
          (SELECT value::UUID FROM p1a_state WHERE key = 'ordinary_member_id')
          AND role.role = 'editor'
          AND role.granted_by =
            (SELECT value::UUID FROM p1a_state WHERE key = 'protected_owner_id')
          AND role.granted_at IS NOT NULL
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.site_owners site_owner
        LEFT JOIN public.user_roles role ON role.user_id = site_owner.user_id
        WHERE role.user_id IS NULL
           OR role.role <> 'admin'
           OR role.granted_by <> site_owner.user_id
      ),
    'The protected owner can still grant editor to a non-owner inside the rollback.'
  );
END;
$$;

SELECT test_name, passed, detail
FROM p1a_results
ORDER BY test_name;

DO $$
DECLARE
  expected_names TEXT[] := ARRAY[
    'anonymous_execute_denied_42501_zero_write',
    'caller_identity_mismatch_denied_zero_write',
    'double_apply_idempotent',
    'non_owner_caller_denied_zero_write',
    'ordinary_member_role_change_preserved',
    'other_site_owner_change_denied_42501_zero_write',
    'rollback_fixture_namespace_clean_before_run',
    'site_owner_self_change_denied_42501_zero_write'
  ]::TEXT[];
BEGIN
  IF (SELECT array_agg(test_name ORDER BY test_name) FROM p1a_results)
    IS DISTINCT FROM (
      SELECT array_agg(name ORDER BY name) FROM unnest(expected_names) name
    ) THEN
    RAISE EXCEPTION 'site-owner role assertion set is incomplete or unexpected';
  END IF;

  IF EXISTS (SELECT 1 FROM p1a_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'one or more site-owner role assertions failed';
  END IF;
END;
$$;

ROLLBACK;
