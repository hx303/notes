import { knowledgeTopicLabels } from "../util/knowledgeMetadata"
import {
  findPathMemberships,
  isBidirectionalRelation,
  resolveKnowledgeReference,
} from "../util/knowledgeRelations"
import { FullSlug, resolveRelative } from "../util/path"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import style from "./styles/relatedKnowledge.scss"

const RelatedKnowledge: QuartzComponent = ({ fileData, allFiles }: QuartzComponentProps) => {
  const knowledge = fileData.knowledgeMetadata
  const paths = findPathMemberships(fileData, allFiles)
  if (!knowledge?.isStructured && paths.length === 0) return null

  const related = (knowledge?.related ?? []).map((relation) => ({
    ...relation,
    resolved: resolveKnowledgeReference(allFiles, fileData, relation.slug),
  }))
  const visible = related.filter(({ resolved }) => resolved.state !== "self")
  const selfRelations = related.filter(({ resolved }) => resolved.state === "self")

  return (
    <section class="related-knowledge" aria-labelledby="related-knowledge-title">
      <header class="related-knowledge-heading">
        <p class="relation-eyebrow">CONTINUE</p>
        <h2 id="related-knowledge-title">继续探索</h2>
        <p>沿着作者明确标注的关系继续，而不是依赖随机推荐。</p>
      </header>

      <div class="related-knowledge-section" aria-labelledby="related-explicit-title">
        <h3 id="related-explicit-title">相关知识</h3>
        {visible.length > 0 ? (
          <ol class="related-knowledge-list">
            {visible.map(({ reason, resolved }) => {
              const target = resolved.target
              const targetKnowledge = target?.knowledgeMetadata
              const crossTopic =
                targetKnowledge?.primaryTopic &&
                knowledge?.primaryTopic &&
                targetKnowledge.primaryTopic !== knowledge.primaryTopic
              const bidirectional = target && isBidirectionalRelation(fileData, target, allFiles)

              return (
                <li data-reference-state={resolved.state}>
                  <span class="related-index" aria-hidden="true" />
                  <div class="related-copy">
                    {target?.slug ? (
                      <a
                        class="internal"
                        href={resolveRelative(fileData.slug!, target.slug as FullSlug)}
                      >
                        {target.frontmatter?.title ?? resolved.reference}
                      </a>
                    ) : (
                      <span class="related-title">{resolved.reference}</span>
                    )}
                    <p>
                      {reason ??
                        (resolved.state === "missing"
                          ? "该目标尚未发布或地址已变更。"
                          : "作者将其标记为相关知识。")}
                    </p>
                    <div class="related-context">
                      {crossTopic && targetKnowledge?.primaryTopic && (
                        <span>跨主题 · {knowledgeTopicLabels[targetKnowledge.primaryTopic]}</span>
                      )}
                      {bidirectional && <span>双向关联</span>}
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        ) : (
          <p class="relation-empty">作者尚未标注相关知识；你仍可从“提及本文”查看自然形成的连接。</p>
        )}
        {selfRelations.length > 0 && (
          <p class="relation-notice">有一条相关关系指回本文，已避免重复展示。</p>
        )}
      </div>

      <div class="related-knowledge-section path-position" aria-labelledby="path-position-title">
        <h3 id="path-position-title">学习路径位置</h3>
        {paths.length > 0 ? (
          <ul>
            {paths.map(({ path, position, total, kind, stepTitle }) => (
              <li>
                <a class="internal" href={resolveRelative(fileData.slug!, path.slug!)}>
                  {path.frontmatter?.title ?? "未命名学习路径"}
                </a>
                <span>
                  {kind === "optional" ? "可选分支" : `第 ${position} 个节点 · 共 ${total} 个`}
                  {stepTitle && ` · ${stepTitle}`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p class="relation-empty">本文尚未加入公开学习路径；路径必须经过人工策划后才会显示。</p>
        )}
      </div>
    </section>
  )
}

RelatedKnowledge.css = style

export default (() => RelatedKnowledge) satisfies QuartzComponentConstructor
