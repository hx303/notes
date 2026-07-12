import assert from "node:assert"
import test, { describe } from "node:test"
import { readLearningPathDefinition } from "./learningPath"

describe("D05 learning path schema", () => {
  test("normalizes requirements, core steps and optional branches", () => {
    const path = readLearningPathDefinition({
      id: "optics",
      status: "published",
      maintenance: "maintained",
      audience: ["初学者"],
      outcome: "解释光学模型边界",
      prerequisites: [{ label: "微积分", slug: "notes/calculus" }],
      steps: [
        {
          id: "field",
          slug: "notes/field",
          purpose: "建立场的语言",
          outcome: "解释电磁场",
        },
      ],
      branches: [
        {
          afterStep: "field",
          slug: "notes/comsol",
          label: "有限元分支",
          reason: "比较建模方法",
        },
      ],
    })!

    assert.strictEqual(path.status, "published")
    assert.strictEqual(path.maintenance, "maintained")
    assert.strictEqual(path.steps.length, 1)
    assert.strictEqual(path.branches[0].afterStep, "field")
    assert.strictEqual(path.prerequisites[0].slug, "notes/calculus")
  })

  test("fails closed without identity, outcome or a usable step", () => {
    assert.strictEqual(readLearningPathDefinition({ id: "empty", outcome: "目标" }), undefined)
    assert.strictEqual(readLearningPathDefinition({ steps: [{ slug: "notes/a" }] }), undefined)
  })

  test("uses honest defaults for unknown states", () => {
    const path = readLearningPathDefinition({
      id: "draft",
      status: "unknown",
      maintenance: "unknown",
      outcome: "目标",
      steps: [{ slug: "notes/a" }],
    })!
    assert.strictEqual(path.status, "draft")
    assert.strictEqual(path.maintenance, "review-needed")
  })
})
