-- Disposable-only COPY FROM probe. Expected result is psql exit 3 with exact 55000.

\set ON_ERROR_STOP on
\set VERBOSITY verbose
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

DO $tag_write_pause_disposable_copy_preflight$
BEGIN
  IF current_database() !~ '^wouldkeep_p1b_tag_write_pause_[a-z0-9_]+$'
     OR (SELECT count(*) FROM pg_catalog.pg_trigger trigger
         JOIN pg_catalog.pg_proc procedure ON procedure.oid = trigger.tgfoid
         JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
         WHERE namespace.nspname = 'wouldkeep_maintenance'
           AND procedure.proname = 'reject_tag_write_while_paused'
           AND trigger.tgrelid = 'public.tags'::regclass
           AND trigger.tgname = 'wouldkeep_tags_write_pause'
           AND trigger.tgtype = 62
           AND trigger.tgenabled = 'A'
           AND NOT trigger.tgisinternal) <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'wouldkeep_tag_write_pause_disposable_copy_preflight_failed';
  END IF;
END;
$tag_write_pause_disposable_copy_preflight$;

COPY public.tags (id, knowledge_base_id, owner_id, name, normalized_name)
FROM STDIN WITH (FORMAT csv);
c1550000-0000-4000-8000-000000000005,b1550000-0000-4000-8000-000000000001,a1550000-0000-4000-8000-000000000001,Disposable copy,disposable copy
\.
