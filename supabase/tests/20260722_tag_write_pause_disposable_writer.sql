-- Disposable-only background writer. A bounded sleep keeps one zero-row
-- RowExclusive write transaction open until the harness terminates the client.

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

DO $tag_write_pause_disposable_writer_preflight$
DECLARE
  server_address inet := pg_catalog.inet_server_addr();
BEGIN
  IF server_address IS NULL
     OR NOT (
       server_address <<= '127.0.0.0/8'::inet
       OR server_address = '::1'::inet
     )
     OR current_database() !~ '^wouldkeep_p1b_tag_write_pause_[a-z0-9_]+$'
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'wouldkeep_maintenance')
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_trigger
       WHERE tgname IN ('wouldkeep_tags_write_pause', 'wouldkeep_document_tags_write_pause')
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'wouldkeep_tag_write_pause_disposable_writer_preflight_failed';
  END IF;
END;
$tag_write_pause_disposable_writer_preflight$;

SET application_name = 'wouldkeep_p1b_tag_write_pause_writer';
SET statement_timeout = '75s';
BEGIN;
UPDATE public.tags SET name = name WHERE false;
SELECT 'tag_write_pause_disposable_writer_lock_acquired' AS result;
SELECT pg_catalog.pg_sleep(:wouldkeep_p1b_tag_write_pause_hold_seconds);
ROLLBACK;
SELECT 'tag_write_pause_disposable_writer_released' AS result;
