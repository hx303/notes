import assert from "node:assert/strict"
import test from "node:test"
import { AiProviderError } from "../../supabase/functions/_shared/ai-provider"
import {
  DeepSeekProvider,
  deepSeekDefaults,
  type DeepSeekModel,
} from "../../supabase/functions/_shared/deepseek-provider"

test("DeepSeek adapter sends the current non-streaming writing contract without store", async () => {
  let requestUrl = ""
  let requestInit: RequestInit | undefined
  const provider = new DeepSeekProvider({
    apiKey: "test-key",
    fetch: async (input, init) => {
      requestUrl = String(input)
      requestInit = init
      return Response.json({
        id: "chat-1",
        model: "deepseek-v4-flash",
        choices: [{ message: { content: "改写结果" }, finish_reason: "stop" }],
        usage: {
          prompt_tokens: 8,
          completion_tokens: 4,
          total_tokens: 12,
          prompt_cache_hit_tokens: 3,
          prompt_cache_miss_tokens: 5,
        },
      })
    },
  })

  const result = await provider.generateText({
    messages: [{ role: "user", content: "请改写" }],
    maxTokens: 256,
    temperature: 0.2,
  })

  assert.equal(requestUrl, "https://api.deepseek.com/chat/completions")
  assert.equal(requestInit?.method, "POST")
  assert.equal(requestInit?.redirect, "error")
  assert.equal((requestInit?.headers as Record<string, string>).Authorization, "Bearer test-key")
  const body = JSON.parse(String(requestInit?.body)) as Record<string, unknown>
  assert.equal(body.model, deepSeekDefaults.model)
  assert.equal(body.stream, false)
  assert.deepEqual(body.thinking, { type: "disabled" })
  assert.equal(body.max_tokens, 256)
  assert.equal(body.temperature, 0.2)
  assert.equal("store" in body, false)
  assert.equal("user_id" in body, false)
  assert.deepEqual(result, {
    id: "chat-1",
    text: "改写结果",
    model: "deepseek-v4-flash",
    finishReason: "stop",
    usage: {
      promptTokens: 8,
      completionTokens: 4,
      totalTokens: 12,
      cacheHitTokens: 3,
      cacheMissTokens: 5,
    },
  })
})

test("DeepSeek adapter declares its privacy and first-slice capabilities", () => {
  const provider = new DeepSeekProvider({
    apiKey: "test-key",
    fetch: async () => Response.json({}),
  })
  assert.deepEqual(provider.identity, { provider: "deepseek", model: "deepseek-v4-flash" })
  assert.equal(
    Reflect.set(provider, "identity", { provider: "deepseek", model: "deepseek-v4-pro" }),
    false,
  )
  assert.equal(provider.identity.model, "deepseek-v4-flash")
  assert.deepEqual(provider.capabilities, {
    provider: "deepseek",
    supportsStreaming: false,
    supportsThinkingControl: true,
    supportsZeroRetention: false,
    allowsPrivateContent: false,
    retention: "provider_managed_or_unknown",
  })
})

test("DeepSeek adapter normalizes documented provider errors", async () => {
  const cases = [
    [400, "invalid_request", false],
    [401, "authentication_failed", false],
    [402, "insufficient_balance", false],
    [422, "unprocessable_request", false],
    [429, "rate_limited", true],
    [500, "provider_error", true],
    [503, "provider_unavailable", true],
  ] as const

  for (const [status, code, retryable] of cases) {
    const provider = new DeepSeekProvider({
      apiKey: "test-key",
      fetch: async () => Response.json({ error: { message: `provider ${status}` } }, { status }),
    })
    await assert.rejects(
      provider.generateText({ messages: [{ role: "user", content: "hello" }] }),
      (error: unknown) => {
        assert.ok(error instanceof AiProviderError)
        assert.equal(error.status, status)
        assert.equal(error.code, code)
        assert.equal(error.retryable, retryable)
        assert.equal(error.detail, null)
        return true
      },
    )
  }
})

