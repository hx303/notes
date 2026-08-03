export type EditorBackupMeta = {
  version: 1
  ownerId: string
  documentId: string
  baseRevision: number
  savedAt: number
}

export type EditorBackup = Record<string, unknown> & {
  __editorRecovery?: EditorBackupMeta
}

export type EditorBackupInspection =
  | { state: "restore"; backup: EditorBackup }
  | { state: "conflict"; backup: EditorBackup; reason: "unknown-base" | "stale-base" }
  | { state: "invalid" }

export type EditorTabDraftState = {
  markDirty: (documentId: string, generation: number) => void
  isDirty: (documentId: string) => boolean
  rememberBackup: (documentId: string, raw: string) => void
  backupToken: (documentId: string) => string | null
  moveDirty: (fromDocumentId: string, toDocumentId: string) => void
  clearDirtyIfGeneration: (documentId: string, generation: number) => boolean
  forgetBackup: (documentId: string, expectedRaw?: string) => void
  clearDocument: (documentId: string) => void
  clearAll: () => void
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

/**
 * Tracks only this tab's edits and backup writes. localStorage is shared by
 * every same-origin tab, so its presence alone cannot tell whether the current
 * tab has unsaved work.
 */
export const createEditorTabDraftState = (): EditorTabDraftState => {
  const dirtyGenerations = new Map<string, number>()
  const backupTokens = new Map<string, string>()

  return {
    markDirty: (documentId, generation) => dirtyGenerations.set(documentId, generation),
    isDirty: (documentId) => dirtyGenerations.has(documentId),
    rememberBackup: (documentId, raw) => backupTokens.set(documentId, raw),
    backupToken: (documentId) => backupTokens.get(documentId) ?? null,
    moveDirty: (fromDocumentId, toDocumentId) => {
      const generation = dirtyGenerations.get(fromDocumentId)
      dirtyGenerations.delete(fromDocumentId)
      if (generation !== undefined) dirtyGenerations.set(toDocumentId, generation)
    },
    clearDirtyIfGeneration: (documentId, generation) => {
      if (dirtyGenerations.get(documentId) !== generation) return false
      dirtyGenerations.delete(documentId)
      return true
    },
    forgetBackup: (documentId, expectedRaw) => {
      if (expectedRaw !== undefined && backupTokens.get(documentId) !== expectedRaw) return
      backupTokens.delete(documentId)
    },
    clearDocument: (documentId) => {
      dirtyGenerations.delete(documentId)
      backupTokens.delete(documentId)
    },
    clearAll: () => {
      dirtyGenerations.clear()
      backupTokens.clear()
    },
  }
}

export const removeStorageItemIfUnchanged = (
  storage: Pick<Storage, "getItem" | "removeItem">,
  key: string,
  expectedRaw: string | null,
) => {
  if (expectedRaw === null || storage.getItem(key) !== expectedRaw) return false
  storage.removeItem(key)
  return true
}

export const setStorageItemSafely = (
  storage: Pick<Storage, "setItem">,
  key: string,
  raw: string,
) => {
  try {
    storage.setItem(key, raw)
    return true
  } catch {
    return false
  }
}

export const materializeEditorOutboxFormIdentity = (
  form: unknown,
  record: { documentId: string; baseRevision: number },
): Record<string, unknown> | null => {
  if (
    !isRecord(form) ||
    !record.documentId ||
    !Number.isInteger(record.baseRevision) ||
    record.baseRevision < 0
  )
    return null
  return {
    ...form,
    documentId: record.documentId === "new" ? "" : record.documentId,
    revision: record.baseRevision,
  }
}

const isEditorBackupMeta = (value: unknown): value is EditorBackupMeta => {
  if (!isRecord(value)) return false
  return (
    value.version === 1 &&
    typeof value.ownerId === "string" &&
    typeof value.documentId === "string" &&
    Number.isInteger(value.baseRevision) &&
    Number(value.baseRevision) >= 0 &&
    Number.isFinite(value.savedAt) &&
    Number(value.savedAt) >= 0
  )
}

export const addEditorBackupMetadata = (
  backup: Record<string, unknown>,
  ownerId: string,
  documentId: string,
  baseRevision: number,
  savedAt = Date.now(),
): EditorBackup => ({
  ...backup,
  __editorRecovery: {
    version: 1,
    ownerId,
    documentId,
    baseRevision: Number.isInteger(baseRevision) && baseRevision >= 0 ? baseRevision : 0,
    savedAt,
  },
})

export const selectRecoverableEditorBackup = (
  candidates: ReadonlyArray<{ backup: EditorBackup; priority: number }>,
): EditorBackup | null => {
  const savedAt = (backup: EditorBackup) => {
    const value = Number(backup.__editorRecovery?.savedAt ?? 0)
    return Number.isFinite(value) && value >= 0 ? value : 0
  }
  return (
    [...candidates].sort(
      (left, right) =>
        savedAt(right.backup) - savedAt(left.backup) || right.priority - left.priority,
    )[0]?.backup ?? null
  )
}

export const inspectEditorBackup = (
  raw: string,
  ownerId: string,
  documentId: string,
  cloudRevision?: number,
): EditorBackupInspection => {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return { state: "invalid" }
    const backup = parsed as EditorBackup
    const meta = backup.__editorRecovery

    // Backward compatibility is safe for the unsaved "new" draft because it
    // cannot overwrite an existing cloud row. Existing-document backups need
    // an explicit base revision before they may be restored automatically.
    if (!meta) {
      return documentId === "new"
        ? { state: "restore", backup }
        : { state: "conflict", backup, reason: "unknown-base" }
    }
    if (!isEditorBackupMeta(meta)) return { state: "invalid" }
    if (meta.ownerId !== ownerId || meta.documentId !== documentId) return { state: "invalid" }
    if (
      documentId !== "new" &&
      Number.isInteger(cloudRevision) &&
      meta.baseRevision !== cloudRevision
    ) {
      return { state: "conflict", backup, reason: "stale-base" }
    }
    return { state: "restore", backup }
  } catch {
    return { state: "invalid" }
  }
}

export type SerializedSaveQueue = {
  request: () => Promise<boolean>
  isSaving: () => boolean
}

/**
 * Runs at most one save at a time. Requests received during an in-flight save
 * are coalesced into one follow-up save so the latest form state is persisted
 * after the first request updates the document revision.
 */
export const createSerializedSaveQueue = (save: () => Promise<boolean>): SerializedSaveQueue => {
  let active: Promise<boolean> | null = null
  let rerun = false

  const drain = async () => {
    let allSucceeded = true
    do {
      rerun = false
      try {
        allSucceeded = (await save()) && allSucceeded
      } catch {
        allSucceeded = false
      }
    } while (rerun)
    return allSucceeded
  }

  return {
    request: () => {
      if (active) {
        rerun = true
        return active
      }
      active = drain().finally(() => {
        active = null
      })
      return active
    },
    isSaving: () => active !== null,
  }
}
