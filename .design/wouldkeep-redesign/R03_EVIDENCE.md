# R03 Evidence — Prerequisites and meaningful continuation

## Outcome

Knowledge records now explain what readers may need before starting and where they can continue afterward. Explicit relationships take priority over inferred links, every recommendation includes a reason or an honest fallback, learning-path membership is shown only when a curated path actually links the article, and backlinks are presented as reader-facing context rather than a raw graph list.

## Implementation

- Added `PrerequisiteBlock` before article content.
- Added `RelatedKnowledge` after article content with explicit reasons, cross-topic labels, bidirectional state and curated path position.
- Rebuilt `Backlinks` as “提及本文”, grouped into “引用本文” for explicit metadata relationships and “正文提及” for ordinary link-graph references.
- Added `knowledgeRelations` utilities for canonical slug, alias and title resolution; missing/self/bidirectional states; safe malformed-URI handling; path position; and incoming-link classification.
- Added three meaningful relationships to the representative RCWA guide without reformatting the article body.
- Used native sections, headings, lists and links; relationship meaning never depends on color alone.

## Verification

- Full automated suite: **97/97 passing**.
- Six R03-focused tests cover canonical/alias/title resolution, malformed `%` slugs, missing and self targets, bidirectional relations, path position, relation reasons, cross-topic context, backlink grouping and empty states.
- Production build: **success**, 260 content files emitted to 1014 public files.
- TypeScript: no R03 errors. The project check remains blocked only by the recorded baseline errors in `citations.ts`, `latex.ts` and `ofm.ts`.
- Desktop browser at 1440×900:
  - prerequisite block precedes the article and continuation follows it;
  - all three unresolved prerequisites retain readable non-link fallbacks;
  - three related records show explicit reasons;
  - “大学物理” and “微积分上” are visibly labeled as cross-topic relationships;
  - no duplicate IDs or horizontal overflow;
  - the empty learning-path and backlink states explain why data is absent.
- Mobile browser at 390×844:
  - relationship sections reflow to one column;
  - all related links are 44px high;
  - no horizontal page overflow.

## Known baseline observations

- Build output retains existing content-level LaTeX compatibility warnings.
- Browser console retains the existing `__defineMacro` math-integration error; R03 is static and completed all relationship rendering checks.
