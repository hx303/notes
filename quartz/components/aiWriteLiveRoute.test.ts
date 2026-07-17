import assert from "node:assert/strict"
import test from "node:test"
import {
  createAiWriteHandler,
  createAiWriteRuntimeFromEnv,
} from "../../supabase/functions/ai-write/handler"
import { DEEPSEEK_CNY_RATE_CARD_VERSION } from "../../supabase/functions/_shared/deepseek-rate-card"

const OWNER_ID = "11111111-1111-4111-8111-111111111111"
const DOCUMENT_ID = "22222222-2222-4222-8222-222222222222"
const RUN_ID = "33333333-3333-4333-8333-333333333333"

const liveEnv = (overrides: Record<string, string> = {}) => {
  const values: Record<string, string> = {
    AI_LIVE_ENABLED: "true",
    AI_PROVIDER: "deepseek",
    AI_MODEL: "deepseek-v4-flash",
    AI_RATE_CARD_VERSION: DEEPSEEK_CNY_RATE_CARD_VERSION,
    AI_MAX_TOKENS: "256",
    AI_PROVIDER_TIMEOUT_MS: "5000",
    AI_INPUT_HMAC_KEY: "test-only-input-hmac-secret-with-more-than-32-bytes",
    DEEPSEEK_API_KEY: "test-deepseek-key",
    SUPABASE_URL: "https://project-ref.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    SUPABASE_SECRET_KEY: "sb_secret_test",
    ...overrides,
  }
  return (name: string) => values[name]
}

const request = (body: Record<string, unknown>) =>
  new Request("https://project-ref.supabase.co/functions/v1/ai-write", {
    method: "POST",
    headers: {
      authorization: "Bearer user.jwt.token",
      "content-type": "application/json",
      origin: "https://wouldkeep.com",
    },
    body: JSON.stringify(body),
  })

const rewriteBody = (overrides: Record<string, unknown> = {}) => ({
  action: "rewrite",
  selection: "PRIVATE CALLER FREE INPUT",
  context: "PRIVATE CALLER CONTEXT",
  document_id: DOCUMENT_ID,
  base_version: 7,
  ...overrides,
})

test("ai-write remains mock-only by default and never touches fetch", async () => {
  let fetchCalls = 0
  const runtime = createAiWriteRuntimeFromEnv(
    () => undefined,
    async () => {
      fetchCalls += 1
      throw new Error("unexpected fetch")
    },
  )
  const response = await createAiWriteHandler({
    ...runtime,
    randomUUID: () => RUN_ID,
  })(request(rewriteBody()))
  const payload = (await response.json()) as Record<string, unknown>

  assert.equal(response.status, 200)
  assert.equal(payload.mock, true)
  assert.equal(payload.preview, "PRIVATE CALLER FREE INPUT")
  assert.equal(fetchCalls, 0)
})

test("live rewrite uses only the verified owner public snapshot through all guarded boundaries", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    if (url.endsWith("/auth/v1/user")) return Response.json({ id: OWNER_ID })
    if (url.includes("/rest/v1/document_publications")) {
      return Response.json([
        {
          document_id: DOCUMENT_ID,
          owner_id: OWNER_ID,
          audience: "public",
          snapshot: {
            title: "Published title",
            body: "Verified public Markdown body.",
            private_field: "must not be used",
          },
        },
      ])
    }
    if (url.endsWith("/rest/v1/rpc/reserve_ai_run")) {
      return Response.json({ allowed: true, run_id: RUN_ID, error_code: null })
    }
    if (url === "https://api.deepseek.com/chat/completions") {
      return Response.json({
        id: "provider-response",
        model: "deepseek-v4-flash",
        choices: [{ message: { content: "Rewritten public Markdown." }, finish_reason: "stop" }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 2,
          total_tokens: 12,
          prompt_cache_hit_tokens: 0,
          prompt_cache_miss_tokens: 10,
        },
      })
    }
    if (url.endsWith("/rest/v1/rpc/finalize_ai_run")) {
      return Response.json({ finalized: true })
    }
    throw new Error(`unexpected URL: ${url}`)
  }
  const runtime = createAiWriteRuntimeFromEnv(liveEnv(), fetch)
  const response = await createAiWriteHandler(runtime)(request(rewriteBody()))
  const payload = (await response.json()) as Record<string, unknown>

  assert.equal(response.status, 200)
  assert.equal(payload.mock, false)
  assert.equal(payload.suggestion, "Rewritten public Markdown.")
  assert.equal(payload.model, "deepseek-v4-flash")
  assert.deepEqual(
    calls.map((call) => call.url.replace(/\?.*$/u, "")),
    [
      "https://project-ref.supabase.co/auth/v1/user",
      "https://project-ref.supabase.co/rest/v1/document_publications",
      "https://project-ref.supabase.co/rest/v1/rpc/reserve_ai_run",
      "https://api.deepseek.com/chat/completions",
      "https://project-ref.supabase.co/rest/v1/rpc/finalize_ai_run",
    ],
  )

  const providerCall = calls[3]
  const providerBody = JSON.parse(String(providerCall?.init?.body)) as {
    messages: Array<{ content: string }>
    max_tokens: number
  }
  const serializedPrompt = JSON.stringify(providerBody.messages)
  assert.match(serializedPrompt, /Published title/u)
  assert.match(serializedPrompt, /Verified public Markdown body/u)
  assert.doesNotMatch(serializedPrompt, /PRIVATE CALLER|must not be used/u)
  assert.equal(providerBody.max_tokens, 256)
  assert.equal(providerCall?.init?.redirect, "error")
  assert.deepEqual(
    (providerCall?.init?.headers as Record<string, string>).Authorization,
    "Bearer test-deepseek-key",
  )

  const reserveBody = JSON.parse(String(calls[2]?.init?.body)) as Record<string, unknown>
  assert.equal(reserveBody.p_capability, "rewrite_publication")
  assert.equal(reserveBody.p_rate_card_version, DEEPSEEK_CNY_RATE_CARD_VERSION)
  assert.equal(reserveBody.p_content_scope, "public")
  assert.equal("prompt" in reserveBody, false)
  assert.equal("output" in JSON.parse(String(calls[4]?.init?.body)), false)
  assert.doesNotMatch(JSON.stringify(payload), /test-deepseek-key|sb_secret_test|PRIVATE CALLER/u)
})

