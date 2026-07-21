# P06 knowledge organization acceptance

- Candidate: `agent/knowledge-organization`, Draft PR #27, implementation `8ce887e4`
- Baseline: merged `main` `1fccf318e4a2d2077589768bf8854810947092c9`
- Date: 2026-07-21 (Asia/Shanghai)
- Current verdict: **implementation and signed-in core organization gates pass; destructive, conflict, and multi-owner gates remain open**

## Automated evidence

- Focused organization + recovery tests: **36/36 passed**.
- Full Quartz suite: **292/292 passed**.
- TypeScript: `tsc --noEmit` passed.
- Migration namespace guard: passed; no migration was added.
- Changed-file Prettier check: passed for all P06 code, tests, styles, and research files.
- `git diff --check`: passed.
- Quartz build: passed with 284 Markdown inputs and 1,051 emitted files.
- Build warnings are the existing untracked-date and LaTeX Unicode warnings; no P06 build error occurred.
- Repository-wide Prettier remains an inherited non-gate: 645 pre-existing files fail the full-repository format check. P06-owned files pass.

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
- Existing owner filters and RLS/RPC boundaries are reused. No schema, RLS, RPC, AI, migration, Secret, production, or paid-call change is included.

## Not yet proven in a signed-in preview

- Remove an existing tag and refresh the exact saved document.
- Add two same-title relationships, verify human disambiguation, then remove a tombstone after soft-deleting a target.
- Save a personal-experience source and inspect a publication snapshot.
- Exercise local/cloud/copy conflict actions with different tags, relationships, and sources.
- Confirm current-owner isolation against a second owner and anonymous access.
- Complete a keyboard-only pass through every add/remove/select action with a screen reader announcement check.

## Residual risk

- Document core, tags, links, and sources still span multiple writes. Add-first behavior reduces deletion risk, but a future atomic server RPC remains preferable.
- `continues`, relationship notes, cycle validation, reverse-related deduplication, and multi-knowledge-base filtering are follow-up scope.
- Source deletion has no undo affordance beyond the existing local recovery/version workflow.
- Signed-in browser acceptance is required before P06 can be marked complete or merged.
