import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import style from "./styles/search.scss"
// @ts-ignore
import script from "./scripts/search.inline"
import { classNames } from "../util/lang"
import { FullSlug, resolveRelative } from "../util/path"

export interface SearchOptions {
  enablePreview: boolean
}

const defaultOptions: SearchOptions = {
  enablePreview: true,
}

export default ((userOpts?: Partial<SearchOptions>) => {
  const Search: QuartzComponent = ({ displayClass, fileData }: QuartzComponentProps) => {
    const opts = { ...defaultOptions, ...userOpts }
    const searchPageHref = resolveRelative(fileData.slug!, "search/index" as FullSlug)
    return (
      <div class={classNames(displayClass, "search")}>
        <button
          class="search-button"
          type="button"
          aria-haspopup="dialog"
          aria-controls="site-search-dialog"
          aria-expanded="false"
        >
          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
            <g class="search-path" fill="none">
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="m15.5 15.5 5 5" />
            </g>
          </svg>
          <span>搜索</span>
          <kbd aria-hidden="true">Ctrl K</kbd>
        </button>
        <dialog
          id="site-search-dialog"
          class="search-container"
          aria-labelledby="site-search-title"
        >
          <div class="search-space" role="document">
            <header class="search-dialog-header">
              <div>
                <p>FIND / 256 条公开知识记录</p>
                <h2 id="site-search-title">搜索知识库</h2>
              </div>
              <button class="search-close" type="button" aria-label="关闭搜索">
                <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            </header>
            <form class="search-form" action={searchPageHref} method="get">
              <label for="site-search-input">搜索标题、正文或标签</label>
              <div class="search-input-row">
                <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
                  <circle cx="10.5" cy="10.5" r="6.5" />
                  <path d="m15.5 15.5 5 5" />
                </svg>
                <input
                  id="site-search-input"
                  autocomplete="off"
                  class="search-bar"
                  name="q"
                  type="search"
                  placeholder="例如：微积分、量子、COMSOL 或 RCWA"
                  aria-describedby="site-search-guidance site-search-status"
                />
                <button class="search-clear" type="button" hidden>
                  清除
                </button>
                <button class="search-submit" type="submit">
                  查看全部
                </button>
              </div>
            </form>
            <div class="search-dialog-guidance" id="site-search-guidance">
              <span>输入至少 2 个字符获得建议</span>
              <span aria-hidden="true">↑↓ 选择 · Enter 打开 · Esc 关闭</span>
            </div>
            <p
              class="search-status"
              id="site-search-status"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            />
            <div class="search-layout" data-preview={opts.enablePreview}>
              <div class="search-initial-state">
                <p>可以从这些真实内容词开始</p>
                <ul>
                  {["微积分", "量子", "COMSOL", "RCWA"].map((query) => (
                    <li>
                      <button type="button" data-search-suggestion={query}>
                        {query}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <div class="results-container" role="list" aria-label="搜索建议" />
              <div class="search-error-state" hidden>
                <strong>暂时无法载入搜索索引</strong>
                <p>你仍可以打开完整搜索页重试，或从主题目录继续浏览。</p>
                <a class="internal" href={searchPageHref}>
                  打开完整搜索页
                </a>
              </div>
            </div>
          </div>
        </dialog>
      </div>
    )
  }

  Search.afterDOMLoaded = script
  Search.css = style

  return Search
}) satisfies QuartzComponentConstructor
