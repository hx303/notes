const readingDialog = () =>
  document.querySelector<HTMLDialogElement>("#mobile-reading-tools-dialog")
const readingTrigger = () =>
  document.querySelector<HTMLButtonElement>(".mobile-reading-tools-trigger")
const closeReadingTools = () => {
  if (readingDialog()?.open) readingDialog()?.close()
  document.body.removeAttribute("data-reading-tools-open")
  readingTrigger()?.setAttribute("aria-expanded", "false")
}
document.addEventListener("nav", () => {
  const panel = readingDialog()
  const opener = readingTrigger()
  const close = document.querySelector<HTMLButtonElement>(".mobile-reading-tools-close")
  let shouldReturnFocus = true
  const openPanel = () => {
    shouldReturnFocus = true
    panel?.showModal()
    document.body.dataset.readingToolsOpen = "true"
    opener?.setAttribute("aria-expanded", "true")
    close?.focus()
  }
  const closePanel = (returnFocus = true) => {
    shouldReturnFocus = returnFocus
    if (panel?.open) panel.close()
  }
  const onClose = () => {
    closeReadingTools()
    if (shouldReturnFocus && opener?.isConnected) opener.focus()
  }
  const backdropClose = (event: MouseEvent) => {
    if (event.target === panel) closePanel(true)
  }
  const onBeforeNavigate = () => closePanel(false)
  const onReaderModeChange = (event: CustomEventMap["readermodechange"]) => {
    if (event.detail.mode !== "on") return
    closePanel(false)
    document.querySelector<HTMLElement>("#main-content")?.focus()
  }
  opener?.addEventListener("click", openPanel)
  const onCloseClick = () => closePanel(true)
  close?.addEventListener("click", onCloseClick)
  panel?.addEventListener("click", backdropClose)
  panel?.addEventListener("close", onClose)
  document.addEventListener("prenav", onBeforeNavigate)
  document.addEventListener("readermodechange", onReaderModeChange)
  window.addCleanup(() => {
    opener?.removeEventListener("click", openPanel)
    close?.removeEventListener("click", onCloseClick)
    panel?.removeEventListener("click", backdropClose)
    panel?.removeEventListener("close", onClose)
    document.removeEventListener("prenav", onBeforeNavigate)
    document.removeEventListener("readermodechange", onReaderModeChange)
  })
  document.querySelectorAll<HTMLButtonElement>(".reading-tools-reset").forEach((button) => {
    const reset = () => {
      const event: CustomEventMap["readingpreferencesreset"] = new CustomEvent(
        "readingpreferencesreset",
        { detail: {} },
      )
      document.dispatchEvent(event)
      document.querySelectorAll<HTMLElement>(".reading-tools-status").forEach((status) => {
        status.textContent = "阅读设置已恢复默认"
      })
    }
    button.addEventListener("click", reset)
    window.addCleanup(() => button.removeEventListener("click", reset))
  })
})
