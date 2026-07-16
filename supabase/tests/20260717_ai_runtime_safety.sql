-- A20 runtime safety verification. Run as postgres on a non-production/staging database.
-- The transaction rolls back all config, preference, and audit mutations.

BEGIN;

CREATE TEMP TABLE ai_runtime_test_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) ON COMMIT DROP;
GRANT SELECT, INSERT, UPDATE ON ai_runtime_test_state TO authenticated, service_role;

INSERT INTO ai_runtime_test_state (key, value)
SELECT 'owner_id', id::TEXT
FROM public.profiles
ORDER BY created_at
LIMIT 1;

INSERT INTO ai_runtime_test_state (key, value)
SELECT 'other_id', id::TEXT
FROM public.profiles
WHERE id <> (SELECT value::UUID FROM ai_runtime_test_state WHERE key = 'owner_id')
ORDER BY created_at
LIMIT 1;

INSERT INTO ai_runtime_test_state (key, value)
SELECT
  'owner_publication_count',
  COUNT(*)::TEXT
FROM public.document_publications
WHERE owner_id = (SELECT value::UUID FROM ai_runtime_test_state WHERE key = 'owner_id');

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM ai_runtime_test_state WHERE key IN ('owner_id', 'other_id')) <> 2 THEN
    RAISE EXCEPTION 'A20 verification requires two existing profiles';
  END IF;
  IF has_table_privilege('anon', 'public.document_publications', 'SELECT') OR
     NOT has_table_privilege('authenticated', 'public.document_publications', 'SELECT') OR
     NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_class c
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname = 'document_publications'
         AND c.relrowsecurity
     ) OR
     NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_policies
       WHERE schemaname = 'public'
         AND tablename = 'document_publications'
         AND policyname = 'Owners can read own publications'
         AND cmd = 'SELECT'
     ) THEN
    RAISE EXCEPTION 'publication owner RLS/grants are not enforced';
  END IF;
  IF has_function_privilege('anon', 'public.reserve_ai_run(uuid,text,text,text,text,text,text,text,boolean,integer,text)', 'EXECUTE') OR
     has_function_privilege('authenticated', 'public.reserve_ai_run(uuid,text,text,text,text,text,text,text,boolean,integer,text)', 'EXECUTE') OR
     NOT has_function_privilege('service_role', 'public.reserve_ai_run(uuid,text,text,text,text,text,text,text,boolean,integer,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'reserve_ai_run grants are not service-role-only';
  END IF;
  IF has_function_privilege('anon', 'public.finalize_ai_run(uuid,uuid,text,integer,integer,integer,integer,integer,text,text,integer,text)', 'EXECUTE') OR
     has_function_privilege('authenticated', 'public.finalize_ai_run(uuid,uuid,text,integer,integer,integer,integer,integer,text,text,integer,text)', 'EXECUTE') OR
     NOT has_function_privilege('service_role', 'public.finalize_ai_run(uuid,uuid,text,integer,integer,integer,integer,integer,text,text,integer,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'finalize_ai_run grants are not service-role-only';
  END IF;
END;
$$;

SET LOCAL ROLE service_role;
INSERT INTO ai_runtime_test_state (key, value)
SELECT
  'blocked_run_id',
  (public.reserve_ai_run(
    (SELECT value::UUID FROM ai_runtime_test_state WHERE key = 'owner_id'),
    'rewrite', 'deepseek', 'deepseek-v4-flash', 'v1',
    'deepseek-cny-2026-07-17', repeat('a', 64), 'public', FALSE, 1, NULL
  )->>'run_id');
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.ai_runs
    WHERE id = (SELECT value::UUID FROM ai_runtime_test_state WHERE key = 'blocked_run_id')
      AND status = 'blocked'
      AND error_code = 'site_ai_disabled'
      AND cost_basis = 'none'
      AND cost_cents = 0
  ) THEN
    RAISE EXCEPTION 'default-off reservation did not create sanitized blocked audit';
  END IF;
END;
$$;

UPDATE public.ai_runtime_config
SET live_enabled = TRUE,
    hard_daily_request_limit = 20,
    hard_concurrent_request_limit = 1,
    active_provider = 'deepseek',
    allowed_models = ARRAY['deepseek-v4-flash', 'deepseek-v4-pro']::TEXT[],
    active_rate_card_version = 'deepseek-cny-2026-07-17';

INSERT INTO public.ai_preferences (
  owner_id, enabled, allow_private_content, monthly_budget_cents,
  grounding_mode, provider, model, daily_request_limit, concurrent_request_limit
) VALUES (
  (SELECT value::UUID FROM ai_runtime_test_state WHERE key = 'owner_id'),
  TRUE, FALSE, 100, 'selected_only', 'deepseek', 'deepseek-v4-flash', 20, 1
)
ON CONFLICT (owner_id) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  allow_private_content = EXCLUDED.allow_private_content,
  monthly_budget_cents = EXCLUDED.monthly_budget_cents,
  provider = EXCLUDED.provider,
  model = EXCLUDED.model,
  daily_request_limit = EXCLUDED.daily_request_limit,
  concurrent_request_limit = EXCLUDED.concurrent_request_limit;

SET LOCAL ROLE service_role;
INSERT INTO ai_runtime_test_state (key, value)
SELECT
  'running_run_id',
  (public.reserve_ai_run(
    (SELECT value::UUID FROM ai_runtime_test_state WHERE key = 'owner_id'),
    'rewrite', 'deepseek', 'deepseek-v4-flash', 'v1',
    'deepseek-cny-2026-07-17', repeat('b', 64), 'public', FALSE, 5, NULL
  )->>'run_id');

INSERT INTO ai_runtime_test_state (key, value)
SELECT
  'concurrent_block_id',
  (public.reserve_ai_run(
    (SELECT value::UUID FROM ai_runtime_test_state WHERE key = 'owner_id'),
    'rewrite', 'deepseek', 'deepseek-v4-flash', 'v1',
    'deepseek-cny-2026-07-17', repeat('c', 64), 'public', FALSE, 5, NULL
  )->>'run_id');
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.ai_runs
    WHERE id = (SELECT value::UUID FROM ai_runtime_test_state WHERE key = 'running_run_id')
      AND status = 'running'
      AND reservation_expires_at > created_at
      AND reservation_expires_at <= created_at + INTERVAL '2 minutes 5 seconds'
  ) THEN
    RAISE EXCEPTION 'running reservation lease was not created';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ai_runs
    WHERE id = (SELECT value::UUID FROM ai_runtime_test_state WHERE key = 'concurrent_block_id')
      AND status = 'blocked'
      AND error_code = 'concurrent_request_limit_reached'
  ) THEN
    RAISE EXCEPTION 'atomic concurrent limit did not block the second lease';
  END IF;
