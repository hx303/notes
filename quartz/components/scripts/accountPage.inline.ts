import {
  clearAiSettingsDraft,
  clearProfileSettingsDraft,
  readAiSettingsDraft,
  readProfileSettingsDraft,
  writeAiSettingsDraft,
  writeProfileSettingsDraft,
  type AiSettingsDraft,
  type ProfileSettingsDraft,
} from "./accountSettingsPersistence.ts"
import { bindDocumentEditorRoute } from "./editorDraftRoute.ts"
import {
  assertImportComplexity,
  createLatestImportRequestGate,
  decodeUtf8Markdown,
  inspectDocxArchive,
  redactRemoteImportImages,
  validateImportFile,
} from "./importDraft.ts"

const localDraftKey = (userId: string, documentId = "new") =>
  `wouldkeep:editor-draft:${userId}:${documentId}`

const loadExternalScript = (
  src: string,
  globalName: string,
  timeoutMs = 0,
  validate?: (value: any) => boolean,
) => {
  const globalWindow = window as any
  if (globalWindow[globalName] && (!validate || validate(globalWindow[globalName])))
    return Promise.resolve(globalWindow[globalName])
  if (globalWindow[globalName] && validate) delete globalWindow[globalName]
  globalWindow.__wouldkeepScriptLoads ??= {}
  if (globalWindow.__wouldkeepScriptLoads[src]) return globalWindow.__wouldkeepScriptLoads[src]
  const request = new Promise((resolve, reject) => {
    const script = document.createElement("script")
    let settled = false
    let timeout: number | undefined
    const fail = (error: Error) => {
      if (settled) return
      settled = true
      if (timeout) window.clearTimeout(timeout)
      delete globalWindow.__wouldkeepScriptLoads[src]
      script.onload = null
      script.onerror = null
      script.remove()
      reject(error)
    }
    script.src = src
    script.async = true
    script.onload = () => {
      if (!globalWindow[globalName] || (validate && !validate(globalWindow[globalName])))
        return fail(new Error(`missing or invalid ${globalName}`))
      if (settled) return
      settled = true
      if (timeout) window.clearTimeout(timeout)
      resolve(globalWindow[globalName])
    }
    script.onerror = () => fail(new Error(`failed ${src}`))
    document.head.appendChild(script)
    if (timeoutMs > 0)
      timeout = window.setTimeout(() => fail(new Error(`timeout ${src}`)), timeoutMs)
  })
  globalWindow.__wouldkeepScriptLoads[src] = request
  return request.catch((error) => {
    delete globalWindow.__wouldkeepScriptLoads[src]
    throw error
  })
}

const loadExternalStyle = (href: string) => {
  const existing = document.querySelector<HTMLLinkElement>(`link[href="${href}"]`)
  if (existing) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = href
    link.onload = () => resolve()
    link.onerror = () => reject(new Error(`failed ${href}`))
    document.head.appendChild(link)
  })
}

const importVendorUrl = (filename: string) => `/static/vendor/workspace-import/${filename}`
const isExpectedDOMPurify = (value: any) => value?.version === "3.4.12"
const loadImportPreviewLibraries = async () => {
  const [markedLibrary, purifier] = await Promise.all([
    loadExternalScript(importVendorUrl("marked-15.0.12.umd.js"), "marked", 12_000),
    loadExternalScript(
      importVendorUrl("purify-3.4.12.min.js"),
      "DOMPurify",
      12_000,
      isExpectedDOMPurify,
    ),
  ])
  return { markedLibrary: markedLibrary as any, purifier: purifier as any }
}
const loadMammoth = () =>
  loadExternalScript(importVendorUrl("mammoth-1.12.0.min.js"), "mammoth", 12_000) as Promise<any>
const loadTurndown = () =>
  loadExternalScript(
    importVendorUrl("turndown-7.2.0.js"),
    "TurndownService",
    12_000,
  ) as Promise<any>

