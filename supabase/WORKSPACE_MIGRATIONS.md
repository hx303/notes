# wouldkeep 账户工作区迁移顺序

账户工作区的前端代码已经准备好。以下顺序只用于全新空项目或首次安装；**wouldkeep 现有生产项目不得在 SQL Editor 中手工重跑这十份迁移**。生产历史只能在对象级只读核验、专项审批后按 `MIGRATION_HISTORY_NORMALIZATION.md` 执行 ledger-only repair，不能执行这些 SQL。

全新空项目首次验收前，在 Supabase SQL Editor 中按顺序执行以下文件：

1. `schema.sql`：现有账户、评论和角色基础表。如果这些表已经存在，不要重复执行此文件。
2. `migrations/20260718000100_knowledge_workspace_foundation.sql`：个人知识库、文档草稿与所有者 RLS。
3. `migrations/20260718000200_document_versions.sql`：版本号、版本快照与冲突保护。
4. `migrations/20260718000300_document_organization.sql`：标签、知识关系与所有者 RLS。
5. `migrations/20260718000400_document_sources.sql`：多来源卡片、原子替换函数与所有者 RLS。
6. `migrations/20260718000500_publication_flow.sql`：只读发布快照、稳定阅读链接、撤回发布与公开发现接口。
7. `migrations/20260718000600_site_owner_permissions.sql`：受保护的站长身份、角色管理安全加固、公开内容下架与审计。普通用户的私人正文 RLS 不会因此放开。
8. `migrations/20260718000700_profile_avatars.sql`：建立公开头像存储桶，并限制登录用户只能上传或更新自己目录下的头像。文件大小上限为 2 MB，仅允许 JPG、PNG 与 WebP；不会删除现有账户或业务数据。
9. `migrations/20260718000800_profile_personalization.sql`：为个人资料增加个性签名、个人简介、所在地与个人链接，并添加长度约束。所有字段均为选填，不会改变现有账户数据和 RLS。
10. `migrations/20260718000900_ai_assistant_foundation.sql`：增加默认关闭的 AI 设置、费用上限、运行审计、建议记录与知识分块，并启用所有者 RLS。此迁移不会连接模型，也不会产生费用。
11. `migrations/20260718001000_ai_runtime_safety.sql`：增加默认关闭的生产运行配置、预算预留/结算 RPC 与审计约束；不会自行打开实时调用。

## 将“夔嵬知识库”迁入站长账户

只在前 7 项已经成功后执行。目标账户固定为 `2149665127@qq.com`；每个文件都会再次核对 UUID，不匹配就立即停止。

按文件名顺序运行 `supabase/generated/` 中的文件：

1. `20260714_legacy_import_00_foundation.sql`
2. `20260714_legacy_import_01_documents.sql` 至 `20260714_legacy_import_06_documents.sql`
3. `20260714_legacy_import_07_links.sql`
4. `20260714_legacy_import_08_verify.sql`

验证结果中的 `imported_documents` 应为 **258**。导入采用固定 ID 和 `ON CONFLICT DO NOTHING`，重复运行不会覆盖账户里已经编辑过的正文。原 `content/` 文件不会删除，原公开网址继续工作；账户副本默认是 `ready / private`，整理后再逐篇发布。

`generated/ROLLBACK_legacy_import.sql` 只是紧急回滚模板，所有删除语句默认都被注释。正常安装不要运行它。

## 执行方式

在 Supabase Dashboard → SQL Editor 中逐个打开并运行。每个文件都应显示成功；不要跳过顺序，也不要把 `service_role` key 放到网页代码中。

如果运行 `schema.sql` 时看到 `relation "profiles" already exists`，说明基础表已经存在。不要删除已有表，直接从第 2 个文件开始。Supabase 对包含 `DROP POLICY IF EXISTS` 或 `DROP TRIGGER IF EXISTS` 的迁移可能显示“包含破坏性操作”提示；这些语句只是在重建同名策略或触发器，不会删除业务表或文档数据。

执行后，用两个不同邮箱做最小安全验收：

- 用户 A 注册并进入 `/workspace/`，创建一条知识并确认列表出现。
- 用户 A 刷新页面，确认草稿仍然存在；修改内容后确认自动保存状态变化。
- 用户 A 添加来源并发布/撤回一条测试知识，确认公开快照与私人草稿彼此独立。
- 用户 B 登录后只能看到自己的空知识列表，不能读取用户 A 的文档、标签、关系或来源。
- 在两个标签页同时修改同一文档，确认后保存的一方看到“发现版本冲突”。
- 为文档添加标签、前置知识和相关知识，刷新后确认关系仍然存在。
- 检查可见范围默认是“仅自己可见”。公开发布接口尚未接入前，不要把私密文档手工写入公共内容目录。

## 常见现象

如果页面提示“工作区迁移尚未执行”，通常表示第一份工作区迁移没有成功；先检查 `knowledge_bases` 和 `documents` 表是否存在，再重新运行对应文件。

如果正文能保存，但来源提示“尚未同步”，请运行 `20260718000400_document_sources.sql`。如果正式发布不可用，请运行 `20260718000500_publication_flow.sql`。

如果个人设置页提示“头像存储还没有启用”，请运行 `20260718000700_profile_avatars.sql`。执行成功后无需重新注册或重新登录，刷新页面即可上传头像。

如果个人设置页提示“扩展个人资料尚未启用”，请运行 `20260718000800_profile_personalization.sql`。这些字段属于用户主动公开的信息，登录邮箱不会因此公开。

如果 AI 设置页提示“AI 设置尚未启用”，请运行 `20260718000900_ai_assistant_foundation.sql`。运行成功后刷新 `/workspace/settings/ai/`；默认开关与费用均为关闭或 0。

如果“测试安全网关”提示尚未部署，请在安装并登录 Supabase CLI 后运行 `supabase functions deploy ai-write`。第一阶段的函数只返回模拟结果，不需要模型 API Key，也不会读取真实笔记。

前端 TypeScript 和 Quartz 构建通过，并不能替代数据库迁移和 RLS 验收。
