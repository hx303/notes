# Handoff: `agent/p1b-outbox-replay`

- Role: P1B replay-safe editor outbox foundation
- Model / reasoning effort: Codex, inherited reasoning configuration
- Worktree: `worktrees-next/p1b-outbox-replay`
- Branch: `agent/p1b-outbox-replay`
- Baseline SHA: `bba87fe29ba1432d3cbe99b54d14f570633ea01f`
- Current SHA: `bba87fe29ba1432d3cbe99b54d14f570633ea01f` (changes intentionally uncommitted)
- Demonstrable slice: isolated snapshot-v1 outbox durability and lost-ack replay contract, deliberately disconnected from the current editor save path
- Approved research brief (or why none is needed): no external research is needed for this local durability slice; it implements the already-reviewed atomic RPC/outbox contract.

## Completed

- Added a physically separate snapshot-v1 IndexedDB database and store so legacy multi-write clients cannot mutate atomic replay rows.
- Kept an acknowledgement-unknown `saving` operation's ID, payload, document identity, and base revision immutable across refresh and network failure.
- Required a canonical persistent `draft:<uuid>` scope for new documents and grouped queue mutations by owner and scope.
- Added atomic created-document settlement: persist the draft-to-document binding, delete the original `saving` row, and rebind only same-scope queued follow-ups in one IndexedDB transaction.
- Made corrupt bindings, invalid created UUIDs, unsafe revision numbers, generic new scopes, and legacy rows fail closed.
- Kept legacy rows read-only for explicit manual recovery and documented that local mutation locking does not guarantee network serialization; correctness still relies on the server operation receipt.
- Left `accountPage.inline.ts` and the live save controller unchanged.

## Changed files and scope

- Allowed paths changed: `quartz/components/scripts/editorOutbox.ts`, `quartz/components/editorOutbox.test.ts`, `quartz/components/editorOutboxReplay.test.ts`, and this handoff.
- Non-authorized paths touched: none.
- Commander-owned hookup requested: only after the atomic snapshot RPC is reviewed and deployed, wire a stable draft scope, legacy manual-recovery gate, document-scoped best-effort lock, bounded retry, and snapshot-v1 settlement into the editor controller.

## Evidence

- Commands run and raw result summary: focused outbox tests `40/40` passed; full Quartz suite `336/336` passed; `tsc --noEmit` passed; changed-file Prettier check passed; `git diff --check` passed.
- UI evidence (viewport, theme, state, screenshot path/diff): none; the foundation is deliberately not connected to UI.
- Security evidence (owner / other user / anonymous): unit tests cover owner-and-scope isolation, cross-owner mutation rejection, independent concurrent draft scopes, legacy/manual-recovery separation, corrupted binding fail-closed behavior, and exact lost-ack replay identity. No database ACL is changed by this branch.
- Migration or Edge Function deployed to production: **No**.

## Decisions and contracts

- Decision entries affected: no existing decision is reversed.
- Contract changes requested: future controller integration must preserve the new `snapshot-v1` provenance, isolated storage, canonical draft scope, safe-integer revision, persistent binding, and atomic local settlement contract.
- Types, fixtures, and tests synchronized: yes; replay repository, binding, record parsing, memory/IndexedDB adapters, and focused regression tests are synchronized.

## Risk and recovery

- Known risks: this foundation does not itself serialize network calls; browser Web Locks are best effort, and server idempotency remains mandatory. The future controller must open the legacy database separately for manual recovery and must persist the same draft scope across tabs/routes. The atomic RPC and its production migration remain separate gates.
- Rollback or forward-fix path: leave the legacy constructor wired and remove or stop using the isolated snapshot-v1 constructor/database; no legacy rows or production data are migrated by this slice.
- Blockers: atomic snapshot RPC review/deployment and explicit authorization for any editor hookup or production migration.
- Next task prerequisites: merge/deploy migrations in their reviewed order, verify the RPC receipt and concurrency matrix, then integrate the controller without a legacy fallback.
