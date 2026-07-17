# wouldkeep Serial Merge Queue

Last reconciled: 2026-07-17 (Asia/Shanghai)

Allowed states: `waiting`, `verifying`, `merged`, `returned`. Only one functional branch may be `verifying`.

| Order | Branch / PR                              | Slice                                                                           | State     | Gate / owner                                                                                        |
| ----: | ---------------------------------------- | ------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------- |
|     0 | `agent/ai-assistant-foundation` / PR #11 | AI consent-first foundation, orchestration baseline, and account/auth stability | merged    | `main` `72ea5f96`; checks and signed-in mock accepted                                               |
|     1 | `agent/ai-deepseek-provider` / PR #12    | Server-only provider interface and dormant A20 boundary                         | merged    | `main` `f09eeea5`; local migration/RLS/concurrency evidence passed                                  |
|     2 | `agent/ai-live-canary` / PR #13          | Default-off, public-publication-only DeepSeek live hookup                       | merged    | `main` `29b27b57`; A20 migration, Secrets, and `ai-write` v4 deployed with both live gates off      |
|     3 | `fix/settings-persistence-v2` / PR #16   | Account-scoped profile and AI settings persistence                              | merged    | `main` `24536ab5`; TypeScript, 197/197 tests, and production build pass                             |
|     4 | `agent/wave2-orchestration`              | State reconciliation, acceptance/research, queue, and truthful AI settings copy | waiting   | Local commit `12852207`; includes UI copy/tests but no deployment, paid call, flag change, or merge |
|     5 | `agent/migration-version-normalization`  | Forward-only migration namespace repair                                         | verifying | Preserve applied SQL and production history; clean-project and ledger evidence required             |
|     6 | `agent/publication-boundary`             | P01/P02 publication integrity and recoverability                                | waiting   | Owner/other/anonymous, visibility, revision, retry, and last-success evidence                       |
|     7 | `agent/workspace-novice-import`          | P03/P04 real-browser novice flow and import hardening                           | waiting   | Auth, navigation, DOCX/Markdown fixtures, failure retention, mobile evidence                        |
|     8 | `agent/editor-recovery`                  | P05 offline queue, conflict comparison, and version-safe restore                | waiting   | Must own AccountPage hotspots exclusively; no silent overwrite                                      |
|     9 | `agent/ai-suggestion-preview`            | A21 selection rewrite preview and version-safe acceptance                       | waiting   | Starts after P05; A20 remains default-off and private-content policy is separately approved         |
|    10 | `agent/next-public`                      | P07-P09 public discovery and trust acceptance                                   | waiting   | Build data, stable URLs, responsive/accessibility evidence                                          |

Before changing a state to `verifying`, record baseline/head SHA and confirm branch-owned paths. After each merge, run TypeScript, relevant tests, the full suite, and a production build before advancing the queue. Database, browser E2E, and deployment evidence are separate gates and cannot be replaced by unit tests.

Merging a new PR, changing production Supabase, replacing an Edge Function, changing Secrets, enabling live AI, setting a positive budget, making a paid request, or publishing private content requires fresh explicit user authorization.
