import type { ContentDetails } from "../../plugins/emitters/contentIndex"
import {
  createSearchEngine,
  excerptForQuery,
  highlightSegments,
  searchKnowledge,
  type SearchEngine,
  type SearchMatch,
} from "../../util/searchKnowledge"
import {
  knowledgeMaturityLabels,
  knowledgeTopicLabels,
  knowledgeTypeLabels,
} from "../../util/knowledgeMetadata"
import { FullSlug, resolveRelative } from "../../util/path"

let enginePromise: Promise<SearchEngine> | undefined

function getEngine(): Promise<SearchEngine> {
  enginePromise ??= fetchData.then((data: Record<string, ContentDetails>) =>
    createSearchEngine(data),
  )
  return enginePromise
}

function appendHighlighted(target: HTMLElement, text: string, query: string) {
  for (const segment of highlightSegments(text, query)) {
    if (segment.match) {
      const mark = document.createElement("mark")
      mark.textContent = segment.text
      target.append(mark)
    } else {
      target.append(document.createTextNode(segment.text))
    }
  }
}

function resultMeta(match: SearchMatch): string {
  const topic = match.primaryTopic ? knowledgeTopicLabels[match.primaryTopic] : "待归类"
  return `${topic} · ${knowledgeTypeLabels[match.type]} · ${knowledgeMaturityLabels[match.maturity]}`
}

document.addEventListener("nav", (event: CustomEventMap["nav"]) => {
  const currentSlug = event.detail.url
  const roots = [...document.querySelectorAll<HTMLElement>(".search")]
  for (const root of roots) setupSearch(root, currentSlug)
})

