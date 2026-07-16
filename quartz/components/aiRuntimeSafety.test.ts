import assert from "node:assert/strict"
import test from "node:test"
import {
  AiProviderError,
  type AiProvider,
  type AiProviderCapabilities,
  type AiProviderIdentity,
  type AiProviderRequest,
  type AiProviderResult,
} from "../../supabase/functions/_shared/ai-provider"
import {
  AiRuntimeBlockedError,
  GuardedAiProvider,
  InMemoryAiQuotaAuditBoundary,
  type AiRuntimePolicy,
  type AiRateCard,
  type AiQuotaAuditBoundary,
  type AiFinalizeRequest,
  type AiRuntimeContextAuthority,
  type AiVerifiedRuntimeContext,
  type GuardedAiRequest,
} from "../../supabase/functions/_shared/ai-runtime-safety"
import { WebCryptoHmacAiInputHasher } from "../../supabase/functions/_shared/ai-request-hmac"

const OWNER_ID = "11111111-1111-4111-8111-111111111111"
const DOCUMENT_ID = "22222222-2222-4222-8222-222222222222"

const openPolicy = (): AiRuntimePolicy => ({
  siteLive: true,
  userEnabled: true,
  allowPrivateContent: false,
  monthlyBudgetCents: 100,
  dailyRequestLimit: 10,
  concurrentRequestLimit: 2,
})

const result = (text = "safe result"): AiProviderResult => ({
  id: "response-1",
  text,
  model: "deepseek-v4-flash",
  finishReason: "stop",
  usage: {
    promptTokens: 10,
    completionTokens: 5,
    totalTokens: 15,
    cacheHitTokens: 2,
    cacheMissTokens: 8,
  },
})

class FakeProvider implements AiProvider {
  readonly identity: AiProviderIdentity
  readonly capabilities: AiProviderCapabilities
  calls = 0
  private readonly generate: (request: AiProviderRequest) => Promise<AiProviderResult>

  constructor(
    generate: (request: AiProviderRequest) => Promise<AiProviderResult>,
    allowsPrivateContent = false,
    model = "deepseek-v4-flash",
  ) {
    this.generate = generate
    this.identity = Object.freeze({ provider: "deepseek", model })
    this.capabilities = {
      provider: "deepseek",
      supportsStreaming: false,
      supportsThinkingControl: true,
      supportsZeroRetention: false,
      allowsPrivateContent,
      retention: "provider_managed_or_unknown",
    }
  }

  async generateText(request: AiProviderRequest) {
    this.calls += 1
    return this.generate(request)
  }
}

const testRateCard = (
  calculateCostCents: (value: AiProviderResult) => number = () => 1,
  estimateCostCents: (request: AiProviderRequest) => number = () => 1,
  model = "deepseek-v4-flash",
): AiRateCard => ({
  provider: "deepseek",
  model,
  version: "deepseek-cny-2026-07-17",
  calculateCostCents,
  estimateCostCents,
})

const guardedRequest = (overrides: Partial<GuardedAiRequest> = {}): GuardedAiRequest => ({
  authorization: "Bearer verified-test-token",
  documentId: DOCUMENT_ID,
  ...overrides,
})

const verifiedContext = (
  overrides: Partial<AiVerifiedRuntimeContext> = {},
): AiVerifiedRuntimeContext => ({
  ownerId: OWNER_ID,
  contentScope: "public",
  publicSource: "publication_snapshot",
  providerRequest: { messages: [{ role: "user", content: "public snapshot input" }] },
  ...overrides,
})

const authorityFor = (
  resolve: () => AiVerifiedRuntimeContext = () => verifiedContext(),
): AiRuntimeContextAuthority => ({
  resolve: async () => resolve(),
})

const setup = (
  policy: AiRuntimePolicy,
  provider = new FakeProvider(async () => result()),
  calculateCostCents: (value: AiProviderResult) => number = () => 1,
  estimateCostCents: (request: AiProviderRequest) => number = () => 1,
  contextAuthority: AiRuntimeContextAuthority = authorityFor(),
) => {
  const boundary = new InMemoryAiQuotaAuditBoundary({ policyForOwner: () => policy })
  const guarded = new GuardedAiProvider({
    provider,
    rateCard: testRateCard(calculateCostCents, estimateCostCents),
    quotaAudit: boundary,
    contextAuthority,
    capability: "rewrite",
    promptVersion: "v1",
    inputHasher: new WebCryptoHmacAiInputHasher("test-hmac-secret-with-at-least-32-bytes"),
  })
  return { boundary, guarded, provider }
}