END;
$$;

SET LOCAL ROLE service_role;
INSERT INTO ai_runtime_test_state (key, value)
VALUES (
  'wrong_version_finalize',
  (public.finalize_ai_run(
    (SELECT value::UUID FROM ai_runtime_test_state WHERE key = 'running_run_id'),
    (SELECT value::UUID FROM ai_runtime_test_state WHERE key = 'owner_id'),
    'succeeded', 10, 2, 3, 7, 1, 'actual', 'wrong-version', 25, NULL
  )->>'finalized')
);

INSERT INTO ai_runtime_test_state (key, value)
VALUES (
  'null_version_finalize',
  (public.finalize_ai_run(
    (SELECT value::UUID FROM ai_runtime_test_state WHERE key = 'running_run_id'),
    (SELECT value::UUID FROM ai_runtime_test_state WHERE key = 'owner_id'),
    'succeeded', 10, 2, 3, 7, 1, 'actual', NULL, 25, NULL
  )->>'finalized')
), (
  'missing_usage_finalize',
  (public.finalize_ai_run(
    (SELECT value::UUID FROM ai_runtime_test_state WHERE key = 'running_run_id'),
    (SELECT value::UUID FROM ai_runtime_test_state WHERE key = 'owner_id'),
    'succeeded', NULL, NULL, NULL, NULL, 0, 'actual',
    'deepseek-cny-2026-07-17', 25, NULL
  )->>'finalized')
);
RESET ROLE;

