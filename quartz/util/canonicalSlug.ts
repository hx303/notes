import matter from "gray-matter"
import path from "path"
import { readFile } from "fs/promises"
import { FilePath, FullSlug, isFullSlug, slugifyFilePath } from "./path"

export type CanonicalSlugMap = Record<string, FullSlug>

export type CanonicalSlugSource = {
  filePath: FilePath
  canonicalSlug?: unknown
}

const canonicalNotePattern = /^notes\/[a-z0-9]+(?:-[a-z0-9]+)*$/

export function normalizeCanonicalSlug(value: unknown): FullSlug | undefined {
  if (value === undefined || value === null || value === "") return undefined
  if (typeof value !== "string") {
    throw new Error("canonicalSlug must be a string")
  }

  const normalized = value.trim().replace(/^\/+|\/+$/g, "")
  if (!isFullSlug(normalized) || !canonicalNotePattern.test(normalized)) {
    throw new Error(
      `Invalid canonicalSlug \"${value}\". Expected notes/<stable-kebab-case-slug> without a leading slash.`,
    )
  }

  return normalized
}

export function createCanonicalSlugMap(sources: CanonicalSlugSource[]): CanonicalSlugMap {
  const physicalOwners = new Map<FullSlug, FilePath>()
  for (const source of sources) {
    const physicalSlug = slugifyFilePath(source.filePath)
    physicalOwners.set(physicalSlug, source.filePath)
  }

  const canonicalOwners = new Map<FullSlug, FilePath>()
  const mappings: CanonicalSlugMap = {}

  for (const source of sources) {
    const physicalSlug = slugifyFilePath(source.filePath)
    const canonicalSlug = normalizeCanonicalSlug(source.canonicalSlug)
    if (!canonicalSlug || canonicalSlug === physicalSlug) continue

    const physicalOwner = physicalOwners.get(canonicalSlug)
    if (physicalOwner && physicalOwner !== source.filePath) {
      throw new Error(
        `canonicalSlug collision: ${source.filePath} targets ${canonicalSlug}, which is already the physical URL for ${physicalOwner}`,
      )
    }

    const canonicalOwner = canonicalOwners.get(canonicalSlug)
    if (canonicalOwner && canonicalOwner !== source.filePath) {
      throw new Error(
        `canonicalSlug collision: ${source.filePath} and ${canonicalOwner} both target ${canonicalSlug}`,
      )
    }

    canonicalOwners.set(canonicalSlug, source.filePath)
    mappings[physicalSlug] = canonicalSlug
  }

  return mappings
}

export async function loadCanonicalSlugMap(
  contentDirectory: string,
  relativeMarkdownPaths: FilePath[],
): Promise<CanonicalSlugMap> {
  const sources = await Promise.all(
    relativeMarkdownPaths.map(async (filePath) => {
      const source = await readFile(path.join(contentDirectory, filePath), "utf8")
      const { data } = matter(source)
      return { filePath, canonicalSlug: data.canonicalSlug } satisfies CanonicalSlugSource
    }),
  )

  return createCanonicalSlugMap(sources)
}

export function collectSlugs(
  filePaths: FilePath[],
  canonicalSlugMap: CanonicalSlugMap,
): FullSlug[] {
  return [
    ...new Set([
      ...filePaths.map((filePath) => slugifyFilePath(filePath)),
      ...Object.values(canonicalSlugMap),
    ]),
  ]
}

export function resolveCanonicalSlug(slug: FullSlug, canonicalSlugMap: CanonicalSlugMap): FullSlug {
  return canonicalSlugMap[slug] ?? slug
}
