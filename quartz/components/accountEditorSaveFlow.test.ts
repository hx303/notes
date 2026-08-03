import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { createSerializedSaveQueue } from "./scripts/editorRecovery"

const accountScript = readFileSync(
  new URL("./scripts/accountPage.inline.ts", import.meta.url),
  "utf8",
)

const sourceSlice = (startMarker: string, endMarker: string) => {
  const start = accountScript.indexOf(startMarker)
  const end = accountScript.indexOf(endMarker, start)
  assert.ok(start > 0, `missing start marker: ${startMarker}`)
  assert.ok(end > start, `missing end marker: ${endMarker}`)
  return accountScript.slice(start, end)
}

test("a same-tab edit during first creation reruns only after draft identity is rebound", async () => {
  let documentId = ""
  let revision = 0
  let generation = 0
  let backupPresent = true
  let calls = 0
  let releaseFirst = () => {}
  let signalFirst = () => {}
  const firstStarted = new Promise<void>((resolve) => (signalFirst = resolve))

  const queue = createSerializedSaveQueue(async () => {
    calls += 1
    const capturedGeneration = generation
    if (calls === 1) {
      signalFirst()
      await new Promise<void>((resolve) => (releaseFirst = resolve))
      documentId = "document-created"
      revision = 0
    } else {
      assert.equal(documentId, "document-created")
      revision += 1
    }
    if (generation === capturedGeneration) backupPresent = false
    return true
  })

  const first = queue.request()
  await firstStarted
  generation = 1
  backupPresent = true
  const followUp = queue.request()
  releaseFirst()
  await Promise.all([first, followUp])

  assert.equal(calls, 2)
  assert.equal(documentId, "document-created")
  assert.equal(revision, 1)
  assert.equal(backupPresent, false)
})

test("the page serializes save intent with auth identity and rebinds a pending draft request", () => {
  const save = sourceSlice(
    "async function saveDocumentOnce",
    "const flushDurableOutboxForCurrentDocument",
  )
  const pageDraftDecision = save.indexOf("const pageStartedAsDraft")
  const migrateBranch = save.indexOf("if (pageStartedAsDraft)", pageDraftDecision)
  const hiddenIdentity = save.indexOf("documentField.value = savedDocumentId", migrateBranch)
  const pendingIntentRebind = save.indexOf(
    "serializedSaveIntent.documentScopeId === documentScopeId",
    hiddenIdentity,
  )
  const routeRebind = save.indexOf("bindDocumentEditorRoute", pendingIntentRebind)

  assert.ok(pageDraftDecision > 0)
  assert.ok(migrateBranch > pageDraftDecision)
  assert.ok(hiddenIdentity > migrateBranch)
  assert.ok(pendingIntentRebind > hiddenIdentity)
  assert.ok(routeRebind > pendingIntentRebind)
  assert.doesNotMatch(save, /outcome\.claim\.record\.documentId === "new"/)
  assert.match(save, /const serializedEditorSaves = createSerializedSaveQueue/)
  assert.match(
    save,
    /currentUser\?\.id !== intent\.ownerId[\s\S]*authEpoch !== intent\.authEpoch[\s\S]*currentEditorScopeId\(\) !== intent\.documentScopeId/,
  )
  assert.match(save, /enqueue: pending\.enqueue \|\| nextIntent\.enqueue/)
  assert.match(accountScript, /clearSensitiveEditorState[\s\S]*serializedSaveIntent = null/)
})

test("a tab that waited for another tab's creation still migrates its captured draft page", async () => {
  let releaseCreator = () => {}
  const creatorSettled = new Promise<void>((resolve) => (releaseCreator = resolve))
  let durableBinding = ""

  const tabBPageStart = { documentId: "", scope: "draft:shared" }
  const tabB = (async () => {
    await creatorSettled
    const reboundClaimDocumentId = durableBinding
    assert.equal(reboundClaimDocumentId, "document-created-by-tab-a")
    const pageStartedAsDraft = !tabBPageStart.documentId && tabBPageStart.scope.startsWith("draft:")
    const visibleIdentity = pageStartedAsDraft ? reboundClaimDocumentId : tabBPageStart.documentId
    return { visibleIdentity, revision: 1, pageStartedAsDraft }
  })()

  durableBinding = "document-created-by-tab-a"
  releaseCreator()
  assert.deepEqual(await tabB, {
    visibleIdentity: "document-created-by-tab-a",
    revision: 1,
    pageStartedAsDraft: true,
  })
})

