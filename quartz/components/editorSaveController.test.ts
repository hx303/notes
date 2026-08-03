import assert from "node:assert/strict"
import test from "node:test"
import {
  EDITOR_ATOMIC_SAVE_PROTOCOL,
  type AtomicEditorSavePayload,
  type AtomicEditorSaveRpcArguments,
} from "./scripts/editorAtomicSave"
import {
  createEditorOutbox,
  createMemoryEditorOutboxRepository,
  createMemoryReplaySafeEditorOutboxRepository,
  createReplaySafeEditorOutbox,
} from "./scripts/editorOutbox"
import {
  atomicSaveRpcIsDeterministicRejection,
  atomicSaveRpcIsUnavailable,
  createEditorSaveController,
  editorAtomicSaveRetryDelay,
  inspectLegacyEditorPersistence,
  type AtomicSaveRpcClient,
} from "./scripts/editorSaveController"

const OWNER_ID = "owner-a"
const DOCUMENT_ID = "00000000-0000-4000-8000-000000000001"
const KNOWLEDGE_BASE_ID = "00000000-0000-4000-8000-000000000002"
const DRAFT_SCOPE = "draft:00000000-0000-4000-8000-000000000003"

const payload = (title = "P1 save"): AtomicEditorSavePayload => ({
  requestVersion: 1,
  knowledgeBaseId: KNOWLEDGE_BASE_ID,
  snapshot: {
    title,
    body: "body",
    topic: "",
    maturity: "seed",
    visibility: "private",
    tags: [],
    prerequisites: [],
    related: [],
    sources: [],
  },
})

const savedResponse = (
  args: AtomicEditorSaveRpcArguments,
  overrides: Record<string, unknown> = {},
) => ({
  result_version: 1,
  status: "saved",
  operation_id: args.p_operation_id,
  document_id: args.p_document_id ?? DOCUMENT_ID,
  knowledge_base_id: args.p_knowledge_base_id,
  revision: args.p_document_id === null ? 0 : args.p_expected_revision + 1,
  created: args.p_document_id === null,
  saved_at: "2026-07-23T00:00:00.000Z",
  ...overrides,
})

const createHarness = (
  rpc: AtomicSaveRpcClient["rpc"],
  options: {
    protocolMarker?: unknown
    manualRecoveryBlocked?: boolean
    now?: () => number
    isOnline?: () => boolean
    retryJitter?: (delayMs: number, attempt: number, operationId: string) => number
    requestLock?: (<T>(name: string, task: () => Promise<T>) => Promise<T>) | null
  } = {},
) => {
  const repository = createMemoryReplaySafeEditorOutboxRepository()
  const outbox = createReplaySafeEditorOutbox(repository, {
    ...(options.now ? { now: options.now } : {}),
  })
  const controller = createEditorSaveController({
    ownerId: OWNER_ID,
    outbox,
    rpcClient: { rpc },
    protocolMarker: options.protocolMarker ?? EDITOR_ATOMIC_SAVE_PROTOCOL,
    manualRecoveryBlocked: options.manualRecoveryBlocked,
    now: options.now,
    isOnline: options.isOnline,
    retryJitter: options.retryJitter,
    requestLock: options.requestLock ?? null,
  })
  return { repository, outbox, controller }
}

test("existing save persists the strict payload, binds the response, and settles the operation", async () => {
  const calls: AtomicEditorSaveRpcArguments[] = []
  const { outbox, controller } = createHarness(async (_name, args) => {
    calls.push(structuredClone(args))
    return { data: savedResponse(args), error: null }
  })
  const outcome = await controller.enqueueAndSave({
    ownerId: OWNER_ID,
    documentId: DOCUMENT_ID,
    documentScopeId: DOCUMENT_ID,
    baseRevision: 7,
    payload: payload(),
  })
  assert.equal(outcome.status, "saved")
  if (outcome.status === "saved") {
    assert.equal(outcome.followUpState, "none")
    assert.equal(outcome.nextDocumentScopeId, DOCUMENT_ID)
  }
  assert.equal(calls.length, 1)
  assert.deepEqual(Object.keys(calls[0]!.p_snapshot), [
    "title",
    "body",
    "topic",
    "maturity",
    "visibility",
    "tags",
    "prerequisites",
    "related",
    "sources",
  ])
  assert.deepEqual(await outbox.listForOwner(OWNER_ID), [])
})

