import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import style from "./styles/accountPage.scss"
// @ts-ignore
import script from "./scripts/accountPage.inline"

const supabaseUrl = "https://agocyybolrisqujvjqdj.supabase.co"
const supabaseAnonKey = "sb_publishable_9gb7jev7Ytwa6xQC75_ShQ_z3TJ6IZc"

const AccountPage: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  const workspace = fileData.slug === "workspace" || fileData.slug === "workspace/index"
  return (
    <div
      class={workspace ? "account-page workspace-page" : "account-page"}
      data-account-page
      data-account-mode={workspace ? "workspace" : "account"}
      data-supabase-url={supabaseUrl}
      data-supabase-anon-key={supabaseAnonKey}
    >
      <header class="account-hero">
        <p class="account-kicker">WOULDKEEP / 我的知识库</p>
        <h1>{workspace ? "把想法整理成自己的知识" : "拥有你的知识，也让知识照见他人"}</h1>
        <p>{workspace ? "用模块化编辑器整理、保存和发布，不需要记住任何代码。" : "登录后，你可以保存草稿、管理知识模块，并决定哪些内容愿意分享。"}</p>
      </header>

      <section class="account-panel" data-auth-panel aria-labelledby="account-panel-title">
        <div class="account-panel-heading">
          <p class="account-kicker">ACCOUNT</p>
          <h2 id="account-panel-title">先登录，再开始整理</h2>
        </div>
        <div class="account-tabs" role="tablist" aria-label="账户操作">
          <button type="button" role="tab" aria-selected="true" data-account-tab="signin">登录</button>
          <button type="button" role="tab" aria-selected="false" data-account-tab="signup">注册</button>
        </div>
        <form class="account-login" data-account-login>
          <input type="hidden" name="mode" value="signin" data-account-mode />
          <label>
            <span>邮箱</span>
            <input type="email" name="email" autocomplete="email" required placeholder="you@example.com" />
          </label>
          <label><span>密码</span><input type="password" name="password" autocomplete="current-password" required minLength={12} placeholder="至少 12 个字符" /></label>
          <p class="account-password-help">建议使用一句容易记住的长密码，长度比复杂符号更重要。</p>
          <button type="submit" data-account-submit>登录</button>
          <button type="button" class="account-forgot" data-account-forgot>忘记密码？发送重置邮件</button>
          <p class="account-help">你的账户用于保存草稿、管理分享权限和同步知识。</p>
        </form>
        <div class="account-session" data-account-session hidden>
          <p class="account-signed-in">已登录：<strong data-account-email /></p>
          <div class="account-actions">
            <a class="account-primary" href="/workspace/">进入我的工作台</a>
            <button type="button" class="account-secondary" data-account-signout>退出登录</button>
          </div>
        </div>
        <p class="account-status" data-account-status role="status" aria-live="polite" />
      </section>

      {workspace && (
        <section class="editor-panel" data-editor-panel aria-labelledby="editor-title">
          <div class="editor-panel-heading">
            <div><p class="account-kicker">WORKSPACE / 工作台</p><h2 id="editor-title">新建一条知识</h2></div>
            <span class="editor-save-state" data-editor-state>尚未保存</span>
          </div>
          <form class="editor-form" data-editor-form>
            <label><span>标题</span><input name="title" required placeholder="例如：我终于理解了 RCWA 的边界条件" /></label>
            <div class="editor-grid">
              <label><span>主题</span><select name="topic"><option value="">稍后再归类</option><option>数学</option><option>物理与光学</option><option>计算与仿真</option><option>研究方法</option></select></label>
              <label><span>成熟度</span><select name="maturity"><option value="seed">萌芽</option><option value="growing">整理中</option><option value="stable">相对完整</option></select></label>
            </div>
            <label><span>正文</span><textarea name="body" rows={12} placeholder="把问题、解释、例子和来源写下来……" /></label>
            <div class="editor-modules" aria-label="知识模块">
              <button type="button" data-module="source">＋ 添加来源</button>
              <button type="button" data-module="relation">＋ 添加前置知识</button>
              <button type="button" data-module="question">＋ 添加待解决问题</button>
            </div>
            <div class="editor-actions"><button type="submit">保存为草稿</button><button type="button" class="account-secondary" data-editor-clear>清空</button></div>
            <p class="editor-note">当前版本先保存到你的浏览器草稿箱；发布到共享知识库需要下一阶段的权限与发布接口。</p>
          </form>
        </section>
      )}
    </div>
  )
}

AccountPage.css = style
AccountPage.afterDOMLoaded = script
export default (() => AccountPage) satisfies QuartzComponentConstructor
