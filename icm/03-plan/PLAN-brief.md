# PLAN brief (stage 02 close-out and stage 03)

All paths are under `/home/nexuslink/NEXUS_AI_CENTER/04_PROJECTS/Vari8/`. Read in this order and stop early: `AGENTS.md`, `CONTEXT.md`, `icm/02-gap-matrix/CONTEXT.md`, `icm/03-plan/CONTEXT.md`, `icm/03-plan/DECISIONS.md` (binding, D1 to D8).

## Part A. Consolidate the gap matrix

Inputs: `icm/02-gap-matrix/output/F1/GAP-MATRIX.md` and `F1/S01..S12-*.md` (Team F), the cross-check `icm/02-gap-matrix/output/V/V1-core.md`, `V2-plans.md`, `V3-views.md`.

Write `icm/02-gap-matrix/output/GAP-MATRIX.md`:

1. Start from Team F's rows. Apply every V verdict: DISAGREE resolved H changes the row; H-ONLY rows are added as new rows with the V evidence (they are elements Team F missed); F-ONLY rows stay.
2. Summary table: per surface, count per status (WIRED, UNWIRED, UNCONFIGURED, PARTIAL, MISSING, CONFLICT), with the arithmetic shown. State the delta from Team F's 281.
3. Every non-WIRED row grouped by surface, the ORPHAN list (S12), the CONFLICT list with the binding decision each one hits.
   Write it section by section. Do not copy the 200 KB F file wholesale: one line per row, cite the surface file row id for detail.

## Part B. Write the plan

Inputs: the consolidated matrix (Part A), `icm/02-gap-matrix/output/F1/WIRING-SPEC.md`, `F1/OPEN-QUESTIONS.md`, `icm/03-plan/DECISIONS.md`, `icm/03-plan/output/P1-next16.md`, `P2-biome.md`, `R1-mobile.md`, `R2-tooling.md`, `R3-libraries.md`, `icm/01-recon/output/D1-merge-prototype.md`, `H4-unwired-config.md` (fix list).

Write `icm/03-plan/output/PLAN.md`. Follow the skeleton in `/home/nexuslink/.hermes/skills/poteto-mode/playbooks/multi-phase-plan.md` (headings in order: program summary, How to read this, Program checklist, one section per PR, Close the program, Appendix A to D). Adaptations for this repo:

- Base branch is `TRACKER` (local, becomes `main`). Repo `hanzlahsfc/The-great-tracker-`. Builders: Devin CLI (`swe-2-max` for normal PRs, `fusion-claude-opus-5-5-medium-sidekick-swe-2-high` for cross-cutting ones), each in its own worktree. Verifier: a different model. The program runs `autopilot-stack`: the operator (Marcel) lands.
- Execution playbook paths: `/home/nexuslink/.hermes/skills/poteto-mode/playbooks/`. Control skill for live lanes: drive the running app in a headless browser (Playwright from the repo) at desktop and mobile widths; local Postgres via `docker compose -p vari8` on port 5433; each lane its own app port.
- First line under the title: `STATUS: AWAITING OWNER APPROVAL`.

Required PR order (adjust only with a written reason):

1. Foundation: merge FRONTEND into TRACKER (D1 prototype `58eb6ed` merges clean).
2. Next 16 and React 19.3 (P1 `b603c35`).
3. Biome (P2 `d1b1668`, `ce2efed`), TypeScript 7 native, Turbopack for the canvas, Node 24 in CI (D7). Fix the 10 react-hooks findings P1 surfaced.
4. Configuration: everything H4's fix list says is off or unreachable in a normal run (flags, dev seed, bootstrap owner).
5. API foundation (D6): `app/api/v1/**` pattern, Zod boundary, token auth. The auth library choice (Auth.js plus own tokens vs Better Auth) is an OPEN OWNER DECISION: write the PR for both options and mark which part depends on it.
6. Data model PRs from WIRING-SPEC section 2 (canvas drives schema, D1), then services (section 3), then one PR per canvas surface wiring (section 4), ordered so each surface is usable end to end before the next.
7. Blocked domains (WIRING-SPEC section 5) and every OPEN-QUESTIONS item: list them in a `## Owner decisions needed` section right after the summary, each with the evidence and options, and mark which PRs each one blocks.
8. Mobile (Capacitor 8, PWA first) as the last phase, scoped but not detailed.

Every PR section: Depends on, Files, Build, You see, Verify unit/live/perf, Review gate, Merge, exactly as the skeleton. Every PR that changes a screen is review-gated (Marcel reviews screenshots against the canvas). Keep each PR one verifiable change.

Then run `node /home/nexuslink/.hermes/skills/poteto-mode/scripts/check-plan.mjs icm/03-plan/output/PLAN.md` and fix every line it prints. Prose rules: plain English, short declarative sentences, no long dashes, no mid-sentence colons.

## Rules

Read-only everywhere except the two output files. Write incrementally: each section to disk as soon as it is done. Never hold the whole plan in memory.

## Self-check (mandatory)

List as PASS or FAIL with evidence: (1) GAP-MATRIX counts reconcile with F totals plus V deltas (show arithmetic); (2) every non-WIRED matrix row maps to a PR id or an owner decision (give counts, list any orphan rows); (3) every OPEN-QUESTIONS item appears under Owner decisions needed; (4) check-plan.mjs output after fixes (paste it); (5) only the two files written.
