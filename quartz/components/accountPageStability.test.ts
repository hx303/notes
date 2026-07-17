import assert from "node:assert"
import { readFileSync } from "node:fs"
import test from "node:test"

const component = readFileSync(new URL("./AccountPage.tsx", import.meta.url), "utf8")
const script = readFileSync(new URL("./scripts/accountPage.inline.ts", import.meta.url), "utf8")
const styles = readFileSync(new URL("./styles/accountPage.scss", import.meta.url), "utf8")

test("account auth renders a stable, announced loading state before resolving the session", () => {
  assert.match(component, /data-auth-state="loading"/)
  assert.match(component, /data-auth-loading role="status" aria-live="polite"/)
  assert.match(component, /data-auth-panel[\s\S]*aria-busy="true"/)
  assert.match(script, /root\.dataset\.authState = "ready"/)
  assert.match(script, /authPanel\?\.setAttribute\("aria-busy", "false"\)/)
  assert.match(styles, /\[data-auth-state="loading"\][\s\S]*\.account-form/)
})

test("account auth prevents duplicate submissions and preserves recoverable input failures", () => {
  assert.match(script, /login\.dataset\.submitting === "true"/)
  assert.match(script, /forgotForm\.dataset\.submitting === "true"/)
  assert.match(script, /recovery\.dataset\.submitting === "true"/)
  assert.match(script, /catch \{[\s\S]*?\} finally \{\s*delete login\.dataset\.submitting/)
  assert.match(script, /catch \{[\s\S]*?\} finally \{\s*delete forgotForm\.dataset\.submitting/)
  assert.match(script, /catch \{[\s\S]*?\} finally \{\s*delete recovery\.dataset\.submitting/)
  assert.match(script, /result\.error[\s\S]*friendlyAuthError/)
})

test("account SPA resources are cleaned up when Quartz replaces the page", () => {
  assert.match(script, /window\.addCleanup\(\(\) => \{/)
  assert.match(script, /authSubscription\?\.unsubscribe\?\.\(\)/)
  assert.match(script, /window\.removeEventListener\("online", onlineHandler\)/)
  assert.match(script, /window\.clearTimeout\(autosaveTimer\)/)
  assert.match(script, /watchSupabaseAuth/)
  assert.match(script, /onSignedOut:[\s\S]*clearPrivateWorkspace/)
  assert.match(script, /onSessionChanged:[\s\S]*queueSync/)
  assert.match(script, /await loadCapabilities\(snapshot\)[\s\S]*catch \{\s*setStatus\(/)
  assert.doesNotMatch(
    script,
    /await loadCapabilities\(snapshot\)[\s\S]*catch \{\s*currentUser = null/,
  )
})

test("auth client timeout can reconnect in place and binds only one subscription", () => {
  assert.match(script, /const ensureClient = async \(announce = false\)/)
  assert.match(script, /loadSharedSupabaseClient/)
  assert.match(script, /delete globalWindow\.__wouldkeepScriptLoads\[src\]/)
  assert.match(script, /script\.onerror = \(\) => \{[\s\S]*script\.remove\(\)[\s\S]*reject/)
  assert.match(script, /submitAuth[\s\S]*await ensureClient\(true\)/)
  assert.match(script, /recovery\?\.addEventListener[\s\S]*await ensureClient\(true\)/)
  assert.match(script, /forgotForm\?\.addEventListener[\s\S]*await ensureClient\(true\)/)
  assert.match(
    script,
    /forgotForm\?\.addEventListener[\s\S]*if \(!value\)[\s\S]*await ensureClient\(true\)/,
  )
  assert.doesNotMatch(script, /forgotForm\?\.addEventListener[\s\S]*if \(!client \|\| !value\)/)
  assert.match(script, /onlineHandler = async \(\) => \{[\s\S]*await ensureClient\(true\)/)
  assert.match(script, /if \(!client \|\| authSubscription\) return/)
})

test("account routes reclaim empty Quartz side rails and adapt at content-driven widths", () => {
  assert.match(styles, /#quartz-body:has\(\.account-page\)/)
  assert.match(styles, /#quartz-body:has\(\.account-page\) > \.sidebar[\s\S]*display: none/)
  assert.match(styles, /width: min\(100%, 1240px\)/)
  assert.match(styles, /grid-template-columns: minmax\(0, 38rem\) minmax\(20rem, 26rem\)/)
  assert.match(
    styles,
    /@media \(max-width: 900px\)[\s\S]*\.auth-page[\s\S]*grid-template-columns: 1fr/,
  )
  assert.match(
    styles,
    /@media \(max-width: 600px\)[\s\S]*\.account-page[\s\S]*padding: 2rem 1rem 4rem/,
  )
  assert.match(styles, /min-height: 44px/)
  assert.match(styles, /account-form-links a[\s\S]*account-switch a[\s\S]*min-height: 44px/)
  assert.match(styles, /#quartz-root\.page > #quartz-body:has\(\.account-page\) > \.sidebar/)
  assert.match(
    styles,
    /#quartz-root\.page > #quartz-body:has\(\.account-page\) > \.center > \.page-header/,
  )
  assert.match(
    styles,
    /> \.site-header \{[\s\S]*width: min\(100%, 1240px\)[\s\S]*padding-inline: clamp\(1rem, 4vw, 3rem\)/,
  )
  assert.match(styles, /> \.center > hr[\s\S]*> \.center > \.page-footer[\s\S]*display: none/)
  assert.match(styles, /body:has\(\.account-page\)[\s\S]*padding-block-end: 0/)
  assert.match(styles, /prefers-reduced-motion: reduce/)
  assert.match(styles, /account-auth-loading[\s\S]*min-height: 21rem/)
})
