export const EDITOR_ATOMIC_SAVE_PROTOCOL = "snapshot-v1" as const
export const EDITOR_ATOMIC_SAVE_RPC = "save_document_snapshot_v1" as const
export const EDITOR_ATOMIC_SAVE_RESULT_VERSION = 1 as const

const snapshotKeys = [
  "title",
  "body",
  "topic",
  "maturity",
  "visibility",
  "tags",
  "prerequisites",
  "related",
  "sources",
] as const
const sourceKeys = ["kind", "url", "title", "author", "note"] as const
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const operationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u
const sourceSecretKey =
  /^(?:token|access[_-]?token|auth|authorization|password|passcode|session|api[_-]?key|key|signature|sig|x-amz-signature)$/iu

export type AtomicEditorSource = {
  kind: "web" | "personal"
  url: string
  title: string
  author: string
  note: string
}

export type AtomicEditorSnapshot = {
  title: string
  body: string
  topic: string
  maturity: "seed" | "growing" | "stable"
  visibility: "private" | "unlisted" | "public"
  tags: string[]
  prerequisites: string[]
  related: string[]
  sources: AtomicEditorSource[]
}

export type AtomicEditorSavePayload = {
  requestVersion: typeof EDITOR_ATOMIC_SAVE_RESULT_VERSION
  knowledgeBaseId: string
  snapshot: AtomicEditorSnapshot
}

export type AtomicEditorSaveRpcArguments = {
  p_operation_id: string
  p_document_id: string | null
  p_knowledge_base_id: string
  p_expected_revision: number
  p_snapshot: AtomicEditorSnapshot
}

export type AtomicEditorSavedResponse = {
  result_version: typeof EDITOR_ATOMIC_SAVE_RESULT_VERSION
  status: "saved"
  operation_id: string
  document_id: string
  knowledge_base_id: string
  revision: number
  created: boolean
  saved_at: string
}

export type AtomicEditorConflictResponse = {
  result_version: typeof EDITOR_ATOMIC_SAVE_RESULT_VERSION
  status: "conflict"
  operation_id: string
  document_id: string
  knowledge_base_id: string
  expected_revision: number
  current_revision: number
  created: false
  saved_at: null
}

export type AtomicEditorNotFoundResponse = {
  result_version: typeof EDITOR_ATOMIC_SAVE_RESULT_VERSION
  status: "not_found"
  operation_id: string
  knowledge_base_id: string
  created: false
  saved_at: null
}

export type AtomicEditorSaveResponse =
  | AtomicEditorSavedResponse
  | AtomicEditorConflictResponse
  | AtomicEditorNotFoundResponse

export class AtomicEditorSaveContractError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AtomicEditorSaveContractError"
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const hasExactKeys = (value: Record<string, unknown>, expected: readonly string[]) => {
  const actual = Object.keys(value).sort()
  const keys = [...expected].sort()
  return actual.length === keys.length && actual.every((key, index) => key === keys[index])
}

const isUuid = (value: unknown): value is string =>
  typeof value === "string" && uuidPattern.test(value)

const isSafeRevision = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0

const unicodeLength = (value: string) => [...value].length

const canonicalTag = (value: string) => value.normalize("NFKC").trim().replace(/\s+/gu, " ")

const sourceUrlHasSecret = (value: string) => {
  const parsed = new URL(value)
  if (parsed.username || parsed.password) return true
  if ([...parsed.searchParams.keys()].some((key) => sourceSecretKey.test(key))) return true
  const fragment = parsed.hash.slice(1)
  const fragmentQuery = fragment.includes("?")
    ? fragment.slice(fragment.indexOf("?") + 1)
    : fragment
  return [...new URLSearchParams(fragmentQuery).keys()].some((key) => sourceSecretKey.test(key))
}

