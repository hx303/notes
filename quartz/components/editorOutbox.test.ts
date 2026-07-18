import assert from "node:assert/strict"
import test from "node:test"
import {
  EDITOR_OUTBOX_DATABASE_NAME,
  EDITOR_OUTBOX_DATABASE_VERSION,
  EDITOR_OUTBOX_SCHEMA_VERSION,
  EDITOR_OUTBOX_STORE_NAME,
  EditorOutboxConflictFrozenError,
  EditorOutboxOwnershipError,
  createEditorOutbox,
  createIndexedDbEditorOutboxRepository,
  createMemoryEditorOutboxRepository,
  parseEditorOutboxRecord,
} from "./scripts/editorOutbox"

const clock = (...values: number[]) => {
  let fallback = values.at(-1) ?? 0
  return () => {
    fallback = values.shift() ?? fallback + 1
    return fallback
  }
}

const createSharedMutationLock = () => {
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

const record = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: EDITOR_OUTBOX_SCHEMA_VERSION,
  operationId: "operation-a",
  ownerId: "owner-a",
  documentId: "document-a",
  baseRevision: 3,
  payload: { title: "first" },
  createdAt: 10,
  updatedAt: 10,
  attempts: 0,
  status: "queued",
  ...overrides,
})

const createFakeIndexedDb = (
  failures: { open?: Error; transaction?: Error; request?: Error; requestAt?: number } = {},
) => {
  const rows = new Map<string, unknown>()
  const stores = new Set<string>()
  const opens: Array<{ name: string; version?: number }> = []
  const upgrades: Array<{ name: string; keyPath: string | string[] | null }> = []
  let opened = false
  let requestFailure = failures.request
  let requestCount = 0

  const fire = (target: Record<string, unknown>, name: string, eventName: string) => {
    const handler = target[name]
    if (typeof handler === "function") (handler as (event: Event) => void)(new Event(eventName))
  }

  const databaseTarget: Record<string, unknown> = {
    objectStoreNames: {
      contains: (name: string) => stores.has(name),
    },
    createObjectStore: (name: string, options?: IDBObjectStoreParameters) => {
      stores.add(name)
      upgrades.push({ name, keyPath: options?.keyPath ?? null })
      return {} as IDBObjectStore
    },
    close: () => undefined,
    onversionchange: null,
  }

  databaseTarget.transaction = (storeName: string, mode: IDBTransactionMode) => {
    if (failures.transaction) throw failures.transaction
    if (!stores.has(storeName)) throw new Error(`Missing object store: ${storeName}`)
    const transactionRows = new Map(
      [...rows].map(([key, value]) => [key, cloneForTest(value)] as const),
    )
    let aborted = false
    let pending = 0
    let completionScheduled = false
    const transactionTarget: Record<string, unknown> = {
      error: null,
      oncomplete: null,
      onerror: null,
      onabort: null,
    }
    const abort = () => {
      if (aborted) return
      aborted = true
      fire(transactionTarget, "onabort", "abort")
    }
    transactionTarget.abort = abort
    const scheduleCompletion = () => {
      if (aborted || pending !== 0 || completionScheduled) return
      completionScheduled = true
      queueMicrotask(() => {
        if (aborted || pending !== 0) return
        if (mode === "readwrite") {
          rows.clear()
          for (const [key, value] of transactionRows) rows.set(key, cloneForTest(value))
        }
        fire(transactionTarget, "oncomplete", "complete")
      })
    }
    const request = (operation: () => unknown) => {
      pending += 1
      requestCount += 1
      const currentRequest = requestCount
      const requestTarget: Record<string, unknown> = {
        result: undefined,
        error: null,
        onsuccess: null,
        onerror: null,
      }
      queueMicrotask(() => {
        if (aborted) return
        if (requestFailure && currentRequest === (failures.requestAt ?? 1)) {
          const error = requestFailure
          requestFailure = undefined
          requestTarget.error = error
          transactionTarget.error = error
          fire(requestTarget, "onerror", "error")
          fire(transactionTarget, "onerror", "error")
          abort()
          return
        }
        try {
          requestTarget.result = operation()
        } catch (error) {
          transactionTarget.error = error
          requestTarget.error = error
          fire(requestTarget, "onerror", "error")
          fire(transactionTarget, "onerror", "error")
          abort()
          return
        }
        pending -= 1
        fire(requestTarget, "onsuccess", "success")
        scheduleCompletion()
      })
      return requestTarget as unknown as IDBRequest
    }
    const storeTarget = {
      get: (key: IDBValidKey) => request(() => cloneForTest(transactionRows.get(String(key)))),
      getAll: () => request(() => [...transactionRows.values()].map(cloneForTest)),
      put: (value: unknown) =>
        request(() => {
          const operationId = String((value as { operationId?: unknown }).operationId ?? "")
          transactionRows.set(operationId, cloneForTest(value))
          return operationId
        }),
      delete: (key: IDBValidKey) =>
        request(() => {
          transactionRows.delete(String(key))
          return undefined
        }),
    }
    transactionTarget.objectStore = () => storeTarget as unknown as IDBObjectStore
    return transactionTarget as unknown as IDBTransaction
  }

  const factory = {
    open: (name: string, version?: number) => {
      opens.push({ name, version })
      const requestTarget: Record<string, unknown> = {
        result: undefined,
        error: null,
        transaction: {
          abort: () => undefined,
        },
        onupgradeneeded: null,
        onerror: null,
        onblocked: null,
        onsuccess: null,
      }
      queueMicrotask(() => {
        if (failures.open) {
          requestTarget.error = failures.open
          fire(requestTarget, "onerror", "error")
          return
        }
        requestTarget.result = databaseTarget as unknown as IDBDatabase
        if (!opened) {
          opened = true
          fire(requestTarget, "onupgradeneeded", "upgradeneeded")
        }
        fire(requestTarget, "onsuccess", "success")
      })
      return requestTarget as unknown as IDBOpenDBRequest
    },
  } as IDBFactory

  return { factory, opens, upgrades }
}

