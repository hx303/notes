# Build Tasks: wouldkeep AI 知识助手

Generated from: `.design/ai-knowledge-assistant/DESIGN_BRIEF.md`
Date: 2026-07-16

## 当前进度（2026-07-16）

- [x] 已完成默认关闭的 AI 设置页、个人空间入口与桌面/手机响应式验收。
- [x] 已编写四张基础表、pgvector、所有者 RLS 与浏览器写权限收紧迁移。
- [x] 已完成带 JWT、来源、动作和内容长度校验的无费用模拟网关。
- [x] 站长已在 Supabase 执行迁移，`ai-write` 已部署，未登录请求返回 `401`。
- [x] TypeScript、AI 专项测试、145 项全量测试与 Quartz 静态构建均通过。
- [x] 已运行 `supabase/tests/20260716_ai_assistant_rls.sql`；四项真实账户 RLS 断言全部通过：所有者可管理偏好、跨账户不可读写、浏览器不可写审计记录。
- [x] 站长已在登录状态下确认模拟网关只返回固定安全响应、`mock: true` 且没有产生模型费用；PR #11 已获明确授权并合并到 `main`。
- [x] DeepSeek provider 适配器已作为服务端、默认关闭的准备切片完成；无密钥、无运行接线、无真实调用、无部署，现有 mock 网关未改变。
- [ ] 在 A20 预算/审计保护、私密内容路由强制拒绝和单独启用授权完成前，不配置密钥、不调用真实模型、不部署替换现有 mock 网关。

## Foundation

- [x] **AI 设置与明确同意**：在 `/workspace/settings/ai/` 建立默认关闭的 AI 设置页，说明第三方处理范围、私密内容开关和月度额度；保存后刷新仍一致。 _Verified locally and in the merged PR #11 preview._
- [x] **AI 数据表与所有者 RLS**：新增 `ai_preferences`、`document_chunks`、`ai_runs`、`ai_suggestions` 和 pgvector 迁移，并以两个测试账户证明任何跨账户读写均失败。 _Migration deployed; four real-account RLS assertions passed._
- [x] **安全 AI 网关最小切片**：已建立 JWT/来源/动作/输入边界、固定 mock 响应、provider 接口、DeepSeek 超时与统一错误码、Secret 配置指南。供应商未提供 `store:false` 时不得虚构零留存；DeepSeek capability 明确为 `supportsZeroRetention=false`、`allowsPrivateContent=false`。 _No live hookup or deployment in the provider slice._
- [ ] **用量和预算保护**：让每次成功或失败调用都写入 `ai_runs`，实施每用户并发、日限额和月预算阻断，并在设置页展示可理解的剩余额度。 _Depends on: 安全 AI 网关；creates: usage service and quota states._

## Writing Assistant

- [ ] **选区改写端到端**：在现有写作台选择文字后出现“AI 帮我改”，支持润色、缩写和扩写，结果流式进入独立预览，不覆盖原文。 _Modifies: `AccountPage.tsx`、`accountPage.inline.ts`、`accountPage.scss`; reuses: current editor and save status._
- [ ] **接受、插入、拒绝与重新生成**：预览面板提供四个明确动作；接受时验证 `base_version` 并通过现有保存逻辑生成 `document_versions`，版本冲突时不应用旧结果。 _Reuses: existing document version/conflict RPC; creates: AI suggestion preview state._
- [ ] **草稿级提纲和元数据建议**：在未选中文字时支持生成提纲、标题、摘要和已有标签优先的标签建议，用户可逐项采用。 _Reuses: tags and editor form; modifies: editor metadata region._
- [ ] **来源缺口检查**：分析草稿中的主要结论，返回“需要来源”的可点击清单；不自动生成虚假网址或来源。 _Reuses: `document_sources`; creates: source-gap suggestion card._

## Indexing & Retrieval

