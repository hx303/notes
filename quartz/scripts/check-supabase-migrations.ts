import { createHash } from "node:crypto"
import { readFileSync, readdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

export interface MigrationHistoryEntry {
  legacyVersion: string
  version: string
  file: string
  sha256: string
}

export interface RemoteLedgerEntry {
  version: string
  name: string
  statementCount: number
  statementsMd5: string
}

export interface MigrationHistoryMap {
  schemaVersion: number
  remoteLedger: RemoteLedgerEntry[]
  entries: MigrationHistoryEntry[]
}

const expectedRemoteLedger: readonly RemoteLedgerEntry[] = [
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
]

const migrationPattern = /^(\d{14})_([a-z0-9][a-z0-9_]*)\.sql$/
const legacyMarkerPattern = /^(\d{8})_legacy_history_marker\.sql$/

export const findMigrationFilenameIssues = (fileNames: string[]): string[] => {
  const issues: string[] = []
  const versions = new Map<string, string[]>()

  for (const fileName of fileNames.filter((name) => name.endsWith(".sql")).sort()) {
    const match = migrationPattern.exec(fileName) ?? legacyMarkerPattern.exec(fileName)
    if (!match) {
      issues.push(
        `${fileName}: expected <14-digit UTC timestamp>_<lowercase_name>.sql or an approved 8-digit legacy history marker`,
      )
      continue
    }

    const version = match[1]
    const existing = versions.get(version) ?? []
    existing.push(fileName)
    versions.set(version, existing)
  }

  for (const [version, files] of versions) {
    if (files.length > 1) {
      issues.push(`${version}: duplicate migration version used by ${files.join(", ")}`)
    }
  }

  const orderedVersions = fileNames
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => (migrationPattern.exec(name) ?? legacyMarkerPattern.exec(name))?.[1])
    .filter((version): version is string => Boolean(version))
  for (let index = 1; index < orderedVersions.length; index += 1) {
    if (BigInt(orderedVersions[index]) <= BigInt(orderedVersions[index - 1])) {
      issues.push(
        `CLI filename order is not strictly increasing: ${orderedVersions[index - 1]} before ${orderedVersions[index]}`,
      )
    }
  }

  return issues
}

const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex")

export const findHistoryMapIssues = (
  map: MigrationHistoryMap,
  migrationDirectory: string,
): string[] => {
  const issues: string[] = []
  const mappedFiles = new Set<string>()
  const mappedVersions = new Set<string>()
  const remoteVersions = new Set<string>()

  if (map.schemaVersion !== 1) {
    issues.push(`migration-history-map.json: unsupported schemaVersion ${map.schemaVersion}`)
  }

  if (!Array.isArray(map.remoteLedger) || map.remoteLedger.length === 0) {
    issues.push("migration-history-map.json: remoteLedger must pin the production baseline")
  } else {
    for (const entry of map.remoteLedger) {
      if (!/^\d{8}$/.test(entry.version)) {
        issues.push(`${entry.version}: remote ledger version must contain exactly 8 digits`)
      }
      if (remoteVersions.has(entry.version)) {
        issues.push(`${entry.version}: remote ledger version is pinned more than once`)
      }
      remoteVersions.add(entry.version)
      if (!/^[a-z0-9][a-z0-9_]*$/.test(entry.name)) {
        issues.push(`${entry.version}: remote ledger name must use lowercase snake_case`)
      }
      if (!Number.isInteger(entry.statementCount) || entry.statementCount <= 0) {
        issues.push(`${entry.version}: remote ledger statementCount must be a positive integer`)
      }
      if (!/^[a-f0-9]{32}$/.test(entry.statementsMd5)) {
        issues.push(`${entry.version}: remote ledger statementsMd5 must be 32 lowercase hex digits`)
      }
    }

    const listedVersions = map.remoteLedger.map((entry) => entry.version)
    const sortedVersions = [...listedVersions].sort()
    if (listedVersions.some((version, index) => version !== sortedVersions[index])) {
      issues.push("migration-history-map.json: remoteLedger must be sorted by version")
    }
  }

  if (JSON.stringify(map.remoteLedger) !== JSON.stringify(expectedRemoteLedger)) {
    issues.push(
      "migration-history-map.json: remoteLedger differs from the verified production tuple baseline",
    )
  }

  for (const entry of map.entries) {
    if (!/^\d{8}$/.test(entry.legacyVersion)) {
      issues.push(`${entry.file}: legacyVersion must contain exactly 8 digits`)
    }
    if (mappedFiles.has(entry.file)) issues.push(`${entry.file}: mapped more than once`)
    if (mappedVersions.has(entry.version)) issues.push(`${entry.version}: mapped more than once`)
    mappedFiles.add(entry.file)
    mappedVersions.add(entry.version)

    const match = migrationPattern.exec(entry.file)
    if (!match || match[1] !== entry.version) {
      issues.push(`${entry.file}: filename and mapped version ${entry.version} disagree`)
      continue
    }

    const path = resolve(migrationDirectory, entry.file)
    try {
      const actualHash = sha256(path)
      if (actualHash !== entry.sha256) {
        issues.push(`${entry.file}: SQL hash changed (${actualHash}, expected ${entry.sha256})`)
      }
    } catch {
      issues.push(`${entry.file}: mapped SQL file is missing or unreadable`)
    }
  }

  const mappedLegacyVersions = [...new Set(map.entries.map((entry) => entry.legacyVersion))].sort()
  const pinnedRemoteVersions = [...remoteVersions].sort()
  if (
    mappedLegacyVersions.length !== pinnedRemoteVersions.length ||
    mappedLegacyVersions.some((version, index) => version !== pinnedRemoteVersions[index])
  ) {
    issues.push(
      "migration-history-map.json: mapped legacy groups must equal the pinned remote ledger",
    )
  }

  return issues
}

