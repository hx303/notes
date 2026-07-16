# D01 — Metadata-driven knowledge directory evidence

Completed 2026-07-11.

## Delivered

- Replaced the public disk-folder tree with a normalized knowledge catalog.
- Added a primary `主题 → 子主题 → 知识记录` view and an optional `类型 → 知识记录` view.
- Added a reusable catalog builder that excludes structural `/topics`, `/paths`, `/map` and `/build` pages, deduplicates by canonical slug and never duplicates records into secondary topics.
- Emitted normalized knowledge metadata into the browser content index.
- Added migration-time subtopic inference and completed safe legacy mappings for old history, class-note, video-note, formula, self-check and tool paths.
- Preserved the selected view and expanded groups in local storage while always opening the current record's ancestry.
- Marked the current page with `aria-current="page"` plus a visible underline and weight change.
- Kept the same catalog in the desktop sidebar and the native mobile knowledge dialog; group buttons expose `aria-expanded` and `aria-controls`.
- Removed public navigation groups named after disk sources such as `课堂笔记`, `科研笔记`, emoji folders and attachments.

## Corpus verification

The final production content index contains 260 pages. After excluding the four structural roots, the directory contains exactly 256 unique public knowledge records:

| Primary topic | Records |
| --- | ---: |
| 数学基础 | 117 |
| 物理与光学 | 46 |
| 化学与材料 | 18 |
| 计算与仿真 | 20 |
| 研究方法 | 12 |
| 历史与社会 | 31 |
| 成长与实践 | 12 |
| **Total** | **256** |

- Unique canonical slugs: 256.
- Unclassified records: 0.
- Generated subtopics: 22.
- Type groups: 8.

## Automated verification

- D01/R06 targeted tests: 13/13 passed before the final mapping case was added.
- Final full suite: 114/114 passed across 38 suites.
- Catalog tests cover unique primary-topic membership, no secondary-topic duplication and structural-page exclusion in type view.
- Metadata tests cover the legacy history, video and Mermaid migration mappings.
- TypeScript check: no D01 errors; only the three existing baseline diagnostics remain in `citations.ts`, `latex.ts` and `ofm.ts`.
- Production build: 260 inputs parsed and 1014 files emitted successfully.
- `git diff --check` passed for the D01 implementation files.

## Browser verification

Verified the production build on the representative RCWA article:

- Desktop topic view shows 256 unique links in exactly seven formal topic groups and exactly one current-page marker.
- Type view shows the same 256 unique links in eight groups.
- View choice persists after reload.
- A collapsed `课程笔记` type group remains expanded after reload once the user opens it.
- Mobile 375px drawer opens with focus on its close control, keeps Tab focus inside and restores focus to the trigger on close.
- Mobile drawer uses the saved view, renders all 256 records, has one current marker and 44px minimum visible controls.
- Mobile topic labels contain no `课堂笔记` / `科研笔记` / `讲座笔记` / `视频笔记` source folders and no folder emoji.
- 320px, 800px, 1200px and 1536px checks produced no page-level horizontal overflow; desktop/sidebar and mobile/drawer visibility switch at the intended breakpoint.

## Known baseline output

- Production builds continue to emit existing content-level LaTeX compatibility warnings.
- Browser logs contain only the pre-existing jsDelivr `mhchem` / `__defineMacro` error; no D01-specific runtime error was observed.
