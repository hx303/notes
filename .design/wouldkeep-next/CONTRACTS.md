# wouldkeep Cross-Worktree Contracts

State: PR #16 merged baseline with the reviewed DeepSeek/A20 production boundary deployed default-off. Contract changes require a logged request, commander approval, synchronized migrations/types/fixtures/tests, and notification to dependent agents.

## Ownership and visibility

- Every private knowledge object is scoped by `owner_id = auth.uid()`.
- `knowledge_bases.default_visibility` and `documents.visibility`: `private | unlisted | public`.
- `documents.status`: `draft | ready | published | archived`; soft deletion uses `deleted_at`.
- Anonymous clients do not read private source rows and do not write AI/audit tables.

## Knowledge records

- `knowledge_bases`: `id`, `owner_id`, `name`, `description`, `default_visibility`, timestamps.
- `documents`: `id`, `knowledge_base_id`, `owner_id`, `title`, `summary`, `body`, `topic`, `maturity`, `status`, `visibility`, `slug`, `revision`, `deleted_at`, publication fields, timestamps.
- Organization contracts are the existing `tags`, `document_tags`, `document_links`, `document_sources`, and `document_versions` migrations. UI must use selectors/forms and never ask users for UUIDs.
- `document_links` writes require two live endpoints owned by `owner_id` in the same knowledge base. Existing links with a soft-deleted endpoint remain owner-readable and owner-deletable only so the editor can expose a removable tombstone; they cannot be inserted or updated.
- Conflict-sensitive writes carry the current document revision/base version; stale results are rejected rather than silently overwriting.

## Publication

- `document_publications` is one current snapshot per document with `audience`, stable `share_token`, `source_revision`, `snapshot`, and timestamps.
- `publish_document(document_id, audience)` accepts only `public | unlisted`, requires ownership and non-empty title/body, writes a whitelisted snapshot, and returns document/audience/share-token/revision/time metadata.
- `unpublish_document(document_id)` revokes the publication and restores private draft state.
- `read_published_document(document_id?, share_token?)` exposes public documents by ID or unlisted documents by token and returns only snapshot data.
- `list_public_documents(limit, offset)` returns public summary fields only; limit remains bounded to 50.
- Wave 1 may add job/retry state, but it must preserve the last successful snapshot and revocation semantics.

## AI foundation

- `ai_preferences`: default `enabled=false`, `allow_private_content=false`, `monthly_budget_cents=0`, `grounding_mode=selected_only`.
- `document_chunks`, `ai_runs`, and `ai_suggestions` are owner-readable but browser-nonwritable; trusted server functions perform writes.
- `ai-write` request: `action`, non-empty `selection`, optional `context`, nonnegative integer `base_version`, optional `document_id`.
- Allowed actions: `rewrite`, `shorten`, `expand`, `summarize`, `outline`, `metadata`, `source_gaps`.
- Size limits: selection 12,000 characters; context 36,000; declared request body 65,536 bytes.
- Mock success: HTTP 200 with `mock=true`, `status=gateway_ready`, `run_id`, echoed preview, scope counts, `model=null`, and the explicit no-cost message.
- Errors currently include `origin_not_allowed` (403), `authentication_required` (401), `method_not_allowed` (405), `request_too_large`/`content_scope_too_large` (413), `invalid_json`, `unsupported_action`, `selection_required`, and `invalid_base_version` (400).
- The accepted mock contract remains the default. A separately guarded live-canary response may be returned only under the runtime contract below.

### Provider preparation contract

- Provider implementations are server-only and use an injected `fetch`; Quartz/browser code never receives provider credentials.
- The initial DeepSeek adapter targets `POST https://api.deepseek.com/chat/completions` with Bearer authentication and defaults to `deepseek-v4-flash`; `deepseek-v4-pro` is an explicit server-side option.
- Ordinary writing requests explicitly disable thinking mode for predictable latency/cost. The first slice is non-streaming and does not expose tool calls.
- The adapter normalizes invalid request/authentication/balance/parameter/rate-limit/server-overload, timeout, caller abort, network, malformed-response, empty-output, truncated-output, content-filter, and insufficient-resource failures without retaining upstream error details, secrets, or raw private content.
- Provider usage exposes prompt/completion/total tokens plus optional DeepSeek disk-cache hit/miss tokens for later A20 accounting. This is metadata only; `ai_runs` is not written in this slice.
- DeepSeek currently declares `supportsZeroRetention=false`; private content is not eligible for this provider until a separately approved privacy contract exists.
- The deployed adapter reads `DEEPSEEK_API_KEY` only from the Edge Function Secret and is wired into `ai-write` behind both live gates. The browser never receives the key. The accepted mock response remains the default while either gate is off; any production paid request still needs separate user approval.

