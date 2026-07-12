import assert from "node:assert"
import test from "node:test"
import { normalizeTag, normalizeTags, tagsMatch } from "./tagNormalization"

test("merges English and Chinese tag spellings", () => {
  assert.strictEqual(normalizeTag("machine-learning"), "机器学习")
  assert.strictEqual(normalizeTag("AI"), "人工智能")
  assert.ok(tagsMatch("physics", "物理"))
  assert.deepStrictEqual(normalizeTags(["AI", "人工智能", "ml"]), ["人工智能", "机器学习"])
})
