# wouldkeep Decision Log

Append new entries; never rewrite prior decisions. Each reversal must cite new evidence and its affected contracts.

## D-001 — Reconcile before rebuilding

- Date: 2026-07-16
- Question: Should unchecked legacy task boxes be treated as missing implementation?
- Options: rebuild from task files; inspect code/deployment evidence first.
- Decision: inspect and classify reality first. Legacy boxes are planning history, not authoritative state.
- Reason: public discovery, workspace, organization, source/version, publication, admin, and AI foundation code already exist.
- Impact: Wave 1 tasks are gap-finding vertical slices, not greenfield rewrites.
- Re-evaluate when: a route or contract is proven absent in code and online behavior.

## D-002 — Serial integration with isolated worktrees

- Date: 2026-07-16
- Question: How should parallel work be integrated?
- Options: all agents edit one checkout; isolated worktrees with a serial merge queue.
- Decision: one branch/worktree per agent, and only one functional branch in verification at a time.
- Reason: account, layout, and folder-routing files are high-conflict hotspots.
- Impact: shared hookups are commander-owned; feature agents report requested hookups in handoffs.
- Re-evaluate when: file ownership can be proven non-overlapping and integration checks remain stable.

## D-003 — Preserve the current Quartz visual system

- Date: 2026-07-16
- Question: Introduce another heavy UI framework?
- Decision: no. Continue with Quartz 4.5.2, Preact, TypeScript, and SCSS.
- Reason: the product already has a coherent component/token system and static-first delivery.
- Impact: new dependencies require commander approval, size/license evidence, and a reuse analysis.
- Re-evaluate when: a required capability cannot be implemented safely with the current stack.

## D-004 — Public readers consume snapshots, not private source rows

- Date: 2026-07-16
- Question: How can public discovery expose account-authored knowledge?
- Decision: public/unlisted reads consume a whitelisted publication snapshot; private `documents` remain owner-scoped.
- Reason: this minimizes accidental private-field exposure and allows revocation.
- Impact: author pages and public discovery must depend on the publication contract, not broaden document RLS.
- Re-evaluate when: versioned public snapshots gain a separately reviewed contract.

## D-005 — AI remains consent-first and cost-closed

- Date: 2026-07-16
- Question: When may real model calls begin?
- Decision: keep AI disabled by default, monthly budget at zero, no model secret, and only the fixed mock gateway until signed-in validation and later budget/audit gates pass.
- Reason: private knowledge, cross-account isolation, and cost require explicit proof before model connectivity.
- Impact: AI output cannot overwrite or publish content; later suggestions require preview, explicit acceptance, and base-version checks.
- Re-evaluate when: N00, A20, production snapshot, and user approval are complete.
