import { Date } from "./Date"
import { buildRevisionEvents, safeSourceHref } from "../util/provenance"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import style from "./styles/revisionHistory.scss"

const RevisionHistory: QuartzComponent = ({ fileData, cfg }: QuartzComponentProps) => {
  const knowledge = fileData.knowledgeMetadata
  if (!knowledge?.isStructured) return null

  const events = buildRevisionEvents(fileData)
  return (
    <section class="revision-history" aria-labelledby="revision-history-title">
      <header class="revision-history-heading">
        <p class="provenance-eyebrow">PROVENANCE</p>
        <h2 id="revision-history-title">出处与修订</h2>
        <p>这些信息帮助你判断内容从哪里来、何时变化，以及可以怎样复用。</p>
      </header>

      <dl class="provenance-facts">
        <div>
          <dt>许可</dt>
          <dd>{knowledge.license || "未声明许可"}</dd>
        </div>
        <div>
          <dt>创建日期</dt>
          <dd>{events[0] ? <Date date={events[0].date} locale={cfg.locale} /> : "日期不详"}</dd>
        </div>
        <div>
          <dt>最近修订</dt>
          <dd>
            {events.length > 0 ? (
              <Date date={events[events.length - 1].date} locale={cfg.locale} />
            ) : (
              "日期不详"
            )}
          </dd>
        </div>
      </dl>

      <div class="provenance-section sources-section" aria-labelledby="sources-title">
        <h3 id="sources-title">来源</h3>
        {knowledge.sources.length > 0 ? (
          <ol class="sources-list">
            {knowledge.sources.map((source) => {
              const href = safeSourceHref(source)
              return (
                <li>
                  <span class="source-number" aria-hidden="true" />
                  <div>
                    {href ? (
                      <a href={href} class="external" target="_blank" rel="noopener noreferrer">
                        {source.title}
                        <span class="external-mark" aria-hidden="true">
                          ↗
                        </span>
                      </a>
                    ) : (
                      <span class="source-title">{source.title}</span>
                    )}
                    {source.doi && <p>DOI · {source.doi.replace(/^https?:\/\/doi\.org\//i, "")}</p>}
                    {!href && <p>当前仅记录书目信息，未提供可验证链接。</p>}
                  </div>
                </li>
              )
            })}
          </ol>
        ) : (
          <p class="provenance-empty">作者尚未补充公开来源；这不等于内容已经得到外部材料支持。</p>
        )}
      </div>

      <div class="provenance-section revision-section" aria-labelledby="revision-timeline-title">
        <h3 id="revision-timeline-title">修订记录</h3>
        {events.length > 0 ? (
          <ol class="revision-timeline">
            {events.map((event) => (
              <li data-revision-kind={event.kind}>
                <Date date={event.date} locale={cfg.locale} />
                <div>
                  <strong>{event.label}</strong>
                  <p>{event.description}</p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p class="provenance-empty">暂无可靠日期，修订顺序无法确认。</p>
        )}
      </div>
    </section>
  )
}

RevisionHistory.css = style
export default (() => RevisionHistory) satisfies QuartzComponentConstructor
