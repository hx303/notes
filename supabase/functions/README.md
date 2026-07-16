# wouldkeep Edge Functions

当前部署的 `ai-write` 仍是不会调用真实模型的安全网关。它验证登录、来源、动作类型和内容长度，并保持原有的固定模拟响应，因此不需要模型 API Key，也不会产生模型费用。

```bash
supabase functions deploy ai-write
```

## AI provider 接口与 DeepSeek 适配器

`_shared/ai-provider.ts` 定义了可替换的文本生成接口、能力声明和统一错误类型。`_shared/deepseek-provider.ts` 是首个适配器，当前实现：

- 使用 `POST https://api.deepseek.com/chat/completions` 和 Bearer 鉴权；
- 只接受当前模型 `deepseek-v4-flash` 或 `deepseek-v4-pro`，默认使用前者；普通写作关闭 thinking，首切片仅支持非流式响应；
- 归一化 400、401、402、422、429、500、503，并通过 `AbortController` 提供超时；
- 不发送 `store` 或 `user_id`；
- 明确声明 `supportsZeroRetention=false`、`allowsPrivateContent=false`，保留策略为 `provider_managed_or_unknown`。

适配器目前只是经过离线 fake-fetch 测试的代码能力，**没有接入 `ai-write`，没有启用、部署或调用真实模型**。DeepSeek 当前没有公开明确的 API 零保留承诺，API context cache 默认开启；在预算、审计、feature flag、内容同意与隐私门槛完成前，不得把私密笔记正文交给该适配器。

能力声明是供后续服务端路由执行策略的机器可读信号；本切片尚未创建真实调用路由，因此它本身不是私密内容过滤器。后续接线必须在调用 provider 之前根据内容分类拒绝私密正文，不能只依赖调用方自觉。

## A20 服务端安全控制边界

`_shared/ai-runtime-safety.ts` 提供尚未接入运行时的 fail-closed 控制层：

- `GuardedAiProvider` 只在原子 reservation 成功后调用 provider；DeepSeek 的 `allowsPrivateContent=false` 会让 `private` 和任何未知/非法内容分类在调用前被拒绝；
- `AiQuotaAuditBoundary` 把 reservation/finalization 定义为权威服务端原子操作，覆盖站点 live flag、用户 `enabled`、私密内容同意、月预算、每日请求和并发上限；
- `InMemoryAiQuotaAuditBoundary` 是完全离线的参考实现与测试替身，不是生产多实例配额存储；`20260717_ai_runtime_safety.sql` 提供了生产候选的 `service_role` 原子 reserve/finalize RPC；
- 成功、失败和 blocked 都产生终态审计；审计只含带所有者与生成控制的 HMAC-SHA256、能力/provider/model、rate-card 版本、token/cache、cost、cost basis、latency、稳定错误码和时间，不含正文、提示词、模型输出或上游原始错误；
- policy 缺失、异常、`NaN`、负数或非整数均拒绝；成本估算失败、实际成本超过 reservation、审计 finalize 失败也不会静默成功。

调用方不能提交自己的费用估算。构造控制层时注入的 estimator 必须是受版本控制的服务端 rate card，并以模型、最大输入 token 和 `maxTokens` 计算最坏情况费用上界。若实际费用超过 reservation，本次调用记为 accounting failure，但审计仍记录完整实际费用，避免后续错误放行。

`GuardedAiProvider` 不接受调用方提供的 `ownerId`、`contentScope` 或原始 provider prompt。它只把 HTTP Authorization header 与 route `documentId` 交给注入的 `AiRuntimeContextAuthority`；生产 authority 必须验证 JWT、用户身份、文档所有权和内容来源，并用服务端读取的数据构造 provider request。请求 body 中伪造的 owner、visibility 或 `public` 标签没有决定权。

只有服务端读取并确认的当前公开 publication snapshot 可以返回 `contentScope=public` 与 `publicSource=publication_snapshot`。private/unlisted draft、自由输入、无法证明来自该 snapshot 的 selection/context 一律解析为 `private` 或 `unknown`，DeepSeek 会在 provider 调用前阻断。authority 异常、非法 owner、非法 scope 或缺少 snapshot 证明时，不调用 provider，也不写入可能被污染的审计。

Provider 成功响应如果缺少 token usage，同样不会按零成本放行：控制层按 reservation 保守记为 failed/`usage_missing` 并抛出 accounting error。

本切片增加了尚未部署的生产候选边界：

- `SupabaseAiRuntimeContextAuthority` 用 publishable key + 用户 session JWT 查询 `/auth/v1/user` 和当前公开 publication snapshot，让 authenticated owner RLS 强制隔离；自由输入、private/unlisted 内容和无法验证的 selection/context 不会进入 DeepSeek；
- `SupabaseAiQuotaAuditBoundary` 只通过服务端 Secret 调用 reserve/finalize RPC。`sb_secret_` 仅作为 `apikey`，只有旧式 service-role JWT 才同时使用 Bearer；
- `deepseek-cny-2026-07-17` rate card 以人民币“分”为 `costCents` 的单位，用完整 wire JSON UTF-8 字节、固定/per-message framing 余量、全 cache-miss 和 `maxTokens` 做保守预占；provider、实际 model 与 rate card 是同一不可漂移身份，实际结算还要求总 token 和 cache hit/miss 完整一致；
- migration `20260717_ai_runtime_safety.sql` 默认保持 `live_enabled=false`，浏览器不能读取/写入运行配置，也不能写审计或执行 RPC；`supabase/tests/20260717_ai_runtime_safety.sql` 必须先在非生产 Supabase 执行并留存结果。

即使站点开关已启用，用户偏好中的 provider/model 也必须与本次请求和站点 active config 完全一致；旧的 `openai/unconfigured` 行会以 `provider_consent_required` 阻断，不能被批量静默改成 DeepSeek 同意。所有携带 Supabase 或 DeepSeek 凭据的请求都拒绝 HTTP redirect，避免凭据随 30x 转发。

这些仍是准备代码：没有读取环境变量或 Secret，没有连接 `ai-write`，没有部署迁移，也没有任何真实网络/付费模型调用。启用前仍需独立审查、非生产 SQL 验证、部署记录和新的明确批准。

后续获批接入时，密钥只能保存为 Supabase Function Secret：

```bash
supabase secrets set DEEPSEEK_API_KEY=your_key_here
```

不要把真实 Key 写入浏览器代码、Git 仓库、日志、测试夹具或数据库普通表。配置 Secret 本身不会自动启用模型调用；启用仍需单独的服务端开关、零预算解除和部署审批。
