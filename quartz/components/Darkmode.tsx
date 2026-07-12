// @ts-ignore
import darkmodeScript from "./scripts/darkmode.inline"
import styles from "./styles/darkmode.scss"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"

const Darkmode: QuartzComponent = ({ displayClass }: QuartzComponentProps) => (
  <button
    class={classNames(displayClass, "reading-tool darkmode")}
    type="button"
    aria-label="切换到深色外观"
    aria-pressed="false"
  >
    <span class="reading-tool-icon" aria-hidden="true">
      <svg class="dayIcon" viewBox="0 0 24 24" focusable="false">
        <circle cx="12" cy="12" r="3.75" />
        <path d="M12 2.25v2.1M12 19.65v2.1M2.25 12h2.1M19.65 12h2.1M5.1 5.1l1.5 1.5M17.4 17.4l1.5 1.5M18.9 5.1l-1.5 1.5M6.6 17.4l-1.5 1.5" />
      </svg>
      <svg class="nightIcon" viewBox="0 0 24 24" focusable="false">
        <path d="M20.5 15.1A8.6 8.6 0 0 1 8.9 3.5 8.75 8.75 0 1 0 20.5 15.1Z" />
      </svg>
    </span>
    <span class="reading-tool-label">外观</span>
    <span class="reading-tool-value theme-value" aria-hidden="true">
      浅色
    </span>
  </button>
)

Darkmode.beforeDOMLoaded = darkmodeScript
Darkmode.css = styles

export default (() => Darkmode) satisfies QuartzComponentConstructor
