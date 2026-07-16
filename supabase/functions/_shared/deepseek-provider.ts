import {
  AiProviderError,
  type AiProvider,
  type AiProviderCapabilities,
  type AiProviderErrorCode,
  type AiProviderRequest,
  type AiProviderResult,
} from "./ai-provider"

const PROVIDER = "deepseek"
const DEFAULT_ENDPOINT = "https://api.deepseek.com/chat/completions"
const DEFAULT_MODEL = "deepseek-v4-flash"
const DEFAULT_TIMEOUT_MS = 30_000
const supportedModels = new Set(["deepseek-v4-flash", "deepseek-v4-pro"])

export type DeepSeekModel = "deepseek-v4-flash" | "deepseek-v4-pro"

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export interface DeepSeekProviderOptions {
  apiKey: string
  fetch?: Fetch
  model?: DeepSeekModel
  timeoutMs?: number
}

interface DeepSeekResponse {
  id?: unknown
  model?: unknown
  choices?: Array<{
    message?: { content?: unknown }
    finish_reason?: unknown
  }>
  usage?: {
    prompt_tokens?: unknown
    completion_tokens?: unknown
    total_tokens?: unknown
    prompt_cache_hit_tokens?: unknown
    prompt_cache_miss_tokens?: unknown
  }
}

const statusErrors: Record<
  number,
  { code: AiProviderErrorCode; message: string; retryable: boolean }
> = {
  400: { code: "invalid_request", message: "DeepSeek rejected the request.", retryable: false },
  401: {
    code: "authentication_failed",
    message: "DeepSeek authentication failed.",
    retryable: false,
  },
  402: {
    code: "insufficient_balance",
    message: "The DeepSeek account has insufficient balance.",
    retryable: false,
  },
  422: {
    code: "unprocessable_request",
    message: "DeepSeek could not process the request.",
    retryable: false,
  },
  429: { code: "rate_limited", message: "DeepSeek rate limit reached.", retryable: true },
  500: { code: "provider_error", message: "DeepSeek encountered an error.", retryable: true },
  503: {
    code: "provider_unavailable",
    message: "DeepSeek is temporarily unavailable.",
    retryable: true,
  },
}

const optionalInteger = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null

export class DeepSeekProvider implements AiProvider {
  readonly capabilities: AiProviderCapabilities = Object.freeze({
    provider: PROVIDER,
    supportsStreaming: false,
    supportsThinkingControl: true,
    supportsZeroRetention: false,
    allowsPrivateContent: false,
    retention: "provider_managed_or_unknown",
  })

  private readonly apiKey: string
  private readonly fetch: Fetch
  private readonly model: DeepSeekModel
  private readonly timeoutMs: number

  constructor(options: DeepSeekProviderOptions) {
    if (!options.apiKey.trim()) throw new Error("DeepSeek API key is required.")
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new Error("DeepSeek timeout must be a positive number.")
    }
    const model = options.model ?? DEFAULT_MODEL
    if (!supportedModels.has(model)) throw new Error("Unsupported DeepSeek model.")

