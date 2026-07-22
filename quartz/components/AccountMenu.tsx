import { classNames } from "../util/lang"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import style from "./styles/accountMenu.scss"
// @ts-ignore
import script from "./scripts/accountMenu.inline"

const supabaseUrl = "https://agocyybolrisqujvjqdj.supabase.co"
const supabaseAnonKey = "sb_publishable_9gb7jev7Ytwa6xQC75_ShQ_z3TJ6IZc"

const AccountMenu: QuartzComponent = ({ displayClass }: QuartzComponentProps) => (
  <div
    class={classNames(displayClass, "account-menu")}
    data-account-menu
    data-account-state="loading"
    data-supabase-url={supabaseUrl}
    data-supabase-anon-key={supabaseAnonKey}
  >
    <a class="account-menu-login" href="/account/" data-account-menu-login hidden>
      登录
    </a>
    <div class="account-menu-user" data-account-menu-user hidden>
      <a
        class="account-avatar-link"
        href="/workspace/"
        aria-label="进入个人空间"
        data-account-avatar-link
      >
        <img data-account-avatar-image alt="" hidden />
        <span data-account-avatar-fallback aria-hidden="true">
          我
        </span>
      </a>
      <button
        class="account-menu-toggle"
        type="button"
        aria-label="打开个人空间快捷菜单"
        aria-expanded="false"
        aria-controls="account-menu-panel"
        data-account-menu-toggle
      >
        <svg aria-hidden="true" focusable="false" viewBox="0 0 16 16">
          <path d="m4 6 4 4 4-4" />
        </svg>
      </button>
      <section
        id="account-menu-panel"
        class="account-menu-panel"
        data-account-menu-panel
        hidden
        aria-label="个人空间快捷菜单"
      >
        <header class="account-menu-identity">
          <strong data-account-menu-name>我的账户</strong>
          <small data-account-menu-email />
        </header>
        <nav aria-label="个人空间快捷入口">
          <a href="/workspace/">
            <span>个人空间</span>
            <small>概览与最近入口</small>
          </a>
          <a href="/workspace/knowledge/">
            <span>我的知识库</span>
            <small>查找和继续整理</small>
          </a>
          <a href="/workspace/write/">
            <span>写作工作台</span>
            <small>新建、粘贴或导入</small>
          </a>
          <a href="/workspace/settings/">
            <span>个人设置</span>
            <small>头像与显示名称</small>
          </a>
          <a href="/workspace/site/" data-account-operations-link hidden>
            <span>站点运营</span>
            <small>反馈、权限与发布状态</small>
          </a>
        </nav>
        <button class="account-menu-signout" type="button" data-account-menu-signout>
          退出登录
        </button>
      </section>
    </div>
  </div>
)

AccountMenu.css = style
AccountMenu.afterDOMLoaded = script

export default (() => AccountMenu) satisfies QuartzComponentConstructor
