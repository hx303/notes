# Workspace novice import independent acceptance

- Candidate: functional fix `51451d85cc9ecfe93cbc75af88479b5863dbca47`
- Baseline: `a6ef3be6d981ab005ac56522b9d0c7df25db3df1`
- Verdict: automated/code, deployment, and critical browser refresh-recovery gates PASS; P0=0, P1=0. Broader P2 browser evidence remains open.
- Focused tests: 18/18 PASS, including first-save route recovery.
- Full tests: 229/229 PASS.
- TypeScript: PASS.
- Production build: PASS, 284 inputs / 1051 outputs.
- Preview deployment: both `Vercel – notes` and `Vercel – vcdeploy` PASS for `51451d85`.
- Dependency gate: four same-origin UMD files matched the build-time SHA-256 allowlist; `THIRD_PARTY_LICENSES.txt` was emitted; newly introduced conversion dependencies had no official-registry advisory.
- Scope gate: no migration, Edge Function, Secret, service-role, DeepSeek key, AI behavior, production write, or paid request change.

## Proven

- Latest import wins; closing, reopening, Escape, and SPA cleanup invalidate stale results.
- Markdown uses fatal UTF-8 decoding; empty, unsupported, oversized, corrupt, encrypted, ZIP64, excessive-entry, expanded-size, and suspicious-ratio inputs fail closed.
- Locked Mammoth fixtures preserve headings, paragraphs, lists, tables, and embedded PNG data images.
- Private previews use an inert template, strict DOMPurify allowlists, and local data images only; explicit confirmation is required before editor mutation and visibility defaults to private.
- Failed imports retain file context and retry affordance. Parser failures and timeouts evict the shared script-load cache.
- Account and public routes require DOMPurify 3.4.12 and remove a stale global before loading the same-origin runtime.
- Browser acceptance on the pre-fix preview proved Markdown file selection, parsed summary and preview, explicit private-draft confirmation, editor population, private visibility, title focus, Cancel/Escape focus return, and no horizontal overflow at 320/375/800/1024/1200/1536 CSS pixels.
- Browser acceptance exposed a first-save recovery defect: after import and successful autosave, refresh returned to an empty new editor. The cause was removal of the `new` local backup after insert without binding the returned document id into the editor URL.
- `51451d85` binds the first saved document id with `history.replaceState`, removes transient `action`/`mode` parameters, preserves unrelated query/hash state, and has deterministic route regression coverage.
- The site owner completed the post-fix real-browser check on the deployed preview. The first private draft route changed to `?document=b500d791-9300-4874-9fc3-ff7acd70970f`, and the title/body remained after refresh.
- The detailed editor keeps `visibility=private` checked by default. Visibility changes live in the collapsed “预览与分享” disclosure, and publishing remains a separate explicit action.

## Not proven

- Real DOCX file chooser/drag-drop and retry behavior.
- Editor/localStorage preservation when cloud autosave fails or the network goes offline.
- Browser network capture proving zero remote image requests.
- Dialog keyboard loop and screen-reader announcements beyond the proven Escape/focus-return path.
- 200% zoom and mobile touch beyond the proven responsive CSS widths.

## Residual risk

- P2: an already-started Mammoth conversion remains on the main thread; request invalidation prevents stale writes but does not terminate CPU work. A Web Worker with actual expanded-byte accounting is the next hardening step.
- P2, pre-existing: the static Admin page still loads jsDelivr Marked 11.1.1; it is outside the private import chain but remains supply-chain debt.
- P3: runtime filenames are versioned rather than content-addressed and have no browser SRI; build-time SHA-256 verification currently protects emitted bytes.
- P2 UX: the safe private default is correct, but the visibility control is easy to miss because it sits inside the collapsed “预览与分享” disclosure. A future polish slice should surface the current visibility near the editor save state without weakening the private default.

The branch may be considered for Ready review. It must not be merged without the user's fresh explicit authorization.
