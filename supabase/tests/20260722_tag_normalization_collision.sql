-- Disposable negative case: projected canonical collisions must fail before writes.
-- Run with -v wouldkeep_p1b_20260722000150_collision_disposable=true and expect
-- a nonzero psql exit. Connection close rolls this open transaction back.

\set ON_ERROR_STOP on
\if :{?wouldkeep_p1b_20260722000150_collision_disposable}
\else
\set wouldkeep_p1b_20260722000150_collision_disposable false
\endif
\if :wouldkeep_p1b_20260722000150_collision_disposable
\else
\echo 'Refusing to run: pass the exact collision-disposable confirmation variable.'
DO $tag_normalization_collision_guard$
BEGIN
  RAISE EXCEPTION 'Collision-disposable environment confirmation is required';
END;
$tag_normalization_collision_guard$;
\endif

BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000'::UUID,
  'a1500000-0000-4000-8000-000000000200'::UUID,
  'authenticated', 'authenticated',
  'p1b-tag-normalization-collision@example.test', '', clock_timestamp(),
  '{"provider":"email","providers":["email"]}'::JSONB,
  '{"display_name":"Synthetic collision owner"}'::JSONB,
  clock_timestamp(), clock_timestamp()
);

INSERT INTO public.knowledge_bases (id, owner_id, name)
VALUES (
  'b1500000-0000-4000-8000-000000000200'::UUID,
  'a1500000-0000-4000-8000-000000000200'::UUID,
  'Synthetic collision knowledge base'
);

INSERT INTO public.tags (id, knowledge_base_id, owner_id, name, normalized_name)
VALUES
  (
    'c1500000-0000-4000-8000-000000000201'::UUID,
    'b1500000-0000-4000-8000-000000000200'::UUID,
    'a1500000-0000-4000-8000-000000000200'::UUID,
    'Ａ', 'legacy-a'
  ),
  (
    'c1500000-0000-4000-8000-000000000202'::UUID,
    'b1500000-0000-4000-8000-000000000200'::UUID,
    'a1500000-0000-4000-8000-000000000200'::UUID,
    'A', 'a'
  );

\ir ../migrations/20260722000150_normalize_existing_tags_for_atomic_save.sql
