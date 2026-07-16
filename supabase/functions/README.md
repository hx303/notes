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

后续获批接入时，密钥只能保存为 Supabase Function Secret：

```bash
supabase secrets set DEEPSEEK_API_KEY=your_key_here
```

不要把真实 Key 写入浏览器代码、Git 仓库、日志、测试夹具或数据库普通表。配置 Secret 本身不会自动启用模型调用；启用仍需单独的服务端开关、零预算解除和部署审批。
