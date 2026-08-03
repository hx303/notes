import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import {
  addEditorBackupMetadata,
  createEditorTabDraftState,
  createSerializedSaveQueue,
  inspectEditorBackup,
  materializeEditorOutboxFormIdentity,
  removeStorageItemIfUnchanged,
  selectRecoverableEditorBackup,
  setStorageItemSafely,
} from "./scripts/editorRecovery"

const accountScript = readFileSync(
  new URL("./scripts/accountPage.inline.ts", import.meta.url),
  "utf8",
)
const accountComponent = readFileSync(new URL("./AccountPage.tsx", import.meta.url), "utf8")
const editorDraftRouteScript = readFileSync(
  new URL("./scripts/editorDraftRoute.ts", import.meta.url),
  "utf8",
)
const editorOutboxScript = readFileSync(
  new URL("./scripts/editorOutbox.ts", import.meta.url),
  "utf8",
)
const editorSaveControllerScript = readFileSync(
  new URL("./scripts/editorSaveController.ts", import.meta.url),
  "utf8",
)

const stableDraftScope = "draft:00000000-0000-4000-8000-000000000001"

test("recovery selection follows intent creation time instead of later retry timestamps", () => {
  const conflict = addEditorBackupMetadata({ body: "old durable" }, "owner-a", "doc-a", 1, 10)
  const queued = addEditorBackupMetadata({ body: "queued edit" }, "owner-a", "doc-a", 1, 20)
  const local = addEditorBackupMetadata({ body: "local after RPC" }, "owner-a", "doc-a", 1, 30)

  assert.equal(
    selectRecoverableEditorBackup([
      { backup: conflict, priority: 2 },
      { backup: local, priority: 1 },
    ])?.body,
    "local after RPC",
  )
  assert.equal(
    selectRecoverableEditorBackup([
      { backup: conflict, priority: 0 },
      { backup: queued, priority: 2 },
    ])?.body,
    "queued edit",
  )
})

const sourceSection = (source: string, startMarker: string, endMarker: string) => {
  const start = source.indexOf(startMarker)
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`)
  const end = source.indexOf(endMarker, start + startMarker.length)
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`)
  return source.slice(start, end)
}

const assertAppearsInOrder = (source: string, ...markers: string[]) => {
  let cursor = -1
  for (const marker of markers) {
    const next = source.indexOf(marker, cursor + 1)
    assert.notEqual(next, -1, `missing ordered source marker: ${marker}`)
    assert.ok(next > cursor, `${marker} must appear after the preceding marker`)
    cursor = next
  }
}

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

test("stable draft backups remain recoverable but legacy cloud backups fail closed", () => {
  const legacyRaw = JSON.stringify({ title: "legacy", body: "kept" })
  const stableRaw = JSON.stringify(
    addEditorBackupMetadata({ title: "stable", body: "kept" }, "owner-a", stableDraftScope, 0, 10),
  )
  assert.equal(inspectEditorBackup(stableRaw, "owner-a", stableDraftScope).state, "restore")
  assert.deepEqual(inspectEditorBackup(legacyRaw, "owner-a", "document-a", 2), {
    state: "conflict",
    backup: { title: "legacy", body: "kept" },
    reason: "unknown-base",
  })
  assert.equal(inspectEditorBackup("not-json", "owner-a", stableDraftScope).state, "invalid")
})

test("a tab cannot delete another tab's newer backup or adopt cloud over its dirty form", () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => void values.delete(key),
  }
  const key = "wouldkeep:editor-draft:owner-a:document-a"
  const tabA = createEditorTabDraftState()
  const tabB = createEditorTabDraftState()

  tabA.markDirty("document-a", 1)
  tabA.rememberBackup("document-a", "tab-a-before-save")
  values.set(key, "tab-a-before-save")

  // Tab B edits while A's cloud save is pending, before B's autosave fires.
  tabB.markDirty("document-a", 1)
  tabB.rememberBackup("document-a", "tab-b-newer-input")
  values.set(key, "tab-b-newer-input")

  assert.equal(removeStorageItemIfUnchanged(storage, key, tabA.backupToken("document-a")), false)
  assert.equal(values.get(key), "tab-b-newer-input")
  assert.equal(tabA.clearDirtyIfGeneration("document-a", 1), true)
  assert.equal(tabB.isDirty("document-a"), true)
})

