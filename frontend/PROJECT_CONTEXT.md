# Project context

## Product boundary

This repository is a standalone frontend prototype. `/coach` is the primary coaching workspace; `/` and `/ethereal` open the Ethereal component studio. Example people, plans, and measurements are illustrative. The coach workspace persists to this browser's local storage. There is no backend connection, account system, or server authorization in this project.

Do not add credentials, real client records, or claims of authenticated access. A hidden or disabled control is not an authorization guard. Any future backend connection must be separately scoped and must use the server's authoritative authorization; the frontend preview does not implement or simulate that contract.

The target full-stack repository has separate database, RBAC, consent, and audit gates. This preview does not exercise or pass those gates. Its approved P1, P2, and I4 integration scopes do not authorize wiring this preview, simulating security controls, or claiming authenticated behavior. If backend integration is requested later, consult the target repository's canonical product decisions before planning it.

## Owner's delivery and review preferences

The product owner is responsible for frontend screens, interactions and fictional demo behavior, not backend services or real client-data connections. A working demo that the owner accepts completes that frontend feature.

Keep technical verification focused and internal. Perform the narrow checks needed for the change, but do not prolong a working-demo handoff with repeated browser matrices or production-style validation unrelated to the owner's scope. Do not ask the owner to manage checks or present verification work as another product requirement. Disclose concrete blockers without claiming checks that did not finish.

Give beginner-friendly next steps, browser links and click paths. Work one approved feature at a time and stop for UI review before starting the next feature.

## Source of truth

- Current route and runtime behavior: `src/app/` and the relevant component under `src/components/`.
- Shared browser state and routes: `src/components/coach/store.tsx` and `src/components/coach/model.ts`.
- Dependency and runtime versions: `package.json`, `package-lock.json`, and `.nvmrc`.
- Framework-specific guidance before frontend code changes: the relevant Next.js guide under `node_modules/next/dist/docs/`.
- Current local usage: `README.md`.
- Target publication process: [docs/PR-WORKFLOW.md](docs/PR-WORKFLOW.md). The source workspace has unrelated Git history; publish only through the explicitly scoped target clone and remote described there. Open feature-branch PRs into `FRONTEND`; Hanzlah owns the later promotion to `main`.
- Workflow for substantial engineering work: `docs/conductor-generic/SKILL.md`, pinned with provenance in `docs/conductor-generic/PROVENANCE.md`.
- ICM research basis and local adaptation: `docs/references/icm.md`.
- Task routing and stage/role contracts: `docs/agent-workflow/CONTEXT.md` and the selected stage contract. Per-run notes belong under ignored `.agent-runs/<run-id>/`; stable rules stay in tracked reference files.
- Publication layout:
  - `src/` → `frontend/src/`
  - `public/` → `frontend/public/`
  - `scripts/` → `frontend/scripts/`
  - `prompts/` → `frontend/prompts/`
  - `MEALPLANS.md` → `frontend/MEALPLANS.md`
  - `TRACKER-REDESIGN.md` → `frontend/TRACKER-REDESIGN.md`
  Publication-only tests and target configuration remain additive.

`MEALPLANS.md` and `TRACKER-REDESIGN.md` preserve feature decisions and implementation history. Their route and verification details may lag the current `/coach` workspace; confirm behavior in source before relying on them.

## UI direction

Preserve the current UI's visual language and interaction patterns when changing existing screens. Keep changes within the requested scope. Follow explicit task direction when it calls for a different design; do not revive prior blanket design instructions or impose a new visual system on documentation work.

## Handoffs

Run `npm run agent-context:check` and `npm run agent-context:test` to validate the local references and handoff. `node scripts/agent-context.mjs --handoff --stage scout --role worker` prints a portable initial prompt scoped to the requested stage and role. To start Devin with it, use the supported prompt argument: `devin . -- "$(node scripts/agent-context.mjs --handoff --stage scout --role worker)"`. The prompt directs Devin to read only the shared entrypoint, stable context, and selected contract. The commands do not read machine-specific directories or publish data.
