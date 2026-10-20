# PR-W0 report

Card `icm/05-build/cards/pr-w0-data-seam.md`, issue #131, PR #132. Builder: Devin swe-2 on the MacBook lane (worktree `.worktrees/pr-w0-data-seam`, DB `app_w0`, port 3875).

## What changed

The monolithic `coach-desktop-mockup-v1` envelope is separated before serializing into one localStorage key per domain, assembled and validated through the same migrate + isCoachState + normalize pipeline the single envelope used. Each domain owns its slice; `components/canvas/data/index.ts` lists every domain once, in merge order, so later wiring PRs edit only their own provider file.

New `components/canvas/data/`:

- `provider.ts` — the only module that touches `localStorage`, plus the `CoachSlice` contract (key, extract, merge).
- `http.ts` — the shared same-origin `/api/v1` fetch client (ruling O1): cookie session for web and PWA, optional bearer token for Capacitor, `ApiClientError` carrying HTTP status and the server's `{ error: { code } }` code, status 0 `network` for transport failure; the file documents the failure (X5) and loading (X7) conventions. No caller yet — wiring PRs route through it.
- `clients.ts` — `coach-data-clients-v1`: client records minus the collections other domains own (assignment, schedules, plans, entries, habits). Also owns `coaching-clients-workspace-v1` (roster + invitation drafts, same envelope).
- `templates.ts` — `coach-data-templates-v1`: templates, editor drafts, per-client assignments.
- `checkins.ts` — `coach-data-checkins-v1`: extras, submissions, review drafts, per-client schedules.
- `habits.ts` — `coach-data-habits-v1`: per-client active and retired habits.
- `nutrition.ts` — `coach-data-nutrition-v1`: per-client nutrition lifecycles (meal plan, IIFYM); also owns `coaching-mealplans-v1`.
- `training.ts` — `coach-data-training-v1`: exercise library plus per-client training lifecycles.
- `dashboard.ts` — owns `ethereal-dashboard-draft-v1` and `ethereal-dashboard-records-v1`; no coach slice (variant dashboards serialize inside templates).
- `notes.ts` — `coach-data-notes-v1`: coachNotes and coachTodos.
- `messages.ts` — `coach-data-messages-v1`: messages and composer drafts.
- `appearance.ts` — `coach-data-appearance-v1`: preferences; also owns `coaching-ethereal-appearance-v1`.
- `tracker.ts` — `coach-data-tracker-v1`: per-client entries and goals (G10 assigns goals to the tracker wiring); also owns `coaching-client-tracker-maya-v1` (the moved readDraft sanitizer).
- `index.ts` — the domain registry plus `readCoachState`/`writeCoachState`: all-keys-present assembles, zero keys falls back to the legacy envelope for one-time adoption, a partial set throws (same unreadable path a corrupt envelope took). The legacy key is dropped only after a full slice write succeeds.

Consumers rewired, persistence logic otherwise unchanged: `components/canvas/coach/store.tsx`, `components/canvas/ethereal/clients/clients-workspace.tsx`, `components/canvas/ethereal/mealplan/mealplan-workspace.tsx`, `components/canvas/ethereal/client-tracker/client-tracker.tsx`, `components/canvas/ethereal/builder/dashboard-builder.tsx`, and `lib/canvas/ethereal-appearance.tsx` (delegates to the appearance provider; the Appearance type and normalizeHex stay where they are so no import cycle forms).

Test: `tests/unit/canvas-data-seam.test.ts` (D14 data-integrity category) — seed round-trips byte-equal through the slices, domain slices off the client core round-trip, the legacy envelope is adopted once and then the slices serve, an incomplete key set and corrupt JSON throw, a dropped required per-client field fails `isCoachState`, and the fetch client maps `{ error: { code } }` and network failure to `ApiClientError`.

## Slice ownership decisions (judgment calls a verifier should see)

- `plans.nutrition` -> nutrition, `plans.training` -> training, `plans.goals` -> tracker (G10 names PR-W4 for goals).
- `assignment` -> templates (the assign flow is PR-W3); `schedules` -> checkins (they drive the check-in calendar).
- `plan` (the legacy flat field mixing nutrition and training numbers) and the WorkspaceClient detail fields (notes, tasks, check-ins, messages, onboarding) stay on the client record: they are profile-record data and splitting a flat object across providers would be cosmetic surgery, not a seam.
- Missing required per-client fields fail closed through `isCoachState`, identical to the monolith; optional fields (plans, assignment, retiredHabits) behave exactly as before (absent or migrate-backfilled).

