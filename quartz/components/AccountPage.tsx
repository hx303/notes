import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import style from "./styles/accountPage.scss"
// @ts-ignore
import script from "./scripts/accountPage.inline"
import { EDITOR_ATOMIC_SAVE_PROTOCOL } from "./scripts/editorAtomicSave"

const supabaseUrl = "https://agocyybolrisqujvjqdj.supabase.co"
const supabaseAnonKey = "sb_publishable_9gb7jev7Ytwa6xQC75_ShQ_z3TJ6IZc"

type AuthView = "signin" | "signup" | "forgot" | "recover"
type WorkspaceView = "overview" | "knowledge" | "write" | "settings" | "ai-settings" | "site"

const authViewForSlug = (slug = ""): AuthView => {
  if (slug.includes("account/signup")) return "signup"
  if (slug.includes("account/forgot")) return "forgot"
  if (slug.includes("account/recover")) return "recover"
  return "signin"
}

const workspaceViewForSlug = (slug = ""): WorkspaceView => {
  if (/^workspace\/knowledge(?:\/index)?$/.test(slug)) return "knowledge"
  if (/^workspace\/write(?:\/index)?$/.test(slug)) return "write"
  if (/^workspace\/site(?:\/index)?$/.test(slug)) return "site"
  if (/^workspace\/settings\/ai(?:\/index)?$/.test(slug)) return "ai-settings"
  if (/^workspace\/settings(?:\/index)?$/.test(slug)) return "settings"
  return "overview"
}

