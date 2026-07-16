import Darkmode from "./Darkmode"
import FontSize from "./FontSize"
import ReaderMode from "./ReaderMode"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { concatenateResources } from "../util/resources"
import styles from "./styles/readingTools.scss"
// @ts-ignore
import script from "./scripts/readingtools.inline"

const ThemeControl = Darkmode()
const FontControl = FontSize()
const ReaderControl = ReaderMode()

export const ReadingToolsView = (
  props: QuartzComponentProps,
  variant: "sidebar" | "sheet" = "sidebar",
) => (
  <section
    class={`reading-tools reading-tools-${variant}`}
    aria-labelledby={`reading-tools-${variant}-title`}
  >
    <div class="reading-tools-heading">
      <div>
        <p class="reading-tools-eyebrow">READING</p>
        <h2 id={`reading-tools-${variant}-title`}>阅读设置</h2>
      </div>
      <button class="reading-tools-reset" type="button">
        恢复默认
      </button>
    </div>
    <div class="reading-tools-list">
      <ThemeControl {...props} />
      <FontControl {...props} />
      <ReaderControl {...props} />
    </div>
    <p class="reading-tools-status" role="status" aria-live="polite" aria-atomic="true" />
  </section>
)

const ReadingTools: QuartzComponent = (props: QuartzComponentProps) => ReadingToolsView(props)

ReadingTools.beforeDOMLoaded = concatenateResources(
  ThemeControl.beforeDOMLoaded,
  FontControl.beforeDOMLoaded,
  ReaderControl.beforeDOMLoaded,
)
ReadingTools.afterDOMLoaded = script
ReadingTools.css = concatenateResources(
  ThemeControl.css,
  FontControl.css,
  ReaderControl.css,
  styles,
)

export default (() => ReadingTools) satisfies QuartzComponentConstructor
