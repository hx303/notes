// @ts-ignore
import fontSizeScript from "./scripts/fontsize.inline"
import styles from "./styles/fontsize.scss"
import { QuartzComponent, QuartzComponentConstructor } from "./types"

const FontSize: QuartzComponent = () => (
  <div class="fontsize" role="group" aria-label="字号">
    <div class="fontsize-heading">
      <span class="reading-tool-label">字号</span>
      <output class="reading-tool-value fontsize-value" aria-live="polite">
        100%
      </output>
    </div>
    <div class="fontsize-actions">
      <button class="fontsize-btn zoom-out" type="button" aria-label="缩小字号">
        <span aria-hidden="true">A−</span>
      </button>
      <button class="fontsize-btn zoom-reset" type="button" disabled>
        默认
      </button>
      <button class="fontsize-btn zoom-in" type="button" aria-label="放大字号">
        <span aria-hidden="true">A＋</span>
      </button>
    </div>
  </div>
)

FontSize.beforeDOMLoaded = fontSizeScript
FontSize.css = styles

export default (() => FontSize) satisfies QuartzComponentConstructor
