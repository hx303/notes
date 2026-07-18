# Handoff: `agent/workspace-novice-import`

- Role: Workspace novice-flow implementation (P03/P04 import hardening)
- Model / reasoning effort: GPT-5.6 inherited from commander
- Worktree: `worktrees-next/workspace-novice-import`
- Branch: `agent/workspace-novice-import`
- Baseline SHA: `a6ef3be6d981ab005ac56522b9d0c7df25db3df1`
- Current functional SHA: `6a481f98`
- Demonstrable slice: A novice can inspect a local DOCX/UTF-8 Markdown file as a bounded, private preview and explicitly place it into the editor without stale imports or failed parses overwriting an existing draft.
- Approved research brief: Existing P03/P04 task and acceptance documents were sufficient; no new external research was needed for this implementation slice.

## Completed

- Added explicit UTF-8, 10 MB, expanded-content, DOM-node, image-count, and image-byte limits.
- Added DOCX central-directory preflight for corruption, encryption, unsupported ZIP variants, oversized entries, aggregate expansion, and suspicious compression ratios.
- Added latest-request-wins sequencing and invalidation on close, reopen, Escape, and Quartz SPA cleanup.
- Kept all editor writes behind a one-shot confirmation; validation, dependency, conversion, and preview failures preserve the existing editor contents.
- Added local-only import preview rendering with same-origin lazy parser dependencies, strict DOMPurify allowlists, retry UI, and file context.
- Parsed preview HTML through an inert `template.content` before sanitization, then filtered images before appending the fragment to the live DOM.
- Added focused helper, fixture, source-contract, account-stability, and security regression coverage.

## Changed files and scope

- Allowed paths changed:
  - `quartz/components/AccountPage.tsx`
  - `quartz/components/accountImportHardening.test.ts`
  - `quartz/components/accountPageStability.test.ts`
  - `quartz/components/scripts/accountPage.inline.ts`
  - `quartz/components/scripts/importDraft.ts`
  - `quartz/components/styles/accountPage.scss`
- Non-authorized paths touched: none in functional commit `6a481f98`.
- Commander-owned hookup present but intentionally not committed by this agent: `package.json`, `package-lock.json`, and `quartz/plugins/emitters/static.ts` (locked parser dependencies, vendor emission, and integrity checks).

## Evidence

- Bundled-node TypeScript check: PASS.
- Full Quartz test command: PASS, 226/226.
- Focused import/account tests after final formatting: PASS, 15/15.
- `git diff --check`: PASS.
- Quartz production build: PASS, 284 inputs and 1050 emitted files; only pre-existing content-date and LaTeX warnings were observed.
- Emitted vendor evidence: `mammoth-1.12.0.min.js`, `marked-15.0.12.umd.js`, `purify-3.4.12.min.js`, and `turndown-7.2.0.js` exist under `public/static/vendor/workspace-import/`.
- UI evidence: automated source/behavior/responsive assertions only. Real-browser drag/drop, keyboard, network-panel, and visual evidence are **NOT PROVEN** by this agent and remain assigned to independent QA.
- Security evidence: tests prove remote Markdown/raw HTML images are removed before parsing, raw preview HTML is parsed in inert `template.content`, the sanitizer receives `template.content`, only approved data-image formats survive a private preview, and no editor write happens before confirmation. Live browser request capture is **NOT PROVEN**.
- Migration or Edge Function deployed to production: **No**.

## Decisions and contracts

- Decision entries affected: none.
- Contract changes requested: none; this tightens the existing workspace import contract.
- Types, fixtures, and tests synchronized: yes; locked Mammoth fixtures verify heading, paragraph, list, table, and embedded PNG conversion.

## Risk and recovery

- Known risks:
  - Mammoth conversion itself is not hard-cancellable; request invalidation prevents stale UI/editor mutation, while size and ZIP preflight bounds reduce resource exposure. Moving conversion to a worker remains a later hardening option.
  - Full fake-DOM coverage of every cancel/accept/editor-preservation path is **NOT PROVEN**; pure sequencing tests and source/behavior assertions cover the critical state boundaries.
  - Real-browser DOCX import, focus behavior, and zero-network preview verification remain for independent QA.
- Rollback or forward-fix path: revert `6a481f98`; commander can separately remove the dependency/vendor emitter hookup if the whole slice is rolled back.
- Blockers: none for code review; browser QA remains a merge gate at commander discretion.
- Next task prerequisites: integrate the commander-owned dependency/static-emitter changes, then run independent browser acceptance across desktop/mobile widths, dark mode, keyboard, stale-request cancellation, and network inspection.
