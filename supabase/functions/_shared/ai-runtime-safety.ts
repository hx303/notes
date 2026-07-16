import {
  AiProviderError,
  type AiProvider,
  type AiProviderRequest,
  type AiProviderResult,
} from "./ai-provider"

export type AiContentScope = "public" | "private" | "unknown"
export type AiRunStatus = "running" | "succeeded" | "failed" | "blocked"

export interface AiRuntimePolicy {
  siteLive: boolean
  userEnabled: boolean
  allowPrivateContent: boolean
  monthlyBudgetCents: number
  dailyRequestLimit: number
  concurrentRequestLimit: number
}

export interface AiReservationRequest {
  ownerId: string
  capability: string
  provider: string
  model: string
  promptVersion: string
  inputHash: string
  contentScope: AiContentScope
  providerAllowsPrivateContent: boolean
  estimatedCostCents: number
  preflightBlockCode?: "cost_estimation_failed"
}

export type AiReservationDecision =
  { allowed: true; runId: string } | { allowed: false; runId: string; errorCode: AiBlockedCode }

export interface AiFinalizeRequest {
  runId: string
  ownerId: string
  status: "succeeded" | "failed"
  inputTokens: number | null
  outputTokens: number | null
  cacheHitTokens: number | null
  cacheMissTokens: number | null
  costCents: number
  latencyMs: number
  errorCode: string | null
}

export interface AiAuditRecord {
  runId: string
  ownerId: string
  capability: string
  provider: string
  model: string
  promptVersion: string
  inputHash: string
  status: AiRunStatus
  reservedCostCents: number
  inputTokens: number | null
  outputTokens: number | null
  cacheHitTokens: number | null
  cacheMissTokens: number | null
  costCents: number | null
  latencyMs: number | null
  errorCode: string | null
  createdAt: string
  finishedAt: string | null
}

export interface AiQuotaAuditBoundary {
  reserve(request: AiReservationRequest): Promise<AiReservationDecision>
  finalize(request: AiFinalizeRequest): Promise<boolean>
}

export type AiBlockedCode =
  | "site_ai_disabled"
  | "user_ai_disabled"
  | "content_scope_unknown"
  | "private_content_not_consented"
  | "provider_private_content_not_allowed"
  | "monthly_budget_exhausted"
  | "daily_request_limit_reached"
  | "concurrent_request_limit_reached"
  | "invalid_runtime_policy"
  | "cost_estimation_failed"

export class AiRuntimeBlockedError extends Error {
  readonly runId: string
  readonly code: AiBlockedCode

  constructor(runId: string, code: AiBlockedCode) {
    super("The AI request was blocked by a server-side safety policy.")
    this.name = "AiRuntimeBlockedError"
    this.runId = runId
    this.code = code
  }
}

export class AiRuntimeAccountingError extends Error {
  readonly code:
    | "cost_calculation_failed"
    | "cost_exceeded_reservation"
    | "usage_missing"
    | "audit_finalize_failed"

  constructor(
    code:
      | "cost_calculation_failed"
      | "cost_exceeded_reservation"
      | "usage_missing"
      | "audit_finalize_failed",
  ) {
    super("The AI request could not complete its server-side accounting safely.")
    this.name = "AiRuntimeAccountingError"
    this.code = code
  }
}

export class AiRuntimeIdentityError extends Error {
  constructor() {
    super("The AI request did not have a verified owner identity.")
    this.name = "AiRuntimeIdentityError"
  }
}

export class AiRuntimeAuthorityError extends Error {
  constructor() {
    super("The AI request could not establish an authoritative server-side content context.")
    this.name = "AiRuntimeAuthorityError"
  }
}

interface InMemoryBoundaryOptions {
  policyForOwner: (ownerId: string) => AiRuntimePolicy
  now?: () => Date
}

const startOfUtcDay = (date: Date) =>
  Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
const startOfUtcMonth = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)
const nonnegativeIntegerOrNull = (value: number | null) =>
  value === null || (Number.isInteger(value) && value >= 0)
