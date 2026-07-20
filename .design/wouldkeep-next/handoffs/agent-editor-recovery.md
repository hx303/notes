# Handoff: `agent/editor-recovery`

- Role: workspace editor recovery implementation
- Model / reasoning effort: primary commander implementation with independent code audit, reference research, and acceptance agents
- Worktree: `worktrees-next/editor-recovery`
- Branch: `agent/editor-recovery`
- Baseline SHA: `a4662b1d163d4d60d7ad0ed291ce4b0eebebc8b6`
- Implementation SHA: `b9b7558e` (documentation-only reconciliation follows this checkpoint)
- Demonstrable slice: durable owner-scoped editor outbox, cross-tab serialization/status, offline refresh recovery, explicit conflict comparison/actions, and session-safe version restore
- Approved research brief (or why none is needed): `.design/reference-research/editor-recovery.md` is being recorded by the reference-research owner; the accepted direction is IndexedDB outbox + Web Locks + BroadcastChannel + server revision/CAS, without CRDT in P05.

## Completed

- Added a versioned, account/document-scoped local backup envelope with `baseRevision` and `savedAt`.
- Restored local drafts for existing document routes after cloud state and related metadata load.
- Preserved unknown-base or stale-base backups and refused automatic cloud overwrite.
- Serialized autosave, manual save, publish pre-save, reconnect flush, and flat-workbench save through one coalescing queue.
- Prevented an older successful save from clearing a backup written by a newer edit.
- Added tab-local dirty state so a cross-tab `saved` broadcast cannot replace this tab's unqueued input.
- Made local backup removal compare the exact raw token captured by the saving tab, preserving another tab's later write.
- Migrated a changed first-save draft from the transient `new` key after the server returns its document ID.
- Closed first-insert `new`-key cleanup races for same-tab edits, other-tab edits, and storage quota/security failures; delayed cleanup runs only after a matching complete save.
- Migrated edits queued during the first insert to the returned cloud ID and scheduled their immediate follow-up drain.
- Added a versioned IndexedDB outbox with refresh recovery, immutable in-flight operations, follow-up revision advancement, conflict freezing/resolution, and first-insert cloud-ID binding.
- Added Web Locks plus local serialization and BroadcastChannel status, with safe browser fallbacks and SPA cleanup.
- Added an inline conflict comparison with explicit local/cloud/private-copy actions; autosave and reconnect remain frozen until resolution.
- Made document-conflict consume and restore atomic in one IndexedDB transaction, with failure-injection coverage for delete and replacement-write rollback.
- Preserved the newest durable cross-tab intent during conflict resolution and re-freeze, and synchronized that winner back into the visible comparison panel.
- Made the three conflict choices single-flight and resilient when localStorage access or browser recovery archiving is unavailable.
- Bound async editor reads and conflicts to an account epoch; sign-out/account changes clear sensitive UI and stale responses cannot repopulate it.
- Restored legacy versions with missing tags/relations/sources normalized to empty values instead of mixing current metadata.
- Preserved the active detailed/free write surface and its current document form across same-owner `SIGNED_IN` and `USER_UPDATED` refreshes while still resetting and restoring drafts on initial login, logout, or a real owner change.
- Added an explicit, keyboard-operable `重新加载文档` recovery action outside the inert editor; related-data failures and unexpected loader exceptions remain fail-closed without replacing user content with empty associations.

## Changed files and scope

- Allowed paths changed: account editor component/script/style; editor recovery, outbox and coordinator modules/tests; this handoff, current state, merge queue, and research brief.
- Non-authorized paths touched: none.
- Commander-owned hookup requested: none for the first checkpoint.

## Evidence

- Commands run and raw result summary at exact implementation HEAD `b9b7558e`: focused account/editor recovery tests 57/57 PASS; full Quartz tests 280/280 PASS; migration guard PASS; TypeScript PASS; `git diff --check` PASS; production build PASS with 284 Markdown inputs and 1,051 outputs. Tests include cross-tab backup-token replacement, same-tab first-insert edits, and injected first-ID-backup quota failure. Independent code re-review found no remaining P0/P1.
- UI evidence (viewport, theme, state, screenshot path/diff): independent signed-in Draft-preview acceptance opened the detailed editor and observed it remain active for at least 35 seconds, passing the write-surface auth-refresh regression. Public responsive checks at 1,313, 1,024, and 390 CSS pixels found no page-level horizontal overflow; desktop sidebar scrolling and medium navigation behavior were present. A later signed-in branch-preview run created an explicitly private Codex test draft, observed `云端草稿已保存` plus a bound document URL, reloaded that URL, and observed `已加载云端草稿` with the exact title/body, private-default copy, and version history intact. At a real 1,280 x 500 CSS-pixel desktop viewport, the personal-space nav measured 641 px scroll height against 484 px client height and moved from `scrollTop=0` to about 157 px, closing the sidebar overflow gate. A double-tab conflict attempt was safely denied when related-data loading remained incomplete; neither temporary divergent body became a new cloud version, the second tab was closed, and reloading the first restored the accepted cloud body. Static keyboard review confirmed the save action is in the natural focus order and hidden conflict controls are absent from the effective sequence. Offline storage, completed conflict actions, retry interaction, and actual step-by-step keyboard traversal remain open.
- Security evidence (owner / other user / anonymous): pure backup inspection rejects owner/document mismatch; production account-isolation browser evidence remains open.
- Migration or Edge Function deployed to production: **No**.

## Decisions and contracts

- Decision entries affected: preserves D-001 gap repair, D-002 isolated worktrees, and the existing server-authoritative revision contract.
- Contract changes requested: none in the first checkpoint. A later atomic save RPC would require a separately reviewed forward migration and contract entry.
- Types, fixtures, and tests synchronized: backup metadata and serialized queue have deterministic Node tests plus source-integration assertions.

## Risk and recovery

- Known risks: the browser outbox cannot eliminate the narrow server-commit/client-response gap for a first insert without a server idempotency key. Multi-table document/version/tag/link/source writes are still not one database transaction. Browsers without Web Locks fall back to same-page serialization and server revision conflict detection; two independently created transient `new` drafts still share one local identity. The selected write surface is not URL/session-backed, so a real reload before the first save returns to the launcher. IndexedDB/localStorage remain best-effort under quota, eviction, or private-mode restrictions. A forward atomic-save RPC and production deployment require separate review and authorization. Offline replay, completed conflict actions, retry interaction, and full keyboard evidence remain open.
- Rollback or forward-fix path: revert the isolated checkpoint to restore the former backup/debounce behavior; preferred forward fix is the approved IndexedDB outbox and conflict state machine.
- Blockers: none for local implementation. Production changes and future merge remain separately permissioned.
- Next task prerequisites: continue deployed-preview offline/conflict/retry and keyboard evidence when Chrome control and related-data reads are stable. Keep PR #26 Draft; do not mark Ready or merge without the remaining gate and explicit user approval.
