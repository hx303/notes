import assert from "node:assert"
import test, { describe } from "node:test"
import { render } from "preact-render-to-string"
import type { QuartzPluginData } from "../plugins/vfile"
import type { FullSlug, SimpleSlug } from "../util/path"
import BacklinksConstructor from "./Backlinks"
import PrerequisiteBlockConstructor from "./PrerequisiteBlock"
import RelatedKnowledgeConstructor from "./RelatedKnowledge"
import type { QuartzComponentProps } from "./types"

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

const props = (fileData: QuartzPluginData, allFiles: QuartzPluginData[]) =>
  ({
    fileData,
    allFiles,
    cfg: { locale: "zh-CN" },
  }) as unknown as QuartzComponentProps

describe("R03 knowledge relation components", () => {
  test("renders resolved and missing prerequisites without creating broken links", () => {
    const target = file("notes/calculus", "微积分基础", {
      knowledgeMetadata: { summary: "理解变化率与积分。" } as never,
    })
    const current = file("notes/optics", "光学建模", {
      knowledgeMetadata: {
        isStructured: true,
        prerequisites: ["微积分基础", "电磁学基础", "notes/optics"],
      } as never,
    })
    const Prerequisites = PrerequisiteBlockConstructor()
    const html = render(<Prerequisites {...props(current, [current, target])} />)

    assert.match(html, /<section class="prerequisite-block"/)
    assert.match(html, /href="\.\.\/notes\/calculus"[^>]*>微积分基础<\/a>/)
    assert.match(html, /data-reference-state="missing"/)
    assert.match(html, /站内暂无对应条目/)
    assert.match(html, /已避免重复循环/)
  })

  test("shows relation reasons, cross-topic context, bidirectionality and path fallback", () => {
    const current = file("notes/rcwa", "RCWA", {
      knowledgeMetadata: {
        isStructured: true,
        primaryTopic: "computing-simulation",
        related: [
          { slug: "大学物理", reason: "建立电磁学直觉。" },
          { slug: "尚未发布" },
          { slug: "notes/rcwa" },
        ],
      } as never,
    })
    const target = file("notes/physics", "大学物理", {
      knowledgeMetadata: {
        primaryTopic: "physics-optics",
        prerequisites: ["notes/rcwa"],
      } as never,
    })
    const Related = RelatedKnowledgeConstructor()
    const html = render(<Related {...props(current, [current, target])} />)

    assert.match(html, /建立电磁学直觉/)
    assert.match(html, /跨主题 · 物理与光学/)
    assert.match(html, /双向关联/)
    assert.match(html, /该目标尚未发布或地址已变更/)
    assert.match(html, /有一条相关关系指回本文/)
    assert.match(html, /尚未加入公开学习路径/)
  })

  test("groups explicit metadata citations separately from ordinary body mentions", () => {
    const current = file("notes/current", "当前文章")
    const citation = file("notes/citation", "显式引用", {
      knowledgeMetadata: { related: [{ slug: "notes/current" }] } as never,
    })
    const mention = file("notes/mention", "正文提及", {
      links: ["notes/current" as SimpleSlug],
    })
    const Backlinks = BacklinksConstructor()
    const html = render(<Backlinks {...props(current, [current, citation, mention])} />)

    assert.match(html, /<h2 id="backlinks-title">提及本文<\/h2>/)
    assert.match(html, /<h3 id="backlinks-citations">引用本文<\/h3>/)
    assert.match(html, /显式引用/)
    assert.match(html, /<h3 id="backlinks-mentions">正文提及<\/h3>/)
    assert.match(html, />正文提及<\/a>/)
  })
})