test("DeepSeek adapter converts an aborted timeout into a retryable timeout error", async () => {
  const provider = new DeepSeekProvider({
    apiKey: "test-key",
    timeoutMs: 5,
    fetch: (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        )
      }),
  })

  await assert.rejects(
    provider.generateText({ messages: [{ role: "user", content: "hello" }] }),
    (error: unknown) => {
      assert.ok(error instanceof AiProviderError)
      assert.equal(error.code, "timeout")
      assert.equal(error.retryable, true)
      return true
    },
  )
})

test("DeepSeek adapter distinguishes caller cancellation from its timeout", async () => {
  const caller = new AbortController()
  const provider = new DeepSeekProvider({
    apiKey: "test-key",
    fetch: (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        )
      }),
  })
  const result = provider.generateText({
    messages: [{ role: "user", content: "hello" }],
    signal: caller.signal,
  })
  caller.abort()

  await assert.rejects(result, (error: unknown) => {
    assert.ok(error instanceof AiProviderError)
    assert.equal(error.code, "request_aborted")
    assert.equal(error.retryable, false)
    return true
  })
})

test("DeepSeek adapter rejects an invalid successful response", async () => {
  const provider = new DeepSeekProvider({
    apiKey: "test-key",
    fetch: async () => Response.json({ choices: [] }),
  })
  await assert.rejects(
    provider.generateText({ messages: [{ role: "user", content: "hello" }] }),
    (error: unknown) => error instanceof AiProviderError && error.code === "invalid_response",
  )
})

test("DeepSeek adapter requires an explicit matching response model", async () => {
  for (const model of [undefined, "deepseek-v4-pro"] as const) {
    const provider = new DeepSeekProvider({
      apiKey: "test-key",
      fetch: async () =>
        Response.json({
          model,
          choices: [{ message: { content: "result" }, finish_reason: "stop" }],
        }),
    })
    await assert.rejects(
      provider.generateText({ messages: [{ role: "user", content: "hello" }] }),
      (error: unknown) => error instanceof AiProviderError && error.code === "invalid_response",
    )
  }
})

test("DeepSeek adapter rejects blank and truncated output", async () => {
  for (const [content, finishReason, code] of [
    ["   ", "stop", "empty_output"],
    ["partial", "length", "output_truncated"],
  ] as const) {
    const provider = new DeepSeekProvider({
      apiKey: "test-key",
      fetch: async () =>
        Response.json({
          model: "deepseek-v4-flash",
          choices: [{ message: { content }, finish_reason: finishReason }],
        }),
    })
    await assert.rejects(
      provider.generateText({ messages: [{ role: "user", content: "hello" }] }),
      (error: unknown) => error instanceof AiProviderError && error.code === code,
    )
  }
})

test("DeepSeek adapter preserves explicit filter and resource failure reasons without content", async () => {
  for (const [finishReason, code, retryable] of [
    ["content_filter", "content_filtered", false],
    ["insufficient_system_resource", "provider_unavailable", true],
  ] as const) {
    const provider = new DeepSeekProvider({
      apiKey: "test-key",
      fetch: async () => Response.json({ choices: [{ finish_reason: finishReason }] }),
    })
    await assert.rejects(
      provider.generateText({ messages: [{ role: "user", content: "hello" }] }),
      (error: unknown) => {
        assert.ok(error instanceof AiProviderError)
        assert.equal(error.code, code)
        assert.equal(error.retryable, retryable)
        return true
      },
    )
  }
})

test("DeepSeek adapter validates model and generation controls before fetching", async () => {
  assert.throws(
    () => new DeepSeekProvider({ apiKey: "test-key", model: "deepseek-chat" as DeepSeekModel }),
    /Unsupported DeepSeek model/,
  )
  let called = false
  const provider = new DeepSeekProvider({
    apiKey: "test-key",
    fetch: async () => {
      called = true
      return Response.json({})
    },
  })
  for (const request of [
    { messages: [{ role: "user" as const, content: "hello" }], maxTokens: 0 },
    { messages: [{ role: "user" as const, content: "hello" }], temperature: 2.1 },
  ]) {
    await assert.rejects(provider.generateText(request), (error: unknown) => {
      return error instanceof AiProviderError && error.code === "invalid_request"
    })
  }
  assert.equal(called, false)
})
