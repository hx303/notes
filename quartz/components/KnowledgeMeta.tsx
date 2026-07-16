import readingTime from "reading-time"
import { Date, getDate } from "./Date"
import { i18n } from "../i18n"
import { FullSlug, resolveRelative } from "../util/path"
import { classNames } from "../util/lang"
import { concatenateResources } from "../util/resources"
import { knowledgeTopicLabels, knowledgeTypeLabels } from "../util/knowledgeMetadata"
import { MaturityBadgeView } from "./MaturityBadge"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import style from "./styles/knowledgeMeta.scss"
import maturityStyle from "./styles/maturityBadge.scss"

interface KnowledgeMetaOptions {
  showReadingTime: boolean
  showLicense: boolean
}

const defaultOptions: KnowledgeMetaOptions = {
  showReadingTime: true,
  showLicense: true,
}

export default ((opts?: Partial<KnowledgeMetaOptions>) => {
  const options = { ...defaultOptions, ...opts }

  const KnowledgeMeta: QuartzComponent = ({
    cfg,
    fileData,
    displayClass,
  }: QuartzComponentProps) => {
    const knowledge = fileData.knowledgeMetadata
    if (!knowledge?.isStructured) return null

    const primaryTopic = knowledge.primaryTopic
      ? knowledgeTopicLabels[knowledge.primaryTopic]
      : "待归类"
    const topicHref = resolveRelative(fileData.slug!, "topics" as FullSlug)
    const knowledgeDate = knowledge.updated
      ? new globalThis.Date(`${knowledge.updated}T00:00:00`)
      : fileData.dates
        ? getDate(cfg, fileData)
        : undefined
    const displayedTime =
      options.showReadingTime && fileData.text
        ? i18n(cfg.locale).components.contentMeta.readingTime({
            minutes: Math.ceil(readingTime(fileData.text).minutes),
          })
        : undefined

    return (
      <section
        class={classNames(displayClass, "knowledge-record-header")}
        aria-label="知识记录信息"
        data-primary-topic={knowledge.primaryTopic ?? "unclassified"}
        data-type={knowledge.type}
        data-maturity={knowledge.maturity}
        data-publish={knowledge.publish ? "public" : "private"}
      >
        <div class="knowledge-record-classification">
          <a class="knowledge-topic internal" href={topicHref}>
            <span class="knowledge-field-label">主题</span>
            <span>{primaryTopic}</span>
          </a>
          <span class="knowledge-type">
            <span class="knowledge-field-label">类型</span>
            <span>{knowledgeTypeLabels[knowledge.type]}</span>
          </span>
          <MaturityBadgeView maturity={knowledge.maturity} />
        </div>

        {knowledge.summary && <p class="knowledge-record-summary">{knowledge.summary}</p>}

        <dl class="knowledge-record-facts">
          {knowledgeDate && (
            <div>
              <dt>最后修订</dt>
              <dd>
                <Date date={knowledgeDate} locale={cfg.locale} />
              </dd>
            </div>
          )}
          {displayedTime && (
            <div>
              <dt>阅读时间</dt>
              <dd>{displayedTime}</dd>
            </div>
          )}
          {options.showLicense && knowledge.license && (
            <div>
              <dt>复用许可</dt>
              <dd>{knowledge.license}</dd>
            </div>
          )}
        </dl>
      </section>
    )
  }

  KnowledgeMeta.css = concatenateResources(style, maturityStyle)
  return KnowledgeMeta
}) satisfies QuartzComponentConstructor<Partial<KnowledgeMetaOptions> | undefined>
