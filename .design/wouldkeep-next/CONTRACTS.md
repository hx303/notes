# wouldkeep Cross-Worktree Contracts

State: PR #11 merged baseline plus commander-approved DeepSeek provider-preparation slice. Contract changes require a logged request, commander approval, synchronized migrations/types/fixtures/tests, and notification to dependent agents.

## Ownership and visibility

- Every private knowledge object is scoped by `owner_id = auth.uid()`.
- `knowledge_bases.default_visibility` and `documents.visibility`: `private | unlisted | public`.
- `documents.status`: `draft | ready | published | archived`; soft deletion uses `deleted_at`.
- Anonymous clients do not read private source rows and do not write AI/audit tables.

## Knowledge records

- `knowledge_bases`: `id`, `owner_id`, `name`, `description`, `default_visibility`, timestamps.
- `documents`: `id`, `knowledge_base_id`, `owner_id`, `title`, `summary`, `body`, `topic`, `maturity`, `status`, `visibility`, `slug`, `revision`, `deleted_at`, publication fields, timestamps.
- Organization contracts are the existing `tags`, `document_tags`, `document_links`, `document_sources`, and `document_versions` migrations. UI must use selectors/forms and never ask users for UUIDs.
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
- Real model connectivity, provider secrets, quotas, audit writes, and paid calls are outside this frozen foundation contract.

### Provider preparation contract

- Provider implementations are server-only and use an injected `fetch`; Quartz/browser code never receives provider credentials.
- The initial DeepSeek adapter targets `POST https://api.deepseek.com/chat/completions` with Bearer authentication and defaults to `deepseek-v4-flash`; `deepseek-v4-pro` is an explicit server-side option.
- Ordinary writing requests explicitly disable thinking mode for predictable latency/cost. The first slice is non-streaming and does not expose tool calls.
- The adapter normalizes invalid request/authentication/balance/parameter/rate-limit/server-overload, timeout, caller abort, network, malformed-response, empty-output, truncated-output, content-filter, and insufficient-resource failures without retaining upstream error details, secrets, or raw private content.
- Provider usage exposes prompt/completion/total tokens plus optional DeepSeek disk-cache hit/miss tokens for later A20 accounting. This is metadata only; `ai_runs` is not written in this slice.
- DeepSeek currently declares `supportsZeroRetention=false`; private content is not eligible for this provider until a separately approved privacy contract exists.
- This preparation slice does not read `DEEPSEEK_API_KEY` from the browser, wire the adapter into `ai-write`, change the accepted mock response, deploy an Edge Function, or make a real request. Runtime enablement depends on A20 and separate user approval.

## Routes and shared hooks

- `/workspace/`, `/workspace/knowledge/`, `/workspace/write/`, `/workspace/settings/`, `/workspace/settings/ai/` remain stable.
- Later AI routes are reserved as `/workspace/organize/` and `/workspace/ask/`.
- Public discovery keeps `/knowledge/`, `/topics/`, `/paths/`, `/map/`, `/changes/`, `/build/`, and stable canonical article URLs.
- Shared route registration and layout hookups in `FolderContent.tsx`, `quartz.layout.ts`, and component exports are commander-owned.
