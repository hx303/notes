import {
  buildKnowledgeCatalog,
  flattenKnowledgeCatalog,
  KnowledgeCatalogGroup,
  KnowledgeCatalogNode,
  KnowledgeCatalogRecord,
  KnowledgeDirectoryView,
} from "../../util/knowledgeCatalog"
import { FullSlug, resolveRelative, simplifySlug } from "../../util/path"
import { ContentDetails } from "../../plugins/emitters/contentIndex"

type DirectoryState = {
  view: KnowledgeDirectoryView
  expanded: Record<string, boolean>
}

const storageKey = "knowledgeDirectory"

function readState(): DirectoryState {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? "{}")
    return {
      view: stored.view === "type" ? "type" : "topic",
      expanded: stored.expanded && typeof stored.expanded === "object" ? stored.expanded : {},
    }
  } catch {
    return { view: "topic", expanded: {} }
  }
}

function writeState(state: DirectoryState) {
  localStorage.setItem(storageKey, JSON.stringify(state))
}

function toggleExplorer(this: HTMLElement) {
  const explorer = this.closest<HTMLElement>(".explorer")
  if (!explorer) return
  const collapsed = explorer.classList.toggle("collapsed")
  this.setAttribute("aria-expanded", String(!collapsed))
  explorer.querySelector<HTMLElement>(".explorer-content")?.setAttribute(
    "aria-expanded",
    String(!collapsed),
  )
}

function nodeContainsSlug(node: KnowledgeCatalogNode, currentSlug: FullSlug): boolean {
  if (node.kind === "record") return simplifySlug(node.slug) === simplifySlug(currentSlug)
  return node.children.some((child) => nodeContainsSlug(child, currentSlug))
}

function recordCount(node: KnowledgeCatalogNode): number {
  return node.kind === "record"
    ? 1
    : node.children.reduce((total, child) => total + recordCount(child), 0)
}

function createRecord(currentSlug: FullSlug, item: KnowledgeCatalogRecord): HTMLLIElement {
  const li = document.createElement("li")
  li.className = "directory-record"
  const link = document.createElement("a")
  link.href = resolveRelative(currentSlug, item.slug)
  link.dataset.for = item.slug
  link.textContent = item.label
  if (simplifySlug(currentSlug) === simplifySlug(item.slug)) {
    link.classList.add("active")
    link.setAttribute("aria-current", "page")
  }
  li.append(link)
  return li
}

function createGroup(
  explorer: HTMLElement,
  currentSlug: FullSlug,
  group: KnowledgeCatalogGroup,
  state: DirectoryState,
  defaultOpen: boolean,
  groupIndex: { value: number },
): HTMLLIElement {
  const li = document.createElement("li")
  li.className = "directory-group"
  li.dataset.groupId = group.id

  const button = document.createElement("button")
  button.type = "button"
  button.className = "folder-button"
  const panelId = `${explorer.id || "knowledge-directory"}-group-${groupIndex.value++}`
  button.setAttribute("aria-controls", panelId)

  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  icon.setAttribute("aria-hidden", "true")
  icon.setAttribute("focusable", "false")
  icon.setAttribute("viewBox", "5 8 14 8")
  icon.classList.add("folder-icon")
  const chevron = document.createElementNS("http://www.w3.org/2000/svg", "polyline")
  chevron.setAttribute("points", "6 9 12 15 18 9")
  icon.append(chevron)

  const label = document.createElement("span")
  label.className = "folder-title"
  label.textContent = group.label
  const count = document.createElement("span")
  count.className = "folder-count"
  count.textContent = String(recordCount(group))
  count.setAttribute("aria-label", `${recordCount(group)} 条知识记录`)
  button.append(icon, label, count)

  const children = document.createElement("ul")
  children.id = panelId
  children.className = "folder-outer"
  const savedOpen = state.expanded[group.id]
  const open = savedOpen ?? (defaultOpen || nodeContainsSlug(group, currentSlug))
  button.setAttribute("aria-expanded", String(open))
  children.hidden = !open

  for (const child of group.children) {
    children.append(
      child.kind === "group"
        ? createGroup(explorer, currentSlug, child, state, false, groupIndex)
        : createRecord(currentSlug, child),
    )
  }

  button.addEventListener("click", () => {
    const nextOpen = button.getAttribute("aria-expanded") !== "true"
    button.setAttribute("aria-expanded", String(nextOpen))
    children.hidden = !nextOpen
    state.expanded[group.id] = nextOpen
    writeState(state)
  })

  li.append(button, children)
  return li
}

function renderDirectory(
  explorer: HTMLElement,
  currentSlug: FullSlug,
  entries: ContentDetails[],
  view: KnowledgeDirectoryView,
  state: DirectoryState,
) {
  const root = explorer.querySelector<HTMLUListElement>(".explorer-ul")
  if (!root) return
  root.replaceChildren()

  const groups = buildKnowledgeCatalog(entries, view)
  const defaultOpen = explorer.dataset.collapsed === "open"
  const groupIndex = { value: 0 }
  for (const group of groups) {
    root.append(createGroup(explorer, currentSlug, group, state, defaultOpen, groupIndex))
  }

  const count = flattenKnowledgeCatalog(groups).length
  const summary = explorer.querySelector<HTMLElement>(".directory-summary")
  if (summary) {
    summary.textContent = `${count} 条知识记录 · ${groups.length} 个${view === "topic" ? "主题" : "类型"}`
  }

  for (const button of explorer.querySelectorAll<HTMLButtonElement>("[data-directory-view]")) {
    button.setAttribute("aria-pressed", String(button.dataset.directoryView === view))
  }

  const active = root.querySelector<HTMLElement>("[aria-current=page]")
  active?.scrollIntoView({ block: "nearest" })
}

async function setupExplorer(currentSlug: FullSlug) {
  const entries = Object.values(await fetchData) as ContentDetails[]

  for (const explorer of document.querySelectorAll<HTMLElement>(".explorer")) {
    const state: DirectoryState =
      explorer.dataset.savestate === "true"
        ? readState()
        : { view: "topic", expanded: {} }
    const initialView: KnowledgeDirectoryView =
      explorer.dataset.initialView === "type" ? "type" : "topic"
    const view: KnowledgeDirectoryView =
      explorer.dataset.savestate === "true" ? state.view : initialView
    state.view = view

    renderDirectory(explorer, currentSlug, entries, view, state)

    for (const button of explorer.querySelectorAll<HTMLElement>(".explorer-toggle")) {
      button.addEventListener("click", toggleExplorer)
      window.addCleanup(() => button.removeEventListener("click", toggleExplorer))
    }

    for (const button of explorer.querySelectorAll<HTMLButtonElement>("[data-directory-view]")) {
      const changeView = () => {
        const nextView: KnowledgeDirectoryView =
          button.dataset.directoryView === "type" ? "type" : "topic"
        state.view = nextView
        writeState(state)
        renderDirectory(explorer, currentSlug, entries, nextView, state)
      }
      button.addEventListener("click", changeView)
      window.addCleanup(() => button.removeEventListener("click", changeView))
    }

    const mobileToggle = explorer.querySelector<HTMLElement>(".mobile-explorer")
    mobileToggle?.classList.remove("hide-until-loaded")
  }
}

document.addEventListener("nav", async (event: CustomEventMap["nav"]) => {
  await setupExplorer(event.detail.url)
})
