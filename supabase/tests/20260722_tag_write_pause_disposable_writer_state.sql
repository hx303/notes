-- Disposable-only read-only proof of the controlled background RowExclusive writer.

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

WITH writer AS (
  SELECT activity.pid
  FROM pg_catalog.pg_stat_activity activity
  WHERE activity.datname = current_database()
    AND activity.pid <> pg_backend_pid()
    AND activity.application_name = 'wouldkeep_p1b_tag_write_pause_writer'
    AND activity.backend_type = 'client backend'
    AND activity.xact_start IS NOT NULL
), writer_lock AS (
  SELECT lock.pid
  FROM pg_catalog.pg_locks lock
  JOIN writer ON writer.pid = lock.pid
  WHERE lock.locktype = 'relation'
    AND lock.relation = 'public.tags'::regclass
    AND lock.mode = 'RowExclusiveLock'
    AND lock.granted
)
SELECT CASE
  WHEN (SELECT count(*) FROM writer) = 1
   AND (SELECT count(*) FROM writer_lock) = 1
  THEN 'tag_write_pause_disposable_writer_ready'
  ELSE 'tag_write_pause_disposable_writer_not_ready'
END AS result;
