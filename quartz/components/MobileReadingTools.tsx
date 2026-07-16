import ExplorerConstructor from "./Explorer"
import { ReadingToolsView } from "./ReadingTools"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { concatenateResources } from "../util/resources"
import styles from "./styles/mobileReadingTools.scss"
// @ts-ignore
import drawerScript from "./scripts/mobileKnowledgeDrawer.inline"

const MobileExplorer = ExplorerConstructor({
  title: "知识目录",
  variant: "embedded",
  folderDefaultState: "collapsed",
})

const DirectoryIcon = () => (
  <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
    <path d="M4 5.5h6l1.5 2H20v11H4z" />
    <path d="M4 9h16" />
  </svg>
)

const SettingsIcon = () => (
  <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
    <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h7M15 18h5" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="8" cy="12" r="2" />
    <circle cx="13" cy="18" r="2" />
  </svg>
)

const CloseIcon = () => (
  <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
)

const MobileReadingTools: QuartzComponent = (props: QuartzComponentProps) => (
  <div class="mobile-reading-tools mobile-article-tools">
    <nav class="mobile-article-toolbar" aria-label="移动文章工具">
      <button
        class="mobile-knowledge-trigger"
        type="button"
        aria-haspopup="dialog"
        aria-expanded="false"
        aria-controls="mobile-knowledge-dialog"
      >
        <DirectoryIcon />
        <span>知识目录</span>
      </button>
      <button
        class="mobile-reading-tools-trigger"
        type="button"
        aria-haspopup="dialog"
        aria-expanded="false"
        aria-controls="mobile-reading-tools-dialog"
      >
        <SettingsIcon />
        <span>阅读设置</span>
      </button>
    </nav>

    <dialog
      id="mobile-knowledge-dialog"
      class="mobile-knowledge-dialog"
      aria-labelledby="mobile-knowledge-title"
    >
      <div class="mobile-drawer-header">
        <div>
          <p>LIBRARY</p>
          <h2 id="mobile-knowledge-title">知识目录</h2>
        </div>
        <button class="mobile-knowledge-close" type="button" aria-label="关闭知识目录">
          <CloseIcon />
        </button>
      </div>
      <p class="mobile-knowledge-note">按目录浏览公开知识记录，当前页面会在列表中标出。</p>
      <MobileExplorer {...props} />
    </dialog>

    <dialog
      id="mobile-reading-tools-dialog"
      class="mobile-reading-tools-dialog"
      aria-labelledby="reading-tools-sheet-title"
    >
      <div class="mobile-reading-tools-header">
        <span>个性化当前阅读体验</span>
        <button class="mobile-reading-tools-close" type="button" aria-label="关闭阅读设置">
          <CloseIcon />
        </button>
      </div>
      {ReadingToolsView(props, "sheet")}
    </dialog>
  </div>
)

MobileReadingTools.css = concatenateResources(MobileExplorer.css, styles)
MobileReadingTools.afterDOMLoaded = concatenateResources(
  MobileExplorer.afterDOMLoaded,
  drawerScript,
)

export default (() => MobileReadingTools) satisfies QuartzComponentConstructor
