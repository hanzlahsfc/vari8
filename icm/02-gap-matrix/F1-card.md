# Devin card F1: canvas-first gap matrix, full depth (Fusion lead + SWE-2 scouts)

You are the LEAD (Fusion, Opus 5.5 planner with an SWE-2 sidekick). You orchestrate. Your SWE-2 children do the bulk reading. Your own turns are for decomposition, spot-verification, and the final judgment.

## Context

Read `/home/nexuslink/NEXUS_AI_CENTER/04_PROJECTS/Vari8/icm/01-recon/BRIEF.md` for the operation and its rule. **The canvas dictates everything.** Lilly's frontend defines which screens, elements and data exist. The backend (Hanzlah's app) is made to serve it. Backend security, consent, audit and health-data decisions (`docs/product-decisions.md`, `docs/security/`) stay binding.

Your read tree is `/home/nexuslink/vari8-worktrees/merge-proto` (branch `proto/merge-frontend` @ `58eb6ed`). It holds BOTH sides in one tree. Canvas is `frontend/` (start at `frontend/PROJECT_CONTEXT.md`, `frontend/src/components/coach/model.ts`, `store.tsx`, `coach-app.tsx`). Backend is the root (`AGENTS.md`, `db/schema.prisma`, `lib/`, `app/`, `docs/STATUS.md`). Hanzlah's newest unmerged commit is in `/home/nexuslink/vari8-worktrees/r3` (training final-week fix).

## Hard rules

- READ-ONLY in every checkout. `git -C /home/nexuslink/vari8-worktrees/merge-proto status --short` must be empty when you finish. No installs, no dev servers, no browsers, no GUI, no push, no network writes.
- Write ONLY under `/home/nexuslink/NEXUS_AI_CENTER/04_PROJECTS/Vari8/icm/02-gap-matrix/output/F1/`. Children write their own surface file there; you write the consolidated files.
- Write incrementally. Each child writes its file section by section. You write the matrix as surfaces land.
- Every row cites both sides by `path:line`. Label inferences `(inferred)`. No secrets, no real client data. Plain English, short sentences, no long dashes.
- Kill every process you or your children start. End with `ps -eo pid,etime,args | grep -E '[n]ode|[n]ext'` output in the report.

## Fan-out (parallel, background)

Dispatch one `scout` subagent (SWE-2) per surface below, all in one parallel wave: use your `run_subagent` tool with the `scout` profile (`~/.config/devin/agents/scout.md`, model `swe`) and `is_background: true`, one call per surface, then wait for all of them. If `scout` cannot write its file, use the `builder` profile (also SWE-2) with the same read-only rule. Never do a surface's bulk reading yourself. Each scout reads its canvas files completely, then searches the backend for every counterpart (Prisma model, `lib/` service, `app/` page or server action, RBAC permission, consent kind, `ENABLE_*` flag).

| id  | Surface                                                                                                                                                                   | Canvas files (under `frontend/src/components/coach/` unless noted)                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S01 | Coach shell, navigation, client roster, client profile                                                                                                                    | `coach-app.tsx`, `clients.tsx`, `store.tsx`, `model.ts`, `ui.tsx`, `workspace-polish.css`, `frontend/src/app/coach`                                                                          |
| S02 | Messages, notes, media                                                                                                                                                    | `messages.tsx`, `notes.tsx`, `media.tsx`                                                                                                                                                     |
| S03 | Check-ins                                                                                                                                                                 | `check-ins.tsx` and its model parts                                                                                                                                                          |
| S04 | Habits                                                                                                                                                                    | `habits-tab.tsx`                                                                                                                                                                             |
| S05 | Templates, template setup, tracker setup and config                                                                                                                       | `templates.tsx`, `template-setup.ts`, `tracker-setup.ts`, `tracker-config.css`                                                                                                               |
| S06 | Nutrition plan, food database, client plan preview                                                                                                                        | `plans/nutrition/**`, `plans/domain.ts`, `plans/types.ts`, `plans/CONTRACT.md`, `client-plan-preview.tsx`, `frontend/src/data/food-database.json` (shape), `frontend/MEALPLANS.md`           |
| S07 | Training plan, exercise library, muscle volume, roadmap                                                                                                                   | `plans/training/**`, `plans/training-options.ts`, `muscle-volume.ts`, `roadmap-preview.ts`, `plans/workspace.tsx`, `plans/setup-ui.tsx`                                                      |
| S08 | Coach dashboard builder and widgets                                                                                                                                       | `builder/**`                                                                                                                                                                                 |
| S09 | Client tracker (today, tracking, trends, week) and client preview                                                                                                         | `client-tracker-preview/**`, `client-preview.tsx`, `frontend/TRACKER-REDESIGN.md`                                                                                                            |
| S10 | Appearance, theme, accent, the Ethereal studio                                                                                                                            | `appearance-controls.tsx`, `accent-contrast.ts`, `frontend/src/components/ethereal/**`, `frontend/src/app/ethereal`, `frontend/src/app/page.tsx`, `frontend/src/lib/ethereal-appearance.tsx` |
| S11 | Identity and access: the canvas has no auth; map its implied users and views (coach vs client, which client is "me") to backend auth, roles, invites, onboarding, consent | whole canvas for implied roles; backend `lib/auth/**`, `lib/workspace/**`, `lib/onboarding/**`, `lib/consent.ts`, `app/login`, `app/invite`, `app/workspace/**/onboarding`                   |
| S12 | Backend ORPHANS: every backend capability (page, action, model) that no canvas surface uses                                                                               | whole `app/` and `lib/` against the canvas                                                                                                                                                   |

Each scout writes `F1/<id>-<slug>.md` with this table, one row per canvas element (screen, panel, control, data field group):

`| row id | canvas element | canvas path:line | user | data (entity.field) | backend counterpart path:line | status | gap and wiring needed | effort S/M/L |`

Status is one of: WIRED (backend serves it as drawn), UNWIRED (backend exists, nothing connects), UNCONFIGURED (exists but off or broken in a normal run: flag, env, seed, consent version), PARTIAL (shape mismatch: name the fields), MISSING (no backend at all), CONFLICT (collides with a binding security, consent or health-data decision: cite the decision). S12 lists ORPHANS instead.

## Your judgment pass

1. When each surface lands, open at least 3 of its rows and verify both citations yourself. Re-dispatch a scout whose rows do not hold.
2. Write `F1/GAP-MATRIX.md`: a summary count per status per surface, then every non-WIRED row grouped by surface, then the ORPHAN list, then the CONFLICT list with the decision each one hits.
3. Write `F1/WIRING-SPEC.md`: the backend work the canvas demands, as proposed PR slices in dependency order (data model changes first, then services, then wiring each canvas surface onto the backend inside the merged app). For each slice: files, entities, migrations, flags, the observable result, and how to check it live.
4. Write `F1/OPEN-QUESTIONS.md`: only product calls the source cannot settle (each with the evidence and 2 options).

## Self-check (mandatory)

Re-read every file in `F1/`. List as PASS or FAIL with evidence:

1. All 12 surface files exist and are non-empty (list sizes).
2. Every row in every file has both citations or an explicit `none` with the search you ran.
3. You verified at least 3 rows per surface (list row ids and result).
4. GAP-MATRIX counts equal the sum of the surface files (show the arithmetic).
5. `git status --short` in merge-proto is empty; no file written outside `F1/`.
6. Process census shows nothing you started still running.
   You are not done until every item is PASS or FAIL with the reason.
