# wouldkeep Agent Rules

These rules apply to the whole repository. Read `.design/wouldkeep-next/CURRENT_STATE.md`, `DECISIONS.md`, `CONTRACTS.md`, and `MERGE_QUEUE.md` before changing code.

## Baseline verification

Use the bundled Node runtime when the global npm installation is unreliable:

```powershell
$node = 'C:\Users\23012\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node node_modules\typescript\bin\tsc --noEmit
& $node node_modules\tsx\dist\cli.mjs --import './quartz/testing/register-assets.mjs' --test 'quartz/**/*.test.ts' 'quartz/**/*.test.tsx'
& $node quartz\bootstrap-cli.mjs build
```

Run focused tests while developing and the full commands before handoff. Database/RLS and deployed Edge Function verification are separate release gates; a TypeScript or Quartz build cannot replace them.

## Ownership and conflict boundaries

- `.design/reference-research/**`: reference-research agent only; research does not modify product code.
- `supabase/migrations/**`, `supabase/functions/**`: platform agent; later, AI-specific files may transfer to the AI agent after an explicit handoff.
- `quartz/components/AccountPage.tsx`, `quartz/components/scripts/accountPage.inline.ts`, `quartz/components/styles/accountPage.scss`: workspace agent during Wave 1.
- `content/workspace/**`: workspace agent during Wave 1; AI agent may later add only `organize` and `ask` routes.
- `DiscoverHome`, `MapPage`, `RecentGrowth`, and `content/topics|paths|build|changes/**`: public-discovery agent.
- Real knowledge Markdown, aliases, and canonical metadata: content-migration agent only after an approved dry run.
- `quartz.layout.ts`, `quartz/components/index.ts`, `quartz/components/pages/FolderContent.tsx`, `package.json`, lockfiles, and global tokens: integration commander only.

One agent writes only in its assigned worktree and allowed paths. Do not silently change a frozen contract. Record a requested contract change in the handoff and wait for commander approval.

## Safety boundaries

- Never commit secrets, model keys, service-role keys, tokens, or production data.
- Never rewrite an already-applied migration. Add a dated forward migration and a verification script.
- Every RLS change needs owner, other-user, and anonymous evidence.
- Do not run production migrations, destructive SQL, delete data/storage/functions/deployments, enable paid model calls, raise budgets, change visibility in bulk, or merge to `main` without explicit user approval.
- AI stays disabled by default, with zero paid budget, until the signed-in mock gateway and later safety gates pass.
- Preserve user changes and occupied worktrees. Never use `reset --hard`, force-push, or destructive worktree cleanup.

## Commits, checkpoints, and handoff

Keep each commit to one demonstrable vertical slice. Every slice or 60–90 minutes, update `.design/wouldkeep-next/handoffs/<branch>.md` from `TEMPLATE.md` with baseline SHA, current SHA, changed files, tests and UI/RLS evidence, risks, blockers, contract impact, rollback/forward-fix notes, and next prerequisites.

Only one functional branch may be in `verifying` state in `MERGE_QUEUE.md`. The commander reviews scope and contracts, merges with `--no-ff`, then reruns type checking, relevant tests, and the build before advancing the queue.
