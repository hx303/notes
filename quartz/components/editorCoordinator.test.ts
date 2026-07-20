import assert from "node:assert/strict"
import test from "node:test"
import {
  EDITOR_COORDINATOR_MESSAGE_KIND,
  EDITOR_COORDINATOR_SCHEMA_VERSION,
  EditorCoordinatorClosedError,
  type EditorChannelMessageListener,
  type EditorLockRequest,
  type EditorStatusChannel,
  type EditorStatusChannelFactory,
  createEditorCoordinator,
} from "./scripts/editorCoordinator"

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((done) => (resolve = done))
  return { promise, resolve }
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

test("the no-Web-Locks fallback serializes one document without blocking another", async () => {
  const coordinator = createEditorCoordinator({
    ownerId: "owner-a",
    senderId: "tab-a",
    requestLock: null,
    channelFactory: null,
  })
  const firstRelease = deferred()
  const events: string[] = []
  const first = coordinator.runExclusive("document-a", async () => {
    events.push("first-start")
    await firstRelease.promise
    events.push("first-end")
    return "first"
  })
  const second = coordinator.runExclusive("document-a", async () => {
    events.push("second")
    return "second"
  })
  const otherDocument = coordinator.runExclusive("document-b", async () => {
    events.push("other")
    return "other"
  })

  await flush()
  assert.deepEqual(events, ["first-start", "other"])
  firstRelease.resolve()
  assert.deepEqual(await Promise.all([first, second, otherDocument]), ["first", "second", "other"])
  assert.deepEqual(events, ["first-start", "other", "first-end", "second"])
})

test("shared Web Locks serialize the same document across coordinator instances", async () => {
  const tails = new Map<string, Promise<void>>()
  const requestedNames: string[] = []
  const requestLock: EditorLockRequest = <Result>(name: string, task: () => Promise<Result>) => {
    requestedNames.push(name)
    const previous = tails.get(name) ?? Promise.resolve()
    const result = previous.then(task, task)
    tails.set(
      name,
      result.then(
        () => undefined,
        () => undefined,
      ),
    )
    return result
  }
  const firstRelease = deferred()
  const events: string[] = []
  const firstCoordinator = createEditorCoordinator({
    ownerId: "owner/a",
    senderId: "tab-a",
    requestLock,
    channelFactory: null,
  })
  const secondCoordinator = createEditorCoordinator({
    ownerId: "owner/a",
    senderId: "tab-b",
    requestLock,
    channelFactory: null,
  })

  const first = firstCoordinator.runExclusive("document/a", async () => {
    events.push("first-start")
    await firstRelease.promise
    events.push("first-end")
  })
  const second = secondCoordinator.runExclusive("document/a", async () => {
    events.push("second")
  })

  await flush()
  assert.deepEqual(events, ["first-start"])
  firstRelease.resolve()
  await Promise.all([first, second])
  assert.deepEqual(events, ["first-start", "first-end", "second"])
  assert.deepEqual(requestedNames, [
    "wouldkeep:editor:lock:owner%2Fa:document%2Fa",
    "wouldkeep:editor:lock:owner%2Fa:document%2Fa",
  ])
})

test("a lock acquisition failure falls back locally but a task failure is never replayed", async () => {
  let acquisitions = 0
  let successfulTaskCalls = 0
  const unavailableLock: EditorLockRequest = async () => {
    acquisitions += 1
    throw new Error("locks unavailable")
  }
  const fallbackCoordinator = createEditorCoordinator({
    ownerId: "owner-a",
    requestLock: unavailableLock,
    channelFactory: null,
  })
  assert.equal(
    await fallbackCoordinator.runExclusive("document-a", () => {
      successfulTaskCalls += 1
      return "saved"
    }),
    "saved",
  )
  assert.equal(acquisitions, 1)
  assert.equal(successfulTaskCalls, 1)

  let failedTaskCalls = 0
  const workingLock: EditorLockRequest = async (_name, task) => task()
  const taskFailureCoordinator = createEditorCoordinator({
    ownerId: "owner-a",
    requestLock: workingLock,
    channelFactory: null,
  })
  await assert.rejects(
    () =>
      taskFailureCoordinator.runExclusive("document-a", () => {
        failedTaskCalls += 1
        throw new Error("save failed")
      }),
    /save failed/,
  )
  assert.equal(failedTaskCalls, 1)
  assert.equal(await taskFailureCoordinator.runExclusive("document-a", () => "next"), "next")
})

class FakeChannelHub {
  readonly channels = new Map<string, Set<FakeChannel>>()

  factory: EditorStatusChannelFactory = (name) => {
    const channel = new FakeChannel(this, name)
    const channels = this.channels.get(name) ?? new Set<FakeChannel>()
    channels.add(channel)
    this.channels.set(name, channels)
    return channel
  }

  broadcast(sender: FakeChannel, message: unknown) {
    for (const channel of this.channels.get(sender.name) ?? []) {
      if (channel !== sender) channel.emit(message)
    }
  }

  remove(channel: FakeChannel) {
    this.channels.get(channel.name)?.delete(channel)
  }
}

