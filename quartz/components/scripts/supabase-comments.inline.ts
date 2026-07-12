type CommentRow = {
  id: string
  section_title?: string
  content?: string
  created_at?: string
  profiles?: { display_name?: string } | null
}

type ParticipationState = "info" | "success" | "warning" | "error"

const correctionPrefix = "【纠错建议｜"
const sdkTimeoutMs = 10000

document.addEventListener("nav", () => {
  const container = document.querySelector<HTMLElement>(".supabase-comments")
  if (!container || container.dataset.participationReady === "true") return
  container.dataset.participationReady = "true"
  void initializeParticipation(container)
})

async function initializeParticipation(container: HTMLElement) {
  const filePath = container.dataset.commentKey || container.dataset.filePath || ""
  const supabaseUrl = container.dataset.supabaseUrl || ""
  const anonKey = container.dataset.supabaseAnonKey || ""
  const forms = Array.from(document.querySelectorAll<HTMLFormElement>("[data-participation-form]"))

  populateSectionSelect(container)
  forms.forEach((form) => prepareForm(form, filePath, () => getClient(supabaseUrl, anonKey)))

  const announceNetwork = () => {
    forms.forEach((form) => {
      if (!navigator.onLine) {
        report(form, "当前离线。你仍可编辑，草稿会保存在当前浏览器。", "warning", true)
      }
    })
  }
  const announceOnline = () => {
    forms.forEach((form) => report(form, "网络已恢复，可以继续提交。", "info"))
    void loadComments(container, filePath, supabaseUrl, anonKey)
  }
  window.addEventListener("offline", announceNetwork)
  window.addEventListener("online", announceOnline)
  window.addCleanup(() => {
    window.removeEventListener("offline", announceNetwork)
    window.removeEventListener("online", announceOnline)
  })

  if (!supabaseUrl || !anonKey) {
    renderLoadFailure(container, "讨论服务尚未配置。")
    return
  }

  const client = await getClient(supabaseUrl, anonKey)
  if (!client) {
    renderLoadFailure(
      container,
      navigator.onLine ? "讨论服务暂时无法载入。" : "当前离线，无法载入讨论。",
    )
    return
  }

  await updateAuthState(forms, client)
  await loadComments(container, filePath, supabaseUrl, anonKey)
}

function populateSectionSelect(container: HTMLElement) {
  const select = container.querySelector<HTMLSelectElement>("[data-section-select]")
  const article = document.querySelector("article")
  if (!select || !article) return

  const current = select.value
  const titles = Array.from(article.querySelectorAll("h2, h3"))
    .map((heading) => heading.textContent?.trim() ?? "")
    .filter(Boolean)
  const uniqueTitles = [...new Set(["整篇知识记录", ...titles])]
  select.replaceChildren(
    ...uniqueTitles.map((title) => {
      const option = document.createElement("option")
      option.value = title
      option.textContent = title
      return option
    }),
  )
  if (uniqueTitles.includes(current)) select.value = current
}

function prepareForm(
  form: HTMLFormElement,
  filePath: string,
  clientProvider: () => Promise<any | null>,
) {
  restoreDraft(form, filePath)
  const persist = () => saveDraft(form, filePath)
  const submit = (event?: Event) => {
    event?.preventDefault()
    void submitParticipation(form, filePath, clientProvider)
  }
  const retry = form.querySelector<HTMLButtonElement>("[data-retry-submit]")

  form.addEventListener("input", persist)
  form.addEventListener("change", persist)
  form.addEventListener("submit", submit)
  retry?.addEventListener("click", submit)
  window.addCleanup(() => {
    form.removeEventListener("input", persist)
    form.removeEventListener("change", persist)
    form.removeEventListener("submit", submit)
    retry?.removeEventListener("click", submit)
  })
}

async function submitParticipation(
  form: HTMLFormElement,
  filePath: string,
  clientProvider: () => Promise<any | null>,
) {
  if (!form.reportValidity()) return
  saveDraft(form, filePath)

  if (!navigator.onLine) {
    report(form, "当前离线，尚未提交。草稿已保留，请联网后重试。", "warning", true)
    return
  }

  const client = await clientProvider()
  if (!client) {
    report(form, "无法连接讨论服务。草稿已保留，请稍后重试。", "error", true)
    return
  }

  const { data: sessionData, error: sessionError } = await client.auth.getSession()
  const user = sessionData?.session?.user
  if (sessionError || !user) {
    report(form, "需要先登录才能提交；当前草稿已保留。", "warning")
    form.querySelector<HTMLAnchorElement>("[data-auth-link]")?.focus()
    return
  }

  const submitButton = form.querySelector<HTMLButtonElement>("button[type='submit']")
  const originalLabel = submitButton?.textContent ?? "提交"
  if (submitButton) {
    submitButton.disabled = true
    submitButton.textContent = "提交中…"
  }
  report(form, "正在提交，请稍候。", "info")

  const payload = buildPayload(form, filePath, user.id)
  try {
    const { error } = await client.from("comments").insert(payload)
    if (error) throw error

    clearDraft(form, filePath)
    const content = form.elements.namedItem("content") as HTMLTextAreaElement | null
    if (content) content.value = ""
    report(
      form,
      form.dataset.participationForm === "correction"
        ? "纠错建议已提交，感谢你帮助完善这条知识记录。"
        : "讨论已提交。",
      "success",
    )
    const container = document.querySelector<HTMLElement>(".supabase-comments")
    if (container) {
      await loadComments(
        container,
        filePath,
        container.dataset.supabaseUrl || "",
        container.dataset.supabaseAnonKey || "",
      )
    }
  } catch (error) {
    const message = String((error as { message?: string })?.message ?? error)
    const status = Number((error as { status?: number })?.status ?? 0)
    if (status === 429 || /rate|too many|频繁/i.test(message)) {
      report(form, "提交过于频繁。草稿已保留，请稍后再试。", "warning", true)
    } else if (/jwt|auth|session|unauthorized/i.test(message)) {
      report(form, "登录状态已失效。草稿已保留，请重新登录后提交。", "warning", true)
    } else {
      report(form, "提交失败。草稿已保留，请检查网络后重试。", "error", true)
    }
  } finally {
    if (submitButton) {
      submitButton.disabled = false
      submitButton.textContent = originalLabel
    }
  }
}

