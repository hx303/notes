const syncCurrentPage = () => {
  const currentPath = window.location.pathname.replace(/^\/+|\/+$/g, "")
  for (const link of document.querySelectorAll<HTMLAnchorElement>("[data-nav-slug]")) {
    const target = link.dataset.navSlug ?? ""
    const active = currentPath === target || currentPath.startsWith(`${target}/`)
    if (active) link.setAttribute("aria-current", "page")
    else link.removeAttribute("aria-current")
  }
}

document.addEventListener("nav", () => {
  syncCurrentPage()
  const toggle = document.querySelector<HTMLButtonElement>(".primary-nav-toggle")
  const dialog = document.querySelector<HTMLDialogElement>(".primary-nav-dialog")
  const closeButton = dialog?.querySelector<HTMLButtonElement>(".primary-nav-close")
  if (!toggle || !dialog || !closeButton) return

  let shouldReturnFocus = true
  const openDialog = () => {
    shouldReturnFocus = true
    dialog.showModal()
    toggle.setAttribute("aria-expanded", "true")
    toggle.setAttribute("aria-label", "关闭主要导航")
    document.body.dataset.primaryNavOpen = "true"
    closeButton.focus()
  }
  const closeDialog = (returnFocus = true) => {
    if (!dialog.open) return
    shouldReturnFocus = returnFocus
    dialog.close()
  }
  const onClose = () => {
    toggle.setAttribute("aria-expanded", "false")
    toggle.setAttribute("aria-label", "打开主要导航")
    delete document.body.dataset.primaryNavOpen
    if (shouldReturnFocus && toggle.isConnected) toggle.focus()
  }
  const onBackdropClick = (event: MouseEvent) => {
    if (event.target === dialog) closeDialog(true)
  }
  const onLinkClick = (event: Event) => {
    if ((event.target as Element).closest("a")) closeDialog(false)
  }
  const onBeforeNavigate = () => closeDialog(false)
  const onCloseClick = () => closeDialog(true)
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && dialog.open) {
      event.preventDefault()
      closeDialog(true)
    }
  }

  toggle.addEventListener("click", openDialog)
  closeButton.addEventListener("click", onCloseClick)
  dialog.addEventListener("close", onClose)
  dialog.addEventListener("click", onBackdropClick)
  dialog.addEventListener("click", onLinkClick)
  document.addEventListener("prenav", onBeforeNavigate)
  document.addEventListener("keydown", onKeyDown)

  window.addCleanup(() => {
    toggle.removeEventListener("click", openDialog)
    closeButton.removeEventListener("click", onCloseClick)
    dialog.removeEventListener("close", onClose)
    dialog.removeEventListener("click", onBackdropClick)
    dialog.removeEventListener("click", onLinkClick)
    document.removeEventListener("prenav", onBeforeNavigate)
    document.removeEventListener("keydown", onKeyDown)
    delete document.body.dataset.primaryNavOpen
  })
})
