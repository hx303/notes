import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import {
  addEditorBackupMetadata,
  createSerializedSaveQueue,
  inspectEditorBackup,
  materializeEditorOutboxFormIdentity,
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

test("outbox record identity overrides stale payload form identity during replay", () => {
  const payloadForm = {
    title: "edited while saving",
    body: "the immutable content stays intact",
    documentId: "",
    revision: 0,
  }
  assert.deepEqual(
    materializeEditorOutboxFormIdentity(payloadForm, {
      documentId: "cloud-document",
      baseRevision: 1,
    }),
    {
      ...payloadForm,
      documentId: "cloud-document",
      revision: 1,
    },
  )
  assert.deepEqual(
    materializeEditorOutboxFormIdentity(
      { ...payloadForm, documentId: "stale-document", revision: 4 },
      { documentId: "new", baseRevision: 0 },
    ),
    { ...payloadForm, documentId: "", revision: 0 },
  )
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
  assert.ok((accountScript.match(/await requestDocumentSave\(\)/g)?.length ?? 0) >= 5)
  assert.doesNotMatch(accountScript, /await saveDocumentOnce\(\)/)
  assert.match(
    accountScript,
    /loadPublication\([\s\S]{0,220}isCurrentOpen[\s\S]{0,900}restoreLocalBackup\(documentId,[\s\S]{0,100}result\.data\?\.revision/,
  )
})

test("conflicts freeze the original backup until an explicit recovery action", () => {
  const conflictGuard = accountScript.indexOf(
    "if (editorConflict?.documentId === documentId) return false",
  )
  const backupWrite = accountScript.indexOf("const backup = addEditorBackupMetadata", conflictGuard)
  assert.ok(conflictGuard > 0)
  assert.ok(backupWrite > conflictGuard)
  assert.match(accountScript, /data-conflict-use-local[\s\S]*fillForm\(backup\)/)
  assert.match(
    accountScript,
    /data-conflict-use-cloud[\s\S]*archiveEditorConflict\(conflict, recoverableBackup\)/,
  )
  assert.match(
    accountScript,
    /data-conflict-save-copy[\s\S]*\[name=visibility\]\[value=private\][\s\S]*requestDocumentSave/,
  )
})

test("existing documents restore locally before attempting a cloud read", () => {
  const openDocument = accountScript.indexOf("const openDocumentOnce = async")
  const localRestore = accountScript.indexOf(
    "restoreLocalBackup(documentId, undefined, { deferConflict: true })",
    openDocument,
  )
  const cloudRead = accountScript.indexOf('.from("documents")', openDocument)
  assert.ok(openDocument > 0)
  assert.ok(localRestore > openDocument)
  assert.ok(cloudRead > localRestore)
  assert.match(accountScript, /if \(restoredLocally\)[\s\S]*离线编辑中，本地稿等待同步/)
})

test("partial cloud writes retain recovery data and online sync requires pending work", () => {
  assert.match(
    accountScript,
    /const sourcesSaved = await saveDocumentSources[\s\S]{0,400}version\.error[\s\S]*!tagsSaved[\s\S]*!prerequisitesSaved[\s\S]*!relatedSaved[\s\S]*!sourcesSaved/,
  )
  assert.match(accountScript, /const ownerId = String\(currentUser\.id\)/)
  assert.match(accountScript, /currentUser\?\.id === ownerId/)
  assert.match(accountScript, /client === saveClient/)
  assert.match(
    accountScript,
    /onlineHandler = async[\s\S]*editorConflict\?\.documentId[\s\S]*localStorage\.getItem\(localDraftKey/,
  )
})

test("save coordination is owner scoped, cross-tab exclusive, and SPA safe", () => {
  assert.match(accountScript, /createEditorCoordinator\(\{ ownerId \}\)/)
  assert.match(accountScript, /editorCoordinator\?\.runExclusive\(documentId, run\)/)
  assert.match(accountScript, /editorCoordinator\?\.publishStatus\(\{[\s\S]{0,160}status: "queued"/)
  assert.match(accountScript, /editorCoordinator\?\.close\(\)/)
  assert.match(accountScript, /另一标签页正在保存这条知识/)
  assert.match(accountScript, /另一标签页已保存新版本；当前本地改动仍保留/)
})

test("session changes invalidate private editor reads and clear sensitive UI state", () => {
  assert.match(accountScript, /let authEpoch = 0/)
  assert.match(accountScript, /const openEpoch = authEpoch/)
  assert.match(accountScript, /if \(!isCurrentOpen\(\)\) return false/)
  assert.match(accountScript, /event === "SIGNED_OUT"[\s\S]{0,220}clearSensitiveEditorState\(\)/)
  assert.match(accountScript, /clearSensitiveEditorState[\s\S]{0,500}form\?\.reset\(\)/)
  assert.match(accountScript, /const ownerId = String\(currentUser\.id\)/)
  assert.match(accountScript, /const syncRequest = authSyncRequests\.begin\(\)/)
  assert.match(accountScript, /if \(!isCurrentSync\(\)\) return\s+currentUser = resolvedUser/)
  assert.match(accountScript, /if \(isCurrentSync\(\)\) resolveAuthState\(\)/)
})

test("only the latest document-open request may update document-specific UI", () => {
  assert.match(accountScript, /const openRequest = openDocumentRequests\.begin\(\)/)
  assert.match(accountScript, /openDocumentRequests\.isCurrent\(openRequest\)/)
  assert.match(accountScript, /loadVersions\(documentId, isCurrentOpen\)/)
  assert.match(accountScript, /loadDocumentTags\(documentId, isCurrentOpen\)/)
  assert.match(accountScript, /loadDocumentLinks\(documentId, isCurrentOpen\)/)
  assert.match(accountScript, /loadDocumentSources\(documentId, isCurrentOpen\)/)
  assert.match(accountScript, /loadPublication\([\s\S]{0,180}isCurrentOpen/)
  assert.match(accountScript, /if \(!authContextIsCurrent\(context\) \|\| !isCurrent\(\)\) return/)
  assert.match(accountScript, /if \(field\) field\.value = names\.join/)
  assert.match(accountScript, /if \(field\) field\.value = values\.join/)
  assert.match(
    accountScript,
    /if \(!tagsLoaded \|\| !linksLoaded \|\| !sourcesLoaded \|\| !publicationLoaded\)/,
  )
  assert.match(accountScript, /标签、关系、来源或发布状态读取失败；已锁定编辑器/)
  assert.match(accountScript, /form\.inert = false[\s\S]{0,100}aria-busy", "false"/)
})

test("conflict recovery controls remain interactive after a gated document open", () => {
  const freezeStart = accountScript.indexOf("const freezeEditorConflict")
  const formUnlocked = accountScript.indexOf("form.inert = false", freezeStart)
  const conflictOnly = accountScript.indexOf("setEditorConflictInteractivity(true)", formUnlocked)
  assert.ok(freezeStart > 0)
  assert.ok(formUnlocked > freezeStart)
  assert.ok(conflictOnly > formUnlocked)
  assert.match(
    accountScript,
    /const saveTargetIsCurrent[\s\S]{0,600}editorConflict\?\.documentId !== documentIdentity[\s\S]{0,300}if \(!saveTargetIsCurrent\(\)\)/,
  )
  assert.match(
    accountScript,
    /setEditorConflictInteractivity[\s\S]{0,700}child === conflictSection[\s\S]{0,200}child\.inert = true/,
  )
  assert.match(accountScript, /data-editor-clear[\s\S]{0,180}if \(editorConflict\)/)
  assert.match(accountScript, /data-conflict-use-local/)
  assert.match(accountScript, /data-conflict-use-cloud/)
  assert.match(accountScript, /data-conflict-save-copy/)
  assert.match(accountScript, /latest: await editorOutbox\.resolveDocumentConflict/)
  assert.match(accountScript, /recoverableConflictBackup\(conflict, resolution\.latest\)/)
})

test("conflict choices are single-flight and storage denial keeps durable recovery usable", () => {
  assert.match(accountScript, /let editorConflictResolutionPending = false/)
  assert.match(
    accountScript,
    /runEditorConflictResolution[\s\S]{0,500}editorConflictResolutionPending = true[\s\S]{0,300}control\.disabled = true[\s\S]{0,500}editorConflictResolutionPending = false/,
  )
  assert.ok((accountScript.match(/await runEditorConflictResolution/g)?.length ?? 0) >= 3)
  assert.match(
    accountScript,
    /let raw: string \| null = null[\s\S]{0,120}localStorage\.getItem\(localDraftKey\(conflict\.ownerId, conflict\.documentId\)\)[\s\S]{0,100}catch/,
  )
  assert.match(
    accountScript,
    /const archived = archiveEditorConflict[\s\S]{0,500}archived[\s\S]{0,180}浏览器恢复归档不可用/,
  )
  assert.match(
    accountScript,
    /const rememberBackup[\s\S]{0,500}editorOutbox\.restoreConflict[\s\S]{0,900}rememberBackup\(recoverableConflictBackup\(conflict, frozen\)\)/,
  )
})

test("document loading invalidates queued saves and stages metadata only after the core read", () => {
  const openStart = accountScript.indexOf("const openDocumentOnce = async")
  const invalidate = accountScript.indexOf("invalidateEditorSaves()", openStart)
  const coreRead = accountScript.indexOf('.from("documents")', openStart)
  const coreFill = accountScript.indexOf("fillForm(result.data ?? {})", coreRead)
  const metadataClear = accountScript.indexOf(
    'for (const name of ["tags", "prerequisites", "related"])',
    coreFill,
  )
  assert.ok(openStart > 0)
  assert.ok(invalidate > openStart)
  assert.ok(coreRead > invalidate)
  assert.ok(coreFill > coreRead)
  assert.ok(metadataClear > coreFill)
  assert.match(
    accountScript,
    /const requestDocumentSave[\s\S]{0,500}if \(!editorSaveIsAllowed\(documentId, requestSaveEpoch\)\)[\s\S]{0,300}return false[\s\S]{0,500}editorOutbox\.enqueue/,
  )
  const saveStart = accountScript.indexOf("const saveDocumentOnce")
  const knowledgeBase = accountScript.indexOf(
    "const knowledgeBaseId = await ensureKnowledgeBase()",
    saveStart,
  )
  const postAwaitGuard = accountScript.indexOf(
    "if (!knowledgeBaseId || !saveTargetIsCurrent()) return false",
    knowledgeBase,
  )
  const coreWrite = accountScript.indexOf('.from("documents")', postAwaitGuard)
  assert.ok(saveStart > 0)
  assert.ok(knowledgeBase > saveStart)
  assert.ok(postAwaitGuard > knowledgeBase)
  assert.ok(coreWrite > postAwaitGuard)
  assert.match(
    accountScript,
    /const openDocument = \([\s\S]{0,180}runEditorUiExclusive\(\(\) => openDocumentOnce/,
  )
  assert.match(
    accountScript,
    /runEditorUiExclusive\(\(\) => editorCoordinator\?\.runExclusive\(documentId, run\)/,
  )
  assert.match(accountScript, /if \(options\.deferConflict\) return false/)
  assert.match(accountScript, /resolveDocumentConflict\(conflict\.ownerId, conflict\.documentId\)/)
})

test("the durable outbox is wired before network saves and recovered after refresh", () => {
  assert.match(accountScript, /createIndexedDbEditorOutboxRepository\(\)/)
  assert.match(accountScript, /await editorOutbox\.recoverInterrupted\(ownerId, documentId\)/)
  assert.match(accountScript, /await editorOutbox\.enqueue\(\{/)
  assert.match(accountScript, /await editorOutbox\.claimNext\(ownerId, documentId\)/)
  assert.match(accountScript, /completeAfterSuccess\(\s*ownerId,\s*finalClaim/)
  assert.match(accountScript, /restoreDurableOutboxBackup\(documentId, isCurrentOpen\)/)
  assert.match(accountScript, /bindCreatedDocument\(/)
  assert.match(accountScript, /materializeEditorOutboxFormIdentity\(value, claim\.record\)/)
  assert.match(
    accountScript,
    /materializeEditorOutboxFormIdentity\(record\.payload\.form, record\)/,
  )
  assert.match(
    accountScript,
    /inspection\.backup\.__editorRecovery\.baseRevision >= record\.baseRevision/,
  )
  assert.match(accountScript, /materializeEditorOutboxFormIdentity\(inspection\.backup, record\)/)
  assert.match(accountScript, /const durableSaveOutcomes = new Map/)
  assert.match(accountScript, /completeAfterSuccess\([\s\S]{0,100}outcome\.revision/)
  assert.match(accountScript, /advanceAfterPartialSuccess\([\s\S]{0,100}outcome\.revision/)
  assert.match(accountScript, /form\.inert = busy/)
})

test("recovered new drafts and historical versions cannot be silently mixed or overwritten", () => {
  assert.match(accountScript, /preferRecovery && pendingNewDraft && restoreLocalBackup\("new"\)/)
  assert.match(accountScript, /wouldkeep:editor-draft-archive:/)
  assert.match(
    accountScript,
    /const normalizedSnapshot = \{[\s\S]{0,300}tags: ""[\s\S]{0,200}related: ""/,
  )
  assert.match(accountScript, /renderSources\(\s*Array\.isArray\(snapshotSources\)/)
  assert.match(
    accountScript,
    /if \(\(readForm\(\)\.documentId \|\| "new"\) !== documentId\)[\s\S]{0,160}return false/,
  )
})

test("invalid backups are quarantined instead of silently discarded", () => {
  assert.match(accountScript, /wouldkeep:editor-recovery-quarantine:/)
  assert.match(
    accountScript,
    /localStorage\.setItem\([\s\S]{0,200}editor-recovery-quarantine:[\s\S]{0,300}localStorage\.removeItem/,
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