function buildPayload(form: HTMLFormElement, filePath: string, userId: string) {
  const kind = form.dataset.participationForm
  const content = String((form.elements.namedItem("content") as HTMLTextAreaElement).value).trim()
  if (kind === "correction") {
    const type = String((form.elements.namedItem("correction-type") as HTMLSelectElement).value)
    const location = String((form.elements.namedItem("location") as HTMLInputElement).value).trim()
    return {
      file_path: filePath,
      section_title: `纠错建议：${location}`,
      content: `${correctionPrefix}${type}】\n位置：${location}\n建议：${content}`,
      user_id: userId,
    }
  }

  const section = String((form.elements.namedItem("section") as HTMLSelectElement).value)
  return {
    file_path: filePath,
    section_title: section,
    content,
    user_id: userId,
  }
}

async function updateAuthState(forms: HTMLFormElement[], client: any) {
  try {
    const { data } = await client.auth.getSession()
    const user = data?.session?.user
    forms.forEach((form) => {
      const copy = form.querySelector<HTMLElement>("[data-auth-copy]")
      const link = form.querySelector<HTMLAnchorElement>("[data-auth-link]")
      if (copy) copy.textContent = user ? "已登录，可以提交。" : "提交需要登录。"
      if (link) link.hidden = Boolean(user)
    })
  } catch {
    forms.forEach((form) => report(form, "暂时无法确认登录状态，草稿仍会保留。", "warning"))
  }
}

async function loadComments(
  container: HTMLElement,
  filePath: string,
  supabaseUrl: string,
  anonKey: string,
) {
  const region = container.querySelector<HTMLElement>("[data-comments-region]")
  if (region) region.setAttribute("aria-busy", "true")
  renderLoading(container)

  const client = await getClient(supabaseUrl, anonKey)
  if (!client) {
    renderLoadFailure(
      container,
      navigator.onLine ? "讨论服务暂时无法载入。" : "当前离线，无法载入讨论。",
    )
    return
  }

  try {
    const result = await client
      .from("comments")
      .select("*, profiles(display_name)")
      .eq("file_path", filePath)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true })
    if (result.error) throw result.error
    renderComments(container, (result.data ?? []) as CommentRow[])
  } catch {
    renderLoadFailure(
      container,
      navigator.onLine ? "讨论载入失败，请重试。" : "当前离线，无法载入讨论。",
    )
  } finally {
    region?.setAttribute("aria-busy", "false")
  }
}

function renderLoading(container: HTMLElement) {
  const list = container.querySelector<HTMLElement>("[data-comments-list]")
  const loading = container.querySelector<HTMLElement>("[data-comments-loading]")
  if (list) list.replaceChildren()
  if (loading) {
    loading.hidden = false
    loading.textContent = "正在载入讨论…"
    loading.dataset.state = "loading"
  }
}

function renderLoadFailure(container: HTMLElement, message: string) {
  const list = container.querySelector<HTMLElement>("[data-comments-list]")
  const loading = container.querySelector<HTMLElement>("[data-comments-loading]")
  const region = container.querySelector<HTMLElement>("[data-comments-region]")
  if (loading) loading.hidden = true
  if (!list) return
  list.replaceChildren()

  const state = document.createElement("div")
  state.className = "comments-state"
  state.dataset.state = "error"
  const copy = document.createElement("p")
  copy.textContent = message
  const retry = document.createElement("button")
  retry.type = "button"
  retry.textContent = "重新载入"
  retry.addEventListener(
    "click",
    () => {
      void loadComments(
        container,
        container.dataset.commentKey || container.dataset.filePath || "",
        container.dataset.supabaseUrl || "",
        container.dataset.supabaseAnonKey || "",
      )
    },
    { once: true },
  )
  state.append(copy, retry)
  list.append(state)
  region?.setAttribute("aria-busy", "false")
}

