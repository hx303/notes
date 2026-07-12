import assert from "node:assert"
import { readFileSync } from "node:fs"
import test, { describe } from "node:test"
import { render } from "preact-render-to-string"
import type { QuartzComponentProps } from "./types"
import MobileReadingToolsConstructor from "./MobileReadingTools"

const props = {
  cfg: { locale: "zh-CN" },
  fileData: { slug: "notes/rcwa-from-zero" },
} as unknown as QuartzComponentProps

describe("R06 mobile article integration", () => {
  test("renders directory and reading entry points as one named toolbar", () => {
    const MobileTools = MobileReadingToolsConstructor()
    const html = render(<MobileTools {...props} />)

    assert.match(html, /aria-label="移动文章工具"/)
    assert.strictEqual(html.match(/aria-haspopup="dialog"/g)?.length, 2)
    assert.match(html, /class="mobile-knowledge-trigger"[\s\S]*?aria-expanded="false"/)
    assert.match(html, /class="mobile-reading-tools-trigger"[\s\S]*?aria-expanded="false"/)
    assert.match(html, /aria-labelledby="mobile-knowledge-title"/)
    assert.match(html, /aria-labelledby="reading-tools-sheet-title"/)
    assert.match(html, /data-variant="embedded"/)
    assert.match(html, /aria-label="关闭知识目录"/)
    assert.match(html, /aria-label="关闭阅读设置"/)
  })

  test("uses modal focus boundaries, focus restoration and SPA-safe cleanup", () => {
    const drawer = readFileSync(
      new URL("./scripts/mobileKnowledgeDrawer.inline.ts", import.meta.url),
      "utf8",
    )
    const reading = readFileSync(
      new URL("./scripts/readingtools.inline.ts", import.meta.url),
      "utf8",
    )

    assert.match(drawer, /showModal\(\)/)
    assert.match(drawer, /closeButton\.focus\(\)/)
    assert.match(drawer, /trigger\.focus\(\)/)
    assert.match(drawer, /document\.addEventListener\("prenav"/)
    assert.match(drawer, /window\.addCleanup/)
    assert.match(reading, /close\?\.focus\(\)/)
    assert.match(reading, /opener\.focus\(\)/)
  })

  test("enforces one-column mobile layout, safe areas and 44px controls", () => {
    const styles = readFileSync(
      new URL("./styles/mobileReadingTools.scss", import.meta.url),
      "utf8",
    )
    const explorer = readFileSync(new URL("./scripts/explorer.inline.ts", import.meta.url), "utf8")
    const explorerStyles = readFileSync(new URL("./styles/explorer.scss", import.meta.url), "utf8")
    const layout = readFileSync(new URL("../../quartz.layout.ts", import.meta.url), "utf8")

    assert.match(styles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
    assert.match(styles, /flex-direction: column/)
    assert.match(styles, /min-block-size: var\(--touch-target-min\)/)
    assert.match(styles, /env\(safe-area-inset-top\)/)
    assert.match(styles, /env\(safe-area-inset-bottom\)/)
    assert.match(styles, /inline-size: min\(24rem, 100vw\)/)
    assert.match(styles, /prefers-reduced-motion: no-preference/)
    assert.match(explorer, /querySelectorAll<HTMLElement>\("\.explorer"\)/)
    assert.match(explorer, /aria-current/)
    assert.doesNotMatch(explorerStyles, /translateX\(100dvw\)/)
    assert.match(layout, /DesktopOnly\(\s*Component\.Explorer/)
  })
})
