// Supabase Comments (inline section injection)
// Fetches comments and injects them below matching h2/h3 headings.
// Unmatched (global) comments go in a footer section.

document.addEventListener("nav", () => {
  const container = document.querySelector(".supabase-comments") as HTMLElement | null
  if (!container) return

  const fp = container.dataset.filePath || ""
  const supabaseUrl = container.dataset.supabaseUrl || ""
  const anonKey = container.dataset.supabaseAnonKey || ""
  if (!supabaseUrl || !anonKey) return

  injectComments(container, fp, supabaseUrl, anonKey)
})

// ---- styles (injected once) ----
function ensureStyles() {
  if (document.getElementById("sc-style")) return
  const s = document.createElement("style")
  s.id = "sc-style"
  s.textContent = `
.section-comments{ margin:0.6rem 0 1.2rem; padding:0 1rem; border-left:2px solid var(--tertiary,#e94560); }
.section-comments-header{ font-size:.78em; color:var(--tertiary,#e94560); margin-bottom:4px; font-weight:600; opacity:.85 }
.section-comment-item{ padding:4px 0; font-size:.82em; border-bottom:1px solid rgba(128,128,128,.1); }
.section-comment-item:last-child{ border-bottom:none }
.section-comment-item strong{ color:var(--tertiary,#e94560); margin-right:6px; font-size:.9em }
.section-comment-item .sc-time{ color:var(--gray); font-size:.72em; margin-left:6px }
.section-comment-item .sc-body{ color:var(--darkgray); line-height:1.5; margin-top:2px }
.sc-global{ margin-top:2rem; padding-top:1rem; border-top:1px solid var(--lightgray) }
`
  document.head.appendChild(s)
}

// ---- helpers ----
function esc(s: string): string {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")
}

function fmtTime(iso: string): string {
  try { return new Date(iso).toLocaleString("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}) }
  catch { return "" }
}

// ---- main ----
async function injectComments(container: HTMLElement, filePath: string, supabaseUrl: string, anonKey: string) {
  ensureStyles()

  // load SDK
  const sb = await loadSDK(supabaseUrl, anonKey)
  if (!sb) return

  let data: any[]
  try {
    const res = await sb.from("comments")
      .select("*, profiles(display_name)")
      .eq("file_path", filePath)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true })
    if (res.error) throw res.error
    data = res.data || []
  } catch {
    return
  }
  if (data.length === 0) return

  // group by section_title
  const bySection: Record<string, any[]> = {}
  for (const c of data) {
    const key = c.section_title || "global"
    if (!bySection[key]) bySection[key] = []
    bySection[key].push(c)
  }

  // find article headings (h2, h3)
  const article = document.querySelector("article")
  const headings = article ? Array.from(article.querySelectorAll("h2, h3")) : []

  // build a map: heading text → heading element
  const headingMap = new Map<string, Element>()
  for (const h of headings) {
    const t = (h.textContent || "").trim()
    if (t) headingMap.set(t, h)
  }

  // inject below matching headings
  const usedKeys = new Set<string>()
  for (const [sectionTitle, comments] of Object.entries(bySection)) {
    const h = headingMap.get(sectionTitle)
    if (!h) continue
    usedKeys.add(sectionTitle)

    const el = buildSectionEl(sectionTitle, comments)
    // find insertion point: after this section's content, before next heading
    insertAfterSection(h, el)
  }

  // global (unmatched) comments at the bottom
  const globalComments: any[] = []
  for (const [key, comments] of Object.entries(bySection)) {
    if (!usedKeys.has(key)) globalComments.push(...comments)
  }
  if (globalComments.length > 0) {
    const el = buildGlobalEl(globalComments)
    container.appendChild(el)
  }
}

function insertAfterSection(heading: Element, el: Element) {
  const headingLevel = parseInt(heading.tagName[1])
  let insertAfter: Element = heading
  let next = heading.nextElementSibling
  while (next) {
    const tag = next.tagName
    if (tag && /^H[1-6]$/.test(tag)) {
      const nl = parseInt(tag[1])
      if (nl <= headingLevel) break
    }
    insertAfter = next
    next = next.nextElementSibling
  }
  insertAfter.insertAdjacentElement("afterend", el)
}

function buildSectionEl(title: string, comments: any[]): HTMLElement {
  const div = document.createElement("div")
  div.className = "section-comments"
  div.innerHTML =
    '<div class="section-comments-header">💬 ' + esc(title) + ' (' + comments.length + ')</div>' +
    comments.map(c =>
      '<div class="section-comment-item">' +
      '<strong>' + esc(c.profiles?.display_name || "用户") + '</strong>' +
      '<span class="sc-time">' + fmtTime(c.created_at) + '</span>' +
      '<div class="sc-body">' + esc(c.content) + '</div>' +
      '</div>'
    ).join("")
  return div
}

function buildGlobalEl(comments: any[]): HTMLElement {
  const div = document.createElement("div")
  div.className = "sc-global"
  div.innerHTML =
    '<h3 style="margin-bottom:.5rem;font-size:.95em">💬 全局评论 (' + comments.length + ')</h3>' +
    comments.map(c =>
      '<div class="section-comment-item">' +
      '<strong>' + esc(c.profiles?.display_name || "用户") + '</strong>' +
      '<span class="sc-time">' + fmtTime(c.created_at) + '</span>' +
      '<div class="sc-body">' + esc(c.content) + '</div>' +
      '</div>'
    ).join("")
  return div
}

// ---- Supabase SDK loader ----
async function loadSDK(supabaseUrl: string, anonKey: string): Promise<any> {
  if ((window as any).__supabaseClient) return (window as any).__supabaseClient
  return new Promise(resolve => {
    const s = document.createElement("script")
    s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.min.js"
    s.async = true
    s.onload = () => {
      const sb = (window as any).supabase.createClient(supabaseUrl, anonKey)
      ;(window as any).__supabaseClient = sb
      resolve(sb)
    }
    s.onerror = () => resolve(null)
    document.head.appendChild(s)
  })
}
