# Handoff: `release/p1b-tag-normalization-22000150`

- Role: P1B production tag-normalization prerequisite
- Model / reasoning effort: GPT-5 with independent migration, test, and acceptance review
- Worktree: `worktrees-next/release-p1b-tag-normalization-22000150`
- Branch: `release/p1b-tag-normalization-22000150`
- Baseline SHA: `19571ca19dabc80aeacac7a1ac016667dcaa9f0f`
- Current SHA: local branch head; see the Draft PR after publication
- Demonstrable slice: in-place NFKC/whitespace/lowercase normalization before `20260722000200`, preserving tag identity and all document references
- Approved research brief (or why none is needed): no external research needed; this slice follows the reviewed P1B canonical formula, PostgreSQL constraints, and repository release-gate conventions

## Completed

- Added the forward `20260722000150` migration with bounded locks, fail-before-write validation, projected collision detection, deterministic temporary unique keys, two exact update phases, and post-write whole-set invariants.
- Added aggregate-only production preflight, postflight, activity, and state-fingerprint gates. No production tag value, UUID, account content, backup, or connection detail is present.
- Added synthetic rollback-only positive and negative fixtures covering six compatibility-form tags, a transient non-deferrable unique-key swap, 65 exact references, second-apply idempotency, projected collision rejection, punctuation-only rejection, and zero residue.
- Added a static SQL/runbook guard and a branch-specific single-migration production runbook.

## Changed files and scope

- Allowed paths changed: one `supabase/migrations/20260722000150_*` file, target-specific `supabase/tests/**`, one `quartz/scripts/**` guard, one runbook, and this handoff.
- Non-authorized paths touched: none.
- Commander-owned hookup requested: none; the existing Quartz test glob discovers the new guard.

## Evidence

- Commands run and raw result summary:
  - migration-history guard: pass;
  - TypeScript `--noEmit`: pass;
  - targeted Prettier check for the new Markdown/TypeScript files: pass;
  - tag-normalization static guard: 7/7 pass;
  - full repository suite: 331/331 pass;
  - isolated Quartz production build: pass (284 inputs, 1,051 emitted files; existing content/LaTeX warnings only);
  - disposable PostgreSQL behavior matrix: empty replay, six in-place normalizations, transient unique-key swap, 65 preserved references, second-apply no-op, and zero residue all pass;
  - disposable negative cases: missing confirmation, projected collision, and invalid canonical value each fail closed with the expected `psql` exit code and stable error, followed by zero residue;
  - aggregate state-fingerprint SQL parses and returns the expected count-plus-four-SHA-256 shape.
  - unified `npm run check`: migration history and TypeScript phases pass, then the repository-wide Prettier phase reports 645 unrelated baseline files; every format-supported file in this slice passes the targeted check.
  - independent read-only acceptance: **ACCEPT**, with no P0/P1 findings; the existing repository-wide Prettier debt is the only P2 observation.
- UI evidence (viewport, theme, state, screenshot path/diff): not applicable; no UI change.
- Security evidence (owner / other user / anonymous): this is owner-neutral data repair; synthetic tests prove only the two authorized tag columns change and every identity/reference field is preserved.
- Migration or Edge Function deployed to production: **No**.

## Decisions and contracts

- Decision entries affected: none; follows isolated-worktree and serial-integration policy.
- Contract changes requested: none; this migration only makes existing rows satisfy the already-reviewed P1B tag contract.
- Types, fixtures, and tests synchronized: SQL canonicalization is statically pinned to the `20260722000200` formula; production counts and synthetic scenarios are separately enforced.

## Risk and recovery

- Known risks: NFKC normalization is intentionally one-way; a future production run must use this branch because current `main` also contains the not-yet-deployed `20260722000200`.
- Rollback or forward-fix path: before deployment, close/revert the PR. After deployment, preserve backups and use a separately reviewed forward fix or controlled restore; never reconstruct Unicode spellings by guesswork.
- Blockers: Draft PR checks and later explicit merge/deployment authorizations.
- Next task prerequisites: push as Draft only; do not merge or deploy.
