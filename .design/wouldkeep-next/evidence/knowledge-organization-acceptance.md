# P06 knowledge organization acceptance

- Candidate: `agent/knowledge-organization`, Draft PR #27, hardening implementation `a0867e96`
- Baseline: merged `main` `1fccf318e4a2d2077589768bf8854810947092c9`
- Date: 2026-07-21 (Asia/Shanghai)
- Current verdict: **frontend implementation has no remaining P0/P1 after independent review; production database deployment and final preview acceptance remain open**

## Automated evidence

- Focused organization + recovery tests: **43/43 passed**.
- Full Quartz suite: **303/303 passed**.
- TypeScript: `tsc --noEmit` passed.
- Migration namespace guard: passed. Forward migration `20260721000100_document_links_integrity.sql` and owner/other/anon/service-role SQL verification were added but not deployed.
- Changed-file Prettier check: passed for all P06 code, tests, styles, and research files.
- `git diff --check`: passed.
- Quartz build: passed with 284 Markdown inputs and 1,051 emitted files.
- Build warnings are the existing untracked-date and LaTeX Unicode warnings; no P06 build error occurred.
- Repository-wide Prettier remains an inherited non-gate: 645 pre-existing files fail the full-repository format check. P06-owned files pass.

### 2026-07-21 relationship hardening checkpoint

- Soft-deleted or inaccessible targets render a title-free removable tombstone. Ordinary saves retain an existing tombstone without re-upserting it; explicit removal still deletes the link.
- Relationship candidates and writes are constrained to the document's actual knowledge base. Existing documents retain their bound knowledge base; new/cleared drafts reload default-library candidates; conflict copies inherit the source library.
- Every active relationship target is checked for owner, knowledge base, and liveness before the core document insert/update, preventing partial saves caused by stale candidates.
- Sensitive source URLs are rejected in credentials, query strings, and URL fragments. Local backup, outbox, conflict archive, conflict restore, and legacy outbox re-persistence all redact the URL before storage.
- Existing publication snapshots now warn explicitly when a draft is changed to private: the old snapshot remains online until the user chooses “撤回发布”. Internal migration filenames are no longer exposed in user-facing errors.
- The forward database migration fails closed on pre-existing cross-owner/cross-library rows, adds a locked `SECURITY DEFINER` endpoint trigger, splits command-specific owner RLS, revokes anonymous table access, and keeps soft-delete tombstones owner-readable/deletable.
- Static migration contract tests pass. The rollback-only SQL behavior matrix is authored but has not run because the local Docker engine is unavailable; no production migration or data mutation occurred.
- Independent frontend review verdict: **PASS, no remaining P0/P1**. One accepted P2 remains: a recovered unsaved-new draft can briefly show relation candidates as unresolved, but parsing and preflight fail closed before any cloud or partial write.

## Browser evidence

The exact local build was served to Chrome and inspected at 1200×900, 800×900, 375×812, and 320×720 CSS pixels.

| Width | Horizontal overflow | Organization DOM contract | Console errors |
| ----: | ------------------- | ------------------------- | -------------- |
|  1200 | none                | pass                      | none           |
|   800 | none                | pass                      | none           |
|   375 | none                | pass                      | none           |
|   320 | none                | pass                      | none           |

The DOM contract check confirmed one tag editor, two relationship editors, one source-add action, `maxlength=80`, list semantics on every chip container, and both local/cloud organization summaries in the conflict card. The local origin had no authenticated Supabase session, so this check does not claim signed-in data round-trip acceptance.

### Signed-in PR preview checkpoint

The PR preview was opened with the production account session and a private test draft was created at a document-bound URL.

- The title and body auto-saved to the cloud and both reappeared after opening the exact document URL in a fresh tab.
- The tag editor created a `P06验收` chip and rejected the NFKC/case-equivalent `ｐ０６验收` as already present.
- Relationship candidates rendered human-readable title, topic, and update-date labels; no UUID appeared in the visible option text.
- The preview produced no page console errors during these checks.
- A clean single-tab rerun reproduced the organization-save pause and identified the actual regression: a document opened from `?document=` loaded its cloud `id` but did not bind that value to the editor's `documentId` field. The save gate therefore compared the cloud document against `new` and correctly refused to overwrite it.
- The PR now binds the returned cloud `id` before related data is staged. The focused recovery suite passes **24/24**, TypeScript passes, and the full suite passes **291/291**. Tag/source round-trip remains open until the updated preview deployment is available and rechecked.

