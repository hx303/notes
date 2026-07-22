import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import {
  EditorOutboxAtomicOperationRequiredError,
  EditorOutboxManualRecoveryRequiredError,
  EditorOutboxOwnershipError,
  EditorOutboxReplaySettlementRequiredError,
  EditorOutboxScopeBindingCorruptError,
  EditorOutboxStorageIsolationError,
  EDITOR_OUTBOX_DATABASE_NAME,
  EDITOR_OUTBOX_REPLAY_DATABASE_NAME,
  EDITOR_OUTBOX_REPLAY_PROTOCOL,
  EDITOR_OUTBOX_SCHEMA_VERSION,
  EDITOR_OUTBOX_REPLAY_STORE_NAME,
  EDITOR_OUTBOX_STORE_NAME,
  createEditorOutbox,
  createMemoryEditorOutboxRepository,
  createMemoryReplaySafeEditorOutboxRepository,
  createReplaySafeEditorOutbox,
  listLegacyEditorOutboxForManualRecovery,
  parseEditorOutboxRecord,
} from "./scripts/editorOutbox"

const accountScript = readFileSync(
  new URL("./scripts/accountPage.inline.ts", import.meta.url),
  "utf8",
)

const DRAFT_SCOPE_A = "draft:00000000-0000-4000-8000-000000000001"
const DRAFT_SCOPE_B = "draft:00000000-0000-4000-8000-000000000002"
const DRAFT_SCOPE_LOST_ACK = "draft:00000000-0000-4000-8000-000000000003"
const DRAFT_SCOPE_SETTLEMENT = "draft:00000000-0000-4000-8000-000000000004"
const DRAFT_SCOPE_STALE = "draft:00000000-0000-4000-8000-000000000005"
const CREATED_DOCUMENT_ID = "00000000-0000-4000-8000-000000000101"
const CREATED_DOCUMENT_A_ID = "00000000-0000-4000-8000-000000000102"
const CREATED_DOCUMENT_B_ID = "00000000-0000-4000-8000-000000000103"

const clock = (...values: number[]) => {
  let fallback = values.at(-1) ?? 0
  return () => {
    fallback = values.shift() ?? fallback + 1
    return fallback
  }
}

const operationIds =
  (...values: string[]) =>
  () =>
    values.shift() ?? "unexpected-operation"

