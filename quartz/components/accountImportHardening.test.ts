import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import mammoth from "mammoth"
import {
  assertImportComplexity,
  createLatestImportRequestGate,
  decodeUtf8Markdown,
  inspectDocxArchive,
  redactRemoteImportImages,
  validateImportFile,
} from "./scripts/importDraft"

const script = readFileSync(new URL("./scripts/accountPage.inline.ts", import.meta.url), "utf8")
const component = readFileSync(new URL("./AccountPage.tsx", import.meta.url), "utf8")
const styles = readFileSync(new URL("./styles/accountPage.scss", import.meta.url), "utf8")
const staticEmitter = readFileSync(
  new URL("../plugins/emitters/static.ts", import.meta.url),
  "utf8",
)
const publicScript = readFileSync(
  new URL("./scripts/publicKnowledge.inline.ts", import.meta.url),
  "utf8",
)

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const archiveDirectoryFixture = (
  entries: Array<{ compressed: number; expanded: number; flags?: number }>,
) => {
  const centralSize = entries.length * 46
  const buffer = new ArrayBuffer(centralSize + 22)
  const view = new DataView(buffer)
  entries.forEach((entry, index) => {
    const offset = index * 46
    view.setUint32(offset, 0x02014b50, true)
    view.setUint16(offset + 8, entry.flags ?? 0, true)
    view.setUint32(offset + 20, entry.compressed, true)
    view.setUint32(offset + 24, entry.expanded, true)
  })
  view.setUint32(centralSize, 0x06054b50, true)
  view.setUint16(centralSize + 8, entries.length, true)
  view.setUint16(centralSize + 10, entries.length, true)
  view.setUint32(centralSize + 12, centralSize, true)
  view.setUint32(centralSize + 16, 0, true)
  return buffer
}

test("only the latest asynchronous import request may stage a result", async () => {
  const gate = createLatestImportRequestGate()
  const slow = deferred()
  const fast = deferred()
  const staged: string[] = []

  const parse = async (name: string, work: Promise<void>) => {
    const request = gate.begin()
    await work
    if (gate.isCurrent(request)) staged.push(name)
  }

  const slowRequest = parse("old-slow.docx", slow.promise)
  const fastRequest = parse("new-fast.md", fast.promise)
  fast.resolve()
  await fastRequest
  slow.resolve()
  await slowRequest

  assert.deepEqual(staged, ["new-fast.md"])
})

test("closing, reopening, or SPA cleanup invalidates in-flight import work", async () => {
  const gate = createLatestImportRequestGate()
  const pending = deferred()
  const staged: string[] = []
  const request = gate.begin()
  const parsing = pending.promise.then(() => {
    if (gate.isCurrent(request)) staged.push("stale")
  })

  gate.invalidate()
  pending.resolve()
  await parsing
  assert.deepEqual(staged, [])

  const reopened = gate.begin()
  assert.equal(gate.isCurrent(request), false)
  assert.equal(gate.isCurrent(reopened), true)
})

test("file validation rejects empty, unsupported, and oversized input before parsing", () => {
  assert.deepEqual(validateImportFile({ name: "knowledge.md", size: 64 }), {
    ok: true,
    extension: "md",
  })
  assert.deepEqual(validateImportFile({ name: "knowledge.DOCX", size: 10 * 1024 * 1024 }), {
    ok: true,
    extension: "docx",
  })
  assert.deepEqual(validateImportFile({ name: "empty.md", size: 0 }), {
    ok: false,
    reason: "empty-file",
  })
  assert.deepEqual(validateImportFile({ name: "notes.txt", size: 10 }), {
    ok: false,
    reason: "unsupported-type",
  })
  assert.deepEqual(validateImportFile({ name: "large.docx", size: 10 * 1024 * 1024 + 1 }), {
    ok: false,
    reason: "too-large",
  })
})

test("Markdown decoding accepts UTF-8 CJK and fails closed on invalid bytes", () => {
  const markdown = "# 你好\r\n\r\n保留 Markdown 结构。"
  const encoded = new TextEncoder().encode(markdown)
  assert.equal(decodeUtf8Markdown(encoded.buffer), markdown)
  assert.throws(() => decodeUtf8Markdown(Uint8Array.from([0xc3, 0x28]).buffer), /invalid-encoding/)
})

test("expanded content and DOM complexity have independent stable limits", () => {
  assert.doesNotThrow(() =>
    assertImportComplexity({
      bodyCharacters: 9_000_000,
      htmlCharacters: 10_000_000,
      domNodes: 50_000,
    }),
  )
  assert.throws(() => assertImportComplexity({ bodyCharacters: 9_000_001 }), /content-too-large/)
  assert.throws(() => assertImportComplexity({ htmlCharacters: 10_000_001 }), /content-too-large/)
  assert.throws(() => assertImportComplexity({ domNodes: 50_001 }), /content-too-large/)
})

test("DOCX central-directory preflight rejects corruption, encryption, and zip bombs", () => {
  assert.deepEqual(
    inspectDocxArchive(archiveDirectoryFixture([{ compressed: 500, expanded: 5_000 }])),
    {
      entryCount: 1,
      totalCompressedBytes: 500,
      totalExpandedBytes: 5_000,
      compressionRatio: 10,
    },
  )
  assert.throws(() => inspectDocxArchive(new ArrayBuffer(24)), /invalid-docx-archive/)
  assert.throws(
    () => inspectDocxArchive(archiveDirectoryFixture([{ compressed: 10, expanded: 10, flags: 1 }])),
    /encrypted-docx-archive/,
  )
  assert.throws(
    () =>
      inspectDocxArchive(
        archiveDirectoryFixture([{ compressed: 1, expanded: 20 * 1024 * 1024 + 1 }]),
      ),
    /archive-entry-too-large/,
  )
  assert.throws(
    () => inspectDocxArchive(archiveDirectoryFixture([{ compressed: 7_000, expanded: 2_000_000 }])),
    /archive-compression-ratio/,
  )
})

