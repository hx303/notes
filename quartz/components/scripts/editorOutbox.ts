export const EDITOR_OUTBOX_SCHEMA_VERSION = 1 as const
export const EDITOR_OUTBOX_MUTATION_LOCK_NAME = "wouldkeep:editor-outbox:v1"

export type EditorOutboxStatus = "queued" | "saving" | "conflict"

export type EditorOutboxRecord = {
  schemaVersion: typeof EDITOR_OUTBOX_SCHEMA_VERSION
  operationId: string
  ownerId: string
  documentId: string
  baseRevision: number
  payload: Record<string, unknown>
  createdAt: number
  updatedAt: number
  attempts: number
  status: EditorOutboxStatus
}

export type EditorOutboxRepository = {
  get(operationId: string): Promise<unknown | undefined>
  getAll(): Promise<unknown[]>
  put(record: EditorOutboxRecord): Promise<void>
  delete(operationId: string): Promise<void>
}

export type EditorOutboxClaim = {
  record: EditorOutboxRecord
  /** A success may delete the record only while this token is still current. */
  updatedAt: number
}

export class EditorOutboxOwnershipError extends Error {
  constructor() {
    super("Editor outbox operation belongs to another account")
    this.name = "EditorOutboxOwnershipError"
  }
}

export class EditorOutboxConflictFrozenError extends Error {
  constructor() {
    super("Conflicted editor outbox operation is frozen")
    this.name = "EditorOutboxConflictFrozenError"
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const isNonemptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0

const isNonnegativeInteger = (value: unknown): value is number =>
  Number.isInteger(value) && Number(value) >= 0

const isTimestamp = (value: unknown): value is number =>
  Number.isFinite(value) && Number(value) >= 0

export const parseEditorOutboxRecord = (value: unknown): EditorOutboxRecord | null => {
  if (!isRecord(value)) return null
  if (value.schemaVersion !== EDITOR_OUTBOX_SCHEMA_VERSION) return null
  if (!isNonemptyString(value.operationId)) return null
  if (!isNonemptyString(value.ownerId)) return null
  if (!isNonemptyString(value.documentId)) return null
  if (!isNonnegativeInteger(value.baseRevision)) return null
  if (!isRecord(value.payload)) return null
  if (!isTimestamp(value.createdAt) || !isTimestamp(value.updatedAt)) return null
  if (Number(value.updatedAt) < Number(value.createdAt)) return null
  if (!isNonnegativeInteger(value.attempts)) return null
  if (value.status !== "queued" && value.status !== "saving" && value.status !== "conflict")
    return null
  return value as EditorOutboxRecord
}

const clone = <T>(value: T): T => structuredClone(value)

export const createMemoryEditorOutboxRepository = (
  initial: Array<{ key: string; value: unknown }> = [],
): EditorOutboxRepository => {
  const entries = new Map(initial.map(({ key, value }) => [key, clone(value)]))
  return {
    get: async (operationId) => {
      const value = entries.get(operationId)
      return value === undefined ? undefined : clone(value)
    },
    getAll: async () => [...entries.values()].map((value) => clone(value)),
    put: async (record) => {
      entries.set(record.operationId, clone(record))
    },
    delete: async (operationId) => {
      entries.delete(operationId)
    },
  }
}

export const EDITOR_OUTBOX_DATABASE_NAME = "wouldkeep-editor-outbox"
export const EDITOR_OUTBOX_DATABASE_VERSION = 1
export const EDITOR_OUTBOX_STORE_NAME = "operations"

type IndexedDbEditorOutboxOptions = {
  indexedDB?: IDBFactory
  databaseName?: string
  databaseVersion?: number
  storeName?: string
}

const indexedDbError = (message: string, error?: DOMException | null) => error ?? new Error(message)

/**
 * Browser persistence adapter. The factory is injectable so the exact upgrade,
 * request, and transaction contract can be verified without a browser runtime.
 */
export const createIndexedDbEditorOutboxRepository = (
  options: IndexedDbEditorOutboxOptions = {},
): EditorOutboxRepository => {
  const factory = options.indexedDB ?? globalThis.indexedDB
  const databaseName = options.databaseName ?? EDITOR_OUTBOX_DATABASE_NAME
  const databaseVersion = options.databaseVersion ?? EDITOR_OUTBOX_DATABASE_VERSION
  const storeName = options.storeName ?? EDITOR_OUTBOX_STORE_NAME
  if (!factory) throw new Error("IndexedDB is unavailable")
  if (!isNonemptyString(databaseName)) throw new TypeError("databaseName is required")
  if (!Number.isInteger(databaseVersion) || databaseVersion < 1)
    throw new TypeError("databaseVersion must be a positive integer")
  if (!isNonemptyString(storeName)) throw new TypeError("storeName is required")

  let databasePromise: Promise<IDBDatabase> | null = null
  const openDatabase = () => {
    if (databasePromise) return databasePromise
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(databaseName, databaseVersion)
      let settled = false
      const fail = (error: unknown) => {
        if (settled) return
        settled = true
        databasePromise = null
        reject(error)
      }
      request.onupgradeneeded = () => {
        try {
          const database = request.result
          if (!database.objectStoreNames.contains(storeName))
            database.createObjectStore(storeName, { keyPath: "operationId" })
        } catch (error) {
          try {
            request.transaction?.abort()
          } catch {
            // The original upgrade error is the useful failure.
          }
          fail(error)
        }
      }
      request.onerror = () =>
        fail(indexedDbError("Failed to open editor outbox database", request.error))
      request.onblocked = () => fail(new Error("Editor outbox database upgrade is blocked"))
      request.onsuccess = () => {
        if (settled) {
          request.result.close()
          return
        }
        settled = true
        const database = request.result
        database.onversionchange = () => {
          database.close()
          databasePromise = null
        }
        resolve(database)
      }
    })
    return databasePromise
  }

