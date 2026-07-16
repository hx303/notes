# wouldkeep 后续改进：多独立代理 + Git Worktree 总控方案

更新时间：2026-07-16  
适用仓库：`https://github.com/hx303/notes`  
目标：让新对话可以在不破坏现有成果的前提下，用一个总控代理和最多三个并行执行代理持续推进 wouldkeep。

## 1. 交接时的真实状态

- wouldkeep 的核心定义保持不变：**每个人都可以拥有自己的知识库，而且知识需要分享**。
- 公开站点、个人空间、账户、标签、知识关系、来源、版本、站长管理和 AI 安全地基已经有大量实现，不能按旧任务表从零重做。
- AI 基础分支为 `agent/ai-assistant-foundation`，PR 为 [#11](https://github.com/hx303/notes/pull/11)。
- 已完成 AI 基础迁移、`ai-write` 模拟网关部署、未登录 `401`、四项真实账户 RLS 验收、TypeScript、AI 专项测试、全量测试和静态构建。
- 最新 `ai-write` 已加入受限的 Vercel 预览来源白名单；仍需在登录状态下看到“连接成功”后，才能将 AI 基础阶段判定为完整通过。
- `.design/wouldkeep-redesign/TASKS.md`、`.design/account-knowledge-system/TASKS.md` 与 `.design/ai-knowledge-assistant/TASKS.md` 均包含过期状态。实际代码已经存在 `DiscoverHome`、`MapPage`、`RecentGrowth`、账户工作区、导入、标签、关系、来源与版本等实现。新代理必须先对账，不得只看复选框判断功能不存在。
- 当前技术栈是 Quartz 4.5.2、Preact、TypeScript、SCSS、Supabase Auth/Postgres/RLS/Edge Functions、Vercel/Cloudflare；不引入第二套重型 UI 框架。

## 2. 总体组织方式

采用“1 个总控 + 最多 3 个同时运行的独立代理”。每个执行代理独占一个 Git Worktree 和一个功能分支；总控代理只在集成 Worktree 合并、解决冲突、运行总验收和维护任务状态。

```text
总控 / 集成代理
├── 执行代理 A：平台、安全、发布
├── 执行代理 B：个人空间、编辑器、导入
└── 执行代理 C：公开发现、内容与方法页

第一波合并后，再替换为：
├── 执行代理 D：AI 写作、整理与知识问答
├── 执行代理 E：内容迁移、永久 URL 与公开索引
└── 执行代理 F：测试、无障碍、性能与发布演练
```

### 为什么不同时启动六个代理

- 当前协作环境通常只有四个并发席位，总控占一个，执行代理最多三个。
- `AccountPage.tsx`、`accountPage.inline.ts`、`accountPage.scss`、`FolderContent.tsx`、`quartz.layout.ts` 等文件是高冲突热点。
- 第二波依赖第一波稳定的数据、编辑器和发布接口；过早并行只会制造返工。

## 3. 职务与模型分工

以下模型名称依据 2026-07-16 的 OpenAI 官方模型页。Codex 产品中的可选名称可能因账户和版本不同；如果模型选择器中没有精确型号，选择同一档位、最接近用途的当前模型，不要因此阻塞执行。

| 职务 | 首选模型与推理强度 | 主要职责 | 不负责 |
| --- | --- | --- | --- |
| 总控、架构与发布经理 | `gpt-5.6-sol`，`xhigh` | 现实对账、拆任务、分派、冲突决策、跨模块架构、安全门槛、最终合并 | 大批量机械改文件 |
| 平台、安全与发布工程师 | `gpt-5.3-codex`，`xhigh` | Supabase schema/RLS/RPC/Edge Functions、发布任务、审计、预算与密钥边界 | 重新设计个人空间 UI |
| 个人空间与编辑器工程师 | `gpt-5.4`，`high` | 小白工作流、编辑器、DOCX/Markdown 导入、图片、自动保存、冲突与移动端 | 修改生产密钥和跨账户策略 |
| 公开发现与内容产品工程师 | `gpt-5.6-terra`，`high` | 首页、主题、路径、地图、最近生长、建库方法、公开主页与文案 | 数据库高权限操作 |
| AI/RAG 工程师 | `gpt-5.6-sol`，`xhigh`；编码阶段可换 `gpt-5.3-codex` | AI 网关、预算、索引、混合检索、建议、带引用问答、评估集与提示注入防护 | 自动发布或未经确认改写正文 |
| 内容迁移与数据工程师 | `gpt-5.4-mini`，`high` | 256+ 内容的元数据清单、标签规范、aliases、canonical、dry-run 报告 | 未经审阅批量覆盖内容 |
| QA、无障碍与性能工程师 | `gpt-5.4-mini`，`high` | 高容量测试、浏览器回归、键盘/窄屏/200% 缩放、断链、构建、性能预算 | 以“顺手修复”为由扩大产品范围 |
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
- 一个代理只写自己的 Worktree；不得跨 Worktree 修改文件。
- 每个提交只表达一个可验收垂直切片，例如 `feat: add conflict-safe autosave`。
- 执行代理先推送自己的分支并提交交接报告；总控代理审查后以 `--no-ff` 合并到集成分支。
- 不允许执行代理直接合并 `main`、部署生产、写入生产密钥或执行破坏性 SQL。
- 数据库迁移只新增文件，命名使用真实日期和明确主题；已在生产执行的迁移不得重写。

## 5. 文件所有权与冲突隔离

| 文件/区域 | 唯一主要负责人 | 规则 |
| --- | --- | --- |
| `supabase/migrations/**`、`supabase/functions/**` | 平台代理；第二波转交 AI 代理的 AI 专用文件 | 不修改已执行迁移；每项 RLS 必须有 owner/other/anonymous 测试 |
| `AccountPage.tsx`、`accountPage.inline.ts`、`accountPage.scss` | 第一波仅个人空间代理 | 其他代理先建立新组件/API，不碰这三个热点 |
| `content/workspace/**` | 个人空间代理；第二波 AI 代理只新增 `/organize/`、`/ask/` | 不同时编辑同一路由 |
| `DiscoverHome`、`MapPage`、`RecentGrowth`、`content/topics|paths|build|changes/**` | 公开发现代理 | 内容迁移代理不改这些页面组件 |
| 真实知识 Markdown、元数据、aliases | 内容迁移代理 | 必须先 dry-run，再由总控批准实际批量修改 |
| `quartz.layout.ts`、`quartz/components/index.ts`、`FolderContent.tsx` | 总控集成代理 | 工作者在交接报告中列出所需挂接点，由总控统一接线 |
| `package.json`、锁文件、全局 tokens | 总控集成代理 | 新依赖必须说明体积、许可证、替代方案和为何不能复用现有代码 |
| 跨页面浏览器测试与基准 | QA 代理 | 功能代理仍需写本模块单元/交互测试 |

## 6. 执行波次

## Wave 0：现实对账与安全收口

总控代理在集成 Worktree 建立一份 `CURRENT_STATE.md`，逐项对比：代码、Supabase 已执行迁移、Edge Functions、Vercel/Cloudflare 线上状态、三份旧 TASKS 和 GitHub PR。每项标记为“已完成、部分完成、未开始、线上未部署、状态过期”。

完成标准：

- 模拟 AI 网关登录态成功，且没有真实模型调用或费用。
- PR #11 合并到 `main`。
- 根目录新增 `AGENTS.md`，写明构建/测试命令、文件所有权、安全边界和交接格式。
- 形成新基线，任何代理都不再依据旧复选框重复开发。

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

### F. QA、无障碍、性能与发布演练

- 建立生产构建上的跨页浏览器回归：首页 → 主题/路径 → 文章、搜索、地图列表、账户 → 编辑 → 导入 → 保存、发布预览和旧 URL。
- 覆盖 320、375、800、1024、1200、1536px、200% 缩放、键盘、深色模式、reduced motion。
- 覆盖离线、超时、SDK 失败、保存冲突、导入损坏、图片过大、构建失败、AI 限额与 Edge Function 不可用。
- 设定并记录 JS/CSS、图片、地图、字体和 Core Web Vitals 基线；普通文章不得下载完整地图/编辑器/AI 包。
- 汇总 P0–P3 缺陷；只修复明确归属的小问题，跨模块问题交回总控分派。

## Wave 3：独立终审与灰度发布

1. 由没有实现该模块的 `gpt-5.6-sol` 代理进行安全、隐私、架构和产品终审。
2. 总控运行 `designer-design-review`、`web-design-guidelines`、无障碍审计、全量测试、生产构建、URL/RSS/sitemap 校验。
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
```

执行代理结束时必须交付：

- 分支和提交 SHA。
- 修改文件清单，以及是否碰到非授权路径。
- 已运行测试的原始结论；不得只写“应该通过”。
- UI 任务提供窄屏和桌面验收证据；安全任务提供 owner/other/anonymous 证据。
- 新迁移是否已在生产执行；默认答案应为“否，由总控/站长执行”。
- 需要总控在热点文件完成的挂接点。
- 已知风险、回退方法和下一任务的接口前提。

## 8. 集成与验收协议

总控对每个分支执行：

1. `git status -sb`，确认没有未归属修改。
2. `git diff agent/next-integration...agent/next-<领域> --stat` 和逐文件审查。
3. 拒绝越界修改、真实密钥、service-role key、跳过 RLS、破坏性 SQL 和无测试的大批量内容修改。
4. 先把集成分支最新变化合入功能分支并由原代理解决本领域冲突。
5. 功能测试通过后，`git merge --no-ff agent/next-<领域>`。
6. 每合并一个分支运行 TypeScript 和相关测试；每一波结束运行全量测试与构建。

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

你担任总控/集成代理。先验证 PR #11 与登录态 AI 模拟网关的最终状态，完成 Wave 0 现实对账；不要根据旧 TASKS 重复开发。随后按方案创建独立 Git Worktree，一次最多启动三个执行代理。每个代理必须使用指定模型档位、遵守文件所有权、提交独立分支并提供测试证据。你负责审查、集成与向我集中提出必须由我执行的 Supabase/生产操作。
```

## 11. 官方模型参考

- [OpenAI Models：当前模型选择](https://developers.openai.com/api/docs/models)
- [GPT-5.3-Codex：agentic coding 模型](https://developers.openai.com/api/docs/models/gpt-5.3-codex)
- [GPT-5.4 mini：编码、computer use 与 subagents](https://developers.openai.com/api/docs/models/gpt-5.4-mini)
- [Codex Use Cases](https://developers.openai.com/codex/use-cases)

说明：官方 Codex 手册直连在本次环境返回 403，官方文档连接器也因本机 `codex.exe` 权限不可用而未能安装；模型能力使用上述 OpenAI 官方网页核对。Worktree、代理交接与并发规则同时依据当前 Codex 会话实际提供的团队工具能力制定。
