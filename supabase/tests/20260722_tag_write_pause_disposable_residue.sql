-- Disposable-only read-only residue count. All values must be zero.

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

SELECT
  (SELECT count(*) FROM auth.users
   WHERE id = 'a1550000-0000-4000-8000-000000000001'::uuid
      OR email = 'p1b-tag-write-pause-owner@example.test') AS users,
  (SELECT count(*) FROM public.profiles
   WHERE id = 'a1550000-0000-4000-8000-000000000001'::uuid) AS profiles,
  (SELECT count(*) FROM public.knowledge_bases
   WHERE id = 'b1550000-0000-4000-8000-000000000001'::uuid) AS knowledge_bases,
  (SELECT count(*) FROM public.documents
   WHERE id = 'd1550000-0000-4000-8000-000000000001'::uuid) AS documents,
  (SELECT count(*) FROM public.tags
   WHERE id::text LIKE 'c1550000-0000-4000-8000-%') AS tags,
  (SELECT count(*) FROM public.document_tags
   WHERE tag_id::text LIKE 'c1550000-0000-4000-8000-%'
      OR document_id = 'd1550000-0000-4000-8000-000000000001'::uuid) AS document_tags,
  (SELECT count(*) FROM pg_catalog.pg_namespace
   WHERE nspname = 'wouldkeep_maintenance') AS gate_schemas,
  (SELECT count(*) FROM pg_catalog.pg_trigger
   WHERE tgname IN ('wouldkeep_tags_write_pause', 'wouldkeep_document_tags_write_pause')) AS gate_triggers,
  (SELECT count(*) FROM pg_catalog.pg_proc procedure
   WHERE procedure.proname IN (
     'reject_tag_write_while_paused',
     'wouldkeep_disposable_tag_pause_definer'
   )) AS gate_functions,
  'tag_write_pause_disposable_residue_zero' AS result;
