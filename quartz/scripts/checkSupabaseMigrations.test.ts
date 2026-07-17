import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import {
  checkSupabaseMigrations,
  findHistoryMapIssues,
  findMigrationFilenameIssues,
} from "./check-supabase-migrations"

test("migration filenames require unique 14-digit versions", () => {
  assert.deepEqual(findMigrationFilenameIssues(["20260712090000_foundation.sql"]), [])
  assert.match(
    findMigrationFilenameIssues(["20260712_foundation.sql"])[0],
    /expected <14-digit UTC timestamp>/,
  )
  assert.deepEqual(findMigrationFilenameIssues(["20260712_legacy_history_marker.sql"]), [])
  assert.match(
    findMigrationFilenameIssues([
      "20260712000100_foundation.sql",
      "20260712_legacy_history_marker.sql",
    ]).join("\n"),
    /CLI filename order is not strictly increasing/,
  )
  assert.match(
    findMigrationFilenameIssues([
      "20260712090000_foundation.sql",
      "20260712090000_versions.sql",
    ])[0],
    /duplicate migration version/,
  )
})

test("history map pins renamed legacy SQL by version and hash", () => {
  const root = mkdtempSync(join(tmpdir(), "wouldkeep-migrations-"))
  const migrations = join(root, "migrations")
  mkdirSync(migrations)
  const mappedFiles = [
    ["20260712", "20260718000100", "foundation"],
    ["20260714", "20260718000200", "sources"],
    ["20260715", "20260718000300", "avatars"],
    ["20260716", "20260718000400", "ai_foundation"],
    ["20260717", "20260718000500", "ai_runtime"],
  ] as const
  for (const [, version, name] of mappedFiles) {
    writeFileSync(join(migrations, `${version}_${name}.sql`), "select 1;\n")
  }

  assert.deepEqual(
    findHistoryMapIssues(
      {
        schemaVersion: 1,
        remoteLedger: [
          {
            version: "20260712",
            name: "document_organization",
            statementCount: 16,
            statementsMd5: "0caa5b560df3fa7a3668331d12b31d09",
          },
          {
            version: "20260714",
            name: "document_sources",
            statementCount: 20,
            statementsMd5: "c90822da8a6b62cb2917942932720bb5",
          },
          {
            version: "20260715",
            name: "profile_avatars",
            statementCount: 9,
            statementsMd5: "66ee0e5a88692bc5b5a10aaec2599be8",
          },
          {
            version: "20260716",
            name: "ai_assistant_foundation",
            statementCount: 39,
            statementsMd5: "8832e5993fa2ba7b090bcfe7f607bc16",
          },
          {
            version: "20260717",
            name: "ai_runtime_safety",
            statementCount: 42,
            statementsMd5: "654c9001d56b3842471c5259a2be0190",
          },
        ],
        entries: mappedFiles.map(([legacyVersion, version, name]) => ({
          legacyVersion,
          version,
          file: `${version}_${name}.sql`,
          sha256: "4a45092ccf992ea92250053a80b931b787924ba61648f420555511b84f10ab6c",
        })),
      },
      migrations,
    ),
    [],
  )
})

test("history map requires the mapped legacy groups to match the pinned remote ledger", () => {
  const root = mkdtempSync(join(tmpdir(), "wouldkeep-migrations-"))
  const migrations = join(root, "migrations")
  mkdirSync(migrations)
  writeFileSync(join(migrations, "20260712090000_foundation.sql"), "select 1;\n")

  const issues = findHistoryMapIssues(
    {
      schemaVersion: 1,
      remoteLedger: [
        {
          version: "20260714",
          name: "document_sources",
          statementCount: 1,
          statementsMd5: "0123456789abcdef0123456789abcdef",
        },
      ],
      entries: [
        {
          legacyVersion: "20260712",
          version: "20260712090000",
          file: "20260712090000_foundation.sql",
          sha256: "4a45092ccf992ea92250053a80b931b787924ba61648f420555511b84f10ab6c",
        },
      ],
    },
    migrations,
  )

  assert.match(issues.join("\n"), /mapped legacy groups must equal the pinned remote ledger/)
  assert.match(issues.join("\n"), /differs from the verified production tuple baseline/)
})

test("history map rejects a well-formed but forged production tuple", () => {
  const root = mkdtempSync(join(tmpdir(), "wouldkeep-migrations-"))
  const migrations = join(root, "migrations")
  mkdirSync(migrations)
  writeFileSync(join(migrations, "20260712090000_foundation.sql"), "select 1;\n")

  const issues = findHistoryMapIssues(
    {
      schemaVersion: 1,
      remoteLedger: [
        {
          version: "20260712",
          name: "forged_valid_name",
          statementCount: 999,
          statementsMd5: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ],
      entries: [
        {
          legacyVersion: "20260712",
          version: "20260712090000",
          file: "20260712090000_foundation.sql",
          sha256: "4a45092ccf992ea92250053a80b931b787924ba61648f420555511b84f10ab6c",
        },
      ],
    },
    migrations,
  )

  assert.match(issues.join("\n"), /differs from the verified production tuple baseline/)
})

test("repository migration directory passes the normalization guard", () => {
  assert.deepEqual(
    checkSupabaseMigrations(fileURLToPath(new URL("../../supabase", import.meta.url))),
    [],
  )
})
