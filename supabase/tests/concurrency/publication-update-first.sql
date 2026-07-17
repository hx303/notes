\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT set_config('request.jwt.claim.sub', :'owner_id', TRUE);
UPDATE public.document_publications
SET snapshot = snapshot || '{"race":"update-first"}'::JSONB
WHERE document_id = 'ad100000-0000-4000-8000-000000000001';
SELECT pg_sleep(2);
COMMIT;