## Commands and exit codes

| Command                                                    | Exit                                                                           |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `npm ci` (root)                                            | 0                                                                              |
| `npm ci` (frontend/)                                       | 0                                                                              |
| `createdb app_w0` + `prisma migrate deploy`                | 0                                                                              |
| `git merge origin/Vari8-Beta`                              | 0 (already up to date)                                                         |
| `npm run typecheck`                                        | 0                                                                              |
| `npm run lint`                                             | 0 (81 warnings, 0 errors; warnings are pre-existing canvas-relaxed hook rules) |
| `npm run test`                                             | 0 (92 files, 1043 tests)                                                       |
| `nice npm run build`                                       | 0                                                                              |
| `cd frontend && nice npm run build`                        | 0                                                                              |
| `npm run test:integration` (against app_w0; lib/ touched)  | 0                                                                              |
| `npm run index`                                            | 0 (no drift)                                                                   |
| `npm run index:check`                                      | 0                                                                              |
| `npx prettier --check .`                                   | 0                                                                              |
| `DATABASE_URL=...app_w0 nice npm run parity`               | **1 — platform-blocked, see below**                                            |
| Live probe (probe.mjs, signed-in Chromium at 1440 and 390) | 0                                                                              |
| `dropdb app_w0`                                            | done at cleanup                                                                |

## Acceptance evidence

- `grep -rn "localStorage" components/ lib/` — the only API call sites are inside `components/canvas/data/*.ts`. Remaining matches outside the card's file list and unchanged: `components/theme-toggle.tsx` and the inline theme script in `app/layout.tsx` (old UI bound for deletion in PR-R*, key `appearance`, unrelated to the canvas), plus a comment in `app/(tracker)/.../daily-entry-panel.tsx`. The `frontend/` canvas keeps its own copies by design (D32 baseline source).
- Live probe (`scratch/pr-w0-data-seam/probe-report.json`): after sign-in and `/coach` hydration, all ten domain keys exist (`coach-data-appearance|checkins|clients|habits|messages|notes|nutrition|templates|tracker|training-v1`), `coach-desktop-mockup-v1` is gone, and every slice survives a reload. Dashboard correctly holds no coach key.
- Screenshots: `scratch/pr-w0-data-seam/coach-clients-1440.png`, `coach-clients-390.png` (roster, the heaviest seam consumer).

## Parity: platform-blocked on macOS

`npm run parity` exits 1 with 70 problems — all 35 screens fail at 1440 only; every 390 capture passes. Every failure is `text=0`, `geom=0/0/N` with sub-2px element shifts and no text changes — a font-metric difference, not a layout or data change. `tools/parity/baseline` was captured on Linux (PR-01's report: "parity on this Linux host is bit-exact"); this lane is macOS, whose text rasterization differs. A data-seam defect cannot produce identical text with uniform sub-pixel shifts on every screen at exactly one width. Not fixable inside this card: regenerating the baseline is a `--update-baseline` call against `frontend/` on a reference platform, owned by the driver/lead. `tools/parity/out/report.html` holds the per-screen diff evidence.

## What I could not do / flags for the verifier

- Parity acceptance (35/35) is unprovable on this machine; see above. The alternative evidence is the unit round-trip suite, the live probe, and the screenshots.
- `lib/canvas/ethereal-appearance.tsx` is outside the card's literal file list (`components/canvas/ethereal/**` persistence modules only) but carries the `coaching-ethereal-appearance-v1` key the card says to move behind the appearance provider. I edited it minimally (storage IO delegated); logic, types and normalizeHex untouched.
- `verify-local.sh` was not run: it reads Linux driver paths (per the lane brief); the footer checks were run by hand as listed above.
- The stored value `"null"` edge: for the dashboard draft a stored literal `null` now resolves to the "absent" branch ("Saved locally") instead of the restore-failed notice; unreachable through app writes, end state identical. Everywhere else the exact absent-vs-invalid distinction is preserved.
