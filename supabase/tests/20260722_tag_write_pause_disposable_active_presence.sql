-- Read-only proof that intentional comment drift did not remove or disable the gate.

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

DO $tag_write_pause_disposable_active_presence$
DECLARE
  gate_function_oid oid;
BEGIN
  IF current_database() !~ '^wouldkeep_p1b_tag_write_pause_[a-z0-9_]+$' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'wouldkeep_tag_write_pause_disposable_database_name_required';
  END IF;

  SELECT procedure.oid
  INTO STRICT gate_function_oid
  FROM pg_catalog.pg_proc procedure
  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'wouldkeep_maintenance'
    AND procedure.proname = 'reject_tag_write_while_paused'
    AND procedure.pronargs = 0
    AND NOT procedure.prosecdef
    AND procedure.proconfig = ARRAY['search_path=pg_catalog'];

  IF (SELECT count(*) FROM pg_catalog.pg_trigger trigger
      WHERE trigger.tgfoid = gate_function_oid
        AND trigger.tgtype = 62
        AND trigger.tgenabled = 'A'
        AND NOT trigger.tgisinternal
        AND (
          (trigger.tgrelid = 'public.tags'::regclass
           AND trigger.tgname = 'wouldkeep_tags_write_pause'
           AND pg_catalog.obj_description(trigger.oid, 'pg_trigger') =
             'wouldkeep disposable tag-write pause comment drift')
          OR
          (trigger.tgrelid = 'public.document_tags'::regclass
           AND trigger.tgname = 'wouldkeep_document_tags_write_pause'
           AND pg_catalog.obj_description(trigger.oid, 'pg_trigger') =
             'wouldkeep temporary tag-write pause gate: exact SQLSTATE 55000')
        )) <> 2 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'wouldkeep_tag_write_pause_disposable_gate_not_active_after_drift';
  END IF;
EXCEPTION
  WHEN no_data_found OR too_many_rows THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'wouldkeep_tag_write_pause_disposable_gate_not_active_after_drift';
END;
$tag_write_pause_disposable_active_presence$;

SELECT 'tag_write_pause_disposable_active_after_failed_disable' AS result;
