import {
  EDITOR_OUTBOX_REPLAY_PROTOCOL,
  createReplaySafeEditorOutbox,
  parseEditorOutboxRecord,
  type EditorOutboxClaim,
  type EditorOutboxManualRecoveryItem,
  type EditorOutboxRepository,
} from "./editorOutbox.ts"
import {
  AtomicEditorSaveContractError,
  EDITOR_ATOMIC_SAVE_PROTOCOL,
  EDITOR_ATOMIC_SAVE_RPC,
  atomicEditorSaveProtocolIsReady,
  createAtomicEditorSaveRpcArguments,
  materializeAtomicEditorSavePayload,
  parseAtomicEditorSaveResponse,
  type AtomicEditorSavePayload,
  type AtomicEditorSaveResponse,
} from "./editorAtomicSave.ts"

type ReplaySafeEditorOutbox = ReturnType<typeof createReplaySafeEditorOutbox>

export const EDITOR_ATOMIC_SAVE_BASE_RETRY_MS = 1_000
export const EDITOR_ATOMIC_SAVE_MAX_RETRY_MS = 30_000

export type AtomicSaveRpcError = {
  code?: string
  message?: string
  details?: string
  hint?: string
}

export type AtomicSaveRpcClient = {
  rpc(
    name: typeof EDITOR_ATOMIC_SAVE_RPC,
    arguments_: ReturnType<typeof createAtomicEditorSaveRpcArguments>,
  ): Promise<{ data: unknown; error: AtomicSaveRpcError | null }>
}

export type EditorSaveControllerInput = {
  ownerId: string
  documentId: string
  documentScopeId: string
  baseRevision: number
  payload: AtomicEditorSavePayload
}

export type EditorSaveControllerOutcome =
  | {
      status: "saved"
      response: Extract<AtomicEditorSaveResponse, { status: "saved" }>
      claim: EditorOutboxClaim
      followUpState: "none" | "pending" | "unknown"
      nextDocumentScopeId: string
      coordinationMode?: "web-lock" | "server-idempotency"
    }
  | {
      status: "conflict"
      response: Extract<AtomicEditorSaveResponse, { status: "conflict" }>
      claim: EditorOutboxClaim
      coordinationMode?: "web-lock" | "server-idempotency"
    }
  | {
      status: "not_found"
      response: Extract<AtomicEditorSaveResponse, { status: "not_found" }>
      claim: EditorOutboxClaim
      coordinationMode?: "web-lock" | "server-idempotency"
    }
  | {
      status:
        | "idle"
        | "manual_recovery"
        | "protocol_mismatch"
        | "outbox_unavailable"
        | "rpc_unavailable"
        | "request_rejected"
        | "acknowledgement_unknown"
        | "response_mismatch"
        | "settlement_failed"
        | "retry_later"
        | "offline"
      claim?: EditorOutboxClaim
      retryAt?: number
      error?: unknown
      coordinationMode?: "web-lock" | "server-idempotency"
    }

export type EditorLegacyRecoveryInspection = {
  blocked: boolean
  genericNewBackupKey: string | null
  legacyOperations: EditorOutboxManualRecoveryItem[]
  scanFailed: boolean
}

export type EditorSaveControllerOptions = {
  ownerId: string
  outbox: ReplaySafeEditorOutbox
  rpcClient: AtomicSaveRpcClient
  protocolMarker: unknown
  manualRecoveryBlocked?: boolean
  now?: () => number
  isOnline?: () => boolean
  retryJitter?: (delayMs: number, attempt: number, operationId: string) => number
  requestLock?: (<T>(name: string, task: () => Promise<T>) => Promise<T>) | null
}

const isNonemptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0

const localDraftKey = (ownerId: string, documentId: string) =>
  `wouldkeep:editor-draft:${ownerId}:${documentId}`