function renderComments(container: HTMLElement, rows: CommentRow[]) {
  const list = container.querySelector<HTMLElement>("[data-comments-list]")
  const loading = container.querySelector<HTMLElement>("[data-comments-loading]")
  if (loading) loading.hidden = true
  if (!list) return
  list.replaceChildren()

  const discussionRows = rows.filter(
    (row) => !String(row.content ?? "").startsWith(correctionPrefix),
  )
  if (discussionRows.length === 0) {
    const state = document.createElement("div")
    state.className = "comments-state"
    state.dataset.state = "empty"
    const title = document.createElement("strong")
    title.textContent = "还没有公开讨论"
    const copy = document.createElement("p")
    copy.textContent = "可以提出问题、补充方法，或分享你如何使用这条知识。"
    state.append(title, copy)
    list.append(state)
    return
  }

  const grouped = new Map<string, CommentRow[]>()
  discussionRows.forEach((row) => {
    const section = row.section_title || "整篇知识记录"
    grouped.set(section, [...(grouped.get(section) ?? []), row])
  })

  grouped.forEach((comments, section) => {
    const group = document.createElement("section")
    group.className = "comment-group"
    const heading = document.createElement("h3")
    heading.textContent = section
    const items = document.createElement("ol")
    items.className = "comment-list"
    comments.forEach((comment) => items.append(buildComment(comment)))
    group.append(heading, items)
    list.append(group)
  })
}

function buildComment(comment: CommentRow) {
  const item = document.createElement("li")
  item.className = "comment-item"
  const meta = document.createElement("div")
  meta.className = "comment-meta"
  const author = document.createElement("strong")
  author.textContent = comment.profiles?.display_name || "读者"
  const time = document.createElement("time")
  time.dateTime = comment.created_at || ""
  time.textContent = formatTime(comment.created_at)
  const body = document.createElement("p")
  body.className = "comment-body"
  body.textContent = comment.content || ""
  meta.append(author, time)
  item.append(meta, body)
  return item
}

function formatTime(iso?: string) {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function report(form: HTMLFormElement, message: string, state: ParticipationState, retry = false) {
  const status = form.querySelector<HTMLElement>(".participation-status")
  const copy = form.querySelector<HTMLElement>("[data-status-message]")
  const retryButton = form.querySelector<HTMLButtonElement>("[data-retry-submit]")
  if (status) status.dataset.state = state
  if (copy) copy.textContent = message
  if (retryButton) retryButton.hidden = !retry
}

function draftStorageKey(form: HTMLFormElement, filePath: string) {
  return `wouldkeep:participation:${encodeURIComponent(filePath)}:${form.dataset.participationForm}`
}

function saveDraft(form: HTMLFormElement, filePath: string) {
  try {
    const values: Record<string, string> = {}
    new FormData(form).forEach((value, key) => {
      if (typeof value === "string") values[key] = value
    })
    localStorage.setItem(draftStorageKey(form, filePath), JSON.stringify(values))
  } catch {
    report(form, "浏览器无法保存本地草稿，请在提交前保留一份副本。", "warning")
  }
}

function restoreDraft(form: HTMLFormElement, filePath: string) {
  try {
    const raw = localStorage.getItem(draftStorageKey(form, filePath))
    if (!raw) return
    const values = JSON.parse(raw) as Record<string, string>
    Object.entries(values).forEach(([name, value]) => {
      const control = form.elements.namedItem(name)
      if (
        control instanceof HTMLInputElement ||
        control instanceof HTMLTextAreaElement ||
        control instanceof HTMLSelectElement
      ) {
        control.value = value
      }
    })
    report(form, "已恢复上次未提交的草稿。", "info")
  } catch {
    try {
      localStorage.removeItem(draftStorageKey(form, filePath))
    } catch {
      // Storage can be unavailable in private or hardened browser contexts.
    }
  }
}

function clearDraft(form: HTMLFormElement, filePath: string) {
  try {
    localStorage.removeItem(draftStorageKey(form, filePath))
  } catch {
    // Successful server submission is authoritative even if local cleanup is unavailable.
  }
}

async function getClient(supabaseUrl: string, anonKey: string): Promise<any | null> {
  if (!supabaseUrl || !anonKey) return null
  if ((window as any).__supabaseClient) return (window as any).__supabaseClient
  if ((window as any).__supabaseClientPromise) return (window as any).__supabaseClientPromise

  const promise = new Promise<any | null>((resolve) => {
    const script = document.createElement("script")
    const finish = (client: any | null) => {
      if (!client) delete (window as any).__supabaseClientPromise
      resolve(client)
    }
    const timer = window.setTimeout(() => {
      script.remove()
      finish(null)
    }, sdkTimeoutMs)
    script.src =
      "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.min.js"
    script.async = true
    script.onload = () => {
      window.clearTimeout(timer)
      const factory = (window as any).supabase
      if (!factory?.createClient) {
        finish(null)
        return
      }
      const client = factory.createClient(supabaseUrl, anonKey)
      ;(window as any).__supabaseClient = client
      finish(client)
    }
    script.onerror = () => {
      window.clearTimeout(timer)
      finish(null)
    }
    document.head.appendChild(script)
  })
  ;(window as any).__supabaseClientPromise = promise
  return promise
}