test("provider model and rate-card identity mismatch is rejected before invocation", () => {
  const provider = new FakeProvider(async () => result(), false, "deepseek-v4-pro")
  assert.throws(
    () =>
      new GuardedAiProvider({
        provider,
        rateCard: testRateCard(),
        quotaAudit: new InMemoryAiQuotaAuditBoundary({ policyForOwner: openPolicy }),
        contextAuthority: authorityFor(),
        capability: "rewrite",
        promptVersion: "v1",
        inputHasher: new WebCryptoHmacAiInputHasher("test-hmac-secret-with-at-least-32-bytes"),
      }),
    /identities do not match/u,
  )
  assert.equal(provider.calls, 0)
})

test("guard snapshots trusted provider identity before asynchronous work", async () => {
  const provider = new FakeProvider(async () => result())
  const { boundary, guarded } = setup(openPolicy(), provider)
  Object.defineProperty(provider, "identity", {
    value: { provider: "deepseek", model: "deepseek-v4-pro" },
  })
  await guarded.generateText(guardedRequest())
  assert.equal(provider.calls, 1)
  assert.equal(boundary.getAuditRecords()[0]?.model, "deepseek-v4-flash")
})

test("guard snapshots private-content capability before asynchronous work", async () => {
  const provider = new FakeProvider(async () => result())
  const authority = authorityFor(() =>
    verifiedContext({ contentScope: "private", publicSource: null }),
  )
  const { guarded } = setup(openPolicy(), provider, undefined, undefined, authority)
  Object.defineProperty(provider, "capabilities", {
    value: { ...provider.capabilities, allowsPrivateContent: true },
  })
  await assert.rejects(
    guarded.generateText(guardedRequest()),
    (error: unknown) =>
      error instanceof AiRuntimeBlockedError &&
      error.code === "provider_private_content_not_allowed",
  )
  assert.equal(provider.calls, 0)
})

test("guard rejects a response model that differs from its provider snapshot", async () => {
  const provider = new FakeProvider(async () => ({ ...result(), model: "deepseek-v4-pro" }))
  const { boundary, guarded } = setup(
    openPolicy(),
    provider,
    () => 1,
    () => 5,
  )
  await assert.rejects(
    guarded.generateText(guardedRequest()),
    (error: unknown) =>
      error instanceof Error &&
      error.name === "AiRuntimeAccountingError" &&
      (error as { code?: unknown }).code === "cost_calculation_failed",
  )
  assert.equal(provider.calls, 1)
  assert.equal(boundary.getAuditRecords()[0]?.costBasis, "reserved")
})

test("AI runtime is fail-closed when the site flag is off and budget is zero", async () => {
  const policy: AiRuntimePolicy = {
    siteLive: false,
    userEnabled: false,
    allowPrivateContent: false,
    monthlyBudgetCents: 0,
    dailyRequestLimit: 0,
    concurrentRequestLimit: 0,
  }
  const { boundary, guarded, provider } = setup(policy)

  await assert.rejects(guarded.generateText(guardedRequest()), (error: unknown) => {
    assert.ok(error instanceof AiRuntimeBlockedError)
    assert.equal(error.code, "site_ai_disabled")
    return true
  })
  assert.equal(provider.calls, 0)
  assert.equal(boundary.getAuditRecords()[0]?.status, "blocked")
})

test("authority failure or invalid verified identity is rejected without audit pollution", async () => {
  for (const authority of [
    authorityFor(() => {
      throw new Error("JWT verification failed")
    }),
    authorityFor(() => verifiedContext({ ownerId: "attacker-body-owner" })),
    authorityFor(() => verifiedContext({ contentScope: "unclassified" as "unknown" })),
    authorityFor(() => verifiedContext({ publicSource: null })),
  ]) {
    const { boundary, guarded, provider } = setup(
      openPolicy(),
      undefined,
      undefined,
      undefined,
      authority,
    )
    await assert.rejects(
      guarded.generateText(guardedRequest()),
      (error: unknown) => error instanceof Error && error.name === "AiRuntimeAuthorityError",
    )
    assert.equal(provider.calls, 0)
    assert.equal(boundary.getAuditRecords().length, 0)
  }
})