const cloneForTest = <T>(value: T): T => structuredClone(value)

test("record parsing rejects corruption and unknown schemas", () => {
  assert.equal(parseEditorOutboxRecord(null), null)
  assert.equal(parseEditorOutboxRecord("broken"), null)
  assert.equal(parseEditorOutboxRecord(record({ schemaVersion: 2 })), null)
  assert.equal(parseEditorOutboxRecord(record({ payload: [] })), null)
  assert.equal(parseEditorOutboxRecord(record({ baseRevision: -1 })), null)
  assert.equal(parseEditorOutboxRecord(record({ updatedAt: 9 })), null)
  assert.deepEqual(parseEditorOutboxRecord(record()), record())
})

test("listing ignores corrupt rows and isolates accounts", async () => {
  const repository = createMemoryEditorOutboxRepository([
    { key: "corrupt", value: { schemaVersion: 99 } },
    { key: "operation-a", value: record() },
    {
      key: "operation-b",
      value: record({ operationId: "operation-b", ownerId: "owner-b" }),
    },
  ])
  const outbox = createEditorOutbox(repository)

  assert.deepEqual(
    (await outbox.listForOwner("owner-a")).map(({ operationId }) => operationId),
    ["operation-a"],
  )
  assert.deepEqual(
    (await outbox.listForOwner("owner-b")).map(({ operationId }) => operationId),
    ["operation-b"],
  )
})

test("refresh recovery requeues only the owner's interrupted saves and preserves conflicts", async () => {
  const repository = createMemoryEditorOutboxRepository([
    {
      key: "saving-a",
      value: record({ operationId: "saving-a", status: "saving", attempts: 2 }),
    },
    {
      key: "conflict-a",
      value: record({ operationId: "conflict-a", documentId: "document-b", status: "conflict" }),
    },
    {
      key: "saving-b",
      value: record({ operationId: "saving-b", ownerId: "owner-b", status: "saving" }),
    },
  ])
  const outbox = createEditorOutbox(repository, { now: clock(25) })

  const recovered = await outbox.recoverInterrupted("owner-a")
  assert.equal(recovered.length, 1)
  assert.equal(recovered[0]?.operationId, "saving-a")
  assert.equal(recovered[0]?.status, "queued")
  assert.equal(recovered[0]?.attempts, 2)
  assert.equal(recovered[0]?.updatedAt, 25)

  const ownerA = await outbox.listForOwner("owner-a")
  assert.equal(ownerA.find(({ operationId }) => operationId === "conflict-a")?.status, "conflict")
  assert.equal((await outbox.listForOwner("owner-b"))[0]?.status, "saving")
})

