# Handoff: `agent/ai-foundation-auth-qa`

- Role: independent account/auth stability and responsive UI QA
- Branch under test: `agent/ai-foundation-auth-ui`
- Candidate SHA: `7f08b1b`
- Baseline SHA: `999145c9b266b6c470d1e95ba70a3e2037202273`
- QA verdict: **PASS — no P0/P1 blocker remains**

## Findings and disposition

| Severity | Baseline finding | Candidate disposition |
| --- | --- | --- |
| P1 | At 1200px Quartz's tablet grid moved the right rail below the account content, producing a 2223px page and roughly 900px of dead tail space. | Passed. The account route owns one centered track; the candidate measures about 1141px high, with the side rails removed. |
| P1 | At 1024px the login hero was squeezed into about 177px while the form stayed 320px; at exactly 800px the layout still retained a 320px empty left rail and then changed abruptly at 799px. | Passed by route-scoped single-track layout and content-driven collapse at 900px. |
| P1 | At 375/320px the fixed mobile reading controls overlapped the authentication panel. | Passed. The shared control is suppressed on the account route; measured box is 0x0 and screenshots show no overlap. |
| P1 | Auth initialization and SPA revisits could accumulate global listeners/subscriptions; loading used no honest stable state; submits had incomplete duplicate guards. | Passed by cleanup registration, single subscription, explicit loading state, bounded initialization, and per-form pending locks. |
| P1 found during candidate review | Forgot-password submit rejected before attempting SDK reconnection (`!client || !value`). | Fixed before final QA. It now validates only the email first and calls `ensureClient(true)`; positive and negative regression assertions were added. |
| P2 | Mobile secondary links were below the 44px target size. | Passed through 44px minimum targets. |
| P2 verification boundary | A real CDN request that remains pending for the full 8-second timeout and then recovers could not be deterministically injected in the browser because the SDK was already cached. | Non-blocking. Failed-script eviction, online retry, form retry, and the forgot-password ordering fix are covered structurally and by regression tests. A signed-in staging smoke remains advisable. |

## Viewport and interaction matrix

- 1536px light/dark: balanced 608px hero plus 416px panel inside a 1240px account shell; header gutters restored; no side rails or dead tail.
- 1200px light: page height reduced from about 2223px to 1141px; primary content remains above the fold and horizontally balanced.
- 1024/800px: baseline breakpoint defects documented; candidate's 900px collapse rule removes the persistent rail and crushed hero condition.
- 375/320px light/dark: no horizontal overflow (`scrollWidth <= viewport`), no fixed-tool overlap, and form controls remain usable.
- 200% equivalent (768 CSS px): baseline already reflowed without horizontal overflow; candidate preserves the single-column path.
- Keyboard: password input shows a visible 2.67px blue outline with 2px offset in dark mode. Password visibility toggle preserves the value and updates `aria-pressed`/accessible label.
- Forms/routes: sign-in, sign-up, forgot-password, and recovery expose appropriate email/current-password/new-password autocomplete semantics and a reserved live-status region.
- Workspace gate: baseline 1200px layout placed the login panel below the first fold and produced a 2713px page. Candidate moves the workspace collapse threshold to 1180px and removes account-route side-rail interference.

## Evidence

Baseline screenshots and measured JSON are in `.design/wouldkeep-next/evidence/auth-ui/`; candidate comparison evidence is in its `candidate/` directory. The strongest comparison artifacts are:

- `account-1200-light.png` and `candidate/account-1200-light.png`
- `account-800-light.png`, `metrics-800.json`, and candidate route-scoped layout assertions
- `account-375-light.png`, `account-320-light.png`, and candidate equivalents
- `workspace-gate-1200-light.png` and `metrics-workspace-1200.json`
- baseline and candidate `account-1536-dark-password-focus.png` plus `keyboard-focus.json`
- `candidate/account-1536-dark-loading-timeout.png`, which confirms the bounded SDK failure reaches a recoverable, visible error state without leaving the page indefinitely busy

The candidate implementation agent independently reports:

- focused account tests: 5/5 passed
- full suite: 145/145 passed
- TypeScript: passed
- production build: passed (284 inputs, 1046 outputs; pre-existing warnings only)
- `git diff --check`: passed

## Merge guidance

No QA-authored product code is included in this branch. The candidate `7f08b1b` is clear to integrate. After integration, use a real staging Supabase session for one signed-in workspace smoke and one deliberately blocked/slow SDK retry when network interception is available; neither is a current merge blocker.
