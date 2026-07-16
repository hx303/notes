// @ts-ignore
import readerModeScript from "./scripts/readermode.inline"
import styles from "./styles/readermode.scss"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"

const ReaderMode: QuartzComponent = ({ displayClass }: QuartzComponentProps) => (
  <button
    class={classNames(displayClass, "reading-tool readermode")}
    type="button"
    aria-label="开启专注阅读"
    aria-pressed="false"
  >
    <span class="reading-tool-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M4.25 5.25A2.25 2.25 0 0 1 6.5 3h2.25A4.25 4.25 0 0 1 12 4.5 4.25 4.25 0 0 1 15.25 3h2.25a2.25 2.25 0 0 1 2.25 2.25v13.5H15.5A4.25 4.25 0 0 0 12 20.6a4.25 4.25 0 0 0-3.5-1.85H4.25V5.25Z" />
        <path d="M12 4.5v16.1" />
      </svg>
    </span>
    <span class="reading-tool-label">专注阅读</span>
    <span class="reading-tool-value reader-mode-value" aria-hidden="true">
      关闭
    </span>
  </button>
)

ReaderMode.beforeDOMLoaded = readerModeScript
ReaderMode.css = styles

export default (() => ReaderMode) satisfies QuartzComponentConstructor
