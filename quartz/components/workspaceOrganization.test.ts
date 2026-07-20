import assert from "node:assert"
import test from "node:test"
import {
  WORKSPACE_SOURCE_MAX_COUNT,
  WORKSPACE_TAG_MAX_CHARACTERS,
  normalizeWorkspaceSourceUrl,
  normalizeWorkspaceTagKey,
  parseWorkspaceRelations,
  parseWorkspaceSources,
  parseWorkspaceTags,
  serializeWorkspaceRelations,
  serializeWorkspaceSources,
  serializeWorkspaceTags,
  type WorkspaceDocumentReference,
} from "./scripts/workspaceOrganization"

test("tag keys normalize NFKC, case, and whitespace", () => {
  assert.equal(normalizeWorkspaceTagKey("  ＲＣＷＡ\t Optics  "), "rcwa optics")
})

test("tags accept legacy comma strings and deduplicate stably by normalized key", () => {
  const parsed = parseWorkspaceTags("ＲＣＷＡ, rcwa， 光学\nOPTICS")
  assert.deepEqual(parsed, {
    ok: true,
    value: [
      { name: "RCWA", normalizedKey: "rcwa" },
      { name: "光学", normalizedKey: "光学" },
      { name: "OPTICS", normalizedKey: "optics" },
    ],
  })
})

test("tags reject explicit blanks, overlong values, and punctuation-only values", () => {
  assert.deepEqual(parseWorkspaceTags([""]), {
    ok: false,
    issues: [{ code: "tag_blank", index: 0 }],
  })
  assert.equal(parseWorkspaceTags(["知".repeat(WORKSPACE_TAG_MAX_CHARACTERS)]).ok, true)
  const tooLong = parseWorkspaceTags(["知".repeat(WORKSPACE_TAG_MAX_CHARACTERS + 1)])
  assert.equal(tooLong.ok, false)
  if (!tooLong.ok) assert.equal(tooLong.issues[0]?.code, "tag_too_long")
  assert.deepEqual(parseWorkspaceTags(["，！？..."]), {
    ok: false,
    issues: [{ code: "tag_punctuation_only", index: 0, value: ",!?..." }],
  })
})

test("tag hidden serialization is stable and round-trips", () => {
  const parsed = parseWorkspaceTags(["  RCWA  ", "光学"])
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  const hidden = serializeWorkspaceTags(parsed.value)
  assert.equal(hidden, '["RCWA","光学"]')
  assert.deepEqual(parseWorkspaceTags(hidden), parsed)
})

const documents: WorkspaceDocumentReference[] = [
  { id: "document-a", title: "重复标题" },
  { id: "document-b", title: "重复标题" },
  { id: "document-c", title: "唯一标题" },
  { id: "document-current", title: "当前知识" },
]

test("relations serialize document ids and resolve an unambiguous legacy title", () => {
  const byId = parseWorkspaceRelations('["document-a","document-c"]', {
    currentDocumentId: "document-current",
    documents,
  })
  assert.equal(byId.ok, true)
  if (!byId.ok) return
  assert.equal(serializeWorkspaceRelations(byId.value), '["document-a","document-c"]')

  assert.deepEqual(
    parseWorkspaceRelations("唯一标题", {
      currentDocumentId: "document-current",
      documents,
    }),
    {
      ok: true,
      value: [{ documentId: "document-c", title: "唯一标题" }],
    },
  )
})

test("relations reject self, unknown, ambiguous, and duplicate targets", () => {
  const options = { currentDocumentId: "document-current", documents }
  for (const [input, code] of [
    ['["document-current"]', "relation_self"],
    ['["document-missing"]', "relation_unknown"],
    ["重复标题", "relation_ambiguous"],
    ['["document-a","document-a"]', "relation_duplicate"],
  ] as const) {
    const parsed = parseWorkspaceRelations(input, options)
    assert.equal(parsed.ok, false)
    if (!parsed.ok) assert.equal(parsed.issues[0]?.code, code)
  }
})

