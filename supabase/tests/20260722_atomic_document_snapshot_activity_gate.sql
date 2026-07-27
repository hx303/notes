-- Production-safe, read-only concurrency gate for 20260722000200.

WITH activity_risk AS (
  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_stat_activity activity
    WHERE activity.datname = current_database()
      AND activity.pid <> pg_backend_pid()
      AND activity.backend_type = 'client backend'
      AND (
        activity.wait_event_type = 'Lock'
        OR (
          activity.xact_start IS NOT NULL
          AND clock_timestamp() - activity.xact_start >= INTERVAL '5 minutes'
        )
      )
  ) AS found
), lock_risk AS (
  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_locks waiting_lock
    JOIN pg_catalog.pg_stat_activity activity ON activity.pid = waiting_lock.pid
    WHERE activity.datname = current_database()
      AND activity.pid <> pg_backend_pid()
      AND NOT waiting_lock.granted
  ) AS found
)
SELECT
  'atomic_document_snapshot_activity_gate_passed' AS result,
  300::INTEGER AS max_transaction_age_seconds
FROM activity_risk
CROSS JOIN lock_risk
WHERE NOT activity_risk.found AND NOT lock_risk.found
UNION ALL
SELECT
  'atomic_document_snapshot_activity_gate_failed' AS result,
  300::INTEGER AS max_transaction_age_seconds
FROM activity_risk
CROSS JOIN lock_risk
WHERE activity_risk.found OR lock_risk.found;
