# P06 knowledge organization acceptance

- Candidate: `agent/knowledge-organization`, Draft PR #27, implementation `8ce887e4`
- Baseline: merged `main` `1fccf318e4a2d2077589768bf8854810947092c9`
- Date: 2026-07-20 (Asia/Shanghai)
- Current verdict: **implementation gates pass; signed-in PR-preview gate remains open**

## Automated evidence

- Focused organization + recovery tests: **35/35 passed**.
- Full Quartz suite: **291/291 passed**.
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
- The browser extension lost page control while explicitly saving the safe anchored URL. The automated contract still proves anchor preservation, but the signed-in safe-source round-trip and inline sensitive-URL error feedback remain open browser gates.

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

- Create/deduplicate/remove tags and refresh the exact saved document.
- Add two same-title relationships, verify human disambiguation and no visible UUID, then remove a tombstone after soft-deleting a target.
- Save web and personal sources, reject a sensitive URL, retain an anchor fragment, refresh, and inspect a publication snapshot.
- Exercise local/cloud/copy conflict actions with different tags, relationships, and sources.
- Confirm current-owner isolation against a second owner and anonymous access.
- Complete a keyboard-only pass through every add/remove/select action with a screen reader announcement check.

## Residual risk

- Document core, tags, links, and sources still span multiple writes. Add-first behavior reduces deletion risk, but a future atomic server RPC remains preferable.
- `continues`, relationship notes, cycle validation, reverse-related deduplication, and multi-knowledge-base filtering are follow-up scope.
- Source deletion has no undo affordance beyond the existing local recovery/version workflow.
- Signed-in browser acceptance is required before P06 can be marked complete or merged.