DO $$
BEGIN
  IF (SELECT value FROM ai_runtime_test_state WHERE key = 'wrong_version_finalize') <> 'false' OR
     (SELECT value FROM ai_runtime_test_state WHERE key = 'null_version_finalize') <> 'false' OR
     (SELECT value FROM ai_runtime_test_state WHERE key = 'missing_usage_finalize') <> 'false' OR
     NOT EXISTS (
       SELECT 1 FROM public.ai_runs
       WHERE id = (SELECT value::UUID FROM ai_runtime_test_state WHERE key = 'running_run_id')
         AND status = 'running'
     ) THEN
    RAISE EXCEPTION 'invalid finalize mutated or accepted the running reservation';
  END IF;
END;
$$;

SET LOCAL ROLE service_role;
INSERT INTO ai_runtime_test_state (key, value)
VALUES (
  'success_finalize',
  (public.finalize_ai_run(
    (SELECT value::UUID FROM ai_runtime_test_state WHERE key = 'running_run_id'),
    (SELECT value::UUID FROM ai_runtime_test_state WHERE key = 'owner_id'),
    'succeeded', 10, 2, 3, 7, 1, 'actual',
    'deepseek-cny-2026-07-17', 25, NULL
  )->>'finalized')
);

INSERT INTO ai_runtime_test_state (key, value)
SELECT
  'lease_run_id',
  (public.reserve_ai_run(
    (SELECT value::UUID FROM ai_runtime_test_state WHERE key = 'owner_id'),
    'rewrite', 'deepseek', 'deepseek-v4-flash', 'v1',
    'deepseek-cny-2026-07-17', repeat('e', 64), 'public', FALSE, 5, NULL
  )->>'run_id');

INSERT INTO ai_runtime_test_state (key, value)
SELECT
  'private_null_block_id',
  (public.reserve_ai_run(
    (SELECT value::UUID FROM ai_runtime_test_state WHERE key = 'owner_id'),
    'rewrite', 'deepseek', 'deepseek-v4-flash', 'v1',
    'deepseek-cny-2026-07-17', repeat('f', 64), 'private', NULL, 5, NULL
  )->>'run_id');

INSERT INTO ai_runtime_test_state (key, value)
SELECT
  'rate_mismatch_block_id',
  (public.reserve_ai_run(
    (SELECT value::UUID FROM ai_runtime_test_state WHERE key = 'owner_id'),
    'rewrite', 'deepseek', 'deepseek-v4-flash', 'v1',
    'wrong-version', repeat('1', 64), 'public', FALSE, 5, NULL
  )->>'run_id');

INSERT INTO ai_runtime_test_state (key, value)
SELECT
  'provider_consent_block_id',
  (public.reserve_ai_run(
    (SELECT value::UUID FROM ai_runtime_test_state WHERE key = 'owner_id'),
    'rewrite', 'deepseek', 'deepseek-v4-pro', 'v1',
    'deepseek-cny-2026-07-17', repeat('2', 64), 'public', FALSE, 5, NULL
  )->>'run_id');
RESET ROLE;

