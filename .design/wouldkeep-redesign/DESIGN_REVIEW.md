# wouldkeep 基础阶段设计审查（F01–F06）

日期：2026-07-11  
审查范围：已完成的基础与风险验证 F01–F06  
依据：`DESIGN_BRIEF.md`、`INFORMATION_ARCHITECTURE.md`、`VISUAL_SYSTEM.md`、`quartz/styles/tokens.scss`，以及 Vercel Labs Web Interface Guidelines。

## 审查结论

基础层已经建立了可信的继续开发起点：语义页面外壳、双品牌页眉、四项主导航、稳定 URL 与公开知识元数据、代表性文章头部，以及三档断点的基础回归证据都已落地。代表性文章已明显接近“个人档案馆 × 公共知识网络”的安静、编辑式气质，深色模式尤其完整。

本轮是**阶段检查，不是最终 V01 验收**。`TASKS.md` 中 R、D、M、C、Q 任务仍未完成，V01 明确依赖 Q05；因此本轮不勾选 V01，也不把计划内尚未实现的页面误判为 F01–F06 回归。

当前可进入下一实施任务 R01，但不具备发布条件。发布前必须优先解决：主入口仍为占位内容、本文目录低对比度、评论失败静默三个问题。

## 截图证据

| 场景 | 证据 | 备注 |
| --- | --- | --- |
| 代表性文章，浅色桌面 | `screenshots/review-article-header-light-desktop.png` | 标题、摘要、元数据和正文起点层级清楚；背景仍使用旧主题色。 |
| 代表性文章，深色桌面 | `screenshots/review-article-header-dark-desktop.png` | 深色调性协调；右侧目录仍过淡。 |
| 主题入口，375px 浅色 | `screenshots/review-topics-light-mobile-375.png` | 无横向溢出；内容仍是占位说明，移动端首屏工具区偏高。 |
| 主题入口，1280px 浅色 | `screenshots/review-topics-light-desktop-1280.png` | 布局稳定，但 1280px 已切换为紧凑菜单，与视觉系统的宽屏预期不一致。 |
| 主题入口，宽桌面深色 | `screenshots/review-topics-dark-desktop-1280.png` | 文件名为名义断点；浏览器覆盖失效后实际为宽桌面，只用于深色外观证据。 |
| 主题入口，768px 浅色 | `screenshots/review-topics-light-tablet-768.png` | DOM 指标无水平溢出；全页截图存在合成异常，不据此认定布局缺陷。 |

命名为 `review-topics-dark-mobile-375.png` 与 `review-topics-dark-tablet-768.png` 的两张图因浏览器视口覆盖失效而不纳入结论。

## 做得好的部分

- `quartz/styles/accessibility.scss` 已提供跳转到正文、统一 `:focus-visible`、44px 目标、滚动定位和 `prefers-reduced-motion` 兜底。
- 页面保留单一 `<main>`、单一 H1 和清晰地标；键盘与 SPA 路由基础能力已由 F06 回归覆盖。
- `Masthead` 与 `PrimaryNav` 已把品牌、主张和四个公共入口从旧博客结构中分离出来；原生 `<dialog>` 的 Escape、遮罩关闭与焦点返回方向正确。
- 代表性文章头部的信息优先级明确：记录类型 → 标题 → 主题/类型/成熟度 → 摘要 → 更新与阅读元数据。
- 375、768、1280/宽桌面检查均未发现页面级横向滚动；长中文标题在代表性文章中保持可读。
- 深色模式的纸张感、文本层级和绿色强调较统一，已形成可扩展的审美基线。

## 必须修复（P1 / 发布阻断）

### 1. 四个主入口仍未交付真实发现体验

`content/index.md` 仍是旧首页，包含 emoji、硬编码统计与旧文件树/标签/关系图说明；`content/topics/index.md`、`content/paths/index.md`、`content/map/index.md`、`content/build/index.md` 仍是占位内容。主题截图直接显示“此文件夹下有 0 条笔记”。

这不是 F01–F06 的回归，而是 D02、D05–D08、M01 等计划任务尚未实施；但在用户视角，它会让“每个人都可以拥有自己的知识库，而且知识需要分享”的核心定义在导航后立即中断。最终发布前必须让四个入口至少各自提供真实价值、明确下一步和可访问的内容。

### 2. 本文目录文字对比度不足

`quartz/components/styles/toc.scss:52` 将目录链接设为 `opacity: 0.35`，当前段也只有 `0.75`。浅色与深色截图中，非当前目录项都明显过淡，长目录尤其难以扫描。

R01 中应改为基于语义颜色的明确前景色，不以整体透明度削弱文本；普通、悬停、焦点、当前段状态都应通过 WCAG 2.2 AA 对比度检查。

### 3. 评论加载失败完全静默

`quartz/components/scripts/supabase-comments.inline.ts:50-65` 在 SDK、请求错误和空数据场景直接返回；容器没有可见状态或 `aria-live` 通知。网络失败与“没有评论”对用户不可区分，也不符合知识分享所需要的信任感。

按 R05 实现加载、空、失败、重试、离线、限流与提交反馈，并保留失败时的草稿；所有异步结果需要可见且可被辅助技术感知。

## 应当修复（P2）

### 视觉系统尚未真正成为单一来源

