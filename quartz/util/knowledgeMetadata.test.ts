import assert from "node:assert"
import test, { describe } from "node:test"
import {
  actionableKnowledgeIssues,
  formatKnowledgeIssue,
  normalizeKnowledgeMetadata,
} from "./knowledgeMetadata"

describe("knowledge metadata", () => {
  const context = {
    sourceSlug: "科研项目/RCWA从零开始学习指南",
    commentKey: "content/科研项目/RCWA从零开始学习指南.md",
  }

  test("normalizes a fully structured public record", () => {
    const { metadata, issues } = normalizeKnowledgeMetadata(
      {
        canonicalSlug: "notes/rcwa-from-zero",
        summary: "A complete RCWA learning guide.",
        primaryTopic: "computing-simulation",
        topics: ["physics-optics", "research-methods"],
        type: "project-guide",
        maturity: "growing",
        created: "2026-07-07",
        updated: "2026-07-10",
        prerequisites: ["高中物理", "微积分基础"],
        related: [{ slug: "notes/tmm-basics", reason: "前置建模方法" }],
        sources: [{ title: "Callies 2025", doi: "10.1000/example" }],
        license: "未声明许可",
        publish: true,
        commentKey: context.commentKey,
      },
      context,
    )

    assert.strictEqual(metadata.isStructured, true)
    assert.strictEqual(metadata.primaryTopic, "computing-simulation")
    assert.deepStrictEqual(metadata.topics, [
      "computing-simulation",
      "physics-optics",
      "research-methods",
    ])
    assert.strictEqual(metadata.type, "project-guide")
    assert.strictEqual(metadata.maturity, "growing")
    assert.strictEqual(metadata.updated, "2026-07-10")
    assert.strictEqual(metadata.publish, true)
    assert.strictEqual(issues.length, 0)
  })

  test("keeps legacy pages compatible without actionable warning noise", () => {
    const { metadata, issues } = normalizeKnowledgeMetadata(
      {
        description: "Legacy description",
        subject: "线性代数",
        status: "complete",
        date: "2026-05-01",
      },
      { sourceSlug: "📖-课堂笔记/线性代数/第一章", commentKey: "legacy.md" },
    )

    assert.strictEqual(metadata.isStructured, false)
    assert.strictEqual(metadata.primaryTopic, "mathematics")
    assert.strictEqual(metadata.type, "course-note")
    assert.strictEqual(metadata.maturity, "stable")
    assert.strictEqual(metadata.summary, "Legacy description")
    assert.deepStrictEqual(actionableKnowledgeIssues(metadata, issues), [])
  })

  test("falls back safely and reports invalid structured fields", () => {
    const { metadata, issues } = normalizeKnowledgeMetadata(
      {
        canonicalSlug: "notes/invalid-example",
        primaryTopic: "unknown-topic",
        topics: ["physics-optics", "bad-topic"],
        type: "essay",
        maturity: "done",
        updated: "not-a-date",
        related: [42, {}],
        sources: [{}],
        publish: "maybe",
      },
      { sourceSlug: "misc/example", commentKey: "content/misc/example.md" },
    )

    const actionable = actionableKnowledgeIssues(metadata, issues)
    assert.strictEqual(metadata.isStructured, true)
    assert.strictEqual(metadata.primaryTopic, undefined)
    assert.deepStrictEqual(metadata.topics, ["physics-optics"])
    assert.strictEqual(metadata.type, "concept")
    assert.strictEqual(metadata.maturity, "seed")
    assert.strictEqual(metadata.publish, true)
    assert.strictEqual(metadata.license, "未声明许可")
    assert(actionable.some((issue) => issue.field === "primaryTopic"))
    assert(actionable.some((issue) => issue.field === "topics"))
    assert(actionable.some((issue) => issue.field === "updated"))
    assert(actionable.some((issue) => issue.field === "publish"))
    assert.match(formatKnowledgeIssue("misc/example", actionable[0]), /\[knowledge-metadata\]/)
  })

  test("normalizes epoch seconds and structured source variants", () => {
    const { metadata } = normalizeKnowledgeMetadata(
      {
        canonicalSlug: "notes/epoch-example",
        primaryTopic: "research-methods",
        type: "research-note",
        maturity: "stable",
        summary: "Example",
        created: 1_767_225_600,
        sources: ["Source title", { url: "https://example.com" }],
        license: "未声明许可",
        publish: false,
      },
      { sourceSlug: "科研笔记/example", commentKey: "example.md" },
    )

    assert.strictEqual(metadata.created, "2026-01-01")
    assert.deepStrictEqual(metadata.sources, [
      { title: "Source title" },
      {
        title: "https://example.com",
        url: "https://example.com",
        doi: undefined,
      },
    ])
    assert.strictEqual(metadata.publish, false)
  })

  test("maps legacy migration paths into formal topics and subtopics", () => {
    const history = normalizeKnowledgeMetadata(
      {},
      { sourceSlug: "📖-课堂笔记/中华民族发展史/中华文明起源", commentKey: "history" },
    ).metadata
    const video = normalizeKnowledgeMetadata(
      {},
      { sourceSlug: "🎬-视频笔记/meta-game-analysis", commentKey: "video" },
    ).metadata
    const tool = normalizeKnowledgeMetadata(
      {},
      { sourceSlug: "Mermaid图表功能演示", commentKey: "tool" },
    ).metadata
    const quantumLecture = normalizeKnowledgeMetadata(
      { title: "Lecture 3: Quantum Particles" },
      { sourceSlug: "🎓-讲座笔记/Bizarre-World/Lecture-3", commentKey: "quantum" },
    ).metadata
    const homepage = normalizeKnowledgeMetadata(
      { title: "🏠 首页" },
      { sourceSlug: "index", commentKey: "home" },
    ).metadata

    assert.strictEqual(history.primaryTopic, "history-society")
    assert.strictEqual(history.subtopic, "历史")
    assert.strictEqual(video.primaryTopic, "growth-practice")
    assert.strictEqual(video.subtopic, "个人实践")
    assert.strictEqual(tool.primaryTopic, "computing-simulation")
    assert.strictEqual(tool.subtopic, "可视化工具")
    assert.strictEqual(quantumLecture.primaryTopic, "physics-optics")
    assert.strictEqual(quantumLecture.subtopic, "量子物理")
    assert.strictEqual(homepage.primaryTopic, "growth-practice")
  })
})
