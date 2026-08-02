-- Disposable-only intentional trigger-comment drift.

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

DO $tag_write_pause_disposable_comment_drift_preflight$
BEGIN
  IF current_database() !~ '^wouldkeep_p1b_tag_write_pause_[a-z0-9_]+$'
     OR (SELECT count(*) FROM pg_catalog.pg_trigger trigger
         WHERE trigger.tgrelid = 'public.tags'::regclass
           AND trigger.tgname = 'wouldkeep_tags_write_pause'
           AND trigger.tgtype = 62
           AND trigger.tgenabled = 'A'
           AND pg_catalog.obj_description(trigger.oid, 'pg_trigger') =
             'wouldkeep temporary tag-write pause gate: exact SQLSTATE 55000') <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'wouldkeep_tag_write_pause_disposable_comment_drift_preflight_failed';
  END IF;
END;
$tag_write_pause_disposable_comment_drift_preflight$;

COMMENT ON TRIGGER wouldkeep_tags_write_pause ON public.tags IS
  'wouldkeep disposable tag-write pause comment drift';

SELECT 'tag_write_pause_disposable_comment_drift_applied' AS result;
