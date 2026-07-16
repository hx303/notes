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
