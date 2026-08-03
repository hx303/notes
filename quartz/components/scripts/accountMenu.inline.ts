const loadSupabaseClient = async (url: string, key: string) => {
  // @ts-ignore -- Browser-only ESM dependency loaded at runtime.
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2")
  return createClient(url, key)
}

const initAccountMenu = async () => {
  const root = document.querySelector<HTMLElement>("[data-account-menu]")
  if (!root || root.dataset.ready === "true") return
  root.dataset.ready = "true"

  const loginLink = root.querySelector<HTMLElement>("[data-account-menu-login]")
  const userSurface = root.querySelector<HTMLElement>("[data-account-menu-user]")
  const avatarImage = root.querySelector<HTMLImageElement>("[data-account-avatar-image]")
  const avatarFallback = root.querySelector<HTMLElement>("[data-account-avatar-fallback]")
  const toggle = root.querySelector<HTMLButtonElement>("[data-account-menu-toggle]")
  const panel = root.querySelector<HTMLElement>("[data-account-menu-panel]")
  const name = root.querySelector<HTMLElement>("[data-account-menu-name]")
  const email = root.querySelector<HTMLElement>("[data-account-menu-email]")
  const operationsLink = root.querySelector<HTMLElement>("[data-account-operations-link]")
  const signout = root.querySelector<HTMLButtonElement>("[data-account-menu-signout]")
  let client: any = null
  let closeTimer: number | undefined
  let toggleWasOpenOnPointerDown: boolean | null = null
  let accountSyncEpoch = 0

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
    panel.hidden = true
    toggle.setAttribute("aria-expanded", "false")
    toggle.setAttribute("aria-label", "打开个人空间快捷菜单")
    if (returnFocus) toggle.focus()
  }

  const openMenu = () => {
    if (!panel || !toggle || userSurface?.hidden) return
    if (closeTimer) window.clearTimeout(closeTimer)
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

  const syncAccount = async () => {
    const syncEpoch = ++accountSyncEpoch
    if (operationsLink) operationsLink.hidden = true
    const user = client ? ((await client.auth.getUser()).data?.user ?? null) : null
    if (syncEpoch !== accountSyncEpoch) return
    root.dataset.accountState = user ? "signed-in" : "signed-out"
    if (loginLink) loginLink.hidden = Boolean(user)
    if (userSurface) userSurface.hidden = !user
    if (!user) {
      if (operationsLink) operationsLink.hidden = true
      closeMenu()
      return
    }

    let profileResult = await client
      .from("profiles")
      .select("display_name,avatar_url,signature")
      .eq("id", user.id)
      .maybeSingle()
    if (syncEpoch !== accountSyncEpoch) return
    if (profileResult.error)
      profileResult = await client
        .from("profiles")
        .select("display_name,avatar_url")
        .eq("id", user.id)
        .maybeSingle()
    if (syncEpoch !== accountSyncEpoch) return
    renderProfile(profileResult.data ?? null, user.email ?? "")
    const capabilityResult = await client.rpc("current_account_capabilities")
    if (syncEpoch !== accountSyncEpoch) return
    const capabilities = capabilityResult.data as {
      can_edit_site?: boolean
      can_manage_roles?: boolean
      can_moderate_comments?: boolean
      can_moderate_publications?: boolean
    } | null
    const canUseOperations = Boolean(
      !capabilityResult.error &&
      (capabilities?.can_edit_site ||
        capabilities?.can_manage_roles ||
        capabilities?.can_moderate_comments ||
        capabilities?.can_moderate_publications),
    )
    if (operationsLink) operationsLink.hidden = !canUseOperations
  }

  root.addEventListener("mouseenter", openMenu)
  root.addEventListener("mouseleave", scheduleClose)
  root.addEventListener("focusin", (event) => {
    const target = event.target as HTMLElement
    if (target !== toggle || target.matches(":focus-visible")) openMenu()
  })
  root.addEventListener("focusout", (event) => {
    if (!root.contains(event.relatedTarget as Node | null)) scheduleClose()
  })
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && panel && !panel.hidden) {
      event.preventDefault()
      closeMenu(true)
    }
  })
  toggle?.addEventListener("pointerdown", () => {
    toggleWasOpenOnPointerDown = panel ? !panel.hidden : false
  })
  toggle?.addEventListener("click", (event) => {
    event.stopPropagation()
    const shouldOpen =
      toggleWasOpenOnPointerDown === null ? panel?.hidden : !toggleWasOpenOnPointerDown
    toggleWasOpenOnPointerDown = null
    if (shouldOpen) openMenu()
    else closeMenu()
  })
  document.addEventListener("pointerdown", (event) => {
    if (!root.contains(event.target as Node)) closeMenu()
  })
  signout?.addEventListener("click", async () => {
    signout.disabled = true
    signout.textContent = "正在退出…"
    await client?.auth.signOut()
    location.assign("/account/")
  })
  window.addEventListener("wouldkeep:profile-updated", (event) => {
    const detail = (
      event as CustomEvent<{
        display_name?: string
        avatar_url?: string
        signature?: string
        email?: string
      }>
    ).detail
    renderProfile(detail ?? null, detail?.email ?? email?.textContent ?? "")
  })

  try {
    client = await Promise.race([
      loadSupabaseClient(root.dataset.supabaseUrl ?? "", root.dataset.supabaseAnonKey ?? ""),
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 8000)),
    ])
  } catch {
    client = null
  }

  if (!client) {
    root.dataset.accountState = "signed-out"
    if (loginLink) loginLink.hidden = false
    if (userSurface) userSurface.hidden = true
    return
  }

  await syncAccount()
  client.auth.onAuthStateChange(() => {
    void syncAccount()
  })
}

document.addEventListener("nav", initAccountMenu)
window.addEventListener("load", initAccountMenu, { once: true })
