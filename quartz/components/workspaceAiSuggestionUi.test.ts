import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const page = readFileSync(new URL("./AccountPage.tsx", import.meta.url), "utf8")
const script = readFileSync(new URL("./scripts/accountPage.inline.ts", import.meta.url), "utf8")

test("the editor exposes an inline review surface with explicit apply and discard choices", () => {
  for (const hook of [
    "data-ai-suggestion-assist",
    "data-ai-suggestion-status",
    "data-ai-suggestion-preview",
    "data-ai-suggestion-original",
    "data-ai-suggestion-output",
    "data-ai-suggestion-replace",
    "data-ai-suggestion-insert",
    "data-ai-suggestion-discard",
  ]) {
    assert.match(page, new RegExp(hook))
  }
  assert.match(page, /没有你的确认，不会替换、插入或发布内容/)
  assert.match(page, /role="status"/)
  assert.match(page, /aria-live="polite"/)
  assert.equal((page.match(/tabIndex=\{0\}/g) ?? []).length >= 2, true)
})

test("the browser cannot grant a live whole-document request authority", () => {
  assert.match(script, /document_id: null/)
  assert.match(script, /selection-scoped live contract/)
  assert.match(script, /parseAiSuggestionGatewayResponse\(result\.data, snapshot\)/)
  assert.doesNotMatch(script, /document_id: snapshot\.documentId/)
})

test("AI preferences and the current document boundary gate generation", () => {
  assert.match(script, /\.from\("ai_preferences"\)/)
  assert.match(script, /!aiSuggestionPreferences\.enabled/)
  assert.match(script, /aiSuggestionPreferences\.monthlyBudgetCents <= 0/)
  assert.match(
    script,
    /data\.visibility !== "public" && !aiSuggestionPreferences\.allowPrivateContent/,
  )
})

test("AI generation locks synchronously before preference or gateway requests", () => {
  const generation = script.slice(
    script.indexOf("const generateAiSuggestion"),
    script.indexOf("const applyActiveAiSuggestion"),
  )
  assert.ok(
    generation.indexOf("if (aiSuggestionGenerationInFlight) return") <
      generation.indexOf("await loadAiSuggestionPreferences()"),
  )
  assert.match(generation, /aiSuggestionGenerationInFlight = true/)
  assert.match(generation, /aiSuggestionGenerate\.disabled = true/)
  assert.match(generation, /aiSuggestionGenerationInFlight = false/)
  assert.match(
    script,
    /aiSuggestionGenerate\.disabled =\s*aiSuggestionGenerationInFlight \|\| Boolean\(gate\) \|\| !capture\.ok/,
  )
})

test("gate-sensitive document transitions refresh the AI availability copy", () => {
  assert.match(script, /target === aiBody \|\| target\?\.matches\("\[name=visibility\]"\)/)

  const openDocument = script.slice(
    script.indexOf("const openDocumentOnce"),
    script.indexOf("const openDocument ="),
  )
  assert.match(openDocument, /fillForm\(\{[\s\S]*?\}\)\s*refreshAiSelectionStatus\(\)/)

  const startNewDocument = script.slice(
    script.indexOf("const startNewDocument"),
    script.indexOf("[data-new-document]"),
  )
  assert.equal((startNewDocument.match(/refreshAiSelectionStatus\(\)/g) ?? []).length, 2)

  const clearDocument = script.slice(
    script.indexOf('root.querySelector("[data-editor-clear]")'),
    script.indexOf("if (workspace && workspaceSection"),
  )
  assert.match(clearDocument, /allowEditorSaves\("new"\)[\s\S]*?refreshAiSelectionStatus\(\)/)
  assert.match(script, /setAiSuggestionStatus\(message\)/)
})

test("accepting a current suggestion uses versioned document save while edits stale it", () => {
  assert.match(script, /aiSelectionSnapshotIsCurrent\(activeAiSelection/)
  assert.match(script, /生成期间正文或版本发生了变化；响应已丢弃/)
  assert.match(script, /body\.dispatchEvent\(new Event\("input", \{ bubbles: true \}\)\)/)
  assert.match(script, /const saved = await requestDocumentSave\(\)/)
  assert.match(script, /保存为新的文档版本/)
  assert.match(script, /prefers-reduced-motion: reduce/)
})
