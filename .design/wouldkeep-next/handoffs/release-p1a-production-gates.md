# Handoff: `release/p1a-production-gates`

- Role: production-gate hardening for release slice A
- Model / reasoning effort: GPT-5 high with independent release and acceptance review
- Worktree: `worktrees-next/release-p1a-production-gates`
- Branch: `release/p1a-production-gates`
- Baseline SHA: `383a0ff1661aa3673bd8c34d29776da6bf40bc8e`
- Current SHA: local branch head; see the Draft PR
- Demonstrable slice: executable preflight, postflight, rollback-only behavior, residue gates, and a reproducible single-migration runbook for `20260722000100`
- Approved research brief (or why none is needed): no external research needed; this slice locks the reviewed migration, the latest verified production schema backup, and repository SQL-test conventions

## Completed

- Added a production-safe read-only preflight that fails closed on function, ACL, RLS, policy, owner-role, and migration-ledger drift.
- Added a matching read-only postflight contract with the hardened function-body fingerprint and exact `20260722000100` ledger row.
- Added a disposable rollback-only matrix that applies the exact migration twice, verifies idempotency, and covers protected-owner, ordinary-user, caller-mismatch, anonymous, and allowed non-owner role-change behavior.
- Added a separate read-only residue probe and a static guard that derives catalog fingerprints from the reviewed migration sources.
- Added a single-statement activity gate and a separate single-statement owner-state fingerprint so Supabase CLI `2.109.1` can execute every production-safe query without multi-statement prepared-query failures.
- Added a fail-closed PowerShell 7 runbook that separates disposable and production inputs, parses non-agent migration JSON with split stdout/stderr, pins backup/evidence requirements, revalidates identity immediately before the write, permits exactly one pending migration, and enforces preflight/postflight fingerprint equality.

## Changed files and scope

- Allowed paths changed: `supabase/tests/**`, `quartz/scripts/siteOwnerRoleInvariant.test.ts`, `.design/wouldkeep-next/runbooks/**`, and this handoff.
- Non-authorized paths touched: none.
- Commander-owned hookup requested: none; the existing Quartz test glob discovers the expanded static guard.

## Evidence

- Commands run and raw result summary:
  - focused Node test: 8/8 passed, including read-only gate parsing, source-derived fingerprints, the activity/lock gate, rollback parser hardening, the complete identity matrix, residue coverage, and the runbook contract;
  - full Node suite: 323/323 passed across 45 suites;
  - Supabase migration guard: passed (`Supabase migration versions and legacy history map are consistent.`);
  - TypeScript: `tsc --noEmit` passed;
  - formatting and patch hygiene: targeted Prettier check and `git diff --check` passed;
  - runbook execution surface: all 11 PowerShell blocks passed AST parsing under Microsoft Store PowerShell `7.6.4`; synthetic helpers accepted the exact pre/post JSON ledgers and single migration, rejected extra, missing, and malformed migration rows, rejected failed activity output, and rejected duplicate fingerprints;
  - actual Supabase CLI `2.109.1` local checks: non-agent JSON migration output used the pinned root/row schema; the single-statement activity gate returned its pass sentinel and `300`-second threshold; the state query returned exactly one fingerprint; and the preflight reached its intended catalog assertion instead of the former multi-statement prepared-query error;
  - production build: passed with 284 Markdown inputs and 1,051 emitted files; existing content-date and LaTeX compatibility warnings remained non-blocking;
  - disposable PostgreSQL 17 replay: migrations through `20260721000100` applied without a remote project link;
  - rollback-only behavior matrix: 8/8 scenarios passed after applying the exact `20260722000100` migration twice, and the script ended in `ROLLBACK`;
  - disposable fail-closed guard: omitting the unique confirmation variable was rejected before `BEGIN` with psql exit code `3`, and the immediate residue probe still returned `0/0/0/0`;
  - independent residue probe: synthetic users/profiles/roles/site-owner rows were `0/0/0/0`;
  - read-only preflight, state query, exact migration, contract, and second state query passed in one PostgreSQL 17 transaction-scoped production-baseline simulation; both state queries emitted matching fingerprint `df2af8803e21462c1d4bb641b209b915`, the transaction ended in rollback, and a follow-up check proved the original function fingerprint and 22-row disposable ledger were restored.
  - independent final acceptance of the completed CLI-compatible runbook: P0 0, P1 0; approved for commit and Draft PR push only, not merge or production deployment.
- UI evidence (viewport, theme, state, screenshot path/diff): not applicable; no UI or runtime code changes.
- Security evidence (owner / other user / anonymous): rollback-only matrix covers protected owner self/other-owner denial, caller UUID mismatch, ordinary authenticated denial, anonymous ACL denial, and the retained owner-to-non-owner success path; all fixture writes end in a top-level rollback and a separate zero-residue probe.
- Migration or Edge Function deployed to production: **No**.

## Decisions and contracts

- Decision entries affected: none; follows D-002 isolated-worktree and serial-integration policy.
- Contract changes requested: none; this PR makes the existing site-owner invariant verifiable without changing the migration or production behavior.
- Types, fixtures, and tests synchronized: old/new `grant_role` and `is_site_owner` body fingerprints are derived from source, while SQL gates and scenario names are statically pinned.

## Risk and recovery

- Known risks: catalog rendering is intentionally pinned to the current PostgreSQL 17 production baseline; a major-version upgrade requires a clean replay and reviewed fingerprint refresh. This validation host now has Microsoft Store PowerShell `7.6.4`, and the runbook still fails closed on any future host that does not provide PowerShell 7 or newer. The disposable confirmation variable is deliberate operator opt-in, not physical connection-string attestation. Production currently grants anonymous callers execute on `is_site_owner(UUID)`; `20260722000100` does not change that existing ACL, so this gate records it accurately. Removing that metadata exposure requires a separate reviewed ACL migration rather than hiding it inside this test-only slice.
- Rollback or forward-fix path: before merge, close or revert this test-only PR. After deployment, preserve the fail-closed invariant and use a new reviewed forward migration for any defect.
- Blockers: Draft PR checks must pass before requesting Ready/merge; production still requires a separate explicit backup/preflight/single-migration deployment authorization.
- Next task prerequisites: Draft PR checks, independent review, explicit merge approval, then separate backup/preflight/single-migration deployment approval.
