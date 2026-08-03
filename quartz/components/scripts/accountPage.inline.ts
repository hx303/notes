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
import {
  EDITOR_DRAFT_SCOPE_PREFIX,
  bindDocumentEditorRoute,
  bindNewEditorDraftRoute,
  createEditorDraftId,
  editorDraftScope,
  parseEditorDraftId,
  resolveEditorRouteDecision,
  workspaceAuthReturnRoute,
  type EditorDraftMode,
} from "./editorDraftRoute.ts"
import {
  readFlatDraftSessionRecovery,
  removeFlatDraftSessionRecovery,
  writeFlatDraftSessionRecovery,
} from "./flatDraftRecovery.ts"
import {
  addEditorBackupMetadata,
  createEditorTabDraftState,
  createSerializedSaveQueue,
  inspectEditorBackup,
  removeStorageItemIfUnchanged,
  selectRecoverableEditorBackup,
  setStorageItemSafely,
  type EditorBackup,
} from "./editorRecovery.ts"
import { createEditorCoordinator, type EditorCoordinator } from "./editorCoordinator.ts"
import {
  createIndexedDbEditorOutboxRepository,
  createReplaySafeEditorOutbox,
  createReplaySafeIndexedDbEditorOutboxRepository,
  type EditorOutboxConflictResolutionToken,
  type EditorOutboxRecord,
} from "./editorOutbox.ts"
import {
  EDITOR_ATOMIC_SAVE_PROTOCOL,
  materializeAtomicEditorSavePayload,
  type AtomicEditorSavePayload,
} from "./editorAtomicSave.ts"
import {
  createEditorSaveController,
  editorAtomicSaveRetryDelay,
  inspectLegacyEditorPersistence,
  type EditorSaveControllerOutcome,
} from "./editorSaveController.ts"
import {
  assertImportComplexity,
  createLatestImportRequestGate,
  decodeUtf8Markdown,
  inspectDocxArchive,
  redactRemoteImportImages,
  validateImportFile,
} from "./importDraft.ts"
import {
  WORKSPACE_MISSING_RELATION_TITLE,
  parseWorkspaceRelations,
  parseWorkspaceSources,
  parseWorkspaceTags,
  redactWorkspaceSourcesForRecovery,
  serializeWorkspaceRelations,
  serializeWorkspaceTags,
  workspaceRelationDisplayTitle,
  type WorkspaceDocumentReference,
  type WorkspaceRelationSelection,
  type WorkspaceTag,
} from "./workspaceOrganization.ts"
import {
  aiSelectionSnapshotIsCurrent,
  applyAiSuggestion,
  captureAiSelection,
  parseAiSuggestionGatewayResponse,
  type AiSelectionSnapshot,
  type AiSuggestionAction,
  type AiSuggestionApplyMode,
  type AiSuggestionPreview,
} from "./workspaceAiSuggestion.ts"

const localDraftKey = (userId: string, documentId: string) =>
  `wouldkeep:editor-draft:${userId}:${documentId}`

