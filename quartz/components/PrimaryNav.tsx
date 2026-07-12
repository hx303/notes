import { FullSlug, resolveRelative } from "../util/path"
import { classNames } from "../util/lang"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import style from "./styles/primaryNav.scss"
// @ts-ignore
import script from "./scripts/primaryNav.inline"

const navItems = [
  { label: "主题", slug: "topics" },
  { label: "学习路径", slug: "paths" },
  { label: "知识地图", slug: "map" },
  { label: "建立知识库", slug: "build" },
] as const

const isActive = (currentSlug: string, targetSlug: string) =>
  currentSlug === targetSlug || currentSlug.startsWith(`${targetSlug}/`)

const NavLinks = ({ currentSlug, compact = false }: { currentSlug: string; compact?: boolean }) => (
  <ul class={compact ? "primary-nav-list primary-nav-list-mobile" : "primary-nav-list"}>
    {navItems.map((item) => {
      const active = isActive(currentSlug, item.slug)
      return (
        <li>
          <a
            class="primary-nav-link internal"
            href={resolveRelative(currentSlug as FullSlug, item.slug as FullSlug)}
            aria-current={active ? "page" : undefined}
            data-nav-slug={item.slug}
          >
            <span>{item.label}</span>
            <span class="primary-nav-current" aria-hidden="true">
              当前
            </span>
          </a>
        </li>
      )
    })}
  </ul>
)

const PrimaryNav: QuartzComponent = ({ fileData, displayClass }: QuartzComponentProps) => {
  const currentSlug = fileData.slug ?? "index"
  return (
    <nav class={classNames(displayClass, "primary-nav")} aria-label="主要导航">
      <NavLinks currentSlug={currentSlug} />
      <button
        class="primary-nav-toggle"
        type="button"
        aria-label="打开主要导航"
        aria-expanded="false"
        aria-controls="primary-nav-dialog"
      >
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      <dialog
        id="primary-nav-dialog"
        class="primary-nav-dialog"
        aria-labelledby="primary-nav-title"
      >
        <div class="primary-nav-dialog-head">
          <div>
            <p class="primary-nav-eyebrow">PUBLIC KNOWLEDGE LIBRARY</p>
            <h2 id="primary-nav-title">去往哪里？</h2>
          </div>
          <button class="primary-nav-close" type="button" aria-label="关闭主要导航">
            <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <NavLinks currentSlug={currentSlug} compact />
        <p class="primary-nav-dialog-note">从主题进入一片知识，或沿一条路径继续学习。</p>
      </dialog>
    </nav>
  )
}

PrimaryNav.css = style
PrimaryNav.afterDOMLoaded = script

export default (() => PrimaryNav) satisfies QuartzComponentConstructor
