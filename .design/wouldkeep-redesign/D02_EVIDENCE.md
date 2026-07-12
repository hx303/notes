# D02 — Seven-topic index evidence

Completed 2026-07-11.

## Delivered

- Replaced the `/topics/` placeholder with a dedicated `TopicIndex` Quartz component.
- Rendered seven numbered, line-based editorial groups instead of a generic card grid.
- Added a concise scope statement, generated record count, top generated subtopics, curated recommended start and planned learning-path direction for every topic.
- Linked every topic to the real `/paths/` index while keeping unfinished individual paths honest and unclaimed.
- Reused the D01 metadata catalog and existing semantic tokens; no second taxonomy or duplicated count source was introduced.
- Added container-query reflow for narrow and medium content widths, 44px action targets and token-driven light/dark presentation.
- Exported `TopicIndex` through the public Quartz component index for D03 reuse.

## Final generated counts

The seven rows sum to all 256 public knowledge records:

| Topic | Records |
| --- | ---: |
| 数学基础 | 117 |
| 物理与光学 | 46 |
| 化学与材料 | 18 |
| 计算与仿真 | 20 |
| 研究方法 | 12 |
| 历史与社会 | 31 |
| 成长与实践 | 12 |
| **Total** | **256** |

- Unclassified records: 0.
- The corrected migration inference now considers titles as well as paths, so English `Quantum` lecture titles enter `物理与光学 / 量子物理` rather than `成长与实践`.
- Homepage fallback classification remains explicit, preserving D01's 256-record invariant.

## Automated verification

- D01/D02 targeted tests: 11/11 passed.
- Final full suite: 117/117 passed across 39 suites.
- Topic-index tests cover all seven definitions, empty topics, generated subtopic ordering and a 120-record large topic.
- Metadata tests cover English Quantum titles and the homepage fallback.
- TypeScript check: no D02 errors; only the three existing baseline diagnostics remain in `citations.ts`, `latex.ts` and `ofm.ts`.
- Final production build: 260 inputs parsed and 1014 files emitted successfully.
- `git diff --check` passed for the D02 implementation files.

## Browser verification

Verified the production `/topics/` page:

- Exactly one H1, seven topic rows and the generated total `256` are present.
- All seven generated counts match the production content index.
- Each row has a scope, up to four generated subtopic summaries, one recommended start and a `/paths/` link.
- The placeholder copy is absent.
- Dark mode uses the calibrated dark surface, readable text, visible rules and blue knowledge links without horizontal overflow.
- 320px, 375px, 800px, 1200px and 1536px layouts reflow without page-level horizontal scrolling.
- At 320px, every recommended-start and path action measures at least 44px high after the final correction.
- The learning-path action navigates successfully to `/paths/`.
- Recommended starts emit Quartz canonical extensionless URLs. The temporary Python file server does not rewrite extensionless links to `.html`, so their click destination was verified by generated href and canonical slug rather than that server's 404 response.

## Known baseline output

- Production builds continue to emit existing content-level LaTeX compatibility warnings.
- Browser logs contain only the pre-existing jsDelivr `mhchem` / `__defineMacro` error; no D02-specific runtime error was observed.
