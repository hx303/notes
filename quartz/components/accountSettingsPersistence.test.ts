import assert from "node:assert/strict"
import test from "node:test"
import {
  clearAiSettingsDraft,
  clearProfileSettingsDraft,
  readAiSettingsDraft,
  readProfileSettingsDraft,
  writeAiSettingsDraft,
  writeProfileSettingsDraft,
} from "./scripts/accountSettingsPersistence"

const memoryStorage = () => {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
}

test("AI settings draft survives navigation and clears only after a confirmed save", () => {
  const storage = memoryStorage()
  assert.equal(
    writeAiSettingsDraft(
      storage,
      "owner-a",
      {
        enabled: true,
        allowPrivateContent: true,
        monthlyBudgetCents: 500,
        groundingMode: "knowledge_base",
      },
      42,
    ),
    true,
  )
  assert.deepEqual(readAiSettingsDraft(storage, "owner-a"), {
    version: 1,
    enabled: true,
    allowPrivateContent: true,
    monthlyBudgetCents: 500,
    groundingMode: "knowledge_base",
    savedAt: 42,
  })
  assert.equal(readAiSettingsDraft(storage, "owner-b"), null)
  clearAiSettingsDraft(storage, "owner-a")
  assert.equal(readAiSettingsDraft(storage, "owner-a"), null)
})

test("AI draft enforces consent invariants and rejects malformed paid settings", () => {
  const storage = memoryStorage()
  writeAiSettingsDraft(
    storage,
    "owner-a",
    {
      enabled: false,
      allowPrivateContent: true,
      monthlyBudgetCents: 0,
      groundingMode: "selected_only",
    },
    1,
  )
  assert.equal(readAiSettingsDraft(storage, "owner-a")?.allowPrivateContent, false)
  storage.setItem(
    "wouldkeep:ai-settings-draft:owner-a",
    JSON.stringify({
      version: 1,
      enabled: true,
      allowPrivateContent: false,
      monthlyBudgetCents: "500",
      groundingMode: "selected_only",
      savedAt: 1,
    }),
  )
  assert.equal(readAiSettingsDraft(storage, "owner-a"), null)
})

test("profile draft is scoped to the account and resilient to unavailable storage", () => {
  const storage = memoryStorage()
  writeProfileSettingsDraft(
    storage,
    "owner-a",
    {
      displayName: "维持者",
      signature: "把知识留下来",
      bio: "个人简介",
      location: "上海",
      website: "https://wouldkeep.com",
    },
    7,
  )
  assert.equal(readProfileSettingsDraft(storage, "owner-a")?.displayName, "维持者")
  assert.equal(readProfileSettingsDraft(storage, "owner-b"), null)
  clearProfileSettingsDraft(storage, "owner-a")
  assert.equal(readProfileSettingsDraft(storage, "owner-a"), null)

  const unavailable = {
    getItem: () => {
      throw new Error("blocked")
    },
    setItem: () => {
      throw new Error("blocked")
    },
    removeItem: () => {
      throw new Error("blocked")
    },
  }
  assert.equal(readProfileSettingsDraft(unavailable, "owner-a"), null)
  assert.equal(
    writeProfileSettingsDraft(unavailable, "owner-a", {
      displayName: "维持者",
      signature: "",
      bio: "",
      location: "",
      website: "",
    }),
    false,
  )
  assert.doesNotThrow(() => clearProfileSettingsDraft(unavailable, "owner-a"))
})
