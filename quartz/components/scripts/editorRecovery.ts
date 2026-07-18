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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

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
