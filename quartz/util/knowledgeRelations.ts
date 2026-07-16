import type { QuartzPluginData } from "../plugins/vfile"
import { SimpleSlug, simplifySlug } from "./path"
import { readLearningPathDefinition } from "./learningPath"

export type ResolvedKnowledgeReference = {
  reference: string
  target?: QuartzPluginData
  state: "resolved" | "missing" | "self"
}

export type PathMembership = {
  path: QuartzPluginData
  position: number
  total: number
  kind: "core" | "optional"
  stepTitle?: string
}

export type IncomingKnowledgeLink = {
  source: QuartzPluginData
  kind: "citation" | "mention"
}

const safelyDecoded = (value: string) => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

const normalized = (value: string) =>
  safelyDecoded(value)
    .trim()
    .replace(/^https?:\/\/[^/]+\//, "")
    .replace(/^\.?\//, "")
    .replace(/\.md$/i, "")
    .replace(/\/$/, "")
    .split("#")[0]
    .toLocaleLowerCase()

const fileReferences = (file: QuartzPluginData) => {
  const references = new Set<string>()
  if (file.slug) references.add(normalized(simplifySlug(file.slug)))
  if (file.sourceSlug) references.add(normalized(simplifySlug(file.sourceSlug)))
  for (const alias of file.aliases ?? []) references.add(normalized(simplifySlug(alias)))
  const title = file.frontmatter?.title
  if (title) references.add(normalized(String(title)))
  return references
}

export function resolveKnowledgeReference(
  allFiles: QuartzPluginData[],
  current: QuartzPluginData,
  reference: string,
): ResolvedKnowledgeReference {
  const needle = normalized(reference)
  const target = allFiles.find((file) => fileReferences(file).has(needle))
  if (!target) return { reference, state: "missing" }

  const currentSlug = current.slug ? simplifySlug(current.slug) : undefined
  const targetSlug = target.slug ? simplifySlug(target.slug) : undefined
  return {
    reference,
    target,
    state: currentSlug && targetSlug === currentSlug ? "self" : "resolved",
  }
}

const explicitReferences = (file: QuartzPluginData) => [
  ...(file.knowledgeMetadata?.prerequisites ?? []),
  ...(file.knowledgeMetadata?.related ?? []).map((relation) => relation.slug),
]

const pointsTo = (
  source: QuartzPluginData,
  target: QuartzPluginData,
  allFiles: QuartzPluginData[],
) =>
  explicitReferences(source).some(
    (reference) =>
      resolveKnowledgeReference(allFiles, source, reference).target?.slug === target.slug,
  )

export function isBidirectionalRelation(
  current: QuartzPluginData,
  target: QuartzPluginData,
  allFiles: QuartzPluginData[],
) {
  return pointsTo(target, current, allFiles)
}

export function findPathMemberships(
  current: QuartzPluginData,
  allFiles: QuartzPluginData[],
): PathMembership[] {
  if (!current.slug) return []
  const currentSlug = simplifySlug(current.slug)

  return allFiles.flatMap((file) => {
    if (!file.slug || !simplifySlug(file.slug).startsWith("paths/")) return []
    const definition = readLearningPathDefinition(file.frontmatter?.learningPath)
    if (definition) {
      const coreMemberships: PathMembership[] = definition.steps.flatMap((step, index) => {
        const target = resolveKnowledgeReference(allFiles, file, step.slug).target
        return target?.slug === current.slug
          ? [
              {
                path: file,
                position: index + 1,
                total: definition.steps.length,
                kind: "core" as const,
                stepTitle: step.purpose,
              },
            ]
          : []
      })
      const optionalMemberships: PathMembership[] = definition.branches.flatMap((branch) => {
        const target = resolveKnowledgeReference(allFiles, file, branch.slug).target
        const afterIndex = definition.steps.findIndex((step) => step.id === branch.afterStep)
        return target?.slug === current.slug
          ? [
              {
                path: file,
                position: Math.max(afterIndex + 1, 1),
                total: definition.steps.length,
                kind: "optional" as const,
                stepTitle: branch.label,
              },
            ]
          : []
      })
      return [...coreMemberships, ...optionalMemberships]
    }

    const links = [...new Set(file.links ?? [])]
    const position = links.findIndex((link) => link === currentSlug)
    if (position < 0) return []
    return [
      {
        path: file,
        position: position + 1,
        total: links.length,
        kind: "core" as const,
      },
    ]
  })
}

export function classifyIncomingKnowledgeLinks(
  current: QuartzPluginData,
  allFiles: QuartzPluginData[],
): IncomingKnowledgeLink[] {
  if (!current.slug) return []
  const slug = simplifySlug(current.slug) as SimpleSlug

  return allFiles
    .filter(
      (file) =>
        file.slug !== current.slug &&
        (file.links?.includes(slug) || pointsTo(file, current, allFiles)),
    )
    .map((source) => ({
      source,
      kind: pointsTo(source, current, allFiles) ? ("citation" as const) : ("mention" as const),
    }))
    .sort((a, b) =>
      String(a.source.frontmatter?.title ?? a.source.slug).localeCompare(
        String(b.source.frontmatter?.title ?? b.source.slug),
        "zh-CN",
      ),
    )
}
