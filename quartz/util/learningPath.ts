export type LearningPathStatus = "draft" | "published" | "archived"
export type LearningPathMaintenance = "maintained" | "review-needed" | "paused"

export type LearningPathRequirement = {
  label: string
  slug?: string
  note?: string
}

export type LearningPathStep = {
  id: string
  slug: string
  purpose: string
  outcome: string
  duration?: string
}

export type LearningPathBranch = {
  id: string
  afterStep: string
  slug: string
  label: string
  reason: string
  duration?: string
}

export type LearningPathDefinition = {
  id: string
  status: LearningPathStatus
  maintenance: LearningPathMaintenance
  lastReviewed?: string
  audience: string[]
  outcome: string
  estimatedTime?: string
  prerequisites: LearningPathRequirement[]
  steps: LearningPathStep[]
  branches: LearningPathBranch[]
}

const statuses = new Set<LearningPathStatus>(["draft", "published", "archived"])
const maintenanceStates = new Set<LearningPathMaintenance>([
  "maintained",
  "review-needed",
  "paused",
])

function stringValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function stringList(value: unknown): string[] {
  const items = Array.isArray(value) ? value : value === undefined ? [] : [value]
  return items.map(stringValue).filter((item): item is string => item !== undefined)
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function requirements(value: unknown): LearningPathRequirement[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (typeof item === "string" && item.trim()) return [{ label: item.trim() }]
    const raw = objectValue(item)
    const label = stringValue(raw?.label)
    if (!raw || !label) return []
    return [{ label, slug: stringValue(raw.slug), note: stringValue(raw.note) }]
  })
}

function steps(value: unknown): LearningPathStep[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item, index) => {
    const raw = objectValue(item)
    const slug = stringValue(raw?.slug)
    if (!raw || !slug) return []
    return [
      {
        id: stringValue(raw.id) ?? `step-${index + 1}`,
        slug,
        purpose: stringValue(raw.purpose) ?? "阅读并理解这条知识记录。",
        outcome: stringValue(raw.outcome) ?? "能够说明这一步的核心概念。",
        duration: stringValue(raw.duration),
      },
    ]
  })
}

function branches(value: unknown): LearningPathBranch[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item, index) => {
    const raw = objectValue(item)
    const slug = stringValue(raw?.slug)
    const afterStep = stringValue(raw?.afterStep)
    const label = stringValue(raw?.label)
    if (!raw || !slug || !afterStep || !label) return []
    return [
      {
        id: stringValue(raw.id) ?? `branch-${index + 1}`,
        afterStep,
        slug,
        label,
        reason: stringValue(raw.reason) ?? "这是一条可选的深化分支。",
        duration: stringValue(raw.duration),
      },
    ]
  })
}

export function readLearningPathDefinition(value: unknown): LearningPathDefinition | undefined {
  const raw = objectValue(value)
  const id = stringValue(raw?.id)
  const outcome = stringValue(raw?.outcome)
  if (!raw || !id || !outcome) return undefined

  const statusValue = stringValue(raw.status) as LearningPathStatus | undefined
  const maintenanceValue = stringValue(raw.maintenance) as LearningPathMaintenance | undefined
  const parsedSteps = steps(raw.steps)
  if (parsedSteps.length === 0) return undefined

  return {
    id,
    status: statusValue && statuses.has(statusValue) ? statusValue : "draft",
    maintenance:
      maintenanceValue && maintenanceStates.has(maintenanceValue)
        ? maintenanceValue
        : "review-needed",
    lastReviewed: stringValue(raw.lastReviewed),
    audience: stringList(raw.audience),
    outcome,
    estimatedTime: stringValue(raw.estimatedTime),
    prerequisites: requirements(raw.prerequisites),
    steps: parsedSteps,
    branches: branches(raw.branches),
  }
}
