type TopicFilterName = "subtopic" | "type" | "maturity" | "sort"

document.addEventListener("nav", () => {
  const page = document.querySelector<HTMLElement>("[data-topic-page]")
  const form = page?.querySelector<HTMLFormElement>("[data-topic-filter-form]")
  const list = page?.querySelector<HTMLOListElement>("[data-topic-record-list]")
  if (!page || !form || !list) return

  const rows = [...list.querySelectorAll<HTMLElement>("[data-topic-record]")]
  const count = page.querySelector<HTMLElement>("[data-topic-result-count]")
  const summary = page.querySelector<HTMLElement>("[data-topic-filter-summary]")
  const zero = page.querySelector<HTMLElement>("[data-topic-zero-results]")
  const names: TopicFilterName[] = ["subtopic", "type", "maturity", "sort"]

  const control = (name: TopicFilterName) =>
    form.elements.namedItem(name) as HTMLSelectElement | null

  const readUrl = () => {
    const params = new URLSearchParams(window.location.search)
    for (const name of names) {
      const select = control(name)
      if (!select) continue
      const candidate = params.get(name) ?? (name === "sort" ? "title" : "")
      select.value = [...select.options].some((option) => option.value === candidate)
        ? candidate
        : name === "sort"
          ? "title"
          : ""
    }
  }

  const apply = () => {
    const subtopic = control("subtopic")?.value ?? ""
    const type = control("type")?.value ?? ""
    const maturity = control("maturity")?.value ?? ""
    const sort = control("sort")?.value ?? "title"
    const visible = rows.filter((row) => {
      const matches =
        (!subtopic || row.dataset.subtopic === subtopic) &&
        (!type || row.dataset.type === type) &&
        (!maturity || row.dataset.maturity === maturity)
      row.hidden = !matches
      return matches
    })

    const sorted = [...rows].sort((a, b) => {
      if (sort === "updated") {
        return (
          (b.dataset.updated ?? "").localeCompare(a.dataset.updated ?? "") ||
          (a.dataset.title ?? "").localeCompare(b.dataset.title ?? "", "zh-CN")
        )
      }
      if (sort === "maturity") {
        return (
          Number(b.dataset.maturityRank ?? 0) - Number(a.dataset.maturityRank ?? 0) ||
          (a.dataset.title ?? "").localeCompare(b.dataset.title ?? "", "zh-CN")
        )
      }
      return (a.dataset.title ?? "").localeCompare(b.dataset.title ?? "", "zh-CN")
    })
    for (const row of sorted) list.append(row)

    if (count) count.textContent = String(visible.length)
    if (zero) zero.hidden = visible.length !== 0
    const labels = [subtopic, type, maturity].filter(Boolean)
    if (summary) summary.textContent = labels.length > 0 ? `当前筛选：${labels.join(" · ")}` : ""
  }

  const writeUrl = () => {
    const url = new URL(window.location.href)
    for (const name of names) {
      const value = control(name)?.value ?? ""
      if (value && !(name === "sort" && value === "title")) url.searchParams.set(name, value)
      else url.searchParams.delete(name)
    }
    window.history.pushState({}, "", url)
  }

  const onChange = () => {
    writeUrl()
    apply()
  }
  const reset = () => {
    for (const name of names) {
      const select = control(name)
      if (select) select.value = name === "sort" ? "title" : ""
    }
    writeUrl()
    apply()
    control("subtopic")?.focus()
  }
  const onResetClick = (event: Event) => {
    if (!(event.target as Element).closest("[data-topic-filter-reset]")) return
    reset()
  }
  const onPopState = () => {
    readUrl()
    apply()
  }

  readUrl()
  apply()
  form.addEventListener("change", onChange)
  page.addEventListener("click", onResetClick)
  window.addEventListener("popstate", onPopState)

  window.addCleanup(() => {
    form.removeEventListener("change", onChange)
    page.removeEventListener("click", onResetClick)
    window.removeEventListener("popstate", onPopState)
  })
})
