# Gap-mapping round 3 (G1 to G6): exhaustive coverage, different method

Rounds 1 and 2 read the canvas surface by surface. Two teams still each missed elements the other found (55 found only by Team H, 34 only by Team F). Round 3 changes method: **build a lever, not a reading**. Each lane enumerates its whole domain mechanically with a script, then proves every enumerated item is covered by an existing matrix row, and only then reads the uncovered ones. The canvas dictates everything.

## Load these skills first (mandatory)

Call `skill_view` on each, read it fully, and follow it. Name in your report which rule from each changed what you did.

- `poteto-mode`. Then open its `playbooks/investigation.md` and run your lane as that playbook (read-only investigation, cited answer, evidence or label on every claim).
- `principle-build-the-lever` (the census is a script you save, not a hand list).
- `principle-prove-it-works` (coverage is proven by the script's numbers, not asserted).
- `principle-guard-the-context-window` (never dump whole files; script the census, read only uncovered items).
- `grounded-citations` (every row cites `path:line`).
- G5 only: `webapp-testing`.

Fallback paths if `skill_view` cannot find one: `/home/nexuslink/projects/cursor-plugins/pstack/skills/<name>/SKILL.md` and `/home/nexuslink/.hermes/skills/research/grounded-citations/SKILL.md`.

## Ground truth

- Source tree, read-only: `/home/nexuslink/vari8-worktrees/merge-proto` (canvas `frontend/`, backend at root, HEAD `58eb6ed`). Hanzlah's newest commit: `/home/nexuslink/vari8-worktrees/r3`.
- Existing coverage to check against (all under `/home/nexuslink/NEXUS_AI_CENTER/04_PROJECTS/Vari8/icm/`): `02-gap-matrix/output/F1/S01..S12-*.md`, `02-gap-matrix/output/V/V1..V3-*.md`, `01-recon/output/H1..H4-*.md`, `01-recon/output/L1-backend-domain.md`, and `02-gap-matrix/output/GAP-MATRIX.md` if it exists yet.
- Status vocabulary: `02-gap-matrix/CONTEXT.md` (WIRED, UNWIRED, UNCONFIGURED, PARTIAL, MISSING, CONFLICT, ORPHAN).
- Binding rules: `AGENTS.md` (source authority 0: the canvas), `docs/product-decisions.md`, `docs/security/`, `icm/03-plan/DECISIONS.md`.

## Output (each lane)

Folder `icm/02-gap-matrix/output/R3/`. Save your census script as `R3/<lane>-census.<ext>` and its raw output as `R3/<lane>-census.txt`. Write `R3/<lane>.md` incrementally:

1. `## Skills applied`: one line per skill, the rule and what it changed.
2. `## Census`: the command, the total items enumerated, how many matched an existing row, how many are uncovered. Show the arithmetic.
3. `## New rows`: every uncovered item that is a real gap, in the matrix format `| row id (<lane>-NN) | canvas element or backend item | canvas path:line | user | data (entity.field) | backend counterpart path:line or none (searched: ...) | status | gap and wiring needed | effort S/M/L |`.
4. `## Corrections`: existing rows your census proves wrong (row id, what is wrong, evidence).
5. `## Dismissed`: uncovered items that are not gaps (pure styling, re-exports, test files), each with a one-line reason.
6. `## Self-check`: PASS or FAIL with evidence for (a) census script saved and rerunnable, (b) census total equals matched plus new plus dismissed, (c) every new row cites both sides, (d) 5 matched items opened to confirm the match is real, (e) only files under `R3/` written, nothing left running.

Rules: read-only on every tree. Never push, never commit. No GUI windows on the owner's screen (headless only). Kill everything you start. Plain English, no long dashes.

## Lanes

| Lane                       | Domain to enumerate completely                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1 symbols                 | Every file under `frontend/src` and every exported or top-level component, hook, function, type and constant (AST or TypeScript compiler API, not regex guesses). An item is covered when its file and symbol or its line range is cited by an existing row.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| G2 interactions and states | Every interactive JSX element and handler in `frontend/src` (`onClick`, `onChange`, `onSubmit`, `onKeyDown`, drag and drop, `button`, `input`, `select`, `textarea`, `dialog`, popovers, menus, tabs, toggles), every visible string literal in JSX, and every conditional UI state (empty, loading, error, disabled, confirm, undo, toast). Map each to a row.                                                                                                                                                                                                                                                                                                                     |
| G3 data fields             | Every field of every type and interface in the canvas data models (`coach/model.ts`, `plans/domain.ts`, `plans/types.ts`, `builder/schema.ts`, `builder/model.ts`, `ethereal/**/model.ts`, `client-tracker-preview/*model*.ts`), every key in `src/data/mock-data.json`, every `localStorage` key. For each field: the Prisma model and column it maps to, or none. Field-level status (a model that exists but lacks the field is PARTIAL).                                                                                                                                                                                                                                        |
| G4 rules and computations  | Every derived value, formula, threshold, default, validation, sort or filter rule, recurrence and date logic in the canvas (`muscle-volume.ts`, `accent-contrast.ts`, `roadmap-preview.ts`, `template-setup.ts`, `tracker-setup.ts`, `view-model.ts`, `preview-model.ts`, nutrition and training models, `smooth-trend.tsx`). For each: does the backend compute, store or forbid it? Check every one against `docs/product-decisions.md` (no diagnoses, no automatic program changes, computed totals rules). Collisions are CONFLICT.                                                                                                                                             |
| G5 runtime walk            | Run the canvas headless and crawl it. `cd /home/nexuslink/vari8-worktrees/merge-proto/frontend && npx next dev --webpack --hostname 127.0.0.1 --port 3410` as a background process you own (the `node_modules` are installed; do not reinstall). Drive it with Playwright headless (from the repo root `node_modules`). Visit every route, click every tab, nav item, menu, dialog and toggle reachable without typing real data, at 1440x900 and 390x844. Save screenshots to `/home/nexuslink/.hermes/cache/scratch/vari8-g5/` (not the repo). Census = every distinct screen and state reached. Map each to a row. Kill the dev server at the end and confirm port 3410 is free. |
| G6 backend reverse         | Devin lane, own card (`icm/02-gap-matrix/G6-card.md`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
