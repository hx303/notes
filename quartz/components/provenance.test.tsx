import assert from "node:assert"
import { readFileSync } from "node:fs"
import test, { describe } from "node:test"
import { render } from "preact-render-to-string"
import type { QuartzPluginData } from "../plugins/vfile"
import type { FullSlug } from "../util/path"
import CitationActionsConstructor from "./CitationActions"
import RevisionHistoryConstructor from "./RevisionHistory"
import type { QuartzComponentProps } from "./types"

const props = (fileData: QuartzPluginData) =>
  ({
    fileData,
    cfg: { locale: "zh-CN", baseUrl: "wouldkeep.com" },
  }) as unknown as QuartzComponentProps

const record = (overrides: Partial<QuartzPluginData> = {}) =>
  ({
    slug: "notes/rcwa-from-zero" as FullSlug,
    frontmatter: { title: "RCWA 与 TMM 光学建模", author: "夔嵬" },
    knowledgeMetadata: {
      isStructured: true,
      created: "2026-07-01",
      updated: "2026-07-07",
      license: "CC BY 4.0",
      sources: [
        { title: "示例论文", doi: "10.1000/example" },
        { title: "纸质资料" },
        { title: "不安全链接", url: "javascript:alert(1)" },
      ],
    },
    ...overrides,
  }) as QuartzPluginData

describe("R04 provenance and citation actions", () => {
  test("renders sources, license, dates and concise revision chronology", () => {
    const RevisionHistory = RevisionHistoryConstructor()
    const html = render(<RevisionHistory {...props(record())} />)

    assert.match(html, /<h2 id="revision-history-title">出处与修订<\/h2>/)
    assert.match(html, /<dt>许可<\/dt><dd>CC BY 4.0<\/dd>/)
    assert.match(html, /href="https:\/\/doi\.org\/10\.1000\/example"/)
    assert.match(html, /当前仅记录书目信息，未提供可验证链接/)
    assert.doesNotMatch(html, /href="javascript:/)
    assert.strictEqual(html.match(/data-revision-kind=/g)?.length, 2)
    assert.match(html, /创建记录/)
    assert.match(html, /最近修订/)
  })

  test("embeds canonical copy and share payloads in semantic buttons", () => {
    const CitationActions = CitationActionsConstructor()
    const html = render(<CitationActions {...props(record())} />)

    assert.match(html, /data-canonical-url="https:\/\/wouldkeep\.com\/notes\/rcwa-from-zero"/)
    assert.match(html, /data-suggested-citation="夔嵬\./)
    assert.match(html, /data-citation-action="copy-link"/)
    assert.match(html, /data-citation-action="copy-citation"/)
    assert.match(html, /data-citation-action="share"/)
    assert.match(html, /role="status" aria-live="polite" aria-atomic="true"/)
    assert.strictEqual(html.match(/<button/g)?.length, 3)
  })

  test("provides specific non-blocking success, fallback and failure feedback", () => {
    const script = readFileSync(
      new URL("./scripts/citationActions.inline.ts", import.meta.url),
      "utf8",
    )
    const styles = readFileSync(new URL("./styles/citationActions.scss", import.meta.url), "utf8")

    assert.match(script, /navigator\.clipboard/)
    assert.match(script, /navigator\.share/)
    assert.match(script, /当前浏览器不支持系统分享，已复制永久链接/)
    assert.match(script, /未能复制引用，请稍后重试/)
    assert.match(script, /AbortError/)
    assert.match(styles, /min-block-size: var\(--touch-target-min\)/)
    assert.doesNotMatch(styles, /transition:\s*all/)
  })
})
