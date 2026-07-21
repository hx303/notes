export const WORKSPACE_TAG_MAX_CHARACTERS = 80
export const WORKSPACE_SOURCE_MAX_COUNT = 50
export const WORKSPACE_MISSING_RELATION_TITLE = "原关联知识已删除或无法识别"

export type WorkspaceOrganizationIssueCode =
  | "hidden_invalid"
  | "tag_blank"
  | "tag_too_long"
  | "tag_punctuation_only"
  | "relation_unknown"
  | "relation_ambiguous"
  | "relation_self"
  | "relation_duplicate"
  | "source_limit"
  | "source_invalid"
  | "source_kind_invalid"
  | "source_web_url_required"
  | "source_web_url_invalid"
  | "source_sensitive_url"
  | "source_personal_title_required"
  | "source_duplicate_url"

export type WorkspaceOrganizationIssue = {
  code: WorkspaceOrganizationIssueCode
  index?: number
  value?: string
}

export type WorkspaceOrganizationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: WorkspaceOrganizationIssue[] }

export type WorkspaceTag = {
  name: string
  normalizedKey: string
}

export type WorkspaceDocumentReference = {
  id: string
  title: string
}

export type WorkspaceRelationSelection = {
  documentId: string
  title: string
}

export type WorkspaceSourceKind = "web" | "personal"

export type WorkspaceSourceInput = {
  kind: WorkspaceSourceKind
  url?: string | null
  title?: string | null
  author?: string | null
  note?: string | null
}

export type WorkspaceSource = {
  kind: WorkspaceSourceKind
  url: string
  title: string
  author: string
  note: string
}

type HiddenStringListInput = string | readonly string[] | null | undefined
type HiddenSourceListInput = string | readonly unknown[] | null | undefined

const ok = <T>(value: T): WorkspaceOrganizationResult<T> => ({ ok: true, value })
const invalid = <T>(issues: WorkspaceOrganizationIssue[]): WorkspaceOrganizationResult<T> => ({
  ok: false,
  issues,
})

const normalizeVisibleText = (value: string) => value.normalize("NFKC").trim().replace(/\s+/gu, " ")
const unicodeLength = (value: string) => [...value].length
const punctuationOnly = (value: string) => /^[\p{P}\s]+$/u.test(value)

export const normalizeWorkspaceTagKey = (value: string) => normalizeVisibleText(value).toLowerCase()

const parseHiddenStringList = (
  input: HiddenStringListInput,
): WorkspaceOrganizationResult<string[]> => {
  if (input === null || input === undefined) return ok([])
  if (Array.isArray(input)) return ok([...input])

  const raw = String(input).trim()
  if (!raw) return ok([])
  if (raw.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === "string"))
        return invalid([{ code: "hidden_invalid" }])
      return ok(parsed)
    } catch {
      return invalid([{ code: "hidden_invalid" }])
    }
  }

  return ok(raw.split(/[，,\n]/u).filter((value) => value.trim().length > 0))
}

export const parseWorkspaceTags = (
  input: HiddenStringListInput,
): WorkspaceOrganizationResult<WorkspaceTag[]> => {
  const parsed = parseHiddenStringList(input)
  if (parsed.ok === false) return invalid(parsed.issues)

  const tags: WorkspaceTag[] = []
  const seen = new Set<string>()
  const issues: WorkspaceOrganizationIssue[] = []
  parsed.value.forEach((rawName, index) => {
    const name = normalizeVisibleText(rawName)
    if (!name) {
      issues.push({ code: "tag_blank", index })
      return
    }
    if (unicodeLength(name) > WORKSPACE_TAG_MAX_CHARACTERS) {
      issues.push({ code: "tag_too_long", index, value: name })
      return
    }
    if (punctuationOnly(name)) {
      issues.push({ code: "tag_punctuation_only", index, value: name })
      return
    }
    const normalizedKey = normalizeWorkspaceTagKey(name)
    if (seen.has(normalizedKey)) return
    seen.add(normalizedKey)
    tags.push({ name, normalizedKey })
  })

  return issues.length ? invalid(issues) : ok(tags)
}

export const serializeWorkspaceTags = (tags: readonly WorkspaceTag[]) =>
  JSON.stringify(tags.map((tag) => tag.name))

const referenceTitleKey = (value: string) => normalizeVisibleText(value)

export const workspaceRelationDisplayTitle = (title: unknown, deletedAt: unknown): string => {
  const normalizedTitle = typeof title === "string" ? normalizeVisibleText(title) : ""
  return deletedAt || !normalizedTitle ? WORKSPACE_MISSING_RELATION_TITLE : normalizedTitle
}

export const parseWorkspaceRelations = (
  input: HiddenStringListInput,
  options: {
    currentDocumentId: string
    documents: readonly WorkspaceDocumentReference[]
  },
): WorkspaceOrganizationResult<WorkspaceRelationSelection[]> => {
  const parsed = parseHiddenStringList(input)
  if (parsed.ok === false) return invalid(parsed.issues)

  const byId = new Map(options.documents.map((document) => [document.id, document]))
  const byTitle = new Map<string, WorkspaceDocumentReference[]>()
  for (const document of options.documents) {
    const key = referenceTitleKey(document.title)
    const matches = byTitle.get(key) ?? []
    matches.push(document)
    byTitle.set(key, matches)
  }

  const selections: WorkspaceRelationSelection[] = []
  const selectedIds = new Set<string>()
  const issues: WorkspaceOrganizationIssue[] = []
  parsed.value.forEach((rawValue, index) => {
    const value = normalizeVisibleText(rawValue)
    let target = byId.get(value)
    if (!target) {
      const titleMatches = byTitle.get(referenceTitleKey(value)) ?? []
      if (titleMatches.length > 1) {
        issues.push({ code: "relation_ambiguous", index, value })
        return
      }
      target = titleMatches[0]
    }
    if (!target) {
      issues.push({ code: "relation_unknown", index, value })
      return
    }
    if (target.id === options.currentDocumentId) {
      issues.push({ code: "relation_self", index, value: target.id })
      return
    }
    if (selectedIds.has(target.id)) {
      issues.push({ code: "relation_duplicate", index, value: target.id })
      return
    }
    selectedIds.add(target.id)
    selections.push({ documentId: target.id, title: target.title })
  })

  return issues.length ? invalid(issues) : ok(selections)
}

