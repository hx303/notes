import assert from "node:assert"
import test, { describe } from "node:test"
import type { QuartzPluginData } from "../plugins/vfile"
import { buildTopicPageData, buildTopicSummaries } from "./topicIndex"

function record(
  slug: string,
  primaryTopic: NonNullable<QuartzPluginData["knowledgeMetadata"]>["primaryTopic"],
  subtopic: string,
  topics: NonNullable<QuartzPluginData["knowledgeMetadata"]>["topics"] = primaryTopic
    ? [primaryTopic]
    : [],
): QuartzPluginData {
  return {
    slug: slug as QuartzPluginData["slug"],
    frontmatter: { title: slug, tags: [] },
    knowledgeMetadata: {
      isStructured: true,
      primaryTopic,
      subtopic,
      topics,
      type: "concept",
      maturity: "seed",
      prerequisites: [],
      related: [],
      sources: [],
      license: "未声明许可",
      publish: true,
      commentKey: slug,
    },
  }
}

describe("topic index", () => {
  test("always exposes the seven curated topics, including empty topics", () => {
    const summaries = buildTopicSummaries([record("notes/math", "mathematics", "微积分上")])
    assert.strictEqual(summaries.length, 7)
    assert.strictEqual(summaries.find((topic) => topic.key === "mathematics")?.count, 1)
    assert.strictEqual(summaries.find((topic) => topic.key === "physics-optics")?.count, 0)
  })

  test("derives counts and subtopic order from records", () => {
    const summaries = buildTopicSummaries([
      record("notes/a", "mathematics", "线性代数"),
      record("notes/b", "mathematics", "微积分上"),
      record("notes/c", "mathematics", "微积分上"),
      record("topics/index", undefined, "综合"),
    ])
    const mathematics = summaries.find((topic) => topic.key === "mathematics")!
    assert.strictEqual(mathematics.count, 3)
    assert.deepStrictEqual(mathematics.subtopics, [
      { label: "微积分上", count: 2 },
      { label: "线性代数", count: 1 },
    ])
  })

  test("handles a large topic without changing the summary contract", () => {
    const records = Array.from({ length: 120 }, (_, index) =>
      record(`notes/math-${index}`, "mathematics", "数学综合"),
    )
    const mathematics = buildTopicSummaries(records).find((topic) => topic.key === "mathematics")!
    assert.strictEqual(mathematics.count, 120)
    assert.strictEqual(mathematics.subtopics[0].count, 120)
    assert(mathematics.recommended)
  })

  test("includes a cross-domain record once in primary and secondary topic contexts", () => {
    const shared = record("research/rcwa", "computing-simulation", "科学计算与仿真", [
      "computing-simulation",
      "physics-optics",
      "research-methods",
    ])
    const input = [shared, shared]
    const computing = buildTopicPageData(input, "computing-simulation")!
    const physics = buildTopicPageData(input, "physics-optics")!

    assert.strictEqual(computing.records.length, 1)
    assert.strictEqual(computing.primaryCount, 1)
    assert.strictEqual(computing.contextualCount, 0)
    assert.strictEqual(physics.records.length, 1)
    assert.strictEqual(physics.primaryCount, 0)
    assert.strictEqual(physics.contextualCount, 1)
    assert.strictEqual(computing.records[0].slug, physics.records[0].slug)
    assert.deepStrictEqual(
      physics.connections.map((connection) => connection.key),
      ["computing-simulation", "research-methods"],
    )
  })
})
