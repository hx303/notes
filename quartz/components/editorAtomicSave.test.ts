import assert from "node:assert/strict"
import test from "node:test"
import {
  AtomicEditorSaveContractError,
  EDITOR_ATOMIC_SAVE_PROTOCOL,
  atomicEditorSaveProtocolIsReady,
  createAtomicEditorSaveRpcArguments,
  materializeAtomicEditorSavePayload,
  materializeAtomicEditorSnapshot,
  parseAtomicEditorSaveResponse,
} from "./scripts/editorAtomicSave"

const DOCUMENT_ID = "00000000-0000-4000-8000-000000000001"
const KNOWLEDGE_BASE_ID = "00000000-0000-4000-8000-000000000002"
const RELATED_ID = "00000000-0000-4000-8000-000000000003"
const OPERATION_ID = "00000000-0000-4000-8000-000000000004"

const snapshot = () => ({
  title: "可靠保存",
  body: "正文",
  topic: "P1",
  maturity: "growing",
  visibility: "private",
  tags: ["  Reliability  ", "知识 管理"],
  prerequisites: [],
  related: [RELATED_ID],
  sources: [
    {
      kind: "web",
      url: "https://example.com/reference#section",
      title: "Reference",
      author: "",
      note: "",
    },
    {
      kind: "personal",
      url: "",
      title: "访谈记录",
      author: "本人",
      note: "",
    },
  ],
})

test("materializes the immutable exact nine-key snapshot and versioned durable payload", () => {
  const value = materializeAtomicEditorSavePayload({
    requestVersion: 1,
    knowledgeBaseId: KNOWLEDGE_BASE_ID,
    snapshot: snapshot(),
  })
  assert.deepEqual(Object.keys(value), ["requestVersion", "knowledgeBaseId", "snapshot"])
  assert.deepEqual(Object.keys(value.snapshot), [
    "title",
    "body",
    "topic",
    "maturity",
    "visibility",
    "tags",
    "prerequisites",
    "related",
    "sources",
  ])
  assert.deepEqual(value.snapshot.tags, ["Reliability", "知识 管理"])
  assert.deepEqual(Object.keys(value.snapshot.sources[0]!), [
    "kind",
    "url",
    "title",
    "author",
    "note",
  ])
})

test("rejects extra, missing, malformed, duplicate, unsafe, or self-referential snapshot data", () => {
  assert.throws(
    () => materializeAtomicEditorSnapshot({ ...snapshot(), status: "draft" }),
    AtomicEditorSaveContractError,
  )
  const { body: _body, ...missingBody } = snapshot()
  assert.throws(() => materializeAtomicEditorSnapshot(missingBody), /exact 9-key/)
  assert.throws(
    () => materializeAtomicEditorSnapshot({ ...snapshot(), tags: ["ＫＢ", "KB"] }),
    /duplicate normalized tag/,
  )
  assert.throws(
    () =>
      materializeAtomicEditorSnapshot(
        {
          ...snapshot(),
          related: [DOCUMENT_ID],
        },
        { documentId: DOCUMENT_ID },
      ),
    /cannot refer to itself/,
  )
  assert.throws(
    () =>
      materializeAtomicEditorSnapshot({
        ...snapshot(),
        sources: [
          {
            kind: "web",
            url: "https://example.com/?token=secret",
            title: "",
            author: "",
            note: "",
          },
        ],
      }),
    /unsafe/,
  )
  assert.throws(
    () =>
      materializeAtomicEditorSnapshot({
        ...snapshot(),
        sources: [{ ...snapshot().sources[0], extra: "forbidden" }],
      }),
    /exact v1 keys/,
  )
})

