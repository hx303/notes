# Handoff: `release/p1b-00200-preflight-sentinel`

- Role: 00200 production preflight transport repair
- Model / reasoning effort: GPT-5.6, high
- Worktree: `worktrees-next/p1b-00200-preflight-sentinel`
- Branch: `release/p1b-00200-preflight-sentinel`
- Baseline SHA: `4ff869b93728bff0c130f099f12df19fde5c997f`
- Current checkpoint SHA: `62cd32045f890eb012ff089c21550d63b6e99256`; this handoff evidence follows the implementation checkpoint
- Demonstrable slice: make the already-reviewed 00200 read-only preflight expose exactly one success-only result through the pinned Supabase CLI 2.109.1 linked query channel
- Approved research brief (or why none is needed): none; this is a bounded correction based on direct production-safe transport evidence and the existing 00150 preflight pattern

## Completed

- Reproduced the production preflight stop without performing a production write.
- Ruled out login connectivity, `DO` support, SQL size, and the Management API query path with successful small, 10 KB, and 12 KB read-only probes.
- Proved the full original 00200 assertion block succeeds when followed by a real result row: exit zero and exactly one visible sentinel.
- Replaced the success-only `RAISE NOTICE` with one aggregate-only `SELECT` row. Any failed assertion still aborts before the sentinel can be returned.
- Added a static regression assertion that pins two read-only top-level statements and exactly one success marker.
- Documented why the pinned linked query channel must not rely on notices.
- Published the verified slice as Draft PR #41; all three initial Vercel checks passed.

## Changed files and scope

- Allowed paths changed:
  - `.design/wouldkeep-next/handoffs/release-p1b-00200-preflight-sentinel.md`
  - `.design/wouldkeep-next/runbooks/20260722000200-atomic-document-snapshot-save.md`
  - `quartz/scripts/atomicDocumentSaveGuard.test.ts`
  - `supabase/tests/20260722_atomic_document_snapshot_preflight.sql`
- Non-authorized paths touched: none.
- Commander-owned hookup requested: none.

## Evidence

- Commands run and raw result summary:
  - Original production preflight through `db query --linked --file`: exit zero but no visible sentinel because the CLI suppresses `RAISE NOTICE`.
  - Read-only activity gate: exit zero, one visible sentinel.
  - Read-only no-data SELECT probes at approximately 10 KB and 12 KB: exit zero, one visible sentinel.
  - Minimal read-only `DO` plus `SELECT`: exit zero, one visible sentinel.
  - Full original production preflight with an in-memory explicit `SELECT`: exit zero, one visible sentinel, proving every assertion passed.
  - Final corrected preflight file through pinned Supabase CLI 2.109.1 against the linked production project: exit zero, exactly one visible sentinel, six output lines, and no production write.
  - Focused atomic-save static guard: **13/13 passed**.
  - Supabase migration-history guard: passed.
  - TypeScript `--noEmit`: passed.
  - Full Quartz suite: **370/370 passed**.
  - Production build: passed with 284 Markdown inputs and 1,051 emitted files; existing untracked-date and LaTeX Unicode warnings remain non-blocking.
  - Targeted Prettier check and `git diff --check`: passed.
  - No third backup batch was started; earlier stopped evidence remains non-reusable for deployment.
- UI evidence (viewport, theme, state, screenshot path/diff): not applicable; no UI files changed.
- Security evidence (owner / other user / anonymous): business SQL and authorization contracts are unchanged; the new row reads aggregate counts only after every existing fail-closed assertion passes.
- Migration or Edge Function deployed to production: **No**.

## Decisions and contracts

- Decision entries affected: none.
- Contract changes requested: none; this repairs observability of the existing preflight contract.
- Types, fixtures, and tests synchronized: preflight SQL, production runbook, and static guard are synchronized.

## Risk and recovery

- Known risks: PR #41 must be explicitly authorized for Ready/merge and then used from a clean latest-main worktree before any new production evidence can be trusted.
- Rollback or forward-fix path: revert the four-file release-gate-only change; no schema or production state changed.
- Blockers: Ready/merge, a new backup/preflight batch, and deployment each remain separate authorization gates.
- Next task prerequisites: request explicit authorization to mark PR #41 Ready and merge it. The already-merged PostgreSQL 17 exact `19 -> 20 -> 21` proof is unchanged; after merge, production evidence must restart from a clean latest-main worktree and a fresh evidence directory.