test("same owner and document coalesce to the latest payload and earliest base revision", async () => {
  const repository = createMemoryEditorOutboxRepository()
  const outbox = createEditorOutbox(repository, {
    now: clock(10, 20),
    createOperationId: () => "operation-a",
  })
  const first = await outbox.enqueue({
    ownerId: "owner-a",
    documentId: "document-a",
    baseRevision: 3,
    payload: { title: "first", body: "old" },
  })
  const merged = await outbox.enqueue({
    ownerId: "owner-a",
    documentId: "document-a",
    baseRevision: 8,
    payload: { title: "latest", body: "new" },
  })

  assert.equal(merged.operationId, first.operationId)
  assert.equal(merged.createdAt, first.createdAt)
  assert.equal(merged.baseRevision, 3)
  assert.deepEqual(merged.payload, { title: "latest", body: "new" })
  assert.equal((await outbox.listForOwner("owner-a")).length, 1)
})

test("a browser-wide mutation lock keeps saving immutable across outbox instances", async () => {
  const repository = createMemoryEditorOutboxRepository()
  const runExclusiveMutation = createSharedMutationLock()
  const operationIds = ["operation-saving", "operation-follow-up"]
  const options = {
    now: clock(10, 20, 30, 40, 50),
    createOperationId: () => operationIds.shift() ?? "unexpected-operation",
    runExclusiveMutation,
  }
  const tabA = createEditorOutbox(repository, options)
  const tabB = createEditorOutbox(repository, options)
  await tabA.enqueue({
    ownerId: "owner-a",
    documentId: "new",
    baseRevision: 0,
    payload: { form: { title: "first" } },
  })

  const [claim] = await Promise.all([
    tabA.claimNext("owner-a", "new"),
    tabB.enqueue({
      ownerId: "owner-a",
      documentId: "new",
      baseRevision: 0,
      payload: { form: { title: "latest" } },
    }),
  ])
  assert.ok(claim)
  const records = await tabA.listForOwner("owner-a")
  assert.equal(records.length, 2)
  assert.equal(
    records.find(({ operationId }) => operationId === claim.record.operationId)?.status,
    "saving",
  )
  assert.equal(
    (
      records.find(({ status }) => status === "queued")?.payload.form as
        | { title?: string }
        | undefined
    )?.title,
    "latest",
  )
  const bound = await tabA.bindCreatedDocument("owner-a", claim, "cloud-document", 1)
  assert.ok(bound)
})

test("a new operation migrates to its cloud identity without changing operation identity", async () => {
  const repository = createMemoryEditorOutboxRepository()
  const outbox = createEditorOutbox(repository, {
    now: clock(10, 20),
    createOperationId: () => "operation-new",
  })
  const queued = await outbox.enqueue({
    ownerId: "owner-a",
    documentId: "new",
    baseRevision: 0,
    payload: { title: "draft" },
  })
  const migrated = await outbox.migrateNewDocument(
    "owner-a",
    queued.operationId,
    "document-created",
    1,
  )

  assert.equal(migrated?.operationId, queued.operationId)
  assert.equal(migrated?.documentId, "document-created")
  assert.equal(migrated?.baseRevision, 1)
  assert.deepEqual(migrated?.payload, queued.payload)
  assert.equal((await repository.get("operation-new")) !== undefined, true)
})

