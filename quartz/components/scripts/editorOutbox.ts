export const EDITOR_OUTBOX_SCHEMA_VERSION = 1 as const
export const EDITOR_OUTBOX_MUTATION_LOCK_NAME = "wouldkeep:editor-outbox:v1"
export const EDITOR_OUTBOX_REPLAY_PROTOCOL = "snapshot-v1" as const
export const EDITOR_OUTBOX_REPLAY_REPOSITORY_KIND = "snapshot-v1-isolated" as const
export const EDITOR_OUTBOX_NEW_DOCUMENT_SCOPE_PREFIX = "draft:" as const

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
  /** Missing means a legacy multi-write operation. */
  saveProtocol?: "legacy-multiwrite" | typeof EDITOR_OUTBOX_REPLAY_PROTOCOL
  /** Snapshot-v1 queue identity; new drafts use a stable `draft:` scope. */
  documentScopeId?: string
}

export type EditorOutboxRepository = {
  get(operationId: string): Promise<unknown | undefined>
  getAll(): Promise<unknown[]>
  put(record: EditorOutboxRecord): Promise<void>
  delete(operationId: string): Promise<void>
  /** Atomically delete a set of rows and persist their replacements. */
  replace(records: EditorOutboxRecord[], deletedOperationIds: string[]): Promise<void>
}

export type EditorOutboxScopeBinding = {
  storageKind: "snapshot-v1-scope-binding"
  operationId: string
  ownerId: string
  documentScopeId: string
  documentId: string
  baseRevision: number
  updatedAt: number
}

export type ReplaySafeEditorOutboxRepository = EditorOutboxRepository & {
  readonly storageProtocol: typeof EDITOR_OUTBOX_REPLAY_REPOSITORY_KIND
  getScopeBinding(
    ownerId: string,
    documentScopeId: string,
  ): Promise<EditorOutboxScopeBinding | null>
  settleCreatedDocument(
    binding: EditorOutboxScopeBinding,
    records: EditorOutboxRecord[],
    deletedOperationIds: string[],
  ): Promise<void>
}