test("source URLs accept only HTTP(S) and normalize before duplicate checks", () => {
  assert.equal(
    normalizeWorkspaceSourceUrl(" HTTPS://Example.COM:443/a/../paper#section "),
    "https://example.com/paper#section",
  )
  assert.equal(normalizeWorkspaceSourceUrl("ftp://example.com/file"), null)

  const duplicate = parseWorkspaceSources([
    { kind: "web", url: "https://example.com", title: "First" },
    { kind: "web", url: "HTTPS://EXAMPLE.COM:443/#part", title: "Second" },
  ])
  assert.equal(duplicate.ok, false)
  if (!duplicate.ok) assert.equal(duplicate.issues[0]?.code, "source_duplicate_url")
})

test("source URLs preserve citation fragments and reject embedded credentials or secret parameters", () => {
  const withFragment = parseWorkspaceSources([
    { kind: "web", url: "https://example.com/paper#methods", title: "Methods" },
  ])
  assert.equal(withFragment.ok, true)
  if (withFragment.ok) assert.equal(withFragment.value[0]?.url, "https://example.com/paper#methods")

  for (const url of [
    "https://user:password@example.com/paper",
    "https://example.com/paper?access_token=secret",
    "https://example.com/paper?api_key=secret",
    "https://example.com/paper?X-Amz-Signature=secret",
  ]) {
    const parsed = parseWorkspaceSources([{ kind: "web", url, title: "Unsafe" }])
    assert.equal(parsed.ok, false)
    if (!parsed.ok) assert.equal(parsed.issues[0]?.code, "source_sensitive_url")
  }
})

test("sources validate web and personal requirements and enforce the 50 item limit", () => {
  for (const [source, code] of [
    [{ kind: "web", url: "" }, "source_web_url_required"],
    [{ kind: "web", url: "javascript:alert(1)" }, "source_web_url_invalid"],
    [{ kind: "personal", title: "   " }, "source_personal_title_required"],
    [{ kind: "other", title: "Nope" }, "source_kind_invalid"],
  ] as const) {
    const parsed = parseWorkspaceSources([source])
    assert.equal(parsed.ok, false)
    if (!parsed.ok) assert.equal(parsed.issues[0]?.code, code)
  }

  const maximum = Array.from({ length: WORKSPACE_SOURCE_MAX_COUNT }, (_, index) => ({
    kind: "personal" as const,
    title: `经验 ${index + 1}`,
  }))
  assert.equal(parseWorkspaceSources(maximum).ok, true)
  const overLimit = parseWorkspaceSources([...maximum, { kind: "personal", title: "额外经验" }])
  assert.deepEqual(overLimit, {
    ok: false,
    issues: [{ code: "source_limit", value: "51" }],
  })
})

test("personal sources clear hidden URLs and source hidden JSON round-trips", () => {
  const parsed = parseWorkspaceSources([
    {
      kind: "personal",
      url: "https://should-not-be-kept.example",
      title: " 三次实验后的观察 ",
      author: " 我 ",
      note: " 可重复 ",
    },
    {
      kind: "web",
      url: "https://example.com/reference#abstract",
      title: " Reference ",
      author: " Author ",
      note: " Evidence ",
    },
  ])
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  assert.deepEqual(parsed.value[0], {
    kind: "personal",
    url: "",
    title: "三次实验后的观察",
    author: "我",
    note: "可重复",
  })
  const hidden = serializeWorkspaceSources(parsed.value)
  assert.deepEqual(parseWorkspaceSources(hidden), parsed)
})

test("malformed hidden fields fail closed", () => {
  assert.deepEqual(parseWorkspaceTags("[not-json"), {
    ok: false,
    issues: [{ code: "hidden_invalid" }],
  })
  assert.deepEqual(parseWorkspaceSources('{"kind":"web"}'), {
    ok: false,
    issues: [{ code: "hidden_invalid" }],
  })
})
