import { resolveKnowledgeReference } from "../util/knowledgeRelations"
import { LearningPathBranch, readLearningPathDefinition } from "../util/learningPath"
import {
  knowledgeMaturityLabels,
  knowledgeTopicLabels,
  knowledgeTypeLabels,
} from "../util/knowledgeMetadata"
import { FullSlug, resolveRelative } from "../util/path"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import style from "./styles/learningPath.scss"

const statusLabels = {
  draft: "草拟中",
  published: "已发布",
  archived: "已归档",
} as const

const maintenanceLabels = {
  maintained: "持续维护",
  "review-needed": "等待复核",
  paused: "暂停维护",
} as const

const LearningPath: QuartzComponent = ({ fileData, allFiles }: QuartzComponentProps) => {
  const path = readLearningPathDefinition(fileData.frontmatter?.learningPath)
  if (!path) return null

  const resolvedSteps = path.steps.map((step) => ({
    ...step,
    reference: resolveKnowledgeReference(allFiles, fileData, step.slug),
  }))
  const branchesByStep = new Map<string, LearningPathBranch[]>()
  for (const branch of path.branches) {
    const group = branchesByStep.get(branch.afterStep) ?? []
    group.push(branch)
    branchesByStep.set(branch.afterStep, group)
  }

  return (
    <div class="learning-path" data-learning-path={path.id}>
      <header class="learning-path-intro">
        <p class="learning-path-kicker">CURATED PATH / 人工策划路径</p>
        <p class="learning-path-outcome">{path.outcome}</p>
        <dl aria-label="学习路径概况">
          <div>
            <dt>主线步骤</dt>
            <dd>{path.steps.length}</dd>
          </div>
          <div>
            <dt>预计用时</dt>
            <dd>{path.estimatedTime ?? "未估算"}</dd>
          </div>
          <div>
            <dt>发布状态</dt>
            <dd>{statusLabels[path.status]}</dd>
          </div>
          <div>
            <dt>维护状态</dt>
            <dd>{maintenanceLabels[path.maintenance]}</dd>
          </div>
        </dl>
        {path.lastReviewed && <p class="learning-path-reviewed">最近复核 · {path.lastReviewed}</p>}
      </header>

      <section class="learning-path-orientation" aria-label="开始前说明">
        <div>
          <p class="learning-path-section-label">WHO / 适合谁</p>
          <ul>
            {path.audience.map((audience) => (
              <li>{audience}</li>
            ))}
          </ul>
        </div>
        <div>
          <p class="learning-path-section-label">BEFORE / 前置知识</p>
          <ul>
            {path.prerequisites.map((prerequisite) => {
              const resolved = prerequisite.slug
                ? resolveKnowledgeReference(allFiles, fileData, prerequisite.slug)
                : undefined
              return (
                <li>
                  {resolved?.target?.slug ? (
                    <a
                      class="internal"
                      href={resolveRelative(fileData.slug!, resolved.target.slug as FullSlug)}
                    >
                      {prerequisite.label}
                    </a>
                  ) : (
                    <strong>{prerequisite.label}</strong>
                  )}
                  {prerequisite.note && <span>{prerequisite.note}</span>}
                </li>
              )
            })}
          </ul>
        </div>
      </section>

      <section class="learning-path-sequence" aria-labelledby="learning-path-sequence-title">
        <header>
          <p class="learning-path-section-label">SEQUENCE / 主线顺序</p>
          <h2 id="learning-path-sequence-title">从基础走到方法选择</h2>
          <p>主线按依赖关系排列。可选分支用于对照或深化，跳过它不会阻断后续步骤。</p>
        </header>

        <ol class="learning-path-steps">
          {resolvedSteps.map((step, index) => {
            const target = step.reference.target
            const metadata = target?.knowledgeMetadata
            const branches = branchesByStep.get(step.id) ?? []
            return (
              <li data-reference-state={step.reference.state}>
                <div class="learning-path-step-position" aria-hidden="true">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <span>/ {String(path.steps.length).padStart(2, "0")}</span>
                </div>
                <article>
                  <div class="learning-path-step-meta">
                    <span>第 {index + 1} 步</span>
                    {step.duration && <span>{step.duration}</span>}
                    {metadata?.maturity && (
                      <span>{knowledgeMaturityLabels[metadata.maturity]}</span>
                    )}
                  </div>
                  <h3>
                    {target?.slug ? (
                      <a
                        class="internal"
                        href={resolveRelative(fileData.slug!, target.slug as FullSlug)}
                      >
                        {target.frontmatter?.title ?? step.slug}
                      </a>
                    ) : (
                      <span>{step.slug}</span>
                    )}
                  </h3>
                  {metadata?.primaryTopic && (
                    <p class="learning-path-step-classification">
                      {knowledgeTopicLabels[metadata.primaryTopic]} ·{" "}
                      {knowledgeTypeLabels[metadata.type]}
                    </p>
                  )}
                  <p>{step.purpose}</p>
                  <dl>
                    <dt>完成这一站后</dt>
                    <dd>{step.outcome}</dd>
                  </dl>
                  {!target && (
                    <p class="learning-path-missing">这条记录尚未公开，路径维护者需要补齐目标。</p>
                  )}
                </article>

                {branches.length > 0 && (
                  <aside
                    class="learning-path-branches"
                    aria-label={`第 ${index + 1} 步后的可选分支`}
                  >
                    <p>OPTIONAL / 可选分支</p>
                    {branches.map((branch) => {
                      const resolved = resolveKnowledgeReference(allFiles, fileData, branch.slug)
                      return (
                        <div>
                          <div>
                            <strong>{branch.label}</strong>
                            {branch.duration && <span>{branch.duration}</span>}
                          </div>
                          <p>{branch.reason}</p>
                          {resolved.target?.slug ? (
                            <a
                              class="internal"
                              href={resolveRelative(
                                fileData.slug!,
                                resolved.target.slug as FullSlug,
                              )}
                            >
                              {resolved.target.frontmatter?.title ?? branch.slug} →
                            </a>
                          ) : (
                            <span class="learning-path-missing">分支记录尚未公开</span>
                          )}
                        </div>
                      )
                    })}
                  </aside>
                )}
              </li>
            )
          })}
        </ol>
      </section>

      <footer class="learning-path-finish">
        <p class="learning-path-section-label">AFTER / 走完以后</p>
        <h2>带着模型边界回到真实问题</h2>
        <p>
          这条路径的终点不是“会运行一种软件”，而是能解释模型假设、判断适用尺度，并诚实说明结果的不确定性。
        </p>
        <a
          class="internal"
          href={resolveRelative(fileData.slug!, "topics/physics-optics/index" as FullSlug)}
        >
          继续浏览物理与光学主题 →
        </a>
      </footer>
    </div>
  )
}

LearningPath.css = style

export default (() => LearningPath) satisfies QuartzComponentConstructor