test("body-like owner and scope fields are ignored in favor of authority context", async () => {
  let authorityInput: GuardedAiRequest | null = null
  const authority: AiRuntimeContextAuthority = {
    resolve: async (request) => {
      authorityInput = request
      return verifiedContext({ contentScope: "private", publicSource: null })
    },
  }
  const { boundary, guarded, provider } = setup(
    openPolicy(),
    undefined,
    undefined,
    undefined,
    authority,
  )
  const pollutedRuntimeObject = {
    ...guardedRequest(),
    ownerId: "33333333-3333-4333-8333-333333333333",
    contentScope: "public",
  } as GuardedAiRequest

  await assert.rejects(
    guarded.generateText(pollutedRuntimeObject),
    (error: unknown) =>
      error instanceof AiRuntimeBlockedError &&
      error.code === "provider_private_content_not_allowed",
  )
  assert.equal(provider.calls, 0)
  assert.deepEqual(authorityInput, guardedRequest())
  assert.equal(boundary.getAuditRecords()[0]?.ownerId, OWNER_ID)
  assert.equal(boundary.getAuditRecords()[0]?.status, "blocked")
})

test("AI runtime independently enforces user opt-in and zero monthly budget", async () => {
  for (const [policy, code] of [
    [{ ...openPolicy(), userEnabled: false }, "user_ai_disabled"],
    [{ ...openPolicy(), monthlyBudgetCents: 0 }, "monthly_budget_exhausted"],
  ] as const) {
    const { guarded, provider } = setup(policy)
    await assert.rejects(
      guarded.generateText(guardedRequest()),
      (error: unknown) => error instanceof AiRuntimeBlockedError && error.code === code,
    )
    assert.equal(provider.calls, 0)
  }
})

test("malformed runtime policy values fail closed instead of bypassing quota checks", async () => {
  for (const policy of [
    { ...openPolicy(), monthlyBudgetCents: Number.NaN },
    { ...openPolicy(), dailyRequestLimit: 1.5 },
    { ...openPolicy(), concurrentRequestLimit: -1 },
  ]) {
    const { guarded, provider } = setup(policy)
    await assert.rejects(
      guarded.generateText(guardedRequest()),
      (error: unknown) =>
        error instanceof AiRuntimeBlockedError && error.code === "invalid_runtime_policy",
    )
    assert.equal(provider.calls, 0)
  }
})

test("policy lookup failure is audited fail-closed after authority verification", async () => {
  const provider = new FakeProvider(async () => result())
  const brokenBoundary = new InMemoryAiQuotaAuditBoundary({
    policyForOwner: () => {
      throw new Error("database unavailable")
    },
  })
  const brokenPolicyRoute = new GuardedAiProvider({
    provider,
    rateCard: testRateCard(),
    quotaAudit: brokenBoundary,
    contextAuthority: authorityFor(),
    capability: "rewrite",
    promptVersion: "v1",
    inputHasher: new WebCryptoHmacAiInputHasher("test-hmac-secret-with-at-least-32-bytes"),
  })
  await assert.rejects(
    brokenPolicyRoute.generateText(guardedRequest()),
    (error: unknown) =>
      error instanceof AiRuntimeBlockedError && error.code === "invalid_runtime_policy",
  )
  assert.equal(provider.calls, 0)
  assert.equal(brokenBoundary.getAuditRecords()[0]?.status, "blocked")
})

test("DeepSeek route rejects private and unknown scope before provider execution", async () => {
  let resolvedScope: "private" | "unknown" = "private"
  const authority = authorityFor(() =>
    verifiedContext({ contentScope: resolvedScope, publicSource: null }),
  )
  const { boundary, guarded, provider } = setup(
    openPolicy(),
    undefined,
    undefined,
    undefined,
    authority,
  )
  for (const [contentScope, code] of [
    ["private", "provider_private_content_not_allowed"],
    ["unknown", "content_scope_unknown"],
  ] as const) {
    resolvedScope = contentScope
    await assert.rejects(
      guarded.generateText(guardedRequest()),
      (error: unknown) => error instanceof AiRuntimeBlockedError && error.code === code,
    )
  }
  assert.equal(provider.calls, 0)
  assert.deepEqual(
    boundary.getAuditRecords().map((record) => [record.status, record.errorCode]),
    [
      ["blocked", "provider_private_content_not_allowed"],
      ["blocked", "content_scope_unknown"],
    ],
  )
})

test("atomic reservation blocks a second concurrent request", async () => {
  let releaseFirst = () => {}
  let markStarted = () => {}
  const started = new Promise<void>((resolve) => {
    markStarted = resolve
  })
  const provider = new FakeProvider(
    () =>
      new Promise<AiProviderResult>((resolve) => {
        releaseFirst = () => resolve(result())
        markStarted()
      }),
  )
  const { boundary, guarded } = setup({ ...openPolicy(), concurrentRequestLimit: 1 }, provider)
  const first = guarded.generateText(guardedRequest())
  await started

  await assert.rejects(
    guarded.generateText(guardedRequest()),
    (error: unknown) =>
      error instanceof AiRuntimeBlockedError && error.code === "concurrent_request_limit_reached",
  )
  assert.equal(provider.calls, 1)
  releaseFirst()
  await first
  assert.deepEqual(
    boundary.getAuditRecords().map((record) => record.status),
    ["succeeded", "blocked"],
  )
})