test("a claimed first insert binds its cloud identity without releasing the in-flight claim", async () => {
  const repository = createMemoryEditorOutboxRepository()
  const operationIds = ["operation-new", "operation-follow-up"]
  const outbox = createEditorOutbox(repository, {
    now: clock(10, 20, 30, 40, 50, 60),
    createOperationId: () => operationIds.shift() ?? "unexpected-operation",
  })
  await outbox.enqueue({
    ownerId: "owner-a",
    documentId: "new",
    baseRevision: 0,
    payload: { title: "draft" },
  })
  const claim = await outbox.claimNext("owner-a", "new")
  assert.ok(claim)
  await outbox.enqueue({
    ownerId: "owner-a",
    documentId: "new",
    baseRevision: 0,
    payload: { title: "edited while first insert saves" },
  })
  const bound = await outbox.bindCreatedDocument("owner-a", claim, "document-created", 1)
  assert.ok(bound)
  assert.equal(bound.record.status, "saving")
  assert.equal(bound.record.documentId, "document-created")
  assert.equal(bound.record.baseRevision, 1)
  const followUp = (await outbox.listForOwner("owner-a")).find(
    ({ operationId }) => operationId !== bound.record.operationId,
  )
  assert.equal(followUp?.documentId, "document-created")
  assert.equal(followUp?.baseRevision, 1)
  assert.equal(await outbox.completeAfterSuccess("owner-a", claim, 1), false)
  assert.equal(await outbox.completeAfterSuccess("owner-a", bound, 1), true)
  const followUpClaim = await outbox.claimNext("owner-a", "document-created")
  assert.ok(followUpClaim)
  assert.deepEqual(followUpClaim.record.payload, {
    title: "edited while first insert saves",
  })
  assert.equal(await outbox.completeAfterSuccess("owner-a", followUpClaim, 2), true)
  assert.deepEqual(await outbox.listForOwner("owner-a"), [])
})

test("in-flight operations stay immutable and a follow-up waits for the authoritative revision", async () => {
  const repository = createMemoryEditorOutboxRepository()
  const operationIds = ["operation-saving", "operation-follow-up"]
  const outbox = createEditorOutbox(repository, {
    now: clock(10, 20, 30, 40, 50, 60),
    createOperationId: () => operationIds.shift() ?? "unexpected-operation",
  })
  const original = await outbox.enqueue({
    ownerId: "owner-a",
    documentId: "document-a",
    baseRevision: 3,
    payload: { title: "first" },
  })
  const claim = await outbox.claimNext("owner-a")
  assert.ok(claim)
  const followUp = await outbox.enqueue({
    ownerId: "owner-a",
    documentId: "document-a",
    baseRevision: 3,
    payload: { title: "edited while saving" },
  })
  const mergedFollowUp = await outbox.enqueue({
    ownerId: "owner-a",
    documentId: "document-a",
    baseRevision: 99,
    payload: { title: "latest follow-up" },
  })

  const beforeSuccess = await outbox.listForOwner("owner-a")
  const persistedInFlight = beforeSuccess.find(
    ({ operationId }) => operationId === original.operationId,
  )
  assert.equal(persistedInFlight?.operationId, "operation-saving")
  assert.deepEqual(persistedInFlight?.payload, { title: "first" })
  assert.equal(persistedInFlight?.status, "saving")
  assert.equal(persistedInFlight?.updatedAt, claim.updatedAt)
  assert.equal(followUp.operationId, "operation-follow-up")
  assert.notEqual(followUp.operationId, original.operationId)
  assert.equal(mergedFollowUp.operationId, followUp.operationId)
  assert.equal(mergedFollowUp.baseRevision, 3)
  assert.deepEqual(mergedFollowUp.payload, { title: "latest follow-up" })

  assert.equal(await outbox.claimNext("owner-a"), null)
  assert.equal(await outbox.completeAfterSuccess("owner-a", claim, 4), true)

  const afterSuccess = await outbox.listForOwner("owner-a")
  assert.equal(afterSuccess.length, 1)
  assert.equal(afterSuccess[0]?.operationId, "operation-follow-up")
  assert.equal(afterSuccess[0]?.baseRevision, 4)
  assert.deepEqual(afterSuccess[0]?.payload, { title: "latest follow-up" })

  const currentClaim = await outbox.claimNext("owner-a")
  assert.ok(currentClaim)
  assert.equal(currentClaim.record.operationId, "operation-follow-up")
  assert.equal(currentClaim.record.baseRevision, 4)
  assert.equal(await outbox.completeAfterSuccess("owner-a", currentClaim, 5), true)
  assert.deepEqual(await outbox.listForOwner("owner-a"), [])
})

