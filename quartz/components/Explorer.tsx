import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import style from "./styles/explorer.scss"

// @ts-ignore
import script from "./scripts/explorer.inline"
import { classNames } from "../util/lang"
import { i18n } from "../i18n"
import type { KnowledgeDirectoryView } from "../util/knowledgeCatalog"

export interface Options {
  title?: string
  variant: "sidebar" | "embedded"
  folderDefaultState: "collapsed" | "open"
  useSavedState: boolean
  initialView: KnowledgeDirectoryView
}

const defaultOptions: Options = {
  variant: "sidebar",
  folderDefaultState: "collapsed",
  useSavedState: true,
  initialView: "topic",
}

let numExplorers = 0
export default ((userOpts?: Partial<Options>) => {
  const opts: Options = { ...defaultOptions, ...userOpts }

  const Explorer: QuartzComponent = ({ cfg, displayClass }: QuartzComponentProps) => {
    const id = `explorer-${numExplorers++}`
    const title = opts.title ?? i18n(cfg.locale).components.explorer.title

    return (
      <nav
        id={`${id}-directory`}
        class={classNames(displayClass, "explorer", "knowledge-directory")}
        aria-label={title}
        data-variant={opts.variant}
        data-collapsed={opts.folderDefaultState}
        data-savestate={opts.useSavedState}
        data-initial-view={opts.initialView}
      >
        <button
          type="button"
          class="explorer-toggle mobile-explorer hide-until-loaded"
          data-mobile={true}
          aria-controls={id}
          aria-expanded={false}
          aria-label={title}
        >
          <svg aria-hidden="true" focusable="false" width="24" height="24" viewBox="0 0 24 24">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <button
          type="button"
          class="title-button explorer-toggle desktop-explorer"
          data-mobile={false}
          aria-expanded={true}
          aria-controls={id}
        >
          <span class="explorer-title">{title}</span>
          <svg
            aria-hidden="true"
            focusable="false"
            width="14"
            height="14"
            viewBox="5 8 14 8"
            fill="none"
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
        <div id={id} class="explorer-content" aria-expanded={false} role="group">
          <div class="directory-view-switch" role="group" aria-label="知识目录视图">
            <button type="button" data-directory-view="topic" aria-pressed="true">
              按主题
            </button>
            <button type="button" data-directory-view="type" aria-pressed="false">
              按类型
            </button>
          </div>
          <p class="directory-summary" aria-live="polite"></p>
          <ul class="explorer-ul" aria-label="知识记录"></ul>
        </div>
      </nav>
    )
  }

  Explorer.css = style
  Explorer.afterDOMLoaded = script
  return Explorer
}) satisfies QuartzComponentConstructor
