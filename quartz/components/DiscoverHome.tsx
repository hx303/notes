import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { FullSlug, resolveRelative } from "../util/path"
import style from "./styles/discoverHome.scss"

const takeMostRecent = (files: QuartzComponentProps["allFiles"], limit: number) =>
  files.reduce<typeof files>((recent, file) => {
    const modified = file.dates?.modified?.getTime() ?? 0
    const insertionIndex = recent.findIndex(
      (candidate) => modified > (candidate.dates?.modified?.getTime() ?? 0),
    )

    if (insertionIndex === -1) {
      if (recent.length < limit) recent.push(file)
      return recent
    }

    recent.splice(insertionIndex, 0, file)
    if (recent.length > limit) recent.pop()
    return recent
  }, [])

const DiscoverHome: QuartzComponent = ({ fileData, allFiles }: QuartzComponentProps) => {
  const notes = allFiles.filter(
    (file) => file.slug && file.slug !== "index" && file.frontmatter?.title && file.dates?.modified,
  )
  const featured = takeMostRecent(notes, 4)
  const total = notes.length
  const topics = new Set(notes.map((file) => file.knowledgeMetadata?.primaryTopic).filter(Boolean))
    .size
  const href = (slug: string) => resolveRelative(fileData.slug!, slug as FullSlug)
  const routes = [
    {
      number: "01",
      href: href("topics/index"),
      title: "从主题开始",
      detail: topics > 0 ? `从 ${topics} 个主题进入公开知识。` : "主题目录会随着内容逐步成形。",
    },
    {
      number: "02",
      href: href("paths/index"),
      title: "沿学习路径前进",
      detail: "沿着整理好的顺序，找到下一步。",
    },
    {
      number: "03",
      href: href("changes/index"),
      title: "看看最近生长",
      detail: total > 0 ? "了解知识库最近新增与修订了什么。" : "新的记录会在这里留下轨迹。",
    },
    {
      number: "04",
      href: href("map/index"),
      title: "在地图中找连接",
      detail: "从记录之间的关系出发继续探索。",
    },
  ]

  return (
    <div class="discover-home" data-discover-home>
      <section class="discover-hero">
        <p class="discover-kicker">WOULDKEEP / 个人知识库 · 公开生长</p>
        <h1>把正在理解的事，变成可以分享的路。</h1>
        <p class="discover-lede">
          先把问题整理成自己的理解，再决定哪些内容值得公开；公开后，它会成为别人继续学习的一段路。
        </p>
        <div class="discover-actions">
          <a class="discover-primary" href={href("paths/index")}>
            沿一条路径开始
          </a>
          <a class="discover-secondary" href={href("map/index")}>
            打开知识地图
          </a>
        </div>
        <p class="discover-ownership-note">由本人主动分享 · 不做关注流或算法推荐</p>
      </section>

      <section class="discover-routes" aria-labelledby="discover-routes-title">
        <div class="discover-section-heading">
          <p class="discover-kicker">FIND YOUR NEXT STEP / 从哪里开始</p>
          <h2 id="discover-routes-title">从一个问题出发，选一种适合你的探索方式。</h2>
        </div>
        <ol class="discover-route-list">
          {routes.map((route) => (
            <li key={route.number}>
              <span class="discover-index" aria-hidden="true">
                {route.number}
              </span>
              <div>
                <h3>
                  <a href={route.href}>{route.title}</a>
                </h3>
                <p>{route.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section class="discover-story" aria-labelledby="discover-story-title">
        <div class="discover-section-heading">
          <p class="discover-kicker">A STORY IN MOTION / 最近生长</p>
          <h2 id="discover-story-title">知识不是静态收藏，而是一次次被重新连接。</h2>
          <a href={href("changes/index")}>查看完整生长记录 →</a>
        </div>
        {featured.length > 0 ? (
          <ol class="discover-records">
            {featured.map((file, index) => (
              <li key={file.slug}>
                <span class="discover-index" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <a href={href(file.slug!)}>{file.frontmatter?.title}</a>
                <time dateTime={file.dates!.modified!.toISOString()}>
                  {file.dates!.modified!.toLocaleDateString("zh-CN")}
                </time>
              </li>
            ))}
          </ol>
        ) : (
          <p class="discover-story-empty">还没有可展示的公开记录，新的生长会在这里留下轨迹。</p>
        )}
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
          <strong>3</strong>
          <span>可继续的学习路径</span>
        </div>
      </section>
    </div>
  )
}

DiscoverHome.css = style
export default (() => DiscoverHome) satisfies QuartzComponentConstructor
