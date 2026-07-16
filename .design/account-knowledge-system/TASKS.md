# Build Tasks: 账户化个人知识库与无代码编辑系统

Generated from: `.design/account-knowledge-system/DESIGN_BRIEF.md`  
Date: 2026-07-12

## Delivery Rules

- 每项任务是可演示、可测试的垂直切片；完成代码、样式、交互、失败状态和最低测试后才勾选。
- 先在独立分支和 Vercel Preview / Supabase 测试环境验证；数据库迁移先 dry-run，再应用到生产。
- 任何阶段不得把 service-role key、GitHub token 或发布密钥放入浏览器代码。
- 所有新账户数据表在功能接入前必须通过 RLS 正向与越权测试。
- 以“小白首次使用路径”为主验收线，同时保留现有 Quartz 公共阅读、URL、搜索和主题功能。

## A0 — Data, Ownership, and Security Foundation

- [ ] **A0.1 — Prove an owned private document end to end**: 新增 `knowledge_bases` 与最小 `documents` 迁移、类型和 RLS；注册用户能创建并读取自己的私密草稿，第二用户和匿名请求都得到拒绝。_Creates: Supabase migration and RLS tests; modifies: generated TypeScript data types; reuses: existing Supabase project and `profiles`. Done when the same browser test covers owner success and cross-user/anonymous denial._
- [ ] **A0.2 — Complete the knowledge data model through one real document**: 为代表性草稿加入状态、可见范围、slug、摘要、成熟度、时间戳、软删除和知识库归属，并验证约束、索引与更新时间触发器。_Modifies: `documents` migration/types; reuses: public metadata vocabulary. Depends on: A0.1. Done when invalid visibility/status/duplicate active slug cannot be stored and a deleted item can be restored._
- [ ] **A0.3 — Add versions without silent overwrite**: 保存文档版本快照与递增版本号，并使用 `updated_at` 或 revision token 拒绝陈旧写入。_Creates: `document_versions` and save RPC/API; modifies: document update flow. Depends on: A0.2. Done when two simulated clients cannot silently overwrite one another and a prior snapshot can be read back._
- [ ] **A0.4 — Prove the publish boundary safely**: 建立最小服务端发布端点，只接受已登录所有者的文档 ID，返回可审计任务状态，确认浏览器产物中不存在服务密钥。_Creates: server-side publish adapter and publish job record; modifies: deployment configuration; reuses: existing Quartz build pipeline. Depends on: A0.2. Done when private/other-user documents are rejected and one authorized fixture produces a controlled unpublished preview artifact._
- [ ] **A0.5 — Add repeatable database verification**: 把 owner、other user、anonymous、private、unlisted、public、soft-delete 和 version conflict 场景变成可重复执行的数据库测试与回滚说明。_Creates: Supabase security test suite and migration runbook; reuses: A0.1–A0.4. Done when a clean test project can apply and roll back the phase with documented results._

## A1 — Account Completion and First-Time Entry

- [ ] **A1.1 — Finish email signup and verification**: 将现有注册面板改为明确的提交中、成功、未收到邮件、重新发送和字段级错误体验；验证回跳后创建 profile 并进入首次引导。_Modifies: `AccountPage`, `accountPage.inline.ts`, account styles; reuses: Supabase Auth and current tabs. Depends on: A0.1. Done when fresh email registration works by mouse, keyboard and password manager with retained input on failure._
- [ ] **A1.2 — Finish password recovery instead of stopping at the email**: 识别 Supabase recovery session，显示“设置新密码/确认密码”，成功后清除恢复状态并进入工作台。_Modifies: account component/script; creates: recovery state tests; reuses: existing reset-email action. Done when an expired link, mismatched password, weak password and successful reset each have specific recovery guidance._
- [ ] **A1.3 — Add account-aware navigation and route protection**: 全局导航未登录显示“登录”，已登录显示“我的知识”；保护 `/workspace/*` 并在登录后返回原目标页。_Modifies: `PrimaryNav`, account/session bootstrap and workspace routing; creates: auth guard; reuses: Masthead and SPA navigation. Depends on: A1.1. Done when anonymous direct navigation never reveals workspace content and successful login restores the requested route._
- [ ] **A1.4 — Build the three-step welcome flow**: 完成显示名称/handle、知识库名称/默认私密、创建第一条知识三个步骤，支持返回、稍后完成与真实保存。_Creates: Welcome page/stepper; modifies: profile and knowledge-base writes; reuses: tokens, native form patterns and A0 data. Depends on: A1.1 and A0.2. Done when a new user reaches a persisted first draft without seeing technical terms._
- [ ] **A1.5 — Make account service failures understandable**: 覆盖 SDK 超时、离线、邮箱已存在、验证过期、频率限制和 Supabase 不可用状态，并提供可执行的下一步。_Modifies: account status/error mapping; creates: failure fixtures; reuses: inline live-region pattern. Depends on: A1.1–A1.3. Done when no auth failure is represented only by“操作失败” and the registration tab remains usable while the SDK loads._