const createSharedExclusiveLock = () => {
  let tail: Promise<void> = Promise.resolve()
  return <T>(operation: () => Promise<T>) => {
    const result = tail.then(operation, operation)
    tail = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
}

test("the replay-safe foundation stays disconnected from the legacy multi-write save path", () => {
  assert.match(accountScript, /createEditorOutbox\(createIndexedDbEditorOutboxRepository\(\)\)/)
  assert.doesNotMatch(accountScript, /createReplaySafeEditorOutbox/)
  assert.doesNotMatch(accountScript, /save_document_snapshot_v1/)
})

test("legacy and snapshot-v1 operations stay physically isolated during old/new coexistence", async () => {
  assert.notEqual(EDITOR_OUTBOX_REPLAY_DATABASE_NAME, EDITOR_OUTBOX_DATABASE_NAME)
  assert.notEqual(EDITOR_OUTBOX_REPLAY_STORE_NAME, EDITOR_OUTBOX_STORE_NAME)

  const legacyRepository = createMemoryEditorOutboxRepository()
  const atomicRepository = createMemoryReplaySafeEditorOutboxRepository()
  assert.throws(() => createEditorOutbox(atomicRepository), EditorOutboxStorageIsolationError)
  const legacyOutbox = createEditorOutbox(legacyRepository, {
    now: clock(10, 20, 30, 40, 50, 60),
    createOperationId: operationIds(
      "legacy-saving",
      "legacy-queued",
      "legacy-conflict",
      "legacy-other-owner",
    ),
  })
  await legacyOutbox.enqueue({
    ownerId: "owner-a",
    documentId: "new",
    baseRevision: 0,
    payload: { title: "legacy acknowledgement unknown" },
  })
  const legacySaving = await legacyOutbox.claimNext("owner-a", "new")
  assert.ok(legacySaving)
  await legacyOutbox.enqueue({
    ownerId: "owner-a",
    documentId: "document-b",
    baseRevision: 2,
    payload: { title: "legacy queued may already be coalesced" },
  })
  await legacyOutbox.enqueue({
    ownerId: "owner-a",
    documentId: "document-c",
    baseRevision: 4,
    payload: { title: "legacy conflict" },
  })
  const legacyConflict = await legacyOutbox.claimNext("owner-a", "document-c")
  assert.ok(legacyConflict)
  await legacyOutbox.markConflict("owner-a", legacyConflict.record.operationId)
  await legacyOutbox.enqueue({
    ownerId: "owner-b",
    documentId: "document-b",
    baseRevision: 9,
    payload: { title: "other owner" },
  })

  const atomicOutbox = createReplaySafeEditorOutbox(atomicRepository, {
    now: clock(70, 80),
    createOperationId: operationIds("atomic-saving"),
  })
  const atomicQueued = await atomicOutbox.enqueue({
    ownerId: "owner-a",
    documentId: "document-a",
    baseRevision: 5,
    payload: { title: "atomic request" },
  })
  const atomicClaim = await atomicOutbox.claimNext("owner-a", "document-a")
  assert.ok(atomicClaim)
  assert.equal(atomicClaim.record.saveProtocol, EDITOR_OUTBOX_REPLAY_PROTOCOL)

  await legacyOutbox.recoverInterrupted("owner-a")
  assert.equal(
    (await atomicOutbox.listForOwner("owner-a")).find(
      ({ operationId }) => operationId === atomicQueued.operationId,
    )?.status,
    "saving",
  )
  assert.equal(
    (await legacyOutbox.listForOwner("owner-a")).some(
      ({ operationId }) => operationId === atomicQueued.operationId,
    ),
    false,
  )
  assert.equal(
    (await atomicOutbox.listForOwner("owner-a")).some(
      ({ operationId }) => operationId === legacySaving.record.operationId,
    ),
    false,
  )

  const beforeInspection = structuredClone(await legacyRepository.getAll())
  const manual = await listLegacyEditorOutboxForManualRecovery(legacyRepository, "owner-a")
  assert.deepEqual(manual.map(({ record }) => record.operationId).sort(), [
    "legacy-conflict",
    "legacy-queued",
    "legacy-saving",
  ])
  assert.ok(manual.every(({ reason }) => reason === "legacy-protocol"))
  assert.deepEqual(await legacyRepository.getAll(), beforeInspection)

  assert.throws(
    () => createReplaySafeEditorOutbox(legacyRepository as never),
    EditorOutboxStorageIsolationError,
  )
})

test("snapshot-v1 never claims legacy schema rows and exposes them for manual recovery", async () => {
  const legacyRow = (
    operationId: string,
    documentId: string,
    status: "queued" | "saving" | "conflict",
    ownerId = "owner-a",
  ) => ({
    schemaVersion: 1,
    operationId,
    ownerId,
    documentId,
    baseRevision: documentId === "new" ? 0 : 6,
    payload: { title: operationId },
    createdAt: 10,
    updatedAt: 10,
    attempts: status === "queued" ? 0 : 1,
    status,
  })
  const repository = createMemoryReplaySafeEditorOutboxRepository([
    { key: "legacy-new-saving", value: legacyRow("legacy-new-saving", "new", "saving") },
    {
      key: "legacy-existing-saving",
      value: legacyRow("legacy-existing-saving", "document-a", "saving"),
    },
    { key: "legacy-queued", value: legacyRow("legacy-queued", "document-b", "queued") },
    {
      key: "legacy-conflict",
      value: legacyRow("legacy-conflict", "document-c", "conflict"),
    },
    {
      key: "other-owner-saving",
      value: legacyRow("other-owner-saving", "document-a", "saving", "owner-b"),
    },
  ])
  const outbox = createReplaySafeEditorOutbox(repository, {
    now: clock(20, 30),
    createOperationId: operationIds("must-not-migrate"),
  })

  const before = structuredClone(await repository.getAll())
  assert.deepEqual(await outbox.recoverInterrupted("owner-a"), [])
  assert.equal(await outbox.claimNext("owner-a"), null)
  assert.deepEqual(
    (await outbox.listManualRecoveryForOwner("owner-a")).map(({ record }) => [
      record.operationId,
      record.status,
    ]),
    [
      ["legacy-conflict", "conflict"],
      ["legacy-existing-saving", "saving"],
      ["legacy-new-saving", "saving"],
      ["legacy-queued", "queued"],
    ],
  )
  assert.deepEqual(await repository.getAll(), before)
  assert.deepEqual(await outbox.listForOwner("owner-a"), [])
  await assert.rejects(
    () =>
      outbox.enqueue({
        ownerId: "owner-a",
        documentId: "new",
        documentScopeId: DRAFT_SCOPE_A,
        baseRevision: 0,
        payload: { title: "must stay blocked" },
      }),
    EditorOutboxManualRecoveryRequiredError,
  )
  assert.equal((await outbox.listManualRecoveryForOwner("owner-b")).length, 1)
})

test("snapshot-v1 requires a stable local scope for every new draft", async () => {
  const repository = createMemoryReplaySafeEditorOutboxRepository()
  const outbox = createReplaySafeEditorOutbox(repository, {
    now: clock(10, 20),
    createOperationId: operationIds("existing-operation"),
  })

  await assert.rejects(
    () =>
      outbox.enqueue({
        ownerId: "owner-a",
        documentId: "new",
        baseRevision: 0,
        payload: { title: "missing scope" },
      }),
    /documentScopeId/,
  )
  await assert.rejects(
    () =>
      outbox.enqueue({
        ownerId: "owner-a",
        documentId: "new",
        documentScopeId: "draft:",
        baseRevision: 0,
        payload: { title: "empty draft id" },
      }),
    /documentScopeId/,
  )
  await assert.rejects(
    () =>
      outbox.enqueue({
        ownerId: "owner-a",
        documentId: "new",
        documentScopeId: "draft:new",
        baseRevision: 0,
        payload: { title: "generic draft id" },
      }),
    /documentScopeId/,
  )
  await assert.rejects(
    () =>
      outbox.enqueue({
        ownerId: "owner-a",
        documentId: "new",
        documentScopeId: "new",
        baseRevision: 0,
        payload: { title: "generic scope" },
      }),
    /documentScopeId/,
  )
  await assert.rejects(() => outbox.claimNext("owner-a", "new"), /draft:<uuid>/)
  await assert.rejects(() => outbox.recoverInterrupted("owner-a", "draft:new"), /draft:<uuid>/)
  const existing = await outbox.enqueue({
    ownerId: "owner-a",
    documentId: "document-existing",
    baseRevision: 4,
    payload: { title: "existing document" },
  })
  assert.equal(existing.documentScopeId, "document-existing")
})

test("snapshot-v1 rejects revision tokens outside JavaScript's safe integer range", async () => {
  const unsafeRevision = Number.MAX_SAFE_INTEGER + 1
  const replayRecord = {
    schemaVersion: EDITOR_OUTBOX_SCHEMA_VERSION,
    operationId: "unsafe-revision",
    ownerId: "owner-a",
    documentId: "document-a",
    documentScopeId: "document-a",
    baseRevision: unsafeRevision,
    payload: { title: "unsafe" },
    createdAt: 10,
    updatedAt: 10,
    attempts: 0,
    status: "queued",
    saveProtocol: EDITOR_OUTBOX_REPLAY_PROTOCOL,
  }
  assert.equal(parseEditorOutboxRecord(replayRecord), null)
  assert.ok(
    parseEditorOutboxRecord({
      ...replayRecord,
      saveProtocol: "legacy-multiwrite",
      documentScopeId: undefined,
    }),
  )

  const repository = createMemoryReplaySafeEditorOutboxRepository()
  const outbox = createReplaySafeEditorOutbox(repository, {
    now: clock(10, 20, 30),
    createOperationId: operationIds("safe-maximum"),
  })
  await assert.rejects(
    () =>
      outbox.enqueue({
        ownerId: "owner-a",
        documentId: "document-a",
        baseRevision: unsafeRevision,
        payload: { title: "must not persist" },
      }),
    /safe integer/,
  )
  assert.deepEqual(await outbox.listForOwner("owner-a"), [])

  await outbox.enqueue({
    ownerId: "owner-a",
    documentId: "document-a",
    baseRevision: Number.MAX_SAFE_INTEGER,
    payload: { title: "last safe token" },
  })
  const claim = await outbox.claimNext("owner-a", "document-a")
  assert.ok(claim)
  await assert.rejects(
    () => outbox.completeAfterSuccess("owner-a", claim, unsafeRevision),
    /safe integer/,
  )
  assert.equal((await outbox.listForOwner("owner-a"))[0]?.status, "saving")
  assert.equal(await outbox.completeAfterSuccess("owner-a", claim, Number.MAX_SAFE_INTEGER), true)
})

test("corrupt or non-canonical draft bindings fail closed before another insert", async () => {
  const bindingKey = `snapshot-v1-scope-binding:owner-a:${DRAFT_SCOPE_A}`
  const repository = createMemoryReplaySafeEditorOutboxRepository([
    {
      key: bindingKey,
      value: {
        storageKind: "snapshot-v1-scope-binding",
        operationId: bindingKey,
        ownerId: "owner-a",
        documentScopeId: DRAFT_SCOPE_A,
        documentId: "not-a-document-uuid",
        baseRevision: 0,
        updatedAt: 10,
      },
    },
  ])
  const outbox = createReplaySafeEditorOutbox(repository, {
    now: clock(20),
    createOperationId: operationIds("must-not-create"),
  })

  await assert.rejects(
    () =>
      outbox.enqueue({
        ownerId: "owner-a",
        documentId: "new",
        documentScopeId: DRAFT_SCOPE_A,
        baseRevision: 0,
        payload: { title: "must not become a second insert" },
      }),
    EditorOutboxScopeBindingCorruptError,
  )
  await assert.rejects(
    () => repository.getScopeBinding("owner-a", DRAFT_SCOPE_A),
    EditorOutboxScopeBindingCorruptError,
  )
  await assert.rejects(
    () =>
      repository.settleCreatedDocument(
        {
          storageKind: "snapshot-v1-scope-binding",
          operationId: bindingKey,
          ownerId: "owner-a",
          documentScopeId: DRAFT_SCOPE_A,
          documentId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
          baseRevision: 0,
          updatedAt: 20,
        },
        [],
        ["operation-create"],
      ),
    /valid snapshot-v1 draft binding/,
  )
  assert.deepEqual(await outbox.listForOwner("owner-a"), [])
})

test("refresh keeps an acknowledgement-unknown operation immutable and replays it first", async () => {
  const repository = createMemoryReplaySafeEditorOutboxRepository()
  const outbox = createReplaySafeEditorOutbox(repository, {
    now: clock(10, 20, 30, 40, 50),
    createOperationId: operationIds("operation-original", "operation-follow-up"),
  })
  const original = await outbox.enqueue({
    ownerId: "owner-a",
    documentId: "document-a",
    baseRevision: 7,
    payload: { form: { title: "sent payload", revision: 7 } },
  })
  const firstClaim = await outbox.claimNext("owner-a", "document-a")
  assert.ok(firstClaim)
  const followUp = await outbox.enqueue({
    ownerId: "owner-a",
    documentId: "document-a",
    baseRevision: 7,
    payload: { form: { title: "edited after send", revision: 7 } },
  })

  const recovered = await outbox.recoverInterrupted("owner-a", "document-a")
  assert.equal(recovered.length, 1)
  assert.deepEqual(recovered[0], firstClaim.record)

  const replay = await outbox.claimNext("owner-a", "document-a")
  assert.ok(replay)
  assert.equal(replay.record.operationId, original.operationId)
  assert.equal(replay.record.baseRevision, 7)
  assert.deepEqual(replay.record.payload, { form: { title: "sent payload", revision: 7 } })
  assert.equal(replay.record.status, "saving")
  assert.equal(replay.record.attempts, 2)

  const records = await outbox.listForOwner("owner-a")
  assert.equal(records.length, 2)
  assert.deepEqual(
    records.find(({ operationId }) => operationId === followUp.operationId)?.payload,
    { form: { title: "edited after send", revision: 7 } },
  )
})

test("network failure and unknown acknowledgement retain the original replay token", async () => {
  const repository = createMemoryReplaySafeEditorOutboxRepository()
  const outbox = createReplaySafeEditorOutbox(repository, {
    now: clock(10, 20, 30, 40, 50, 60),
    createOperationId: operationIds("operation-original", "operation-follow-up"),
  })
  await outbox.enqueue({
    ownerId: "owner-a",
    documentId: "document-a",
    baseRevision: 3,
    payload: { title: "exact request body" },
  })
  const firstClaim = await outbox.claimNext("owner-a", "document-a")
  assert.ok(firstClaim)
  await outbox.enqueue({
    ownerId: "owner-a",
    documentId: "document-a",
    baseRevision: 3,
    payload: { title: "new local edit" },
  })

  const retained = await outbox.requeueAfterFailure("owner-a", firstClaim)
  assert.ok(retained)
  assert.equal(retained.status, "saving")
  assert.equal(retained.operationId, firstClaim.record.operationId)
  assert.equal(retained.baseRevision, firstClaim.record.baseRevision)
  assert.deepEqual(retained.payload, firstClaim.record.payload)

  const replay = await outbox.claimNext("owner-a", "document-a")
  assert.ok(replay)
  assert.equal(replay.record.operationId, firstClaim.record.operationId)
  assert.deepEqual(replay.record.payload, firstClaim.record.payload)
  assert.equal(
    (await outbox.listForOwner("owner-a")).find(({ status }) => status === "queued")?.payload.title,
    "new local edit",
  )
})

test("a new-document lost acknowledgement cannot turn the follow-up into a second insert", async () => {
  const repository = createMemoryReplaySafeEditorOutboxRepository()
  const outbox = createReplaySafeEditorOutbox(repository, {
    now: clock(10, 20, 30, 40, 50, 60, 70, 80),
    createOperationId: operationIds("operation-create", "operation-follow-up"),
  })
  await outbox.enqueue({
    ownerId: "owner-a",
    documentId: "new",
    documentScopeId: DRAFT_SCOPE_LOST_ACK,
    baseRevision: 0,
    payload: { form: { documentId: "", title: "first insert" } },
  })
  const firstClaim = await outbox.claimNext("owner-a", DRAFT_SCOPE_LOST_ACK)
  assert.ok(firstClaim)
  await outbox.enqueue({
    ownerId: "owner-a",
    documentId: "new",
    documentScopeId: DRAFT_SCOPE_LOST_ACK,
    baseRevision: 0,
    payload: { form: { documentId: "", title: "edit after insert was sent" } },
  })
  await outbox.requeueAfterFailure("owner-a", firstClaim)

  const refreshed = createReplaySafeEditorOutbox(repository, {
    now: clock(90, 100, 110, 120),
    createOperationId: operationIds("must-not-be-created"),
  })
  await refreshed.recoverInterrupted("owner-a", DRAFT_SCOPE_LOST_ACK)
  const replay = await refreshed.claimNext("owner-a", DRAFT_SCOPE_LOST_ACK)
  assert.ok(replay)
  assert.equal(replay.record.operationId, "operation-create")
  assert.equal(replay.record.documentId, "new")
  assert.equal(replay.record.documentScopeId, DRAFT_SCOPE_LOST_ACK)
  assert.equal(replay.record.baseRevision, 0)
  assert.equal((replay.record.payload.form as { title?: string }).title, "first insert")

  // A future idempotent RPC receipt settles the immutable `new` operation and
  // migrates only the queued follow-up in one local durability transaction.
  await assert.rejects(
    () => refreshed.bindCreatedDocument("owner-a", replay, CREATED_DOCUMENT_ID, 0),
    EditorOutboxReplaySettlementRequiredError,
  )
  await assert.rejects(
    () =>
      refreshed.migrateNewDocument("owner-a", replay.record.operationId, CREATED_DOCUMENT_ID, 0),
    EditorOutboxReplaySettlementRequiredError,
  )
  await assert.rejects(
    () => refreshed.completeAfterSuccess("owner-a", replay, 1),
    EditorOutboxReplaySettlementRequiredError,
  )
  assert.equal(
    await refreshed.completeCreatedAfterSuccess("owner-a", replay, CREATED_DOCUMENT_ID, 0),
    true,
  )

  const remaining = await refreshed.listForOwner("owner-a")
  assert.equal(remaining.length, 1)
  assert.equal(remaining[0]?.operationId, "operation-follow-up")
  assert.equal(remaining[0]?.documentId, CREATED_DOCUMENT_ID)
  assert.equal(remaining[0]?.documentScopeId, CREATED_DOCUMENT_ID)
  assert.equal(remaining[0]?.baseRevision, 0)
  assert.equal(
    (remaining[0]?.payload.form as { title?: string }).title,
    "edit after insert was sent",
  )
})

test("two concurrent new-draft scopes never coalesce or rebind each other", async () => {
  const repository = createMemoryReplaySafeEditorOutboxRepository()
  const outbox = createReplaySafeEditorOutbox(repository, {
    now: clock(10, 20, 30, 40, 50, 60, 70, 80),
    createOperationId: operationIds(
      "draft-a-original",
      "draft-b-original",
      "draft-a-follow-up",
      "draft-b-follow-up",
    ),
  })
  await outbox.enqueue({
    ownerId: "owner-a",
    documentId: "new",
    documentScopeId: DRAFT_SCOPE_A,
    baseRevision: 0,
    payload: { title: "draft a original" },
  })
  await outbox.enqueue({
    ownerId: "owner-a",
    documentId: "new",
    documentScopeId: DRAFT_SCOPE_B,
    baseRevision: 0,
    payload: { title: "draft b original" },
  })
  const claimA = await outbox.claimNext("owner-a", DRAFT_SCOPE_A)
  const claimB = await outbox.claimNext("owner-a", DRAFT_SCOPE_B)
  assert.ok(claimA)
  assert.ok(claimB)
  await outbox.enqueue({
    ownerId: "owner-a",
    documentId: "new",
    documentScopeId: DRAFT_SCOPE_A,
    baseRevision: 0,
    payload: { title: "draft a follow-up" },
  })
  await outbox.enqueue({
    ownerId: "owner-a",
    documentId: "new",
    documentScopeId: DRAFT_SCOPE_B,
    baseRevision: 0,
    payload: { title: "draft b follow-up" },
  })

  assert.equal(
    await outbox.completeCreatedAfterSuccess("owner-a", claimA, CREATED_DOCUMENT_A_ID, 0),
    true,
  )
  const afterA = await outbox.listForOwner("owner-a")
  const reboundA = afterA.find(({ operationId }) => operationId === "draft-a-follow-up")
  const originalB = afterA.find(({ operationId }) => operationId === "draft-b-original")
  const followUpB = afterA.find(({ operationId }) => operationId === "draft-b-follow-up")
  assert.equal(reboundA?.documentId, CREATED_DOCUMENT_A_ID)
  assert.equal(reboundA?.documentScopeId, CREATED_DOCUMENT_A_ID)
  assert.equal(originalB?.documentId, "new")
  assert.equal(originalB?.documentScopeId, DRAFT_SCOPE_B)
  assert.equal(originalB?.status, "saving")
  assert.equal(followUpB?.documentId, "new")
  assert.equal(followUpB?.documentScopeId, DRAFT_SCOPE_B)
  assert.deepEqual(followUpB?.payload, { title: "draft b follow-up" })

  assert.equal(
    await outbox.completeCreatedAfterSuccess("owner-a", claimB, CREATED_DOCUMENT_B_ID, 0),
    true,
  )
  const final = await outbox.listForOwner("owner-a")
  assert.deepEqual(
    final.map(({ documentId, documentScopeId, payload }) => ({
      documentId,
      documentScopeId,
      title: payload.title,
    })),
    [
      {
        documentId: CREATED_DOCUMENT_A_ID,
        documentScopeId: CREATED_DOCUMENT_A_ID,
        title: "draft a follow-up",
      },
      {
        documentId: CREATED_DOCUMENT_B_ID,
        documentScopeId: CREATED_DOCUMENT_B_ID,
        title: "draft b follow-up",
      },
    ],
  )
})

test("failed new-document settlement preserves the original NULL-identity replay hash", async () => {
  const memory = createMemoryReplaySafeEditorOutboxRepository()
  const repository = {
    ...memory,
    replace: async (..._args: Parameters<typeof memory.replace>) => {
      throw new Error("created settlement failed")
    },
  }
  const outbox = createReplaySafeEditorOutbox(repository, {
    now: clock(10, 20, 30, 40),
    createOperationId: operationIds("operation-create", "operation-follow-up"),
  })
  await outbox.enqueue({
    ownerId: "owner-a",
    documentId: "new",
    documentScopeId: DRAFT_SCOPE_SETTLEMENT,
    baseRevision: 0,
    payload: { form: { title: "original create" } },
  })
  const claim = await outbox.claimNext("owner-a", DRAFT_SCOPE_SETTLEMENT)
  assert.ok(claim)
  await outbox.enqueue({
    ownerId: "owner-a",
    documentId: "new",
    documentScopeId: DRAFT_SCOPE_SETTLEMENT,
    baseRevision: 0,
    payload: { form: { title: "follow-up" } },
  })

  await assert.rejects(
    () => outbox.completeCreatedAfterSuccess("owner-a", claim, CREATED_DOCUMENT_ID, 0),
    /created settlement failed/,
  )
  const unchanged = await outbox.listForOwner("owner-a")
  const original = unchanged.find(({ status }) => status === "saving")
  const followUp = unchanged.find(({ status }) => status === "queued")
  assert.equal(original?.operationId, "operation-create")
  assert.equal(original?.documentId, "new")
  assert.equal(original?.documentScopeId, DRAFT_SCOPE_SETTLEMENT)
  assert.equal(original?.baseRevision, 0)
  assert.deepEqual(original?.payload, { form: { title: "original create" } })
  assert.equal(followUp?.documentId, "new")
  assert.equal(followUp?.documentScopeId, DRAFT_SCOPE_SETTLEMENT)
  assert.equal(followUp?.baseRevision, 0)
})

test("new-document settlement handles no follow-up and rejects a stale claim", async () => {
  const repository = createMemoryReplaySafeEditorOutboxRepository()
  const outbox = createReplaySafeEditorOutbox(repository, {
    now: clock(10, 20, 30, 40, 50),
    createOperationId: operationIds("operation-create"),
  })
  await outbox.enqueue({
    ownerId: "owner-a",
    documentId: "new",
    documentScopeId: DRAFT_SCOPE_STALE,
    baseRevision: 0,
    payload: { form: { title: "new document" } },
  })
  const staleClaim = await outbox.claimNext("owner-a", DRAFT_SCOPE_STALE)
  assert.ok(staleClaim)
  await outbox.requeueAfterFailure("owner-a", staleClaim)
  const currentClaim = await outbox.claimNext("owner-a", DRAFT_SCOPE_STALE)
  assert.ok(currentClaim)

  await assert.rejects(
    () =>
      outbox.completeCreatedAfterSuccess(
        "owner-a",
        currentClaim,
        "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
        0,
      ),
    /UUID documentId/,
  )
  await assert.rejects(
    () =>
      outbox.completeCreatedAfterSuccess(
        "owner-a",
        currentClaim,
        CREATED_DOCUMENT_ID,
        Number.MAX_SAFE_INTEGER + 1,
      ),
    /safe integer/,
  )

  assert.equal(
    await outbox.completeCreatedAfterSuccess("owner-a", staleClaim, CREATED_DOCUMENT_ID, 0),
    false,
  )
  const stillReplayable = await outbox.listForOwner("owner-a")
  assert.equal(stillReplayable.length, 1)
  assert.equal(stillReplayable[0]?.operationId, "operation-create")
  assert.equal(stillReplayable[0]?.documentId, "new")

  assert.equal(
    await outbox.completeCreatedAfterSuccess("owner-a", currentClaim, CREATED_DOCUMENT_ID, 0),
    true,
  )
  assert.deepEqual(await outbox.listForOwner("owner-a"), [])

  const staleTab = createReplaySafeEditorOutbox(repository, {
    now: clock(60, 70),
    createOperationId: operationIds("post-bind-edit"),
  })
  const postBind = await staleTab.enqueue({
    ownerId: "owner-a",
    documentId: "new",
    documentScopeId: DRAFT_SCOPE_STALE,
    baseRevision: 0,
    payload: { form: { title: "edit from the stale new-document tab" } },
  })
  assert.equal(postBind.documentId, CREATED_DOCUMENT_ID)
  assert.equal(postBind.documentScopeId, CREATED_DOCUMENT_ID)
  const postBindClaim = await staleTab.claimNext("owner-a", DRAFT_SCOPE_STALE)
  assert.ok(postBindClaim)
  assert.equal(postBindClaim.record.documentId, CREATED_DOCUMENT_ID)
  assert.notEqual(postBindClaim.record.documentId, "new")
})

test("startup reconciliation never claims a bound residual record as a new insert", async () => {
  const repository = createMemoryReplaySafeEditorOutboxRepository()
  const setup = createReplaySafeEditorOutbox(repository, {
    now: clock(10, 20, 30, 40, 50, 60),
    createOperationId: operationIds("create-a", "create-b"),
  })
  await setup.enqueue({
    ownerId: "owner-a",
    documentId: "new",
    documentScopeId: DRAFT_SCOPE_A,
    baseRevision: 0,
    payload: { title: "create a" },
  })
  const claimA = await setup.claimNext("owner-a", DRAFT_SCOPE_A)
  assert.ok(claimA)
  await setup.completeCreatedAfterSuccess("owner-a", claimA, CREATED_DOCUMENT_A_ID, 0)
  await setup.enqueue({
    ownerId: "owner-a",
    documentId: "new",
    documentScopeId: DRAFT_SCOPE_B,
    baseRevision: 0,
    payload: { title: "create b" },
  })
  const claimB = await setup.claimNext("owner-a", DRAFT_SCOPE_B)
  assert.ok(claimB)
  await setup.completeCreatedAfterSuccess("owner-a", claimB, CREATED_DOCUMENT_B_ID, 0)

  await repository.put({
    schemaVersion: EDITOR_OUTBOX_SCHEMA_VERSION,
    operationId: "residual-queued",
    ownerId: "owner-a",
    documentId: "new",
    documentScopeId: DRAFT_SCOPE_A,
    baseRevision: 0,
    payload: { title: "safe unsent residual" },
    createdAt: 70,
    updatedAt: 70,
    attempts: 0,
    status: "queued",
    saveProtocol: EDITOR_OUTBOX_REPLAY_PROTOCOL,
  })
  await repository.put({
    schemaVersion: EDITOR_OUTBOX_SCHEMA_VERSION,
    operationId: "residual-saving",
    ownerId: "owner-a",
    documentId: "new",
    documentScopeId: DRAFT_SCOPE_B,
    baseRevision: 0,
    payload: { title: "acknowledgement unknown residual" },
    createdAt: 80,
    updatedAt: 80,
    attempts: 1,
    status: "saving",
    saveProtocol: EDITOR_OUTBOX_REPLAY_PROTOCOL,
  })

  const restarted = createReplaySafeEditorOutbox(repository, { now: clock(90, 100, 110) })
  const replay = await restarted.claimNext("owner-a")
  assert.ok(replay)
  assert.equal(replay.record.operationId, "residual-queued")
  assert.equal(replay.record.documentId, CREATED_DOCUMENT_A_ID)
  assert.equal(replay.record.documentScopeId, CREATED_DOCUMENT_A_ID)
  assert.notEqual(replay.record.documentId, "new")
  const residualSaving = (await restarted.listForOwner("owner-a")).find(
    ({ operationId }) => operationId === "residual-saving",
  )
  assert.equal(residualSaving?.status, "conflict")
  assert.equal(residualSaving?.documentId, "new")
  assert.equal(await restarted.claimNext("owner-a", DRAFT_SCOPE_B), null)
})

test("only an acknowledged original can atomically advance a queued follow-up", async () => {
  const memory = createMemoryReplaySafeEditorOutboxRepository()
  let rejectCompletion = true
  const repository = {
    ...memory,
    replace: async (...args: Parameters<typeof memory.replace>) => {
      if (rejectCompletion) throw new Error("durable completion failed")
      return memory.replace(...args)
    },
  }
  const outbox = createReplaySafeEditorOutbox(repository, {
    now: clock(10, 20, 30, 40, 50, 60),
    createOperationId: operationIds("operation-original", "operation-follow-up"),
  })
  await outbox.enqueue({
    ownerId: "owner-a",
    documentId: "document-a",
    baseRevision: 4,
    payload: { title: "original" },
  })
  const claim = await outbox.claimNext("owner-a", "document-a")
  assert.ok(claim)
  await outbox.enqueue({
    ownerId: "owner-a",
    documentId: "document-a",
    baseRevision: 4,
    payload: { title: "follow-up" },
  })

  await assert.rejects(
    () => outbox.completeAfterSuccess("owner-a", claim, 5),
    /durable completion failed/,
  )
  const unchanged = await outbox.listForOwner("owner-a")
  assert.equal(unchanged.find(({ status }) => status === "saving")?.baseRevision, 4)
  assert.equal(unchanged.find(({ status }) => status === "queued")?.baseRevision, 4)

  rejectCompletion = false
  assert.equal(await outbox.completeAfterSuccess("owner-a", claim, 5), true)
  const followUp = await outbox.listForOwner("owner-a")
  assert.equal(followUp.length, 1)
  assert.equal(followUp[0]?.status, "queued")
  assert.equal(followUp[0]?.baseRevision, 5)
})

test("replay remains conflict-frozen and isolated by account and document", async () => {
  const repository = createMemoryReplaySafeEditorOutboxRepository()
  const outbox = createReplaySafeEditorOutbox(repository, {
    now: clock(10, 20, 30, 40, 50, 60, 70, 80),
    createOperationId: operationIds("owner-a-doc-a", "owner-a-doc-b", "owner-b-doc-a"),
  })
  await outbox.enqueue({
    ownerId: "owner-a",
    documentId: "document-a",
    baseRevision: 1,
    payload: { title: "owner a document a" },
  })
  const claimA = await outbox.claimNext("owner-a", "document-a")
  assert.ok(claimA)
  await outbox.enqueue({
    ownerId: "owner-a",
    documentId: "document-b",
    baseRevision: 8,
    payload: { title: "owner a document b" },
  })
  await outbox.enqueue({
    ownerId: "owner-b",
    documentId: "document-a",
    baseRevision: 12,
    payload: { title: "owner b document a" },
  })

  const conflict = await outbox.markConflict("owner-a", claimA.record.operationId)
  assert.equal(conflict?.status, "conflict")
  assert.equal(await outbox.claimNext("owner-a", "document-a"), null)
  assert.equal((await outbox.claimNext("owner-a", "document-b"))?.record.ownerId, "owner-a")
  assert.equal((await outbox.claimNext("owner-b", "document-a"))?.record.ownerId, "owner-b")
  await assert.rejects(
    () => outbox.requeueAfterFailure("owner-b", claimA),
    EditorOutboxOwnershipError,
  )
})

test("local mutation locking does not claim network serialization across tabs", async () => {
  const repository = createMemoryReplaySafeEditorOutboxRepository()
  const mutationLock = createSharedExclusiveLock()
  const options = {
    now: clock(10, 20, 30, 40, 50),
    createOperationId: operationIds("operation-idempotent-create"),
    runExclusiveMutation: mutationLock,
  }
  const tabA = createReplaySafeEditorOutbox(repository, options)
  const tabB = createReplaySafeEditorOutbox(repository, options)
  await tabA.enqueue({
    ownerId: "owner-a",
    documentId: "new",
    documentScopeId: DRAFT_SCOPE_A,
    baseRevision: 0,
    payload: { title: "one immutable RPC payload" },
  })
  const first = await tabA.claimNext("owner-a", DRAFT_SCOPE_A)
  assert.ok(first)

  // If two controllers do not hold their own document-scoped lock across the
  // request, both may replay the acknowledgement-unknown row. That is safe only
  // because they retain the same operation ID, NULL document identity, revision,
  // and payload for the server's idempotency receipt.
  const replayA = await tabA.claimNext("owner-a", DRAFT_SCOPE_A)
  const replayB = await tabB.claimNext("owner-a", DRAFT_SCOPE_A)
  assert.ok(replayA)
  assert.ok(replayB)
  assert.equal(replayA.record.operationId, first.record.operationId)
  assert.equal(replayB.record.operationId, first.record.operationId)
  assert.equal(replayA.record.documentId, "new")
  assert.equal(replayB.record.documentId, "new")
  assert.equal(replayA.record.baseRevision, first.record.baseRevision)
  assert.equal(replayB.record.baseRevision, first.record.baseRevision)
  assert.deepEqual(replayA.record.payload, first.record.payload)
  assert.deepEqual(replayB.record.payload, first.record.payload)
  assert.notEqual(replayA.updatedAt, replayB.updatedAt)
})

test("an external controller document lock serializes two instances for one draft scope", async () => {
  const repository = createMemoryReplaySafeEditorOutboxRepository()
  const mutationLock = createSharedExclusiveLock()
  const options = {
    now: clock(10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110),
    createOperationId: operationIds("operation-original", "operation-follow-up"),
    runExclusiveMutation: mutationLock,
  }
  const tabA = createReplaySafeEditorOutbox(repository, options)
  const tabB = createReplaySafeEditorOutbox(repository, options)
  await tabA.enqueue({
    ownerId: "owner-a",
    documentId: "new",
    documentScopeId: DRAFT_SCOPE_A,
    baseRevision: 0,
    payload: { title: "original" },
  })
  const initialClaim = await tabA.claimNext("owner-a", DRAFT_SCOPE_A)
  assert.ok(initialClaim)
  await tabA.enqueue({
    ownerId: "owner-a",
    documentId: "new",
    documentScopeId: DRAFT_SCOPE_A,
    baseRevision: 0,
    payload: { title: "follow-up" },
  })
  await tabA.requeueAfterFailure("owner-a", initialClaim)

  // Outbox locks cover local mutations only. The future controller must hold a
  // document-scoped Web Lock across claim, network request, and settlement.
  const documentLock = createSharedExclusiveLock()
  const sent: Array<{ operationId: string; documentId: string }> = []
  const runTab = (outbox: typeof tabA) =>
    documentLock(async () => {
      const claim = await outbox.claimNext("owner-a", DRAFT_SCOPE_A)
      if (!claim) return null
      sent.push({
        operationId: claim.record.operationId,
        documentId: claim.record.documentId,
      })
      if (claim.record.documentId === "new") {
        await outbox.completeCreatedAfterSuccess("owner-a", claim, CREATED_DOCUMENT_A_ID, 0)
      } else {
        await outbox.completeAfterSuccess("owner-a", claim, 1)
      }
      return claim.record.operationId
    })

  assert.deepEqual(await Promise.all([runTab(tabA), runTab(tabB)]), [
    "operation-original",
    "operation-follow-up",
  ])
  assert.deepEqual(sent, [
    { operationId: "operation-original", documentId: "new" },
    { operationId: "operation-follow-up", documentId: CREATED_DOCUMENT_A_ID },
  ])
  assert.deepEqual(await tabA.listForOwner("owner-a"), [])
})

test("the replay-safe path rejects legacy partial-success advancement", async () => {
  const repository = createMemoryReplaySafeEditorOutboxRepository()
  const outbox = createReplaySafeEditorOutbox(repository, {
    now: clock(10, 20),
    createOperationId: operationIds("operation-original"),
  })
  await outbox.enqueue({
    ownerId: "owner-a",
    documentId: "document-a",
    baseRevision: 1,
    payload: { title: "atomic request" },
  })
  const claim = await outbox.claimNext("owner-a", "document-a")
  assert.ok(claim)
  await assert.rejects(
    () => outbox.advanceAfterPartialSuccess("owner-a", claim, 2),
    EditorOutboxAtomicOperationRequiredError,
  )
})
