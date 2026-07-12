import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import breadcrumbsStyle from "./styles/breadcrumbs.scss"
import { FullSlug, SimpleSlug, resolveRelative, simplifySlug } from "../util/path"
import { classNames } from "../util/lang"
import { trieFromAllFiles } from "../util/ctx"
import { knowledgeTopicLabels } from "../util/knowledgeMetadata"

type CrumbData = {
  displayName: string
  path?: string
  current?: boolean
}

interface BreadcrumbOptions {
  spacerSymbol: string
  rootName: string
  resolveFrontmatterTitle: boolean
  showCurrentPage: boolean
}

const defaultOptions: BreadcrumbOptions = {
  spacerSymbol: "/",
  rootName: "首页",
  resolveFrontmatterTitle: true,
  showCurrentPage: true,
}

function formatCrumb(displayName: string, baseSlug: FullSlug, currentSlug: SimpleSlug): CrumbData {
  return {
    displayName: displayName.replaceAll("-", " "),
    path: resolveRelative(baseSlug, currentSlug),
  }
}

export default ((opts?: Partial<BreadcrumbOptions>) => {
  const options: BreadcrumbOptions = { ...defaultOptions, ...opts }

  const Breadcrumbs: QuartzComponent = ({
    fileData,
    allFiles,
    displayClass,
    ctx,
  }: QuartzComponentProps) => {
    const knowledge = fileData.knowledgeMetadata
    let crumbs: CrumbData[]

    if (knowledge?.isStructured) {
      crumbs = [
        {
          displayName: options.rootName,
          path: resolveRelative(fileData.slug!, "index" as FullSlug),
        },
        {
          displayName: knowledge.primaryTopic
            ? knowledgeTopicLabels[knowledge.primaryTopic]
            : "待归类",
          path: resolveRelative(fileData.slug!, "topics" as FullSlug),
        },
        {
          displayName: fileData.frontmatter?.title ?? "当前知识记录",
          current: true,
        },
      ]
    } else {
      const trie = (ctx.trie ??= trieFromAllFiles(allFiles))
      const slugParts = fileData.slug!.split("/")
      const pathNodes = trie.ancestryChain(slugParts)
      if (!pathNodes) return null

      crumbs = pathNodes.map((node, idx) => {
        const crumb = formatCrumb(node.displayName, fileData.slug!, simplifySlug(node.slug))
        if (idx === 0) crumb.displayName = options.rootName
        if (idx === pathNodes.length - 1) {
          crumb.path = undefined
          crumb.current = true
        }
        return crumb
      })
    }

    if (!options.showCurrentPage) crumbs.pop()

    return (
      <nav class={classNames(displayClass, "breadcrumb-container")} aria-label="面包屑">
        <ol>
          {crumbs.map((crumb, index) => (
            <li class="breadcrumb-element">
              {crumb.current ? (
                <span aria-current="page" title={crumb.displayName}>
                  {crumb.displayName}
                </span>
              ) : (
                <a href={crumb.path}>{crumb.displayName}</a>
              )}
              {index !== crumbs.length - 1 && (
                <span class="breadcrumb-separator" aria-hidden="true">
                  {options.spacerSymbol}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
    )
  }

  Breadcrumbs.css = breadcrumbsStyle
  return Breadcrumbs
}) satisfies QuartzComponentConstructor
