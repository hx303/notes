export const knowledgeTopicLabels = {
  mathematics: "数学基础",
  "physics-optics": "物理与光学",
  "chemistry-materials": "化学与材料",
  "computing-simulation": "计算与仿真",
  "research-methods": "研究方法",
  "history-society": "历史与社会",
  "growth-practice": "成长与实践",
} as const

export const knowledgeTypeLabels = {
  concept: "概念与原理",
  "course-note": "课程笔记",
  "research-note": "研究记录",
  "literature-note": "文献解读",
  "lecture-note": "讲座笔记",
  "project-guide": "项目指南",
  reference: "速查与资料",
  "self-check": "自测",
} as const

export const knowledgeMaturityLabels = {
  seed: "萌芽",
  growing: "整理中",
  stable: "相对完整",
} as const

export type KnowledgeTopic = keyof typeof knowledgeTopicLabels
export type KnowledgeType = keyof typeof knowledgeTypeLabels
export type KnowledgeMaturity = keyof typeof knowledgeMaturityLabels

export type KnowledgeRelation = {
  slug: string
  reason?: string
}

export type KnowledgeSource = {
  title: string
  url?: string
  doi?: string
}

export type KnowledgeMetadata = {
  isStructured: boolean
  summary?: string
  primaryTopic?: KnowledgeTopic
  subtopic?: string
  topics: KnowledgeTopic[]
  type: KnowledgeType
  maturity: KnowledgeMaturity
  created?: string
  updated?: string
  prerequisites: string[]
  related: KnowledgeRelation[]
  sources: KnowledgeSource[]
  license: string
  publish: boolean
  commentKey: string
}

export type KnowledgeMetadataIssue = {
  field: string
  code: "missing" | "invalid" | "fallback"
  message: string
}

export type KnowledgeMetadataContext = {
  sourceSlug: string
  commentKey: string
}

type RawMetadata = Record<string, unknown>

const topicKeys = new Set(Object.keys(knowledgeTopicLabels) as KnowledgeTopic[])
const typeKeys = new Set(Object.keys(knowledgeTypeLabels) as KnowledgeType[])
const maturityKeys = new Set(Object.keys(knowledgeMaturityLabels) as KnowledgeMaturity[])

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function toArray(value: unknown): unknown[] {
  if (value === undefined || value === null || value === "") return []
  if (Array.isArray(value)) return value
  if (typeof value === "string") return value.split(",").map((item) => item.trim())
  return [value]
}

function normalizeStringList(value: unknown): string[] {
  return [
    ...new Set(
      toArray(value)
        .map(nonEmptyString)
        .filter((item): item is string => item !== undefined),
    ),
  ]
}

function normalizeDate(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value

  let normalized = value
  if (typeof normalized === "number" && normalized > 0 && normalized < 1_000_000_000_000) {
    normalized *= 1000
  }

  const date = normalized instanceof Date ? normalized : new Date(normalized as string | number)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10)
}

function inferTopic(raw: RawMetadata, sourceSlug: string): KnowledgeTopic | undefined {
  const hint = [sourceSlug, raw.title, raw.subject, raw.course, raw.topic]
    .filter((value) => value !== undefined && value !== null)
    .join(" ")
    .toLowerCase()

  if (/微积分|线性代数|数学|公式速查|闪卡自测|特征值|特征向量/.test(hint)) {
    return "mathematics"
  }
  if (/大学物理|量子|quantum|光学/.test(hint)) return "physics-optics"
  if (/有机化学|材料|钙钛矿|发光/.test(hint)) return "chemistry-materials"
  if (/comsol|rcwa|tmm|rayflare|计算机|仿真|科研项目/.test(hint)) {
    return "computing-simulation"
  }
  if (/管理面板|mermaid|学科能力功能指南/.test(hint)) return "computing-simulation"
  if (/科研笔记|文献|实验|研究|学术引用/.test(hint)) return "research-methods"
  if (
    /历史|近代史|发展史|军事|思政|社会|安全|文明|民族|革命|三民主义|戊戌|鸦片|两会|政策|华夷|天下|藏地/.test(
      hint,
    )
  ) {
    return "history-society"
  }
  if (/讲座|保研|选调|亲密关系|成长|视频笔记|游戏|首页|^index$|课堂笔记\/index/.test(hint)) {
    return "growth-practice"
  }
  return undefined
}