test("a tab clears only its matching generation and matching backup token", () => {
  const values = new Map<string, string>([["draft", "same-tab-backup"]])
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => void values.delete(key),
  }
  const tab = createEditorTabDraftState()
  tab.markDirty(stableDraftScope, 4)
  tab.rememberBackup(stableDraftScope, "same-tab-backup")

  assert.equal(tab.clearDirtyIfGeneration(stableDraftScope, 3), false)
  assert.equal(tab.isDirty(stableDraftScope), true)
  assert.equal(
    removeStorageItemIfUnchanged(storage, "draft", tab.backupToken(stableDraftScope)),
    true,
  )
  assert.equal(values.has("draft"), false)
  assert.equal(tab.clearDirtyIfGeneration(stableDraftScope, 4), true)
})

test("a first create removes this tab's stable draft token before moving dirty state", () => {
  const values = new Map<string, string>([["draft-key", "first-save-start"]])
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => void values.delete(key),
  }
  const tab = createEditorTabDraftState()
  tab.markDirty(stableDraftScope, 1)
  tab.rememberBackup(stableDraftScope, "first-save-start")

  // The same tab keeps typing while the first cloud insert is pending.
  tab.markDirty(stableDraftScope, 2)
  tab.rememberBackup(stableDraftScope, "latest-live-input")
  values.set("draft-key", "latest-live-input")
  const draftTokenAtBind = tab.backupToken(stableDraftScope)

  values.set("cloud-key", "latest-live-input")
  assert.equal(removeStorageItemIfUnchanged(storage, "draft-key", draftTokenAtBind), true)
  tab.moveDirty(stableDraftScope, "cloud-document")
  assert.equal(values.has("draft-key"), false)
  assert.equal(tab.isDirty(stableDraftScope), false)
  assert.equal(tab.isDirty("cloud-document"), true)
  assert.equal(tab.clearDirtyIfGeneration("cloud-document", 1), false)
  assert.equal(tab.clearDirtyIfGeneration("cloud-document", 2), true)
})

