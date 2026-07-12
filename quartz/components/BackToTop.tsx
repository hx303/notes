import { QuartzComponentConstructor, QuartzComponentProps } from "./types"

function BackToTop({}: QuartzComponentProps) {
  return (
    <a class="back-to-top" href="#main-content" aria-label="返回页面开头">
      <span aria-hidden="true">↑</span>
    </a>
  )
}

export default (() => BackToTop) satisfies QuartzComponentConstructor