const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value)

export class InMemoryAiQuotaAuditBoundary implements AiQuotaAuditBoundary {
  private readonly policyForOwner: (ownerId: string) => AiRuntimePolicy
  private readonly now: () => Date
  private readonly records: AiAuditRecord[] = []
  private sequence = 0
  private lockTail: Promise<void> = Promise.resolve()

  constructor(options: InMemoryBoundaryOptions) {
    this.policyForOwner = options.policyForOwner
    this.now = options.now ?? (() => new Date())
  }

  getAuditRecords(): readonly AiAuditRecord[] {
    return structuredClone(this.records)
  }

  async reserve(request: AiReservationRequest): Promise<AiReservationDecision> {
    return this.atomic(() => {
      if (!isUuid(request.ownerId)) throw new AiRuntimeIdentityError()
      if (!Number.isInteger(request.estimatedCostCents) || request.estimatedCostCents <= 0) {
        throw new Error("estimatedCostCents must be a positive integer.")
      }
      if (!/^[a-f0-9]{64}$/u.test(request.inputHash)) {
        throw new Error("inputHash must be a lowercase SHA-256 digest.")
      }

      let policy: AiRuntimePolicy
      try {
        policy = this.policyForOwner(request.ownerId)
      } catch {
        policy = {
          siteLive: false,
          userEnabled: false,
          allowPrivateContent: false,
          monthlyBudgetCents: Number.NaN,
          dailyRequestLimit: Number.NaN,
          concurrentRequestLimit: Number.NaN,
        }
      }
      const now = this.now()
      const ownerRecords = this.records.filter((record) => record.ownerId === request.ownerId)
      const monthStart = startOfUtcMonth(now)
      const dayStart = startOfUtcDay(now)
      const monthlyCommitted = ownerRecords
        .filter(
          (record) =>
            Date.parse(record.createdAt) >= monthStart &&
            (record.status === "succeeded" || record.status === "failed"),
        )
        .reduce((total, record) => total + (record.costCents ?? 0), 0)
      const monthlyReserved = ownerRecords
        .filter((record) => record.status === "running")
        .reduce((total, record) => total + record.reservedCostCents, 0)
      const dailyRequests = ownerRecords.filter(
        (record) => record.status !== "blocked" && Date.parse(record.createdAt) >= dayStart,
      ).length
      const concurrentRequests = ownerRecords.filter((record) => record.status === "running").length

      const validPolicy =
        typeof policy.siteLive === "boolean" &&
        typeof policy.userEnabled === "boolean" &&
        typeof policy.allowPrivateContent === "boolean" &&
        Number.isInteger(policy.monthlyBudgetCents) &&
        policy.monthlyBudgetCents >= 0 &&
        Number.isInteger(policy.dailyRequestLimit) &&
        policy.dailyRequestLimit >= 0 &&
        Number.isInteger(policy.concurrentRequestLimit) &&
        policy.concurrentRequestLimit >= 0

      let blockedCode: AiBlockedCode | null = request.preflightBlockCode ?? null
      if (!blockedCode && !validPolicy) blockedCode = "invalid_runtime_policy"
      else if (!blockedCode && !policy.siteLive) blockedCode = "site_ai_disabled"
      else if (!blockedCode && !policy.userEnabled) blockedCode = "user_ai_disabled"
      else if (
        !blockedCode &&
        !(["public", "private"] as readonly unknown[]).includes(request.contentScope)
      ) {
        blockedCode = "content_scope_unknown"
      } else if (
        !blockedCode &&
        request.contentScope === "private" &&
        !request.providerAllowsPrivateContent
      ) {
        blockedCode = "provider_private_content_not_allowed"
      } else if (
        !blockedCode &&
        request.contentScope === "private" &&
        !policy.allowPrivateContent
      ) {
        blockedCode = "private_content_not_consented"
      } else if (
        !blockedCode &&
        (policy.monthlyBudgetCents <= 0 ||
          monthlyCommitted + monthlyReserved + request.estimatedCostCents >
            policy.monthlyBudgetCents)
      ) {
        blockedCode = "monthly_budget_exhausted"
      } else if (
        !blockedCode &&
        (policy.dailyRequestLimit <= 0 || dailyRequests >= policy.dailyRequestLimit)
      ) {
        blockedCode = "daily_request_limit_reached"
      } else if (
        !blockedCode &&
        (policy.concurrentRequestLimit <= 0 || concurrentRequests >= policy.concurrentRequestLimit)
      ) {
        blockedCode = "concurrent_request_limit_reached"
      }

      const runId = `run-${++this.sequence}`
      const record: AiAuditRecord = {
        runId,
        ownerId: request.ownerId,
        capability: request.capability,
        provider: request.provider,
        model: request.model,
        promptVersion: request.promptVersion,
        inputHash: request.inputHash,
        status: blockedCode ? "blocked" : "running",
        reservedCostCents: blockedCode ? 0 : request.estimatedCostCents,
        inputTokens: null,
        outputTokens: null,
        cacheHitTokens: null,
        cacheMissTokens: null,
        costCents: blockedCode ? 0 : null,
        latencyMs: blockedCode ? 0 : null,
        errorCode: blockedCode,
        createdAt: now.toISOString(),
        finishedAt: blockedCode ? now.toISOString() : null,
      }
      this.records.push(record)

      return blockedCode
        ? { allowed: false, runId, errorCode: blockedCode }
        : { allowed: true, runId }
    })
  }

