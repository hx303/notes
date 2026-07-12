import assert from "node:assert"
import test, { describe } from "node:test"
import type { Root } from "mdast"
import { VFile } from "vfile"
import type { GlobalConfiguration } from "../../cfg"
import type { BuildCtx } from "../../util/ctx"
import type { FilePath, FullSlug } from "../../util/path"
import { FrontMatter } from "./frontmatter"

const cfg = {
  pageTitle: "wouldkeep",
  enableSPA: true,
  enablePopovers: true,
  analytics: null,
  ignorePatterns: [],
  defaultDateType: "created",
  locale: "zh-CN",
  theme: {},
} as unknown as GlobalConfiguration

describe("canonical frontmatter aliases", () => {
  test("moves a record to its canonical slug while preserving old and declared URLs", () => {
    const sourceSlug = "科研项目/RCWA从零开始学习指南" as FullSlug
    const canonicalSlug = "notes/rcwa-from-zero" as FullSlug
    const ctx = {
      cfg: { configuration: cfg, plugins: { transformers: [], filters: [], emitters: [] } },
      allSlugs: [sourceSlug],
      allFiles: ["科研项目/RCWA从零开始学习指南.md" as FilePath],
      canonicalSlugMap: { [sourceSlug]: canonicalSlug },
    } as unknown as BuildCtx
    const file = new VFile({
      path: "content/科研项目/RCWA从零开始学习指南.md",
      value: `---
title: RCWA 从零开始学习指南
aliases:
  - 旧版/RCWA指南
  - 科研项目/RCWA从零开始学习指南
summary: 从物理直觉到可复现实验。
primaryTopic: computing-simulation
topics: [physics-optics]
type: project-guide
maturity: growing
updated: 2026-07-10
license: CC BY-NC-SA 4.0
publish: true
---
正文
`,
    })
    file.data.slug = sourceSlug
    file.data.filePath = "科研项目/RCWA从零开始学习指南.md" as FilePath

    const plugins = FrontMatter().markdownPlugins!(ctx)
    const transformerFactory = plugins.at(-1) as () => (tree: Root, file: VFile) => undefined
    transformerFactory()({ type: "root", children: [] }, file)

    assert.strictEqual(file.data.sourceSlug, sourceSlug)
    assert.strictEqual(file.data.slug, canonicalSlug)
    assert.strictEqual(file.data.frontmatter!.canonicalSlug, canonicalSlug)
    assert.deepStrictEqual(file.data.aliases!.sort(), [sourceSlug, "旧版/RCWA指南"].sort())
    assert.strictEqual(file.data.aliases!.filter((slug) => slug === sourceSlug).length, 1)
    assert(ctx.allSlugs.includes(sourceSlug))
    assert(ctx.allSlugs.includes("旧版/RCWA指南" as FullSlug))
  })
})