test("locked Mammoth fixtures retain heading, paragraph, list, table, and embedded image", async () => {
  const fixture = (name: string) =>
    readFileSync(new URL(`../../node_modules/mammoth/test/test-data/${name}`, import.meta.url))
  const convert = async (name: string, images = false) => {
    const buffer = fixture(name)
    assert.doesNotThrow(() =>
      inspectDocxArchive(
        buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
      ),
    )
    return mammoth.convertToHtml(
      { buffer },
      images
        ? {
            convertImage: mammoth.images.imgElement(async (image) => ({
              src: `data:${image.contentType};base64,${await image.read("base64")}`,
            })),
          }
        : undefined,
    )
  }

  assert.match(
    (await convert("embedded-style-map.docx")).value,
    /<h1>Walking on imported air<\/h1>/,
  )
  assert.match((await convert("single-paragraph.docx")).value, /<p>Walking on imported air<\/p>/)
  assert.match(
    (await convert("simple-list.docx")).value,
    /<ul><li>Apple<\/li><li>Banana<\/li><\/ul>/,
  )
  assert.match(
    (await convert("tables.docx")).value,
    /<table>[\s\S]*Top left[\s\S]*Bottom right[\s\S]*<\/table>/,
  )
  assert.match(
    (await convert("tiny-picture.docx", true)).value,
    /<img src="data:image\/png;base64,[A-Za-z0-9+/=]+"/,
  )
})

test("private preview removes remote Markdown and raw HTML images before parsing", () => {
  const remote = [
    "![diagram](https://tracker.example/private.png)",
    "![reference][asset]",
    "[asset]: https://tracker.example/reference.png",
    '<img src="https://tracker.example/raw.png" alt="raw">',
    '<picture><source srcset="https://tracker.example/large.png 2x"></picture>',
    '<svg><image href="https://tracker.example/vector.png"></image></svg>',
    "![kept](data:image/png;base64,iVBORw0KGgo=)",
  ].join("\n\n")
  const safe = redactRemoteImportImages(remote)
  assert.doesNotMatch(safe, /!\[[^\]]*\]\(https?:\/\//i)
  assert.doesNotMatch(safe, /<img\b/i)
  assert.doesNotMatch(safe, /<(?:picture|source|svg|image)\b/i)
  assert.match(safe, /远程图片未加载：diagram/)
  assert.match(safe, /远程图片未加载：reference/)
  assert.match(safe, /data:image\/png;base64,iVBORw0KGgo=/)
})

test("private import preview lazily loads same-origin parsers and keeps writes behind confirmation", () => {
  assert.match(script, /\/static\/vendor\/workspace-import\//)
  assert.match(script, /mammoth-1\.12\.0\.min\.js/)
  assert.match(script, /turndown-7\.2\.0\.js/)
  assert.match(script, /marked-15\.0\.12\.umd\.js/)
  assert.match(script, /purify-3\.4\.12\.min\.js/)
  assert.match(script, /value\?\.version === "3\.4\.12"/)
  assert.match(script, /timeoutMs = 0/)
  assert.match(script, /12_000/)
  assert.match(script, /ALLOWED_TAGS:[\s\S]*"table"[\s\S]*"img"/)
  assert.match(script, /ALLOWED_ATTR:[\s\S]*"src"[\s\S]*"scope"/)
  assert.match(script, /const inertTemplate = document\.createElement\("template"\)/)
  assert.match(script, /inertTemplate\.innerHTML = previewHtml/)
  assert.match(script, /purifier\.sanitize\(inertTemplate\.content, \{/)
  assert.doesNotMatch(script, /purifier\.sanitize\(previewHtml,/)
  assert.doesNotMatch(script, /cdn\.jsdelivr\.net\/npm\/(?:mammoth|turndown|marked|dompurify)@/)
  assert.match(
    script,
    /await renderMarkdownInto\(importPreview, draft\.body, \{[\s\S]*localImagesOnly: true/,
  )
  assert.match(script, /importConfirming \|\| !importedDraft \|\| !form/)
  assert.match(script, /const draft = importedDraft[\s\S]*startNewDocument\(\)/)
  assert.match(component, /data-import-file-context/)
  assert.match(component, /正文结构与图片预览/)
  assert.match(component, /放入编辑器作为私密草稿/)
  assert.match(styles, /\.knowledge-import-preview img[\s\S]*max-width: 100%/)
  for (const filename of [
    "mammoth-1.12.0.min.js",
    "turndown-7.2.0.js",
    "marked-15.0.12.umd.js",
    "purify-3.4.12.min.js",
  ]) {
    assert.match(staticEmitter, new RegExp(filename.replaceAll(".", "\\.")))
  }
  assert.match(staticEmitter, /createHash\("sha256"\)/)
  assert.match(staticEmitter, /Workspace import vendor integrity check failed/)
  assert.match(staticEmitter, /THIRD_PARTY_LICENSES\.txt/)
  assert.doesNotMatch(
    publicScript,
    /dompurify@3\.2\.6|cdn\.jsdelivr\.net\/npm\/(?:marked|dompurify)@/,
  )
  assert.match(publicScript, /purify-3\.4\.12\.min\.js/)
  assert.match(publicScript, /value\?\.version === "3\.4\.12"/)
  assert.match(publicScript, /delete globalWindow\.__wouldkeepScriptLoads\[src\]/)
  assert.match(publicScript, /timeout \$\{src\}/)
  assert.match(publicScript, /purifier\.sanitize\(inertTemplate\.content, \{/)
})
