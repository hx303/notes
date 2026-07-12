import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import style from "./styles/footer.scss"
import { version } from "../../package.json"

interface Options {
  links: Record<string, string>
  brand?: string
  tagline?: string
}

export default ((opts?: Options) => {
  const Footer: QuartzComponent = ({ displayClass }: QuartzComponentProps) => {
    const year = new Date().getFullYear()
    const links = opts?.links ?? []
    return (
      <footer id="site-footer" class={`${displayClass ?? ""}`}>
        <div class="footer-statement">
          <p class="footer-brand">{opts?.brand ?? "wouldkeep / 夔嵬"}</p>
          <p class="footer-tagline">{opts?.tagline ?? "拥有你的知识，也让知识照见他人"}</p>
        </div>
        <ul>
          {Object.entries(links).map(([text, link]) => (
            <li>
              <a href={link}>{text}</a>
            </li>
          ))}
        </ul>
        <p class="footer-meta">
          © {year} · Quartz v{version}
        </p>
      </footer>
    )
  }

  Footer.css = style
  return Footer
}) satisfies QuartzComponentConstructor
