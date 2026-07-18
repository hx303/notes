export const EDITOR_COORDINATOR_SCHEMA_VERSION = 1 as const

export const EDITOR_COORDINATOR_MESSAGE_KIND = "wouldkeep-editor-status" as const

export type EditorCoordinationStatus = "queued" | "saving" | "saved" | "conflict"

export interface EditorStatusInput {
  documentId: string
  status: EditorCoordinationStatus
  operationId?: string
  revision?: number
}

export interface EditorStatusMessage extends EditorStatusInput {
  schemaVersion: typeof EDITOR_COORDINATOR_SCHEMA_VERSION
  kind: typeof EDITOR_COORDINATOR_MESSAGE_KIND
  ownerId: string
  senderId: string
  sentAt: number
}

export type EditorStatusListener = (message: EditorStatusMessage) => void

export type EditorLockRequest = <Result>(
  name: string,
  task: () => Promise<Result>,
) => Promise<Result>

export type EditorChannelMessageListener = (event: { data: unknown }) => void

export interface EditorStatusChannel {
  postMessage(message: unknown): void
  addMessageListener(listener: EditorChannelMessageListener): void
  removeMessageListener(listener: EditorChannelMessageListener): void
  close(): void
}

export type EditorStatusChannelFactory = (name: string) => EditorStatusChannel | null

export interface EditorCoordinatorOptions {
  ownerId: string
  senderId?: string
  now?: () => number
  requestLock?: EditorLockRequest | null
  channelFactory?: EditorStatusChannelFactory | null
}

export interface EditorCoordinator {
  readonly ownerId: string
  readonly senderId: string
  runExclusive<Result>(documentId: string, task: () => Promise<Result> | Result): Promise<Result>
  publishStatus(input: EditorStatusInput): boolean
  subscribe(listener: EditorStatusListener): () => void
  close(): void
  isClosed(): boolean
}

export class EditorCoordinatorClosedError extends Error {
  constructor() {
    super("Editor coordinator is closed")
    this.name = "EditorCoordinatorClosedError"
  }
}

const statuses = new Set<EditorCoordinationStatus>(["queued", "saving", "saved", "conflict"])

const isBoundedString = (value: unknown, maxLength = 512): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= maxLength

const isRevision = (value: unknown): value is number =>
  Number.isInteger(value) && Number(value) >= 0

const parseStatusMessage = (value: unknown): EditorStatusMessage | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  if (candidate.schemaVersion !== EDITOR_COORDINATOR_SCHEMA_VERSION) return null
  if (candidate.kind !== EDITOR_COORDINATOR_MESSAGE_KIND) return null
  if (!isBoundedString(candidate.ownerId) || !isBoundedString(candidate.senderId)) return null
  if (!isBoundedString(candidate.documentId)) return null
  if (
    typeof candidate.status !== "string" ||
    !statuses.has(candidate.status as EditorCoordinationStatus)
  ) {
    return null
  }
  if (!Number.isFinite(candidate.sentAt) || Number(candidate.sentAt) < 0) return null
  if (candidate.operationId !== undefined && !isBoundedString(candidate.operationId)) return null
  if (candidate.revision !== undefined && !isRevision(candidate.revision)) return null
  return candidate as unknown as EditorStatusMessage
}

