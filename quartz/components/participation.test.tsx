import assert from "node:assert"
import { readFileSync } from "node:fs"
import test, { describe } from "node:test"
import { render } from "preact-render-to-string"
import type { QuartzPluginData } from "../plugins/vfile"
import CorrectionActionConstructor from "./CorrectionAction"
import SupabaseCommentsConstructor from "./SupabaseComments"
import type { QuartzComponentProps } from "./types"

const record = (frontmatter: Record<string, unknown> = {}) =>
  ({
    filePath: "content/科研项目/RCWA从零开始学习指南.md",
    commentKey: "content/科研项目/RCWA从零开始学习指南.md",
    frontmatter,
  }) as QuartzPluginData

const props = (fileData: QuartzPluginData) => ({ fileData }) as QuartzComponentProps

describe("R05 correction and discussion participation", () => {
  test("renders correction as a separate structured native disclosure and form", () => {
    const CorrectionAction = CorrectionActionConstructor()
    const html = render(<CorrectionAction {...props(record())} />)

    assert.match(html, /<details class="correction-disclosure">/)
    assert.match(html, /data-participation-form="correction"/)
    assert.match(html, /name="correction-type"/)
    assert.match(html, /name="location"/)
    assert.match(html, /role="status" aria-live="polite" aria-atomic="true"/)
    assert.match(html, /提交失败或离线时，草稿会保存在当前浏览器/)
    assert.match(html, /href="\/account\/" data-auth-link/)
  })

  test("renders visible loading, empty-capable discussion region and accessible form feedback", () => {
    const Comments = SupabaseCommentsConstructor({
      supabaseUrl: "https://example.supabase.co",
      supabaseAnonKey: "public-key",
    })
    const html = render(<Comments {...props(record())} />)

    assert.match(html, /aria-labelledby="discussion-title"/)
    assert.match(html, /data-comments-region="true" aria-live="polite" aria-busy="true"/)
    assert.match(html, /正在载入讨论/)
    assert.match(html, /data-participation-form="discussion"/)
    assert.match(html, /data-retry-submit/)
    assert.match(html, /href="\/account\/" data-auth-link/)
    assert.match(html, /data-comment-key="content\/[^"]+\.md"/)
  })

  test("honors the existing comments opt-out for both participation surfaces", () => {
    const CorrectionAction = CorrectionActionConstructor()
    const Comments = SupabaseCommentsConstructor({
      supabaseUrl: "url",
      supabaseAnonKey: "key",
    })

    assert.strictEqual(render(<CorrectionAction {...props(record({ comments: false }))} />), "")
    assert.strictEqual(render(<Comments {...props(record({ comments: "false" }))} />), "")
  })

  test("covers draft retention, retry, offline, rate-limit and submission states", () => {
    const script = readFileSync(
      new URL("./scripts/supabase-comments.inline.ts", import.meta.url),
      "utf8",
    )
    const styles = readFileSync(new URL("./styles/participation.scss", import.meta.url), "utf8")

    assert.match(script, /localStorage\.setItem/)
    assert.match(script, /localStorage\.getItem/)
    assert.match(script, /navigator\.onLine/)
    assert.match(script, /status === 429/)
    assert.match(script, /提交中…/)
    assert.match(script, /草稿已保留/)
    assert.match(script, /data-comments-list/)
    assert.match(script, /还没有公开讨论/)
    assert.match(script, /纠错建议已提交/)
    assert.match(styles, /min-block-size: var\(--touch-target-min\)/)
    assert.match(styles, /prefers-reduced-motion/)
    assert.doesNotMatch(styles, /transition:\s*all/)
  })
})
