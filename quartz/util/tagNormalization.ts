/** Canonical tag vocabulary. Legacy spellings remain valid URLs, but resolve to the same result set. */
const synonyms: Record<string, string> = {
  ai: "人工智能",
  "artificial-intelligence": "人工智能",
  machinelearning: "机器学习",
  "machine-learning": "机器学习",
  ml: "机器学习",
  physics: "物理",
  optics: "光学",
  math: "数学",
  mathematics: "数学",
  programming: "编程",
  coding: "编程",
}

export function normalizeTag(tag: string): string {
  const normalized = tag.trim().toLowerCase().replace(/_/g, "-")
  return synonyms[normalized] ?? normalized
}

export function normalizeTags(tags: readonly string[] | undefined): string[] {
  return [...new Set((tags ?? []).map(normalizeTag).filter(Boolean))]
}

export function tagsMatch(left: string, right: string): boolean {
  return normalizeTag(left) === normalizeTag(right)
}

export const tagSynonyms = synonyms
