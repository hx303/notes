import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import {
  addEditorBackupMetadata,
  createSerializedSaveQueue,
  inspectEditorBackup,
} from "./scripts/editorRecovery"

const accountScript = readFileSync(
  new URL("./scripts/accountPage.inline.ts", import.meta.url),
  "utf8",
)

test("an existing-document backup restores only against the revision it was based on", () => {
  const backup = addEditorBackupMetadata(
    { title: "local title", body: "local body" },
    "owner-a",
    "document-a",
    4,
    10,
  )
  const raw = JSON.stringify(backup)

  assert.deepEqual(inspectEditorBackup(raw, "owner-a", "document-a", 4), {
    state: "restore",
    backup,
  })
  assert.deepEqual(inspectEditorBackup(raw, "owner-a", "document-a", 5), {
    state: "conflict",
    backup,
    reason: "stale-base",
  })
  assert.equal(inspectEditorBackup(raw, "owner-b", "document-a", 4).state, "invalid")
})

test("legacy new drafts remain recoverable but legacy cloud drafts fail closed", () => {
  const raw = JSON.stringify({ title: "legacy", body: "kept" })
  assert.equal(inspectEditorBackup(raw, "owner-a", "new").state, "restore")
  assert.deepEqual(inspectEditorBackup(raw, "owner-a", "document-a", 2), {
    state: "conflict",
    backup: { title: "legacy", body: "kept" },
    reason: "unknown-base",
  })
  assert.equal(inspectEditorBackup("not-json", "owner-a", "new").state, "invalid")
})

test("save requests are serialized and an in-flight edit produces one follow-up save", async () => {
  const releases: Array<() => void> = []
  let calls = 0
  let inFlight = 0
  let maxInFlight = 0
  const queue = createSerializedSaveQueue(async () => {
    calls += 1
    inFlight += 1
    maxInFlight = Math.max(maxInFlight, inFlight)
    await new Promise<void>((resolve) => releases.push(resolve))
    inFlight -= 1
    return true
  })

  const first = queue.request()
  const second = queue.request()
  const third = queue.request()
  assert.equal(queue.isSaving(), true)
  assert.equal(calls, 1)

  releases.shift()?.()
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  assert.equal(calls, 2)
  releases.shift()?.()

  assert.equal(await first, true)
  assert.equal(await second, true)
  assert.equal(await third, true)
  assert.equal(maxInFlight, 1)
  assert.equal(calls, 2)
  assert.equal(queue.isSaving(), false)
})

test("a failed save remains failed even when the coalesced follow-up succeeds", async () => {
  const outcomes = [false, true]
  let releaseFirst: (() => void) | undefined
  const queue = createSerializedSaveQueue(async () => {
    const outcome = outcomes.shift() ?? true
    if (!outcome) await new Promise<void>((resolve) => (releaseFirst = resolve))
    return outcome
  })

  const first = queue.request()
  const second = queue.request()
  releaseFirst?.()
  assert.equal(await first, false)
  assert.equal(await second, false)
})

test("all editor save entry points use the serialized queue", () => {
  assert.match(accountScript, /createSerializedSaveQueue\(saveDocumentOnce\)/)
  assert.equal(accountScript.match(/await requestDocumentSave\(\)/g)?.length, 5)
  assert.doesNotMatch(accountScript, /await saveDocumentOnce\(\)/)
  assert.match(
    accountScript,
    /loadPublication\(documentId,[\s\S]{0,200}restoreLocalBackup\(documentId,[\s\S]{0,100}result\.data\?\.revision/,
  )
})

test("a successful older save cannot remove a backup written by a newer edit", () => {
  assert.match(accountScript, /const generationAtStart = editorChangeGeneration/)
  assert.match(
    accountScript,
    /if \(editorChangeGeneration === generationAtStart\)[\s\S]{0,150}localStorage\.removeItem/,
  )
  assert.match(
    accountScript,
    /form\.addEventListener\("input", \(\) => \{\s*editorChangeGeneration \+= 1/,
  )
})
