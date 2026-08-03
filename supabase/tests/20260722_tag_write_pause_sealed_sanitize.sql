-- Remove every database login secret before the initialized volume is sealed.

\set ON_ERROR_STOP on

SELECT pg_catalog.format('ALTER ROLE %I PASSWORD NULL;', role.rolname)
FROM pg_catalog.pg_roles role
WHERE role.rolcanlogin
ORDER BY role.rolname
\gexec

WITH configured AS (
  SELECT
    setting.setdatabase,
    setting.setrole,
    pg_catalog.split_part(value, '=', 1) AS setting_name
  FROM pg_catalog.pg_db_role_setting setting
  CROSS JOIN LATERAL pg_catalog.unnest(setting.setconfig) value
  WHERE pg_catalog.split_part(value, '=', 1) ~* '(jwt|secret|password|token)'
)
SELECT CASE
  WHEN configured.setrole <> 0 AND configured.setdatabase <> 0 THEN
    pg_catalog.format(
      'ALTER ROLE %I IN DATABASE %I RESET %I;',
      (SELECT role.rolname FROM pg_catalog.pg_roles role WHERE role.oid = configured.setrole),
      (SELECT database.datname FROM pg_catalog.pg_database database
       WHERE database.oid = configured.setdatabase),
      configured.setting_name
    )
  WHEN configured.setrole <> 0 THEN
    pg_catalog.format(
      'ALTER ROLE %I RESET %I;',
      (SELECT role.rolname FROM pg_catalog.pg_roles role WHERE role.oid = configured.setrole),
      configured.setting_name
    )
  WHEN configured.setdatabase <> 0 THEN
    pg_catalog.format(
      'ALTER DATABASE %I RESET %I;',
      (SELECT database.datname FROM pg_catalog.pg_database database
       WHERE database.oid = configured.setdatabase),
      configured.setting_name
    )
  ELSE NULL
END
FROM configured
WHERE configured.setrole <> 0 OR configured.setdatabase <> 0
ORDER BY configured.setdatabase, configured.setrole, configured.setting_name
\gexec

ALTER SYSTEM RESET ALL;
SELECT pg_catalog.pg_reload_conf();

DO $tag_write_pause_sealed_sanitize$
BEGIN
  IF EXISTS (
       SELECT 1 FROM pg_catalog.pg_authid role
       WHERE role.rolcanlogin AND role.rolpassword IS NOT NULL
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_db_role_setting setting
       CROSS JOIN LATERAL pg_catalog.unnest(setting.setconfig) value
       WHERE pg_catalog.split_part(value, '=', 1) ~* '(jwt|secret|password|token)'
     )
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_file_settings setting
       WHERE setting.name ~* '(jwt|secret|password|token)'
         AND setting.name <> 'password_encryption'
         AND setting.applied
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'wouldkeep_tag_write_pause_sealed_secret_sanitization_failed';
  END IF;
END;
$tag_write_pause_sealed_sanitize$;

SELECT 'tag_write_pause_sealed_secrets_removed' AS result;
