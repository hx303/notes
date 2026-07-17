import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260718001200_publication_write_acl_hardening.sql",
    import.meta.url,
  ),
  "utf8",
)

const writeRpcs = [
  "public.publish_document(UUID, TEXT)",
  "public.unpublish_document(UUID)",
  "public.moderate_publication(UUID, TEXT)",
]

test("all publication write RPCs explicitly deny anonymous execution", () => {
  for (const rpc of writeRpcs) {
    assert.match(
      migration,
      new RegExp(
        `REVOKE EXECUTE ON FUNCTION ${rpc.replace(/[().]/g, "\\$&")}\\s+FROM PUBLIC, anon;`,
      ),
    )
  }
})

test("signed-in and trusted-service callers remain explicit", () => {
  for (const rpc of writeRpcs) {
    assert.match(
      migration,
      new RegExp(
        `GRANT EXECUTE ON FUNCTION ${rpc.replace(/[().]/g, "\\$&")}\\s+TO authenticated, service_role;`,
      ),
    )
  }
})

test("the repair does not change anonymous reader RPCs or table privileges", () => {
  assert.doesNotMatch(migration, /read_published_document/)
  assert.doesNotMatch(migration, /list_public_documents/)
  assert.doesNotMatch(migration, /ON (?:TABLE|ALL FUNCTIONS)/)
  assert.doesNotMatch(migration, /ALTER DEFAULT PRIVILEGES/)
})

test("the repair contains no business-data or AI mutations", () => {
  assert.doesNotMatch(migration, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/)
  assert.doesNotMatch(migration, /ai_|deepseek|budget|secret/i)
})

test("transaction ownership remains with the Supabase migration runner", () => {
  assert.doesNotMatch(migration, /^BEGIN;$/m)
  assert.doesNotMatch(migration, /^COMMIT;$/m)
})