test("new save uses null plus zero and binds the draft atomically before reporting saved", async () => {
  const { repository, outbox, controller } = createHarness(async (_name, args) => ({
    data: savedResponse(args),
    error: null,
  }))
  const outcome = await controller.enqueueAndSave({
    ownerId: OWNER_ID,
    documentId: "new",
    documentScopeId: DRAFT_SCOPE,
    baseRevision: 0,
    payload: payload("new"),
  })
  assert.equal(outcome.status, "saved")
  if (outcome.status !== "saved") return
  assert.equal(outcome.followUpState, "none")
  assert.equal(outcome.nextDocumentScopeId, DOCUMENT_ID)
  assert.equal(outcome.response.created, true)
  assert.equal(outcome.response.revision, 0)
  assert.deepEqual(await outbox.listForOwner(OWNER_ID), [])
  const binding = await repository.getScopeBinding(OWNER_ID, DRAFT_SCOPE)
  assert.ok(binding)
  assert.equal(typeof binding.updatedAt, "number")
  assert.deepEqual(
    { ...binding, updatedAt: 0 },
    {
      storageKind: "snapshot-v1-scope-binding",
      operationId: `snapshot-v1-scope-binding:${OWNER_ID}:${DRAFT_SCOPE}`,
      ownerId: OWNER_ID,
      documentScopeId: DRAFT_SCOPE,
      documentId: DOCUMENT_ID,
      baseRevision: 0,
      updatedAt: 0,
    },
  )
})

test("lost acknowledgement retries the exact operation and payload after persisted backoff", async () => {
  let clock = 1_000
  const calls: AtomicEditorSaveRpcArguments[] = []
  const { controller } = createHarness(
    async (_name, args) => {
      calls.push(structuredClone(args))
      if (calls.length === 1) return { data: null, error: { message: "network reset" } }
      return { data: savedResponse(args), error: null }
    },
    {
      now: () => clock,
      retryJitter: (delay) => delay,
    },
  )
  const unknown = await controller.enqueueAndSave({
    ownerId: OWNER_ID,
    documentId: DOCUMENT_ID,
    documentScopeId: DOCUMENT_ID,
    baseRevision: 2,
    payload: payload(),
  })
  assert.equal(unknown.status, "acknowledgement_unknown")
  const cooled = await controller.flush(DOCUMENT_ID)
  assert.equal(cooled.status, "retry_later")
  if (cooled.status !== "retry_later") return
  clock = cooled.retryAt!
  const outcome = await controller.flush(DOCUMENT_ID)
  assert.equal(outcome.status, "saved")
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[1], calls[0])
})

