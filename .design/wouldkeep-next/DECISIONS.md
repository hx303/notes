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

## D-006 — Prepare DeepSeek behind a provider boundary without enabling calls

- Date: 2026-07-16
- Question: How should the first real-model API be prepared after the mock gateway is accepted?
- Options: wire DeepSeek directly into `ai-write`; add a provider adapter and keep the runtime mock-only; add a general SDK dependency.
- Decision: add a small server-only provider interface and a first-party DeepSeek Chat Completions adapter, but do not call it from `ai-write`, configure a key, deploy a function, or enable paid traffic in this slice.
- Reason: the site owner requested DeepSeek-first support, while A20 budget/audit controls and the production safety snapshot are still incomplete. Separating adapter readiness from runtime enablement preserves the accepted zero-cost gateway.
- Current official contract: `https://api.deepseek.com/chat/completions`, Bearer authentication, `deepseek-v4-flash` as the default economical model, optional `deepseek-v4-pro`; legacy `deepseek-chat` and `deepseek-reasoner` are scheduled for deprecation on 2026-07-24.
- Privacy decision: the current DeepSeek endpoint reference does not document an OpenAI-style `store:false` request field or a guaranteed zero-retention capability; its disk context cache is enabled by default and unused entries are usually cleared only after hours to days. The adapter therefore declares `supportsZeroRetention=false`; private content must not be routed to it without a separately reviewed data-processing decision.
- Impact: provider code must be fetch-injected and testable without network access, normalize provider errors, enforce timeout/abort, and never expose a secret to Quartz/browser code, logs, or responses. Existing mock response and API contract remain unchanged.
- Re-evaluate when: A20 is complete, a production operation record exists, the site owner supplies the key through a Function Secret, and a separate live-call/deployment approval is granted.
- Official sources checked: [API quick start](https://api-docs.deepseek.com/), [Chat Completions reference](https://api-docs.deepseek.com/api/create-chat-completion/), [error codes](https://api-docs.deepseek.com/quick_start/error_codes/), [context caching](https://api-docs.deepseek.com/guides/kv_cache), and [privacy policy](https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html?locale=en_US).