export const checkSupabaseMigrations = (supabaseDirectory: string): string[] => {
  const migrationDirectory = resolve(supabaseDirectory, "migrations")
  const fileNames = readdirSync(migrationDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
  const map = JSON.parse(
    readFileSync(resolve(supabaseDirectory, "migration-history-map.json"), "utf8"),
  ) as MigrationHistoryMap

  const issues = findMigrationFilenameIssues(fileNames)
  issues.push(...findHistoryMapIssues(map, migrationDirectory))

  const mappedFiles = new Set(map.entries.map((entry) => entry.file))
  const expectedLegacyMarkers = new Set(
    map.remoteLedger.map((entry) => `${entry.version}_legacy_history_marker.sql`),
  )
  const legacyVersions = map.remoteLedger.map((entry) => entry.version)
  const orderedLocalVersions = fileNames
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => (migrationPattern.exec(name) ?? legacyMarkerPattern.exec(name))?.[1])
    .filter((version): version is string => Boolean(version))
  if (legacyVersions.some((version, index) => orderedLocalVersions[index] !== version)) {
    issues.push(
      `local CLI order must begin with production ledger versions ${legacyVersions.join(", ")}`,
    )
  }
  for (const marker of expectedLegacyMarkers) {
    if (!fileNames.includes(marker)) {
      issues.push(`${marker}: required production history marker is missing`)
      continue
    }
    const executable = readFileSync(resolve(migrationDirectory, marker), "utf8")
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith("--"))
    if (executable.length > 0) {
      issues.push(`${marker}: legacy history markers must contain comments only`)
    }
  }

  for (const fileName of fileNames.filter((name) => name.endsWith(".sql"))) {
    const version = migrationPattern.exec(fileName)?.[1]
    if (version && version <= "20260718001000" && !mappedFiles.has(fileName)) {
      issues.push(`${fileName}: legacy normalization range is missing from history map`)
    }
    if (legacyMarkerPattern.test(fileName) && !expectedLegacyMarkers.has(fileName)) {
      issues.push(`${fileName}: legacy history marker is not declared by the history map`)
    }
  }

  return issues
}

const isMain = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false

if (isMain) {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url))
  const supabaseDirectory = resolve(scriptDirectory, "../../supabase")
  const issues = checkSupabaseMigrations(supabaseDirectory)
  if (issues.length > 0) {
    console.error(`Supabase migration safety check failed:\n- ${issues.join("\n- ")}`)
    process.exitCode = 1
  } else {
    console.log("Supabase migration versions and legacy history map are consistent.")
  }
}
