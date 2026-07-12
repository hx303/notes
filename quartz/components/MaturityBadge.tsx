import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { KnowledgeMaturity, knowledgeMaturityLabels } from "../util/knowledgeMetadata"
import style from "./styles/maturityBadge.scss"

const maturityDescriptions: Record<KnowledgeMaturity, string> = {
  seed: "初步记录，内容仍可能明显变化",
  growing: "持续整理与修订中",
  stable: "已经过系统整理，仍欢迎纠错",
}

const maturityNumbers: Record<KnowledgeMaturity, string> = {
  seed: "01",
  growing: "02",
  stable: "03",
}

export function MaturityBadgeView({ maturity }: { maturity: KnowledgeMaturity }) {
  const label = knowledgeMaturityLabels[maturity]
  const description = maturityDescriptions[maturity]

  return (
    <span
      class="maturity-badge"
      data-maturity={maturity}
      aria-label={`成熟度：${label}。${description}`}
      title={description}
    >
      <span class="maturity-index" aria-hidden="true">
        {maturityNumbers[maturity]}
      </span>
      <span class="maturity-mark" aria-hidden="true" />
      <span>{label}</span>
    </span>
  )
}

const MaturityBadge: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  const knowledge = fileData.knowledgeMetadata
  return knowledge?.isStructured ? <MaturityBadgeView maturity={knowledge.maturity} /> : null
}

MaturityBadge.css = style

export default (() => MaturityBadge) satisfies QuartzComponentConstructor
