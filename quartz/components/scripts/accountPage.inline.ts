const accountDraftKey = "wouldkeep:editor-draft"
const loadClient = async (url: string, key: string) => {
  if ((window as any).__supabaseClient) return (window as any).__supabaseClient
  await new Promise<void>((resolve, reject) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.min.js"; s.onload = () => resolve(); s.onerror = () => reject(new Error("auth sdk")); document.head.appendChild(s) })
  const factory = (window as any).supabase
  if (!factory) return null
  const client = factory.createClient(url, key)
  ;(window as any).__supabaseClient = client
  return client
}
const init = async () => {
  const root = document.querySelector<HTMLElement>("[data-account-page]")
  if (!root || root.dataset.ready === "true") return
  root.dataset.ready = "true"
  const status = root.querySelector<HTMLElement>("[data-account-status]")
  const login = root.querySelector<HTMLFormElement>("[data-account-login]")
  const session = root.querySelector<HTMLElement>("[data-account-session]")
  const email = root.querySelector<HTMLElement>("[data-account-email]")
  const client = await loadClient(root.dataset.supabaseUrl ?? "", root.dataset.supabaseAnonKey ?? "").catch(() => null)
  const sync = async () => { const user = (await client?.auth.getUser())?.data?.user; if (session) session.hidden = !user; if (login) login.hidden = Boolean(user); if (email) email.textContent = user?.email ?? "" }
  if (!client) { if (status) status.textContent = "登录服务暂时无法加载；工作台仍可保存本地草稿。" } else { await sync() }
  login?.addEventListener("submit", async (event) => { event.preventDefault(); const value = String(new FormData(login).get("email") ?? ""); if (!client) return; const result = await client.auth.signInWithOtp({ email: value, options: { emailRedirectTo: `${location.origin}/account/` } }); if (status) status.textContent = result.error ? "登录链接发送失败，请稍后重试。" : "登录链接已发送，请检查邮箱。" })
  root.querySelector<HTMLButtonElement>("[data-account-signout]")?.addEventListener("click", async () => { await client?.auth.signOut(); await sync() })
  const form = root.querySelector<HTMLFormElement>("[data-editor-form]")
  const state = root.querySelector<HTMLElement>("[data-editor-state]")
  if (form) { const saved = localStorage.getItem(accountDraftKey); if (saved) { const data = JSON.parse(saved); for (const [name, value] of Object.entries(data)) { const field = form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null; if (field) field.value = String(value) } if (state) state.textContent = "已恢复草稿" } form.addEventListener("input", () => { if (state) state.textContent = "有未保存改动" }); form.addEventListener("submit", (event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(form).entries()); localStorage.setItem(accountDraftKey, JSON.stringify(data)); if (state) state.textContent = "草稿已保存" }); root.querySelector("[data-editor-clear]")?.addEventListener("click", () => { form.reset(); localStorage.removeItem(accountDraftKey); if (state) state.textContent = "尚未保存" }) }
}
document.addEventListener("nav", init)
window.addEventListener("load", init, { once: true })
