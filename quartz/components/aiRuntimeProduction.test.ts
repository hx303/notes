import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import type {
  AiProviderRequest,
  AiProviderResult,
} from "../../supabase/functions/_shared/ai-provider"
import { WebCryptoHmacAiInputHasher } from "../../supabase/functions/_shared/ai-request-hmac"
import {
  calculateDeepSeekCostCents,
  createDeepSeekCnyRateCard,
  DEEPSEEK_CNY_RATE_CARD_VERSION,
  estimateDeepSeekCostCents,
} from "../../supabase/functions/_shared/deepseek-rate-card"
import {
  SupabaseAiQuotaAuditBoundary,
  SupabaseAiRuntimeContextAuthority,
  SupabaseAiRuntimeError,
} from "../../supabase/functions/_shared/supabase-ai-runtime"

const OWNER_ID = "11111111-1111-4111-8111-111111111111"
const DOCUMENT_ID = "22222222-2222-4222-8222-222222222222"

const providerResult = (
  usage: AiProviderResult["usage"],
  model: AiProviderResult["model"] = "deepseek-v4-flash",
): AiProviderResult => ({
  id: "response-1",
  text: "result",
  model,
  finishReason: "stop",
  usage,
})

test("DeepSeek CNY rate card rounds up in integer fen and rejects inconsistent usage", () => {
  assert.equal(DEEPSEEK_CNY_RATE_CARD_VERSION, "deepseek-cny-2026-07-17")
  assert.equal(
    calculateDeepSeekCostCents(
      "deepseek-v4-flash",
      providerResult({
        promptTokens: 1_000_000,
        completionTokens: 1_000_000,
        totalTokens: 2_000_000,
        cacheHitTokens: 0,
        cacheMissTokens: 1_000_000,
      }),
    ),
    300,
  )
  assert.equal(
    calculateDeepSeekCostCents(
      "deepseek-v4-pro",
      providerResult(
        {
          promptTokens: 1_000_000,
          completionTokens: 1_000_000,
          totalTokens: 2_000_000,
          cacheHitTokens: 1_000_000,
          cacheMissTokens: 0,
        },
        "deepseek-v4-pro",
      ),
    ),
    603,
  )
  assert.equal(
    calculateDeepSeekCostCents(
      "deepseek-v4-flash",
      providerResult({
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
        cacheHitTokens: 1,
        cacheMissTokens: 0,
      }),
    ),
    1,
  )
  assert.throws(() =>
    calculateDeepSeekCostCents(
      "deepseek-v4-flash",
      providerResult({
        promptTokens: 10,
        completionTokens: 2,
        totalTokens: 12,
        cacheHitTokens: 2,
        cacheMissTokens: 7,
      }),
    ),
  )
  assert.throws(() =>
    calculateDeepSeekCostCents(
      "deepseek-v4-flash",
      providerResult(
        {
          promptTokens: 10,
          completionTokens: 2,
          totalTokens: 12,
          cacheHitTokens: 2,
          cacheMissTokens: 8,
        },
        "deepseek-v4-pro",
      ),
    ),
  )
})

test("DeepSeek reservation uses UTF-8 upper bound, all-cache-miss pricing, and maxTokens", () => {
  const request: AiProviderRequest = {
    messages: [{ role: "user", content: "公开快照" }],
    maxTokens: 2048,
  }
  const flash = estimateDeepSeekCostCents({ model: "deepseek-v4-flash", providerRequest: request })
  const pro = estimateDeepSeekCostCents({ model: "deepseek-v4-pro", providerRequest: request })
  assert.ok(flash >= 1)
  assert.ok(pro > flash)
  assert.throws(() =>
    estimateDeepSeekCostCents({
      model: "deepseek-v4-flash",
      providerRequest: { messages: request.messages },
    }),
  )
})