## A2 — “My Knowledge” and Reliable Cloud Drafts

- [ ] **A2.1 — Replace the single local draft with the “My Knowledge” home**: 工作台展示新建主行动、最近编辑、草稿/已发布数量和真实知识列表；新用户看到说明价值的空状态。_Modifies: current workspace mode in `AccountPage`; creates: `KnowledgeList`, `KnowledgeStatus`; reuses: tokens and public knowledge metadata styling. Depends on: A1.3 and A0.2. Done when one user can see multiple own documents and never sees another user's record._
- [ ] **A2.2 — Create a private cloud draft before editing**: 点击“新建知识”立即在云端创建无标题私密草稿并跳转到稳定编辑 URL，失败时不进入假编辑状态。_Creates: new-document action/route; modifies: workspace list; reuses: document API/RLS. Depends on: A2.1. Done when refresh, browser back and second-device login all find the same draft._
- [ ] **A2.3 — Add debounced autosave with honest status**: 标题、正文和基础属性在停止输入后自动保存，显示正在保存、已保存、离线暂存、失败重试。_Modifies: editor script/component; creates: autosave controller and tests; reuses: A0.3 revision token. Depends on: A2.2. Done when typing, refresh, simulated 500 and network loss never produce silent data loss._
- [ ] **A2.4 — Handle offline recovery and edit conflicts**: 离线编辑进入按文档区分的本地队列；重连后同步，发生冲突时提供保留本地、使用云端或查看差异。_Creates: offline queue and conflict panel; modifies: autosave controller; reuses: confirm/focus patterns. Depends on: A2.3. Done when a two-tab conflict is reproducible and no choice silently destroys either version._
- [ ] **A2.5 — Make the library findable and manageable**: 增加标题搜索、草稿/已发布/已归档筛选、最近编辑排序，以及重命名、复制、移入回收站和恢复操作。_Modifies: `KnowledgeList`; creates: filters and item menu; reuses: existing search interaction principles. Depends on: A2.1. Done when keyboard users can complete every action and empty/no-result states always offer recovery._

## A3 — No-Code Modular Editor

- [ ] **A3.1 — Establish the calm editor shell**: 将现有长表单改为标题/正文优先的编辑页面，次要属性进入可折叠侧栏或分区；落实“个人档案馆 × 公共知识网络”的安静编辑桌方向。_Modifies: `AccountPage` editor markup/styles; creates: editor shell; reuses: `tokens.scss`, typography and 800/1200px breakpoints. Depends on: A2.2. Done when desktop、tablet、mobile and 200% zoom preserve one obvious writing task._
- [ ] **A3.2 — Add beginner-friendly templates**: 提供空白、读书笔记、问题研究、经验总结和资料摘录模板，以普通提示生成可编辑结构，不暴露 Markdown。_Creates: `TemplateChooser` and template data; modifies: new-document flow; reuses: editor shell. Depends on: A3.1. Done when selecting, previewing, changing and cancelling a template never overwrites existing content._
- [ ] **A3.3 — Turn module buttons into working content modules**: “添加来源/前置知识/待解决问题”等按钮在当前编辑位置创建可编辑模块，支持移动、折叠和撤销。_Modifies: current module controls; creates: module renderer/toolbar; reuses: native semantic controls. Depends on: A3.1. Done when every visible module control has a result, keyboard path and empty/error state._
- [ ] **A3.4 — Add structured multi-source editing**: 一条知识可添加多个来源，校验 URL，并可补充标题、作者、访问日期、个人说明或“个人经验”来源类型。_Creates: `SourceEditor`; modifies: source schema/API and editor; reuses: public provenance presentation. Depends on: A0.2 and A3.1. Done when invalid URLs retain input, multiple sources reorder safely and saved sources render in preview._
- [ ] **A3.5 — Ship version history and reversible destructive actions**: 在工作区查看重要版本、恢复旧版；清空、删除、撤回使用确认并提供短期撤销。_Modifies: `RevisionHistory` for owner view; creates: confirm dialog/toast; reuses: A0.3 snapshots. Depends on: A2.3. Done when restoring creates a new version rather than destroying later history._