test("daily request limit counts accepted terminal attempts", async () => {
  const { guarded, provider } = setup({ ...openPolicy(), dailyRequestLimit: 1 })
  await guarded.generateText(guardedRequest())
  await assert.rejects(
    guarded.generateText(guardedRequest()),
    (error: unknown) =>
      error instanceof AiRuntimeBlockedError && error.code === "daily_request_limit_reached",
  )
  assert.equal(provider.calls, 1)
})

test("monthly budget includes committed cost before another reservation", async () => {
  const { boundary, guarded, provider } = setup(
    { ...openPolicy(), monthlyBudgetCents: 10 },
    undefined,
    () => 6,
    () => 6,
  )
  await guarded.generateText(guardedRequest())
  await assert.rejects(
    guarded.generateText(guardedRequest()),
    (error: unknown) =>
      error instanceof AiRuntimeBlockedError && error.code === "monthly_budget_exhausted",
  )
  assert.equal(provider.calls, 1)
  assert.equal(boundary.getAuditRecords()[0]?.costCents, 6)
})

test("trusted estimator controls reservation and invalid estimates are audited blocked", async () => {
  let estimatorCalls = 0
  let authorizedProviderRequest: AiProviderRequest = {
    messages: [{ role: "user", content: "snapshot input" }],
    maxTokens: 100,
  }
  const { boundary, guarded, provider } = setup(
    openPolicy(),
    undefined,
    () => 1,
    (providerRequest) => {
      estimatorCalls += 1
      return providerRequest.maxTokens === 100 ? 4 : Number.NaN
    },
    authorityFor(() => verifiedContext({ providerRequest: authorizedProviderRequest })),
  )
  await guarded.generateText(guardedRequest())
  authorizedProviderRequest = { messages: [{ role: "user", content: "snapshot input" }] }
  await assert.rejects(
    guarded.generateText(guardedRequest()),
    (error: unknown) =>
      error instanceof AiRuntimeBlockedError && error.code === "cost_estimation_failed",
  )
  assert.equal(estimatorCalls, 2)
  assert.equal(provider.calls, 1)
  assert.equal(boundary.getAuditRecords()[1]?.status, "blocked")
})

test("input hash covers generation controls without storing their content", async () => {
  let maxTokens = 10
  const { boundary, guarded } = setup(
    openPolicy(),
    undefined,
    undefined,
    undefined,
    authorityFor(() =>
      verifiedContext({
        providerRequest: { messages: [{ role: "user", content: "same" }], maxTokens },
      }),
    ),
  )
  await guarded.generateText(guardedRequest())
  maxTokens = 20
  await guarded.generateText(guardedRequest())
  const [first, second] = boundary.getAuditRecords()
  assert.notEqual(first?.inputHash, second?.inputHash)
})

test("success, failure and blocked requests all finish with sanitized audit metadata", async () => {
  const sensitiveInput = "PRIVATE-PROMPT-DO-NOT-STORE"
  const sensitiveError = "PRIVATE-PROVIDER-DETAIL-DO-NOT-STORE"
  let attempt = 0
  const provider = new FakeProvider(async () => {
    attempt += 1
    if (attempt === 2) throw new Error(sensitiveError)
    return result("PRIVATE-OUTPUT-DO-NOT-STORE")
  })
  const { boundary, guarded } = setup(
    { ...openPolicy(), dailyRequestLimit: 2 },
    provider,
    undefined,
    undefined,
    authorityFor(() =>
      verifiedContext({
        providerRequest: { messages: [{ role: "user", content: sensitiveInput }] },
      }),
    ),
  )
  const request = guardedRequest()

  await guarded.generateText(request)
  await assert.rejects(guarded.generateText(request), /PRIVATE-PROVIDER-DETAIL/)
  await assert.rejects(
    guarded.generateText(request),
    (error: unknown) =>
      error instanceof AiRuntimeBlockedError && error.code === "daily_request_limit_reached",
  )

  const records = boundary.getAuditRecords()
  assert.deepEqual(
    records.map((record) => record.status),
    ["succeeded", "failed", "blocked"],
  )
  assert.equal(records[1]?.errorCode, "unexpected_provider_failure")
  assert.match(records[0]?.inputHash ?? "", /^[a-f0-9]{64}$/u)
  const serializedAudit = JSON.stringify(records)
  assert.doesNotMatch(serializedAudit, new RegExp(sensitiveInput))
  assert.doesNotMatch(serializedAudit, /PRIVATE-OUTPUT-DO-NOT-STORE/)
  assert.doesNotMatch(serializedAudit, new RegExp(sensitiveError))
  assert.doesNotMatch(serializedAudit, /messages|content|text/u)
})

