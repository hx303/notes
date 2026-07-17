import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import matter from "gray-matter"

const root = process.cwd()
const contentRoot = path.join(root, "content")
const outputRoot = path.join(root, "supabase", "generated")
const ownerEmail = "2149665127@qq.com"
const ownerId = "b154d7e9-07c9-4412-8673-86239bbbe367"
const knowledgeBaseId = uuidFrom("wouldkeep:knowledge-base:夔嵬")
const batchSize = 45

const excludedExact = new Set([
  "index.md",
  "build/index.md",
  "capture/index.md",
  "changes/index.md",
  "knowledge/index.md",
  "map/index.md",
  "paths/index.md",
  "search/index.md",
  "workspace/index.md",
  "⚙️ 管理/管理面板.md",
])
const excludedPrefixes = ["account/", "topics/"]

function uuidFrom(value) {
  const bytes = Buffer.from(createHash("sha256").update(value).digest().subarray(0, 16))
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function walk(directory) {
  return readdirSync(directory)
    .sort((a, b) => a.localeCompare(b, "zh-CN"))
    .flatMap((name) => {
      const absolute = path.join(directory, name)
      return statSync(absolute).isDirectory() ? walk(absolute) : [absolute]
    })
}

function relativeFile(absolute) {
  return path.relative(contentRoot, absolute).split(path.sep).join("/")
}

function isIncluded(relative) {
  return relative.endsWith(".md")
    && !excludedExact.has(relative)
    && !excludedPrefixes.some((prefix) => relative.startsWith(prefix))
}

function arrayify(value) {
  if (value == null || value === "") return []
  return Array.isArray(value) ? value : [value]
}

function cleanInline(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>#~|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function firstHeading(body) {
  const match = body.match(/^#{1,3}\s+(.+)$/m)
  return match ? cleanInline(match[1]) : ""
}

function firstParagraph(body) {
  const blocks = body
    .replace(/```[\s\S]*?```/g, " ")
    .split(/\n\s*\n/)
    .map(cleanInline)
    .filter((block) => block && !block.startsWith("---") && !block.startsWith("{{"))
  return blocks.find((block) => block.length >= 24) ?? blocks[0] ?? ""
}

function truncate(value, max) {
  return Array.from(cleanInline(value)).slice(0, max).join("")
}

function normalizeTag(value) {
  return truncate(value, 80).toLocaleLowerCase("zh-CN")
}

function timestamp(value) {
  if (!value) return null
  const parsed = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function scalarLabel(value) {
  if (typeof value === "string" || typeof value === "number") return String(value)
  if (!value || typeof value !== "object") return ""
  return String(value.slug ?? value.title ?? value.name ?? value.label ?? "")
}

function sourceFrom(value) {
  if (typeof value === "string") {
    const text = value.trim()
    if (!text) return null
    return /^https?:\/\//i.test(text)
      ? { kind: "web", url: text, title: "", author: "", note: "", accessedAt: null }
      : { kind: "personal", url: null, title: truncate(text, 240), author: "", note: "", accessedAt: null }
  }
  if (!value || typeof value !== "object") return null
  const url = String(value.url ?? value.link ?? "").trim()
  const isWeb = /^https?:\/\/[^\s]+$/i.test(url)
  const title = truncate(value.title ?? value.name ?? value.citation ?? (isWeb ? "" : scalarLabel(value)), 240)
  if (!isWeb && !title) return null
  return {
    kind: isWeb ? "web" : "personal",
    url: isWeb ? url.slice(0, 2048) : null,
    title,
    author: truncate(value.author ?? value.authors ?? "", 160),
    note: truncate(value.note ?? value.reason ?? value.description ?? "", 1000),
    accessedAt: timestamp(value.accessed_at ?? value.accessedAt)?.slice(0, 10) ?? null,
  }
}

function aliasKey(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.md$/i, "")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("zh-CN")
}

function markdownTargets(body, relative) {
  const targets = []
  const expression = /(?<!!)\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))/g
  for (const match of body.matchAll(expression)) {
    let target = String(match[1] ?? match[2] ?? "").trim()
    if (!target || /^(?:https?:|mailto:|tel:|data:|#)/i.test(target)) continue
    target = target.split("#", 1)[0].split("?", 1)[0]
    try { target = decodeURIComponent(target) } catch { /* keep the literal path */ }
    target = target.replace(/\\/g, "/")
    const resolved = target.startsWith("/")
      ? path.posix.normalize(target.slice(1))
      : path.posix.normalize(path.posix.join(path.posix.dirname(relative), target))
    if (resolved && (!path.posix.extname(resolved) || /\.md$/i.test(resolved))) targets.push(resolved)
  }
  return targets
}

function sqlText(value) {
  if (value == null) return "NULL"
  const text = String(value)
  let suffix = createHash("sha1").update(text).digest("hex").slice(0, 10)
  let delimiter = `$wk_${suffix}$`
  while (text.includes(delimiter)) {
    suffix += "x"
    delimiter = `$wk_${suffix}$`
  }
  return `${delimiter}${text}${delimiter}`
}

function sqlTimestamp(value) {
  return value ? `${sqlText(value)}::TIMESTAMPTZ` : "NOW()"
}

const allMarkdown = walk(contentRoot).filter((file) => file.endsWith(".md"))
const files = allMarkdown.filter((file) => isIncluded(relativeFile(file)))

const documents = files.map((file) => {
  const relative = relativeFile(file)
  const raw = readFileSync(file, "utf8")
  const parsed = matter(raw)
  const data = parsed.data ?? {}
  const body = parsed.content.trim()
  const basename = path.posix.basename(relative, ".md")
  const title = truncate(data.title ?? firstHeading(body) ?? basename, 160) || truncate(basename, 160)
  const summary = truncate(data.summary ?? data.description ?? firstParagraph(body), 600)
  const topLevel = relative.split("/")[0].replace(/^[^\p{L}\p{N}]+/u, "")
  const originalPath = basename === "index"
    ? relative.slice(0, -"index.md".length)
    : relative.slice(0, -".md".length)
  const topic = truncate(data.primaryTopic ?? data.topic ?? data.subject ?? topLevel, 160)
  const requestedMaturity = String(data.maturity ?? "").toLowerCase()
  const maturity = ["seed", "growing", "stable"].includes(requestedMaturity) ? requestedMaturity : "growing"
  const tags = new Map()
  for (const value of [
    ...arrayify(data.tags),
    ...arrayify(data.topics),
    data.primaryTopic,
    data.topic,
    data.subject,
    topLevel,
  ]) {
    const name = truncate(scalarLabel(value), 80)
    const normalized = normalizeTag(name)
    if (name && normalized) tags.set(normalized, name)
  }

  return {
    id: uuidFrom(`wouldkeep:legacy-document:${relative}`),
    relative,
    originalUrl: `/${originalPath.split("/").filter(Boolean).map(encodeURIComponent).join("/")}${basename === "index" ? "/" : ""}`,
    slug: `legacy-${createHash("sha1").update(relative).digest("hex").slice(0, 20)}`,
    title,
    summary,
    body,
    topic,
    maturity,
    createdAt: timestamp(data.created ?? data.date),
    updatedAt: timestamp(data.updated ?? data.modified ?? data.created ?? data.date),
    checksum: createHash("sha256").update(raw).digest("hex"),
    tags: [...tags].map(([normalized, name]) => ({ normalized, name })),
    sources: arrayify(data.sources).map(sourceFrom).filter(Boolean).slice(0, 50),
    linkHints: {
      prerequisite: arrayify(data.prerequisites).map(scalarLabel),
      related: [...arrayify(data.related), ...arrayify(data.seeAlso)].map(scalarLabel),
      continues: arrayify(data.continues).map(scalarLabel),
      wiki: [...body.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)].map((match) => match[1]),
      markdown: markdownTargets(body, relative),
    },
    aliases: [
      relative.replace(/\.md$/i, ""),
      relative.replace(/\/index\.md$/i, ""),
      basename,
      title,
      data.canonicalSlug,
      data.slug,
      ...arrayify(data.aliases),
    ].map(aliasKey).filter(Boolean),
  }
})

const aliasMap = new Map()
for (const document of documents) {
  for (const alias of new Set(document.aliases)) {
    const matches = aliasMap.get(alias) ?? []
    matches.push(document)
    aliasMap.set(alias, matches)
  }
}

function resolveTarget(hint) {
  const key = aliasKey(hint)
  if (!key) return null
  const exact = aliasMap.get(key) ?? []
  if (exact.length === 1) return exact[0]
  const suffix = documents.filter((document) => document.aliases.some((alias) => alias.endsWith(`/${key}`)))
  return suffix.length === 1 ? suffix[0] : null
}

const links = new Map()
for (const document of documents) {
  for (const [relation, hints] of Object.entries(document.linkHints)) {
    const relationType = relation === "wiki" || relation === "markdown" ? "related" : relation
    for (const hint of hints) {
      const target = resolveTarget(hint)
      if (!target || target.id === document.id) continue
      const key = `${document.id}:${target.id}:${relationType}`
      links.set(key, { from: document.id, to: target.id, relation: relationType })
    }
  }
}

function batchSql(batch, index) {
  const number = String(index + 1).padStart(2, "0")
  const docValues = batch.map((document) => `(
      '${document.id}'::UUID, '${knowledgeBaseId}'::UUID, v_owner,
      ${sqlText(document.title)}, ${sqlText(document.summary)}, ${sqlText(document.body)},
      ${sqlText(document.topic)}, ${sqlText(document.maturity)}, 'ready', 'private',
      ${sqlText(document.slug)}, 0, ${sqlTimestamp(document.createdAt)}, ${sqlTimestamp(document.updatedAt)}
    )`).join(",\n    ")

  const manifestValues = batch.map((document) => `(
      '${document.id}'::UUID, v_owner, '${knowledgeBaseId}'::UUID,
      ${sqlText(document.relative)}, ${sqlText(document.originalUrl)}, ${sqlText(document.checksum)}
    )`).join(",\n    ")

  const tagRows = new Map()
  for (const document of batch) {
    for (const tag of document.tags) tagRows.set(tag.normalized, tag)
  }
  const tagInsert = tagRows.size ? `
  INSERT INTO public.tags (knowledge_base_id, owner_id, name, normalized_name)
  VALUES
    ${[...tagRows.values()].map((tag) => `('${knowledgeBaseId}'::UUID, v_owner, ${sqlText(tag.name)}, ${sqlText(tag.normalized)})`).join(",\n    ")}
  ON CONFLICT (knowledge_base_id, normalized_name) DO NOTHING;
` : ""

  const documentTagValues = batch.flatMap((document) => document.tags.map((tag) =>
    `('${document.id}'::UUID, ${sqlText(tag.normalized)})`,
  ))
  const documentTagInsert = documentTagValues.length ? `
  INSERT INTO public.document_tags (document_id, tag_id, owner_id)
  SELECT relation.document_id, tag.id, v_owner
  FROM (VALUES
    ${documentTagValues.join(",\n    ")}
  ) AS relation(document_id, normalized_name)
  JOIN public.tags tag
    ON tag.knowledge_base_id = '${knowledgeBaseId}'::UUID
   AND tag.normalized_name = relation.normalized_name
  ON CONFLICT (document_id, tag_id) DO NOTHING;
` : ""

  const sourceValues = batch.flatMap((document) => document.sources.map((source, sortOrder) => `(
      '${document.id}'::UUID, v_owner, ${sqlText(source.kind)}, ${sqlText(source.url)},
      ${sqlText(source.title)}, ${sqlText(source.author)}, ${sqlText(source.note)},
      ${source.accessedAt ? `${sqlText(source.accessedAt)}::DATE` : "NULL"}, ${sortOrder}
    )`))
  const sourceInsert = sourceValues.length ? `
  INSERT INTO public.document_sources (
    document_id, owner_id, kind, url, title, author, note, accessed_at, sort_order
  ) VALUES
    ${sourceValues.join(",\n    ")}
  ON CONFLICT (document_id, sort_order) DO NOTHING;
` : ""

  return `-- Generated wouldkeep legacy import batch ${number}.
-- Idempotent: existing imported documents and owner edits are never overwritten.

DO $legacy_batch_${number}$
DECLARE
  v_owner CONSTANT UUID := '${ownerId}'::UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users account
    WHERE account.id = v_owner AND lower(account.email) = lower('${ownerEmail}')
  ) THEN
    RAISE EXCEPTION 'Verified wouldkeep owner account was not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.site_owners owner WHERE owner.user_id = v_owner
  ) THEN
    RAISE EXCEPTION 'Run 20260718000600_site_owner_permissions.sql first';
  END IF;

  INSERT INTO public.documents (
    id, knowledge_base_id, owner_id, title, summary, body, topic, maturity,
    status, visibility, slug, revision, created_at, updated_at
  ) VALUES
    ${docValues}
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.legacy_content_imports (
    document_id, owner_id, knowledge_base_id, legacy_path, original_url, source_checksum
  ) VALUES
    ${manifestValues}
  ON CONFLICT (document_id) DO NOTHING;
${tagInsert}${documentTagInsert}${sourceInsert}
END;
$legacy_batch_${number}$;
`
}

mkdirSync(outputRoot, { recursive: true })

const foundation = `-- Generated wouldkeep legacy knowledge ownership foundation.
-- Apply after 20260718000600_site_owner_permissions.sql and 20260718000400_document_sources.sql.

CREATE TABLE IF NOT EXISTS public.legacy_content_imports (
  document_id UUID PRIMARY KEY REFERENCES public.documents(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  knowledge_base_id UUID NOT NULL REFERENCES public.knowledge_bases(id) ON DELETE CASCADE,
  legacy_path TEXT NOT NULL UNIQUE,
  original_url TEXT NOT NULL,
  source_checksum TEXT NOT NULL CHECK (source_checksum ~ '^[0-9a-f]{64}$'),
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.legacy_content_imports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owners can read own legacy import manifest" ON public.legacy_content_imports;
CREATE POLICY "Owners can read own legacy import manifest"
  ON public.legacy_content_imports FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = owner_id);

REVOKE INSERT, UPDATE, DELETE ON public.legacy_content_imports FROM anon, authenticated;
GRANT SELECT ON public.legacy_content_imports TO authenticated;

DO $legacy_foundation$
DECLARE
  v_owner CONSTANT UUID := '${ownerId}'::UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users account
    WHERE account.id = v_owner AND lower(account.email) = lower('${ownerEmail}')
  ) THEN
    RAISE EXCEPTION 'Verified wouldkeep owner account was not found';
  END IF;

  IF NOT public.is_site_owner(v_owner) THEN
    RAISE EXCEPTION 'Run 20260718000600_site_owner_permissions.sql first';
  END IF;

  INSERT INTO public.knowledge_bases (
    id, owner_id, name, description, default_visibility
  ) VALUES (
    '${knowledgeBaseId}'::UUID,
    v_owner,
    '夔嵬知识库',
    '从 wouldkeep 原静态知识站迁入的可编辑内容。原公开网址继续保留；账户副本默认仅自己可见，整理后可逐篇发布。',
    'private'
  )
  ON CONFLICT (id) DO UPDATE SET
    owner_id = v_owner,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    default_visibility = 'private';
END;
$legacy_foundation$;
`

writeFileSync(path.join(outputRoot, "20260714_legacy_import_00_foundation.sql"), foundation)

const batches = []
for (let offset = 0; offset < documents.length; offset += batchSize) {
  batches.push(documents.slice(offset, offset + batchSize))
}
batches.forEach((batch, index) => {
  const number = String(index + 1).padStart(2, "0")
  writeFileSync(path.join(outputRoot, `20260714_legacy_import_${number}_documents.sql`), batchSql(batch, index))
})

const linkValues = [...links.values()].map((link) =>
  `('${link.from}'::UUID, '${link.to}'::UUID, '${ownerId}'::UUID, ${sqlText(link.relation)}, '')`,
)
const linksSql = `-- Generated wouldkeep legacy knowledge links.
-- Apply after all document batches.

INSERT INTO public.document_links (
  from_document_id, to_document_id, owner_id, relation_type, note
)
VALUES
  ${linkValues.join(",\n  ")}
ON CONFLICT (from_document_id, to_document_id, relation_type) DO NOTHING;
`
writeFileSync(path.join(outputRoot, "20260714_legacy_import_07_links.sql"), linksSql)

const verification = `-- Read-only verification. Expected imported document count: ${documents.length}.
SELECT
  account.id AS owner_id,
  account.email,
  profile.display_name,
  role.role,
  public.is_site_owner(account.id) AS is_site_owner,
  (SELECT count(*) FROM auth.users) AS total_auth_accounts,
  (SELECT count(*) FROM public.knowledge_bases kb WHERE kb.owner_id = account.id) AS owned_knowledge_bases,
  (SELECT count(*) FROM public.legacy_content_imports item WHERE item.owner_id = account.id) AS imported_documents,
  (SELECT count(*) FROM public.document_tags item WHERE item.owner_id = account.id) AS imported_tag_relations,
  (SELECT count(*) FROM public.document_links item WHERE item.owner_id = account.id) AS imported_links,
  (SELECT count(*) FROM public.document_sources item WHERE item.owner_id = account.id) AS imported_sources
FROM auth.users account
LEFT JOIN public.profiles profile ON profile.id = account.id
LEFT JOIN public.user_roles role ON role.user_id = account.id
WHERE lower(account.email) = lower('${ownerEmail}');

SELECT legacy_path, original_url, source_checksum
FROM public.legacy_content_imports
ORDER BY legacy_path;
`
writeFileSync(path.join(outputRoot, "20260714_legacy_import_08_verify.sql"), verification)

const rollback = `-- EMERGENCY ROLLBACK ONLY. This deletes only rows recorded by the legacy import manifest.
-- Do not run during normal setup. Review the target email and counts before uncommenting.
--
-- BEGIN;
-- DELETE FROM public.documents document
-- USING public.legacy_content_imports imported, auth.users account
-- WHERE document.id = imported.document_id
--   AND imported.owner_id = account.id
--   AND lower(account.email) = lower('${ownerEmail}');
-- DELETE FROM public.knowledge_bases kb
-- WHERE kb.id = '${knowledgeBaseId}'::UUID
--   AND NOT EXISTS (SELECT 1 FROM public.documents document WHERE document.knowledge_base_id = kb.id);
-- COMMIT;
`
writeFileSync(path.join(outputRoot, "ROLLBACK_legacy_import.sql"), rollback)

const sourceCount = documents.reduce((count, document) => count + document.sources.length, 0)
const tagRelationCount = documents.reduce((count, document) => count + document.tags.length, 0)
const report = `# 夔嵬知识库迁移清单

- 扫描 Markdown：${allMarkdown.length} 篇
- 排除系统页面：${allMarkdown.length - documents.length} 篇
- 迁入账户：${documents.length} 篇
- 标签关系：${tagRelationCount} 条
- 结构化来源：${sourceCount} 条
- 可解析知识链接：${links.size} 条
- 目标账户：${ownerEmail}
- 目标知识库 ID：${knowledgeBaseId}

迁入内容默认状态为 \`ready / private\`。原 Quartz 静态文件和公开网址不删除；用户可在工作区整理后逐篇发布。
`
writeFileSync(path.join(outputRoot, "LEGACY_IMPORT_REPORT.md"), report)

console.log(JSON.stringify({
  scanned: allMarkdown.length,
  excluded: allMarkdown.length - documents.length,
  documents: documents.length,
  batches: batches.length,
  tagRelations: tagRelationCount,
  sources: sourceCount,
  links: links.size,
  knowledgeBaseId,
}, null, 2))