test("partial success requeues the operation and follow-up at the committed revision", async () => {
  const repository = createMemoryEditorOutboxRepository()
  const operationIds = ["operation-partial", "operation-follow-up"]
  const outbox = createEditorOutbox(repository, {
    now: clock(10, 20, 30, 40, 50, 60),
    createOperationId: () => operationIds.shift() ?? "unexpected-operation",
  })
  await outbox.enqueue({
    ownerId: "owner-a",
    documentId: "document-a",
    baseRevision: 3,
    payload: { form: { documentId: "document-a", revision: 3, title: "first" } },
  })
  const claim = await outbox.claimNext("owner-a", "document-a")
  assert.ok(claim)
  await outbox.enqueue({
    ownerId: "owner-a",
    documentId: "document-a",
    baseRevision: 3,
    payload: { form: { documentId: "document-a", revision: 3, title: "follow-up" } },
  })

  const advanced = await outbox.advanceAfterPartialSuccess("owner-a", claim, 4)
  assert.equal(advanced?.status, "queued")
  assert.equal(advanced?.baseRevision, 4)
  const records = await outbox.listForOwner("owner-a")
  assert.equal(records.length, 1)
  assert.ok(records.every(({ baseRevision, status }) => baseRevision === 4 && status === "queued"))
  assert.equal((records[0]?.payload.form as { title?: string } | undefined)?.title, "follow-up")
  const retry = await outbox.claimNext("owner-a", "document-a")
  assert.ok(retry)
  assert.equal(retry.record.baseRevision, 4)
})

test("interrupted and failed saves coalesce into the latest full-form intent", async () => {
  const repository = createMemoryEditorOutboxRepository()
  const operationIds = ["operation-saving", "operation-follow-up"]
  const outbox = createEditorOutbox(repository, {
    now: clock(10, 20, 30, 40, 50, 60),
    createOperationId: () => operationIds.shift() ?? "unexpected-operation",
  })
  await outbox.enqueue({
    ownerId: "owner-a",
    documentId: "document-a",
    baseRevision: 7,
    payload: { title: "older" },
  })
  const claim = await outbox.claimNext("owner-a", "document-a")
  assert.ok(claim)
  await outbox.enqueue({
    ownerId: "owner-a",
    documentId: "document-a",
    baseRevision: 7,
    payload: { title: "latest" },
  })

  const recovered = await outbox.recoverInterrupted("owner-a", "document-a")
  assert.equal(recovered.length, 1)
  assert.equal(recovered[0]?.baseRevision, 7)
  assert.deepEqual(recovered[0]?.payload, { title: "latest" })
  assert.equal((await outbox.listForOwner("owner-a")).length, 1)
})

test("conflicts freeze payload, cannot be claimed, migrated, or deleted by success", async () => {
  const repository = createMemoryEditorOutboxRepository()
  const operationIds = ["operation-saving", "operation-follow-up"]
  const outbox = createEditorOutbox(repository, {
    now: clock(10, 20, 30, 40),
    createOperationId: () => operationIds.shift() ?? "unexpected-operation",
  })
  const queued = await outbox.enqueue({
    ownerId: "owner-a",
    documentId: "new",
    baseRevision: 0,
    payload: { title: "frozen" },
  })
  const claim = await outbox.claimNext("owner-a")
  assert.ok(claim)
  const followUp = await outbox.enqueue({
    ownerId: "owner-a",
    documentId: "new",
    baseRevision: 0,
    payload: { title: "queued behind conflict" },
  })
  const conflict = await outbox.markConflict("owner-a", queued.operationId)
  assert.equal(conflict?.status, "conflict")

  const attemptedMerge = await outbox.enqueue({
    ownerId: "owner-a",
    documentId: "new",
    baseRevision: 9,
    payload: { title: "must not replace frozen payload" },
  })
  assert.deepEqual(attemptedMerge.payload, { title: "frozen" })
  assert.equal(await outbox.claimNext("owner-a"), null)
  assert.equal(await outbox.completeAfterSuccess("owner-a", claim, 1), false)
  await assert.rejects(
    () => outbox.migrateNewDocument("owner-a", queued.operationId, "document-a", 1),
    EditorOutboxConflictFrozenError,
  )
  const frozen = await outbox.listForOwner("owner-a")
  assert.equal(
    frozen.find(({ operationId }) => operationId === queued.operationId)?.status,
    "conflict",
  )
  assert.equal(
    frozen.find(({ operationId }) => operationId === followUp.operationId)?.status,
    "queued",
  )
  assert.deepEqual(followUp.payload, { title: "queued behind conflict" })
  const resolved = await outbox.resolveDocumentConflict("owner-a", "new")
  assert.deepEqual(resolved?.payload, { title: "queued behind conflict" })
  assert.deepEqual(await outbox.listForOwner("owner-a"), [])
})

