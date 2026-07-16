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
- `InMemoryAiQuotaAuditBoundary` 是完全离线的参考实现与测试替身，不是生产多实例配额存储；生产接线前必须用 `service_role` 可执行、浏览器不可执行的数据库原子 RPC 替换；
- 成功、失败和 blocked 都产生终态审计；审计只含 SHA-256 输入哈希、能力/provider/model、token/cache、cost、latency、稳定错误码和时间，不含正文、提示词、模型输出或上游原始错误；
- policy 缺失、异常、`NaN`、负数或非整数均拒绝；成本估算失败、实际成本超过 reservation、审计 finalize 失败也不会静默成功。

调用方不能提交自己的费用估算。构造控制层时注入的 estimator 必须是受版本控制的服务端 rate card，并以模型、最大输入 token 和 `maxTokens` 计算最坏情况费用上界。若实际费用超过 reservation，本次调用记为 accounting failure，但审计仍记录完整实际费用，避免后续错误放行。

`ownerId` 必须来自已验证 JWT，`contentScope` 必须来自服务端查询得到的文档可见性；两者都不能取自请求 body。控制层会拒绝非 UUID owner 且不写入污染审计，但生产路由仍必须先完成身份与所有权验证。

这仍是准备代码：没有读取配置表或 Secret，没有连接 `ai-write`，也没有任何网络调用。生产原子 RPC、rate card、站点配置存储和部署验证仍是后续 A20 切片。

后续获批接入时，密钥只能保存为 Supabase Function Secret：

```bash
supabase secrets set DEEPSEEK_API_KEY=your_key_here
```

不要把真实 Key 写入浏览器代码、Git 仓库、日志、测试夹具或数据库普通表。配置 Secret 本身不会自动启用模型调用；启用仍需单独的服务端开关、零预算解除和部署审批。
