import assert from "node:assert"
import test, { describe } from "node:test"
import { render } from "preact-render-to-string"
import type { QuartzPluginData } from "../plugins/vfile"
import { FilePath, FullSlug, slugifyFilePath } from "../util/path"
import DiscoverHomeConstructor from "./DiscoverHome"
import MapPageConstructor from "./MapPage"
import RecentGrowthConstructor from "./RecentGrowth"
import type { QuartzComponentProps } from "./types"

function file(
  slug: string,
  title: string,
  options: {
    primaryTopic?: "mathematics"
    publish?: boolean
    learningPath?: Record<string, unknown>
    modified?: string
  } = {},
): QuartzPluginData {
  const modified = new Date(options.modified ?? "2026-07-01")
  const knowledgeMetadata = options.primaryTopic
    ? ({
        isStructured: true,
        primaryTopic: options.primaryTopic,
        topics: [options.primaryTopic],
        type: "concept",
        maturity: "seed",
        prerequisites: [],
        related: [],
        sources: [],
        license: "未声明许可",
        publish: options.publish ?? true,
        commentKey: slug,
      } as NonNullable<QuartzPluginData["knowledgeMetadata"]>)
    : options.publish === false
      ? ({ publish: false } as NonNullable<QuartzPluginData["knowledgeMetadata"]>)
      : undefined

  return {
    slug: slug as FullSlug,
    frontmatter: { title, learningPath: options.learningPath },
    dates: { created: modified, modified, published: modified },
    links: [],
    knowledgeMetadata,
  } as QuartzPluginData
}

const validPath = {
  id: "math-start",
  status: "published",
  maintenance: "maintained",
  outcome: "建立数学起点。",
  steps: [{ slug: "notes/math" }],
}

function props(allFiles: QuartzPluginData[], slug = "index"): QuartzComponentProps {
  return {
    fileData: {
      slug: slug as FullSlug,
      frontmatter: { title: "测试页" },
    } as QuartzPluginData,
    allFiles,
    cfg: { locale: "zh-CN" },
  } as unknown as QuartzComponentProps
}

describe("P07-A public discovery surfaces", () => {
  const records = [
    file("legacy/note", "旧公开知识", { modified: "2026-07-01" }),
    file("notes/math", "数学公开知识", {
      primaryTopic: "mathematics",
      modified: "2026-07-02",
    }),
    file("notes/private", "私密记录", {
      primaryTopic: "mathematics",
      publish: false,
      modified: "2026-07-03",
    }),
    file("workspace/index", "我的空间", { modified: "2026-07-04" }),
    file(slugifyFilePath("⚙️ 管理/管理面板.md" as FilePath), "旧管理面板", {
      modified: "2026-07-05",
    }),
    file("paths/math/index", "数学路径", { learningPath: validPath }),
    file("paths/private/index", "私密路径", { learningPath: validPath, publish: false }),
    file("paths/invalid/index", "无效路径", { learningPath: { id: "invalid" } }),
  ]

  test("home derives featured records, totals and valid path count from the same boundary", () => {
    const Home = DiscoverHomeConstructor()
    const html = render(<Home {...props(records)} />)

    assert.match(html, /旧公开知识/)
    assert.match(html, /数学公开知识/)
    assert.doesNotMatch(html, /私密记录/)
    assert.doesNotMatch(html, /我的空间/)
    assert.doesNotMatch(html, /旧管理面板/)
    assert.match(html, /<strong>2<\/strong><span>公开记录<\/span>/)
    assert.match(html, /<strong>1<\/strong><span>正在交汇的主题<\/span>/)
    assert.match(html, /<strong>1<\/strong><span>可继续的学习路径<\/span>/)
  })

  test("map list and recent growth exclude private and system routes", () => {
    const MapPage = MapPageConstructor()
    const RecentGrowth = RecentGrowthConstructor()
    const mapHtml = render(<MapPage {...props(records, "map/index")} />)
    const growthHtml = render(<RecentGrowth {...props(records, "changes/index")} />)

    assert.strictEqual((mapHtml.match(/data-map-record/g) ?? []).length, 2)
    assert.match(mapHtml, /&quot;publicDiscoveryOnly&quot;:true/)
    assert.strictEqual((growthHtml.match(/data-growth-record/g) ?? []).length, 2)
    for (const html of [mapHtml, growthHtml]) {
      assert.match(html, /旧公开知识/)
      assert.match(html, /数学公开知识/)
      assert.doesNotMatch(html, /私密记录/)
      assert.doesNotMatch(html, /我的空间/)
      assert.doesNotMatch(html, /旧管理面板/)
    }
  })
})