test("restoring a conflict atomically replaces every prior row without exposing queued work", async () => {
  const repository = createMemoryEditorOutboxRepository()
  const outbox = createEditorOutbox(repository, {
    now: clock(30),
    createOperationId: () => "operation-restored",
  })

  const restored = await outbox.restoreConflict({
    ownerId: "owner-a",
    documentId: "document-a",
    baseRevision: 7,
    payload: { title: "newest recoverable intent" },
  })

  assert.equal(restored.status, "conflict")
  assert.equal(restored.baseRevision, 7)
  assert.deepEqual(restored.payload, { title: "newest recoverable intent" })
  const records = await outbox.listForOwner("owner-a")
  assert.deepEqual(records, [restored])
  assert.equal(await outbox.claimNext("owner-a", "document-a"), null)
})

test("restoring a conflict preserves a newer matching intent created after resolve", async () => {
  const repository = createMemoryEditorOutboxRepository([
    {
      key: "operation-saving",
      value: record({
        operationId: "operation-saving",
        payload: { title: "in flight" },
        updatedAt: 40,
        status: "saving",
      }),
    },
    {
      key: "operation-follow-up",
      value: record({
        operationId: "operation-follow-up",
        baseRevision: 8,
        payload: { title: "new cross-tab follow-up" },
        createdAt: 20,
        updatedAt: 30,
      }),
    },
  ])
  const outbox = createEditorOutbox(repository, {
    now: clock(50),
    createOperationId: () => "operation-restored",
  })

  const restored = await outbox.restoreConflict({
    ownerId: "owner-a",
    documentId: "document-a",
    baseRevision: 3,
    payload: { title: "stale pre-resolve intent" },
  })

  assert.equal(restored.status, "conflict")
  assert.equal(restored.baseRevision, 8)
  assert.deepEqual(restored.payload, { title: "new cross-tab follow-up" })
  assert.deepEqual(await outbox.listForOwner("owner-a"), [restored])
})

test("an atomic resolve failure preserves the entire conflict group", async () => {
  const failure = new Error("second delete failed")
  const fake = createFakeIndexedDb({ request: failure, requestAt: 5 })
  const repository = createIndexedDbEditorOutboxRepository({ indexedDB: fake.factory })
  const conflict = parseEditorOutboxRecord(
    record({ operationId: "operation-conflict", status: "conflict" }),
  )
  const latest = parseEditorOutboxRecord(
    record({ operationId: "operation-latest", payload: { title: "latest" }, updatedAt: 20 }),
  )
  assert.ok(conflict)
  assert.ok(latest)
  await repository.put(conflict)
  await repository.put(latest)
  const outbox = createEditorOutbox(repository)

  await assert.rejects(() => outbox.resolveDocumentConflict("owner-a", "document-a"), failure)
  const records = await outbox.listForOwner("owner-a")
  assert.deepEqual(records.map(({ operationId }) => operationId).sort(), [
    "operation-conflict",
    "operation-latest",
  ])
  assert.deepEqual(records.find(({ operationId }) => operationId === "operation-latest")?.payload, {
    title: "latest",
  })
})

test("an atomic conflict restore failure leaves the old group intact and no queued replacement", async () => {
  const failure = new Error("replacement write failed")
  const fake = createFakeIndexedDb({ request: failure, requestAt: 7 })
  const repository = createIndexedDbEditorOutboxRepository({ indexedDB: fake.factory })
  const conflict = parseEditorOutboxRecord(
    record({ operationId: "operation-conflict", status: "conflict" }),
  )
  const latest = parseEditorOutboxRecord(
    record({ operationId: "operation-latest", payload: { title: "latest" }, updatedAt: 20 }),
  )
  assert.ok(conflict)
  assert.ok(latest)
  await repository.put(conflict)
  await repository.put(latest)
  const outbox = createEditorOutbox(repository, {
    now: clock(30),
    createOperationId: () => "operation-restored",
  })

  await assert.rejects(
    () =>
      outbox.restoreConflict({
        ownerId: "owner-a",
        documentId: "document-a",
        baseRevision: 3,
        payload: { title: "restored" },
      }),
    failure,
  )
  const records = await outbox.listForOwner("owner-a")
  assert.deepEqual(records.map(({ operationId }) => operationId).sort(), [
    "operation-conflict",
    "operation-latest",
  ])
  assert.equal(
    records.some(({ status }) => status === "queued"),
    true,
  )
  assert.equal(
    records.some(({ operationId }) => operationId === "operation-restored"),
    false,
  )
})

