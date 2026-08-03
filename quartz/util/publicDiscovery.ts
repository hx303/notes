export type PublicDiscoveryCandidate = {
  slug?: string | null
  title?: unknown
  frontmatter?: { title?: unknown; publish?: unknown } | null
  publish?: unknown
  knowledgeMetadata?: { publish?: unknown } | null
}

const systemRoots = new Set([
  "account",
  "admin",
  "about",
  "build",
  "capture",
  "changes",
  "knowledge",
  "license",
  "map",
  "paths",
  "privacy",
  "search",
  "tags",
  "topics",
  "workspace",
  "⚙️ 管理",
  "⚙️-管理",
])

function normalizedSlug(value: string | null | undefined): string | undefined {
  const slug = value?.trim().replace(/^\/+|\/+$/g, "")
  return slug ? slug : undefined
}

export function isPublicDiscoveryRecord(candidate: PublicDiscoveryCandidate): boolean {
  const slug = normalizedSlug(candidate.slug)
  if (!slug || slug === "index" || slug === "404") return false

  const root = slug.split("/", 1)[0].toLocaleLowerCase("en-US")
  if (systemRoots.has(root)) return false
  if (isExplicitlyPrivateRecord(candidate)) return false

  const title = candidate.title ?? candidate.frontmatter?.title
  return typeof title === "string" && title.trim().length > 0
}

export function publicDiscoveryEntries<T extends PublicDiscoveryCandidate>(
  records: Record<string, T>,
): Array<[string, T]> {
  return Object.entries(records).filter(([slug, candidate]) =>
    isPublicDiscoveryRecord({
      ...candidate,
      slug,
    }),
  )
}

export function isExplicitlyPrivateRecord(candidate: PublicDiscoveryCandidate): boolean {
  return (
    candidate.publish === false ||
    candidate.frontmatter?.publish === false ||
    candidate.knowledgeMetadata?.publish === false
  )
}
