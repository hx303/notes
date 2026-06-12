import { QuartzComponentConstructor, QuartzComponentProps } from "./types"

function BackToTop({}: QuartzComponentProps) {
  return <a class="back-to-top" href="#" aria-label="返回顶部">↑</a>
}

export default (() => BackToTop) satisfies QuartzComponentConstructor