test("mutations reject cross-account operation access", async () => {
  const repository = createMemoryEditorOutboxRepository([{ key: "operation-a", value: record() }])
  const outbox = createEditorOutbox(repository, { now: clock(20) })

  await assert.rejects(
    () => outbox.markConflict("owner-b", "operation-a"),
    EditorOutboxOwnershipError,
  )
  await assert.rejects(
    () => outbox.migrateNewDocument("owner-b", "operation-a", "document-b", 4),
    EditorOutboxOwnershipError,
  )
  assert.equal((await outbox.listForOwner("owner-a")).length, 1)
})

test("claims can target one document and conflicts require explicit owner-scoped resolution", async () => {
  const repository = createMemoryEditorOutboxRepository([
    { key: "operation-a", value: record({ documentId: "document-a" }) },
    {
      key: "operation-b",
      value: record({ operationId: "operation-b", documentId: "document-b" }),
    },
  ])
  const outbox = createEditorOutbox(repository, { now: clock(20, 30, 40) })

  const claim = await outbox.claimNext("owner-a", "document-b")
  assert.equal(claim?.record.operationId, "operation-b")
  const conflict = await outbox.markConflict("owner-a", "operation-b")
  assert.equal(conflict?.status, "conflict")
  await assert.rejects(
    () => outbox.resolveConflict("owner-b", "operation-b"),
    EditorOutboxOwnershipError,
  )
  assert.equal(await outbox.resolveConflict("owner-a", "operation-b"), true)
  assert.equal(await outbox.resolveConflict("owner-a", "operation-b"), false)
  assert.equal((await outbox.listForOwner("owner-a"))[0]?.operationId, "operation-a")
})

test("IndexedDB repository upgrades one versioned store and persists CRUD operations", async () => {
  const fake = createFakeIndexedDb()
  const repository = createIndexedDbEditorOutboxRepository({ indexedDB: fake.factory })
  const valid = parseEditorOutboxRecord(record())
  assert.ok(valid)

  await repository.put(valid)
  assert.deepEqual(await repository.get(valid.operationId), valid)
  assert.deepEqual(await repository.getAll(), [valid])
  const replacement = parseEditorOutboxRecord(
    record({ operationId: "operation-b", payload: { title: "replacement" } }),
  )
  assert.ok(replacement)
  await repository.replace([replacement], [valid.operationId])
  assert.equal(await repository.get(valid.operationId), undefined)
  assert.deepEqual(await repository.get(replacement.operationId), replacement)
  await repository.replace([], [replacement.operationId])
  assert.deepEqual(await repository.getAll(), [])

  assert.deepEqual(fake.opens, [
    { name: EDITOR_OUTBOX_DATABASE_NAME, version: EDITOR_OUTBOX_DATABASE_VERSION },
  ])
  assert.deepEqual(fake.upgrades, [{ name: EDITOR_OUTBOX_STORE_NAME, keyPath: "operationId" }])
})

test("IndexedDB repository propagates open, transaction, and request failures", async () => {
  const openFailure = new Error("open failed")
  const openRepository = createIndexedDbEditorOutboxRepository({
    indexedDB: createFakeIndexedDb({ open: openFailure }).factory,
  })
  await assert.rejects(() => openRepository.get("operation-a"), openFailure)

  const transactionFailure = new Error("transaction failed")
  const transactionRepository = createIndexedDbEditorOutboxRepository({
    indexedDB: createFakeIndexedDb({ transaction: transactionFailure }).factory,
  })
  await assert.rejects(() => transactionRepository.getAll(), transactionFailure)

  const requestFailure = new Error("request failed")
  const requestRepository = createIndexedDbEditorOutboxRepository({
    indexedDB: createFakeIndexedDb({ request: requestFailure }).factory,
  })
  await assert.rejects(() => requestRepository.delete("operation-a"), requestFailure)
})
