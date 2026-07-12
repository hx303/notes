import assert from "node:assert"
import test, { describe } from "node:test"
import type { ContentDetails } from "../plugins/emitters/contentIndex"
import type { KnowledgeMetadata } from "./knowledgeMetadata"
import {
  createSearchEngine,
  expandSearchQuery,
  highlightSegments,
  searchKnowledge,
} from "./searchKnowledge"

function metadata(overrides: Partial<KnowledgeMetadata> = {}): KnowledgeMetadata {
  return {
    isStructured: true,
    summary: "测试摘要",
    primaryTopic: "computing-simulation",
    topics: ["computing-simulation"],
    type: "project-guide",
    maturity: "growing",
    prerequisites: [],
    related: [],
    sources: [],
    license: "CC BY 4.0",
    publish: true,
    commentKey: "test",
    ...overrides,
  }
}

function detail(
  title: string,
  content: string,
  tags: string[],
  knowledgeMetadata = metadata(),
): ContentDetails {
  return {
    slug: title as ContentDetails["slug"],
    filePath: `${title}.md` as ContentDetails["filePath"],
    title,
    content,
    tags,
    links: [],
    knowledgeMetadata,
  }
}

describe("D04 knowledge search", () => {
  const data = {
    "notes/comsol": detail("COMSOL 基本建模流程", "从几何到网格和求解器。", ["仿真"]),
    "notes/optics": detail("薄膜实验记录", "使用 Fresnel 方程理解薄膜干涉。", ["光学"]),
    "notes/citation": detail("学术写作", "如何核对来源。", ["引用", "文献"]),
    "topics/index": detail("主题索引", "结构页面", []),
    "notes/private": detail("私密记录", "不应被搜索", [], metadata({ publish: false })),
  }

  test("searches title, content and tags with stable field priority", async () => {
    const engine = await createSearchEngine(data)
    assert.strictEqual(engine.records.length, 3)

    const title = await searchKnowledge(engine, "COMSOL")
    const content = await searchKnowledge(engine, "薄膜干涉")
    const tag = await searchKnowledge(engine, "引用")

    assert.strictEqual(title[0].slug, "notes/comsol")
    assert(title[0].matchedFields.includes("title"))
    assert.strictEqual(content[0].slug, "notes/optics")
    assert(content[0].matchedFields.includes("content"))
    assert.strictEqual(tag[0].slug, "notes/citation")
    assert(tag[0].matchedFields.includes("tags"))
  })

  test("supports inferred synonyms and a common abbreviation typo", async () => {
    const engine = await createSearchEngine(data)
    assert.deepStrictEqual(expandSearchQuery("数值仿真"), ["数值仿真", "COMSOL", "仿真"])
    assert.strictEqual((await searchKnowledge(engine, "comosl"))[0].slug, "notes/comsol")
  })

  test("creates safe query highlight segments for punctuation and Chinese", () => {
    assert.doesNotThrow(() => highlightSegments("A+B 与微积分", "A+B"))
    assert(highlightSegments("量子物理", "量子").some((segment) => segment.match))
  })
})
