-- Disposable-only write-shape matrix not safe for production execution.

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

DO $tag_write_pause_disposable_extended_preflight$
BEGIN
  IF current_database() !~ '^wouldkeep_p1b_tag_write_pause_[a-z0-9_]+$'
     OR current_user <> 'supabase_admin'
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_roles
       WHERE rolname = current_user
         AND rolsuper
         AND rolcanlogin
     )
     OR (SELECT count(*) FROM pg_catalog.pg_trigger trigger
         JOIN pg_catalog.pg_proc procedure ON procedure.oid = trigger.tgfoid
         JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
         WHERE namespace.nspname = 'wouldkeep_maintenance'
           AND procedure.proname = 'reject_tag_write_while_paused'
           AND trigger.tgtype = 62
           AND trigger.tgenabled = 'A'
           AND NOT trigger.tgisinternal
           AND (
             (trigger.tgrelid = 'public.tags'::regclass
              AND trigger.tgname = 'wouldkeep_tags_write_pause')
             OR
             (trigger.tgrelid = 'public.document_tags'::regclass
              AND trigger.tgname = 'wouldkeep_document_tags_write_pause')
           )) <> 2 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'wouldkeep_tag_write_pause_disposable_extended_preflight_failed';
  END IF;
END;
$tag_write_pause_disposable_extended_preflight$;

CREATE TEMP TABLE tag_write_pause_disposable_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text NOT NULL
) ON COMMIT DROP;

CREATE FUNCTION pg_temp.expect_tag_write_paused(test_name text, statement_text text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $expect_tag_write_paused$
DECLARE
  observed_state text;
  observed_message text;
BEGIN
  BEGIN
    EXECUTE statement_text;
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
      MESSAGE = 'wouldkeep_tag_write_pause_disposable_matrix_mismatch',
      DETAIL = format('test=%s state=%s', test_name, COALESCE(observed_state, 'none'));
  END IF;

  INSERT INTO tag_write_pause_disposable_results
  VALUES (test_name, true, 'exact SQLSTATE 55000 and stable message');
END;
$expect_tag_write_paused$;

SELECT pg_temp.expect_tag_write_paused(
  'upsert_blocked',
  $sql$
    INSERT INTO public.tags (id, knowledge_base_id, owner_id, name, normalized_name)
    VALUES (
      'c1550000-0000-4000-8000-000000000002'::uuid,
      'b1550000-0000-4000-8000-000000000001'::uuid,
      'a1550000-0000-4000-8000-000000000001'::uuid,
      'Disposable upsert',
      'disposable pause tag'
    )
    ON CONFLICT (knowledge_base_id, normalized_name)
    DO UPDATE SET name = EXCLUDED.name
  $sql$
);

SELECT pg_temp.expect_tag_write_paused(
  'merge_blocked',
  $sql$
    MERGE INTO public.tags AS target
    USING (VALUES (
      'c1550000-0000-4000-8000-000000000001'::uuid,
      'b1550000-0000-4000-8000-000000000001'::uuid,
      'a1550000-0000-4000-8000-000000000001'::uuid,
      'Disposable merge',
      'disposable pause tag'
    )) AS source(id, knowledge_base_id, owner_id, name, normalized_name)
      ON target.id = source.id
    WHEN MATCHED THEN UPDATE SET name = source.name
    WHEN NOT MATCHED THEN
      INSERT (id, knowledge_base_id, owner_id, name, normalized_name)
      VALUES (source.id, source.knowledge_base_id, source.owner_id, source.name, source.normalized_name)
  $sql$
);

SELECT pg_temp.expect_tag_write_paused(
  'truncate_blocked',
  'TRUNCATE TABLE public.document_tags'
);

SELECT pg_temp.expect_tag_write_paused(
  'foreign_key_cascade_blocked',
  $sql$
    DELETE FROM public.documents
    WHERE id = 'd1550000-0000-4000-8000-000000000001'::uuid
  $sql$
);

CREATE FUNCTION public.wouldkeep_disposable_tag_pause_definer()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $security_definer_probe$
BEGIN
  INSERT INTO public.tags (id, knowledge_base_id, owner_id, name, normalized_name)
  VALUES (
    'c1550000-0000-4000-8000-000000000003'::uuid,
    'b1550000-0000-4000-8000-000000000001'::uuid,
    'a1550000-0000-4000-8000-000000000001'::uuid,
    'Disposable security definer',
    'disposable security definer'
  );
END;
$security_definer_probe$;
REVOKE ALL ON FUNCTION public.wouldkeep_disposable_tag_pause_definer() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wouldkeep_disposable_tag_pause_definer() TO authenticated;

SET LOCAL ROLE authenticated;
DO $security_definer_must_not_bypass$
DECLARE
  observed_state text;
  observed_message text;
BEGIN
  BEGIN
    PERFORM public.wouldkeep_disposable_tag_pause_definer();
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
      MESSAGE = 'wouldkeep_tag_write_pause_security_definer_bypass';
  END IF;
END;
$security_definer_must_not_bypass$;
RESET ROLE;

INSERT INTO tag_write_pause_disposable_results
VALUES ('security_definer_blocked', true, 'table owner definer received exact 55000');

SET LOCAL session_replication_role = replica;
SELECT pg_temp.expect_tag_write_paused(
  'replica_session_blocked',
  $sql$
    INSERT INTO public.tags (id, knowledge_base_id, owner_id, name, normalized_name)
    VALUES (
      'c1550000-0000-4000-8000-000000000004'::uuid,
      'b1550000-0000-4000-8000-000000000001'::uuid,
      'a1550000-0000-4000-8000-000000000001'::uuid,
      'Disposable replica role',
      'disposable replica role'
    )
  $sql$
);
SET LOCAL session_replication_role = origin;

DO $tag_write_pause_disposable_extended_assertions$
BEGIN
  IF (SELECT count(*) FROM tag_write_pause_disposable_results) <> 6
     OR EXISTS (SELECT 1 FROM tag_write_pause_disposable_results WHERE NOT passed)
     OR (SELECT count(*) FROM public.tags
         WHERE id::text LIKE 'c1550000-0000-4000-8000-%') <> 1
     OR (SELECT count(*) FROM public.documents
         WHERE id = 'd1550000-0000-4000-8000-000000000001'::uuid) <> 1
     OR (SELECT count(*) FROM public.document_tags
         WHERE document_id = 'd1550000-0000-4000-8000-000000000001'::uuid
           AND tag_id = 'c1550000-0000-4000-8000-000000000001'::uuid) <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'wouldkeep_tag_write_pause_disposable_extended_state_changed';
  END IF;
END;
$tag_write_pause_disposable_extended_assertions$;

ROLLBACK;

SELECT
  'tag_write_pause_disposable_extended_passed' AS result,
  6::integer AS cases_checked;
