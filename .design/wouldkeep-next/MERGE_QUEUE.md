# wouldkeep Serial Merge Queue

Allowed states: `waiting`, `verifying`, `merged`, `returned`. Only one functional branch may be `verifying`.

| Order | Branch / PR | Slice | State | Gate / owner |
| ---: | --- | --- | --- | --- |
| 0 | `agent/ai-assistant-foundation` / PR #11 | AI consent-first foundation and orchestration baseline | waiting | Signed-in mock success evidence, then explicit user approval to mark Ready and merge |
| 1 | `agent/next-reference-research` | Research template and approved Wave 1 briefs | waiting | Created only after merged `main` baseline; documentation-only |
| 2 | `agent/next-platform` | P01/P02 platform and publication slice | waiting | Owner/other/anonymous evidence and forward-fix plan |
| 3 | `agent/next-workspace` | P03–P06 workspace slice | waiting | Import/data-loss/mobile evidence |
| 4 | `agent/next-public` | P07–P09 public discovery slice | waiting | Build data, stable URLs, accessibility evidence |

Before changing a state to `verifying`, record the baseline/head SHA and confirm the branch is within its owned paths. After each merge, run type checking, relevant tests, and a build before advancing the queue.
