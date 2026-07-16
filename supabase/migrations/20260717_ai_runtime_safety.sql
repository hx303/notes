-- wouldkeep A20 production runtime safety controls.
-- Forward-only: does not enable live AI, configure a key, or call a provider.

ALTER TABLE public.ai_preferences
  ADD COLUMN IF NOT EXISTS daily_request_limit INTEGER NOT NULL DEFAULT 20;
ALTER TABLE public.ai_preferences
  ADD COLUMN IF NOT EXISTS concurrent_request_limit INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.ai_preferences
  DROP CONSTRAINT IF EXISTS ai_preferences_daily_request_limit_check;
ALTER TABLE public.ai_preferences
  ADD CONSTRAINT ai_preferences_daily_request_limit_check
  CHECK (daily_request_limit BETWEEN 1 AND 1000);
ALTER TABLE public.ai_preferences
  DROP CONSTRAINT IF EXISTS ai_preferences_concurrent_request_limit_check;
ALTER TABLE public.ai_preferences
  ADD CONSTRAINT ai_preferences_concurrent_request_limit_check
  CHECK (concurrent_request_limit BETWEEN 1 AND 20);

ALTER TABLE public.ai_runs
  ADD COLUMN IF NOT EXISTS reserved_cost_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.ai_runs
  ADD COLUMN IF NOT EXISTS cache_hit_tokens INTEGER;
ALTER TABLE public.ai_runs
  ADD COLUMN IF NOT EXISTS cache_miss_tokens INTEGER;
ALTER TABLE public.ai_runs
  ADD COLUMN IF NOT EXISTS rate_card_version TEXT NOT NULL DEFAULT 'unconfigured';
ALTER TABLE public.ai_runs
  ADD COLUMN IF NOT EXISTS cost_basis TEXT NOT NULL DEFAULT 'none';
ALTER TABLE public.ai_runs
  ADD COLUMN IF NOT EXISTS reservation_expires_at TIMESTAMPTZ;

ALTER TABLE public.ai_runs
  DROP CONSTRAINT IF EXISTS ai_runs_reserved_cost_nonnegative;
ALTER TABLE public.ai_runs
  ADD CONSTRAINT ai_runs_reserved_cost_nonnegative CHECK (reserved_cost_cents >= 0);
ALTER TABLE public.ai_runs
  DROP CONSTRAINT IF EXISTS ai_runs_cache_hit_nonnegative;
ALTER TABLE public.ai_runs
  ADD CONSTRAINT ai_runs_cache_hit_nonnegative
  CHECK (cache_hit_tokens IS NULL OR cache_hit_tokens >= 0);
ALTER TABLE public.ai_runs
  DROP CONSTRAINT IF EXISTS ai_runs_cache_miss_nonnegative;
ALTER TABLE public.ai_runs
  ADD CONSTRAINT ai_runs_cache_miss_nonnegative
  CHECK (cache_miss_tokens IS NULL OR cache_miss_tokens >= 0);
ALTER TABLE public.ai_runs
  DROP CONSTRAINT IF EXISTS ai_runs_rate_card_version_check;
ALTER TABLE public.ai_runs
  ADD CONSTRAINT ai_runs_rate_card_version_check
  CHECK (char_length(btrim(rate_card_version)) BETWEEN 1 AND 80);
ALTER TABLE public.ai_runs
  DROP CONSTRAINT IF EXISTS ai_runs_cost_basis_check;
ALTER TABLE public.ai_runs
  ADD CONSTRAINT ai_runs_cost_basis_check
  CHECK (cost_basis IN ('actual', 'reserved', 'none'));

CREATE INDEX IF NOT EXISTS idx_ai_runs_running_lease
  ON public.ai_runs(owner_id, reservation_expires_at)
  WHERE status = 'running';