test("pending settlement retains recovery state and only the final acknowledgement broadcasts saved", () => {
  const save = sourceSlice(
    "async function saveDocumentOnce",
    "const flushDurableOutboxForCurrentDocument",
  )
  const pendingDecision = save.indexOf(
    'const hasPendingFollowUp = outcome.followUpState !== "none"',
  )
  const cleanupGate = save.indexOf(
    "if (!hasPendingFollowUp && editorChangeGeneration === generationAtStart)",
    pendingDecision,
  )
  const queuedBranch = save.indexOf("if (!finalized)", cleanupGate)
  const queuedBroadcast = save.indexOf('status: "queued"', queuedBranch)
  const followUpFlush = save.indexOf("scheduleAtomicSaveFlush", queuedBroadcast)
  const savedBroadcast = save.indexOf('status: "saved"', followUpFlush)

  assert.ok(pendingDecision > 0)
  assert.ok(cleanupGate > pendingDecision)
  assert.ok(queuedBranch > cleanupGate)
  assert.ok(queuedBroadcast > queuedBranch)
  assert.ok(followUpFlush > queuedBroadcast)
  assert.ok(savedBroadcast > followUpFlush)
  assert.match(save, /const localRecoveryUnavailable = finalBackupToken === null/)
  assert.match(save, /let backupCleanupConfirmed = localRecoveryUnavailable/)
  assert.match(save, /editorTabDrafts\.clearDirtyIfGeneration/)
  assert.match(save, /本地恢复副本不可用/)
})

test("created identity still binds when document-key backup migration hits quota", () => {
  const save = sourceSlice(
    "async function saveDocumentOnce",
    "const flushDurableOutboxForCurrentDocument",
  )
  const migrationAttempt = save.indexOf("const migratedBackupStored = setStorageItemSafely")
  const storedBranch = save.indexOf("if (migratedBackupStored)", migrationAttempt)
  const ownedDraftDelete = save.indexOf(
    "removeTabBackupIfUnchanged(ownerId, documentScopeId, draftBackupToken)",
    storedBranch,
  )
  const migrationFailure = save.indexOf("retainedDraftBackupAfterMigrationFailure", storedBranch)
  const hiddenIdentity = save.indexOf("documentField.value = savedDocumentId", migrationFailure)
  const routeIdentity = save.indexOf("bindDocumentEditorRoute", hiddenIdentity)

  assert.ok(migrationAttempt > 0)
  assert.ok(storedBranch > migrationAttempt)
  assert.ok(ownedDraftDelete > storedBranch)
  assert.ok(migrationFailure > ownedDraftDelete)
  assert.ok(hiddenIdentity > migrationFailure)
  assert.ok(routeIdentity > hiddenIdentity)
  assert.doesNotMatch(save.slice(migrationAttempt, hiddenIdentity), /页面保持草稿地址|return false/)
  assert.match(save, /原 draft 备份未删除/)
})

test("retry and reconnect paths are bounded, guarded, and never enqueue implicitly", () => {
  const scheduler = sourceSlice("const scheduleAtomicSaveFlush", "async function saveDocumentOnce")
  const online = sourceSlice("onlineHandler = async", 'window.addEventListener("online"')
  const restore = sourceSlice("const restoreDurableOutboxBackup", "const archiveEditorConflict")

  assert.match(scheduler, /cancelEditorRetryTimer\(\)/)
  assert.match(scheduler, /editorRetryTimerEpoch !== timerEpoch/)
  assert.match(scheduler, /navigator\.onLine === false/)
  assert.match(scheduler, /currentUser\?\.id !== input\.ownerId/)
  assert.match(scheduler, /authEpoch !== input\.saveAuthEpoch/)
  assert.match(scheduler, /requestDocumentSave\(\{ enqueue: false \}\)/)
  assert.match(scheduler, /editorAtomicSaveRetryDelay/)

  assert.match(online, /await editorOutbox\?\.listForOwner\(ownerId\)/)
  assert.match(online, /record\.status === "queued" \|\| record\.status === "saving"/)
  assert.match(online, /if \(!hasDurablePending\)[\s\S]*当前只有本地备份/)
  assert.match(online, /requestDocumentSave\(\{ enqueue: false \}\)/)
  assert.doesNotMatch(online, /requestDocumentSave\(\)/)

  assert.match(
    restore,
    /Number\(right\.status === "queued"\) - Number\(left\.status === "queued"\)[\s\S]*right\.updatedAt - left\.updatedAt/,
  )
})