  async finalize(request: AiFinalizeRequest): Promise<boolean> {
    return this.atomic(() => {
      if (
        !nonnegativeIntegerOrNull(request.inputTokens) ||
        !nonnegativeIntegerOrNull(request.outputTokens) ||
        !nonnegativeIntegerOrNull(request.cacheHitTokens) ||
        !nonnegativeIntegerOrNull(request.cacheMissTokens) ||
        !Number.isInteger(request.costCents) ||
        request.costCents < 0 ||
        !Number.isInteger(request.latencyMs) ||
        request.latencyMs < 0
      ) {
        throw new Error("AI finalization metadata must contain nonnegative integers or null.")
      }
      const record = this.records.find(
        (candidate) => candidate.runId === request.runId && candidate.ownerId === request.ownerId,
      )
      if (!record) return false
      if (record.status !== "running") return record.status === request.status

      record.status = request.status
      record.reservedCostCents = 0
      record.inputTokens = request.inputTokens
      record.outputTokens = request.outputTokens
      record.cacheHitTokens = request.cacheHitTokens
      record.cacheMissTokens = request.cacheMissTokens
      record.costCents = request.costCents
      record.latencyMs = request.latencyMs
      record.errorCode =
        request.status === "failed" ? (request.errorCode ?? "provider_failure") : null
      record.finishedAt = this.now().toISOString()
      return true
    })
  }

  private async atomic<T>(operation: () => T): Promise<T> {
    const previous = this.lockTail
    let release = () => {}
    this.lockTail = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    try {
      return operation()
    } finally {
      release()
    }
  }
}

export interface GuardedAiRequest {
  authorization: string
  documentId: string | null
}

export interface AiVerifiedRuntimeContext {
  ownerId: string
  contentScope: AiContentScope
  publicSource: "publication_snapshot" | null
  providerRequest: AiProviderRequest
}

export interface AiRuntimeContextAuthority {
  resolve(request: GuardedAiRequest): Promise<AiVerifiedRuntimeContext>
}

interface GuardedAiProviderOptions {
  provider: AiProvider
  quotaAudit: AiQuotaAuditBoundary
  contextAuthority: AiRuntimeContextAuthority
  capability: string
  model: string
  promptVersion: string
  calculateCostCents: (result: AiProviderResult) => number
  estimateCostCents: (request: { model: string; providerRequest: AiProviderRequest }) => number
  nowMs?: () => number
}

