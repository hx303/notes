# DeepSeek provider 独立安全与契约审查

- 审查日期：2026-07-16（Asia/Shanghai）
- 审查基线：`72ea5f96cfaa2601fd96a8923ce2635caa972a9d`
- 候选工作树：`worktrees-next/ai-deepseek-provider`
- 审查范围：provider 抽象、DeepSeek adapter、离线 fake-fetch 测试、Edge Functions README 与已批准的设计契约
- 总结：**通过，无 P0/P1；有一个必须保留到未来接线阶段的 P2 门槛。**

## 已验证结论

- `ai-write` 未修改，当前已部署行为仍是固定 mock；没有部署、真实模型请求、密钥配置或付费调用。
- provider 代码仅位于 `supabase/functions/_shared/**`；Quartz 生产组件没有导入它，浏览器构建不会获得 provider 密钥。
- API Key 只通过服务端构造参数进入 `Authorization: Bearer ...`，会先去除首尾空白；仓库中没有真实 Key。
- endpoint 固定为 `https://api.deepseek.com/chat/completions`，不能被运行时参数改到第三方域名后携带密钥外送。
- 默认模型为 `deepseek-v4-flash`，仅允许 `deepseek-v4-flash` / `deepseek-v4-pro`；已弃用别名被运行时白名单拒绝。
- 普通写作请求固定 `stream:false` 且显式 `thinking:{type:"disabled"}`；不发送 `store`、`user_id` 或工具定义。
- timeout 与调用方 abort 分开归一；400/401/402/422/429/500/503、未知 HTTP、网络、畸形响应、空输出、截断、内容过滤及资源不足均返回稳定错误码。
- 上游原始错误文本不会进入 `AiProviderError.detail`，避免未来日志或 API 响应回显私密内容、提示词或密钥。
- 测试全部使用注入的 fake fetch；没有网络请求。审查代理独立运行 focused tests 9/9、`tsc --noEmit` 和 `git diff --check`，全部通过。
- 能力声明保守标记 `supportsZeroRetention=false`、`allowsPrivateContent=false`、`retention=provider_managed_or_unknown`，符合当前隐私证据。

## 审查中发现并已修复

1. 上游原始 `error.message` 原先会进入可传播的 `detail`；已改为永远不携带原始 detail。
2. 空白输出和 `finish_reason=length` 原先会被当作成功；已分别归一为 `empty_output` / `output_truncated`。
3. 可覆盖 endpoint 原先可能让 Bearer Key 因误配置发送到非官方域；已改为固定官方 endpoint。
4. 模型原先接受任意字符串；已限制为当前批准的 v4 Flash/Pro，并在运行时验证。
5. `content_filter` / `insufficient_system_resource` 在没有文本时原先可能先落入畸形响应；已调整判断顺序并增加离线测试。

## 剩余 P2 / 后续启用门槛

`allowsPrivateContent=false` 目前是路由策略可读取的能力声明，不是 adapter 内部的内容分类器。由于本切片没有创建真实调用路由，这不是当前阻断项；但未来把 provider 接入 `ai-write` 前，服务端 router 必须以强制内容分类拒绝私密正文，并同时完成 A20 预算/审计、feature flag、用户同意、密钥 secret、隐私评审和单独部署授权。不能把 capability 声明本身当作已执行的保护。

## 官方契约依据（审查时点）

- DeepSeek API 首页：`https://api-docs.deepseek.com/`
- Chat Completions：`https://api-docs.deepseek.com/api/create-chat-completion`
- 错误码：`https://api-docs.deepseek.com/quick_start/error_codes`
- Rate limit / user_id：`https://api-docs.deepseek.com/quick_start/rate_limit`
- Context cache：`https://api-docs.deepseek.com/guides/kv_cache`
- 隐私政策：`https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html`

截至 2026-07-16，官方文档列出 `deepseek-v4-flash` / `deepseek-v4-pro`，并说明旧别名 `deepseek-chat` / `deepseek-reasoner` 将于 2026-07-24 停用。官方没有公开可用于本接口的零保留承诺；磁盘 context cache 默认启用，隐私政策也没有固定的 API 输入零保留期限，因此本项目不得把该 provider 描述为 zero-retention。

