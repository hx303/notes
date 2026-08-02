-- Disposable-only proof for the exact 00150 transaction-local deployment permit.

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

DO $deployment_permit_preflight$
BEGIN
  IF current_database() !~ '^wouldkeep_p1b_tag_write_pause_[a-z0-9_]+$'
     OR (SELECT relowner FROM pg_catalog.pg_class WHERE oid = 'public.tags'::regclass)
       <> (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user)
     OR (SELECT relowner FROM pg_catalog.pg_class WHERE oid = 'public.document_tags'::regclass)
       <> (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user)
     OR to_regprocedure(
       'wouldkeep_maintenance.open_tag_normalization_00150_permit()'
     ) IS NULL
     OR to_regprocedure(
       'wouldkeep_maintenance.reject_tag_write_while_paused()'
     ) IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'wouldkeep_tag_write_pause_disposable_deployment_permit_preflight_failed';
  END IF;
END;
$deployment_permit_preflight$;

-- SELECT is required for the zero-row self-assignment to reach the statement
-- trigger instead of failing earlier during column-privilege analysis.
GRANT SELECT, UPDATE ON public.tags, public.document_tags TO authenticated;

CREATE FUNCTION pg_temp.wouldkeep_disposable_owner_tag_update()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $security_definer_update$
BEGIN
  UPDATE public.tags SET name = name WHERE false;
END;
$security_definer_update$;
REVOKE ALL ON FUNCTION pg_temp.wouldkeep_disposable_owner_tag_update() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.wouldkeep_disposable_owner_tag_update() TO authenticated;

DO $permit_requires_locks$
DECLARE
  observed_state text;
  observed_message text;
BEGIN
  BEGIN
    PERFORM wouldkeep_maintenance.open_tag_normalization_00150_permit();
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS
        observed_state = RETURNED_SQLSTATE,
        observed_message = MESSAGE_TEXT;
  END;

  IF observed_state IS DISTINCT FROM '55000'
     OR observed_message IS DISTINCT FROM 'wouldkeep_tag_normalization_permit_lock_mismatch' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'wouldkeep_tag_write_pause_disposable_permit_lock_bypass';
  END IF;
END;
$permit_requires_locks$;

SET LOCAL ROLE authenticated;

DO $unprivileged_helper_denied$
DECLARE
  observed_state text;
BEGIN
  BEGIN
    PERFORM wouldkeep_maintenance.open_tag_normalization_00150_permit();
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS observed_state = RETURNED_SQLSTATE;
  END;

  IF observed_state IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'wouldkeep_tag_write_pause_disposable_permit_acl_bypass';
  END IF;
END;
$unprivileged_helper_denied$;

CREATE TEMP TABLE pg_temp.wouldkeep_tag_normalization_00150_permit (
  migration_version bigint NOT NULL,
  backend_pid integer NOT NULL,
  transaction_id xid8 NOT NULL,
  invoker_oid oid NOT NULL,
  session_user_oid oid NOT NULL
) ON COMMIT DROP;

INSERT INTO pg_temp.wouldkeep_tag_normalization_00150_permit
VALUES (
  20260722000150,
  pg_backend_pid(),
  pg_current_xact_id(),
  (SELECT relowner FROM pg_catalog.pg_class WHERE oid = 'public.tags'::regclass),
  (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = session_user)
);

DO $forged_permit_direct_update_blocked$
DECLARE
  observed_state text;
  observed_message text;
BEGIN
  BEGIN
    UPDATE public.tags SET name = name WHERE false;
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS
        observed_state = RETURNED_SQLSTATE,
        observed_message = MESSAGE_TEXT;
  END;

  IF observed_state IS DISTINCT FROM '55000'
     OR observed_message IS DISTINCT FROM 'wouldkeep_tag_writes_paused' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'wouldkeep_tag_write_pause_disposable_forged_permit_direct_bypass';
  END IF;
END;
$forged_permit_direct_update_blocked$;

DO $forged_permit_security_definer_blocked$
DECLARE
  observed_state text;
  observed_message text;
