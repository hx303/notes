import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260722000100_site_owner_role_invariant.sql",
    import.meta.url,
  ),
  "utf8",
)

test("site-owner role changes are rejected inside the hardened RPC", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.grant_role/)
  assert.match(migration, /admin_uid IS DISTINCT FROM caller/)
  assert.match(migration, /NOT public\.is_site_owner\(caller\)/)
  assert.match(
    migration,
    /IF public\.is_site_owner\(target_uid\) THEN[\s\S]*ERRCODE = '42501'[\s\S]*site owner role cannot be changed here/i,
  )
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.grant_role\(UUID, TEXT, TEXT\) FROM PUBLIC, anon/,
  )
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.grant_role\(UUID, TEXT, TEXT\) TO authenticated/,
  )
  assert.doesNotMatch(migration, /^\s*(?:BEGIN|COMMIT|ROLLBACK);\s*$/im)
})
