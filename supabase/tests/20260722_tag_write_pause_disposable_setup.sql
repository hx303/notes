-- Disposable-only fixed fixture setup. The harness guarantees a throwaway loopback DB.

\set ON_ERROR_STOP on
\if :{?wouldkeep_p1b_tag_write_pause_disposable}
\else
\set wouldkeep_p1b_tag_write_pause_disposable false
\endif
\if :wouldkeep_p1b_tag_write_pause_disposable
\else
\echo 'Refusing to run: exact disposable confirmation is required.'
DO $disposable_confirmation_required$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'wouldkeep_tag_write_pause_disposable_confirmation_required';
END;
$disposable_confirmation_required$;
\endif

BEGIN;

DO $tag_write_pause_disposable_setup_preflight$
BEGIN
  IF current_database() !~ '^wouldkeep_p1b_tag_write_pause_[a-z0-9_]+$'
     OR EXISTS (
       SELECT 1 FROM auth.users
       WHERE id = 'a1550000-0000-4000-8000-000000000001'::uuid
          OR email = 'p1b-tag-write-pause-owner@example.test'
     )
     OR EXISTS (
       SELECT 1 FROM public.knowledge_bases
       WHERE id = 'b1550000-0000-4000-8000-000000000001'::uuid
     )
     OR EXISTS (
       SELECT 1 FROM public.documents
       WHERE id = 'd1550000-0000-4000-8000-000000000001'::uuid
     )
     OR EXISTS (
       SELECT 1 FROM public.tags
       WHERE id = 'c1550000-0000-4000-8000-000000000001'::uuid
     )
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'wouldkeep_maintenance'
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'wouldkeep_tag_write_pause_disposable_setup_residue';
  END IF;
END;
$tag_write_pause_disposable_setup_preflight$;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000'::uuid,
  'a1550000-0000-4000-8000-000000000001'::uuid,
  'authenticated',
  'authenticated',
  'p1b-tag-write-pause-owner@example.test',
  '',
  clock_timestamp(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Disposable tag-write pause owner"}'::jsonb,
  clock_timestamp(),
  clock_timestamp()
);

INSERT INTO public.knowledge_bases (id, owner_id, name)
VALUES (
  'b1550000-0000-4000-8000-000000000001'::uuid,
  'a1550000-0000-4000-8000-000000000001'::uuid,
  'Disposable tag-write pause knowledge base'
);

INSERT INTO public.documents (id, knowledge_base_id, owner_id, title)
VALUES (
  'd1550000-0000-4000-8000-000000000001'::uuid,
  'b1550000-0000-4000-8000-000000000001'::uuid,
  'a1550000-0000-4000-8000-000000000001'::uuid,
  'Disposable tag-write pause document'
);

INSERT INTO public.tags (id, knowledge_base_id, owner_id, name, normalized_name)
VALUES (
  'c1550000-0000-4000-8000-000000000001'::uuid,
  'b1550000-0000-4000-8000-000000000001'::uuid,
  'a1550000-0000-4000-8000-000000000001'::uuid,
  'Disposable pause tag',
  'disposable pause tag'
);

INSERT INTO public.document_tags (document_id, tag_id, owner_id)
VALUES (
  'd1550000-0000-4000-8000-000000000001'::uuid,
  'c1550000-0000-4000-8000-000000000001'::uuid,
  'a1550000-0000-4000-8000-000000000001'::uuid
);

COMMIT;

SELECT 'tag_write_pause_disposable_setup_passed' AS result;