test("creates exact RPC arguments and sends null plus revision zero for a new draft", () => {
  const existing = createAtomicEditorSaveRpcArguments({
    operationId: OPERATION_ID,
    documentId: DOCUMENT_ID,
    baseRevision: 7,
    payload: { requestVersion: 1, knowledgeBaseId: KNOWLEDGE_BASE_ID, snapshot: snapshot() },
  })
  assert.deepEqual(Object.keys(existing), [
    "p_operation_id",
    "p_document_id",
    "p_knowledge_base_id",
    "p_expected_revision",
    "p_snapshot",
  ])
  assert.equal(existing.p_document_id, DOCUMENT_ID)
  assert.equal(existing.p_expected_revision, 7)

  const created = createAtomicEditorSaveRpcArguments({
    operationId: OPERATION_ID,
    documentId: "new",
    baseRevision: 0,
    payload: { requestVersion: 1, knowledgeBaseId: KNOWLEDGE_BASE_ID, snapshot: snapshot() },
  })
  assert.equal(created.p_document_id, null)
  assert.equal(created.p_expected_revision, 0)
  assert.throws(
    () =>
      createAtomicEditorSaveRpcArguments({
        operationId: OPERATION_ID,
        documentId: "new",
        baseRevision: 1,
        payload: {
          requestVersion: 1,
          knowledgeBaseId: KNOWLEDGE_BASE_ID,
          snapshot: snapshot(),
        },
      }),
    /new document must use revision 0/,
  )
})

test("strictly parses saved, conflict, and not_found result shapes", () => {
  const saved = parseAtomicEditorSaveResponse({
    result_version: 1,
    status: "saved",
    operation_id: OPERATION_ID,
    document_id: DOCUMENT_ID,
    knowledge_base_id: KNOWLEDGE_BASE_ID,
    revision: 1,
    created: true,
    saved_at: "2026-07-23T00:00:00.000Z",
  })
  assert.equal(saved.status, "saved")

  const conflict = parseAtomicEditorSaveResponse({
    result_version: 1,
    status: "conflict",
    operation_id: OPERATION_ID,
    document_id: DOCUMENT_ID,
    knowledge_base_id: KNOWLEDGE_BASE_ID,
    expected_revision: 2,
    current_revision: 3,
    created: false,
    saved_at: null,
  })
  assert.equal(conflict.status, "conflict")

  const notFound = parseAtomicEditorSaveResponse({
    result_version: 1,
    status: "not_found",
    operation_id: OPERATION_ID,
    knowledge_base_id: KNOWLEDGE_BASE_ID,
    created: false,
    saved_at: null,
  })
  assert.equal(notFound.status, "not_found")
})

test("rejects response extras, unsafe revisions, UUID drift, and operation mismatch shapes", () => {
  const valid = {
    result_version: 1,
    status: "saved",
    operation_id: OPERATION_ID,
    document_id: DOCUMENT_ID,
    knowledge_base_id: KNOWLEDGE_BASE_ID,
    revision: 1,
    created: false,
    saved_at: "2026-07-23T00:00:00.000Z",
  }
  assert.throws(
    () => parseAtomicEditorSaveResponse({ ...valid, body: "must not return" }),
    /violates/,
  )
  assert.throws(
    () => parseAtomicEditorSaveResponse({ ...valid, revision: Number.MAX_SAFE_INTEGER + 1 }),
    /violates/,
  )
  assert.throws(
    () => parseAtomicEditorSaveResponse({ ...valid, document_id: "not-a-uuid" }),
    /violates/,
  )
  assert.throws(
    () => parseAtomicEditorSaveResponse({ ...valid, operation_id: "contains whitespace" }),
    /operation_id/,
  )
})

test("requires the matching new-bundle protocol marker", () => {
  assert.equal(atomicEditorSaveProtocolIsReady(EDITOR_ATOMIC_SAVE_PROTOCOL), true)
  assert.equal(atomicEditorSaveProtocolIsReady("legacy-multiwrite"), false)
  assert.equal(atomicEditorSaveProtocolIsReady(undefined), false)
})

test("durable payload rejects missing, extra, or unsupported requestVersion", () => {
  assert.throws(
    () =>
      materializeAtomicEditorSavePayload({
        knowledgeBaseId: KNOWLEDGE_BASE_ID,
        snapshot: snapshot(),
      }),
    /exact v1 keys/,
  )
  assert.throws(
    () =>
      materializeAtomicEditorSavePayload({
        requestVersion: 2,
        knowledgeBaseId: KNOWLEDGE_BASE_ID,
        snapshot: snapshot(),
      }),
    /requestVersion/,
  )
  assert.throws(
    () =>
      materializeAtomicEditorSavePayload({
        requestVersion: 1,
        knowledgeBaseId: KNOWLEDGE_BASE_ID,
        snapshot: snapshot(),
        form: {},
      }),
    /exact v1 keys/,
  )
})
