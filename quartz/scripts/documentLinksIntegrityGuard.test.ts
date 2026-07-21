import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const migration = readFileSync(
  new URL("../../supabase/migrations/20260721000100_document_links_integrity.sql", import.meta.url),
  "utf8",
)

const behaviorVerification = readFileSync(
  new URL("../../supabase/tests/20260721_document_links_integrity.sql", import.meta.url),
  "utf8",
)

test("document-link migration fails closed on existing tenant or knowledge-base violations", () => {
  assert.match(migration, /source_document\.owner_id <> link\.owner_id/)
  assert.match(migration, /target_document\.owner_id <> link\.owner_id/)
  assert.match(
    migration,
    /source_document\.knowledge_base_id <> target_document\.knowledge_base_id/,
  )
  assert.match(migration, /RAISE EXCEPTION[\s\S]{0,220}ERRCODE = 'check_violation'/)
  assert.doesNotMatch(migration, /DELETE FROM public\.document_links/)
})

test("all document-link writers are constrained by a locked security-definer trigger", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.require_valid_document_link_endpoints\(\)[\s\S]*SECURITY DEFINER[\s\S]*SET search_path = pg_catalog, pg_temp/,
  )
  assert.match(migration, /ORDER BY document\.id\s+FOR SHARE/)
  assert.match(migration, /source_owner_id IS DISTINCT FROM NEW\.owner_id/)
  assert.match(migration, /target_owner_id IS DISTINCT FROM NEW\.owner_id/)
  assert.match(migration, /source_knowledge_base_id IS DISTINCT FROM target_knowledge_base_id/)
  assert.match(migration, /source_deleted_at IS NOT NULL/)
  assert.match(migration, /target_deleted_at IS NOT NULL/)
  assert.match(migration, /BEFORE INSERT OR UPDATE ON public\.document_links/)
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.require_valid_document_link_endpoints\(\)\s+FROM PUBLIC, anon, authenticated, service_role/,
  )
})

test("document-link RLS keeps owner tombstones removable and anonymous callers denied", () => {
  for (const command of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
    assert.match(
      migration,
      new RegExp(
        `CREATE POLICY "Owners can [^"]+ own document links"\\s+ON public\\.document_links FOR ${command}\\s+TO authenticated`,
      ),
    )
  }
  assert.match(migration, /REVOKE ALL ON TABLE public\.document_links FROM anon/)
  assert.match(
    behaviorVerification,
    /owner_can_read_soft_deleted_endpoint_tombstone[\s\S]*owner_can_delete_soft_deleted_endpoint_tombstone/,
  )
  assert.match(behaviorVerification, /owner_cannot_create_deleted_endpoint_link/)
  assert.match(behaviorVerification, /owner_cannot_update_deleted_endpoint_link/)
  assert.match(behaviorVerification, /service_role_cannot_bypass_endpoint_integrity/)
  assert.match(behaviorVerification, /anon_has_no_document_link_access/)
})

test("document-link migration leaves transaction ownership to the migration runner", () => {
  assert.doesNotMatch(migration, /^BEGIN;$/m)
  assert.doesNotMatch(migration, /^COMMIT;$/m)
})