const availableSessionStorage = () => {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

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

type WorkspaceRelationOption = WorkspaceDocumentReference & {
  topic?: string
  visibility?: string
  updatedAt?: string
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

type WorkspaceConflictSnapshot = WorkspaceFormData & {
  __sources?: WorkspaceSource[]
  organizationLoaded?: boolean
  cloudAvailable?: boolean
}

type PublicationState = {
  document_id: string
  audience: "public" | "unlisted"
  share_token?: string | null
  source_revision: number
  published_at: string
}

type AccountCapabilities = {
  role?: string
  is_site_owner?: boolean
  can_edit_site?: boolean
  can_manage_roles?: boolean
  can_moderate_comments?: boolean
  can_moderate_publications?: boolean
  can_read_other_private_documents?: boolean
}

type SiteReviewRow = {
  id: string
  file_path: string
  section_title?: string | null
  content: string
  user_id: string
  created_at: string
  profiles?: { display_name?: string | null } | null
}

type SiteRoleRow = {
  user_id: string
  email: string
  role: string
  display_name?: string | null
  granted_at?: string | null
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
  const siteOperationsNavItems = root.querySelectorAll<HTMLElement>("[data-site-operations-nav]")
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
  const siteOperations = root.querySelector<HTMLElement>("[data-site-operations]")
  const siteRefresh = root.querySelector<HTMLButtonElement>("[data-site-refresh]")
  const siteAccessLoading = root.querySelector<HTMLElement>("[data-site-access-loading]")
  const siteAccessDenied = root.querySelector<HTMLElement>("[data-site-access-denied]")
  const siteAccessMessage = root.querySelector<HTMLElement>("[data-site-access-message]")
  const siteOperationsContent = root.querySelector<HTMLElement>("[data-site-operations-content]")
  const siteRoleLabel = root.querySelector<HTMLElement>("[data-site-role-label]")
  const siteScopeCopy = root.querySelector<HTMLElement>("[data-site-scope-copy]")
  const siteReviewSection = root.querySelector<HTMLElement>("[data-site-review-section]")
  const siteReviewRefresh = root.querySelector<HTMLButtonElement>("[data-site-review-refresh]")
  const siteReviewLimit = root.querySelector<HTMLSelectElement>("[data-site-review-limit]")
  const siteReviewSummary = root.querySelector<HTMLElement>("[data-site-review-summary]")
  const siteReviewStatus = root.querySelector<HTMLElement>("[data-site-review-status]")
  const siteReviewList = root.querySelector<HTMLElement>("[data-site-review-list]")
  const siteRoleSection = root.querySelector<HTMLElement>("[data-site-role-section]")
  const siteRoleRefresh = root.querySelector<HTMLButtonElement>("[data-site-role-refresh]")
  const siteRoleForm = root.querySelector<HTMLFormElement>("[data-site-role-form]")
  const siteRoleEmail = root.querySelector<HTMLInputElement>("[data-site-role-email]")
  const siteRoleSelect = root.querySelector<HTMLSelectElement>("[data-site-role-select]")
  const siteRoleConsequence = root.querySelector<HTMLElement>("[data-site-role-consequence]")
  const siteRoleSubmit = root.querySelector<HTMLButtonElement>("[data-site-role-submit]")
  const siteRoleStatus = root.querySelector<HTMLElement>("[data-site-role-status]")
  const siteRoleList = root.querySelector<HTMLElement>("[data-site-role-list]")
  const siteSystemSection = root.querySelector<HTMLElement>("[data-site-system-section]")
  const siteStatusTime = root.querySelector<HTMLTimeElement>("[data-site-status-time]")
  const siteStatusList = root.querySelector<HTMLElement>("[data-site-status-list]")
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
  const aiSuggestionAssist = root.querySelector<HTMLElement>("[data-ai-suggestion-assist]")
  const aiSuggestionAvailability = root.querySelector<HTMLElement>(
    "[data-ai-suggestion-availability]",
  )
  const aiSuggestionAction = root.querySelector<HTMLSelectElement>("[data-ai-suggestion-action]")
  const aiSuggestionGenerate = root.querySelector<HTMLButtonElement>(
    "[data-ai-suggestion-generate]",
  )
  const aiSuggestionStatus = root.querySelector<HTMLElement>("[data-ai-suggestion-status]")
  const aiSuggestionPreview = root.querySelector<HTMLElement>("[data-ai-suggestion-preview]")
  const aiSuggestionMode = root.querySelector<HTMLElement>("[data-ai-suggestion-mode]")
  const aiSuggestionOriginal = root.querySelector<HTMLElement>("[data-ai-suggestion-original]")
  const aiSuggestionOutput = root.querySelector<HTMLElement>("[data-ai-suggestion-output]")
  const aiSuggestionReplace = root.querySelector<HTMLButtonElement>("[data-ai-suggestion-replace]")
  const aiSuggestionInsert = root.querySelector<HTMLButtonElement>("[data-ai-suggestion-insert]")
  const aiSuggestionRegenerate = root.querySelector<HTMLButtonElement>(
    "[data-ai-suggestion-regenerate]",
  )
  const aiSuggestionDiscard = root.querySelector<HTMLButtonElement>("[data-ai-suggestion-discard]")
  const state = root.querySelector<HTMLElement>("[data-editor-state]")
  const editorLoadRecovery = root.querySelector<HTMLElement>("[data-editor-load-recovery]")
  const editorLoadRecoveryTitle = root.querySelector<HTMLElement>(
    "[data-editor-load-recovery-title]",
  )
  const editorLoadRecoveryMessage = root.querySelector<HTMLElement>(
    "[data-editor-load-recovery-message]",
  )
  const editorRetryLoad = root.querySelector<HTMLButtonElement>("[data-editor-retry-load]")
  const editorManualRecoveryActions = root.querySelector<HTMLElement>(
    "[data-editor-manual-recovery-actions]",
  )
  const editorRecoveryExport = root.querySelector<HTMLButtonElement>(
    "[data-editor-recovery-export]",
  )
  const editorRecoveryArchive = root.querySelector<HTMLButtonElement>(
    "[data-editor-recovery-archive]",
  )
  const editorManualRecoveryStatus = root.querySelector<HTMLElement>(
    "[data-editor-manual-recovery-status]",
  )
  const conflictSection = root.querySelector<HTMLElement>("[data-editor-conflict]")
  const conflictHeading = root.querySelector<HTMLElement>("[data-editor-conflict-title]")
  const conflictMeta = root.querySelector<HTMLElement>("[data-editor-conflict-meta]")
  const conflictLocalTitle = root.querySelector<HTMLElement>("[data-editor-conflict-local-title]")
  const conflictLocalBody = root.querySelector<HTMLElement>("[data-editor-conflict-local-body]")
  const conflictCloudTitle = root.querySelector<HTMLElement>("[data-editor-conflict-cloud-title]")
  const conflictCloudBody = root.querySelector<HTMLElement>("[data-editor-conflict-cloud-body]")
  const conflictLocalOrganization = root.querySelector<HTMLElement>(
    "[data-editor-conflict-local-organization]",
  )
  const conflictCloudOrganization = root.querySelector<HTMLElement>(
    "[data-editor-conflict-cloud-organization]",
  )
  const conflictUseLocal = root.querySelector<HTMLButtonElement>("[data-conflict-use-local]")
  const conflictUseCloud = root.querySelector<HTMLButtonElement>("[data-conflict-use-cloud]")
  const conflictSaveCopy = root.querySelector<HTMLButtonElement>("[data-conflict-save-copy]")
  const conflictExportLocal = root.querySelector<HTMLButtonElement>("[data-conflict-export-local]")
  const tagInput = root.querySelector<HTMLInputElement>("[data-tag-input]")
  const tagList = root.querySelector<HTMLElement>("[data-tag-list]")
  const tagValues = root.querySelector<HTMLInputElement>("[data-tag-values]")
  const tagStatus = root.querySelector<HTMLElement>("[data-tag-status]")
  const relationEditors = [...root.querySelectorAll<HTMLElement>("[data-relation-editor]")]
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
  let currentCapabilities: AccountCapabilities | null = null
  let authEpoch = 0
  let autosaveTimer: number | undefined
  let editorRetryTimer: number | undefined
  let editorRetryTimerEpoch = 0
  let serializedSaveIntent: {
    ownerId: string
    authEpoch: number
    documentScopeId: string
    saveEpoch: number
    generation: number
    enqueue: boolean
    explicit: boolean
  } | null = null
  const cancelEditorRetryTimer = () => {
    editorRetryTimerEpoch += 1
    if (editorRetryTimer !== undefined) window.clearTimeout(editorRetryTimer)
    editorRetryTimer = undefined
  }
  let editorChangeGeneration = 0
  let aiSuggestionRequestEpoch = 0
  let aiSuggestionGenerationInFlight = false
  let activeAiSelection: AiSelectionSnapshot | null = null
  let activeAiSuggestion: AiSuggestionPreview | null = null
  let aiSuggestionPreferences: {
    allowPrivateContent: boolean
    enabled: boolean
    monthlyBudgetCents: number
  } | null = null
  const editorTabDrafts = createEditorTabDraftState()
  let currentDraftId = ""
  let editorConflictResolutionPending = false
  let editorConflict: {
    ownerId: string
    documentId: string
    backup: EditorBackup
    reason: "unknown-base" | "stale-base" | "remote-write" | "not-found" | "request-rejected"
    cloud: WorkspaceConflictSnapshot
    operationId?: string
  } | null = null
  let editorSaveEpoch = 0
  let editorSaveReadyDocumentId: string | null = null
  let editorManualSaveGate: {
    ownerId: string
    authEpoch: number
    documentScopeId: string
  } | null = null
  let editorLoadFailureDocumentId = ""
  const conflictInertedFormChildren = new Set<HTMLElement>()
  const clearEditorManualSaveGate = () => {
    editorManualSaveGate = null
  }
  const editorManualSaveIsRequired = (documentScopeId: string) =>
    Boolean(
      editorManualSaveGate &&
      currentUser?.id === editorManualSaveGate.ownerId &&
      authEpoch === editorManualSaveGate.authEpoch &&
      documentScopeId === editorManualSaveGate.documentScopeId,
    )
  const requireExplicitEditorSave = (documentScopeId: string) => {
    if (!currentUser) return false
    editorManualSaveGate = {
      ownerId: String(currentUser.id),
      authEpoch,
      documentScopeId,
    }
    cancelEditorRetryTimer()
    return true
  }
  const invalidateEditorSaves = () => {
    cancelEditorRetryTimer()
    clearEditorManualSaveGate()
    editorSaveEpoch += 1
    editorSaveReadyDocumentId = null
  }
  const allowEditorSaves = (documentId: string) => {
    cancelEditorRetryTimer()
    editorSaveEpoch += 1
    editorSaveReadyDocumentId = documentId
  }
  const editorSaveIsAllowed = (documentId: string, expectedEpoch = editorSaveEpoch) =>
    expectedEpoch === editorSaveEpoch &&
    editorSaveReadyDocumentId === documentId &&
    editorConflict?.documentId !== documentId
  const hideEditorLoadRecovery = () => {
    editorLoadFailureDocumentId = ""
    if (editorLoadRecovery) editorLoadRecovery.hidden = true
    if (editorLoadRecoveryTitle) editorLoadRecoveryTitle.textContent = "这条知识还没有完整载入"
    if (editorRetryLoad) {
      editorRetryLoad.hidden = false
      editorRetryLoad.textContent = "重新加载文档"
    }
    if (editorManualRecoveryActions) editorManualRecoveryActions.hidden = true
  }
  const showEditorLoadRecovery = (documentId: string, message: string) => {
    editorLoadFailureDocumentId = documentId
    if (editorLoadRecoveryMessage) editorLoadRecoveryMessage.textContent = message
    if (editorLoadRecovery) editorLoadRecovery.hidden = false
  }
  const showEditorManualRecoveryGate = (message: string) => {
    invalidateEditorSaves()
    editorLoadFailureDocumentId = ""
    if (form) {
      form.inert = true
      form.setAttribute("aria-busy", "false")
    }
    if (editorLoadRecoveryTitle) editorLoadRecoveryTitle.textContent = "先处理旧版恢复内容"
    if (editorLoadRecoveryMessage) editorLoadRecoveryMessage.textContent = message
    if (editorRetryLoad) editorRetryLoad.hidden = true
    if (editorManualRecoveryActions) editorManualRecoveryActions.hidden = false
    editorManualRecoveryExported = false
    if (editorRecoveryArchive) editorRecoveryArchive.disabled = true
    if (editorManualRecoveryStatus)
      editorManualRecoveryStatus.textContent =
        "必须先导出；只有再次明确确认后才会归档并清除原记录。"
    if (editorLoadRecovery) editorLoadRecovery.hidden = false
    if (state) state.textContent = "旧版恢复内容待人工处理，云端保存已暂停"
  }
  let editorUiMutationTail: Promise<void> = Promise.resolve()
  const runEditorUiExclusive = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = editorUiMutationTail.then(operation, operation)
    editorUiMutationTail = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
  let workspaceDocuments: WorkspaceDocument[] = []
  let relationDocumentOptions: WorkspaceRelationOption[] = []
  let selectedTags: WorkspaceTag[] = []
  const selectedRelations: Record<"prerequisite" | "related", WorkspaceRelationSelection[]> = {
    prerequisite: [],
    related: [],
  }
  const retainedUnavailableRelationTargetIds: Record<"prerequisite" | "related", Set<string>> = {
    prerequisite: new Set(),
    related: new Set(),
  }
  let retainedUnavailableRelationDocumentId = ""
  const clearRetainedUnavailableRelationTargets = () => {
    retainedUnavailableRelationTargetIds.prerequisite.clear()
    retainedUnavailableRelationTargetIds.related.clear()
    retainedUnavailableRelationDocumentId = ""
  }
  let currentPublication: PublicationState | null = null
  let editorKnowledgeBaseBinding: { documentId: string; knowledgeBaseId: string } | null = null
  let importedDraft: ImportedDraft | null = null
  const importRequests = createLatestImportRequestGate()
  const authSyncRequests = createLatestImportRequestGate()
  const openDocumentRequests = createLatestImportRequestGate()
  let importConfirming = false
  let lastImportFile: File | null = null
  let currentProfileAvatarUrl = ""
  let profilePreviewObjectUrl = ""
  let profileCropSourceUrl = ""
  let profileCroppedBlob: Blob | null = null
  let profileCropper: any = null
  let profilePersonalizationAvailable = true
  let authSubscription: { unsubscribe?: () => void } | null = null
  let resumeWorkspaceRouteAfterAuth: (() => Promise<boolean>) | null = null
  let onlineHandler: (() => void) | null = null
  let editorCoordinator: EditorCoordinator | null = null
  let editorSaveController: ReturnType<typeof createEditorSaveController> | null = null
  let editorManualRecoveryBlocked = false
  let editorManualRecoveryExported = false
  let editorManualRecoveryPackage: {
    ownerId: string
    generatedAt: string
    legacyRows: unknown[]
    genericBackupKey: string | null
    genericBackup: string | null
  } | null = null
  const replaySafeEditorRepository = (() => {
    try {
      return createReplaySafeIndexedDbEditorOutboxRepository()
    } catch {
      return null
    }
  })()
  const editorOutbox = replaySafeEditorRepository
    ? createReplaySafeEditorOutbox(replaySafeEditorRepository)
    : null
  const legacyEditorRepository = (() => {
    try {
      return createIndexedDbEditorOutboxRepository()
    } catch {
      return null
    }
  })()
  let disposed = false

  const captureAuthContext = () => ({
    ownerId: currentUser?.id ? String(currentUser.id) : "",
    client,
    epoch: authEpoch,
  })
  const authContextIsCurrent = (context: ReturnType<typeof captureAuthContext>) =>
    !disposed &&
    Boolean(context.ownerId) &&
    currentUser?.id === context.ownerId &&
    client === context.client &&
    authEpoch === context.epoch

  window.addCleanup(() => {
    disposed = true
    importRequests.invalidate()
    authSyncRequests.invalidate()
    openDocumentRequests.invalidate()
    importedDraft = null
    if (autosaveTimer) window.clearTimeout(autosaveTimer)
    cancelEditorRetryTimer()
    authSubscription?.unsubscribe?.()
    if (onlineHandler) window.removeEventListener("online", onlineHandler)
    editorCoordinator?.close()
    editorSaveController?.close()
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

  const loadAiSettings = async (isCurrent = () => true) => {
    if (!client || !currentUser || !aiSettingsForm) return
    const context = captureAuthContext()
    const ownerId = context.ownerId
    const result = await context.client
      .from("ai_preferences")
      .select("enabled,allow_private_content,monthly_budget_cents,grounding_mode,updated_at")
      .eq("owner_id", ownerId)
      .maybeSingle()
    if (!authContextIsCurrent(context) || !isCurrent()) return
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

  const loadProfileSettings = async (isCurrent = () => true) => {
    if (!client || !currentUser || !profileSettingsForm) return
    const context = captureAuthContext()
    const ownerId = context.ownerId
    const ownerEmail = currentUser.email ?? ""
    let result = await context.client
      .from("profiles")
      .select("display_name,avatar_url,signature,bio,location,website_url")
      .eq("id", ownerId)
      .maybeSingle()
    if (!authContextIsCurrent(context) || !isCurrent()) return
    profilePersonalizationAvailable = !result.error
    if (result.error) {
      result = await context.client
        .from("profiles")
        .select("display_name,avatar_url")
        .eq("id", ownerId)
        .maybeSingle()
      if (!authContextIsCurrent(context) || !isCurrent()) return
    }
    if (result.error) {
      setProfileStatus("暂时无法读取个人资料，请刷新后重试。", "error")
      return
    }
    const displayName = result.data?.display_name?.trim() || ownerEmail.split("@")[0] || "我的账户"
    currentProfileAvatarUrl = result.data?.avatar_url ?? ""
    if (profileDisplayName) profileDisplayName.value = displayName
    if (profileSignature) profileSignature.value = result.data?.signature ?? ""
    if (profileBio) profileBio.value = result.data?.bio ?? ""
    if (profileLocation) profileLocation.value = result.data?.location ?? ""
    if (profileWebsite) profileWebsite.value = result.data?.website_url ?? ""
    if (profileEmail) profileEmail.textContent = ownerEmail || "—"
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
      location.assign(workspaceAuthReturnRoute(window.location.href, Boolean(workspace)))
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

  const loadVersions = async (documentId: string, isCurrent = () => true) => {
    if (!client || !currentUser || !history || !historyList) return false
    const loadClient = client
    const ownerId = String(currentUser.id)
    const loadEpoch = authEpoch
    const result = await loadClient
      .from("document_versions")
      .select("version_no,snapshot,created_at")
      .eq("document_id", documentId)
      .eq("owner_id", ownerId)
      .order("version_no", { ascending: false })
      .limit(10)
    if (
      disposed ||
      authEpoch !== loadEpoch ||
      currentUser?.id !== ownerId ||
      client !== loadClient ||
      !isCurrent()
    )
      return false
    if (result.error) return false
    if (!result.data?.length) {
      historyList.replaceChildren()
      history.hidden = true
      return true
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
          if (!isCurrent()) return
          const normalizedSnapshot = {
            title: "",
            body: "",
            topic: "",
            maturity: "seed",
            visibility: "private",
            tags: "",
            prerequisites: "",
            related: "",
            ...version.snapshot,
          }
          fillForm(normalizedSnapshot)
          const snapshotSources = (normalizedSnapshot as Record<string, unknown>).__sources
          renderSources(
            Array.isArray(snapshotSources) ? (snapshotSources as WorkspaceSource[]) : [],
          )
          editorChangeGeneration += 1
          writeLocalBackup()
          if (state) state.textContent = `已载入版本 ${version.version_no}，保存后会生成新版本`
        })
        historyList.appendChild(button)
      },
    )
    return true
  }

  const ensureKnowledgeBase = async (isCurrent = () => true) => {
    if (!client || !currentUser) return null
    const context = captureAuthContext()
    const contextIsCurrent = () => authContextIsCurrent(context) && isCurrent()
    const existing = await context.client
      .from("knowledge_bases")
      .select("id")
      .eq("owner_id", context.ownerId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    if (!contextIsCurrent()) return null
    if (existing.data?.id) return existing.data.id
    const created = await context.client
      .from("knowledge_bases")
      .insert({ owner_id: context.ownerId, name: "我的知识库", default_visibility: "private" })
      .select("id")
      .single()
    if (!contextIsCurrent()) return null
    return created.data?.id ?? null
  }

  const loadDocuments = async (isCurrent = () => true) => {
    if (!client || !currentUser || !workspace) return
    const context = captureAuthContext()
    const result = await context.client
      .from("documents")
      .select("id,title,topic,status,visibility,maturity,revision,updated_at,deleted_at")
      .eq("owner_id", context.ownerId)
      .order("updated_at", { ascending: false })
    if (!authContextIsCurrent(context) || !isCurrent()) return
    if (result.error) {
      setStatus("云端知识库还没有准备好；请先在 Supabase 执行工作区迁移。")
      return
    }
    renderDocuments((result.data ?? []) as WorkspaceDocument[])
  }

  const canAccessSiteOperations = (capabilities: AccountCapabilities | null) =>
    Boolean(
      capabilities?.can_edit_site ||
      capabilities?.can_manage_roles ||
      capabilities?.can_moderate_comments ||
      capabilities?.can_moderate_publications,
    )

  const setSiteInlineStatus = (
    target: HTMLElement | null,
    message: string,
    state: "info" | "error" | "success" = "info",
  ) => {
    if (!target) return
    target.textContent = message
    target.dataset.state = message ? state : ""
    target.setAttribute("role", state === "error" ? "alert" : "status")
    target.setAttribute("aria-live", state === "error" ? "assertive" : "polite")
  }

  const siteRoleName = (role: string | undefined, isOwner = false) => {
    if (isOwner) return "站长"
    if (role === "admin") return "管理员"
    if (role === "editor") return "编辑者"
    return "普通用户"
  }

  const resetSiteOperations = () => {
    currentCapabilities = null
    siteOperationsNavItems.forEach((item) => {
      item.hidden = true
    })
    if (siteRefresh) siteRefresh.hidden = true
    if (siteAccessLoading) siteAccessLoading.hidden = false
    if (siteAccessDenied) siteAccessDenied.hidden = true
    if (siteOperationsContent) siteOperationsContent.hidden = true
    if (siteReviewSection) siteReviewSection.hidden = true
    if (siteRoleSection) siteRoleSection.hidden = true
    siteReviewList?.replaceChildren()
    siteRoleList?.replaceChildren()
    siteStatusList?.replaceChildren()
    setSiteInlineStatus(siteReviewStatus, "")
    setSiteInlineStatus(siteRoleStatus, "")
  }

  const renderSiteAccess = (
    capabilities: AccountCapabilities | null,
    failure: "none" | "verification" = "none",
  ) => {
    const allowed = failure === "none" && canAccessSiteOperations(capabilities)
    if (siteAccessLoading) siteAccessLoading.hidden = true
    if (siteRefresh) siteRefresh.hidden = false
    if (siteAccessDenied) siteAccessDenied.hidden = allowed
    if (siteOperationsContent) siteOperationsContent.hidden = !allowed
    if (!allowed) {
      if (siteAccessMessage) {
        siteAccessMessage.textContent =
          failure === "verification"
            ? "暂时无法验证当前账户的站点权限。为保护站点数据，本页已保持关闭；请检查网络后刷新。"
            : "你仍然可以正常管理自己的知识库；站点运营仅对经过授权的协作者开放。"
      }
      if (siteReviewSection) siteReviewSection.hidden = true
      if (siteRoleSection) siteRoleSection.hidden = true
      queueMicrotask(() => {
        if (siteAccessDenied && !siteAccessDenied.hidden) siteAccessDenied.focus()
      })
      return
    }

    const isOwner = capabilities?.is_site_owner === true
    if (siteRoleLabel) siteRoleLabel.textContent = siteRoleName(capabilities?.role, isOwner)
    if (siteScopeCopy) {
      siteScopeCopy.textContent = isOwner
        ? "可处理公开反馈与协作者角色；任何站点角色都不能读取其他账户的私密草稿。"
        : capabilities?.can_moderate_comments
          ? "可处理公开反馈并查看非敏感状态；不能查看其他账户的私密草稿或管理角色。"
          : "可查看非敏感发布状态；不能处理反馈、管理角色或读取其他账户的私密草稿。"
    }
    if (siteReviewSection) siteReviewSection.hidden = capabilities?.can_moderate_comments !== true
    if (siteRoleSection)
      siteRoleSection.hidden = !(isOwner && capabilities?.can_manage_roles === true)
    if (siteSystemSection) siteSystemSection.hidden = false
  }

  const renderSiteEmptyState = (target: HTMLElement | null, message: string) => {
    if (!target) return
    const empty = globalThis.document.createElement("p")
    empty.className = "site-empty-state"
    empty.textContent = message
    target.replaceChildren(empty)
  }

  const loadSiteReviewQueue = async (isCurrent = () => true) => {
    if (!client || !currentUser || currentCapabilities?.can_moderate_comments !== true) return
    const context = captureAuthContext()
    const limit = Number(siteReviewLimit?.value) === 50 ? 50 : 20
    setSiteInlineStatus(siteReviewStatus, "正在读取公开反馈……")
    let result: any
    try {
      result = await context.client
        .from("comments")
        .select("id,file_path,section_title,content,user_id,created_at,profiles(display_name)", {
          count: "exact",
        })
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(limit)
      if (result.error) {
        result = await context.client
          .from("comments")
          .select("id,file_path,section_title,content,user_id,created_at", { count: "exact" })
          .eq("is_deleted", false)
          .order("created_at", { ascending: false })
          .limit(limit)
      }
    } catch {
      if (!authContextIsCurrent(context) || !isCurrent()) return
      setSiteInlineStatus(siteReviewStatus, "公开反馈读取失败，请稍后重试。", "error")
      renderSiteEmptyState(siteReviewList, "暂时无法显示反馈；页面不会改为读取私密内容。")
      return
    }
    if (!authContextIsCurrent(context) || !isCurrent()) return
    if (result.error) {
      setSiteInlineStatus(siteReviewStatus, "公开反馈读取失败，请稍后重试。", "error")
      renderSiteEmptyState(siteReviewList, "暂时无法显示反馈；页面不会改为读取私密内容。")
      return
    }

    const rows = (result.data ?? []) as SiteReviewRow[]
    const total = typeof result.count === "number" ? result.count : rows.length
    if (siteReviewSummary) {
      siteReviewSummary.textContent = total
        ? `共 ${total} 条公开反馈，当前显示最近 ${rows.length} 条。`
        : "目前没有待查看的公开反馈。"
    }
    setSiteInlineStatus(siteReviewStatus, "")
    if (!rows.length) {
      renderSiteEmptyState(siteReviewList, "暂时没有评论或纠错建议。新的公开反馈会出现在这里。")
      return
    }

    const fragment = globalThis.document.createDocumentFragment()
    rows.forEach((row) => {
      const article = globalThis.document.createElement("article")
      article.className = "site-review-item"

      const meta = globalThis.document.createElement("div")
      meta.className = "site-review-meta"
      const author = globalThis.document.createElement("strong")
      author.textContent = row.profiles?.display_name || "wouldkeep 用户"
      const kind = globalThis.document.createElement("span")
      kind.className = "site-review-kind"
      kind.textContent = row.section_title?.startsWith("纠错建议") ? "纠错建议" : "公开评论"
      const time = globalThis.document.createElement("time")
      time.dateTime = row.created_at
      const createdAt = new Date(row.created_at)
      time.textContent = Number.isNaN(createdAt.getTime())
        ? "时间未知"
        : createdAt.toLocaleString("zh-CN", {
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
      meta.append(author, kind, time)

      const body = globalThis.document.createElement("div")
      body.className = "site-review-body"
      const location = globalThis.document.createElement("strong")
      location.textContent = `${row.file_path} · ${row.section_title || "整篇知识记录"}`
      const content = globalThis.document.createElement("p")
      content.textContent = row.content
      body.append(location, content)

      const remove = globalThis.document.createElement("button")
      remove.type = "button"
      remove.className = "site-review-remove"
      remove.textContent = "移出公开讨论"
      remove.addEventListener("click", async () => {
        if (currentCapabilities?.can_moderate_comments !== true) {
          setSiteInlineStatus(siteReviewStatus, "权限已变化，请刷新后重试。", "error")
          return
        }
        if (
          !window.confirm(
            `将这条来自“${row.file_path}”的公开反馈移出公开页面？\n\n此操作只会将记录标记为已删除，不会物理删除数据。`,
          )
        )
          return
        remove.disabled = true
        setSiteInlineStatus(siteReviewStatus, "正在将反馈移出公开页面……")
        const deleteContext = captureAuthContext()
        try {
          const deletion = await deleteContext.client
            .from("comments")
            .update({ is_deleted: true })
            .eq("id", row.id)
            .eq("is_deleted", false)
            .select("id")
            .maybeSingle()
          if (!authContextIsCurrent(deleteContext) || !isCurrent()) return
          if (deletion.error || !deletion.data?.id) {
            setSiteInlineStatus(siteReviewStatus, "操作失败；反馈仍保持原状。", "error")
            return
          }
          setSiteInlineStatus(siteReviewStatus, "已从公开讨论中移除，原记录仍保留。", "success")
          await loadSiteReviewQueue(isCurrent)
        } catch {
          if (authContextIsCurrent(deleteContext) && isCurrent())
            setSiteInlineStatus(siteReviewStatus, "操作失败；反馈仍保持原状。", "error")
        } finally {
          remove.disabled = false
        }
      })

      article.append(meta, body, remove)
      fragment.append(article)
    })
    siteReviewList?.replaceChildren(fragment)
  }

  const updateSiteRoleConsequence = () => {
    if (!siteRoleConsequence) return
    const messages: Record<string, string> = {
      user: "对方将只能访问自己的账户与个人知识工作区，不能再进入站点运营。",
      editor: "对方可进入站点运营并查看非敏感状态；不能处理反馈、管理角色或读取他人私密草稿。",
      admin: "对方可查看非敏感状态并软删除公开反馈；不能管理角色或读取他人私密草稿。",
    }
    siteRoleConsequence.textContent = messages[siteRoleSelect?.value ?? "user"] ?? messages.user
  }

  const loadSiteRoles = async (isCurrent = () => true) => {
    if (
      !client ||
      !currentUser ||
      currentCapabilities?.is_site_owner !== true ||
      currentCapabilities?.can_manage_roles !== true
    )
      return
    const context = captureAuthContext()
    setSiteInlineStatus(siteRoleStatus, "正在读取账户目录……")
    let result: any
    try {
      result = await context.client.rpc("list_roles", { admin_uid: context.ownerId })
    } catch {
      if (!authContextIsCurrent(context) || !isCurrent()) return
      setSiteInlineStatus(siteRoleStatus, "账户目录读取失败，请稍后重试。", "error")
      renderSiteEmptyState(siteRoleList, "目录保持关闭；没有回退到公开账户查询。")
      return
    }
    if (!authContextIsCurrent(context) || !isCurrent()) return
    if (result.error) {
      setSiteInlineStatus(siteRoleStatus, "账户目录读取失败，请稍后重试。", "error")
      renderSiteEmptyState(siteRoleList, "目录保持关闭；没有回退到公开账户查询。")
      return
    }
    const rows = (result.data ?? []) as SiteRoleRow[]
    setSiteInlineStatus(siteRoleStatus, `${rows.length} 个账户；角色目录仅站长可见。`)
    if (!rows.length) {
      renderSiteEmptyState(siteRoleList, "当前没有可显示的账户。")
      return
    }
    const fragment = globalThis.document.createDocumentFragment()
    rows.forEach((row) => {
      const isOwner = row.user_id === context.ownerId
      const item = globalThis.document.createElement("div")
      item.className = "site-role-row"
      const identity = globalThis.document.createElement("div")
      identity.className = "site-role-identity"
      const name = globalThis.document.createElement("strong")
      name.textContent = row.display_name || row.email
      const address = globalThis.document.createElement("small")
      address.textContent = row.email
      identity.append(name, address)
      const badge = globalThis.document.createElement("span")
      badge.className = "site-role-badge"
      badge.textContent = siteRoleName(row.role, isOwner)
      const action = globalThis.document.createElement("button")
      action.type = "button"
      action.className = "account-secondary"
      action.disabled = isOwner
      action.textContent = isOwner ? "站长角色受保护" : "更改角色"
      if (!isOwner) {
        action.addEventListener("click", () => {
          if (siteRoleEmail) siteRoleEmail.value = row.email
          if (siteRoleSelect) siteRoleSelect.value = row.role || "user"
          updateSiteRoleConsequence()
          siteRoleEmail?.focus()
        })
      }
      item.append(identity, badge, action)
      fragment.append(item)
    })
    siteRoleList?.replaceChildren(fragment)
  }

  const appendSiteStatus = (
    label: string,
    detail: string,
    state: "ok" | "error",
    checkedAt: Date,
  ) => {
    if (!siteStatusList) return
    const row = globalThis.document.createElement("div")
    row.className = "site-status-row"
    const dot = globalThis.document.createElement("span")
    dot.className = "site-status-dot"
    dot.dataset.state = state
    dot.setAttribute("aria-hidden", "true")
    const copy = globalThis.document.createElement("div")
    copy.className = "site-status-copy"
    const name = globalThis.document.createElement("strong")
    name.textContent = label
    const description = globalThis.document.createElement("small")
    description.textContent = detail
    copy.append(name, description)
    const time = globalThis.document.createElement("time")
    time.dateTime = checkedAt.toISOString()
    time.textContent = checkedAt.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    })
    row.append(dot, copy, time)
    siteStatusList.append(row)
  }

  const loadSiteSystemStatus = async (isCurrent = () => true) => {
    if (!client || !currentUser || !canAccessSiteOperations(currentCapabilities)) return
    const context = captureAuthContext()
    const startedAt = new Date()
    siteStatusList?.replaceChildren()
    appendSiteStatus(
      "登录会话",
      `已确认当前账户 ${currentUser.email || "（未公开邮箱）"}`,
      "ok",
      startedAt,
    )
    appendSiteStatus("权限服务", "能力范围已由 current_account_capabilities 确认", "ok", startedAt)

    let publicationResult: any
    try {
      publicationResult = await context.client.rpc("list_public_documents", {
        p_limit: 1,
        p_offset: 0,
      })
    } catch {
      publicationResult = { error: true }
    }
    if (!authContextIsCurrent(context) || !isCurrent()) return
    const checkedAt = new Date()
    appendSiteStatus(
      "公开发布读取",
      publicationResult.error
        ? "公开摘要读取失败；未尝试读取任何私密正文"
        : "公开摘要 RPC 响应正常；本检查不显示正文",
      publicationResult.error ? "error" : "ok",
      checkedAt,
    )
    if (siteStatusTime) {
      siteStatusTime.dateTime = checkedAt.toISOString()
      siteStatusTime.textContent = `检查于 ${checkedAt.toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
      })}`
    }
  }

  const loadCapabilities = async (isCurrent = () => true) => {
    if (!client || !currentUser || !workspace) {
      resetSiteOperations()
      return null
    }
    const context = captureAuthContext()
    let result: any
    try {
      result = await context.client.rpc("current_account_capabilities")
    } catch {
      if (!authContextIsCurrent(context) || !isCurrent()) return null
      currentCapabilities = null
      siteOperationsNavItems.forEach((item) => {
        item.hidden = true
      })
      if (workspaceSection === "site") renderSiteAccess(null, "verification")
      return null
    }
    if (!authContextIsCurrent(context) || !isCurrent()) return null
    if (result.error || !result.data) {
      currentCapabilities = null
      siteOperationsNavItems.forEach((item) => {
        item.hidden = true
      })
      if (workspaceSection === "site") renderSiteAccess(null, "verification")
      return null
    }
    currentCapabilities = result.data as AccountCapabilities
    const allowed = canAccessSiteOperations(currentCapabilities)
    siteOperationsNavItems.forEach((item) => {
      item.hidden = !allowed
    })
    if (workspaceSection === "site") renderSiteAccess(currentCapabilities)
    return currentCapabilities
  }

  const loadSiteOperations = async (isCurrent = () => true) => {
    if (!canAccessSiteOperations(currentCapabilities)) return
    await Promise.all([
      currentCapabilities?.can_moderate_comments ? loadSiteReviewQueue(isCurrent) : undefined,
      currentCapabilities?.is_site_owner && currentCapabilities.can_manage_roles
        ? loadSiteRoles(isCurrent)
        : undefined,
      loadSiteSystemStatus(isCurrent),
    ])
  }

  siteRoleSelect?.addEventListener("change", updateSiteRoleConsequence)
  updateSiteRoleConsequence()

  siteReviewRefresh?.addEventListener("click", async () => {
    siteReviewRefresh.disabled = true
    try {
      await loadSiteReviewQueue()
    } catch {
      setSiteInlineStatus(siteReviewStatus, "公开反馈刷新失败，请稍后重试。", "error")
    } finally {
      siteReviewRefresh.disabled = false
    }
  })
  siteReviewLimit?.addEventListener("change", async () => {
    siteReviewLimit.disabled = true
    try {
      await loadSiteReviewQueue()
    } catch {
      setSiteInlineStatus(siteReviewStatus, "公开反馈刷新失败，请稍后重试。", "error")
    } finally {
      siteReviewLimit.disabled = false
    }
  })
  siteRoleRefresh?.addEventListener("click", async () => {
    siteRoleRefresh.disabled = true
    try {
      await loadSiteRoles()
    } catch {
      setSiteInlineStatus(siteRoleStatus, "账户目录刷新失败，请稍后重试。", "error")
    } finally {
      siteRoleRefresh.disabled = false
    }
  })
  siteRefresh?.addEventListener("click", async () => {
    siteRefresh.disabled = true
    if (siteAccessLoading) siteAccessLoading.hidden = false
    if (siteAccessDenied) siteAccessDenied.hidden = true
    if (siteOperationsContent) siteOperationsContent.hidden = true
    try {
      await loadCapabilities()
      await loadSiteOperations()
    } catch {
      renderSiteAccess(null, "verification")
    } finally {
      siteRefresh.disabled = false
    }
  })

  siteRoleForm?.addEventListener("submit", async (event) => {
    event.preventDefault()
    if (
      !client ||
      !currentUser ||
      currentCapabilities?.is_site_owner !== true ||
      currentCapabilities?.can_manage_roles !== true
    ) {
      setSiteInlineStatus(siteRoleStatus, "当前账户不能管理角色，请刷新后重试。", "error")
      return
    }
    const targetEmail = siteRoleEmail?.value.trim() ?? ""
    const targetRole = siteRoleSelect?.value ?? "user"
    if (!targetEmail || !siteRoleEmail?.checkValidity()) {
      siteRoleEmail?.reportValidity()
      return
    }
    if (
      targetEmail.toLocaleLowerCase("en-US") ===
      String(currentUser.email ?? "").toLocaleLowerCase("en-US")
    ) {
      setSiteInlineStatus(siteRoleStatus, "站长角色受服务端保护，不能在这里更改。", "error")
      return
    }
    const consequence = siteRoleConsequence?.textContent?.trim() ?? "角色权限将立即变化。"
    if (
      !window.confirm(`确认将 ${targetEmail} 设为“${siteRoleName(targetRole)}”？\n\n${consequence}`)
    )
      return

    if (siteRoleSubmit) siteRoleSubmit.disabled = true
    setSiteInlineStatus(siteRoleStatus, "正在应用角色变更……")
    const context = captureAuthContext()
    try {
      const result =
        targetRole === "user"
          ? await context.client.rpc("revoke_role", {
              admin_uid: context.ownerId,
              target_email: targetEmail,
            })
          : await context.client.rpc("grant_role", {
              admin_uid: context.ownerId,
              target_email: targetEmail,
              target_role: targetRole,
            })
      if (!authContextIsCurrent(context)) return
      if (result.error) {
        setSiteInlineStatus(siteRoleStatus, "角色变更失败；原权限保持不变。", "error")
        return
      }
      setSiteInlineStatus(siteRoleStatus, "角色已更新并立即生效。", "success")
      siteRoleForm.reset()
      updateSiteRoleConsequence()
      await loadSiteRoles()
    } catch {
      if (authContextIsCurrent(context))
        setSiteInlineStatus(siteRoleStatus, "角色变更失败；原权限保持不变。", "error")
    } finally {
      if (siteRoleSubmit) siteRoleSubmit.disabled = false
    }
  })

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
    syncOrganizationEditorsFromFields()
  }

  const organizationIssueMessage = (code: string) => {
    const messages: Record<string, string> = {
      hidden_invalid: "整理信息格式无法识别；原值已保留，请重新加载后再试。",
      tag_blank: "请输入标签名称。",
      tag_too_long: "标签名称不能超过 80 个字符。",
      tag_punctuation_only: "标签需要包含文字或数字，不能只有标点。",
      relation_unknown: "没有找到这条知识，请重新选择。",
      relation_ambiguous: "存在同名知识，请从带主题和更新时间的列表中明确选择。",
      relation_self: "不能把当前知识关联到自己。",
      relation_duplicate: "这条关系已经存在。",
      source_limit: "每条知识最多保留 50 条来源，请先合并或移除部分来源。",
      source_web_url_required: "请填写完整的 http:// 或 https:// 网址。",
      source_web_url_invalid: "网址只接受 http:// 或 https:// 开头的完整地址。",
      source_sensitive_url: "网址包含账号、密码、令牌或签名参数，已阻止保存。请先移除敏感信息。",
      source_personal_title_required: "请为个人经验写一个简短名称，方便以后辨认。",
      source_duplicate_url: "这条网页来源已经添加过。",
      source_kind_invalid: "来源类型无法识别，请重新选择。",
      source_invalid: "这条来源的数据不完整，请检查后重试。",
    }
    return messages[code] ?? "整理信息无法验证，请检查后重试。"
  }

  const dispatchOrganizationInput = () => form?.dispatchEvent(new Event("input", { bubbles: true }))

  const renderTagSelections = (tags: WorkspaceTag[], commit = false) => {
    selectedTags = [...tags]
    if (tagValues) tagValues.value = serializeWorkspaceTags(selectedTags)
    tagList?.replaceChildren()
    selectedTags.forEach((tag) => {
      const chip = globalThis.document.createElement("span")
      chip.className = "organization-chip"
      chip.setAttribute("role", "listitem")
      const label = globalThis.document.createElement("span")
      label.textContent = tag.name
      const remove = globalThis.document.createElement("button")
      remove.type = "button"
      remove.textContent = "×"
      remove.setAttribute("aria-label", `移除标签“${tag.name}”`)
      remove.addEventListener("click", () => {
        renderTagSelections(
          selectedTags.filter((selected) => selected.normalizedKey !== tag.normalizedKey),
          true,
        )
        if (tagStatus) tagStatus.textContent = `已从当前草稿移除标签“${tag.name}”。`
        tagInput?.focus()
      })
      chip.append(label, remove)
      tagList?.appendChild(chip)
    })
    if (commit) dispatchOrganizationInput()
  }

  const syncTagEditorFromField = () => {
    const parsed = parseWorkspaceTags(tagValues?.value ?? "")
    if (!parsed.ok) {
      if (tagStatus) tagStatus.textContent = organizationIssueMessage(parsed.issues[0]?.code)
      return false
    }
    renderTagSelections(parsed.value)
    if (tagStatus) tagStatus.textContent = ""
    return true
  }

  const relationTypeForEditor = (editor: HTMLElement) =>
    editor.dataset.relationEditor === "prerequisite" ? "prerequisite" : "related"

  const relationEditorFor = (relationType: "prerequisite" | "related") =>
    relationEditors.find((editor) => relationTypeForEditor(editor) === relationType)

  const relationDocumentsForParsing = (
    relationType: "prerequisite" | "related",
    documentId = currentEditorScopeId(),
  ) => [
    ...relationDocumentOptions,
    ...selectedRelations[relationType]
      .filter(
        (selection) =>
          retainedUnavailableRelationDocumentId === documentId &&
          retainedUnavailableRelationTargetIds[relationType].has(selection.documentId),
      )
      .map((selection) => ({ id: selection.documentId, title: selection.title })),
  ]

  const renderRelationOptions = (editor: HTMLElement) => {
    const search = editor.querySelector<HTMLInputElement>("[data-relation-search]")
    const select = editor.querySelector<HTMLSelectElement>("[data-relation-select]")
    if (!select) return
    const query = (search?.value ?? "").normalize("NFKC").trim().toLocaleLowerCase()
    const matches = relationDocumentOptions.filter((document) =>
      `${document.title} ${document.topic ?? ""}`
        .normalize("NFKC")
        .toLocaleLowerCase()
        .includes(query),
    )
    select.replaceChildren()
    const placeholder = globalThis.document.createElement("option")
    placeholder.value = ""
    placeholder.textContent = matches.length ? "请选择一条知识" : "没有找到可关联的知识"
    select.appendChild(placeholder)
    matches.forEach((document) => {
      const option = globalThis.document.createElement("option")
      option.value = document.id
      const context = [
        document.topic || "未归类",
        document.updatedAt
          ? `更新于 ${new Date(document.updatedAt).toLocaleDateString("zh-CN")}`
          : "",
      ]
        .filter(Boolean)
        .join(" · ")
      option.textContent = `${document.title || "未命名知识"} · ${context}`
      select.appendChild(option)
    })
  }

  const renderRelationSelections = (
    relationType: "prerequisite" | "related",
    selections: WorkspaceRelationSelection[],
    commit = false,
  ) => {
    selectedRelations[relationType] = [...selections]
    const editor = relationEditorFor(relationType)
    const hidden = editor?.querySelector<HTMLInputElement>("[data-relation-values]")
    const list = editor?.querySelector<HTMLElement>("[data-relation-list]")
    if (hidden) hidden.value = serializeWorkspaceRelations(selections)
    list?.replaceChildren()
    selections.forEach((selection) => {
      const chip = globalThis.document.createElement("span")
      chip.className = "organization-chip"
      chip.setAttribute("role", "listitem")
      const label = globalThis.document.createElement("span")
      label.textContent = selection.title || "未命名知识"
      const remove = globalThis.document.createElement("button")
      remove.type = "button"
      remove.textContent = "×"
      remove.setAttribute("aria-label", `移除关系“${selection.title || "未命名知识"}”`)
      remove.addEventListener("click", () => {
        renderRelationSelections(
          relationType,
          selectedRelations[relationType].filter(
            (selected) => selected.documentId !== selection.documentId,
          ),
          true,
        )
        const status = editor?.querySelector<HTMLElement>("[data-relation-status]")
        if (status) status.textContent = "关系已从当前草稿移除；保存后同步到云端。"
        editor?.querySelector<HTMLInputElement>("[data-relation-search]")?.focus()
      })
      chip.append(label, remove)
      list?.appendChild(chip)
    })
    if (commit) dispatchOrganizationInput()
  }

  const recoverRelationSelections = (rawValue: string): WorkspaceRelationSelection[] => {
    const raw = rawValue.trim()
    if (!raw) return []
    let values: string[]
    if (raw.startsWith("[")) {
      try {
        const parsed: unknown = JSON.parse(raw)
        if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === "string")) return []
        values = parsed
      } catch {
        return []
      }
    } else values = raw.split(/[，,\n]/u)

    return values
      .map((value) => value.normalize("NFKC").trim().replace(/\s+/gu, " "))
      .filter(Boolean)
      .map((value) => {
        const byId = relationDocumentOptions.find((document) => document.id === value)
        if (byId) return { documentId: byId.id, title: byId.title }
        const titleMatches = relationDocumentOptions.filter(
          (document) => document.title.normalize("NFKC").trim() === value,
        )
        if (titleMatches.length === 1)
          return { documentId: titleMatches[0]!.id, title: titleMatches[0]!.title }
        return { documentId: value, title: "原关联知识已删除或无法识别" }
      })
  }

  const syncRelationEditorFromField = (relationType: "prerequisite" | "related") => {
    const editor = relationEditorFor(relationType)
    const hidden = editor?.querySelector<HTMLInputElement>("[data-relation-values]")
    const status = editor?.querySelector<HTMLElement>("[data-relation-status]")
    if (!hidden) return false
    const parsed = parseWorkspaceRelations(hidden.value, {
      currentDocumentId: readForm().documentId,
      documents: relationDocumentsForParsing(relationType),
    })
    if (!parsed.ok) {
      const recoverable = recoverRelationSelections(hidden.value)
      if (recoverable.length) {
        renderRelationSelections(relationType, recoverable)
        if (status)
          status.textContent =
            "部分关联已被删除、改名或无法识别。原值仍保留；请移除带提示的项目后再保存。"
      } else if (status) status.textContent = organizationIssueMessage(parsed.issues[0]?.code)
      return false
    }
    renderRelationSelections(relationType, parsed.value)
    if (status) status.textContent = ""
    return true
  }

  const syncOrganizationEditorsFromFields = () => {
    syncTagEditorFromField()
    for (const relationType of ["prerequisite", "related"] as const) {
      const editor = relationEditorFor(relationType)
      const hidden = editor?.querySelector<HTMLInputElement>("[data-relation-values]")
      if (!hidden?.value.trim()) renderRelationSelections(relationType, [])
      else if (relationDocumentOptions.length) syncRelationEditorFromField(relationType)
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
    if (sourceList.childElementCount >= 50) {
      if (sourceStatus)
        sourceStatus.textContent = "每条知识最多保留 50 条来源，请先合并或移除部分来源。"
      sourceList.querySelector<HTMLButtonElement>("[data-source-remove]")?.focus()
      return
    }
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
      if (!isWeb) {
        url.value = ""
        url.removeAttribute("aria-invalid")
      }
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

  const validateSources = (sources: WorkspaceSource[] = collectSources()) => {
    const rows = [...(sourceList?.querySelectorAll<HTMLElement>("[data-source-row]") ?? [])]
    rows.forEach((row) =>
      row
        .querySelectorAll<
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        >("input,select,textarea")
        .forEach((field) => field.removeAttribute("aria-invalid")),
    )
    const parsed = parseWorkspaceSources(sources)
    if (!parsed.ok) {
      const issue = parsed.issues[0]
      if (sourceStatus) sourceStatus.textContent = organizationIssueMessage(issue?.code)
      const row = issue?.index === undefined ? undefined : rows[issue.index]
      const field =
        issue?.code === "source_personal_title_required"
          ? row?.querySelector<HTMLInputElement>("[data-source-title]")
          : row?.querySelector<HTMLInputElement>("[data-source-url]")
      field?.setAttribute("aria-invalid", "true")
      field?.focus()
      return null
    }
    parsed.value.forEach((source, index) => {
      if (source.kind === "web") {
        const input = rows[index]?.querySelector<HTMLInputElement>("[data-source-url]")
        if (input) input.value = source.url
      }
    })
    if (sourceStatus) sourceStatus.textContent = ""
    return parsed.value as WorkspaceSource[]
  }

  const loadDocumentSources = async (documentId: string, isCurrent = () => true) => {
    if (!client || !currentUser) return false
    const context = captureAuthContext()
    const result = await context.client
      .from("document_sources")
      .select("kind,url,title,author,note")
      .eq("document_id", documentId)
      .eq("owner_id", context.ownerId)
      .order("sort_order", { ascending: true })
    if (!authContextIsCurrent(context) || !isCurrent()) return false
    if (result.error) {
      return false
    }
    renderSources((result.data ?? []) as WorkspaceSource[])
    return true
  }

  const writeLocalBackup = () => {
    if (!form) return null
    const data = readForm()
    const documentId = data.documentId || currentEditorScopeId()
    if (!documentId) {
      if (state) state.textContent = "新草稿编号尚未准备好，本地备份与云端保存均已暂停"
      return null
    }
    // Once a conflict is visible, its local side is immutable until the user
    // explicitly chooses a recovery action. Form input may currently reflect
    // the cloud side, so rewriting this key would destroy the recoverable copy.
    if (editorConflict?.documentId === documentId) return null
    editorTabDrafts.markDirty(documentId, editorChangeGeneration)
    const backup = addEditorBackupMetadata(
      {
        ...Object.fromEntries(new FormData(form).entries()),
        __sources: redactWorkspaceSourcesForRecovery(collectSources()),
      },
      currentUser?.id ?? "anonymous",
      documentId,
      data.revision,
    )
    try {
      const raw = JSON.stringify(backup)
      localStorage.setItem(localDraftKey(currentUser?.id ?? "anonymous", documentId), raw)
      editorTabDrafts.rememberBackup(documentId, raw)
      return raw
    } catch {
      if (state)
        state.textContent = "文档较大，本地备份空间不足；内容仍在当前页面，请尽快保存到云端"
      return null
    }
  }

  const removeTabBackupIfUnchanged = (
    ownerId: string,
    documentId: string,
    expectedRaw = editorTabDrafts.backupToken(documentId),
  ) => {
    if (expectedRaw === null) return false
    try {
      return removeStorageItemIfUnchanged(
        localStorage,
        localDraftKey(ownerId, documentId),
        expectedRaw,
      )
    } catch {
      return false
    } finally {
      editorTabDrafts.forgetBackup(documentId, expectedRaw)
    }
  }

  const restoreDurableOutboxBackup = async (documentId: string, isCurrent = () => true) => {
    if (!editorOutbox || !currentUser || !form) return false
    const ownerId = String(currentUser.id)
    const existingRaw = localStorage.getItem(localDraftKey(ownerId, documentId))
    try {
      if (existingRaw) return true
      const records = await editorOutbox.listForOwner(ownerId)
      if (!isCurrent()) return false
      const record = records
        .filter((candidate) => candidate.documentScopeId === documentId)
        .sort(
          (left, right) =>
            Number(right.status === "queued") - Number(left.status === "queued") ||
            right.updatedAt - left.updatedAt ||
            right.createdAt - left.createdAt ||
            right.operationId.localeCompare(left.operationId),
        )[0]
      if (!record) return false
      const payload = materializeAtomicEditorSavePayload(record.payload, {
        documentId: record.documentId === "new" ? null : record.documentId,
      })
      const snapshot = payload.snapshot
      const payloadForm = {
        title: snapshot.title,
        body: snapshot.body,
        topic: snapshot.topic,
        maturity: snapshot.maturity,
        visibility: snapshot.visibility,
        tags: JSON.stringify(snapshot.tags),
        prerequisites: JSON.stringify(snapshot.prerequisites),
        related: JSON.stringify(snapshot.related),
        documentId: record.documentId === "new" ? "" : record.documentId,
        revision: record.baseRevision,
        status: "draft",
      }
      const backup = addEditorBackupMetadata(
        {
          ...payloadForm,
          __sources: redactWorkspaceSourcesForRecovery(snapshot.sources),
        },
        ownerId,
        documentId,
        record.baseRevision,
      )
      localStorage.setItem(localDraftKey(ownerId, documentId), JSON.stringify(backup))
      return true
    } catch {
      if (!isCurrent()) return false
      setStatus("持久恢复队列暂时不可用；当前页面与本地浏览器备份仍会继续保留。", "error")
      return false
    }
  }

  const setEditorConflictInteractivity = (active: boolean) => {
    if (!form) return
    if (!active) {
      for (const element of conflictInertedFormChildren) element.inert = false
      conflictInertedFormChildren.clear()
      return
    }
    form.inert = false
    for (const child of Array.from(form.children)) {
      if (!(child instanceof HTMLElement) || child === conflictSection || child.inert) continue
      child.inert = true
      conflictInertedFormChildren.add(child)
    }
  }

  const clearEditorConflict = () => {
    editorConflict = null
    setEditorConflictInteractivity(false)
    if (conflictSection) conflictSection.hidden = true
  }

  const materializeDurableConflictBackup = (
    conflict: NonNullable<typeof editorConflict>,
    durableRecord: EditorOutboxRecord,
  ) => {
    const payload = materializeAtomicEditorSavePayload(durableRecord.payload, {
      documentId: durableRecord.documentId === "new" ? null : durableRecord.documentId,
    })
    const snapshot = payload.snapshot
    return addEditorBackupMetadata(
      {
        title: snapshot.title,
        body: snapshot.body,
        topic: snapshot.topic,
        maturity: snapshot.maturity,
        visibility: snapshot.visibility,
        tags: JSON.stringify(snapshot.tags),
        prerequisites: JSON.stringify(snapshot.prerequisites),
        related: JSON.stringify(snapshot.related),
        documentId: durableRecord.documentId === "new" ? "" : durableRecord.documentId,
        revision: durableRecord.baseRevision,
        status: "draft",
        __sources: redactWorkspaceSourcesForRecovery(snapshot.sources),
      },
      conflict.ownerId,
      conflict.documentId,
      durableRecord.baseRevision,
      durableRecord.createdAt,
    )
  }

  const recoverableConflictBackup = (
    conflict: NonNullable<typeof editorConflict>,
    durableRecord?: EditorOutboxRecord | null,
  ) => {
    const candidates: Array<{ backup: EditorBackup; priority: number }> = [
      { backup: conflict.backup, priority: 0 },
    ]
    let raw: string | null = null
    try {
      raw = localStorage.getItem(localDraftKey(conflict.ownerId, conflict.documentId))
    } catch {
      // The durable record and in-memory conflict remain usable when storage access is blocked.
    }
    if (raw) {
      const inspection = inspectEditorBackup(raw, conflict.ownerId, conflict.documentId)
      if (inspection.state !== "invalid")
        candidates.push({ backup: inspection.backup, priority: 1 })
    }
    if (durableRecord) {
      try {
        candidates.push({
          backup: materializeDurableConflictBackup(conflict, durableRecord),
          priority: 2,
        })
      } catch {
        // The in-memory/localStorage candidates remain available; malformed
        // durable data stays frozen and is never silently rewritten.
      }
    }
    return selectRecoverableEditorBackup(candidates) ?? conflict.backup
  }

  const redactEditorBackupSources = (backup: EditorBackup): EditorBackup => ({
    ...backup,
    __sources: Array.isArray(backup.__sources)
      ? redactWorkspaceSourcesForRecovery(backup.__sources as WorkspaceSource[])
      : [],
  })

  const archiveEditorConflict = (
    conflict: NonNullable<typeof editorConflict>,
    backup = recoverableConflictBackup(conflict),
  ) => {
    if (!currentUser || currentUser.id !== conflict.ownerId) return false
    try {
      const archiveKey = `wouldkeep:editor-conflict-archive:${conflict.ownerId}:${conflict.documentId}:${Date.now()}`
      localStorage.setItem(archiveKey, JSON.stringify(redactEditorBackupSources(backup)))
      return true
    } catch {
      setStatus(
        "浏览器空间不足，暂时无法创建恢复副本；本地稿仍保持冻结，请先导出或清理空间。",
        "error",
      )
      return false
    }
  }

  const editorConflictActionIsCurrent = (
    conflict: NonNullable<typeof editorConflict>,
    context: ReturnType<typeof captureAuthContext>,
  ) =>
    editorConflict === conflict &&
    conflict.ownerId === context.ownerId &&
    authContextIsCurrent(context)

  const prepareEditorConflictArchive = async (
    conflict: NonNullable<typeof editorConflict>,
    context = captureAuthContext(),
  ): Promise<
    | {
        ok: true
        backup: EditorBackup
        durableToken: EditorOutboxConflictResolutionToken | null
      }
    | { ok: false }
  > => {
    if (!editorConflictActionIsCurrent(conflict, context)) {
      return { ok: false }
    }
    let durableRecord: EditorOutboxRecord | null = null
    if (editorOutbox) {
      try {
        const records = await editorOutbox.listForOwner(conflict.ownerId)
        if (!editorConflictActionIsCurrent(conflict, context)) {
          return { ok: false }
        }
        durableRecord =
          records
            .filter(
              (record) =>
                record.ownerId === conflict.ownerId &&
                record.documentScopeId === conflict.documentId &&
                (record.status === "queued" || record.status === "conflict"),
            )
            .sort(
              (left, right) =>
                Number(right.status === "queued") - Number(left.status === "queued") ||
                right.updatedAt - left.updatedAt ||
                right.createdAt - left.createdAt ||
                right.operationId.localeCompare(left.operationId),
            )[0] ?? null
        if (durableRecord) materializeDurableConflictBackup(conflict, durableRecord)
      } catch {
        setStatus("无法安全核对持久冲突稿；没有归档或删除任何恢复记录，请稍后重试。", "error")
        return { ok: false }
      }
    }
    if (!editorConflictActionIsCurrent(conflict, context)) return { ok: false }
    const backup = recoverableConflictBackup(conflict, durableRecord)
    if (!archiveEditorConflict(conflict, backup)) return { ok: false }
    return {
      ok: true,
      backup,
      durableToken: durableRecord
        ? { operationId: durableRecord.operationId, updatedAt: durableRecord.updatedAt }
        : null,
    }
  }

  const conflictListCount = (value: unknown) => {
    if (Array.isArray(value)) return value.filter((item) => typeof item === "string").length
    const raw = String(value ?? "").trim()
    if (!raw) return 0
    if (raw.startsWith("[")) {
      try {
        const parsed: unknown = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string").length : 0
      } catch {
        return 0
      }
    }
    return raw.split(/[，,\n]/u).filter((item) => item.trim()).length
  }

  const conflictOrganizationSummary = (
    snapshot: Record<string, unknown>,
    organizationLoaded = true,
  ) => {
    if (!organizationLoaded) return "整理信息暂时无法读取；选择云端前不会把本地值冒充为云端值。"
    const sourceCount = Array.isArray(snapshot.__sources) ? snapshot.__sources.length : 0
    return `标签 ${conflictListCount(snapshot.tags)} 个 · 前置 ${conflictListCount(snapshot.prerequisites)} 条 · 相关 ${conflictListCount(snapshot.related)} 条 · 来源 ${sourceCount} 条`
  }

  const applyEditorConflictActionAvailability = () => {
    const conflict = editorConflict
    if (!conflict) return
    const cloudAvailable = conflict.cloud.cloudAvailable !== false
    const localRecoveryAllowed = conflict.reason !== "not-found"
    if (conflictUseLocal) conflictUseLocal.disabled = !localRecoveryAllowed
    if (conflictUseCloud) conflictUseCloud.disabled = !cloudAvailable
    if (conflictSaveCopy) conflictSaveCopy.disabled = false
    if (conflictExportLocal) conflictExportLocal.disabled = false
  }

  const freezeEditorConflict = (
    documentId: string,
    backup: EditorBackup,
    reason: "unknown-base" | "stale-base" | "remote-write" | "not-found" | "request-rejected",
    cloud: WorkspaceConflictSnapshot,
  ) => {
    if (!currentUser) return
    const ownerId = String(currentUser.id)
    const liveForm = form ? readForm() : null
    const frozenBackup =
      reason === "remote-write" && liveForm && currentEditorScopeId() === documentId
        ? addEditorBackupMetadata(
            {
              ...liveForm,
              __sources: redactWorkspaceSourcesForRecovery(collectSources()),
            },
            ownerId,
            documentId,
            Number(backup.__editorRecovery?.baseRevision ?? liveForm.revision),
          )
        : backup
    const cloudSnapshot: WorkspaceConflictSnapshot = {
      ...cloud,
      __sources: Array.isArray(cloud.__sources)
        ? redactWorkspaceSourcesForRecovery(cloud.__sources)
        : redactWorkspaceSourcesForRecovery(collectSources()),
      organizationLoaded: cloud.organizationLoaded !== false,
    }
    editorConflict = { ownerId, documentId, backup: frozenBackup, reason, cloud: cloudSnapshot }
    invalidateEditorSaves()
    if (autosaveTimer) window.clearTimeout(autosaveTimer)
    // The recovery controls live inside the editor form. A document-open request may have
    // made that form inert while loading, so explicitly restore interactivity before asking
    // the user to resolve the conflict. Save requests remain blocked by editorConflict.
    if (form) {
      form.inert = false
      form.setAttribute("aria-busy", "false")
    }
    setEditorConflictInteractivity(true)
    if (state) state.textContent = "本地稿与云端版本冲突，自动同步已暂停"
    if (conflictLocalTitle)
      conflictLocalTitle.textContent = String(frozenBackup.title ?? "未命名知识")
    if (conflictLocalBody) conflictLocalBody.textContent = String(frozenBackup.body ?? "")
    if (conflictCloudTitle) conflictCloudTitle.textContent = cloudSnapshot.title || "未命名知识"
    if (conflictCloudBody) conflictCloudBody.textContent = cloudSnapshot.body
    if (conflictLocalOrganization)
      conflictLocalOrganization.textContent = conflictOrganizationSummary(
        frozenBackup as Record<string, unknown>,
      )
    if (conflictCloudOrganization)
      conflictCloudOrganization.textContent = conflictOrganizationSummary(
        cloudSnapshot as unknown as Record<string, unknown>,
        cloudSnapshot.organizationLoaded,
      )
    const cloudAvailable = cloudSnapshot.cloudAvailable !== false
    applyEditorConflictActionAvailability()
    if (conflictMeta)
      conflictMeta.textContent = `本地基于第 ${Number(frozenBackup.revision ?? 0)} 版 · 云端第 ${cloudSnapshot.revision} 版`
    if (conflictSection) conflictSection.hidden = false
    setStatus(
      cloudAvailable
        ? "检测到保存冲突。本地稿已冻结保留；选择处理方式前不会覆盖任何一方。"
        : "云端版本不可采用；本地稿已冻结，可先导出或另存为私密副本。",
      "error",
    )
  }

  const restoreLocalBackup = (
    documentId: string,
    cloudRevision?: number,
    options: { deferConflict?: boolean } = {},
  ) => {
    if (!form || !currentUser) return false
    let raw: string | null = null
    try {
      raw = localStorage.getItem(localDraftKey(currentUser.id, documentId))
    } catch {
      setStatus(
        "浏览器无法读取常规恢复副本；如果这是自由工作台，将继续尝试当前标签页的备用副本。",
        "error",
      )
      return false
    }
    if (!raw) return false
    const inspection = inspectEditorBackup(raw, currentUser.id, documentId, cloudRevision)
    if (inspection.state === "invalid") {
      try {
        localStorage.setItem(
          `wouldkeep:editor-recovery-quarantine:${currentUser.id}:${documentId}:${Date.now()}`,
          raw,
        )
        removeStorageItemIfUnchanged(localStorage, localDraftKey(currentUser.id, documentId), raw)
        setStatus("发现一份无法自动读取的旧备份，已隔离保留；当前文档不会用它覆盖。", "error")
      } catch {
        setStatus("发现一份无法自动读取的本地备份；浏览器空间不足，备份未被删除。", "error")
      }
      return false
    }
    if (inspection.state === "conflict") {
      if (options.deferConflict) return false
      editorTabDrafts.markDirty(documentId, editorChangeGeneration)
      editorTabDrafts.rememberBackup(documentId, raw)
      freezeEditorConflict(documentId, inspection.backup, inspection.reason, readForm())
      return false
    }
    const backup = inspection.backup as Record<string, unknown> & {
      __sources?: WorkspaceSource[]
    }
    fillForm(backup)
    renderSources(Array.isArray(backup.__sources) ? backup.__sources : [])
    clearEditorConflict()
    editorChangeGeneration += 1
    editorTabDrafts.markDirty(documentId, editorChangeGeneration)
    editorTabDrafts.rememberBackup(documentId, raw)
    if (state) state.textContent = "已恢复本地备份，保存后会同步到云端"
    return true
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

  const currentEditorScopeId = () => {
    const documentId = readForm().documentId
    if (documentId) return documentId
    return currentDraftId ? editorDraftScope(currentDraftId) : ""
  }

  const bindFreshEditorDraftScope = (
    preferredDraftId?: string,
    historyMode: "replace" | "push" = "replace",
    routeMode?: EditorDraftMode,
  ) => {
    const draftId = parseEditorDraftId(preferredDraftId) ?? createEditorDraftId()
    currentDraftId = draftId
    window.history[historyMode === "push" ? "pushState" : "replaceState"](
      window.history.state,
      "",
      bindNewEditorDraftRoute(window.location.href, draftId, routeMode),
    )
    return editorDraftScope(draftId)
  }

  const editorBodyField = () =>
    form?.elements.namedItem("body") instanceof HTMLTextAreaElement
      ? (form.elements.namedItem("body") as HTMLTextAreaElement)
      : null

  const setAiSuggestionStatus = (message: string, type: "" | "error" | "success" = "") => {
    if (!aiSuggestionStatus) return
    aiSuggestionStatus.textContent = message
    aiSuggestionStatus.dataset.state = type
    aiSuggestionStatus.setAttribute("role", type === "error" ? "alert" : "status")
    aiSuggestionStatus.setAttribute("aria-live", type === "error" ? "assertive" : "polite")
  }

  const updateAiSuggestionAvailability = () => {
    if (!aiSuggestionAvailability) return
    const data = readForm()
    let label = "正在检查使用边界"
    let stateName = ""
    if (!currentUser) label = "登录后可用"
    else if (!aiSuggestionPreferences) {
      label = "设置暂不可用"
      stateName = "error"
    } else if (!aiSuggestionPreferences.enabled) {
      label = "AI 已关闭"
      stateName = "off"
    } else if (aiSuggestionPreferences.monthlyBudgetCents <= 0) {
      label = "预算为 0"
      stateName = "off"
    } else if (data.visibility !== "public" && !aiSuggestionPreferences.allowPrivateContent) {
      label = "私密内容未授权"
      stateName = "off"
    } else {
      label = "已开启 · 安全预览"
      stateName = "ready"
    }
    aiSuggestionAvailability.textContent = label
    aiSuggestionAvailability.dataset.state = stateName
  }

  const aiSuggestionGate = (data = readForm()) => {
    if (!currentUser || !client) return "请先登录，再使用 AI 建议。"
    if (!aiSuggestionPreferences) return "AI 设置暂时无法读取，请检查网络后重试。"
    if (!aiSuggestionPreferences.enabled) return "AI 助手当前关闭；请先在 AI 设置中明确开启。"
    if (aiSuggestionPreferences.monthlyBudgetCents <= 0)
      return "当前月预算为 0；保持关闭，不会发起模型请求。"
    if (data.visibility !== "public" && !aiSuggestionPreferences.allowPrivateContent)
      return "这条知识不是公开内容，且你没有允许 AI 处理私密内容。"
    return ""
  }

  const activeAiSelectionIsCurrent = () => {
    if (!activeAiSelection) return false
    const data = readForm()
    return aiSelectionSnapshotIsCurrent(activeAiSelection, {
      documentId: data.documentId,
      baseVersion: data.revision,
      body: data.body,
    })
  }

  const setAiSuggestionActionability = (actionable: boolean) => {
    if (aiSuggestionReplace) aiSuggestionReplace.disabled = !actionable
    if (aiSuggestionInsert) aiSuggestionInsert.disabled = !actionable
  }

  const discardAiSuggestion = (
    message = "已放弃建议；正文没有改变。",
    options: { invalidateRequest?: boolean } = {},
  ) => {
    if (options.invalidateRequest !== false) aiSuggestionRequestEpoch += 1
    activeAiSelection = null
    activeAiSuggestion = null
    aiSuggestionAssist?.removeAttribute("aria-busy")
    if (aiSuggestionRegenerate) aiSuggestionRegenerate.disabled = false
    if (aiSuggestionPreview) aiSuggestionPreview.hidden = true
    if (aiSuggestionOriginal) aiSuggestionOriginal.textContent = ""
    if (aiSuggestionOutput) aiSuggestionOutput.textContent = ""
    setAiSuggestionActionability(false)
    setAiSuggestionStatus(message)
  }

  const markAiSuggestionStale = () => {
    if (!activeAiSelection || activeAiSelectionIsCurrent()) return false
    aiSuggestionRequestEpoch += 1
    activeAiSelection = null
    activeAiSuggestion = null
    aiSuggestionAssist?.removeAttribute("aria-busy")
    if (aiSuggestionRegenerate) aiSuggestionRegenerate.disabled = false
    setAiSuggestionActionability(false)
    if (aiSuggestionMode) aiSuggestionMode.textContent = "正文或版本已变化"
    setAiSuggestionStatus("这条建议已过期，没有写回正文；请重新选择文字并生成。", "error")
    return true
  }

  const refreshAiSelectionStatus = (preserveMessage = false) => {
    updateAiSuggestionAvailability()
    if (markAiSuggestionStale()) return
    const body = editorBodyField()
    const data = readForm()
    const gate = aiSuggestionGate(data)
    const action = (aiSuggestionAction?.value || "rewrite") as AiSuggestionAction
    const capture = body
      ? captureAiSelection({
          action,
          baseVersion: data.revision,
          body: body.value,
          documentId: data.documentId,
          start: body.selectionStart ?? 0,
          end: body.selectionEnd ?? 0,
        })
      : { ok: false as const, code: "invalid_range" as const }
    if (aiSuggestionGenerate)
      aiSuggestionGenerate.disabled = aiSuggestionGenerationInFlight || Boolean(gate) || !capture.ok
    if (preserveMessage) return
    if (gate) {
      setAiSuggestionStatus(gate, currentUser && !aiSuggestionPreferences ? "error" : "")
      return
    }
    if (!capture.ok) {
      setAiSuggestionStatus(
        capture.code === "selection_too_large"
          ? "选区超过 12,000 个字符，请缩小范围。"
          : "先在正文中选择 1–12,000 个字符。",
        capture.code === "selection_too_large" ? "error" : "",
      )
      return
    }
    setAiSuggestionStatus(
      `已选择 ${capture.snapshot.selection.length} 个字符；生成前正文不会改变。`,
    )
  }

  const loadAiSuggestionPreferences = async (isCurrent = () => true) => {
    if (!client || !currentUser || !aiSuggestionAssist) return false
    const context = captureAuthContext()
    const result = await context.client
      .from("ai_preferences")
      .select("enabled,allow_private_content,monthly_budget_cents")
      .eq("owner_id", context.ownerId)
      .maybeSingle()
    if (!authContextIsCurrent(context) || !isCurrent()) return false
    if (result.error) {
      aiSuggestionPreferences = null
      updateAiSuggestionAvailability()
      refreshAiSelectionStatus()
      return false
    }
    aiSuggestionPreferences = {
      enabled: Boolean(result.data?.enabled),
      allowPrivateContent: Boolean(result.data?.allow_private_content),
      monthlyBudgetCents: Number(result.data?.monthly_budget_cents ?? 0),
    }
    updateAiSuggestionAvailability()
    refreshAiSelectionStatus()
    return true
  }

  const showAiSuggestionPreview = (options: {
    actionable: boolean
    mode: string
    output: string
    selection: AiSelectionSnapshot
  }) => {
    activeAiSelection = options.selection
    if (aiSuggestionOriginal) aiSuggestionOriginal.textContent = options.selection.selection
    if (aiSuggestionOutput) aiSuggestionOutput.textContent = options.output
    if (aiSuggestionMode) aiSuggestionMode.textContent = options.mode
    if (aiSuggestionPreview) aiSuggestionPreview.hidden = false
    setAiSuggestionActionability(options.actionable)
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
    aiSuggestionPreview?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "nearest",
    })
  }

  const generateAiSuggestion = async (selectionToReuse?: AiSelectionSnapshot) => {
    if (aiSuggestionGenerationInFlight) return
    const body = editorBodyField()
    if (!body || !form || !currentUser || !client) {
      setAiSuggestionStatus("请先登录并打开一条知识。", "error")
      return
    }
    aiSuggestionGenerationInFlight = true
    if (aiSuggestionGenerate) aiSuggestionGenerate.disabled = true
    if (aiSuggestionRegenerate) aiSuggestionRegenerate.disabled = true
    aiSuggestionAssist?.setAttribute("aria-busy", "true")
    try {
      const preferencesLoaded = await loadAiSuggestionPreferences()
      if (!preferencesLoaded) {
        setAiSuggestionStatus("AI 设置暂时无法读取；没有发送任何正文。", "error")
        return
      }
      const data = readForm()
      const gate = aiSuggestionGate(data)
      if (gate) {
        setAiSuggestionStatus(gate, "error")
        return
      }
      const action = (aiSuggestionAction?.value || "rewrite") as AiSuggestionAction
      const capture = selectionToReuse
        ? aiSelectionSnapshotIsCurrent(selectionToReuse, {
            documentId: data.documentId,
            baseVersion: data.revision,
            body: data.body,
          })
          ? { ok: true as const, snapshot: { ...selectionToReuse, action } }
          : { ok: false as const, code: "invalid_range" as const }
        : captureAiSelection({
            action,
            baseVersion: data.revision,
            body: body.value,
            documentId: data.documentId,
            start: body.selectionStart ?? 0,
            end: body.selectionEnd ?? 0,
          })
      if (!capture.ok) {
        setAiSuggestionStatus("选区或正文已经变化，请重新选择后再生成。", "error")
        return
      }
      const snapshot = capture.snapshot
      const requestEpoch = ++aiSuggestionRequestEpoch
      activeAiSelection = snapshot
      activeAiSuggestion = null
      setAiSuggestionActionability(false)
      setAiSuggestionStatus("正在验证使用边界并请求可审阅预览…")
      try {
        const result = await client.functions.invoke("ai-write", {
          body: {
            action: snapshot.action,
            selection: snapshot.selection,
            context: "",
            // Deliberately omit the document authority until a separately approved
            // selection-scoped live contract exists. This prevents a paid whole-document call.
            document_id: null,
            base_version: snapshot.baseVersion,
          },
        })
        if (requestEpoch !== aiSuggestionRequestEpoch || disposed) return
        if (result.error) {
          discardAiSuggestion("", { invalidateRequest: false })
          setAiSuggestionStatus(
            "当前没有获准的选区模型；没有把结果写入正文，也没有产生本次模型费用。",
            "error",
          )
          return
        }
        if (
          !aiSelectionSnapshotIsCurrent(snapshot, {
            documentId: readForm().documentId,
            baseVersion: readForm().revision,
            body: readForm().body,
          })
        ) {
          discardAiSuggestion("", { invalidateRequest: false })
          setAiSuggestionStatus(
            "生成期间正文或版本发生了变化；响应已丢弃，请重新选择文字。",
            "error",
          )
          return
        }
        const parsed = parseAiSuggestionGatewayResponse(result.data, snapshot)
        if (!parsed.ok) {
          discardAiSuggestion("", { invalidateRequest: false })
          setAiSuggestionStatus(
            parsed.code === "unsafe_scope"
              ? "服务器返回的不是选区建议，已安全拒绝，正文没有改变。"
              : "网关响应与当前选区或版本不一致，已安全拒绝。",
            "error",
          )
          return
        }
        if (parsed.kind === "gateway_check") {
          activeAiSuggestion = null
          showAiSuggestionPreview({
            actionable: false,
            mode: "安全网关检查 · 未调用模型",
            output: parsed.preview,
            selection: snapshot,
          })
          setAiSuggestionStatus(
            "安全网关已验证；这是原文回显，不是 AI 改写，不能写回正文。",
            "success",
          )
          return
        }
        activeAiSuggestion = parsed.preview
        showAiSuggestionPreview({
          actionable: true,
          mode: "选区建议 · 等待你的决定",
          output: parsed.preview.suggestion,
          selection: snapshot,
        })
        setAiSuggestionStatus("建议已生成；接受前仍会再次核对正文和云端基础版本。", "success")
      } catch {
        if (requestEpoch !== aiSuggestionRequestEpoch || disposed) return
        discardAiSuggestion("", { invalidateRequest: false })
        setAiSuggestionStatus("网络中断；没有修改正文，请稍后重试。", "error")
      }
    } finally {
      aiSuggestionGenerationInFlight = false
      if (!disposed) {
        aiSuggestionAssist?.removeAttribute("aria-busy")
        if (aiSuggestionRegenerate) aiSuggestionRegenerate.disabled = false
        refreshAiSelectionStatus(true)
      }
    }
  }

  const applyActiveAiSuggestion = async (mode: AiSuggestionApplyMode) => {
    if (!activeAiSelection || !activeAiSuggestion || !form) return
    if (!activeAiSelectionIsCurrent()) {
      markAiSuggestionStale()
      return
    }
    const body = editorBodyField()
    if (!body) return
    const applied = applyAiSuggestion(activeAiSelection, activeAiSuggestion.suggestion, mode)
    activeAiSelection = null
    activeAiSuggestion = null
    if (aiSuggestionPreview) aiSuggestionPreview.hidden = true
    setAiSuggestionActionability(false)
    body.value = applied.body
    body.focus()
    body.setSelectionRange(applied.selectionStart, applied.selectionEnd)
    body.dispatchEvent(new Event("input", { bubbles: true }))
    if (autosaveTimer) window.clearTimeout(autosaveTimer)
    writeLocalBackup()
    if (!currentUser || !client) {
      setAiSuggestionStatus("建议已放入本地草稿；登录恢复后再保存到云端。", "success")
      return
    }
    if (state) state.textContent = "正在保存 AI 修改的新版本…"
    const saved = await requestDocumentSave()
    setAiSuggestionStatus(
      saved
        ? "修改已接受并保存为新的文档版本，可在版本历史中回退。"
        : "修改保留在本地，但云端保存尚未完成；请按页面提示处理。",
      saved ? "success" : "error",
    )
  }

  const loadLinkOptions = async (
    currentDocumentId: string,
    knowledgeBaseId: string,
    isCurrent = () => true,
  ) => {
    if (!client || !currentUser || !knowledgeBaseId) return false
    const context = captureAuthContext()
    const result = await context.client
      .from("documents")
      .select("id,title,topic,visibility,updated_at")
      .eq("owner_id", context.ownerId)
      .eq("knowledge_base_id", knowledgeBaseId)
      .neq("id", currentDocumentId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
    if (!authContextIsCurrent(context) || !isCurrent()) return false
    if (result.error) return false
    relationDocumentOptions = (result.data ?? []).map(
      (item: {
        id: string
        title: string
        topic?: string
        visibility?: string
        updated_at?: string
      }) => ({
        id: String(item.id),
        title: item.title || "未命名知识",
        topic: item.topic,
        visibility: item.visibility,
        updatedAt: item.updated_at,
      }),
    )
    relationEditors.forEach(renderRelationOptions)
    for (const relationType of ["prerequisite", "related"] as const)
      syncRelationEditorFromField(relationType)
    return true
  }

  const clearRelationDocumentOptions = () => {
    relationDocumentOptions = []
    relationEditors.forEach(renderRelationOptions)
  }

  const prepareNewDocumentRelationOptions = async () => {
    if (!client || !currentUser) return false
    const ownerId = String(currentUser.id)
    const contextClient = client
    const contextEpoch = authEpoch
    const documentScopeId = currentEditorScopeId()
    if (!documentScopeId.startsWith("draft:")) return false
    const isCurrentNewDocument = () =>
      !disposed &&
      authEpoch === contextEpoch &&
      currentUser?.id === ownerId &&
      client === contextClient &&
      currentEditorScopeId() === documentScopeId &&
      editorKnowledgeBaseBinding === null
    const knowledgeBaseId = await ensureKnowledgeBase(isCurrentNewDocument)
    if (!knowledgeBaseId || !isCurrentNewDocument()) return false
    return loadLinkOptions("", knowledgeBaseId, isCurrentNewDocument)
  }

  const loadTagOptions = async (isCurrent = () => true) => {
    const datalist = root.querySelector<HTMLElement>("[data-tag-options]")
    if (!client || !currentUser || !datalist) return false
    const context = captureAuthContext()
    const result = await context.client
      .from("tags")
      .select("name")
      .eq("owner_id", context.ownerId)
      .order("name", { ascending: true })
      .limit(100)
    if (!authContextIsCurrent(context) || !isCurrent()) return false
    if (result.error) return false
    datalist.replaceChildren()
    ;(result.data ?? []).forEach((item: { name: string }) => {
      const option = globalThis.document.createElement("option")
      option.value = item.name
      datalist.appendChild(option)
    })
    return true
  }

  const loadDocumentTags = async (documentId: string, isCurrent = () => true) => {
    if (!client || !currentUser || !form) return false
    const context = captureAuthContext()
    const result = await context.client
      .from("document_tags")
      .select("tags(name)")
      .eq("document_id", documentId)
      .eq("owner_id", context.ownerId)
    if (!authContextIsCurrent(context) || !isCurrent()) return false
    if (result.error) return false
    const names = (result.data ?? [])
      .map((item: { tags?: { name?: string } | null }) => item.tags?.name)
      .filter(Boolean)
    const parsed = parseWorkspaceTags(names as string[])
    if (!parsed.ok) return false
    if (tagValues) tagValues.value = serializeWorkspaceTags(parsed.value)
    renderTagSelections(parsed.value)
    return true
  }

  const loadDocumentLinks = async (documentId: string, isCurrent = () => true) => {
    if (!client || !currentUser || !form) return false
    const context = captureAuthContext()
    const result = await context.client
      .from("document_links")
      .select(
        "relation_type,to_document_id,documents!document_links_to_document_id_fkey(title,deleted_at)",
      )
      .eq("from_document_id", documentId)
      .eq("owner_id", context.ownerId)
      .in("relation_type", ["prerequisite", "related"])
    if (!authContextIsCurrent(context) || !isCurrent()) return false
    if (result.error) return false
    const groups: Record<"prerequisite" | "related", WorkspaceRelationSelection[]> = {
      prerequisite: [],
      related: [],
    }
    const unavailableCounts: Record<"prerequisite" | "related", number> = {
      prerequisite: 0,
      related: 0,
    }
    clearRetainedUnavailableRelationTargets()
    retainedUnavailableRelationDocumentId = documentId
    ;(result.data ?? []).forEach(
      (item: {
        relation_type: string
        to_document_id?: string
        documents?: { title?: string; deleted_at?: string | null } | null
      }) => {
        const relationType =
          item.relation_type === "prerequisite"
            ? "prerequisite"
            : item.relation_type === "related"
              ? "related"
              : null
        if (item.to_document_id && relationType) {
          const title = workspaceRelationDisplayTitle(
            item.documents?.title,
            item.documents?.deleted_at,
          )
          if (title === WORKSPACE_MISSING_RELATION_TITLE) {
            unavailableCounts[relationType] += 1
            retainedUnavailableRelationTargetIds[relationType].add(String(item.to_document_id))
          }
          groups[relationType].push({ documentId: String(item.to_document_id), title })
        }
      },
    )
    for (const relationType of ["prerequisite", "related"] as const) {
      const editor = relationEditorFor(relationType)
      const hidden = editor?.querySelector<HTMLInputElement>("[data-relation-values]")
      if (hidden) hidden.value = serializeWorkspaceRelations(groups[relationType])
      renderRelationSelections(relationType, groups[relationType])
      if (unavailableCounts[relationType] > 0) {
        const status = editor?.querySelector<HTMLElement>("[data-relation-status]")
        if (status)
          status.textContent = `有 ${unavailableCounts[relationType]} 条关系指向已删除或无法访问的知识；请移除后保存草稿。`
      }
    }
    return true
  }

  const loadCloudOrganizationSnapshot = async (
    saveClient: any,
    documentId: string,
    ownerId: string,
  ) => {
    const [tagResult, linkResult, sourceResult] = await Promise.all([
      saveClient
        .from("document_tags")
        .select("tags(name)")
        .eq("document_id", documentId)
        .eq("owner_id", ownerId),
      saveClient
        .from("document_links")
        .select("relation_type,to_document_id")
        .eq("from_document_id", documentId)
        .eq("owner_id", ownerId),
      saveClient
        .from("document_sources")
        .select("kind,url,title,author,note")
        .eq("document_id", documentId)
        .eq("owner_id", ownerId)
        .order("sort_order", { ascending: true }),
    ])
    if (tagResult.error || linkResult.error || sourceResult.error)
      throw new Error("cloud organization snapshot unavailable")
    const tags = (tagResult.data ?? [])
      .map((item: { tags?: { name?: string } | null }) => item.tags?.name)
      .filter((name: string | undefined): name is string => typeof name === "string")
    const prerequisites: string[] = []
    const related: string[] = []
    ;(linkResult.data ?? []).forEach(
      (item: { relation_type?: string; to_document_id?: string }) => {
        if (!item.to_document_id) return
        if (item.relation_type === "prerequisite") prerequisites.push(String(item.to_document_id))
        if (item.relation_type === "related") related.push(String(item.to_document_id))
      },
    )
    return {
      tags: JSON.stringify(tags),
      prerequisites: JSON.stringify(prerequisites),
      related: JSON.stringify(related),
      __sources: (sourceResult.data ?? []) as WorkspaceSource[],
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
    const privateDraftWarning =
      readForm().visibility === "private"
        ? "；当前草稿已改为仅自己可见，但此前发布版本仍在线，需点击“撤回发布”才能下线。"
        : ""
    if (publicationStatus)
      publicationStatus.textContent = `${
        pending
          ? `${audience}；公开页仍是第 ${publication.source_revision} 版，当前修改尚未更新。`
          : `${audience}；读者看到的是第 ${publication.source_revision} 版。`
      }${privateDraftWarning}`
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

  const loadPublication = async (documentId: string, revision: number, isCurrent = () => true) => {
    if (!client || !currentUser) return false
    const context = captureAuthContext()
    const result = await context.client
      .from("document_publications")
      .select("document_id,audience,share_token,source_revision,published_at")
      .eq("document_id", documentId)
      .eq("owner_id", context.ownerId)
      .maybeSingle()
    if (!authContextIsCurrent(context) || !isCurrent()) return false
    if (result.error) {
      currentPublication = null
      if (publicationStatus)
        publicationStatus.textContent =
          "正式发布功能暂不可用；私人草稿不受影响，请稍后重试或联系站点管理员。"
      return false
    }
    updatePublicationUI(result.data as PublicationState | null, revision)
    return true
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
      if (!(await requestDocumentSave())) return
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
            ? "正式发布功能暂不可用；私人草稿已安全保存，请稍后重试或联系站点管理员。"
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

  const materializeCurrentAtomicSave = async (
    data: WorkspaceFormData,
    documentScopeId: string,
    isCurrent: () => boolean,
  ): Promise<AtomicEditorSavePayload | null> => {
    const parsedTags = parseWorkspaceTags(data.tags)
    const parsedPrerequisites = parseWorkspaceRelations(data.prerequisites, {
      currentDocumentId: data.documentId,
      documents: relationDocumentsForParsing("prerequisite"),
    })
    const parsedRelated = parseWorkspaceRelations(data.related, {
      currentDocumentId: data.documentId,
      documents: relationDocumentsForParsing("related"),
    })
    const sources = validateSources()
    if (!parsedTags.ok || !parsedPrerequisites.ok || !parsedRelated.ok || !sources) {
      setStatus("整理信息尚未通过检查；云端未写入，本地备份仍保留。", "error")
      return null
    }

    let knowledgeBaseId = ""
    if (
      editorKnowledgeBaseBinding &&
      (editorKnowledgeBaseBinding.documentId === data.documentId ||
        editorKnowledgeBaseBinding.documentId === documentScopeId)
    ) {
      knowledgeBaseId = editorKnowledgeBaseBinding.knowledgeBaseId
    } else if (data.documentId) {
      const binding = await client
        .from("documents")
        .select("knowledge_base_id")
        .eq("id", data.documentId)
        .eq("owner_id", currentUser.id)
        .single()
      if (!isCurrent() || binding.error || !binding.data?.knowledge_base_id) {
        setStatus("无法确认文档所属知识库；原子保存未发起。", "error")
        return null
      }
      knowledgeBaseId = String(binding.data.knowledge_base_id)
    } else {
      knowledgeBaseId = String((await ensureKnowledgeBase(isCurrent)) ?? "")
    }
    if (!knowledgeBaseId || !isCurrent()) return null

    try {
      const payload = materializeAtomicEditorSavePayload(
        {
          requestVersion: 1,
          knowledgeBaseId,
          snapshot: {
            title: data.title,
            body: data.body,
            topic: data.topic,
            maturity: data.maturity,
            visibility: data.visibility,
            tags: parsedTags.value.map((tag) => tag.name),
            prerequisites: parsedPrerequisites.value.map((item) => item.documentId),
            related: parsedRelated.value.map((item) => item.documentId),
            sources: sources.map(({ kind, url, title, author, note }) => ({
              kind,
              url,
              title,
              author,
              note,
            })),
          },
        },
        { documentId: data.documentId || null },
      )
      editorKnowledgeBaseBinding = { documentId: documentScopeId, knowledgeBaseId }
      return payload
    } catch {
      setStatus("保存快照不符合原子协议；云端未写入，本地备份仍保留。", "error")
      return null
    }
  }

  const atomicOutcomeMessage = (outcome: EditorSaveControllerOutcome) => {
    const messages: Partial<Record<EditorSaveControllerOutcome["status"], string>> = {
      manual_recovery: "检测到旧版恢复记录；已停止保存，绝不回退到旧版多表写入。",
      protocol_mismatch: "页面与原子保存协议不匹配；请刷新页面，本地备份仍保留。",
      rpc_unavailable: "原子保存 RPC 尚未部署；未尝试旧版写入。",
      request_rejected: "云端明确拒绝了这次原子请求；本地快照已冻结等待恢复。",
      outbox_unavailable: "原子恢复队列不可用；未尝试直接写库。",
      response_mismatch: "云端响应无法通过操作身份核对；恢复操作保持冻结。",
      settlement_failed: "云端已响应，但本地持久化结算尚未确认。",
      acknowledgement_unknown: "网络中断；同一操作会按退避计划安全重放。",
      retry_later: "保存正在等待持久化退避窗口，不会立即重复请求。",
      offline: "当前离线；未发送云端请求，本地备份仍保留。",
      idle: "当前没有待重放的原子保存操作。",
    }
    return messages[outcome.status] ?? "原子保存尚未完成；本地备份仍保留。"
  }

  const enterAtomicSaveRecovery = async (
    outcome: EditorSaveControllerOutcome & {
      status: "conflict" | "not_found" | "request_rejected"
    },
    documentScopeId: string,
    ownerId: string,
    saveClient: any,
    isCurrent: () => boolean,
  ) => {
    const claim = outcome.claim
    if (!claim) {
      invalidateEditorSaves()
      showEditorLoadRecovery(
        documentScopeId,
        "云端拒绝了保存，但缺少可核对的本地操作快照；编辑器已锁定。",
      )
      return
    }
    let payload: AtomicEditorSavePayload
    try {
      payload = materializeAtomicEditorSavePayload(claim.record.payload, {
        documentId: claim.record.documentId === "new" ? null : claim.record.documentId,
      })
    } catch {
      invalidateEditorSaves()
      showEditorLoadRecovery(
        documentScopeId,
        "持久化快照无法通过协议核对；编辑器已锁定且不会自动重放。",
      )
      return
    }
    const recoveryDocumentId =
      claim.record.documentId === "new" ? documentScopeId : claim.record.documentId
    const snapshot = payload.snapshot
    const backup = addEditorBackupMetadata(
      {
        title: snapshot.title,
        body: snapshot.body,
        topic: snapshot.topic,
        maturity: snapshot.maturity,
        visibility: snapshot.visibility,
        tags: JSON.stringify(snapshot.tags),
        prerequisites: JSON.stringify(snapshot.prerequisites),
        related: JSON.stringify(snapshot.related),
        documentId: claim.record.documentId === "new" ? "" : claim.record.documentId,
        revision: claim.record.baseRevision,
        status: "draft",
        __sources: redactWorkspaceSourcesForRecovery(snapshot.sources),
      },
      ownerId,
      recoveryDocumentId,
      claim.record.baseRevision,
      claim.record.createdAt,
    )
    let cloudRow: Record<string, unknown> | null = null
    let cloudOrganization: Awaited<ReturnType<typeof loadCloudOrganizationSnapshot>> | null = null
    if (claim.record.documentId !== "new") {
      try {
        const latest = await saveClient
          .from("documents")
          .select("id,title,body,topic,maturity,status,visibility,revision")
          .eq("id", claim.record.documentId)
          .eq("owner_id", ownerId)
          .maybeSingle()
        if (latest.error) throw latest.error
        if (latest.data) {
          cloudRow = latest.data as Record<string, unknown>
          cloudOrganization = await loadCloudOrganizationSnapshot(
            saveClient,
            claim.record.documentId,
            ownerId,
          )
        }
      } catch {
        if (!isCurrent()) return
        invalidateEditorSaves()
        if (form) {
          form.inert = true
          form.setAttribute("aria-busy", "false")
        }
        showEditorLoadRecovery(
          documentScopeId,
          "无法安全核对云端版本；编辑器已锁定，持久恢复记录仍保持冻结。",
        )
        if (state) state.textContent = "云端版本尚未安全核对，编辑与自动保存已暂停"
        return
      }
    }
    if (!isCurrent()) return
    const cloudAvailable = Boolean(cloudRow)
    const cloudRevision =
      outcome.status === "conflict"
        ? outcome.response.current_revision
        : Number(cloudRow?.revision ?? claim.record.baseRevision)
    freezeEditorConflict(
      recoveryDocumentId,
      backup,
      outcome.status === "not_found"
        ? "not-found"
        : outcome.status === "request_rejected"
          ? "request-rejected"
          : "remote-write",
      {
        title: String(cloudRow?.title ?? snapshot.title),
        body: String(cloudRow?.body ?? snapshot.body),
        topic: String(cloudRow?.topic ?? snapshot.topic),
        maturity: String(cloudRow?.maturity ?? snapshot.maturity),
        visibility: String(cloudRow?.visibility ?? snapshot.visibility),
        status: String(cloudRow?.status ?? "draft"),
        tags: cloudOrganization?.tags ?? JSON.stringify(snapshot.tags),
        prerequisites: cloudOrganization?.prerequisites ?? JSON.stringify(snapshot.prerequisites),
        related: cloudOrganization?.related ?? JSON.stringify(snapshot.related),
        documentId: claim.record.documentId === "new" ? "" : claim.record.documentId,
        revision: cloudRevision,
        __sources: cloudOrganization?.__sources ?? snapshot.sources,
        organizationLoaded: cloudAvailable && Boolean(cloudOrganization),
        cloudAvailable,
      },
    )
    if (editorConflict) editorConflict.operationId = claim.record.operationId
  }

  const restoreAtomicConflictForScope = async (
    documentScopeId: string,
    isCurrent = () => true,
  ): Promise<"none" | "conflict" | "blocked"> => {
    if (!editorOutbox || !currentUser || !client || !documentScopeId) return "blocked"
    const ownerId = String(currentUser.id)
    const saveClient = client
    const saveAuthEpoch = authEpoch
    const scopeIsCurrent = () =>
      isCurrent() &&
      currentUser?.id === ownerId &&
      client === saveClient &&
      authEpoch === saveAuthEpoch &&
      currentEditorScopeId() === documentScopeId
    const blockRecoveryInspection = (message: string) => {
      if (!scopeIsCurrent()) return "blocked" as const
      invalidateEditorSaves()
      if (form) {
        form.inert = true
        form.setAttribute("aria-busy", "false")
      }
      showEditorLoadRecovery(documentScopeId, message)
      if (state) state.textContent = "持久冲突状态尚未安全核对，编辑已暂停"
      return "blocked" as const
    }
    let records: EditorOutboxRecord[]
    try {
      records = await editorOutbox.listForOwner(ownerId)
    } catch {
      return blockRecoveryInspection(
        "无法读取持久恢复队列；编辑器已锁定，且没有把读取失败当作无冲突。",
      )
    }
    if (!scopeIsCurrent()) return "blocked"
    const frozen = records.find(
      (record) =>
        record.ownerId === ownerId &&
        record.documentScopeId === documentScopeId &&
        record.status === "conflict",
    )
    if (!frozen) return "none"
    try {
      await enterAtomicSaveRecovery(
        {
          status: "request_rejected",
          claim: { record: frozen, updatedAt: frozen.updatedAt },
        } as EditorSaveControllerOutcome & { status: "request_rejected" },
        documentScopeId,
        ownerId,
        saveClient,
        scopeIsCurrent,
      )
    } catch {
      return blockRecoveryInspection(
        "持久冲突稿或云端快照无法安全读取；编辑器已锁定，恢复记录仍保持冻结。",
      )
    }
    if (!scopeIsCurrent() && editorConflict?.documentId !== documentScopeId) return "blocked"
    return editorConflict?.documentId === documentScopeId
      ? "conflict"
      : blockRecoveryInspection("持久冲突稿未能完整物化；编辑器已锁定，恢复记录不会自动重放。")
  }

  const scheduleAtomicSaveFlush = (input: {
    ownerId: string
    documentScopeId: string
    saveClient: any
    saveAuthEpoch: number
    saveEpoch: number
    runAt: number
  }) => {
    cancelEditorRetryTimer()
    const timerEpoch = editorRetryTimerEpoch
    const delay = Math.max(0, input.runAt - Date.now())
    editorRetryTimer = window.setTimeout(() => {
      editorRetryTimer = undefined
      if (
        disposed ||
        editorRetryTimerEpoch !== timerEpoch ||
        navigator.onLine === false ||
        currentUser?.id !== input.ownerId ||
        client !== input.saveClient ||
        authEpoch !== input.saveAuthEpoch ||
        currentEditorScopeId() !== input.documentScopeId ||
        !editorSaveIsAllowed(input.documentScopeId, input.saveEpoch)
      )
        return
      void requestDocumentSave({ enqueue: false })
    }, delay)
  }

  const scheduleAtomicOutcomeRetry = (
    outcome: EditorSaveControllerOutcome,
    context: {
      ownerId: string
      documentScopeId: string
      saveClient: any
      saveAuthEpoch: number
      saveEpoch: number
    },
  ) => {
    if (outcome.status === "offline") {
      cancelEditorRetryTimer()
      return
    }
    const retryable =
      outcome.status === "acknowledgement_unknown" ||
      outcome.status === "rpc_unavailable" ||
      outcome.status === "response_mismatch" ||
      outcome.status === "settlement_failed" ||
      outcome.status === "retry_later"
    if (!retryable) return
    const runAt =
      outcome.retryAt ??
      (outcome.claim
        ? outcome.claim.updatedAt +
          editorAtomicSaveRetryDelay(
            outcome.claim.record.attempts,
            outcome.claim.record.operationId,
          )
        : 0)
    if (!runAt) return
    scheduleAtomicSaveFlush({ ...context, runAt })
  }

  async function saveDocumentOnce(flushOnly = false, explicit = false) {
    if (!form || !currentUser || !client || !editorSaveController) {
      setStatus("原子保存控制器尚未就绪；未尝试旧版多表写入。", "error")
      return false
    }
    cancelEditorRetryTimer()
    const data = readForm()
    const documentScopeId = data.documentId || currentEditorScopeId() || bindFreshEditorDraftScope()
    const pageStartedAsDraft =
      !data.documentId && documentScopeId.startsWith(EDITOR_DRAFT_SCOPE_PREFIX)
    const ownerId = String(currentUser.id)
    const saveClient = client
    const saveAuthEpoch = authEpoch
    const saveEpochAtStart = editorSaveEpoch
    const generationAtStart = editorChangeGeneration
    const backupTokenAtStart = writeLocalBackup()
    const targetIsCurrent = () =>
      !disposed &&
      currentUser?.id === ownerId &&
      client === saveClient &&
      authEpoch === saveAuthEpoch &&
      currentEditorScopeId() === documentScopeId &&
      editorSaveIsAllowed(documentScopeId, saveEpochAtStart)
    if (!targetIsCurrent()) return false
    const requiresExplicitSave = editorManualSaveIsRequired(documentScopeId)
    if (requiresExplicitSave && !explicit) {
      if (state) state.textContent = "恢复稿等待你明确点击保存，自动同步仍保持暂停"
      return false
    }

    const payload = flushOnly
      ? null
      : await materializeCurrentAtomicSave(data, documentScopeId, targetIsCurrent)
    if (!flushOnly && !payload) return false
    if (requiresExplicitSave && explicit) clearEditorManualSaveGate()
    const outcome = (
      flushOnly
        ? await editorSaveController.flush(documentScopeId)
        : await editorSaveController.enqueueAndSave({
            ownerId,
            documentId: data.documentId || "new",
            documentScopeId,
            baseRevision: data.documentId ? data.revision : 0,
            payload: payload!,
          })
    ) as EditorSaveControllerOutcome

    if (!targetIsCurrent()) return false
    if (outcome.status !== "saved") {
      const frozen =
        outcome.status === "conflict" ||
        outcome.status === "not_found" ||
        outcome.status === "request_rejected"
      editorCoordinator?.publishStatus({
        documentId: documentScopeId,
        operationId: outcome.claim?.record.operationId,
        status: frozen ? "conflict" : "queued",
      })
      if (
        outcome.status === "conflict" ||
        outcome.status === "not_found" ||
        outcome.status === "request_rejected"
      ) {
        await enterAtomicSaveRecovery(
          outcome as EditorSaveControllerOutcome & {
            status: "conflict" | "not_found" | "request_rejected"
          },
          documentScopeId,
          ownerId,
          saveClient,
          targetIsCurrent,
        )
        return false
      }
      scheduleAtomicOutcomeRetry(outcome, {
        ownerId,
        documentScopeId,
        saveClient,
        saveAuthEpoch,
        saveEpoch: saveEpochAtStart,
      })
      setStatus(atomicOutcomeMessage(outcome), "error")
      return false
    }
    const savedDocumentId = outcome.response.document_id
    const nextDocumentScopeId = outcome.nextDocumentScopeId
    const revisionField = form.elements.namedItem("revision") as HTMLInputElement | null
    let finalBackupToken = backupTokenAtStart
    let retainedDraftBackupAfterMigrationFailure = false
    if (pageStartedAsDraft) {
      const draftBackupToken = editorTabDrafts.backupToken(documentScopeId)
      const migratedBackup = addEditorBackupMetadata(
        {
          ...readForm(),
          documentId: savedDocumentId,
          revision: outcome.response.revision,
          __sources: redactWorkspaceSourcesForRecovery(collectSources()),
        },
        ownerId,
        savedDocumentId,
        outcome.response.revision,
      )
      const migratedRaw = JSON.stringify(migratedBackup)
      const migratedBackupStored = setStorageItemSafely(
        localStorage,
        localDraftKey(ownerId, savedDocumentId),
        migratedRaw,
      )
      if (migratedBackupStored) {
        editorTabDrafts.rememberBackup(savedDocumentId, migratedRaw)
        finalBackupToken = migratedRaw
        if (draftBackupToken) {
          removeTabBackupIfUnchanged(ownerId, documentScopeId, draftBackupToken)
        }
      } else {
        finalBackupToken = null
        retainedDraftBackupAfterMigrationFailure = draftBackupToken !== null
      }
      editorTabDrafts.moveDirty(documentScopeId, savedDocumentId)
      const documentField = form.elements.namedItem("documentId") as HTMLInputElement | null
      if (documentField) documentField.value = savedDocumentId
      if (revisionField) revisionField.value = String(outcome.response.revision)
      currentDraftId = ""
      editorKnowledgeBaseBinding = {
        documentId: savedDocumentId,
        knowledgeBaseId: outcome.response.knowledge_base_id,
      }
      allowEditorSaves(savedDocumentId)
      if (
        serializedSaveIntent?.ownerId === ownerId &&
        serializedSaveIntent.authEpoch === saveAuthEpoch &&
        serializedSaveIntent.documentScopeId === documentScopeId
      ) {
        serializedSaveIntent = {
          ...serializedSaveIntent,
          documentScopeId: savedDocumentId,
          saveEpoch: editorSaveEpoch,
        }
      }
      window.history.replaceState(
        window.history.state,
        "",
        bindDocumentEditorRoute(window.location.href, savedDocumentId),
      )
    } else {
      if (revisionField) revisionField.value = String(outcome.response.revision)
    }

    const settledSaveEpoch = editorSaveEpoch
    const settledTargetIsCurrent = () =>
      !disposed &&
      currentUser?.id === ownerId &&
      client === saveClient &&
      authEpoch === saveAuthEpoch &&
      currentEditorScopeId() === nextDocumentScopeId &&
      editorSaveIsAllowed(nextDocumentScopeId, settledSaveEpoch)
    if (!settledTargetIsCurrent()) return false

    const hasPendingFollowUp = outcome.followUpState !== "none"
    const localRecoveryUnavailable = finalBackupToken === null
    let finalized = false
    if (!hasPendingFollowUp && editorChangeGeneration === generationAtStart) {
      let backupCleanupConfirmed = localRecoveryUnavailable
      if (finalBackupToken === null) {
        // No tab-owned token means there is nothing this tab can safely delete.
        // A shared key may belong to another tab, so acknowledge the cloud save
        // while leaving all browser storage untouched.
      } else if (editorTabDrafts.backupToken(nextDocumentScopeId) === finalBackupToken) {
        backupCleanupConfirmed = removeTabBackupIfUnchanged(
          ownerId,
          nextDocumentScopeId,
          finalBackupToken,
        )
      }
      if (backupCleanupConfirmed) {
        finalized = editorTabDrafts.clearDirtyIfGeneration(nextDocumentScopeId, generationAtStart)
      }
    }

    if (!finalized) {
      if (!hasPendingFollowUp && editorChangeGeneration !== generationAtStart) writeLocalBackup()
      editorCoordinator?.publishStatus({
        documentId: nextDocumentScopeId,
        operationId: outcome.claim.record.operationId,
        status: "queued",
        revision: outcome.response.revision,
      })
      if (state)
        state.textContent = hasPendingFollowUp
          ? "云端已确认当前版本，仍有更新的本地改动等待同步"
          : "云端已确认当前版本，新的本地改动仍在保留"
      if (hasPendingFollowUp) {
        scheduleAtomicSaveFlush({
          ownerId,
          documentScopeId: nextDocumentScopeId,
          saveClient,
          saveAuthEpoch,
          saveEpoch: settledSaveEpoch,
          runAt: Date.now(),
        })
      }
      updatePublicationUI(currentPublication, outcome.response.revision)
      return false
    }

    editorCoordinator?.publishStatus({
      documentId: nextDocumentScopeId,
      operationId: outcome.claim.record.operationId,
      status: "saved",
      revision: outcome.response.revision,
    })
    if (localRecoveryUnavailable) {
      if (retainedDraftBackupAfterMigrationFailure) {
        if (state) state.textContent = "云端草稿已保存，原草稿恢复副本仍保留"
        setStatus(
          "云端保存和文档身份已确认；浏览器未能迁移恢复副本，因此原 draft 备份未删除。",
          "error",
        )
      } else {
        if (state) state.textContent = "云端草稿已保存，但本地恢复副本不可用"
        setStatus("云端保存已确认；浏览器未能建立本标签页的恢复副本，请检查存储空间。", "error")
      }
    } else if (state) state.textContent = "云端草稿已保存"
    updatePublicationUI(currentPublication, outcome.response.revision)
    await loadDocuments()
    return true
  }

  const serializedEditorSaves = createSerializedSaveQueue(async () => {
    const intent = serializedSaveIntent
    serializedSaveIntent = null
    if (
      !intent ||
      disposed ||
      currentUser?.id !== intent.ownerId ||
      authEpoch !== intent.authEpoch ||
      currentEditorScopeId() !== intent.documentScopeId ||
      !editorSaveIsAllowed(intent.documentScopeId, intent.saveEpoch)
    )
      return false
    return saveDocumentOnce(!intent.enqueue, intent.explicit)
  })
  const requestDocumentSave = async (options: { enqueue?: boolean; explicit?: boolean } = {}) => {
    if (!currentUser) return false
    const documentScopeId = currentEditorScopeId()
    if (!documentScopeId) return false
    if (editorManualSaveIsRequired(documentScopeId) && options.explicit !== true) return false
    const nextIntent = {
      ownerId: String(currentUser.id),
      authEpoch,
      documentScopeId,
      saveEpoch: editorSaveEpoch,
      generation: editorChangeGeneration,
      enqueue: options.enqueue !== false,
      explicit: options.explicit === true,
    }
    const pending = serializedSaveIntent
    serializedSaveIntent =
      pending &&
      pending.ownerId === nextIntent.ownerId &&
      pending.authEpoch === nextIntent.authEpoch &&
      pending.documentScopeId === nextIntent.documentScopeId &&
      pending.saveEpoch === nextIntent.saveEpoch
        ? {
            ...nextIntent,
            generation: Math.max(pending.generation, nextIntent.generation),
            enqueue: pending.enqueue || nextIntent.enqueue,
            explicit: pending.explicit || nextIntent.explicit,
          }
        : nextIntent
    return serializedEditorSaves.request()
  }

  const flushDurableOutboxForCurrentDocument = async () => {
    if (!editorOutbox || !currentUser || !form || !editorSaveController) return false
    const documentScopeId = currentEditorScopeId()
    if (!documentScopeId || editorConflict?.documentId === documentScopeId) return false
    return requestDocumentSave({ enqueue: false })
  }

  const resolveDurableEditorConflict = async (
    conflict: NonNullable<typeof editorConflict>,
    expectedLatest: EditorOutboxConflictResolutionToken | null,
  ) => {
    if (!editorOutbox)
      return expectedLatest === null
        ? { ok: true as const, latest: null }
        : { ok: false as const, latest: null }
    try {
      const latest = await editorOutbox.resolveDocumentConflict(
        conflict.ownerId,
        conflict.documentId,
        expectedLatest,
      )
      const expectationMatches =
        expectedLatest === null
          ? latest === null
          : latest?.operationId === expectedLatest.operationId &&
            latest.updatedAt === expectedLatest.updatedAt
      if (!expectationMatches) {
        setStatus(
          "检测到另一标签页在恢复准备后又保存了新修改；没有清除任何队列，请重新比较版本。",
          "error",
        )
        return { ok: false as const, latest }
      }
      return { ok: true as const, latest }
    } catch {
      setStatus("恢复队列暂时无法确认你的选择；冲突稿仍保持冻结，请稍后重试。", "error")
      return { ok: false as const, latest: null }
    }
  }

  const runEditorConflictResolution = async (
    action: (conflict: NonNullable<typeof editorConflict>) => Promise<void>,
  ) => {
    const conflict = editorConflict
    if (
      !conflict ||
      editorConflictResolutionPending ||
      !currentUser ||
      currentUser.id !== conflict.ownerId
    )
      return
    editorConflictResolutionPending = true
    conflictSection?.setAttribute("aria-busy", "true")
    const controls = conflictSection?.querySelectorAll<HTMLButtonElement>("button") ?? []
    for (const control of controls) control.disabled = true
    try {
      if (editorConflict !== conflict) return
      await action(conflict)
    } finally {
      editorConflictResolutionPending = false
      conflictSection?.setAttribute("aria-busy", "false")
      for (const control of controls) control.disabled = false
      applyEditorConflictActionAvailability()
    }
  }

  const conflictUsesImmediateCas = (conflict: NonNullable<typeof editorConflict>) =>
    conflict.reason === "remote-write" && conflict.cloud.cloudAvailable !== false

  const materializeEditableConflictBackup = (
    conflict: NonNullable<typeof editorConflict>,
    backup: EditorBackup,
  ) => {
    const draftScope = conflict.documentId.startsWith(EDITOR_DRAFT_SCOPE_PREFIX)
    const documentId = draftScope ? "" : conflict.documentId
    const backupRevision = Number(backup.__editorRecovery?.baseRevision ?? backup.revision ?? 0)
    const revision =
      documentId && conflict.cloud.cloudAvailable !== false
        ? conflict.cloud.revision
        : Number.isSafeInteger(backupRevision) && backupRevision >= 0
          ? backupRevision
          : 0
    return addEditorBackupMetadata(
      {
        ...backup,
        documentId,
        revision,
        status: "draft",
      },
      conflict.ownerId,
      conflict.documentId,
      revision,
    )
  }

  const restoreConflictForExplicitSave = async (
    conflict: NonNullable<typeof editorConflict>,
    context: ReturnType<typeof captureAuthContext>,
  ) => {
    const prepared = await prepareEditorConflictArchive(conflict, context)
    if (!prepared.ok || !editorConflictActionIsCurrent(conflict, context)) return false
    const editableBackup = materializeEditableConflictBackup(conflict, prepared.backup)
    const raw = JSON.stringify(editableBackup)
    if (
      !setStorageItemSafely(localStorage, localDraftKey(conflict.ownerId, conflict.documentId), raw)
    ) {
      setStatus("无法建立可编辑恢复副本；冲突仍保持冻结，持久恢复记录没有删除。", "error")
      return false
    }
    if (!editorConflictActionIsCurrent(conflict, context)) return false
    const resolution = await resolveDurableEditorConflict(conflict, prepared.durableToken)
    if (!resolution.ok || !editorConflictActionIsCurrent(conflict, context)) return false
    const backup = editableBackup as Record<string, unknown> & { __sources?: WorkspaceSource[] }
    fillForm(backup)
    renderSources(Array.isArray(backup.__sources) ? backup.__sources : [])
    clearEditorConflict()
    allowEditorSaves(conflict.documentId)
    editorChangeGeneration += 1
    editorTabDrafts.markDirty(conflict.documentId, editorChangeGeneration)
    editorTabDrafts.rememberBackup(conflict.documentId, raw)
    requireExplicitEditorSave(conflict.documentId)
    if (state) state.textContent = "本地恢复稿已可编辑；请明确点击保存后再同步"
    setStatus("恢复稿已保留在浏览器中。系统不会自动重试；检查内容后请明确点击保存。")
    return true
  }

  root.querySelector("[data-conflict-use-local]")?.addEventListener("click", async () => {
    await runEditorConflictResolution(async (conflict) => {
      if (!form || !currentUser || !client) return
      if (conflict.reason === "not-found") return
      const context = captureAuthContext()
      if (!conflictUsesImmediateCas(conflict)) {
        await restoreConflictForExplicitSave(conflict, context)
        return
      }
      const prepared = await prepareEditorConflictArchive(conflict, context)
      if (!prepared.ok || !editorConflictActionIsCurrent(conflict, context)) return
      const resolution = await resolveDurableEditorConflict(conflict, prepared.durableToken)
      if (!resolution.ok || !editorConflictActionIsCurrent(conflict, context)) return
      const recoverableBackup = prepared.backup
      const backup = recoverableBackup as Record<string, unknown> & {
        __sources?: WorkspaceSource[]
      }
      fillForm(backup)
      renderSources(Array.isArray(backup.__sources) ? backup.__sources : [])
      const documentId = form.elements.namedItem("documentId") as HTMLInputElement | null
      const revision = form.elements.namedItem("revision") as HTMLInputElement | null
      if (documentId) documentId.value = conflict.documentId
      if (revision) revision.value = String(conflict.cloud.revision)
      clearEditorConflict()
      allowEditorSaves(conflict.documentId)
      editorChangeGeneration += 1
      writeLocalBackup()
      if (state) state.textContent = "正在以本地稿创建新的云端版本…"
      if (await requestDocumentSave()) {
        if (state) state.textContent = "本地稿已保存为新的云端版本"
        setStatus("已保留你的本地内容，并在当前云端版本之后创建了新版本。", "success")
      }
    })
  })

  root.querySelector("[data-conflict-use-cloud]")?.addEventListener("click", async () => {
    await runEditorConflictResolution(async (conflict) => {
      if (!form || !currentUser) return
      if (conflict.cloud.cloudAvailable === false) return
      const context = captureAuthContext()
      const prepared = await prepareEditorConflictArchive(conflict, context)
      if (!prepared.ok || !editorConflictActionIsCurrent(conflict, context)) return
      const resolution = await resolveDurableEditorConflict(conflict, prepared.durableToken)
      if (!resolution.ok || !editorConflictActionIsCurrent(conflict, context)) return
      const recoverableBackup = prepared.backup
      clearEditorConflict()
      fillForm(conflict.cloud)
      if (state) state.textContent = "正在载入云端版本…"
      if (await openDocument(conflict.documentId, { ignoreLocalBackup: true })) {
        removeTabBackupIfUnchanged(conflict.ownerId, conflict.documentId)
        editorTabDrafts.clearDocument(conflict.documentId)
        setStatus("已采用云端版本；原本地稿已另存为浏览器恢复副本。", "success")
      } else {
        freezeEditorConflict(
          conflict.documentId,
          recoverableBackup,
          conflict.reason,
          conflict.cloud,
        )
        setStatus("云端版本暂时无法完整载入；本地稿仍保持可恢复状态，请联网后重试。", "error")
      }
    })
  })

  root.querySelector("[data-conflict-save-copy]")?.addEventListener("click", async () => {
    await runEditorConflictResolution(async (conflict) => {
      if (!form || !currentUser || !client) return
      const context = captureAuthContext()
      const prepared = await prepareEditorConflictArchive(conflict, context)
      if (!prepared.ok || !editorConflictActionIsCurrent(conflict, context)) return
      let sourceKnowledgeBaseId =
        editorKnowledgeBaseBinding?.documentId === conflict.documentId
          ? editorKnowledgeBaseBinding.knowledgeBaseId
          : ""
      try {
        if (!sourceKnowledgeBaseId && conflict.cloud.cloudAvailable !== false) {
          const sourceDocument = await context.client
            .from("documents")
            .select("knowledge_base_id")
            .eq("id", conflict.documentId)
            .eq("owner_id", conflict.ownerId)
            .single()
          if (
            sourceDocument.error ||
            !sourceDocument.data?.knowledge_base_id ||
            !editorConflictActionIsCurrent(conflict, context)
          ) {
            setStatus("无法确认原文档所属知识库；尚未创建冲突副本，请稍后重试。", "error")
            return
          }
          sourceKnowledgeBaseId = String(sourceDocument.data.knowledge_base_id)
        }
        if (!sourceKnowledgeBaseId) {
          sourceKnowledgeBaseId = String(
            (await ensureKnowledgeBase(() => editorConflictActionIsCurrent(conflict, context))) ??
              "",
          )
        }
      } catch {
        if (editorConflictActionIsCurrent(conflict, context))
          setStatus("无法确认原文档所属知识库；尚未创建冲突副本，请稍后重试。", "error")
        return
      }
      if (!sourceKnowledgeBaseId || !editorConflictActionIsCurrent(conflict, context)) {
        setStatus("无法准备私密副本的知识库；冲突稿仍保持冻结。", "error")
        return
      }

      const copyDraftId = createEditorDraftId()
      const copyScope = editorDraftScope(copyDraftId)
      const recoverableBackup = redactEditorBackupSources(prepared.backup)
      const originalTitle = String(recoverableBackup.title ?? "未命名知识")
      const copyBackup = addEditorBackupMetadata(
        {
          ...recoverableBackup,
          title: originalTitle.endsWith("（冲突副本）")
            ? originalTitle
            : `${originalTitle}（冲突副本）`,
          documentId: "",
          revision: 0,
          status: "draft",
          visibility: "private",
        },
        conflict.ownerId,
        copyScope,
        0,
      )
      let copyRaw = ""
      try {
        copyRaw = JSON.stringify(copyBackup)
      } catch {
        setStatus("无法建立私密副本快照；旧冲突仍保持冻结。", "error")
        return
      }
      if (
        !setStorageItemSafely(localStorage, localDraftKey(conflict.ownerId, copyScope), copyRaw)
      ) {
        setStatus("浏览器空间不足，未清除旧冲突；请先导出或清理空间。", "error")
        return
      }
      if (!editorConflictActionIsCurrent(conflict, context)) return
      const resolution = await resolveDurableEditorConflict(conflict, prepared.durableToken)
      if (!resolution.ok || !editorConflictActionIsCurrent(conflict, context)) return

      fillForm(copyBackup)
      renderSources(
        Array.isArray(copyBackup.__sources) ? (copyBackup.__sources as WorkspaceSource[]) : [],
      )
      const boundCopyScope = bindFreshEditorDraftScope(copyDraftId)
      if (boundCopyScope !== copyScope) {
        setStatus("私密副本编号核对失败；浏览器恢复副本仍已保留。", "error")
        return
      }
      editorKnowledgeBaseBinding = { documentId: copyScope, knowledgeBaseId: sourceKnowledgeBaseId }
      clearEditorConflict()
      allowEditorSaves(copyScope)
      updatePublicationUI(null)
      editorChangeGeneration += 1
      editorTabDrafts.markDirty(copyScope, editorChangeGeneration)
      editorTabDrafts.rememberBackup(copyScope, copyRaw)

      if (!conflictUsesImmediateCas(conflict)) {
        requireExplicitEditorSave(copyScope)
        if (state) state.textContent = "私密副本已保存在浏览器中，等待你明确点击保存"
        setStatus("私密副本已准备好且保持私密；系统不会自动重放，请检查后点击保存。")
        return
      }
      if (state) state.textContent = "正在另存为私密副本…"
      if (await requestDocumentSave()) {
        removeTabBackupIfUnchanged(conflict.ownerId, conflict.documentId)
        editorTabDrafts.clearDocument(conflict.documentId)
        if (state) state.textContent = "私密副本已保存"
        setStatus("已创建新的私密副本；原文档和冲突恢复稿都未被覆盖。", "success")
      }
    })
  })

  conflictExportLocal?.addEventListener("click", () => {
    const conflict = editorConflict
    if (!conflict || !currentUser || currentUser.id !== conflict.ownerId) return
    const raw = JSON.stringify(
      {
        format: "wouldkeep-editor-conflict-v1",
        ownerId: conflict.ownerId,
        documentScopeId: conflict.documentId,
        reason: conflict.reason,
        exportedAt: new Date().toISOString(),
        backup: redactEditorBackupSources(recoverableConflictBackup(conflict)),
      },
      null,
      2,
    )
    const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }))
    const link = document.createElement("a")
    link.href = url
    link.download = `wouldkeep-conflict-${Date.now()}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    setStatus("本地恢复稿已导出；冲突仍保持冻结，尚未删除任何操作。", "success")
  })

  const queueAutosave = () => {
    if (!form || !currentUser || !client) return
    const documentScopeId = currentEditorScopeId()
    if (!documentScopeId || !editorSaveIsAllowed(documentScopeId)) return
    if (editorManualSaveIsRequired(documentScopeId)) {
      if (autosaveTimer) window.clearTimeout(autosaveTimer)
      if (state) state.textContent = "恢复稿等待你明确点击保存，自动同步仍保持暂停"
      return
    }
    if (autosaveTimer) window.clearTimeout(autosaveTimer)
    autosaveTimer = window.setTimeout(async () => {
      if (state) state.textContent = "正在自动保存…"
      if (await requestDocumentSave()) {
        if (state) state.textContent = "已自动保存到云端"
      }
    }, 1000)
  }

  const clearSensitiveEditorState = () => {
    if (autosaveTimer) window.clearTimeout(autosaveTimer)
    serializedSaveIntent = null
    editorSaveController?.close()
    editorSaveController = null
    editorManualRecoveryBlocked = false
    editorManualRecoveryExported = false
    editorManualRecoveryPackage = null
    currentDraftId = ""
    invalidateEditorSaves()
    editorTabDrafts.clearAll()
    hideEditorLoadRecovery()
    clearEditorConflict()
    aiSuggestionPreferences = null
    discardAiSuggestion("")
    form?.reset()
    relationDocumentOptions = []
    editorKnowledgeBaseBinding = null
    clearRetainedUnavailableRelationTargets()
    syncOrganizationEditorsFromFields()
    if (form) {
      form.inert = false
      form.setAttribute("aria-busy", "false")
    }
    renderSources()
    historyList?.replaceChildren()
    if (history) history.hidden = true
    if (editor) editor.hidden = true
    if (flatWorkbench) flatWorkbench.hidden = true
    currentPublication = null
    updatePublicationUI(null)
    workspaceDocuments = []
    if (libraryList) libraryList.replaceChildren()
    if (state) state.textContent = "登录状态已变化，已清除上一账户在页面中的内容"
  }

  const openDocumentOnce = async (
    documentId: string,
    options: { ignoreLocalBackup?: boolean } = {},
  ) => {
    if (!client || !currentUser || !form) return false
    const ownerId = String(currentUser.id)
    const openClient = client
    const openEpoch = authEpoch
    const openRequest = openDocumentRequests.begin()
    const previousSaveReadyDocumentId = editorSaveReadyDocumentId
    const isCurrentOpen = () =>
      !disposed &&
      openDocumentRequests.isCurrent(openRequest) &&
      authEpoch === openEpoch &&
      currentUser?.id === ownerId &&
      client === openClient
    const setOpenBusy = (busy: boolean) => {
      form.inert = busy
      form.setAttribute("aria-busy", String(busy))
      if (state && busy) state.textContent = "正在安全切换文档…"
    }
    discardAiSuggestion("")
    if (autosaveTimer) window.clearTimeout(autosaveTimer)
    invalidateEditorSaves()
    setOpenBusy(true)
    hideEditorLoadRecovery()
    try {
      historyList?.replaceChildren()
      if (history) history.hidden = true
      if (editorConflict?.documentId !== documentId) clearEditorConflict()
      await restoreDurableOutboxBackup(documentId, isCurrentOpen)
      if (!isCurrentOpen()) return false
      const restoredLocally = options.ignoreLocalBackup
        ? false
        : restoreLocalBackup(documentId, undefined, { deferConflict: true })
      if (restoredLocally) {
        if (writeLauncher) writeLauncher.hidden = true
        if (flatWorkbench) flatWorkbench.hidden = true
        if (editor) editor.hidden = false
        if (state) state.textContent = "已从本地恢复，正在核对云端版本…"
      }
      const result = await openClient
        .from("documents")
        .select("id,title,body,topic,maturity,status,visibility,revision,knowledge_base_id")
        .eq("id", documentId)
        .eq("owner_id", ownerId)
        .single()
      if (!isCurrentOpen()) return false
      if (result.error) {
        if (restoredLocally) {
          if (editorConflict?.documentId !== documentId) allowEditorSaves(documentId)
          if (state) state.textContent = "离线编辑中，本地稿等待同步"
          setStatus("暂时无法连接云端。你可以继续编辑，本地稿会保留并在联网后核对版本。")
        } else {
          if (previousSaveReadyDocumentId && currentEditorScopeId() === previousSaveReadyDocumentId)
            allowEditorSaves(previousSaveReadyDocumentId)
          showEditorLoadRecovery(documentId, "云端正文读取失败；原编辑内容没有被替换。")
          setStatus("这条知识暂时无法打开；原编辑内容仍保持不变，请重试。")
        }
        setOpenBusy(false)
        return false
      }
      currentDraftId = ""
      editorKnowledgeBaseBinding = {
        documentId: String(result.data.id),
        knowledgeBaseId: String(result.data.knowledge_base_id),
      }
      fillForm({
        ...(result.data ?? {}),
        documentId: result.data?.id ?? documentId,
      })
      refreshAiSelectionStatus()
      for (const name of ["tags", "prerequisites", "related"]) {
        const field = form.elements.namedItem(name) as HTMLInputElement | null
        if (field) field.value = ""
      }
      syncOrganizationEditorsFromFields()
      renderSources()
      updatePublicationUI(null)
      if (writeLauncher) writeLauncher.hidden = true
      if (flatWorkbench) flatWorkbench.hidden = true
      if (editor) editor.hidden = false
      if (state) state.textContent = "正文已载入，正在加载标签、关系与来源…"
      await loadVersions(documentId, isCurrentOpen)
      if (!isCurrentOpen()) return false
      const linkOptionsLoaded = await loadLinkOptions(
        documentId,
        String(result.data.knowledge_base_id),
        isCurrentOpen,
      )
      if (!isCurrentOpen()) return false
      const tagsLoaded = await loadDocumentTags(documentId, isCurrentOpen)
      if (!isCurrentOpen()) return false
      const linksLoaded = await loadDocumentLinks(documentId, isCurrentOpen)
      if (!isCurrentOpen()) return false
      const sourcesLoaded = await loadDocumentSources(documentId, isCurrentOpen)
      if (!isCurrentOpen()) return false
      const publicationLoaded = await loadPublication(
        documentId,
        Number(result.data?.revision ?? 0),
        isCurrentOpen,
      )
      if (!isCurrentOpen()) return false
      if (
        !linkOptionsLoaded ||
        !tagsLoaded ||
        !linksLoaded ||
        !sourcesLoaded ||
        !publicationLoaded
      ) {
        const localRestored =
          restoredLocally &&
          !options.ignoreLocalBackup &&
          restoreLocalBackup(documentId, Number(result.data?.revision ?? 0))
        if (localRestored) {
          if (editorConflict?.documentId !== documentId) allowEditorSaves(documentId)
          if (state) state.textContent = "关联数据暂时无法核对，继续使用完整本地恢复稿"
          setStatus(
            "云端关联数据暂时无法完整读取；已保留本地标签、关系和来源，不会用空值覆盖。",
            "error",
          )
          setOpenBusy(false)
          return true
        }
        const failedRelatedData = [
          !linkOptionsLoaded && "关系候选",
          !tagsLoaded && "标签",
          !linksLoaded && "关系",
          !sourcesLoaded && "来源",
          !publicationLoaded && "发布状态",
        ].filter(Boolean)
        showEditorLoadRecovery(
          documentId,
          `${failedRelatedData.join("、") || "关联数据"}读取失败；编辑器保持锁定，现有内容不会被空数据覆盖。`,
        )
        if (state) state.textContent = "文档关联数据尚未安全加载，编辑已暂停"
        setStatus(
          "标签、关系、来源或发布状态读取失败；已锁定编辑器以防空值覆盖，请重新打开这条知识。",
          "error",
        )
        return false
      }
      if (state) state.textContent = "已加载云端草稿"
      if (!options.ignoreLocalBackup)
        restoreLocalBackup(documentId, Number(result.data?.revision ?? 0))
      if (editorConflict?.documentId !== documentId) allowEditorSaves(documentId)
      const atomicConflictState = options.ignoreLocalBackup
        ? "none"
        : await restoreAtomicConflictForScope(documentId, isCurrentOpen)
      if (!isCurrentOpen()) return false
      if (atomicConflictState === "blocked") return false
      if (!options.ignoreLocalBackup && atomicConflictState === "none")
        void flushDurableOutboxForCurrentDocument()
      editor?.scrollIntoView({ behavior: "smooth", block: "start" })
      setOpenBusy(false)
      hideEditorLoadRecovery()
      return true
    } catch {
      if (!isCurrentOpen()) return false
      showEditorLoadRecovery(
        documentId,
        "加载过程意外中断；编辑器保持锁定，原内容与本地恢复数据仍会保留。",
      )
      if (state) state.textContent = "文档加载中断，编辑已暂停"
      setStatus("这条知识没有完整载入；请使用“重新加载文档”安全重试。", "error")
      return false
    }
  }

  const openDocument = (documentId: string, options: { ignoreLocalBackup?: boolean } = {}) =>
    runEditorUiExclusive(() => openDocumentOnce(documentId, options))

  editorRetryLoad?.addEventListener("click", async () => {
    const documentId = editorLoadFailureDocumentId
    if (!documentId || editorRetryLoad.disabled) return
    editorRetryLoad.disabled = true
    editorRetryLoad.textContent = "正在重新加载…"
    const reopened = await openDocument(documentId)
    editorRetryLoad.disabled = false
    editorRetryLoad.textContent = "重新加载文档"
    if (reopened) {
      const title = form?.elements.namedItem("title") as HTMLInputElement | null
      title?.focus()
    } else editorRetryLoad.focus()
  })

  const prepareEditorPersistence = async (ownerId: string) => {
    editorSaveController?.close()
    editorSaveController = null
    if (!editorOutbox || !legacyEditorRepository || !client) {
      editorManualRecoveryBlocked = true
      showEditorManualRecoveryGate("浏览器持久化存储不可用；原子保存已暂停，本地页面内容仍保留。")
    } else {
      const inspection = await inspectLegacyEditorPersistence({
        ownerId,
        legacyRepository: legacyEditorRepository,
        storage: localStorage,
      })
      editorManualRecoveryBlocked = inspection.blocked
      if (inspection.blocked) {
        try {
          const physicalRows = await legacyEditorRepository.getAll()
          const legacyRows = physicalRows.filter((row) => {
            if (!row || typeof row !== "object" || Array.isArray(row)) return true
            const rowOwnerId = (row as { ownerId?: unknown }).ownerId
            return typeof rowOwnerId !== "string" || rowOwnerId === ownerId
          })
          const genericBackup = inspection.genericNewBackupKey
            ? localStorage.getItem(inspection.genericNewBackupKey)
            : null
          editorManualRecoveryPackage = {
            ownerId,
            generatedAt: new Date().toISOString(),
            legacyRows,
            genericBackupKey: inspection.genericNewBackupKey,
            genericBackup,
          }
        } catch {
          editorManualRecoveryPackage = null
        }
      } else {
        editorManualRecoveryPackage = null
      }
      editorSaveController = createEditorSaveController({
        ownerId,
        outbox: editorOutbox,
        rpcClient: client,
        protocolMarker:
          root.dataset.editorSaveProtocol === EDITOR_ATOMIC_SAVE_PROTOCOL
            ? EDITOR_ATOMIC_SAVE_PROTOCOL
            : root.dataset.editorSaveProtocol,
        manualRecoveryBlocked: inspection.blocked,
        isOnline: () => navigator.onLine !== false,
      })
      if (inspection.blocked) {
        showEditorManualRecoveryGate(
          "检测到当前账户的旧版恢复记录；原子保存保持关闭，且不会回退到旧版多表写入。",
        )
      } else {
        if (form) form.inert = false
        hideEditorLoadRecovery()
      }
    }
    if (editorCoordinator?.ownerId !== ownerId || editorCoordinator.isClosed()) {
      editorCoordinator?.close()
      editorCoordinator = createEditorCoordinator({ ownerId })
      editorCoordinator.subscribe((message) => {
        if (!form) return
        const currentDocumentId = currentEditorScopeId()
        if (!currentDocumentId) return
        if (message.documentId !== currentDocumentId) return
        if (message.status === "saving") {
          if (state) state.textContent = "另一标签页正在保存这条知识…"
          return
        }
        if (message.status === "conflict") {
          if (state) state.textContent = "另一标签页检测到版本冲突"
          setStatus("另一标签页已暂停同步；请先在对应页面处理版本冲突。", "error")
          return
        }
        if (message.status === "saved") {
          let hasSharedBackup = false
          try {
            hasSharedBackup = Boolean(
              currentUser && localStorage.getItem(localDraftKey(currentUser.id, currentDocumentId)),
            )
          } catch {
            hasSharedBackup = true
          }
          const hasTabLocalChanges = editorTabDrafts.isDirty(currentDocumentId)
          if (hasTabLocalChanges || hasSharedBackup || form.inert || editorManualRecoveryBlocked) {
            if (state) state.textContent = "另一标签页已保存新版本；当前本地改动仍保留"
          } else {
            if (state) state.textContent = "另一标签页已保存，正在刷新当前版本…"
            void openDocument(currentDocumentId)
          }
        }
      })
    }
  }

  editorRecoveryExport?.addEventListener("click", () => {
    const recoveryPackage = editorManualRecoveryPackage
    if (!recoveryPackage || !currentUser || currentUser.id !== recoveryPackage.ownerId) {
      if (editorManualRecoveryStatus)
        editorManualRecoveryStatus.textContent =
          "恢复记录暂时无法安全读取；没有清除任何数据，请保持页面开启后重试。"
      return
    }
    const raw = JSON.stringify(
      {
        format: "wouldkeep-legacy-editor-recovery-v1",
        ...recoveryPackage,
      },
      null,
      2,
    )
    const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }))
    const link = document.createElement("a")
    link.href = url
    link.download = `wouldkeep-editor-recovery-${recoveryPackage.ownerId}-${Date.now()}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    editorManualRecoveryExported = true
    if (editorRecoveryArchive) editorRecoveryArchive.disabled = false
    if (editorManualRecoveryStatus)
      editorManualRecoveryStatus.textContent =
        "恢复包已导出。确认文件已保存后，可再次点击归档并清除旧记录。"
  })

  editorRecoveryArchive?.addEventListener("click", async () => {
    const recoveryPackage = editorManualRecoveryPackage
    if (
      !editorManualRecoveryExported ||
      !recoveryPackage ||
      !legacyEditorRepository ||
      !currentUser ||
      currentUser.id !== recoveryPackage.ownerId
    )
      return
    if (
      !window.confirm(
        "请确认恢复包 JSON 已安全保存。继续后会先在本浏览器归档，再清除这些旧版记录；此操作不会自动写入云端。确定继续吗？",
      )
    )
      return
    editorRecoveryArchive.disabled = true
    try {
      const archiveRaw = JSON.stringify({
        format: "wouldkeep-legacy-editor-recovery-v1",
        ...recoveryPackage,
        archivedAt: new Date().toISOString(),
      })
      const archiveKey = `wouldkeep:editor-legacy-archive:${recoveryPackage.ownerId}:${Date.now()}`
      if (!setStorageItemSafely(localStorage, archiveKey, archiveRaw)) {
        throw new Error("legacy-recovery-archive-write-failed")
      }
      for (const row of recoveryPackage.legacyRows) {
        const operationId =
          row && typeof row === "object" && !Array.isArray(row)
            ? (row as { operationId?: unknown }).operationId
            : null
        if (typeof operationId !== "string" || !operationId) {
          throw new Error("legacy-recovery-row-key-unavailable")
        }
        await legacyEditorRepository.delete(operationId)
      }
      if (recoveryPackage.genericBackupKey && recoveryPackage.genericBackup !== null) {
        const removed = removeStorageItemIfUnchanged(
          localStorage,
          recoveryPackage.genericBackupKey,
          recoveryPackage.genericBackup,
        )
        if (!removed) throw new Error("legacy-recovery-backup-changed")
      }
      const after = await inspectLegacyEditorPersistence({
        ownerId: recoveryPackage.ownerId,
        legacyRepository: legacyEditorRepository,
        storage: localStorage,
      })
      if (after.blocked) throw new Error("legacy-recovery-clear-not-verified")
      editorManualRecoveryBlocked = false
      editorManualRecoveryExported = false
      editorManualRecoveryPackage = null
      editorSaveController?.setManualRecoveryBlocked(false)
      if (form) form.inert = false
      hideEditorLoadRecovery()
      setStatus("旧版恢复记录已归档并经复查清除；现在可以继续使用原子保存。", "success")
    } catch {
      editorManualRecoveryBlocked = true
      editorSaveController?.setManualRecoveryBlocked(true)
      showEditorManualRecoveryGate("归档或清除未能完整验证；保存仍保持关闭，原记录不会被自动重放。")
      if (editorManualRecoveryStatus)
        editorManualRecoveryStatus.textContent =
          "未能确认全部旧记录均已安全清除；请重新导出并重试，保存仍处于阻断状态。"
    }
  })

  const sync = async () => {
    if (disposed) return
    const syncRequest = authSyncRequests.begin()
    const isCurrentSync = () => !disposed && authSyncRequests.isCurrent(syncRequest)
    const previousOwnerId = currentUser?.id ? String(currentUser.id) : ""
    try {
      let resolvedUser: any = null
      try {
        resolvedUser = client ? ((await client.auth.getUser()).data?.user ?? null) : null
      } catch {
        if (!isCurrentSync()) return
        if (currentUser) {
          currentUser = null
          authEpoch += 1
          clearSensitiveEditorState()
          resetSiteOperations()
          editorCoordinator?.close()
          editorCoordinator = null
        }
        setStatus("登录状态暂时无法确认；输入入口和内容都已保留，请检查网络后重试。", "error")
        return
      }
      if (!isCurrentSync()) return
      currentUser = resolvedUser
      const nextOwnerId = currentUser?.id ? String(currentUser.id) : ""
      const preserveWriteSurface =
        workspaceSection === "write" && Boolean(nextOwnerId) && nextOwnerId === previousOwnerId
      if (nextOwnerId !== previousOwnerId) {
        authEpoch += 1
        clearSensitiveEditorState()
        resetSiteOperations()
      }
      if (currentUser) {
        await prepareEditorPersistence(String(currentUser.id))
        if (!isCurrentSync()) return
      } else {
        editorCoordinator?.close()
        editorCoordinator = null
      }
      if (session) session.hidden = !currentUser || (accountMode !== "signin" && !workspace)
      if (login) login.hidden = Boolean(currentUser)
      if (email) email.textContent = currentUser?.email ?? ""
      if (workspace) {
        if (authPanel) authPanel.hidden = Boolean(currentUser)
        if (workspaceOverview) workspaceOverview.hidden = !currentUser
        if (library) library.hidden = !currentUser
        if (writeLauncher && !preserveWriteSurface) writeLauncher.hidden = !currentUser
        if (profileSettings) profileSettings.hidden = !currentUser
        if (aiSettings) aiSettings.hidden = !currentUser
        if (siteOperations) siteOperations.hidden = !currentUser
        if (!currentUser) resetSiteOperations()
        if (!preserveWriteSurface) {
          if (editor) editor.hidden = true
          if (flatWorkbench) flatWorkbench.hidden = true
        }
        if (currentUser) {
          try {
            await loadCapabilities(isCurrentSync)
            if (!isCurrentSync()) return
            if (workspaceSection === "site") {
              await loadSiteOperations(isCurrentSync)
              if (!isCurrentSync()) return
              return
            }
            const knowledgeBaseId = await ensureKnowledgeBase(isCurrentSync)
            if (!isCurrentSync()) return
            if (!knowledgeBaseId) setStatus("个人知识库暂时无法准备，请稍后刷新重试。", "error")
            await loadDocuments(isCurrentSync)
            if (!isCurrentSync()) return
            void flushDurableOutboxForCurrentDocument()
            if (knowledgeBaseId) await loadLinkOptions("", knowledgeBaseId, isCurrentSync)
            if (!isCurrentSync()) return
            await loadTagOptions(isCurrentSync)
            if (!isCurrentSync()) return
            if (workspaceSection === "write") {
              await loadAiSuggestionPreferences(isCurrentSync)
              if (!isCurrentSync()) return
            }
            if (workspaceSection === "settings") {
              await loadProfileSettings(isCurrentSync)
              if (!isCurrentSync()) return
            }
            if (workspaceSection === "ai-settings") {
              await loadAiSettings(isCurrentSync)
              if (!isCurrentSync()) return
            }
          } catch {
            if (isCurrentSync()) {
              if (workspaceSection === "site") renderSiteAccess(null, "verification")
              setStatus("登录已确认，但工作区数据暂时无法加载；请检查网络后刷新重试。", "error")
            }
          }
        }
      }
    } finally {
      if (isCurrentSync()) resolveAuthState()
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
      if (!workspace) return
      if (event === "SIGNED_OUT") {
        authEpoch += 1
        currentUser = null
        clearSensitiveEditorState()
        resetSiteOperations()
        editorCoordinator?.close()
        editorCoordinator = null
        void sync()
      } else if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        void sync().then(() => resumeWorkspaceRouteAfterAuth?.())
      }
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

  const startNewDocument = (
    showEditor = true,
    preferRecovery = true,
    preferredDraftId?: string,
    routeMode?: EditorDraftMode,
  ) => {
    if (editorManualRecoveryBlocked) {
      showEditorManualRecoveryGate(
        "请先导出并明确归档旧版恢复记录；处理完成前不能开始新的云端保存。",
      )
      return ""
    }
    const previousScope = currentEditorScopeId()
    const previousData = readForm()
    if (
      previousScope.startsWith("draft:") &&
      (previousData.title.trim() || previousData.body.trim())
    ) {
      const ownerId = currentUser?.id ? String(currentUser.id) : "anonymous"
      const previousRaw = writeLocalBackup()
      if (!previousRaw) {
        setStatus("当前草稿无法可靠备份；已取消新建操作。", "error")
        return ""
      }
      if (!preferRecovery) {
        try {
          const archiveKey = `wouldkeep:editor-draft-archive:${ownerId}:${previousScope}:${Date.now()}`
          if (!setStorageItemSafely(localStorage, archiveKey, previousRaw)) {
            throw new Error("draft-archive-write-failed")
          }
          if (
            !removeStorageItemIfUnchanged(
              localStorage,
              localDraftKey(ownerId, previousScope),
              previousRaw,
            )
          ) {
            throw new Error("draft-archive-source-changed")
          }
          editorTabDrafts.clearDocument(previousScope)
        } catch {
          setStatus("无法先归档当前草稿；已取消新建操作。", "error")
          return ""
        }
      }
    }
    if (autosaveTimer) window.clearTimeout(autosaveTimer)
    invalidateEditorSaves()
    discardAiSuggestion("")
    openDocumentRequests.invalidate()
    hideEditorLoadRecovery()
    clearEditorConflict()
    const documentScopeId = bindFreshEditorDraftScope(
      preferredDraftId,
      previousScope && !preferredDraftId ? "push" : "replace",
      routeMode,
    )
    if (form) {
      form.inert = false
      form.setAttribute("aria-busy", "false")
    }
    form?.reset()
    editorKnowledgeBaseBinding = null
    clearRelationDocumentOptions()
    clearRetainedUnavailableRelationTargets()
    const documentId = form?.elements.namedItem("documentId") as HTMLInputElement | null
    if (documentId) documentId.value = ""
    const revision = form?.elements.namedItem("revision") as HTMLInputElement | null
    if (revision) revision.value = "0"
    const statusField = form?.elements.namedItem("status") as HTMLInputElement | null
    if (statusField) statusField.value = "draft"
    syncOrganizationEditorsFromFields()
    updatePublicationUI(null)
    renderSources()
    if (writeLauncher && showEditor) writeLauncher.hidden = true
    if (flatWorkbench && showEditor) flatWorkbench.hidden = true
    if (editor) editor.hidden = !showEditor
    if (history) history.hidden = true
    allowEditorSaves(documentScopeId)
    if (preferRecovery && restoreLocalBackup(documentScopeId)) {
      if (state) state.textContent = "已恢复这条尚未保存的新知识草稿"
    } else if (state) {
      state.textContent = "新建云端草稿"
    }
    refreshAiSelectionStatus()
    void prepareNewDocumentRelationOptions()
    if (showEditor) editor?.scrollIntoView({ behavior: "smooth", block: "start" })
    return documentScopeId
  }

  const openStableDraftScope = async (
    draftId: string,
    requestedMode: EditorDraftMode = "detailed",
  ) => {
    if (!currentUser || !form || !client) return false
    const ownerId = String(currentUser.id)
    const routeClient = client
    const routeAuthEpoch = authEpoch
    const documentScopeId = editorDraftScope(draftId)
    const authIsCurrent = () =>
      !disposed &&
      currentUser?.id === ownerId &&
      client === routeClient &&
      authEpoch === routeAuthEpoch
    const draftRouteIsCurrent = () => {
      if (!authIsCurrent()) return false
      const params = new URLSearchParams(location.search)
      return parseEditorDraftId(params.get("draft")) === draftId
    }
    try {
      let bindingReadTimeout: number | undefined
      const bindingRead = replaySafeEditorRepository?.getScopeBinding(ownerId, documentScopeId)
      const binding = await Promise.race([
        bindingRead ?? Promise.resolve(null),
        new Promise<never>((_, reject) => {
          bindingReadTimeout = window.setTimeout(
            () => reject(new Error("draft-binding-read-timeout")),
            4_000,
          )
        }),
      ]).finally(() => {
        if (bindingReadTimeout !== undefined) window.clearTimeout(bindingReadTimeout)
      })
      if (!draftRouteIsCurrent()) return false
      if (binding) {
        if (!draftRouteIsCurrent()) return false
        const draftKey = localDraftKey(ownerId, documentScopeId)
        const documentKey = localDraftKey(ownerId, binding.documentId)
        if (!draftRouteIsCurrent()) return false
        const draftRaw = localStorage.getItem(draftKey)
        if (draftRaw) {
          const draftInspection = inspectEditorBackup(
            draftRaw,
            ownerId,
            documentScopeId,
            binding.baseRevision,
          )
          if (draftInspection.state === "invalid") {
            showEditorLoadRecovery(
              documentScopeId,
              "已找到草稿绑定，但原草稿备份无法安全解析；没有删除任何数据。",
            )
            return false
          }
          if (draftInspection.state === "conflict") {
            showEditorLoadRecovery(
              documentScopeId,
              "原草稿备份的版本或作用域无法与持久绑定核对；已保留原始数据，请先导出恢复稿再处理。",
            )
            return false
          }
          if (!draftRouteIsCurrent()) return false
          let documentRaw = localStorage.getItem(documentKey)
          let documentInspection = documentRaw
            ? inspectEditorBackup(documentRaw, ownerId, binding.documentId, binding.baseRevision)
            : null
          if (documentInspection?.state === "conflict") {
            showEditorLoadRecovery(
              documentScopeId,
              "目标文档备份的版本或作用域无法与持久绑定核对；两份备份均已保留，未执行迁移。",
            )
            return false
          }
          if (documentRaw && documentInspection?.state === "invalid") {
            const quarantineKey = `wouldkeep:editor-recovery-quarantine:${ownerId}:${binding.documentId}:${Date.now()}`
            if (
              !draftRouteIsCurrent() ||
              !setStorageItemSafely(localStorage, quarantineKey, documentRaw)
            ) {
              showEditorLoadRecovery(
                documentScopeId,
                "目标文档存在无法解析的备份，且未能安全隔离；两份原始数据均未覆盖。",
              )
              return false
            }
            if (
              !draftRouteIsCurrent() ||
              !removeStorageItemIfUnchanged(localStorage, documentKey, documentRaw)
            ) {
              showEditorLoadRecovery(
                documentScopeId,
                "目标文档备份在隔离期间发生变化；隔离副本与原始数据均保留，未执行迁移。",
              )
              return false
            }
            editorTabDrafts.forgetBackup(binding.documentId, documentRaw)
            documentRaw = null
            documentInspection = null
          }
          const draftSavedAt = Number(draftInspection.backup.__editorRecovery?.savedAt ?? 0)
          const documentSavedAt =
            documentInspection?.state === "restore"
              ? Number(documentInspection.backup.__editorRecovery?.savedAt ?? 0)
              : -1
          if (draftSavedAt >= documentSavedAt) {
            const migrated = addEditorBackupMetadata(
              {
                ...draftInspection.backup,
                documentId: binding.documentId,
                revision: binding.baseRevision,
              },
              ownerId,
              binding.documentId,
              binding.baseRevision,
            )
            const migratedRaw = JSON.stringify(migrated)
            if (!draftRouteIsCurrent()) return false
            if (!setStorageItemSafely(localStorage, documentKey, migratedRaw)) {
              showEditorLoadRecovery(
                documentScopeId,
                "云端绑定已找到，但浏览器备份迁移失败；仍保留原 draft 地址与备份。",
              )
              return false
            }
          }
          if (!draftRouteIsCurrent()) return false
          if (!removeStorageItemIfUnchanged(localStorage, draftKey, draftRaw)) {
            showEditorLoadRecovery(
              documentScopeId,
              "草稿备份在迁移期间发生变化；仍保留原数据，请刷新后重试。",
            )
            return false
          }
        }
        if (!draftRouteIsCurrent()) return false
        window.history.replaceState(
          window.history.state,
          "",
          bindDocumentEditorRoute(window.location.href, binding.documentId),
        )
        if (
          !authIsCurrent() ||
          new URLSearchParams(location.search).get("document") !== binding.documentId
        )
          return false
        return openDocument(binding.documentId)
      }
    } catch {
      if (!draftRouteIsCurrent()) return false
      const activeScope = startNewDocument(true, true, draftId, requestedMode)
      if (!activeScope || !authIsCurrent() || currentEditorScopeId() !== activeScope) return false
      if (requestedMode === "free") restoreFlatWorkbenchFromDetailed()
      invalidateEditorSaves()
      showEditorLoadRecovery(
        documentScopeId,
        "草稿持久绑定暂时无法核对；浏览器恢复内容仍可编辑，但云端保存保持暂停。",
      )
      if (state) state.textContent = "浏览器恢复可用，云端保存已暂停"
      if (requestedMode === "free")
        setFlatStatus(
          "已留在原自由工作台并尝试恢复浏览器副本；云端绑定暂时无法核对，保存到云端已暂停。",
          "error",
        )
      return true
    }

    const activeScope = startNewDocument(true, true, draftId, requestedMode)
    if (!activeScope || !authIsCurrent() || currentEditorScopeId() !== activeScope) return false
    await restoreDurableOutboxBackup(activeScope)
    if (!authIsCurrent() || currentEditorScopeId() !== activeScope) return false
    restoreLocalBackup(activeScope)
    if (!authIsCurrent() || currentEditorScopeId() !== activeScope) return false
    const atomicConflictState = await restoreAtomicConflictForScope(
      activeScope,
      () => authIsCurrent() && currentEditorScopeId() === activeScope,
    )
    if (!authIsCurrent() || currentEditorScopeId() !== activeScope) return false
    if (atomicConflictState === "blocked") return false
    if (atomicConflictState === "none") void flushDurableOutboxForCurrentDocument()
    if (requestedMode === "free") restoreFlatWorkbenchFromDetailed()
    return true
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
    startNewDocument(true, false)
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
  const mirrorFlatToDetailed = (trimValues: boolean) => {
    if (!form || !flatTitle || !flatBody) return
    const title = form.elements.namedItem("title") as HTMLInputElement | null
    const body = form.elements.namedItem("body") as HTMLTextAreaElement | null
    const privateVisibility = form.querySelector<HTMLInputElement>(
      "[name=visibility][value=private]",
    )
    if (title) title.value = trimValues ? flatTitle.value.trim() : flatTitle.value
    if (body) body.value = trimValues ? flatBody.value.trim() : flatBody.value
    if (privateVisibility) privateVisibility.checked = true
  }
  const syncFlatToDetailed = () => {
    mirrorFlatToDetailed(true)
    form?.dispatchEvent(new Event("input", { bubbles: true }))
  }
  const persistFlatDraft = (): "browser" | "tab" | null => {
    const documentScopeId = currentEditorScopeId()
    const ownerId = currentUser?.id ? String(currentUser.id) : ""
    if (!ownerId || !documentScopeId.startsWith(EDITOR_DRAFT_SCOPE_PREFIX)) {
      setFlatStatus("草稿恢复编号尚未准备好；请先复制当前内容，页面没有把它标记为已保存。", "error")
      return null
    }
    mirrorFlatToDetailed(false)
    editorChangeGeneration += 1
    editorTabDrafts.markDirty(documentScopeId, editorChangeGeneration)
    const localPersisted = Boolean(writeLocalBackup())
    const session = availableSessionStorage()
    const sessionPersisted = session
      ? writeFlatDraftSessionRecovery(session, {
          ownerId,
          documentScopeId,
          title: flatTitle?.value ?? "",
          body: flatBody?.value ?? "",
        })
      : false
    if (!localPersisted && !sessionPersisted) {
      setFlatStatus("浏览器无法建立恢复副本；内容仍在当前页面，请复制备份后再继续。", "error")
      return null
    }
    return localPersisted ? "browser" : "tab"
  }
  function restoreFlatWorkbenchFromDetailed() {
    if (!flatForm || !flatTitle || !flatBody) return false
    const documentScopeId = currentEditorScopeId()
    const ownerId = currentUser?.id ? String(currentUser.id) : ""
    const session = availableSessionStorage()
    const sessionRecovery =
      session && ownerId && documentScopeId.startsWith(EDITOR_DRAFT_SCOPE_PREFIX)
        ? readFlatDraftSessionRecovery(session, ownerId, documentScopeId)
        : null
    let localSavedAt = -1
    if (sessionRecovery) {
      try {
        const raw = localStorage.getItem(localDraftKey(ownerId, documentScopeId))
        if (raw) {
          const inspection = inspectEditorBackup(raw, ownerId, documentScopeId)
          if (inspection.state === "restore")
            localSavedAt = Number(inspection.backup.__editorRecovery?.savedAt ?? -1)
        }
      } catch {
        localSavedAt = -1
      }
    }
    const existing = readForm()
    if (
      sessionRecovery &&
      ((!existing.title.trim() && !existing.body.trim()) || sessionRecovery.savedAt >= localSavedAt)
    ) {
      const title = form?.elements.namedItem("title") as HTMLInputElement | null
      const body = form?.elements.namedItem("body") as HTMLTextAreaElement | null
      const privateVisibility = form?.querySelector<HTMLInputElement>(
        "[name=visibility][value=private]",
      )
      if (title) title.value = sessionRecovery.title
      if (body) body.value = sessionRecovery.body
      if (privateVisibility) privateVisibility.checked = true
    }
    const data = readForm()
    flatTitle.value = data.title
    flatBody.value = data.body
    flatDirty = Boolean(data.title.trim() || data.body.trim())
    if (writeLauncher) writeLauncher.hidden = true
    if (editor) editor.hidden = true
    if (flatWorkbench) flatWorkbench.hidden = false
    setFlatStatus(
      flatDirty
        ? "已恢复浏览器中的私密草稿；尚未确认保存到云端。"
        : "当前草稿还没有可恢复内容；输入后会立即保存在当前浏览器中。",
    )
    return true
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
    const params = new URLSearchParams(location.search)
    const routeDraftId = parseEditorDraftId(params.get("draft"))
    const currentScope = currentEditorScopeId()
    if (
      routeDraftId &&
      params.get("mode") === "free" &&
      currentScope === editorDraftScope(routeDraftId)
    ) {
      restoreFlatWorkbenchFromDetailed()
      flatWorkbench?.scrollIntoView({ behavior: "smooth", block: "start" })
      window.setTimeout(() => flatBody?.focus(), 0)
      return
    }
    if (
      editor &&
      !editor.hidden &&
      (existing.title.trim() || existing.body.trim()) &&
      !window.confirm("自由工作台会开始一条新的知识。确定离开当前详细编辑内容吗？")
    )
      return
    const activeScope = startNewDocument(false, true, undefined, "free")
    if (!activeScope) return
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
    const persistence = persistFlatDraft()
    if (persistence)
      setFlatStatus(
        persistence === "browser"
          ? "已保存在当前浏览器；点击保存后才会确认同步到云端。"
          : "已保存在当前标签页的备用副本；请勿关闭此标签页，点击保存后才会同步到云端。",
      )
  })
  const persistFlatDraftBeforePageExit = () => {
    if (flatDirty) persistFlatDraft()
  }
  window.addEventListener("pagehide", persistFlatDraftBeforePageExit)
  window.addCleanup(() => window.removeEventListener("pagehide", persistFlatDraftBeforePageExit))
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
    const recoveryScope = currentEditorScopeId()
    if (!recoveryScope || !editorSaveIsAllowed(recoveryScope)) {
      persistFlatDraft()
      setFlatStatus(
        "内容仍保存在浏览器恢复副本中，但云端绑定尚未核对完成；本次云端保存已取消，请稍后刷新重试。",
        "error",
      )
      return
    }
    syncFlatToDetailed()
    if (autosaveTimer) window.clearTimeout(autosaveTimer)
    if (flatSave) {
      flatSave.disabled = true
      flatSave.textContent = "正在保存…"
    }
    setFlatStatus("正在保存到你的私密知识库…")
    const saved = await requestDocumentSave({ explicit: true })
    if (flatSave) {
      flatSave.disabled = false
      flatSave.textContent = "保存为私密草稿"
    }
    if (saved) {
      flatDirty = false
      const session = availableSessionStorage()
      if (session) removeFlatDraftSessionRecovery(session, String(currentUser.id), recoveryScope)
      setFlatStatus("私密草稿已由云端确认。你可以继续修改，或进入详细整理。", "success")
    } else
      setFlatStatus(
        "云端尚未确认保存；内容已保留在当前浏览器的恢复副本中，请检查网络后重试。",
        "error",
      )
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
    if (persistFlatDraft()) setFlatStatus("已清空，并更新了当前浏览器中的恢复副本。")
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
    const addCurrentTag = () => {
      const candidate = tagInput?.value ?? ""
      const parsed = parseWorkspaceTags([candidate])
      if (!parsed.ok || !parsed.value.length) {
        if (tagStatus)
          tagStatus.textContent = organizationIssueMessage(
            parsed.ok ? "tag_blank" : parsed.issues[0]?.code,
          )
        tagInput?.focus()
        return
      }
      const tag = parsed.value[0]
      if (selectedTags.some((selected) => selected.normalizedKey === tag.normalizedKey)) {
        if (tagStatus) tagStatus.textContent = `“${tag.name}”已在当前知识中。`
        tagInput?.select()
        return
      }
      renderTagSelections([...selectedTags, tag], true)
      if (tagInput) tagInput.value = ""
      if (tagStatus) tagStatus.textContent = `已添加标签“${tag.name}”。`
      tagInput?.focus()
    }
    root
      .querySelector<HTMLButtonElement>("[data-tag-add]")
      ?.addEventListener("click", addCurrentTag)
    tagInput?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return
      event.preventDefault()
      addCurrentTag()
    })
    relationEditors.forEach((editor) => {
      const relationType = relationTypeForEditor(editor)
      const search = editor.querySelector<HTMLInputElement>("[data-relation-search]")
      const select = editor.querySelector<HTMLSelectElement>("[data-relation-select]")
      const status = editor.querySelector<HTMLElement>("[data-relation-status]")
      search?.addEventListener("input", () => renderRelationOptions(editor))
      editor
        .querySelector<HTMLButtonElement>("[data-relation-add]")
        ?.addEventListener("click", () => {
          const targetId = select?.value ?? ""
          if (!targetId) {
            if (status) status.textContent = "请先从列表中选择一条知识。"
            select?.focus()
            return
          }
          const parsed = parseWorkspaceRelations(
            [...selectedRelations[relationType].map((item) => item.documentId), targetId],
            {
              currentDocumentId: readForm().documentId,
              documents: relationDocumentsForParsing(relationType),
            },
          )
          if (!parsed.ok) {
            if (status) status.textContent = organizationIssueMessage(parsed.issues[0]?.code)
            select?.focus()
            return
          }
          renderRelationSelections(relationType, parsed.value, true)
          const target = parsed.value.find((item) => item.documentId === targetId)
          if (status)
            status.textContent = target
              ? relationType === "prerequisite"
                ? `阅读当前知识前，建议先读《${target.title}》。`
                : `《${target.title}》已添加为相关知识。`
              : "关系已添加。"
          if (search) search.value = ""
          renderRelationOptions(editor)
          search?.focus()
        })
    })
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
    const aiBody = editorBodyField()
    for (const eventName of ["select", "mouseup", "keyup"] as const) {
      aiBody?.addEventListener(eventName, () => refreshAiSelectionStatus())
    }
    aiSuggestionAction?.addEventListener("change", () => {
      discardAiSuggestion("")
      refreshAiSelectionStatus()
    })
    aiSuggestionGenerate?.addEventListener("click", () => void generateAiSuggestion())
    aiSuggestionRegenerate?.addEventListener("click", () => {
      if (activeAiSelection) void generateAiSuggestion(activeAiSelection)
      else refreshAiSelectionStatus()
    })
    aiSuggestionDiscard?.addEventListener("click", () => {
      discardAiSuggestion()
      refreshAiSelectionStatus(true)
    })
    aiSuggestionReplace?.addEventListener("click", () => void applyActiveAiSuggestion("replace"))
    aiSuggestionInsert?.addEventListener("click", () => void applyActiveAiSuggestion("insert"))
    form.addEventListener("input", (event) => {
      const target = event.target as HTMLElement | null
      if (target?.matches("[data-tag-input],[data-relation-search]")) return
      if (target === aiBody || target?.matches("[name=visibility]")) refreshAiSelectionStatus()
      editorChangeGeneration += 1
      const documentIdentity = currentEditorScopeId()
      if (!documentIdentity) return
      editorTabDrafts.markDirty(documentIdentity, editorChangeGeneration)
      if (editorConflict?.documentId === documentIdentity) {
        if (state) state.textContent = "版本冲突待处理，自动同步保持暂停"
        return
      }
      if (!editorSaveIsAllowed(documentIdentity)) {
        if (state) state.textContent = "文档尚未完整加载，自动同步保持暂停"
        return
      }
      writeLocalBackup()
      if (editorManualSaveIsRequired(documentIdentity)) {
        if (state) state.textContent = "恢复稿已在浏览器中更新；请明确点击保存后再同步"
        return
      }
      if (state) state.textContent = currentUser && client ? "即将自动保存" : "有未保存改动"
      queueAutosave()
    })
    form.addEventListener("submit", async (event) => {
      event.preventDefault()
      if (autosaveTimer) window.clearTimeout(autosaveTimer)
      const documentIdentity = currentEditorScopeId()
      if (!documentIdentity) {
        setStatus("新草稿编号尚未准备好；本次保存已取消。", "error")
        return
      }
      if (editorConflict?.documentId === documentIdentity) {
        if (state) state.textContent = "版本冲突待处理，自动同步保持暂停"
        setStatus("请先处理版本冲突；在你选择前，本地稿和云端稿都会保留。", "error")
        conflictHeading?.focus()
        conflictSection?.scrollIntoView({ behavior: "smooth", block: "nearest" })
        return
      }
      if (!editorSaveIsAllowed(documentIdentity)) {
        setStatus("文档尚未完整载入；本次保存已取消，以免覆盖关联数据。", "error")
        return
      }
      writeLocalBackup()
      if (!currentUser || !client) {
        setStatus("请先登录，草稿已暂存于当前浏览器。")
        return
      }
      if (state) state.textContent = "正在保存到云端…"
      if (await requestDocumentSave({ explicit: true })) {
        if (state) state.textContent = "云端草稿已保存"
      }
    })
    root.querySelector("[data-editor-clear]")?.addEventListener("click", () => {
      if (editorConflict) {
        setStatus("请先使用版本恢复区处理当前冲突，再清空或新建内容。", "error")
        conflictHeading?.focus()
        conflictSection?.scrollIntoView({ behavior: "smooth", block: "nearest" })
        return
      }
      const data = readForm()
      if (
        (data.title || data.body) &&
        !window.confirm("确定清空当前内容吗？已经保存的历史版本不会被删除。")
      )
        return
      const ownerId = currentUser?.id ? String(currentUser.id) : "anonymous"
      const activeDocumentId = currentEditorScopeId()
      if (!activeDocumentId) return
      const activeKey = localDraftKey(ownerId, activeDocumentId)
      const activeBackup = localStorage.getItem(activeKey)
      if (activeBackup) {
        try {
          localStorage.setItem(
            `wouldkeep:editor-draft-archive:${ownerId}:${activeDocumentId}:${Date.now()}`,
            activeBackup,
          )
          localStorage.removeItem(activeKey)
          editorTabDrafts.clearDocument(activeDocumentId)
        } catch {
          setStatus("浏览器空间不足，无法安全归档当前草稿；已取消清空操作。", "error")
          return
        }
      }
      if (autosaveTimer) window.clearTimeout(autosaveTimer)
      invalidateEditorSaves()
      discardAiSuggestion("")
      editorTabDrafts.clearDocument(activeDocumentId)
      form.reset()
      editorKnowledgeBaseBinding = null
      clearRelationDocumentOptions()
      clearRetainedUnavailableRelationTargets()
      const documentId = form.elements.namedItem("documentId") as HTMLInputElement | null
      if (documentId) documentId.value = ""
      const revision = form.elements.namedItem("revision") as HTMLInputElement | null
      if (revision) revision.value = "0"
      const statusField = form.elements.namedItem("status") as HTMLInputElement | null
      if (statusField) statusField.value = "draft"
      syncOrganizationEditorsFromFields()
      updatePublicationUI(null)
      renderSources()
      const nextScope = bindFreshEditorDraftScope()
      allowEditorSaves(nextScope)
      if (state) state.textContent = "尚未保存"
      refreshAiSelectionStatus()
      void prepareNewDocumentRelationOptions()
    })
  }

  let workspaceRouteResumeKey = ""
  let workspaceRouteResumePromise: Promise<boolean> | null = null
  const resumeWorkspaceWriteRoute = async () => {
    if (!workspace || workspaceSection !== "write" || !currentUser) return false
    const ownerId = String(currentUser.id)
    const routeKey = `${ownerId}:${authEpoch}:${location.pathname}${location.search}${location.hash}`
    if (workspaceRouteResumePromise && workspaceRouteResumeKey === routeKey)
      return workspaceRouteResumePromise
    workspaceRouteResumeKey = routeKey
    const resumePromise = (async () => {
      const params = new URLSearchParams(location.search)
      const routeDecision = resolveEditorRouteDecision({
        document: params.get("document"),
        draft: params.get("draft"),
        hasDraftParameter: params.has("draft"),
      })
      const requestedMode = params.get("mode")
      const requestedAction = params.get("action")
      if (routeDecision.kind === "document") {
        if (currentEditorScopeId() === routeDecision.documentId && editor && !editor.hidden)
          return true
        const canonicalDocumentRoute = bindDocumentEditorRoute(
          window.location.href,
          routeDecision.documentId,
        )
        if (canonicalDocumentRoute !== window.location.href) {
          window.history.replaceState(window.history.state, "", canonicalDocumentRoute)
        }
        return openDocument(routeDecision.documentId)
      } else if (routeDecision.kind === "draft") {
        const activeScope = editorDraftScope(routeDecision.draftId)
        if (currentEditorScopeId() === activeScope && editorSaveIsAllowed(activeScope)) {
          if (requestedMode === "free") restoreFlatWorkbenchFromDetailed()
          else {
            if (writeLauncher) writeLauncher.hidden = true
            if (flatWorkbench) flatWorkbench.hidden = true
            if (editor) editor.hidden = false
          }
          return true
        }
        return openStableDraftScope(
          routeDecision.draftId,
          requestedMode === "free" ? "free" : "detailed",
        )
      } else if (routeDecision.kind === "invalid-draft") {
        const activeScope = startNewDocument()
        setStatus(
          "原 draft 参数不是规范 UUID；已生成新的安全草稿编号，未读取或覆盖任何旧草稿。",
          "error",
        )
        return Boolean(activeScope)
      } else if (requestedMode === "free") {
        openFlatWorkbench()
        return Boolean(currentEditorScopeId())
      } else if (requestedMode === "detailed") {
        return Boolean(startNewDocument())
      } else if (requestedAction === "import") {
        openImportDialog()
        return true
      }
      return true
    })()
    workspaceRouteResumePromise = resumePromise
    try {
      return await resumePromise
    } finally {
      if (workspaceRouteResumePromise === resumePromise) workspaceRouteResumePromise = null
    }
  }
  resumeWorkspaceRouteAfterAuth = resumeWorkspaceWriteRoute
  void resumeWorkspaceWriteRoute()

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
    const pendingDocument = currentEditorScopeId()
    if (!pendingDocument) return
    if (editorManualSaveIsRequired(pendingDocument)) {
      if (state) state.textContent = "网络已恢复；恢复稿仍等待你明确点击保存"
      setStatus("网络已恢复，但恢复稿不会自动重放。检查内容后请明确点击保存。")
      return
    }
    if (editorConflict?.documentId === pendingDocument) {
      if (state) state.textContent = "版本冲突待处理，自动同步保持暂停"
      setStatus("网络已恢复，但检测到版本冲突。请先比较并选择要保留的版本。", "error")
      return
    }
    const ownerId = String(currentUser.id)
    const onlineClient = client
    const onlineAuthEpoch = authEpoch
    const onlineScopeIsCurrent = () =>
      !disposed &&
      currentUser?.id === ownerId &&
      client === onlineClient &&
      authEpoch === onlineAuthEpoch &&
      currentEditorScopeId() === pendingDocument
    let hasLocalBackup = false
    let hasDurablePending = false
    try {
      hasLocalBackup = Boolean(localStorage.getItem(localDraftKey(ownerId, pendingDocument)))
      const records = await editorOutbox?.listForOwner(ownerId)
      if (!records || !onlineScopeIsCurrent()) return
      hasDurablePending = records.some(
        (record) =>
          record.documentScopeId === pendingDocument &&
          (record.status === "queued" || record.status === "saving"),
      )
    } catch {
      if (!onlineScopeIsCurrent()) return
      setStatus("网络已恢复，但无法安全核对持久保存队列；没有发起新的写入，请稍后重试。", "error")
      return
    }
    if (!hasLocalBackup && !hasDurablePending) {
      setStatus("网络连接已恢复，没有待同步的本地改动。", "success")
      return
    }
    if (!hasDurablePending) {
      setStatus("网络已恢复；当前只有本地备份，请点击保存或继续编辑后再安全加入同步队列。")
      return
    }
    cancelEditorRetryTimer()
    setStatus("网络已恢复，正在同步本地备份…")
    if (await requestDocumentSave({ enqueue: false })) setStatus("本地备份已同步到云端。")
  }
  window.addEventListener("online", onlineHandler)
}

if (typeof document !== "undefined") document.addEventListener("nav", init)
if (typeof window !== "undefined") window.addEventListener("load", init, { once: true })
