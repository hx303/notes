import GraphConstructor from "./Graph"
import { knowledgeTopicLabels } from "../util/knowledgeMetadata"
import { FullSlug, resolveRelative } from "../util/path"
import { isPublicDiscoveryRecord } from "../util/publicDiscovery"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import style from "./styles/mapPage.scss"
// @ts-ignore
import script from "./scripts/mapPage.inline"

const Graph = GraphConstructor({
  localGraph: { depth: -1, enableRadial: true, publicDiscoveryOnly: true },
  globalGraph: { depth: -1, enableRadial: true, publicDiscoveryOnly: true },
})
const MapPage: QuartzComponent = (props: QuartzComponentProps) => {
  const { fileData, allFiles } = props
  const records = allFiles
    .filter(isPublicDiscoveryRecord)
    .sort((a, b) =>
      String(a.frontmatter?.title).localeCompare(String(b.frontmatter?.title), "zh-CN"),
    )

  const topics = [
    ...new Set(records.map((file) => file.knowledgeMetadata?.primaryTopic).filter(Boolean)),
  ]
  const maturities = [
    ...new Set(records.map((file) => file.knowledgeMetadata?.maturity).filter(Boolean)),
  ]

  return (
    <div class="map-page" data-map-page>
      <header class="map-page-intro">
        <p class="map-page-kicker">KNOWLEDGE MAP / 关系与路径</p>
        <h2>从一条记录，看到它连接的知识网络</h2>
        <p>
          图形视图适合发现邻近关系；下面的列表是等价的键盘与低功耗入口。筛选或聚焦后，URL
          会保留当前状态，方便分享。
        </p>
      </header>
      <section class="map-page-visual" aria-labelledby="map-visual-title">
        <h3 id="map-visual-title">关系图</h3>
        <Graph {...props} />
      </section>
      <section class="map-page-list" aria-labelledby="map-list-title">
        <div class="map-page-list-heading">
          <div>
            <p class="map-page-section-label">LIST VIEW / 等价列表</p>
            <h3 id="map-list-title">可访问的知识节点</h3>
          </div>
          <form class="map-page-filters" data-map-filters>
            <label>
              聚焦
              <input name="focus" type="search" placeholder="文章标题或 slug" />
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
              成熟度
              <select name="maturity">
                <option value="">全部成熟度</option>
                {maturities.map((maturity) => (
                  <option value={maturity!}>{maturity}</option>
                ))}
              </select>
            </label>
          </form>
        </div>
        <p class="map-page-status" data-map-status aria-live="polite">
          显示 {records.length} 条知识记录
        </p>
        <ul class="map-record-list">
          {records.map((record) => {
            const metadata = record.knowledgeMetadata
            return (
              <li
                data-map-record
                data-topic={metadata?.primaryTopic ?? ""}
                data-maturity={metadata?.maturity ?? ""}
                data-title={record.frontmatter?.title ?? ""}
                data-slug={record.slug}
              >
                <a class="internal" href={resolveRelative(fileData.slug!, record.slug as FullSlug)}>
                  {record.frontmatter?.title}
                </a>
                <span>
                  {metadata?.primaryTopic
                    ? (knowledgeTopicLabels[metadata.primaryTopic] ?? metadata.primaryTopic)
                    : "知识记录"}
                </span>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

MapPage.css = style
MapPage.afterDOMLoaded = script

export default (() => MapPage) satisfies QuartzComponentConstructor
