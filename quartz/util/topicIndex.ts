import type { QuartzPluginData } from "../plugins/vfile"
import type { FullSlug } from "./path"
import { KnowledgeTopic, knowledgeTopicLabels } from "./knowledgeMetadata"

export type TopicDefinition = {
  key: KnowledgeTopic
  scope: string
  pathName: string
  recommendedCandidates: FullSlug[]
}

export type TopicSubtopic = {
  label: string
  count: number
}

export type TopicSummary = TopicDefinition & {
  label: string
  count: number
  subtopics: TopicSubtopic[]
  recommended?: QuartzPluginData
}

export type TopicConnection = {
  key: KnowledgeTopic
  label: string
  count: number
}

export type TopicPageData = TopicSummary & {
  records: QuartzPluginData[]
  primaryCount: number
  contextualCount: number
  connections: TopicConnection[]
}

export const topicDefinitions: TopicDefinition[] = [
  {
    key: "mathematics",
    scope: "从极限、微积分到线性代数与空间几何，建立解释连续变化和结构关系的数学语言。",
    pathName: "微积分与线性代数基础",
    recommendedCandidates: [
      "📖-课堂笔记/微积分上/index" as FullSlug,
      "公式速查/微积分公式速查" as FullSlug,
    ],
  },
  {
    key: "physics-optics",
    scope: "连接力学、电磁学、量子概念与光学模型，理解自然规律如何进入可计算的问题。",
    pathName: "从物理到光学建模",
    recommendedCandidates: [
      "📖-课堂笔记/大学物理/大学物理-绪论+第一章-质点的运动（完整版）" as FullSlug,
      "📖-课堂笔记/大学物理/index" as FullSlug,
    ],
  },
  {
    key: "chemistry-materials",
    scope: "从有机结构与反应出发，延伸到钙钛矿等材料的组成、性质、表征和应用。",
    pathName: "有机化学与材料认识",
    recommendedCandidates: [
      "📖-课堂笔记/有机化学/第十五章_有机化合物和有机化学" as FullSlug,
      "📖-课堂笔记/有机化学/index" as FullSlug,
    ],
  },
  {
    key: "computing-simulation",
    scope: "把模型转化为可运行的方法，覆盖科学计算、COMSOL、TMM、RCWA 与可视化工具。",
    pathName: "COMSOL 与光学仿真实践",
    recommendedCandidates: [
      "notes/rcwa-from-zero" as FullSlug,
      "📖-课堂笔记/COMSOL-基础培训/01-基本建模流程" as FullSlug,
    ],
  },
  {
    key: "research-methods",
    scope: "围绕检索、引用、实验、文献解读和研究记录，保留从证据到判断的过程。",
    pathName: "从检索到研究记录",
    recommendedCandidates: ["学术引用功能演示" as FullSlug, "📚-文献检索/index" as FullSlug],
  },
  {
    key: "history-society",
    scope: "从中华文明、近现代转型、民族关系与公共议题理解历史进程和社会结构。",
    pathName: "中国近现代与民族关系",
    recommendedCandidates: [
      "📖-课堂笔记/中华民族发展史/中华文明起源" as FullSlug,
      "📖-课堂笔记/中国近代史/index" as FullSlug,
    ],
  },
  {
    key: "growth-practice",
    scope: "记录学业选择、职业准备、工具边界与个人实践，把经验转化为可复用的方法。",
    pathName: "学业与个人实践",
    recommendedCandidates: [
      "🎓-讲座笔记/AIGC使用边界指南笔记" as FullSlug,
      "🎓-讲座笔记/2027各省选调生考试全攻略" as FullSlug,
    ],
  },
]

const structuralRoots = new Set(["build", "map", "paths", "search", "topics"])

export function isPublicKnowledgeRecord(file: QuartzPluginData): boolean {
  if (!file.slug) return false
  const root = file.slug.split("/")[0]
  return !structuralRoots.has(root) && file.knowledgeMetadata?.publish !== false
}

export function buildTopicSummaries(allFiles: QuartzPluginData[]): TopicSummary[] {
  const records = allFiles.filter(isPublicKnowledgeRecord)

  return topicDefinitions.map((definition) => {
    const topicRecords = records.filter(
      (file) => file.knowledgeMetadata?.primaryTopic === definition.key,
    )
    const subtopicCounts = new Map<string, number>()
    for (const file of topicRecords) {
      const label = file.knowledgeMetadata?.subtopic ?? "综合"
      subtopicCounts.set(label, (subtopicCounts.get(label) ?? 0) + 1)
    }

    const subtopics = [...subtopicCounts]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "zh-CN"))

    const recommended =
      definition.recommendedCandidates
        .map((slug) => topicRecords.find((file) => file.slug === slug))
        .find((file) => file !== undefined) ??
      [...topicRecords].sort((a, b) => {
        const aIsIndex = a.slug?.endsWith("/index") || a.slug === "index" ? 1 : 0
        const bIsIndex = b.slug?.endsWith("/index") || b.slug === "index" ? 1 : 0
        return (
          aIsIndex - bIsIndex ||
          (a.frontmatter?.title ?? "").localeCompare(b.frontmatter?.title ?? "", "zh-CN")
        )
      })[0]

    return {
      ...definition,
      label: knowledgeTopicLabels[definition.key],
      count: topicRecords.length,
      subtopics,
      recommended,
    }
  })
}

export function getTopicDefinition(key: string): TopicDefinition | undefined {
  return topicDefinitions.find((definition) => definition.key === key)
}

export function buildTopicPageData(
  allFiles: QuartzPluginData[],
  key: KnowledgeTopic,
): TopicPageData | undefined {
  const summary = buildTopicSummaries(allFiles).find((topic) => topic.key === key)
  if (!summary) return undefined

  const records = allFiles
    .filter(isPublicKnowledgeRecord)
    .filter((file) => file.knowledgeMetadata?.topics.includes(key))
    .filter((file, index, list) => list.findIndex((item) => item.slug === file.slug) === index)
    .sort((a, b) => (a.frontmatter?.title ?? "").localeCompare(b.frontmatter?.title ?? "", "zh-CN"))

  const connectionCounts = new Map<KnowledgeTopic, number>()
  for (const record of records) {
    for (const topic of record.knowledgeMetadata?.topics ?? []) {
      if (topic !== key) connectionCounts.set(topic, (connectionCounts.get(topic) ?? 0) + 1)
    }
  }

  const connections = [...connectionCounts]
    .map(([topicKey, count]) => ({
      key: topicKey,
      label: knowledgeTopicLabels[topicKey],
      count,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "zh-CN"))

  const primaryCount = records.filter((file) => file.knowledgeMetadata?.primaryTopic === key).length

  return {
    ...summary,
    records,
    primaryCount,
    contextualCount: records.length - primaryCount,
    connections,
  }
}
