import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { bindDocumentEditorRoute } from "./scripts/editorDraftRoute"

const accountScript = readFileSync(
  new URL("./scripts/accountPage.inline.ts", import.meta.url),
  "utf8",
)
const documentId = "85d53ae5-7f1d-4f39-9b65-54a5a5946e98"

test("a first saved document replaces transient editor actions with a recoverable document route", () => {
  const next = new URL(
    bindDocumentEditorRoute(
      "https://wouldkeep.com/workspace/write/?action=import&mode=detailed&ref=acceptance#editor",
      documentId,
    ),
  )

  assert.equal(next.pathname, "/workspace/write/")
  assert.equal(next.searchParams.get("document"), documentId)
  assert.equal(next.searchParams.has("action"), false)
  assert.equal(next.searchParams.has("mode"), false)
  assert.equal(next.searchParams.get("ref"), "acceptance")
  assert.equal(next.hash, "#editor")
})

test("rebinding an editor route is idempotent and replaces a stale document identity", () => {
  const staleDocumentId = "b6860204-6c99-428e-b9ae-17457f6f640d"
  const first = bindDocumentEditorRoute(
    `https://wouldkeep.com/workspace/write/?document=${staleDocumentId}&action=import`,
    documentId,
  )
  const second = bindDocumentEditorRoute(first, documentId)
  const next = new URL(second)

  assert.equal(next.searchParams.getAll("document").length, 1)
  assert.equal(next.searchParams.get("document"), documentId)
  assert.equal(next.searchParams.has("action"), false)
  assert.equal(second, first)
})

test("the first-save path binds the returned id and refresh initialization opens that route", () => {
  assert.match(accountScript, /bindDocumentEditorRoute/)
  const firstInsert = accountScript.indexOf("if (!data.documentId && result.data?.id)")
  const routeBinding = accountScript.indexOf("bindDocumentEditorRoute", firstInsert)
  assert.ok(firstInsert > 0)
  assert.ok(routeBinding > firstInsert)
  assert.match(
    accountScript,
    /const documentId = params\.get\("document"\)[\s\S]{0,400}void openDocument\(documentId\)/,
  )
})
