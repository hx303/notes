export type AiSuggestionAction = "rewrite" | "shorten" | "expand"

export type AiSuggestionApplyMode = "replace" | "insert"

export interface AiSelectionSnapshot {
  action: AiSuggestionAction
  baseVersion: number
  body: string
  documentId: string
  end: number
  selection: string
  start: number
}

export type AiSelectionCaptureResult =
  | { ok: true; snapshot: AiSelectionSnapshot }
  | {
      ok: false
      code: "invalid_range" | "selection_required" | "selection_too_large" | "invalid_version"
    }

export interface AiSuggestionPreview {
  action: AiSuggestionAction
  baseVersion: number
  documentId: string
  message: string
  mock: false
  runId: string
  suggestion: string
}

export type AiSuggestionGatewayResult =
  | { ok: true; kind: "suggestion"; preview: AiSuggestionPreview }
  | {
      ok: true
      kind: "gateway_check"
      message: string
      preview: string
      runId: string
    }
  | {
      ok: false
      code:
        | "invalid_response"
        | "mismatched_action"
        | "mismatched_document"
        | "mismatched_version"
        | "unsafe_scope"
    }

export interface AppliedAiSuggestion {
  body: string
  selectionEnd: number
  selectionStart: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const asString = (value: unknown) => (typeof value === "string" ? value : "")

export const captureAiSelection = (input: {
  action: AiSuggestionAction
  baseVersion: number
  body: string
  documentId?: string
  end: number
  start: number
}): AiSelectionCaptureResult => {
  if (!Number.isInteger(input.baseVersion) || input.baseVersion < 0) {
    return { ok: false, code: "invalid_version" }
  }
  if (
    !Number.isInteger(input.start) ||
    !Number.isInteger(input.end) ||
    input.start < 0 ||
    input.end <= input.start ||
    input.end > input.body.length
  ) {
    return { ok: false, code: "invalid_range" }
  }
  const selection = input.body.slice(input.start, input.end)
  if (!selection.trim()) return { ok: false, code: "selection_required" }
  if (selection.length > 12_000) return { ok: false, code: "selection_too_large" }
  return {
    ok: true,
    snapshot: {
      action: input.action,
      baseVersion: input.baseVersion,
      body: input.body,
      documentId: input.documentId?.trim() ?? "",
      end: input.end,
      selection,
      start: input.start,
    },
  }
}

export const parseAiSuggestionGatewayResponse = (
  payload: unknown,
  snapshot: AiSelectionSnapshot,
): AiSuggestionGatewayResult => {
  if (!isRecord(payload)) return { ok: false, code: "invalid_response" }
  const runId = asString(payload.run_id).trim()
  const action = asString(payload.action)
  if (!runId || !action) return { ok: false, code: "invalid_response" }
  if (action !== snapshot.action) return { ok: false, code: "mismatched_action" }

  if (payload.mock === true) {
    const preview = asString(payload.preview)
    const message = asString(payload.message).trim()
    if (!preview || preview !== snapshot.selection || !message) {
      return { ok: false, code: "invalid_response" }
    }
    return { ok: true, kind: "gateway_check", message, preview, runId }
  }

  if (payload.mock !== false || payload.status !== "completed") {
    return { ok: false, code: "invalid_response" }
  }
  if (payload.result_scope !== "selection") return { ok: false, code: "unsafe_scope" }
  if (payload.base_version !== snapshot.baseVersion) {
    return { ok: false, code: "mismatched_version" }
  }
  const documentId = asString(payload.document_id).trim()
  if (documentId !== snapshot.documentId) {
    return { ok: false, code: "mismatched_document" }
  }
  const suggestion = asString(payload.suggestion)
  if (!suggestion.trim()) return { ok: false, code: "invalid_response" }
  return {
    ok: true,
    kind: "suggestion",
    preview: {
      action: snapshot.action,
      baseVersion: snapshot.baseVersion,
      documentId,
      message: asString(payload.message).trim(),
      mock: false,
      runId,
      suggestion,
    },
  }
}

export const aiSelectionSnapshotIsCurrent = (
  snapshot: AiSelectionSnapshot,
  current: { baseVersion: number; body: string; documentId?: string },
) =>
  current.baseVersion === snapshot.baseVersion &&
  current.body === snapshot.body &&
  (current.documentId?.trim() ?? "") === snapshot.documentId

const insertionAround = (body: string, index: number, suggestion: string) => {
  const needsPrefix = index > 0 && !body.slice(0, index).endsWith("\n\n")
  const needsSuffix = index < body.length && !body.slice(index).startsWith("\n\n")
  return `${needsPrefix ? "\n\n" : ""}${suggestion}${needsSuffix ? "\n\n" : ""}`
}

export const applyAiSuggestion = (
  snapshot: AiSelectionSnapshot,
  suggestion: string,
  mode: AiSuggestionApplyMode,
): AppliedAiSuggestion => {
  if (!suggestion.trim()) throw new Error("AI suggestion must not be blank.")
  if (mode === "replace") {
    const body = `${snapshot.body.slice(0, snapshot.start)}${suggestion}${snapshot.body.slice(snapshot.end)}`
    return {
      body,
      selectionStart: snapshot.start,
      selectionEnd: snapshot.start + suggestion.length,
    }
  }
  const insertion = insertionAround(snapshot.body, snapshot.end, suggestion)
  const body = `${snapshot.body.slice(0, snapshot.end)}${insertion}${snapshot.body.slice(snapshot.end)}`
  const start = snapshot.end + insertion.indexOf(suggestion)
  return { body, selectionStart: start, selectionEnd: start + suggestion.length }
}
