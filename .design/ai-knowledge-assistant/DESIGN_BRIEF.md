# wouldkeep AI 知识助手设计说明

日期：2026-07-16
状态：实施前方案

## 1. 目标

在不改变“知识归个人所有、分享由本人决定”的前提下，为 wouldkeep 增加两类能力：

1. **AI 辅助写作**：围绕用户当前选区或草稿提供润色、扩写、缩写、提纲、摘要和来源缺口建议。
2. **AI 辅助整理**：基于用户自己的知识库推荐标签、分类、知识链接、相似或重复文档，并提供有引用的知识库问答。

AI 只生成可审阅的建议。除非用户明确点击“接受”，AI 不修改正文、不改变标签、不建立知识链接，也不发布内容。

## 2. 用户与成功标准

### 核心用户

- 不懂代码、希望从粘贴或导入开始整理知识的普通用户。
- 已积累大量笔记，希望降低分类、去重和建立关联成本的重度用户。
- 站长，只管理服务配置、额度和运行健康度，不读取普通用户私有正文。

### 成功标准

- 用户能在编辑器中通过一次选择和一次点击获得建议，并能预览、接受、拒绝或重新生成。
- 所有被接受的 AI 修改都会产生新的 `document_versions` 快照，并遵循现有版本冲突保护。
- 知识库问答的事实性回答必须带有可点击的文档或来源引用；没有证据时明确说明证据不足。
- 两个不同账户之间的文档、向量、建议和调用记录通过 RLS 完全隔离。
- 浏览器构建产物中不出现模型 API 密钥、Supabase secret/service-role key 或内部任务密钥。
- 每个用户均有明确的 AI 开关、数据范围提示和月度用量上限。

## 3. 产品原则

1. **先建议，后修改**：任何 AI 操作默认进入预览或建议箱。
2. **展示证据范围**：调用前说明会发送“当前选区”“当前文档”或“检索到的 N 个片段”。
3. **来源优先**：知识问答默认只使用用户选择的知识库；模型常识与知识库证据必须在界面上区分。
4. **最小数据传输**：交互写作只发送选区和必要上下文；RAG 只发送 Top-K 片段，不发送整座知识库。
5. **可逆与可追溯**：记录模型、提示词版本、基础文档版本和接受者，但默认不长期保存完整提示词与原始响应。
6. **模型可替换**：第一阶段使用一个成熟供应商，但业务接口不得把模型名称写死在前端。
7. **费用可预期**：小模型处理分类与改写，高能力模型只用于用户明确发起的复杂任务；批量整理异步执行。

## 4. 范围

### 第一轮纳入

- 选区润色、扩写、缩写、总结、改变表达方式。
- 草稿标题、摘要、提纲和标签建议。
- 文档分块、向量索引和语义检索。
- 相似文档、重复内容和知识链接建议。
- 整理建议箱及接受/拒绝流程。
- 限定知识库的问答与文档级引用。
- AI 设置、额度、调用状态和失败恢复。

### 暂不纳入

- AI 自动发布内容。
- AI 无确认地批量改写私人文档。
- 全自动联网研究和抓取受版权保护的内容。
- 多智能体自治工作流。
- 训练或微调个人模型。
- 第一阶段更换现有编辑器为 Tiptap 或 BlockNote。
- 用户自行粘贴任意第三方 API Key。

## 5. 信息架构

- `/workspace/write/`：保留当前写作入口，新增选区 AI 菜单、草稿级 AI 操作和修改预览。
- `/workspace/knowledge/`：保留知识列表，新增“待整理”入口、相似内容提示和语义搜索。
- `/workspace/organize/`：新增整理建议箱，按标签、链接、重复、来源缺口分类。
- `/workspace/ask/`：新增知识库问答页，用户先选择知识库或具体文档，再开始提问。
- `/workspace/settings/ai/`：新增 AI 开关、数据说明、月度额度和清除 AI 记录入口。
- `/admin/`：只增加服务健康度、总量和错误率；不展示普通用户私有正文或提示内容。

## 6. 技术架构