test("DeepSeek reservation covers full wire JSON and per-message framing", () => {
  const messages = Array.from({ length: 8 }, (_, index) => ({
    role: "user" as const,
    content: `${index}:${"x".repeat(1_035)}`,
  }))
  const request: AiProviderRequest = { messages, maxTokens: 1, temperature: 0 }
  const wireBody = {
    model: "deepseek-v4-flash",
    messages,
    stream: false,
    thinking: { type: "disabled" },
    max_tokens: 1,
    temperature: 0,
  }
  const wireBytes = new TextEncoder().encode(JSON.stringify(wireBody)).byteLength
  const conservativePromptUnits = wireBytes + 1_024 + 64 * messages.length
  const expectedFen = Math.ceil((conservativePromptUnits * 1_000 + 2_000) / 10_000_000)
  assert.equal(
    estimateDeepSeekCostCents({ model: "deepseek-v4-flash", providerRequest: request }),
    expectedFen,
  )
  assert.equal(createDeepSeekCnyRateCard("deepseek-v4-flash").model, "deepseek-v4-flash")
})

test("HMAC input hashes are deterministic, owner-scoped, control-sensitive, and secret-free", async () => {
  const secret = "server-only-hmac-secret-with-more-than-32-bytes"
  const hasher = new WebCryptoHmacAiInputHasher(secret)
  const request: AiProviderRequest = {
    messages: [{ role: "user", content: "snapshot" }],
    maxTokens: 10,
  }
  const first = await hasher.hash(OWNER_ID, request)
  assert.equal(first, await hasher.hash(OWNER_ID, request))
  assert.notEqual(first, await hasher.hash("33333333-3333-4333-8333-333333333333", request))
  assert.notEqual(first, await hasher.hash(OWNER_ID, { ...request, maxTokens: 11 }))
  assert.match(first, /^[a-f0-9]{64}$/u)
  assert.doesNotMatch(first, new RegExp(secret))
  assert.doesNotMatch(JSON.stringify(hasher), new RegExp(secret))
})

test("Supabase authority verifies JWT then builds only from owner public snapshot", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const authority = new SupabaseAiRuntimeContextAuthority({
    supabaseUrl: "https://project-ref.supabase.co",
    publishableKey: "sb_publishable_test",
    maxTokens: 512,
    promptBuilder: (snapshot) => [
      { role: "system", content: "Use only this publication snapshot." },
      { role: "user", content: String(snapshot.body) },
    ],
    fetch: async (input, init) => {
      calls.push({ url: String(input), init })
      if (calls.length === 1) return Response.json({ id: OWNER_ID })
      return Response.json([
        {
          document_id: DOCUMENT_ID,
          owner_id: OWNER_ID,
          audience: "public",
          snapshot: { title: "Public", body: "Verified public body" },
        },
      ])
    },
  })

  const context = await authority.resolve({
    authorization: "Bearer user.jwt.token",
    documentId: DOCUMENT_ID,
  })
  assert.equal(context.ownerId, OWNER_ID)
  assert.equal(context.contentScope, "public")
  assert.equal(context.publicSource, "publication_snapshot")
  assert.equal(context.providerRequest.maxTokens, 512)
  assert.equal(calls[0]?.url, "https://project-ref.supabase.co/auth/v1/user")
  assert.deepEqual(calls[0]?.init?.headers, {
    apikey: "sb_publishable_test",
    Authorization: "Bearer user.jwt.token",
  })
  assert.equal(calls[0]?.init?.redirect, "error")
  assert.match(calls[1]?.url ?? "", /document_id=eq\.22222222-2222-4222-8222-222222222222/u)
  assert.match(calls[1]?.url ?? "", /owner_id=eq\.11111111-1111-4111-8111-111111111111/u)
  assert.match(calls[1]?.url ?? "", /audience=eq\.public/u)
  const adminHeaders = calls[1]?.init?.headers as Record<string, string>
  assert.equal(adminHeaders.apikey, "sb_publishable_test")
  assert.equal(adminHeaders.Authorization, "Bearer user.jwt.token")
  assert.equal(calls[1]?.init?.redirect, "error")
})