- `quartz/styles/tokens.scss` 已定义新画布色，但 `quartz.config.ts:23-45` 仍提供旧主题颜色；浏览器实际浅色背景为 `#fdf6ee`，而新画布 token 为 `#f4f1e9`。
- `quartz/styles/custom.scss` 仍包含大量旧硬编码紫色/青色、渐变、阴影和圆角卡片规则，使新组件与旧页面出现两个视觉系统。
- R01 及后续页面应只消费语义 token；旧规则需要迁移、删除或限定作用域，而不是继续叠加覆盖。

### 图标按钮的名称应放在按钮本身

`quartz/components/Darkmode.tsx:10-38` 与 `ReaderMode.tsx:10-26` 把 `aria-label` 放在内部 SVG，而 `<button>` 本身没有名称。当前浏览器可能通过 SVG title 推导名称，但实现脆弱，也不符合图标按钮规则。

将动态 `aria-label`/`title` 放到按钮，内部 SVG 设为 `aria-hidden="true"`；R02 同时补齐可感知的开/关状态和重置行为。

### 避免 `transition: all` 与局部清除焦点轮廓

- `quartz/styles/custom.scss:186,213,367,397,430,479,893,1023,1234`
- `quartz/components/styles/readermode.scss:125`
- `quartz/components/styles/mermaid.inline.scss:113`
- `quartz/styles/custom.scss:404`、`quartz/components/styles/search.scss:90,196`

应逐项列出要动画的属性，并删除 `outline: none/0`，或在同一规则中提供明确可见的 `:focus-visible` 替代。全局可访问性规则目前能兜底，但不应依赖 `!important` 与局部旧样式长期对抗。

### 1280px 导航断点与宽屏定义不一致

`quartz/components/styles/primaryNav.scss:163` 在 1349px 以下切换紧凑菜单；因此 1280px 截图已经隐藏四个主入口。视觉系统将 1200px 及以上定义为宽屏，当前行为降低了核心信息架构的可见度。

在不挤压搜索和品牌的前提下，把完整导航下放到约 1200px；若空间实测不足，则应同步修改视觉系统断点并记录理由。

### 旧文章/列表样式仍带有通用博客感

`quartz/styles/custom.scss:178-180` 全局两端对齐段落；`custom.scss:208-223` 使用统一圆角、悬浮上移和阴影的通用卡片语言。主题入口的“最近更新”也使用 emoji 标题，与克制、线性、编辑式的方向不一致。

R01、D01–D03 中应分别确定正文排版和目录/索引规则：中文正文默认左对齐，内容群组优先使用分隔线、留白和类型层级，只在表达真实容器关系时使用卡片。

### 移动菜单补充滚动边界

`PrimaryNav` 已处理安全区，但对话框内容还应添加 `overscroll-behavior: contain`，避免菜单滚动到边缘后带动页面；同时验证 320px 宽度、横竖屏和虚拟键盘。

## 可进一步改善（P3）

- 375px 首屏中，菜单与四个阅读工具占用较多纵向空间；R02 可把非关键阅读设置合并为一个有标签的工具入口。
- 主题占位页右侧“最近更新”视觉权重高于主体价值；D02 应先呈现七大主题、起点与数量，再把最近成长作为次级线索。
- 为交互控件统一评估 `touch-action: manipulation`、点击高亮与触摸反馈，不依赖桌面 hover 表达状态。
- 长标题使用 `text-wrap: balance`、长正文/说明使用 `text-wrap: pretty`，并为用户内容建立 `overflow-wrap` 兜底。

## Web Interface Guidelines 文件级检查

- `quartz/styles/accessibility.scss:3-96`：通过；跳转链接、焦点、目标尺寸、减少动态均有全局基础。
- `quartz/components/styles/toc.scss:52-60`：失败；文本整体透明度造成低对比度。
- `quartz/components/Darkmode.tsx:10-38`：需改；图标按钮名称放在 SVG 而非按钮。
- `quartz/components/ReaderMode.tsx:10-26`：需改；同上。
- `quartz/styles/custom.scss:186,213,367,397,430,479,893,1023,1234`：需改；使用 `transition: all`。
- `quartz/styles/custom.scss:404`、`quartz/components/styles/search.scss:90,196`：需改；局部清除 outline。
- `quartz/components/scripts/supabase-comments.inline.ts:50-65`：失败；异步失败静默，无可见/实时区域反馈。
- `quartz/components/styles/primaryNav.scss:79-94`：需改；对话框缺少滚动链隔离。
- `content/index.md:2-43`：需改；旧标题、emoji、硬编码数据与旧产品说明。
- `content/topics/index.md:6-8`、`content/paths/index.md`、`content/map/index.md`、`content/build/index.md`：发布阻断；主入口仍为占位内容。

## 推荐实施顺序

1. **R01**：正文排版与本文目录；先修复本轮唯一直接影响阅读的 P1 对比度问题。
2. **R02**：整合主题、字号与阅读模式，并修复图标按钮命名。
3. **R03–R05**：补齐前置关系、来源/修订/引用、纠错与评论状态，让“分享”具备上下文与信任机制。
4. **R06**：完成移动文章纵向切片，并验证 320–430px、安全区与 200% 缩放。
5. 再进入 D01 的元数据驱动知识目录；不要在基础占位页上继续做表面润色。

## 验收边界

本审查完成不改变 `TASKS.md` 状态。只有在 Q05 完成、关键页面均已构建并拥有稳定的跨页浏览器回归后，才能执行正式 V01；届时需重新截图、修复全部 P0/P1 与约定的 P2，再进入 V02–V04。
