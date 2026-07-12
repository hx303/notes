import assert from "node:assert"
import { readFileSync } from "node:fs"
import test, { describe } from "node:test"
import { render } from "preact-render-to-string"
import type { QuartzPluginData } from "../plugins/vfile"
import TopicPageConstructor from "./TopicPage"
import type { QuartzComponentProps } from "./types"
import { topicDefinitions } from "../util/topicIndex"

const sharedRecord = {
  slug: "科研项目/RCWA从零开始学习指南",
  frontmatter: { title: "RCWA 从零开始", tags: [] },
  knowledgeMetadata: {
    isStructured: true,
    summary: "从模型、代码与实验语境理解严格耦合波分析。",
    primaryTopic: "computing-simulation",
    subtopic: "科学计算与仿真",
    topics: ["computing-simulation", "physics-optics", "research-methods"],
    type: "project-guide",
    maturity: "growing",
    prerequisites: [],
    related: [],
    sources: [],
    license: "未声明许可",
    publish: true,
    commentKey: "rcwa",
  },
} as unknown as QuartzPluginData

function props(topicKey: string): QuartzComponentProps {
  return {
    fileData: {
      slug: `topics/${topicKey}/index`,
      frontmatter: { title: topicKey, tags: [] },
    } as unknown as QuartzPluginData,
    allFiles: [sharedRecord],
    cfg: { locale: "zh-CN" },
  } as QuartzComponentProps
}

describe("D03 topic hub", () => {
  const TopicPage = TopicPageConstructor()

  test("uses one reusable page for all seven configured topic routes", () => {
    for (const definition of topicDefinitions) {
      const html = render(<TopicPage {...props(definition.key)} />)
      assert.match(html, new RegExp(`data-topic-page="${definition.key}"`))
      assert.match(html, /data-topic-filter-form/)
      assert.match(html, /id="knowledge-list"/)
    }
  })

  test("marks secondary context while preserving the same canonical article slug", () => {
    const primary = render(<TopicPage {...props("computing-simulation")} />)
    const secondary = render(<TopicPage {...props("physics-optics")} />)

    assert.match(primary, /data-canonical-slug="科研项目\/RCWA从零开始学习指南"/)
    assert.match(secondary, /data-canonical-slug="科研项目\/RCWA从零开始学习指南"/)
    assert.doesNotMatch(primary, /跨主题 · 主主题/)
    assert.match(secondary, /跨主题 · 主主题 计算与仿真/)
  })

  test("serializes filters and restores them from browser history", () => {
    const script = readFileSync(
      new URL("./scripts/topicFilters.inline.ts", import.meta.url),
      "utf8",
    )

    assert.match(script, /url\.searchParams\.set/)
    assert.match(script, /history\.pushState/)
    assert.match(script, /addEventListener\("popstate"/)
    assert.match(script, /readUrl\(\)/)
    assert.match(script, /row\.hidden = !matches/)
  })
})