test("network failures retain one saving operation and persist the capped retry schedule", async () => {
  let clock = 1_000
  let calls = 0
  const { outbox, controller } = createHarness(
    async () => {
      calls += 1
      throw new Error("offline")
    },
    {
      now: () => clock,
      retryJitter: (delay) => delay,
    },
  )
  const first = await controller.enqueueAndSave({
    ownerId: OWNER_ID,
    documentId: DOCUMENT_ID,
    documentScopeId: DOCUMENT_ID,
    baseRevision: 4,
    payload: payload(),
  })
  assert.equal(first.status, "acknowledgement_unknown")
  assert.equal(calls, 1)
  const records = await outbox.listForOwner(OWNER_ID)
  assert.equal(records.length, 1)
  assert.equal(records[0]!.status, "saving")
  assert.equal(records[0]!.baseRevision, 4)

  const cooled = await controller.flush(DOCUMENT_ID)
  assert.equal(cooled.status, "retry_later")
  assert.equal(calls, 1)
  if (cooled.status !== "retry_later") return
  assert.equal(cooled.retryAt! - records[0]!.updatedAt, 1_000)
  clock = cooled.retryAt!
  assert.equal((await controller.flush(DOCUMENT_ID)).status, "acknowledgement_unknown")
  assert.equal(calls, 2)
  assert.equal((await outbox.listForOwner(OWNER_ID))[0]!.operationId, records[0]!.operationId)

  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7].map((attempt) =>
      editorAtomicSaveRetryDelay(attempt, "operation", (delay) => delay),
    ),
    [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000],
  )
})

test("RPC absence, protocol mismatch, manual recovery, and outbox failure never fall back", async () => {
  let rpcCalls = 0
  const rpc: AtomicSaveRpcClient["rpc"] = async () => {
    rpcCalls += 1
    return {
      data: null,
      error: { code: "PGRST202", message: "save_document_snapshot_v1 not in schema cache" },
    }
  }
  const unavailable = createHarness(rpc)
  assert.equal(
    (
      await unavailable.controller.enqueueAndSave({
        ownerId: OWNER_ID,
        documentId: DOCUMENT_ID,
        documentScopeId: DOCUMENT_ID,
        baseRevision: 0,
        payload: payload(),
      })
    ).status,
    "rpc_unavailable",
  )
  assert.equal(rpcCalls, 1)

  const mismatched = createHarness(rpc, { protocolMarker: "legacy-multiwrite" })
  assert.equal(
    (
      await mismatched.controller.enqueueAndSave({
        ownerId: OWNER_ID,
        documentId: DOCUMENT_ID,
        documentScopeId: DOCUMENT_ID,
        baseRevision: 0,
        payload: payload(),
      })
    ).status,
    "protocol_mismatch",
  )
  const gated = createHarness(rpc, { manualRecoveryBlocked: true })
  assert.equal(
    (
      await gated.controller.enqueueAndSave({
        ownerId: OWNER_ID,
        documentId: DOCUMENT_ID,
        documentScopeId: DOCUMENT_ID,
        baseRevision: 0,
        payload: payload(),
      })
    ).status,
    "manual_recovery",
  )
  assert.equal(rpcCalls, 1)

  const brokenRepository = createMemoryReplaySafeEditorOutboxRepository()
  brokenRepository.put = async () => {
    throw new Error("IndexedDB unavailable")
  }
  const brokenController = createEditorSaveController({
    ownerId: OWNER_ID,
    outbox: createReplaySafeEditorOutbox(brokenRepository),
    rpcClient: { rpc },
    protocolMarker: EDITOR_ATOMIC_SAVE_PROTOCOL,
    requestLock: null,
  })
  assert.equal(
    (
      await brokenController.enqueueAndSave({
        ownerId: OWNER_ID,
        documentId: DOCUMENT_ID,
        documentScopeId: DOCUMENT_ID,
        baseRevision: 0,
        payload: payload(),
      })
    ).status,
    "outbox_unavailable",
  )
  assert.equal(rpcCalls, 1)
})

