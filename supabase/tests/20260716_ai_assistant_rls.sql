-- wouldkeep AI assistant owner-isolation verification
-- Run in Supabase SQL Editor as postgres after the foundation migration.
-- Every mutation is wrapped in a transaction and rolled back.

BEGIN;

CREATE TEMP TABLE ai_rls_test_results (
  test_name TEXT PRIMARY KEY,
  passed BOOLEAN NOT NULL,
  detail TEXT NOT NULL
) ON COMMIT DROP;

GRANT SELECT, INSERT ON ai_rls_test_results TO authenticated;

SELECT set_config(
  'app.ai_rls_owner',
  (
    SELECT p.id::TEXT
    FROM public.profiles p
    WHERE public.is_site_owner(p.id)
    ORDER BY p.created_at
    LIMIT 1
  ),
  TRUE
);

SELECT set_config(
  'app.ai_rls_other',
  (
    SELECT p.id::TEXT
    FROM public.profiles p
    WHERE NOT public.is_site_owner(p.id)
    ORDER BY p.created_at
    LIMIT 1
  ),
  TRUE
);

DO $$
BEGIN
  IF current_setting('app.ai_rls_owner', TRUE) IS NULL THEN
    RAISE EXCEPTION 'RLS test requires one site-owner profile';
  END IF;

  IF current_setting('app.ai_rls_other', TRUE) IS NULL THEN
    RAISE EXCEPTION 'RLS test requires one non-owner profile';
  END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT set_config(
  'request.jwt.claim.sub',
  current_setting('app.ai_rls_owner', TRUE),
  TRUE
);

INSERT INTO public.ai_preferences (
  owner_id,
  enabled,
  allow_private_content,
  monthly_budget_cents,
  grounding_mode,
  provider,
  model
)
VALUES (
  current_setting('app.ai_rls_owner', TRUE)::UUID,
  FALSE,
  FALSE,
  0,
  'selected_only',
  'openai',
  'unconfigured'
)
ON CONFLICT (owner_id) DO UPDATE
SET
  enabled = EXCLUDED.enabled,
  allow_private_content = EXCLUDED.allow_private_content,
  monthly_budget_cents = EXCLUDED.monthly_budget_cents,
  grounding_mode = EXCLUDED.grounding_mode,
  provider = EXCLUDED.provider,
  model = EXCLUDED.model;

INSERT INTO ai_rls_test_results (test_name, passed, detail)
SELECT
  'owner_can_manage_preferences',
  COUNT(*) = 1,
  'The signed-in owner can create and read exactly one preference row.'
FROM public.ai_preferences
WHERE owner_id = current_setting('app.ai_rls_owner', TRUE)::UUID;

SELECT set_config(
  'request.jwt.claim.sub',
  current_setting('app.ai_rls_other', TRUE),
  TRUE
);

INSERT INTO ai_rls_test_results (test_name, passed, detail)
SELECT
  'other_user_cannot_read_owner_preferences',
  COUNT(*) = 0,
  'A different authenticated user cannot see the owner preference row.'
FROM public.ai_preferences
WHERE owner_id = current_setting('app.ai_rls_owner', TRUE)::UUID;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.ai_preferences (
      owner_id,
      enabled,
      allow_private_content,
      monthly_budget_cents,
      grounding_mode,
      provider,
      model
    )
    VALUES (
      current_setting('app.ai_rls_owner', TRUE)::UUID,
      FALSE,
      FALSE,
      0,
      'selected_only',
      'openai',
      'unconfigured'
    );

    INSERT INTO ai_rls_test_results VALUES (
      'other_user_cannot_write_owner_preferences',
      FALSE,
      'Unexpectedly inserted another owner''s preference row.'
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      INSERT INTO ai_rls_test_results VALUES (
        'other_user_cannot_write_owner_preferences',
        TRUE,
        'Cross-account preference writes are rejected by RLS.'
      );
    WHEN unique_violation THEN
      -- An existing row must not be mistaken for an RLS pass. Try an update too.
      BEGIN
        UPDATE public.ai_preferences
        SET monthly_budget_cents = 1
        WHERE owner_id = current_setting('app.ai_rls_owner', TRUE)::UUID;

        IF FOUND THEN
          INSERT INTO ai_rls_test_results VALUES (
            'other_user_cannot_write_owner_preferences',
            FALSE,
            'Unexpectedly updated another owner''s preference row.'
          );
        ELSE
          INSERT INTO ai_rls_test_results VALUES (
            'other_user_cannot_write_owner_preferences',
            TRUE,
            'Cross-account preference updates affect zero rows.'
          );
        END IF;
      END;
  END;
END;
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.ai_runs (
      owner_id,
      capability,
      provider,
      model,
      input_hash,
      status
    )
    VALUES (
      current_setting('app.ai_rls_other', TRUE)::UUID,
      'rls_test',
      'mock',
      'unconfigured',
      repeat('0', 64),
      'blocked'
    );

    INSERT INTO ai_rls_test_results VALUES (
      'browser_cannot_write_ai_audit_rows',
      FALSE,
      'Unexpectedly inserted an AI audit row as an authenticated browser user.'
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      INSERT INTO ai_rls_test_results VALUES (
        'browser_cannot_write_ai_audit_rows',
        TRUE,
        'Authenticated browser users have read-only access to AI audit rows.'
      );
  END;
END;
$$;

RESET ROLE;

SELECT test_name, passed, detail
FROM ai_rls_test_results
ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM ai_rls_test_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'One or more AI RLS assertions failed';
  END IF;
END;
$$;

ROLLBACK;
