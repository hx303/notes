import { knowledgeTopicLabels } from "../util/knowledgeMetadata"
import { classifyIncomingKnowledgeLinks } from "../util/knowledgeRelations"
import { resolveRelative } from "../util/path"
import { classNames } from "../util/lang"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import style from "./styles/backlinks.scss"

interface BacklinksOptions {
  hideWhenEmpty: boolean
}
const defaultOptions: BacklinksOptions = { hideWhenEmpty: false }

export default ((opts?: Partial<BacklinksOptions>) => {
  const options = { ...defaultOptions, ...opts }
  const Backlinks: QuartzComponent = ({
    fileData,
    allFiles,
    displayClass,
  }: QuartzComponentProps) => {
    const incoming = classifyIncomingKnowledgeLinks(fileData, allFiles)
    const citations = incoming.filter(({ kind }) => kind === "citation")
    const mentions = incoming.filter(({ kind }) => kind === "mention")
    if (options.hideWhenEmpty && incoming.length === 0) return null

    const group = (id: string, title: string, description: string, entries: typeof incoming) => (
      <section class="backlink-group" aria-labelledby={id}>
        <div class="backlink-group-heading">
          <h3 id={id}>{title}</h3>
          <span aria-label={`${entries.length} 条`}>{entries.length}</span>
        </div>
        <p>{description}</p>
        {entries.length > 0 ? (
          <ul>
            {entries.map(({ source }) => (
              <li>
                <a class="internal" href={resolveRelative(fileData.slug!, source.slug!)}>
                  {source.frontmatter?.title ?? source.slug}
                </a>
                {source.knowledgeMetadata?.primaryTopic && (
                  <span>{knowledgeTopicLabels[source.knowledgeMetadata.primaryTopic]}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p class="backlink-empty">暂无</p>
        )}
      </section>
    )

    return (
      <section class={classNames(displayClass, "backlinks")} aria-labelledby="backlinks-title">
        <div class="backlinks-heading">
          <p>CONTEXT</p>
          <h2 id="backlinks-title">提及本文</h2>
        </div>
        {incoming.length === 0 ? (
          <p class="backlinks-empty">尚未发现其他知识记录引用或提及本文。</p>
        ) : (
          <div class="backlinks-groups">
            {group("backlinks-citations", "引用本文", "通过显式知识关系连接。", citations)}
            {group("backlinks-mentions", "正文提及", "在正文链接中自然出现。", mentions)}
          </div>
        )}
      </section>
    )
  }
  Backlinks.css = style
  return Backlinks
}) satisfies QuartzComponentConstructor
