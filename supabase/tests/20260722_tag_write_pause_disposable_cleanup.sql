-- Disposable-only final fixture cleanup. Gate objects must already be absent.

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

DO $tag_write_pause_disposable_cleanup_preflight$
BEGIN
  IF current_database() !~ '^wouldkeep_p1b_tag_write_pause_[a-z0-9_]+$'
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'wouldkeep_maintenance')
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_trigger trigger
       WHERE trigger.tgname IN ('wouldkeep_tags_write_pause', 'wouldkeep_document_tags_write_pause')
     )
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_proc procedure
       JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
       WHERE namespace.nspname = 'public'
         AND procedure.proname = 'wouldkeep_disposable_tag_pause_definer'
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'wouldkeep_tag_write_pause_disposable_cleanup_gate_not_absent';
  END IF;
END;
$tag_write_pause_disposable_cleanup_preflight$;

DELETE FROM auth.users
WHERE id = 'a1550000-0000-4000-8000-000000000001'::uuid
  AND email = 'p1b-tag-write-pause-owner@example.test';

COMMIT;

SELECT 'tag_write_pause_disposable_cleanup_passed' AS result;
