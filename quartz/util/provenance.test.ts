import assert from "node:assert"
import test, { describe } from "node:test"
import type { QuartzPluginData } from "../plugins/vfile"
import type { FullSlug } from "./path"
import {
  buildRevisionEvents,
  buildSuggestedCitation,
  canonicalPageUrl,
  safeSourceHref,
} from "./provenance"

describe("provenance helpers", () => {
  test("builds stable canonical URLs and suggested citations", () => {
    const url = canonicalPageUrl("wouldkeep.com", "notes/rcwa-from-zero" as FullSlug)
    assert.strictEqual(url, "https://wouldkeep.com/notes/rcwa-from-zero")
    assert.strictEqual(
      buildSuggestedCitation({
        title: "RCWA 与 TMM 光学建模",
        date: new Date("2026-07-07T00:00:00"),
        url,
      }),
      "夔嵬.《RCWA 与 TMM 光学建模》. wouldkeep，2026-07-07. https://wouldkeep.com/notes/rcwa-from-zero",
    )
  })

  test("creates a concise chronology and collapses same-day churn", () => {
    const fileData = {
      knowledgeMetadata: { created: "2026-07-01", updated: "2026-07-07" },
    } as QuartzPluginData
    assert.deepStrictEqual(
      buildRevisionEvents(fileData).map(({ kind }) => kind),
      ["created", "updated"],
    )
    fileData.knowledgeMetadata!.updated = "2026-07-01"
    assert.deepStrictEqual(
      buildRevisionEvents(fileData).map(({ kind }) => kind),
      ["created"],
    )
  })

  test("only exposes safe HTTP or DOI source destinations", () => {
    assert.strictEqual(
      safeSourceHref({ doi: "10.1000/example" }),
      "https://doi.org/10.1000/example",
    )
    assert.strictEqual(
      safeSourceHref({ url: "https://example.com/paper" }),
      "https://example.com/paper",
    )
    assert.strictEqual(safeSourceHref({ url: "javascript:alert(1)" }), undefined)
    assert.strictEqual(safeSourceHref({ url: "not a url" }), undefined)
  })
})