test("live mode rejects free input and unpublished documents before DeepSeek", async () => {
  let providerCalls = 0
  const fetch = async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url === "https://api.deepseek.com/chat/completions") providerCalls += 1
    if (url.endsWith("/auth/v1/user")) return Response.json({ id: OWNER_ID })
    if (url.includes("/rest/v1/document_publications")) return Response.json([])
    throw new Error(`unexpected URL: ${url}`)
  }
  const handler = createAiWriteHandler(createAiWriteRuntimeFromEnv(liveEnv(), fetch))

  const freeInput = await handler(request(rewriteBody({ document_id: null })))
  assert.equal(freeInput.status, 403)
  assert.deepEqual(await freeInput.json(), { error: "public_snapshot_required" })

  const unpublished = await handler(request(rewriteBody()))
  assert.equal(unpublished.status, 403)
  assert.deepEqual(await unpublished.json(), { error: "public_snapshot_required" })
  assert.equal(providerCalls, 0)
})

test("live configuration and authoritative database blocks fail closed with stable errors", async () => {
  let fetchCalls = 0
  const invalidRuntime = createAiWriteRuntimeFromEnv(
    liveEnv({ AI_RATE_CARD_VERSION: "stale-price-card" }),
    async () => {
      fetchCalls += 1
      throw new Error("unexpected fetch")
    },
  )
  const invalidResponse = await createAiWriteHandler(invalidRuntime)(request(rewriteBody()))
  assert.equal(invalidResponse.status, 503)
  assert.deepEqual(await invalidResponse.json(), { error: "ai_live_configuration_invalid" })
  assert.equal(fetchCalls, 0)

  const newlineRuntime = createAiWriteRuntimeFromEnv(
    liveEnv({ SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test\r\ninjected" }),
    async () => {
      fetchCalls += 1
      throw new Error("unexpected fetch")
    },
  )
  const newlineResponse = await createAiWriteHandler(newlineRuntime)(request(rewriteBody()))
  assert.equal(newlineResponse.status, 503)
  assert.deepEqual(await newlineResponse.json(), { error: "ai_live_configuration_invalid" })
  assert.equal(fetchCalls, 0)

  const blockedFetch = async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith("/auth/v1/user")) return Response.json({ id: OWNER_ID })
    if (url.includes("/rest/v1/document_publications")) {
      return Response.json([
        {
          document_id: DOCUMENT_ID,
          owner_id: OWNER_ID,
          audience: "public",
          snapshot: { title: "Published", body: "Public body" },
        },
      ])
    }
    if (url.endsWith("/rest/v1/rpc/reserve_ai_run")) {
      return Response.json({ allowed: false, run_id: RUN_ID, error_code: "site_ai_disabled" })
    }
    throw new Error(`unexpected URL: ${url}`)
  }
  const blockedResponse = await createAiWriteHandler(
    createAiWriteRuntimeFromEnv(liveEnv(), blockedFetch),
  )(request(rewriteBody()))
  assert.equal(blockedResponse.status, 409)
  assert.deepEqual(await blockedResponse.json(), {
    error: "ai_request_blocked",
    reason: "site_ai_disabled",
    run_id: RUN_ID,
  })
})

test("unexpected live failures never expose raw errors, prompts, or credentials", async () => {
  const response = await createAiWriteHandler({
    liveGenerator: {
      generateText: async () => {
        throw new Error("test-deepseek-key PRIVATE CALLER FREE INPUT upstream detail")
      },
    },
  })(request(rewriteBody()))
  const payload = await response.json()
  assert.equal(response.status, 503)
  assert.deepEqual(payload, { error: "ai_unavailable" })
  assert.doesNotMatch(JSON.stringify(payload), /test-deepseek-key|PRIVATE CALLER|upstream detail/u)
})

test("non-rewrite actions retain the accepted no-cost mock behavior when live is configured", async () => {
  let fetchCalls = 0
  const runtime = createAiWriteRuntimeFromEnv(liveEnv(), async () => {
    fetchCalls += 1
    throw new Error("unexpected fetch")
  })
  const response = await createAiWriteHandler({
    ...runtime,
    randomUUID: () => RUN_ID,
  })(request(rewriteBody({ action: "summarize", document_id: null })))
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(response.status, 200)
  assert.equal(payload.mock, true)
  assert.equal(fetchCalls, 0)
})
