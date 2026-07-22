import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const layout = readFileSync(new URL("../../quartz.layout.ts", import.meta.url), "utf8")

test("the discovery home owns its heading and does not render the legacy list-page title", () => {
  const contentLayout = layout.match(
    /export const defaultContentPageLayout:[\s\S]*?(?=\nconst outsideAccountSurface)/,
  )?.[0]
  assert.ok(contentLayout)
  assert.match(
    contentLayout,
    /component: Component\.ArticleTitle\(\),\s*condition: \(page\) => page\.fileData\.slug !== "index"/,
  )
  assert.match(
    contentLayout,
    /component: Component\.ContentMeta\(\),\s*condition: \(page\) => page\.fileData\.slug !== "index"/,
  )

  const listLayout = layout.match(/export const defaultListPageLayout:[\s\S]*$/)?.[0]
  assert.ok(listLayout)
  assert.match(
    layout,
    /const showListPageHeading = \(slug = ""\) => outsideAccountSurface\(slug\) && slug !== "index"/,
  )
  assert.match(
    listLayout,
    /component: Component\.ArticleTitle\(\),\s*condition: \(page\) => showListPageHeading\(page\.fileData\.slug\)/,
  )
  assert.match(
    listLayout,
    /component: Component\.ContentMeta\(\),\s*condition: \(page\) => showListPageHeading\(page\.fileData\.slug\)/,
  )
})