## A4 — Tags, Classification, and Knowledge Links

- [ ] **A4.1 — Build an account-scoped tag system**: 新增标签、文档标签关联、规范化和 RLS；编辑器使用可搜索组合框选择已有标签或创建新标签。_Creates: `tags`, `document_tags`, `TagCombobox`; modifies: current plain tag input; reuses: public `TagList`. Depends on: A0.2 and A3.1. Done when duplicates from comma style, case and full-width variants merge predictably and all controls work by keyboard._
- [ ] **A4.2 — Add safe tag maintenance**: 在设置中支持重命名、合并和查看标签使用量，变更不破坏文档关系或公开 URL。_Creates: tag management view/API; modifies: workspace settings; reuses: tag system. Depends on: A4.1. Done when merging two tags is reversible through version/audit data and leaves no orphan association._
- [ ] **A4.3 — Upgrade automatic classification to explainable suggestions**: 基于标题、正文和标签给出最多三个主题候选、理由和置信提示；用户确认后才写入。_Modifies: current rule-based classifier; creates: suggestion panel and telemetry without content capture; reuses: existing topic taxonomy. Depends on: A3.1 and A4.1. Done when no suggestion, low confidence, rejection and manual override are all retained correctly._
- [ ] **A4.4 — Replace handwritten knowledge URLs with search**: 新增账户内知识搜索选择器，可选择前置、相关或继续阅读关系，并清楚显示关系方向。_Creates: `document_links`, `KnowledgeLinkPicker`; modifies: prerequisite/related text inputs; reuses: public relation components and search patterns. Depends on: A0.2 and A2.5. Done when circular/self links are prevented or explained and deleted targets degrade safely._
- [ ] **A4.5 — Preview the growing personal network accessibly**: 在工作区为当前知识显示关系列表和小型可视预览，图形之外提供等价列表；移动端默认列表。_Creates: personal relation preview; modifies: editor side panel; reuses: `RelatedKnowledge`, `PrerequisiteBlock`, map palette. Depends on: A4.4. Done when keyboard/list users can reach every relation without relying on pointer or color._

## A5 — Preview, Publish, and Share

- [ ] **A5.1 — Build a publication-ready preview**: 用公开阅读组件渲染作者将看到的页面，并显示标题、摘要、来源、关系、许可、成熟度和可见范围检查清单。_Creates: preview route/checklist; modifies: public components to accept draft data safely; reuses: `KnowledgeMeta`, `MaturityBadge`, relation/provenance components. Depends on: A3.4 and A4.4. Done when preview never becomes searchable or publicly accessible by guessing its URL._
- [ ] **A5.2 — Make visibility a deliberate choice**: 发布对话明确解释仅自己、持链接、公开三种范围；首次保持 private，只有用户选择后才改变。_Creates: visibility selector/publish dialog; modifies: document state API; reuses: confirm and status components. Depends on: A5.1. Done when unlisted content is absent from search、topics、RSS and sitemap, while its authorized link works._
- [ ] **A5.3 — Publish one stable public knowledge page end to end**: 服务端从授权快照生成安全公开内容、触发 Quartz 构建并更新最后成功发布版本；界面显示排队、构建、成功、失败和重试。_Modifies: A0.4 publish adapter, Quartz content input and deployment flow; creates: publish status UI; reuses: canonical slug/URL pipeline. Depends on: A5.2. Done when a failed build leaves the prior public version intact and retry cannot create duplicate pages._
- [ ] **A5.4 — Add author public library and discovery integration**: 创建 `/@/:handle/`，展示作者资料、公开知识、主题和最近修订；公开文档进入现有搜索、主题和关系网络。_Creates: public profile/library; modifies: catalog/search/topic generation; reuses: `TopicIndex`, `RecentGrowth`, `PageList`. Depends on: A5.3. Done when private/unlisted/archived documents never leak into counts or generated indexes._
- [ ] **A5.5 — Support sharing, revision, and withdrawal**: 发布成功可查看页面和复制稳定链接；后续发布保留 URL 与版本；撤回后从索引移除并向作者说明读者端结果。_Modifies: publish UI/API and public output state; creates: withdrawal flow; reuses: `CitationActions`, `RevisionHistory`. Depends on: A5.3. Done when share、republish、rollback、withdraw and republish-again are verified without broken canonical identity._