DO $$
BEGIN
  IF (SELECT value FROM ai_runtime_test_state WHERE key = 'success_finalize') <> 'true' THEN
    RAISE EXCEPTION 'finalize rate/usage/success assertions failed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ai_runs
    WHERE id = (SELECT value::UUID FROM ai_runtime_test_state WHERE key = 'running_run_id')
      AND status = 'succeeded'
      AND cost_basis = 'actual'
      AND input_tokens = 10
      AND output_tokens = 2
      AND cache_hit_tokens = 3
      AND cache_miss_tokens = 7
  ) THEN
    RAISE EXCEPTION 'successful actual finalize metadata is incorrect';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ai_runs
    WHERE id = (SELECT value::UUID FROM ai_runtime_test_state WHERE key = 'private_null_block_id')
      AND status = 'blocked'
      AND error_code = 'provider_private_content_not_allowed'
  ) THEN
    RAISE EXCEPTION 'NULL provider privacy capability bypassed private block';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ai_runs
    WHERE id = (SELECT value::UUID FROM ai_runtime_test_state WHERE key = 'rate_mismatch_block_id')
      AND status = 'blocked'
      AND error_code = 'rate_card_mismatch'
  ) THEN
    RAISE EXCEPTION 'rate-card mismatch was not blocked';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ai_runs
    WHERE id = (SELECT value::UUID FROM ai_runtime_test_state WHERE key = 'provider_consent_block_id')
      AND status = 'blocked'
      AND error_code = 'provider_consent_required'
  ) THEN
    RAISE EXCEPTION 'provider/model preference mismatch was not blocked';
  END IF;
END;
$$;

UPDATE public.ai_runs
SET reservation_expires_at = clock_timestamp() - INTERVAL '1 second'
WHERE id = (SELECT value::UUID FROM ai_runtime_test_state WHERE key = 'lease_run_id');

SET LOCAL ROLE service_role;
SELECT public.reserve_ai_run(
  (SELECT value::UUID FROM ai_runtime_test_state WHERE key = 'owner_id'),
  'rewrite', 'deepseek', 'deepseek-v4-flash', 'v1',
  'deepseek-cny-2026-07-17', repeat('d', 64), 'public', FALSE, 5, NULL
);
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.ai_runs
    WHERE id = (SELECT value::UUID FROM ai_runtime_test_state WHERE key = 'lease_run_id')
      AND status = 'failed'
      AND error_code = 'reservation_expired'
      AND cost_basis = 'reserved'
      AND cost_cents = 5
      AND reserved_cost_cents = 0
  ) THEN
    RAISE EXCEPTION 'expired lease was not conservatively finalized';
  END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT value FROM ai_runtime_test_state WHERE key = 'owner_id'),
  TRUE
);
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.ai_runtime_config;
    RAISE EXCEPTION 'authenticated browser unexpectedly read ai_runtime_config';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.ai_runs
    WHERE id = (SELECT value::UUID FROM ai_runtime_test_state WHERE key = 'blocked_run_id')
  ) THEN
    RAISE EXCEPTION 'owner cannot read own AI audit';
  END IF;
  IF (
    SELECT COUNT(*)::TEXT
    FROM public.document_publications
    WHERE owner_id = (SELECT value::UUID FROM ai_runtime_test_state WHERE key = 'owner_id')
  ) <> (SELECT value FROM ai_runtime_test_state WHERE key = 'owner_publication_count') THEN
    RAISE EXCEPTION 'owner cannot read the expected publication snapshots';
  END IF;
END;
$$;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT value FROM ai_runtime_test_state WHERE key = 'other_id'),
  TRUE
);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.ai_runs
    WHERE owner_id = (SELECT value::UUID FROM ai_runtime_test_state WHERE key = 'owner_id')
  ) THEN
    RAISE EXCEPTION 'other user can read owner AI audit';
  END IF;
END;
$$;
RESET ROLE;

SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.ai_runtime_config;
    RAISE EXCEPTION 'anonymous browser unexpectedly read ai_runtime_config';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    PERFORM * FROM public.ai_runs;
    RAISE EXCEPTION 'anonymous browser unexpectedly read ai_runs';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;
RESET ROLE;

ROLLBACK;
