import {
  KnowledgeMaturity,
  KnowledgeType,
  knowledgeMaturityLabels,
  knowledgeTypeLabels,
} from "../util/knowledgeMetadata"

export type FilterOption<T extends string = string> = {
  value: T
  label: string
  count: number
}

type FilterBarProps = {
  subtopics: FilterOption[]
  types: FilterOption<KnowledgeType>[]
  maturities: FilterOption<KnowledgeMaturity>[]
}

export function FilterBar({ subtopics, types, maturities }: FilterBarProps) {
  return (
    <form class="topic-filter-bar" data-topic-filter-form aria-label="筛选知识记录">
      <label>
        <span>子主题</span>
        <select name="subtopic">
          <option value="">全部子主题</option>
          {subtopics.map((option) => (
            <option value={option.value}>
              {option.label} · {option.count}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>类型</span>
        <select name="type">
          <option value="">全部类型</option>
          {types.map((option) => (
            <option value={option.value}>
              {knowledgeTypeLabels[option.value]} · {option.count}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>成熟度</span>
        <select name="maturity">
          <option value="">全部成熟度</option>
          {maturities.map((option) => (
            <option value={option.value}>
              {knowledgeMaturityLabels[option.value]} · {option.count}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>排序</span>
        <select name="sort">
          <option value="title">标题</option>
          <option value="updated">最近修订</option>
          <option value="maturity">成熟度</option>
        </select>
      </label>
      <button type="button" class="topic-filter-reset" data-topic-filter-reset>
        清除筛选
      </button>
    </form>
  )
}
