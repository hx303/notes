import assert from "node:assert"
import { readFileSync } from "node:fs"
import test from "node:test"

test("AI settings are consent-first and default to no paid calls", () => {
  const component = readFileSync(new URL("./AccountPage.tsx", import.meta.url), "utf8")
  const script = readFileSync(new URL("./scripts/accountPage.inline.ts", import.meta.url), "utf8")
  const folderPage = readFileSync(new URL("./pages/FolderContent.tsx", import.meta.url), "utf8")

  assert.match(component, /workspace\/settings\/ai/)
  assert.match(component, /data-ai-settings-form/)
  assert.match(component, /data-ai-enabled/)
  assert.match(component, /data-ai-private-content/)
  assert.match(component, /不开启付费调用（推荐）/)
  assert.match(component, /AI 只能提出建议/)
  assert.match(component, /DeepSeek 已配置 · 实时调用默认关闭/)
  assert.match(component, /站点实时开关和你的个人开关同时开启/)
  assert.match(component, /当前不会把私人笔记发送给 DeepSeek/)
  assert.doesNotMatch(component, /未连接付费模型|下一阶段再由站长配置模型密钥/)
  assert.match(script, /from\("ai_preferences"\)[\s\S]*?\.upsert/)
  assert.match(script, /writeAiSettingsDraft\(sessionStorage/)
  assert.match(script, /readAiSettingsDraft\(sessionStorage/)
  assert.match(script, /clearAiSettingsDraft\(sessionStorage/)
  assert.match(script, /provider: "deepseek"/)
  assert.match(script, /model: "deepseek-v4-flash"/)
  assert.match(
    script,
    /\.select\("enabled,allow_private_content,monthly_budget_cents,grounding_mode,updated_at"\)[\s\S]*?\.single\(\)/,
  )
  assert.match(script, /aiSettingsForm\.dataset\.saving === "true"/)
  assert.match(script, /functions\.invoke\("ai-write"/)
  assert.match(folderPage, /settings\(\?:\\\/ai\)\?/)
})

test("AI database foundation applies owner RLS and prevents direct audit writes", () => {
  const migration = readFileSync(
    new URL(
      "../../supabase/migrations/20260718000900_ai_assistant_foundation.sql",
      import.meta.url,
    ),
    "utf8",
  )

  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.ai_preferences/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.document_chunks/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.ai_runs/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.ai_suggestions/)
  assert.match(migration, /ALTER TABLE public\.ai_preferences ENABLE ROW LEVEL SECURITY/)
  assert.match(migration, /USING \(auth\.uid\(\) = owner_id\)/)
  assert.match(migration, /GRANT SELECT ON public\.ai_runs TO authenticated/)
  assert.doesNotMatch(migration, /GRANT INSERT[^;]*public\.ai_runs TO authenticated/)
})

test("AI write gateway remains default-off while keeping credentials server-only", () => {
  const entrypoint = readFileSync(
    new URL("../../supabase/functions/ai-write/index.ts", import.meta.url),
    "utf8",
  )
  const gateway = readFileSync(
    new URL("../../supabase/functions/ai-write/handler.ts", import.meta.url),
    "utf8",
  )

  assert.match(gateway, /authorization/)
  assert.match(gateway, /mock: true/)
  assert.match(gateway, /selection\.length > 12_000/)
  assert.match(gateway, /hostname\.startsWith\("notes-"\)/)
  assert.match(gateway, /hostname\.endsWith\("-wld-s-projects\.vercel\.app"\)/)
  assert.match(gateway, /AI_LIVE_ENABLED/)
  assert.match(gateway, /DEEPSEEK_API_KEY/)
  assert.match(entrypoint, /Deno\.env\.get/)
  assert.match(gateway, /真实模型尚未启用/)
  assert.doesNotMatch(gateway, /OPENAI_API_KEY/)
  assert.doesNotMatch(gateway, /api\.openai\.com/)
})
