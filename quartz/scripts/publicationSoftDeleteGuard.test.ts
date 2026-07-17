import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260718001100_publication_soft_delete_guard.sql",
    import.meta.url,
  ),
  "utf8",
)

test("soft delete atomically revokes snapshots and public document metadata", () => {
  assert.match(
    migration,
    /BEFORE UPDATE OF deleted_at[\s\S]*WHEN \(OLD\.deleted_at IS DISTINCT FROM NEW\.deleted_at\)/,
  )
  assert.match(
    migration,
    /DELETE FROM public\.document_publications publication[\s\S]*publication\.document_id = OLD\.id/,
  )
  assert.match(migration, /NEW\.status := 'archived'/)
  assert.match(migration, /NEW\.visibility := 'private'/)
  assert.match(migration, /NEW\.published_at := NULL/)
  assert.match(migration, /NEW\.published_revision := NULL/)
  assert.match(
    migration,
    /IF NEW\.deleted_at IS NOT NULL THEN[\s\S]*NEW\.status := 'archived'[\s\S]*ELSIF NEW\.status = 'published' THEN[\s\S]*NEW\.status := 'draft'/,
  )
})

test("legacy orphan cleanup and RLS both require a live source", () => {
  assert.match(
    migration,
    /WITH revoked_publications AS \([\s\S]*DELETE FROM public\.document_publications publication[\s\S]*document\.deleted_at IS NOT NULL[\s\S]*UPDATE public\.documents document/,
  )
  assert.equal(
    (migration.match(/CREATE POLICY "Owners can (?:read|create|update) own publications"/g) ?? [])
      .length,
    3,
  )
  assert.ok((migration.match(/document\.deleted_at IS NULL/g) ?? []).length >= 4)
  assert.match(
    migration,
    /BEFORE INSERT OR UPDATE ON public\.document_publications[\s\S]*require_live_source_for_document_publication/,
  )
  assert.match(
    migration,
    /TG_OP = 'INSERT'[\s\S]*document\.deleted_at IS NULL[\s\S]*FOR UPDATE[\s\S]*ELSE[\s\S]*non-locking liveness check/,
  )
  assert.match(
    migration,
    /TG_OP = 'UPDATE'[\s\S]*NEW\.document_id IS DISTINCT FROM OLD\.document_id[\s\S]*NEW\.owner_id IS DISTINCT FROM OLD\.owner_id/,
  )
})

test("both SECURITY DEFINER readers independently enforce source liveness", () => {
  assert.equal((migration.match(/JOIN public\.documents source_document/g) ?? []).length, 2)
  assert.equal((migration.match(/source_document\.deleted_at IS NULL/g) ?? []).length, 2)
  assert.ok((migration.match(/SECURITY DEFINER/g) ?? []).length >= 4)
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.revoke_publication_on_document_soft_delete\(\)[\s\S]*FROM PUBLIC, anon, authenticated/,
  )
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.read_published_document\(UUID, UUID\) TO anon, authenticated/,
  )
})

test("mixed publication RPCs use the document-first lock order", () => {
  assert.match(
    migration,
    /FUNCTION public\.unpublish_document[\s\S]*FROM public\.documents document[\s\S]*FOR UPDATE[\s\S]*DELETE FROM public\.document_publications/,
  )
  assert.match(
    migration,
    /FUNCTION public\.moderate_publication[\s\S]*FROM public\.documents document[\s\S]*FOR UPDATE[\s\S]*FROM public\.document_publications publication[\s\S]*FOR UPDATE/,
  )
})

test("the migration leaves transaction ownership to the Supabase migration runner", () => {
  assert.doesNotMatch(migration, /^BEGIN;$/m)
  assert.doesNotMatch(migration, /^COMMIT;$/m)
})
