# wouldkeep Edge Functions

第一阶段仅包含不调用真实模型的 `ai-write` 安全网关。它验证登录、来源、动作类型和内容长度，并返回明确的模拟响应。

```bash
supabase functions deploy ai-write
```

这一阶段不需要配置模型 API Key，也不会产生模型费用。后续接入真实模型时，密钥只能保存为 Supabase Function Secret，不能写进浏览器代码、Git 仓库或数据库普通表。
