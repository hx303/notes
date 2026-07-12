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

type FilterName = "topic" | "type" | "maturity" | "sort"
type SearchState = Record<FilterName, string> & { q: string }

let pageEnginePromise: Promise<SearchEngine> | undefined

function loadEngine(): Promise<SearchEngine> {
  pageEnginePromise ??= fetchData.then((data: Record<string, ContentDetails>) =>
    createSearchEngine(data),
  )
  return pageEnginePromise
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

document.addEventListener("nav", (event: CustomEventMap["nav"]) => {
  const root = document.querySelector<HTMLElement>("[data-search-page]")
  if (root) setupSearchPage(root, event.detail.url)
})

function setupSearchPage(root: HTMLElement, currentSlug: FullSlug) {
  const form = root.querySelector<HTMLFormElement>("[data-search-page-form]")
  const input = root.querySelector<HTMLInputElement>('input[name="q"]')
  const queryClear = root.querySelector<HTMLButtonElement>("[data-search-query-clear]")
  const title = root.querySelector<HTMLElement>("#search-page-results-title")
  const status = root.querySelector<HTMLElement>("#search-page-status")
  const corpusCount = root.querySelector<HTMLElement>("[data-search-corpus-count]")
  const initial = root.querySelector<HTMLElement>("[data-search-page-initial]")
  const loading = root.querySelector<HTMLElement>("[data-search-page-loading]")
  const list = root.querySelector<HTMLOListElement>("[data-search-page-results]")
  const empty = root.querySelector<HTMLElement>("[data-search-page-empty]")
  const emptyTitle = root.querySelector<HTMLElement>("[data-search-empty-title]")
  const error = root.querySelector<HTMLElement>("[data-search-page-error]")
  const activeFilters = root.querySelector<HTMLElement>("[data-search-active-filters]")
  const chips = root.querySelector<HTMLElement>("[data-search-filter-chips]")
  if (
    !form ||
    !input ||
    !queryClear ||
    !title ||
    !status ||
    !corpusCount ||
    !initial ||
    !loading ||
    !list ||
    !empty ||
    !emptyTitle ||
    !error ||
    !activeFilters ||
    !chips
  ) {
    return
  }

  const names: FilterName[] = ["topic", "type", "maturity", "sort"]
  const select = (name: FilterName) =>
    root.querySelector<HTMLSelectElement>(`select[name="${name}"]`)

  const stateFromControls = (): SearchState => ({
    q: input.value.trim(),
    topic: select("topic")?.value ?? "",
    type: select("type")?.value ?? "",
    maturity: select("maturity")?.value ?? "",
    sort: select("sort")?.value ?? "relevance",
  })

  const readUrl = () => {
    const params = new URLSearchParams(location.search)
    input.value = params.get("q") ?? ""
    queryClear.hidden = input.value.length === 0
    for (const name of names) {
      const control = select(name)
      if (!control) continue
      const fallback = name === "sort" ? "relevance" : ""
      const candidate = params.get(name) ?? fallback
      control.value = [...control.options].some((option) => option.value === candidate)
        ? candidate
        : fallback
    }
  }

  const writeUrl = () => {
    const state = stateFromControls()
    const url = new URL(location.href)
    for (const [name, value] of Object.entries(state)) {
      const isDefault = value === "" || (name === "sort" && value === "relevance")
      if (isDefault) url.searchParams.delete(name)
      else url.searchParams.set(name, value)
    }
    history.pushState({}, "", url)
  }

  const showOnly = (visible: HTMLElement) => {
    for (const element of [initial, loading, list, empty, error])
      element.hidden = element !== visible
  }

  const renderChips = (state: SearchState) => {
    chips.replaceChildren()
    const labels: Array<[FilterName, string]> = [
      [
        "topic",
        state.topic ? knowledgeTopicLabels[state.topic as keyof typeof knowledgeTopicLabels] : "",
      ],
      [
        "type",
        state.type ? knowledgeTypeLabels[state.type as keyof typeof knowledgeTypeLabels] : "",
      ],
      [
        "maturity",
        state.maturity
          ? knowledgeMaturityLabels[state.maturity as keyof typeof knowledgeMaturityLabels]
          : "",
      ],
    ]
    for (const [name, label] of labels) {
      if (!label) continue
      const button = document.createElement("button")
      button.type = "button"
      button.dataset.removeSearchFilter = name
      button.setAttribute("aria-label", `移除筛选：${label}`)
      button.textContent = `${label} ×`
      chips.append(button)
    }
    activeFilters.hidden = chips.childElementCount === 0
  }

  const fieldLabel = (fields: SearchMatch["matchedFields"]) =>
    fields.map((field) => ({ title: "标题", content: "正文", tags: "标签" })[field]).join("、")

  const renderResults = (matches: SearchMatch[], state: SearchState) => {
    list.replaceChildren()
    if (matches.length === 0) {
      emptyTitle.textContent = state.q ? `没有找到“${state.q}”` : "没有符合筛选条件的记录"
      title.textContent = state.q ? `“${state.q}”的结果` : "筛选结果"
      status.textContent = "0 条结果"
      showOnly(empty)
      return
    }

    const recommendationScore = (match: SearchMatch) => {
      const maturityRank = { seed: 0, growing: 1, stable: 2 }[match.maturity] ?? 0
      return maturityRank + (match.primaryTopic ? 1 : 0)
    }

    const sorted = [...matches].sort((a, b) => {
      if (state.sort === "updated") {
        return (
          (b.updated ?? "").localeCompare(a.updated ?? "") ||
          a.title.localeCompare(b.title, "zh-CN")
        )
      }
      if (state.sort === "title") return a.title.localeCompare(b.title, "zh-CN")
      return (
        b.score - a.score ||
        recommendationScore(b) - recommendationScore(a) ||
        a.title.localeCompare(b.title, "zh-CN")
      )
    })

    for (const [index, match] of sorted.slice(0, 50).entries()) {
      const item = document.createElement("li")
      const number = document.createElement("span")
      number.className = "search-page-result-number"
      number.setAttribute("aria-hidden", "true")
      number.textContent = String(index + 1).padStart(2, "0")
      const body = document.createElement("div")
      body.className = "search-page-result-body"
      const meta = document.createElement("p")
      meta.className = "search-page-result-meta"
      const topic = match.primaryTopic ? knowledgeTopicLabels[match.primaryTopic] : "待归类"
      meta.textContent = `${topic} · ${knowledgeTypeLabels[match.type]} · ${knowledgeMaturityLabels[match.maturity]}`
      const heading = document.createElement("h3")
      const link = document.createElement("a")
      link.className = "internal"
      link.href = new URL(resolveRelative(currentSlug, match.slug), location.href).toString()
      appendHighlighted(link, match.title, state.q)
      heading.append(link)
      const snippet = document.createElement("p")
      snippet.className = "search-page-result-snippet"
      appendHighlighted(
        snippet,
        excerptForQuery(match.summary || match.content, state.q, 220),
        state.q,
      )
      const reason = document.createElement("p")
      reason.className = "search-page-result-reason"
      reason.textContent = state.q
        ? `匹配于：${fieldLabel(match.matchedFields)}${match.updated ? ` · 修订于 ${match.updated}` : ""}`
        : match.updated
          ? `修订于 ${match.updated}`
          : "公开知识记录"
      body.append(meta, heading, snippet, reason)
      const next = document.createElement("p")
      next.className = "search-page-result-next"
      next.textContent = "下一步："
      if (match.primaryTopic) {
        const topicLink = document.createElement("a")
        topicLink.className = "internal"
        topicLink.textContent = `${topic}主题`
        topicLink.href = new URL(
          resolveRelative(currentSlug, `topics/${match.primaryTopic}/index` as FullSlug),
          location.href,
        ).toString()
        next.append(topicLink, " · ")
      }
      const pathLink = document.createElement("a")
      pathLink.className = "internal"
      pathLink.textContent = "查看学习路径"
      pathLink.href = new URL(resolveRelative(currentSlug, "paths/index" as FullSlug), location.href).toString()
      next.append(pathLink)
      body.append(next)
      item.append(number, body)
      list.append(item)
    }

    title.textContent = state.q ? `“${state.q}”的结果` : "筛选结果"
    status.textContent =
      matches.length > 50 ? `共 ${matches.length} 条，显示前 50 条` : `共 ${matches.length} 条结果`
    showOnly(list)
  }

  const run = async (focusHeading = false) => {
    const state = stateFromControls()
    queryClear.hidden = state.q.length === 0
    renderChips(state)
    const hasFilters = Boolean(state.topic || state.type || state.maturity)
    if (!state.q && !hasFilters) {
      title.textContent = "等待搜索"
      status.textContent = ""
      showOnly(initial)
      return
    }

    showOnly(loading)
    root.querySelector(".search-page-results")?.setAttribute("aria-busy", "true")
    status.textContent = "正在检索公开知识记录…"
    try {
      const engine = await loadEngine()
      corpusCount.textContent = String(engine.records.length)
      let matches: SearchMatch[] = state.q
        ? await searchKnowledge(engine, state.q, 300)
        : engine.records.map((record) => ({ ...record, score: 0, matchedFields: [] }))
      matches = matches.filter(
        (match) =>
          (!state.topic || match.primaryTopic === state.topic) &&
          (!state.type || match.type === state.type) &&
          (!state.maturity || match.maturity === state.maturity),
      )
      renderResults(matches, state)
      if (focusHeading) title.focus()
    } catch {
      title.textContent = "搜索暂不可用"
      status.textContent = "搜索索引载入失败"
      showOnly(error)
    } finally {
      root.querySelector(".search-page-results")?.setAttribute("aria-busy", "false")
    }
  }

  const onSubmit = (event: SubmitEvent) => {
    event.preventDefault()
    writeUrl()
    void run(true)
  }

  const onFilterChange = () => {
    writeUrl()
    void run()
  }

  const clearFilters = () => {
    for (const name of names) {
      const control = select(name)
      if (control) control.value = name === "sort" ? "relevance" : ""
    }
    writeUrl()
    void run()
  }

  const onRootClick = (event: MouseEvent) => {
    const target = event.target as Element
    const remove = target.closest<HTMLButtonElement>("[data-remove-search-filter]")
    if (remove) {
      const name = remove.dataset.removeSearchFilter as FilterName
      const control = select(name)
      if (control) control.value = ""
      writeUrl()
      void run()
      return
    }
    if (target.closest("[data-search-clear-filters]")) clearFilters()
    if (target.closest("[data-search-retry]")) {
      pageEnginePromise = undefined
      void run()
    }
  }

  const onQueryClear = () => {
    input.value = ""
    writeUrl()
    void run()
    input.focus()
  }

  const onPopState = () => {
    readUrl()
    void run()
  }

  readUrl()
  showOnly(loading)
  void loadEngine()
    .then((engine) => {
      corpusCount.textContent = String(engine.records.length)
      return run()
    })
    .catch(() => {
      title.textContent = "搜索暂不可用"
      status.textContent = "搜索索引载入失败"
      showOnly(error)
    })

  form.addEventListener("submit", onSubmit)
  root.addEventListener("change", onFilterChange)
  queryClear.addEventListener("click", onQueryClear)
  root.addEventListener("click", onRootClick)
  window.addEventListener("popstate", onPopState)

  window.addCleanup(() => {
    form.removeEventListener("submit", onSubmit)
    root.removeEventListener("change", onFilterChange)
    queryClear.removeEventListener("click", onQueryClear)
    root.removeEventListener("click", onRootClick)
    window.removeEventListener("popstate", onPopState)
  })
}
