import assert from "node:assert/strict"
import test from "node:test"
import {
  bindDocumentEditorRoute,
  bindNewEditorDraftRoute,
  createEditorDraftId,
  editorDraftScope,
  parseEditorDraftId,
  resolveEditorRouteDecision,
  workspaceAuthReturnRoute,
} from "./scripts/editorDraftRoute"

const DRAFT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1"
const DOCUMENT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2"

test("draft ids and scopes require a canonical UUID", () => {
  assert.equal(parseEditorDraftId(DRAFT_ID), DRAFT_ID)
  assert.equal(editorDraftScope(DRAFT_ID), `draft:${DRAFT_ID}`)
  for (const invalid of [null, "", "new", `draft:${DRAFT_ID}`, DRAFT_ID.toUpperCase()]) {
    assert.equal(parseEditorDraftId(invalid), null)
  }
  assert.throws(() => editorDraftScope("new"), /canonical draft UUID/u)
})

test("draft creation fails closed without a valid cryptographic UUID source", () => {
  assert.equal(
    createEditorDraftId(() => DRAFT_ID),
    DRAFT_ID,
  )
  assert.throws(() => createEditorDraftId(null), /cryptographically random/u)
  assert.throws(() => createEditorDraftId(() => "not-a-uuid"), /cryptographically random/u)
})

test("binding a new draft removes conflicting editor actions and preserves unrelated route state", () => {
  const bound = new URL(
    bindNewEditorDraftRoute(
      `https://wouldkeep.com/workspace/write/?document=${DOCUMENT_ID}&action=import&mode=free&keep=1#editor`,
      DRAFT_ID,
    ),
  )
  assert.equal(bound.searchParams.get("draft"), DRAFT_ID)
  assert.equal(bound.searchParams.get("document"), null)
  assert.equal(bound.searchParams.get("action"), null)
  assert.equal(bound.searchParams.get("mode"), null)
  assert.equal(bound.searchParams.get("keep"), "1")
  assert.equal(bound.hash, "#editor")
})

test("binding a free draft preserves its stable identity and workbench mode", () => {
  const bound = new URL(
    bindNewEditorDraftRoute(
      `https://wouldkeep.com/workspace/write/?document=${DOCUMENT_ID}&action=import&keep=1`,
      DRAFT_ID,
      "free",
    ),
  )
  assert.equal(bound.searchParams.get("draft"), DRAFT_ID)
  assert.equal(bound.searchParams.get("mode"), "free")
  assert.equal(bound.searchParams.get("document"), null)
  assert.equal(bound.searchParams.get("action"), null)
  assert.equal(bound.searchParams.get("keep"), "1")
})

test("workspace authentication preserves the interrupted editor destination", () => {
  assert.equal(
    workspaceAuthReturnRoute(
      `https://wouldkeep.com/workspace/write/?draft=${DRAFT_ID}&mode=free#editor`,
      true,
    ),
    `/workspace/write/?draft=${DRAFT_ID}&mode=free#editor`,
  )
  assert.equal(
    workspaceAuthReturnRoute(`https://wouldkeep.com/login/?next=external`, false),
    "/workspace/",
  )
})

test("binding a document removes the draft and conflicting editor actions", () => {
  const bound = new URL(
    bindDocumentEditorRoute(
      `https://wouldkeep.com/workspace/write/?draft=${DRAFT_ID}&action=import&mode=detailed&keep=1`,
      DOCUMENT_ID,
    ),
  )
  assert.equal(bound.searchParams.get("document"), DOCUMENT_ID)
  assert.equal(bound.searchParams.get("draft"), null)
  assert.equal(bound.searchParams.get("action"), null)
  assert.equal(bound.searchParams.get("mode"), null)
  assert.equal(bound.searchParams.get("keep"), "1")
})

test("route decisions are deterministic for document, draft, invalid draft, and empty routes", () => {
  assert.deepEqual(
    resolveEditorRouteDecision({
      document: DOCUMENT_ID,
      draft: DRAFT_ID,
      hasDraftParameter: true,
    }),
    { kind: "document", documentId: DOCUMENT_ID },
  )
  assert.deepEqual(
    resolveEditorRouteDecision({ document: "", draft: DRAFT_ID, hasDraftParameter: true }),
    { kind: "draft", draftId: DRAFT_ID },
  )
  assert.deepEqual(
    resolveEditorRouteDecision({ document: "", draft: "broken", hasDraftParameter: true }),
    { kind: "invalid-draft" },
  )
  assert.deepEqual(
    resolveEditorRouteDecision({ document: "broken", draft: null, hasDraftParameter: false }),
    { kind: "new" },
  )
})
