# wouldkeep 后续改进：多独立代理 + Git Worktree 总控方案

更新时间：2026-07-16  
适用仓库：`https://github.com/hx303/notes`  
目标：让新对话可以在不破坏现有成果的前提下，由一个 `gpt-5.6-sol` 总指挥统筹，并让优秀范例侦察 Agent 与最多两个实施 Agent 并行推进 wouldkeep；范例调研阶段结束后可释放席位给第三个实施 Agent。

## 1. 交接时的真实状态

- wouldkeep 的核心定义保持不变：**每个人都可以拥有自己的知识库，而且知识需要分享**。
- 公开站点、个人空间、账户、标签、知识关系、来源、版本、站长管理和 AI 安全地基已经有大量实现，不能按旧任务表从零重做。
- AI 基础分支为 `agent/ai-assistant-foundation`，PR 为 [#11](https://github.com/hx303/notes/pull/11)。
- 已完成 AI 基础迁移、`ai-write` 模拟网关部署、未登录 `401`、四项真实账户 RLS 验收、TypeScript、AI 专项测试、全量测试和静态构建。
- 最新 `ai-write` 已加入受限的 Vercel 预览来源白名单；仍需在登录状态下看到“连接成功”后，才能将 AI 基础阶段判定为完整通过。
- `.design/wouldkeep-redesign/TASKS.md`、`.design/account-knowledge-system/TASKS.md` 与 `.design/ai-knowledge-assistant/TASKS.md` 均包含过期状态。实际代码已经存在 `DiscoverHome`、`MapPage`、`RecentGrowth`、账户工作区、导入、标签、关系、来源与版本等实现。新代理必须先对账，不得只看复选框判断功能不存在。
- 当前技术栈是 Quartz 4.5.2、Preact、TypeScript、SCSS、Supabase Auth/Postgres/RLS/Edge Functions、Vercel/Cloudflare；不引入第二套重型 UI 框架。

## 2. 总体组织方式

采用“1 个总指挥 + 1 个优秀范例侦察 Agent + 最多 2 个同时运行的实施 Agent”。总指挥使用 `gpt-5.6-sol`，常驻根任务，负责战略、派工、取舍、集成和最终裁决。侦察 Agent 与每个实施 Agent 都独占 Git Worktree 和分支；侦察 Agent 只写研究简报，不直接修改产品代码。

```text
总指挥：gpt-5.6-sol / xhigh
├── 常设子 Agent R：优秀范例侦察与证据整理
├── 轮值实施 Agent A：平台、安全、发布
└── 轮值实施 Agent B：个人空间、编辑器、导入

第一组实施完成后，保留侦察 Agent，轮换为：
├── 子 Agent R：为下一模块提前准备范例简报
├── 轮值实施 Agent C：公开发现、内容与方法页
└── 轮值实施 Agent D：AI 写作、整理与知识问答

范例研究阶段结束并释放席位后，可同时运行：
├── 执行代理 E：内容迁移、永久 URL 与公开索引
├── 执行代理 F：UI 质量、测试、无障碍、性能与发布演练
└── 独立终审 Agent（只审查，不实现）
```

### 为什么采用轮值而不是同时启动全部代理

- 当前协作环境通常只有四个并发席位：总指挥占一个，优秀范例侦察占一个，同时最多再运行两个实施 Agent。
- `AccountPage.tsx`、`accountPage.inline.ts`、`accountPage.scss`、`FolderContent.tsx`、`quartz.layout.ts` 等文件是高冲突热点。
- 第二波依赖第一波稳定的数据、编辑器和发布接口；过早并行只会制造返工。
- 侦察 Agent 必须领先实施半个阶段产出研究简报；实施 Agent 不需要各自重复上网搜索同一批案例。

## 3. 职务与模型分工

以下模型名称依据 2026-07-16 的 OpenAI 官方模型页。Codex 产品中的可选名称可能因账户和版本不同；如果模型选择器中没有精确型号，选择同一档位、最接近用途的当前模型，不要因此阻塞执行。

| 职务 | 首选模型与推理强度 | 主要职责 | 不负责 |
| --- | --- | --- | --- |
| 总指挥、架构与发布经理 | `gpt-5.6-sol`，`xhigh` | 常驻根任务；现实对账、拆任务、分派、研究结论裁决、冲突决策、跨模块架构、安全门槛、最终合并 | 大批量机械改文件；把自身实现交给自身终审 |
| 优秀范例侦察与证据研究员 | `gpt-5.6-terra`，`high`；大批量初筛可用 `gpt-5.4-mini` | 搜集账户、编辑器、导入、知识组织、AI、公开发现、Admin/发布的成熟案例，核对官方文档与开源许可，产出可借鉴/不可照搬清单 | 直接修改产品代码；只凭截图下结论；复制无许可实现 |
| 平台、安全与发布工程师 | `gpt-5.3-codex`，`xhigh` | Supabase schema/RLS/RPC/Edge Functions、发布任务、审计、预算与密钥边界 | 重新设计个人空间 UI |
| 个人空间与编辑器工程师 | `gpt-5.4`，`high` | 小白工作流、编辑器、DOCX/Markdown 导入、图片、自动保存、冲突与移动端 | 修改生产密钥和跨账户策略 |
| 公开发现与内容产品工程师 | `gpt-5.6-terra`，`high` | 首页、主题、路径、地图、最近生长、建库方法、公开主页与文案 | 数据库高权限操作 |
| AI/RAG 工程师 | `gpt-5.6-sol`，`xhigh`；编码阶段可换 `gpt-5.3-codex` | AI 网关、预算、索引、混合检索、建议、带引用问答、评估集与提示注入防护 | 自动发布或未经确认改写正文 |
| 内容迁移与数据工程师 | `gpt-5.4-mini`，`high` | 256+ 内容的元数据清单、标签规范、aliases、canonical、dry-run 报告 | 未经审阅批量覆盖内容 |
| UI 质量、QA、无障碍与性能负责人 | `gpt-5.4`，`high`；批量执行可交给 `gpt-5.4-mini` | **UI 为首要关注点**：视觉层级、排版、间距、溢出、响应式、八类交互状态、跨页一致性、可访问性、视觉回归；同时检查功能、断链、构建和性能 | 只看测试绿灯或 DOM、不看实际页面；未经评审自动更新截图基线；以“顺手修复”为由扩大范围 |
| 独立终审 | `gpt-5.6-sol`，`xhigh` | 审查安全、隐私、架构、发布回滚和跨模块回归 | 审查自己刚完成的实现 |

模型依据：OpenAI 将 GPT-5.6 Sol 定位为复杂专业工作与编码的旗舰模型；GPT-5.6 Terra 平衡能力与成本；GPT-5.3-Codex 面向 agentic coding；GPT-5.4 mini 明确面向编码、计算机操作和 subagents。

## 4. Worktree 拓扑与创建方式

### 4.1 先决条件

开始新对话后，总控代理必须先完成：

1. 在登录状态下验证 `ai-write` 模拟网关返回成功。
2. 更新 `.design/ai-knowledge-assistant/TASKS.md` 的验收状态。
3. 确认 PR #11 检查全部通过，转为 Ready，并合并到 `main`。
4. `git fetch origin --prune`，确认 `origin/main` 已包含 AI 基础提交。
5. 不删除当前已有 Worktree；先运行 `git worktree list --porcelain` 并记录占用分支。

### 4.2 建议目录

```powershell
$repo = 'C:\Users\23012\Desktop\wouldkeep\_repo'
$workRoot = 'C:\Users\23012\Documents\Codex\2026-07-10\c-users-23012-desktop-wouldkeep\worktrees-next'

git -C $repo fetch origin --prune
git -C $repo worktree add -b agent/next-integration "$workRoot\integration" origin/main
git -C $repo worktree add -b agent/next-reference-research "$workRoot\reference-research" agent/next-integration
git -C $repo worktree add -b agent/next-platform "$workRoot\platform" agent/next-integration
git -C $repo worktree add -b agent/next-workspace "$workRoot\workspace" agent/next-integration
git -C $repo worktree add -b agent/next-public "$workRoot\public" agent/next-integration
```

第一波合并后，从更新后的 `agent/next-integration` 创建第二波：

```powershell
git -C $repo worktree add -b agent/next-ai "$workRoot\ai" agent/next-integration
git -C $repo worktree add -b agent/next-content "$workRoot\content" agent/next-integration
git -C $repo worktree add -b agent/next-qa "$workRoot\qa" agent/next-integration
```

如果同名分支或目录已存在，总控代理必须检查并复用或改名，禁止用 `reset --hard`、强制删除 Worktree 或覆盖用户修改。

### 4.3 分支与提交规则

- 集成分支：`agent/next-integration`。
- 功能分支：`agent/next-<领域>`。
- 范例研究分支：`agent/next-reference-research`，只允许修改 `.design/reference-research/**`。
- 一个代理只写自己的 Worktree；不得跨 Worktree 修改文件。
- 每个提交只表达一个可验收垂直切片，例如 `feat: add conflict-safe autosave`。
- 执行代理先推送自己的分支并提交交接报告；总控代理审查后以 `--no-ff` 合并到集成分支。
- 不允许执行代理直接合并 `main`、部署生产、写入生产密钥或执行破坏性 SQL。
- 数据库迁移只新增文件，命名使用真实日期和明确主题；已在生产执行的迁移不得重写。

### 4.4 总指挥治理制度

为避免多代理在长周期中反复改方向、破坏接口或带着未说明风险合并，总指挥必须维护以下五项制度：

#### 决策日志

- 在 `.design/wouldkeep-next/DECISIONS.md` 记录每项重要选择：日期、问题、可选方案、最终决定、理由、影响范围和重新评估条件。
- 已批准的设计方向、数据边界、URL 策略和模型安全规则不能由子 Agent 静默推翻。
- 新证据允许重新讨论，但必须新增一条决策记录，不覆盖旧记录。

#### 接口契约

- 在 `.design/wouldkeep-next/CONTRACTS.md` 记录跨 Worktree 共用的数据库字段、RPC/Edge Function 请求响应、错误码、路由、事件和关键组件输入输出。
- 并行任务开始前冻结本轮契约；子 Agent 若需修改，先提交“契约变更请求”，由总指挥判断影响并通知所有依赖代理。
- 数据库迁移、前端类型和测试夹具必须同时反映契约，不能只改其中一层。

#### 串行合并队列

- 在 `.design/wouldkeep-next/MERGE_QUEUE.md` 维护等待审查、验证中、已合并、退回修改四种状态。
- 同一时间只能有一个功能分支进入集成分支；前一个合并后的类型检查、相关测试和构建未完成前，不合并下一个。
- 高风险顺序优先为：安全/数据契约 → 编辑/保存 → 发布 → AI → UI 与内容；纯研究文档可独立合并。

#### 阶段汇报与交接

- 每个子 Agent 在完成一个垂直切片或连续工作约 60–90 分钟后提交检查点，不等待整个大模块结束。
- 检查点写入 `.design/wouldkeep-next/handoffs/<branch>.md`，包含基线 SHA、当前提交、完成项、修改文件、测试/UI 证据、风险、阻塞、契约变化和下一步。
- 总指挥发现越界修改、测试无证据、方向偏离或长时间无有效产出时，应暂停并重新切小任务，而不是继续消耗上下文。

#### 生产前快照与恢复证据

- 在任何 Supabase 迁移、Edge Function 替换、批量内容写入或正式发布前，建立 `.design/wouldkeep-next/PRODUCTION_SAFETY.md` 记录执行者、时间、Git SHA、迁移/函数版本、关键表行数、最后成功部署、备份位置、验证查询和前滚修复方案。
- 生产数据库迁移优先使用可重复前滚修复；回滚涉及数据删除时不得自动执行。
- 执行后立即对比快照并记录真实结果；“SQL Success”不能单独证明数据和 RLS 正确。
- 缺少快照、恢复路径、用户确认或验证查询时，生产变更必须停止。

## 5. 文件所有权与冲突隔离

| 文件/区域 | 唯一主要负责人 | 规则 |
| --- | --- | --- |
| `.design/reference-research/**` | 优秀范例侦察 Agent | 每份简报必须包含来源、访问日期、适配判断、风险、许可和明确建议；不存入来源网页的长篇复制内容 |
| `supabase/migrations/**`、`supabase/functions/**` | 平台代理；第二波转交 AI 代理的 AI 专用文件 | 不修改已执行迁移；每项 RLS 必须有 owner/other/anonymous 测试 |
| `AccountPage.tsx`、`accountPage.inline.ts`、`accountPage.scss` | 第一波仅个人空间代理 | 其他代理先建立新组件/API，不碰这三个热点 |
| `content/workspace/**` | 个人空间代理；第二波 AI 代理只新增 `/organize/`、`/ask/` | 不同时编辑同一路由 |
| `DiscoverHome`、`MapPage`、`RecentGrowth`、`content/topics|paths|build|changes/**` | 公开发现代理 | 内容迁移代理不改这些页面组件 |
| 真实知识 Markdown、元数据、aliases | 内容迁移代理 | 必须先 dry-run，再由总控批准实际批量修改 |
| `quartz.layout.ts`、`quartz/components/index.ts`、`FolderContent.tsx` | 总控集成代理 | 工作者在交接报告中列出所需挂接点，由总控统一接线 |
| `package.json`、锁文件、全局 tokens | 总控集成代理 | 新依赖必须说明体积、许可证、替代方案和为何不能复用现有代码 |
| 跨页面浏览器测试、截图基线与 UI 缺陷台账 | UI 质量/QA 代理 | 功能代理仍需写本模块单元/交互测试；截图基线变更必须由总指挥人工审查 |

## 6. 执行波次

## Wave 0：现实对账与安全收口

总控代理在集成 Worktree 建立一份 `CURRENT_STATE.md`，逐项对比：代码、Supabase 已执行迁移、Edge Functions、Vercel/Cloudflare 线上状态、三份旧 TASKS 和 GitHub PR。每项标记为“已完成、部分完成、未开始、线上未部署、状态过期”。

完成标准：

- 模拟 AI 网关登录态成功，且没有真实模型调用或费用。
- PR #11 合并到 `main`。
- 根目录新增 `AGENTS.md`，写明构建/测试命令、文件所有权、安全边界和交接格式。
- 形成新基线，任何代理都不再依据旧复选框重复开发。

## 常设研究线：优秀范例侦察 Agent

侦察 Agent 在第一批实施开始时同步启动，并始终领先实施任务半个阶段。每个研究主题输出到 `.design/reference-research/<topic>.md`，由总指挥批准后才能成为实施依据。

优先研究顺序：

1. 邮箱注册、验证、找回密码、个人资料和新手引导。
2. Notion、Outline、Obsidian、AFFiNE、AppFlowy 等编辑/知识产品的工作区、导入、自动保存和冲突恢复模式。
3. 标签、自动分类、双向链接、来源、版本和知识图谱。
4. AI 写作预览、知识整理收件箱、RAG 范围选择、引用和拒答。
5. 数字花园、公开知识库、作者主页、主题/路径、最近生长和知识地图。
6. Admin、内容治理、发布队列、运行健康、预算和审计。

每份研究简报至少包含：

- 5–8 个强相关案例，其中至少 2 个来自产品官方文档或可运行产品。
- 页面/仓库链接、访问日期、核心交互、移动端和无障碍表现。
- “适合 wouldkeep 的部分”“不应照搬的部分”“适配后的具体建议”。
- 如果建议复用代码：GitHub 仓库、许可证、维护活跃度、依赖体积和安全风险；许可不明则只借鉴思路。
- 不以视觉相似度作为唯一标准；优先验证功能闭环、失败恢复、隐私边界和小白可理解性。
- 一页结论矩阵，由总指挥选择 1 个主参考模式和最多 2 个辅助模式，避免把多个产品拼成杂乱界面。

侦察 Agent 不拥有生产权限，也不直接提交 UI、数据库或依赖变更。若案例需要登录、付费或授权才能核实，应明确标注证据边界，不得猜测隐藏行为。

## Wave 1：三个可独立演示的核心切片

### A. 平台、安全与发布

目标：从“一条私密知识”到“一条稳定公开知识”形成可靠服务端闭环。

- 对账现有 knowledge/document/version/tag/link/source/publication schema 与 RLS。
- 补齐 publish job 的幂等、重试、最后成功版本和撤回语义。
- 建立浏览器不可写审计表、所有者权限、站长聚合视图和无密钥前端验证。
- 为 private/unlisted/public、跨账户、软删除、版本冲突和发布失败建立可重复 SQL 测试。
- 输出迁移运行顺序、回滚/前滚方案和用户需要执行的最小 Dashboard 操作。

### B. 个人空间、编辑器与导入

目标：电脑小白可以从注册后进入自己的知识库，创建、导入、编辑、组织、找回内容，而且不懂 Markdown 也能完成。

- 将现有大组件按路由和职责拆成可测试模块，但保持现有 URL 与视觉系统。
- 完成自由工作台与详细编辑器的统一草稿模型。
- DOCX 导入必须保留标题、段落、列表、表格基础结构和内嵌图片；Markdown 支持文件导入和整篇粘贴。
- 导入先预览差异与图片数量，再明确保存为私密草稿；失败不丢原文件信息。
- 自动保存、离线暂存、冲突比较、版本恢复、删除/撤销均提供诚实状态。
- 标签、分类建议、知识链接和来源通过选择器/普通表单完成，不要求手写 UUID、URL 关系或代码。

### C. 公开发现、内容与建库方法

目标：访客 30 秒内理解 wouldkeep，并在两次主要操作内进入一条有价值知识；潜在建立者能真正照着方法创建自己的库。

- 对 `DiscoverHome`、`MapPage`、`RecentGrowth`、主题和路径做现实验收，只补缺口、不重写已完成模块。
- 完成 `/build/` 及方法、边界、内容模型、模板、部署说明。
- 增补 About、Privacy、License、404 恢复路径与页脚可信入口。
- 规划作者公开主页 `/@/:handle/`，但只消费平台代理定义的安全公开快照。
- 所有首页数字、主题规模和最近生长必须来自构建数据。

Wave 1 合并门槛：三个分支分别通过本模块测试；总控在集成分支运行 TypeScript、全量测试、Quartz 构建、SQL/RLS 测试记录和关键浏览器路径。

## Wave 2：AI、内容迁移与质量工程

### D. AI 写作、整理与知识问答

依赖 Wave 1 的版本、发布与编辑接口。

- 先实现调用审计、并发/日限额/月预算和站长灰度开关，再接真实模型。
- 真实模型密钥仅存 Supabase Function Secret；默认关闭，优先只发送用户选中文字。
- 选区改写进入独立预览，支持接受、插入、拒绝、重新生成和版本回退，不直接覆盖正文。
- 建立文档分块、增量索引、pgvector + PostgreSQL 全文搜索 + RRF 混合检索。
- 整理建议必须展示理由、证据、置信度和变更清单；接受前校验所有权与 `base_version`。
- 问答必须先选择知识范围，回答附可验证引用；证据不足时拒答。
- 建立至少 50 条中文评估集，覆盖引用、拒答、标签、链接、重复、提示注入和跨账户隔离。

### E. 内容迁移、标签与永久 URL

- 对全部内容生成只读清单和 dry-run 报告，先不改正文。
- 规范日期、成熟度、主题、标签、摘要、来源姿态和复用许可；低置信结果进入人工审阅。
- 合并重复文件夹/标签时先建立 aliases 和 canonical 映射。
- 验证搜索、主题、地图、反向链接、RSS、站点地图、评论映射和复制引用都指向 canonical。
- 任何批量写入必须可重复、可比较、可回退，且不得迁移私人或未授权材料。

### F. UI 质量、QA、无障碍、性能与发布演练

这个代理首先是 **UI 质量负责人**，其次才是自动化测试执行者。它必须查看真实渲染页面和截图，不能因为单元测试通过就宣布界面验收完成。

- 建立生产构建上的跨页浏览器回归：首页 → 主题/路径 → 文章、搜索、地图列表、账户 → 编辑 → 导入 → 保存、发布预览、Admin 和旧 URL。
- 对首页、账户、个人空间、写作台、知识库、设置、AI、Admin、公开知识、文章、主题、路径、地图、最近生长和建库方法建立审阅过的视觉基线。
- 覆盖 320、375、800、1024、1200、1536px、200% 缩放、浅色/深色、键盘、reduced motion；Chrome 与 Edge 为必测浏览器，条件允许时增加 Firefox。
- 每个关键控件检查八类状态：default、hover、focus、active、disabled、loading、error、success；表单和列表另测 empty、offline、stale、conflict。
- 专门发现：文字截断、按钮不可见、元素重叠、意外横向滚动、图片比例/裁切异常、字体未加载、间距节奏混乱、层级竞争、颜色对比不足、焦点不明显、弹层被裁剪、移动端键盘遮挡操作栏、状态只靠颜色表达。
- 视觉一致性必须对照 `.better-web-ui.md`：保持“个人档案馆 × 公共知识网络”的温暖、安静、可信；避免 Notion 仪表盘化、通用 SaaS 卡片堆叠、过度圆角/阴影/渐变和装饰性动效。
- 视觉回归使用确定性数据，等待字体和图片稳定并关闭非必要动画；不得把动态时间、随机内容或第三方组件纳入脆弱基线。
- 每个 UI 缺陷记录页面、浏览器、视口、主题、复现步骤、截图、期望/实际和 P0–P3 严重度；P0/P1 未清零不得发布。
- 覆盖离线、超时、SDK 失败、保存冲突、导入损坏、图片过大、构建失败、AI 限额与 Edge Function 不可用，并检查错误是否保留上下文、靠近问题且给出恢复动作。
- 自动无障碍扫描只是预警；仍需人工完成全流程键盘、焦点进入/返回、屏幕阅读器冒烟、44×44px、200% reflow 和颜色非唯一编码检查。
- 设定并记录 JS/CSS、图片、地图、字体和 Core Web Vitals 基线；普通文章不得下载完整地图/编辑器/AI 包。
- 汇总 P0–P3 缺陷；只修复明确归属的小问题，跨模块 UI 问题交回总指挥分派给原负责人。

UI 验收证据至少包含：桌面与手机截图、关键状态截图、视觉差异说明、键盘路径结果、无障碍扫描摘要和浏览器控制台错误。截图基线不得在无人审查时自动重录。

## Wave 3：独立终审与灰度发布

1. 由没有实现该模块的 `gpt-5.6-sol` 代理进行安全、隐私、架构和产品终审。
2. UI 质量代理先运行视觉回归、`designer-design-review`、`web-design-guidelines`、键盘/无障碍检查；总指挥审阅截图和 P0–P3 台账后，再运行全量测试、生产构建、URL/RSS/sitemap 校验。
3. 先只向站长账号开放 AI 和新发布链路，记录费用、失败、引用正确率与回退操作。
4. 通过后再按邀请账户灰度；不改变未开启用户的现有工作流。
5. 最后才把集成分支转为 Ready PR，保留旧部署和数据库前滚修复方案。

## 7. 每个代理的标准任务包

总控派发任务时必须包含：

```markdown
角色：<职务>
模型：<模型 + reasoning effort>
Worktree：<绝对路径>
分支：<branch>
基线提交：<commit sha>
目标：<一个可演示垂直切片>
允许修改：<路径列表>
禁止修改：<热点/生产/密钥路径>
依赖接口：<已确定契约>
完成标准：<用户行为 + 技术断言>
必跑验证：<命令>
交付：提交 SHA、变更摘要、测试证据、迁移/部署步骤、风险与未完成项
研究依据：<已批准的 reference-research 简报；没有则说明为什么该任务无需外部范例>
决策/契约影响：<DECISIONS/CONTRACTS 条目或“无”>
检查点文件：<.design/wouldkeep-next/handoffs/<branch>.md>
```

执行代理结束时必须交付：

- 分支和提交 SHA。
- 修改文件清单，以及是否碰到非授权路径。
- 已运行测试的原始结论；不得只写“应该通过”。
- UI 任务提供窄屏和桌面验收证据；安全任务提供 owner/other/anonymous 证据。
- UI 验收必须附实际渲染截图或视觉基线差异，明确视口、主题和状态；不能只附 HTML、DOM 快照或测试通过数量。
- 新迁移是否已在生产执行；默认答案应为“否，由总控/站长执行”。
- 需要总控在热点文件完成的挂接点。
- 已知风险、回退方法和下一任务的接口前提。

## 8. 集成与验收协议

总控对每个分支执行：

1. `git status -sb`，确认没有未归属修改。
2. 检查 `MERGE_QUEUE.md`，确认当前分支是唯一处于“验证中”的功能分支。
3. 对照 `DECISIONS.md` 与 `CONTRACTS.md` 检查是否存在未批准的方向或接口变化。
4. `git diff agent/next-integration...agent/next-<领域> --stat` 和逐文件审查。
5. 拒绝越界修改、真实密钥、service-role key、跳过 RLS、破坏性 SQL 和无测试的大批量内容修改。
6. 先把集成分支最新变化合入功能分支并由原代理解决本领域冲突。
7. 功能测试通过后，`git merge --no-ff agent/next-<领域>`。
8. 每合并一个分支运行 TypeScript、相关测试和构建；每一波结束运行全量测试、UI 回归与生产构建。

建议基线命令（若本机全局 npm 仍损坏，继续使用项目已有 `node_modules` 和 Codex bundled Node）：

```powershell
$node = 'C:\Users\23012\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node node_modules\typescript\bin\tsc --noEmit
& $node node_modules\tsx\dist\cli.mjs --import './quartz/testing/register-assets.mjs' --test 'quartz/**/*.test.ts' 'quartz/**/*.test.tsx'
& $node quartz\bootstrap-cli.mjs build
```

数据库与 Edge Function 验收不能被 TypeScript/静态构建替代；生产部署不能被本地 HTTP 200 替代。

## 9. 停止条件与必须询问用户的动作

代理可以自行完成代码、测试、构建、PR 和预览检查；以下动作必须集中交给用户确认：

- 在 Supabase 生产项目执行新迁移或破坏性 SQL。
- 设置/更换模型 API Key、Cloudflare/Vercel/Supabase 令牌。
- 产生真实模型费用或提高预算。
- 删除账户、知识、对象存储图片、生产函数或旧部署。
- 将 Draft PR 合并到 `main`、启用生产 feature flag、扩大灰度用户。
- 批量改写真实知识正文或改变公开/私密范围。

## 10. 新对话首条指令（可直接复制）

```text
请读取 wouldkeep 仓库中的：
1. .design/wouldkeep-next/MULTI_AGENT_WORKTREE_PLAN.md
2. .design/wouldkeep-next/TASKS.md
3. .design/wouldkeep-redesign/DESIGN_BRIEF.md
4. .design/account-knowledge-system/DESIGN_BRIEF.md
5. .design/ai-knowledge-assistant/DESIGN_BRIEF.md

你担任 wouldkeep 总指挥，必须使用 GPT-5.6 Sol（xhigh）。先验证 PR #11 与登录态 AI 模拟网关的最终状态，完成 Wave 0 现实对账；不要根据旧 TASKS 重复开发。随后建立 DECISIONS.md、CONTRACTS.md、MERGE_QUEUE.md、handoffs/ 与 PRODUCTION_SAFETY.md，再优先启动“优秀范例侦察 Agent”（GPT-5.6 Terra/high，独立 research Worktree，只写研究简报），并按方案启动最多两个并行实施 Agent。侦察 Agent 需要领先实施半个阶段，实施任务应引用总指挥已批准的范例简报。检验代理必须作为 UI 质量负责人，重点查看实际渲染、截图、排版、响应式、交互状态和跨页一致性，不能只看自动化测试是否通过。所有代理必须遵守文件所有权、提交独立分支、每个垂直切片或 60–90 分钟提交检查点，并提供测试证据。总指挥负责串行合并、审查、集成、终止越界工作，并向我集中提出必须由我执行的 Supabase/生产操作；没有生产快照和恢复证据时不得部署。
```

## 11. 官方模型参考

- [OpenAI Models：当前模型选择](https://developers.openai.com/api/docs/models)
- [GPT-5.3-Codex：agentic coding 模型](https://developers.openai.com/api/docs/models/gpt-5.3-codex)
- [GPT-5.4 mini：编码、computer use 与 subagents](https://developers.openai.com/api/docs/models/gpt-5.4-mini)
- [Codex Use Cases](https://developers.openai.com/codex/use-cases)

说明：官方 Codex 手册直连在本次环境返回 403，官方文档连接器也因本机 `codex.exe` 权限不可用而未能安装；模型能力使用上述 OpenAI 官方网页核对。Worktree、代理交接与并发规则同时依据当前 Codex 会话实际提供的团队工具能力制定。