    this.apiKey = options.apiKey.trim()
    this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis)
    this.model = model
    this.timeoutMs = timeoutMs
  }

  async generateText(request: AiProviderRequest): Promise<AiProviderResult> {
    if (request.messages.length === 0 || request.messages.some((message) => !message.content.trim())) {
      throw new AiProviderError({
        provider: PROVIDER,
        code: "invalid_request",
        message: "At least one non-empty message is required.",
      })
    }
    if (
      request.maxTokens !== undefined &&
      (!Number.isInteger(request.maxTokens) || request.maxTokens <= 0)
    ) {
      throw new AiProviderError({
        provider: PROVIDER,
        code: "invalid_request",
        message: "maxTokens must be a positive integer.",
      })
    }
    if (
      request.temperature !== undefined &&
      (!Number.isFinite(request.temperature) || request.temperature < 0 || request.temperature > 2)
    ) {
      throw new AiProviderError({
        provider: PROVIDER,
        code: "invalid_request",
        message: "temperature must be between 0 and 2.",
      })
    }

    const controller = new AbortController()
    let timedOut = false
    const abortFromCaller = () => controller.abort(request.signal?.reason)
    request.signal?.addEventListener("abort", abortFromCaller, { once: true })
    if (request.signal?.aborted) abortFromCaller()
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, this.timeoutMs)

    try {
      const body: Record<string, unknown> = {
        model: this.model,
        messages: request.messages,
        stream: false,
        thinking: { type: "disabled" },
      }
      if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens
      if (request.temperature !== undefined) body.temperature = request.temperature

      const response = await this.fetch(DEFAULT_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      let payload: unknown = null
      try {
        payload = await response.json()
      } catch {
        // Provider errors can have empty or non-JSON bodies.
      }

      if (!response.ok) {
        const known = statusErrors[response.status]
        throw new AiProviderError({
          provider: PROVIDER,
          code: known?.code ?? "unexpected_response",
          message: known?.message ?? `DeepSeek returned HTTP ${response.status}.`,
          status: response.status,
          retryable: known?.retryable ?? response.status >= 500,
        })
      }

      const data = payload as DeepSeekResponse | null
      const choice = data?.choices?.[0]
      if (choice?.finish_reason === "length") {
        throw new AiProviderError({
          provider: PROVIDER,
          code: "output_truncated",
          message: "DeepSeek output was truncated before completion.",
          status: response.status,
        })
      }
      if (choice?.finish_reason === "content_filter") {
        throw new AiProviderError({
          provider: PROVIDER,
          code: "content_filtered",
          message: "DeepSeek filtered the generated output.",
          status: response.status,
        })
      }
      if (choice?.finish_reason === "insufficient_system_resource") {
        throw new AiProviderError({
          provider: PROVIDER,
          code: "provider_unavailable",
          message: "DeepSeek had insufficient system resources.",
          status: response.status,
          retryable: true,
        })
      }
      const text = choice?.message?.content
      if (typeof text !== "string" || !text.trim()) {
        throw new AiProviderError({
          provider: PROVIDER,
          code: typeof text === "string" ? "empty_output" : "invalid_response",
          message:
            typeof text === "string"
              ? "DeepSeek returned empty generated text."
              : "DeepSeek returned a response without generated text.",
          status: response.status,
        })
      }

      const promptTokens = optionalInteger(data?.usage?.prompt_tokens)
      const completionTokens = optionalInteger(data?.usage?.completion_tokens)
      const totalTokens = optionalInteger(data?.usage?.total_tokens)
      const cacheHitTokens = optionalInteger(data?.usage?.prompt_cache_hit_tokens)
      const cacheMissTokens = optionalInteger(data?.usage?.prompt_cache_miss_tokens)
      const usage =
        promptTokens === null || completionTokens === null || totalTokens === null
          ? null
          : { promptTokens, completionTokens, totalTokens, cacheHitTokens, cacheMissTokens }

      return {
        id: typeof data?.id === "string" ? data.id : null,
        text,
        model: typeof data?.model === "string" ? data.model : this.model,
        finishReason: typeof choice?.finish_reason === "string" ? choice.finish_reason : null,
        usage,
      }
    } catch (error) {
      if (error instanceof AiProviderError) throw error
      if (controller.signal.aborted) {
        throw new AiProviderError({
          provider: PROVIDER,
          code: timedOut ? "timeout" : "request_aborted",
          message: timedOut ? "DeepSeek request timed out." : "DeepSeek request was aborted.",
          retryable: timedOut,
        })
      }
      throw new AiProviderError({
        provider: PROVIDER,
        code: "network_error",
        message: "DeepSeek could not be reached.",
        retryable: true,
      })
    } finally {
      clearTimeout(timeout)
      request.signal?.removeEventListener("abort", abortFromCaller)
    }
  }
}

export const deepSeekDefaults = Object.freeze({
  endpoint: DEFAULT_ENDPOINT,
  model: DEFAULT_MODEL,
  timeoutMs: DEFAULT_TIMEOUT_MS,
})