### Runtime-safety preparation contract

- `GuardedAiProvider` receives only authorization and a route document ID. An injected server authority verifies JWT, owner, document access, and source, then constructs the provider request; request-body owner, scope, or prompt assertions are not authoritative.
- `public` requires proof that the provider input came from the whitelisted public publication snapshot. Private or unlisted drafts, free input, unknown sources, malformed scope, and any unverified content remain ineligible for DeepSeek.
- Site live state, user opt-in, monthly budget, daily limit, concurrency limit, reservation, and final audit state belong to an authoritative server boundary, not the browser or provider adapter.
- Audit records contain owner/run identifiers, stable capability/provider/model/prompt-version IDs, input hash, token/cache counts, reserved/actual cost, latency, stable error code, and timestamps only. They do not contain authorization values, document bodies, prompts, outputs, or raw upstream errors.
- Missing provider usage, invalid cost, actual cost above reservation, or audit-finalization failure cannot return a successful model result. The reservation or known actual cost is retained conservatively.
- The in-memory boundary remains an offline single-process reference and test double. The production candidate uses browser-inaccessible, service-role-only atomic reserve/finalize database operations, a default-off singleton runtime config, two-minute reservation leases, UTC quota windows, and a versioned worst-case rate card.
- Publication context reads use the publishable key plus the same verified user JWT so owner RLS remains authoritative. The service secret is confined to quota/audit RPC calls. All credential-bearing requests reject redirects.
- The input audit identifier is an owner-scoped HMAC-SHA256 over the versioned request controls. The HMAC key, authorization, prompts, document bodies, outputs, and raw upstream errors are never sent to the audit RPC or stored in `ai_runs`.
- Provider, model, private-content capability, rate-card version, reservation, response model, and actual usage must remain mutually consistent. Missing or mismatched identity/usage fails closed and retains the reserved or known actual charge conservatively.
- These database/runtime contracts passed non-production owner/other/anonymous RLS and two-session concurrency evidence and are deployed default-off. That deployment evidence does not prove later migrations or broader content scopes safe.
- This contract records current state; it does not authorize another migration, Secret change, feature-flag change, `ai-write` replacement, deployment, or paid request.

### Live-canary contract

- `AI_LIVE_ENABLED` must equal `true` before the live runtime is constructed; missing, false, malformed, or incomplete configuration preserves mock/default-off behavior or returns a stable configuration error without calling a provider.
- The first live action is only `rewrite` with a valid route `document_id`. Server authority verifies the JWT and owner RLS, then reads exactly one owner `public` publication snapshot. Only whitelisted `title` and `body` fields form the prompt.
- Caller-provided `selection`, `context`, owner, visibility, and prompt assertions are never forwarded to DeepSeek. Private, unlisted, free-input, unknown, missing, malformed, or other-user content remains ineligible.
- The environment switch is not sufficient: database live state, user enabled state, positive budget, provider/model consent, rate-card identity, daily limit, concurrency limit, reservation, and final audit must all succeed.
- The live output is a suggestion only. It cannot publish, overwrite, or write back. `base_version` is currently response metadata and must not be treated as authoritative until bound to the publication `source_revision` in a separately reviewed contract.

## Routes and shared hooks

- `/workspace/`, `/workspace/knowledge/`, `/workspace/write/`, `/workspace/settings/`, `/workspace/settings/ai/`, and `/workspace/site/` remain stable.
- `/workspace/site/` must fail closed on `current_account_capabilities`. Editors may read only non-sensitive status, admins may additionally soft-delete public comments/corrections, and only the site owner may list accounts or grant/revoke roles through the hardened RPCs. No site capability permits reading another user's private documents.
- `/admin/` is a dependency-free migration entry only. It clears `wouldkeep-admin-*` caches, unregisters its cleanup worker, and redirects to `/workspace/site/`; no legacy editor/admin assets are emitted.
- Later AI routes are reserved as `/workspace/organize/` and `/workspace/ask/`.
- Public discovery keeps `/knowledge/`, `/topics/`, `/paths/`, `/map/`, `/changes/`, `/build/`, and stable canonical article URLs.
- Shared route registration and layout hookups in `FolderContent.tsx`, `quartz.layout.ts`, and component exports are commander-owned.