test("a failed first id backup write is observable so draft cleanup can be deferred", () => {
  const storage = {
    setItem: () => {
      throw new Error("quota")
    },
  }
  assert.equal(setStorageItemSafely(storage, "cloud-key", "latest-live-input"), false)
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

test("all editor save entry points use the replay-safe atomic controller", () => {
  const liveSave = sourceSection(
    accountScript,
    "async function saveDocumentOnce",
    "const requestDocumentSave",
  )

  assert.match(liveSave, /editorSaveController\.enqueueAndSave/)
  assert.match(liveSave, /editorSaveController\.flush/)
  assert.doesNotMatch(liveSave, /editorOutbox\./)
  assert.doesNotMatch(liveSave, /\.from\(/)
  assert.match(editorSaveControllerScript, /rpcClient\.rpc\(EDITOR_ATOMIC_SAVE_RPC, rpcArguments\)/)
  assert.ok((accountScript.match(/await requestDocumentSave\(\)/g)?.length ?? 0) >= 5)
  assert.doesNotMatch(accountScript, /await saveDocumentOnce\(\)/)
})

test("CAS, missing-cloud, and rejected saves freeze one strict snapshot for explicit recovery", () => {
  const recovery = sourceSection(
    accountScript,
    "const enterAtomicSaveRecovery",
    "const restoreAtomicConflictForScope",
  )
  const freeze = sourceSection(
    accountScript,
    "const freezeEditorConflict",
    "const restoreLocalBackup",
  )
  const actionAvailability = sourceSection(
    accountScript,
    "const applyEditorConflictActionAvailability",
    "const freezeEditorConflict",
  )

  assert.match(recovery, /status: "conflict" \| "not_found" \| "request_rejected"/)
  assert.match(recovery, /const snapshot = payload\.snapshot/)
  assert.match(recovery, /outcome\.status === "not_found"[\s\S]{0,180}"request-rejected"/)
  assert.match(recovery, /: "remote-write"/)
  assert.match(recovery, /const cloudAvailable = Boolean\(cloudRow\)/)
  assert.match(actionAvailability, /const localRecoveryAllowed = conflict\.reason !== "not-found"/)
  assert.match(
    actionAvailability,
    /if \(conflictUseLocal\) conflictUseLocal\.disabled = !localRecoveryAllowed/,
  )
  assert.match(
    actionAvailability,
    /if \(conflictUseCloud\) conflictUseCloud\.disabled = !cloudAvailable/,
  )
  assert.match(
    actionAvailability,
    /if \(conflictExportLocal\) conflictExportLocal\.disabled = false/,
  )
  assert.match(freeze, /applyEditorConflictActionAvailability\(\)/)
  assert.match(accountComponent, /data-conflict-save-copy/)
  assert.match(accountComponent, /data-conflict-export-local/)
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

test("strict snapshots carry all editor content through one RPC with no partial cloud path", () => {
  const materialize = sourceSection(
    accountScript,
    "const materializeCurrentAtomicSave",
    "const atomicOutcomeMessage",
  )
  const liveSave = sourceSection(
    accountScript,
    "async function saveDocumentOnce",
    "const requestDocumentSave",
  )

  assert.match(materialize, /requestVersion: 1/)
  assert.match(materialize, /knowledgeBaseId/)
  assertAppearsInOrder(
    materialize,
    "snapshot: {",
    "title: data.title",
    "body: data.body",
    "topic: data.topic",
    "maturity: data.maturity",
    "visibility: data.visibility",
    "tags:",
    "prerequisites:",
    "related:",
    "sources:",
  )
  assert.match(editorSaveControllerScript, /createAtomicEditorSaveRpcArguments\(/)
  assert.match(editorSaveControllerScript, /rpcClient\.rpc\(EDITOR_ATOMIC_SAVE_RPC, rpcArguments\)/)
  assert.doesNotMatch(liveSave, /\.from\(|replace_document_sources/)
})

test("publication status warns that private drafts do not revoke an existing snapshot", () => {
  assert.match(accountScript, /当前草稿已改为仅自己可见，但此前发布版本仍在线/)
  assert.doesNotMatch(accountScript, /20260718000500_publication_flow\.sql/)
  assert.match(accountScript, /正式发布功能暂不可用；私人草稿不受影响/)
})

test("relationship reads stay knowledge-base scoped and writes remain inside the snapshot", () => {
  const materialize = sourceSection(
    accountScript,
    "const materializeCurrentAtomicSave",
    "const atomicOutcomeMessage",
  )

  assert.match(
    accountScript,
    /loadLinkOptions[\s\S]{0,900}\.eq\("knowledge_base_id", knowledgeBaseId\)/,
  )
  assert.match(materialize, /prerequisites: parsedPrerequisites\.value\.map/)
  assert.match(materialize, /related: parsedRelated\.value\.map/)
  assert.match(materialize, /sources: sources\.map/)
  assert.doesNotMatch(
    sourceSection(accountScript, "async function saveDocumentOnce", "const requestDocumentSave"),
    /document_tags|document_links|document_sources/,
  )
})

test("existing snapshots preserve the server-read knowledge-base binding", () => {
  const materialize = sourceSection(
    accountScript,
    "const materializeCurrentAtomicSave",
    "const atomicOutcomeMessage",
  )

  assert.match(
    accountScript,
    /let editorKnowledgeBaseBinding: \{ documentId: string; knowledgeBaseId: string \} \| null/,
  )
  assert.match(
    materialize,
    /else if \(data\.documentId\)[\s\S]{0,180}\.select\("knowledge_base_id"\)[\s\S]{0,240}\.eq\("owner_id", currentUser\.id\)/,
  )
  assert.match(
    materialize,
    /else \{\s+knowledgeBaseId = String\(\(await ensureKnowledgeBase\(isCurrent\)\)/,
  )
  assert.match(
    materialize,
    /editorKnowledgeBaseBinding = \{ documentId: documentScopeId, knowledgeBaseId \}/,
  )
})

test("unsaved documents use a stable draft scope and canonical route", () => {
  const startDraft = sourceSection(
    accountScript,
    "const startNewDocument",
    "const openStableDraftScope",
  )

  assert.match(editorDraftRouteScript, /EDITOR_DRAFT_SCOPE_PREFIX = "draft:"/)
  assert.match(editorDraftRouteScript, /route\.searchParams\.set\("draft", editorDraftScope/)
  assert.match(editorDraftRouteScript, /route\.searchParams\.delete\("draft"\)/)
  assert.match(accountScript, /return currentDraftId \? editorDraftScope\(currentDraftId\) : ""/)
  assert.match(
    accountScript,
    /const draftId = parseEditorDraftId\(preferredDraftId\) \?\? createEditorDraftId\(\)/,
  )
  assert.match(startDraft, /previousScope\.startsWith\("draft:"\)/)
  assert.match(startDraft, /const documentScopeId = bindFreshEditorDraftScope\(/)
  assert.match(startDraft, /restoreLocalBackup\(documentScopeId\)/)
})

test("unavailable relationship retention remains bound to the successfully loaded document", () => {
  assert.match(accountScript, /let retainedUnavailableRelationDocumentId = ""/)
  assert.match(
    accountScript,
    /retainedUnavailableRelationDocumentId === documentId[\s\S]{0,140}retainedUnavailableRelationTargetIds/,
  )
  assert.match(
    accountScript,
    /clearRetainedUnavailableRelationTargets\(\)\s+retainedUnavailableRelationDocumentId = documentId/,
  )
  const openStart = accountScript.indexOf("const openDocumentOnce")
  const coreRead = accountScript.indexOf('.from("documents")', openStart)
  const prematureClear = accountScript.indexOf(
    "clearRetainedUnavailableRelationTargets()",
    openStart,
  )
  assert.ok(openStart > 0)
  assert.ok(coreRead > openStart)
  assert.ok(prematureClear === -1 || prematureClear > coreRead)
})

test("follow-up flushes are owner scoped, guarded, and controller-only", () => {
  const scheduler = sourceSection(
    accountScript,
    "const scheduleAtomicSaveFlush",
    "const scheduleAtomicOutcomeRetry",
  )
  const liveSave = sourceSection(
    accountScript,
    "async function saveDocumentOnce",
    "const requestDocumentSave",
  )

  assert.match(accountScript, /createEditorCoordinator\(\{ ownerId \}\)/)
  assert.match(accountScript, /editorCoordinator\?\.close\(\)/)
  assert.match(scheduler, /window\.setTimeout/)
  assertAppearsInOrder(
    scheduler,
    "disposed ||",
    "editorRetryTimerEpoch !== timerEpoch",
    "navigator.onLine === false",
    "currentUser?.id !== input.ownerId",
    "client !== input.saveClient",
    "authEpoch !== input.saveAuthEpoch",
    "currentEditorScopeId() !== input.documentScopeId",
    "!editorSaveIsAllowed(input.documentScopeId, input.saveEpoch)",
    "void requestDocumentSave({ enqueue: false })",
  )
  assert.match(liveSave, /const hasPendingFollowUp = outcome\.followUpState !== "none"/)
  assert.match(liveSave, /if \(hasPendingFollowUp\)[\s\S]{0,260}scheduleAtomicSaveFlush\(/)
})

test("session changes invalidate private editor reads and clear sensitive UI state", () => {
  const clearSensitive = sourceSection(
    accountScript,
    "const clearSensitiveEditorState",
    "const openDocumentOnce",
  )

  assert.match(accountScript, /let authEpoch = 0/)
  assert.match(accountScript, /const openEpoch = authEpoch/)
  assert.match(accountScript, /if \(!isCurrentOpen\(\)\) return false/)
  assert.match(accountScript, /event === "SIGNED_OUT"[\s\S]{0,220}clearSensitiveEditorState\(\)/)
  assertAppearsInOrder(
    clearSensitive,
    "editorSaveController?.close()",
    "editorSaveController = null",
    "editorManualRecoveryBlocked = false",
    "editorManualRecoveryExported = false",
    "editorManualRecoveryPackage = null",
    'currentDraftId = ""',
    "invalidateEditorSaves()",
    "editorTabDrafts.clearAll()",
    "clearEditorConflict()",
    "form?.reset()",
  )
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
  assert.match(accountScript, /tagValues\.value = serializeWorkspaceTags\(parsed\.value\)/)
  assert.match(
    accountScript,
    /hidden\.value = serializeWorkspaceRelations\(groups\[relationType\]\)/,
  )
  assert.match(
    accountScript,
    /!linkOptionsLoaded \|\|[\s\S]{0,180}!tagsLoaded \|\|[\s\S]{0,180}!linksLoaded \|\|[\s\S]{0,180}!sourcesLoaded \|\|[\s\S]{0,180}!publicationLoaded/,
  )
  assert.match(accountScript, /标签、关系、来源或发布状态读取失败；已锁定编辑器/)
  assert.match(accountScript, /documents!document_links_to_document_id_fkey\(title,deleted_at\)/)
  assert.match(accountScript, /关系指向已删除或无法访问的知识；请移除后保存草稿/)
  assert.match(accountScript, /form\.inert = false[\s\S]{0,100}aria-busy", "false"/)
})

test("ordinary cloud conflicts and no-cloud recoveries expose only safe actions", () => {
  const freezeStart = accountScript.indexOf("const freezeEditorConflict")
  const formUnlocked = accountScript.indexOf("form.inert = false", freezeStart)
  const conflictOnly = accountScript.indexOf("setEditorConflictInteractivity(true)", formUnlocked)
  const useLocal = sourceSection(
    accountScript,
    'root.querySelector("[data-conflict-use-local]")',
    'root.querySelector("[data-conflict-use-cloud]")',
  )
  const saveCopy = sourceSection(
    accountScript,
    'root.querySelector("[data-conflict-save-copy]")',
    'conflictExportLocal?.addEventListener("click"',
  )
  const exportOnly = sourceSection(
    accountScript,
    'conflictExportLocal?.addEventListener("click"',
    "const queueAutosave",
  )
  assert.ok(freezeStart > 0)
  assert.ok(formUnlocked > freezeStart)
  assert.ok(conflictOnly > formUnlocked)
  assert.match(useLocal, /if \(conflict\.reason === "not-found"\) return/)
  assert.match(useLocal, /if \(!conflictUsesImmediateCas\(conflict\)\)/)
  assert.match(useLocal, /restoreConflictForExplicitSave\(conflict, context\)/)
  assertAppearsInOrder(
    useLocal,
    "prepareEditorConflictArchive(conflict, context)",
    "resolveDurableEditorConflict(conflict, prepared.durableToken)",
  )
  assert.match(saveCopy, /visibility: "private"/)
  assert.match(saveCopy, /const copyDraftId = createEditorDraftId\(\)/)
  assert.match(saveCopy, /const copyScope = editorDraftScope\(copyDraftId\)/)
  assertAppearsInOrder(
    saveCopy,
    "setStorageItemSafely(",
    "resolveDurableEditorConflict(conflict, prepared.durableToken)",
    "bindFreshEditorDraftScope(copyDraftId)",
  )
  assert.match(saveCopy, /allowEditorSaves\(copyScope\)/)
  assert.match(saveCopy, /if \(!conflictUsesImmediateCas\(conflict\)\)/)
  assert.match(saveCopy, /requireExplicitEditorSave\(copyScope\)/)
  assert.match(saveCopy, /requestDocumentSave\(\)/)
  assert.match(exportOnly, /format: "wouldkeep-editor-conflict-v1"/)
  assert.doesNotMatch(exportOnly, /resolveDurableEditorConflict|clearEditorConflict/)
})

test("legacy recovery is export-first, confirm-second, archive-before-delete", () => {
  const exportLegacy = sourceSection(
    accountScript,
    'editorRecoveryExport?.addEventListener("click"',
    'editorRecoveryArchive?.addEventListener("click"',
  )
  const archiveLegacy = sourceSection(
    accountScript,
    'editorRecoveryArchive?.addEventListener("click"',
    "const sync = async",
  )

  assert.match(
    accountComponent,
    /data-editor-recovery-export[\s\S]{0,280}data-editor-recovery-archive[\s\S]{0,80}disabled/,
  )
  assert.match(accountComponent, /必须先导出；只有再次明确确认后才会清除原记录。/)
  assertAppearsInOrder(
    exportLegacy,
    'format: "wouldkeep-legacy-editor-recovery-v1"',
    "link.click()",
    "editorManualRecoveryExported = true",
    "editorRecoveryArchive.disabled = false",
  )
  assert.match(archiveLegacy, /!editorManualRecoveryExported/)
  assertAppearsInOrder(
    archiveLegacy,
    "window.confirm(",
    "setStorageItemSafely(localStorage, archiveKey, archiveRaw)",
    "await legacyEditorRepository.delete(operationId)",
    "removeStorageItemIfUnchanged(",
    "inspectLegacyEditorPersistence({",
    "editorManualRecoveryBlocked = false",
  )
})

test("startup conflict inspection freezes both document and stable-draft routes before flush", () => {
  const restoreConflict = sourceSection(
    accountScript,
    "const restoreAtomicConflictForScope",
    "const scheduleAtomicSaveFlush",
  )
  const openDocument = sourceSection(
    accountScript,
    "const openDocumentOnce = async",
    "const openDocument = (documentId",
  )
  const openStableDraft = sourceSection(
    accountScript,
    "const openStableDraftScope",
    "root\n    .querySelectorAll<HTMLButtonElement>",
  )

  assert.match(restoreConflict, /Promise<"none" \| "conflict" \| "blocked">/)
  assert.match(restoreConflict, /records = await editorOutbox\.listForOwner\(ownerId\)/)
  assert.match(restoreConflict, /record\.documentScopeId === documentScopeId/)
  assert.match(restoreConflict, /record\.status === "conflict"/)
  assert.match(restoreConflict, /status: "request_rejected"/)
  assert.match(restoreConflict, /catch \{[\s\S]{0,180}blockRecoveryInspection/)
  assertAppearsInOrder(
    openDocument,
    "await restoreAtomicConflictForScope(documentId, isCurrentOpen)",
    'if (atomicConflictState === "blocked") return false',
    'if (!options.ignoreLocalBackup && atomicConflictState === "none")',
    "void flushDurableOutboxForCurrentDocument()",
  )
  assertAppearsInOrder(
    openStableDraft,
    "await restoreAtomicConflictForScope(",
    'if (atomicConflictState === "blocked") return false',
    'if (atomicConflictState === "none") void flushDurableOutboxForCurrentDocument()',
  )
})

test("document loading reports related data as pending until every cloud read succeeds", () => {
  const openStart = accountScript.indexOf("const openDocumentOnce = async")
  const coreReady = accountScript.indexOf(
    'state.textContent = "正文已载入，正在加载标签、关系与来源…"',
    openStart,
  )
  const relatedReads = accountScript.indexOf(
    "const linkOptionsLoaded = await loadLinkOptions",
    coreReady,
  )
  const completed = accountScript.indexOf('state.textContent = "已加载云端草稿"', relatedReads)
  const unlocked = accountScript.indexOf("setOpenBusy(false)", completed)

  assert.ok(openStart > 0)
  assert.ok(coreReady > openStart)
  assert.ok(relatedReads > coreReady)
  assert.ok(completed > relatedReads)
  assert.ok(unlocked > completed)
})

test("the strict outbox settles one acknowledgement and restores queued intent first", () => {
  const savedSettlement = sourceSection(
    editorSaveControllerScript,
    'if (response.status === "saved")',
    "const flush = async",
  )
  const restoreConflict = sourceSection(
    editorOutboxScript,
    "restoreConflict: (input: EnqueueInput)",
    "migrateNewDocument:",
  )

  assert.match(accountScript, /createReplaySafeIndexedDbEditorOutboxRepository\(\)/)
  assert.match(accountScript, /restoreDurableOutboxBackup\(documentId, isCurrentOpen\)/)
  assert.match(savedSettlement, /completeCreatedAfterSuccess\(/)
  assert.match(savedSettlement, /completeAfterSuccess\(/)
  assert.match(savedSettlement, /const remaining = await options\.outbox\.listForOwner/)
  assert.match(savedSettlement, /\? "pending"\s+: "none"/)
  assert.match(savedSettlement, /followUpState = "unknown"/)
  assert.match(savedSettlement, /nextDocumentScopeId/)
  assertAppearsInOrder(
    restoreConflict,
    'matching.filter((record) => record.status === "queued")',
    "matching.sort(newestIntentFirst)",
    "const conflict: EditorOutboxRecord",
    "await repository.replace(",
  )
  assert.match(
    restoreConflict,
    /repository\.replace\([\s\S]{0,100}matching\.map\(\(record\) => record\.operationId\)/,
  )
})

test("created acknowledgements migrate the stable backup before binding the document URL", () => {
  const liveSave = sourceSection(
    accountScript,
    "async function saveDocumentOnce",
    "const requestDocumentSave",
  )
  const createdSettlement = sourceSection(
    liveSave,
    "const draftBackupToken",
    "const settledSaveEpoch",
  )
  const stableDraftOpen = sourceSection(
    accountScript,
    "const openStableDraftScope",
    "root\n    .querySelectorAll<HTMLButtonElement>",
  )

  assertAppearsInOrder(
    createdSettlement,
    "const migratedBackupStored = setStorageItemSafely(",
    "localDraftKey(ownerId, savedDocumentId)",
    "migratedRaw",
    "editorTabDrafts.rememberBackup(savedDocumentId, migratedRaw)",
    "removeTabBackupIfUnchanged(ownerId, documentScopeId, draftBackupToken)",
    "editorTabDrafts.moveDirty(documentScopeId, savedDocumentId)",
    "documentField.value = savedDocumentId",
    "allowEditorSaves(savedDocumentId)",
    "bindDocumentEditorRoute(window.location.href, savedDocumentId)",
  )
  assertAppearsInOrder(
    stableDraftOpen,
    "setStorageItemSafely(localStorage, documentKey, migratedRaw)",
    "removeStorageItemIfUnchanged(localStorage, draftKey, draftRaw)",
    "bindDocumentEditorRoute(window.location.href, binding.documentId)",
    "return openDocument(binding.documentId)",
  )
})

test("invalid backups are quarantined instead of silently discarded", () => {
  assert.match(accountScript, /wouldkeep:editor-recovery-quarantine:/)
  assert.match(
    accountScript,
    /editor-recovery-quarantine:[\s\S]{0,300}removeStorageItemIfUnchanged/,
  )
})

test("pending or unknown follow-up intent keeps backup and dirty state until a later flush", () => {
  const liveSave = sourceSection(
    accountScript,
    "async function saveDocumentOnce",
    "const requestDocumentSave",
  )
  const finalization = sourceSection(
    liveSave,
    'const hasPendingFollowUp = outcome.followUpState !== "none"',
    "updatePublicationUI(currentPublication, outcome.response.revision)",
  )

  assert.match(liveSave, /const nextDocumentScopeId = outcome\.nextDocumentScopeId/)
  assert.match(finalization, /!hasPendingFollowUp/)
  assert.match(finalization, /editorChangeGeneration === generationAtStart/)
  assert.match(
    finalization,
    /editorTabDrafts\.backupToken\(nextDocumentScopeId\) === finalBackupToken/,
  )
  assertAppearsInOrder(
    finalization,
    "removeTabBackupIfUnchanged(",
    "editorTabDrafts.clearDirtyIfGeneration(",
  )
  assert.match(finalization, /if \(!finalized\)[\s\S]{0,360}status: "queued"/)
  assert.match(
    finalization,
    /if \(hasPendingFollowUp\)[\s\S]{0,260}scheduleAtomicSaveFlush\([\s\S]{0,220}runAt: Date\.now\(\)/,
  )
  const savedPublication = liveSave.indexOf('status: "saved"')
  const queuedPublication = liveSave.indexOf(
    'status: "queued"',
    finalization.indexOf("if (!finalized)"),
  )
  assert.ok(queuedPublication > -1)
  assert.ok(savedPublication > queuedPublication)
})

test("failed related-data loading stays fail-closed and exposes a keyboard retry outside the form", () => {
  assert.match(accountScript, /const editorLoadRecovery = root\.querySelector/)
  assert.match(accountScript, /showEditorLoadRecovery\([\s\S]{0,500}读取失败/)
  assert.match(accountScript, /editorRetryLoad\?\.addEventListener\("click", async/)
  assert.match(accountScript, /const reopened = await openDocument\(documentId\)/)
  assert.match(accountScript, /if \(reopened\)[\s\S]{0,150}title\?\.focus\(\)/)
  assert.match(accountScript, /catch \{[\s\S]{0,400}加载过程意外中断/)
})
