import assert from "node:assert"
import { readFileSync } from "node:fs"
import test from "node:test"

const baseStyles = readFileSync(new URL("../styles/base.scss", import.meta.url), "utf8")
const workspaceStyles = readFileSync(new URL("./styles/accountPage.scss", import.meta.url), "utf8")
const adminMarkup = readFileSync(new URL("../../static/admin/index.html", import.meta.url), "utf8")
const adminWorker = readFileSync(new URL("../../static/admin/sw.js", import.meta.url), "utf8")

test("admin migration inline scripts remain syntactically valid", () => {
  const scripts = [...adminMarkup.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  assert.ok(scripts.length > 0)
  scripts.forEach(([, source]) => assert.doesNotThrow(() => new Function(source)))
})

test("Quartz side rails form bounded desktop scroll regions and reset in flowing layouts", () => {
  assert.match(
    baseStyles,
    /& \.sidebar \{[\s\S]*height: 100dvh;[\s\S]*min-height: 0;[\s\S]*overflow-y: auto;[\s\S]*overscroll-behavior-y: contain;[\s\S]*scrollbar-gutter: stable;/,
  )
  assert.match(
    baseStyles,
    /@media all and \(\$mobile\) \{[\s\S]*height: unset;[\s\S]*overflow-y: visible;[\s\S]*scrollbar-gutter: auto;/,
  )
  assert.match(
    baseStyles,
    /@media all and not \(\$desktop\) \{[\s\S]*height: unset;[\s\S]*overflow-y: visible;[\s\S]*scrollbar-gutter: auto;/,
  )
})

test("workspace navigation stays viewport-bounded without trapping page scroll", () => {
  const workspaceNavRule = workspaceStyles.match(/\.workspace-nav \{([\s\S]*?)\}/)?.[1] ?? ""

  assert.match(workspaceNavRule, /box-sizing: border-box;/)
  assert.match(workspaceNavRule, /max-height: calc\(100dvh - 3rem\);/)
  assert.match(workspaceNavRule, /overflow-y: auto;/)
  assert.match(workspaceNavRule, /overscroll-behavior-y: auto;/)
  assert.doesNotMatch(workspaceNavRule, /overscroll-behavior-y: contain;/)
  assert.match(workspaceNavRule, /scrollbar-gutter: stable;/)
  assert.match(
    workspaceStyles,
    /@media \(max-width: 1180px\)[\s\S]*\.workspace-nav \{[\s\S]*position: static;[\s\S]*max-height: none;[\s\S]*overflow-y: visible;[\s\S]*scrollbar-gutter: auto;/,
  )
  assert.match(
    workspaceStyles,
    /@media \(max-width: 1180px\)[\s\S]*grid-template-columns: auto minmax\(0, 1fr\) auto;[\s\S]*\.workspace-nav-links \{[\s\S]*overflow-x: auto;[\s\S]*scroll-snap-type: inline proximity;/,
  )
  assert.match(
    workspaceStyles,
    /@media \(max-width: 600px\)[\s\S]*\.workspace-nav \{[\s\S]*grid-template-columns: minmax\(0, 1fr\);[\s\S]*\.workspace-nav-heading \{[\s\S]*display: none;/,
  )
})

test("retired admin route always leaves for workspace operations and clears old caches", () => {
  assert.match(adminMarkup, /http-equiv="refresh" content="3;url=\/workspace\/site\/"/)
  assert.match(adminMarkup, /Promise\.race\([\s\S]*1200/)
  assert.match(adminMarkup, /finally \{\s*location\.replace\("\/workspace\/site\/"\)/)
  assert.match(adminMarkup, /<noscript>/)
  assert.match(adminWorker, /key\.startsWith\("wouldkeep-admin-"\)/)
  assert.match(adminWorker, /self\.registration\.unregister\(\)/)
})