function setupSearch(root: HTMLElement, currentSlug: FullSlug) {
  const trigger = root.querySelector<HTMLButtonElement>(".search-button")
  const dialog = root.querySelector<HTMLDialogElement>(".search-container")
  const closeButton = root.querySelector<HTMLButtonElement>(".search-close")
  const form = root.querySelector<HTMLFormElement>(".search-form")
  const input = root.querySelector<HTMLInputElement>(".search-bar")
  const clearButton = root.querySelector<HTMLButtonElement>(".search-clear")
  const status = root.querySelector<HTMLElement>(".search-status")
  const layout = root.querySelector<HTMLElement>(".search-layout")
  const initial = root.querySelector<HTMLElement>(".search-initial-state")
  const results = root.querySelector<HTMLElement>(".results-container")
  const errorState = root.querySelector<HTMLElement>(".search-error-state")
  if (
    !trigger ||
    !dialog ||
    !closeButton ||
    !form ||
    !input ||
    !clearButton ||
    !status ||
    !layout ||
    !initial ||
    !results ||
    !errorState
  ) {
    return
  }

  let timer: number | undefined
  let requestId = 0

  const resetSurface = () => {
    input.value = ""
    clearButton.hidden = true
    status.textContent = ""
    layout.dataset.state = "initial"
    initial.hidden = false
    results.hidden = true
    errorState.hidden = true
    results.replaceChildren()
  }

  const show = () => {
    if (!dialog.open) dialog.showModal()
    trigger.setAttribute("aria-expanded", "true")
    input.focus()
    void getEngine().catch(() => showError())
  }

  const hide = () => {
    if (dialog.open) dialog.close()
  }

  const showError = () => {
    layout.dataset.state = "error"
    initial.hidden = true
    results.hidden = true
    errorState.hidden = false
    status.textContent = "搜索索引载入失败"
  }

  const renderLoading = () => {
    layout.dataset.state = "loading"
    initial.hidden = true
    errorState.hidden = true
    results.hidden = false
    results.replaceChildren()
    for (let index = 0; index < 3; index++) {
      const row = document.createElement("div")
      row.className = "search-result-skeleton"
      row.setAttribute("aria-hidden", "true")
      row.innerHTML = "<span></span><span></span><span></span>"
      results.append(row)
    }
    status.textContent = "正在搜索…"
  }

  const renderEmpty = (query: string) => {
    const empty = document.createElement("div")
    empty.className = "search-empty-state"
    const title = document.createElement("strong")
    title.textContent = `没有找到“${query}”`
    const guidance = document.createElement("p")
    guidance.textContent = "试试更短的词、课程名称或英文缩写，也可以打开完整搜索页使用主题筛选。"
    const link = document.createElement("a")
    link.className = "internal"
    link.href = `${form.action}?q=${encodeURIComponent(query)}`
    link.textContent = "在完整搜索页继续"
    empty.append(title, guidance, link)
    results.replaceChildren(empty)
    status.textContent = `没有找到“${query}”`
  }

  const renderResults = (matches: SearchMatch[], query: string) => {
    results.replaceChildren()
    if (matches.length === 0) {
      renderEmpty(query)
      return
    }

    for (const match of matches.slice(0, 8)) {
      const link = document.createElement("a")
      link.className = "search-result internal"
      link.href = new URL(resolveRelative(currentSlug, match.slug), location.href).toString()

      const meta = document.createElement("span")
      meta.className = "search-result-meta"
      meta.textContent = resultMeta(match)
      const title = document.createElement("strong")
      appendHighlighted(title, match.title, query)
      const excerpt = document.createElement("span")
      excerpt.className = "search-result-excerpt"
      appendHighlighted(excerpt, excerptForQuery(match.summary || match.content, query, 150), query)
      link.append(meta, title, excerpt)
      link.addEventListener("click", hide)
      results.append(link)
    }
    status.textContent = `找到 ${matches.length} 条，显示前 ${Math.min(8, matches.length)} 条建议`
  }

  const search = async () => {
    const query = input.value.trim()
    clearButton.hidden = query.length === 0
    if (query.length < 2) {
      requestId++
      layout.dataset.state = "initial"
      initial.hidden = false
      results.hidden = true
      errorState.hidden = true
      results.replaceChildren()
      status.textContent = query.length === 1 ? "再输入 1 个字符即可搜索" : ""
      return
    }

    const currentRequest = ++requestId
    renderLoading()
    try {
      const engine = await getEngine()
      const matches = await searchKnowledge(engine, query, 80)
      if (currentRequest !== requestId) return
      layout.dataset.state = matches.length === 0 ? "empty" : "results"
      initial.hidden = true
      errorState.hidden = true
      results.hidden = false
      renderResults(matches, query)
    } catch {
      if (currentRequest === requestId) showError()
    }
  }

  const onInput = () => {
    if (timer !== undefined) window.clearTimeout(timer)
    timer = window.setTimeout(() => void search(), 120)
  }

  const onClear = () => {
    resetSurface()
    input.focus()
  }

  const onSuggestion = (event: MouseEvent) => {
    const button = (event.target as Element).closest<HTMLButtonElement>("[data-search-suggestion]")
    if (!button) return
    input.value = button.dataset.searchSuggestion ?? ""
    void search()
    input.focus()
  }

  const onSubmit = (event: SubmitEvent) => {
    if (input.value.trim().length === 0) {
      event.preventDefault()
      status.textContent = "请先输入要查找的内容"
      input.focus()
    }
  }

  const onDialogClose = () => {
    trigger.setAttribute("aria-expanded", "false")
    resetSurface()
    trigger.focus()
  }

  const onCancel = (event: Event) => {
    event.preventDefault()
    hide()
  }

  const onGlobalKeydown = (event: KeyboardEvent) => {
    if (event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      dialog.open ? hide() : show()
    }
  }

  const onDialogKeydown = (event: KeyboardEvent) => {
    if (!dialog.open) return
    if (event.key === "Escape") {
      event.preventDefault()
      hide()
      return
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    const links = [...results.querySelectorAll<HTMLAnchorElement>("a.search-result")]
    if (links.length === 0) return
    const current = links.indexOf(document.activeElement as HTMLAnchorElement)
    if (event.key === "ArrowDown") {
      event.preventDefault()
      links[current < 0 || current === links.length - 1 ? 0 : current + 1].focus()
    } else if (current >= 0) {
      event.preventDefault()
      links[current === 0 ? links.length - 1 : current - 1].focus()
    }
  }

  trigger.addEventListener("click", show)
  closeButton.addEventListener("click", hide)
  clearButton.addEventListener("click", onClear)
  input.addEventListener("input", onInput)
  form.addEventListener("submit", onSubmit)
  initial.addEventListener("click", onSuggestion)
  dialog.addEventListener("close", onDialogClose)
  dialog.addEventListener("cancel", onCancel)
  dialog.addEventListener("keydown", onDialogKeydown)
  document.addEventListener("keydown", onGlobalKeydown)

  window.addCleanup(() => {
    if (timer !== undefined) window.clearTimeout(timer)
    trigger.removeEventListener("click", show)
    closeButton.removeEventListener("click", hide)
    clearButton.removeEventListener("click", onClear)
    input.removeEventListener("input", onInput)
    form.removeEventListener("submit", onSubmit)
    initial.removeEventListener("click", onSuggestion)
    dialog.removeEventListener("close", onDialogClose)
    dialog.removeEventListener("cancel", onCancel)
    dialog.removeEventListener("keydown", onDialogKeydown)
    document.removeEventListener("keydown", onGlobalKeydown)
  })
}
