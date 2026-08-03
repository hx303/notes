// @ts-ignore
import script from "./scripts/supabase-comments.inline"
import { classNames } from "../util/lang"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import style from "./styles/participation.scss"

type Options = {
  supabaseUrl: string
  supabaseAnonKey: string
}

export default ((opts: Options) => {
  const SupabaseComments: QuartzComponent = ({ displayClass, fileData }: QuartzComponentProps) => {
    const commentsDisabled =
      typeof fileData.frontmatter?.comments !== "undefined" &&
      (!fileData.frontmatter?.comments || fileData.frontmatter?.comments === "false")
    if (commentsDisabled) return null

    const filePath = fileData.filePath ?? ""
    const commentKey = fileData.commentKey ?? filePath

    return (
      <section
        class={classNames(displayClass, "supabase-comments", "participation-section")}
        aria-labelledby="discussion-title"
        data-file-path={filePath}
        data-comment-key={commentKey}
        data-supabase-url={opts.supabaseUrl}
        data-supabase-anon-key={opts.supabaseAnonKey}
      >
        <header class="participation-heading">
          <p class="participation-eyebrow">DISCUSSION</p>
          <h2 id="discussion-title">讨论</h2>
          <p>围绕理解、方法与延伸展开交流；如果发现事实或引用问题，请使用上方的纠错入口。</p>
        </header>

        <div class="comments-region" data-comments-region aria-live="polite" aria-busy="true">
          <p class="comments-loading" data-comments-loading>
            正在载入讨论…
          </p>
          <div class="comments-list" data-comments-list></div>
        </div>

        <form class="participation-form" data-participation-form="discussion">
          <div class="participation-form-grid">
            <label>
              <span>讨论位置</span>
              <select name="section" data-section-select>
                <option value="整篇知识记录">整篇知识记录</option>
              </select>
            </label>
            <label class="participation-message-field">
              <span>你的想法</span>
              <textarea
                name="content"
                rows={4}
                minLength={2}
                maxLength={2000}
                required
                aria-describedby="discussion-hint discussion-status"
                placeholder="补充一种理解、提出问题，或分享可复用的经验。"
              ></textarea>
            </label>
          </div>
          <p id="discussion-hint" class="participation-hint">
            最多 2000 字。提交失败或离线时，草稿会保存在当前浏览器。
          </p>
          <div class="participation-form-actions">
            <button type="submit" class="participation-submit">
              提交讨论
            </button>
            <p class="participation-auth-note">
              <span data-auth-copy>提交需要登录。</span>
              <a href="/account/" data-auth-link>
                前往登录
              </a>
            </p>
          </div>
          <div
            id="discussion-status"
            class="participation-status"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <span data-status-message></span>
            <button type="button" data-retry-submit hidden>
              重试提交
            </button>
          </div>
        </form>
      </section>
    )
  }

  SupabaseComments.css = style
  SupabaseComments.afterDOMLoaded = script

  return SupabaseComments
}) satisfies QuartzComponentConstructor<Options>