const materializeSource = (value: unknown, index: number): AtomicEditorSource => {
  if (!isRecord(value) || !hasExactKeys(value, sourceKeys)) {
    throw new AtomicEditorSaveContractError(`snapshot.sources[${index}] must use exact v1 keys`)
  }
  if (value.kind !== "web" && value.kind !== "personal") {
    throw new AtomicEditorSaveContractError(`snapshot.sources[${index}].kind is invalid`)
  }
  for (const key of ["url", "title", "author", "note"] as const) {
    if (typeof value[key] !== "string") {
      throw new AtomicEditorSaveContractError(`snapshot.sources[${index}].${key} must be a string`)
    }
    if (value[key] !== value[key].trim()) {
      throw new AtomicEditorSaveContractError(`snapshot.sources[${index}].${key} must be trimmed`)
    }
  }
  const kind = value.kind
  const url = value.url as string
  const title = value.title as string
  const author = value.author as string
  const note = value.note as string
  if (unicodeLength(title) > 240 || unicodeLength(author) > 160 || unicodeLength(note) > 1000) {
    throw new AtomicEditorSaveContractError(`snapshot.sources[${index}] exceeds a text limit`)
  }
  if (kind === "personal") {
    if (url !== "" || title === "") {
      throw new AtomicEditorSaveContractError(
        `snapshot.sources[${index}] personal source requires title and empty url`,
      )
    }
  } else {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      throw new AtomicEditorSaveContractError(`snapshot.sources[${index}].url is invalid`)
    }
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      url.length > 2048 ||
      /\s/u.test(url) ||
      sourceUrlHasSecret(url)
    ) {
      throw new AtomicEditorSaveContractError(`snapshot.sources[${index}].url is unsafe`)
    }
  }
  return {
    kind,
    url,
    title,
    author,
    note,
  }
}

const materializeRelations = (
  value: unknown,
  field: "prerequisites" | "related",
  documentId?: string | null,
) => {
  if (!Array.isArray(value) || value.length > 100) {
    throw new AtomicEditorSaveContractError(
      `snapshot.${field} must be an array of at most 100 UUIDs`,
    )
  }
  const seen = new Set<string>()
  return value.map((entry, index) => {
    if (!isUuid(entry)) {
      throw new AtomicEditorSaveContractError(`snapshot.${field}[${index}] must be a UUID`)
    }
    if (entry === documentId) {
      throw new AtomicEditorSaveContractError(`snapshot.${field}[${index}] cannot refer to itself`)
    }
    if (seen.has(entry)) {
      throw new AtomicEditorSaveContractError(`snapshot.${field} contains a duplicate UUID`)
    }
    seen.add(entry)
    return entry
  })
}

