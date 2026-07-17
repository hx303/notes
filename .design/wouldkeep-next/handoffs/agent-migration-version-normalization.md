# Handoff: `agent/migration-version-normalization`

- Role: platform migration normalization, integrated by root/commander
- Model / reasoning effort: GPT-5 high
- Worktree: `worktrees-next/ai-live-canary`
- Branch: `agent/migration-version-normalization`
- Baseline SHA: `12852207`
- Current SHA: local working tree; commit pending final replay evidence
- Demonstrable slice: unique forward migration versions with pinned legacy SQL and production-ledger baseline
- Approved research brief (or why none is needed): official Supabase CLI parser/history/repair behavior reviewed by reference-research

## Completed

- Replaced duplicate date-version migration identities with five comment-only legacy ledger markers and ten unique post-ledger versions.
- Preserved the ten original SQL files byte-for-byte and pinned SHA-256 values.
- Added a static migration/history guard, exact production-tuple tests, deployment-workflow enforcement, documentation, and current reference updates.
- Recorded root/integrator's temporary ownership for `package.json` and `accountPage.inline.ts`; changes are limited to the CI guard hookup and migration filename references.

## Changed files and scope

- Allowed paths changed: Supabase migrations/functions documentation, migration guard/tests, deployment workflow, normalization evidence, and Wave 2 state records.
- Non-authorized paths touched: `package.json` and `quartz/components/scripts/accountPage.inline.ts` under explicit root/integrator temporary handoff; no functional UI behavior changed.
- Commander-owned hookup requested: root integrated `check:migrations` into the existing `check` command.

## Evidence

- Commands run and raw result summary: `npm run check:migrations` pass; full Quartz tests 202/202 pass; TypeScript pass; production build pass with 284 inputs and 1,046 outputs; linked migration list/dry-run read-only pass with only ten new versions pending; two disposable local resets pass with identical schema SHA-256 `8ca4051d41d8c46856ca632305e19b8f6eb048568f5144cba77a424249806db2`.
- UI evidence (viewport, theme, state, screenshot path/diff): not applicable; no UI behavior change.
- Security evidence (owner / other user / anonymous): clean local replay passed; both existing transaction-style SQL assertion scripts passed via `psql -v ON_ERROR_STOP=1` with synthetic owner/other profiles, including anonymous access checks. Full production object equivalence remains a release gate.
- Migration or Edge Function deployed to production: **No**.

## Decisions and contracts

- Decision entries affected: none; follows D-002 serial integration and the forward-only migration rule.
- Contract changes requested: none; deployment-state wording reconciled to the already recorded default-off production state.
- Types, fixtures, and tests synchronized: active migration filename references and guard tests updated.

## Risk and recovery

- Known risks: ledger pins, clean replay, and dry-run do not prove production schema equivalence. The replay requires documented `schema.sql` plus a disposable synthetic owner fixture because the historical site-owner migration intentionally requires the verified production identity to pre-exist.
- Rollback or forward-fix path: before merge, revert this isolated commit. After any future ledger repair, preserve old rows and use separately approved forward-only history corrections.
- Blockers: production object-level equivalence before proposing ledger repair.
- Next task prerequisites: independent final acceptance, then ask separately for PR publication/merge and production ledger repair.