BEGIN
  BEGIN
    PERFORM pg_temp.wouldkeep_disposable_owner_tag_update();
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS
        observed_state = RETURNED_SQLSTATE,
        observed_message = MESSAGE_TEXT;
  END;

  IF observed_state IS DISTINCT FROM '55000'
     OR observed_message IS DISTINCT FROM 'wouldkeep_tag_writes_paused' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'wouldkeep_tag_write_pause_disposable_forged_permit_definer_bypass';
  END IF;
END;
$forged_permit_security_definer_blocked$;

DROP TABLE pg_temp.wouldkeep_tag_normalization_00150_permit;
RESET ROLE;

LOCK TABLE public.tags, public.document_tags IN SHARE ROW EXCLUSIVE MODE;
SELECT wouldkeep_maintenance.open_tag_normalization_00150_permit();

UPDATE public.tags SET name = name WHERE false;

DO $permit_does_not_open_document_tags$
DECLARE
  observed_state text;
  observed_message text;
BEGIN
  BEGIN
    UPDATE public.document_tags SET owner_id = owner_id WHERE false;
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS
        observed_state = RETURNED_SQLSTATE,
        observed_message = MESSAGE_TEXT;
  END;

  IF observed_state IS DISTINCT FROM '55000'
     OR observed_message IS DISTINCT FROM 'wouldkeep_tag_writes_paused' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'wouldkeep_tag_write_pause_disposable_document_tags_permit_bypass';
  END IF;
END;
$permit_does_not_open_document_tags$;

DO $permit_does_not_open_other_tag_operations$
DECLARE
  observed_state text;
  observed_message text;
BEGIN
  BEGIN
    INSERT INTO public.tags (id, knowledge_base_id, owner_id, name, normalized_name)
    SELECT id, knowledge_base_id, owner_id, name, normalized_name
    FROM public.tags
    WHERE false;
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS
        observed_state = RETURNED_SQLSTATE,
        observed_message = MESSAGE_TEXT;
  END;

  IF observed_state IS DISTINCT FROM '55000'
     OR observed_message IS DISTINCT FROM 'wouldkeep_tag_writes_paused' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'wouldkeep_tag_write_pause_disposable_insert_permit_bypass';
  END IF;

  observed_state := NULL;
  observed_message := NULL;

  BEGIN
    DELETE FROM public.tags WHERE false;
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS
        observed_state = RETURNED_SQLSTATE,
        observed_message = MESSAGE_TEXT;
  END;

  IF observed_state IS DISTINCT FROM '55000'
     OR observed_message IS DISTINCT FROM 'wouldkeep_tag_writes_paused' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'wouldkeep_tag_write_pause_disposable_delete_permit_bypass';
  END IF;
END;
$permit_does_not_open_other_tag_operations$;

DO $permit_row_is_exact$
DECLARE
  permit_oid oid := to_regclass('pg_temp.wouldkeep_tag_normalization_00150_permit');
  permit_ok boolean;
BEGIN
  IF permit_oid IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'wouldkeep_tag_write_pause_disposable_permit_missing';
  END IF;

  EXECUTE format(
    'SELECT count(*) = 1 AND bool_and(migration_version = 20260722000150 AND backend_pid = pg_backend_pid() AND transaction_id = pg_current_xact_id_if_assigned()) FROM %s',
    permit_oid::regclass
  ) INTO permit_ok;

  IF permit_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'wouldkeep_tag_write_pause_disposable_permit_row_drift';
  END IF;
END;
$permit_row_is_exact$;

DROP TABLE pg_temp.wouldkeep_tag_normalization_00150_permit;

DO $permit_closed$
BEGIN
  IF to_regclass('pg_temp.wouldkeep_tag_normalization_00150_permit') IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'wouldkeep_tag_write_pause_disposable_permit_not_closed';
  END IF;
END;
$permit_closed$;

ROLLBACK;

SELECT 'tag_write_pause_disposable_deployment_permit_passed' AS result;
