export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024
export const MAX_IMPORT_BODY_CHARACTERS = 9_000_000
export const MAX_IMPORT_HTML_CHARACTERS = 10_000_000
export const MAX_IMPORT_DOM_NODES = 50_000

const MAX_DOCX_ARCHIVE_ENTRIES = 2_048
const MAX_DOCX_ENTRY_BYTES = 20 * 1024 * 1024
const MAX_DOCX_EXPANDED_BYTES = 50 * 1024 * 1024
const MAX_DOCX_COMPRESSION_RATIO = 150

export const assertImportComplexity = (metrics: {
  bodyCharacters?: number
  htmlCharacters?: number
  domNodes?: number
}) => {
  if (
    (metrics.bodyCharacters ?? 0) > MAX_IMPORT_BODY_CHARACTERS ||
    (metrics.htmlCharacters ?? 0) > MAX_IMPORT_HTML_CHARACTERS ||
    (metrics.domNodes ?? 0) > MAX_IMPORT_DOM_NODES
  )
    throw new Error("content-too-large")
}

export const createLatestImportRequestGate = () => {
  let sequence = 0
  return {
    begin: () => ++sequence,
    invalidate: () => {
      sequence += 1
    },
    isCurrent: (request: number) => request === sequence,
  }
}

export const decodeUtf8Markdown = (buffer: ArrayBuffer) => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer)
  } catch {
    throw new Error("invalid-encoding")
  }
}

export const redactRemoteImportImages = (markdown: string) =>
  markdown
    .replace(/<svg\b[\s\S]*?<\/svg\s*>/gi, "[SVG 未在导入预览中加载]")
    .replace(/<math\b[\s\S]*?<\/math\s*>/gi, "[MathML 未在导入预览中加载]")
    .replace(
      /<\/?(?:img|picture|source|video|audio|track)\b[^>]*>/gi,
      "[HTML 媒体未在导入预览中加载]",
    )
    .replace(/!\[([^\]]*)\]\[([^\]]*)\]/g, (_match, alt: string) =>
      alt.trim() ? `[远程图片未加载：${alt.trim()}]` : "[远程图片未加载]",
    )
    .replace(/!\[([^\]]*)\]\(\s*<?https?:\/\/[^\n)]*\)/gi, (_match, alt: string) =>
      alt.trim() ? `[远程图片未加载：${alt.trim()}]` : "[远程图片未加载]",
    )

type SupportedImportExtension = "docx" | "md" | "markdown"
type ImportFileValidation =
  | { ok: true; extension: SupportedImportExtension }
  | { ok: false; reason: "too-large" | "empty-file" | "unsupported-type" }

export const validateImportFile = (file: Pick<File, "name" | "size">): ImportFileValidation => {
  if (file.size > MAX_IMPORT_FILE_BYTES) return { ok: false, reason: "too-large" }
  if (file.size === 0) return { ok: false, reason: "empty-file" }
  const extension = file.name.split(".").pop()?.toLowerCase()
  if (extension === "docx" || extension === "md" || extension === "markdown")
    return { ok: true, extension }
  return { ok: false, reason: "unsupported-type" }
}

const findEndOfCentralDirectory = (view: DataView) => {
  const minimumOffset = Math.max(0, view.byteLength - 65_557)
  for (let offset = view.byteLength - 22; offset >= minimumOffset; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset
  }
  return -1
}

export const inspectDocxArchive = (buffer: ArrayBuffer) => {
  if (buffer.byteLength < 22) throw new Error("invalid-docx-archive")
  const view = new DataView(buffer)
  const endOffset = findEndOfCentralDirectory(view)
  if (endOffset < 0) throw new Error("invalid-docx-archive")

  const diskNumber = view.getUint16(endOffset + 4, true)
  const centralDisk = view.getUint16(endOffset + 6, true)
  const entriesOnDisk = view.getUint16(endOffset + 8, true)
  const entryCount = view.getUint16(endOffset + 10, true)
  const centralSize = view.getUint32(endOffset + 12, true)
  const centralOffset = view.getUint32(endOffset + 16, true)
  if (
    diskNumber !== 0 ||
    centralDisk !== 0 ||
    entriesOnDisk !== entryCount ||
    entryCount === 0xffff ||
    centralSize === 0xffffffff ||
    centralOffset === 0xffffffff
  )
    throw new Error("unsupported-docx-archive")
  if (entryCount === 0 || entryCount > MAX_DOCX_ARCHIVE_ENTRIES)
    throw new Error("too-many-archive-entries")
  if (centralOffset + centralSize > endOffset || centralOffset > view.byteLength)
    throw new Error("invalid-docx-archive")

  let cursor = centralOffset
  let totalCompressedBytes = 0
  let totalExpandedBytes = 0
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > endOffset || view.getUint32(cursor, true) !== 0x02014b50)
      throw new Error("invalid-docx-archive")
    const flags = view.getUint16(cursor + 8, true)
    if (flags & 0x0001) throw new Error("encrypted-docx-archive")
    const compressedBytes = view.getUint32(cursor + 20, true)
    const expandedBytes = view.getUint32(cursor + 24, true)
    const filenameLength = view.getUint16(cursor + 28, true)
    const extraLength = view.getUint16(cursor + 30, true)
    const commentLength = view.getUint16(cursor + 32, true)
    if (compressedBytes === 0xffffffff || expandedBytes === 0xffffffff)
      throw new Error("unsupported-docx-archive")
    if (expandedBytes > MAX_DOCX_ENTRY_BYTES) throw new Error("archive-entry-too-large")
    totalCompressedBytes += compressedBytes
    totalExpandedBytes += expandedBytes
    if (totalExpandedBytes > MAX_DOCX_EXPANDED_BYTES) throw new Error("archive-expanded-too-large")
    cursor += 46 + filenameLength + extraLength + commentLength
  }
  if (cursor !== centralOffset + centralSize || cursor > endOffset)
    throw new Error("invalid-docx-archive")
  const compressionRatio = totalExpandedBytes / Math.max(1, totalCompressedBytes)
  if (totalExpandedBytes > 1024 * 1024 && compressionRatio > MAX_DOCX_COMPRESSION_RATIO)
    throw new Error("archive-compression-ratio")

  return { entryCount, totalCompressedBytes, totalExpandedBytes, compressionRatio }
}
