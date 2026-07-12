import type { FullSlug } from "./path"
import {
  KnowledgeMetadata,
  KnowledgeTopic,
  KnowledgeType,
  knowledgeTopicLabels,
  knowledgeTypeLabels,
} from "./knowledgeMetadata"

export type KnowledgeDirectoryView = "topic" | "type"

export type KnowledgeCatalogEntry = {
  slug: FullSlug
  filePath: string
  title: string
  knowledgeMetadata?: KnowledgeMetadata
}

export type KnowledgeCatalogRecord = {
  kind: "record"
  id: string
  label: string
  slug: FullSlug
}

export type KnowledgeCatalogGroup = {
  kind: "group"
  id: string
  label: string
  children: KnowledgeCatalogNode[]
}

export type KnowledgeCatalogNode = KnowledgeCatalogGroup | KnowledgeCatalogRecord

const structuralRoots = new Set(["build", "map", "paths", "search", "topics"])
const fallbackTopic = "unclassified"

function isKnowledgeRecord(entry: KnowledgeCatalogEntry): boolean {
  const root = entry.slug.split("/")[0]
  return !structuralRoots.has(root) && entry.knowledgeMetadata?.publish !== false
}

function compareLabels(a: { label: string }, b: { label: string }): number {
  return a.label.localeCompare(b.label, "zh-CN", { numeric: true, sensitivity: "base" })
}

function record(entry: KnowledgeCatalogEntry): KnowledgeCatalogRecord {
  return { kind: "record", id: `record:${entry.slug}`, label: entry.title, slug: entry.slug }
}

function topicLabel(topic: KnowledgeTopic | typeof fallbackTopic): string {
  return topic === fallbackTopic ? "待归类" : knowledgeTopicLabels[topic]
}

export function knowledgeDirectoryEntries(
  entries: KnowledgeCatalogEntry[],
): KnowledgeCatalogEntry[] {
  const unique = new Map<FullSlug, KnowledgeCatalogEntry>()
  for (const entry of entries) {
    if (isKnowledgeRecord(entry)) unique.set(entry.slug, entry)
  }
  return [...unique.values()]
}

export function buildKnowledgeCatalog(
  entries: KnowledgeCatalogEntry[],
  view: KnowledgeDirectoryView,
): KnowledgeCatalogGroup[] {
  const records = knowledgeDirectoryEntries(entries)

  if (view === "type") {
    const byType = new Map<KnowledgeType, KnowledgeCatalogEntry[]>()
    for (const entry of records) {
      const type = entry.knowledgeMetadata?.type ?? "concept"
      const group = byType.get(type) ?? []
      group.push(entry)
      byType.set(type, group)
    }

    return (Object.keys(knowledgeTypeLabels) as KnowledgeType[])
      .filter((type) => byType.has(type))
      .map((type) => ({
        kind: "group" as const,
        id: `type:${type}`,
        label: knowledgeTypeLabels[type],
        children: byType.get(type)!.map(record).sort(compareLabels),
      }))
  }

  const byTopic = new Map<KnowledgeTopic | typeof fallbackTopic, KnowledgeCatalogEntry[]>()
  for (const entry of records) {
    const topic = entry.knowledgeMetadata?.primaryTopic ?? fallbackTopic
    const group = byTopic.get(topic) ?? []
    group.push(entry)
    byTopic.set(topic, group)
  }

  const topicOrder: Array<KnowledgeTopic | typeof fallbackTopic> = [
    ...(Object.keys(knowledgeTopicLabels) as KnowledgeTopic[]),
    fallbackTopic,
  ]

  return topicOrder
    .filter((topic) => byTopic.has(topic))
    .map((topic) => {
      const bySubtopic = new Map<string, KnowledgeCatalogEntry[]>()
      for (const entry of byTopic.get(topic)!) {
        const subtopic = entry.knowledgeMetadata?.subtopic ?? "综合"
        const group = bySubtopic.get(subtopic) ?? []
        group.push(entry)
        bySubtopic.set(subtopic, group)
      }

      const children: KnowledgeCatalogGroup[] = [...bySubtopic].map(([subtopic, items]) => ({
        kind: "group",
        id: `topic:${topic}:subtopic:${subtopic}`,
        label: subtopic,
        children: items.map(record).sort(compareLabels),
      }))
      children.sort(compareLabels)

      return {
        kind: "group" as const,
        id: `topic:${topic}`,
        label: topicLabel(topic),
        children,
      }
    })
}

export function flattenKnowledgeCatalog(groups: KnowledgeCatalogGroup[]): KnowledgeCatalogRecord[] {
  const records: KnowledgeCatalogRecord[] = []
  const visit = (node: KnowledgeCatalogNode) => {
    if (node.kind === "record") records.push(node)
    else node.children.forEach(visit)
  }
  groups.forEach(visit)
  return records
}
