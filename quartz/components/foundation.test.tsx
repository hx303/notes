import assert from "node:assert"
import test, { describe } from "node:test"
import { render } from "preact-render-to-string"
import type { Root } from "hast"
import type { GlobalConfiguration } from "../cfg"
import type { BuildCtx } from "../util/ctx"
import type { FullSlug } from "../util/path"
import type { StaticResources } from "../util/resources"
import type { KnowledgeMetadata } from "../util/knowledgeMetadata"
import type { QuartzPluginData } from "../plugins/vfile"
import PrimaryNavConstructor from "./PrimaryNav"
import BreadcrumbsConstructor from "./Breadcrumbs"
import ArticleTitleConstructor from "./ArticleTitle"
import KnowledgeMetaConstructor from "./KnowledgeMeta"
import { MaturityBadgeView } from "./MaturityBadge"
import { renderPage } from "./renderPage"
import type { QuartzComponent, QuartzComponentProps } from "./types"

const cfg = {
  pageTitle: "wouldkeep",
  enableSPA: true,
  enablePopovers: true,
  analytics: null,
  ignorePatterns: [],
  defaultDateType: "created",
  locale: "zh-CN",
  theme: {},
} as unknown as GlobalConfiguration

const externalResources: StaticResources = {
  css: [],
  js: [],
  additionalHead: [],
}

const ctx = {
  cfg: { configuration: cfg, plugins: { transformers: [], filters: [], emitters: [] } },
  allSlugs: [],
  allFiles: [],
  canonicalSlugMap: {},
} as unknown as BuildCtx

const tree: Root = { type: "root", children: [] }

const knowledgeMetadata: KnowledgeMetadata = {
  isStructured: true,
  summary: "从物理直觉、建模边界到可复现实验的 RCWA 学习指南。",
  primaryTopic: "computing-simulation",
  topics: ["computing-simulation", "physics-optics"],
  type: "project-guide",
  maturity: "growing",
  created: "2026-07-07",
  updated: "2026-07-10",
  prerequisites: ["高中物理"],
  related: [],
  sources: [],
  license: "CC BY-NC-SA 4.0",
  publish: true,
  commentKey: "content/科研项目/RCWA从零开始学习指南.md",
}

function componentProps(overrides: Partial<QuartzPluginData> = {}): QuartzComponentProps {
  return {
    ctx,
    externalResources,
    cfg,
    children: [],
    tree,
    allFiles: [],
    fileData: {
      slug: "notes/rcwa-from-zero" as FullSlug,
      frontmatter: { title: "RCWA 从零开始学习指南" },
      text: "RCWA ".repeat(240),
      knowledgeMetadata,
      ...overrides,
    },
  }
}

function occurrences(source: string, pattern: RegExp): number {
  return source.match(pattern)?.length ?? 0
}

describe("foundation shell", () => {
  test("renders one focusable main landmark after the first-tab-stop skip link", () => {
    const Empty: QuartzComponent = () => null
    const Head: QuartzComponent = () => (
      <head>
        <title>Foundation fixture</title>
      </head>
    )
    const Content: QuartzComponent = () => <article aria-label="测试正文">正文</article>
    const Footer: QuartzComponent = () => <footer>页脚</footer>
    const props = componentProps()

    const html = renderPage(
      cfg,
      props.fileData.slug!,
      props,
      {
        head: Head,
        header: [Empty],
        beforeBody: [],
        pageBody: Content,
        afterBody: [],
        left: [],
        right: [],
        footer: Footer,
      },
      externalResources,
    )

    assert.strictEqual(occurrences(html, /<main\b/g), 1)
    assert.match(html, /<a class="skip-link" href="#main-content">跳到正文<\/a>/)
    assert.match(html, /<main id="main-content" class="center" tabindex="-1">/)
    assert.match(html, /<aside class="left sidebar" aria-label="站点导航与阅读工具">/)
    assert.match(html, /<aside class="right sidebar" aria-label="当前页面的补充信息">/)
    assert(html.indexOf('href="#main-content"') < html.indexOf("<main"))
  })
})

