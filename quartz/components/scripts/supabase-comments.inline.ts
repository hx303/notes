// Supabase Comments - Inline script for Quartz main site
// Reads comments from Supabase and renders them

document.addEventListener("nav", () => {
  const container = document.querySelector(".supabase-comments") as HTMLElement | null
  if (!container) return

  const filePath = container.dataset.filePath || ""
  const supabaseUrl = container.dataset.supabaseUrl || ""
  const supabaseAnonKey = container.dataset.supabaseAnonKey || ""

  if (!supabaseUrl || !supabaseAnonKey) {
    const list = container.querySelector(".supabase-comments-list")
    if (list) list.innerHTML = '<p style="color:#888;font-size:.9em">评论系统未配置</p>'
    return
  }

  loadSupabaseComments(container, filePath, supabaseUrl, supabaseAnonKey)
})

async function loadSupabaseComments(
  container: HTMLElement,
  filePath: string,
  supabaseUrl: string,
  supabaseAnonKey: string,
) {
  const list = container.querySelector(".supabase-comments-list") as HTMLElement | null
  if (!list) return

  // Dynamically load Supabase SDK
  const sb = await loadSupabaseSDK(supabaseUrl, supabaseAnonKey)
  if (!sb) {
    list.innerHTML = '<p style="color:#888;font-size:.9em">评论加载失败</p>'
    return
  }

  try {
    const { data, error } = await sb
      .from("comments")
      .select("*, profiles(display_name)")
      .eq("file_path", filePath)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true })

    if (error) throw error

    renderCommentList(list, data || [])
  } catch (e: any) {
    list.innerHTML = '<p style="color:#888;font-size:.9em">评论加载失败: ' + escapeHtml(e.message) + '</p>'
  }
}

function renderCommentList(list: HTMLElement, comments: any[]) {
  if (comments.length === 0) {
    list.innerHTML =
      '<p style="color:#888;font-size:.9em;text-align:center;padding:1rem">暂无评论。在 <a href="/admin" style="color:var(--tertiary)">管理后台</a> 登录后可发表评论。</p>'
    return
  }

  // Group by section
  const grouped: Record<string, any[]> = {}
  comments.forEach((c) => {
    const key = c.section_title || "全局"
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(c)
  })

  let html = ""
  Object.keys(grouped).forEach((section) => {
    html += '<div style="margin-bottom:1rem">'
    html +=
      '<div style="font-size:.75em;color:#888;border-bottom:1px solid #333;padding-bottom:2px;margin-bottom:6px">' +
      escapeHtml(section) +
      " (" +
      grouped[section].length +
      ")</div>"

    grouped[section].forEach((c) => {
      const profileName = c.profiles?.display_name || "用户"
      const time = new Date(c.created_at).toLocaleString("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })

      html += '<div style="padding:6px 10px;margin:4px 0;background:rgba(255,255,255,.03);border-radius:6px;border-left:2px solid var(--tertiary,#e94560)">'
      html +=
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
      html +=
        '<strong style="font-size:.85em;color:var(--tertiary,#e94560)">' +
        escapeHtml(profileName) +
        "</strong>"
      html += '<span style="font-size:.7em;color:#888">' + time + "</span>"
      html += "</div>"
      html +=
        '<div style="font-size:.85em;line-height:1.5;color:#ccc">' +
        escapeHtml(c.content) +
        "</div>"
      html += "</div>"
    })

    html += "</div>"
  })

  list.innerHTML = html
}

async function loadSupabaseSDK(supabaseUrl: string, supabaseAnonKey: string): Promise<any> {
  // Check if already loaded
  if ((window as any).__supabaseClient) return (window as any).__supabaseClient

  return new Promise((resolve) => {
    const script = document.createElement("script")
    script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/umd/supabase.min.js"
    script.async = true
    script.onload = () => {
      const sb = (window as any).supabase.createClient(supabaseUrl, supabaseAnonKey)
      ;(window as any).__supabaseClient = sb
      resolve(sb)
    }
    script.onerror = () => resolve(null)
    document.head.appendChild(script)
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
