# D04 — Complete search and findability flow evidence

Completed 2026-07-11.

## Delivered

- Kept FlexSearch and extracted a shared knowledge-search engine with CJK-aware encoding, title/content/tag field priority, query expansion and safe highlight segmentation.
- Replaced the ambiguous compact search control with a visibly labeled `搜索` trigger and a native, named search dialog.
- Added concrete query guidance, clear/submit actions, honest loading/error/empty states, live result counts, highlighted matches and topic/type/maturity metadata.
- Added arrow-key result selection, `Ctrl/Cmd + K`, explicit Escape handling from both input and result focus, native dialog behavior and focus return to the trigger.
- Added a shareable `/search/?q=` result page with topic, type, maturity and sort controls.
- Serialized query/filter/sort state into the URL and restored it on direct load, refresh and `popstate`.
- Added removable active-filter chips, clear-all recovery, query-specific zero results and a route back to the seven-topic index.
- Added a static-first route at `content/search/index.md`; search remains a client enhancement over the generated content index.
- Excluded `/search/` from the knowledge catalog and topic corpus so the public invariant remains 256 records across seven themes.
- Disabled correction and discussion surfaces on the search utility page.

## Search intent and query quality

No query analytics exist, so D04 does not claim invented “popular searches.” Quality checks use vocabulary that actually exists in the 256-record corpus:

- Chinese topics and concepts: `微积分`, `量子`, `薄膜干涉`.
- Known tools and abbreviations: `COMSOL`, `RCWA`, `TMM`.
- Query expansion: `光学建模 → RCWA/TMM`, `数值仿真 → COMSOL/仿真`, `量子力学 → quantum/量子`, `高等数学 → 微积分`.
- One common Latin transposition is recovered explicitly: `comosl → COMSOL`.

The search engine ranks title matches before content, then tags, while exposing the matched fields on the full result page.

## URL and history verification

Browser sequence on `/search/?q=COMSOL`:

1. Direct load restored the query and returned 8 results.
2. Selecting `topic=computing-simulation` updated the URL, displayed an active chip and narrowed the set to 7.
3. Browser back removed the topic filter and restored the original 8 results.
4. Submitting `薄膜干涉` updated the encoded URL, returned 6 content-aware results and rendered query highlights.
5. Submitting `完全不存在的检索词xyz` produced an acknowledged zero-result state with two recovery paths.

## Dialog keyboard verification

- Opening the trigger focuses the named search box.
- Entering `量子` returned 80 ranked matches and displayed the first 8 suggestions with highlights.
- Arrow Down moved focus from the input to the first result.
- The final `RCWA` pass returned 2 suggestions; Escape from a focused result closed the dialog.
- After the close event settled, `aria-expanded=false` and focus returned to the header search trigger.

## Automated verification

- D04 targeted search tests: 27/27 passed across 7 suites.
- Final full suite: 127/127 passed across 42 suites.
- Tests cover English/CJK tokenization, mixed input, title/content/tag matches, synonyms, typo recovery, punctuation-safe highlights, search dialog semantics, states, keyboard handling and URL restoration signals.
- A catalog regression fixture verifies `/search/` remains excluded from the 256-record directory.
- D04 implementation and route files pass the project Prettier check.
- TypeScript reports no D04-specific diagnostics; the three existing baseline diagnostics remain in `citations.ts`, `latex.ts` and `ofm.ts`.
- Production build: 268 Markdown inputs parsed and 1022 files emitted successfully.

## Responsive and visual verification

- At 1280px, the page and header have no horizontal overflow after shortening the visible trigger and limiting the shortcut hint to wider viewports.
- The search page has exactly one H1, a 256-record corpus count and no correction/discussion surfaces.
- At 320 × 800, there is no page-level horizontal overflow, the filter grid becomes one column and the query input, submit action and search trigger all measure 44px high.
- The mobile search dialog fills the 320 × 800 viewport without horizontal overflow.
- Light/dark styling uses the existing wouldkeep semantic surface, border, selection and inverse-text tokens.

## Known baseline output

- Production builds continue to emit existing content-level LaTeX compatibility warnings and the `punycode` deprecation notice.
- Browser logs contain only the pre-existing jsDelivr `mhchem` / `__defineMacro` error; no D04-specific runtime error was observed.