```text
Quartz / Preact 前端
  └─ 登录用户 JWT
      └─ Supabase Edge Functions
          ├─ ai-write：交互式写作与元数据建议
          ├─ ai-organize：生成结构化整理建议
          ├─ ai-chat：检索、生成和引用校验
          └─ ai-index-worker：异步分块与嵌入
              ├─ OpenAI Responses API（第一阶段）
              ├─ Embeddings API（固定模型版本）
              ├─ Supabase Queues
              └─ PostgreSQL + pgvector + RLS
```

### 服务端边界

- 所有公开前端请求都通过用户 JWT 调用 Edge Function。
- Edge Function 使用用户态 Supabase 客户端读取数据，让 RLS 继续生效。
- 模型密钥只存放于 Supabase Project Secrets。
- 只有队列消费者使用单独的内部 secret；service role 只在确有必要的后台任务中使用。
- 第一阶段直接使用官方模型 SDK，并在 `ai-provider.ts` 后抽象供应商；需要第二供应商时再评估 Vercel AI SDK。

## 7. 数据模型

### `ai_preferences`

- `owner_id uuid primary key`
- `enabled boolean default false`
- `allow_private_content boolean default false`
- `monthly_budget_cents integer`
- `grounding_mode text`：`selected_only` / `knowledge_base`
- `provider text`
- `model text`
- `created_at` / `updated_at`

仅本人可读写。站长只能看到匿名化总量，不读取个人偏好详情。

### `document_chunks`

- `id uuid primary key`
- `owner_id uuid`
- `knowledge_base_id uuid`
- `document_id uuid`
- `document_version bigint`
- `chunk_index integer`
- `heading_path text[]`
- `content text`
- `content_hash text`
- `embedding vector(1536)`
- `embedding_model text`
- `created_at` / `updated_at`

唯一约束：`document_id + document_version + chunk_index`。文档更新时只重算内容哈希变化的片段。删除文档时级联删除向量。

### `ai_runs`

- `id uuid primary key`
- `owner_id uuid`
- `knowledge_base_id uuid null`
- `document_id uuid null`
- `capability text`
- `provider text`
- `model text`
- `prompt_version text`
- `input_hash text`
- `status text`
- `input_tokens` / `output_tokens`
- `estimated_cost_micros bigint`
- `latency_ms integer`
- `error_code text null`
- `created_at` / `completed_at`

默认不保存完整提示词和完整模型响应。调试期间如需采样，必须脱敏、限时并由站长显式开启。

### `ai_suggestions`

- `id uuid primary key`
- `owner_id uuid`
- `knowledge_base_id uuid`
- `document_id uuid`
- `run_id uuid`
- `base_version bigint`
- `suggestion_type text`
- `status text`：`pending` / `accepted` / `rejected` / `expired`
- `payload jsonb`
- `evidence jsonb`
- `confidence numeric`
- `created_at` / `resolved_at`

接受建议前再次验证 `base_version`。版本已变化时，不静默套用旧建议，而是提示用户重新生成。

## 8. API 合约

### `POST /functions/v1/ai-write`

请求：`document_id`、`base_version`、`action`、`selection`、有限前后文。

响应：流式文本或结构化修改建议；返回 `run_id`，不直接写入文档。

允许动作：`rewrite`、`shorten`、`expand`、`summarize`、`outline`、`metadata`、`source_gaps`。

### `POST /functions/v1/ai-organize`

请求：一个文档或用户明确选中的文档集合。

响应使用固定 JSON Schema：推荐标签、知识库归属、相关文档、重复候选、链接类型、理由、证据片段和置信度。结果写入 `ai_suggestions`。

### `POST /functions/v1/ai-chat`

请求：问题、知识库范围、可选文档 ID、会话中最近的少量消息。

服务端流程：生成查询向量 → RLS 范围内混合检索 → 组装 Top-K 片段 → 生成答案 → 校验引用 ID → 流式返回答案和引用。

### `POST /functions/v1/ai-suggestions/:id/accept`

服务端验证所有权、建议状态和 `base_version`。接受写作修改时调用现有保存/版本逻辑；接受标签或链接建议时写入现有 `document_tags` 或 `document_links`。