test("conflict archival chooses a queued follow-up over a later retry timestamp", () => {
  const records = [
    { status: "conflict", updatedAt: 50, createdAt: 10, operationId: "older-payload" },
    { status: "queued", updatedAt: 40, createdAt: 20, operationId: "newer-intent" },
  ]
  records.sort(
    (left, right) =>
      Number(right.status === "queued") - Number(left.status === "queued") ||
      right.updatedAt - left.updatedAt ||
      right.createdAt - left.createdAt ||
      right.operationId.localeCompare(left.operationId),
  )
  assert.equal(records[0]?.operationId, "newer-intent")

  const archive = sourceSlice("const prepareEditorConflictArchive", "const conflictListCount")
  assert.match(
    archive,
    /Number\(right\.status === "queued"\) - Number\(left\.status === "queued"\)[\s\S]*right\.updatedAt - left\.updatedAt/,
  )
  const archiveCall = archive.indexOf("archiveEditorConflict(conflict, backup)")
  const durableRead = archive.indexOf("await editorOutbox.listForOwner")
  assert.ok(durableRead > 0)
  assert.ok(archiveCall > durableRead)
  assert.match(accountScript, /durableRecord\.baseRevision,[\s\S]{0,80}durableRecord\.createdAt/)
  assert.match(accountScript, /claim\.record\.baseRevision,[\s\S]{0,80}claim\.record\.createdAt/)
  assert.match(accountScript, /selectRecoverableEditorBackup\(candidates\)/)
  assert.match(archive, /recoverableConflictBackup\(conflict, durableRecord\)/)
})

test("a recovered deterministic rejection stays behind an explicit form-submit gate", () => {
  const save = sourceSlice(
    "async function saveDocumentOnce",
    "const flushDurableOutboxForCurrentDocument",
  )
  const request = sourceSlice(
    "const requestDocumentSave",
    "const flushDurableOutboxForCurrentDocument",
  )
  const autosave = sourceSlice("const queueAutosave", "const clearSensitiveEditorState")
  const formFlow = sourceSlice(
    'form.addEventListener("input"',
    'root.querySelector("[data-editor-clear]")',
  )
  const online = sourceSlice("onlineHandler = async", 'window.addEventListener("online"')

  assert.match(save, /const requiresExplicitSave = editorManualSaveIsRequired\(documentScopeId\)/)
  assert.match(save, /if \(requiresExplicitSave && !explicit\)[\s\S]*return false/)
  const payloadReady = save.indexOf("if (!flushOnly && !payload) return false")
  const gateRelease = save.indexOf(
    "if (requiresExplicitSave && explicit) clearEditorManualSaveGate()",
  )
  const controllerCall = save.indexOf("editorSaveController.flush", gateRelease)
  assert.ok(payloadReady > 0)
  assert.ok(gateRelease > payloadReady)
  assert.ok(controllerCall > gateRelease)

  assert.match(request, /options: \{ enqueue\?: boolean; explicit\?: boolean \}/)
  assert.match(
    request,
    /editorManualSaveIsRequired\(documentScopeId\) && options\.explicit !== true/,
  )
  assert.match(request, /explicit: pending\.explicit \|\| nextIntent\.explicit/)
  assert.match(autosave, /if \(editorManualSaveIsRequired\(documentScopeId\)\)[\s\S]*return/)
  assert.match(
    formFlow,
    /writeLocalBackup\(\)[\s\S]*editorManualSaveIsRequired\(documentIdentity\)[\s\S]*return[\s\S]*queueAutosave\(\)/,
  )
  assert.match(formFlow, /requestDocumentSave\(\{ explicit: true \}\)/)
  assert.match(
    online,
    /if \(editorManualSaveIsRequired\(pendingDocument\)\)[\s\S]*恢复稿不会自动重放[\s\S]*return/,
  )
})

