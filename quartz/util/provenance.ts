import type { QuartzPluginData } from "../plugins/vfile"
import type { FullSlug } from "./path"

export type RevisionEvent = {
  kind: "created" | "updated"
  date: Date
  label: string
  description: string
}

export const toValidDate = (value: unknown): Date | undefined => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value !== "string" && typeof value !== "number") return undefined
  const normalized =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? undefined : date
}

export function canonicalPageUrl(baseUrl: string | undefined, slug: FullSlug): string {
  const host = baseUrl?.trim() || "wouldkeep.com"
  const origin = /^https?:\/\//i.test(host) ? host : `https://${host}`
  const normalizedOrigin = origin.endsWith("/") ? origin : `${origin}/`
  const path = slug === "index" ? "" : slug.replace(/^\/+/, "")
  return new URL(path, normalizedOrigin).toString()
}

export function buildSuggestedCitation({
  author,
  title,
  date,
  url,
}: {
  author?: string
  title: string
  date?: Date
  url: string
}) {
  const name = author?.trim() || "夔嵬"
  const dateText = date
    ? [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
      ].join("-")
    : "日期不详"
  return `${name}.《${title}》. wouldkeep，${dateText}. ${url}`
}

export function buildRevisionEvents(fileData: QuartzPluginData): RevisionEvent[] {
  const knowledge = fileData.knowledgeMetadata
  const created = toValidDate(knowledge?.created) ?? toValidDate(fileData.dates?.created)
  const updated = toValidDate(knowledge?.updated) ?? toValidDate(fileData.dates?.modified)
  const events: RevisionEvent[] = []

  if (created) {
    events.push({
      kind: "created",
      date: created,
      label: "创建记录",
      description: "这篇知识记录首次进入公开档案。",
    })
  }
  if (
    updated &&
    (!created || updated.toISOString().slice(0, 10) !== created.toISOString().slice(0, 10))
  ) {
    events.push({
      kind: "updated",
      date: updated,
      label: "最近修订",
      description: "正文或知识关系在此日期有过更新。",
    })
  }
  return events.sort((a, b) => a.date.getTime() - b.date.getTime())
}

export function safeSourceHref(source: { url?: string; doi?: string }): string | undefined {
  const candidate = source.doi
    ? `https://doi.org/${source.doi.replace(/^https?:\/\/doi\.org\//i, "")}`
    : source.url
  if (!candidate) return undefined
  try {
    const url = new URL(candidate)
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : undefined
  } catch {
    return undefined
  }
}
