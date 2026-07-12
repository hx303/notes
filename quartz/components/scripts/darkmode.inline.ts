const themeQuery = window.matchMedia("(prefers-color-scheme: dark)")
const storedTheme = () => {
  try {
    const value = localStorage.getItem("theme")
    return value === "light" || value === "dark" ? value : null
  } catch {
    return null
  }
}
const syncThemeControls = (theme: "light" | "dark") => {
  document.querySelectorAll<HTMLButtonElement>(".darkmode").forEach((button) => {
    const dark = theme === "dark"
    button.setAttribute("aria-pressed", String(dark))
    button.setAttribute("aria-label", dark ? "切换到浅色外观" : "切换到深色外观")
  })
  document.querySelectorAll<HTMLElement>(".theme-value").forEach((value) => {
    value.textContent = theme === "dark" ? "深色" : "浅色"
  })
}
const applyTheme = (theme: "light" | "dark") => {
  document.documentElement.setAttribute("saved-theme", theme)
  syncThemeControls(theme)
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    const color = theme === "dark" ? meta.dataset.themeColorDark : meta.dataset.themeColorLight
    if (color) meta.content = color
  })
  document.dispatchEvent(new CustomEvent("themechange", { detail: { theme } }))
}
applyTheme(storedTheme() ?? (themeQuery.matches ? "dark" : "light"))
document.addEventListener("nav", () => {
  applyTheme(storedTheme() ?? (themeQuery.matches ? "dark" : "light"))
  const toggle = () => {
    const theme = document.documentElement.getAttribute("saved-theme") === "dark" ? "light" : "dark"
    try {
      localStorage.setItem("theme", theme)
    } catch {}
    applyTheme(theme)
  }
  document.querySelectorAll<HTMLElement>(".darkmode").forEach((button) => {
    button.addEventListener("click", toggle)
    window.addCleanup(() => button.removeEventListener("click", toggle))
  })
  const followSystem = () => {
    if (!storedTheme()) applyTheme(themeQuery.matches ? "dark" : "light")
  }
  themeQuery.addEventListener("change", followSystem)
  window.addCleanup(() => themeQuery.removeEventListener("change", followSystem))
})
document.addEventListener("readingpreferencesreset", () => {
  try {
    localStorage.removeItem("theme")
  } catch {}
  applyTheme(themeQuery.matches ? "dark" : "light")
})
