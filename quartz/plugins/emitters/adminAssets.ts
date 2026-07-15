import fs from "fs"
import { dirname } from "path"
import { FilePath, joinSegments } from "../../util/path"
import { QuartzEmitterPlugin } from "../types"

const browserFiles = [
  "index.html",
  "admin.css",
  "admin-shell.js",
  "auth.js",
  "icon-192.png",
  "icon-512.png",
  "manifest.json",
  "sw.js",
] as const

export const AdminAssets: QuartzEmitterPlugin = () => ({
  name: "AdminAssets",
  async *emit({ argv }) {
    const sourceRoot = joinSegments("static", "admin")
    const outputRoot = joinSegments(argv.output, "admin")

    for (const filename of browserFiles) {
      const source = joinSegments(sourceRoot, filename) as FilePath
      const destination = joinSegments(outputRoot, filename) as FilePath

      if (!fs.existsSync(source)) {
        throw new Error(`Missing required admin browser asset: ${source}`)
      }

      await fs.promises.mkdir(dirname(destination), { recursive: true })
      await fs.promises.copyFile(source, destination)
      yield destination
    }
  },
  async *partialEmit() {},
})