const createSenderId = () => {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID()
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

const defaultLockRequest = (): EditorLockRequest | null => {
  if (typeof navigator === "undefined" || !navigator.locks) return null
  // lib.dom models the callback return as T even though the Web Locks algorithm
  // adopts promises. Bind once at this browser boundary and expose the actual
  // promise-flattening behavior through the injectable interface.
  return navigator.locks.request.bind(navigator.locks) as unknown as EditorLockRequest
}

const defaultChannelFactory = (): EditorStatusChannelFactory | null => {
  if (typeof window === "undefined" || typeof window.BroadcastChannel !== "function") return null
  return (name) => {
    const channel = new window.BroadcastChannel(name)
    const adapters = new Map<EditorChannelMessageListener, (event: MessageEvent<unknown>) => void>()
    return {
      postMessage: (message) => channel.postMessage(message),
      addMessageListener: (listener) => {
        const adapter = (event: MessageEvent<unknown>) => listener(event)
        adapters.set(listener, adapter)
        channel.addEventListener("message", adapter)
      },
      removeMessageListener: (listener) => {
        const adapter = adapters.get(listener)
        if (!adapter) return
        channel.removeEventListener("message", adapter)
        adapters.delete(listener)
      },
      close: () => {
        adapters.clear()
        channel.close()
      },
    }
  }
}

const coordinationName = (scope: "channel" | "lock", ownerId: string, documentId?: string) =>
  ["wouldkeep", "editor", scope, ownerId, documentId]
    .filter((part): part is string => part !== undefined)
    .map((part) => encodeURIComponent(part))
    .join(":")

export const createEditorCoordinator = (options: EditorCoordinatorOptions): EditorCoordinator => {
  if (!isBoundedString(options.ownerId)) throw new TypeError("ownerId is required")
  if (options.senderId !== undefined && !isBoundedString(options.senderId)) {
    throw new TypeError("senderId must be a non-empty string")
  }

  const ownerId = options.ownerId
  const senderId = options.senderId ?? createSenderId()
  const now = options.now ?? Date.now
  const requestLock = options.requestLock === undefined ? defaultLockRequest() : options.requestLock
  const channelFactory =
    options.channelFactory === undefined ? defaultChannelFactory() : options.channelFactory
  const listeners = new Set<EditorStatusListener>()
  const localTails = new Map<string, Promise<void>>()
  let closed = false
  let channel: EditorStatusChannel | null = null

  const receiveMessage: EditorChannelMessageListener = ({ data }) => {
    if (closed) return
    const message = parseStatusMessage(data)
    if (!message || message.ownerId !== ownerId || message.senderId === senderId) return
    for (const listener of listeners) {
      try {
        listener(message)
      } catch {
        // A UI listener must not prevent other listeners from receiving coordination state.
      }
    }
  }

  if (channelFactory) {
    try {
      channel = channelFactory(coordinationName("channel", ownerId))
      channel?.addMessageListener(receiveMessage)
    } catch {
      try {
        channel?.close()
      } catch {
        // Channel setup is an optional enhancement; local serialization still protects this tab.
      }
      channel = null
    }
  }

  const runWithAvailableLock = async <Result>(
    documentId: string,
    task: () => Promise<Result> | Result,
  ): Promise<Result> => {
    if (!requestLock) return task()
    let enteredTask = false
    try {
      const result = await requestLock(coordinationName("lock", ownerId, documentId), async () => {
        enteredTask = true
        return task()
      })
      if (!enteredTask) return task()
      return result
    } catch (error) {
      if (enteredTask) throw error
      return task()
    }
  }

  const runExclusive = <Result>(
    documentId: string,
    task: () => Promise<Result> | Result,
  ): Promise<Result> => {
    if (closed) return Promise.reject(new EditorCoordinatorClosedError())
    if (!isBoundedString(documentId)) return Promise.reject(new TypeError("documentId is required"))
    if (typeof task !== "function") return Promise.reject(new TypeError("task is required"))

    const previous = localTails.get(documentId) ?? Promise.resolve()
    const result = previous
      .catch(() => undefined)
      .then(() => runWithAvailableLock(documentId, task))
    const tail = result.then(
      () => undefined,
      () => undefined,
    )
    localTails.set(documentId, tail)
    void tail.then(() => {
      if (localTails.get(documentId) === tail) localTails.delete(documentId)
    })
    return result
  }

  const publishStatus = (input: EditorStatusInput) => {
    if (closed || !channel) return false
    if (!isBoundedString(input.documentId) || !statuses.has(input.status)) return false
    if (input.operationId !== undefined && !isBoundedString(input.operationId)) return false
    if (input.revision !== undefined && !isRevision(input.revision)) return false
    const sentAt = now()
    if (!Number.isFinite(sentAt) || sentAt < 0) return false
    const message: EditorStatusMessage = {
      schemaVersion: EDITOR_COORDINATOR_SCHEMA_VERSION,
      kind: EDITOR_COORDINATOR_MESSAGE_KIND,
      ownerId,
      senderId,
      documentId: input.documentId,
      status: input.status,
      sentAt,
      ...(input.operationId === undefined ? {} : { operationId: input.operationId }),
      ...(input.revision === undefined ? {} : { revision: input.revision }),
    }
    try {
      channel.postMessage(message)
      return true
    } catch {
      return false
    }
  }

  const subscribe = (listener: EditorStatusListener) => {
    if (closed || typeof listener !== "function") return () => undefined
    listeners.add(listener)
    let subscribed = true
    return () => {
      if (!subscribed) return
      subscribed = false
      listeners.delete(listener)
    }
  }

  const close = () => {
    if (closed) return
    closed = true
    listeners.clear()
    if (!channel) return
    try {
      channel.removeMessageListener(receiveMessage)
    } catch {
      // Continue closing even if an injected channel cannot remove the listener.
    }
    try {
      channel.close()
    } catch {
      // Cleanup is best-effort and idempotent.
    }
    channel = null
  }

  return {
    ownerId,
    senderId,
    runExclusive,
    publishStatus,
    subscribe,
    close,
    isClosed: () => closed,
  }
}