test("Supabase authority rejects free input, non-public/mismatched/oversized snapshots generically", async () => {
  const build = (rows: unknown) =>
    new SupabaseAiRuntimeContextAuthority({
      supabaseUrl: "https://project-ref.supabase.co",
      publishableKey: "publishable",
      maxTokens: 32,
      promptBuilder: () => [{ role: "user", content: "fixed" }],
      fetch: async (input) =>
        String(input).endsWith("/auth/v1/user")
          ? Response.json({ id: OWNER_ID })
          : Response.json(rows),
    })

  await assert.rejects(
    build([]).resolve({ authorization: "Bearer user.jwt.token", documentId: null }),
    SupabaseAiRuntimeError,
  )
  for (const row of [
    { document_id: DOCUMENT_ID, owner_id: OWNER_ID, audience: "unlisted", snapshot: {} },
    {
      document_id: DOCUMENT_ID,
      owner_id: "33333333-3333-4333-8333-333333333333",
      audience: "public",
      snapshot: {},
    },
    {
      document_id: DOCUMENT_ID,
      owner_id: OWNER_ID,
      audience: "public",
      snapshot: { body: "x".repeat(70_000) },
    },
  ]) {
    await assert.rejects(
      build([row]).resolve({ authorization: "Bearer user.jwt.token", documentId: DOCUMENT_ID }),
      (error: unknown) => {
        assert.ok(error instanceof SupabaseAiRuntimeError)
        assert.doesNotMatch(error.message, /unlisted|33333333|xxxx/u)
        return true
      },
    )
  }
  assert.throws(
    () =>
      new SupabaseAiRuntimeContextAuthority({
        supabaseUrl: "https://evil.example.com",
        publishableKey: "publishable",
        maxTokens: 32,
        promptBuilder: () => [],
        fetch: async () => Response.json({}),
      }),
    /Supabase URL/,
  )
})

test("Supabase authority fails closed for anonymous and other-user publication access", async () => {
  let calls = 0
  const authority = new SupabaseAiRuntimeContextAuthority({
    supabaseUrl: "https://project-ref.supabase.co",
    publishableKey: "publishable",
    maxTokens: 32,
    promptBuilder: () => [{ role: "user", content: "fixed" }],
    fetch: async (input) => {
      calls += 1
      if (String(input).endsWith("/auth/v1/user")) {
        return Response.json({ id: "33333333-3333-4333-8333-333333333333" })
      }
      return Response.json([])
    },
  })
  await assert.rejects(
    authority.resolve({ authorization: "", documentId: DOCUMENT_ID }),
    SupabaseAiRuntimeError,
  )
  assert.equal(calls, 0)
  await assert.rejects(
    authority.resolve({ authorization: "Bearer other.user.jwt", documentId: DOCUMENT_ID }),
    SupabaseAiRuntimeError,
  )
  assert.equal(calls, 2)
})

test("Supabase quota boundary uses service-only RPC contract and strict response parsing", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const boundary = new SupabaseAiQuotaAuditBoundary({
    supabaseUrl: "https://project-ref.supabase.co",
    secretKey: "sb_secret_test",
    fetch: async (input, init) => {
      calls.push({ url: String(input), init })
      return calls.length === 1
        ? Response.json({ allowed: true, run_id: DOCUMENT_ID, error_code: null })
        : Response.json({ finalized: true })
    },
  })
  const decision = await boundary.reserve({
    ownerId: OWNER_ID,
    capability: "rewrite",
    provider: "deepseek",
    model: "deepseek-v4-flash",
    promptVersion: "v1",
    rateCardVersion: DEEPSEEK_CNY_RATE_CARD_VERSION,
    inputHash: "a".repeat(64),
    contentScope: "public",
    providerAllowsPrivateContent: false,
    estimatedCostCents: 2,
  })
  assert.deepEqual(decision, { allowed: true, runId: DOCUMENT_ID })
  assert.equal(
    await boundary.finalize({
      runId: DOCUMENT_ID,
      ownerId: OWNER_ID,
      status: "succeeded",
      inputTokens: 10,
      outputTokens: 2,
      cacheHitTokens: 2,
      cacheMissTokens: 8,
      costCents: 1,
      costBasis: "actual",
      rateCardVersion: DEEPSEEK_CNY_RATE_CARD_VERSION,
      latencyMs: 50,
      errorCode: null,
    }),
    true,
  )
  assert.equal(calls[0]?.url, "https://project-ref.supabase.co/rest/v1/rpc/reserve_ai_run")
  const headers = calls[0]?.init?.headers as Record<string, string>
  assert.equal(headers.apikey, "sb_secret_test")
  assert.equal("Authorization" in headers, false)
  assert.equal(calls[0]?.init?.redirect, "error")
  const reserveBody = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>
  assert.equal(reserveBody.p_rate_card_version, DEEPSEEK_CNY_RATE_CARD_VERSION)
  assert.equal("prompt" in reserveBody, false)
  assert.equal("content" in reserveBody, false)
  assert.equal(calls[1]?.init?.redirect, "error")
})

