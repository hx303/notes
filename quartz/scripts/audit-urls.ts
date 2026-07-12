import matter from "gray-matter"
import path from "path"
import { mkdir, readFile, writeFile } from "fs/promises"
import { glob } from "../util/glob"
import { createCanonicalSlugMap } from "../util/canonicalSlug"
import { FilePath, slugifyFilePath } from "../util/path"

function asList(value: unknown): string[] {
  if (value === undefined || value === null) return []
  return (Array.isArray(value) ? value : value.toString().split(","))
    .map((item) => item.toString().trim())
    .filter(Boolean)
}

function aliasToSlug(alias: string) {
  return slugifyFilePath((alias.endsWith(".md") ? alias : `${alias}.md`) as FilePath)
}

async function main() {
  const contentDirectory = process.argv[2] ?? "content"
  const outputPath = process.argv[3] ?? ".design/wouldkeep-redesign/URL_INVENTORY.json"
  const ignorePatterns = ["private", "templates", ".obsidian", "_backup", "_backups"]
  const allFiles = await glob("**/*.*", contentDirectory, ignorePatterns)
  const markdownPaths = allFiles.filter((file) => file.endsWith(".md")).sort()

  const parsed = await Promise.all(
    markdownPaths.map(async (relativePath) => {
      const source = await readFile(path.join(contentDirectory, relativePath), "utf8")
      const { data } = matter(source)
      return { relativePath: relativePath as FilePath, data }
    }),
  )
  const canonicalSlugMap = createCanonicalSlugMap(
    parsed.map(({ relativePath, data }) => ({
      filePath: relativePath,
      canonicalSlug: data.canonicalSlug,
    })),
  )

  const entries = parsed.map(({ relativePath, data }) => {
    const legacySlug = slugifyFilePath(relativePath)
    const canonicalSlug = canonicalSlugMap[legacySlug] ?? legacySlug
    const aliases = [
      ...new Set([
        ...asList(data.aliases ?? data.alias).map(aliasToSlug),
        ...(canonicalSlug !== legacySlug ? [legacySlug] : []),
      ]),
    ]
    const commentKey = data.commentKey ?? `${contentDirectory.replace(/\\/g, "/")}/${relativePath}`

    return {
      sourcePath: relativePath,
      legacySlug,
      canonicalSlug,
      aliases,
      commentKey,
      migrated: canonicalSlug !== legacySlug,
      legacyCovered: canonicalSlug === legacySlug || aliases.includes(legacySlug),
    }
  })

  const inventory = {
    version: 1,
    totals: {
      records: entries.length,
      migrated: entries.filter((entry) => entry.migrated).length,
      legacyCovered: entries.filter((entry) => entry.legacyCovered).length,
    },
    entries,
  }

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(inventory, null, 2)}\n`, "utf8")
  console.log(
    `URL inventory: ${inventory.totals.records} records, ${inventory.totals.migrated} migrated, ${inventory.totals.legacyCovered} legacy URLs covered.`,
  )
}

await main()
