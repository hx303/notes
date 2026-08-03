import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { FullSlug, resolveRelative } from "../util/path"
import { readLearningPathDefinition } from "../util/learningPath"
import { isExplicitlyPrivateRecord, isPublicDiscoveryRecord } from "../util/publicDiscovery"
import style from "./styles/discoverHome.scss"

const DiscoverHome: QuartzComponent = ({ fileData, allFiles }: QuartzComponentProps) => {
  const notes = allFiles
    .filter((file) => isPublicDiscoveryRecord(file) && file.dates?.modified)
    .sort((a, b) => (b.dates!.modified?.getTime() ?? 0) - (a.dates!.modified?.getTime() ?? 0))
  const featured = notes.slice(0, 4)
  const total = notes.length
  const topics = new Set(notes.map((file) => file.knowledgeMetadata?.primaryTopic).filter(Boolean))
    .size
  const paths = new Set(
    allFiles.flatMap((file) => {
      if (!/^paths\/[^/]+\/index$/.test(file.slug ?? "")) return []
      if (isExplicitlyPrivateRecord(file)) return []
      const path = readLearningPathDefinition(file.frontmatter?.learningPath)
      return path ? [path.id] : []
    }),
  ).size
  const href = (slug: string) => resolveRelative(fileData.slug!, slug as FullSlug)

  return (
    <div class="discover-home" data-discover-home>
      <section class="discover-hero">
        <p class="discover-kicker">WOULDKEEP / 个人知识库 · 公开生长</p>
        <h1>把正在理解的事，变成可以分享的路。</h1>
        <p class="discover-lede">
          这里不是文件夹的镜像，而是一座会持续生长的知识花园：从一个问题出发，沿着主题、路径和他人的连接，找到下一步。
        </p>
        <div class="discover-actions">
          <a class="discover-primary" href={href("paths/index")}>
            沿一条路径开始
          </a>
          <a class="discover-secondary" href={href("map/index")}>
            打开知识地图
          </a>
        </div>
      </section>

      <section class="discover-story" aria-labelledby="discover-story-title">
        <div class="discover-section-heading">
          <p class="discover-kicker">A STORY IN MOTION / 最近生长</p>
          <h2 id="discover-story-title">知识不是静态收藏，而是一次次被重新连接。</h2>
          <a href={href("changes/index")}>查看完整生长记录 →</a>
        </div>
        <ol class="discover-records">
          {featured.map((file, index) => (
            <li>
              <span class="discover-index">{String(index + 1).padStart(2, "0")}</span>
              <a href={href(file.slug!)}>{file.frontmatter?.title}</a>
              <time dateTime={file.dates!.modified!.toISOString()}>
                {file.dates!.modified!.toLocaleDateString("zh-CN")}
              </time>
            </li>
          ))}
        </ol>
      </section>

      <section class="discover-stats" aria-label="知识库概览">
        <div>
          <strong>{total}</strong>
          <span>公开记录</span>
        </div>
        <div>
          <strong>{topics}</strong>
          <span>正在交汇的主题</span>
        </div>
        <div>
          <strong>{paths}</strong>
          <span>可继续的学习路径</span>
        </div>
      </section>
    </div>
  )
}

DiscoverHome.css = style
export default (() => DiscoverHome) satisfies QuartzComponentConstructor
