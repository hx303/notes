type PublicSource = {
  kind?: "web" | "personal"
  url?: string | null
  title?: string
  author?: string
  note?: string
  accessed_at?: string | null
}

const loadPublicScript = (src: string, globalName: string) => {
  const globalWindow = window as any
  if (globalWindow[globalName]) return Promise.resolve(globalWindow[globalName])
  globalWindow.__wouldkeepScriptLoads ??= {}
  if (globalWindow.__wouldkeepScriptLoads[src]) return globalWindow.__wouldkeepScriptLoads[src]
  globalWindow.__wouldkeepScriptLoads[src] = new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.src = src
    script.async = true
    script.onload = () =>
      globalWindow[globalName]
        ? resolve(globalWindow[globalName])
        : reject(new Error(`missing ${globalName}`))
    script.onerror = () => reject(new Error(`failed ${src}`))
    document.head.appendChild(script)
  })
  return globalWindow.__wouldkeepScriptLoads[src]
}

const renderPublicMarkdown = async (target: HTMLElement, markdown: string) => {
  const source = markdown.trim()
  if (!source) {
    target.textContent = "正文暂时为空。"
    return
  }
  try {
    const [marked, purifier] = (await Promise.all([
      loadPublicScript("https://cdn.jsdelivr.net/npm/marked@15.0.12/lib/marked.umd.js", "marked"),
      loadPublicScript(
        "https://cdn.jsdelivr.net/npm/dompurify@3.2.6/dist/purify.min.js",
        "DOMPurify",
      ),
    ])) as any[]
    target.innerHTML = purifier.sanitize(marked.parse(source, { gfm: true, breaks: true }), {
      FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form"],
      FORBID_ATTR: ["style", "onerror", "onload"],
    })
    target.querySelectorAll<HTMLAnchorElement>("a").forEach((link) => {
      const href = link.getAttribute("href") ?? ""
      if (!/^(https?:|mailto:|\/|#)/i.test(href)) link.removeAttribute("href")
      if (/^https?:/i.test(href)) {
        link.target = "_blank"
        link.rel = "noreferrer"
      }
    })
    target.querySelectorAll<HTMLImageElement>("img").forEach((image) => {
      const src = image.getAttribute("src") ?? ""
      if (!/^(https?:\/\/|data:image\/(?:png|jpe?g|gif|webp);base64,)/i.test(src)) image.remove()
      else {
        image.loading = "lazy"
        image.decoding = "async"
      }
    })
  } catch {
    target.textContent = source
  }
}

type PublicContent = {
  id?: string
  title?: string
  summary?: string
  body?: string
  topic?: string
  maturity?: string
  revision?: number
  tags?: string[]
  sources?: PublicSource[]
}

type PublicDocument = {
  document_id: string
  audience: "public" | "unlisted"
  published_at: string
  content: PublicContent
}

type DiscoveryItem = {
  document_id: string
  published_at: string
  title?: string
  summary?: string
  topic?: string
  maturity?: string
  tags?: string[]
}

const loadPublicClient = async (url: string, key: string) => {
  if ((window as any).__supabaseClient) return (window as any).__supabaseClient
  await new Promise<void>((resolve, reject) => {
    const sdk = document.createElement("script")
    sdk.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.min.js"
    sdk.onload = () => resolve()
    sdk.onerror = () => reject(new Error("sdk"))
    document.head.appendChild(sdk)
  })
  const factory = (window as any).supabase
  if (!factory) return null
  const client = factory.createClient(url, key)
  ;(window as any).__supabaseClient = client
  return client
}

const formatPublicDate = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "最近发布" : `发布于 ${date.toLocaleDateString("zh-CN")}`
}

const maturityLabel = (value = "") =>
  value === "stable" ? "相对完整" : value === "growing" ? "持续整理中" : "知识萌芽"

const initPublicKnowledge = async () => {
  const root = document.querySelector<HTMLElement>("[data-public-knowledge]")
  if (!root || root.dataset.ready === "true") return
  root.dataset.ready = "true"

  const status = root.querySelector<HTMLElement>("[data-public-knowledge-status]")
  const discovery = root.querySelector<HTMLElement>("[data-public-discovery]")
  const list = root.querySelector<HTMLElement>("[data-public-list]")
  const count = root.querySelector<HTMLElement>("[data-public-count]")
  const search = root.querySelector<HTMLInputElement>("[data-public-search]")
  const empty = root.querySelector<HTMLElement>("[data-public-empty]")
  const reader = root.querySelector<HTMLElement>("[data-public-reader]")
  const errorPanel = root.querySelector<HTMLElement>("[data-public-error]")
  let discoveryItems: DiscoveryItem[] = []

  const showError = (title: string, message: string) => {
    if (status) status.hidden = true
    if (discovery) discovery.hidden = true
    if (reader) reader.hidden = true
    if (errorPanel) errorPanel.hidden = false
    const heading = root.querySelector<HTMLElement>("[data-public-error-title]")
    const detail = root.querySelector<HTMLElement>("[data-public-error-message]")
    if (heading) heading.textContent = title
    if (detail) detail.textContent = message
  }

  const safeHttpUrl = (value = "") => {
    try {
      const parsed = new URL(value)
      return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : ""
    } catch {
      return ""
    }
  }

  const renderReader = async (document: PublicDocument) => {
    const content = document.content ?? {}
    const title = root.querySelector<HTMLElement>("[data-public-reader-title]")
    const scope = root.querySelector<HTMLElement>("[data-public-reader-scope]")
    const topic = root.querySelector<HTMLElement>("[data-public-reader-topic]")
    const date = root.querySelector<HTMLTimeElement>("[data-public-reader-date]")
    const body = root.querySelector<HTMLElement>("[data-public-reader-body]")
    const tags = root.querySelector<HTMLElement>("[data-public-reader-tags]")
    const sourcesSection = root.querySelector<HTMLElement>("[data-public-reader-sources-section]")
    const sources = root.querySelector<HTMLOListElement>("[data-public-reader-sources]")
    if (
      !title ||
      !scope ||
      !topic ||
      !date ||
      !body ||
      !tags ||
      !sourcesSection ||
      !sources ||
      !reader
    )
      return

    title.textContent = content.title?.trim() || "未命名知识"
    scope.textContent =
      document.audience === "unlisted"
        ? "持链接可读 · 不进入公开发现"
        : `${maturityLabel(content.maturity)} · 公开知识`
    topic.textContent = content.topic?.trim() || "未归类主题"
    date.textContent = formatPublicDate(document.published_at)
    date.dateTime = document.published_at
    body.textContent = "正在生成阅读排版…"
    await renderPublicMarkdown(body, content.body ?? "")

    tags.replaceChildren()
    ;(Array.isArray(content.tags) ? content.tags : []).forEach((tag) => {
      const item = globalThis.document.createElement("span")
      item.textContent = tag
      tags.appendChild(item)
    })

    sources.replaceChildren()
    ;(Array.isArray(content.sources) ? content.sources : []).forEach((source) => {
      const item = globalThis.document.createElement("li")
      const heading = globalThis.document.createElement("strong")
      const safeUrl = source.kind === "web" ? safeHttpUrl(source.url ?? "") : ""
      if (safeUrl) {
        const link = globalThis.document.createElement("a")
        link.href = safeUrl
        link.target = "_blank"
        link.rel = "noreferrer"
        link.textContent = source.title?.trim() || safeUrl
        heading.appendChild(link)
      } else {
        heading.textContent = source.title?.trim() || "个人经验"
      }
      item.appendChild(heading)
      const details = [source.author?.trim(), source.note?.trim()].filter(Boolean).join(" · ")
      if (details) {
        const description = globalThis.document.createElement("p")
        description.textContent = details
        item.appendChild(description)
      }
      sources.appendChild(item)
    })
    sourcesSection.hidden = sources.childElementCount === 0

    if (status) status.hidden = true
    if (errorPanel) errorPanel.hidden = true
    if (discovery) discovery.hidden = true
    reader.hidden = false
    const hero = root.querySelector<HTMLElement>(".public-knowledge-hero")
    if (hero) hero.hidden = true
    globalThis.document.title = `${title.textContent} · wouldkeep`
  }

  const renderDiscovery = () => {
    if (!list || !count || !empty || !discovery) return
    const query = search?.value.trim().toLocaleLowerCase() ?? ""
    const visible = discoveryItems.filter((item) =>
      [item.title, item.summary, item.topic, ...(Array.isArray(item.tags) ? item.tags : [])]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query),
    )
    list.replaceChildren()
    visible.forEach((item, index) => {
      const link = globalThis.document.createElement("a")
      link.className = "public-discovery-item"
      link.href = `/knowledge/?id=${encodeURIComponent(item.document_id)}`
      const number = globalThis.document.createElement("span")
      number.className = "public-discovery-number"
      number.textContent = String(index + 1).padStart(2, "0")
      const content = globalThis.document.createElement("span")
      content.className = "public-discovery-content"
      const heading = globalThis.document.createElement("strong")
      heading.textContent = item.title?.trim() || "未命名知识"
      const summary = globalThis.document.createElement("span")
      summary.textContent = item.summary?.trim() || "作者尚未提供摘要。"
      const meta = globalThis.document.createElement("small")
      meta.textContent = `${item.topic?.trim() || "未归类"} · ${maturityLabel(item.maturity)} · ${formatPublicDate(item.published_at)}`
      content.append(heading, summary, meta)
      link.append(number, content)
      list.appendChild(link)
    })
    count.textContent = `显示 ${visible.length} 条公开知识`
    empty.hidden = visible.length > 0
    discovery.hidden = false
  }

  try {
    const client = await loadPublicClient(
      root.dataset.supabaseUrl ?? "",
      root.dataset.supabaseAnonKey ?? "",
    )
    if (!client) {
      showError("暂时无法连接知识网络", "请检查网络后刷新页面。")
      return
    }
    const params = new URLSearchParams(location.search)
    const documentId = params.get("id")
    const shareToken = params.get("share")
    if (documentId || shareToken) {
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      if ((documentId && !uuid.test(documentId)) || (shareToken && !uuid.test(shareToken))) {
        showError("阅读链接格式不正确", "请检查链接是否复制完整，或返回公开知识列表继续浏览。")
        return
      }
      const result = await client.rpc("read_published_document", {
        p_document_id: documentId || null,
        p_share_token: shareToken || null,
      })
      if (result.error) {
        showError(
          "公开阅读功能尚未启用",
          "请先执行 20260718000500_publication_flow.sql，或稍后再试。",
        )
        return
      }
      if (!result.data) {
        showError("没有找到这条知识", "它可能尚未公开，或者作者已经撤回了分享。")
        return
      }
      await renderReader(result.data as PublicDocument)
      return
    }

    const result = await client.rpc("list_public_documents", { p_limit: 24, p_offset: 0 })
    if (result.error) {
      showError(
        "公开发现功能尚未启用",
        "请先执行 20260718000500_publication_flow.sql，或稍后再试。",
      )
      return
    }
    discoveryItems = Array.isArray(result.data) ? (result.data as DiscoveryItem[]) : []
    if (status) status.hidden = true
    renderDiscovery()
  } catch {
    showError("暂时无法连接知识网络", "请检查网络后刷新页面；已经公开的内容不会因此丢失。")
  }

  search?.addEventListener("input", renderDiscovery)
  root.querySelector<HTMLButtonElement>("[data-public-clear]")?.addEventListener("click", () => {
    if (search) search.value = ""
    renderDiscovery()
    search?.focus()
  })
}

document.addEventListener("nav", initPublicKnowledge)
window.addEventListener("load", initPublicKnowledge, { once: true })
