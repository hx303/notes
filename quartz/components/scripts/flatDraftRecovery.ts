import { EDITOR_DRAFT_SCOPE_PREFIX, parseEditorDraftId } from "./editorDraftRoute.ts"

export type FlatDraftSessionRecovery = {
  version: 1
  ownerId: string
  documentScopeId: string
  title: string
  body: string
  savedAt: number
}

type FlatDraftRecoveryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const isCanonicalDraftScope = (value: string) =>
  value.startsWith(EDITOR_DRAFT_SCOPE_PREFIX) &&
  Boolean(parseEditorDraftId(value.slice(EDITOR_DRAFT_SCOPE_PREFIX.length)))

export const flatDraftSessionRecoveryKey = (ownerId: string, documentScopeId: string) =>
  `wouldkeep:flat-draft-session:${ownerId}:${documentScopeId}`

export const writeFlatDraftSessionRecovery = (
  storage: Pick<FlatDraftRecoveryStorage, "setItem">,
  input: Omit<FlatDraftSessionRecovery, "version" | "savedAt"> & { savedAt?: number },
) => {
  if (!input.ownerId || !isCanonicalDraftScope(input.documentScopeId)) return false
  const savedAt = input.savedAt ?? Date.now()
  if (!Number.isFinite(savedAt) || savedAt < 0) return false
  const recovery: FlatDraftSessionRecovery = {
    version: 1,
    ownerId: input.ownerId,
    documentScopeId: input.documentScopeId,
    title: input.title,
    body: input.body,
    savedAt,
  }
  try {
    storage.setItem(
      flatDraftSessionRecoveryKey(input.ownerId, input.documentScopeId),
      JSON.stringify(recovery),
    )
    return true
  } catch {
    return false
  }
}

export const readFlatDraftSessionRecovery = (
  storage: Pick<FlatDraftRecoveryStorage, "getItem">,
  ownerId: string,
  documentScopeId: string,
): FlatDraftSessionRecovery | null => {
  if (!ownerId || !isCanonicalDraftScope(documentScopeId)) return null
  try {
    const raw = storage.getItem(flatDraftSessionRecoveryKey(ownerId, documentScopeId))
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    if (!isRecord(value)) return null
    if (
      value.version !== 1 ||
      value.ownerId !== ownerId ||
      value.documentScopeId !== documentScopeId ||
      typeof value.title !== "string" ||
      typeof value.body !== "string" ||
      typeof value.savedAt !== "number" ||
      !Number.isFinite(value.savedAt) ||
      value.savedAt < 0
    )
      return null
    return value as FlatDraftSessionRecovery
  } catch {
    return null
  }
}

export const removeFlatDraftSessionRecovery = (
  storage: Pick<FlatDraftRecoveryStorage, "removeItem">,
  ownerId: string,
  documentScopeId: string,
) => {
  if (!ownerId || !isCanonicalDraftScope(documentScopeId)) return false
  try {
    storage.removeItem(flatDraftSessionRecoveryKey(ownerId, documentScopeId))
    return true
  } catch {
    return false
  }
}
