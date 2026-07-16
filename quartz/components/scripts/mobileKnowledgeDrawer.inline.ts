document.addEventListener("nav", () => {
  const trigger = document.querySelector<HTMLButtonElement>(".mobile-knowledge-trigger")
  const dialog = document.querySelector<HTMLDialogElement>(".mobile-knowledge-dialog")
  const closeButton = dialog?.querySelector<HTMLButtonElement>(".mobile-knowledge-close")
  if (!trigger || !dialog || !closeButton) return

  let shouldReturnFocus = true
  const openDrawer = () => {
    shouldReturnFocus = true
    dialog.showModal()
    trigger.setAttribute("aria-expanded", "true")
    document.body.dataset.knowledgeDrawerOpen = "true"
    closeButton.focus()
  }
  const closeDrawer = (returnFocus = true) => {
    if (!dialog.open) return
    shouldReturnFocus = returnFocus
    dialog.close()
  }
  const onClose = () => {
    trigger.setAttribute("aria-expanded", "false")
    delete document.body.dataset.knowledgeDrawerOpen
    if (shouldReturnFocus && trigger.isConnected) trigger.focus()
  }
  const onBackdropClick = (event: MouseEvent) => {
    if (event.target === dialog) closeDrawer(true)
  }
  const onLinkClick = (event: MouseEvent) => {
    if ((event.target as Element).closest("a")) closeDrawer(false)
  }
  const onBeforeNavigate = () => closeDrawer(false)
  const onCloseClick = () => closeDrawer(true)

  trigger.addEventListener("click", openDrawer)
  closeButton.addEventListener("click", onCloseClick)
  dialog.addEventListener("close", onClose)
  dialog.addEventListener("click", onBackdropClick)
  dialog.addEventListener("click", onLinkClick)
  document.addEventListener("prenav", onBeforeNavigate)

  window.addCleanup(() => {
    trigger.removeEventListener("click", openDrawer)
    closeButton.removeEventListener("click", onCloseClick)
    dialog.removeEventListener("close", onClose)
    dialog.removeEventListener("click", onBackdropClick)
    dialog.removeEventListener("click", onLinkClick)
    document.removeEventListener("prenav", onBeforeNavigate)
    delete document.body.dataset.knowledgeDrawerOpen
  })
})