  const runRequest = async <T>(
    mode: IDBTransactionMode,
    createRequest: (store: IDBObjectStore) => IDBRequest<T>,
  ) => {
    const database = await openDatabase()
    return new Promise<T>((resolve, reject) => {
      let transaction: IDBTransaction
      let request: IDBRequest<T>
      try {
        transaction = database.transaction(storeName, mode)
        request = createRequest(transaction.objectStore(storeName))
      } catch (error) {
        reject(error)
        return
      }

      let settled = false
      let result: T
      const fail = (error: unknown) => {
        if (settled) return
        settled = true
        reject(error)
      }
      request.onsuccess = () => {
        result = request.result
      }
      request.onerror = () => fail(indexedDbError("Editor outbox request failed", request.error))
      transaction.onerror = () =>
        fail(indexedDbError("Editor outbox transaction failed", transaction.error))
      transaction.onabort = () =>
        fail(indexedDbError("Editor outbox transaction was aborted", transaction.error))
      transaction.oncomplete = () => {
        if (settled) return
        settled = true
        resolve(result)
      }
    })
  }

  return {
    get: (operationId) => runRequest("readonly", (store) => store.get(operationId)),
    getAll: () => runRequest("readonly", (store) => store.getAll()),
    put: async (record) => {
      await runRequest("readwrite", (store) => store.put(clone(record)))
    },
    delete: async (operationId) => {
      await runRequest("readwrite", (store) => store.delete(operationId))
    },
  }
}

type EditorOutboxOptions = {
  now?: () => number
  createOperationId?: () => string
  runExclusiveMutation?: <T>(operation: () => Promise<T>) => Promise<T>
}

type EnqueueInput = {
  ownerId: string
  documentId: string
  baseRevision: number
  payload: Record<string, unknown>
}