const renderMarkdownInto = async (
  target: HTMLElement,
  markdown: string,
  options: { shouldRender?: () => boolean; localImagesOnly?: boolean } = {},
) => {
  const shouldRender = options.shouldRender ?? (() => true)
  const source = markdown.trim()
  if (!shouldRender()) return
  if (!source) {
    target.textContent = "正文还没有内容。"
    return
  }
  try {
    let previewLibraries: Awaited<ReturnType<typeof loadImportPreviewLibraries>>
    try {
      previewLibraries = await loadImportPreviewLibraries()
    } catch {
      if (options.localImagesOnly) throw new Error("preview-dependency-unavailable")
      throw new Error("preview-fallback")
    }
    const { markedLibrary, purifier } = previewLibraries
    if (!shouldRender()) return
    const previewSource = options.localImagesOnly ? redactRemoteImportImages(source) : source
    const previewHtml = await markedLibrary.parse(previewSource, { gfm: true, breaks: true })
    if (!shouldRender()) return
    assertImportComplexity({ htmlCharacters: previewHtml.length })
    const inertTemplate = document.createElement("template")
    inertTemplate.innerHTML = previewHtml
    const fragment = purifier.sanitize(inertTemplate.content, {
      ALLOWED_TAGS: [
        "p",
        "br",
        "hr",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "ul",
        "ol",
        "li",
        "blockquote",
        "pre",
        "code",
        "strong",
        "em",
        "del",
        "a",
        "table",
        "thead",
        "tbody",
        "tfoot",
        "tr",
        "th",
        "td",
        "img",
      ],
      ALLOWED_ATTR: ["href", "title", "alt", "src", "colspan", "rowspan", "scope", "class"],
      FORBID_TAGS: [
        "style",
        "script",
        "iframe",
        "object",
        "embed",
        "form",
        "svg",
        "math",
        "picture",
        "source",
        "video",
        "audio",
        "track",
      ],
      FORBID_ATTR: ["style", "onerror", "onload", "srcset", "poster"],
      RETURN_DOM_FRAGMENT: true,
    })
    assertImportComplexity({ domNodes: fragment.querySelectorAll("*").length })
    fragment.querySelectorAll("a").forEach((link: HTMLAnchorElement) => {
      const href = link.getAttribute("href") ?? ""
      if (!/^(https?:|mailto:|\/|#)/i.test(href)) link.removeAttribute("href")
      if (/^https?:/i.test(href)) {
        link.target = "_blank"
        link.rel = "noreferrer"
      }
    })
    fragment.querySelectorAll("img").forEach((image: HTMLImageElement) => {
      const src = image.getAttribute("src") ?? ""
      const isLocalImage = /^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(src)
      const isRemoteImage = /^https?:\/\//i.test(src)
      if (options.localImagesOnly && !isLocalImage) {
        const placeholder = document.createElement("span")
        placeholder.className = "knowledge-import-remote-image"
        placeholder.textContent = "远程图片未加载"
        image.replaceWith(placeholder)
      } else if (!isLocalImage && !isRemoteImage) image.remove()
      else image.loading = "lazy"
    })
    if (!shouldRender()) return
    target.replaceChildren(fragment)
  } catch (error) {
    if (
      options.localImagesOnly ||
      (error instanceof Error && error.message === "content-too-large")
    )
      throw error
    if (shouldRender()) target.textContent = source
  }
}

type ImportedDraft = { title: string; body: string; imageCount: number; notes: string[] }

const loadClient = async (url: string, key: string) => {
  const globalWindow = window as any
  if (globalWindow.__supabaseClient) return globalWindow.__supabaseClient
  const factory =
    globalWindow.supabase ??
    (await loadExternalScript(
      "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.min.js",
      "supabase",
    ))
  if (!factory) return null
  const client = factory.createClient(url, key)
  globalWindow.__supabaseClient = client
  return client
}

type WorkspaceDocument = {
  id: string
  title: string
  topic?: string
  status: string
  visibility: string
  maturity: string
  revision: number
  updated_at: string
  deleted_at?: string | null
}

type WorkspaceSource = {
  kind: "web" | "personal"
  url: string
  title: string
  author: string
  note: string
}

type WorkspaceFormData = {
  title: string
  body: string
  topic: string
  maturity: string
  visibility: string
  tags: string
  prerequisites: string
  related: string
  documentId: string
  revision: number
  status: string
}

type PublicationState = {
  document_id: string
  audience: "public" | "unlisted"
  share_token?: string | null
  source_revision: number
  published_at: string
}

const init = async () => {
  const root = document.querySelector<HTMLElement>("[data-account-page]")
  if (!root || root.dataset.ready === "true") return
  root.dataset.ready = "true"

  const status = root.querySelector<HTMLElement>("[data-account-status]")
  const login = root.querySelector<HTMLFormElement>("[data-account-login]")
  const authPanel = root.querySelector<HTMLElement>("[data-auth-panel]")
  const forgotForm = root.querySelector<HTMLFormElement>("[data-account-forgot-form]")
  const recovery = root.querySelector<HTMLFormElement>("[data-account-recovery]")
  const verify = root.querySelector<HTMLElement>("[data-account-verify]")
  const verifyEmail = root.querySelector<HTMLElement>("[data-account-verify-email]")
  const emailSent = root.querySelector<HTMLElement>("[data-account-email-sent]")
  const forgotEmail = root.querySelector<HTMLElement>("[data-account-forgot-email]")
  const recoverySuccess = root.querySelector<HTMLElement>("[data-account-recovery-success]")
  const session = root.querySelector<HTMLElement>("[data-account-session]")
  const email = root.querySelector<HTMLElement>("[data-account-email]")
  const siteOwnerNavItems = root.querySelectorAll<HTMLElement>("[data-site-owner-nav]")
  const accountMode = root.dataset.accountMode ?? "signin"
  const workspace = accountMode === "workspace"
  const workspaceSection = root.dataset.workspaceSection ?? "overview"
  const workspaceOverview = root.querySelector<HTMLElement>("[data-workspace-overview]")
  const writeLauncher = root.querySelector<HTMLElement>("[data-write-launcher]")
  const profileSettings = root.querySelector<HTMLElement>("[data-profile-settings]")
  const aiSettings = root.querySelector<HTMLElement>("[data-ai-settings]")
  const aiSettingsForm = root.querySelector<HTMLFormElement>("[data-ai-settings-form]")
  const aiEnabled = root.querySelector<HTMLInputElement>("[data-ai-enabled]")
  const aiPrivateContent = root.querySelector<HTMLInputElement>("[data-ai-private-content]")
  const aiGroundingMode = root.querySelector<HTMLSelectElement>("[data-ai-grounding-mode]")
  const aiMonthlyBudget = root.querySelector<HTMLSelectElement>("[data-ai-monthly-budget]")
  const aiSettingsStatus = root.querySelector<HTMLElement>("[data-ai-settings-status]")
  const aiSave = root.querySelector<HTMLButtonElement>("[data-ai-save]")
  const aiTestGateway = root.querySelector<HTMLButtonElement>("[data-ai-test-gateway]")
  const aiGatewayStatus = root.querySelector<HTMLElement>("[data-ai-gateway-status]")
  const profileSettingsForm = root.querySelector<HTMLFormElement>("[data-profile-settings-form]")
  const profileAvatarInput = root.querySelector<HTMLInputElement>("[data-profile-avatar-input]")
  const profileAvatarPreview = root.querySelector<HTMLImageElement>("[data-profile-avatar-preview]")
  const profileAvatarFallback = root.querySelector<HTMLElement>("[data-profile-avatar-fallback]")
  const profileDisplayName = root.querySelector<HTMLInputElement>("[data-profile-display-name]")
  const profileSignature = root.querySelector<HTMLInputElement>("[data-profile-signature]")
  const profileBio = root.querySelector<HTMLTextAreaElement>("[data-profile-bio]")
  const profileLocation = root.querySelector<HTMLInputElement>("[data-profile-location]")
  const profileWebsite = root.querySelector<HTMLInputElement>("[data-profile-website]")
  const profileSignatureCount = root.querySelector<HTMLOutputElement>(
    "[data-profile-signature-count]",
  )
  const profileBioCount = root.querySelector<HTMLOutputElement>("[data-profile-bio-count]")
  const profileEmail = root.querySelector<HTMLElement>("[data-profile-email]")
  const profileSettingsStatus = root.querySelector<HTMLElement>("[data-profile-settings-status]")
  const profileSave = root.querySelector<HTMLButtonElement>("[data-profile-save]")
  const profileCardAvatar = root.querySelector<HTMLImageElement>("[data-profile-card-avatar]")
  const profileCardFallback = root.querySelector<HTMLElement>("[data-profile-card-fallback]")
  const profileCardName = root.querySelector<HTMLElement>("[data-profile-card-name]")
  const profileCardSignature = root.querySelector<HTMLElement>("[data-profile-card-signature]")
  const profileCardBio = root.querySelector<HTMLElement>("[data-profile-card-bio]")
  const profileCardLocationRow = root.querySelector<HTMLElement>("[data-profile-card-location-row]")
  const profileCardLocation = root.querySelector<HTMLElement>("[data-profile-card-location]")
  const profileCardWebsiteRow = root.querySelector<HTMLElement>("[data-profile-card-website-row]")
  const profileCardWebsite = root.querySelector<HTMLAnchorElement>("[data-profile-card-website]")
  const avatarCropDialog = root.querySelector<HTMLDialogElement>("[data-avatar-crop-dialog]")
  const avatarCropImage = root.querySelector<HTMLImageElement>("[data-avatar-crop-image]")
  const avatarCropZoom = root.querySelector<HTMLInputElement>("[data-avatar-crop-zoom]")
  const avatarCropStatus = root.querySelector<HTMLElement>("[data-avatar-crop-status]")
  const library = root.querySelector<HTMLElement>("[data-workspace-library]")
  const libraryList = root.querySelector<HTMLElement>("[data-library-list]")
  const libraryEmpty = root.querySelector<HTMLElement>("[data-library-empty]")
  const libraryTools = root.querySelector<HTMLElement>("[data-library-tools]")
  const librarySearch = root.querySelector<HTMLInputElement>("[data-library-search]")
  const libraryNoResults = root.querySelector<HTMLElement>("[data-library-no-results]")
  const libraryResultStatus = root.querySelector<HTMLElement>("[data-library-result-status]")
  const editor = root.querySelector<HTMLElement>("[data-editor-panel]")
  const history = root.querySelector<HTMLElement>("[data-editor-history]")
  const historyList = root.querySelector<HTMLElement>("[data-editor-history-list]")
  const form = root.querySelector<HTMLFormElement>("[data-editor-form]")
  const state = root.querySelector<HTMLElement>("[data-editor-state]")
  const sourceList = root.querySelector<HTMLElement>("[data-source-list]")
  const sourceEmpty = root.querySelector<HTMLElement>("[data-source-empty]")
  const sourceStatus = root.querySelector<HTMLElement>("[data-source-status]")
  const publicationStatus = root.querySelector<HTMLElement>("[data-publication-status]")
  const publishButton = root.querySelector<HTMLButtonElement>("[data-publish-document]")
  const unpublishButton = root.querySelector<HTMLButtonElement>("[data-unpublish-document]")
  const publicationLink = root.querySelector<HTMLAnchorElement>("[data-publication-link]")
  const copyPublicationLink = root.querySelector<HTMLButtonElement>("[data-copy-publication-link]")
  const saveButton = root.querySelector<HTMLButtonElement>("[data-save-document]")
  const importDialog = root.querySelector<HTMLDialogElement>("[data-knowledge-import]")
  const importFile = root.querySelector<HTMLInputElement>("[data-import-file]")
  const importDropzone = root.querySelector<HTMLElement>("[data-import-dropzone]")
  const importResult = root.querySelector<HTMLElement>("[data-import-result]")
  const importStatus = root.querySelector<HTMLElement>("[data-import-status]")
  const importConfirm = root.querySelector<HTMLButtonElement>("[data-import-confirm]")
  const importRetry = root.querySelector<HTMLButtonElement>("[data-import-retry]")
  const importFileContext = root.querySelector<HTMLElement>("[data-import-file-context]")
  const importPreview = root.querySelector<HTMLElement>("[data-import-preview]")
  const flatWorkbench = root.querySelector<HTMLElement>("[data-flat-workbench]")
  const flatForm = root.querySelector<HTMLFormElement>("[data-flat-workbench-form]")
  const flatTitle = root.querySelector<HTMLInputElement>("[data-flat-title]")
  const flatBody = root.querySelector<HTMLTextAreaElement>("[data-flat-body]")
  const flatStatus = root.querySelector<HTMLElement>("[data-flat-status]")
  const flatSave = root.querySelector<HTMLButtonElement>("[data-flat-save]")
  let client: any = null
  let currentUser: any = null
  let autosaveTimer: number | undefined
  let workspaceDocuments: WorkspaceDocument[] = []
  let sourcesMigrationAvailable: boolean | null = null
  let currentPublication: PublicationState | null = null
  let importedDraft: ImportedDraft | null = null
  const importRequests = createLatestImportRequestGate()
  let importConfirming = false
  let lastImportFile: File | null = null
  let currentProfileAvatarUrl = ""
  let profilePreviewObjectUrl = ""
  let profileCropSourceUrl = ""
  let profileCroppedBlob: Blob | null = null
  let profileCropper: any = null
  let profilePersonalizationAvailable = true
  let authSubscription: { unsubscribe?: () => void } | null = null
  let onlineHandler: (() => void) | null = null
  let disposed = false

  window.addCleanup(() => {
    disposed = true
    importRequests.invalidate()
    importedDraft = null
    if (autosaveTimer) window.clearTimeout(autosaveTimer)
    authSubscription?.unsubscribe?.()
    if (onlineHandler) window.removeEventListener("online", onlineHandler)
    profileCropper?.destroy?.()
    if (profilePreviewObjectUrl) URL.revokeObjectURL(profilePreviewObjectUrl)
    if (profileCropSourceUrl) URL.revokeObjectURL(profileCropSourceUrl)
  })

  const resolveAuthState = () => {
    if (disposed) return
    root.dataset.authState = "ready"
    authPanel?.setAttribute("aria-busy", "false")
  }

  const setStatus = (message: string, type: "info" | "error" | "success" = "info") => {
    if (status) status.textContent = message
    if (status) status.dataset.state = message ? type : ""
    if (status) status.setAttribute("role", type === "error" ? "alert" : "status")
    if (status) status.setAttribute("aria-live", type === "error" ? "assertive" : "polite")
  }

  const ensureClient = async (announce = false) => {
    if (client) return client
    if (announce) setStatus("正在重新连接登录服务…")
    try {
      const connected = await Promise.race([
        loadClient(root.dataset.supabaseUrl ?? "", root.dataset.supabaseAnonKey ?? ""),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
      ])
      if (disposed) return null
      client = connected
    } catch {
      client = null
    }
    if (!client && announce)
      setStatus("登录服务仍未连接；输入内容已经保留，请检查网络后再次提交。", "error")
    return client
  }

  const setProfileStatus = (message: string, type: "" | "error" | "success" = "") => {
    if (!profileSettingsStatus) return
    profileSettingsStatus.textContent = message
    profileSettingsStatus.dataset.state = type
  }

  const setAiStatus = (message: string, type: "" | "error" | "success" = "") => {
    if (!aiSettingsStatus) return
    aiSettingsStatus.textContent = message
    aiSettingsStatus.dataset.state = type
  }

  const setAiGatewayStatus = (message: string, type: "" | "error" | "success" = "") => {
    if (!aiGatewayStatus) return
    aiGatewayStatus.textContent = message
    aiGatewayStatus.dataset.state = type
  }

  const updateAiControls = () => {
    if (!aiPrivateContent) return
    aiPrivateContent.disabled = !aiEnabled?.checked
    if (!aiEnabled?.checked) aiPrivateContent.checked = false
  }

  const currentAiSettingsDraft = (): Omit<AiSettingsDraft, "version" | "savedAt"> => ({
    enabled: Boolean(aiEnabled?.checked),
    allowPrivateContent: Boolean(aiEnabled?.checked && aiPrivateContent?.checked),
    monthlyBudgetCents: Number(
      aiMonthlyBudget?.value ?? 0,
    ) as AiSettingsDraft["monthlyBudgetCents"],
    groundingMode: aiGroundingMode?.value === "knowledge_base" ? "knowledge_base" : "selected_only",
  })

  const applyAiSettingsDraft = (draft: Omit<AiSettingsDraft, "version" | "savedAt">) => {
    if (aiEnabled) aiEnabled.checked = draft.enabled
    if (aiPrivateContent) aiPrivateContent.checked = draft.allowPrivateContent
    if (aiGroundingMode) aiGroundingMode.value = draft.groundingMode
    if (aiMonthlyBudget) aiMonthlyBudget.value = String(draft.monthlyBudgetCents)
    updateAiControls()
  }

  const persistAiSettingsDraft = () => {
    if (!currentUser) return
    writeAiSettingsDraft(sessionStorage, currentUser.id, currentAiSettingsDraft())
    setAiStatus("有未保存的 AI 设置；切换页面后会保留，点击保存后才会生效。")
  }

  const loadAiSettings = async () => {
    if (!client || !currentUser || !aiSettingsForm) return
    const ownerId = currentUser.id
    const result = await client
      .from("ai_preferences")
      .select("enabled,allow_private_content,monthly_budget_cents,grounding_mode,updated_at")
      .eq("owner_id", ownerId)
      .maybeSingle()
    if (disposed || currentUser?.id !== ownerId) return
    if (result.error) {
      const missingSchema = String(result.error.message ?? "")
        .toLowerCase()
        .includes("ai_preferences")
      const draft = readAiSettingsDraft(sessionStorage, ownerId)
      if (draft) applyAiSettingsDraft(draft)
      setAiStatus(
        missingSchema
          ? "AI 设置尚未启用，请先在 Supabase 执行 20260718000900_ai_assistant_foundation.sql。"
          : draft
            ? "云端设置暂时无法读取，已恢复本机未保存的设置。"
            : "云端设置暂时无法读取，请检查网络后重试。",
        "error",
      )
      if (aiSave) aiSave.disabled = missingSchema
      return
    }
    applyAiSettingsDraft({
      enabled: Boolean(result.data?.enabled),
      allowPrivateContent: Boolean(result.data?.allow_private_content),
      groundingMode:
        result.data?.grounding_mode === "knowledge_base" ? "knowledge_base" : "selected_only",
      monthlyBudgetCents: Number(
        result.data?.monthly_budget_cents ?? 0,
      ) as AiSettingsDraft["monthlyBudgetCents"],
    })
    const draft = readAiSettingsDraft(sessionStorage, ownerId)
    if (draft) applyAiSettingsDraft(draft)
    if (aiSave) aiSave.disabled = false
    setAiStatus(
      draft
        ? "已恢复尚未保存的 AI 设置；点击保存后才会生效。"
        : result.data
          ? "已读取你的 AI 设置。"
          : "当前使用安全默认设置：全部关闭。",
    )
  }

  const safeProfileAvatarUrl = (value = "") => {
    try {
      const parsed = new URL(value)
      return parsed.protocol === "blob:" ||
        parsed.protocol === "https:" ||
        (parsed.protocol === "http:" && parsed.hostname === "localhost")
        ? parsed.href
        : ""
    } catch {
      return ""
    }
  }

  const renderProfileAvatar = (avatarUrl: string, displayName: string) => {
    const safeUrl = safeProfileAvatarUrl(avatarUrl)
    if (profileAvatarPreview) {
      profileAvatarPreview.hidden = !safeUrl
      if (safeUrl) profileAvatarPreview.src = safeUrl
      else profileAvatarPreview.removeAttribute("src")
    }
    if (profileAvatarFallback) {
      profileAvatarFallback.hidden = Boolean(safeUrl)
      profileAvatarFallback.textContent = [...displayName.trim()][0] || "我"
    }
    if (profileCardAvatar) {
      profileCardAvatar.hidden = !safeUrl
      if (safeUrl) profileCardAvatar.src = safeUrl
      else profileCardAvatar.removeAttribute("src")
    }
    if (profileCardFallback) {
      profileCardFallback.hidden = Boolean(safeUrl)
      profileCardFallback.textContent = [...displayName.trim()][0] || "我"
    }
  }

  const normalizedProfileWebsite = (value = "") => {
    const trimmed = value.trim()
    if (!trimmed) return ""
    try {
      const parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
      return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : ""
    } catch {
      return ""
    }
  }

  const updateProfilePreview = () => {
    const displayName = profileDisplayName?.value.trim() || "我的账户"
    const signature = profileSignature?.value.trim() ?? ""
    const bio = profileBio?.value.trim() ?? ""
    const location = profileLocation?.value.trim() ?? ""
    const website = normalizedProfileWebsite(profileWebsite?.value ?? "")
    if (profileCardName) profileCardName.textContent = displayName
    if (profileCardSignature) profileCardSignature.textContent = signature || "尚未填写个性签名"
    if (profileCardBio) profileCardBio.textContent = bio || "个人简介会显示在这里。"
    if (profileCardLocationRow) profileCardLocationRow.hidden = !location
    if (profileCardLocation) profileCardLocation.textContent = location
    if (profileCardWebsiteRow) profileCardWebsiteRow.hidden = !website
    if (profileCardWebsite) {
      profileCardWebsite.href = website || "#"
      profileCardWebsite.textContent = website ? new URL(website).hostname : ""
    }
    if (profileSignatureCount)
      profileSignatureCount.textContent = `${profileSignature?.value.length ?? 0} / 80`
    if (profileBioCount) profileBioCount.textContent = `${profileBio?.value.length ?? 0} / 300`
    renderProfileAvatar(profilePreviewObjectUrl || currentProfileAvatarUrl, displayName)
  }

  const currentProfileSettingsDraft = (): Omit<ProfileSettingsDraft, "version" | "savedAt"> => ({
    displayName: profileDisplayName?.value ?? "",
    signature: profileSignature?.value ?? "",
    bio: profileBio?.value ?? "",
    location: profileLocation?.value ?? "",
    website: profileWebsite?.value ?? "",
  })

  const applyProfileSettingsDraft = (draft: Omit<ProfileSettingsDraft, "version" | "savedAt">) => {
    if (profileDisplayName) profileDisplayName.value = draft.displayName
    if (profileSignature) profileSignature.value = draft.signature
    if (profileBio) profileBio.value = draft.bio
    if (profileLocation) profileLocation.value = draft.location
    if (profileWebsite) profileWebsite.value = draft.website
    updateProfilePreview()
  }

  const persistProfileSettingsDraft = () => {
    if (!currentUser) return
    writeProfileSettingsDraft(sessionStorage, currentUser.id, currentProfileSettingsDraft())
    setProfileStatus("有未保存的个人资料；切换页面后会保留。")
  }

  const loadProfileSettings = async () => {
    if (!client || !currentUser || !profileSettingsForm) return
    const ownerId = currentUser.id
    let result = await client
      .from("profiles")
      .select("display_name,avatar_url,signature,bio,location,website_url")
      .eq("id", ownerId)
      .maybeSingle()
    profilePersonalizationAvailable = !result.error
    if (result.error)
      result = await client
        .from("profiles")
        .select("display_name,avatar_url")
        .eq("id", ownerId)
        .maybeSingle()
    if (disposed || currentUser?.id !== ownerId) return
    if (result.error) {
      setProfileStatus("暂时无法读取个人资料，请刷新后重试。", "error")
      return
    }
    const displayName =
      result.data?.display_name?.trim() || currentUser.email?.split("@")[0] || "我的账户"
    currentProfileAvatarUrl = result.data?.avatar_url ?? ""
    if (profileDisplayName) profileDisplayName.value = displayName
    if (profileSignature) profileSignature.value = result.data?.signature ?? ""
    if (profileBio) profileBio.value = result.data?.bio ?? ""
    if (profileLocation) profileLocation.value = result.data?.location ?? ""
    if (profileWebsite) profileWebsite.value = result.data?.website_url ?? ""
    if (profileEmail) profileEmail.textContent = currentUser.email ?? "—"
    updateProfilePreview()
    const draft = readProfileSettingsDraft(sessionStorage, ownerId)
    if (draft) applyProfileSettingsDraft(draft)
    setProfileStatus(
      draft
        ? "已恢复尚未保存的个人资料；点击保存后才会同步。"
        : profilePersonalizationAvailable
          ? ""
          : "个性签名等扩展资料尚未启用；请先执行最新的个人资料迁移文件。",
      draft || profilePersonalizationAvailable ? "" : "error",
    )
  }

  const friendlyAuthError = (message = "") => {
    const normalized = message.toLowerCase()
    if (normalized.includes("invalid login credentials")) return "邮箱或密码不正确，请重新检查。"
    if (normalized.includes("email not confirmed")) return "请先打开验证邮件完成邮箱验证。"
    if (normalized.includes("user already registered"))
      return "这个邮箱已经注册，请直接登录或找回密码。"
    if (normalized.includes("password") && normalized.includes("characters"))
      return "密码至少需要 8 个字符。"
    if (normalized.includes("rate limit")) return "尝试次数较多，请稍候几分钟再试。"
    return "暂时无法完成操作，请稍后再试。"
  }

  const submitAuth = async (event: Event) => {
    event.preventDefault()
    if (!login) return
    const data = new FormData(login)
    const value = String(data.get("email") ?? "")
    const password = String(data.get("password") ?? "")
    const mode = String(data.get("mode") ?? "signin")
    if (password.length < 8) {
      setStatus("密码至少需要 8 个字符。", "error")
      return
    }
    const submit = login.querySelector<HTMLButtonElement>("[data-account-submit]")
    const originalLabel = submit?.textContent ?? "继续"
    if (login.dataset.submitting === "true") return
    login.dataset.submitting = "true"
    login.setAttribute("aria-busy", "true")
    if (submit) {
      submit.disabled = true
      submit.textContent = mode === "signup" ? "正在创建…" : "正在登录…"
    }
    try {
      if (!(await ensureClient(true))) return
      watchAuthState()
      const result =
        mode === "signup"
          ? await client.auth.signUp({
              email: value,
              password,
              options: { emailRedirectTo: `${location.origin}/workspace/` },
            })
          : await client.auth.signInWithPassword({ email: value, password })
      if (result.error) {
        setStatus(friendlyAuthError(result.error.message), "error")
        return
      }
      if (mode === "signup") {
        if (result.data?.session) {
          location.assign("/workspace/")
          return
        }
        login.hidden = true
        if (verifyEmail) verifyEmail.textContent = value
        if (verify) verify.hidden = false
        setStatus("")
        return
      }
      location.assign("/workspace/")
    } catch {
      setStatus("网络连接中断，输入内容仍然保留；请检查网络后重试。", "error")
    } finally {
      delete login.dataset.submitting
      login.setAttribute("aria-busy", "false")
      if (submit) {
        submit.disabled = false
        submit.textContent = originalLabel
      }
    }
  }

  login?.addEventListener("submit", submitAuth)

  const formatDate = (value: string) => {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? "刚刚编辑" : `编辑于 ${date.toLocaleDateString("zh-CN")}`
  }

  const documentLabel = (document: WorkspaceDocument) => {
    const title = document.title.trim() || "未命名知识"
    const statusLabel =
      document.status === "published" ? "已发布" : document.deleted_at ? "回收站" : "草稿"
    return `${title} · ${statusLabel} · ${formatDate(document.updated_at)}`
  }

  const renderDocuments = (items: WorkspaceDocument[]) => {
    if (!libraryList || !libraryEmpty) return
    workspaceDocuments = items.filter((entry) => !entry.deleted_at)
    libraryList.replaceChildren()
    const hasDocuments = workspaceDocuments.length > 0
    libraryEmpty.hidden = hasDocuments
    if (libraryTools) libraryTools.hidden = !hasDocuments
    const query = librarySearch?.value.trim().toLocaleLowerCase() ?? ""
    const filter =
      root.querySelector<HTMLInputElement>("[name=library-filter]:checked")?.value ?? "all"
    const visibleItems = workspaceDocuments.filter((entry) => {
      const matchesQuery =
        !query || `${entry.title} ${entry.topic ?? ""}`.toLocaleLowerCase().includes(query)
      const matchesFilter =
        filter === "all" ||
        (filter === "published" ? entry.status === "published" : entry.status !== "published")
      return matchesQuery && matchesFilter
    })
    if (libraryNoResults) libraryNoResults.hidden = !hasDocuments || visibleItems.length > 0
    if (libraryResultStatus)
      libraryResultStatus.textContent = hasDocuments
        ? `显示 ${visibleItems.length} 条，共 ${workspaceDocuments.length} 条知识`
        : ""
    visibleItems.forEach((entry) => {
      const item = globalThis.document.createElement("button")
      item.type = "button"
      item.className = "workspace-library-item"
      item.dataset.documentId = entry.id
      item.textContent = documentLabel(entry)
      libraryList.appendChild(item)
    })
  }

  const loadVersions = async (documentId: string) => {
    if (!client || !currentUser || !history || !historyList) return
    const result = await client
      .from("document_versions")
      .select("version_no,snapshot,created_at")
      .eq("document_id", documentId)
      .eq("owner_id", currentUser.id)
      .order("version_no", { ascending: false })
      .limit(10)
    if (result.error || !result.data?.length) {
      history.hidden = true
      return
    }
    history.hidden = false
    historyList.replaceChildren()
    result.data.forEach(
      (version: { version_no: number; snapshot: Record<string, unknown>; created_at: string }) => {
        const button = globalThis.document.createElement("button")
        button.type = "button"
        button.className = "editor-history-item"
        button.textContent = `版本 ${version.version_no} · ${formatDate(version.created_at)}`
        button.addEventListener("click", () => {
          fillForm(version.snapshot)
          if (state) state.textContent = `已载入版本 ${version.version_no}，保存后会生成新版本`
        })
        historyList.appendChild(button)
      },
    )
  }

  const ensureKnowledgeBase = async () => {
    if (!client || !currentUser) return null
    const existing = await client
      .from("knowledge_bases")
      .select("id")
      .eq("owner_id", currentUser.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    if (existing.data?.id) return existing.data.id
    const created = await client
      .from("knowledge_bases")
      .insert({ owner_id: currentUser.id, name: "我的知识库", default_visibility: "private" })
      .select("id")
      .single()
    return created.data?.id ?? null
  }

  const loadDocuments = async () => {
    if (!client || !currentUser || !workspace) return
    const result = await client
      .from("documents")
      .select("id,title,topic,status,visibility,maturity,revision,updated_at,deleted_at")
      .eq("owner_id", currentUser.id)
      .order("updated_at", { ascending: false })
    if (result.error) {
      setStatus("云端知识库还没有准备好；请先在 Supabase 执行工作区迁移。")
      return
    }
    renderDocuments((result.data ?? []) as WorkspaceDocument[])
  }

  const loadCapabilities = async () => {
    if (!client || !currentUser || !workspace) return
    const result = await client.rpc("current_account_capabilities")
    const capabilities = result.data as { is_site_owner?: boolean; role?: string } | null
    const isSiteOwner = !result.error && capabilities?.is_site_owner === true
    siteOwnerNavItems.forEach((item) => {
      item.hidden = !isSiteOwner
    })
  }

  const fillForm = (data: Record<string, unknown>) => {
    if (!form) return
    for (const [name, value] of Object.entries(data)) {
      const field = form.elements.namedItem(name) as
        | HTMLInputElement
        | HTMLTextAreaElement
        | HTMLSelectElement
        | null
      if (field && value !== null && value !== undefined) field.value = String(value)
    }
  }

  const collectSources = (): WorkspaceSource[] => {
    if (!sourceList) return []
    return [...sourceList.querySelectorAll<HTMLElement>("[data-source-row]")].map((row) => ({
      kind: (row.querySelector<HTMLSelectElement>("[data-source-kind]")?.value === "personal"
        ? "personal"
        : "web") as WorkspaceSource["kind"],
      url: row.querySelector<HTMLInputElement>("[data-source-url]")?.value.trim() ?? "",
      title: row.querySelector<HTMLInputElement>("[data-source-title]")?.value.trim() ?? "",
      author: row.querySelector<HTMLInputElement>("[data-source-author]")?.value.trim() ?? "",
      note: row.querySelector<HTMLTextAreaElement>("[data-source-note]")?.value.trim() ?? "",
    }))
  }

  const syncSourceEmptyState = () => {
    if (sourceEmpty && sourceList) sourceEmpty.hidden = sourceList.childElementCount > 0
  }

  const addSourceRow = (source?: Partial<WorkspaceSource>, focus = false) => {
    if (!sourceList) return
    const row = globalThis.document.createElement("section")
    row.className = "source-row"
    row.dataset.sourceRow = ""
    row.innerHTML = `
      <div class="source-row-heading">
        <label><span>来源类型</span><select data-source-kind><option value="web">网页或文章</option><option value="personal">个人经验</option></select></label>
        <button type="button" class="source-remove" data-source-remove aria-label="移除这条来源">移除</button>
      </div>
      <label data-source-url-field><span>网址</span><input type="url" inputmode="url" data-source-url placeholder="https://..." /><small>只接受以 http:// 或 https:// 开头的网址。</small></label>
      <div class="source-row-grid">
        <label><span>标题</span><input data-source-title maxlength="240" placeholder="文章标题或经验名称" /></label>
        <label><span>作者 / 提供者</span><input data-source-author maxlength="160" placeholder="可选" /></label>
      </div>
      <label><span>这条来源说明了什么？</span><textarea rows="2" maxlength="1000" data-source-note placeholder="用一句话记录它与当前知识的关系（可选）"></textarea></label>`
    const kind = row.querySelector<HTMLSelectElement>("[data-source-kind]")!
    const url = row.querySelector<HTMLInputElement>("[data-source-url]")!
    const urlField = row.querySelector<HTMLElement>("[data-source-url-field]")!
    const title = row.querySelector<HTMLInputElement>("[data-source-title]")!
    const author = row.querySelector<HTMLInputElement>("[data-source-author]")!
    const note = row.querySelector<HTMLTextAreaElement>("[data-source-note]")!
    kind.value = source?.kind === "personal" ? "personal" : "web"
    url.value = source?.url ?? ""
    title.value = source?.title ?? ""
    author.value = source?.author ?? ""
    note.value = source?.note ?? ""
    const updateKind = () => {
      const isWeb = kind.value === "web"
      urlField.hidden = !isWeb
      url.required = isWeb
      title.placeholder = isWeb ? "文章标题（可选）" : "例如：三次实验后的观察"
    }
    kind.addEventListener("change", updateKind)
    row.querySelector<HTMLButtonElement>("[data-source-remove]")?.addEventListener("click", () => {
      row.remove()
      syncSourceEmptyState()
      if (sourceStatus) sourceStatus.textContent = "来源已从当前草稿移除；保存后同步到云端。"
      form?.dispatchEvent(new Event("input", { bubbles: true }))
    })
    updateKind()
    sourceList.appendChild(row)
    syncSourceEmptyState()
    if (focus) (kind.value === "web" ? url : title).focus()
  }

  const renderSources = (sources: Partial<WorkspaceSource>[] = []) => {
    sourceList?.replaceChildren()
    sources.forEach((source) => addSourceRow(source))
    syncSourceEmptyState()
    if (sourceStatus) sourceStatus.textContent = ""
  }

  const validateSources = () => {
    if ((sourceList?.childElementCount ?? 0) > 50) {
      if (sourceStatus)
        sourceStatus.textContent = "每条知识最多保留 50 条来源，请先合并或移除部分来源。"
      return false
    }
    for (const row of sourceList?.querySelectorAll<HTMLElement>("[data-source-row]") ?? []) {
      const kind = row.querySelector<HTMLSelectElement>("[data-source-kind]")?.value
      const url = row.querySelector<HTMLInputElement>("[data-source-url]")
      const title = row.querySelector<HTMLInputElement>("[data-source-title]")
      if (kind === "web") {
        try {
          const parsed = new URL(url?.value.trim() ?? "")
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
            throw new Error("protocol")
        } catch {
          if (sourceStatus)
            sourceStatus.textContent = "请为网页来源填写完整的 http:// 或 https:// 网址。"
          url?.focus()
          return false
        }
      } else if (!title?.value.trim()) {
        if (sourceStatus) sourceStatus.textContent = "请为个人经验写一个简短名称，方便以后辨认。"
        title?.focus()
        return false
      }
    }
    return true
  }

  const loadDocumentSources = async (documentId: string) => {
    if (!client || !currentUser) return
    const result = await client
      .from("document_sources")
      .select("kind,url,title,author,note")
      .eq("document_id", documentId)
      .eq("owner_id", currentUser.id)
      .order("sort_order", { ascending: true })
    if (result.error) {
      sourcesMigrationAvailable = false
      renderSources()
      return
    }
    sourcesMigrationAvailable = true
    renderSources((result.data ?? []) as WorkspaceSource[])
  }

  const saveDocumentSources = async (documentId: string) => {
    const sources = collectSources()
    if (!sources.length && sourcesMigrationAvailable !== true) return true
    if (!validateSources()) return false
    const result = await client.rpc("replace_document_sources", {
      p_document_id: documentId,
      p_sources: sources,
    })
    if (result.error) {
      sourcesMigrationAvailable = false
      if (sourceStatus)
        sourceStatus.textContent =
          "正文已保存，但来源尚未同步。请在 Supabase 执行 20260718000400_document_sources.sql。"
      setStatus("正文已保存；结构化来源迁移尚未启用，本地备份仍然保留。", "error")
      return false
    }
    sourcesMigrationAvailable = true
    if (sourceStatus)
      sourceStatus.textContent = sources.length
        ? `已保存 ${sources.length} 条来源。`
        : "来源已清空并同步。"
    return true
  }

  const writeLocalBackup = () => {
    if (!form) return
    const data = readForm()
    const backup = {
      ...Object.fromEntries(new FormData(form).entries()),
      __sources: collectSources(),
    }
    try {
      localStorage.setItem(
        localDraftKey(currentUser?.id ?? "anonymous", data.documentId || "new"),
        JSON.stringify(backup),
      )
    } catch {
      if (state)
        state.textContent = "文档较大，本地备份空间不足；内容仍在当前页面，请尽快保存到云端"
    }
  }

  const restoreLocalBackup = (documentId = "new") => {
    if (!form || !currentUser) return false
    const raw = localStorage.getItem(localDraftKey(currentUser.id, documentId))
    if (!raw) return false
    try {
      const backup = JSON.parse(raw) as Record<string, unknown> & { __sources?: WorkspaceSource[] }
      fillForm(backup)
      renderSources(Array.isArray(backup.__sources) ? backup.__sources : [])
      if (state) state.textContent = "已恢复本地备份，保存后会同步到云端"
      return true
    } catch {
      localStorage.removeItem(localDraftKey(currentUser.id, documentId))
      return false
    }
  }

  const readForm = (): WorkspaceFormData => {
    if (!form)
      return {
        title: "",
        body: "",
        topic: "",
        maturity: "seed",
        visibility: "private",
        tags: "",
        prerequisites: "",
        related: "",
        documentId: "",
        revision: 0,
        status: "draft",
      }
    const data = Object.fromEntries(new FormData(form).entries())
    return {
      title: String(data.title ?? ""),
      body: String(data.body ?? ""),
      topic: String(data.topic ?? ""),
      maturity: String(data.maturity ?? "seed"),
      visibility: String(data.visibility ?? "private"),
      tags: String(data.tags ?? ""),
      prerequisites: String(data.prerequisites ?? ""),
      related: String(data.related ?? ""),
      documentId: String(data.documentId ?? ""),
      revision: Number(data.revision ?? 0),
      status: String(data.status ?? "draft"),
    }
  }

  const saveTags = async (documentId: string, knowledgeBaseId: string, rawTags: string) => {
    if (!client || !currentUser) return
    const names = [
      ...new Set(
        rawTags
          .split(/[，,\n]/)
          .map((tag) => tag.trim())
          .filter(Boolean),
      ),
    ]
    await client
      .from("document_tags")
      .delete()
      .eq("document_id", documentId)
      .eq("owner_id", currentUser.id)
    for (const name of names) {
      const normalizedName = name.normalize("NFKC").toLocaleLowerCase()
      const tag = await client
        .from("tags")
        .upsert(
          {
            knowledge_base_id: knowledgeBaseId,
            owner_id: currentUser.id,
            name,
            normalized_name: normalizedName,
          },
          { onConflict: "knowledge_base_id,normalized_name" },
        )
        .select("id")
        .single()
      if (tag.data?.id)
        await client
          .from("document_tags")
          .upsert({ document_id: documentId, tag_id: tag.data.id, owner_id: currentUser.id })
    }
  }

  const loadLinkOptions = async (currentDocumentId = "") => {
    const datalist = root.querySelector<HTMLElement>("[data-knowledge-link-options]")
    if (!client || !currentUser || !datalist) return
    const result = await client
      .from("documents")
      .select("id,title")
      .eq("owner_id", currentUser.id)
      .neq("id", currentDocumentId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(30)
    datalist.replaceChildren()
    ;(result.data ?? []).forEach((item: { id: string; title: string }) => {
      const option = globalThis.document.createElement("option")
      option.value = item.title || "未命名知识"
      option.label = item.id
      datalist.appendChild(option)
    })
  }

  const loadTagOptions = async () => {
    const datalist = root.querySelector<HTMLElement>("[data-tag-options]")
    if (!client || !currentUser || !datalist) return
    const result = await client
      .from("tags")
      .select("name")
      .eq("owner_id", currentUser.id)
      .order("name", { ascending: true })
      .limit(100)
    datalist.replaceChildren()
    ;(result.data ?? []).forEach((item: { name: string }) => {
      const option = globalThis.document.createElement("option")
      option.value = item.name
      datalist.appendChild(option)
    })
  }

  const loadDocumentTags = async (documentId: string) => {
    if (!client || !currentUser || !form) return
    const result = await client
      .from("document_tags")
      .select("tags(name)")
      .eq("document_id", documentId)
      .eq("owner_id", currentUser.id)
    const names = (result.data ?? [])
      .map((item: { tags?: { name?: string } | null }) => item.tags?.name)
      .filter(Boolean)
    const field = form.elements.namedItem("tags") as HTMLInputElement | null
    if (field && names.length) field.value = names.join("，")
  }

  const saveLinks = async (
    documentId: string,
    rawTitles: string,
    relationType: "prerequisite" | "related",
  ) => {
    if (!client || !currentUser) return
    const titles = [
      ...new Set(
        rawTitles
          .split(/[，,\n]/)
          .map((title) => title.trim())
          .filter(Boolean),
      ),
    ]
    await client
      .from("document_links")
      .delete()
      .eq("from_document_id", documentId)
      .eq("owner_id", currentUser.id)
      .eq("relation_type", relationType)
    if (!titles.length) return
    const targets = await client
      .from("documents")
      .select("id,title")
      .eq("owner_id", currentUser.id)
      .in("title", titles)
      .is("deleted_at", null)
    const titleMap = new Map(
      (targets.data ?? []).map((target: { id: string; title: string }) => [
        target.title,
        target.id,
      ]),
    )
    const rows = titles
      .map((title) => titleMap.get(title))
      .filter((id): id is string => Boolean(id) && id !== documentId)
      .map((toDocumentId) => ({
        from_document_id: documentId,
        to_document_id: toDocumentId,
        owner_id: currentUser.id,
        relation_type: relationType,
      }))
    if (rows.length) await client.from("document_links").upsert(rows)
  }

  const loadDocumentLinks = async (documentId: string) => {
    if (!client || !currentUser || !form) return
    const result = await client
      .from("document_links")
      .select("relation_type,to_document_id,documents!document_links_to_document_id_fkey(title)")
      .eq("from_document_id", documentId)
      .eq("owner_id", currentUser.id)
    const groups: Record<string, string[]> = { prerequisite: [], related: [] }
    ;(result.data ?? []).forEach(
      (item: { relation_type: string; documents?: { title?: string } | null }) => {
        const title = item.documents?.title
        if (title && groups[item.relation_type]) groups[item.relation_type].push(title)
      },
    )
    for (const [name, values] of [
      ["prerequisites", groups.prerequisite],
      ["related", groups.related],
    ] as const) {
      const field = form.elements.namedItem(name) as HTMLInputElement | null
      if (field && values.length) field.value = values.join("，")
    }
  }

  const publicationUrl = (publication: PublicationState) =>
    publication.audience === "unlisted" && publication.share_token
      ? `${location.origin}/knowledge/?share=${encodeURIComponent(publication.share_token)}`
      : `${location.origin}/knowledge/?id=${encodeURIComponent(publication.document_id)}`

  const updatePublicationUI = (
    publication: PublicationState | null,
    currentRevision = readForm().revision,
  ) => {
    currentPublication = publication
    if (!publication) {
      if (publicationStatus)
        publicationStatus.textContent =
          "先保存草稿并选择“持链接可见”或“公开到知识网络”。发布是一个单独动作。"
      if (publishButton) {
        publishButton.hidden = false
        publishButton.textContent = "发布这条知识"
      }
      if (unpublishButton) unpublishButton.hidden = true
      if (publicationLink) publicationLink.hidden = true
      if (copyPublicationLink) copyPublicationLink.hidden = true
      if (saveButton) saveButton.textContent = "保存为草稿"
      return
    }
    const audience = publication.audience === "public" ? "已公开到知识网络" : "已通过链接分享"
    const pending = currentRevision > Number(publication.source_revision)
    if (publicationStatus)
      publicationStatus.textContent = pending
        ? `${audience}；公开页仍是第 ${publication.source_revision} 版，当前修改尚未更新。`
        : `${audience}；读者看到的是第 ${publication.source_revision} 版。`
    if (publishButton) {
      publishButton.hidden = false
      publishButton.textContent = pending ? "更新公开版本" : "重新发布当前版本"
    }
    if (unpublishButton) unpublishButton.hidden = false
    if (publicationLink) {
      publicationLink.href = publicationUrl(publication)
      publicationLink.hidden = false
    }
    if (copyPublicationLink) copyPublicationLink.hidden = false
    if (saveButton) saveButton.textContent = "保存修改（不会自动更新公开页）"
  }

  const loadPublication = async (documentId: string, revision: number) => {
    if (!client || !currentUser) return
    const result = await client
      .from("document_publications")
      .select("document_id,audience,share_token,source_revision,published_at")
      .eq("document_id", documentId)
      .eq("owner_id", currentUser.id)
      .maybeSingle()
    if (result.error) {
      currentPublication = null
      if (publicationStatus)
        publicationStatus.textContent =
          "正式发布功能尚未启用；请执行 20260718000500_publication_flow.sql。"
      return
    }
    updatePublicationUI(result.data as PublicationState | null, revision)
  }

  const publishCurrentDocument = async () => {
    if (!client || !currentUser || !form) return
    const beforeSave = readForm()
    if (!beforeSave.title.trim() || !beforeSave.body.trim()) {
      if (publicationStatus) publicationStatus.textContent = "发布前需要填写标题和正文。"
      const missingField = form.elements.namedItem(beforeSave.title.trim() ? "body" : "title")
      if (missingField instanceof HTMLElement) missingField.focus()
      return
    }
    if (beforeSave.visibility === "private") {
      if (publicationStatus)
        publicationStatus.textContent = "请选择“持链接可见”或“公开到知识网络”，再执行发布。"
      root
        .querySelector<HTMLDetailsElement>("[data-editor-section=sharing]")
        ?.setAttribute("open", "")
      return
    }
    if (publishButton) {
      publishButton.disabled = true
      publishButton.textContent = "正在准备阅读版本…"
    }
    try {
      if (autosaveTimer) window.clearTimeout(autosaveTimer)
      writeLocalBackup()
      if (!(await saveDocument())) return
      const data = readForm()
      if (!data.documentId) return
      const audience = data.visibility === "unlisted" ? "unlisted" : "public"
      const result = await client.rpc("publish_document", {
        p_document_id: data.documentId,
        p_audience: audience,
      })
      if (result.error || !result.data) {
        if (publicationStatus)
          publicationStatus.textContent = result.error?.message?.includes("does not exist")
            ? "发布迁移尚未执行；请运行 20260718000500_publication_flow.sql。"
            : "发布失败，私人草稿仍已安全保存。请稍后重试。"
        return
      }
      const statusField = form.elements.namedItem("status") as HTMLInputElement | null
      if (statusField) statusField.value = "published"
      updatePublicationUI(result.data as PublicationState, data.revision)
      setStatus(audience === "public" ? "已公开到知识网络。" : "持链接阅读版本已生成。", "success")
      await loadDocuments()
    } finally {
      if (publishButton) {
        publishButton.disabled = false
        const pending =
          currentPublication && readForm().revision > Number(currentPublication.source_revision)
        publishButton.textContent = currentPublication
          ? pending
            ? "更新公开版本"
            : "重新发布当前版本"
          : "发布这条知识"
      }
    }
  }

  const unpublishCurrentDocument = async () => {
    if (!client || !currentUser || !form || !currentPublication) return
    if (
      !window.confirm(
        "撤回后，当前公开页或分享链接会立即失效。私人草稿和历史版本仍会保留。确定撤回吗？",
      )
    )
      return
    if (unpublishButton) {
      unpublishButton.disabled = true
      unpublishButton.textContent = "正在撤回…"
    }
    const documentId = readForm().documentId
    const result = await client.rpc("unpublish_document", { p_document_id: documentId })
    if (unpublishButton) {
      unpublishButton.disabled = false
      unpublishButton.textContent = "撤回发布"
    }
    if (result.error || result.data !== true) {
      if (publicationStatus)
        publicationStatus.textContent = "撤回失败，原阅读页可能仍然在线。请检查网络后重试。"
      return
    }
    const statusField = form.elements.namedItem("status") as HTMLInputElement | null
    if (statusField) statusField.value = "draft"
    const privateOption = form.querySelector<HTMLInputElement>("[name=visibility][value=private]")
    if (privateOption) privateOption.checked = true
    updatePublicationUI(null)
    setStatus("发布已撤回；私人草稿仍然保留。", "success")
    await loadDocuments()
  }

  const saveDocument = async () => {
    if (!form || !currentUser || !client) return false
    const data = readForm()
    const knowledgeBaseId = await ensureKnowledgeBase()
    if (!knowledgeBaseId) return false
    const visibility =
      data.visibility === "public" ||
      data.visibility === "unlisted" ||
      data.visibility === "private"
        ? data.visibility
        : "private"
    const documentStatus = data.status === "published" ? "published" : "draft"
    const payload = {
      title: data.title,
      body: data.body,
      topic: data.topic,
      maturity: data.maturity,
      owner_id: currentUser.id,
      knowledge_base_id: knowledgeBaseId,
      status: documentStatus,
      visibility,
    }
    const result = data.documentId
      ? await client
          .from("documents")
          .update({ ...payload, revision: data.revision + 1 })
          .eq("id", data.documentId)
          .eq("owner_id", currentUser.id)
          .eq("revision", data.revision)
          .select("id,revision")
          .maybeSingle()
      : await client.from("documents").insert(payload).select("id,revision").single()
    if (result.error) {
      setStatus("云端保存失败，已保留本地备份；请检查工作区迁移是否已执行。")
      return false
    }
    if (data.documentId && !result.data) {
      setStatus("这条知识在其他标签页已被修改，请重新加载后再保存。")
      if (state) state.textContent = "发现版本冲突"
      return false
    }
    if (!data.documentId && result.data?.id) {
      const field = form.elements.namedItem("documentId") as HTMLInputElement | null
      if (field) field.value = result.data.id
      window.history.replaceState(
        window.history.state,
        "",
        bindDocumentEditorRoute(window.location.href, result.data.id),
      )
    }
    if (result.data?.revision !== undefined) {
      const revision = form.elements.namedItem("revision") as HTMLInputElement | null
      if (revision) revision.value = String(result.data.revision)
    }
    if (result.data?.id && currentUser) {
      await client.from("document_versions").insert({
        document_id: result.data.id,
        owner_id: currentUser.id,
        created_by: currentUser.id,
        version_no: result.data.revision ?? 0,
        snapshot: {
          title: data.title,
          body: data.body,
          topic: data.topic,
          maturity: data.maturity,
          visibility: payload.visibility,
        },
      })
      await saveTags(result.data.id, knowledgeBaseId!, data.tags ?? "")
      await saveLinks(result.data.id, data.prerequisites ?? "", "prerequisite")
      await saveLinks(result.data.id, data.related ?? "", "related")
      if (!(await saveDocumentSources(result.data.id))) {
        await loadDocuments()
        if (state) state.textContent = "正文已保存，来源待同步"
        return false
      }
    }
    localStorage.removeItem(localDraftKey(currentUser.id, data.documentId || "new"))
    updatePublicationUI(currentPublication, Number(result.data?.revision ?? data.revision))
    await loadDocuments()
    return true
  }

  const queueAutosave = () => {
    if (!form || !currentUser || !client) return
    if (autosaveTimer) window.clearTimeout(autosaveTimer)
    autosaveTimer = window.setTimeout(async () => {
      if (state) state.textContent = "正在自动保存…"
      if (await saveDocument()) {
        if (state) state.textContent = "已自动保存到云端"
      }
    }, 1000)
  }

  const openDocument = async (documentId: string) => {
    if (!client || !currentUser || !form) return
    const result = await client
      .from("documents")
      .select("id,title,body,topic,maturity,status,visibility,revision")
      .eq("id", documentId)
      .eq("owner_id", currentUser.id)
      .single()
    if (result.error) {
      setStatus("这条知识暂时无法打开，请刷新后重试。")
      return
    }
    fillForm(result.data ?? {})
    if (writeLauncher) writeLauncher.hidden = true
    if (flatWorkbench) flatWorkbench.hidden = true
    if (editor) editor.hidden = false
    if (state) state.textContent = "已加载云端草稿"
    await loadVersions(documentId)
    await loadLinkOptions(documentId)
    await loadDocumentTags(documentId)
    await loadDocumentLinks(documentId)
    await loadDocumentSources(documentId)
    await loadPublication(documentId, Number(result.data?.revision ?? 0))
    editor?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const sync = async () => {
    if (disposed) return
    try {
      try {
        currentUser = client ? ((await client.auth.getUser()).data?.user ?? null) : null
      } catch {
        currentUser = null
        setStatus("登录状态暂时无法确认；输入入口和内容都已保留，请检查网络后重试。", "error")
        return
      }
      if (disposed) return
      if (session) session.hidden = !currentUser || (accountMode !== "signin" && !workspace)
      if (login) login.hidden = Boolean(currentUser)
      if (email) email.textContent = currentUser?.email ?? ""
      if (workspace) {
        if (authPanel) authPanel.hidden = Boolean(currentUser)
        if (workspaceOverview) workspaceOverview.hidden = !currentUser
        if (library) library.hidden = !currentUser
        if (writeLauncher) writeLauncher.hidden = !currentUser
        if (profileSettings) profileSettings.hidden = !currentUser
        if (aiSettings) aiSettings.hidden = !currentUser
        if (!currentUser)
          siteOwnerNavItems.forEach((item) => {
            item.hidden = true
          })
        if (editor) editor.hidden = true
        if (flatWorkbench) flatWorkbench.hidden = true
        if (currentUser) {
          try {
            await loadCapabilities()
            const knowledgeBaseId = await ensureKnowledgeBase()
            if (!knowledgeBaseId) setStatus("个人知识库暂时无法准备，请稍后刷新重试。", "error")
            await loadDocuments()
            restoreLocalBackup()
            await loadLinkOptions()
            await loadTagOptions()
            if (workspaceSection === "settings") await loadProfileSettings()
            if (workspaceSection === "ai-settings") await loadAiSettings()
          } catch {
            setStatus("登录已确认，但工作区数据暂时无法加载；请检查网络后刷新重试。", "error")
          }
        }
      }
    } finally {
      resolveAuthState()
    }
  }

  await ensureClient()
  if (disposed) return
  if (!client) {
    setStatus("登录服务暂时无法加载；请检查网络后重试。", "error")
    resolveAuthState()
  } else await sync()
  if (disposed) return

  function watchAuthState() {
    if (!client || authSubscription) return
    const listener = client.auth.onAuthStateChange((event: string) => {
      if (event === "SIGNED_IN" && workspace) void sync()
    })
    authSubscription = listener?.data?.subscription ?? null
  }
  watchAuthState()

  recovery?.addEventListener("submit", async (event) => {
    event.preventDefault()
    const data = new FormData(recovery)
    const password = String(data.get("new-password") ?? "")
    const confirmation = String(data.get("confirm-password") ?? "")
    if (password.length < 8) {
      setStatus("新密码至少需要 8 个字符。", "error")
      return
    }
    if (password !== confirmation) {
      setStatus("两次输入的密码不一致，请重新检查。", "error")
      return
    }
    const submit = recovery.querySelector<HTMLButtonElement>("[type=submit]")
    if (recovery.dataset.submitting === "true") return
    recovery.dataset.submitting = "true"
    recovery.setAttribute("aria-busy", "true")
    if (submit) {
      submit.disabled = true
      submit.textContent = "正在更新…"
    }
    try {
      if (!(await ensureClient(true))) return
      watchAuthState()
      const result = await client.auth.updateUser({ password })
      if (result.error) {
        setStatus("重置链接可能已失效，请重新发送密码邮件。", "error")
        return
      }
      await client.auth.signOut()
      recovery.hidden = true
      if (recoverySuccess) recoverySuccess.hidden = false
      setStatus("")
    } catch {
      setStatus("网络连接中断，新密码输入仍然保留；请检查网络后重试。", "error")
    } finally {
      delete recovery.dataset.submitting
      recovery.setAttribute("aria-busy", "false")
      if (submit) {
        submit.disabled = false
        submit.textContent = "更新密码"
      }
    }
  })

  forgotForm?.addEventListener("submit", async (event) => {
    event.preventDefault()
    const value = String(new FormData(forgotForm).get("email") ?? "").trim()
    if (!value) {
      setStatus("请填写注册邮箱。", "error")
      return
    }
    const submit = forgotForm.querySelector<HTMLButtonElement>("[data-account-forgot-submit]")
    if (forgotForm.dataset.submitting === "true") return
    forgotForm.dataset.submitting = "true"
    forgotForm.setAttribute("aria-busy", "true")
    if (submit) {
      submit.disabled = true
      submit.textContent = "正在发送…"
    }
    try {
      if (!(await ensureClient(true))) return
      watchAuthState()
      const result = await client.auth.resetPasswordForEmail(value, {
        redirectTo: `${location.origin}/account/recover/`,
      })
      if (result.error) {
        setStatus(friendlyAuthError(result.error.message), "error")
        return
      }
      forgotForm.hidden = true
      if (forgotEmail) forgotEmail.textContent = value
      if (emailSent) emailSent.hidden = false
      setStatus("")
    } catch {
      setStatus("网络连接中断，邮箱仍然保留；请检查网络后重试。", "error")
    } finally {
      delete forgotForm.dataset.submitting
      forgotForm.setAttribute("aria-busy", "false")
      if (submit) {
        submit.disabled = false
        submit.textContent = "发送重置邮件"
      }
    }
  })

  root.querySelectorAll<HTMLButtonElement>("[data-password-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = button.parentElement?.querySelector<HTMLInputElement>("input")
      if (!input) return
      const revealing = input.type === "password"
      input.type = revealing ? "text" : "password"
      button.textContent = revealing ? "隐藏" : "显示"
      button.setAttribute("aria-pressed", String(revealing))
    })
  })

  root
    .querySelector<HTMLButtonElement>("[data-account-signout]")
    ?.addEventListener("click", async () => {
      await client?.auth.signOut()
      location.assign("/account/")
    })

  const closeAvatarCropper = () => {
    profileCropper?.destroy?.()
    profileCropper = null
    if (profileCropSourceUrl) {
      URL.revokeObjectURL(profileCropSourceUrl)
      profileCropSourceUrl = ""
    }
    avatarCropImage?.removeAttribute("src")
    if (profileAvatarInput) profileAvatarInput.value = ""
    if (avatarCropDialog?.open) avatarCropDialog.close()
    if (avatarCropStatus) avatarCropStatus.textContent = ""
  }

  const openAvatarCropper = async (file: File) => {
    if (!avatarCropDialog || !avatarCropImage) return
    if (avatarCropStatus) avatarCropStatus.textContent = "正在准备裁剪工具…"
    avatarCropDialog.showModal()
    try {
      const [CropperConstructor] = await Promise.all([
        loadExternalScript(
          "https://cdn.jsdelivr.net/npm/cropperjs@1.6.2/dist/cropper.min.js",
          "Cropper",
        ),
        loadExternalStyle("https://cdn.jsdelivr.net/npm/cropperjs@1.6.2/dist/cropper.min.css"),
      ])
      profileCropSourceUrl = URL.createObjectURL(file)
      await new Promise<void>((resolve, reject) => {
        avatarCropImage.onload = () => resolve()
        avatarCropImage.onerror = () => reject(new Error("image"))
        avatarCropImage.src = profileCropSourceUrl
      })
      profileCropper = new (CropperConstructor as any)(avatarCropImage, {
        aspectRatio: 1,
        viewMode: 1,
        dragMode: "move",
        autoCropArea: 1,
        responsive: true,
        restore: false,
        guides: false,
        center: false,
        highlight: false,
        cropBoxMovable: false,
        cropBoxResizable: false,
        toggleDragModeOnDblclick: false,
        preview: "[data-avatar-crop-preview]",
        ready() {
          const data = profileCropper.getImageData()
          const ratio = Math.max(data.width / data.naturalWidth, 0.01)
          if (avatarCropZoom) {
            avatarCropZoom.min = String(ratio)
            avatarCropZoom.max = String(Math.max(ratio * 4, 1))
            avatarCropZoom.value = String(ratio)
          }
          if (avatarCropStatus) avatarCropStatus.textContent = "图片已准备好，可以拖动和缩放。"
        },
      })
    } catch {
      if (avatarCropStatus)
        avatarCropStatus.textContent = "裁剪工具加载失败，请检查网络后重新选择图片。"
    }
  }

  profileAvatarInput?.addEventListener("change", () => {
    const file = profileAvatarInput.files?.[0]
    if (!file) {
      updateProfilePreview()
      return
    }
    if (!/^image\/(?:jpeg|png|webp)$/.test(file.type)) {
      profileAvatarInput.value = ""
      setProfileStatus("请选择 JPG、PNG 或 WebP 图片。", "error")
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      profileAvatarInput.value = ""
      setProfileStatus("原图超过 10 MB，请先压缩后再试。", "error")
      return
    }
    setProfileStatus("")
    void openAvatarCropper(file)
  })

  avatarCropZoom?.addEventListener("input", () =>
    profileCropper?.zoomTo?.(Number(avatarCropZoom.value)),
  )
  root
    .querySelector<HTMLButtonElement>("[data-avatar-crop-reset]")
    ?.addEventListener("click", () => {
      profileCropper?.reset?.()
      const data = profileCropper?.getImageData?.()
      if (avatarCropZoom && data?.naturalWidth)
        avatarCropZoom.value = String(
          Math.max(data.width / data.naturalWidth, Number(avatarCropZoom.min)),
        )
    })
  root
    .querySelectorAll<HTMLButtonElement>("[data-avatar-crop-cancel]")
    .forEach((button) => button.addEventListener("click", closeAvatarCropper))
  avatarCropDialog?.addEventListener("cancel", (event) => {
    event.preventDefault()
    closeAvatarCropper()
  })
  root
    .querySelector<HTMLButtonElement>("[data-avatar-crop-confirm]")
    ?.addEventListener("click", async () => {
      if (!profileCropper) {
        if (avatarCropStatus) avatarCropStatus.textContent = "图片还没有准备好，请稍候。"
        return
      }
      const canvas = profileCropper.getCroppedCanvas({
        width: 512,
        height: 512,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: "high",
      })
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(
          (webp: Blob | null) => {
            if (webp) resolve(webp)
            else canvas.toBlob(resolve, "image/jpeg", 0.9)
          },
          "image/webp",
          0.9,
        )
      })
      if (!blob) {
        if (avatarCropStatus) avatarCropStatus.textContent = "无法生成头像，请换一张图片重试。"
        return
      }
      profileCroppedBlob = blob
      if (profilePreviewObjectUrl) URL.revokeObjectURL(profilePreviewObjectUrl)
      profilePreviewObjectUrl = URL.createObjectURL(blob)
      updateProfilePreview()
      closeAvatarCropper()
      setProfileStatus("头像已经裁剪好；点击“保存个人资料”后才会上传。")
    })
  ;[profileDisplayName, profileSignature, profileBio, profileLocation, profileWebsite].forEach(
    (field) => {
      field?.addEventListener("input", () => {
        updateProfilePreview()
        persistProfileSettingsDraft()
      })
    },
  )
  ;[aiEnabled, aiPrivateContent, aiGroundingMode, aiMonthlyBudget].forEach((field) => {
    field?.addEventListener("change", () => {
      updateAiControls()
      persistAiSettingsDraft()
    })
  })

  aiSettingsForm?.addEventListener("submit", async (event) => {
    event.preventDefault()
    if (aiSettingsForm.dataset.saving === "true") return
    if (!currentUser || !(await ensureClient(true))) {
      setAiStatus("登录状态已失效，请重新登录。", "error")
      return
    }
    const ownerId = currentUser.id
    const draft = currentAiSettingsDraft()
    writeAiSettingsDraft(sessionStorage, ownerId, draft)
    const originalLabel = aiSave?.textContent ?? "保存 AI 设置"
    aiSettingsForm.dataset.saving = "true"
    aiSettingsForm.setAttribute("aria-busy", "true")
    if (aiSave) {
      aiSave.disabled = true
      aiSave.textContent = "正在保存…"
    }
    setAiStatus("正在保存你的 AI 使用边界…")
    try {
      const enabled = draft.enabled
      const result = await client
        .from("ai_preferences")
        .upsert(
          {
            owner_id: ownerId,
            enabled,
            allow_private_content: draft.allowPrivateContent,
            monthly_budget_cents: draft.monthlyBudgetCents,
            grounding_mode: draft.groundingMode,
            provider: "deepseek",
            model: "deepseek-v4-flash",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "owner_id" },
        )
        .select("enabled,allow_private_content,monthly_budget_cents,grounding_mode,updated_at")
        .single()
      if (result.error) {
        setAiStatus(
          String(result.error.message ?? "")
            .toLowerCase()
            .includes("ai_preferences")
            ? "AI 设置尚未启用，请先执行 20260718000900_ai_assistant_foundation.sql。"
            : "AI 设置保存失败，请检查网络后重试。",
          "error",
        )
        return
      }
      clearAiSettingsDraft(sessionStorage, ownerId)
      if (disposed || currentUser?.id !== ownerId) return
      applyAiSettingsDraft({
        enabled: Boolean(result.data.enabled),
        allowPrivateContent: Boolean(result.data.allow_private_content),
        monthlyBudgetCents: Number(
          result.data.monthly_budget_cents ?? 0,
        ) as AiSettingsDraft["monthlyBudgetCents"],
        groundingMode:
          result.data.grounding_mode === "knowledge_base" ? "knowledge_base" : "selected_only",
      })
      setAiStatus(
        enabled ? "AI 设置已保存；真实调用仍受总开关和预算边界保护。" : "AI 助手已保持关闭。",
        "success",
      )
    } catch {
      if (!disposed && currentUser?.id === ownerId)
        setAiStatus("网络中断，设置尚未保存；本机草稿已保留，请稍后重试。", "error")
    } finally {
      delete aiSettingsForm.dataset.saving
      aiSettingsForm.removeAttribute("aria-busy")
      if (!disposed && currentUser?.id === ownerId && aiSave) {
        aiSave.disabled = false
        aiSave.textContent = originalLabel
      }
    }
  })

  aiTestGateway?.addEventListener("click", async () => {
    if (!client || !currentUser) {
      setAiGatewayStatus("请先登录，再测试安全网关。", "error")
      return
    }
    const originalLabel = aiTestGateway.textContent ?? "测试安全网关"
    aiTestGateway.disabled = true
    aiTestGateway.textContent = "正在测试…"
    setAiGatewayStatus("仅发送一段固定测试文字，不会读取你的笔记。")
    try {
      const result = await client.functions.invoke("ai-write", {
        body: {
          action: "summarize",
          selection: "wouldkeep AI 安全网关连接测试",
          context: "",
          document_id: null,
          base_version: 0,
        },
      })
      if (result.error) {
        setAiGatewayStatus(
          "安全网关尚未部署或暂时不可用；请先部署 ai-write Edge Function。",
          "error",
        )
        return
      }
      setAiGatewayStatus(
        result.data?.mock === true
          ? "连接成功；这是安全测试响应，没有调用真实模型，也不会产生费用。"
          : "网关已响应，但返回格式与当前版本不一致，请暂勿启用。",
        result.data?.mock === true ? "success" : "error",
      )
    } finally {
      aiTestGateway.disabled = false
      aiTestGateway.textContent = originalLabel
    }
  })

  profileSettingsForm?.addEventListener("submit", async (event) => {
    event.preventDefault()
    if (profileSettingsForm.dataset.saving === "true") return
    if (!currentUser || !profileDisplayName || !(await ensureClient(true))) {
      setProfileStatus("登录状态已失效，请重新登录。", "error")
      return
    }
    const ownerId = currentUser.id
    const ownerEmail = currentUser.email ?? ""
    writeProfileSettingsDraft(sessionStorage, ownerId, currentProfileSettingsDraft())
    const displayName = profileDisplayName.value.trim()
    if (displayName.length < 2 || displayName.length > 40) {
      setProfileStatus("显示名称需要 2–40 个字符。", "error")
      profileDisplayName.focus()
      return
    }
    const signature = profileSignature?.value.trim() ?? ""
    const bio = profileBio?.value.trim() ?? ""
    const locationValue = profileLocation?.value.trim() ?? ""
    const websiteInput = profileWebsite?.value.trim() ?? ""
    const websiteUrl = normalizedProfileWebsite(websiteInput)
    if (websiteInput && !websiteUrl) {
      setProfileStatus("个人链接格式不正确，请输入有效的网址，例如 https://example.com。", "error")
      profileWebsite?.focus()
      return
    }
    if (!profilePersonalizationAvailable) {
      setProfileStatus(
        "请先在 Supabase 执行 20260718000800_profile_personalization.sql，再保存扩展个人资料。",
        "error",
      )
      return
    }

    const originalLabel = profileSave?.textContent ?? "保存个人资料"
    profileSettingsForm.dataset.saving = "true"
    profileSettingsForm.setAttribute("aria-busy", "true")
    if (profileSave) {
      profileSave.disabled = true
      profileSave.textContent = "正在保存…"
    }
    setProfileStatus(profileCroppedBlob ? "正在上传裁剪后的头像并保存资料…" : "正在保存资料…")
    let avatarUrl = currentProfileAvatarUrl
    try {
      if (profileCroppedBlob) {
        const avatarPath = `${ownerId}/avatar`
        const upload = await client.storage.from("avatars").upload(avatarPath, profileCroppedBlob, {
          upsert: true,
          contentType: profileCroppedBlob.type || "image/webp",
          cacheControl: "3600",
        })
        if (upload.error) {
          const message = String(upload.error.message ?? "")
          setProfileStatus(
            message.toLowerCase().includes("bucket")
              ? "头像存储还没有启用，请先在 Supabase 执行头像迁移文件。"
              : "头像上传失败，资料没有改变，请稍后重试。",
            "error",
          )
          return
        }
        const publicUrl =
          client.storage.from("avatars").getPublicUrl(avatarPath).data?.publicUrl ?? ""
        avatarUrl = publicUrl ? `${publicUrl}?v=${Date.now()}` : ""
      }

      const update = await client
        .from("profiles")
        .update({
          display_name: displayName,
          avatar_url: avatarUrl || null,
          signature: signature || null,
          bio: bio || null,
          location: locationValue || null,
          website_url: websiteUrl || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", ownerId)
      if (update.error) {
        const message = String(update.error.message ?? "").toLowerCase()
        setProfileStatus(
          message.includes("column") || message.includes("schema cache")
            ? "扩展个人资料尚未启用，请先执行最新迁移文件。"
            : "个人资料保存失败，请检查网络后重试。",
          "error",
        )
        return
      }
      clearProfileSettingsDraft(sessionStorage, ownerId)
      if (disposed || currentUser?.id !== ownerId) return
      currentProfileAvatarUrl = avatarUrl
      profileCroppedBlob = null
      if (profileWebsite) profileWebsite.value = websiteUrl
      if (profilePreviewObjectUrl) {
        URL.revokeObjectURL(profilePreviewObjectUrl)
        profilePreviewObjectUrl = ""
      }
      updateProfilePreview()
      window.dispatchEvent(
        new CustomEvent("wouldkeep:profile-updated", {
          detail: {
            display_name: displayName,
            avatar_url: avatarUrl,
            signature,
            email: ownerEmail,
          },
        }),
      )
      setProfileStatus("个人资料已保存，右上角头像和个人卡片已经同步。", "success")
    } catch {
      if (!disposed && currentUser?.id === ownerId)
        setProfileStatus("网络中断，资料尚未保存；本机草稿已保留，请稍后重试。", "error")
    } finally {
      delete profileSettingsForm.dataset.saving
      profileSettingsForm.removeAttribute("aria-busy")
      if (!disposed && currentUser?.id === ownerId && profileSave) {
        profileSave.disabled = false
        profileSave.textContent = originalLabel
      }
    }
  })

  libraryList?.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-document-id]")
    if (button?.dataset.documentId)
      location.assign(`/workspace/write/?document=${encodeURIComponent(button.dataset.documentId)}`)
  })

  librarySearch?.addEventListener("input", () => renderDocuments(workspaceDocuments))
  root.querySelectorAll<HTMLInputElement>("[name=library-filter]").forEach((input) => {
    input.addEventListener("change", () => renderDocuments(workspaceDocuments))
  })
  root.querySelector<HTMLButtonElement>("[data-library-clear]")?.addEventListener("click", () => {
    if (librarySearch) librarySearch.value = ""
    const all = root.querySelector<HTMLInputElement>("[name=library-filter][value=all]")
    if (all) all.checked = true
    renderDocuments(workspaceDocuments)
    librarySearch?.focus()
  })

  const startNewDocument = (showEditor = true) => {
    form?.reset()
    const documentId = form?.elements.namedItem("documentId") as HTMLInputElement | null
    if (documentId) documentId.value = ""
    const revision = form?.elements.namedItem("revision") as HTMLInputElement | null
    if (revision) revision.value = "0"
    const statusField = form?.elements.namedItem("status") as HTMLInputElement | null
    if (statusField) statusField.value = "draft"
    updatePublicationUI(null)
    renderSources()
    if (writeLauncher && showEditor) writeLauncher.hidden = true
    if (flatWorkbench && showEditor) flatWorkbench.hidden = true
    if (editor) editor.hidden = !showEditor
    if (history) history.hidden = true
    if (state) state.textContent = "新建云端草稿"
    if (showEditor) editor?.scrollIntoView({ behavior: "smooth", block: "start" })
  }
  root
    .querySelectorAll<HTMLButtonElement>("[data-new-document]")
    .forEach((button) => button.addEventListener("click", () => startNewDocument()))

  const setImportStatus = (
    message: string,
    stateName: "" | "error" | "success" = "",
    canRetry = false,
  ) => {
    if (!importStatus) return
    importStatus.textContent = message
    importStatus.dataset.state = stateName
    importStatus.setAttribute("role", stateName === "error" ? "alert" : "status")
    importStatus.setAttribute("aria-live", stateName === "error" ? "assertive" : "polite")
    if (importRetry) importRetry.hidden = !canRetry
  }
  const resetImportDialog = (invalidateRequest = true) => {
    if (invalidateRequest) importRequests.invalidate()
    importedDraft = null
    importConfirming = false
    lastImportFile = null
    if (importFile) importFile.value = ""
    if (importResult) importResult.hidden = true
    if (importFileContext) importFileContext.hidden = true
    if (importPreview) {
      importPreview.replaceChildren()
      importPreview.setAttribute("aria-busy", "false")
    }
    setImportStatus("")
    if (importConfirm) importConfirm.disabled = true
    importDropzone?.classList.remove("is-dragging", "is-busy")
    importDropzone?.setAttribute("aria-busy", "false")
  }
  const formatImportFileSize = (size: number) =>
    size >= 1024 * 1024
      ? `${(size / (1024 * 1024)).toLocaleString("zh-CN", { maximumFractionDigits: 1 })} MB`
      : `${Math.max(1, Math.ceil(size / 1024)).toLocaleString("zh-CN")} KB`
  const showImportFileContext = (file: File) => {
    const name = root.querySelector<HTMLElement>("[data-import-file-name]")
    const size = root.querySelector<HTMLElement>("[data-import-file-size]")
    const type = root.querySelector<HTMLElement>("[data-import-file-type]")
    const extension = file.name.split(".").pop()?.toLowerCase()
    if (name) name.textContent = file.name
    if (size) size.textContent = formatImportFileSize(file.size)
    if (type)
      type.textContent =
        extension === "docx"
          ? "Word DOCX"
          : extension === "md" || extension === "markdown"
            ? "Markdown（UTF-8）"
            : file.type || "未识别"
    if (importFileContext) importFileContext.hidden = false
  }
  const titleFromFilename = (filename: string) =>
    filename
      .replace(/\.(?:docx|md|markdown)$/i, "")
      .replace(/[-_]+/g, " ")
      .trim() || "导入的知识"
  const prepareMarkdown = (raw: string, filename: string) => {
    let body = raw
      .replace(/^\uFEFF/, "")
      .replace(/\r\n?/g, "\n")
      .replace(/\0/g, "")
    let title = ""
    const frontmatter = body.match(/^---\n([\s\S]*?)\n---\n?/)
    if (frontmatter) {
      const titleLine = frontmatter[1].match(/^title:\s*["']?(.+?)["']?\s*$/im)
      if (titleLine) title = titleLine[1].trim()
      body = body.slice(frontmatter[0].length)
    }
    const firstHeading = body.match(/^#\s+(.+)\s*$/m)
    if (!title && firstHeading) title = firstHeading[1].trim()
    if (firstHeading?.index !== undefined && firstHeading.index < 200)
      body =
        `${body.slice(0, firstHeading.index)}${body.slice(firstHeading.index + firstHeading[0].length)}`.replace(
          /^\s+/,
          "",
        )
    return { title: title || titleFromFilename(filename), body: body.trim() }
  }
  const showImportedDraft = async (draft: ImportedDraft, isActiveRequest: () => boolean) => {
    if (!isActiveRequest()) return
    if (importPreview) {
      importPreview.setAttribute("aria-busy", "true")
      await renderMarkdownInto(importPreview, draft.body, {
        shouldRender: isActiveRequest,
        localImagesOnly: true,
      })
      if (!isActiveRequest()) return
      importPreview.setAttribute("aria-busy", "false")
      importPreview.querySelectorAll<HTMLImageElement>("img").forEach((image, index) => {
        if (!image.alt.trim()) image.alt = `导入图片预览 ${index + 1}`
      })
    }
    if (!isActiveRequest()) return
    importedDraft = draft
    const resultTitle = root.querySelector<HTMLElement>("[data-import-result-title]")
    const title = root.querySelector<HTMLElement>("[data-import-title]")
    const size = root.querySelector<HTMLElement>("[data-import-size]")
    const images = root.querySelector<HTMLElement>("[data-import-images]")
    const notes = root.querySelector<HTMLElement>("[data-import-notes]")
    const noteList = root.querySelector<HTMLUListElement>("[data-import-note-list]")
    if (resultTitle) resultTitle.textContent = "文件已转换为私密草稿"
    if (title) title.textContent = draft.title
    if (size) size.textContent = `${draft.body.length.toLocaleString("zh-CN")} 个字符`
    if (images)
      images.textContent = draft.imageCount ? `${draft.imageCount} 张，已保留` : "没有内嵌图片"
    noteList?.replaceChildren()
    draft.notes.slice(0, 5).forEach((message) => {
      const item = document.createElement("li")
      item.textContent = message
      noteList?.appendChild(item)
    })
    if (notes) notes.hidden = draft.notes.length === 0
    if (importResult) importResult.hidden = false
    setImportStatus("请检查摘要后，再放入编辑器。", "success")
    if (importConfirm) importConfirm.disabled = false
  }
  const processImportFile = async (file: File) => {
    const request = importRequests.begin()
    resetImportDialog(false)
    lastImportFile = file
    showImportFileContext(file)
    const isActiveRequest = () => !disposed && importRequests.isCurrent(request)
    if (!isActiveRequest()) return
    const validation = validateImportFile(file)
    if (!validation.ok) {
      const message =
        validation.reason === "too-large"
          ? "文件超过 10 MB。请先压缩图片或拆分文档后重试；编辑器内容未改变。"
          : validation.reason === "empty-file"
            ? "这个文件是空的，请选择其他文件；编辑器内容未改变。"
            : "目前支持 DOCX、MD 和 Markdown 文件；编辑器内容未改变。"
      setImportStatus(message, "error")
      return
    }
    const { extension } = validation
    importDropzone?.classList.add("is-busy")
    importDropzone?.setAttribute("aria-busy", "true")
    setImportStatus(extension === "docx" ? "正在读取文字与图片…" : "正在读取 Markdown…")
    try {
      if (extension === "md" || extension === "markdown") {
        const buffer = await file.arrayBuffer()
        if (!isActiveRequest()) return
        const prepared = prepareMarkdown(decodeUtf8Markdown(buffer), file.name)
        if (!prepared.body) throw new Error("empty-content")
        assertImportComplexity({ bodyCharacters: prepared.body.length })
        if (!isActiveRequest()) return
        await showImportedDraft(
          {
            ...prepared,
            imageCount: (prepared.body.match(/!\[[^\]]*\]\([^)]*\)/g) ?? []).length,
            notes: [],
          },
          isActiveRequest,
        )
        return
      }
      let imageCount = 0
      let imageBytes = 0
      const notes: string[] = []
      const arrayBuffer = await file.arrayBuffer()
      if (!isActiveRequest()) return
      inspectDocxArchive(arrayBuffer)
      const [mammoth, TurndownService] = await Promise.all([loadMammoth(), loadTurndown()])
      if (!isActiveRequest()) return
      const converted = await mammoth.convertToHtml(
        { arrayBuffer },
        {
          convertImage: mammoth.images.imgElement(async (image: any) => {
            if (!isActiveRequest()) throw new Error("stale-import")
            imageCount += 1
            if (imageCount > 30) throw new Error("too-many-images")
            if (!/^image\/(?:png|jpe?g|gif|webp)$/i.test(image.contentType))
              throw new Error("unsupported-image")
            const base64 = await image.read("base64")
            const bytes = Math.ceil((base64.length * 3) / 4)
            if (bytes > 2.5 * 1024 * 1024) throw new Error("image-too-large")
            imageBytes += bytes
            if (imageBytes > 6 * 1024 * 1024) throw new Error("images-too-large")
            return { src: `data:${image.contentType};base64,${base64}` }
          }),
        },
      )
      if (!isActiveRequest()) return
      assertImportComplexity({ htmlCharacters: converted.value.length })
      const parsed = new DOMParser().parseFromString(converted.value, "text/html")
      assertImportComplexity({ domNodes: parsed.querySelectorAll("*").length })
      const firstHeading = parsed.querySelector("h1")
      const title = firstHeading?.textContent?.trim() || titleFromFilename(file.name)
      firstHeading?.remove()
      const turndown = new TurndownService({
        headingStyle: "atx",
        bulletListMarker: "-",
        codeBlockStyle: "fenced",
        emDelimiter: "*",
      })
      turndown.keep(["table", "thead", "tbody", "tfoot", "tr", "th", "td"])
      const body = turndown.turndown(parsed.body.innerHTML).trim()
      if (!body) throw new Error("empty-content")
      assertImportComplexity({ bodyCharacters: body.length })
      if (converted.messages?.length) {
        notes.push(`有 ${converted.messages.length} 处复杂格式需要人工检查。`)
        converted.messages
          .slice(0, 3)
          .forEach((message: any) =>
            notes.push(String(message.message || "部分 Word 格式已简化。")),
          )
      }
      if (!isActiveRequest()) return
      await showImportedDraft({ title, body, imageCount, notes }, isActiveRequest)
    } catch (error) {
      if (!isActiveRequest()) return
      const message = error instanceof Error ? error.message : ""
      const knownFailure = [
        "too-many-images",
        "unsupported-image",
        "image-too-large",
        "images-too-large",
        "invalid-encoding",
        "empty-content",
        "content-too-large",
        "docx-archive",
        "archive-",
        "unsupported-docx",
      ].some((code) => message.includes(code))
      const canRetry = !knownFailure
      const friendly = message.includes("too-many-images")
        ? "文档包含超过 30 张图片，请拆分后导入；编辑器内容未改变。"
        : message.includes("unsupported-image")
          ? "文档包含暂不支持的图片格式，请在 Word 中转为 PNG 或 JPG 后重试；编辑器内容未改变。"
          : message.includes("image-too-large")
            ? "文档中有单张超过 2.5 MB 的图片，请压缩图片后重试；编辑器内容未改变。"
            : message.includes("images-too-large")
              ? "文档内图片合计超过 6 MB，请压缩图片后重试；编辑器内容未改变。"
              : message.includes("invalid-encoding")
                ? "Markdown 不是有效的 UTF-8 编码。请在文本编辑器中另存为 UTF-8 后重试；编辑器内容未改变。"
                : message.includes("content-too-large")
                  ? "转换后的正文或结构过大。请拆分文档后分别导入；编辑器内容未改变。"
                  : /docx-archive|archive-|unsupported-docx/.test(message)
                    ? "DOCX 的压缩结构异常、加密或解压后过大。请在 Word 中另存为新的 DOCX，或拆分后导入；编辑器内容未改变。"
                    : message.includes("preview-dependency-unavailable") ||
                        message.includes("/static/vendor/workspace-import/")
                      ? "本地导入组件暂时未能加载。请重新读取这个文件；编辑器内容未改变。"
                      : message.includes("empty-content")
                        ? "没有从文件中读到正文内容，请检查文件后重试；编辑器内容未改变。"
                        : "文件转换失败。如果文件来自云盘，请先确认它已完整下载，再重新读取；编辑器内容未改变。"
      setImportStatus(friendly, "error", canRetry)
    } finally {
      if (isActiveRequest()) {
        importDropzone?.classList.remove("is-busy")
        importDropzone?.setAttribute("aria-busy", "false")
      }
    }
  }

  const openImportDialog = () => {
    resetImportDialog()
    if (importDialog?.showModal) importDialog.showModal()
    else importDialog?.setAttribute("open", "")
    window.setTimeout(() => {
      if (!disposed && importDialog?.open) importFile?.focus()
    }, 0)
  }
  root
    .querySelectorAll<HTMLButtonElement>("[data-open-import]")
    .forEach((button) => button.addEventListener("click", openImportDialog))
  const closeImport = () => {
    resetImportDialog()
    if (importDialog?.open && importDialog.close) importDialog.close()
    else importDialog?.removeAttribute("open")
  }
  root
    .querySelectorAll<HTMLButtonElement>("[data-import-close], [data-import-cancel]")
    .forEach((button) => button.addEventListener("click", closeImport))
  importDialog?.addEventListener("click", (event) => {
    if (event.target === importDialog) closeImport()
  })
  importDialog?.addEventListener("cancel", () => resetImportDialog())
  importFile?.addEventListener("change", () => {
    const file = importFile.files?.[0]
    if (file) void processImportFile(file)
  })
  importRetry?.addEventListener("click", () => {
    if (!lastImportFile || importDropzone?.classList.contains("is-busy")) return
    const file = lastImportFile
    void processImportFile(file)
  })
  ;["dragenter", "dragover"].forEach((name) =>
    importDropzone?.addEventListener(name, (event) => {
      event.preventDefault()
      importDropzone?.classList.add("is-dragging")
    }),
  )
  ;["dragleave", "drop"].forEach((name) =>
    importDropzone?.addEventListener(name, (event) => {
      event.preventDefault()
      importDropzone?.classList.remove("is-dragging")
    }),
  )
  importDropzone?.addEventListener("drop", (event) => {
    const file = (event as DragEvent).dataTransfer?.files?.[0]
    if (file) void processImportFile(file)
  })
  importConfirm?.addEventListener("click", () => {
    if (importConfirming || !importedDraft || !form) return
    importConfirming = true
    const existing = readForm()
    if (
      (existing.title.trim() || existing.body.trim()) &&
      !window.confirm("导入会替换当前编辑器中尚未保存的内容。要继续吗？")
    ) {
      importConfirming = false
      return
    }
    const draft = importedDraft
    importedDraft = null
    if (importConfirm) importConfirm.disabled = true
    startNewDocument()
    const title = form.elements.namedItem("title") as HTMLInputElement | null
    const body = form.elements.namedItem("body") as HTMLTextAreaElement | null
    const privateVisibility = form.querySelector<HTMLInputElement>(
      "[name=visibility][value=private]",
    )
    if (title) title.value = draft.title
    if (body) body.value = draft.body
    if (privateVisibility) privateVisibility.checked = true
    form.dispatchEvent(new Event("input", { bubbles: true }))
    if (state)
      state.textContent = `已导入${draft.imageCount ? `，保留 ${draft.imageCount} 张图片` : ""} · 等待检查与保存`
    closeImport()
    title?.focus()
  })

  let flatDirty = false
  const setFlatStatus = (message: string, stateName: "" | "error" | "success" = "") => {
    if (!flatStatus) return
    flatStatus.textContent = message
    flatStatus.dataset.state = stateName
  }
  const dataUrlFromFile = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ""))
      reader.onerror = () => reject(reader.error ?? new Error("image-read"))
      reader.readAsDataURL(file)
    })
  const insertFlatBody = (content: string) => {
    if (!flatBody) return
    const start = flatBody.selectionStart ?? flatBody.value.length
    const end = flatBody.selectionEnd ?? start
    const prefix = start > 0 && !flatBody.value.slice(0, start).endsWith("\n") ? "\n\n" : ""
    const suffix =
      end < flatBody.value.length && !flatBody.value.slice(end).startsWith("\n") ? "\n\n" : ""
    flatBody.setRangeText(`${prefix}${content}${suffix}`, start, end, "end")
    flatBody.dispatchEvent(new Event("input", { bubbles: true }))
  }
  const syncFlatToDetailed = () => {
    if (!form || !flatTitle || !flatBody) return
    const title = form.elements.namedItem("title") as HTMLInputElement | null
    const body = form.elements.namedItem("body") as HTMLTextAreaElement | null
    const privateVisibility = form.querySelector<HTMLInputElement>(
      "[name=visibility][value=private]",
    )
    if (title) title.value = flatTitle.value.trim()
    if (body) body.value = flatBody.value.trim()
    if (privateVisibility) privateVisibility.checked = true
    form.dispatchEvent(new Event("input", { bubbles: true }))
  }
  const convertPastedContent = async (html: string, plainText: string, imageFiles: File[]) => {
    let content = plainText.replace(/\r\n?/g, "\n")
    let detectedTitle = ""
    let formatLabel = "Markdown 或纯文本"
    let embeddedImages = 0
    let imageBytes = 0
    if (html.trim()) {
      formatLabel = "Word / 富文本"
      try {
        assertImportComplexity({ htmlCharacters: html.length })
        const TurndownService = await loadTurndown()
        if (disposed) throw new Error("stale-import")
        const parsed = new DOMParser().parseFromString(html, "text/html")
        assertImportComplexity({ domNodes: parsed.querySelectorAll("*").length })
        parsed
          .querySelectorAll("script,style,meta,link,iframe,object,embed,form")
          .forEach((node) => node.remove())
        parsed.querySelectorAll<HTMLElement>("*").forEach((node) => {
          node.removeAttribute("style")
          for (const attribute of [...node.attributes])
            if (/^on/i.test(attribute.name)) node.removeAttribute(attribute.name)
        })
        const heading = parsed.querySelector("h1")
        if (!flatTitle?.value.trim() && !flatBody?.value.trim() && heading?.textContent?.trim()) {
          detectedTitle = heading.textContent.trim()
          heading.remove()
        }
        parsed.querySelectorAll<HTMLImageElement>("img").forEach((image) => {
          const src = image.getAttribute("src") ?? ""
          if (!/^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(src)) {
            image.remove()
            return
          }
          embeddedImages += 1
          if (embeddedImages > 30) throw new Error("too-many-images")
          const bytes = Math.ceil(((src.split(",")[1]?.length ?? 0) * 3) / 4)
          if (bytes > 2.5 * 1024 * 1024) throw new Error("image-too-large")
          imageBytes += bytes
          if (imageBytes > 6 * 1024 * 1024) throw new Error("images-too-large")
        })
        const turndown = new TurndownService({
          headingStyle: "atx",
          bulletListMarker: "-",
          codeBlockStyle: "fenced",
          emDelimiter: "*",
        })
        turndown.keep(["table", "thead", "tbody", "tfoot", "tr", "th", "td"])
        content = turndown.turndown(parsed.body.innerHTML).trim() || content
        assertImportComplexity({ bodyCharacters: content.length })
      } catch (error) {
        const message = error instanceof Error ? error.message : ""
        if (/too-many-images|image-too-large|images-too-large|content-too-large/.test(message))
          throw error
        formatLabel = "纯文本（富文本转换暂不可用）"
      }
    } else if (!flatTitle?.value.trim() && !flatBody?.value.trim()) {
      const heading = content.match(/^#\s+(.+)\s*$/m)
      if (heading?.index !== undefined && heading.index < 200) {
        detectedTitle = heading[1].trim()
        content =
          `${content.slice(0, heading.index)}${content.slice(heading.index + heading[0].length)}`.replace(
            /^\s+/,
            "",
          )
      }
    }

    const imageMarkdown: string[] = []
    for (const file of imageFiles.slice(0, 30)) {
      if (!/^image\/(?:png|jpe?g|gif|webp)$/i.test(file.type)) continue
      if (file.size > 2.5 * 1024 * 1024) throw new Error("image-too-large")
      imageBytes += file.size
      if (imageBytes > 6 * 1024 * 1024) throw new Error("images-too-large")
      const dataUrl = await dataUrlFromFile(file)
      if (!content.includes(dataUrl)) imageMarkdown.push(`![粘贴的图片](${dataUrl})`)
    }
    if (imageMarkdown.length)
      content = [content.trim(), ...imageMarkdown].filter(Boolean).join("\n\n")
    assertImportComplexity({ bodyCharacters: content.length })
    return {
      content: content.trim(),
      detectedTitle,
      formatLabel,
      imageCount: embeddedImages + imageMarkdown.length,
    }
  }

  const openFlatWorkbench = () => {
    const existing = readForm()
    if (
      editor &&
      !editor.hidden &&
      (existing.title.trim() || existing.body.trim()) &&
      !window.confirm("自由工作台会开始一条新的知识。确定离开当前详细编辑内容吗？")
    )
      return
    startNewDocument(false)
    flatForm?.reset()
    flatDirty = false
    setFlatStatus("等待粘贴或书写。")
    if (writeLauncher) writeLauncher.hidden = true
    if (flatWorkbench) flatWorkbench.hidden = false
    flatWorkbench?.scrollIntoView({ behavior: "smooth", block: "start" })
    window.setTimeout(() => flatBody?.focus(), 0)
  }
  root
    .querySelectorAll<HTMLButtonElement>("[data-open-flat-workbench]")
    .forEach((button) => button.addEventListener("click", openFlatWorkbench))
  root
    .querySelector<HTMLButtonElement>("[data-close-flat-workbench]")
    ?.addEventListener("click", () => {
      if (flatDirty && !window.confirm("当前自由工作台还有未保存内容。确定返回工作台首页吗？"))
        return
      if (flatWorkbench) flatWorkbench.hidden = true
      if (writeLauncher) writeLauncher.hidden = false
      writeLauncher?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  flatForm?.addEventListener("input", () => {
    flatDirty = true
    setFlatStatus("有未保存的内容。")
  })
  flatBody?.addEventListener("paste", (event) => {
    const clipboard = event.clipboardData
    if (!clipboard) return
    event.preventDefault()
    const html = clipboard.getData("text/html")
    const text = clipboard.getData("text/plain")
    const images = [...clipboard.items]
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file))
    setFlatStatus("正在识别粘贴内容…")
    void convertPastedContent(html, text, images)
      .then((result) => {
        if (disposed) return
        if (!result.content) {
          setFlatStatus("剪贴板中没有可用文字或图片。", "error")
          return
        }
        if (result.detectedTitle && flatTitle && !flatTitle.value.trim())
          flatTitle.value = result.detectedTitle
        insertFlatBody(result.content)
        setFlatStatus(
          `已识别为${result.formatLabel}${result.imageCount ? `，保留 ${result.imageCount} 张图片` : ""}。请检查后保存。`,
          "success",
        )
      })
      .catch((error) => {
        if (disposed) return
        const message = error instanceof Error ? error.message : ""
        setFlatStatus(
          message.includes("too-many-images")
            ? "一次最多粘贴 30 张图片，请拆分文稿。"
            : message.includes("image-too-large")
              ? "粘贴内容中有单张超过 2.5 MB 的图片，请先压缩。"
              : message.includes("images-too-large")
                ? "粘贴图片合计超过 6 MB，请减少或压缩图片。"
                : message.includes("content-too-large")
                  ? "粘贴内容的正文或结构过大，请拆分后分次粘贴。"
                  : "暂时无法转换粘贴内容，请改用文件导入。",
          "error",
        )
      })
  })
  flatForm?.addEventListener("submit", async (event) => {
    event.preventDefault()
    if (!flatTitle?.value.trim()) {
      setFlatStatus("请先填写标题。", "error")
      flatTitle?.focus()
      return
    }
    if (!flatBody?.value.trim()) {
      setFlatStatus("正文还是空的，请先粘贴或书写内容。", "error")
      flatBody?.focus()
      return
    }
    if (!currentUser || !client) {
      setFlatStatus("登录状态已失效，请重新登录后保存。", "error")
      return
    }
    syncFlatToDetailed()
    if (autosaveTimer) window.clearTimeout(autosaveTimer)
    if (flatSave) {
      flatSave.disabled = true
      flatSave.textContent = "正在保存…"
    }
    setFlatStatus("正在保存到你的私密知识库…")
    const saved = await saveDocument()
    if (flatSave) {
      flatSave.disabled = false
      flatSave.textContent = "保存为私密草稿"
    }
    if (saved) {
      flatDirty = false
      setFlatStatus("私密草稿已保存。你可以继续修改，或进入详细整理。", "success")
    } else setFlatStatus("云端保存失败，内容仍保留在当前页面。请检查网络后重试。", "error")
  })
  root.querySelector<HTMLButtonElement>("[data-flat-organize]")?.addEventListener("click", () => {
    if (!flatTitle?.value.trim() || !flatBody?.value.trim()) {
      setFlatStatus("请先填写标题和正文，再进入详细整理。", "error")
      return
    }
    syncFlatToDetailed()
    if (flatWorkbench) flatWorkbench.hidden = true
    if (editor) editor.hidden = false
    if (state) state.textContent = flatDirty ? "已从自由工作台带入，尚未保存" : "已从自由工作台带入"
    editor?.scrollIntoView({ behavior: "smooth", block: "start" })
  })
  root.querySelector<HTMLButtonElement>("[data-flat-clear]")?.addEventListener("click", () => {
    if (
      (flatTitle?.value.trim() || flatBody?.value.trim()) &&
      !window.confirm("确定清空自由工作台吗？")
    )
      return
    flatForm?.reset()
    flatDirty = false
    setFlatStatus("已清空，可以粘贴新的文稿。")
    flatBody?.focus()
  })

  root
    .querySelector<HTMLButtonElement>("[data-source-add]")
    ?.addEventListener("click", () => addSourceRow(undefined, true))
  publishButton?.addEventListener("click", () => void publishCurrentDocument())
  unpublishButton?.addEventListener("click", () => void unpublishCurrentDocument())
  copyPublicationLink?.addEventListener("click", async () => {
    if (!currentPublication) return
    try {
      await navigator.clipboard.writeText(publicationUrl(currentPublication))
      if (publicationStatus) publicationStatus.textContent = "阅读链接已复制。"
    } catch {
      if (publicationStatus)
        publicationStatus.textContent =
          "浏览器没有允许自动复制；请点击“打开阅读页”后从地址栏复制链接。"
    }
  })

  if (form) {
    let pendingTopic = ""
    const showPreview = async () => {
      const data = readForm()
      const preview = root.querySelector<HTMLElement>("[data-document-preview]")
      const title = root.querySelector<HTMLElement>("[data-preview-title]")
      const body = root.querySelector<HTMLElement>("[data-preview-body]")
      const visibility = root.querySelector<HTMLElement>("[data-preview-visibility]")
      const sourceSection = root.querySelector<HTMLElement>("[data-preview-sources-section]")
      const sourceItems = root.querySelector<HTMLOListElement>("[data-preview-sources]")
      if (!preview || !title || !body || !visibility || !sourceSection || !sourceItems) return
      title.textContent = data.title.trim() || "未命名知识"
      body.textContent = "正在生成排版预览…"
      await renderMarkdownInto(body, data.body)
      const visibilityLabels: Record<string, string> = {
        private: "仅自己可见",
        unlisted: "持链接可见",
        public: "公开到知识网络",
      }
      visibility.textContent = `${visibilityLabels[data.visibility] ?? visibilityLabels.private} · 本地预览（尚未发布）`
      sourceItems.replaceChildren()
      for (const source of collectSources()) {
        const item = globalThis.document.createElement("li")
        const label = source.title || (source.kind === "personal" ? "个人经验" : source.url)
        let safeWebUrl = ""
        try {
          const parsed = new URL(source.url)
          if (parsed.protocol === "http:" || parsed.protocol === "https:") safeWebUrl = parsed.href
        } catch {
          safeWebUrl = ""
        }
        if (source.kind === "web" && safeWebUrl) {
          const link = globalThis.document.createElement("a")
          link.href = safeWebUrl
          link.target = "_blank"
          link.rel = "noreferrer"
          link.textContent = label
          item.appendChild(link)
        } else {
          const strong = globalThis.document.createElement("strong")
          strong.textContent = label || "网址待补充"
          item.appendChild(strong)
        }
        const detail = [source.author, source.note].filter(Boolean).join(" · ")
        if (detail) item.append(` — ${detail}`)
        sourceItems.appendChild(item)
      }
      sourceSection.hidden = sourceItems.childElementCount === 0
      preview.hidden = false
      preview.scrollIntoView({ behavior: "smooth", block: "start" })
    }
    root
      .querySelector<HTMLButtonElement>("[data-preview-document]")
      ?.addEventListener("click", () => void showPreview())
    root.querySelector<HTMLButtonElement>("[data-preview-close]")?.addEventListener("click", () => {
      const preview = root.querySelector<HTMLElement>("[data-document-preview]")
      if (preview) preview.hidden = true
      form.querySelector<HTMLInputElement>("[name=title]")?.focus()
    })
    const normalizeTags = () => {
      const field = form.elements.namedItem("tags") as HTMLInputElement | null
      if (!field) return
      field.value = [
        ...new Set(
          field.value
            .split(/[，,\n]/)
            .map((tag) => tag.trim())
            .filter(Boolean),
        ),
      ].join("，")
    }
    const classify = () => {
      const title = String((form.elements.namedItem("title") as HTMLInputElement)?.value ?? "")
      const body = String((form.elements.namedItem("body") as HTMLTextAreaElement)?.value ?? "")
      const text = `${title} ${body}`.toLowerCase()
      const matched =
        text.match(/rcwa|光学|电磁|边界|散射|tmm|波长/) ??
        text.match(/python|代码|算法|仿真|simulation|模型/) ??
        text.match(/积分|微分|矩阵|向量|线性代数|方程/) ??
        text.match(/实验|论文|研究|引用|方法/)
      const suggestion =
        matched && /rcwa|光学|电磁|边界|散射|tmm|波长/.test(matched[0])
          ? "物理与光学"
          : matched && /python|代码|算法|仿真|simulation|模型/.test(matched[0])
            ? "计算与仿真"
            : matched && /积分|微分|矩阵|向量|线性代数|方程/.test(matched[0])
              ? "数学"
              : matched
                ? "研究方法"
                : ""
      const notice = root.querySelector<HTMLElement>("[data-classify-status]")
      const apply = root.querySelector<HTMLButtonElement>("[data-apply-topic]")
      pendingTopic = suggestion
      if (suggestion) {
        if (notice)
          notice.textContent = `建议“${suggestion}”，因为内容中出现了“${matched?.[0]}”。由你决定是否采用。`
        if (apply) apply.hidden = false
      } else {
        if (notice) notice.textContent = "暂时没有足够线索。你可以继续写，也可以手动选择主题。"
        if (apply) apply.hidden = true
      }
    }
    form.querySelector("[data-auto-classify]")?.addEventListener("click", classify)
    form.querySelector("[data-apply-topic]")?.addEventListener("click", () => {
      const topic = form.elements.namedItem("topic") as HTMLSelectElement | null
      const notice = root.querySelector<HTMLElement>("[data-classify-status]")
      const apply = root.querySelector<HTMLButtonElement>("[data-apply-topic]")
      if (!topic || !pendingTopic) return
      topic.value = pendingTopic
      topic.dispatchEvent(new Event("input", { bubbles: true }))
      if (notice) notice.textContent = `已采用“${pendingTopic}”。你仍然可以随时修改。`
      if (apply) apply.hidden = true
    })
    root.querySelectorAll<HTMLButtonElement>("[data-module]").forEach((button) => {
      button.addEventListener("click", () => {
        const module = button.dataset.module
        if (module === "question") {
          const body = form.elements.namedItem("body") as HTMLTextAreaElement | null
          if (!body) return
          const prefix = body.value.trim() ? "\n\n" : ""
          const addition = `${prefix}待解决问题：`
          const start = body.selectionStart ?? body.value.length
          body.setRangeText(addition, start, body.selectionEnd ?? start, "end")
          body.focus()
          body.dispatchEvent(new Event("input", { bubbles: true }))
          return
        }
        const connections = root.querySelector<HTMLDetailsElement>(
          "[data-editor-section=connections]",
        )
        if (connections) connections.open = true
        if (module === "source") {
          addSourceRow(undefined, true)
        } else {
          const target = form.elements.namedItem("prerequisites") as HTMLInputElement | null
          target?.focus()
        }
        connections?.scrollIntoView({ behavior: "smooth", block: "nearest" })
      })
    })
    form.addEventListener("input", () => {
      normalizeTags()
      if (state) state.textContent = currentUser && client ? "即将自动保存" : "有未保存改动"
      writeLocalBackup()
      queueAutosave()
    })
    form.addEventListener("submit", async (event) => {
      event.preventDefault()
      if (autosaveTimer) window.clearTimeout(autosaveTimer)
      normalizeTags()
      writeLocalBackup()
      if (!currentUser || !client) {
        setStatus("请先登录，草稿已暂存于当前浏览器。")
        return
      }
      if (state) state.textContent = "正在保存到云端…"
      if (await saveDocument()) {
        if (state) state.textContent = "云端草稿已保存"
      }
    })
    root.querySelector("[data-editor-clear]")?.addEventListener("click", () => {
      const data = readForm()
      if (
        (data.title || data.body) &&
        !window.confirm("确定清空当前内容吗？已经保存的历史版本不会被删除。")
      )
        return
      form.reset()
      const documentId = form.elements.namedItem("documentId") as HTMLInputElement | null
      if (documentId) documentId.value = ""
      const revision = form.elements.namedItem("revision") as HTMLInputElement | null
      if (revision) revision.value = "0"
      const statusField = form.elements.namedItem("status") as HTMLInputElement | null
      if (statusField) statusField.value = "draft"
      updatePublicationUI(null)
      renderSources()
      if (state) state.textContent = "尚未保存"
    })
  }

  if (workspace && workspaceSection === "write" && currentUser) {
    const params = new URLSearchParams(location.search)
    const documentId = params.get("document") ?? ""
    const requestedMode = params.get("mode")
    const requestedAction = params.get("action")
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(documentId)
    ) {
      void openDocument(documentId)
    } else if (requestedMode === "free") {
      openFlatWorkbench()
    } else if (requestedMode === "detailed") {
      startNewDocument()
    } else if (requestedAction === "import") {
      openImportDialog()
    }
  }

  onlineHandler = async () => {
    if (!client) {
      if (!(await ensureClient(true))) return
      watchAuthState()
      await sync()
      if (!currentUser || !form) {
        setStatus("登录服务已恢复，可以继续。", "success")
        return
      }
    }
    if (!currentUser || !form) return
    setStatus("网络已恢复，正在同步本地备份…")
    if (await saveDocument()) setStatus("本地备份已同步到云端。")
  }
  window.addEventListener("online", onlineHandler)
}

if (typeof document !== "undefined") document.addEventListener("nav", init)
if (typeof window !== "undefined") window.addEventListener("load", init, { once: true })