test("normalized provider failures retain only stable error codes", async () => {
  const provider = new FakeProvider(async () => {
    throw new AiProviderError({
      provider: "deepseek",
      code: "rate_limited",
      message: "fixed safe message",
      status: 429,
      retryable: true,
    })
  })
  const { boundary, guarded } = setup(openPolicy(), provider)
  await assert.rejects(guarded.generateText(guardedRequest()), AiProviderError)
  const record = boundary.getAuditRecords()[0]
  assert.equal(record?.status, "failed")
  assert.equal(record?.errorCode, "rate_limited")
})

test("missing provider usage fails accounting and conservatively charges reservation", async () => {
  const provider = new FakeProvider(async () => ({ ...result(), usage: null }))
  const { boundary, guarded } = setup(
    openPolicy(),
    provider,
    () => 0,
    () => 7,
  )
  await assert.rejects(
    guarded.generateText(guardedRequest()),
    (error: unknown) =>
      error instanceof Error &&
      error.name === "AiRuntimeAccountingError" &&
      (error as { code?: unknown }).code === "usage_missing",
  )
  assert.equal(provider.calls, 1)
  const record = boundary.getAuditRecords()[0]
  assert.equal(record?.status, "failed")
  assert.equal(record?.costCents, 7)
  assert.equal(record?.errorCode, "usage_missing")
})

test("cost calculation failure conservatively charges the reservation", async () => {
  const { boundary, guarded } = setup(
    openPolicy(),
    undefined,
    () => Number.NaN,
    () => 7,
  )
  await assert.rejects(
    guarded.generateText(guardedRequest()),
    (error: unknown) => error instanceof Error && error.name === "AiRuntimeAccountingError",
  )
  const record = boundary.getAuditRecords()[0]
  assert.equal(record?.status, "failed")
  assert.equal(record?.costCents, 7)
  assert.equal(record?.errorCode, "cost_calculation_failed")
})

test("actual cost above the reservation fails accounting and records the full cost", async () => {
  const { boundary, guarded } = setup(
    openPolicy(),
    undefined,
    () => 9,
    () => 5,
  )
  await assert.rejects(
    guarded.generateText(guardedRequest()),
    (error: unknown) =>
      error instanceof Error &&
      error.name === "AiRuntimeAccountingError" &&
      (error as { code?: unknown }).code === "cost_exceeded_reservation",
  )
  const record = boundary.getAuditRecords()[0]
  assert.equal(record?.status, "failed")
  assert.equal(record?.costCents, 9)
  assert.equal(record?.errorCode, "cost_exceeded_reservation")
})

test("a false success-finalize cannot reverse a completed success to failed", async () => {
  const inner = new InMemoryAiQuotaAuditBoundary({ policyForOwner: openPolicy })
  let finalizeCalls = 0
  const boundary: AiQuotaAuditBoundary = {
    reserve: (request) => inner.reserve(request),
    finalize: async (request: AiFinalizeRequest) => {
      finalizeCalls += 1
      const finalized = await inner.finalize(request)
      return finalizeCalls === 1 ? false : finalized
    },
  }
  const provider = new FakeProvider(async () => result())
  const guarded = new GuardedAiProvider({
    provider,
    rateCard: testRateCard(
      () => 3,
      () => 5,
    ),
    quotaAudit: boundary,
    contextAuthority: authorityFor(),
    capability: "rewrite",
    promptVersion: "v1",
    inputHasher: new WebCryptoHmacAiInputHasher("test-hmac-secret-with-at-least-32-bytes"),
  })

  await assert.rejects(
    guarded.generateText(guardedRequest()),
    (error: unknown) => error instanceof Error && error.name === "AiRuntimeAccountingError",
  )
  assert.equal(finalizeCalls, 2)
  const record = inner.getAuditRecords()[0]
  assert.equal(record?.status, "succeeded")
  assert.equal(record?.costCents, 3)
  assert.equal(record?.errorCode, null)
})
