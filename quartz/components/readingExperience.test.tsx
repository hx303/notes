import assert from "node:assert"
import { readFileSync } from "node:fs"
import test, { describe } from "node:test"
import { render } from "preact-render-to-string"
import TableOfContentsConstructor from "./TableOfContents"
import type { QuartzComponentProps } from "./types"

function tocProps(): QuartzComponentProps {
  return {
    cfg: { locale: "zh-CN" },
    fileData: {
      toc: [
        { depth: 0, text: "光，到底是什么？", slug: "光到底是什么" },
        { depth: 1, text: "两种描述方式", slug: "两种描述方式" },
        { depth: 0, text: "电磁波谱", slug: "电磁波谱" },
      ],
      collapseToc: false,
    },
  } as unknown as QuartzComponentProps
}

describe("R01 table of contents", () => {
  test("renders a labeled desktop directory with current-section feedback", () => {
    const TableOfContents = TableOfContentsConstructor()
    const html = render(<TableOfContents {...tocProps()} displayClass="desktop-only" />)

    assert.match(html, /<div class="toc toc-sidebar desktop-only">/)
    assert.match(html, /<button type="button" class="toc-header"/)
    assert.match(html, /aria-expanded="true"/)
    assert.match(html, /<span class="toc-title">目录<\/span>/)
    assert.match(html, /data-toc-current(?:="true")?[^>]*>当前：光，到底是什么？/)
    assert.strictEqual(html.match(/data-for=/g)?.length, 3)
  })

  test("uses a closed native disclosure for the mobile directory", () => {
    const InlineTableOfContents = TableOfContentsConstructor({ display: "inline" })
    const html = render(<InlineTableOfContents {...tocProps()} />)

    assert.match(html, /<details class="toc toc-inline">/)
    assert.doesNotMatch(html, /<details[^>]* open/)
    assert.match(html, /<summary>/)
    assert.match(html, /<span class="toc-title">本文目录<\/span>/)
    assert.match(html, /aria-hidden="true" focusable="false"/)
  })

  test("uses explicit active state instead of low-opacity directory text", () => {
    const styles = readFileSync(new URL("./styles/toc.scss", import.meta.url), "utf8")
    const script = readFileSync(new URL("./scripts/toc.inline.ts", import.meta.url), "utf8")

    assert.doesNotMatch(styles, /opacity:\s*0\.35/)
    assert.match(styles, /\[aria-current="location"\]/)
    assert.match(script, /setAttribute\("aria-current", "location"\)/)
    assert.match(script, /requestAnimationFrame/)
  })
})