const AccountPage: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  const slug = fileData.slug ?? ""
  const workspace = /^workspace(?:\/|$)/.test(slug)
  const workspaceView = workspaceViewForSlug(slug)
  const authView = authViewForSlug(slug)
  const mode = workspace ? "workspace" : authView

  const heading = workspace
    ? workspaceView === "knowledge"
      ? "你的知识，都在这里"
      : workspaceView === "write"
        ? "选择最顺手的方式开始"
        : workspaceView === "ai-settings"
          ? "让 AI 先学会尊重边界"
          : workspaceView === "site"
            ? "把站点运营收回同一个工作区"
            : workspaceView === "settings"
              ? "让个人空间更像你"
              : "回到你的个人知识空间"
    : authView === "signup"
      ? "建立属于你的知识库"
      : authView === "forgot"
        ? "找回你的知识库"
        : authView === "recover"
          ? "设置新的登录密码"
          : "回来继续整理"

  const description = workspace
    ? workspaceView === "knowledge"
      ? "查找、筛选并继续整理已经保存的知识；每一条都由你决定何时分享。"
      : workspaceView === "write"
        ? "快速粘贴整篇文稿，或进入详细编辑器补充标签、关系与来源。"
        : workspaceView === "ai-settings"
          ? "先决定是否启用、可以处理哪些内容和费用上限；在你明确接受前，AI 不会改动或发布知识。"
          : workspaceView === "site"
            ? "在这里处理公开反馈、协作者权限与发布链路状态；站点运营权限不会扩大到任何人的私密正文。"
            : workspaceView === "settings"
              ? "设置头像与显示名称；这些信息会用于个人空间和你主动公开的知识。"
              : "从概览前往知识库或写作工作台；站长工具只对拥有权限的账户显示。"
    : authView === "signup"
      ? "一个账户对应一座个人知识库。内容默认仅自己可见，何时分享由你决定。"
      : authView === "forgot"
        ? "输入注册邮箱，我们会发送一封安全的密码重置邮件。"
        : authView === "recover"
          ? "使用容易记住的长密码。更新后，你可以继续回到原来的知识库。"
          : "登录后继续保存草稿、整理知识关系，并决定哪些内容值得公开。"

  return (
    <div
      class={workspace ? "account-page workspace-page" : "account-page auth-page"}
      data-account-page
      data-account-mode={mode}
      data-auth-state="loading"
      data-workspace-section={workspace ? workspaceView : undefined}
      data-editor-save-protocol={
        workspaceView === "write" ? EDITOR_ATOMIC_SAVE_PROTOCOL : undefined
      }
      data-supabase-url={supabaseUrl}
      data-supabase-anon-key={supabaseAnonKey}
    >
      {workspace && (
        <nav class="workspace-nav" aria-label="个人空间">
          <div class="workspace-nav-heading">
            <p class="account-kicker">PERSONAL SPACE</p>
            <strong>我的空间</strong>
          </div>
          <div class="workspace-nav-links">
            <a href="/workspace/" aria-current={workspaceView === "overview" ? "page" : undefined}>
              <span aria-hidden="true">01</span>
              <span>
                <strong>概览</strong>
                <small>回到个人空间</small>
              </span>
            </a>
            <a
              href="/workspace/knowledge/"
              aria-current={workspaceView === "knowledge" ? "page" : undefined}
            >
              <span aria-hidden="true">02</span>
              <span>
                <strong>我的知识库</strong>
                <small>查找与继续整理</small>
              </span>
            </a>
            <a
              href="/workspace/write/"
              aria-current={workspaceView === "write" ? "page" : undefined}
            >
              <span aria-hidden="true">03</span>
              <span>
                <strong>写作工作台</strong>
                <small>新建、粘贴或导入</small>
              </span>
            </a>
            <a
              href="/workspace/settings/"
              aria-current={workspaceView === "settings" ? "page" : undefined}
            >
              <span aria-hidden="true">04</span>
              <span>
                <strong>个人设置</strong>
                <small>头像与显示名称</small>
              </span>
            </a>
            <a
              href="/workspace/settings/ai/"
              aria-current={workspaceView === "ai-settings" ? "page" : undefined}
            >
              <span aria-hidden="true">05</span>
              <span>
                <strong>AI 助手</strong>
                <small>开关、范围与额度</small>
              </span>
            </a>
          </div>
          <div class="workspace-nav-utility">
            <a href="/knowledge/">
              <span aria-hidden="true">↗</span>
              <span>
                <strong>公开知识</strong>
                <small>查看大家分享的内容</small>
              </span>
            </a>
            <a
              href="/workspace/site/"
              aria-current={workspaceView === "site" ? "page" : undefined}
              data-site-operations-nav
              hidden
            >
              <span aria-hidden="true">◆</span>
              <span>
                <strong>站点运营</strong>
                <small>反馈、权限与发布状态</small>
              </span>
            </a>
          </div>
        </nav>
      )}

      <header class="account-hero">
        <p class="account-kicker">WOULDKEEP / 个人知识库</p>
        <h1>{heading}</h1>
        <p>{description}</p>
        {!workspace && (
          <ul class="account-promises" aria-label="账户说明">
            <li>
              <strong>默认私密</strong>
              <span>新知识不会自动公开</span>
            </li>
            <li>
              <strong>随时带走</strong>
              <span>内容属于你，也可以继续导出</span>
            </li>
            <li>
              <strong>不需要代码</strong>
              <span>从第一条知识开始使用</span>
            </li>
          </ul>
        )}
      </header>

      <section
        class="account-panel"
        data-auth-panel
        aria-labelledby="account-panel-title"
        aria-busy="true"
      >
        <div class="account-panel-heading">
          <p class="account-kicker">{workspace ? "ACCESS" : authView.toUpperCase()}</p>
          <h2 id="account-panel-title">
            {workspace
              ? "登录后打开工作台"
              : authView === "signup"
                ? "创建账户"
                : authView === "forgot"
                  ? "发送重置邮件"
                  : authView === "recover"
                    ? "设置新密码"
                    : "登录"}
          </h2>
        </div>

        <div class="account-auth-loading" data-auth-loading role="status" aria-live="polite">
          <span class="account-auth-loading-mark" aria-hidden="true" />
          <p>
            <strong>正在确认登录状态</strong>
            <span>登录、注册和找回入口会在连接完成后保持在原位。</span>
          </p>
        </div>

        {(workspace || authView === "signin") && (
          <form class="account-form" data-account-login>
            <input type="hidden" name="mode" value="signin" />
            <label for="account-email">
              <span>邮箱</span>
              <input
                id="account-email"
                type="email"
                name="email"
                autocomplete="email"
                required
                placeholder="you@example.com"
              />
            </label>
            <label for="account-password">
              <span>密码</span>
              <span class="account-password-control">
                <input
                  id="account-password"
                  type="password"
                  name="password"
                  autocomplete="current-password"
                  required
                  minLength={8}
                />
                <button type="button" data-password-toggle aria-pressed="false">
                  显示
                </button>
              </span>
            </label>
            <button type="submit" class="account-submit" data-account-submit>
              登录
            </button>
            <div class="account-form-links">
              <a href="/account/signup/">创建新账户</a>
              <a href="/account/forgot/">忘记密码</a>
            </div>
          </form>
        )}

        {authView === "signup" && !workspace && (
          <>
            <form class="account-form" data-account-login>
              <input type="hidden" name="mode" value="signup" />
              <label for="signup-email">
                <span>邮箱</span>
                <input
                  id="signup-email"
                  type="email"
                  name="email"
                  autocomplete="email"
                  required
                  placeholder="you@example.com"
                />
              </label>
              <label for="signup-password">
                <span>密码</span>
                <span class="account-password-control">
                  <input
                    id="signup-password"
                    type="password"
                    name="password"
                    autocomplete="new-password"
                    required
                    minLength={8}
                    aria-describedby="signup-password-help"
                  />
                  <button type="button" data-password-toggle aria-pressed="false">
                    显示
                  </button>
                </span>
              </label>
              <p id="signup-password-help" class="account-password-help">
                至少 8 个字符。支持粘贴和密码管理器，不要求复杂符号组合。
              </p>
              <button type="submit" class="account-submit" data-account-submit>
                创建账户
              </button>
              <p class="account-terms">
                创建账户即表示你同意妥善使用服务。我们只用邮箱完成登录、安全通知和知识同步。
              </p>
              <p class="account-switch">
                已经有账户？<a href="/account/">返回登录</a>
              </p>
            </form>
            <div class="account-result" data-account-verify hidden>
              <p class="account-result-mark" aria-hidden="true">
                ✓
              </p>
              <h3>请验证邮箱</h3>
              <p>
                验证邮件已发送至 <strong data-account-verify-email />
              </p>
              <p>打开邮件中的链接后，你的个人知识库会自动准备好。</p>
              <a class="account-primary" href="/account/">
                返回登录
              </a>
            </div>
          </>
        )}

        {authView === "forgot" && !workspace && (
          <>
            <form class="account-form" data-account-forgot-form>
              <label for="forgot-email">
                <span>注册邮箱</span>
                <input
                  id="forgot-email"
                  type="email"
                  name="email"
                  autocomplete="email"
                  required
                  placeholder="you@example.com"
                />
              </label>
              <p class="account-help">如果这个邮箱存在账户，我们会发送一个限时有效的重置链接。</p>
              <button type="submit" class="account-submit" data-account-forgot-submit>
                发送重置邮件
              </button>
              <p class="account-switch">
                <a href="/account/">返回登录</a>
              </p>
            </form>
            <div class="account-result" data-account-email-sent hidden>
              <p class="account-result-mark" aria-hidden="true">
                →
              </p>
              <h3>请检查邮箱</h3>
              <p>
                如果 <strong data-account-forgot-email /> 已注册，你会收到一封密码重置邮件。
              </p>
              <p>没有收到？请检查垃圾邮件，或稍后再试。</p>
              <a class="account-primary" href="/account/">
                返回登录
              </a>
            </div>
          </>
        )}

        {authView === "recover" && !workspace && (
          <>
            <form class="account-form account-recovery" data-account-recovery>
              <label for="new-password">
                <span>新密码</span>
                <span class="account-password-control">
                  <input
                    id="new-password"
                    type="password"
                    name="new-password"
                    autocomplete="new-password"
                    required
                    minLength={8}
                    aria-describedby="recovery-password-help"
                  />
                  <button type="button" data-password-toggle aria-pressed="false">
                    显示
                  </button>
                </span>
              </label>
              <p id="recovery-password-help" class="account-password-help">
                至少 8 个字符，建议使用一句容易记住的长密码。
              </p>
              <label for="confirm-password">
                <span>确认新密码</span>
                <span class="account-password-control">
                  <input
                    id="confirm-password"
                    type="password"
                    name="confirm-password"
                    autocomplete="new-password"
                    required
                    minLength={8}
                  />
                  <button type="button" data-password-toggle aria-pressed="false">
                    显示
                  </button>
                </span>
              </label>
              <button type="submit" class="account-submit">
                更新密码
              </button>
              <p class="account-switch">
                链接失效？<a href="/account/forgot/">重新发送邮件</a>
              </p>
            </form>
            <div class="account-result" data-account-recovery-success hidden>
              <p class="account-result-mark" aria-hidden="true">
                ✓
              </p>
              <h3>密码已经更新</h3>
              <p>请使用新密码重新登录。</p>
              <a class="account-primary" href="/account/">
                前往登录
              </a>
            </div>
          </>
        )}

        <div class="account-session" data-account-session hidden>
          <p class="account-signed-in">
            当前账户：
            <strong data-account-email />
          </p>
          <div class="account-actions">
            <a class="account-primary" href="/workspace/knowledge/">
              进入我的知识库
            </a>
            <button type="button" class="account-secondary" data-account-signout>
              退出登录
            </button>
          </div>
        </div>
        <p class="account-status" data-account-status role="status" aria-live="polite" />
      </section>

      {workspaceView === "overview" && workspace && (
        <section
          class="workspace-overview"
          data-workspace-overview
          hidden
          aria-labelledby="workspace-overview-title"
        >
          <div class="workspace-overview-heading">
            <p class="account-kicker">START HERE / 从这里开始</p>
            <h2 id="workspace-overview-title">一次只做一件事</h2>
            <p>
              知识库负责查找和管理，工作台负责写作和导入。两个页面各司其职，也能随时从左侧切换。
            </p>
          </div>
          <div class="workspace-overview-actions">
            <a href="/workspace/knowledge/">
              <span class="workspace-overview-index">01</span>
              <strong>打开我的知识库</strong>
              <small>查看草稿、已发布内容和最近修改</small>
            </a>
            <a href="/workspace/write/">
              <span class="workspace-overview-index">02</span>
              <strong>开始写一条知识</strong>
              <small>自由粘贴、导入文件或详细整理</small>
            </a>
          </div>
          <p class="workspace-overview-note">
            新内容仍然默认仅自己可见。只有你明确选择后，它才会进入公开知识网络。
          </p>
        </section>
      )}

      {workspaceView === "settings" && (
        <section
          class="workspace-settings"
          data-profile-settings
          hidden
          aria-labelledby="profile-settings-title"
        >
          <div class="workspace-settings-heading">
            <p class="account-kicker">PROFILE / 个人资料</p>
            <h2 id="profile-settings-title">编辑个人资料</h2>
            <p>
              设置别人如何认识你。登录邮箱不会公开，下面主动填写的资料会用于个人空间和你公开分享的知识。
            </p>
          </div>
          <div class="profile-settings-layout">
            <form class="profile-settings-form" data-profile-settings-form>
              <div class="profile-avatar-editor">
                <div class="profile-avatar-preview" aria-label="当前头像">
                  <img data-profile-avatar-preview alt="当前头像预览" hidden />
                  <span data-profile-avatar-fallback aria-hidden="true">
                    我
                  </span>
                </div>
                <div class="profile-avatar-copy">
                  <strong>个人头像</strong>
                  <p>
                    选择图片后可以拖动和缩放，只保存圆形头像区域。支持 JPG、PNG 或 WebP，原图不超过
                    10 MB。
                  </p>
                  <label class="account-secondary" for="profile-avatar-input">
                    选择并裁剪图片
                  </label>
                  <input
                    id="profile-avatar-input"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    data-profile-avatar-input
                  />
                </div>
              </div>
              <label for="profile-display-name">
                <span>显示名称</span>
                <input
                  id="profile-display-name"
                  name="displayName"
                  required
                  minLength={2}
                  maxLength={40}
                  autocomplete="name"
                  data-profile-display-name
                />
                <small>必填，2–40 个字符；无需与邮箱名称相同。</small>
              </label>
              <label for="profile-signature">
                <span>
                  个性签名 <small>选填</small>
                </span>
                <input
                  id="profile-signature"
                  name="signature"
                  maxLength={80}
                  aria-describedby="profile-signature-help profile-signature-count"
                  data-profile-signature
                />
                <small id="profile-signature-help">用一句话表达你正在关注或相信的事。</small>
                <output
                  id="profile-signature-count"
                  class="profile-character-count"
                  data-profile-signature-count
                >
                  0 / 80
                </output>
              </label>
              <label for="profile-bio">
                <span>
                  个人简介 <small>选填</small>
                </span>
                <textarea
                  id="profile-bio"
                  name="bio"
                  rows={5}
                  maxLength={300}
                  aria-describedby="profile-bio-help profile-bio-count"
                  data-profile-bio
                />
                <small id="profile-bio-help">
                  可以介绍研究方向、兴趣或你希望分享的知识，最多 300 个字符。
                </small>
                <output
                  id="profile-bio-count"
                  class="profile-character-count"
                  data-profile-bio-count
                >
                  0 / 300
                </output>
              </label>
              <div class="profile-field-row">
                <label for="profile-location">
                  <span>
                    所在地 <small>选填</small>
                  </span>
                  <input
                    id="profile-location"
                    name="location"
                    maxLength={80}
                    autocomplete="address-level1"
                    data-profile-location
                  />
                </label>
                <label for="profile-website">
                  <span>
                    个人链接 <small>选填</small>
                  </span>
                  <input
                    id="profile-website"
                    name="website"
                    type="url"
                    inputMode="url"
                    maxLength={2048}
                    placeholder="https://example.com"
                    autocomplete="url"
                    data-profile-website
                  />
                </label>
              </div>
              <p class="profile-account-email">
                登录邮箱：<strong data-profile-email>—</strong> <span>仅你自己可见</span>
              </p>
              <div class="profile-settings-actions">
                <button type="submit" class="account-primary" data-profile-save>
                  保存个人资料
                </button>
                <a class="account-secondary" href="/workspace/">
                  返回个人空间
                </a>
              </div>
              <p
                class="profile-settings-status"
                data-profile-settings-status
                role="status"
                aria-live="polite"
              />
            </form>

            <aside class="profile-card-preview" aria-labelledby="profile-card-title">
              <p class="account-kicker">LIVE PREVIEW / 个人卡片</p>
              <h3 id="profile-card-title">公开资料预览</h3>
              <div class="profile-card-avatar" aria-hidden="true">
                <img data-profile-card-avatar alt="" hidden />
                <span data-profile-card-fallback>我</span>
              </div>
              <strong data-profile-card-name>我的账户</strong>
              <p class="profile-card-signature" data-profile-card-signature>
                尚未填写个性签名
              </p>
              <p class="profile-card-bio" data-profile-card-bio>
                个人简介会显示在这里。
              </p>
              <dl class="profile-card-meta">
                <div data-profile-card-location-row hidden>
                  <dt>所在地</dt>
                  <dd data-profile-card-location />
                </div>
                <div data-profile-card-website-row hidden>
                  <dt>链接</dt>
                  <dd>
                    <a data-profile-card-website target="_blank" rel="noreferrer" />
                  </dd>
                </div>
              </dl>
            </aside>
          </div>

          <dialog
            class="avatar-crop-dialog"
            data-avatar-crop-dialog
            aria-labelledby="avatar-crop-title"
            aria-describedby="avatar-crop-description"
          >
            <div class="avatar-crop-shell">
              <header>
                <div>
                  <p class="account-kicker">AVATAR / 裁剪头像</p>
                  <h3 id="avatar-crop-title">选择头像显示区域</h3>
                </div>
                <button
                  type="button"
                  class="avatar-crop-close"
                  aria-label="关闭头像裁剪"
                  data-avatar-crop-cancel
                >
                  ×
                </button>
              </header>
              <p id="avatar-crop-description">
                拖动图片调整位置，使用滑杆放大或缩小；圆形预览就是保存后的效果。
              </p>
              <div class="avatar-crop-workspace">
                <div class="avatar-crop-stage">
                  <img data-avatar-crop-image alt="待裁剪的头像图片" />
                </div>
                <div class="avatar-crop-preview-column">
                  <span>圆形预览</span>
                  <div class="avatar-crop-live-preview" data-avatar-crop-preview />
                </div>
              </div>
              <div class="avatar-crop-controls">
                <label for="avatar-crop-zoom">
                  <span>缩放</span>
                  <input
                    id="avatar-crop-zoom"
                    type="range"
                    min="0.1"
                    max="3"
                    step="0.01"
                    value="1"
                    data-avatar-crop-zoom
                  />
                </label>
                <button type="button" class="account-secondary" data-avatar-crop-reset>
                  恢复居中
                </button>
              </div>
              <p
                class="avatar-crop-status"
                data-avatar-crop-status
                role="status"
                aria-live="polite"
              />
              <footer>
                <button type="button" class="account-secondary" data-avatar-crop-cancel>
                  取消
                </button>
                <button type="button" class="account-primary" data-avatar-crop-confirm>
                  使用这个头像
                </button>
              </footer>
            </div>
          </dialog>
        </section>
      )}

      {workspaceView === "ai-settings" && (
        <section
          class="workspace-ai-settings"
          data-ai-settings
          hidden
          aria-labelledby="ai-settings-title"
        >
          <div class="workspace-ai-settings-heading">
            <p class="account-kicker">AI ASSISTANT / 安全设置</p>
            <h2 id="ai-settings-title">先设置边界，再使用 AI</h2>
            <p>
              这里控制 AI 是否启用、可以读取哪些内容，以及每月最多可以产生多少费用。默认全部关闭。
            </p>
          </div>

          <ul class="ai-trust-list" aria-label="AI 使用承诺">
            <li>
              <strong>默认关闭</strong>
              <span>你主动开启前，不会调用任何 AI 模型。</span>
            </li>
            <li>
              <strong>最少发送</strong>
              <span>优先只处理你当前选中的文字，不自动读取整个知识库。</span>
            </li>
            <li>
              <strong>由你决定</strong>
              <span>AI 只能提出建议；接受、保存和发布仍由你操作。</span>
            </li>
          </ul>

          <div class="ai-settings-layout">
            <form class="ai-settings-form" data-ai-settings-form>
              <label class="ai-toggle-card" for="ai-enabled">
                <input id="ai-enabled" name="enabled" type="checkbox" data-ai-enabled />
                <span>
                  <strong>启用 AI 助手</strong>
                  <small>开启后仍需在具体操作时确认内容范围。</small>
                </span>
              </label>

              <label class="ai-toggle-card" for="ai-private-content">
                <input
                  id="ai-private-content"
                  name="allowPrivate"
                  type="checkbox"
                  data-ai-private-content
                  disabled
                />
                <span>
                  <strong>允许处理私密知识</strong>
                  <small>敏感笔记建议保持关闭；公开内容不受此项影响。</small>
                </span>
              </label>

              <label class="ai-settings-field" for="ai-grounding-mode">
                <span>默认读取范围</span>
                <select id="ai-grounding-mode" name="groundingMode" data-ai-grounding-mode>
                  <option value="selected_only">仅我选中的文字（推荐）</option>
                  <option value="knowledge_base">当前知识库中允许的内容</option>
                </select>
                <small>每次实际调用前，界面还会再次显示将要发送的范围。</small>
              </label>

              <label class="ai-settings-field" for="ai-monthly-budget">
                <span>每月费用上限</span>
                <select id="ai-monthly-budget" name="monthlyBudget" data-ai-monthly-budget>
                  <option value="0">不开启付费调用（推荐）</option>
                  <option value="500">不超过 ¥5</option>
                  <option value="1000">不超过 ¥10</option>
                  <option value="2000">不超过 ¥20</option>
                </select>
                <small>
                  达到上限后自动停止。设置额度不会立即产生费用；只有站点实时开关和你的个人开关同时开启后，才允许付费调用。
                </small>
              </label>

              <div class="ai-settings-actions">
                <button type="submit" class="account-primary" data-ai-save>
                  保存 AI 设置
                </button>
                <a class="account-secondary" href="/workspace/">
                  返回个人空间
                </a>
              </div>
              <p
                class="ai-settings-status"
                data-ai-settings-status
                role="status"
                aria-live="polite"
              />
            </form>

            <aside class="ai-stage-card" aria-labelledby="ai-stage-title">
              <span class="ai-stage-badge">DeepSeek 已配置 · 实时调用默认关闭</span>
              <h3 id="ai-stage-title">当前阶段</h3>
              <p>
                服务端已配置 DeepSeek
                适配器，但站点实时开关仍保持关闭。关闭时，测试按钮只验证登录、权限和安全网关，不会发送你的笔记，也不会产生模型费用。
              </p>
              <ol class="ai-stage-list">
                <li>你的 AI 开关、数据范围和额度分别保存</li>
                <li>付费调用还必须通过站点实时开关、身份、权限和预算检查</li>
                <li>当前不会把私人笔记发送给 DeepSeek</li>
              </ol>
              <button type="button" class="account-secondary" data-ai-test-gateway>
                测试安全网关
              </button>
              <p
                class="ai-gateway-status"
                data-ai-gateway-status
                role="status"
                aria-live="polite"
              />
            </aside>
          </div>
        </section>
      )}

      {workspaceView === "site" && (
        <section
          class="workspace-site"
          data-site-operations
          hidden
          aria-labelledby="site-operations-title"
        >
          <div class="workspace-site-heading">
            <div>
              <p class="account-kicker">SITE OPERATIONS / 站点运营</p>
              <h2 id="site-operations-title">照看公开空间，不越过私密边界</h2>
              <p>
                这里仅处理公开反馈、协作者角色和发布链路状态。站点权限不会让任何人读取其他账户的私密草稿。
              </p>
            </div>
            <button type="button" class="account-secondary" data-site-refresh hidden>
              刷新运营状态
            </button>
          </div>

          <div class="site-access-state" data-site-access-loading role="status" aria-live="polite">
            <strong>正在确认站点权限</strong>
            <span>权限确认前不会读取反馈、账户目录或运营状态。</span>
          </div>

          <section
            class="site-access-denied"
            data-site-access-denied
            role="alert"
            aria-live="assertive"
            tabIndex={-1}
            hidden
          >
            <p class="account-kicker">ACCESS / 访问范围</p>
            <h3>当前账户没有站点运营权限</h3>
            <p data-site-access-message>
              你仍然可以正常管理自己的知识库；站点运营仅对经过授权的协作者开放。
            </p>
            <a class="account-primary" href="/workspace/">
              返回个人空间
            </a>
          </section>

          <div class="site-operations-content" data-site-operations-content hidden>
            <header class="site-scope-note">
              <div>
                <span>当前范围</span>
                <strong data-site-role-label>正在确认</strong>
              </div>
              <p data-site-scope-copy>
                只显示当前角色可以处理的站点任务，不读取普通用户的私密正文。
              </p>
            </header>

            <section
              class="site-operations-section site-review-section"
              data-site-review-section
              hidden
              aria-labelledby="site-review-title"
            >
              <div class="site-section-heading">
                <div>
                  <p class="account-kicker">FEEDBACK / 公开反馈</p>
                  <h3 id="site-review-title">评论与纠错队列</h3>
                  <p>按最新时间查看公开讨论和结构化纠错；软删除会立即把内容从公开页面隐藏。</p>
                </div>
                <button type="button" class="account-secondary" data-site-review-refresh>
                  刷新反馈
                </button>
              </div>
              <div class="site-review-toolbar">
                <p data-site-review-summary>尚未读取反馈。</p>
                <label>
                  <span>显示数量</span>
                  <select data-site-review-limit>
                    <option value="20">最近 20 条</option>
                    <option value="50">最近 50 条</option>
                  </select>
                </label>
              </div>
              <p
                class="site-inline-status"
                data-site-review-status
                role="status"
                aria-live="polite"
              />
              <div class="site-review-list" data-site-review-list />
            </section>

            <section
              class="site-operations-section site-role-section"
              data-site-role-section
              hidden
              aria-labelledby="site-role-title"
            >
              <div class="site-section-heading">
                <div>
                  <p class="account-kicker">ACCESS / 协作者权限</p>
                  <h3 id="site-role-title">账户与站点角色</h3>
                  <p>
                    角色变更立即生效。普通用户只管理自己的知识；编辑者可进入运营状态页；管理员还可处理公开反馈。
                  </p>
                </div>
                <button type="button" class="account-secondary" data-site-role-refresh>
                  刷新账户
                </button>
              </div>
              <form class="site-role-form" data-site-role-form>
                <label>
                  <span>账户邮箱</span>
                  <input
                    type="email"
                    name="targetEmail"
                    autocomplete="off"
                    placeholder="user@example.com"
                    required
                    data-site-role-email
                  />
                </label>
                <label>
                  <span>新的站点角色</span>
                  <select name="targetRole" data-site-role-select>
                    <option value="user">普通用户 — 移除站点权限</option>
                    <option value="editor">编辑者 — 查看站点运营状态</option>
                    <option value="admin">管理员 — 可处理公开反馈</option>
                  </select>
                </label>
                <div class="site-role-consequence" data-site-role-consequence>
                  对方将只能访问自己的账户与个人知识工作区。
                </div>
                <button type="submit" class="account-primary" data-site-role-submit>
                  确认角色变更
                </button>
              </form>
              <p
                class="site-inline-status"
                data-site-role-status
                role="status"
                aria-live="polite"
              />
              <div class="site-role-directory" data-site-role-list />
            </section>

            <section
              class="site-operations-section site-system-section"
              data-site-system-section
              aria-labelledby="site-system-title"
            >
              <div class="site-section-heading">
                <div>
                  <p class="account-kicker">STATUS / 非敏感检查</p>
                  <h3 id="site-system-title">会话与发布链路</h3>
                  <p>
                    检查登录会话、权限 RPC 和公开发布读取链路，不显示密钥、提示词或任何私密正文。
                  </p>
                </div>
                <time data-site-status-time />
              </div>
              <div class="site-status-list" data-site-status-list aria-live="polite" />
            </section>
          </div>
        </section>
      )}

      {workspaceView === "knowledge" && (
        <section
          class="workspace-library"
          data-workspace-library
          aria-labelledby="library-title"
          hidden
        >
          <div class="workspace-library-heading">
            <div>
              <p class="account-kicker">MY KNOWLEDGE / 我的知识</p>
              <h2 id="library-title">你的知识草稿</h2>
            </div>
            <div class="workspace-library-actions">
              <a class="account-secondary" href="/workspace/write/?action=import">
                导入文件
              </a>
              <a class="account-secondary" href="/workspace/write/?mode=free">
                自由工作台
              </a>
              <a class="account-primary" href="/workspace/write/?mode=detailed">
                新建知识
              </a>
            </div>
          </div>
          <div class="workspace-library-tools" data-library-tools hidden>
            <label class="workspace-library-search" for="library-search">
              <span>搜索我的知识</span>
              <input
                id="library-search"
                type="search"
                placeholder="例如：RCWA、边界条件"
                autocomplete="off"
                data-library-search
              />
            </label>
            <fieldset class="workspace-library-filters">
              <legend>显示范围</legend>
              <label>
                <input type="radio" name="library-filter" value="all" checked />
                <span>全部</span>
              </label>
              <label>
                <input type="radio" name="library-filter" value="draft" />
                <span>草稿</span>
              </label>
              <label>
                <input type="radio" name="library-filter" value="published" />
                <span>已发布</span>
              </label>
            </fieldset>
          </div>
          <section
            class="workspace-first-run"
            data-library-empty
            hidden
            aria-labelledby="first-run-title"
          >
            <p class="account-kicker">READY / 已准备</p>
            <h3 id="first-run-title">你的个人知识库已经准备好</h3>
            <p>先写下一条你真正想保留的知识。它会默认仅自己可见，整理好后再决定是否分享。</p>
            <ol>
              <li>
                <span>01</span>写下一个问题或结论
              </li>
              <li>
                <span>02</span>补充来源、标签和关联
              </li>
              <li>
                <span>03</span>准备好后再公开分享
              </li>
            </ol>
            <a class="account-primary" href="/workspace/write/?mode=detailed">
              写下第一条知识
            </a>
          </section>
          <p
            class="workspace-library-result-status"
            data-library-result-status
            role="status"
            aria-live="polite"
          />
          <section class="workspace-library-no-results" data-library-no-results hidden>
            <h3>没有找到符合条件的知识</h3>
            <p>试试缩短关键词，或清除当前搜索和筛选。</p>
            <button type="button" class="account-secondary" data-library-clear>
              查看全部知识
            </button>
          </section>
          <div class="workspace-library-list" data-library-list />
        </section>
      )}

      {workspaceView === "write" && (
        <section
          class="workspace-write-launcher"
          data-write-launcher
          hidden
          aria-labelledby="write-launcher-title"
        >
          <div class="workspace-write-launcher-heading">
            <p class="account-kicker">CHOOSE A START / 选择起点</p>
            <h2 id="write-launcher-title">这次准备怎样开始？</h2>
            <p>三种方式最终都会保存到同一个个人知识库，且默认仅自己可见。</p>
          </div>
          <div class="workspace-write-options">
            <button type="button" data-open-flat-workbench>
              <span>适合整篇文稿</span>
              <strong>自由工作台</strong>
              <small>直接粘贴 Markdown 或从 Word 复制全文</small>
            </button>
            <button type="button" data-new-document>
              <span>适合边写边整理</span>
              <strong>详细编辑器</strong>
              <small>补充标签、关系、来源与分享范围</small>
            </button>
            <button type="button" data-open-import>
              <span>适合已有文件</span>
              <strong>导入 DOCX / Markdown</strong>
              <small>转换后先检查，再保存为私密草稿</small>
            </button>
          </div>
        </section>
      )}

      {workspaceView === "write" && (
        <dialog
          class="knowledge-import"
          data-knowledge-import
          aria-labelledby="knowledge-import-title"
        >
          <form method="dialog" class="knowledge-import-shell" data-import-form>
            <header class="knowledge-import-heading">
              <div>
                <p class="account-kicker">IMPORT / 导入知识</p>
                <h2 id="knowledge-import-title">从已有文件开始</h2>
                <p>文件只在当前浏览器中转换。确认前不会保存，也不会公开。</p>
              </div>
              <button
                type="button"
                class="knowledge-import-close"
                data-import-close
                aria-label="关闭导入窗口"
              >
                ×
              </button>
            </header>
            <label
              class="knowledge-import-dropzone"
              data-import-dropzone
              aria-busy="false"
              aria-describedby="knowledge-import-constraints knowledge-import-status"
            >
              <input
                type="file"
                accept=".docx,.md,.markdown,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                data-import-file
              />
              <span class="knowledge-import-icon" aria-hidden="true">
                ↥
              </span>
              <strong>选择 DOCX 或 Markdown 文件</strong>
              <span>也可以把文件拖到这里</span>
              <small id="knowledge-import-constraints">
                DOCX 会保留常见标题、列表、表格与内嵌图片；Markdown 请使用 UTF-8
                编码；单个文件不超过 10 MB。
              </small>
            </label>
            <dl class="knowledge-import-file" data-import-file-context hidden>
              <div>
                <dt>当前文件</dt>
                <dd data-import-file-name>—</dd>
              </div>
              <div>
                <dt>文件大小</dt>
                <dd data-import-file-size>—</dd>
              </div>
              <div>
                <dt>识别类型</dt>
                <dd data-import-file-type>—</dd>
              </div>
            </dl>
            <section
              class="knowledge-import-result"
              data-import-result
              hidden
              aria-labelledby="knowledge-import-result-title"
            >
              <div>
                <p class="account-kicker">READY / 转换完成</p>
                <h3 id="knowledge-import-result-title" data-import-result-title>
                  文件已准备好
                </h3>
              </div>
              <dl>
                <div>
                  <dt>标题</dt>
                  <dd data-import-title>—</dd>
                </div>
                <div>
                  <dt>正文</dt>
                  <dd data-import-size>—</dd>
                </div>
                <div>
                  <dt>图片</dt>
                  <dd data-import-images>—</dd>
                </div>
              </dl>
              <div class="knowledge-import-notes" data-import-notes hidden>
                <strong>转换提示</strong>
                <ul data-import-note-list />
              </div>
              <div class="knowledge-import-preview">
                <strong>正文结构与图片预览</strong>
                <div data-import-preview aria-busy="false" />
              </div>
              <p>
                下一步只会把内容放入编辑器作为私密草稿，不会立即保存或公开。请检查排版后再保存或分享。
              </p>
            </section>
            <div class="knowledge-import-feedback">
              <p
                id="knowledge-import-status"
                class="knowledge-import-status"
                data-import-status
                role="status"
                aria-live="polite"
              />
              <button type="button" class="account-secondary" data-import-retry hidden>
                重新读取这个文件
              </button>
            </div>
            <div class="knowledge-import-actions">
              <button type="button" class="account-secondary" data-import-cancel>
                取消
              </button>
              <button type="button" class="account-primary" data-import-confirm disabled>
                放入编辑器作为私密草稿
              </button>
            </div>
          </form>
        </dialog>
      )}

      {workspaceView === "write" && (
        <section
          class="flat-workbench"
          data-flat-workbench
          aria-labelledby="flat-workbench-title"
          hidden
        >
          <div class="flat-workbench-heading">
            <div>
              <p class="account-kicker">QUICK DRAFT / 自由工作台</p>
              <h2 id="flat-workbench-title">整篇粘贴，连续写完</h2>
              <p>
                无需先整理标签或关系。直接粘贴 Markdown，或从 Word
                复制整篇文稿；保存后再决定是否继续整理。
              </p>
            </div>
            <button type="button" class="account-secondary" data-close-flat-workbench>
              返回知识库
            </button>
          </div>
          <form class="flat-workbench-form" data-flat-workbench-form>
            <label for="flat-workbench-title-input">
              <span>标题</span>
              <input
                id="flat-workbench-title-input"
                name="flatTitle"
                required
                placeholder="粘贴含一级标题的文稿时可自动识别"
                data-flat-title
              />
            </label>
            <label for="flat-workbench-body">
              <span>整篇正文</span>
              <textarea
                id="flat-workbench-body"
                name="flatBody"
                rows={24}
                required
                placeholder="在这里直接粘贴 Markdown，或从 Word 复制全文。Word 的常见排版和剪贴板图片会自动转换。"
                data-flat-body
              />
            </label>
            <div class="flat-workbench-guidance" aria-label="粘贴说明">
              <span>
                <strong>Markdown</strong> 保持原格式
              </span>
              <span>
                <strong>Word</strong> 转换为可编辑正文
              </span>
              <span>
                <strong>默认</strong> 仅自己可见
              </span>
            </div>
            <p class="flat-workbench-status" data-flat-status role="status" aria-live="polite">
              等待粘贴或书写。
            </p>
            <div class="flat-workbench-actions">
              <button type="submit" class="account-primary" data-flat-save>
                保存为私密草稿
              </button>
              <button type="button" class="account-secondary" data-flat-organize>
                进入详细整理
              </button>
              <button type="button" class="flat-workbench-clear" data-flat-clear>
                清空
              </button>
            </div>
          </form>
        </section>
      )}

      {workspaceView === "write" && (
        <section class="editor-panel" data-editor-panel aria-labelledby="editor-title" hidden>
          <div class="editor-panel-heading">
            <div>
              <p class="account-kicker">WORKSPACE / 工作台</p>
              <h2 id="editor-title">新建一条知识</h2>
            </div>
            <span
              class="editor-save-state"
              data-editor-state
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              尚未保存
            </span>
          </div>
          <section class="editor-load-recovery" data-editor-load-recovery role="alert" hidden>
            <div>
              <strong data-editor-load-recovery-title>这条知识还没有完整载入</strong>
              <p data-editor-load-recovery-message>
                编辑器已暂停，避免用不完整的数据覆盖标签、关系、来源或发布状态。
              </p>
            </div>
            <button type="button" class="account-secondary" data-editor-retry-load>
              重新加载文档
            </button>
            <div class="editor-recovery-actions" data-editor-manual-recovery-actions hidden>
              <button type="button" class="account-secondary" data-editor-recovery-export>
                导出旧版恢复包
              </button>
              <button type="button" class="account-secondary" data-editor-recovery-archive disabled>
                已保存导出文件，归档并清除旧记录
              </button>
              <small data-editor-manual-recovery-status>
                必须先导出；只有再次明确确认后才会清除原记录。
              </small>
            </div>
          </section>
          <form class="editor-form" data-editor-form>
            <input type="hidden" name="documentId" />
            <input type="hidden" name="revision" value="0" />
            <input type="hidden" name="status" value="draft" />
            <section class="editor-writing" aria-labelledby="writing-title">
              <div class="editor-section-heading">
                <p class="account-kicker">STEP 1 / 先写下来</p>
                <h3 id="writing-title">这条知识讲什么？</h3>
              </div>
              <label>
                <span>标题</span>
                <input name="title" required placeholder="例如：我终于理解了 RCWA 的边界条件" />
              </label>
              <label>
                <span>正文</span>
                <textarea
                  name="body"
                  rows={14}
                  placeholder="先用自己的话写下问题、理解或经验。不必一开始就整理完整。"
                />
              </label>
              <section
                class="editor-ai-assist"
                data-ai-suggestion-assist
                aria-labelledby="editor-ai-title"
              >
                <div class="editor-ai-heading">
                  <div>
                    <p class="account-kicker">AI / 先预览，再决定</p>
                    <h4 id="editor-ai-title">只改你选中的这一段</h4>
                  </div>
                  <span class="editor-ai-availability" data-ai-suggestion-availability>
                    正在检查使用边界
                  </span>
                </div>
                <p class="editor-ai-intro">
                  先在正文中选择文字。建议会出现在正文旁边；没有你的确认，不会替换、插入或发布内容。
                </p>
                <div class="editor-ai-toolbar">
                  <label>
                    <span>想怎么改</span>
                    <select data-ai-suggestion-action>
                      <option value="rewrite">润色表达</option>
                      <option value="shorten">缩短一点</option>
                      <option value="expand">补充说明</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    class="account-secondary"
                    data-ai-suggestion-generate
                    disabled
                  >
                    AI 帮我改
                  </button>
                </div>
                <p
                  class="editor-ai-status"
                  data-ai-suggestion-status
                  role="status"
                  aria-live="polite"
                >
                  先选择 1–12,000 个字符。
                </p>
                <p class="editor-ai-boundary" data-ai-suggestion-boundary>
                  当前阶段不会扩大 DeepSeek
                  的内容范围；未开放选区模型时，只验证安全网关且不产生费用。{" "}
                  <a href="/workspace/settings/ai/">查看 AI 设置</a>
                </p>
                <section
                  class="editor-ai-preview"
                  data-ai-suggestion-preview
                  aria-labelledby="editor-ai-preview-title"
                  hidden
                >
                  <div class="editor-ai-preview-heading">
                    <div>
                      <p class="account-kicker">REVIEW / 修改预览</p>
                      <h5 id="editor-ai-preview-title">先比较，再写回正文</h5>
                    </div>
                    <span data-ai-suggestion-mode>安全网关检查</span>
                  </div>
                  <div class="editor-ai-comparison">
                    <div>
                      <strong>原选区</strong>
                      <pre data-ai-suggestion-original tabIndex={0} aria-label="原选区全文" />
                    </div>
                    <div>
                      <strong>建议</strong>
                      <pre data-ai-suggestion-output tabIndex={0} aria-label="AI 建议全文" />
                    </div>
                  </div>
                  <div class="editor-ai-actions">
                    <button
                      type="button"
                      class="account-primary"
                      data-ai-suggestion-replace
                      disabled
                    >
                      替换选区
                    </button>
                    <button
                      type="button"
                      class="account-secondary"
                      data-ai-suggestion-insert
                      disabled
                    >
                      插入下方
                    </button>
                    <button type="button" class="account-secondary" data-ai-suggestion-regenerate>
                      重新生成
                    </button>
                    <button type="button" class="editor-ai-discard" data-ai-suggestion-discard>
                      放弃这条建议
                    </button>
                  </div>
                </section>
              </section>
              <div class="editor-modules" aria-label="快速添加内容">
                <button type="button" data-module="question">
                  ＋ 待解决问题
                </button>
                <button type="button" data-module="relation">
                  ＋ 关联已有知识
                </button>
                <button type="button" data-module="source">
                  ＋ 补充来源
                </button>
              </div>
            </section>

            <details class="editor-disclosure" data-editor-section="organize">
              <summary>
                <span>
                  <strong>整理这条知识</strong>
                  <small>主题、成熟度和标签</small>
                </span>
                <span class="editor-optional">可选</span>
              </summary>
              <div class="editor-disclosure-content">
                <div class="editor-grid">
                  <label>
                    <span>主题</span>
                    <select name="topic">
                      <option value="">稍后再归类</option>
                      <option>数学</option>
                      <option>物理与光学</option>
                      <option>计算与仿真</option>
                      <option>研究方法</option>
                    </select>
                  </label>
                  <label>
                    <span>成熟度</span>
                    <select name="maturity">
                      <option value="seed">萌芽：刚记下</option>
                      <option value="growing">整理中：仍在补充</option>
                      <option value="stable">相对完整：可以分享</option>
                    </select>
                  </label>
                </div>
                <section class="organization-editor tag-editor" aria-labelledby="tag-editor-title">
                  <div class="organization-editor-heading">
                    <div>
                      <strong id="tag-editor-title">标签</strong>
                      <small id="tag-editor-help">从已有标签中选择，或明确创建一个新标签。</small>
                    </div>
                  </div>
                  <div class="organization-entry-row">
                    <label>
                      <span>搜索或输入标签名称</span>
                      <input
                        data-tag-input
                        list="tag-options"
                        maxLength={80}
                        placeholder="例如：RCWA"
                        aria-describedby="tag-editor-help tag-editor-status"
                      />
                    </label>
                    <button type="button" class="account-secondary" data-tag-add>
                      添加标签
                    </button>
                  </div>
                  <datalist id="tag-options" data-tag-options />
                  <div
                    class="organization-chip-list"
                    data-tag-list
                    role="list"
                    aria-label="已选择的标签"
                  />
                  <input type="hidden" name="tags" data-tag-values />
                  <p id="tag-editor-status" data-tag-status role="status" aria-live="polite" />
                </section>
                <div class="editor-assist">
                  <button type="button" class="account-secondary" data-auto-classify>
                    获取主题建议
                  </button>
                  <p data-classify-status role="status" aria-live="polite" />
                  <button type="button" class="account-secondary" data-apply-topic hidden>
                    采用建议
                  </button>
                </div>
              </div>
            </details>

            <details class="editor-disclosure" data-editor-section="connections">
              <summary>
                <span>
                  <strong>连接知识与来源</strong>
                  <small>建立前置、相关和外部出处</small>
                </span>
                <span class="editor-optional">可选</span>
              </summary>
              <div class="editor-disclosure-content editor-links" data-editor-links>
                <section
                  class="organization-editor relation-editor"
                  data-relation-editor="prerequisite"
                  aria-labelledby="prerequisite-editor-title"
                >
                  <div class="organization-editor-heading">
                    <div>
                      <strong id="prerequisite-editor-title">前置知识</strong>
                      <small>阅读当前知识前，建议先读哪些内容？</small>
                    </div>
                  </div>
                  <div class="relation-picker">
                    <label>
                      <span>按标题搜索自己的知识</span>
                      <input
                        type="search"
                        data-relation-search
                        placeholder="输入标题关键词"
                        autocomplete="off"
                      />
                    </label>
                    <label>
                      <span>选择知识</span>
                      <select data-relation-select aria-describedby="prerequisite-status">
                        <option value="">请先选择一条知识</option>
                      </select>
                    </label>
                    <button type="button" class="account-secondary" data-relation-add>
                      添加前置知识
                    </button>
                  </div>
                  <div
                    class="organization-chip-list"
                    data-relation-list
                    role="list"
                    aria-label="已选择的前置知识"
                  />
                  <input type="hidden" name="prerequisites" data-relation-values />
                  <p
                    id="prerequisite-status"
                    data-relation-status
                    role="status"
                    aria-live="polite"
                  />
                </section>
                <section
                  class="organization-editor relation-editor"
                  data-relation-editor="related"
                  aria-labelledby="related-editor-title"
                >
                  <div class="organization-editor-heading">
                    <div>
                      <strong id="related-editor-title">相关知识</strong>
                      <small>选择讨论相近主题、适合继续阅读的内容。</small>
                    </div>
                  </div>
                  <div class="relation-picker">
                    <label>
                      <span>按标题搜索自己的知识</span>
                      <input
                        type="search"
                        data-relation-search
                        placeholder="输入标题关键词"
                        autocomplete="off"
                      />
                    </label>
                    <label>
                      <span>选择知识</span>
                      <select data-relation-select aria-describedby="related-status">
                        <option value="">请先选择一条知识</option>
                      </select>
                    </label>
                    <button type="button" class="account-secondary" data-relation-add>
                      添加相关知识
                    </button>
                  </div>
                  <div
                    class="organization-chip-list"
                    data-relation-list
                    role="list"
                    aria-label="已选择的相关知识"
                  />
                  <input type="hidden" name="related" data-relation-values />
                  <p id="related-status" data-relation-status role="status" aria-live="polite" />
                </section>
                <section
                  class="source-editor"
                  data-source-editor
                  aria-labelledby="source-editor-title"
                >
                  <div class="source-editor-heading">
                    <div>
                      <strong id="source-editor-title">引用来源</strong>
                      <small>记录网页出处或你自己的实践经验；可以添加多条。</small>
                    </div>
                    <button type="button" class="account-secondary" data-source-add>
                      ＋ 添加来源
                    </button>
                  </div>
                  <p class="source-empty" data-source-empty>
                    还没有来源。知识也可以先从个人理解开始，稍后再补充依据。
                  </p>
                  <div class="source-list" data-source-list />
                  <p class="source-status" data-source-status role="status" aria-live="polite" />
                </section>
              </div>
            </details>

            <details class="editor-disclosure" data-editor-section="sharing">
              <summary>
                <span>
                  <strong>预览与分享</strong>
                  <small>默认仅自己可见，准备好后再改变</small>
                </span>
                <span class="editor-optional">最后一步</span>
              </summary>
              <div class="editor-disclosure-content">
                <fieldset class="visibility-options">
                  <legend>谁可以看到这条知识？</legend>
                  <label>
                    <input type="radio" name="visibility" value="private" checked />
                    <span>
                      <strong>仅自己可见</strong>
                      <small>安全保存为私人草稿，不会出现在公开页面。</small>
                    </span>
                  </label>
                  <label>
                    <input type="radio" name="visibility" value="unlisted" />
                    <span>
                      <strong>持链接可见</strong>
                      <small>只有得到链接的人能阅读，不进入搜索和主题目录。</small>
                    </span>
                  </label>
                  <label>
                    <input type="radio" name="visibility" value="public" />
                    <span>
                      <strong>公开到知识网络</strong>
                      <small>进入 wouldkeep 的搜索、主题和关系网络。</small>
                    </span>
                  </label>
                </fieldset>
                <div class="preview-action">
                  <button type="button" class="account-secondary" data-preview-document>
                    在发布前预览
                  </button>
                  <small>预览只在当前浏览器中生成，不会改变可见范围，也不会公开内容。</small>
                </div>
                <section class="publication-control" aria-labelledby="publication-control-title">
                  <div>
                    <strong id="publication-control-title">正式发布</strong>
                    <p data-publication-status>
                      先保存草稿并选择“持链接可见”或“公开到知识网络”。发布是一个单独动作。
                    </p>
                  </div>
                  <div class="publication-actions">
                    <button type="button" class="account-primary" data-publish-document>
                      发布这条知识
                    </button>
                    <a
                      class="account-secondary publication-link"
                      data-publication-link
                      hidden
                      target="_blank"
                      rel="noreferrer"
                    >
                      打开阅读页
                    </a>
                    <button
                      type="button"
                      class="account-secondary"
                      data-copy-publication-link
                      hidden
                    >
                      复制阅读链接
                    </button>
                    <button
                      type="button"
                      class="publication-unpublish"
                      data-unpublish-document
                      hidden
                    >
                      撤回发布
                    </button>
                  </div>
                  <small>
                    公开内容会进入发现列表；持链接内容不进入列表。撤回后原阅读链接立即失效，私人草稿和历史版本仍会保留。
                  </small>
                </section>
              </div>
            </details>
            <section
              class="knowledge-preview"
              data-document-preview
              hidden
              aria-labelledby="knowledge-preview-title"
            >
              <div class="knowledge-preview-heading">
                <div>
                  <p class="account-kicker">PREVIEW / 阅读视角</p>
                  <h3 id="knowledge-preview-title" data-preview-title>
                    未命名知识
                  </h3>
                </div>
                <button type="button" class="account-secondary" data-preview-close>
                  返回编辑
                </button>
              </div>
              <p class="knowledge-preview-visibility" data-preview-visibility>
                仅自己可见 · 本地预览
              </p>
              <div class="knowledge-preview-body" data-preview-body />
              <section class="knowledge-preview-sources" data-preview-sources-section hidden>
                <h4>来源与依据</h4>
                <ol data-preview-sources />
              </section>
            </section>
            <section
              class="editor-conflict"
              data-editor-conflict
              aria-labelledby="editor-conflict-title"
              hidden
            >
              <div class="editor-conflict-heading">
                <div>
                  <p class="account-kicker">RECOVERY / 版本恢复</p>
                  <h3 id="editor-conflict-title" tabIndex={-1} data-editor-conflict-title>
                    本地稿和云端稿都已保留
                  </h3>
                </div>
                <span data-editor-conflict-meta>自动同步已暂停</span>
              </div>
              <p data-editor-conflict-message>
                这条知识在另一处发生了修改。请先比较，再明确选择要继续使用的版本。
              </p>
              <div class="editor-conflict-compare">
                <section aria-labelledby="editor-conflict-local-title">
                  <h4 id="editor-conflict-local-title">我的本地版本</h4>
                  <strong data-editor-conflict-local-title>未命名知识</strong>
                  <pre data-editor-conflict-local-body />
                  <p class="editor-conflict-organization" data-editor-conflict-local-organization />
                </section>
                <section aria-labelledby="editor-conflict-cloud-title">
                  <h4 id="editor-conflict-cloud-title">当前云端版本</h4>
                  <strong data-editor-conflict-cloud-title>未命名知识</strong>
                  <pre data-editor-conflict-cloud-body />
                  <p class="editor-conflict-organization" data-editor-conflict-cloud-organization />
                </section>
              </div>
              <div class="editor-conflict-actions">
                <button type="button" data-conflict-use-local>
                  保留我的版本
                </button>
                <button type="button" class="account-secondary" data-conflict-use-cloud>
                  采用云端版本
                </button>
                <button type="button" class="account-secondary" data-conflict-save-copy>
                  另存为私密副本
                </button>
                <button type="button" class="account-secondary" data-conflict-export-local>
                  导出本地恢复稿
                </button>
              </div>
              <small>选择前不会写入云端；采用云端时，本地稿仍会保留为恢复副本。</small>
            </section>
            <div class="editor-actions">
              <button type="submit" data-save-document>
                保存为草稿
              </button>
              <button type="button" class="account-secondary" data-editor-clear>
                清空
              </button>
            </div>
            <section
              class="editor-history"
              data-editor-history
              aria-labelledby="editor-history-title"
              hidden
            >
              <div>
                <p class="account-kicker">HISTORY / 版本</p>
                <h3 id="editor-history-title">最近保存</h3>
              </div>
              <div class="editor-history-list" data-editor-history-list />
            </section>
            <p class="editor-note">
              登录后优先保存到你的云端知识库；网络暂时不可用时，会保留一份本地备份。
            </p>
          </form>
        </section>
      )}
    </div>
  )
}

AccountPage.css = style
AccountPage.afterDOMLoaded = script
export default (() => AccountPage) satisfies QuartzComponentConstructor
