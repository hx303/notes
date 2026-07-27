BEGIN;
INSERT INTO atomic_save_concurrency.results (test_case, session_name)
VALUES ('knowledge_base_delete', 'delete_contender');

DELETE FROM public.knowledge_bases
WHERE id = 'a7220000-0000-4000-8000-000000000103'::UUID;

UPDATE atomic_save_concurrency.results
SET response = '{"status":"deleted"}'::JSONB,
    finished_at = clock_timestamp()
WHERE test_case = 'knowledge_base_delete' AND session_name = 'delete_contender';
COMMIT;
SELECT 'atomic-save-session-complete' AS marker;
