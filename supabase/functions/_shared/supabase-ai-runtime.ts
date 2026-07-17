import type { AiMessage } from "./ai-provider.ts"
import {
  type AiBlockedCode,
  type AiFinalizeRequest,
  type AiQuotaAuditBoundary,
  type AiReservationDecision,
  type AiReservationRequest,
  type AiRuntimeContextAuthority,
  type AiVerifiedRuntimeContext,
  type GuardedAiRequest,
} from "./ai-runtime-safety.ts"

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type Snapshot = Readonly<Record<string, unknown>>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu
const blockedCodes = new Set<AiBlockedCode>([
  "site_ai_disabled",
  "user_ai_disabled",
  "content_scope_unknown",
  "private_content_not_consented",
  "provider_private_content_not_allowed",
  "monthly_budget_exhausted",
  "daily_request_limit_reached",
  "concurrent_request_limit_reached",
  "invalid_runtime_policy",
  "cost_estimation_failed",
  "rate_card_mismatch",
  "provider_consent_required",
])

const validateSupabaseUrl = (value: string) => {
  const url = new URL(value)
  if (
    url.protocol !== "https:" ||
    !/^[a-z0-9-]+\.supabase\.co$/u.test(url.hostname) ||
    url.username ||
    url.password ||
    url.port ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash
  ) {
    throw new Error("Supabase URL must be an HTTPS project origin.")
  }
  return url.origin
}

const validateKey = (value: string, label: string) => {
  const key = value.trim()
  if (!key || /[\r\n]/u.test(key)) throw new Error(`${label} is invalid.`)
  return key
}

const looksLikeJwt = (value: string) =>
  value.split(".").length === 3 && /^[A-Za-z0-9_=-]+(?:\.[A-Za-z0-9_=-]+){2}$/u.test(value)

const secretHeaders = (secretKey: string) => {
  const headers: Record<string, string> = {
    apikey: secretKey,
    "Content-Type": "application/json",
  }
  if (looksLikeJwt(secretKey)) headers.Authorization = `Bearer ${secretKey}`
  return headers
}

export class SupabaseAiRuntimeError extends Error {
  readonly code: "authority_unavailable" | "quota_unavailable" | "invalid_response"

  constructor(code: "authority_unavailable" | "quota_unavailable" | "invalid_response") {
    super("The server-side AI safety service is unavailable.")
    this.name = "SupabaseAiRuntimeError"
    this.code = code
  }
}

const safeJson = async (response: Response) => {
  try {
    return (await response.json()) as unknown
  } catch {
    throw new SupabaseAiRuntimeError("invalid_response")
  }
}

export interface SupabaseAiRuntimeContextAuthorityOptions {
  supabaseUrl: string
  publishableKey: string
  fetch: Fetch
  maxTokens: number
  promptBuilder: (snapshot: Snapshot) => readonly AiMessage[]
}

export class SupabaseAiRuntimeContextAuthority implements AiRuntimeContextAuthority {
  private readonly origin: string
  private readonly publishableKey: string
  private readonly fetch: Fetch
  private readonly maxTokens: number
  private readonly promptBuilder: (snapshot: Snapshot) => readonly AiMessage[]

  constructor(options: SupabaseAiRuntimeContextAuthorityOptions) {
    this.origin = validateSupabaseUrl(options.supabaseUrl)
    this.publishableKey = validateKey(options.publishableKey, "Supabase publishable key")
    if (
      !Number.isSafeInteger(options.maxTokens) ||
      options.maxTokens <= 0 ||
      options.maxTokens > 8192
    ) {
      throw new Error("Authority maxTokens must be an integer between 1 and 8192.")
    }
    this.fetch = options.fetch
    this.maxTokens = options.maxTokens
    this.promptBuilder = options.promptBuilder
  }

