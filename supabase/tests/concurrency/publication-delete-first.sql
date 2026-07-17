\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT set_config('request.jwt.claim.sub', :'owner_id', TRUE);
UPDATE public.documents SET deleted_at = NOW()
WHERE id = 'ad200000-0000-4000-8000-000000000002';
SELECT pg_sleep(2);
COMMIT;