export type EditorOutboxManualRecoveryItem = {
  reason: "legacy-protocol"
  record: EditorOutboxRecord
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

export class EditorOutboxAtomicOperationRequiredError extends Error {
  constructor() {
    super("Replay-safe editor outbox operations require an atomic server acknowledgement")
    this.name = "EditorOutboxAtomicOperationRequiredError"
  }
}

export class EditorOutboxReplaySettlementRequiredError extends Error {
  constructor() {
    super("A replay-safe new-document acknowledgement requires atomic local settlement")
    this.name = "EditorOutboxReplaySettlementRequiredError"
  }
}

export class EditorOutboxStorageIsolationError extends Error {
  constructor() {
    super("The editor outbox constructor and repository storage protocol do not match")
    this.name = "EditorOutboxStorageIsolationError"
  }
}

export class EditorOutboxManualRecoveryRequiredError extends Error {
  constructor() {
    super("A legacy editor operation requires manual recovery before snapshot-v1 can continue")
    this.name = "EditorOutboxManualRecoveryRequiredError"
  }
}

export class EditorOutboxScopeBindingCorruptError extends Error {
  constructor() {
    super("The persisted draft binding is invalid and requires manual recovery")
    this.name = "EditorOutboxScopeBindingCorruptError"
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const isNonemptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0

const isNonnegativeInteger = (value: unknown): value is number =>
  Number.isInteger(value) && Number(value) >= 0

const isNonnegativeSafeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0

const isTimestamp = (value: unknown): value is number =>
  Number.isFinite(value) && Number(value) >= 0

const canonicalUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u

const isCanonicalUuid = (value: unknown): value is string =>
  isNonemptyString(value) && canonicalUuidPattern.test(value)

const isReplayNewDocumentScope = (value: unknown): value is string =>
  isNonemptyString(value) &&
  value.startsWith(EDITOR_OUTBOX_NEW_DOCUMENT_SCOPE_PREFIX) &&
  canonicalUuidPattern.test(value.slice(EDITOR_OUTBOX_NEW_DOCUMENT_SCOPE_PREFIX.length))

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
  if (
    value.saveProtocol !== undefined &&
    value.saveProtocol !== "legacy-multiwrite" &&
    value.saveProtocol !== EDITOR_OUTBOX_REPLAY_PROTOCOL
  )
    return null
  if (value.documentScopeId !== undefined && !isNonemptyString(value.documentScopeId)) return null
  if (value.saveProtocol === EDITOR_OUTBOX_REPLAY_PROTOCOL) {
    if (!isNonemptyString(value.documentScopeId)) return null
    if (!isNonnegativeSafeInteger(value.baseRevision)) return null
    if (value.documentId === "new" && !isReplayNewDocumentScope(value.documentScopeId)) return null
    if (value.documentId !== "new" && value.documentScopeId !== value.documentId) return null
  }
  return value as EditorOutboxRecord
}

const clone = <T>(value: T): T => structuredClone(value)

const editorOutboxProtocol = (record: EditorOutboxRecord) =>
  record.saveProtocol ?? "legacy-multiwrite"

const scopeBindingOperationId = (ownerId: string, documentScopeId: string) =>
  `snapshot-v1-scope-binding:${ownerId}:${documentScopeId}`

const parseEditorOutboxScopeBinding = (value: unknown): EditorOutboxScopeBinding | null => {
  if (!isRecord(value)) return null
  if (value.storageKind !== "snapshot-v1-scope-binding") return null
  if (!isNonemptyString(value.operationId)) return null
  if (!isNonemptyString(value.ownerId)) return null
  if (!isReplayNewDocumentScope(value.documentScopeId)) return null
  if (!isCanonicalUuid(value.documentId)) return null
  if (!isNonnegativeSafeInteger(value.baseRevision)) return null
  if (!isTimestamp(value.updatedAt)) return null
  if (value.operationId !== scopeBindingOperationId(value.ownerId, value.documentScopeId))
    return null
  return value as EditorOutboxScopeBinding
}

const markReplaySafeRepository = (
  repository: EditorOutboxRepository,
): ReplaySafeEditorOutboxRepository => {
  const marker: Pick<ReplaySafeEditorOutboxRepository, "storageProtocol"> = {
    storageProtocol: EDITOR_OUTBOX_REPLAY_REPOSITORY_KIND,
  }
  const replayRepository = Object.assign(repository, marker, {
    async getScopeBinding(
      this: ReplaySafeEditorOutboxRepository,
      ownerId: string,
      documentScopeId: string,
    ) {
      if (!isNonemptyString(ownerId)) throw new TypeError("ownerId is required")
      if (!isReplayNewDocumentScope(documentScopeId))
        throw new TypeError("A canonical draft:<uuid> documentScopeId is required")
      const stored = await this.get(scopeBindingOperationId(ownerId, documentScopeId))
      if (stored === undefined) return null
      const binding = parseEditorOutboxScopeBinding(stored)
      if (!binding) throw new EditorOutboxScopeBindingCorruptError()
      return binding
    },
    async settleCreatedDocument(
      this: ReplaySafeEditorOutboxRepository,
      binding: EditorOutboxScopeBinding,
      records: EditorOutboxRecord[],
      deletedOperationIds: string[],
    ) {
      if (!parseEditorOutboxScopeBinding(binding))
        throw new TypeError("A valid snapshot-v1 draft binding is required")
      if (
        records.some(
          (record) =>
            parseEditorOutboxRecord(record) === null ||
            record.saveProtocol !== EDITOR_OUTBOX_REPLAY_PROTOCOL ||
            record.ownerId !== binding.ownerId ||
            record.documentId !== binding.documentId ||
            record.documentScopeId !== binding.documentId ||
            record.baseRevision !== binding.baseRevision ||
            record.status !== "queued",
        )
      )
        throw new TypeError("Created-document settlement records must match the draft binding")
      if (
        deletedOperationIds.length !== 1 ||
        deletedOperationIds.some((operationId) => !isNonemptyString(operationId))
      )
        throw new TypeError("Created-document settlement must delete one replay operation")
      await this.replace(
        [binding as unknown as EditorOutboxRecord, ...records],
        deletedOperationIds,
      )
    },
  }) as ReplaySafeEditorOutboxRepository
  return replayRepository
}

export const listLegacyEditorOutboxForManualRecovery = async (
  repository: EditorOutboxRepository,
  ownerId: string,
  documentId?: string,
): Promise<EditorOutboxManualRecoveryItem[]> =>
  (await repository.getAll())
    .map(parseEditorOutboxRecord)
    .filter((record): record is EditorOutboxRecord => record !== null)
    .filter(
      (record) =>
        record.ownerId === ownerId &&
        editorOutboxProtocol(record) !== EDITOR_OUTBOX_REPLAY_PROTOCOL &&
        (documentId === undefined || record.documentId === documentId),
    )
    .sort(
      (left, right) =>
        left.createdAt - right.createdAt || left.operationId.localeCompare(right.operationId),
    )
    .map((record) => ({ reason: "legacy-protocol" as const, record: clone(record) }))

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
    replace: async (records, deletedOperationIds) => {
      const next = new Map(entries)
      for (const operationId of deletedOperationIds) next.delete(operationId)
      for (const record of records) next.set(record.operationId, clone(record))
      entries.clear()
      for (const [operationId, value] of next) entries.set(operationId, value)
    },
  }
}

