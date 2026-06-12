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

const applyReaderMode = () => {
  const newMode = isReaderMode ? "on" : "off"
  document.documentElement.setAttribute("reader-mode", newMode)
  try { localStorage.setItem("reader-mode", newMode) } catch (e) { /* ignore */ }
  emitReaderModeChangeEvent(newMode)
}

const toggleReaderMode = () => {
  isReaderMode = !isReaderMode
  applyReaderMode()
}

document.addEventListener("nav", () => {
  // Button click handler
  for (const btn of document.getElementsByClassName("readermode")) {
    btn.addEventListener("click", toggleReaderMode)
    window.addCleanup(() => btn.removeEventListener("click", toggleReaderMode))
  }

  // Keyboard shortcut: press F to toggle (not when typing in inputs)
  const handleKey = (e: KeyboardEvent) => {
    // Ignore if user is typing in an input/textarea/contenteditable
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
    const isEditable = (e.target as HTMLElement)?.isContentEditable
    if (tag === "input" || tag === "textarea" || tag === "select" || isEditable) return
    // Ignore if modifier keys are held (Ctrl+F, Alt+F, etc.)
    if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return
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
