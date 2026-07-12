import { pathToRoot } from "../util/path"
import { classNames } from "../util/lang"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import style from "./styles/masthead.scss"

const Masthead: QuartzComponent = ({ fileData, displayClass }: QuartzComponentProps) => {
  const home = pathToRoot(fileData.slug!)

  return (
    <div class={classNames(displayClass, "masthead")}>
      <a class="masthead-link" href={home} aria-label="wouldkeep / 夔嵬，返回首页">
        <span class="masthead-wordmark" lang="en">
          wouldkeep
        </span>
        <span class="masthead-divider" aria-hidden="true">
          /
        </span>
        <span class="masthead-name">夔嵬</span>
      </a>
      <p class="masthead-tagline">拥有你的知识，也让知识照见他人</p>
    </div>
  )
}

Masthead.css = style

export default (() => Masthead) satisfies QuartzComponentConstructor
