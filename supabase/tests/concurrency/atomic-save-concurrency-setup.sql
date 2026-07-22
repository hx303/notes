DROP SCHEMA IF EXISTS atomic_save_concurrency CASCADE;

DELETE FROM auth.users
WHERE id = 'a7220000-0000-4000-8000-000000000001'::UUID;

CREATE SCHEMA atomic_save_concurrency;
REVOKE ALL ON SCHEMA atomic_save_concurrency FROM PUBLIC, anon, service_role;
GRANT USAGE ON SCHEMA atomic_save_concurrency TO authenticated;

CREATE TABLE atomic_save_concurrency.results (
  test_case TEXT NOT NULL,
  session_name TEXT NOT NULL,
  response JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  finished_at TIMESTAMPTZ,
  PRIMARY KEY (test_case, session_name)
);

REVOKE ALL ON TABLE atomic_save_concurrency.results
  FROM PUBLIC, anon, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE atomic_save_concurrency.results
  TO authenticated;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000'::UUID,
  'a7220000-0000-4000-8000-000000000001'::UUID,
  'authenticated',
  'authenticated',
  'atomic-save-concurrency@example.test',
  '',
  clock_timestamp(),
  '{"provider":"email","providers":["email"]}'::JSONB,
  '{"display_name":"Atomic concurrency fixture"}'::JSONB,
  clock_timestamp(),
  clock_timestamp()
);

INSERT INTO public.knowledge_bases (id, owner_id, name, description)
VALUES
  (
    'a7220000-0000-4000-8000-000000000101'::UUID,
    'a7220000-0000-4000-8000-000000000001'::UUID,
    'Same operation concurrency',
    'Disposable local fixture'
  ),
  (
    'a7220000-0000-4000-8000-000000000102'::UUID,
    'a7220000-0000-4000-8000-000000000001'::UUID,
    'CAS concurrency',
    'Disposable local fixture'
  ),
  (
    'a7220000-0000-4000-8000-000000000103'::UUID,
    'a7220000-0000-4000-8000-000000000001'::UUID,
    'Knowledge-base delete lock order',
    'Disposable local fixture'
  );

INSERT INTO public.documents (
  id, knowledge_base_id, owner_id, title, body, status, visibility, revision
) VALUES (
  'a7220000-0000-4000-8000-000000000201'::UUID,
  'a7220000-0000-4000-8000-000000000102'::UUID,
  'a7220000-0000-4000-8000-000000000001'::UUID,
  'CAS before',
  'CAS before body',
  'draft',
  'private',
  0
);
