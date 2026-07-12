import { buildSuggestedCitation, canonicalPageUrl, toValidDate } from "../util/provenance"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import style from "./styles/citationActions.scss"
// @ts-ignore
import script from "./scripts/citationActions.inline"

const CopyIcon = () => (
  <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
    <rect x="8" y="8" width="11" height="11" rx="1.5" />
    <path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-10A1.5 1.5 0 0 0 3 5.5v10A1.5 1.5 0 0 0 4.5 17H8" />
  </svg>
)

const CitationActions: QuartzComponent = ({ fileData, cfg }: QuartzComponentProps) => {
  const knowledge = fileData.knowledgeMetadata
  if (!knowledge?.isStructured || !fileData.slug) return null

  const title = String(fileData.frontmatter?.title ?? "未命名知识记录")
  const author =
    typeof fileData.frontmatter?.author === "string" ? fileData.frontmatter.author : undefined
  const url = canonicalPageUrl(cfg.baseUrl, fileData.slug)
  const date = toValidDate(knowledge.updated) ?? toValidDate(knowledge.created)
  const citation = buildSuggestedCitation({ author, title, date, url })

  return (
    <section
      class="citation-actions"
      aria-labelledby="citation-actions-title"
      data-canonical-url={url}
      data-suggested-citation={citation}
      data-share-title={title}
    >
      <div class="citation-actions-heading">
        <div>
          <p class="provenance-eyebrow">REUSE</p>
          <h2 id="citation-actions-title">引用与分享</h2>
        </div>
        <p>永久链接不会随文件夹或标题变化。</p>
      </div>
      <div class="citation-action-list">
        <button type="button" data-citation-action="copy-link">
          <CopyIcon />
          <span>复制永久链接</span>
        </button>
        <button type="button" data-citation-action="copy-citation">
          <CopyIcon />
          <span>复制建议引用</span>
        </button>
        <button type="button" data-citation-action="share">
          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
            <circle cx="18" cy="5" r="2.5" />
            <circle cx="6" cy="12" r="2.5" />
            <circle cx="18" cy="19" r="2.5" />
            <path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5" />
          </svg>
          <span>系统分享</span>
        </button>
      </div>
      <p class="citation-actions-status" role="status" aria-live="polite" aria-atomic="true" />
    </section>
  )
}

CitationActions.css = style
CitationActions.afterDOMLoaded = script
export default (() => CitationActions) satisfies QuartzComponentConstructor
