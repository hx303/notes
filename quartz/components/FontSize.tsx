// @ts-ignore
import fontSizeScript from "./scripts/fontsize.inline"
import styles from "./styles/fontsize.scss"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"

const FontSize: QuartzComponent = () => {
  return (
    <div class="fontsize">
      <button class="fontsize-btn zoom-out" aria-label="缩小字体" title="缩小字体">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          <line x1="8" y1="11" x2="14" y2="11"></line>
        </svg>
      </button>
      <button class="fontsize-btn zoom-in" aria-label="放大字体" title="放大字体">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          <line x1="11" y1="8" x2="11" y2="14"></line>
          <line x1="8" y1="11" x2="14" y2="11"></line>
        </svg>
      </button>
      <button class="fontsize-btn zoom-reset" aria-label="重置字体" title="重置字体大小" style="display:none">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="1 4 1 10 7 10"></polyline>
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
        </svg>
      </button>
    </div>
  )
}

FontSize.beforeDOMLoaded = fontSizeScript
FontSize.css = styles

export default (() => FontSize) satisfies QuartzComponentConstructor