const defaultOperationId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `editor-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const runWithBrowserMutationLock = <T>(operation: () => Promise<T>): Promise<T> => {
  const locks = globalThis.navigator?.locks
  return locks
    ? (locks.request(
        EDITOR_OUTBOX_MUTATION_LOCK_NAME,
        { mode: "exclusive" },
        operation,
      ) as Promise<T>)
    : operation()
}

export const createEditorOutbox = (
  repository: EditorOutboxRepository,
  options: EditorOutboxOptions = {},
) => {
  const now = options.now ?? Date.now
  const createOperationId = options.createOperationId ?? defaultOperationId
  const runExclusiveMutation = options.runExclusiveMutation ?? runWithBrowserMutationLock
  let mutationTail: Promise<void> = Promise.resolve()

  const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
    const lockedOperation = () => runExclusiveMutation(operation)
    const result = mutationTail.then(lockedOperation, lockedOperation)
    mutationTail = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  const validRecords = async () =>
    (await repository.getAll())
      .map(parseEditorOutboxRecord)
      .filter((record): record is EditorOutboxRecord => record !== null)

  const ownedRecord = async (ownerId: string, operationId: string) => {
    const record = parseEditorOutboxRecord(await repository.get(operationId))
    if (!record) return null
    if (record.ownerId !== ownerId) throw new EditorOutboxOwnershipError()
    return record
  }

  const nextUpdatedAt = (record: EditorOutboxRecord) => Math.max(now(), record.updatedAt + 1)

  const createQueuedRecord = async (input: EnqueueInput) => {
    const operationId = createOperationId()
    if (!isNonemptyString(operationId)) throw new TypeError("operationId is required")
    if (await repository.get(operationId)) throw new Error("Duplicate editor outbox operationId")
    const timestamp = now()
    if (!isTimestamp(timestamp)) throw new TypeError("now() must return a nonnegative timestamp")
    const created: EditorOutboxRecord = {
      schemaVersion: EDITOR_OUTBOX_SCHEMA_VERSION,
      operationId,
      ownerId: input.ownerId,
      documentId: input.documentId,
      baseRevision: input.baseRevision,
      payload: clone(input.payload),
      createdAt: timestamp,
      updatedAt: timestamp,
      attempts: 0,
      status: "queued",
    }
    await repository.put(created)
    return created
  }

  const newestIntentFirst = (left: EditorOutboxRecord, right: EditorOutboxRecord) =>
    right.updatedAt - left.updatedAt ||
    right.createdAt - left.createdAt ||
    right.operationId.localeCompare(left.operationId)

  const requeueStoppedSaving = async (
    current: EditorOutboxRecord,
    baseRevision?: number,
  ): Promise<EditorOutboxRecord> => {
    const followUps = (await validRecords())
      .filter(
        (record) =>
          record.operationId !== current.operationId &&
          record.ownerId === current.ownerId &&
          record.documentId === current.documentId &&
          record.status === "queued",
      )
      .sort(newestIntentFirst)
    const winner = followUps[0] ?? current
    const nextBaseRevision =
      baseRevision ??
      Math.min(current.baseRevision, ...followUps.map((record) => record.baseRevision))
    const queued: EditorOutboxRecord = {
      ...winner,
      baseRevision: nextBaseRevision,
      updatedAt:
        winner.operationId === current.operationId
          ? nextUpdatedAt(current)
          : Math.max(nextUpdatedAt(winner), nextUpdatedAt(current)),
      status: "queued",
    }
    for (const record of [current, ...followUps]) {
      if (record.operationId !== winner.operationId) await repository.delete(record.operationId)
    }
    await repository.put(queued)
    return queued
  }

  return {
    listForOwner: async (ownerId: string) => {
      await mutationTail
      return runExclusiveMutation(async () =>
        (await validRecords())
          .filter((record) => record.ownerId === ownerId)
          .sort(
            (left, right) =>
              left.createdAt - right.createdAt || left.operationId.localeCompare(right.operationId),
          ),
      )
    },

    recoverInterrupted: (ownerId: string, documentId?: string) =>
      serialize(async () => {
        const interrupted = (await validRecords()).filter(
          (record) =>
            record.ownerId === ownerId &&
            record.status === "saving" &&
            (documentId === undefined || record.documentId === documentId),
        )
        const recovered: EditorOutboxRecord[] = []
        for (const record of interrupted) {
          const queued = await requeueStoppedSaving(record)
          recovered.push(queued)
        }
        return recovered
      }),

    enqueue: (input: EnqueueInput) =>
      serialize(async () => {
        if (!isNonemptyString(input.ownerId)) throw new TypeError("ownerId is required")
        if (!isNonemptyString(input.documentId)) throw new TypeError("documentId is required")
        if (!isNonnegativeInteger(input.baseRevision))
          throw new TypeError("baseRevision must be a nonnegative integer")
        if (!isRecord(input.payload)) throw new TypeError("payload must be an object")

        const matching = (await validRecords()).filter(
          (record) => record.ownerId === input.ownerId && record.documentId === input.documentId,
        )
        const conflict = matching.find((record) => record.status === "conflict")
        if (conflict) return conflict

        // A saving row is the immutable idempotency unit for its in-flight request.
        // Later edits merge only into a distinct queued follow-up.
        const queuedRecords = matching
          .filter((record) => record.status === "queued")
          .sort(newestIntentFirst)
        const queued = queuedRecords[0]
        if (queued) {
          const merged: EditorOutboxRecord = {
            ...queued,
            baseRevision: Math.min(
              input.baseRevision,
              ...queuedRecords.map((record) => record.baseRevision),
            ),
            payload: clone(input.payload),
            updatedAt: nextUpdatedAt(queued),
          }
          for (const duplicate of queuedRecords.slice(1))
            await repository.delete(duplicate.operationId)
          await repository.put(merged)
          return merged
        }
        return createQueuedRecord(input)
      }),

    claimNext: (ownerId: string, documentId?: string) =>
      serialize(async (): Promise<EditorOutboxClaim | null> => {
        const records = await validRecords()
        const record = records
          .filter(
            (candidate) =>
              candidate.ownerId === ownerId &&
              candidate.status === "queued" &&
              (documentId === undefined || candidate.documentId === documentId),
          )
          .filter(
            (candidate) =>
              !records.some(
                (other) =>
                  other.operationId !== candidate.operationId &&
                  other.ownerId === candidate.ownerId &&
                  other.documentId === candidate.documentId &&
                  (other.status === "saving" || other.status === "conflict"),
              ),
          )
          .sort(
            (left, right) =>
              left.createdAt - right.createdAt || left.operationId.localeCompare(right.operationId),
          )[0]
        if (!record) return null
        const saving: EditorOutboxRecord = {
          ...record,
          attempts: record.attempts + 1,
          updatedAt: nextUpdatedAt(record),
          status: "saving",
        }
        await repository.put(saving)
        return { record: saving, updatedAt: saving.updatedAt }
      }),

    requeueAfterFailure: (ownerId: string, claim: EditorOutboxClaim) =>
      serialize(async () => {
        const current = await ownedRecord(ownerId, claim.record.operationId)
        if (!current || current.status === "conflict") return current
        if (current.status !== "saving" || current.updatedAt !== claim.updatedAt) return current
        return requeueStoppedSaving(current)
      }),

    advanceAfterPartialSuccess: (ownerId: string, claim: EditorOutboxClaim, nextRevision: number) =>
      serialize(async () => {
        if (!isNonnegativeInteger(nextRevision))
          throw new TypeError("nextRevision must be a nonnegative integer")
        const current = await ownedRecord(ownerId, claim.record.operationId)
        if (!current || current.status === "conflict") return current
        if (current.status !== "saving" || current.updatedAt !== claim.updatedAt) return current
        return requeueStoppedSaving(current, nextRevision)
      }),

    bindCreatedDocument: (
      ownerId: string,
      claim: EditorOutboxClaim,
      documentId: string,
      baseRevision: number,
    ) =>
      serialize(async (): Promise<EditorOutboxClaim | null> => {
        if (!isNonemptyString(documentId) || documentId === "new")
          throw new TypeError("A persisted documentId is required")
        if (!isNonnegativeInteger(baseRevision))
          throw new TypeError("baseRevision must be a nonnegative integer")
        const current = await ownedRecord(ownerId, claim.record.operationId)
        if (!current || current.status !== "saving" || current.updatedAt !== claim.updatedAt)
          return null
        if (current.documentId !== "new") return null
        const bound: EditorOutboxRecord = {
          ...current,
          documentId,
          baseRevision,
          updatedAt: nextUpdatedAt(current),
        }
        const followUps = (await validRecords()).filter(
          (record) =>
            record.operationId !== current.operationId &&
            record.ownerId === current.ownerId &&
            record.documentId === "new" &&
            record.status === "queued",
        )
        for (const followUp of followUps) {
          await repository.put({
            ...followUp,
            documentId,
            baseRevision,
            updatedAt: nextUpdatedAt(followUp),
          })
        }
        await repository.put(bound)
        return { record: bound, updatedAt: bound.updatedAt }
      }),

    completeAfterSuccess: (ownerId: string, claim: EditorOutboxClaim, nextRevision: number) =>
      serialize(async () => {
        if (!isNonnegativeInteger(nextRevision))
          throw new TypeError("nextRevision must be a nonnegative integer")
        const current = await ownedRecord(ownerId, claim.record.operationId)
        if (!current || current.status === "conflict") return false
        if (current.status !== "saving" || current.updatedAt !== claim.updatedAt) return false

        // Advance follow-ups before deleting the successful request. If persistence
        // fails, the saving row remains as a conservative durable marker.
        const followUps = (await validRecords()).filter(
          (record) =>
            record.operationId !== current.operationId &&
            record.ownerId === current.ownerId &&
            record.documentId === current.documentId &&
            record.status === "queued",
        )
        for (const followUp of followUps) {
          await repository.put({
            ...followUp,
            baseRevision: nextRevision,
            updatedAt: nextUpdatedAt(followUp),
          })
        }
        await repository.delete(current.operationId)
        return true
      }),

    markConflict: (ownerId: string, operationId: string) =>
      serialize(async () => {
        const current = await ownedRecord(ownerId, operationId)
        if (!current || current.status === "conflict") return current
        const conflict: EditorOutboxRecord = {
          ...current,
          updatedAt: nextUpdatedAt(current),
          status: "conflict",
        }
        await repository.put(conflict)
        return conflict
      }),

    resolveConflict: (ownerId: string, operationId: string) =>
      serialize(async () => {
        const current = await ownedRecord(ownerId, operationId)
        if (!current || current.status !== "conflict") return false
        await repository.delete(operationId)
        return true
      }),

    resolveDocumentConflict: (ownerId: string, documentId: string) =>
      serialize(async () => {
        if (!isNonemptyString(ownerId)) throw new TypeError("ownerId is required")
        if (!isNonemptyString(documentId)) throw new TypeError("documentId is required")
        const records = (await validRecords()).filter(
          (record) => record.ownerId === ownerId && record.documentId === documentId,
        )
        const latest =
          records.filter((record) => record.status === "queued").sort(newestIntentFirst)[0] ??
          records.sort(newestIntentFirst)[0] ??
          null
        for (const record of records) await repository.delete(record.operationId)
        return latest ? clone(latest) : null
      }),

    migrateNewDocument: (
      ownerId: string,
      operationId: string,
      documentId: string,
      baseRevision: number,
    ) =>
      serialize(async () => {
        if (!isNonemptyString(documentId) || documentId === "new")
          throw new TypeError("A persisted documentId is required")
        if (!isNonnegativeInteger(baseRevision))
          throw new TypeError("baseRevision must be a nonnegative integer")
        const current = await ownedRecord(ownerId, operationId)
        if (!current) return null
        if (current.status === "conflict") throw new EditorOutboxConflictFrozenError()
        if (current.documentId !== "new") throw new Error("Editor outbox operation is not new")
        const migrated: EditorOutboxRecord = {
          ...current,
          documentId,
          // The first cloud insert establishes a new authoritative revision token.
          baseRevision,
          updatedAt: nextUpdatedAt(current),
          status: "queued",
        }
        await repository.put(migrated)
        return migrated
      }),
  }
}
