import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const accountScript = readFileSync(
  new URL("./scripts/accountPage.inline.ts", import.meta.url),
  "utf8",
)

const sourceSlice = (startMarker: string, endMarker: string) => {
  const start = accountScript.indexOf(startMarker)
  const end = accountScript.indexOf(endMarker, start)
  assert.ok(start >= 0, `missing start marker: ${startMarker}`)
  assert.ok(end > start, `missing end marker: ${endMarker}`)
  return accountScript.slice(start, end)
}

test("free-workbench input writes a browser recovery copy without silently cloud-saving", () => {
  const persistence = sourceSlice(
    "const persistFlatDraft = () =>",
    "function restoreFlatWorkbenchFromDetailed()",
  )
  const mirror = persistence.indexOf("mirrorFlatToDetailed(false)")
  const generation = persistence.indexOf("editorChangeGeneration += 1")
  const backup = persistence.indexOf("writeLocalBackup()")
  assert.ok(mirror >= 0)
  assert.ok(generation > mirror)
  assert.ok(backup > generation)
  assert.match(persistence, /浏览器无法建立恢复副本/)

  const inputHandler = sourceSlice(
    'flatForm?.addEventListener("input", () =>',
    'flatBody?.addEventListener("paste"',
  )
  assert.match(inputHandler, /persistFlatDraft\(\)/)
  assert.match(inputHandler, /已保存在当前浏览器/)
  assert.doesNotMatch(inputHandler, /requestDocumentSave|queueAutosave/)
})

test("free drafts retain their mode and reopen the same stable scope after refresh", () => {
  const openHelper = sourceSlice(
    "const openFlatWorkbench = () =>",
    'root\n    .querySelectorAll<HTMLButtonElement>("[data-open-flat-workbench]")',
  )
  const reuseCheck = openHelper.indexOf('params.get("mode") === "free"')
  const reuse = openHelper.indexOf("restoreFlatWorkbenchFromDetailed()", reuseCheck)
  const create = openHelper.indexOf('startNewDocument(false, true, undefined, "free")')
  assert.ok(reuseCheck >= 0)
  assert.ok(reuse > reuseCheck)
  assert.ok(create > reuse)

  const stableDraft = sourceSlice(
    "const openStableDraftScope = async",
    'root\n    .querySelectorAll<HTMLButtonElement>("[data-new-document]")',
  )
  assert.match(stableDraft, /requestedMode: EditorDraftMode = "detailed"/)
  assert.match(stableDraft, /requestedMode === "free"\) restoreFlatWorkbenchFromDetailed\(\)/)

  const startup = sourceSlice(
    'if (workspace && workspaceSection === "write" && currentUser)',
    "onlineHandler = async",
  )
  assert.match(
    startup,
    /openStableDraftScope\([\s\S]*requestedMode === "free" \? "free" : "detailed"/,
  )
})

test("free-workbench save is explicit and never reports an unconfirmed cloud write as saved", () => {
  const submit = sourceSlice(
    'flatForm?.addEventListener("submit", async (event) =>',
    'root.querySelector<HTMLButtonElement>("[data-flat-organize]")',
  )
  assert.match(submit, /requestDocumentSave\(\{ explicit: true \}\)/)
  assert.match(submit, /私密草稿已由云端确认/)
  assert.match(submit, /云端尚未确认保存/)
  assert.match(submit, /当前浏览器的恢复副本/)
  assert.doesNotMatch(submit, /私密草稿已保存。/)
})

test("clearing the free workbench also updates its recovery copy", () => {
  const clear = sourceSlice(
    'root.querySelector<HTMLButtonElement>("[data-flat-clear]")',
    'root\n    .querySelector<HTMLButtonElement>("[data-source-add]")',
  )
  assert.match(clear, /flatForm\?\.reset\(\)/)
  assert.match(clear, /persistFlatDraft\(\)/)
  assert.match(clear, /更新了当前浏览器中的恢复副本/)
})
