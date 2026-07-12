import assert from "node:assert"
import test, { describe } from "node:test"
import { render } from "preact-render-to-string"
import type { QuartzPluginData } from "../plugins/vfile"
import { findPathMemberships } from "../util/knowledgeRelations"
import type { FullSlug } from "../util/path"
import LearningPathConstructor from "./LearningPath"
import RelatedKnowledgeConstructor from "./RelatedKnowledge"
import type { QuartzComponentProps } from "./types"

const file = (
  slug: string,
  title: string,
  extra: Partial<QuartzPluginData> = {},
): QuartzPluginData =>
  ({ slug: slug as FullSlug, frontmatter: { title }, links: [], ...extra }) as QuartzPluginData

const pathDefinition = {
  id: "physics-to-optical-modeling",
  status: "published",
  maintenance: "maintained",
  lastReviewed: "2026-07-11",
  audience: ["光学初学者"],
  outcome: "能解释 TMM 与 RCWA 的边界。",
  estimatedTime: "8–12 小时",
  prerequisites: [{ label: "微积分", slug: "notes/calculus", note: "理解导数。" }],
  steps: [
    {
      id: "field",
      slug: "notes/field",
      purpose: "建立电磁场语言。",
      outcome: "说明场的联系。",
      duration: "60 分钟",
    },
    {
      id: "rcwa",
      slug: "notes/rcwa",
      purpose: "理解 RCWA。",
      outcome: "说明适用尺度。",
      duration: "90 分钟",
    },
  ],
  branches: [
    {
      afterStep: "field",
      slug: "notes/comsol",
      label: "可选分支：COMSOL",
      reason: "用有限元视角对照。",
      duration: "45 分钟",
    },
  ],
}

const path = file("paths/physics-to-optical-modeling/index", "从物理到光学建模", {
  frontmatter: { title: "从物理到光学建模", learningPath: pathDefinition },
})
const calculus = file("notes/calculus", "微积分")
const field = file("notes/field", "电磁场", {
  knowledgeMetadata: {
    primaryTopic: "physics-optics",
    type: "course-note",
    maturity: "stable",
    isStructured: true,
    related: [],
  } as never,
})
const rcwa = file("notes/rcwa", "RCWA 指南", {
  knowledgeMetadata: {
    primaryTopic: "computing-simulation",
    type: "project-guide",
    maturity: "growing",
    isStructured: true,
    related: [],
  } as never,
})
const comsol = file("notes/comsol", "COMSOL 流程")
const allFiles = [path, calculus, field, rcwa, comsol]
const props = (fileData: QuartzPluginData) =>
  ({ fileData, allFiles, cfg: { locale: "zh-CN" } }) as unknown as QuartzComponentProps

describe("D05 end-to-end learning path", () => {
  test("renders orientation, ordered outcomes and an optional branch", () => {
    const LearningPath = LearningPathConstructor()
    const html = render(<LearningPath {...props(path)} />)

    assert.match(html, /data-learning-path="physics-to-optical-modeling"/)
    assert.match(html, /已发布/)
    assert.match(html, /持续维护/)
    assert.match(html, /光学初学者/)
    assert.match(html, /href="\.\.\/\.\.\/notes\/calculus"/)
    assert.match(html, /第 1 步/)
    assert.match(html, /第 2 步/)
    assert.match(html, /完成这一站后/)
    assert.match(html, /可选分支：COMSOL/)
    assert.doesNotMatch(html, /记录尚未公开/)
  })

  test("derives core and optional memberships from frontmatter", () => {
    const core = findPathMemberships(field, allFiles)
    const optional = findPathMemberships(comsol, allFiles)
    assert.deepStrictEqual(
      core.map(({ position, total, kind }) => ({ position, total, kind })),
      [{ position: 1, total: 2, kind: "core" }],
    )
    assert.deepStrictEqual(
      optional.map(({ position, total, kind }) => ({ position, total, kind })),
      [{ position: 1, total: 2, kind: "optional" }],
    )
  })

  test("shows core position and optional status inside structured and legacy article context", () => {
    const Related = RelatedKnowledgeConstructor()
    const coreHtml = render(<Related {...props(field)} />)
    const branchHtml = render(<Related {...props(comsol)} />)
    assert.match(coreHtml, /从物理到光学建模/)
    assert.match(coreHtml, /第 1 个节点 · 共 2 个/)
    assert.match(branchHtml, /可选分支/)
  })
})
