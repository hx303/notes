import { FullSlug, resolveRelative } from "../util/path"
import { knowledgeTopicLabels } from "../util/knowledgeMetadata"
import { isPublicDiscoveryRecord } from "../util/publicDiscovery"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import style from "./styles/recentGrowth.scss"
// @ts-ignore
import script from "./scripts/recentGrowth.inline"

type GrowthKind = "new" | "revision" | "polish"
type GrowthRecord = {
  file: QuartzComponentProps["allFiles"][number]
  kind: GrowthKind
  date: Date
  month: string
}

const kindLabels: Record<GrowthKind, string> = {
  new: "新记录",
  revision: "实质修订",
  polish: "小修",
}
function classify(file: GrowthRecord["file"]): GrowthKind {
  const created = file.dates?.created?.getTime() ?? 0
  const modified = file.dates?.modified?.getTime() ?? created
  const days = Math.abs(modified - created) / 86400000
  if (created === modified) return "new"
  return days >= 7 ? "revision" : "polish"
}

const RecentGrowth: QuartzComponent = ({ fileData, allFiles }) => {
  const records: GrowthRecord[] = allFiles
    .filter((file) => isPublicDiscoveryRecord(file) && file.dates?.modified)
    .map((file) => {
      const date = file.dates!.modified
      return {
        file,
        kind: classify(file),
        date,
        month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      }
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime())

  const topics = [
    ...new Set(records.map(({ file }) => file.knowledgeMetadata?.primaryTopic).filter(Boolean)),
  ]
  const months = [...new Set(records.map((record) => record.month))]

  return (
    <div class="recent-growth" data-recent-growth>
      <header class="recent-growth-intro">
        <p class="recent-growth-kicker">RECENT GROWTH / 最近生长</p>
        <h2>知识库最近发生了什么</h2>
        <p>
          这里区分新记录、实质修订和小修，让“最近更新”变成可以理解的维护轨迹，而不是一串无法判断意义的时间戳。
        </p>
        <p>
          <a
            class="recent-growth-rss"
            href={resolveRelative(fileData.slug!, "index.xml" as FullSlug)}
            type="application/rss+xml"
          >
            订阅 RSS 更新
          </a>
        </p>
      </header>
      <form class="recent-growth-filters" data-growth-filters>
        <label>
          月份
          <select name="month">
            <option value="">全部月份</option>
            {months.map((month) => (
              <option value={month}>{month}</option>
            ))}
          </select>
        </label>
        <label>
          主题
          <select name="topic">
            <option value="">全部主题</option>
            {topics.map((topic) => (
              <option value={topic!}>{knowledgeTopicLabels[topic!] ?? topic}</option>
            ))}
          </select>
        </label>
        <label>
          变更类型
          <select name="kind">
            <option value="">全部类型</option>
            {Object.entries(kindLabels).map(([kind, label]) => (
              <option value={kind}>{label}</option>
            ))}
          </select>
        </label>
      </form>
      <p class="recent-growth-status" data-growth-status aria-live="polite">
        显示 {records.length} 条生长记录
      </p>
      <div class="recent-growth-months">
        {months.map((month) => (
          <section data-growth-month={month} aria-labelledby={`growth-${month}`}>
            <h3 id={`growth-${month}`}>{month}</h3>
            <ol>
              {records
                .filter((record) => record.month === month)
                .map(({ file, kind, date }) => (
                  <li
                    data-growth-record
                    data-month={month}
                    data-kind={kind}
                    data-topic={file.knowledgeMetadata?.primaryTopic ?? ""}
                  >
                    <time dateTime={date.toISOString()}>{date.toLocaleDateString("zh-CN")}</time>
                    <span class={`growth-kind growth-kind-${kind}`}>{kindLabels[kind]}</span>
                    <a
                      class="internal"
                      href={resolveRelative(fileData.slug!, file.slug as FullSlug)}
                    >
                      {file.frontmatter?.title}
                    </a>
                    <span class="growth-topic">
                      {file.knowledgeMetadata?.primaryTopic
                        ? (knowledgeTopicLabels[file.knowledgeMetadata.primaryTopic] ??
                          file.knowledgeMetadata.primaryTopic)
                        : "知识记录"}
                    </span>
                  </li>
                ))}
            </ol>
          </section>
        ))}
      </div>
      <p class="recent-growth-empty" data-growth-empty hidden>
        没有符合筛选条件的生长记录。
      </p>
    </div>
  )
}

RecentGrowth.css = style
RecentGrowth.afterDOMLoaded = script

export default (() => RecentGrowth) satisfies QuartzComponentConstructor
