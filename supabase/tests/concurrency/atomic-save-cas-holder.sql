BEGIN;
SET LOCAL application_name = 'atomic-save-cas-holder';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT set_config(
  'request.jwt.claim.sub',
  'a7220000-0000-4000-8000-000000000001',
  TRUE
);

INSERT INTO atomic_save_concurrency.results (test_case, session_name)
VALUES ('different_op_cas', 'holder');

UPDATE atomic_save_concurrency.results
SET response = public.save_document_snapshot_v1(
      'concurrent-cas-holder',
      'a7220000-0000-4000-8000-000000000201'::UUID,
      'a7220000-0000-4000-8000-000000000102'::UUID,
      0,
      '{"title":"CAS holder won","body":"CAS holder body","topic":"","maturity":"seed","visibility":"private","tags":[],"prerequisites":[],"related":[],"sources":[]}'::JSONB
    ),
    finished_at = clock_timestamp()
WHERE test_case = 'different_op_cas' AND session_name = 'holder';

SELECT pg_sleep(4);
COMMIT;
SELECT 'atomic-save-session-complete' AS marker;
