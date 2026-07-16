export type AiMessageRole = "system" | "user" | "assistant"

export interface AiMessage {
  role: AiMessageRole
  content: string
}

export interface AiProviderRequest {
  messages: readonly AiMessage[]
  maxTokens?: number
  temperature?: number
  signal?: AbortSignal
}

export interface AiProviderUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cacheHitTokens: number | null
  cacheMissTokens: number | null
}

export interface AiProviderResult {
  id: string | null
  text: string
  model: string
  finishReason: string | null
  usage: AiProviderUsage | null
}

export interface AiProviderCapabilities {
  provider: string
  supportsStreaming: boolean
  supportsThinkingControl: boolean
  supportsZeroRetention: boolean
  allowsPrivateContent: boolean
  retention: "zero_retention" | "provider_managed_or_unknown"
}

export type AiProviderErrorCode =
  | "invalid_request"
  | "authentication_failed"
  | "insufficient_balance"
  | "unprocessable_request"
  | "rate_limited"
  | "provider_error"
  | "provider_unavailable"
  | "unexpected_response"
  | "invalid_response"
  | "empty_output"
  | "output_truncated"
  | "content_filtered"
  | "network_error"
  | "timeout"
  | "request_aborted"

export class AiProviderError extends Error {
  readonly provider: string
  readonly code: AiProviderErrorCode
  readonly status: number | null
  readonly retryable: boolean
  readonly detail: string | null

  constructor(options: {
    provider: string
    code: AiProviderErrorCode
    message: string
    status?: number | null
    retryable?: boolean
  }) {
    super(options.message)
    this.name = "AiProviderError"
    this.provider = options.provider
    this.code = options.code
    this.status = options.status ?? null
    this.retryable = options.retryable ?? false
    this.detail = null
  }
}

export interface AiProvider {
  readonly capabilities: AiProviderCapabilities
  generateText(request: AiProviderRequest): Promise<AiProviderResult>
}
