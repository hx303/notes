import assert from "node:assert"
import test, { describe } from "node:test"
import { FilePath, slugifyFilePath } from "./path"
import { isPublicDiscoveryRecord, publicDiscoveryEntries } from "./publicDiscovery"

describe("public discovery record boundary", () => {
  test("keeps legacy public knowledge without requiring structured metadata", () => {
    assert.strictEqual(
      isPublicDiscoveryRecord({
        slug: "课堂笔记/线性代数",
        frontmatter: { title: "线性代数" },
      }),
      true,
    )
  })

  test("excludes the root page and every system route family", () => {
    const systemRoots = [
      "account",
      "admin",
      "about",
      "build",
      "capture",
      "changes",
      "knowledge",
      "license",
      "map",
      "paths",
      "privacy",
      "search",
      "tags",
      "topics",
      "workspace",
      slugifyFilePath("⚙️ 管理/管理面板.md" as FilePath).split("/", 1)[0],
    ]

    assert.strictEqual(isPublicDiscoveryRecord({ slug: "index", title: "首页" }), false)
    assert.strictEqual(isPublicDiscoveryRecord({ slug: "404", title: "未找到" }), false)
    for (const root of systemRoots) {
      assert.strictEqual(
        isPublicDiscoveryRecord({ slug: root + "/index", title: root }),
        false,
        root,
      )
    }
  })

  test("excludes explicit private flags and untitled files", () => {
    assert.strictEqual(
      isPublicDiscoveryRecord({ slug: "notes/private", title: "私密", publish: false }),
      false,
    )
    assert.strictEqual(
      isPublicDiscoveryRecord({
        slug: "notes/private-frontmatter",
        frontmatter: { title: "私密", publish: false },
      }),
      false,
    )
    assert.strictEqual(
      isPublicDiscoveryRecord({
        slug: "notes/private",
        title: "私密",
        knowledgeMetadata: { publish: false },
      }),
      false,
    )
    assert.strictEqual(isPublicDiscoveryRecord({ slug: "notes/untitled" }), false)
    assert.strictEqual(isPublicDiscoveryRecord({ slug: "notes/blank", title: "  " }), false)
  })

  test("filters keyed client indexes with the same public boundary", () => {
    const records = {
      "notes/public": { title: "公开记录" },
      "notes/private": { title: "私密记录", knowledgeMetadata: { publish: false } },
      "workspace/index": { title: "个人工作区" },
      [slugifyFilePath("⚙️ 管理/管理面板.md" as FilePath)]: { title: "旧管理面板" },
    }

    assert.deepStrictEqual(
      publicDiscoveryEntries(records).map(([slug]) => slug),
      ["notes/public"],
    )
  })
})