describe("primary navigation", () => {
  test("exposes the four destinations and marks the current section in both variants", () => {
    const PrimaryNav = PrimaryNavConstructor()
    const html = render(
      <PrimaryNav {...componentProps({ slug: "topics/physics-optics" as FullSlug })} />,
    )

    assert.match(html, /<nav class="primary-nav" aria-label="主要导航">/)
    assert.strictEqual(occurrences(html, /data-nav-slug="topics"/g), 2)
    assert.strictEqual(occurrences(html, /data-nav-slug="paths"/g), 2)
    assert.strictEqual(occurrences(html, /data-nav-slug="map"/g), 2)
    assert.strictEqual(occurrences(html, /data-nav-slug="build"/g), 2)
    assert.strictEqual(occurrences(html, /aria-current="page"/g), 2)
  })

  test("keeps the narrow navigation dialog named and controllable", () => {
    const PrimaryNav = PrimaryNavConstructor()
    const html = render(<PrimaryNav {...componentProps()} />)

    assert.match(
      html,
      /<button class="primary-nav-toggle" type="button" aria-label="打开主要导航" aria-expanded="false" aria-controls="primary-nav-dialog">/,
    )
    assert.match(
      html,
      /<dialog id="primary-nav-dialog" class="primary-nav-dialog" aria-labelledby="primary-nav-title">/,
    )
    assert.match(html, /<h2 id="primary-nav-title">去往哪里？<\/h2>/)
    assert.match(html, /aria-label="关闭主要导航"/)
  })
})

describe("representative knowledge record header", () => {
  test("renders one H1 with semantic breadcrumbs, classification, revision and license", () => {
    const Breadcrumbs = BreadcrumbsConstructor(undefined)
    const ArticleTitle = ArticleTitleConstructor()
    const KnowledgeMeta = KnowledgeMetaConstructor(undefined)
    const props = componentProps()
    const html = render(
      <>
        <Breadcrumbs {...props} />
        <ArticleTitle {...props} />
        <KnowledgeMeta {...props} />
      </>,
    )

    assert.strictEqual(occurrences(html, /<h1\b/g), 1)
    assert.match(html, /<nav class="breadcrumb-container" aria-label="面包屑">/)
    assert.match(html, /<span aria-current="page" title="RCWA 从零开始学习指南">/)
    assert.match(html, /<h1 class="article-title knowledge-article-title">/)
    assert.match(html, /<section class="knowledge-record-header" aria-label="知识记录信息"/)
    assert.match(html, /data-primary-topic="computing-simulation"/)
    assert.match(html, /data-type="project-guide"/)
    assert.match(html, /data-maturity="growing"/)
    assert.match(html, /<p class="knowledge-record-summary">/)
    assert.match(html, /<dt>最后修订<\/dt>/)
    assert.match(html, /<dt>阅读时间<\/dt>/)
    assert.match(html, /<dt>复用许可<\/dt>/)
  })

  test("omits absent optional facts without losing the record classification", () => {
    const KnowledgeMeta = KnowledgeMetaConstructor(undefined)
    const minimalKnowledge: KnowledgeMetadata = {
      ...knowledgeMetadata,
      summary: undefined,
      created: undefined,
      updated: undefined,
      license: "",
    }
    const html = render(
      <KnowledgeMeta
        {...componentProps({
          text: undefined,
          dates: undefined,
          knowledgeMetadata: minimalKnowledge,
        })}
      />,
    )

    assert.match(html, /aria-label="知识记录信息"/)
    assert.match(html, /data-maturity="growing"/)
    assert.doesNotMatch(html, /knowledge-record-summary/)
    assert.doesNotMatch(html, /<dt>/)
  })

  test("gives every maturity state a textual label and stable index", () => {
    const expected = [
      ["seed", "01", "萌芽"],
      ["growing", "02", "整理中"],
      ["stable", "03", "相对完整"],
    ] as const

    for (const [maturity, index, label] of expected) {
      const html = render(<MaturityBadgeView maturity={maturity} />)
      assert.match(html, new RegExp(`data-maturity="${maturity}"`))
      assert.match(html, new RegExp(`aria-label="成熟度：${label}`))
      assert.match(html, new RegExp(`<span class="maturity-index" aria-hidden="true">${index}`))
      assert.match(html, new RegExp(`<span>${label}</span>`))
    }
  })
})