test("Supabase legacy service JWT is bearer-compatible and upstream errors never leak", async () => {
  const legacy = "header.payload.signature"
  let capturedHeaders: Record<string, string> = {}
  const boundary = new SupabaseAiQuotaAuditBoundary({
    supabaseUrl: "https://project-ref.supabase.co",
    secretKey: legacy,
    fetch: async (_input, init) => {
      capturedHeaders = init?.headers as Record<string, string>
      return Response.json({ secret: legacy, prompt: "PRIVATE" }, { status: 500 })
    },
  })
  await assert.rejects(
    boundary.reserve({
      ownerId: OWNER_ID,
      capability: "rewrite",
      provider: "deepseek",
      model: "deepseek-v4-flash",
      promptVersion: "v1",
      rateCardVersion: DEEPSEEK_CNY_RATE_CARD_VERSION,
      inputHash: "a".repeat(64),
      contentScope: "public",
      providerAllowsPrivateContent: false,
      estimatedCostCents: 2,
    }),
    (error: unknown) => {
      assert.ok(error instanceof SupabaseAiRuntimeError)
      assert.doesNotMatch(error.message, /PRIVATE|header\.payload/u)
      return true
    },
  )
  assert.equal(capturedHeaders.apikey, legacy)
  assert.equal(capturedHeaders.Authorization, `Bearer ${legacy}`)
})

test("A20 migration and verification script keep RPCs service-only and leased", () => {
  const migration = readFileSync(
    new URL("../../supabase/migrations/20260717_ai_runtime_safety.sql", import.meta.url),
    "utf8",
  )
  const verification = readFileSync(
    new URL("../../supabase/tests/20260717_ai_runtime_safety.sql", import.meta.url),
    "utf8",
  )
  assert.match(migration, /live_enabled BOOLEAN NOT NULL DEFAULT FALSE/u)
  assert.match(migration, /SECURITY DEFINER[\s\S]*SET search_path = ''/u)
  assert.match(migration, /FROM PUBLIC, anon, authenticated/u)
  assert.match(migration, /TO service_role/u)
  assert.match(migration, /p_provider_allows_private IS DISTINCT FROM TRUE/u)
  assert.match(migration, /p_content_scope IS NULL/u)
  assert.match(migration, /INTERVAL '2 minutes'/u)
  assert.match(migration, /reservation_expires_at IS NULL OR/u)
  assert.match(migration, /reservation_expired/u)
  assert.match(migration, /AT TIME ZONE 'UTC'/u)
  assert.match(migration, /FOR SHARE/u)
  assert.match(migration, /active_provider TEXT NOT NULL DEFAULT 'deepseek'/u)
  assert.match(migration, /allowed_models TEXT\[\] NOT NULL/u)
  assert.match(migration, /pg_catalog\.gen_random_uuid\(\)/u)
  assert.match(migration, /p_rate_card_version IS NULL/u)
  assert.match(migration, /IS DISTINCT FROM p_rate_card_version/u)
  assert.match(migration, /provider_consent_required/u)
  assert.match(migration, /p_cache_hit_tokens \+ p_cache_miss_tokens <> p_input_tokens/u)
  assert.doesNotMatch(migration, /p_(raw_prompt|prompt_text|content_text|output_text|raw_error)/u)
  assert.match(verification, /SET LOCAL ROLE service_role/u)
  assert.match(verification, /SET LOCAL ROLE authenticated/u)
  assert.match(verification, /SET LOCAL ROLE anon/u)
  assert.match(verification, /concurrent_request_limit_reached/u)
  assert.match(verification, /reservation_expired/u)
  assert.match(verification, /success_finalize/u)
  assert.match(verification, /missing_usage_finalize/u)
  assert.match(verification, /private_null_block_id/u)
  assert.match(verification, /rate_mismatch_block_id/u)
  assert.match(verification, /null_version_finalize/u)
  assert.match(verification, /provider_consent_block_id/u)
})
