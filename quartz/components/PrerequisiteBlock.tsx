import { FullSlug, resolveRelative } from "../util/path"
import { resolveKnowledgeReference } from "../util/knowledgeRelations"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import style from "./styles/prerequisiteBlock.scss"

const PrerequisiteBlock: QuartzComponent = ({ fileData, allFiles }: QuartzComponentProps) => {
  const knowledge = fileData.knowledgeMetadata
  if (!knowledge?.isStructured) return null

  const prerequisites = knowledge.prerequisites.map((reference) =>
    resolveKnowledgeReference(allFiles, fileData, reference),
  )
  const visible = prerequisites.filter(({ state }) => state !== "self")
  const selfReferences = prerequisites.filter(({ state }) => state === "self")

  return (
    <section class="prerequisite-block" aria-labelledby="prerequisite-title">
      <div class="prerequisite-heading">
        <p class="relation-eyebrow">BEFORE READING</p>
        <h2 id="prerequisite-title">前置知识</h2>
      </div>
      {visible.length > 0 ? (
        <ul class="prerequisite-list">
          {visible.map(({ reference, target, state }) => (
            <li data-reference-state={state}>
              <span class="prerequisite-marker" aria-hidden="true" />
              <div>
                {target?.slug ? (
                  <a
                    class="internal"
                    href={resolveRelative(fileData.slug!, target.slug as FullSlug)}
                  >
                    {target.frontmatter?.title ?? reference}
                  </a>
                ) : (
                  <span class="prerequisite-name">{reference}</span>
                )}
                {state === "missing" && <p>站内暂无对应条目，可先凭已有基础继续阅读。</p>}
                {target?.knowledgeMetadata?.summary && <p>{target.knowledgeMetadata.summary}</p>}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p class="relation-empty">本文未声明额外前置知识，可以直接开始阅读。</p>
      )}
      {selfReferences.length > 0 && (
        <p class="relation-notice">有一条前置关系指向本文，已避免重复循环。</p>
      )}
    </section>
  )
}

PrerequisiteBlock.css = style

export default (() => PrerequisiteBlock) satisfies QuartzComponentConstructor
