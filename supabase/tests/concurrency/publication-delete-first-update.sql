\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT set_config('request.jwt.claim.sub', :'owner_id', TRUE);
UPDATE public.document_publications
SET snapshot = snapshot || '{"race":"delete-first"}'::JSONB
WHERE document_id = 'ad200000-0000-4000-8000-000000000002';
COMMIT;
