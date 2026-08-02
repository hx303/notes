-- Disposable-only deterministic release of the single controlled writer.

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

DO $tag_write_pause_disposable_writer_release$
DECLARE
  server_address inet := pg_catalog.inet_server_addr();
  target_pid integer;
BEGIN
  IF server_address IS NULL
     OR NOT (
       server_address <<= '127.0.0.0/8'::inet
       OR server_address = '::1'::inet
     )
     OR current_database() !~ '^wouldkeep_p1b_tag_write_pause_[a-z0-9_]+$' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'wouldkeep_tag_write_pause_disposable_writer_release_preflight_failed';
  END IF;

  SELECT activity.pid
  INTO STRICT target_pid
  FROM pg_catalog.pg_stat_activity activity
  WHERE activity.datname = current_database()
    AND activity.pid <> pg_backend_pid()
    AND activity.backend_type = 'client backend'
    AND activity.usename = current_user
    AND activity.application_name = 'wouldkeep_p1b_tag_write_pause_writer'
    AND activity.client_addr IS NOT NULL
    AND (
      activity.client_addr <<= '127.0.0.0/8'::inet
      OR activity.client_addr = '::1'::inet
    )
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_locks lock
      WHERE lock.pid = activity.pid
        AND lock.locktype = 'relation'
        AND lock.relation = 'public.tags'::regclass
        AND lock.mode = 'RowExclusiveLock'
        AND lock.granted
    );

  IF NOT pg_catalog.pg_terminate_backend(target_pid, 5000) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'wouldkeep_tag_write_pause_disposable_writer_termination_failed';
  END IF;
END;
$tag_write_pause_disposable_writer_release$;

SELECT 'tag_write_pause_disposable_writer_backend_terminated' AS result;
