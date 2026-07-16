# wouldkeep Serial Merge Queue

Allowed states: `waiting`, `verifying`, `merged`, `returned`. Only one functional branch may be `verifying`.

| Order | Branch / PR | Slice | State | Gate / owner |
| ---: | --- | --- | --- | --- |
| 0 | `agent/ai-assistant-foundation` / PR #11 | AI consent-first foundation, orchestration baseline, and account/auth stability hotfix | merged | Merged to `main` as `72ea5f96`; all PR checks passed and the signed-in mock was confirmed by the site owner |
| 1 | `agent/ai-deepseek-provider` / PR #12 | Server-only provider interface, disabled DeepSeek adapter, and dormant A20 safety boundary | verifying | Final independent review: no P0/P1; focused 27/27, full 172/172, TypeScript and build passed; production authority/RPC/rate-card gates remain; Draft PR remote checks remain |
| 2 | `agent/next-reference-research` | Research template and approved Wave 1 briefs | waiting | Created only after merged `main` baseline; documentation-only |
| 3 | `agent/next-platform` | P01/P02 platform and publication slice | waiting | Owner/other/anonymous evidence and forward-fix plan |
| 4 | `agent/next-workspace` | P03–P06 workspace slice | waiting | Import/data-loss/mobile evidence |
| 5 | `agent/next-public` | P07–P09 public discovery slice | waiting | Build data, stable URLs, accessibility evidence |

Before changing a state to `verifying`, record the baseline/head SHA and confirm the branch is within its owned paths. After each merge, run type checking, relevant tests, and a build before advancing the queue.