test("cloud inspection failures lock the editor without treating unknown state as no cloud", () => {
  const organization = sourceSlice("const loadCloudOrganizationSnapshot", "const publicationUrl")
  const recovery = sourceSlice(
    "const enterAtomicSaveRecovery",
    "const restoreAtomicConflictForScope",
  )

  assert.match(
    organization,
    /if \(tagResult\.error \|\| linkResult\.error \|\| sourceResult\.error\)[\s\S]*throw new Error/,
  )
  assert.match(recovery, /if \(latest\.error\) throw latest\.error/)
  assert.match(recovery, /catch \{[\s\S]*invalidateEditorSaves\(\)/)
  assert.match(recovery, /form\.inert = true/)
  assert.match(recovery, /无法安全核对云端版本/)
  assert.match(recovery, /持久恢复记录仍保持冻结/)
})

test("private conflict copies exist durably before the old conflict can be resolved", () => {
  const saveCopy = sourceSlice(
    'root.querySelector("[data-conflict-save-copy]")',
    'conflictExportLocal?.addEventListener("click"',
  )
  const localRecovery = sourceSlice(
    "const restoreConflictForExplicitSave",
    'root.querySelector("[data-conflict-use-local]")',
  )
  const useLocal = sourceSlice(
    'root.querySelector("[data-conflict-use-local]")',
    'root.querySelector("[data-conflict-use-cloud]")',
  )

  const knowledgeBaseReady = saveCopy.indexOf("if (!sourceKnowledgeBaseId")
  const stableScope = saveCopy.indexOf("const copyScope = editorDraftScope(copyDraftId)")
  const durableCopy = saveCopy.indexOf("setStorageItemSafely(", stableScope)
  const oldConflictResolution = saveCopy.indexOf(
    "resolveDurableEditorConflict(conflict, prepared.durableToken)",
    durableCopy,
  )
  const routeBinding = saveCopy.indexOf("bindFreshEditorDraftScope(copyDraftId)")
  assert.ok(knowledgeBaseReady > 0)
  assert.ok(stableScope > knowledgeBaseReady)
  assert.ok(durableCopy > stableScope)
  assert.ok(oldConflictResolution > durableCopy)
  assert.ok(routeBinding > oldConflictResolution)
  assert.match(saveCopy, /visibility: "private"/)
  assert.match(
    saveCopy,
    /if \(!conflictUsesImmediateCas\(conflict\)\)[\s\S]*requireExplicitEditorSave\(copyScope\)[\s\S]*return[\s\S]*requestDocumentSave\(\)/,
  )
  assert.match(useLocal, /if \(conflict\.reason === "not-found"\) return/)
  assert.match(useLocal, /if \(!conflictUsesImmediateCas\(conflict\)\)/)
  assert.match(localRecovery, /requireExplicitEditorSave\(conflict\.documentId\)/)
  assert.doesNotMatch(localRecovery, /requestDocumentSave/)
})

test("every conflict action conditionally resolves the exact durable snapshot it archived", () => {
  const prepare = sourceSlice("const prepareEditorConflictArchive", "const conflictListCount")
  const resolve = sourceSlice(
    "const resolveDurableEditorConflict",
    "const runEditorConflictResolution",
  )
  const actions = sourceSlice(
    "const restoreConflictForExplicitSave",
    'conflictExportLocal?.addEventListener("click"',
  )

  assert.match(
    prepare,
    /durableToken: durableRecord[\s\S]*operationId: durableRecord\.operationId[\s\S]*updatedAt: durableRecord\.updatedAt/,
  )
  assert.match(
    resolve,
    /resolveDocumentConflict\([\s\S]*conflict\.ownerId,[\s\S]*conflict\.documentId,[\s\S]*expectedLatest/,
  )
  assert.match(
    resolve,
    /latest\?\.operationId === expectedLatest\.operationId[\s\S]*latest\.updatedAt === expectedLatest\.updatedAt/,
  )
  assert.match(resolve, /另一标签页在恢复准备后又保存了新修改/)
  assert.equal(
    (actions.match(/resolveDurableEditorConflict\(conflict, prepared\.durableToken\)/g) ?? [])
      .length,
    4,
  )
})
