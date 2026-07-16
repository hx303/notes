import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import legacyStyle from "./styles/legacyToc.scss"
import modernStyle from "./styles/toc.scss"
import { classNames } from "../util/lang"

// @ts-ignore
import script from "./scripts/toc.inline"
import { i18n } from "../i18n"

interface Options {
  layout: "modern" | "legacy"
  display: "sidebar" | "inline"
}

const defaultOptions: Options = {
  layout: "modern",
  display: "sidebar",
}

let numTocs = 0
export default ((opts?: Partial<Options>) => {
  const layout = opts?.layout ?? defaultOptions.layout
  const display = opts?.display ?? defaultOptions.display
  const TableOfContents: QuartzComponent = ({
    fileData,
    displayClass,
    cfg,
  }: QuartzComponentProps) => {
    if (!fileData.toc) {
      return null
    }

    const id = `toc-${numTocs++}`
    const title = i18n(cfg.locale).components.tableOfContents.title
    const initialSection = fileData.toc[0]?.text
    const isInlineDisclosure = display === "inline"
    const entries = (
      <ul id={id} class="toc-content">
        {fileData.toc.map((tocEntry) => (
          <li key={tocEntry.slug} class={`depth-${tocEntry.depth}`}>
            <a href={`#${tocEntry.slug}`} data-for={tocEntry.slug}>
              {tocEntry.text}
            </a>
          </li>
        ))}
      </ul>
    )

    if (isInlineDisclosure) {
      return (
        <details class={classNames(displayClass, "toc", "toc-inline")}>
          <summary>
            <span class="toc-summary-copy">
              <span class="toc-title">本文目录</span>
              {initialSection && (
                <span class="toc-current" data-toc-current>
                  当前：{initialSection}
                </span>
              )}
            </span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="fold"
              aria-hidden="true"
              focusable="false"
            >
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </summary>
          {entries}
        </details>
      )
    }

    return (
      <div class={classNames(displayClass, "toc", "toc-sidebar")}>
        <button
          type="button"
          class={fileData.collapseToc ? "collapsed toc-header" : "toc-header"}
          aria-controls={id}
          aria-expanded={!fileData.collapseToc}
        >
          <span class="toc-summary-copy">
            <span class="toc-title">{title}</span>
            {initialSection && (
              <span class="toc-current" data-toc-current>
                当前：{initialSection}
              </span>
            )}
          </span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="fold"
            aria-hidden="true"
            focusable="false"
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
        <div class={fileData.collapseToc ? "toc-panel collapsed" : "toc-panel"}>{entries}</div>
      </div>
    )
  }

  TableOfContents.css = modernStyle
  TableOfContents.afterDOMLoaded = script

  const LegacyTableOfContents: QuartzComponent = ({ fileData, cfg }: QuartzComponentProps) => {
    if (!fileData.toc) {
      return null
    }
    return (
      <details class="toc" open={!fileData.collapseToc}>
        <summary>
          <span class="toc-title">{i18n(cfg.locale).components.tableOfContents.title}</span>
        </summary>
        <ul>
          {fileData.toc.map((tocEntry) => (
            <li key={tocEntry.slug} class={`depth-${tocEntry.depth}`}>
              <a href={`#${tocEntry.slug}`} data-for={tocEntry.slug}>
                {tocEntry.text}
              </a>
            </li>
          ))}
        </ul>
      </details>
    )
  }
  LegacyTableOfContents.css = legacyStyle

  return layout === "modern" ? TableOfContents : LegacyTableOfContents
}) satisfies QuartzComponentConstructor
