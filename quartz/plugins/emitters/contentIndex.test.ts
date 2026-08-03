import assert from "node:assert"
import test from "node:test"
import type { KnowledgeMetadata } from "../../util/knowledgeMetadata"
import type { FilePath, FullSlug } from "../../util/path"
import {
  publicDiscoveryContentIndex,
  type ContentDetails,
  type ContentIndexMap,
} from "./contentIndex"

function details(slug: string, title: string, publish?: boolean): ContentDetails {
  const knowledgeMetadata =
    publish === undefined
      ? undefined
      : ({ publish } as Pick<KnowledgeMetadata, "publish"> as KnowledgeMetadata)
  return {
    slug: slug as FullSlug,
    filePath: (slug + ".md") as FilePath,
    title,
    links: [],
    tags: [],
    content: title,
    knowledgeMetadata,
  }
}

test("RSS index contains knowledge records only", () => {
  const input: ContentIndexMap = new Map([
    ["legacy/note" as FullSlug, details("legacy/note", "旧公开知识")],
    ["notes/private" as FullSlug, details("notes/private", "私密记录", false)],
    ["workspace/index" as FullSlug, details("workspace/index", "我的空间")],
    ["changes/index" as FullSlug, details("changes/index", "最近生长")],
  ])

  assert.deepStrictEqual([...publicDiscoveryContentIndex(input).keys()], ["legacy/note"])
})
