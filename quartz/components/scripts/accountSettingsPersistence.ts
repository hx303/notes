type SettingsStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">

export type AiGroundingMode = "selected_only" | "knowledge_base"

export type AiSettingsDraft = {
  version: 1
  enabled: boolean
  allowPrivateContent: boolean
  monthlyBudgetCents: 0 | 500 | 1000 | 2000
  groundingMode: AiGroundingMode
  savedAt: number
}

export type ProfileSettingsDraft = {
  version: 1
  displayName: string
  signature: string
  bio: string
  location: string
  website: string
  savedAt: number
}

const aiDraftKey = (userId: string) => `wouldkeep:ai-settings-draft:${userId}`
const profileDraftKey = (userId: string) => `wouldkeep:profile-settings-draft:${userId}`

const readJson = (storage: SettingsStorage, key: string): unknown => {
  try {
    const raw = storage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const writeJson = (storage: SettingsStorage, key: string, value: unknown) => {
  try {
    storage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

const remove = (storage: SettingsStorage, key: string) => {
  try {
    storage.removeItem(key)
  } catch {
    // Storage may be unavailable in hardened/private browser contexts.
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const validSavedAt = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0

const allowedBudgets = new Set([0, 500, 1000, 2000])

export const readAiSettingsDraft = (
  storage: SettingsStorage,
  userId: string,
): AiSettingsDraft | null => {
  const value = readJson(storage, aiDraftKey(userId))
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.enabled !== "boolean" ||
    typeof value.allowPrivateContent !== "boolean" ||
    typeof value.monthlyBudgetCents !== "number" ||
    !allowedBudgets.has(value.monthlyBudgetCents) ||
    !["selected_only", "knowledge_base"].includes(String(value.groundingMode)) ||
    !validSavedAt(value.savedAt)
  )
    return null

  const enabled = value.enabled
  return {
    version: 1,
    enabled,
    allowPrivateContent: enabled && value.allowPrivateContent,
    monthlyBudgetCents: value.monthlyBudgetCents as AiSettingsDraft["monthlyBudgetCents"],
    groundingMode: value.groundingMode as AiGroundingMode,
    savedAt: value.savedAt as number,
  }
}

export const writeAiSettingsDraft = (
  storage: SettingsStorage,
  userId: string,
  draft: Omit<AiSettingsDraft, "version" | "savedAt">,
  savedAt = Date.now(),
) =>
  writeJson(storage, aiDraftKey(userId), {
    ...draft,
    version: 1,
    allowPrivateContent: draft.enabled && draft.allowPrivateContent,
    savedAt,
  } satisfies AiSettingsDraft)

export const clearAiSettingsDraft = (storage: SettingsStorage, userId: string) =>
  remove(storage, aiDraftKey(userId))

const boundedString = (value: unknown, maximum: number) =>
  typeof value === "string" && value.length <= maximum ? value : null

export const readProfileSettingsDraft = (
  storage: SettingsStorage,
  userId: string,
): ProfileSettingsDraft | null => {
  const value = readJson(storage, profileDraftKey(userId))
  if (!isRecord(value) || value.version !== 1 || !validSavedAt(value.savedAt)) return null
  const displayName = boundedString(value.displayName, 40)
  const signature = boundedString(value.signature, 80)
  const bio = boundedString(value.bio, 300)
  const location = boundedString(value.location, 100)
  const website = boundedString(value.website, 4096)
  if ([displayName, signature, bio, location, website].some((item) => item === null)) return null
  return {
    version: 1,
    displayName: displayName!,
    signature: signature!,
    bio: bio!,
    location: location!,
    website: website!,
    savedAt: value.savedAt as number,
  }
}

export const writeProfileSettingsDraft = (
  storage: SettingsStorage,
  userId: string,
  draft: Omit<ProfileSettingsDraft, "version" | "savedAt">,
  savedAt = Date.now(),
) => writeJson(storage, profileDraftKey(userId), { ...draft, version: 1, savedAt })

export const clearProfileSettingsDraft = (storage: SettingsStorage, userId: string) =>
  remove(storage, profileDraftKey(userId))
