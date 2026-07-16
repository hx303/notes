# Handoff: `agent/ai-foundation-auth-ui`

- Role: account/auth UI stability and responsive-layout implementation
- Model / reasoning effort: GPT-5, strong reasoning with independent QA review
- Worktree: `C:\Users\23012\Documents\Codex\2026-07-16\c-users-23012-desktop-wouldkeep\worktrees-next\auth-ui`
- Branch: `agent/ai-foundation-auth-ui`
- Baseline SHA: `999145c9b266b6c470d1e95ba70a3e2037202273`
- Current SHA: vertical-slice commit created with this handoff; exact SHA reported to the commander after commit.
- Demonstrable slice: stable account authentication states plus desktop/mobile account layouts that reclaim Quartz side rails without horizontal overflow.
- Approved research brief (or why none is needed): none; this was a bounded defect-reproduction and implementation task against the existing design context and route contracts.

## Completed

- Added an announced, height-stable authentication loading state so the form does not flash before session resolution.
- Made login, password reset, and recovery submissions idempotent while pending, with retained input and recoverable error messaging.
- Added in-place Supabase SDK retry after initial timeout, including failed-script cache eviction and a single auth subscription.
- Cleaned auth subscriptions, online listeners, timers, cropper state, and object URLs during Quartz SPA navigation.
- Prevented workspace subrequest failures from incorrectly clearing a valid signed-in identity.
- Removed account-route side rails, dead article header/footer chrome, and the overlapping mobile reading toolbar.
- Rebalanced desktop columns and introduced content-driven collapse points for account and workspace screens.
- Restored page gutters, 44px mobile targets, reduced-motion handling, and narrow-screen overflow protection.
- Added focused structural regression coverage for loading, lifecycle cleanup, duplicate submission locks, retry behavior, and responsive route scoping.

## Changed files and scope

- Allowed paths changed: `quartz/components/AccountPage.tsx`, `quartz/components/scripts/accountPage.inline.ts`, `quartz/components/styles/accountPage.scss`, `quartz/components/accountPageStability.test.ts`.
- Governance handoff added: `.design/wouldkeep-next/handoffs/agent-ai-foundation-auth-ui.md`.
- Non-authorized paths touched: none. Browser/build artifacts were temporary and removed or ignored.
- Commander-owned hookup requested: cherry-pick or merge the reported commit into the integration branch; no additional route hookup is required.

## Evidence

- `node_modules\.bin\tsx.cmd --import ./quartz/testing/register-assets.mjs --test quartz/components/accountPageStability.test.ts quartz/components/accountAiFoundation.test.ts`: 5/5 passed.
- Full test suite: 145/145 passed.
- `node_modules\.bin\tsc.cmd --noEmit`: passed.
- `git diff --check`: passed.
- `node quartz/bootstrap-cli.mjs build`: passed; 284 inputs and 1046 outputs. Existing untracked-content date and LaTeX warnings remain unchanged.
- UI evidence: independent QA and commander visual review passed at 1536, 1200, 375, and 320 CSS-pixel widths in the light theme. At 1200 the account page height dropped from 2223px to 1141px with side rails removed; at 375 there was no horizontal overflow and the shared mobile reading toolbar was hidden. Temporary screenshots were deleted after review.
- Authentication states exercised structurally: initial loading, SDK timeout, retry, duplicate submit prevention, network failure, signed-out form, recovery, and cleanup on SPA replacement.
- Security evidence: no authorization policy, owner checks, database access, or production data path changed; identity is no longer cleared by unrelated workspace request failure.
- Migration or Edge Function deployed to production: **No**.

## Decisions and contracts

- Decision entries affected: none.
- Contract changes requested: none; account/workspace route names, Supabase auth API usage, and data contracts are preserved.
- Types, fixtures, and tests synchronized: TypeScript and the new account stability regression tests pass with the full repository suite.

## Risk and recovery

- Known risks: the route-scoped layout uses modern CSS `:has()` support; the supported Chromium/Edge target is covered. Supabase CDN retry remains bounded by an 8-second timeout and reports a recoverable error rather than blocking indefinitely.
- Rollback or forward-fix path: revert the single vertical-slice commit; there are no database, migration, Edge Function, or production-state side effects.
- Blockers: none.
- Next task prerequisites: integrate the commit, then run the normal signed-in staging smoke test when a staging Supabase session is available.