test("response identity, created semantics, and revision drift fail closed before settlement", async () => {
  const cases: Array<Record<string, unknown>> = [
    { operation_id: "other-operation" },
    { knowledge_base_id: "00000000-0000-4000-8000-000000000099" },
    { document_id: "00000000-0000-4000-8000-000000000099" },
    { created: true },
    { revision: 99 },
  ]
  for (const override of cases) {
    const { outbox, controller } = createHarness(async (_name, args) => ({
      data: savedResponse(args, override),
      error: null,
    }))
    const outcome = await controller.enqueueAndSave({
      ownerId: OWNER_ID,
      documentId: DOCUMENT_ID,
      documentScopeId: DOCUMENT_ID,
      baseRevision: 5,
      payload: payload(),
    })
    assert.equal(outcome.status, "response_mismatch")
    assert.equal((await outbox.listForOwner(OWNER_ID))[0]!.status, "saving")
  }

  const invalidNew = createHarness(async (_name, args) => ({
    data: savedResponse(args, { created: false }),
    error: null,
  }))
  const newOutcome = await invalidNew.controller.enqueueAndSave({
    ownerId: OWNER_ID,
    documentId: "new",
    documentScopeId: DRAFT_SCOPE,
    baseRevision: 0,
    payload: payload(),
  })
  assert.equal(newOutcome.status, "response_mismatch")
  assert.equal(await invalidNew.repository.getScopeBinding(OWNER_ID, DRAFT_SCOPE), null)
})

test("conflict and not_found are frozen for explicit recovery", async () => {
  const conflictHarness = createHarness(async (_name, args) => ({
    data: {
      result_version: 1,
      status: "conflict",
      operation_id: args.p_operation_id,
      document_id: DOCUMENT_ID,
      knowledge_base_id: KNOWLEDGE_BASE_ID,
      expected_revision: 3,
      current_revision: 4,
      created: false,
      saved_at: null,
    },
    error: null,
  }))
  const conflict = await conflictHarness.controller.enqueueAndSave({
    ownerId: OWNER_ID,
    documentId: DOCUMENT_ID,
    documentScopeId: DOCUMENT_ID,
    baseRevision: 3,
    payload: payload(),
  })
  assert.equal(conflict.status, "conflict")
  assert.equal((await conflictHarness.outbox.listForOwner(OWNER_ID))[0]!.status, "conflict")

  const notFoundHarness = createHarness(async (_name, args) => ({
    data: {
      result_version: 1,
      status: "not_found",
      operation_id: args.p_operation_id,
      knowledge_base_id: KNOWLEDGE_BASE_ID,
      created: false,
      saved_at: null,
    },
    error: null,
  }))
  const notFound = await notFoundHarness.controller.enqueueAndSave({
    ownerId: OWNER_ID,
    documentId: DOCUMENT_ID,
    documentScopeId: DOCUMENT_ID,
    baseRevision: 3,
    payload: payload(),
  })
  assert.equal(notFound.status, "not_found")
  assert.equal((await notFoundHarness.outbox.listForOwner(OWNER_ID))[0]!.status, "conflict")
})