const hashProviderRequest = async (request: AiProviderRequest) => {
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      messages: request.messages,
      maxTokens: request.maxTokens ?? null,
      temperature: request.temperature ?? null,
    }),
  )
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

const safeProviderErrorCode = (error: unknown) =>
  error instanceof AiProviderError ? error.code : "unexpected_provider_failure"

export class GuardedAiProvider {
  private readonly provider: AiProvider
  private readonly quotaAudit: AiQuotaAuditBoundary
  private readonly contextAuthority: AiRuntimeContextAuthority
  private readonly capability: string
  private readonly model: string
  private readonly promptVersion: string
  private readonly calculateCostCents: (result: AiProviderResult) => number
  private readonly estimateCostCents: (request: {
    model: string
    providerRequest: AiProviderRequest
  }) => number
  private readonly nowMs: () => number

  constructor(options: GuardedAiProviderOptions) {
    this.provider = options.provider
    this.quotaAudit = options.quotaAudit
    this.contextAuthority = options.contextAuthority
    if (!/^[a-z0-9_-]{1,60}$/u.test(options.capability)) {
      throw new Error("AI capability must be a stable server-side identifier.")
    }
    if (!/^[a-zA-Z0-9._-]{1,120}$/u.test(options.model)) {
      throw new Error("AI model must be a stable server-side identifier.")
    }
    if (!/^[a-zA-Z0-9._-]{1,40}$/u.test(options.promptVersion)) {
      throw new Error("AI promptVersion must be a stable server-side identifier.")
    }
    this.capability = options.capability
    this.model = options.model
    this.promptVersion = options.promptVersion
    this.calculateCostCents = options.calculateCostCents
    this.estimateCostCents = options.estimateCostCents
    this.nowMs = options.nowMs ?? (() => Date.now())
  }

