BEGIN;
SET LOCAL application_name = 'atomic-save-same-op-holder';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT set_config(
  'request.jwt.claim.sub',
  'a7220000-0000-4000-8000-000000000001',
  TRUE
);

INSERT INTO atomic_save_concurrency.results (test_case, session_name)
VALUES ('same_op_new', 'holder');

UPDATE atomic_save_concurrency.results
SET response = public.save_document_snapshot_v1(
      'concurrent-same-new',
      NULL,
      'a7220000-0000-4000-8000-000000000101'::UUID,
      0,
      '{"title":"Concurrent exactly once","body":"Same operation body","topic":"","maturity":"seed","visibility":"private","tags":[],"prerequisites":[],"related":[],"sources":[]}'::JSONB
    ),
    finished_at = clock_timestamp()
WHERE test_case = 'same_op_new' AND session_name = 'holder';

SELECT pg_sleep(4);
COMMIT;
SELECT 'atomic-save-session-complete' AS marker;
