-- Supabase CLI role/bootstrap hook for the sealed disposable baseline only.
-- schema.sql is loaded byte-for-byte before the 19 reviewed migrations.

\set ON_ERROR_STOP on
\ir schema.sql

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000'::uuid,
  'b154d7e9-07c9-4412-8673-86239bbbe367'::uuid,
  'authenticated',
  'authenticated',
  '2149665127@qq.com',
  '',
  '2026-07-18T00:00:00Z'::timestamptz,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Sealed synthetic site owner"}'::jsonb,
  '2026-07-18T00:00:00Z'::timestamptz,
  '2026-07-18T00:00:00Z'::timestamptz
);

SELECT 'tag_write_pause_sealed_schema_and_owner_fixture_loaded' AS result;
