# Owner decisions for the TRACKER program

Every PR in `PLAN.md` follows these. One home: other files point here.

## D1. The canvas drives the database

The canvas data model (`frontend/src/components/coach/model.ts`, `plans/domain.ts`, `plans/types.ts`, `builder/schema.ts`) is the source for the Prisma schema. Canvas entities with no table get one. Canvas fields with no column get one. Permissions follow the owner's ROLES decision (D10); consent and health-data rules are parked (D12).

## D2. Next.js 16 lands on TRACKER

TRACKER upgrades the app from Next 15.5 and React 19.1 to the canvas versions (Next 16.3, React 19.3) before canvas screens are ported. Work continues from TRACKER after that.

## D3. Port the canvas into the app (architecture B)

The canvas screens move into the one Next app at the repo root, which keeps the database, Auth.js, RBAC, audit and CI. `frontend/` stays as the visual reference until every screen is ported. Source: `icm/01-recon/output/L2-stack-merge.md`.

## D4. Biome for code, Prettier for Markdown and YAML only

Biome 2 lints and formats TypeScript, TSX, JSON and CSS in one tool, with the `next` and `react` rule domains on (canvas config `frontend/biome.json`). ESLint and the Prettier code formatting retire in one mechanical reformat commit. Prettier stays only for `*.md`, `*.yml` and `*.yaml`, which Biome does not format.

## D5. Target stack

| Layer     | Choice                                                                                              |
| --------- | --------------------------------------------------------------------------------------------------- |
| Runtime   | Node 24 LTS (root CI moves from 22 to match `frontend/.nvmrc`)                                      |
| Framework | Next.js 16, App Router, React 19.3, TypeScript strict                                               |
| UI        | Tailwind CSS 4.3, Base UI primitives, CVA and `cn`, Lucide icons, Motion, the canvas CSS and themes |
| Data      | PostgreSQL 16, Prisma 6 (a Prisma major upgrade is a separate later PR)                             |
| Auth      | Auth.js v5 (`next-auth@5.0.0-beta.32`, peer range includes Next 16)                                 |
| Checks    | Biome, `tsc`, Vitest, Playwright, live browser verification                                         |

## D6. One HTTP API under every screen (mobile-ready)

Every canvas surface reads and writes through one boundary per operation: a Zod-validated service function. Versioned JSON route handlers (`app/api/v1/**`) expose it; a web form may call the same function through a thin server-action wrapper, so web and the later iOS and Android apps share one contract. The static mobile bundle uses only the HTTP routes. Mobile auth gets its own reviewed design before PR-05 builds it (access and refresh token separation, key separation from the Auth.js cookie secret, audience binding, secure device storage, rotation, replay detection, revocation); the R1 recipe is not that design. Mobile shell is Capacitor 8 wrapping the same UI, with a PWA as the interim mobile experience; App Store review (guideline 4.2) stays a risk, not a promise. Sources: `output/R1-mobile.md`, judged in `icm/05-verify/output/RV-B2.md`.

## D7. Toolchain