## A6 — Beginner Validation, Accessibility, and Release

- [ ] **A6.1 — Walk the full product as a first-time computer novice**: 使用全新邮箱和空浏览器状态完成注册 → 建库 → 第一条知识 → 标签/关系 → 预览 → 分享，记录每个犹豫、误点和求助点并修复 P0/P1。_Modifies: affected copy/components; creates: novice acceptance evidence; reuses: full A1–A5 flow. Depends on: A5.5. Done when a participant needs no code knowledge or外部操作说明 and can explain what is public._
- [ ] **A6.2 — Complete keyboard and screen-reader validation**: 检查语义、焦点、组合框、标签、步骤器、自动保存、冲突、对话框和发布状态，修复所有关键路径问题。_Modifies: affected components/styles; creates: accessibility assertions; reuses: existing focus tokens and live regions. Depends on: A6.1. Done when no P0/P1 WCAG 2.2 AA issue remains._
- [ ] **A6.3 — Complete responsive and content-resilience validation**: 验证 320/375/800/1024/1200/1536px、200% 缩放、软键盘、长双语标题、大量标签/来源和慢网络。_Modifies: editor/workspace responsive SCSS and overflow handling; creates: browser fixtures/screenshots; reuses: existing breakpoint system. Depends on: A6.1. Done when no critical task requires horizontal page scrolling or hidden controls._
- [ ] **A6.4 — Run security and privacy release review**: 验证 RLS、越权 ID、XSS、恶意 URL、缓存/退出、公开索引泄露、密钥扫描、数据导出与账户删除。_Modifies: affected policies/APIs/UI; creates: security release report; reuses: A0 tests. Depends on: A5.5. Done when every private-data test fails closed and no secret appears in browser/build artifacts._
- [ ] **A6.5 — Add critical browser regression coverage**: 自动化注册恢复之外的可控测试路径，包括登录、建库、新建、自动保存、离线/冲突、标签、链接、预览、发布失败/成功和撤回。_Creates: browser regression suite; modifies: test commands/fixtures; reuses: existing Quartz unit tests and preview deployment. Depends on: A6.2–A6.4. Done when production-like preview can reproduce failures and stable screenshots cover workspace/editor/public page._

## Review and Release

- [ ] **V1 — Design review against this brief**: 运行 `designer-design-review`，核对层级、认知负担、品牌连续性、响应式、无障碍与“小白无需代码”的核心要求。_Modifies: all affected UI; reuses: completed phases and brief. Depends on: A6.5. Done when P0/P1 and agreed P2 findings are fixed or explicitly documented._
- [ ] **V2 — Web Interface Guidelines pass**: 运行 `web-design-guidelines`，重点复查表单、错误、焦点、触控目标、状态反馈、危险动作、空状态和移动编辑体验。_Modifies: affected components; reuses: V1 evidence. Depends on: V1._
- [ ] **V3 — Production rehearsal and rollback proof**: 在生产副本上执行数据库迁移、类型检查、格式检查、单元/浏览器测试、Quartz 构建、发布队列和回滚演练。_Modifies: release documentation only unless failures surface; reuses: all test and migration utilities. Depends on: V2. Done when old public站点、PR #8/#9 features and new account paths all pass and rollback inputs are preserved._
- [ ] **V4 — Final owner acceptance**: 由产品所有者使用真实邮箱完成完整路径，确认默认隐私、术语、公开页面和分享行为后才合并发布。_Reuses: approved success scenarios. Depends on: V3._

## Recommended First Implementation Batch

先完成 **A0.1 → A0.2 → A1.1 → A1.3 → A2.1 → A2.2 → A2.3**。这一批结束时，用户已经可以安全登录、进入受保护工作台、创建多条账户级云端草稿并可靠自动保存；它直接解决当前最严重的“有账户但没有真正属于账户的知识库”问题，同时不依赖尚未完成的公开发布系统。