The updated `5d49ca81` preview subsequently passed both Vercel deployments and was rechecked:

- The opened form now binds `documentId=095dbe7c-0600-46d7-8864-1eb68db5e3c2` with revision 1 and remains interactive.
- Adding `P06验收` changed the state to “已自动保存到云端”; a fresh signed-in tab restored the tag chip from cloud data.
- A source containing `access_token` did not appear after reopening the document, so the sensitive value was not persisted.
- A safe source at `https://example.com/reference#section` persisted to cloud data and reappeared after reopening the document with the `#section` anchor intact.
- The prerequisite `PR26 恢复验收草稿（Codex）` was added, explicitly saved, and restored from cloud data after navigating back to the exact document URL. A lightweight locator observed the restored relationship chip 3 seconds after DOM content loaded.
- The sharing controls restored `仅自己可见` as the checked radio; neither link-only nor public visibility was selected.
- A second source row containing the fake query parameter `access_token=not-a-real-token` was blocked with the inline message `网址包含账号、密码、令牌或签名参数，已阻止保存。请先移除敏感信息。` The temporary row was then removed and the clean draft saved again.
- The earlier apparent relationship failure was an acceptance-observation error: a full accessibility snapshot of the very large candidate list delayed observation, while the relation itself restored normally. The production `/workspace/write/` page was also not a valid refresh target because it omitted the PR-preview origin and document query parameter.
- The misleading intermediate status was corrected: after the core document read, the editor now says `正文已载入，正在加载标签、关系与来源…`; `已加载云端草稿` appears only after every related-data read succeeds. A recovery regression test locks this ordering before the form is unlocked.

## Scope and security gate

Proven in code and automated tests:

- Tags normalize with NFKC/case/whitespace rules, reject blank/punctuation-only/overlong values, deduplicate stably, and use explicit chips.
- Relationships persist document IDs while visible options use human titles/topic/date; UUIDs are not rendered to users.
- Deleted, renamed, ambiguous, or otherwise unresolvable relationship values render a removable tombstone instead of trapping the draft in an invisible invalid state.
- Tag and relationship synchronization upserts desired rows before deleting stale rows.
- Source validation runs before the core document write, accepts only HTTP(S) or named personal experience, caps at 50, and rejects duplicate URLs.
- Citation fragments are retained while duplicate comparison ignores fragments.
- URLs containing Basic Auth, tokens, API keys, session values, passwords, or signature parameters are rejected before they can reach a publication snapshot.
- Related-data reads fail closed and keep recovery data instead of applying empty values.
- Remote-write conflicts fetch cloud tags/links/sources and show organization counts; a failed cloud organization read is labelled unknown instead of borrowing local values.
- Existing owner filters remain in the browser. The new forward migration hardens `document_links` RLS and endpoint integrity; it is committed for review but remains undeployed. No AI, Secret, paid-call, or production change is included.

## Not yet proven in a signed-in preview

- Remove an existing tag and refresh the exact saved document.
- Add two same-title relationships, verify human disambiguation, then remove a tombstone after soft-deleting a target.
- Save a personal-experience source and inspect a publication snapshot.
- Exercise local/cloud/copy conflict actions with different tags, relationships, and sources.
- Confirm current-owner isolation against a second owner and anonymous access.
- Run the rollback-only relationship SQL matrix, production-safe preflight, migration deployment, and read-only post-deploy contract verification after fresh explicit approval.
- Complete a keyboard-only pass through every add/remove/select action with a screen reader announcement check.

## Residual risk

- Document core, tags, links, and sources still span multiple writes. Add-first behavior reduces deletion risk, but a future atomic server RPC remains preferable.
- `continues`, relationship notes, cycle validation, reverse-related deduplication, and multi-knowledge-base filtering are follow-up scope.
- Source deletion has no undo affordance beyond the existing local recovery/version workflow.
- Signed-in browser acceptance is required before P06 can be marked complete or merged.