export const materializeAtomicEditorSnapshot = (
  value: unknown,
  options: { documentId?: string | null } = {},
): AtomicEditorSnapshot => {
  if (!isRecord(value) || !hasExactKeys(value, snapshotKeys)) {
    throw new AtomicEditorSaveContractError("snapshot must use the exact 9-key v1 contract")
  }
  for (const key of ["title", "body", "topic"] as const) {
    if (typeof value[key] !== "string") {
      throw new AtomicEditorSaveContractError(`snapshot.${key} must be a string`)
    }
  }
  const title = value.title as string
  const body = value.body as string
  const topic = value.topic as string
  if (unicodeLength(title) > 160 || unicodeLength(topic) > 160) {
    throw new AtomicEditorSaveContractError("snapshot title or topic exceeds the v1 limit")
  }
  if (unicodeLength(body) > 1_000_000 || new TextEncoder().encode(body).byteLength > 4_000_000) {
    throw new AtomicEditorSaveContractError("snapshot body exceeds the v1 limit")
  }
  if (value.maturity !== "seed" && value.maturity !== "growing" && value.maturity !== "stable") {
    throw new AtomicEditorSaveContractError("snapshot.maturity is invalid")
  }
  if (
    value.visibility !== "private" &&
    value.visibility !== "unlisted" &&
    value.visibility !== "public"
  ) {
    throw new AtomicEditorSaveContractError("snapshot.visibility is invalid")
  }
  if (!Array.isArray(value.tags) || value.tags.length > 100) {
    throw new AtomicEditorSaveContractError("snapshot.tags must be an array of at most 100 strings")
  }
  const tagKeys = new Set<string>()
  const tags = value.tags.map((entry, index) => {
    if (typeof entry !== "string") {
      throw new AtomicEditorSaveContractError(`snapshot.tags[${index}] must be a string`)
    }
    const tag = canonicalTag(entry)
    const key = tag.toLowerCase()
    if (!tag || unicodeLength(tag) > 80 || /^[\p{P}\s]+$/u.test(tag)) {
      throw new AtomicEditorSaveContractError(`snapshot.tags[${index}] is invalid`)
    }
    if (tagKeys.has(key)) {
      throw new AtomicEditorSaveContractError("snapshot.tags contains a duplicate normalized tag")
    }
    tagKeys.add(key)
    return tag
  })
  if (!Array.isArray(value.sources) || value.sources.length > 50) {
    throw new AtomicEditorSaveContractError(
      "snapshot.sources must be an array of at most 50 sources",
    )
  }
  const sources = value.sources.map(materializeSource)
  const webUrls = new Set<string>()
  for (const source of sources) {
    if (source.kind !== "web") continue
    const parsed = new URL(source.url)
    parsed.hash = ""
    if (webUrls.has(parsed.href)) {
      throw new AtomicEditorSaveContractError("snapshot.sources contains a duplicate web URL")
    }
    webUrls.add(parsed.href)
  }
  const snapshot: AtomicEditorSnapshot = {
    title,
    body,
    topic,
    maturity: value.maturity,
    visibility: value.visibility,
    tags,
    prerequisites: materializeRelations(value.prerequisites, "prerequisites", options.documentId),
    related: materializeRelations(value.related, "related", options.documentId),
    sources,
  }
  if (new TextEncoder().encode(JSON.stringify(snapshot)).byteLength > 5_000_000) {
    throw new AtomicEditorSaveContractError("snapshot exceeds the v1 request limit")
  }
  return structuredClone(snapshot)
}

export const materializeAtomicEditorSavePayload = (
  value: unknown,
  options: { documentId?: string | null } = {},
): AtomicEditorSavePayload => {
  if (!isRecord(value) || !hasExactKeys(value, ["requestVersion", "knowledgeBaseId", "snapshot"])) {
    throw new AtomicEditorSaveContractError("atomic save payload must use exact v1 keys")
  }
  if (value.requestVersion !== EDITOR_ATOMIC_SAVE_RESULT_VERSION) {
    throw new AtomicEditorSaveContractError("atomic save payload requestVersion must be 1")
  }
  if (!isUuid(value.knowledgeBaseId)) {
    throw new AtomicEditorSaveContractError("knowledgeBaseId must be a UUID")
  }
  return {
    requestVersion: EDITOR_ATOMIC_SAVE_RESULT_VERSION,
    knowledgeBaseId: value.knowledgeBaseId,
    snapshot: materializeAtomicEditorSnapshot(value.snapshot, options),
  }
}

export const createAtomicEditorSaveRpcArguments = (input: {
  operationId: string
  documentId: string
  baseRevision: number
  payload: unknown
}): AtomicEditorSaveRpcArguments => {
  if (!operationIdPattern.test(input.operationId)) {
    throw new AtomicEditorSaveContractError("operationId is invalid")
  }
  if (!isSafeRevision(input.baseRevision) || input.baseRevision > 9_007_199_254_740_990) {
    throw new AtomicEditorSaveContractError("baseRevision cannot advance within JS safe integers")
  }
  const isNew = input.documentId === "new"
  if (!isNew && !isUuid(input.documentId)) {
    throw new AtomicEditorSaveContractError("documentId must be new or a UUID")
  }
  if (isNew && input.baseRevision !== 0) {
    throw new AtomicEditorSaveContractError("a new document must use revision 0")
  }
  const payload = materializeAtomicEditorSavePayload(input.payload, {
    documentId: isNew ? null : input.documentId,
  })
  return {
    p_operation_id: input.operationId,
    p_document_id: isNew ? null : input.documentId,
    p_knowledge_base_id: payload.knowledgeBaseId,
    p_expected_revision: input.baseRevision,
    p_snapshot: payload.snapshot,
  }
}