  async generateText(request: GuardedAiRequest): Promise<AiProviderResult> {
    let context: AiVerifiedRuntimeContext
    try {
      context = await this.contextAuthority.resolve({
        authorization: request.authorization,
        documentId: request.documentId,
      })
    } catch {
      throw new AiRuntimeAuthorityError()
    }
    if (!isUuid(context.ownerId)) throw new AiRuntimeAuthorityError()
    if (!(["public", "private", "unknown"] as readonly unknown[]).includes(context.contentScope)) {
      throw new AiRuntimeAuthorityError()
    }
    if (context.contentScope === "public" && context.publicSource !== "publication_snapshot") {
      throw new AiRuntimeAuthorityError()
    }

    const inputHash = await hashProviderRequest(context.providerRequest)
    let preflightBlockCode: "cost_estimation_failed" | undefined
    let estimatedCostCents = 1
    try {
      const estimate = this.estimateCostCents({
        model: this.model,
        providerRequest: context.providerRequest,
      })
      if (!Number.isInteger(estimate) || estimate <= 0)
        preflightBlockCode = "cost_estimation_failed"
      else estimatedCostCents = estimate
    } catch {
      preflightBlockCode = "cost_estimation_failed"
    }
    const reservation = await this.quotaAudit.reserve({
      ownerId: context.ownerId,
      capability: this.capability,
      provider: this.provider.capabilities.provider,
      model: this.model,
      promptVersion: this.promptVersion,
      inputHash,
      contentScope: context.contentScope,
      providerAllowsPrivateContent: this.provider.capabilities.allowsPrivateContent,
      estimatedCostCents,
      preflightBlockCode,
    })
    if (!reservation.allowed) {
      throw new AiRuntimeBlockedError(reservation.runId, reservation.errorCode)
    }

    const startedAt = this.nowMs()
    let result: AiProviderResult
    try {
      result = await this.provider.generateText(context.providerRequest)
    } catch (error) {
      const finalized = await this.safeFinalize({
        runId: reservation.runId,
        ownerId: context.ownerId,
        status: "failed",
        inputTokens: null,
        outputTokens: null,
        cacheHitTokens: null,
        cacheMissTokens: null,
        costCents: estimatedCostCents,
        latencyMs: Math.max(0, Math.round(this.nowMs() - startedAt)),
        errorCode: safeProviderErrorCode(error),
      })
      if (!finalized) throw new AiRuntimeAccountingError("audit_finalize_failed")
      throw error
    }

    if (!result.usage) {
      const finalized = await this.safeFinalize({
        runId: reservation.runId,
        ownerId: context.ownerId,
        status: "failed",
        inputTokens: null,
        outputTokens: null,
        cacheHitTokens: null,
        cacheMissTokens: null,
        costCents: estimatedCostCents,
        latencyMs: Math.max(0, Math.round(this.nowMs() - startedAt)),
        errorCode: "usage_missing",
      })
      if (!finalized) throw new AiRuntimeAccountingError("audit_finalize_failed")
      throw new AiRuntimeAccountingError("usage_missing")
    }

    let costCents: number
    try {
      costCents = this.calculateCostCents(result)
      if (!Number.isInteger(costCents) || costCents < 0) throw new Error("invalid cost")
    } catch {
      const finalized = await this.safeFinalize({
        runId: reservation.runId,
        ownerId: context.ownerId,
        status: "failed",
        inputTokens: result.usage?.promptTokens ?? null,
        outputTokens: result.usage?.completionTokens ?? null,
        cacheHitTokens: result.usage?.cacheHitTokens ?? null,
        cacheMissTokens: result.usage?.cacheMissTokens ?? null,
        costCents: estimatedCostCents,
        latencyMs: Math.max(0, Math.round(this.nowMs() - startedAt)),
        errorCode: "cost_calculation_failed",
      })
      if (!finalized) throw new AiRuntimeAccountingError("audit_finalize_failed")
      throw new AiRuntimeAccountingError("cost_calculation_failed")
    }

    if (costCents > estimatedCostCents) {
      const finalized = await this.safeFinalize({
        runId: reservation.runId,
        ownerId: context.ownerId,
        status: "failed",
        inputTokens: result.usage?.promptTokens ?? null,
        outputTokens: result.usage?.completionTokens ?? null,
        cacheHitTokens: result.usage?.cacheHitTokens ?? null,
        cacheMissTokens: result.usage?.cacheMissTokens ?? null,
        costCents,
        latencyMs: Math.max(0, Math.round(this.nowMs() - startedAt)),
        errorCode: "cost_exceeded_reservation",
      })
      if (!finalized) throw new AiRuntimeAccountingError("audit_finalize_failed")
      throw new AiRuntimeAccountingError("cost_exceeded_reservation")
    }

    const finalized = await this.safeFinalize({
      runId: reservation.runId,
      ownerId: context.ownerId,
      status: "succeeded",
      inputTokens: result.usage?.promptTokens ?? null,
      outputTokens: result.usage?.completionTokens ?? null,
      cacheHitTokens: result.usage?.cacheHitTokens ?? null,
      cacheMissTokens: result.usage?.cacheMissTokens ?? null,
      costCents,
      latencyMs: Math.max(0, Math.round(this.nowMs() - startedAt)),
      errorCode: null,
    })
    if (!finalized) {
      await this.safeFinalize({
        runId: reservation.runId,
        ownerId: context.ownerId,
        status: "failed",
        inputTokens: result.usage?.promptTokens ?? null,
        outputTokens: result.usage?.completionTokens ?? null,
        cacheHitTokens: result.usage?.cacheHitTokens ?? null,
        cacheMissTokens: result.usage?.cacheMissTokens ?? null,
        costCents: estimatedCostCents,
        latencyMs: Math.max(0, Math.round(this.nowMs() - startedAt)),
        errorCode: "audit_finalize_failed",
      })
      throw new AiRuntimeAccountingError("audit_finalize_failed")
    }
    return result
  }

  private async safeFinalize(request: AiFinalizeRequest): Promise<boolean> {
    try {
      return await this.quotaAudit.finalize(request)
    } catch {
      return false
    }
  }
}
