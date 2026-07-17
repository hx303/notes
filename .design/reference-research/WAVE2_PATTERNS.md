# wouldkeep Wave 2 reference patterns

Researched: 2026-07-17. Sources are mature-product primary documentation. This brief informs implementation; it does not authorize production changes.

## Settings, consent, and budget

Adapt:

- Keep the server value authoritative. Browser storage is only a navigation/reload draft; after save, read the server value back and show loading, unsaved, saving, saved, and failed states.
- Separate AI availability, private-content consent, provider/model, and paid budget instead of hiding them behind one toggle.
- Explain that a zero budget means paid calls are blocked, and audit changes to enablement, data scope, model, and budget.

Evidence: [GitHub Copilot policies](https://docs.github.com/en/copilot/concepts/policies), [GitHub budgets and alerts](https://docs.github.com/en/billing/concepts/budgets-and-alerts), [Microsoft 365 Copilot settings](https://learn.microsoft.com/en-us/microsoft-365/copilot/microsoft-365-copilot-page), [Notion AI safety](https://www.notion.com/help/ai-safety).

Avoid: toggle-to-paid-call, local-storage-only settings, optimistic enabled state after a failed save, or one ambiguous consent switch.

## Selection rewrite and version recovery

Adapt:

- Generate into a separate diff preview. Offer replace selection, insert below, reject, and regenerate; do not stream into the document.
- Bind each request to `document_revision`, selection range, and source hash. If the document changed, copy the candidate or regenerate rather than applying stale offsets.
- Create a version snapshot before applying AI output and expose undo plus an “AI rewrite” history label.

Evidence: [Gemini in Docs](https://support.google.com/docs/answer/13447609?hl=en), [Word Copilot rewrite](https://support.microsoft.com/en-us/word/copilot/rewrite-text-with-copilot-in-word), [Google Docs version history](https://support.google.com/docs/answer/190843?hl=en).

Avoid: overwriting while streaming, browser-undo-only recovery, stale-range replacement, or destroying the previous candidate on regenerate.

## Offline autosave and conflicts

Adapt:

- Show truthful states: locally saved, syncing, synced, offline, and conflict.
- Persist a local draft/operation queue, serialize server saves with `base_revision`, and retry after reconnect.
- On a 409, present local and cloud content with keep-local, use-cloud, and copy-as-new actions. Restoring an old version creates another version.

Evidence: [Google Docs offline](https://support.google.com/docs/answer/6388102?hl=en-GB), [Google save error recovery](https://support.google.com/docs/answer/12111392?hl=en), [Google encrypted-document collaboration](https://support.google.com/docs/answer/10519035?hl=en-en-16).

Avoid: showing saved when only a request was sent, last-write-wins conflict handling, one undifferentiated draft key across tabs, or losing unsynced work when cache is cleared.

## Novice onboarding

Adapt:

- Create one personal workspace after registration and land on one task: create or import the first private note.
- Use a skippable three-step checklist: content, basic profile/organization, then optional publishing/AI education.
- Preserve inputs and provide a recovery action for verification, existing-account, login, and workspace-creation failures.

Evidence: [Slack workspace creation](https://slack.com/help/articles/206845317-Create-a-Slack-workspace-Create-a-Slack-workspace), [Slack creator guide](https://slack.com/help/articles/217626298-Getting-started-for-workspace-creators/slack.com/help/articles/217626298-Getting-started-for-workspace-creators), [Notion workspaces](https://www.notion.com/help/create-delete-and-switch-workspaces).

Avoid: a blank post-registration dashboard, forced team setup, an unskippable wizard, or automatically enabling AI/publication.

## Reliable publication and privacy

Adapt:

- Keep private documents and immutable publication revisions separate. Editing a document does not silently change the live publication.
- Before publishing, summarize URL, visibility, included resources, indexing, and child-content impact.
- Use idempotency keys. Preserve the last successful public version when a new build fails; support preview, publish-new-version, rollback, and unpublish.

Evidence: [Notion Sites publishing](https://www.notion.com/en-gb/help/public-pages-and-web-publishing), [Google Drive sharing](https://support.google.com/drive/answer/2494822), [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests), [Vercel deployments](https://vercel.com/academy/vercel-foundations/deployments), [Cloudflare rollbacks](https://developers.cloudflare.com/pages/configuration/rollbacks/).

Avoid: editing directly into production, recursive publication by default, duplicate publication records on retry, or equating document deletion with an unrecoverable unpublish.

## Priority

1. Finish settings server-readback and real-browser regression evidence.
2. Add explicit first-use AI consent and zero-budget language.
3. Add revision-safe AI diff preview only after editor conflict recovery.
4. Add persistent offline saves and explicit conflict choices.
5. Add idempotent, immutable, last-success publication semantics.
