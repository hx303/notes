declare const Deno: {
  serve(handler: (request: Request) => Response | Promise<Response>): void
}

const allowedActions = new Set([
  "rewrite",
  "shorten",
  "expand",
  "summarize",
  "outline",
  "metadata",
  "source_gaps",
])

const allowedOrigin = (origin: string | null) => {
  if (!origin) return "https://wouldkeep.com"
  if (origin === "https://wouldkeep.com" || origin === "https://www.wouldkeep.com") return origin
  try {
    const url = new URL(origin)
    const isWouldkeepPreview =
      url.protocol === "https:" &&
      url.hostname.startsWith("notes-") &&
      url.hostname.endsWith("-wld-s-projects.vercel.app")
    if (isWouldkeepPreview) return origin
    if (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)) {
      return origin
    }
  } catch {
    return ""
  }
  return ""
}

const responseHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  Vary: "Origin",
})

const json = (origin: string, status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(origin),
  })

Deno.serve(async (request) => {
  const origin = allowedOrigin(request.headers.get("origin"))
  if (!origin) return json("https://wouldkeep.com", 403, { error: "origin_not_allowed" })

  if (request.method === "OPTIONS") return new Response(null, { headers: responseHeaders(origin) })
  if (request.method !== "POST") return json(origin, 405, { error: "method_not_allowed" })

  const authorization = request.headers.get("authorization") ?? ""
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return json(origin, 401, { error: "authentication_required" })
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > 65536) {
    return json(origin, 413, { error: "request_too_large" })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return json(origin, 400, { error: "invalid_json" })
  }

  const action = typeof body.action === "string" ? body.action : ""
  const selection = typeof body.selection === "string" ? body.selection : ""
  const context = typeof body.context === "string" ? body.context : ""
  const baseVersion = typeof body.base_version === "number" ? body.base_version : 0
  const documentId = typeof body.document_id === "string" ? body.document_id : null

  if (!allowedActions.has(action)) return json(origin, 400, { error: "unsupported_action" })
  if (!selection.trim()) return json(origin, 400, { error: "selection_required" })
  if (selection.length > 12000 || context.length > 36000) {
    return json(origin, 413, { error: "content_scope_too_large" })
  }
  if (!Number.isInteger(baseVersion) || baseVersion < 0) {
    return json(origin, 400, { error: "invalid_base_version" })
  }

  return json(origin, 200, {
    mock: true,
    run_id: crypto.randomUUID(),
    action,
    status: "gateway_ready",
    message: "安全网关连接成功。真实模型尚未启用，本次没有产生费用。",
    preview: selection,
    document_id: documentId,
    base_version: baseVersion,
    data_scope: {
      selection_characters: selection.length,
      context_characters: context.length,
    },
    model: null,
  })
})