const requireOperationId = (value: unknown) => {
  if (typeof value !== "string" || !operationIdPattern.test(value)) {
    throw new AtomicEditorSaveContractError("response.operation_id is invalid")
  }
  return value
}

const requireSavedAt = (value: unknown) => {
  if (typeof value !== "string" || !value || !Number.isFinite(Date.parse(value))) {
    throw new AtomicEditorSaveContractError("response.saved_at is invalid")
  }
  return value
}

export const parseAtomicEditorSaveResponse = (value: unknown): AtomicEditorSaveResponse => {
  if (!isRecord(value) || value.result_version !== EDITOR_ATOMIC_SAVE_RESULT_VERSION) {
    throw new AtomicEditorSaveContractError("RPC response has an unsupported result version")
  }
  if (value.status === "saved") {
    if (
      !hasExactKeys(value, [
        "result_version",
        "status",
        "operation_id",
        "document_id",
        "knowledge_base_id",
        "revision",
        "created",
        "saved_at",
      ]) ||
      !isUuid(value.document_id) ||
      !isUuid(value.knowledge_base_id) ||
      !isSafeRevision(value.revision) ||
      typeof value.created !== "boolean"
    ) {
      throw new AtomicEditorSaveContractError("saved response violates the v1 contract")
    }
    return {
      result_version: EDITOR_ATOMIC_SAVE_RESULT_VERSION,
      status: "saved",
      operation_id: requireOperationId(value.operation_id),
      document_id: value.document_id,
      knowledge_base_id: value.knowledge_base_id,
      revision: value.revision,
      created: value.created,
      saved_at: requireSavedAt(value.saved_at),
    }
  }
  if (value.status === "conflict") {
    if (
      !hasExactKeys(value, [
        "result_version",
        "status",
        "operation_id",
        "document_id",
        "knowledge_base_id",
        "expected_revision",
        "current_revision",
        "created",
        "saved_at",
      ]) ||
      !isUuid(value.document_id) ||
      !isUuid(value.knowledge_base_id) ||
      !isSafeRevision(value.expected_revision) ||
      !isSafeRevision(value.current_revision) ||
      value.created !== false ||
      value.saved_at !== null
    ) {
      throw new AtomicEditorSaveContractError("conflict response violates the v1 contract")
    }
    return {
      result_version: EDITOR_ATOMIC_SAVE_RESULT_VERSION,
      status: "conflict",
      operation_id: requireOperationId(value.operation_id),
      document_id: value.document_id,
      knowledge_base_id: value.knowledge_base_id,
      expected_revision: value.expected_revision,
      current_revision: value.current_revision,
      created: false,
      saved_at: null,
    }
  }
  if (value.status === "not_found") {
    if (
      !hasExactKeys(value, [
        "result_version",
        "status",
        "operation_id",
        "knowledge_base_id",
        "created",
        "saved_at",
      ]) ||
      !isUuid(value.knowledge_base_id) ||
      value.created !== false ||
      value.saved_at !== null
    ) {
      throw new AtomicEditorSaveContractError("not_found response violates the v1 contract")
    }
    return {
      result_version: EDITOR_ATOMIC_SAVE_RESULT_VERSION,
      status: "not_found",
      operation_id: requireOperationId(value.operation_id),
      knowledge_base_id: value.knowledge_base_id,
      created: false,
      saved_at: null,
    }
  }
  throw new AtomicEditorSaveContractError("RPC response status is invalid")
}

export const atomicEditorSaveProtocolIsReady = (value: unknown) =>
  value === EDITOR_ATOMIC_SAVE_PROTOCOL
