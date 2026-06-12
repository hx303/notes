let isReaderMode = false

// Persist across navigation
try {
  const saved = localStorage.getItem("reader-mode")
  if (saved === "on") isReaderMode = true
} catch (e) { /* ignore */ }

const emitReaderModeChangeEvent = (mode: "on" | "off") => {
  const event: CustomEventMap["readermodechange"] = new CustomEvent("readermodechange", {
    detail: { mode },
  })
  document.dispatchEvent(event)
}

const ensureExitButton = () => {
  if (document.querySelector(".focus-exit-btn")) return
  const btn = document.createElement("button")
  btn.className = "focus-exit-btn"
  btn.innerHTML = "✕"
  btn.title = "退出专注模式 (F)"
  btn.addEventListener("click", toggleReaderMode)
  document.body.appendChild(btn)
}

const applyReaderMode = () => {
  const newMode = isReaderMode ? "on" : "off"
  document.documentElement.setAttribute("reader-mode", newMode)
  try { localStorage.setItem("reader-mode", newMode) } catch (e) { /* ignore */ }
  emitReaderModeChangeEvent(newMode)

  if (isReaderMode) {
    ensureExitButton()
  } else {
    const btn = document.querySelector(".focus-exit-btn")
    if (btn) btn.remove()
  }
}

const toggleReaderMode = () => {
  isReaderMode = !isReaderMode
  applyReaderMode()
}

document.addEventListener("nav", () => {
  // Sidebar button click handler
  for (const btn of document.getElementsByClassName("readermode")) {
    btn.addEventListener("click", toggleReaderMode)
    window.addCleanup(() => btn.removeEventListener("click", toggleReaderMode))
  }

  // Keyboard shortcut: press F to toggle (not when typing in inputs)
  const handleKey = (e: KeyboardEvent) => {
    // Ignore if user is typing in an input/textarea/contenteditable
    const target = e.target as HTMLElement
    const tag = target?.tagName?.toLowerCase()
    const isEditable = target?.isContentEditable
    if (tag === "input" || tag === "textarea" || tag === "select" || isEditable) return
    // Ignore if modifier keys are held (Ctrl+F, Alt+F, etc.)
    if (e.ctrlKey || e.altKey || e.metaKey) return
    if (e.key === "f" || e.key === "F") {
      e.preventDefault()
      toggleReaderMode()
    }
  }
  document.addEventListener("keydown", handleKey)
  window.addCleanup(() => document.removeEventListener("keydown", handleKey))

  // Apply initial state (restore from localStorage)
  applyReaderMode()
})
