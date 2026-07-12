import assert from "node:assert"
import { readFileSync } from "node:fs"
import test, { describe } from "node:test"
import { render } from "preact-render-to-string"
import type { QuartzPluginData } from "../plugins/vfile"
import SearchConstructor from "./Search"
import SearchPageConstructor from "./SearchPage"
import type { QuartzComponentProps } from "./types"

const props = (slug: string) =>
  ({
    fileData: {
      slug,
      frontmatter: { title: "搜索知识库", tags: [] },
    } as unknown as QuartzPluginData,
    cfg: { locale: "zh-CN" },
  }) as QuartzComponentProps

describe("D04 complete search flow", () => {
  test("renders a labeled dialog trigger, concrete query guidance and recovery states", () => {
    const Search = SearchConstructor()
    const html = render(<Search {...props("index")} />)

    assert.match(html, /aria-haspopup="dialog"/)
    assert.match(html, />搜索</)
    assert.match(html, /placeholder="例如：微积分、量子、COMSOL 或 RCWA"/)
    assert.match(html, /class="search-clear"/)
    assert.match(html, /class="search-error-state"/)
    assert.match(html, /role="status" aria-live="polite"/)
  })

  test("renders the shareable result page filters, loading, empty and error regions", () => {
    const SearchPage = SearchPageConstructor()
    const html = render(<SearchPage {...props("search/index")} />)

    assert.match(html, /data-search-page="true"/)
    assert.match(html, /name="q"/)
    assert.match(html, /name="topic"/)
    assert.match(html, /name="type"/)
    assert.match(html, /name="maturity"/)
    assert.match(html, /name="sort"/)
    assert.match(html, /data-search-page-loading/)
    assert.match(html, /data-search-page-empty/)
    assert.match(html, /data-search-page-error/)
  })

  test("covers keyboard dismissal, focus return and deep-link restoration", () => {
    const dialogScript = readFileSync(
      new URL("./scripts/search.inline.ts", import.meta.url),
      "utf8",
    )
    const pageScript = readFileSync(
      new URL("./scripts/searchPage.inline.ts", import.meta.url),
      "utf8",
    )

    assert.match(dialogScript, /addEventListener\("cancel"/)
    assert.match(dialogScript, /trigger\.focus\(\)/)
    assert.match(dialogScript, /event\.key === "ArrowDown"/)
    assert.match(pageScript, /history\.pushState/)
    assert.match(pageScript, /addEventListener\("popstate"/)
    assert.match(pageScript, /readUrl\(\)/)
  })
})
