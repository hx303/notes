# Publication soft-delete boundary handoff

Date: 2026-07-17 (Asia/Shanghai)

## Scope and baseline

- Branch: `agent/publication-boundary`.
- Base: merged `main` `13cbf2e630ef6845c7e741d434104b38e93d8c68` (PR #18).
- Production-ledger operation record: `ab960d49`.
- Business migration: `20260718001100_publication_soft_delete_guard.sql`.
- Production deployment status: **not deployed**. This change is code, local verification, and PR scope only; production migration execution requires separate approval.

## P1 closed by the candidate

Before this change, `publish_document` rejected an already deleted source, but a later update to `documents.deleted_at` did not revoke the existing row in `document_publications`. The anonymous `SECURITY DEFINER` read/list RPCs queried only that snapshot table, so a soft-deleted public or unlisted document could remain readable.

The forward migration now:

1. Atomically removes the snapshot when `deleted_at` transitions from null to non-null and resets the source to `archived/private` with cleared publication metadata.
2. Deletes historical snapshots whose source is already soft-deleted and normalizes their stale public metadata.
3. Makes both anonymous RPCs join the matching source document and require `deleted_at IS NULL`, including owner-id equality, so privileged or historical orphan rows fail closed.
4. Rebuilds the existing owner SELECT/INSERT/UPDATE policies with the same live-source condition; owner DELETE remains owner-only for cleanup.
5. Adds a `BEFORE INSERT OR UPDATE` publication guard: INSERT locks the source document first; UPDATE performs a non-locking liveness check and forbids moving the source or owner, avoiding reverse lock order while rejecting deleted or cross-owner sources.
6. Preserves the existing RPC signatures and JSON contracts while changing `unpublish_document` and `moderate_publication` to use the same document-first lock order as publish and soft-delete paths.
7. Leaves hard-delete cascade behavior, anonymous table denial, publication table shape, AI settings, secrets, budgets, functions, and historical migrations unchanged.

## Verification evidence

- Migration namespace guard: pass.
- Final migration replay from a fresh disposable local Supabase database: pass through `20260718001100`.
- Local migration list: every disposable local version aligned and applied.
- Rollback-only database assertions: 16/16 exact named assertions pass, including public-id, unlisted-token, public-list, RLS, complete anonymous table denial, reader/write RPC ABI and ACL attributes, restore-without-republish, transaction rollback, cross-account denial, privileged orphan fail-closed behavior, and hard-delete cascade.
- Historical pre-migration orphan fixture: the forward migration removed the snapshot and normalized its source metadata; pass.
- Real two-connection races with 10-second lock timeouts:
  - publish commits before soft-delete: pass, final source deleted and snapshot absent;
  - soft-delete commits before publish: publish rejected, final snapshot absent;
  - direct snapshot insert commits before soft-delete: pass, final snapshot absent;
  - soft-delete commits before direct snapshot insert: insert rejected, final snapshot absent.
  - direct publication UPDATE commits before soft-delete: pass, final snapshot absent;
  - soft-delete commits before direct publication UPDATE: update affects no surviving snapshot; pass.
- The direct UPDATE races are reproducible from the committed `run-publication-concurrency.ps1` harness with two independent `psql` sessions and 10-second lock timeouts.
- Static guard tests: 5/5 pass.
- Full Quartz tests: 207/207 across 45 suites.
- TypeScript: pass.
- Production build: pass, 284 inputs and 1,046 outputs. Existing content-date and LaTeX warnings remain non-blocking.
- `git diff --check`: pass.
- Repository-wide `npm run check`: migration guard and TypeScript pass, but the final repository-wide Prettier phase still reports the pre-existing formatting backlog across hundreds of unrelated tracked files. The new TypeScript test was formatted directly and passes its focused Prettier check.

## Release gate

Merge may proceed only after independent P0/P1 review and green GitHub checks. Even after merge, do not run the new production migration without a fresh production operation record, backup/preflight, and explicit deployment authorization.
