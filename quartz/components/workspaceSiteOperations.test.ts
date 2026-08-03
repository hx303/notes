import assert from "node:assert"
import { readFileSync } from "node:fs"
import test from "node:test"

const accountPage = readFileSync(new URL("./AccountPage.tsx", import.meta.url), "utf8")
const accountScript = readFileSync(
  new URL("./scripts/accountPage.inline.ts", import.meta.url),
  "utf8",
)
const accountMenu = readFileSync(new URL("./AccountMenu.tsx", import.meta.url), "utf8")
const accountMenuScript = readFileSync(
  new URL("./scripts/accountMenu.inline.ts", import.meta.url),
  "utf8",
)
const folderContent = readFileSync(new URL("./pages/FolderContent.tsx", import.meta.url), "utf8")
const adminAssets = readFileSync(
  new URL("../plugins/emitters/adminAssets.ts", import.meta.url),
  "utf8",
)
const retiredAdminContent = readFileSync(
  new URL("../../content/⚙️ 管理/管理面板.md", import.meta.url),
  "utf8",
)
const siteOwnerInvariant = readFileSync(
  new URL(
    "../../supabase/migrations/20260722000100_site_owner_role_invariant.sql",
    import.meta.url,
  ),
  "utf8",
)

test("site operations is a first-class personal-workspace route", () => {
  assert.match(accountPage, /href="\/workspace\/site\/"/)
  assert.match(accountPage, /data-site-operations/)
  assert.match(accountMenu, /href="\/workspace\/site\/"/)
  assert.match(folderContent, /knowledge\|write\|site\|settings/)
})

test("site operations fails closed before reading protected queues", () => {
  assert.match(accountScript, /rpc\("current_account_capabilities"\)/)
  assert.match(accountMenuScript, /const syncEpoch = \+\+accountSyncEpoch/)
  assert.match(accountMenuScript, /if \(syncEpoch !== accountSyncEpoch\) return/)
  assert.match(accountMenuScript, /if \(operationsLink\) operationsLink\.hidden = true/)
  assert.match(accountScript, /renderSiteAccess\(null, "verification"\)/)
  assert.match(accountScript, /if \(!canAccessSiteOperations\(currentCapabilities\)\) return/)
  assert.match(accountScript, /can_read_other_private_documents\?: boolean/)
  assert.doesNotMatch(accountScript, /can_read_other_private_documents\s*===\s*true/)
  assert.match(accountPage, /data-site-access-denied[\s\S]{0,160}role="alert"/)
  assert.match(accountPage, /data-site-access-denied[\s\S]{0,200}tabIndex=\{-1\}/)
  assert.match(accountScript, /siteAccessDenied\.focus\(\)/)
})

test("moderation remains soft-delete and role changes use hardened RPCs", () => {
  assert.match(accountScript, /\.update\(\{ is_deleted: true \}\)/)
  assert.match(accountScript, /\.select\("id"\)\s*\.maybeSingle\(\)/)
  assert.match(accountScript, /deletion\.error \|\| !deletion\.data\?\.id/)
  assert.match(accountScript, /\.eq\("is_deleted", false\)/)
  assert.match(accountScript, /rpc\("list_roles"/)
  assert.match(accountScript, /rpc\("grant_role"/)
  assert.match(accountScript, /rpc\("revoke_role"/)
  assert.match(accountScript, /不会物理删除数据/)
  assert.match(accountScript, /站长角色受服务端保护/)
  assert.match(siteOwnerInvariant, /public\.is_site_owner\(target_uid\)/)
})

test("admin emitter contains only the migration entry and cleanup worker", () => {
  assert.match(adminAssets, /\["index\.html", "sw\.js"\]/)
  assert.doesNotMatch(adminAssets, /admin\.css|admin-shell\.js|auth\.js|manifest\.json/)
})

test("the legacy content page points only to the unified workspace", () => {
  assert.match(retiredAdminContent, /publish:\s*false/)
  assert.match(retiredAdminContent, /\/workspace\/site\//)
  assert.doesNotMatch(
    retiredAdminContent,
    /admin\.bat|admin_server\.py|localhost:8765|PDF 导入|一键部署/,
  )
})