Biome 2.5 (D4), TypeScript 7 native compiler as the only `typescript` dependency (judge's re-measure on this tree: 2.41 s to 0.26 s warm median, 0 errors; exact speedups are not promised, the plan benchmarks on the target runtime), Turbopack for every build including the canvas (drop `--webpack`), npm kept. No oxlint, oxfmt, Rspack, Vite, Bun runtime, Bend or Three.js. Sources: `output/R2-tooling.md`, `output/P1-next16.md`, `output/P2-biome.md`, judged in `icm/05-verify/output/RV-A.md` and `RV-B2.md`.

## D8. Libraries (smallest set)

Add `zod` 4 now, at every API boundary (R3 recommends it now; the judge confirmed). Media goes to S3-compatible object storage behind the existing `lib/storage.ts` port (vendor still open, chosen on vendor, security and workload evidence). Charts reuse the canvas's own SVG component (`smooth-trend.tsx`), no chart library. Forms stay `useActionState` plus Base UI Form. Dates stay `Intl`. Offline sync (Electric or PowerSync) and TanStack Query are chosen at mobile time, not now. Source: `output/R3-libraries.md`, judged in `icm/05-verify/output/RV-B2.md`.

## D4a. One Biome policy for the whole repo (from the RV-A judgment)

The P2 prototype is behavior-preserving (all 98 reformatted files AST-compared, gates green) but its root config diverged from the canvas config. PR-03 uses one policy for root and `frontend/`: the canvas `recommended` preset, `organizeImports` on, no silent warning overrides (any downgrade is listed with a reason in the PR). It enables `noNextAsyncClientComponent` (exists, off by default) and `nursery/useReactCompiler` as a warning (catches 9 of the 10 React hook findings P1 surfaced). The 10 findings are fixed in PR-03, not suppressed. Pages Router only rules (`no-typos`, `_document` rules) are not needed.

## D11. Cut tests that only prove compilation; keep tests that prove behavior

Today the repo carries 85,847 lines of tests against 62,308 lines of app code: `tests/unit` 109 files / 21,757 lines, `tests/integration` 55 / 39,260, `tests/e2e` 47 / 19,397, canvas `*.test.mjs` and `*.checks.mjs` 23 / 5,433. The owner estimates about 75 percent prove only that code compiles or agrees with itself. That estimate is checked file by file before anything is deleted (`icm/03-plan/output/TEST-AUDIT.md`). Rules:

- A test is kept only if it calls the code the way users do, asserts a literal expected result, and fails when the code under it is broken (bite check: break the code in a scratch copy, the test must fail). Everything else is cut: mock-only tests, type and shape assertions, constant snapshots, framework re-tests, and tests duplicated by a live check.
- Kept tests cluster where behavior is hard to see in a browser: formulas, date and timezone rules, validation at trust boundaries, token crypto, and server-side permission enforcement. Consent and health-data tests are not a reason to keep a file (D12).
- The primary proof of every PR stays live: the real app against a real database, driven in a browser at desktop and mobile widths, compared to the canvas, plus the live role matrix for permissions (D10).
- Builders add a test only when it meets the keep rule above; no compile-proof suites. Every builder card says so (Devin, Codex and OpenCode lanes add them by default).
- PR-03 deletes the files the audit marks CUT. Integration tests that are the only proof of a permission rule stay until the live role matrix covers that rule.

## D9. Issues first, then one PR per issue

The approved plan becomes GitHub issues in `hanzlahsfc/The-great-tracker-`, visible to the whole team. One issue per plan PR section (the section is the issue body and acceptance contract) and one `decision` issue per owner question; build issues name their blockers as "Blocked by #n". Labels per phase (`foundation`, `model`, `service`, `wiring`, `mobile`, `decision`), one milestone per phase. Each issue becomes one branch `<type>/<issue#>-<slug>` off `TRACKER` in its own worktree, Devin builds, a different model verifies, the PR targets `TRACKER` with `Closes #n`. TRACKER is not the default branch, so the issue is closed by hand at merge. Issues are generated from `PLAN.md` by `icm/03-plan/tools/plan-to-issues.mjs` (idempotent, keyed by the plan id), only after owner approval and after TRACKER is pushed. Making TRACKER `main` is the owner's call to Hanzlah when the program completes.

## D10. The owner decides roles and permissions

Who can see, edit and do what (owner, coach, assistant coach, support, client) is an owner decision, not something inherited from `docs/security/authorization-model.md`. That doc contradicts the code (it says the owner cannot edit meal plans, daily entries or training; `lib/auth/rbac.ts:148` grants it for assigned clients; found by round 3 lane G6). Both are inputs only. The plan carries one `ROLES` decision: a role by capability matrix built from the canvas surfaces, with the doc's rule and the code's rule shown side by side per cell, for the owner to fill in. It blocks PR-05 and every wiring PR. Once decided, the matrix becomes the single source: `rbac.ts` is changed to match it and the security doc is rewritten from it. What stays mandatory regardless: server-side enforcement of the decided matrix. Rows that were CONFLICT because of the permission doc become ROLES decision rows; consent and health-data CONFLICT rows are parked (D12).

## D12. Consent, health-data storage and data-protection rules are parked

The owner parks these for now. They do not block, shape or gate any canvas element, plan PR or test decision. Existing consent code in the backend (consent records, consent-version gates, health-data checks such as `lib/*/consent.ts`) is not extended; where it blocks a canvas flow, the plan routes around it or disables the gate behind a flag, and lists the spot in a `## Parked: consent and health data` appendix so it can be picked up later. Matrix rows that are CONFLICT only because of consent or health-data rules move to that appendix.

## D13. No GitHub CI; checks run locally

Owner decision (Marcel, 2026-10-18). GitHub Actions minutes are not spent on this program. Measured before the decision: 35 CI runs in 6 days at about 14 minutes each (browser tests 8.1, integration 3.3, build 1.4, unit 0.6), about 2,400 minutes a month on a private repo. PR-03 switches `ci.yml` and `frontend.yml` to `workflow_dispatch` only (manual, never automatic). Until PR-03 lands, Actions can be disabled in the repo settings. Every PR is gated locally instead: one script runs format, typecheck, lint, unit tests, integration tests (only when `db/`, `lib/` or `app/api/` changed), build, and the live lane. The verifier runs it and pastes the output into the PR.

## D14. Tests are kept by value, not only by bite

Amends D11 (owner, 2026-10-18). A test that fails when its code breaks is not automatically worth keeping. Keep a test only if it bites AND guards something a browser check cannot easily see: permission and workspace isolation, validation at trust boundaries, token and password rules, date and timezone rules, calculations whose numbers a person would not check by eye, and data integrity (transactions, concurrent writes, uniqueness). Tests of things visible on screen (layout limits, labels, what a component shows, navigation) are cut: the live lane covers them. Builders write new tests only in the keep categories.