class FakeChannel implements EditorStatusChannel {
  readonly listeners = new Set<EditorChannelMessageListener>()
  closeCalls = 0
  removeCalls = 0

  constructor(
    private readonly hub: FakeChannelHub,
    readonly name: string,
  ) {}

  postMessage(message: unknown) {
    this.hub.broadcast(this, message)
  }

  addMessageListener(listener: EditorChannelMessageListener) {
    this.listeners.add(listener)
  }

  removeMessageListener(listener: EditorChannelMessageListener) {
    this.removeCalls += 1
    this.listeners.delete(listener)
  }

  emit(message: unknown) {
    for (const listener of this.listeners) listener({ data: message })
  }

  close() {
    this.closeCalls += 1
    this.hub.remove(this)
  }
}

test("BroadcastChannel status is scoped, validated, unsubscribeable, and excludes the sender", () => {
  const hub = new FakeChannelHub()
  const sender = createEditorCoordinator({
    ownerId: "owner-a",
    senderId: "tab-a",
    now: () => 42,
    requestLock: null,
    channelFactory: hub.factory,
  })
  const receiver = createEditorCoordinator({
    ownerId: "owner-a",
    senderId: "tab-b",
    requestLock: null,
    channelFactory: hub.factory,
  })
  const otherOwner = createEditorCoordinator({
    ownerId: "owner-b",
    senderId: "tab-c",
    requestLock: null,
    channelFactory: hub.factory,
  })
  const received: unknown[] = []
  const selfReceived: unknown[] = []
  const otherReceived: unknown[] = []
  const unsubscribe = receiver.subscribe((message) => received.push(message))
  sender.subscribe((message) => selfReceived.push(message))
  otherOwner.subscribe((message) => otherReceived.push(message))

  assert.equal(
    sender.publishStatus({
      documentId: "document-a",
      operationId: "operation-a",
      revision: 4,
      status: "saved",
    }),
    true,
  )
  assert.deepEqual(received, [
    {
      schemaVersion: EDITOR_COORDINATOR_SCHEMA_VERSION,
      kind: EDITOR_COORDINATOR_MESSAGE_KIND,
      ownerId: "owner-a",
      senderId: "tab-a",
      documentId: "document-a",
      operationId: "operation-a",
      revision: 4,
      status: "saved",
      sentAt: 42,
    },
  ])
  assert.deepEqual(selfReceived, [])
  assert.deepEqual(otherReceived, [])

  const ownerAChannels = [...(hub.channels.get("wouldkeep:editor:channel:owner-a") ?? [])]
  const receiverChannel = ownerAChannels[1]
  assert.ok(receiverChannel)
  receiverChannel.emit({ kind: EDITOR_COORDINATOR_MESSAGE_KIND, status: "saved" })
  receiverChannel.emit({
    schemaVersion: EDITOR_COORDINATOR_SCHEMA_VERSION,
    kind: EDITOR_COORDINATOR_MESSAGE_KIND,
    ownerId: "owner-b",
    senderId: "tab-x",
    documentId: "document-a",
    status: "saved",
    sentAt: 43,
  })
  assert.equal(received.length, 1)

  unsubscribe()
  assert.equal(sender.publishStatus({ documentId: "document-a", status: "conflict" }), true)
  assert.equal(received.length, 1)
})

test("close removes channel listeners once and disables new work and notifications", async () => {
  const hub = new FakeChannelHub()
  const coordinator = createEditorCoordinator({
    ownerId: "owner-a",
    senderId: "tab-a",
    requestLock: null,
    channelFactory: hub.factory,
  })
  const channel = [...(hub.channels.values().next().value ?? [])][0]
  assert.ok(channel)

  coordinator.subscribe(() => assert.fail("closed listeners must not run"))
  coordinator.close()
  coordinator.close()

  assert.equal(coordinator.isClosed(), true)
  assert.equal(channel.removeCalls, 1)
  assert.equal(channel.closeCalls, 1)
  assert.equal(coordinator.publishStatus({ documentId: "document-a", status: "saved" }), false)
  await assert.rejects(
    () => coordinator.runExclusive("document-a", () => "must not run"),
    EditorCoordinatorClosedError,
  )
})

test("channel construction and posting failures degrade without breaking exclusive work", async () => {
  const constructorFailure = createEditorCoordinator({
    ownerId: "owner-a",
    requestLock: null,
    channelFactory: () => {
      throw new Error("channel unavailable")
    },
  })
  assert.equal(
    constructorFailure.publishStatus({ documentId: "document-a", status: "queued" }),
    false,
  )
  assert.equal(await constructorFailure.runExclusive("document-a", () => "safe"), "safe")

  const postFailure = createEditorCoordinator({
    ownerId: "owner-a",
    requestLock: null,
    channelFactory: () => ({
      postMessage: () => {
        throw new Error("post failed")
      },
      addMessageListener: () => undefined,
      removeMessageListener: () => undefined,
      close: () => undefined,
    }),
  })
  assert.equal(postFailure.publishStatus({ documentId: "document-a", status: "queued" }), false)
})
