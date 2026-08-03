import assert from "node:assert/strict"
import test from "node:test"
import {
  flatDraftSessionRecoveryKey,
  readFlatDraftSessionRecovery,
  removeFlatDraftSessionRecovery,
  writeFlatDraftSessionRecovery,
} from "./scripts/flatDraftRecovery.ts"

const ownerId = "owner-1"
const documentScopeId = "draft:4eb3e2ff-7f06-4420-9d93-c9e2c57e6e14"

class MemoryStorage {
  values = new Map<string, string>()

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.values.delete(key)
  }
}

test("flat draft session recovery round-trips only the exact owner and draft scope", () => {
  const storage = new MemoryStorage()
  assert.equal(
    writeFlatDraftSessionRecovery(storage, {
      ownerId,
      documentScopeId,
      title: "刷新恢复",
      body: "这段内容不能丢失。",
      savedAt: 42,
    }),
    true,
  )
  assert.deepEqual(readFlatDraftSessionRecovery(storage, ownerId, documentScopeId), {
    version: 1,
    ownerId,
    documentScopeId,
    title: "刷新恢复",
    body: "这段内容不能丢失。",
    savedAt: 42,
  })
  assert.equal(readFlatDraftSessionRecovery(storage, "another-owner", documentScopeId), null)
  assert.equal(
    readFlatDraftSessionRecovery(storage, ownerId, "draft:d3868a09-4650-422b-a5f0-dbdcc5958fa8"),
    null,
  )
})

test("flat draft session recovery rejects malformed or non-canonical records", () => {
  const storage = new MemoryStorage()
  assert.equal(
    writeFlatDraftSessionRecovery(storage, {
      ownerId,
      documentScopeId: "draft:not-a-uuid",
      title: "unsafe",
      body: "unsafe",
    }),
    false,
  )
  storage.setItem(
    flatDraftSessionRecoveryKey(ownerId, documentScopeId),
    JSON.stringify({
      version: 1,
      ownerId,
      documentScopeId,
      title: "missing body",
      savedAt: 42,
    }),
  )
  assert.equal(readFlatDraftSessionRecovery(storage, ownerId, documentScopeId), null)
})

test("flat draft session recovery contains storage failures and supports explicit cleanup", () => {
  const failingStorage = {
    setItem: () => {
      throw new Error("quota")
    },
  }
  assert.equal(
    writeFlatDraftSessionRecovery(failingStorage, {
      ownerId,
      documentScopeId,
      title: "title",
      body: "body",
    }),
    false,
  )

  const storage = new MemoryStorage()
  writeFlatDraftSessionRecovery(storage, {
    ownerId,
    documentScopeId,
    title: "title",
    body: "body",
  })
  assert.equal(removeFlatDraftSessionRecovery(storage, ownerId, documentScopeId), true)
  assert.equal(readFlatDraftSessionRecovery(storage, ownerId, documentScopeId), null)
})
