import assert from "node:assert/strict"
import test from "node:test"
import {
  aiSelectionSnapshotIsCurrent,
  applyAiSuggestion,
  captureAiSelection,
  parseAiSuggestionGatewayResponse,
} from "./scripts/workspaceAiSuggestion"

const snapshot = () => {
  const result = captureAiSelection({
    action: "rewrite",
    baseVersion: 7,
    body: "before selected words after",
    documentId: "22222222-2222-4222-8222-222222222222",
    start: 7,
    end: 21,
  })
  assert.equal(result.ok, true)
  if (!result.ok) throw new Error("snapshot setup failed")
  return result.snapshot
}

test("selection capture freezes the exact body range and base version", () => {
  const result = captureAiSelection({
    action: "shorten",
    baseVersion: 3,
    body: "甲乙 selected 丙丁",
    documentId: " document-id ",
    start: 3,
    end: 11,
  })
  assert.deepEqual(result, {
    ok: true,
    snapshot: {
      action: "shorten",
      baseVersion: 3,
      body: "甲乙 selected 丙丁",
      documentId: "document-id",
      start: 3,
      end: 11,
      selection: "selected",
    },
  })
})

test("selection capture rejects blanks, invalid ranges, oversized input, and invalid versions", () => {
  assert.deepEqual(
    captureAiSelection({ action: "rewrite", baseVersion: 0, body: "  ", start: 0, end: 2 }),
    { ok: false, code: "selection_required" },
  )
  assert.deepEqual(
    captureAiSelection({ action: "rewrite", baseVersion: 0, body: "abc", start: 2, end: 1 }),
    { ok: false, code: "invalid_range" },
  )
  assert.deepEqual(
    captureAiSelection({
      action: "expand",
      baseVersion: 0,
      body: "a".repeat(12_001),
      start: 0,
      end: 12_001,
    }),
    { ok: false, code: "selection_too_large" },
  )
  assert.deepEqual(
    captureAiSelection({ action: "rewrite", baseVersion: -1, body: "abc", start: 0, end: 1 }),
    { ok: false, code: "invalid_version" },
  )
})

test("the current gateway mock is accepted only as a non-actionable connection check", () => {
  const frozen = snapshot()
  assert.deepEqual(
    parseAiSuggestionGatewayResponse(
      {
        mock: true,
        run_id: "run-id",
        action: "rewrite",
        message: "No model call was made.",
        preview: frozen.selection,
        base_version: 7,
      },
      frozen,
    ),
    {
      ok: true,
      kind: "gateway_check",
      message: "No model call was made.",
      preview: frozen.selection,
      runId: "run-id",
    },
  )
})

test("actionable suggestions require an explicit selection scope and matching authority fields", () => {
  const frozen = snapshot()
  const valid = {
    mock: false,
    status: "completed",
    result_scope: "selection",
    run_id: "run-id",
    action: "rewrite",
    suggestion: "clearer words",
    document_id: frozen.documentId,
    base_version: frozen.baseVersion,
  }
  const parsed = parseAiSuggestionGatewayResponse(valid, frozen)
  assert.equal(parsed.ok, true)
  assert.equal(parsed.ok && parsed.kind, "suggestion")

  assert.deepEqual(
    parseAiSuggestionGatewayResponse({ ...valid, result_scope: "document" }, frozen),
    {
      ok: false,
      code: "unsafe_scope",
    },
  )
  assert.deepEqual(parseAiSuggestionGatewayResponse({ ...valid, base_version: 8 }, frozen), {
    ok: false,
    code: "mismatched_version",
  })
  assert.deepEqual(parseAiSuggestionGatewayResponse({ ...valid, document_id: "other" }, frozen), {
    ok: false,
    code: "mismatched_document",
  })
})

test("any document, version, or body change makes an AI selection snapshot stale", () => {
  const frozen = snapshot()
  assert.equal(
    aiSelectionSnapshotIsCurrent(frozen, {
      documentId: frozen.documentId,
      baseVersion: 7,
      body: frozen.body,
    }),
    true,
  )
  assert.equal(
    aiSelectionSnapshotIsCurrent(frozen, {
      documentId: frozen.documentId,
      baseVersion: 8,
      body: frozen.body,
    }),
    false,
  )
  assert.equal(
    aiSelectionSnapshotIsCurrent(frozen, {
      documentId: frozen.documentId,
      baseVersion: 7,
      body: `${frozen.body}!`,
    }),
    false,
  )
  assert.equal(
    aiSelectionSnapshotIsCurrent(frozen, {
      documentId: "other",
      baseVersion: 7,
      body: frozen.body,
    }),
    false,
  )
})

test("replace and insert create new bodies without mutating the captured source", () => {
  const frozen = snapshot()
  const replacement = applyAiSuggestion(frozen, "clear words", "replace")
  assert.deepEqual(replacement, {
    body: "before clear words after",
    selectionStart: 7,
    selectionEnd: 18,
  })
  const insertion = applyAiSuggestion(frozen, "supporting detail", "insert")
  assert.deepEqual(insertion, {
    body: "before selected words\n\nsupporting detail\n\n after",
    selectionStart: 23,
    selectionEnd: 40,
  })
  assert.equal(frozen.body, "before selected words after")
})
