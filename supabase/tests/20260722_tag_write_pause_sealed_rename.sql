-- Rename the fully initialized CLI database before its clean shutdown.

\set ON_ERROR_STOP on

SELECT pg_catalog.set_config(
  'wouldkeep.sealed_database_name',
  :'sealed_database_name',
  false
);

DO $sealed_rename_preflight$
BEGIN
  IF current_database() <> 'template1'
     OR pg_catalog.current_setting('wouldkeep.sealed_database_name')
       !~ '^wouldkeep_p1b_tag_write_pause_[a-f0-9]{16}$'
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datname = 'postgres')
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_database
       WHERE datname = pg_catalog.current_setting('wouldkeep.sealed_database_name')
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'wouldkeep_tag_write_pause_sealed_rename_preflight_failed';
  END IF;
END;
$sealed_rename_preflight$;

ALTER DATABASE postgres ALLOW_CONNECTIONS false;

SELECT pg_catalog.pg_terminate_backend(activity.pid)
FROM pg_catalog.pg_stat_activity activity
WHERE activity.datname = 'postgres'
  AND activity.pid <> pg_backend_pid();

ALTER DATABASE postgres RENAME TO :"sealed_database_name";
ALTER DATABASE :"sealed_database_name" ALLOW_CONNECTIONS true;

SELECT 'tag_write_pause_sealed_database_renamed' AS result;
