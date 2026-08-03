-- Disposable-only read-only proof that the controlled writer is fully released.

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

SELECT CASE WHEN NOT EXISTS (
  SELECT 1
  FROM pg_catalog.pg_stat_activity activity
  WHERE activity.datname = current_database()
    AND activity.pid <> pg_backend_pid()
    AND activity.application_name = 'wouldkeep_p1b_tag_write_pause_writer'
) THEN 'tag_write_pause_disposable_writer_absent'
ELSE 'tag_write_pause_disposable_writer_still_present'
END AS result;
