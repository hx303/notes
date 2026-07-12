import { getDate } from "./Date"
import { FilterBar, FilterOption } from "./FilterBar"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import {
  KnowledgeMaturity,
  KnowledgeType,
  knowledgeMaturityLabels,
  knowledgeTopicLabels,
  knowledgeTypeLabels,
} from "../util/knowledgeMetadata"
import { buildTopicPageData, getTopicDefinition } from "../util/topicIndex"
import { FullSlug, resolveRelative } from "../util/path"
import style from "./styles/topicPage.scss"
// @ts-ignore
import script from "./scripts/topicFilters.inline"

function countedOptions<T extends string>(values: T[]): FilterOption<T>[] {
  const counts = new Map<T, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "zh-CN"))
}

function anchorHref(subtopic: string): string {
  const params = new URLSearchParams({ subtopic })
  return `?${params.toString()}#knowledge-list`
}

const maturityRank: Record<KnowledgeMaturity, number> = {
  seed: 1,
  growing: 2,
  stable: 3,
}

const TopicPage: QuartzComponent = ({ allFiles, fileData, cfg }: QuartzComponentProps) => {
  const key = fileData.slug?.match(/^topics\/([^/]+)\/index$/)?.[1]
  const definition = key ? getTopicDefinition(key) : undefined
  if (!definition) return null

  const topic = buildTopicPageData(allFiles, definition.key)
  if (!topic) return null

  const pathHref = resolveRelative(fileData.slug!, "paths/index" as FullSlug)
  const topicIndexHref = resolveRelative(fileData.slug!, "topics/index" as FullSlug)
  const recommendedHref = topic.recommended?.slug
    ? resolveRelative(fileData.slug!, topic.recommended.slug)
    : undefined
  const subtopics = countedOptions(
    topic.records.map((record) => record.knowledgeMetadata?.subtopic ?? "综合"),
  )
  const types = countedOptions(
    topic.records.map((record) => record.knowledgeMetadata!.type),
  ) as FilterOption<KnowledgeType>[]
  const maturities = countedOptions(
    topic.records.map((record) => record.knowledgeMetadata!.maturity),
  ) as FilterOption<KnowledgeMaturity>[]

  return (
    <div class="topic-page" data-topic-page={topic.key}>
      <header class="topic-page-header">
        <a class="topic-page-back internal" href={topicIndexHref}>
          ← 七个知识领域
        </a>
        <p class="topic-page-kicker">KNOWLEDGE FIELD / {topic.key}</p>
        <div class="topic-page-heading">
          <div>
            <p class="topic-page-title" aria-hidden="true">
              {topic.label}
            </p>
            <p>{topic.scope}</p>
          </div>
          <dl aria-label={`${topic.label}概况`}>
            <div>
              <dt>主主题记录</dt>
              <dd>{topic.primaryCount}</dd>
            </div>
            <div>
              <dt>跨主题收录</dt>
              <dd>{topic.contextualCount}</dd>
            </div>
          </dl>
        </div>
      </header>

      <section class="topic-page-orientation" aria-label="主题导航">
        <div class="topic-recommended">
          <p class="topic-section-label">01 / 推荐起点</p>
          {recommendedHref && topic.recommended ? (
            <>
              <a class="internal" href={recommendedHref}>
                {topic.recommended.frontmatter?.title}
              </a>
              <p>
                {topic.recommended.knowledgeMetadata?.summary ??
                  `先从这篇记录建立${topic.label}的基本坐标，再按子主题继续展开。`}
              </p>
            </>
          ) : (
            <p>这个主题的起点仍在整理中。</p>
          )}
        </div>
        <div class="topic-path-direction">
          <p class="topic-section-label">02 / 路径方向</p>
          <strong>{topic.pathName}</strong>
          <p>把零散记录串成有先后关系的学习顺序，适合第一次进入这个领域。</p>
          <a class="internal" href={pathHref}>
            查看学习路径规划 →
          </a>
        </div>
      </section>

      <nav class="topic-subtopic-nav" aria-label={`${topic.label}子主题`}>
        <p class="topic-section-label">03 / 从子主题进入</p>
        <ul>
          {subtopics.map((subtopic) => (
            <li>
              <a href={anchorHref(subtopic.value)}>
                <span>{subtopic.label}</span>
                <span>{subtopic.count}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <section class="topic-relationship-preview" aria-labelledby="topic-relationships-title">
        <div>
          <p class="topic-section-label">04 / 关系预览</p>
          <h2 id="topic-relationships-title">这个领域并不孤立</h2>
          <p>跨主题收录只增加理解语境，不复制文章；每条记录仍保留唯一正文与永久链接。</p>
        </div>
        {topic.connections.length > 0 ? (
          <ul>
            {topic.connections.map((connection) => (
              <li>
                <a
                  class="internal"
                  href={resolveRelative(
                    fileData.slug!,
                    `topics/${connection.key}/index` as FullSlug,
                  )}
                >
                  <span>{connection.label}</span>
                  <span>{connection.count} 条连接</span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p class="topic-relationship-empty">跨领域连接将在知识记录建立关系后出现在这里。</p>
        )}
      </section>

      <section class="topic-knowledge" id="knowledge-list" aria-labelledby="topic-knowledge-title">
        <div class="topic-knowledge-heading">
          <div>
            <p class="topic-section-label">05 / 知识目录</p>
            <h2 id="topic-knowledge-title">浏览全部记录</h2>
          </div>
          <p class="topic-result-count" role="status" aria-live="polite" aria-atomic="true">
            显示 <strong data-topic-result-count>{topic.records.length}</strong> 条
          </p>
        </div>
        <FilterBar subtopics={subtopics} types={types} maturities={maturities} />
        <p class="topic-filter-summary" data-topic-filter-summary aria-live="polite" />
        <ol class="topic-record-list" data-topic-record-list>
          {topic.records.map((record) => {
            const metadata = record.knowledgeMetadata!
            const isContextual = metadata.primaryTopic !== topic.key
            const title = record.frontmatter?.title ?? "未命名知识记录"
            const updated =
              metadata.updated ??
              (record.dates ? getDate(cfg, record)?.toISOString().slice(0, 10) : undefined)
            return (
              <li
                data-topic-record
                data-canonical-slug={record.slug}
                data-subtopic={metadata.subtopic ?? "综合"}
                data-type={metadata.type}
                data-maturity={metadata.maturity}
                data-title={String(title).toLocaleLowerCase("zh-CN")}
                data-updated={updated ?? ""}
                data-maturity-rank={maturityRank[metadata.maturity]}
              >
                <div class="topic-record-index" aria-hidden="true" />
                <div class="topic-record-body">
                  <div class="topic-record-titleline">
                    <h3>
                      <a class="internal" href={resolveRelative(fileData.slug!, record.slug!)}>
                        {title}
                      </a>
                    </h3>
                    {isContextual && metadata.primaryTopic && (
                      <span class="topic-context-mark">
                        跨主题 · 主主题 {knowledgeTopicLabels[metadata.primaryTopic]}
                      </span>
                    )}
                  </div>
                  {metadata.summary && <p>{metadata.summary}</p>}
                  <ul class="topic-record-meta" aria-label={`${title}的分类信息`}>
                    <li>{metadata.subtopic ?? "综合"}</li>
                    <li>{knowledgeTypeLabels[metadata.type]}</li>
                    <li>{knowledgeMaturityLabels[metadata.maturity]}</li>
                    {updated && <li>修订于 {updated}</li>}
                  </ul>
                </div>
              </li>
            )
          })}
        </ol>
        <div class="topic-zero-results" data-topic-zero-results hidden>
          <p>没有同时符合这些条件的知识记录。</p>
          <button type="button" data-topic-filter-reset>
            清除筛选，查看全部
          </button>
        </div>
      </section>
    </div>
  )
}

TopicPage.css = style
TopicPage.afterDOMLoaded = script

export default (() => TopicPage) satisfies QuartzComponentConstructor
