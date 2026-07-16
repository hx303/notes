import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import style from "./styles/accountPage.scss"
// @ts-ignore
import script from "./scripts/accountPage.inline"

const supabaseUrl = "https://agocyybolrisqujvjqdj.supabase.co"
const supabaseAnonKey = "sb_publishable_9gb7jev7Ytwa6xQC75_ShQ_z3TJ6IZc"

type AuthView = "signin" | "signup" | "forgot" | "recover"
type WorkspaceView = "overview" | "knowledge" | "write" | "settings" | "ai-settings"

const authViewForSlug = (slug = ""): AuthView => {
  if (slug.includes("account/signup")) return "signup"
  if (slug.includes("account/forgot")) return "forgot"
  if (slug.includes("account/recover")) return "recover"
  return "signin"
}

const workspaceViewForSlug = (slug = ""): WorkspaceView => {
  if (/^workspace\/knowledge(?:\/index)?$/.test(slug)) return "knowledge"
  if (/^workspace\/write(?:\/index)?$/.test(slug)) return "write"
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
            <a href="/admin/" data-site-owner-nav hidden>
              <span aria-hidden="true">◆</span>
              <span>
                <strong>站点管理</strong>
                <small>站长专用工具</small>
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
                <small>达到上限后自动停止。第一阶段不会产生任何模型费用。</small>
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
              <span class="ai-stage-badge">安全骨架 · 未连接付费模型</span>
              <h3 id="ai-stage-title">当前阶段</h3>
              <p>
                现在只搭建设置、权限和调用入口。测试按钮只验证安全网关，不会发送你的笔记，也不会产生费用。
              </p>
              <ol class="ai-stage-list">
                <li>保存个人开关与额度</li>
                <li>验证登录身份和请求格式</li>
                <li>下一阶段再由站长配置模型密钥</li>
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
            <label class="knowledge-import-dropzone" data-import-dropzone>
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
              <small>DOCX 会保留常见标题、列表、表格与内嵌图片；单个文件不超过 10 MB。</small>
            </label>
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
              <p>下一步会把内容放入编辑器，并保持“仅自己可见”。请检查排版后再保存或分享。</p>
            </section>
            <p
              class="knowledge-import-status"
              data-import-status
              role="status"
              aria-live="polite"
            />
            <div class="knowledge-import-actions">
              <button type="button" class="account-secondary" data-import-cancel>
                取消
              </button>
              <button type="button" class="account-primary" data-import-confirm disabled>
                放入编辑器检查
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
            <span class="editor-save-state" data-editor-state>
              尚未保存
            </span>
          </div>
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
                <label>
                  <span>标签</span>
                  <input name="tags" list="tag-options" placeholder="例如：RCWA，边界条件" />
                  <datalist id="tag-options" data-tag-options />
                  <small>用少量关键词连接同一主题下的知识，多个标签用逗号分隔。</small>
                </label>
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
                <label>
                  <span>前置知识</span>
                  <input
                    name="prerequisites"
                    list="knowledge-link-options"
                    placeholder="搜索你的已有知识标题"
                  />
                  <small>读者最好先理解什么？</small>
                </label>
                <label>
                  <span>相关知识</span>
                  <input
                    name="related"
                    list="knowledge-link-options"
                    placeholder="搜索你的已有知识标题"
                  />
                  <small>还可以从哪里继续了解？</small>
                </label>
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
                <datalist id="knowledge-link-options" data-knowledge-link-options />
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
