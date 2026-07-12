import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"
import style from "./styles/articleTitle.scss"

const ArticleTitle: QuartzComponent = ({ fileData, displayClass }: QuartzComponentProps) => {
  const title = fileData.frontmatter?.title
  if (title) {
    const structured = fileData.knowledgeMetadata?.isStructured
    if (structured) {
      return (
        <div class={classNames(displayClass, "article-title-block")}>
          <p class="article-title-kicker">知识记录 / KNOWLEDGE RECORD</p>
          <h1 class="article-title knowledge-article-title">{title}</h1>
        </div>
      )
    }

    return <h1 class={classNames(displayClass, "article-title")}>{title}</h1>
  } else {
    return null
  }
}

ArticleTitle.css = style

export default (() => ArticleTitle) satisfies QuartzComponentConstructor
