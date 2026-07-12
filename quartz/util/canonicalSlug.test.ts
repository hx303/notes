import assert from "node:assert"
import test, { describe } from "node:test"
import {
  collectSlugs,
  createCanonicalSlugMap,
  normalizeCanonicalSlug,
  resolveCanonicalSlug,
} from "./canonicalSlug"
import { FilePath, FullSlug } from "./path"

describe("canonical slugs", () => {
  test("accepts the stable note URL format", () => {
    assert.strictEqual(normalizeCanonicalSlug("/notes/rcwa-from-zero/"), "notes/rcwa-from-zero")
    assert.strictEqual(normalizeCanonicalSlug(undefined), undefined)
  })

  test("rejects volatile or ambiguous URL formats", () => {
    assert.throws(() => normalizeCanonicalSlug("科研项目/RCWA 指南"), /Invalid canonicalSlug/)
    assert.throws(() => normalizeCanonicalSlug("notes/RCWA_From_Zero"), /Invalid canonicalSlug/)
    assert.throws(() => normalizeCanonicalSlug(42), /must be a string/)
  })

  test("maps a physical content path to its canonical URL", () => {
    const sourcePath = "科研项目/RCWA从零开始学习指南.md" as FilePath
    const mappings = createCanonicalSlugMap([
      { filePath: sourcePath, canonicalSlug: "notes/rcwa-from-zero" },
    ])

    assert.strictEqual(
      resolveCanonicalSlug("科研项目/RCWA从零开始学习指南" as FullSlug, mappings),
      "notes/rcwa-from-zero",
    )
    assert.deepStrictEqual(collectSlugs([sourcePath], mappings), [
      "科研项目/RCWA从零开始学习指南",
      "notes/rcwa-from-zero",
    ])
  })

  test("fails fast when two files claim the same canonical URL", () => {
    assert.throws(
      () =>
        createCanonicalSlugMap([
          {
            filePath: "one.md" as FilePath,
            canonicalSlug: "notes/shared-canonical",
          },
          {
            filePath: "two.md" as FilePath,
            canonicalSlug: "notes/shared-canonical",
          },
        ]),
      /collision/,
    )
  })

  test("does not allow a canonical URL to shadow another physical page", () => {
    assert.throws(
      () =>
        createCanonicalSlugMap([
          {
            filePath: "old.md" as FilePath,
            canonicalSlug: "notes/already-there",
          },
          { filePath: "notes/already-there.md" as FilePath },
        ]),
      /physical URL/,
    )
  })
})
