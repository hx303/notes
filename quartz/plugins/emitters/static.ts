import { FilePath, QUARTZ, joinSegments } from "../../util/path"
import { QuartzEmitterPlugin } from "../types"
import fs from "fs"
import { glob } from "../../util/glob"
import { dirname } from "path"
import { createHash } from "crypto"

const workspaceImportVendorFiles = [
  {
    source: "node_modules/mammoth/mammoth.browser.min.js",
    filename: "mammoth-1.12.0.min.js",
    sha256: "5d4c0e7c9165d70b78f789c5274a2c7846d9e1c06ec19b69afa6ef45f789a3b9",
  },
  {
    source: "node_modules/turndown/lib/turndown.browser.umd.js",
    filename: "turndown-7.2.0.js",
    sha256: "503e455e10504afe36fd557c869f439f3e06f3f86724ab58624c9353ba508eb6",
  },
  {
    source: "node_modules/marked/lib/marked.umd.js",
    filename: "marked-15.0.12.umd.js",
    sha256: "d7931d1cd7bf727dd756c871637edcc9e0f8538003b927368400ec1ee47a9dd9",
  },
  {
    source: "node_modules/dompurify/dist/purify.min.js",
    filename: "purify-3.4.12.min.js",
    sha256: "c45ba939765574f96cbf35ee9b6d89f73756a17921814425e74b82f7c54603ce",
  },
] as const

const workspaceImportLicensePackages = [
  { root: "node_modules/mammoth", licenses: ["LICENSE"] },
  { root: "node_modules/turndown", licenses: ["LICENSE"] },
  { root: "node_modules/marked", licenses: ["LICENSE.md"] },
  { root: "node_modules/dompurify", licenses: ["LICENSE", "LICENSE-MPL"] },
  { root: "node_modules/@xmldom/xmldom", licenses: ["LICENSE"] },
  { root: "node_modules/mammoth/node_modules/argparse", licenses: ["LICENSE"] },
  { root: "node_modules/base64-js", licenses: ["LICENSE"] },
  { root: "node_modules/bluebird", licenses: ["LICENSE"] },
  { root: "node_modules/jszip", licenses: ["LICENSE.markdown"] },
  { root: "node_modules/lop", licenses: ["LICENSE"] },
  { root: "node_modules/duck", licenses: ["LICENSE"] },
  { root: "node_modules/option", licenses: ["LICENSE"] },
  { root: "node_modules/underscore", licenses: ["LICENSE"] },
  { root: "node_modules/xmlbuilder", licenses: ["LICENSE"] },
  { root: "node_modules/path-is-absolute", licenses: ["license"] },
  { root: "node_modules/jszip/node_modules/pako", licenses: ["LICENSE"] },
  { root: "node_modules/lie", licenses: ["license.md"] },
  { root: "node_modules/immediate", licenses: ["LICENSE.txt"] },
  { root: "node_modules/readable-stream", licenses: ["LICENSE"] },
  { root: "node_modules/core-util-is", licenses: ["LICENSE"] },
  { root: "node_modules/inherits", licenses: ["LICENSE"] },
  { root: "node_modules/process-nextick-args", licenses: ["license.md"] },
  { root: "node_modules/safe-buffer", licenses: ["LICENSE"] },
  { root: "node_modules/string_decoder", licenses: ["LICENSE"] },
  { root: "node_modules/util-deprecate", licenses: ["LICENSE"] },
  { root: "node_modules/setimmediate", licenses: ["LICENSE.txt"] },
  { root: "node_modules/sprintf-js", licenses: ["LICENSE"] },
  { root: "node_modules/buffer", licenses: ["LICENSE"] },
  { root: "node_modules/ieee754", licenses: ["LICENSE"] },
  { root: "node_modules/@mixmark-io/domino", licenses: ["LICENSE"] },
] as const

const supplementalWorkspaceImportLicenses = [
  {
    name: "dingbat-to-unicode",
    version: "1.0.1",
    license: "BSD-2-Clause",
    notice: `Copyright (c) Michael Williamson
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.`,
  },
  {
    name: "isarray",
    version: "1.0.0",
    license: "MIT",
    notice: `Copyright (c) 2013 Julian Gruber <julian@juliangruber.com>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`,
  },
] as const

const workspaceImportLicenseNotice = async () => {
  const sections: string[] = []
  for (const entry of workspaceImportLicensePackages) {
    const packageJson = JSON.parse(
      await fs.promises.readFile(joinSegments(entry.root, "package.json"), "utf8"),
    ) as { name: string; version: string; license?: string }
    const licenseText = (
      await Promise.all(
        entry.licenses.map((filename) =>
          fs.promises.readFile(joinSegments(entry.root, filename), "utf8"),
        ),
      )
    ).join("\n\n")
    sections.push(
      `${packageJson.name}@${packageJson.version} | ${packageJson.license ?? "SEE LICENSE TEXT"} | ${entry.root}\n\n${licenseText.trim()}`,
    )
  }
  for (const entry of supplementalWorkspaceImportLicenses) {
    sections.push(
      `${entry.name}@${entry.version} | ${entry.license} | license text supplied because the package does not ship a license file\n\n${entry.notice}`,
    )
  }
  const separator = `\n\n${"=".repeat(80)}\n\n`
  return `WouldKeep workspace import third-party notices\n\n${sections.join(separator)}\n`
}

export const Static: QuartzEmitterPlugin = () => ({
  name: "Static",
  async *emit({ argv, cfg }) {
    const staticPath = joinSegments(QUARTZ, "static")
    const fps = await glob("**", staticPath, cfg.configuration.ignorePatterns)
    const outputStaticPath = joinSegments(argv.output, "static")
    await fs.promises.mkdir(outputStaticPath, { recursive: true })
    for (const fp of fps) {
      const src = joinSegments(staticPath, fp) as FilePath
      const dest = joinSegments(outputStaticPath, fp) as FilePath
      await fs.promises.mkdir(dirname(dest), { recursive: true })
      await fs.promises.copyFile(src, dest)
      yield dest
    }

    const workspaceImportVendorPath = joinSegments(outputStaticPath, "vendor", "workspace-import")
    await fs.promises.mkdir(workspaceImportVendorPath, { recursive: true })
    for (const vendor of workspaceImportVendorFiles) {
      const src = vendor.source as FilePath
      const dest = joinSegments(workspaceImportVendorPath, vendor.filename) as FilePath
      const source = await fs.promises.readFile(src)
      const actualHash = createHash("sha256").update(source).digest("hex")
      if (actualHash !== vendor.sha256) {
        throw new Error(
          `Workspace import vendor integrity check failed for ${vendor.filename}: expected ${vendor.sha256}, received ${actualHash}`,
        )
      }
      await fs.promises.copyFile(src, dest)
      yield dest
    }
    const licenseNoticePath = joinSegments(
      workspaceImportVendorPath,
      "THIRD_PARTY_LICENSES.txt",
    ) as FilePath
    await fs.promises.writeFile(licenseNoticePath, await workspaceImportLicenseNotice(), "utf8")
    yield licenseNoticePath
  },
  async *partialEmit() {},
})