export const createMemoryReplaySafeEditorOutboxRepository = (
  initial: Array<{ key: string; value: unknown }> = [],
): ReplaySafeEditorOutboxRepository =>
  markReplaySafeRepository(createMemoryEditorOutboxRepository(initial))

export const EDITOR_OUTBOX_DATABASE_NAME = "wouldkeep-editor-outbox"
export const EDITOR_OUTBOX_DATABASE_VERSION = 1
export const EDITOR_OUTBOX_STORE_NAME = "operations"
export const EDITOR_OUTBOX_REPLAY_DATABASE_NAME = "wouldkeep-editor-outbox-snapshot-v1"
export const EDITOR_OUTBOX_REPLAY_DATABASE_VERSION = 1
export const EDITOR_OUTBOX_REPLAY_STORE_NAME = "snapshot-v1-operations"

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
const createIndexedDbEditorOutboxRepositoryAt = (
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

  const runTransaction = async (
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => void,
  ) => {
    const database = await openDatabase()
    return new Promise<void>((resolve, reject) => {
      let transaction: IDBTransaction | undefined
      try {
        transaction = database.transaction(storeName, mode)
        operation(transaction.objectStore(storeName))
      } catch (error) {
        try {
          transaction?.abort()
        } catch {
          // Reject with the original synchronous transaction error.
        }
        reject(error)
        return
      }

      let settled = false
      const fail = (error: unknown) => {
        if (settled) return
        settled = true
        reject(error)
      }
      transaction.onerror = () =>
        fail(indexedDbError("Editor outbox transaction failed", transaction.error))
      transaction.onabort = () =>
        fail(indexedDbError("Editor outbox transaction was aborted", transaction.error))
      transaction.oncomplete = () => {
        if (settled) return
        settled = true
        resolve()
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
    replace: async (records, deletedOperationIds) => {
      await runTransaction("readwrite", (store) => {
        for (const operationId of deletedOperationIds) store.delete(operationId)
        for (const record of records) store.put(clone(record))
      })
    },
  }
}

export const createIndexedDbEditorOutboxRepository = (
  options: { indexedDB?: IDBFactory } = {},
): EditorOutboxRepository =>
  createIndexedDbEditorOutboxRepositoryAt({
    indexedDB: options.indexedDB,
    databaseName: EDITOR_OUTBOX_DATABASE_NAME,
    databaseVersion: EDITOR_OUTBOX_DATABASE_VERSION,
    storeName: EDITOR_OUTBOX_STORE_NAME,
  })

/**
 * Snapshot-v1 operations live in a different IndexedDB database and store.
 * The physical split is required because a legacy client ignores new record
 * fields and would otherwise coalesce an atomic `saving` row as a multi-write.
 */
export const createReplaySafeIndexedDbEditorOutboxRepository = (
  options: {
    indexedDB?: IDBFactory
  } = {},
): ReplaySafeEditorOutboxRepository =>
  markReplaySafeRepository(
    createIndexedDbEditorOutboxRepositoryAt({
      indexedDB: options.indexedDB,
      databaseName: EDITOR_OUTBOX_REPLAY_DATABASE_NAME,
      databaseVersion: EDITOR_OUTBOX_REPLAY_DATABASE_VERSION,
      storeName: EDITOR_OUTBOX_REPLAY_STORE_NAME,
    }),
  )

type EditorOutboxOptions = {
  now?: () => number
  createOperationId?: () => string
  runExclusiveMutation?: <T>(operation: () => Promise<T>) => Promise<T>
}

type EnqueueInput = {
  ownerId: string
  documentId: string
  documentScopeId?: string
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

type EditorOutboxAcknowledgementMode = "legacy-multiwrite" | "replay-unknown"

const createEditorOutboxWithAcknowledgementMode = (
  repository: EditorOutboxRepository,
  options: EditorOutboxOptions = {},
  acknowledgementMode: EditorOutboxAcknowledgementMode,
) => {
  const now = options.now ?? Date.now
  const createOperationId = options.createOperationId ?? defaultOperationId
  const runExclusiveMutation = options.runExclusiveMutation ?? runWithBrowserMutationLock
  const replayRepository =
    acknowledgementMode === "replay-unknown"
      ? (repository as ReplaySafeEditorOutboxRepository)
      : null
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

  const assertReplayProtocol = (record: EditorOutboxRecord) => {
    if (
      acknowledgementMode === "replay-unknown" &&
      editorOutboxProtocol(record) !== EDITOR_OUTBOX_REPLAY_PROTOCOL
    )
      throw new EditorOutboxManualRecoveryRequiredError()
  }

  const isValidRevision = (value: unknown) =>
    acknowledgementMode === "replay-unknown"
      ? isNonnegativeSafeInteger(value)
      : isNonnegativeInteger(value)

  const assertValidRevision = (value: unknown, fieldName: string) => {
    if (!isValidRevision(value))
      throw new TypeError(
        `${fieldName} must be a nonnegative${
          acknowledgementMode === "replay-unknown" ? " safe" : ""
        } integer`,
      )
  }

  const assertReplayScopeSelector = (selector?: string) => {
    if (acknowledgementMode !== "replay-unknown" || selector === undefined) return
    if (!isNonemptyString(selector)) throw new TypeError("documentScopeId is required")
    if (
      selector === "new" ||
      (selector.startsWith("draft:") && !isReplayNewDocumentScope(selector))
    )
      throw new TypeError("A canonical draft:<uuid> documentScopeId is required")
  }

  const resolveDocumentScope = (input: Pick<EnqueueInput, "documentId" | "documentScopeId">) => {
    if (acknowledgementMode !== "replay-unknown") return input.documentId
    if (input.documentId === "new") {
      if (!isReplayNewDocumentScope(input.documentScopeId))
        throw new TypeError("A stable draft:<uuid> documentScopeId is required for a new document")
      return input.documentScopeId
    }
    if (input.documentScopeId !== undefined && input.documentScopeId !== input.documentId)
      throw new TypeError("An existing documentScopeId must equal documentId")
    return input.documentId
  }

  const resolveScopeSelector = async (ownerId: string, selector?: string) => {
    assertReplayScopeSelector(selector)
    if (!selector || !replayRepository || !isReplayNewDocumentScope(selector)) return selector
    const binding = await replayRepository.getScopeBinding(ownerId, selector)
    return binding?.documentId ?? selector
  }

  const normalizeReplayInput = async (input: EnqueueInput): Promise<EnqueueInput> => {
    const inputScope = resolveDocumentScope(input)
    if (!replayRepository || input.documentId !== "new")
      return { ...input, documentScopeId: inputScope }
    const binding = await replayRepository.getScopeBinding(input.ownerId, inputScope)
    if (!binding) return { ...input, documentScopeId: inputScope }
    return {
      ...input,
      documentId: binding.documentId,
      documentScopeId: binding.documentId,
      baseRevision: binding.baseRevision,
    }
  }

  const reconcileBoundDraftRecords = async (ownerId: string, requestedScope?: string) => {
    if (!replayRepository) return
    const candidates = (await validRecords()).filter(
      (record) =>
        record.ownerId === ownerId &&
        record.saveProtocol === EDITOR_OUTBOX_REPLAY_PROTOCOL &&
        record.documentId === "new" &&
        isReplayNewDocumentScope(record.documentScopeId) &&
        (requestedScope === undefined || record.documentScopeId === requestedScope),
    )
    const reconciled: EditorOutboxRecord[] = []
    for (const record of candidates) {
      const binding = await replayRepository.getScopeBinding(ownerId, record.documentScopeId!)
      if (!binding) continue
      reconciled.push(
        record.status === "queued" && record.attempts === 0
          ? {
              ...record,
              documentId: binding.documentId,
              documentScopeId: binding.documentId,
              baseRevision: binding.baseRevision,
              updatedAt: nextUpdatedAt(record),
            }
          : {
              ...record,
              status: "conflict",
              updatedAt: nextUpdatedAt(record),
            },
      )
    }
    if (reconciled.length) await repository.replace(reconciled, [])
  }

  const documentScope = (record: EditorOutboxRecord) =>
    acknowledgementMode === "replay-unknown"
      ? (record.documentScopeId ?? record.documentId)
      : record.documentId

  const sameDocumentScope = (left: EditorOutboxRecord, right: EditorOutboxRecord) =>
    left.ownerId === right.ownerId && documentScope(left) === documentScope(right)

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
      ...(acknowledgementMode === "replay-unknown"
        ? {
            saveProtocol: EDITOR_OUTBOX_REPLAY_PROTOCOL,
            documentScopeId: resolveDocumentScope(input),
          }
        : {}),
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
          .filter(
            (record) =>
              record.ownerId === ownerId &&
              (acknowledgementMode !== "replay-unknown" ||
                editorOutboxProtocol(record) === EDITOR_OUTBOX_REPLAY_PROTOCOL),
          )
          .sort(
            (left, right) =>
              left.createdAt - right.createdAt || left.operationId.localeCompare(right.operationId),
          ),
      )
    },

    listManualRecoveryForOwner: async (ownerId: string, documentId?: string) => {
      await mutationTail
      return runExclusiveMutation(async () =>
        (await validRecords())
          .filter(
            (record) =>
              record.ownerId === ownerId &&
              editorOutboxProtocol(record) !== EDITOR_OUTBOX_REPLAY_PROTOCOL &&
              (documentId === undefined || record.documentId === documentId),
          )
          .sort(
            (left, right) =>
              left.createdAt - right.createdAt || left.operationId.localeCompare(right.operationId),
          )
          .map((record) => ({ reason: "legacy-protocol" as const, record: clone(record) })),
      )
    },

    recoverInterrupted: (ownerId: string, documentScopeId?: string) =>
      serialize(async () => {
        await reconcileBoundDraftRecords(ownerId, documentScopeId)
        const resolvedScope = await resolveScopeSelector(ownerId, documentScopeId)
        const interrupted = (await validRecords()).filter(
          (record) =>
            record.ownerId === ownerId &&
            record.status === "saving" &&
            (acknowledgementMode !== "replay-unknown" ||
              editorOutboxProtocol(record) === EDITOR_OUTBOX_REPLAY_PROTOCOL) &&
            (resolvedScope === undefined || documentScope(record) === resolvedScope),
        )
        if (acknowledgementMode === "replay-unknown") return interrupted.map(clone)
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
        assertValidRevision(input.baseRevision, "baseRevision")
        if (!isRecord(input.payload)) throw new TypeError("payload must be an object")
        const requestedScope = resolveDocumentScope(input)
        await reconcileBoundDraftRecords(input.ownerId, requestedScope)
        const records = await validRecords()
        if (
          acknowledgementMode === "replay-unknown" &&
          records.some(
            (record) =>
              record.ownerId === input.ownerId &&
              record.documentId === input.documentId &&
              editorOutboxProtocol(record) !== EDITOR_OUTBOX_REPLAY_PROTOCOL,
          )
        )
          throw new EditorOutboxManualRecoveryRequiredError()
        const normalizedInput = await normalizeReplayInput(input)
        const inputScope = resolveDocumentScope(normalizedInput)
        const matching = records.filter(
          (record) => record.ownerId === input.ownerId && documentScope(record) === inputScope,
        )
        if (
          acknowledgementMode === "replay-unknown" &&
          matching.some((record) => editorOutboxProtocol(record) !== EDITOR_OUTBOX_REPLAY_PROTOCOL)
        )
          throw new EditorOutboxManualRecoveryRequiredError()
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
              normalizedInput.baseRevision,
              ...queuedRecords.map((record) => record.baseRevision),
            ),
            payload: clone(normalizedInput.payload),
            updatedAt: nextUpdatedAt(queued),
          }
          for (const duplicate of queuedRecords.slice(1))
            await repository.delete(duplicate.operationId)
          await repository.put(merged)
          return merged
        }
        return createQueuedRecord(normalizedInput)
      }),

    claimNext: (ownerId: string, documentScopeId?: string) =>
      serialize(async (): Promise<EditorOutboxClaim | null> => {
        await reconcileBoundDraftRecords(ownerId, documentScopeId)
        const resolvedScope = await resolveScopeSelector(ownerId, documentScopeId)
        const records = await validRecords()
        const candidateRecords = records
          .filter(
            (candidate) =>
              candidate.ownerId === ownerId &&
              (resolvedScope === undefined || documentScope(candidate) === resolvedScope),
          )
          .filter((candidate) => {
            if (
              acknowledgementMode === "replay-unknown" &&
              editorOutboxProtocol(candidate) !== EDITOR_OUTBOX_REPLAY_PROTOCOL
            )
              return false
            const blockedByManualRecovery = records.some(
              (other) =>
                sameDocumentScope(other, candidate) &&
                editorOutboxProtocol(other) !== EDITOR_OUTBOX_REPLAY_PROTOCOL,
            )
            if (acknowledgementMode === "replay-unknown" && blockedByManualRecovery) return false
            const blockedByConflict = records.some(
              (other) => sameDocumentScope(other, candidate) && other.status === "conflict",
            )
            if (blockedByConflict) return false
            if (acknowledgementMode === "replay-unknown") {
              if (candidate.status === "saving") return true
              if (candidate.status !== "queued") return false
              return !records.some(
                (other) =>
                  other.operationId !== candidate.operationId &&
                  sameDocumentScope(other, candidate) &&
                  other.status === "saving",
              )
            }
            if (candidate.status !== "queued") return false
            return !records.some(
              (other) =>
                other.operationId !== candidate.operationId &&
                sameDocumentScope(other, candidate) &&
                (other.status === "saving" || other.status === "conflict"),
            )
          })
        const record = candidateRecords.sort(
          (left, right) =>
            (acknowledgementMode === "replay-unknown"
              ? Number(right.status === "saving") - Number(left.status === "saving")
              : 0) ||
            left.createdAt - right.createdAt ||
            left.operationId.localeCompare(right.operationId),
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
        assertReplayProtocol(current)
        if (current.status !== "saving" || current.updatedAt !== claim.updatedAt) return current
        if (acknowledgementMode === "replay-unknown") return clone(current)
        return requeueStoppedSaving(current)
      }),

    advanceAfterPartialSuccess: (ownerId: string, claim: EditorOutboxClaim, nextRevision: number) =>
      serialize(async () => {
        assertValidRevision(nextRevision, "nextRevision")
        if (acknowledgementMode === "replay-unknown")
          throw new EditorOutboxAtomicOperationRequiredError()
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
        assertValidRevision(baseRevision, "baseRevision")
        const current = await ownedRecord(ownerId, claim.record.operationId)
        if (!current || current.status !== "saving" || current.updatedAt !== claim.updatedAt)
          return null
        assertReplayProtocol(current)
        if (current.documentId !== "new") return null
        if (acknowledgementMode === "replay-unknown")
          throw new EditorOutboxReplaySettlementRequiredError()
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
        const reboundFollowUps = followUps.map((followUp) => ({
          ...followUp,
          documentId,
          baseRevision,
          updatedAt: nextUpdatedAt(followUp),
        }))
        await repository.replace([bound, ...reboundFollowUps], [])
        return { record: bound, updatedAt: bound.updatedAt }
      }),

    completeAfterSuccess: (ownerId: string, claim: EditorOutboxClaim, nextRevision: number) =>
      serialize(async () => {
        assertValidRevision(nextRevision, "nextRevision")
        const current = await ownedRecord(ownerId, claim.record.operationId)
        if (!current || current.status === "conflict") return false
        assertReplayProtocol(current)
        if (current.status !== "saving" || current.updatedAt !== claim.updatedAt) return false
        if (acknowledgementMode === "replay-unknown" && current.documentId === "new")
          throw new EditorOutboxReplaySettlementRequiredError()

        // The acknowledgement, follow-up revision advance, and removal of the
        // replay token become one local durability transition. A failed IndexedDB
        // transaction therefore leaves the original replayable operation intact.
        const followUps = (await validRecords()).filter(
          (record) =>
            record.operationId !== current.operationId &&
            sameDocumentScope(record, current) &&
            record.status === "queued",
        )
        const advancedFollowUps = followUps.map((followUp) => ({
          ...followUp,
          baseRevision: nextRevision,
          updatedAt: nextUpdatedAt(followUp),
        }))
        await repository.replace(advancedFollowUps, [current.operationId])
        return true
      }),

    completeCreatedAfterSuccess: (
      ownerId: string,
      claim: EditorOutboxClaim,
      documentId: string,
      nextRevision: number,
    ) =>
      serialize(async () => {
        if (!isCanonicalUuid(documentId))
          throw new TypeError("A persisted UUID documentId is required")
        assertValidRevision(nextRevision, "nextRevision")
        if (acknowledgementMode !== "replay-unknown")
          throw new EditorOutboxReplaySettlementRequiredError()
        const current = await ownedRecord(ownerId, claim.record.operationId)
        if (!current || current.status === "conflict") return false
        assertReplayProtocol(current)
        if (current.status !== "saving" || current.updatedAt !== claim.updatedAt) return false
        if (current.documentId !== "new") return false
        if (!isReplayNewDocumentScope(current.documentScopeId)) return false
        const existingBinding = await replayRepository?.getScopeBinding(
          ownerId,
          current.documentScopeId,
        )
        if (existingBinding)
          throw new Error("The draft scope is already bound; reconcile it before settlement")

        const followUps = (await validRecords()).filter(
          (record) =>
            record.operationId !== current.operationId &&
            sameDocumentScope(record, current) &&
            record.status === "queued",
        )
        const reboundFollowUps = followUps.map((followUp) => ({
          ...followUp,
          documentId,
          documentScopeId: documentId,
          baseRevision: nextRevision,
          updatedAt: nextUpdatedAt(followUp),
        }))
        const binding: EditorOutboxScopeBinding = {
          storageKind: "snapshot-v1-scope-binding",
          operationId: scopeBindingOperationId(ownerId, current.documentScopeId),
          ownerId,
          documentScopeId: current.documentScopeId,
          documentId,
          baseRevision: nextRevision,
          updatedAt: nextUpdatedAt(current),
        }
        await replayRepository!.settleCreatedDocument(binding, reboundFollowUps, [
          current.operationId,
        ])
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

    resolveDocumentConflict: (ownerId: string, documentScopeId: string) =>
      serialize(async () => {
        if (!isNonemptyString(ownerId)) throw new TypeError("ownerId is required")
        if (!isNonemptyString(documentScopeId)) throw new TypeError("documentScopeId is required")
        const resolvedScope = await resolveScopeSelector(ownerId, documentScopeId)
        const records = (await validRecords()).filter(
          (record) => record.ownerId === ownerId && documentScope(record) === resolvedScope,
        )
        const latest =
          records.filter((record) => record.status === "queued").sort(newestIntentFirst)[0] ??
          records.sort(newestIntentFirst)[0] ??
          null
        await repository.replace(
          [],
          records.map((record) => record.operationId),
        )
        return latest ? clone(latest) : null
      }),

    restoreConflict: (input: EnqueueInput) =>
      serialize(async () => {
        if (!isNonemptyString(input.ownerId)) throw new TypeError("ownerId is required")
        if (!isNonemptyString(input.documentId)) throw new TypeError("documentId is required")
        assertValidRevision(input.baseRevision, "baseRevision")
        if (!isRecord(input.payload)) throw new TypeError("payload must be an object")
        const requestedScope = resolveDocumentScope(input)
        await reconcileBoundDraftRecords(input.ownerId, requestedScope)
        const records = await validRecords()
        if (
          acknowledgementMode === "replay-unknown" &&
          records.some(
            (record) =>
              record.ownerId === input.ownerId &&
              record.documentId === input.documentId &&
              editorOutboxProtocol(record) !== EDITOR_OUTBOX_REPLAY_PROTOCOL,
          )
        )
          throw new EditorOutboxManualRecoveryRequiredError()
        const normalizedInput = await normalizeReplayInput(input)
        const inputScope = resolveDocumentScope(normalizedInput)
        const matching = records.filter(
          (record) => record.ownerId === input.ownerId && documentScope(record) === inputScope,
        )
        if (
          acknowledgementMode === "replay-unknown" &&
          matching.some((record) => editorOutboxProtocol(record) !== EDITOR_OUTBOX_REPLAY_PROTOCOL)
        )
          throw new EditorOutboxManualRecoveryRequiredError()
        // Any matching row was persisted after the caller's earlier resolve. Prefer
        // that newer durable intent, with queued follow-ups taking precedence over
        // their immutable in-flight predecessor.
        const newestMatching =
          matching.filter((record) => record.status === "queued").sort(newestIntentFirst)[0] ??
          matching.sort(newestIntentFirst)[0] ??
          null
        const operationId = createOperationId()
        if (!isNonemptyString(operationId)) throw new TypeError("operationId is required")
        const existing = parseEditorOutboxRecord(await repository.get(operationId))
        if (existing && !matching.some((record) => record.operationId === operationId))
          throw new Error("Duplicate editor outbox operationId")
        const timestamp = now()
        if (!isTimestamp(timestamp))
          throw new TypeError("now() must return a nonnegative timestamp")
        const conflict: EditorOutboxRecord = {
          schemaVersion: EDITOR_OUTBOX_SCHEMA_VERSION,
          operationId,
          ownerId: normalizedInput.ownerId,
          documentId: normalizedInput.documentId,
          baseRevision: newestMatching?.baseRevision ?? normalizedInput.baseRevision,
          payload: clone(newestMatching?.payload ?? normalizedInput.payload),
          createdAt: timestamp,
          updatedAt: timestamp,
          attempts: 0,
          status: "conflict",
          ...(acknowledgementMode === "replay-unknown"
            ? {
                saveProtocol: EDITOR_OUTBOX_REPLAY_PROTOCOL,
                documentScopeId: inputScope,
              }
            : {}),
        }
        await repository.replace(
          [conflict],
          matching.map((record) => record.operationId),
        )
        return clone(conflict)
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
        assertValidRevision(baseRevision, "baseRevision")
        const current = await ownedRecord(ownerId, operationId)
        if (!current) return null
        assertReplayProtocol(current)
        if (acknowledgementMode === "replay-unknown")
          throw new EditorOutboxReplaySettlementRequiredError()
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

/**
 * Compatibility constructor for the currently deployed multi-write save path.
 * Interrupted attempts still coalesce because that server path has no durable
 * operation receipt and cannot safely replay an acknowledgement-unknown insert.
 */
export const createEditorOutbox = (
  repository: EditorOutboxRepository,
  options: EditorOutboxOptions = {},
) => {
  if (
    (repository as Partial<ReplaySafeEditorOutboxRepository>).storageProtocol ===
    EDITOR_OUTBOX_REPLAY_REPOSITORY_KIND
  )
    throw new EditorOutboxStorageIsolationError()
  return createEditorOutboxWithAcknowledgementMode(repository, options, "legacy-multiwrite")
}

/**
 * Client-side contract for a future atomic, operation-idempotent save RPC.
 * A `saving` row means in-flight or acknowledgement unknown: refresh and network
 * failure keep its operation identity, payload, and base revision immutable;
 * later edits remain a distinct queued follow-up until a verified acknowledgement.
 *
 * The persisted payload is still the editor recovery form, not the future RPC
 * snapshot ABI. A later controller must validate and materialize tag/relation
 * arrays and strict source objects; it must never pass this opaque payload through.
 * New documents also require one persisted `draft:<uuid>` scope shared by the URL
 * and every tab. The outbox serializes local mutations only and makes no network-
 * serialization guarantee. A later controller should hold a document-scoped Web
 * Lock across claim, request, and settlement when available, but correctness still
 * relies on server operation idempotency. It must also use bounded retry backoff
 * after network failure instead of immediately tight-looping.
 *
 * This constructor is deliberately not wired into the current editor save path.
 */
export const createReplaySafeEditorOutbox = (
  repository: ReplaySafeEditorOutboxRepository,
  options: EditorOutboxOptions = {},
) => {
  if (repository.storageProtocol !== EDITOR_OUTBOX_REPLAY_REPOSITORY_KIND)
    throw new EditorOutboxStorageIsolationError()
  return createEditorOutboxWithAcknowledgementMode(repository, options, "replay-unknown")
}
