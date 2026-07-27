BEGIN;
SET LOCAL application_name = 'atomic-save-kb-holder';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT set_config(
  'request.jwt.claim.sub',
  'a7220000-0000-4000-8000-000000000001',
  TRUE
);

INSERT INTO atomic_save_concurrency.results (test_case, session_name)
VALUES ('knowledge_base_delete', 'save_holder');

UPDATE atomic_save_concurrency.results
SET response = public.save_document_snapshot_v1(
      'concurrent-kb-save',
      NULL,
      'a7220000-0000-4000-8000-000000000103'::UUID,
      0,
      '{"title":"Delete after save","body":"KB lock body","topic":"","maturity":"seed","visibility":"private","tags":[],"prerequisites":[],"related":[],"sources":[]}'::JSONB
    ),
    finished_at = clock_timestamp()
WHERE test_case = 'knowledge_base_delete' AND session_name = 'save_holder';

SELECT pg_sleep(4);
COMMIT;
SELECT 'atomic-save-session-complete' AS marker;
