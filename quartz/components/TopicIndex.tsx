import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { buildTopicSummaries } from "../util/topicIndex"
import { FullSlug, resolveRelative } from "../util/path"
import style from "./styles/topicIndex.scss"

const TopicIndex: QuartzComponent = ({ allFiles, fileData }: QuartzComponentProps) => {
  const topics = buildTopicSummaries(allFiles)
  const total = topics.reduce((sum, topic) => sum + topic.count, 0)
  const pathHref = resolveRelative(fileData.slug!, "paths/index" as FullSlug)

  return (
    <div class="topic-index" data-record-count={total}>
      <header class="topic-index-intro">
        <p class="topic-index-kicker">KNOWLEDGE FIELDS / 七个知识领域</p>
        <p class="topic-index-lede">
          从你正在追问的问题出发，而不是从文件保存在哪里出发。每条知识记录只计入一个主主题，跨领域关系仍保留在文章内部。
        </p>
        <dl class="topic-index-facts" aria-label="主题索引概况">
          <div>
            <dt>公开知识记录</dt>
            <dd>{total}</dd>
          </div>
          <div>
            <dt>一级主题</dt>
            <dd>{topics.length}</dd>
          </div>
        </dl>
      </header>

      <ol class="topic-ledger" aria-label="七个知识主题">
        {topics.map((topic, index) => {
          const topicHref = resolveRelative(fileData.slug!, `topics/${topic.key}/index` as FullSlug)
          const recommendedTitle = topic.recommended?.frontmatter?.title
          const recommendedHref = topic.recommended?.slug
            ? resolveRelative(fileData.slug!, topic.recommended.slug)
            : undefined
          return (
            <li
              id={`topic-${topic.key}`}
              class="topic-ledger-row"
              data-topic={topic.key}
              data-size={topic.count >= 100 ? "large" : topic.count === 0 ? "empty" : "regular"}
            >
              <span class="topic-ledger-number" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div class="topic-ledger-main">
                <div class="topic-ledger-heading">
                  <h2>
                    <a class="internal" href={topicHref}>
                      {topic.label}
                    </a>
                  </h2>
                  <span class="topic-count">{topic.count} 条</span>
                </div>
                <p>{topic.scope}</p>
                {topic.subtopics.length > 0 ? (
                  <ul class="topic-subtopics" aria-label={`${topic.label}的子主题`}>
                    {topic.subtopics.slice(0, 4).map((subtopic) => (
                      <li>
                        <span>{subtopic.label}</span>
                        <span>{subtopic.count}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p class="topic-empty">这个主题的公开记录仍在整理中。</p>
                )}
              </div>
              <aside class="topic-ledger-actions" aria-label={`${topic.label}的起点与路径`}>
                <a class="topic-enter internal" href={topicHref}>
                  进入主题目录 →
                </a>
                <p>推荐起点</p>
                {recommendedHref && recommendedTitle ? (
                  <a class="topic-start internal" href={recommendedHref}>
                    {recommendedTitle}
                  </a>
                ) : (
                  <span class="topic-start-unavailable">尚无可公开的起点</span>
                )}
                <p class="topic-path-name">路径方向 · {topic.pathName}</p>
                <a class="topic-path-link internal" href={pathHref}>
                  查看学习路径规划
                </a>
              </aside>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

TopicIndex.css = style

export default (() => TopicIndex) satisfies QuartzComponentConstructor