test("same-tab requests serialize claim through settlement and preserve the follow-up", async () => {
  let releaseFirst!: () => void
  const firstBarrier = new Promise<void>((resolve) => (releaseFirst = resolve))
  const calls: AtomicEditorSaveRpcArguments[] = []
  const { controller } = createHarness(async (_name, args) => {
    calls.push(structuredClone(args))
    if (calls.length === 1) await firstBarrier
    return { data: savedResponse(args), error: null }
  })
  const first = controller.enqueueAndSave({
    ownerId: OWNER_ID,
    documentId: DOCUMENT_ID,
    documentScopeId: DOCUMENT_ID,
    baseRevision: 0,
    payload: payload("first"),
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  const second = controller.enqueueAndSave({
    ownerId: OWNER_ID,
    documentId: DOCUMENT_ID,
    documentScopeId: DOCUMENT_ID,
    baseRevision: 0,
    payload: payload("follow-up"),
  })
  releaseFirst()
  const outcomes = await Promise.all([first, second])
  assert.deepEqual(
    outcomes.map((outcome) => outcome.status),
    ["saved", "saved"],
  )
  assert.equal(outcomes[0]?.status === "saved" && outcomes[0].followUpState, "pending")
  assert.equal(outcomes[1]?.status === "saved" && outcomes[1].followUpState, "none")
  assert.equal(calls.length, 2)
  assert.equal(calls[0]!.p_expected_revision, 0)
  assert.equal(calls[1]!.p_expected_revision, 1)
  assert.equal(calls[1]!.p_snapshot.title, "follow-up")
})

test("closing while a follow-up waits prevents another claim or RPC", async () => {
  let releaseFirst!: () => void
  let reportFirstRpc!: () => void
  const firstRpcEntered = new Promise<void>((resolve) => (reportFirstRpc = resolve))
  const firstBarrier = new Promise<void>((resolve) => (releaseFirst = resolve))
  const calls: AtomicEditorSaveRpcArguments[] = []
  const { outbox, controller } = createHarness(async (_name, args) => {
    calls.push(structuredClone(args))
    if (calls.length === 1) {
      reportFirstRpc()
      await firstBarrier
    }
    return { data: savedResponse(args), error: null }
  })

  const first = controller.enqueueAndSave({
    ownerId: OWNER_ID,
    documentId: DOCUMENT_ID,
    documentScopeId: DOCUMENT_ID,
    baseRevision: 0,
    payload: payload("first"),
  })
  await firstRpcEntered
  const waiting = controller.enqueueAndSave({
    ownerId: OWNER_ID,
    documentId: DOCUMENT_ID,
    documentScopeId: DOCUMENT_ID,
    baseRevision: 0,
    payload: payload("must remain queued"),
  })
  controller.close()
  releaseFirst()

  assert.equal((await first).status, "saved")
  assert.equal((await waiting).status, "protocol_mismatch")
  assert.equal(calls.length, 1)
  const remaining = await outbox.listForOwner(OWNER_ID)
  assert.equal(remaining.length, 1)
  assert.equal(remaining[0]?.status, "queued")
  assert.equal(remaining[0]?.baseRevision, 1)
  const remainingPayload = remaining[0]?.payload as AtomicEditorSavePayload | undefined
  assert.deepEqual(remainingPayload, payload("must remain queued"))
})

test("the injected Web Lock encloses claim, RPC, and settlement before the next claim", async () => {
  const repository = createMemoryReplaySafeEditorOutboxRepository()
  const durableOutbox = createReplaySafeEditorOutbox(repository)
  const events: string[] = []
  let lockDepth = 0
  let rpcCalls = 0
  let releaseFirstRpc!: () => void
  let reportFirstRpc!: () => void
  const firstRpcEntered = new Promise<void>((resolve) => (reportFirstRpc = resolve))
  const firstRpcBarrier = new Promise<void>((resolve) => (releaseFirstRpc = resolve))
  const insideLock = (event: string) => {
    assert.equal(lockDepth, 1, `${event} escaped the injected Web Lock`)
    events.push(event)
  }
  const outbox = {
    ...durableOutbox,
    recoverInterrupted: async (...args: Parameters<typeof durableOutbox.recoverInterrupted>) => {
      insideLock("recover")
      return durableOutbox.recoverInterrupted(...args)
    },
    listForOwner: async (...args: Parameters<typeof durableOutbox.listForOwner>) => {
      insideLock("list")
      return durableOutbox.listForOwner(...args)
    },
    claimNext: async (...args: Parameters<typeof durableOutbox.claimNext>) => {
      insideLock("claim")
      return durableOutbox.claimNext(...args)
    },
    completeAfterSuccess: async (
      ...args: Parameters<typeof durableOutbox.completeAfterSuccess>
    ) => {
      insideLock("complete")
      return durableOutbox.completeAfterSuccess(...args)
    },
  }
  const controller = createEditorSaveController({
    ownerId: OWNER_ID,
    outbox,
    rpcClient: {
      rpc: async (_name, args) => {
        insideLock("rpc")
        rpcCalls += 1
        if (rpcCalls === 1) {
          reportFirstRpc()
          await firstRpcBarrier
        }
        return { data: savedResponse(args), error: null }
      },
    },
    protocolMarker: EDITOR_ATOMIC_SAVE_PROTOCOL,
    requestLock: async <T>(_name: string, task: () => Promise<T>) => {
      assert.equal(lockDepth, 0)
      lockDepth += 1
      events.push("lock-enter")
      try {
        return await task()
      } finally {
        events.push("lock-exit")
        lockDepth -= 1
      }
    },
  })

  const first = controller.enqueueAndSave({
    ownerId: OWNER_ID,
    documentId: DOCUMENT_ID,
    documentScopeId: DOCUMENT_ID,
    baseRevision: 0,
    payload: payload("first"),
  })
  await firstRpcEntered
  const second = controller.enqueueAndSave({
    ownerId: OWNER_ID,
    documentId: DOCUMENT_ID,
    documentScopeId: DOCUMENT_ID,
    baseRevision: 0,
    payload: payload("second"),
  })
  releaseFirstRpc()
  const outcomes = await Promise.all([first, second])

  assert.deepEqual(
    outcomes.map((outcome) => [outcome.status, outcome.coordinationMode]),
    [
      ["saved", "web-lock"],
      ["saved", "web-lock"],
    ],
  )
  assert.deepEqual(events, [
    "lock-enter",
    "recover",
    "list",
    "claim",
    "rpc",
    "complete",
    "list",
    "lock-exit",
    "lock-enter",
    "recover",
    "list",
    "claim",
    "rpc",
    "complete",
    "list",
    "lock-exit",
  ])
})

test("a post-settlement inspection failure reports unknown without replaying the settled op", async () => {
  const repository = createMemoryReplaySafeEditorOutboxRepository()
  const durableOutbox = createReplaySafeEditorOutbox(repository)
  let listCalls = 0
  let rpcCalls = 0
  const outbox = {
    ...durableOutbox,
    listForOwner: async (...args: Parameters<typeof durableOutbox.listForOwner>) => {
      listCalls += 1
      if (listCalls === 2) throw new Error("post-settlement IndexedDB read failed")
      return durableOutbox.listForOwner(...args)
    },
  }
  const controller = createEditorSaveController({
    ownerId: OWNER_ID,
    outbox,
    rpcClient: {
      rpc: async (_name, args) => {
        rpcCalls += 1
        return { data: savedResponse(args), error: null }
      },
    },
    protocolMarker: EDITOR_ATOMIC_SAVE_PROTOCOL,
    requestLock: null,
  })
  const outcome = await controller.enqueueAndSave({
    ownerId: OWNER_ID,
    documentId: DOCUMENT_ID,
    documentScopeId: DOCUMENT_ID,
    baseRevision: 0,
    payload: payload(),
  })
  assert.equal(outcome.status, "saved")
  if (outcome.status !== "saved") return
  assert.equal(outcome.followUpState, "unknown")
  assert.equal(rpcCalls, 1)
  assert.deepEqual(await repository.getAll(), [])
})

test("startup inspection is owner-scoped, read-only, and blocks legacy or generic-new recovery", async () => {
  const repository = createMemoryEditorOutboxRepository()
  const legacy = createEditorOutbox(repository, {
    createOperationId: () => "legacy-operation",
    now: () => 1,
    runExclusiveMutation: async (task) => task(),
  })
  await legacy.enqueue({
    ownerId: OWNER_ID,
    documentId: DOCUMENT_ID,
    baseRevision: 1,
    payload: { form: { title: "legacy" } },
  })
  const storage = new Map<string, string>([
    [`wouldkeep:editor-draft:${OWNER_ID}:new`, '{"title":"generic"}'],
  ])
  const inspected = await inspectLegacyEditorPersistence({
    ownerId: OWNER_ID,
    legacyRepository: repository,
    storage: { getItem: (key) => storage.get(key) ?? null },
  })
  assert.equal(inspected.blocked, true)
  assert.equal(inspected.legacyOperations.length, 1)
  assert.equal(inspected.genericNewBackupKey, `wouldkeep:editor-draft:${OWNER_ID}:new`)
  assert.equal((await repository.getAll()).length, 1)

  const otherOwner = await inspectLegacyEditorPersistence({
    ownerId: "owner-b",
    legacyRepository: repository,
    storage: { getItem: () => null },
  })
  assert.equal(otherOwner.blocked, false)
})

test("legacy physical-store corruption and future protocols fail closed for the current owner", async () => {
  const corruptedRepository = createMemoryEditorOutboxRepository([
    {
      key: "future-operation",
      value: {
        schemaVersion: 99,
        operationId: "future-operation",
        ownerId: OWNER_ID,
        documentId: DOCUMENT_ID,
        baseRevision: 1,
        payload: {},
        createdAt: 1,
        updatedAt: 1,
        attempts: 0,
        status: "queued",
        saveProtocol: "future-protocol",
      } as never,
    },
  ])
  const corrupted = await inspectLegacyEditorPersistence({
    ownerId: OWNER_ID,
    legacyRepository: corruptedRepository,
    storage: { getItem: () => null },
  })
  assert.equal(corrupted.blocked, true)
  assert.equal(corrupted.scanFailed, true)

  const misplacedSnapshotRepository = createMemoryEditorOutboxRepository([
    {
      key: "misplaced-snapshot",
      value: {
        schemaVersion: 1,
        operationId: "misplaced-snapshot",
        ownerId: OWNER_ID,
        documentId: DOCUMENT_ID,
        documentScopeId: DOCUMENT_ID,
        baseRevision: 1,
        payload: {},
        createdAt: 1,
        updatedAt: 1,
        attempts: 0,
        status: "saving",
        saveProtocol: "snapshot-v1",
      },
    },
  ])
  const misplaced = await inspectLegacyEditorPersistence({
    ownerId: OWNER_ID,
    legacyRepository: misplacedSnapshotRepository,
    storage: { getItem: () => null },
  })
  assert.equal(misplaced.blocked, true)
  assert.equal(misplaced.legacyOperations.length, 1)
})

test("RPC availability classifier recognizes only the atomic function readiness failures", () => {
  assert.equal(atomicSaveRpcIsUnavailable({ code: "PGRST202" }), true)
  assert.equal(
    atomicSaveRpcIsUnavailable({
      message: "Could not find public.save_document_snapshot_v1 in the schema cache",
    }),
    true,
  )
  assert.equal(atomicSaveRpcIsUnavailable({ message: "network reset" }), false)
})

test("deterministic SQL rejection freezes the exact operation instead of retrying forever", async () => {
  let calls = 0
  const { outbox, controller } = createHarness(async () => {
    calls += 1
    return {
      data: null,
      error: { code: "22023", message: "operation_id_reused" },
    }
  })
  const rejected = await controller.enqueueAndSave({
    ownerId: OWNER_ID,
    documentId: DOCUMENT_ID,
    documentScopeId: DOCUMENT_ID,
    baseRevision: 2,
    payload: payload(),
  })
  assert.equal(rejected.status, "request_rejected")
  assert.equal(calls, 1)
  assert.equal((await outbox.listForOwner(OWNER_ID))[0]!.status, "conflict")
  assert.equal((await controller.flush(DOCUMENT_ID)).status, "idle")
  assert.equal(calls, 1)

  assert.equal(atomicSaveRpcIsDeterministicRejection({ code: "22023" }), true)
  assert.equal(atomicSaveRpcIsDeterministicRejection({ code: "23514" }), true)
  assert.equal(atomicSaveRpcIsDeterministicRejection({ code: "42501" }), true)
  assert.equal(atomicSaveRpcIsDeterministicRejection({ code: "40001" }), false)
  assert.equal(atomicSaveRpcIsDeterministicRejection({ message: "network reset" }), false)
})
