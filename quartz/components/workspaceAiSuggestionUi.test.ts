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

test("accepting a current suggestion uses versioned document save while edits stale it", () => {
  assert.match(script, /aiSelectionSnapshotIsCurrent\(activeAiSelection/)
  assert.match(script, /生成期间正文或版本发生了变化；响应已丢弃/)
  assert.match(script, /body\.dispatchEvent\(new Event\("input", \{ bubbles: true \}\)\)/)
  assert.match(script, /const saved = await requestDocumentSave\(\)/)
  assert.match(script, /保存为新的文档版本/)
  assert.match(script, /prefers-reduced-motion: reduce/)
})
