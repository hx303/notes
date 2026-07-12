import assert from "node:assert"
import { readFileSync } from "node:fs"
import test from "node:test"

test("capture page exposes a complete local-draft flow", () => {
  const component = readFileSync(new URL("./CapturePage.tsx", import.meta.url), "utf8")
  const script = readFileSync(new URL("./scripts/capturePage.inline.ts", import.meta.url), "utf8")
  assert.match(component, /data-capture-form/)
  assert.match(component, /name="title"/)
  assert.match(component, /name="source"/)
  assert.match(component, /name="topic"/)
  assert.match(component, /name="body"/)
  assert.match(script, /localStorage\.setItem/)
  assert.match(script, /localStorage\.getItem/)
  assert.match(script, /data-capture-drafts/)
})
