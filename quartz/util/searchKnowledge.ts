import FlexSearch, { DefaultDocumentSearchResults, Document as FlexDocument } from "flexsearch"
import type { ContentDetails } from "../plugins/emitters/contentIndex"
import type { KnowledgeMaturity, KnowledgeTopic, KnowledgeType } from "./knowledgeMetadata"
import type { FullSlug } from "./path"
import { isPublicDiscoveryRecord } from "./publicDiscovery"

export type SearchRecord = {
  id: number
  slug: FullSlug
  title: string
  content: string
  tags: string[]
  summary: string
  primaryTopic?: KnowledgeTopic
  type: KnowledgeType
  maturity: KnowledgeMaturity
  updated?: string
}

export type SearchMatch = SearchRecord & {
  score: number
  matchedFields: Array<"title" | "content" | "tags">
}

export type SearchEngine = {
  index: FlexDocument<SearchRecord>
  records: SearchRecord[]
}

const aliases: Array<{ pattern: RegExp; terms: string[] }> = [
  { pattern: /^(光学建模|薄膜建模)$/i, terms: ["RCWA", "TMM"] },
  { pattern: /^(数值仿真|多物理场)$/i, terms: ["COMSOL", "仿真"] },
  { pattern: /^(量子力学|量子物理)$/i, terms: ["quantum", "量子"] },
  { pattern: /^(微分积分|高等数学)$/i, terms: ["微积分"] },
  { pattern: /^(文献搜索|论文检索)$/i, terms: ["文献检索"] },
  { pattern: /^(comosl)$/i, terms: ["COMSOL"] },
]

export const searchEncoder = (str: string): string[] => {
  const tokens: string[] = []
  let bufferStart = -1
  let bufferEnd = -1
  const lower = str.toLowerCase()

  let i = 0
  for (const char of lower) {
    const code = char.codePointAt(0)!
    const isCJK =
      (code >= 0x3040 && code <= 0x309f) ||
      (code >= 0x30a0 && code <= 0x30ff) ||
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0xac00 && code <= 0xd7af) ||
      (code >= 0x20000 && code <= 0x2a6df)
    const isWhitespace = code === 32 || code === 9 || code === 10 || code === 13

    if (isCJK) {
      if (bufferStart !== -1) {
        tokens.push(lower.slice(bufferStart, bufferEnd))
        bufferStart = -1
      }
      tokens.push(char)
    } else if (isWhitespace) {
      if (bufferStart !== -1) {
        tokens.push(lower.slice(bufferStart, bufferEnd))
        bufferStart = -1
      }
    } else {
      if (bufferStart === -1) bufferStart = i
      bufferEnd = i + char.length
    }
    i += char.length
  }

  if (bufferStart !== -1) tokens.push(lower.slice(bufferStart))
  return tokens
}

export function normalizeSearchQuery(query: string): string {
  return query.normalize("NFKC").trim().replace(/\s+/g, " ")
}

export function expandSearchQuery(query: string): string[] {
  const normalized = normalizeSearchQuery(query)
  const expanded = [normalized]
  for (const alias of aliases) {
    if (alias.pattern.test(normalized)) expanded.push(...alias.terms)
  }
  return [...new Set(expanded.filter(Boolean))]
}

function shortSummary(details: ContentDetails): string {
  const declared = details.knowledgeMetadata?.summary?.trim()
  if (declared) return declared
  return details.content.replace(/\s+/g, " ").trim().slice(0, 180)
}

export async function createSearchEngine(
  data: Record<string, ContentDetails>,
): Promise<SearchEngine> {
  const records = Object.entries(data)
    .filter(
      ([slug, details]) =>
        isPublicDiscoveryRecord({
          slug,
          title: details.title,
          knowledgeMetadata: details.knowledgeMetadata,
        }) && details.knowledgeMetadata?.primaryTopic !== undefined,
    )
    .map(
      ([slug, details], id): SearchRecord => ({
        id,
        slug: slug as FullSlug,
        title: details.title,
        content: details.content,
        tags: details.tags ?? [],
        summary: shortSummary(details),
        primaryTopic: details.knowledgeMetadata?.primaryTopic,
        type: details.knowledgeMetadata?.type ?? "concept",
        maturity: details.knowledgeMetadata?.maturity ?? "seed",
        updated: details.knowledgeMetadata?.updated,
      }),
    )

  const index = new FlexSearch.Document<SearchRecord>({
    encode: searchEncoder,
    document: {
      id: "id",
      index: [
        { field: "title", tokenize: "forward" },
        { field: "content", tokenize: "forward" },
        { field: "tags", tokenize: "forward" },
      ],
    },
  })

  await Promise.all(records.map((record) => index.addAsync(record.id, record)))
  return { index, records }
}

function idsForField(
  results: DefaultDocumentSearchResults<SearchRecord>,
  field: "title" | "content" | "tags",
): number[] {
  const result = results.find((entry) => entry.field === field)
  return result ? ([...result.result] as number[]) : []
}

export async function searchKnowledge(
  engine: SearchEngine,
  query: string,
  limit = 200,
): Promise<SearchMatch[]> {
  const variants = expandSearchQuery(query)
  if (variants.length === 0) return []

  const matches = new Map<number, SearchMatch>()
  const fields: Array<"title" | "content" | "tags"> = ["title", "content", "tags"]
  for (const [variantIndex, variant] of variants.entries()) {
    const result = await engine.index.searchAsync({ query: variant, limit, index: fields })
    for (const [fieldIndex, field] of fields.entries()) {
      for (const [position, id] of idsForField(result, field).entries()) {
        const record = engine.records[id]
        if (!record) continue
        const score = 10_000 - variantIndex * 1_000 - fieldIndex * 250 - position
        const previous = matches.get(id)
        if (previous) {
          previous.score = Math.max(previous.score, score)
          if (!previous.matchedFields.includes(field)) previous.matchedFields.push(field)
        } else {
          matches.set(id, { ...record, score, matchedFields: [field] })
        }
      }
    }
  }

  return [...matches.values()].sort(
    (a, b) => b.score - a.score || a.title.localeCompare(b.title, "zh-CN"),
  )
}

export type HighlightSegment = { text: string; match: boolean }

export function highlightSegments(text: string, query: string): HighlightSegment[] {
  const terms = expandSearchQuery(query)
    .flatMap((term) => term.split(/\s+/))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
  if (terms.length === 0) return [{ text, match: false }]

  const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  const expression = new RegExp(`(${escaped.join("|")})`, "gi")
  return text
    .split(expression)
    .filter(Boolean)
    .map((part) => ({
      text: part,
      match: terms.some((term) => term.toLocaleLowerCase() === part.toLocaleLowerCase()),
    }))
}

export function excerptForQuery(text: string, query: string, maxLength = 220): string {
  const normalized = text.replace(/\s+/g, " ").trim()
  if (normalized.length <= maxLength) return normalized
  const terms = expandSearchQuery(query).flatMap((term) => term.split(/\s+/))
  const lower = normalized.toLocaleLowerCase()
  const indices = terms.map((term) => lower.indexOf(term.toLocaleLowerCase())).filter((i) => i >= 0)
  const matchIndex = indices.length > 0 ? Math.min(...indices) : 0
  const start = Math.max(0, matchIndex - Math.floor(maxLength * 0.35))
  const end = Math.min(normalized.length, start + maxLength)
  return `${start > 0 ? "…" : ""}${normalized.slice(start, end)}${end < normalized.length ? "…" : ""}`
}