CREATE TABLE IF NOT EXISTS public.ai_runtime_config (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  live_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  hard_daily_request_limit INTEGER NOT NULL DEFAULT 20
    CHECK (hard_daily_request_limit BETWEEN 1 AND 1000),
  hard_concurrent_request_limit INTEGER NOT NULL DEFAULT 1
    CHECK (hard_concurrent_request_limit BETWEEN 1 AND 20),
  active_provider TEXT NOT NULL DEFAULT 'deepseek'
    CHECK (active_provider = 'deepseek'),
  allowed_models TEXT[] NOT NULL DEFAULT ARRAY['deepseek-v4-flash', 'deepseek-v4-pro']::TEXT[]
    CHECK (allowed_models <@ ARRAY['deepseek-v4-flash', 'deepseek-v4-pro']::TEXT[] AND
      cardinality(allowed_models) > 0),
  active_rate_card_version TEXT NOT NULL DEFAULT 'deepseek-cny-2026-07-17'
    CHECK (char_length(btrim(active_rate_card_version)) BETWEEN 1 AND 80),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.ai_runtime_config (singleton)
VALUES (TRUE)
ON CONFLICT (singleton) DO NOTHING;

ALTER TABLE public.ai_runtime_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_runtime_config FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public.ai_runtime_config TO service_role;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.ai_runs FROM authenticated;
GRANT SELECT ON TABLE public.ai_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.ai_runs TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_ai_run(
  p_owner_id UUID,
  p_capability TEXT,
  p_provider TEXT,
  p_model TEXT,
  p_prompt_version TEXT,
  p_rate_card_version TEXT,
  p_input_hash TEXT,
  p_content_scope TEXT,
  p_provider_allows_private BOOLEAN,
  p_estimated_cost_cents INTEGER,
  p_preflight_error_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_config public.ai_runtime_config%ROWTYPE;
  v_preference public.ai_preferences%ROWTYPE;
  v_has_config BOOLEAN := FALSE;
  v_has_preference BOOLEAN := FALSE;
  v_error_code TEXT := NULL;
  v_run_id UUID := pg_catalog.gen_random_uuid();
  v_daily_count INTEGER := 0;
  v_concurrent_count INTEGER := 0;
  v_monthly_cost BIGINT := 0;
  v_monthly_reserved BIGINT := 0;
  v_effective_daily INTEGER := 0;
  v_effective_concurrent INTEGER := 0;
  v_day_start TIMESTAMPTZ :=
    date_trunc('day', v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_month_start TIMESTAMPTZ :=
    date_trunc('month', v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_capability TEXT := 'invalid';
  v_provider TEXT := 'invalid';
  v_model TEXT := 'invalid';
  v_prompt_version TEXT := 'invalid';
  v_rate_card_version TEXT := 'invalid';
  v_input_hash TEXT := repeat('0', 64);
BEGIN
  IF p_owner_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid owner';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_owner_id::TEXT, 0));

  SELECT * INTO v_config
  FROM public.ai_runtime_config
  WHERE singleton = TRUE
  FOR SHARE;
  v_has_config := FOUND;

  SELECT * INTO v_preference
  FROM public.ai_preferences
  WHERE owner_id = p_owner_id
  FOR UPDATE;
  v_has_preference := FOUND;

  IF p_capability ~ '^[a-z0-9_-]{1,60}$' THEN v_capability := p_capability; END IF;
  IF p_provider ~ '^[a-z0-9_-]{1,40}$' THEN v_provider := p_provider; END IF;
  IF p_model ~ '^[A-Za-z0-9._-]{1,120}$' THEN v_model := p_model; END IF;
  IF p_prompt_version ~ '^[A-Za-z0-9._-]{1,40}$' THEN
    v_prompt_version := p_prompt_version;
  END IF;
  IF p_rate_card_version ~ '^[A-Za-z0-9._-]{1,80}$' THEN
    v_rate_card_version := p_rate_card_version;
  END IF;
  IF p_input_hash ~ '^[a-f0-9]{64}$' THEN v_input_hash := p_input_hash; END IF;

  UPDATE public.ai_runs
  SET
    status = 'failed',
    cost_cents = GREATEST(COALESCE(cost_cents, 0), reserved_cost_cents),
    cost_basis = 'reserved',
    reserved_cost_cents = 0,
    reservation_expires_at = NULL,
    error_code = 'reservation_expired',
    finished_at = v_now
  WHERE owner_id = p_owner_id
    AND status = 'running'
    AND (reservation_expires_at IS NULL OR reservation_expires_at <= v_now);

  IF v_capability = 'invalid' OR v_provider = 'invalid' OR v_model = 'invalid' OR
    v_prompt_version = 'invalid' OR v_rate_card_version = 'invalid' OR
    v_input_hash = repeat('0', 64) THEN
    v_error_code := 'invalid_runtime_policy';
  ELSIF p_preflight_error_code IS NOT NULL THEN
    v_error_code := CASE
      WHEN p_preflight_error_code = 'cost_estimation_failed' THEN p_preflight_error_code
      ELSE 'invalid_runtime_policy'
    END;
  ELSIF NOT v_has_config THEN
    v_error_code := 'invalid_runtime_policy';
  ELSIF NOT v_config.live_enabled THEN
    v_error_code := 'site_ai_disabled';
  ELSIF NOT v_has_preference OR NOT v_preference.enabled THEN
    v_error_code := 'user_ai_disabled';
  ELSIF v_rate_card_version <> v_config.active_rate_card_version THEN
    v_error_code := 'rate_card_mismatch';
  ELSIF v_provider <> v_config.active_provider OR NOT (v_model = ANY(v_config.allowed_models)) THEN
    v_error_code := 'invalid_runtime_policy';
  ELSIF v_preference.provider <> v_provider OR v_preference.model <> v_model THEN
    v_error_code := 'provider_consent_required';
  ELSIF p_content_scope IS NULL OR p_content_scope NOT IN ('public', 'private') THEN
    v_error_code := 'content_scope_unknown';
  ELSIF p_content_scope = 'private' AND p_provider_allows_private IS DISTINCT FROM TRUE THEN
    v_error_code := 'provider_private_content_not_allowed';
  ELSIF p_content_scope = 'private' AND NOT v_preference.allow_private_content THEN
    v_error_code := 'private_content_not_consented';
  ELSIF p_estimated_cost_cents IS NULL OR p_estimated_cost_cents <= 0 OR
    p_estimated_cost_cents > 1000000 THEN
    v_error_code := 'cost_estimation_failed';
  ELSIF v_preference.monthly_budget_cents <= 0 THEN
    v_error_code := 'monthly_budget_exhausted';
  ELSE
    v_effective_daily := LEAST(
      v_preference.daily_request_limit,
      v_config.hard_daily_request_limit
    );
    v_effective_concurrent := LEAST(
      v_preference.concurrent_request_limit,
      v_config.hard_concurrent_request_limit
    );

    SELECT COUNT(*)::INTEGER INTO v_daily_count
    FROM public.ai_runs
    WHERE owner_id = p_owner_id
      AND status <> 'blocked'
      AND created_at >= v_day_start;

    SELECT COUNT(*)::INTEGER INTO v_concurrent_count
    FROM public.ai_runs
    WHERE owner_id = p_owner_id
      AND status = 'running';

    SELECT COALESCE(SUM(cost_cents::BIGINT), 0) INTO v_monthly_cost
    FROM public.ai_runs
    WHERE owner_id = p_owner_id
      AND status IN ('succeeded', 'failed')
      AND created_at >= v_month_start;

    SELECT COALESCE(SUM(reserved_cost_cents::BIGINT), 0) INTO v_monthly_reserved
    FROM public.ai_runs
    WHERE owner_id = p_owner_id
      AND status = 'running';

    IF v_monthly_cost + v_monthly_reserved + p_estimated_cost_cents >
      v_preference.monthly_budget_cents THEN
      v_error_code := 'monthly_budget_exhausted';
    ELSIF v_daily_count >= v_effective_daily THEN
      v_error_code := 'daily_request_limit_reached';
    ELSIF v_concurrent_count >= v_effective_concurrent THEN
      v_error_code := 'concurrent_request_limit_reached';
    END IF;
  END IF;

  INSERT INTO public.ai_runs (
    id,
    owner_id,
    capability,
    provider,
    model,
    prompt_version,
    rate_card_version,
    input_hash,
    status,
    reserved_cost_cents,
    cost_cents,
    cost_basis,
    error_code,
    reservation_expires_at,
    finished_at
  ) VALUES (
    v_run_id,
    p_owner_id,
    v_capability,
    v_provider,
    v_model,
    v_prompt_version,
    v_rate_card_version,
    v_input_hash,
    CASE WHEN v_error_code IS NULL THEN 'running' ELSE 'blocked' END,
    CASE WHEN v_error_code IS NULL THEN p_estimated_cost_cents ELSE 0 END,
    CASE WHEN v_error_code IS NULL THEN NULL ELSE 0 END,
    'none',
    v_error_code,
    CASE WHEN v_error_code IS NULL THEN v_now + INTERVAL '2 minutes' ELSE NULL END,
    CASE WHEN v_error_code IS NULL THEN NULL ELSE v_now END
  );

  RETURN jsonb_build_object(
    'allowed', v_error_code IS NULL,
    'run_id', v_run_id,
    'error_code', v_error_code
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_ai_run(
  p_run_id UUID,
  p_owner_id UUID,
  p_status TEXT,
  p_input_tokens INTEGER,
  p_output_tokens INTEGER,
  p_cache_hit_tokens INTEGER,
  p_cache_miss_tokens INTEGER,
  p_cost_cents INTEGER,
  p_cost_basis TEXT,
  p_rate_card_version TEXT,
  p_latency_ms INTEGER,
  p_error_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_run public.ai_runs%ROWTYPE;
  v_error_code TEXT;
  v_final_cost INTEGER;
BEGIN
  IF p_run_id IS NULL OR p_owner_id IS NULL OR p_status IS NULL THEN
    RETURN jsonb_build_object('finalized', FALSE);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_owner_id::TEXT, 0));

  SELECT * INTO v_run
  FROM public.ai_runs
  WHERE id = p_run_id AND owner_id = p_owner_id
  FOR UPDATE;

  IF NOT FOUND OR p_status NOT IN ('succeeded', 'failed') THEN
    RETURN jsonb_build_object('finalized', FALSE);
  END IF;
  IF p_rate_card_version IS NULL OR
    v_run.rate_card_version IS DISTINCT FROM p_rate_card_version THEN
    RETURN jsonb_build_object('finalized', FALSE);
  END IF;
  IF v_run.status <> 'running' THEN
    RETURN jsonb_build_object('finalized', v_run.status = p_status);
  END IF;
  IF v_run.reservation_expires_at IS NULL OR v_run.reservation_expires_at <= v_now THEN
    UPDATE public.ai_runs
    SET
      status = 'failed',
      cost_cents = GREATEST(COALESCE(cost_cents, 0), reserved_cost_cents),
      cost_basis = 'reserved',
      reserved_cost_cents = 0,
      reservation_expires_at = NULL,
      error_code = 'reservation_expired',
      finished_at = v_now
    WHERE id = p_run_id;
    RETURN jsonb_build_object('finalized', FALSE);
  END IF;
  IF p_cost_basis NOT IN ('actual', 'reserved') OR
    (p_status = 'succeeded' AND p_cost_basis <> 'actual') OR
    p_cost_cents IS NULL OR p_cost_cents < 0 OR p_cost_cents > 1000000 OR
    p_latency_ms IS NULL OR p_latency_ms < 0 OR
    COALESCE(p_input_tokens, 0) < 0 OR
    COALESCE(p_output_tokens, 0) < 0 OR
    COALESCE(p_cache_hit_tokens, 0) < 0 OR
    COALESCE(p_cache_miss_tokens, 0) < 0 THEN
    RETURN jsonb_build_object('finalized', FALSE);
  END IF;
  IF p_cost_basis = 'actual' AND (
    p_input_tokens IS NULL OR p_output_tokens IS NULL OR
    p_cache_hit_tokens IS NULL OR p_cache_miss_tokens IS NULL OR
    p_cache_hit_tokens + p_cache_miss_tokens <> p_input_tokens
  ) THEN
    RETURN jsonb_build_object('finalized', FALSE);
  END IF;

  v_final_cost := CASE
    WHEN p_cost_basis = 'actual' THEN p_cost_cents
    ELSE GREATEST(p_cost_cents, v_run.reserved_cost_cents)
  END;
  v_error_code := CASE
    WHEN p_status = 'succeeded' THEN NULL
    WHEN p_error_code ~ '^[a-z0-9_]{1,80}$' THEN p_error_code
    ELSE 'provider_failure'
  END;

  UPDATE public.ai_runs
  SET
    status = p_status,
    input_tokens = p_input_tokens,
    output_tokens = p_output_tokens,
    cache_hit_tokens = p_cache_hit_tokens,
    cache_miss_tokens = p_cache_miss_tokens,
    cost_cents = v_final_cost,
    cost_basis = p_cost_basis,
    latency_ms = p_latency_ms,
    error_code = v_error_code,
    reserved_cost_cents = 0,
    reservation_expires_at = NULL,
    finished_at = v_now
  WHERE id = p_run_id;

  RETURN jsonb_build_object('finalized', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_ai_run(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, INTEGER, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_run(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, INTEGER, TEXT
) TO service_role;

REVOKE ALL ON FUNCTION public.finalize_ai_run(
  UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, TEXT, TEXT, INTEGER, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_ai_run(
  UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, TEXT, TEXT, INTEGER, TEXT
) TO service_role;

COMMENT ON TABLE public.ai_runtime_config IS
  'Service-only live AI flag, hard quota ceilings, and active rate-card version. Defaults off.';
COMMENT ON FUNCTION public.reserve_ai_run(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, INTEGER, TEXT
) IS 'Atomically blocks or leases one server-side AI run without storing prompt content.';
COMMENT ON FUNCTION public.finalize_ai_run(
  UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, TEXT, TEXT, INTEGER, TEXT
) IS 'Idempotently finalizes one leased AI run with bounded usage/cost/error metadata.';
