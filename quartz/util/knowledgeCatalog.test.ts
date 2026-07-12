import assert from "node:assert"
import test, { describe } from "node:test"
import { buildKnowledgeCatalog, flattenKnowledgeCatalog } from "./knowledgeCatalog"
import type { KnowledgeCatalogEntry } from "./knowledgeCatalog"

const entries: KnowledgeCatalogEntry[] = [
  {
    slug: "notes/linear-algebra" as KnowledgeCatalogEntry["slug"],
    filePath: "notes/linear-algebra.md",
    title: "线性代数",
    knowledgeMetadata: {
      isStructured: true,
      primaryTopic: "mathematics",
      subtopic: "线性代数",
      topics: ["mathematics", "computing-simulation"],
      type: "course-note",
      maturity: "stable",
      prerequisites: [],
      related: [],
      sources: [],
      license: "CC BY 4.0",
      publish: true,
      commentKey: "linear-algebra",
    },
  },
  {
    slug: "notes/rcwa" as KnowledgeCatalogEntry["slug"],
    filePath: "notes/rcwa.md",
    title: "RCWA 入门",
    knowledgeMetadata: {
      isStructured: true,
      primaryTopic: "computing-simulation",
      subtopic: "科学计算与仿真",
      topics: ["computing-simulation", "physics-optics"],
      type: "project-guide",
      maturity: "growing",
      prerequisites: [],
      related: [],
      sources: [],
      license: "未声明许可",
      publish: true,
      commentKey: "rcwa",
    },
  },
  {
    slug: "topics/index" as KnowledgeCatalogEntry["slug"],
    filePath: "topics/index.md",
    title: "主题",
  },
  {
    slug: "search/index" as KnowledgeCatalogEntry["slug"],
    filePath: "search/index.md",
    title: "搜索知识库",
  },
]

describe("knowledge catalog", () => {
  test("lists each record exactly once by primary topic", () => {
    const records = flattenKnowledgeCatalog(buildKnowledgeCatalog(entries, "topic"))
    assert.deepStrictEqual(records.map((item) => item.slug).sort(), [
      "notes/linear-algebra",
      "notes/rcwa",
    ])
    assert.strictEqual(new Set(records.map((item) => item.slug)).size, records.length)
  })

  test("does not duplicate records into their secondary topics", () => {
    const groups = buildKnowledgeCatalog(entries, "topic")
    const physics = groups.find((group) => group.id === "topic:physics-optics")
    assert.strictEqual(physics, undefined)
  })

  test("supports a type view without structural pages", () => {
    const records = flattenKnowledgeCatalog(buildKnowledgeCatalog(entries, "type"))
    assert.strictEqual(records.length, 2)
    assert(records.some((item) => item.label === "RCWA 入门"))
  })
})