export const inspectLegacyEditorPersistence = async (input: {
  ownerId: string
  legacyRepository: EditorOutboxRepository
  storage: Pick<Storage, "getItem">
}): Promise<EditorLegacyRecoveryInspection> => {
  if (!isNonemptyString(input.ownerId)) throw new TypeError("ownerId is required")
  let genericNewBackupKey: string | null = null
  let legacyOperations: EditorOutboxManualRecoveryItem[] = []
  let scanFailed = false
  const candidateKey = localDraftKey(input.ownerId, "new")
  try {
    if (input.storage.getItem(candidateKey) !== null) genericNewBackupKey = candidateKey
  } catch {
    scanFailed = true
  }
  try {
    const rows = await input.legacyRepository.getAll()
    for (const row of rows) {
      const parsed = parseEditorOutboxRecord(row)
      if (parsed) {
        if (parsed.ownerId === input.ownerId) {
          legacyOperations.push({ reason: "legacy-protocol", record: parsed })
        }
        continue
      }
      if (
        !row ||
        typeof row !== "object" ||
        Array.isArray(row) ||
        !("ownerId" in row) ||
        typeof row.ownerId !== "string" ||
        row.ownerId === input.ownerId
      ) {
        scanFailed = true
      }
    }
  } catch {
    scanFailed = true
  }
  return {
    blocked: scanFailed || genericNewBackupKey !== null || legacyOperations.length > 0,
    genericNewBackupKey,
    legacyOperations,
    scanFailed,
  }
}