## 9. 分块与检索策略

- 以 Markdown 标题为第一边界，段落为第二边界。
- 初始目标为每块约 400–700 tokens，并保留少量相邻重叠。
- 每块保存标题路径、文档 ID、知识库 ID、版本号和来源索引。
- 第一阶段使用语义检索；验证后增加 PostgreSQL 全文检索并以 RRF 做混合排序。
- 默认 Top-K 为 6，并设置最低相似度；不相关片段不进入提示词。
- 嵌入模型和维度一旦变更，使用新列或新版本批量重建，不能比较不同模型生成的向量。

## 10. 关键交互

### 写作助手

1. 用户选中文字或在空白草稿中点击“AI 帮我写”。
2. 菜单显示具体动作及本次数据范围。
3. AI 结果流式出现在正文旁的预览面板，不覆盖正文。
4. 用户选择“替换选区”“插入下方”“重新生成”或“放弃”。
5. 接受后调用现有保存流程并创建新版本。

### 整理建议箱

1. 文档保存后进入索引队列。
2. 索引完成后按需产生整理建议。
3. 建议箱按类型分组，并显示理由、证据、置信度和影响范围。
4. 用户可以逐条或同类型批量接受；批量操作前显示具体变更清单。

### 知识库问答

1. 用户先勾选一个或多个知识库/文档。
2. 界面持续显示当前证据范围。
3. 答案中的引用使用稳定文档 ID 和片段 ID。
4. 点击引用打开原文并定位到对应标题或片段。
5. 没有足够证据时提供“换个问法”“扩大范围”“去添加来源”，不编造答案。

## 11. 安全与隐私

- AI 默认关闭，首次使用前展示简短同意说明。
- `allow_private_content` 为 false 时，不把私密正文发送到第三方模型。
- Edge Function 必须验证 JWT、所有权、输入长度、动作白名单和速率限制。
- 知识内容视为不可信数据；片段中的“忽略前面指令”等文字不得成为系统指令。
- 模型输出不能直接执行 SQL、URL 请求或任意工具；只允许固定结构化动作。
- 每用户、每 IP 和每项目设置并发限制与日/月预算。
- 使用供应商支持的最小保留配置；请求设置 `store: false`。
- 用户可以删除 AI 建议、运行元数据和向量；删除账户时全部级联清除。
- 分享内容和私密内容分别检索，不能因为站长身份绕过普通用户私有正文 RLS。

## 12. 模型与费用策略

- 分类、标签、标题、摘要和普通改写使用成本较低的模型。
- 矛盾分析、多文档综合等复杂任务在用户明确发起时使用高能力模型。
- 初始嵌入模型固定为一个经过中文检索基准验证的模型；模型名和维度写入每条 chunk。
- 首次为历史文档建索引使用批处理；新增或修改文档只处理变化片段。
- 月度预算达到 80% 时提示，达到 100% 时停止付费调用并保留本地编辑能力。
- 所有供应商价格均由服务端配置维护，不在前端写死。

## 13. 质量评估

在正式灰度前建立至少 50 条中文测试集，覆盖：

- 已有标签复用准确率。
- 新标签是否过度生成。
- 相似/重复文档召回率。
- 推荐知识链接是否有可解释证据。
- 问答引用是否真实支持答案。
- 找不到证据时是否拒绝编造。
- Prompt injection 文本是否会改变系统行为。
- 两账户 RLS 隔离。

核心产品指标：建议接受率、重新生成率、引用点击率、无依据回答率、每成功接受建议的平均成本和 P95 首字延迟。

## 14. 灰度和回滚

1. 仅站长账户开启，验证写作动作和成本记录。
2. 邀请少量账户开启，AI 仍默认关闭。
3. 开启文档索引和语义搜索，不开放批量修改。
4. 开启整理建议箱和知识库问答。
5. 指标稳定后再向全部用户展示入口。

所有入口受服务端 feature flag 控制。关闭 flag 后，现有笔记、版本、标签、链接和普通搜索仍正常工作；AI 数据表可以保留或按用户要求删除，不影响核心知识库。
