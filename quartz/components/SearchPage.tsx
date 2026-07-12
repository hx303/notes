import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import {
  knowledgeMaturityLabels,
  knowledgeTopicLabels,
  knowledgeTypeLabels,
} from "../util/knowledgeMetadata"
import { FullSlug, resolveRelative } from "../util/path"
import style from "./styles/searchPage.scss"
// @ts-ignore
import script from "./scripts/searchPage.inline"

const SearchPage: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  const searchHref = resolveRelative(fileData.slug!, "search/index" as FullSlug)
  const topicsHref = resolveRelative(fileData.slug!, "topics/index" as FullSlug)
  const pathsHref = resolveRelative(fileData.slug!, "paths/index" as FullSlug)
  const growthHref = resolveRelative(fileData.slug!, "changes/index" as FullSlug)

  return (
    <div class="search-page" data-search-page data-search-href={searchHref}>
      <header class="search-page-intro">
        <p>FIND / 在公开知识中提问</p>
        <p>
          搜索标题、正文和标签，再用主题、类型与成熟度缩小范围。结果链接始终指向知识记录的永久地址。
        </p>
        <dl aria-label="搜索范围">
          <div>
            <dt>可搜索记录</dt>
            <dd data-search-corpus-count>读取中</dd>
          </div>
          <div>
            <dt>检索字段</dt>
            <dd>标题 · 正文 · 标签</dd>
          </div>
        </dl>
      </header>

      <form class="search-page-form" action={searchHref} method="get" data-search-page-form>
        <label for="search-page-query">你想找什么？</label>
        <div class="search-page-input-row">
          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="m15.5 15.5 5 5" />
          </svg>
          <input
            id="search-page-query"
            type="search"
            name="q"
            autocomplete="off"
            placeholder="例如：极限为什么存在、量子、COMSOL、RCWA"
            aria-controls="search-page-results"
            aria-describedby="search-page-status"
          />
          <button type="button" class="search-page-query-clear" data-search-query-clear hidden>
            清除
          </button>
          <button type="submit">搜索</button>
        </div>
      </form>

      <section class="search-page-controls" aria-label="搜索筛选">
        <div class="search-page-filter-grid">
          <label>
            <span>主题</span>
            <select name="topic" form="search-page-filter-form" aria-controls="search-page-results">
              <option value="">全部主题</option>
              {Object.entries(knowledgeTopicLabels).map(([key, label]) => (
                <option value={key}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>类型</span>
            <select name="type" form="search-page-filter-form" aria-controls="search-page-results">
              <option value="">全部类型</option>
              {Object.entries(knowledgeTypeLabels).map(([key, label]) => (
                <option value={key}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>成熟度</span>
            <select
              name="maturity"
              form="search-page-filter-form"
              aria-controls="search-page-results"
            >
              <option value="">全部成熟度</option>
              {Object.entries(knowledgeMaturityLabels).map(([key, label]) => (
                <option value={key}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>排序</span>
            <select name="sort" form="search-page-filter-form" aria-controls="search-page-results">
              <option value="relevance">相关度</option>
              <option value="updated">最近修订</option>
              <option value="title">标题</option>
            </select>
          </label>
        </div>
        <form id="search-page-filter-form" class="search-page-filter-form" />
        <div class="search-active-filters" data-search-active-filters hidden>
          <p>当前筛选</p>
          <div data-search-filter-chips />
          <button type="button" data-search-clear-filters>
            清除全部筛选
          </button>
        </div>
      </section>

      <section class="search-page-results" aria-labelledby="search-page-results-title">
        <div class="search-page-results-heading">
          <div>
            <p>RESULTS / 检索结果</p>
            <h2 id="search-page-results-title" tabindex={-1}>
              等待搜索
            </h2>
          </div>
          <p id="search-page-status" role="status" aria-live="polite" aria-atomic="true" />
        </div>

        <div class="search-page-initial" data-search-page-initial>
          <p>从真实内容词开始</p>
          <ul>
            {["微积分", "量子", "COMSOL", "RCWA"].map((query) => (
              <li>
                <a href={`${searchHref}?q=${encodeURIComponent(query)}`}>{query}</a>
              </li>
            ))}
          </ul>
          <p>
            也可以不输入关键词，直接从
            <a class="internal" href={topicsHref}>
              七个主题
            </a>
            浏览。
          </p>
          <div class="search-next-steps" aria-label="下一步阅读">
            <p>找到了入口，接下来可以：</p>
            <a class="internal" href={pathsHref}>沿学习路径继续</a>
            <a class="internal" href={growthHref}>查看最近生长</a>
          </div>
        </div>

        <div class="search-page-loading" data-search-page-loading hidden aria-hidden="true">
          {[0, 1, 2].map(() => (
            <div>
              <span />
              <span />
              <span />
            </div>
          ))}
        </div>
        <ol id="search-page-results" class="search-page-result-list" data-search-page-results />
        <div class="search-page-empty" data-search-page-empty hidden>
          <strong data-search-empty-title>没有找到结果</strong>
          <p>试试更短的关键词、课程名称、英文缩写，或先清除筛选条件。</p>
          <div>
            <button type="button" data-search-clear-filters>
              清除筛选
            </button>
            <a class="internal" href={topicsHref}>
              浏览七个主题
            </a>
            <a class="internal" href={pathsHref}>沿学习路径继续</a>
          </div>
        </div>
        <div class="search-page-error" data-search-page-error hidden>
          <strong>搜索索引暂时无法载入</strong>
          <p>你的查询仍保留在地址栏中，可以重试或从主题目录继续浏览。</p>
          <button type="button" data-search-retry>
            重试载入
          </button>
        </div>
      </section>
    </div>
  )
}

SearchPage.css = style
SearchPage.afterDOMLoaded = script

export default (() => SearchPage) satisfies QuartzComponentConstructor