export const atomicSaveRpcIsUnavailable = (error: AtomicSaveRpcError | null | undefined) => {
  if (!error) return false
  if (error.code === "PGRST202" || error.code === "42883") return true
  const message = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`
  return /save_document_snapshot_v1[\s\S]*(?:not found|schema cache|does not exist)|(?:not found|schema cache|does not exist)[\s\S]*save_document_snapshot_v1/iu.test(
    message,
  )
}

export const atomicSaveRpcIsDeterministicRejection = (
  error: AtomicSaveRpcError | null | undefined,
) => {
  const code = error?.code?.trim() ?? ""
  return code === "42501" || code.startsWith("22") || code.startsWith("23")
}

const defaultRequestLock = () => {
  const locks = globalThis.navigator?.locks
  if (!locks) return null
  return <T>(name: string, task: () => Promise<T>) =>
    locks.request(name, { mode: "exclusive" }, task) as Promise<T>
}

const lockName = (ownerId: string, documentScopeId: string) =>
  `wouldkeep:editor:atomic-save:${encodeURIComponent(ownerId)}:${encodeURIComponent(
    documentScopeId,
  )}`

const deterministicRetryJitter = (delayMs: number, _attempt: number, operationId: string) => {
  let hash = 0
  for (const character of operationId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return Math.round(delayMs * (0.9 + (hash % 201) / 1_000))
}

export const editorAtomicSaveRetryDelay = (
  attempt: number,
  operationId: string,
  jitter = deterministicRetryJitter,
) => {
  const exponent = Math.max(0, Math.min(5, Math.trunc(attempt) - 1))
  const unjittered = Math.min(
    EDITOR_ATOMIC_SAVE_MAX_RETRY_MS,
    EDITOR_ATOMIC_SAVE_BASE_RETRY_MS * 2 ** exponent,
  )
  return Math.max(
    1,
    Math.min(EDITOR_ATOMIC_SAVE_MAX_RETRY_MS, Math.round(jitter(unjittered, attempt, operationId))),
  )
}

const assertResponseMatchesClaim = (
  response: AtomicEditorSaveResponse,
  claim: EditorOutboxClaim,
  payload: AtomicEditorSavePayload,
) => {
  if (
    response.operation_id !== claim.record.operationId ||
    response.knowledge_base_id !== payload.knowledgeBaseId
  ) {
    throw new AtomicEditorSaveContractError("RPC response identity does not match the claim")
  }
  if (response.status === "saved") {
    if (claim.record.documentId === "new") {
      if (response.created !== true || response.revision !== 0) {
        throw new AtomicEditorSaveContractError(
          "new-document saved response violates created/revision semantics",
        )
      }
    } else if (
      response.created !== false ||
      response.document_id !== claim.record.documentId ||
      response.revision !== claim.record.baseRevision + 1
    ) {
      throw new AtomicEditorSaveContractError(
        "existing-document saved response violates identity/revision semantics",
      )
    }
    return
  }
  if (response.status === "conflict") {
    if (
      claim.record.documentId === "new" ||
      response.created !== false ||
      response.document_id !== claim.record.documentId ||
      response.expected_revision !== claim.record.baseRevision
    ) {
      throw new AtomicEditorSaveContractError("conflict response does not match the claim")
    }
    return
  }
  if (response.created !== false) {
    throw new AtomicEditorSaveContractError("not_found response cannot claim a create")
  }
}

export const createEditorSaveController = (options: EditorSaveControllerOptions) => {
  if (!isNonemptyString(options.ownerId)) throw new TypeError("ownerId is required")
  const now = options.now ?? Date.now
  const isOnline = options.isOnline ?? (() => globalThis.navigator?.onLine !== false)
  const retryJitter = options.retryJitter ?? deterministicRetryJitter
  const requestLock = options.requestLock === undefined ? defaultRequestLock() : options.requestLock
  const coordinationMode = requestLock ? "web-lock" : "server-idempotency"
  const localTails = new Map<string, Promise<void>>()
  let manualRecoveryBlocked = Boolean(options.manualRecoveryBlocked)
  let closed = false

  const runExclusive = <T>(documentScopeId: string, task: () => Promise<T>) => {
    const previous = localTails.get(documentScopeId) ?? Promise.resolve()
    const run = async () => {
      if (!requestLock) return task()
      let entered = false
      try {
        const result = await requestLock(lockName(options.ownerId, documentScopeId), async () => {
          entered = true
          return task()
        })
        if (!entered) return task()
        return result
      } catch (error) {
        if (entered) throw error
        return task()
      }
    }
    const result = previous.catch(() => undefined).then(run)
    const tail = result.then(
      () => undefined,
      () => undefined,
    )
    localTails.set(documentScopeId, tail)
    void tail.then(() => {
      if (localTails.get(documentScopeId) === tail) localTails.delete(documentScopeId)
    })
    return result
  }

  const failClosedBeforeClaim = (): EditorSaveControllerOutcome | null => {
    if (closed || !atomicEditorSaveProtocolIsReady(options.protocolMarker)) {
      return { status: "protocol_mismatch" }
    }
    if (manualRecoveryBlocked) return { status: "manual_recovery" }
    return null
  }

  const invokeClaim = async (claim: EditorOutboxClaim): Promise<EditorSaveControllerOutcome> => {
    let payload: AtomicEditorSavePayload
    let rpcArguments: ReturnType<typeof createAtomicEditorSaveRpcArguments>
    try {
      if (
        claim.record.saveProtocol !== EDITOR_OUTBOX_REPLAY_PROTOCOL ||
        claim.record.ownerId !== options.ownerId ||
        claim.record.documentScopeId === undefined
      ) {
        throw new AtomicEditorSaveContractError("outbox claim is not a snapshot-v1 operation")
      }
      payload = materializeAtomicEditorSavePayload(claim.record.payload, {
        documentId: claim.record.documentId === "new" ? null : claim.record.documentId,
      })
      rpcArguments = createAtomicEditorSaveRpcArguments({
        operationId: claim.record.operationId,
        documentId: claim.record.documentId,
        baseRevision: claim.record.baseRevision,
        payload,
      })
    } catch (error) {
      return { status: "response_mismatch", claim, error }
    }

    let rpcResult: Awaited<ReturnType<AtomicSaveRpcClient["rpc"]>>
    try {
      rpcResult = await options.rpcClient.rpc(EDITOR_ATOMIC_SAVE_RPC, rpcArguments)
    } catch (error) {
      return { status: "acknowledgement_unknown", claim, error }
    }
    if (rpcResult.error) {
      if (atomicSaveRpcIsUnavailable(rpcResult.error)) {
        return { status: "rpc_unavailable", claim, error: rpcResult.error }
      }
      if (atomicSaveRpcIsDeterministicRejection(rpcResult.error)) {
        try {
          await options.outbox.markConflict(options.ownerId, claim.record.operationId)
        } catch (error) {
          return { status: "settlement_failed", claim, error }
        }
        return { status: "request_rejected", claim, error: rpcResult.error }
      }
      return { status: "acknowledgement_unknown", claim, error: rpcResult.error }
    }

    let response: AtomicEditorSaveResponse
    try {
      response = parseAtomicEditorSaveResponse(rpcResult.data)
      assertResponseMatchesClaim(response, claim, payload)
    } catch (error) {
      return { status: "response_mismatch", claim, error }
    }

    if (response.status === "saved") {
      try {
        const settled =
          claim.record.documentId === "new"
            ? await options.outbox.completeCreatedAfterSuccess(
                options.ownerId,
                claim,
                response.document_id,
                response.revision,
              )
            : await options.outbox.completeAfterSuccess(options.ownerId, claim, response.revision)
        if (!settled) return { status: "settlement_failed", claim }
      } catch (error) {
        return { status: "settlement_failed", claim, error }
      }
      const nextDocumentScopeId = response.document_id
      let followUpState: "none" | "pending" | "unknown" = "unknown"
      try {
        const remaining = await options.outbox.listForOwner(options.ownerId)
        followUpState = remaining.some((record) => record.documentScopeId === nextDocumentScopeId)
          ? "pending"
          : "none"
      } catch {
        // The acknowledgement and local settlement are already durable. A failed
        // inspection must preserve the UI backup and schedule another flush; it
        // must not disguise the saved document identity or replay the settled op.
        followUpState = "unknown"
      }
      return { status: "saved", response, claim, followUpState, nextDocumentScopeId }
    }
    try {
      await options.outbox.markConflict(options.ownerId, claim.record.operationId)
    } catch (error) {
      return { status: "settlement_failed", claim, error }
    }
    if (response.status === "conflict") {
      return { status: "conflict", response, claim }
    }
    return { status: "not_found", response, claim }
  }

  const flush = async (documentScopeId: string): Promise<EditorSaveControllerOutcome> => {
    const blocked = failClosedBeforeClaim()
    if (blocked) return blocked
    if (!isNonemptyString(documentScopeId) || documentScopeId === "new") {
      return { status: "protocol_mismatch" }
    }
    return runExclusive(documentScopeId, async () => {
      // A flush can wait behind another local request or a cross-tab Web Lock.
      // Re-check the gate after that wait so logout, controller disposal, or a
      // newly discovered manual-recovery block cannot claim or send stale work.
      const blockedAfterWait = failClosedBeforeClaim()
      if (blockedAfterWait) return blockedAfterWait
      if (!isOnline()) return { status: "offline" }
      let claim: EditorOutboxClaim | null
      try {
        await options.outbox.recoverInterrupted(options.ownerId, documentScopeId)
        const saving = (await options.outbox.listForOwner(options.ownerId)).find(
          (record) => record.documentScopeId === documentScopeId && record.status === "saving",
        )
        if (saving) {
          const retryAt =
            saving.updatedAt +
            editorAtomicSaveRetryDelay(saving.attempts, saving.operationId, retryJitter)
          if (retryAt > now()) return { status: "retry_later", retryAt }
        }
        claim = await options.outbox.claimNext(options.ownerId, documentScopeId)
      } catch (error) {
        return { status: "outbox_unavailable", error }
      }
      if (!claim) return { status: "idle" }
      return invokeClaim(claim)
    })
  }

  const enqueueAndSave = async (
    input: EditorSaveControllerInput,
  ): Promise<EditorSaveControllerOutcome> => {
    const blocked = failClosedBeforeClaim()
    if (blocked) return blocked
    if (input.ownerId !== options.ownerId) return { status: "protocol_mismatch" }
    let payload: AtomicEditorSavePayload
    try {
      payload = materializeAtomicEditorSavePayload(input.payload, {
        documentId: input.documentId === "new" ? null : input.documentId,
      })
      await options.outbox.enqueue({
        ownerId: input.ownerId,
        documentId: input.documentId,
        documentScopeId: input.documentScopeId,
        baseRevision: input.baseRevision,
        payload,
      })
    } catch (error) {
      return { status: "outbox_unavailable", error }
    }
    return flush(input.documentScopeId)
  }

  return {
    protocol: EDITOR_ATOMIC_SAVE_PROTOCOL,
    coordinationMode,
    enqueueAndSave: async (input: EditorSaveControllerInput) => ({
      ...(await enqueueAndSave(input)),
      coordinationMode,
    }),
    flush: async (documentScopeId: string) => ({
      ...(await flush(documentScopeId)),
      coordinationMode,
    }),
    setManualRecoveryBlocked: (blocked: boolean) => {
      manualRecoveryBlocked = blocked
    },
    close: () => {
      closed = true
    },
    isClosed: () => closed,
  }
}
