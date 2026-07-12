function toggleToc(this: HTMLElement) {
  this.classList.toggle("collapsed")
  this.setAttribute(
    "aria-expanded",
    this.getAttribute("aria-expanded") === "true" ? "false" : "true",
  )
  const panel = this.nextElementSibling as HTMLElement | undefined
  if (!panel) return
  panel.classList.toggle("collapsed")
}

function setupToc() {
  for (const toc of document.getElementsByClassName("toc")) {
    const button = toc.querySelector(".toc-header")
    if (!button) continue
    button.addEventListener("click", toggleToc)
    window.addCleanup(() => button.removeEventListener("click", toggleToc))
  }
}

function setupCurrentSection() {
  const headings = Array.from(
    document.querySelectorAll<HTMLElement>("article h2[id], article h3[id], article h4[id]"),
  )
  const tocLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>(".toc a[data-for]"))
  const currentLabels = Array.from(document.querySelectorAll<HTMLElement>("[data-toc-current]"))
  if (headings.length === 0 || tocLinks.length === 0) return

  let animationFrame = 0
  let currentId = ""

  const update = () => {
    animationFrame = 0
    const readingLine = Math.min(160, window.innerHeight * 0.24)
    let current = headings[0]

    for (const heading of headings) {
      if (heading.getBoundingClientRect().top <= readingLine) current = heading
      else break
    }

    if (current.id === currentId) return
    currentId = current.id
    const currentText = current.textContent?.trim() ?? ""

    for (const link of tocLinks) {
      const isCurrent = link.dataset.for === currentId
      link.classList.toggle("is-active", isCurrent)
      if (isCurrent) link.setAttribute("aria-current", "location")
      else link.removeAttribute("aria-current")
    }

    for (const label of currentLabels) {
      label.textContent = currentText ? `当前：${currentText}` : ""
    }
  }

  const scheduleUpdate = () => {
    if (animationFrame === 0) animationFrame = window.requestAnimationFrame(update)
  }

  const closeMobileToc = (event: Event) => {
    const link = event.currentTarget as HTMLAnchorElement
    link.closest<HTMLDetailsElement>("details.toc-inline")?.removeAttribute("open")
    scheduleUpdate()
  }

  window.addEventListener("scroll", scheduleUpdate, { passive: true })
  window.addEventListener("resize", scheduleUpdate)
  tocLinks.forEach((link) => link.addEventListener("click", closeMobileToc))
  update()

  window.addCleanup(() => {
    window.removeEventListener("scroll", scheduleUpdate)
    window.removeEventListener("resize", scheduleUpdate)
    tocLinks.forEach((link) => link.removeEventListener("click", closeMobileToc))
    if (animationFrame !== 0) window.cancelAnimationFrame(animationFrame)
  })
}

document.addEventListener("nav", () => {
  setupToc()
  setupCurrentSection()
})