export const serializeWorkspaceRelations = (relations: readonly WorkspaceRelationSelection[]) =>
  JSON.stringify(relations.map((relation) => relation.documentId))

export const normalizeWorkspaceSourceUrl = (value: string): string | null => {
  try {
    const parsed = new URL(value.trim())
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
    return parsed.href
  } catch {
    return null
  }
}

const workspaceSourceUrlKey = (value: string) => {
  const parsed = new URL(value)
  parsed.hash = ""
  return parsed.href
}

const workspaceSourceSecretKey =
  /^(?:token|access[_-]?token|auth|authorization|password|passcode|session|api[_-]?key|key|signature|sig|x-amz-signature)$/i

const workspaceSourceUrlContainsSecret = (value: string) => {
  const parsed = new URL(value)
  if (parsed.username || parsed.password) return true
  if ([...parsed.searchParams.keys()].some((key) => workspaceSourceSecretKey.test(key))) return true
  const fragment = parsed.hash.slice(1)
  const fragmentQuery = fragment.includes("?")
    ? fragment.slice(fragment.indexOf("?") + 1)
    : fragment
  return [...new URLSearchParams(fragmentQuery).keys()].some((key) =>
    workspaceSourceSecretKey.test(key),
  )
}

const workspaceSourceInputContainsSecret = (value: string) => {
  const normalized = normalizeWorkspaceSourceUrl(value)
  if (normalized) return workspaceSourceUrlContainsSecret(normalized)
  return (
    /(?:^|[?#&])(?:token|access[_-]?token|auth|authorization|password|passcode|session|api[_-]?key|key|signature|sig|x-amz-signature)=/iu.test(
      value,
    ) || /:\/\/[^\s/:@]+:[^\s/@]*@/u.test(value)
  )
}

export const redactWorkspaceSourcesForRecovery = (
  sources: readonly WorkspaceSource[],
): WorkspaceSource[] =>
  sources.map((source) =>
    source.kind === "web" && workspaceSourceInputContainsSecret(source.url)
      ? { ...source, url: "" }
      : { ...source },
  )

const parseHiddenSources = (
  input: HiddenSourceListInput,
): WorkspaceOrganizationResult<unknown[]> => {
  if (input === null || input === undefined) return ok([])
  if (Array.isArray(input)) return ok([...input])
  const raw = String(input).trim()
  if (!raw) return ok([])
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? ok(parsed) : invalid([{ code: "hidden_invalid" }])
  } catch {
    return invalid([{ code: "hidden_invalid" }])
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

export const parseWorkspaceSources = (
  input: HiddenSourceListInput,
): WorkspaceOrganizationResult<WorkspaceSource[]> => {
  const parsed = parseHiddenSources(input)
  if (parsed.ok === false) return invalid(parsed.issues)
  if (parsed.value.length > WORKSPACE_SOURCE_MAX_COUNT)
    return invalid([{ code: "source_limit", value: String(parsed.value.length) }])

  const sources: WorkspaceSource[] = []
  const seenUrls = new Set<string>()
  const issues: WorkspaceOrganizationIssue[] = []
  parsed.value.forEach((rawSource, index) => {
    if (!isRecord(rawSource)) {
      issues.push({ code: "source_invalid", index })
      return
    }
    if (rawSource.kind !== "web" && rawSource.kind !== "personal") {
      issues.push({ code: "source_kind_invalid", index })
      return
    }

    const kind = rawSource.kind
    const rawUrl = typeof rawSource.url === "string" ? rawSource.url.trim() : ""
    const title = typeof rawSource.title === "string" ? rawSource.title.trim() : ""
    const author = typeof rawSource.author === "string" ? rawSource.author.trim() : ""
    const note = typeof rawSource.note === "string" ? rawSource.note.trim() : ""
    if (kind === "personal") {
      if (!title) {
        issues.push({ code: "source_personal_title_required", index })
        return
      }
      sources.push({ kind, url: "", title, author, note })
      return
    }

    if (!rawUrl) {
      issues.push({ code: "source_web_url_required", index })
      return
    }
    const url = normalizeWorkspaceSourceUrl(rawUrl)
    if (!url) {
      issues.push({ code: "source_web_url_invalid", index, value: rawUrl })
      return
    }
    if (workspaceSourceInputContainsSecret(url)) {
      issues.push({ code: "source_sensitive_url", index, value: url })
      return
    }
    const urlKey = workspaceSourceUrlKey(url)
    if (seenUrls.has(urlKey)) {
      issues.push({ code: "source_duplicate_url", index, value: url })
      return
    }
    seenUrls.add(urlKey)
    sources.push({ kind, url, title, author, note })
  })

  return issues.length ? invalid(issues) : ok(sources)
}

export const serializeWorkspaceSources = (sources: readonly WorkspaceSource[]) =>
  JSON.stringify(
    sources.map(({ kind, url, title, author, note }) => ({ kind, url, title, author, note })),
  )
