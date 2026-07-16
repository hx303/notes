import { QuartzComponent, QuartzComponentConstructor } from "./types"
import style from "./styles/publicKnowledge.scss"
// @ts-ignore
import script from "./scripts/publicKnowledge.inline"

const supabaseUrl = "https://agocyybolrisqujvjqdj.supabase.co"
const supabaseAnonKey = "sb_publishable_9gb7jev7Ytwa6xQC75_ShQ_z3TJ6IZc"

const PublicKnowledge: QuartzComponent = () => {
  return (
    <div
      class="public-knowledge"
      data-public-knowledge
      data-supabase-url={supabaseUrl}
      data-supabase-anon-key={supabaseAnonKey}
    >
      <header class="public-knowledge-hero">
        <p class="public-knowledge-kicker">WOULDKEEP / 共享知识</p>
        <h1 data-public-page-title>从别人的知识生长中，找到自己的下一步</h1>
        <p data-public-page-description>
          这里仅收录作者主动公开的知识。持链接内容不会出现在列表、搜索或主题目录中。
        </p>
      </header>

      <p
        class="public-knowledge-status"
        data-public-knowledge-status
        role="status"
        aria-live="polite"
      >
        正在连接知识网络…
      </p>

      <section
        class="public-discovery"
        data-public-discovery
        hidden
        aria-labelledby="public-discovery-title"
      >
        <div class="public-discovery-heading">
          <div>
            <p class="public-knowledge-kicker">DISCOVER / 发现</p>
            <h2 id="public-discovery-title">最近公开的知识</h2>
          </div>
          <label class="public-discovery-search">
            <span>在公开知识中筛选</span>
            <input
              type="search"
              data-public-search
              placeholder="输入标题、主题或标签"
              autocomplete="off"
            />
          </label>
        </div>
        <p class="public-discovery-count" data-public-count />
        <div class="public-discovery-list" data-public-list />
        <section class="public-discovery-empty" data-public-empty hidden>
          <h3>暂时没有符合条件的公开知识</h3>
          <p>可以清除搜索，或稍后再回来看看知识网络的新生长。</p>
          <button type="button" data-public-clear>
            清除搜索
          </button>
        </section>
      </section>

      <article
        class="public-reader"
        data-public-reader
        hidden
        aria-labelledby="public-reader-title"
      >
        <a class="public-reader-back" href="/knowledge/">
          ← 返回公开知识
        </a>
        <header class="public-reader-heading">
          <p class="public-reader-scope" data-public-reader-scope />
          <h1 id="public-reader-title" data-public-reader-title>
            未命名知识
          </h1>
          <div class="public-reader-meta">
            <span data-public-reader-topic />
            <time data-public-reader-date />
          </div>
          <div class="public-reader-tags" data-public-reader-tags />
        </header>
        <div class="public-reader-body" data-public-reader-body />
        <section
          class="public-reader-sources"
          data-public-reader-sources-section
          hidden
          aria-labelledby="public-reader-sources-title"
        >
          <div>
            <p class="public-knowledge-kicker">SOURCES / 依据</p>
            <h2 id="public-reader-sources-title">来源与个人经验</h2>
          </div>
          <ol data-public-reader-sources />
        </section>
        <footer class="public-reader-footer">
          <p>这是一份作者主动分享的知识快照。后续修改只有重新发布后才会出现在这里。</p>
          <a href="/workspace/">建立或继续整理我的知识库</a>
        </footer>
      </article>

      <section class="public-knowledge-error" data-public-error hidden>
        <p class="public-knowledge-kicker">NOT AVAILABLE / 暂不可读</p>
        <h2 data-public-error-title>没有找到这条知识</h2>
        <p data-public-error-message>它可能尚未公开，或者作者已经撤回了分享。</p>
        <a href="/knowledge/">浏览其他公开知识</a>
      </section>
    </div>
  )
}

PublicKnowledge.css = style
PublicKnowledge.afterDOMLoaded = script
export default (() => PublicKnowledge) satisfies QuartzComponentConstructor
