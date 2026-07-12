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
  const setMode = (mode: string) => { const field = login?.querySelector<HTMLInputElement>("[data-account-mode]"); const submit = login?.querySelector<HTMLButtonElement>("[data-account-submit]"); const password = login?.querySelector<HTMLInputElement>("[name=password]"); if (field) field.value = mode; if (submit) submit.textContent = mode === "signup" ? "注册账户" : "登录"; if (password) password.autocomplete = mode === "signup" ? "new-password" : "current-password"; root.querySelectorAll<HTMLButtonElement>("[data-account-tab]").forEach((tab) => { const active = tab.dataset.accountTab === mode; tab.setAttribute("aria-selected", String(active)) }) }
  root.querySelectorAll<HTMLButtonElement>("[data-account-tab]").forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.accountTab ?? "signin")))
  login?.addEventListener("submit", async (event) => { event.preventDefault(); const data = new FormData(login); const value = String(data.get("email") ?? ""); const password = String(data.get("password") ?? ""); const mode = String(data.get("mode") ?? "signin"); if (!client) return; const result = mode === "signup" ? await client.auth.signUp({ email: value, password }) : await client.auth.signInWithPassword({ email: value, password }); if (status) status.textContent = result.error ? "操作失败，请检查邮箱和密码后重试。" : mode === "signup" ? "注册成功，请检查邮箱完成验证。" : "登录成功。"; await sync() })
  root.querySelector<HTMLButtonElement>("[data-account-forgot]")?.addEventListener("click", async () => { const value = String(new FormData(login ?? document.createElement("form")).get("email") ?? ""); if (!client || !value) { if (status) status.textContent = "请先填写邮箱，再发送重置邮件。"; return } const result = await client.auth.resetPasswordForEmail(value, { redirectTo: `${location.origin}/account/` }); if (status) status.textContent = result.error ? "重置邮件发送失败，请稍后重试。" : "重置邮件已发送，请检查邮箱。" })
  root.querySelector<HTMLButtonElement>("[data-account-signout]")?.addEventListener("click", async () => { await client?.auth.signOut(); await sync() })
  const form = root.querySelector<HTMLFormElement>("[data-editor-form]")
  const state = root.querySelector<HTMLElement>("[data-editor-state]")
  if (form) { const saved = localStorage.getItem(accountDraftKey); if (saved) { const data = JSON.parse(saved); for (const [name, value] of Object.entries(data)) { const field = form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null; if (field) field.value = String(value) } if (state) state.textContent = "已恢复草稿" } form.addEventListener("input", () => { if (state) state.textContent = "有未保存改动" }); form.addEventListener("submit", (event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(form).entries()); localStorage.setItem(accountDraftKey, JSON.stringify(data)); if (state) state.textContent = "草稿已保存" }); root.querySelector("[data-editor-clear]")?.addEventListener("click", () => { form.reset(); localStorage.removeItem(accountDraftKey); if (state) state.textContent = "尚未保存" }) }
}
document.addEventListener("nav", init)
window.addEventListener("load", init, { once: true })
