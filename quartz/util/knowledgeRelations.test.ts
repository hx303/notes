import assert from "node:assert"
import test, { describe } from "node:test"
import type { QuartzPluginData } from "../plugins/vfile"
import {
  classifyIncomingKnowledgeLinks,
  findPathMemberships,
  isBidirectionalRelation,
  resolveKnowledgeReference,
} from "./knowledgeRelations"
import type { FullSlug, SimpleSlug } from "./path"

const file = (
  slug: string,
  title: string,
  extra: Partial<QuartzPluginData> = {},
): QuartzPluginData =>
  ({
    slug: slug as FullSlug,
    frontmatter: { title },
    links: [],
    ...extra,
  }) as QuartzPluginData

describe("knowledge relations", () => {
  test("resolves canonical slugs, aliases and titles with honest missing/self states", () => {
    const current = file("notes/current", "当前文章")
    const target = file("notes/linear-algebra", "线性代数", {
      aliases: ["课堂笔记/线性代数" as FullSlug],
    })
    const files = [current, target]

    assert.strictEqual(resolveKnowledgeReference(files, current, "线性代数").target, target)
    assert.strictEqual(
      resolveKnowledgeReference(files, current, "课堂笔记/线性代数").target,
      target,
    )
    assert.strictEqual(resolveKnowledgeReference(files, current, "notes/current").state, "self")
    assert.strictEqual(resolveKnowledgeReference(files, current, "尚未发布").state, "missing")
    assert.strictEqual(resolveKnowledgeReference(files, current, "invalid%slug").state, "missing")
  })

  test("detects bidirectional relations without recursing", () => {
    const current = file("notes/current", "当前文章", {
      knowledgeMetadata: { related: [{ slug: "notes/target" }] } as never,
    })
    const target = file("notes/target", "目标文章", {
      knowledgeMetadata: { related: [{ slug: "notes/current" }] } as never,
    })
    assert.equal(isBidirectionalRelation(current, target, [current, target]), true)
  })

  test("derives path position and separates explicit citations from ordinary mentions", () => {
    const current = file("notes/current", "当前文章")
    const citation = file("notes/citation", "显式关联", {
      links: ["notes/current" as SimpleSlug],
      knowledgeMetadata: { related: [{ slug: "notes/current", reason: "延伸证明" }] } as never,
    })
    const mention = file("notes/mention", "正文提及", {
      links: ["notes/current" as SimpleSlug],
    })
    const path = file("paths/optics", "从物理到光学", {
      links: ["notes/start" as SimpleSlug, "notes/current" as SimpleSlug],
    })
    const files = [current, citation, mention, path]

    const kinds = classifyIncomingKnowledgeLinks(current, files).map(({ kind }) => kind)
    assert.strictEqual(kinds.filter((kind) => kind === "citation").length, 1)
    assert.strictEqual(kinds.filter((kind) => kind === "mention").length, 2)
    assert.deepStrictEqual(findPathMemberships(current, files), [
      { path, position: 2, total: 2, kind: "core" },
    ])
  })
})
