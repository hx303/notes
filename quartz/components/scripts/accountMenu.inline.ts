import {
  createAuthGenerationGuard,
  createBrowserResourceScope,
  loadSharedSupabaseClient,
  watchSupabaseAuth,
  type AuthGenerationSnapshot,
} from "./supabaseClient"

const initAccountMenu = async () => {
  const root = document.querySelector<HTMLElement>("[data-account-menu]")
  if (!root || root.dataset.ready === "true") return
  root.dataset.ready = "true"

  const resources = createBrowserResourceScope()
  const authGeneration = createAuthGenerationGuard()
  const loginLink = root.querySelector<HTMLElement>("[data-account-menu-login]")
  const userSurface = root.querySelector<HTMLElement>("[data-account-menu-user]")
  const avatarImage = root.querySelector<HTMLImageElement>("[data-account-avatar-image]")
  const avatarFallback = root.querySelector<HTMLElement>("[data-account-avatar-fallback]")
  const toggle = root.querySelector<HTMLButtonElement>("[data-account-menu-toggle]")
  const panel = root.querySelector<HTMLElement>("[data-account-menu-panel]")
  const name = root.querySelector<HTMLElement>("[data-account-menu-name]")
  const email = root.querySelector<HTMLElement>("[data-account-menu-email]")
  const ownerLink = root.querySelector<HTMLElement>("[data-account-owner-link]")
  const signout = root.querySelector<HTMLButtonElement>("[data-account-menu-signout]")
  let client: any = null
  let authSubscription: { unsubscribe?: () => void } | null = null
  let closeTimer: number | undefined
  let toggleWasOpenOnPointerDown: boolean | null = null

  const safeAvatarUrl = (value = "") => {
    try {
      const parsed = new URL(value)
      return parsed.protocol === "https:" ||
        (parsed.protocol === "http:" && parsed.hostname === "localhost")
        ? parsed.href
        : ""
    } catch {
      return ""
    }
  }

  const closeMenu = (returnFocus = false) => {
    if (!panel || !toggle) return
    if (closeTimer) window.clearTimeout(closeTimer)
    closeTimer = undefined
    panel.hidden = true
    toggle.setAttribute("aria-expanded", "false")
    toggle.setAttribute("aria-label", "打开个人空间快捷菜单")
    if (returnFocus) toggle.focus()
  }

  const renderSignedOut = (invalidate = true) => {
    if (invalidate) authGeneration.invalidate()
    root.dataset.accountState = "signed-out"
    if (loginLink) loginLink.hidden = false
    if (userSurface) userSurface.hidden = true
    if (ownerLink) ownerLink.hidden = true
    if (name) name.textContent = "我的账户"
    if (email) email.textContent = ""
    if (avatarImage) {
      avatarImage.hidden = true
      avatarImage.removeAttribute("src")
    }
    if (avatarFallback) {
      avatarFallback.hidden = false
      avatarFallback.textContent = "我"
    }
    closeMenu()
  }

  const openMenu = () => {
    if (!panel || !toggle || userSurface?.hidden) return
    if (closeTimer) window.clearTimeout(closeTimer)
    closeTimer = undefined
    panel.hidden = false
    toggle.setAttribute("aria-expanded", "true")
    toggle.setAttribute("aria-label", "关闭个人空间快捷菜单")
  }

  const scheduleClose = () => {
    if (closeTimer) window.clearTimeout(closeTimer)
    closeTimer = window.setTimeout(() => closeMenu(), 160)
  }

  const renderProfile = (
    profile: {
      display_name?: string | null
      avatar_url?: string | null
      signature?: string | null
    } | null,
    userEmail = "",
  ) => {
    const displayName = profile?.display_name?.trim() || userEmail.split("@")[0] || "我的账户"
    const avatarUrl = safeAvatarUrl(profile?.avatar_url ?? "")
    if (name) name.textContent = displayName
    if (email) email.textContent = profile?.signature?.trim() || userEmail
    if (avatarFallback) avatarFallback.textContent = [...displayName][0] || "我"
    if (avatarImage) {
      avatarImage.hidden = !avatarUrl
      if (avatarUrl) avatarImage.src = avatarUrl
      else avatarImage.removeAttribute("src")
    }
    if (avatarFallback) avatarFallback.hidden = Boolean(avatarUrl)
  }

  const isAuthCurrent = (snapshot: AuthGenerationSnapshot) =>
    !resources.disposed && authGeneration.isCurrent(snapshot)

  const syncAccount = async () => {
    if (!client || resources.disposed) {
      renderSignedOut()
      return
    }
    const revision = authGeneration.start()
    try {
      const user = (await client.auth.getUser()).data?.user ?? null
      if (resources.disposed || !authGeneration.isRevisionCurrent(revision)) return
      if (!user) {
        renderSignedOut()
        return
      }
      const snapshot = authGeneration.bind(revision, user.id)
      if (!snapshot || !isAuthCurrent(snapshot)) return

      root.dataset.accountState = "signed-in"
      if (loginLink) loginLink.hidden = true
      if (userSurface) userSurface.hidden = false
      renderProfile(null, user.email ?? "")

      try {
        let profileResult = await client
          .from("profiles")
          .select("display_name,avatar_url,signature")
          .eq("id", user.id)
          .maybeSingle()
        if (profileResult.error)
          profileResult = await client
            .from("profiles")
            .select("display_name,avatar_url")
            .eq("id", user.id)
            .maybeSingle()
        if (isAuthCurrent(snapshot)) renderProfile(profileResult.data ?? null, user.email ?? "")
      } catch {
        // The authenticated fallback above remains usable when optional profile data is unavailable.
      }

      try {
        const capabilityResult = await client.rpc("current_account_capabilities")
        const capabilities = capabilityResult.data as { is_site_owner?: boolean } | null
        if (ownerLink && isAuthCurrent(snapshot))
          ownerLink.hidden = Boolean(capabilityResult.error || capabilities?.is_site_owner !== true)
      } catch {
        if (ownerLink && isAuthCurrent(snapshot)) ownerLink.hidden = true
      }
    } catch {
      if (!resources.disposed && authGeneration.isRevisionCurrent(revision)) renderSignedOut()
    }
  }

  const bindAuthState = () => {
    if (!client || authSubscription) return
    authSubscription = watchSupabaseAuth(client, {
      onSignedOut: renderSignedOut,
      onSessionChanged: () => void syncAccount(),
    })
    resources.add(() => {
      authSubscription?.unsubscribe?.()
      authSubscription = null
    })
  }

  const connect = async () => {
    if (resources.disposed) return
    try {
      client = await loadSharedSupabaseClient(
        root.dataset.supabaseUrl ?? "",
        root.dataset.supabaseAnonKey ?? "",
      )
    } catch {
      client = null
    }
    if (resources.disposed) return
    if (!client) {
      renderSignedOut()
      return
    }
    bindAuthState()
    await syncAccount()
  }

  const onMouseEnter = () => openMenu()
  const onMouseLeave = () => scheduleClose()
  const onFocusIn = (event: Event) => {
    const target = event.target as HTMLElement
    if (target !== toggle || target.matches(":focus-visible")) openMenu()
  }
  const onFocusOut = (event: Event) => {
    if (!root.contains((event as FocusEvent).relatedTarget as Node | null)) scheduleClose()
  }
  const onKeyDown = (event: Event) => {
    const keyboardEvent = event as KeyboardEvent
    if (keyboardEvent.key === "Escape" && panel && !panel.hidden) {
      keyboardEvent.preventDefault()
      closeMenu(true)
    }
  }
  const onTogglePointerDown = () => {
    toggleWasOpenOnPointerDown = panel ? !panel.hidden : false
  }
  const onToggleClick = (event: Event) => {
    event.stopPropagation()
    const shouldOpen =
      toggleWasOpenOnPointerDown === null ? panel?.hidden : !toggleWasOpenOnPointerDown
    toggleWasOpenOnPointerDown = null
    if (shouldOpen) openMenu()
    else closeMenu()
  }
  const onDocumentPointerDown = (event: Event) => {
    if (!root.contains(event.target as Node)) closeMenu()
  }
  const onSignOut = async () => {
    if (!signout || signout.disabled) return
    const label = signout.textContent ?? "退出登录"
    signout.disabled = true
    signout.textContent = "正在退出…"
    try {
      await client?.auth.signOut()
      location.assign("/account/")
    } catch {
      signout.disabled = false
      signout.textContent = label
    }
  }
  const onProfileUpdated = (event: Event) => {
    const snapshot = authGeneration.current()
    if (!snapshot || !isAuthCurrent(snapshot)) return
    const detail = (
      event as CustomEvent<{
        display_name?: string
        avatar_url?: string
        signature?: string
        email?: string
      }>
    ).detail
    renderProfile(detail ?? null, detail?.email ?? email?.textContent ?? "")
  }
  const onOnline = () => {
    if (client) void syncAccount()
    else void connect()
  }

  resources.listen(root, "mouseenter", onMouseEnter)
  resources.listen(root, "mouseleave", onMouseLeave)
  resources.listen(root, "focusin", onFocusIn)
  resources.listen(root, "focusout", onFocusOut)
  resources.listen(root, "keydown", onKeyDown)
  if (toggle) {
    resources.listen(toggle, "pointerdown", onTogglePointerDown)
    resources.listen(toggle, "click", onToggleClick)
  }
  resources.listen(document, "pointerdown", onDocumentPointerDown)
  if (signout) resources.listen(signout, "click", onSignOut)
  resources.listen(window, "wouldkeep:profile-updated", onProfileUpdated)
  resources.listen(window, "online", onOnline)
  resources.add(() => {
    authGeneration.invalidate()
    if (closeTimer) window.clearTimeout(closeTimer)
    closeTimer = undefined
  })
  window.addCleanup(() => resources.cleanup())

  await connect()
}

document.addEventListener("nav", initAccountMenu)
window.addEventListener("load", initAccountMenu, { once: true })