function inferType(sourceSlug: string): KnowledgeType {
  const hint = sourceSlug.toLowerCase()
  if (/闪卡|自测/.test(hint)) return "self-check"
  if (/公式速查|glossary|资料/.test(hint)) return "reference"
  if (/文献/.test(hint)) return "literature-note"
  if (/讲座/.test(hint)) return "lecture-note"
  if (/科研项目|指南|培训/.test(hint)) return "project-guide"
  if (/科研笔记|实验|研究/.test(hint)) return "research-note"
  if (/课堂笔记|微积分|线性代数|大学物理|有机化学/.test(hint)) return "course-note"
  return "concept"
}

function inferSubtopic(
  raw: RawMetadata,
  sourceSlug: string,
  primaryTopic?: KnowledgeTopic,
): string | undefined {
  const explicit = nonEmptyString(raw.subtopic)
  if (explicit) return explicit

  const hint = [sourceSlug, raw.title, raw.subject, raw.course, raw.topic, raw.chapter]
    .filter((value) => value !== undefined && value !== null)
    .join(" ")
    .toLowerCase()

  switch (primaryTopic) {
    case "mathematics":
      if (/线性代数/.test(hint)) return "线性代数"
      if (/微积分下|微积分（下）|重积分|曲线积分|级数|多元函数|空间解析几何/.test(hint)) {
        return "微积分下"
      }
      if (/微积分|极限|导数|积分/.test(hint)) return "微积分上"
      return "数学综合"
    case "physics-optics":
      if (/量子|quantum/.test(hint)) return "量子物理"
      if (/光学|rcwa|tmm|薄膜/.test(hint)) return "光学"
      if (/大学物理|力学|电磁|静电|刚体/.test(hint)) return "大学物理"
      return "物理综合"
    case "chemistry-materials":
      if (/有机化学|烷烃|芳香烃|对映|共轭/.test(hint)) return "有机化学"
      if (/钙钛矿|材料/.test(hint)) return "材料科学"
      return "化学综合"
    case "computing-simulation":
      if (/comsol/.test(hint)) return "COMSOL"
      if (/rcwa|tmm|rayflare|仿真/.test(hint)) return "科学计算与仿真"
      if (/mermaid|可视化/.test(hint)) return "可视化工具"
      return "计算工具"
    case "research-methods":
      if (/文献|引用|检索/.test(hint)) return "文献与引用"
      if (/实验/.test(hint)) return "实验方法"
      return "研究实践"
    case "history-society":
      if (/军事|安全/.test(hint)) return "军事与安全"
      if (/思政|社会/.test(hint)) return "思想与社会"
      return "历史"
    case "growth-practice":
      if (/讲座/.test(hint)) return "讲座记录"
      if (/保研|选调|职业/.test(hint)) return "学业与职业"
      return "个人实践"
    default:
      return undefined
  }
}

function normalizeType(
  value: unknown,
  sourceSlug: string,
  issues: KnowledgeMetadataIssue[],
): KnowledgeType {
  const candidate = nonEmptyString(value)
  if (candidate && typeKeys.has(candidate as KnowledgeType)) return candidate as KnowledgeType

  const fallback = inferType(sourceSlug)
  issues.push({
    field: "type",
    code: candidate ? "invalid" : "fallback",
    message: candidate
      ? `Unsupported type \"${candidate}\"; using inferred value \"${fallback}\".`
      : `Missing type; inferred \"${fallback}\" from the source path.`,
  })
  return fallback
}