  async resolve(request: GuardedAiRequest): Promise<AiVerifiedRuntimeContext> {
    if (!request.documentId || !UUID.test(request.documentId)) {
      throw new SupabaseAiRuntimeError("authority_unavailable")
    }
    const authorization = request.authorization.trim()
    if (!/^Bearer [^\s]+$/u.test(authorization)) {
      throw new SupabaseAiRuntimeError("authority_unavailable")
    }

    let userResponse: Response
    try {
      userResponse = await this.fetch(`${this.origin}/auth/v1/user`, {
        method: "GET",
        redirect: "error",
        headers: { apikey: this.publishableKey, Authorization: authorization },
      })
    } catch {
      throw new SupabaseAiRuntimeError("authority_unavailable")
    }
    if (!userResponse.ok) throw new SupabaseAiRuntimeError("authority_unavailable")
    const user = await safeJson(userResponse)
    const ownerId =
      user && typeof user === "object" && typeof (user as { id?: unknown }).id === "string"
        ? (user as { id: string }).id
        : ""
    if (!UUID.test(ownerId)) throw new SupabaseAiRuntimeError("invalid_response")

    const query = new URL(`${this.origin}/rest/v1/document_publications`)
    query.searchParams.set("select", "document_id,owner_id,audience,snapshot")
    query.searchParams.set("document_id", `eq.${request.documentId}`)
    query.searchParams.set("owner_id", `eq.${ownerId}`)
    query.searchParams.set("audience", "eq.public")
    query.searchParams.set("limit", "1")

    let publicationResponse: Response
    try {
      publicationResponse = await this.fetch(query, {
        method: "GET",
        redirect: "error",
        headers: { apikey: this.publishableKey, Authorization: authorization },
      })
    } catch {
      throw new SupabaseAiRuntimeError("authority_unavailable")
    }
    if (!publicationResponse.ok) throw new SupabaseAiRuntimeError("authority_unavailable")
    const rows = await safeJson(publicationResponse)
    if (!Array.isArray(rows) || rows.length !== 1) {
      throw new SupabaseAiRuntimeError("authority_unavailable")
    }
    const row = rows[0] as Record<string, unknown>
    if (
      row.document_id !== request.documentId ||
      row.owner_id !== ownerId ||
      row.audience !== "public" ||
      !row.snapshot ||
      typeof row.snapshot !== "object" ||
      Array.isArray(row.snapshot)
    ) {
      throw new SupabaseAiRuntimeError("invalid_response")
    }
    const snapshotText = JSON.stringify(row.snapshot)
    if (new TextEncoder().encode(snapshotText).byteLength > 65_536) {
      throw new SupabaseAiRuntimeError("authority_unavailable")
    }

    let messages: readonly AiMessage[]
    try {
      messages = this.promptBuilder(row.snapshot as Snapshot)
    } catch {
      throw new SupabaseAiRuntimeError("authority_unavailable")
    }
    if (
      messages.length === 0 ||
      messages.length > 8 ||
      messages.some(
        (message) =>
          !["system", "user", "assistant"].includes(message.role) || !message.content.trim(),
      ) ||
      new TextEncoder().encode(JSON.stringify(messages)).byteLength > 98_304
    ) {
      throw new SupabaseAiRuntimeError("authority_unavailable")
    }

    return {
      ownerId,
      contentScope: "public",
      publicSource: "publication_snapshot",
      providerRequest: { messages, maxTokens: this.maxTokens },
    }
  }
}

export interface SupabaseAiQuotaAuditBoundaryOptions {
  supabaseUrl: string
  secretKey: string
  fetch: Fetch
}

export class SupabaseAiQuotaAuditBoundary implements AiQuotaAuditBoundary {
  private readonly origin: string
  private readonly secretKey: string
  private readonly fetch: Fetch

  constructor(options: SupabaseAiQuotaAuditBoundaryOptions) {
    this.origin = validateSupabaseUrl(options.supabaseUrl)
    this.secretKey = validateKey(options.secretKey, "Supabase secret key")
    this.fetch = options.fetch
  }

  async reserve(request: AiReservationRequest): Promise<AiReservationDecision> {
    const payload = await this.rpc("reserve_ai_run", {
      p_owner_id: request.ownerId,
      p_capability: request.capability,
      p_provider: request.provider,
      p_model: request.model,
      p_prompt_version: request.promptVersion,
      p_rate_card_version: request.rateCardVersion,
      p_input_hash: request.inputHash,
      p_content_scope: request.contentScope,
      p_provider_allows_private: request.providerAllowsPrivateContent,
      p_estimated_cost_cents: request.estimatedCostCents,
      p_preflight_error_code: request.preflightBlockCode ?? null,
    })
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new SupabaseAiRuntimeError("invalid_response")
    }
    const value = payload as Record<string, unknown>
    if (
      typeof value.allowed !== "boolean" ||
      typeof value.run_id !== "string" ||
      !UUID.test(value.run_id)
    ) {
      throw new SupabaseAiRuntimeError("invalid_response")
    }
    if (value.allowed) {
      if (value.error_code !== null) throw new SupabaseAiRuntimeError("invalid_response")
      return { allowed: true, runId: value.run_id }
    }
    if (
      typeof value.error_code !== "string" ||
      !blockedCodes.has(value.error_code as AiBlockedCode)
    ) {
      throw new SupabaseAiRuntimeError("invalid_response")
    }
    return {
      allowed: false,
      runId: value.run_id,
      errorCode: value.error_code as AiBlockedCode,
    }
  }

  async finalize(request: AiFinalizeRequest): Promise<boolean> {
    const payload = await this.rpc("finalize_ai_run", {
      p_run_id: request.runId,
      p_owner_id: request.ownerId,
      p_status: request.status,
      p_input_tokens: request.inputTokens,
      p_output_tokens: request.outputTokens,
      p_cache_hit_tokens: request.cacheHitTokens,
      p_cache_miss_tokens: request.cacheMissTokens,
      p_cost_cents: request.costCents,
      p_cost_basis: request.costBasis,
      p_rate_card_version: request.rateCardVersion,
      p_latency_ms: request.latencyMs,
      p_error_code: request.errorCode,
    })
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new SupabaseAiRuntimeError("invalid_response")
    }
    const finalized = (payload as { finalized?: unknown }).finalized
    if (typeof finalized !== "boolean") throw new SupabaseAiRuntimeError("invalid_response")
    return finalized
  }

  private async rpc(name: string, body: Record<string, unknown>) {
    let response: Response
    try {
      response = await this.fetch(`${this.origin}/rest/v1/rpc/${name}`, {
        method: "POST",
        redirect: "error",
        headers: secretHeaders(this.secretKey),
        body: JSON.stringify(body),
      })
    } catch {
      throw new SupabaseAiRuntimeError("quota_unavailable")
    }
    if (!response.ok) throw new SupabaseAiRuntimeError("quota_unavailable")
    return safeJson(response)
  }
}
