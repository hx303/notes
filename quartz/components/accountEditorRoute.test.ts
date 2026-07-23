import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const accountScript = readFileSync(
  new URL("./scripts/accountPage.inline.ts", import.meta.url),
  "utf8",
)

test("startup opens a stable draft through its durable binding before restoring or replaying", () => {
  const helperStart = accountScript.indexOf("const openStableDraftScope = async")
  const helperEnd = accountScript.indexOf("root\n    .querySelectorAll", helperStart)
  const helper = accountScript.slice(helperStart, helperEnd)
  assert.ok(helperStart > 0)
  assert.ok(helperEnd > helperStart)

  const bindingRead = helper.indexOf("getScopeBinding(ownerId, documentScopeId)")
  const firstRouteGuard = helper.indexOf("if (!draftRouteIsCurrent()) return false", bindingRead)
  const documentBackupWrite = helper.indexOf(
    "setStorageItemSafely(localStorage, documentKey",
    bindingRead,
  )
  const draftBackupDelete = helper.indexOf(
    "removeStorageItemIfUnchanged(localStorage, draftKey",
    bindingRead,
  )
  const documentRoute = helper.indexOf("bindDocumentEditorRoute", bindingRead)
  const documentOpen = helper.indexOf("return openDocument(binding.documentId)", bindingRead)

  assert.ok(bindingRead > 0)
  assert.ok(firstRouteGuard > bindingRead)
  assert.ok(documentBackupWrite > firstRouteGuard)
  assert.ok(draftBackupDelete > documentBackupWrite)
  assert.ok(documentRoute > draftBackupDelete)
  assert.ok(documentOpen > documentRoute)
  assert.match(helper, /const ownerId = String\(currentUser\.id\)/)
  assert.match(helper, /const routeClient = client/)
  assert.match(helper, /const routeAuthEpoch = authEpoch/)
  assert.match(
    helper,
    /currentUser\?\.id === ownerId[\s\S]*client === routeClient[\s\S]*authEpoch === routeAuthEpoch/,
  )
  assert.match(helper, /const activeScope = startNewDocument\(true, true, draftId\)/)
  assert.match(helper, /await restoreDurableOutboxBackup\(activeScope\)/)
  assert.match(helper, /restoreLocalBackup\(activeScope\)/)
  assert.match(helper, /restoreAtomicConflictForScope\(/)
  assert.match(helper, /if \(atomicConflictState === "blocked"\) return false/)
  assert.match(
    helper,
    /if \(atomicConflictState === "none"\) void flushDurableOutboxForCurrentDocument\(\)/,
  )
})

test("workspace startup canonicalizes conflicting document and draft params before opening", () => {
  const routeStart = accountScript.indexOf(
    'if (workspace && workspaceSection === "write" && currentUser)',
  )
  const routeEnd = accountScript.indexOf("onlineHandler = async", routeStart)
  const route = accountScript.slice(routeStart, routeEnd)
  assert.ok(routeStart > 0)
  assert.ok(routeEnd > routeStart)
  assert.match(route, /resolveEditorRouteDecision\(\{/)
  assert.match(
    route,
    /routeDecision\.kind === "document"[\s\S]*bindDocumentEditorRoute\([\s\S]*routeDecision\.documentId[\s\S]*replaceState[\s\S]*openDocument\(routeDecision\.documentId\)/,
  )
  assert.match(
    route,
    /routeDecision\.kind === "draft"[\s\S]*openStableDraftScope\(routeDecision\.draftId\)/,
  )
  assert.match(route, /routeDecision\.kind === "invalid-draft"[\s\S]*startNewDocument\(\)/)
})

test("a bound draft quarantines an invalid target and blocks ambiguous backup metadata", () => {
  const helperStart = accountScript.indexOf("const openStableDraftScope = async")
  const helperEnd = accountScript.indexOf("root\n    .querySelectorAll", helperStart)
  const helper = accountScript.slice(helperStart, helperEnd)
  const draftInspection = helper.indexOf("const draftInspection = inspectEditorBackup")
  const draftConflict = helper.indexOf('draftInspection.state === "conflict"', draftInspection)
  const documentInspection = helper.indexOf("let documentInspection", draftConflict)
  const documentConflict = helper.indexOf(
    'documentInspection?.state === "conflict"',
    documentInspection,
  )
  const documentInvalid = helper.indexOf(
    'documentInspection?.state === "invalid"',
    documentConflict,
  )
  const quarantineWrite = helper.indexOf(
    "setStorageItemSafely(localStorage, quarantineKey, documentRaw)",
    documentInvalid,
  )
  const invalidSourceRemoval = helper.indexOf(
    "removeStorageItemIfUnchanged(localStorage, documentKey, documentRaw)",
    quarantineWrite,
  )
  const migrationWrite = helper.indexOf(
    "setStorageItemSafely(localStorage, documentKey, migratedRaw)",
    invalidSourceRemoval,
  )

  assert.ok(draftInspection > 0)
  assert.ok(draftConflict > draftInspection)
  assert.ok(documentInspection > draftConflict)
  assert.ok(documentConflict > documentInspection)
  assert.ok(documentInvalid > documentConflict)
  assert.ok(quarantineWrite > documentInvalid)
  assert.ok(invalidSourceRemoval > quarantineWrite)
  assert.ok(migrationWrite > invalidSourceRemoval)
  assert.match(
    helper,
    /inspectEditorBackup\([\s\S]*documentScopeId,[\s\S]*binding\.baseRevision[\s\S]*draftInspection\.state === "conflict"/,
  )
  assert.match(
    helper,
    /inspectEditorBackup\([\s\S]*binding\.documentId,[\s\S]*binding\.baseRevision[\s\S]*documentInspection\?\.state === "conflict"/,
  )
  assert.match(helper, /documentInspection\?\.state === "restore"/)
})