function normalizeMaturity(value: unknown, issues: KnowledgeMetadataIssue[]): KnowledgeMaturity {
  const candidate = nonEmptyString(value)?.toLowerCase()
  if (candidate && maturityKeys.has(candidate as KnowledgeMaturity)) {
    return candidate as KnowledgeMaturity
  }

  const aliases: Record<string, KnowledgeMaturity> = {
    draft: "seed",
    wip: "growing",
    organizing: "growing",
    complete: "stable",
    completed: "stable",
    evergreen: "stable",
  }
  if (candidate && aliases[candidate]) return aliases[candidate]

  issues.push({
    field: "maturity",
    code: candidate ? "invalid" : "fallback",
    message: candidate
      ? `Unsupported maturity \"${candidate}\"; using \"seed\".`
      : 'Missing maturity; using the safe legacy default "seed".',
  })
  return "seed"
}

function normalizePublish(value: unknown, issues: KnowledgeMetadataIssue[]): boolean {
  if (typeof value === "boolean") return value
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    if (["true", "yes", "public", "1"].includes(normalized)) return true
    if (["false", "no", "private", "0"].includes(normalized)) return false
  }

  issues.push({
    field: "publish",
    code: value === undefined ? "fallback" : "invalid",
    message:
      value === undefined
        ? "Missing publish flag; preserving the legacy public-build behavior."
        : `Unsupported publish value \"${String(value)}\"; preserving the legacy public-build behavior.`,
  })
  return true
}

function normalizeRelations(value: unknown, issues: KnowledgeMetadataIssue[]): KnowledgeRelation[] {
  const relations: KnowledgeRelation[] = []
  for (const item of toArray(value)) {
    if (typeof item === "string" && item.trim()) {
      relations.push({ slug: item.trim() })
    } else if (item && typeof item === "object") {
      const raw = item as Record<string, unknown>
      const slug = nonEmptyString(raw.slug)
      if (slug) {
        relations.push({ slug, reason: nonEmptyString(raw.reason) })
      } else {
        issues.push({
          field: "related",
          code: "invalid",
          message: "Related entries must include a non-empty slug.",
        })
      }
    } else {
      issues.push({
        field: "related",
        code: "invalid",
        message: "Related entries must be a slug string or an object with slug/reason.",
      })
    }
  }
  return relations
}

function normalizeSources(value: unknown, issues: KnowledgeMetadataIssue[]): KnowledgeSource[] {
  const sources: KnowledgeSource[] = []
  for (const item of toArray(value)) {
    if (typeof item === "string" && item.trim()) {
      sources.push({ title: item.trim() })
    } else if (item && typeof item === "object") {
      const raw = item as Record<string, unknown>
      const title = nonEmptyString(raw.title)
      const url = nonEmptyString(raw.url)
      const doi = nonEmptyString(raw.doi)
      if (title || url || doi) {
        sources.push({ title: title ?? doi ?? url!, url, doi })
      } else {
        issues.push({
          field: "sources",
          code: "invalid",
          message: "Source entries must include title, url, or doi.",
        })
      }
    } else {
      issues.push({
        field: "sources",
        code: "invalid",
        message: "Source entries must be text or an object with title/url/doi.",
      })
    }
  }
  return sources
}

function usesStructuredMetadata(raw: RawMetadata): boolean {
  return [
    "canonicalSlug",
    "commentKey",
    "primaryTopic",
    "topics",
    "type",
    "maturity",
    "summary",
    "license",
    "publish",
  ].some((field) => raw[field] !== undefined)
}