- [ ] **文档分块预览工具**：实现按标题和段落分块、内容哈希和标题路径保留，并提供开发态预览，使用中文长文验证块大小与边界。 _Creates: chunker and unit tests; reuses: Markdown source stored in documents._
- [ ] **保存后异步索引**：文档成功保存后发送幂等队列任务，worker 只为变化片段生成向量，删除文档时清理块；失败可重试且不阻塞保存。 _Reuses: Supabase Queues and document version; creates: `ai-index-worker`._
- [ ] **RLS 范围内语义搜索**：在 `/workspace/knowledge/` 增加语义搜索模式，结果显示匹配片段和所属文档；查询只能返回当前用户选定知识库中的块。 _Modifies: knowledge list/search; creates: vector match RPC._
- [ ] **混合检索与中文基准**：加入 PostgreSQL 全文搜索和 RRF 排序，用固定中文测试集比较语义、关键词、混合三种结果后确定默认参数。 _Depends on: 语义搜索；creates: evaluation script and retrieval configuration._

## Organization Inbox

- [ ] **单篇文档整理建议**：从知识详情发起整理，生成结构化标签、分类、相关文档和知识链接建议，并写入 `ai_suggestions`。 _Reuses: `tags`、`document_tags`、`document_links`; creates: `ai-organize` Edge Function._
- [ ] **待整理页面**：新增 `/workspace/organize/`，按建议类型分组，显示理由、证据、置信度和目标变更，支持逐条接受或拒绝。 _Modifies: personal-space navigation; creates: organization inbox component and states._
- [ ] **安全批量接受**：允许对同类型建议批量选择，但提交前展示变更清单，并逐条校验所有权与 `base_version`；部分失败必须明确报告。 _Depends on: 待整理页面；creates: accept endpoint and partial-success UI._
- [ ] **重复与合并候选**：使用向量相似度加标题/正文规则发现重复文档，提供并排比较和“保留两篇/建立相关链接/进入手动合并”，不提供一键无审阅删除。 _Reuses: document versions and links; creates: comparison view._

## Grounded Knowledge Chat

- [ ] **问答范围选择器**：新增 `/workspace/ask/`，用户必须先选择知识库或文档；界面持续显示当前证据范围并可随时缩小。 _Reuses: knowledge base/document selector; creates: ask page._
- [ ] **带引用的流式回答**：`ai-chat` 完成查询向量、Top-K 检索、答案生成和引用 ID 校验；前端流式显示并让引用跳转到正确文档标题。 _Depends on: 混合检索；creates: chat endpoint and citation component._
- [ ] **证据不足与攻击内容处理**：没有达到检索阈值时明确拒答；加入包含提示注入文本的测试文档，确认其不能改变系统指令或调用未授权工具。 _Reuses: shared error/empty-state language; creates: grounding guard tests._

## Operations, Privacy & Quality

- [ ] **站长运行健康页**：在 `/admin/` 仅展示调用量、成功率、延迟、错误码和估算费用，不展示普通用户正文、提示词或模型完整输出。 _Modifies: existing admin shell; creates: aggregated metrics RPC._
- [ ] **AI 数据查看与删除**：用户可以查看最近 AI 活动并删除建议、运行元数据和向量；账户删除时验证级联清理。 _Modifies: AI settings page; creates: deletion RPC and confirmation state._
- [ ] **50 条中文评估集**：覆盖标签、链接、重复、引用正确性、拒答和跨账户隔离，记录基准模型、提示词版本和通过阈值。 _Creates: eval fixtures and repeatable evaluation command._
- [ ] **可访问性与失败状态**：完成键盘操作、焦点恢复、屏幕阅读器状态、流式取消、超时、离线、限额、服务不可用和 reduced-motion 验收。 _Modifies: all new AI surfaces; reuses: current design tokens and accessible status patterns._
- [ ] **站长灰度发布**：以服务端 feature flag 仅向站长开放，验证费用、引用和版本回退；通过后按邀请账户逐步扩大，不改动未开启用户的现有工作流。 _Creates: rollout config and rollback checklist._

## Review

- [ ] **安全评审**：确认构建产物无模型密钥，Edge Functions 验证 JWT，RLS 双账户测试通过，AI 输出不能直接执行任意数据库或网络操作。
- [ ] **产品验收**：以电脑小白身份完成“打开 AI → 润色一段文字 → 接受并回退版本 → 整理标签 → 基于知识库提问并核对引用”的完整流程。
- [ ] **设计评审**：运行 design review，对照设计说明检查层级、文案、窄屏、加载/空/错状态和 AI 修改透明度。