## A20 runtime safety 复审（候选 `b93d1a3a`）

初始候选：`b93d1a3a29e389b356433345f361bdfae02fbfc0` 发现两个接线前 P1；当前代码未接入 `ai-write`，因此不是现网漏洞。

修复候选：`8260d96dfceeac464c4c03addd745753800feca5`。

最终状态：**通过；两项 P1 均已修复，最终无 P0/P1。**

### P1 — 身份与内容 scope 缺少不可伪造的来源

`GuardedAiRequest` 直接接受普通 `ownerId: string` 与 `contentScope`；`GuardedAiProvider` 只验证 UUID 外形，然后把 caller 声明的 owner/scope 交给 reservation。caller 可以提交另一个合法 UUID，并把私密正文标成 `public`，从而使用其他 owner 的 policy/quota 或绕过 private-content gate。README 要求字段来自 JWT 与服务端 visibility 查询，但文档约束不是代码保障。

修复结果：guard 输入已缩减为 Authorization header 与 route `documentId`；注入的 `AiRuntimeContextAuthority` 负责验证 JWT、所有权与内容来源，并返回 owner/scope/publicSource/providerRequest。`public` 必须带服务端 publication snapshot 证明。额外夹带的 body owner/scope 不会进入 authority 决策，测试证明伪造字段无法到达 provider。

### P1 — 缺失 usage 时可能以零成本成功释放 reservation

DeepSeek adapter 对缺失/不完整 token usage 返回 `usage=null`，而 guard 接受 `calculateCostCents(result) === 0` 并把运行标记为 `succeeded`、释放全部 reservation。一次已经发生的付费调用因此可能不计入月预算。现有测试覆盖 NaN 和实际成本超过 reservation，但没有覆盖 `usage=null + cost=0`。

修复结果：缺失或不完整 usage 现在以 `usage_missing` 失败，并按 reservation 保守结算；不会以成功/零成本释放额度。新增回归测试覆盖该路径。

### 已确认的正向证据与剩余 P2

- 如实传入 `private` / `unknown` 时，会在 provider 前 blocked；site/user/zero-budget、daily/monthly/concurrency blocked 路径也不会调用 provider。
- in-memory reference 在单实例内串行执行 reservation，成功/失败/blocked 都有终态审计；finalize 失败不会静默向 caller 返回成功。
- 审计结构不保存正文、prompt、输出或上游原始错误。
- `InMemoryAiQuotaAuditBoundary` 只具有单实例原子性，不能用于生产多实例；README 已明确生产必须替换为 service-role-only 数据库原子 RPC。
- commit 没有修改 `ai-write`，没有读取 env/Key，没有部署或网络调用；测试使用 fake provider/fetch。
- 修复后审查代理独立运行 A20 + DeepSeek focused tests 27/27、`tsc --noEmit` 与 diff-check，全部通过。

### 最终剩余 P2 与生产启用门槛

- 普通 SHA-256 `inputHash` 会泄露输入相等性，也可能被字典猜测；生产审计宜改为服务端 HMAC，或在隐私评审中明确接受该风险（P2）。
- 当前 `AiRuntimeContextAuthority` 只有接口与离线 fake；生产必须实现真实 Supabase JWT 验证、owner/document ownership、publication snapshot 来源与 content scope 查询，并补 owner/other-user/anonymous 证据。
- `InMemoryAiQuotaAuditBoundary` 只在一个进程实例内原子；生产必须以浏览器不可执行、仅受信服务端可调用的数据库原子 reserve/finalize RPC 替换，并验证站点开关、用户开关、月预算、每日次数和并发在多实例下不能竞态绕过。
- 必须建立受版本控制的 DeepSeek rate card 与最坏情况 reservation 计算，验证 cache hit/miss、输入/输出 token、舍入、模型切换、usage 缺失及价格变更。
- 仍需数据库迁移/RLS 双账户证据、真实审计 finalize 故障演练、secret/feature flag 配置记录、部署前后 SHA 与回滚验证；在这些门槛和单独用户授权完成前，不得接入 `ai-write`、设置 Key、部署或发起真实/付费调用。