export function normalizeKnowledgeMetadata(
  raw: RawMetadata,
  context: KnowledgeMetadataContext,
): { metadata: KnowledgeMetadata; issues: KnowledgeMetadataIssue[] } {
  const issues: KnowledgeMetadataIssue[] = []
  const isStructured = usesStructuredMetadata(raw)

  const rawPrimaryTopic = nonEmptyString(raw.primaryTopic)
  let primaryTopic: KnowledgeTopic | undefined
  if (rawPrimaryTopic && topicKeys.has(rawPrimaryTopic as KnowledgeTopic)) {
    primaryTopic = rawPrimaryTopic as KnowledgeTopic
  } else {
    primaryTopic = inferTopic(raw, context.sourceSlug)
    issues.push({
      field: "primaryTopic",
      code: rawPrimaryTopic ? "invalid" : "fallback",
      message: rawPrimaryTopic
        ? `Unsupported primaryTopic \"${rawPrimaryTopic}\"${primaryTopic ? `; inferred \"${primaryTopic}\".` : "."}`
        : primaryTopic
          ? `Missing primaryTopic; inferred \"${primaryTopic}\" from legacy metadata.`
          : "Missing primaryTopic and no safe legacy inference was available.",
    })
  }

  const topics: KnowledgeTopic[] = []
  if (primaryTopic) topics.push(primaryTopic)
  for (const item of normalizeStringList(raw.topics)) {
    if (topicKeys.has(item as KnowledgeTopic)) {
      if (!topics.includes(item as KnowledgeTopic)) topics.push(item as KnowledgeTopic)
    } else {
      issues.push({
        field: "topics",
        code: "invalid",
        message: `Unsupported topic \"${item}\"; the value was ignored.`,
      })
    }
  }

  const summary = nonEmptyString(raw.summary) ?? nonEmptyString(raw.description)
  if (!summary) {
    issues.push({
      field: "summary",
      code: "missing",
      message: "Missing summary and description; no article summary can be shown.",
    })
  } else if (!nonEmptyString(raw.summary)) {
    issues.push({
      field: "summary",
      code: "fallback",
      message: "Missing summary; using description as the legacy fallback.",
    })
  }

  const created = normalizeDate(raw.created ?? raw.date)
  if ((raw.created ?? raw.date) !== undefined && !created) {
    issues.push({
      field: "created",
      code: "invalid",
      message: `Invalid created/date value \"${String(raw.created ?? raw.date)}\".`,
    })
  }

  const rawUpdated = raw.updated ?? raw.modified ?? raw["last-modified"] ?? raw.lastmod
  const updated = normalizeDate(rawUpdated) ?? created
  if (rawUpdated !== undefined && !normalizeDate(rawUpdated)) {
    issues.push({
      field: "updated",
      code: "invalid",
      message: `Invalid updated/modified value \"${String(rawUpdated)}\"; using created date.`,
    })
  }

  const license = nonEmptyString(raw.license) ?? "未声明许可"
  if (!nonEmptyString(raw.license)) {
    issues.push({
      field: "license",
      code: "fallback",
      message: 'Missing license; using the explicit fallback "未声明许可".',
    })
  }

  const metadata: KnowledgeMetadata = {
    isStructured,
    summary,
    primaryTopic,
    subtopic: inferSubtopic(raw, context.sourceSlug, primaryTopic),
    topics,
    type: normalizeType(raw.type, context.sourceSlug, issues),
    maturity: normalizeMaturity(raw.maturity ?? raw.status, issues),
    created,
    updated,
    prerequisites: normalizeStringList(raw.prerequisites),
    related: normalizeRelations(raw.related, issues),
    sources: normalizeSources(raw.sources ?? raw.source, issues),
    license,
    publish: normalizePublish(raw.publish, issues),
    commentKey: nonEmptyString(raw.commentKey) ?? context.commentKey,
  }

  return { metadata, issues }
}

export function actionableKnowledgeIssues(
  metadata: KnowledgeMetadata,
  issues: KnowledgeMetadataIssue[],
): KnowledgeMetadataIssue[] {
  return metadata.isStructured ? issues : []
}

export function formatKnowledgeIssue(sourceSlug: string, issue: KnowledgeMetadataIssue): string {
  return `[knowledge-metadata] ${sourceSlug}: ${issue.field} (${issue.code}) — ${issue.message}`
}
