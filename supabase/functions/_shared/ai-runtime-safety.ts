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
  rateCardVersion: string
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
  costBasis: "actual" | "reserved"
  rateCardVersion: string
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
  rateCardVersion: string
  inputHash: string
  status: AiRunStatus
  reservedCostCents: number
  inputTokens: number | null
  outputTokens: number | null
  cacheHitTokens: number | null
  cacheMissTokens: number | null
  costCents: number | null
  costBasis: "actual" | "reserved" | "none"
  latencyMs: number | null
  errorCode: string | null
  createdAt: string
  finishedAt: string | null
}

export interface AiQuotaAuditBoundary {
  reserve(request: AiReservationRequest): Promise<AiReservationDecision>
  finalize(request: AiFinalizeRequest): Promise<boolean>
}

export interface AiInputHasher {
  hash(ownerId: string, request: AiProviderRequest): Promise<string>
}

export interface AiRateCard {
  readonly provider: string
  readonly model: string
  readonly version: string
  estimateCostCents(request: AiProviderRequest): number
  calculateCostCents(result: AiProviderResult): number
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
  | "rate_card_mismatch"
  | "provider_consent_required"

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
        rateCardVersion: request.rateCardVersion,
        inputHash: request.inputHash,
        status: blockedCode ? "blocked" : "running",
        reservedCostCents: blockedCode ? 0 : request.estimatedCostCents,
        inputTokens: null,
        outputTokens: null,
        cacheHitTokens: null,
        cacheMissTokens: null,
        costCents: blockedCode ? 0 : null,
        costBasis: "none",
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
      if (record.rateCardVersion !== request.rateCardVersion) return false
      if (request.status === "succeeded" && request.costBasis !== "actual") return false
      if (record.status !== "running") return record.status === request.status

      record.status = request.status
      record.reservedCostCents = 0
      record.inputTokens = request.inputTokens
      record.outputTokens = request.outputTokens
      record.cacheHitTokens = request.cacheHitTokens
      record.cacheMissTokens = request.cacheMissTokens
      record.costCents = request.costCents
      record.costBasis = request.costBasis
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
  rateCard: AiRateCard
  quotaAudit: AiQuotaAuditBoundary
  contextAuthority: AiRuntimeContextAuthority
  capability: string
  promptVersion: string
  inputHasher: AiInputHasher
  nowMs?: () => number
}

const safeProviderErrorCode = (error: unknown) =>
  error instanceof AiProviderError ? error.code : "unexpected_provider_failure"

export class GuardedAiProvider {
  private readonly provider: AiProvider
  private readonly providerName: string
  private readonly model: string
  private readonly providerAllowsPrivateContent: boolean
  private readonly rateCardVersion: string
  private readonly estimateCostCents: (request: AiProviderRequest) => number
  private readonly calculateCostCents: (result: AiProviderResult) => number
  private readonly quotaAudit: AiQuotaAuditBoundary
  private readonly contextAuthority: AiRuntimeContextAuthority
  private readonly capability: string
  private readonly promptVersion: string
  private readonly inputHasher: AiInputHasher
  private readonly nowMs: () => number

  constructor(options: GuardedAiProviderOptions) {
    this.provider = options.provider
    this.quotaAudit = options.quotaAudit
    this.contextAuthority = options.contextAuthority
    if (!/^[a-z0-9_-]{1,60}$/u.test(options.capability)) {
      throw new Error("AI capability must be a stable server-side identifier.")
    }
    if (!/^[a-zA-Z0-9._-]{1,40}$/u.test(options.promptVersion)) {
      throw new Error("AI promptVersion must be a stable server-side identifier.")
    }
    if (
      !/^[a-z0-9_-]{1,40}$/u.test(options.provider.identity.provider) ||
      !/^[a-zA-Z0-9._-]{1,120}$/u.test(options.provider.identity.model) ||
      options.provider.identity.provider !== options.provider.capabilities.provider
    ) {
      throw new Error("AI provider identity is invalid.")
    }
    if (!/^[a-zA-Z0-9._-]{1,80}$/u.test(options.rateCard.version)) {
      throw new Error("AI rateCardVersion must be a stable server-side identifier.")
    }
    if (
      options.rateCard.provider !== options.provider.identity.provider ||
      options.rateCard.model !== options.provider.identity.model
    ) {
      throw new Error("AI provider and rate-card identities do not match.")
    }
    this.providerName = options.provider.identity.provider
    this.model = options.provider.identity.model
    this.providerAllowsPrivateContent = options.provider.capabilities.allowsPrivateContent
    this.rateCardVersion = options.rateCard.version
    this.estimateCostCents = options.rateCard.estimateCostCents.bind(options.rateCard)
    this.calculateCostCents = options.rateCard.calculateCostCents.bind(options.rateCard)
    this.capability = options.capability
    this.promptVersion = options.promptVersion
    this.inputHasher = options.inputHasher
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

    const inputHash = await this.inputHasher.hash(context.ownerId, context.providerRequest)
    if (!/^[a-f0-9]{64}$/u.test(inputHash)) throw new AiRuntimeAuthorityError()
    let preflightBlockCode: "cost_estimation_failed" | undefined
    let estimatedCostCents = 1
    try {
      const estimate = this.estimateCostCents(context.providerRequest)
      if (!Number.isInteger(estimate) || estimate <= 0)
        preflightBlockCode = "cost_estimation_failed"
      else estimatedCostCents = estimate
    } catch {
      preflightBlockCode = "cost_estimation_failed"
    }
    const reservation = await this.quotaAudit.reserve({
      ownerId: context.ownerId,
      capability: this.capability,
      provider: this.providerName,
      model: this.model,
      promptVersion: this.promptVersion,
      rateCardVersion: this.rateCardVersion,
      inputHash,
      contentScope: context.contentScope,
      providerAllowsPrivateContent: this.providerAllowsPrivateContent,
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
        costBasis: "reserved",
        rateCardVersion: this.rateCardVersion,
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
        costBasis: "reserved",
        rateCardVersion: this.rateCardVersion,
        latencyMs: Math.max(0, Math.round(this.nowMs() - startedAt)),
        errorCode: "usage_missing",
      })
      if (!finalized) throw new AiRuntimeAccountingError("audit_finalize_failed")
      throw new AiRuntimeAccountingError("usage_missing")
    }

    let costCents: number
    try {
      if (result.model !== this.model) throw new Error("response model mismatch")
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
        costBasis: "reserved",
        rateCardVersion: this.rateCardVersion,
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
        costBasis: "actual",
        rateCardVersion: this.rateCardVersion,
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
      costBasis: "actual",
      rateCardVersion: this.rateCardVersion,
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
        costBasis: "reserved",
        rateCardVersion: this.rateCardVersion,
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
