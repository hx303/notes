import assert from "node:assert"
import { readFileSync } from "node:fs"
import test from "node:test"

const baseStyles = readFileSync(new URL("../styles/base.scss", import.meta.url), "utf8")
const workspaceStyles = readFileSync(new URL("./styles/accountPage.scss", import.meta.url), "utf8")
const adminMarkup = readFileSync(new URL("../../static/admin/index.html", import.meta.url), "utf8")
const adminStyles = readFileSync(new URL("../../static/admin/admin.css", import.meta.url), "utf8")

test("admin inline scripts remain syntactically valid", () => {
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

test("workspace navigation scrolls only while it is sticky", () => {
  assert.match(
    workspaceStyles,
    /\.workspace-nav \{[\s\S]*max-height: calc\(100dvh - 3rem\);[\s\S]*overflow-y: auto;[\s\S]*overscroll-behavior-y: contain;[\s\S]*scrollbar-gutter: stable;/,
  )
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

test("admin file navigation has a reliable scroll boundary and visible scrollbar", () => {
  assert.match(adminMarkup, /body\{[^}]*height:100dvh;[^}]*overflow:hidden\}/)
  assert.match(adminMarkup, /\.main\{[^}]*min-height:0;[^}]*overflow:hidden/)
  assert.match(
    adminMarkup,
    /\.sidebar-files\{[^}]*overflow-y:auto;[^}]*overscroll-behavior-y:contain;[^}]*scrollbar-gutter:stable;[^}]*touch-action:pan-y;[^}]*min-height:0/,
  )
  assert.match(adminStyles, /\.sidebar-files::\-webkit-scrollbar \{\s*width: 10px;/)
})

test("admin file navigation avoids the all-expanded layout and preserves real file identities", () => {
  assert.match(adminMarkup, /open: false/)
  assert.match(adminMarkup, /\.folder \.files\{display:none\}/)
  assert.match(adminMarkup, /\.folder\.open>\.files\{display:block\}/)
  assert.match(adminMarkup, /id="file'\+realFi\+'_'\+realFi2/)
  assert.match(
    adminMarkup,
    /function openRecentFile\(button\)[\s\S]*files\[fi\]\.files\[i2\]\.path === path/,
  )
  assert.match(adminMarkup, /role="button" tabindex="0" aria-expanded=/)
  assert.match(
    adminMarkup,
    /function handleFolderKey[\s\S]*event\.key !== "Enter"[\s\S]*event\.key !== " "/,
  )
})
