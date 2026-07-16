let isReaderMode = false
try {
  isReaderMode = localStorage.getItem("reader-mode") === "on"
} catch {}
const syncReaderControls = () => {
  document.querySelectorAll<HTMLButtonElement>(".readermode").forEach((button) => {
    button.setAttribute("aria-pressed", String(isReaderMode))
    button.setAttribute("aria-label", isReaderMode ? "关闭专注阅读" : "开启专注阅读")
  })
  document.querySelectorAll<HTMLElement>(".reader-mode-value").forEach((value) => {
    value.textContent = isReaderMode ? "开启" : "关闭"
  })
}
const ensureExitButton = () => {
  if (document.querySelector(".focus-exit-btn")) return
  const button = document.createElement("button")
  button.className = "focus-exit-btn"
  button.type = "button"
  button.setAttribute("aria-label", "退出专注阅读")
  button.innerHTML = '<span aria-hidden="true">×</span><span>退出专注</span>'
  button.addEventListener("click", toggleReaderMode)
  document.body.appendChild(button)
}
const applyReaderMode = (persist = true) => {
  const mode = isReaderMode ? "on" : "off"
  document.documentElement.setAttribute("reader-mode", mode)
  syncReaderControls()
  if (persist) {
    try {
      localStorage.setItem("reader-mode", mode)
    } catch {}
  }
  if (isReaderMode) ensureExitButton()
  else document.querySelector(".focus-exit-btn")?.remove()
  document.dispatchEvent(new CustomEvent("readermodechange", { detail: { mode } }))
}
function toggleReaderMode() {
  isReaderMode = !isReaderMode
  applyReaderMode()
}
document.addEventListener("nav", () => {
  try {
    isReaderMode = localStorage.getItem("reader-mode") === "on"
  } catch {}
  applyReaderMode(false)
  document.querySelectorAll<HTMLElement>(".readermode").forEach((button) => {
    button.addEventListener("click", toggleReaderMode)
    window.addCleanup(() => button.removeEventListener("click", toggleReaderMode))
  })
  const handleKey = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement
    if (
      ["input", "textarea", "select"].includes(target?.tagName?.toLowerCase()) ||
      target?.isContentEditable ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey
    )
      return
    if (event.key.toLowerCase() === "f") {
      event.preventDefault()
      toggleReaderMode()
    }
  }
  document.addEventListener("keydown", handleKey)
  window.addCleanup(() => document.removeEventListener("keydown", handleKey))
})
document.addEventListener("readingpreferencesreset", () => {
  isReaderMode = false
  try {
    localStorage.removeItem("reader-mode")
  } catch {}
  applyReaderMode(false)
})
