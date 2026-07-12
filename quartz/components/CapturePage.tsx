import { QuartzComponent, QuartzComponentConstructor } from "./types"
import style from "./styles/capturePage.scss"
// @ts-ignore
import script from "./scripts/capturePage.inline"

const CapturePage: QuartzComponent = () => (
  <div class="capture-page" data-capture-page>
    <header class="capture-hero">
      <p class="capture-kicker">CAPTURE / 把想法带回知识库</p>
      <h1>先留下，再慢慢长成一篇知识。</h1>
      <p>快速保存一个问题、一个链接或一段摘录。草稿只保存在当前浏览器，确认后再交给你的发布流程。</p>
    </header>
    <form class="capture-form" data-capture-form>
      <label><span>标题</span><input name="title" required maxLength={120} placeholder="例如：如何理解 RCWA 的边界条件？" /></label>
      <label><span>来源链接（可选）</span><input name="source" type="url" placeholder="https://..." /></label>
      <label><span>主题</span><select name="topic"><option value="">稍后再归类</option><option>数学</option><option>物理与光学</option><option>计算与仿真</option><option>研究方法</option></select></label>
      <label><span>先记下什么</span><textarea name="body" required minLength={10} rows={9} placeholder="写下问题、摘录、观察或下一步……" /></label>
      <div class="capture-actions"><button type="submit">保存为本地草稿</button><button type="button" data-capture-clear class="capture-quiet">清空</button></div>
      <p class="capture-status" data-capture-status role="status" aria-live="polite" />
    </form>
    <section class="capture-drafts" aria-labelledby="capture-drafts-title"><div><p class="capture-kicker">DRAFTS / 尚未发布</p><h2 id="capture-drafts-title">最近留下的想法</h2></div><div data-capture-drafts /></section>
  </div>
)

CapturePage.css = style
CapturePage.afterDOMLoaded = script
export default (() => CapturePage) satisfies QuartzComponentConstructor
