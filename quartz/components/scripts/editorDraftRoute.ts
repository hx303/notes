export const EDITOR_DRAFT_SCOPE_PREFIX = "draft:" as const

const canonicalUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u

export const parseEditorDraftId = (value: unknown): string | null =>
  typeof value === "string" && canonicalUuidPattern.test(value) ? value : null

export const editorDraftScope = (draftId: string) => {
  const parsed = parseEditorDraftId(draftId)
  if (!parsed) throw new TypeError("A canonical draft UUID is required")
  return `${EDITOR_DRAFT_SCOPE_PREFIX}${parsed}`
}

export const createEditorDraftId = (
  randomUuid: (() => string) | null | undefined = globalThis.crypto?.randomUUID?.bind(
    globalThis.crypto,
  ),
) => {
  const draftId = randomUuid?.()
  if (!draftId || !parseEditorDraftId(draftId)) {
    throw new Error("A cryptographically random draft UUID is required")
  }
  return draftId
}

export const bindNewEditorDraftRoute = (currentHref: string, draftId: string) => {
  const route = new URL(currentHref)
  route.searchParams.delete("action")
  route.searchParams.delete("mode")
  route.searchParams.delete("document")
  route.searchParams.set("draft", editorDraftScope(draftId).slice(EDITOR_DRAFT_SCOPE_PREFIX.length))
  return route.toString()
}

export const bindDocumentEditorRoute = (currentHref: string, documentId: string) => {
  const route = new URL(currentHref)
  route.searchParams.delete("action")
  route.searchParams.delete("mode")
  route.searchParams.delete("draft")
  route.searchParams.set("document", documentId)
  return route.toString()
}

export type EditorRouteDecision =
  | { kind: "document"; documentId: string }
  | { kind: "draft"; draftId: string }
  | { kind: "invalid-draft" }
  | { kind: "new" }

export const resolveEditorRouteDecision = (input: {
  document: unknown
  draft: unknown
  hasDraftParameter: boolean
}): EditorRouteDecision => {
  const documentId = parseEditorDraftId(input.document)
  if (documentId) return { kind: "document", documentId }
  const draftId = parseEditorDraftId(input.draft)
  if (draftId) return { kind: "draft", draftId }
  if (input.hasDraftParameter) return { kind: "invalid-draft" }
  return { kind: "new" }
}
