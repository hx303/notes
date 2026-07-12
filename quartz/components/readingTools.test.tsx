import assert from "node:assert"
import { readFileSync } from "node:fs"
import test, { describe } from "node:test"
import { render } from "preact-render-to-string"
import MobileReadingToolsConstructor from "./MobileReadingTools"
import ReadingToolsConstructor from "./ReadingTools"
import type { QuartzComponentProps } from "./types"

const props = {
  cfg: { locale: "zh-CN" },
  fileData: { slug: "index" },
} as unknown as QuartzComponentProps

describe("R02 persistent reading tools", () => {
  test("renders a named desktop group with visible state and one reset action", () => {
    const ReadingTools = ReadingToolsConstructor()
    const html = render(<ReadingTools {...props} />)
    assert.match(html, /<section class="reading-tools reading-tools-sidebar"/)
    assert.match(html, /<h2 id="reading-tools-sidebar-title">阅读设置<\/h2>/)
    assert.match(html, /class="reading-tool darkmode"[^>]*aria-pressed="false"/)
    assert.match(html, />外观<\/span>/)
    assert.match(html, />浅色<\/span>/)
    assert.match(html, /role="group" aria-label="字号"/)
    assert.match(html, /<output[^>]*>100%<\/output>/)
    assert.match(html, /class="fontsize-btn zoom-reset"[^>]*disabled/)
    assert.match(html, /class="reading-tool readermode"[^>]*aria-pressed="false"/)
    assert.strictEqual(html.match(/>恢复默认<\/button>/g)?.length, 1)
  })

  test("uses named native dialogs and one integrated mobile toolbar", () => {
    const MobileReadingTools = MobileReadingToolsConstructor()
    const html = render(<MobileReadingTools {...props} />)
    assert.match(html, /aria-haspopup="dialog"/)
    assert.match(html, /aria-expanded="false"/)
    assert.match(html, /<nav class="mobile-article-toolbar" aria-label="移动文章工具">/)
    assert.match(html, /aria-controls="mobile-knowledge-dialog"/)
    assert.match(html, /aria-controls="mobile-reading-tools-dialog"/)
    assert.match(html, /<dialog id="mobile-knowledge-dialog"/)
    assert.match(html, /<dialog id="mobile-reading-tools-dialog"/)
    assert.match(html, /<h2 id="mobile-knowledge-title">知识目录<\/h2>/)
    assert.match(html, /aria-labelledby="reading-tools-sheet-title"/)
    assert.match(html, /aria-label="关闭阅读设置"/)
  })

  test("keeps legacy preference keys while supporting reset and accessible motion", () => {
    const theme = readFileSync(new URL("./scripts/darkmode.inline.ts", import.meta.url), "utf8")
    const font = readFileSync(new URL("./scripts/fontsize.inline.ts", import.meta.url), "utf8")
    const reader = readFileSync(new URL("./scripts/readermode.inline.ts", import.meta.url), "utf8")
    const tools = readFileSync(new URL("./scripts/readingtools.inline.ts", import.meta.url), "utf8")
    const mobileStyles = readFileSync(
      new URL("./styles/mobileReadingTools.scss", import.meta.url),
      "utf8",
    )
    const drawer = readFileSync(
      new URL("./scripts/mobileKnowledgeDrawer.inline.ts", import.meta.url),
      "utf8",
    )
    assert.match(theme, /localStorage\.getItem\("theme"\)/)
    assert.match(font, /SCALE_KEY = "content-scale"/)
    assert.match(reader, /localStorage\.getItem\("reader-mode"\)/)
    assert.match(tools, /showModal\(\)/)
    assert.match(tools, /opener\.focus\(\)/)
    assert.match(drawer, /dialog\.showModal\(\)/)
    assert.match(drawer, /closeButton\.focus\(\)/)
    assert.match(drawer, /trigger\.focus\(\)/)
    assert.match(tools, /readingpreferencesreset/)
    assert.match(tools, /readermodechange/)
    assert.match(mobileStyles, /env\(safe-area-inset-bottom\)/)
    assert.match(mobileStyles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
    assert.match(mobileStyles, /min-block-size: var\(--touch-target-min\)/)
    assert.match(mobileStyles, /prefers-reduced-motion: no-preference/)
    assert.doesNotMatch(font, /overflowX/)
  })
})
