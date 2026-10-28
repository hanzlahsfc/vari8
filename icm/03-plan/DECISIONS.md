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

Amends D11 (owner, 2026-10-18). A test that fails when its code breaks is not automatically worth keeping. Keep a test only if it bites AND guards something a browser check cannot easily see: workspace isolation, validation at trust boundaries, token and password rules, date and timezone rules, calculations whose numbers a person would not check by eye, and data integrity (transactions, concurrent writes, uniqueness). Tests of things visible on screen (layout limits, labels, what a component shows, navigation) are cut: the live lane covers them. Builders write new tests only in the keep categories.

Tests of code that an owner decision replaces are CUT-AT-REPLACE: they stay until the replacing PR and are deleted in it. This covers every test of today's permission model (`lib/auth/rbac.ts`, `guard.ts`, `docs/security/authorization-model.md`), because permissions are redefined from scratch (owner, 2026-10-18; D10 `ROLES`); auth-library tests if the `AUTH` decision replaces the library; and consent tests (D12). The new permission model gets one table-driven test generated from the `ROLES` matrix (every role by every capability, allow or deny, run against the real server check), written in the PR that builds the matrix.

## Owner answers of 2026-10-18 (D15 to D36)

Source: `icm/03-plan/OWNER-ANSWERS-1018.md` (verbatim answers win on conflict). Each entry names the question it settles, what it supersedes, and the PR that builds it. A "Default" line marks an interpretation Marcel can reverse with the named word.

## D15. ROLES: staff edit, clients read their own plans

Settles D10 and Q15 (`ROLES`, answer 3). Two actor kinds exist. Staff are the workspace `owner` and `coach`. They hold the same data capabilities over every client of their workspace (D22). The client is self-scoped.

| Capability                                                                                                             | Owner | Coach | Client           |
| ---------------------------------------------------------------------------------------------------------------------- | ----- | ----- | ---------------- |
| Read and edit a client's plans (training, nutrition, habits, check-in schedule, template assignment, dashboard layout) | allow | allow | deny             |
| Read own plans, dashboard, check-in schedule and feedback                                                              | n/a   | n/a   | allow            |
| Log own tracker values, submit own check-ins, complete own habits and tasks                                            | n/a   | n/a   | allow            |
| Read a client's tracker values, submissions and onboarding answers                                                     | allow | allow | own only         |
| Private coach notes and coach tasks (D26)                                                                              | allow | allow | deny             |
| Templates, parameter picks, saved meals, exercise library                                                              | allow | allow | deny             |
| Messages with a client (D20)                                                                                           | allow | allow | own conversation |
| Workspace appearance and preferences (D25)                                                                             | allow | allow | deny             |
| Invite a client, archive and delete a client (D27)                                                                     | allow | allow | deny             |
| Anything the canvas does not draw (platform admin, assistant, support, export, erasure)                                | deny  | deny  | deny             |

- Rows resolved: V2-H5 and V3-CO01 allow, because the canvas renders the coach library cue and the tracker value comment inside the client view. V2-H12 allow (staff write). V3-CO05 binds the standalone tracker to the signed-in client's own profile. R3-23 and R3-24 deny every cell; no canvas console exists, and the `assistant` and `support` enum values stay unused. R3-25 keeps the workspace-wide roster (D22).
- Enforcement is server side, one capability table in `lib/auth/roles.ts`, with one table-driven test of every actor by every capability against the real server check (D14). PR-05 writes the complete table for every canvas surface up front, so wiring PRs only consume it.
- Supersedes `docs/security/authorization-model.md` and the grants in `lib/auth/rbac.ts`. PR-05 rewrites the security doc from this table and deletes the CUT-AT-REPLACE permission tests (TEST-AUDIT).

## D16. AUTH: pick Better Auth only on evidence

Settles the `AUTH` decision (answer 4). The evaluation lane writes `icm/05-build/AUTH-DECISION.md` comparing Better Auth with Auth.js v5 plus own tokens on these criteria, each with a cited source or a measured prototype: mobile bearer tokens for Capacitor, session revocation, organization or workspace plugin, two-factor, admin impersonation, rate limits, Prisma adapter, Next 16 support, and lines of code we keep.

- Rule: Better Auth wins only if it covers every criterion with less code we own. Otherwise Auth.js v5 plus own tokens stays (D5).
- The outcome is recorded as D16a when the lane lands, and PR-05 implements it. Session revocation, inactive-account rejection, malformed-claim rejection and fail-closed lookup survive either way (TEST-AUDIT conditional cases `TB0.093`, `TB1.020`, `TB1.021`, `TB3.070`).
- Mobile token issuance (D6) stays a reviewed design inside PR-31; PR-05 builds the cookie session, the `app/api/v1` boundary and the identity seam `getViewer()` that every screen calls.

## D16a. AUTH outcome: Better Auth

Recorded from `icm/05-build/AUTH-DECISION.md` (verdict) and the orchestrator ruling of 02:12 on 2026-10-19, which accepted it.

- Better Auth replaces Auth.js v5 (`next-auth@5.0.0-beta.32`) for sessions, passwords, two-factor, login rate limits and bearer tokens, with the Prisma adapter. PR-05 (#58) implements it.
- Hanzlah's invite token store (`lib/tokens/*`, `lib/workspace/invitations.ts`) stays the single-use invite authority. The organization plugin is not used.
- Password reset links expire after 60 minutes and work once. This supersedes the 12 hour value in `lib/tokens/store.ts:36`; the owner can reverse it.
- Mobile clients use the bearer plugin. Refresh-token rotation and Capacitor secure storage are deferred to the Capacitor milestone (PR-31 and a follow-up issue).
- Criteria the evaluation could not show as covered, accepted by the ruling: refresh rotation (deferred), an audit log for impersonation (no canvas console uses impersonation, R3-23), Capacitor storage (chosen at mobile time). Prisma stays on 6 unless the adapter needs 7, proven inside PR-05.
- The four guarantees named in D16 survive the swap; the PR-05 verifier checks each one.

## D17. Coach self-signup

Settles Q1 (answer 5) and amends product decision #13. A public sign-up page creates a `User`, a new `Workspace` and an `owner` membership in one transaction. Clients still join only by a staff invite (D15). Sign-up is rate limited. Mail goes through one delivery port with a development adapter that writes to a local mailbox file; the production provider stays an open owner choice. PR-04 adds a development seed so every lane can sign in without the public page; PR-05 builds the page.

## D18. Show the real role name

Settles Q15 (answer 6). The canvas account block shows the member's real role, `Owner` or `Coach`, in the same slot with the same typography. A self-signed-up coach owns the workspace and reads `Owner`. Built in PR-01 (account block) on the PR-04 seed.

## D19. Consent and health-data gates are off behind one flag

Settles answer 7 and implements D12. Every consent and health-data gate in `lib/consent.ts`, `lib/*/consent.ts` and `lib/gdpr*` reads one flag, `ENABLE_CONSENT_GATES`, which is unset (off) in every environment. With the flag off a gate allows the operation and writes no consent record. Messages and media are never gated by consent. The photo-consent blocker in the old PLAN Appendix C is void.

- Health fields the canvas shows (cycle tracking in the tracker and the template goal picker, rows S09-17 and V2-H4) are wired like any other parameter.
- Every gate turned off is listed in PLAN v2 `## Parked: consent and health data` with file and line, so the gates can be designed later. Built in PR-04, which also deletes the consent CUT-AT-REPLACE tests (TEST-AUDIT).
- Risk recorded, not a blocker: health data is special-category personal data. The beta runs on synthetic data until the parked gates are designed.

## D20. Messaging and media: full canvas scope

Settles Q2 (answer 8). Build everything the canvas messaging screens draw: conversations with search and All, Unread and Flagged tabs, thread search, text messages, drafts per client, read state and unread counts (S02-05), priority flags with the per-client permission, context links to plans and check-ins, the emoji grid and reusable replies, the athlete context panel, and the nav badges.

- Attachments: images, documents and audio voice messages, recorded in the browser through the same dialog the canvas draws (the `DemoRecorder` UI with a real `MediaRecorder` source). Size caps as the canvas shows them (20 MB per attachment).
- Default, reverse with `no-video`: the canvas also offers video files and video feedback (S02-08, S03-18). They ride the same media path as audio.
- Storage sits behind `lib/storage.ts` (D8): a local-disk adapter for development and an S3-compatible adapter configured by environment. The vendor stays open.
- Voice transcription and transcript export are a follow-up issue (`FOLLOW-UP-TRANSCRIBE` in PLAN v2). No interface is scaffolded.
- Built in PR-MEDIA (storage, upload, recorder) and PR-MSG (domain, routes, screens).

## D21. The Ethereal studio is product

Settles Q9 (answer 9). `/ethereal` and its hash pages (appearance, foundations, dashboard builder, tracker configurator, clients, meal plans) are product routes behind the staff session, taken over in PR-01 exactly as they render today. Their data screens wire to the same services as `/coach` (dashboard builder PR-W9, tracker configurator PR-W4, clients PR-W2, meal plans PR-W7, appearance PR-W10). Supersedes the "dev-only or drop" options in WIRING-SPEC section 4.

## D22. Workspace calendar and roster are workspace-wide

Settles Q14 (answer 10). Staff read every client of their own workspace on the roster, the check-in board and the calendar. Attention rules are the canvas rules as coded today (pending feedback, overdue tasks, unread messages, per `frontend/src/components/coach/model.ts`). Foreign workspaces are never readable. Built in PR-SV1, wired in PR-W2 and PR-W6.

## D23. Ship an empty template library

Settles Q5 (answer 11). The product database starts with no templates and no bundled parameter seed (decision #48 holds). The development seed loads the canvas demo set (synthetic) so every screen renders as it does today and the parity gate (D32) compares like with like.

- Open risk for Marcel: the canvas has no parameter-create screen (the backend manager is orphan R3-17), so a new production workspace cannot add tracker fields. Reverse with `seed-catalog` to ship the 55 canvas parameter definitions after a source-fidelity review.

## D24. Undo: confirmation and timed restore

Settles Q12 (answer 12) and amends #44. Where the canvas shows an Undo toast (S01-11, S03-09, S05-05, S06-10), the server soft-deletes and keeps the row restorable for the toast lifetime plus a 10 second grace; after that the archive is terminal (#44). Where the canvas draws a confirmation dialog, it stays. No new visible UI. Builder undo and redo (S08-09) is editor history, not deletion, and stays client side.

## D25. Appearance is saved per workspace

Settles Q6 (answer 13). Color mode, accent, font, density, logo, availability text and notification toggles live on the server per workspace. Logo upload uses the media port (D20). Built in PR-M2 (service) and PR-W10 (screens).

## D26. Private coach tasks are their own entity

Settles Q4 (answer 14). `CoachTask` (workspace-level or linked to a client) and `CoachNote` are staff-only tables with structural audit (ids and counts, never bodies). They are never `ClientTask` (#109). Built in PR-M0 (schema), PR-M3 (service), PR-W10 (screens).

## D27. Archive and retention

Settles Q3 (answer 15). Archive is a soft archive (`archivedAt`). Ending a membership archives the client. Archived clients leave the roster and can be restored. After the retention period, default 90 days and configurable per workspace, staff may delete the client for good; nothing is deleted automatically. Delete writes a structural audit event. Phase and week stay derived from the assigned plan. Built in PR-M0, PR-M1, PR-W2.

## D28. Time and duration format

Settles Q10 (answer 16) and amends #75. TIME fields display as the canvas does (24-hour `HH:mm` by default, the canvas 12/24-hour editor stays) and are stored as minutes after midnight, 0 to 1439. DURATION fields keep the canvas unit (hours with decimals or whole minutes) and store that number. Built in PR-M0 and PR-W4.

## D29. Nutrition totals and training volume are computed as the canvas shows

Settles Q7 and Q11 (answers 17 and 18, "canvas wins" default) and amends #115 and #116. Where the canvas computes a number (portion, meal, option and day kcal and macros from catalog food values, the 4/4/9 ring, IIFYM derived kcal, attainment status, weekly muscle-group working sets), the product computes the same number with the canvas function, moved to one shared module used by server and client. Nothing the canvas does not compute is added. A blank numeric input stays missing, never zero (#36), and renders as the canvas renders an empty field. Built in PR-W7 and PR-W8.

## D30. Check-ins are generated explicitly

Settles Q13 (answer 19). Saving a schedule is the explicit staff action that generates occurrences through T+56 days (#114). No background replenishment. The calendar renders later recurring dates as a read-only projection of the schedule, so the board looks as it does today. Plan adjustments bundled with feedback (S03-19) are activated only by the coach's explicit submit. Built in PR-M8 and PR-W6.

## D31. Dashboard: wire what the canvas builder does today

Settles Q8 (answer 20). The layout lives where the canvas keeps it: on the template, copied into the client's setup on assignment (assigned clients keep their snapshot), plus the studio draft per workspace. The widget catalog is the canvas catalog (20 kinds in 9 categories). Bound widgets read live data; unbound widgets show the canvas empty state. Percent fills and counts are computed as the canvas computes them. No new widget system; themes are future work. Built in PR-M9, PR-SV3, PR-W9.

## D32. Canvas-exact visual parity is an acceptance gate

Owner overriding rule. Every screen in `icm/04-briefing/shots/index.json` (35) passes a before and after comparison at desktop 1440 by 900 and mobile 390 by 844.

- Before: the canvas app in `frontend/` at `Vari8-Beta` `17352b0` with its demo state, the same tree the briefing shots came from (`frontend/` is identical to `58eb6ed`).
- After: the root app, signed in, on a fresh database loaded by the development seed that reproduces the canvas demo data.
- Both runs freeze the clock at `2026-10-19T09:00:00+02:00`, disable animation and replay the click path recorded per screen in `index.json`.
- Pass: DOM geometry (every visible element's role, accessible name, text and bounding box within 1 CSS pixel) and a pixel diff of at most 0.1 percent of pixels (pixelmatch threshold 0.1), with masks only for the truth-text exceptions below.
- PR-01 gates all 35 screens. Each wiring PR gates the screens it wires. The harness and baselines come from PR-P1. Evidence goes to `icm/05-build/evidence/<card>/parity/`.

Truth-text exceptions (copy that names browser-local storage or the demo source would become false once data lives on the server and the recorder records for real; same position, style and size, new words). Reverse with `keep-demo-copy`.

| Row    | Today                                                   | After                                                          |
| ------ | ------------------------------------------------------- | -------------------------------------------------------------- |
| S01-09 | "Local demo" / "Session only"                           | "Saved" / "Saving"                                             |
| S02-24 | "Local demo media"                                      | the file size, as the canvas shows for real files              |
| S02-25 | "Record demo voice note" / "Record demo video feedback" | "Record voice note" / "Record video feedback"                  |
| S03-17 | "Sent locally"                                          | "Sent"                                                         |
| S03-18 | "Record demo video feedback"                            | "Record video feedback"; real recorder button is 39px narrower |
| S10-09 | "Saved automatically on this device"                    | "Saved automatically for this workspace"                       |

The S02-25 row carries D36's recorder rule into the gate: PR-MEDIA wires the recorder to a real stream, so its labels drop the demo prefix. `tools/parity/compare.mjs` masks exactly that button text, nothing else.

The pass rule is applied per screen as a changed-pixel budget of 0.1 percent of that screen's captured area (`tools/parity/compare.mjs`, `d32Budget`), with `PARITY_MAX_DIFF_PIXELS` available as an absolute override for other hosts. DOM geometry, text and page size stay bit-exact at every budget.

Demo-only controls ("Reset this mockup", "Load demo audio preview") render only when `APP_ENV` is development, which is the mode the parity gate runs in.

## D33. Reduce the backend

Owner overriding rule: take the best of both, delete over-engineering. Deletion needs proof of zero callers (a census command in the PR) and moves or deletes the code's GUARD tests with it.

- PR-R1 deletes the old backend UI that the canvas replaces (`app/workspace/**` pages and `components/**` once their screen is wired), the public fixture library pages (R3-21), dead helpers (R3-20, R3-22), the raw sheet viewer and the extraction pipeline when no runtime caller remains (S12-08, S12-09, S12-44 to S12-53, S12-75), the browser-local persistence seam of the canvas (S01-13), and finally `frontend/` itself after the last parity pass.
- PR-R2 drops database models left without a reader after PR-R1, through the schema chain (D34).
- PR-R3 removes the `ENABLE_*` flags of features that are now product (always on), keeps development-only gates and `ENABLE_CONSENT_GATES`, and drops dependencies left unused.
- Kept: domain services, audit, tokens, catalog importers, onboarding (the canvas has an onboarding tab), template transitions only if a canvas flow calls them.

## D34. One writer for the database schema

Separate before serializing shared state. `db/schema.prisma` and `db/migrations/**` have exactly one writer at a time, through the dependency chain PR-04 (seed only, no schema), PR-05 (auth tables if D16a needs them), PR-M0 (every canvas entity and field in one migration set), PR-R2 (reductions). Every other branch must leave `db/` untouched; the local check (`icm/05-build/tools/verify-local.sh`) fails a branch that is not on the allowlist and touches `db/`. Shared registries follow the same rule: the seed is one file per domain under `scripts/seed/`, routes are one folder per operation under `app/api/v1/`, and the capability table is written once in PR-05.

## D35. Program mechanics for the Vari8-Beta run

Amends D9 for this run. `Vari8-Beta` is the integration branch in place of `TRACKER`. Each PLAN v2 PR is one kanban card on board `vari8`, built on branch `beta/<card-slug>` off `Vari8-Beta` in `/home/nexuslink/vari8-worktrees/<card-slug>`, verified by a different model on its own branch (which carries the evidence commit), and merged by an integration card through `icm/05-build/tools/integrate.sh` (one lock, merge in the card's own worktree, checks, then fast-forward `Vari8-Beta`). Lanes never push. The orchestrator pushes, and generates issues and PRs from PLAN v2.

## D36. Canvas wins on every CONFLICT row

The 30 CONFLICT rows of the gap matrix were blocked by product rules the owner answers now replace. Each row's treatment and owning PR:

| Row      | Treatment                                                             | PR       |
| -------- | --------------------------------------------------------------------- | -------- |
| S02-05   | Read state and unread counts as the canvas draws (D20)                | PR-MSG   |
| S02-09   | Context links built (D20)                                             | PR-MSG   |
| S02-12   | Voice note with a real recorder in the same dialog (D20)              | PR-MSG   |
| S02-08   | Attachments: photo, video, file, 20 MB cap (D20)                      | PR-MEDIA |
| S02-24   | MediaCard on stored media (D20, D32 truth text)                       | PR-MEDIA |
| S02-25   | Recorder records for real, same UI (D20)                              | PR-MEDIA |
| S03-11   | Explicit generation plus read-only projection (D30)                   | PR-W6    |
| S03-18   | Video feedback through the media path (D20)                           | PR-W6    |
| S03-19   | Plan adjustments activate on the coach's explicit submit (D30)        | PR-W6    |
| S03-20   | Feedback lands in the conversation as a message with links (D20)      | PR-MSG   |
| S05-05   | Delete with timed restore (D24)                                       | PR-W3    |
| S05-24   | One variant as the canvas normalizes it; no variant layer (#63 holds) | PR-W3    |
| S06-07   | Computed kcal and macros (D29)                                        | PR-W7    |
| S06-08   | 4/4/9 ring (D29)                                                      | PR-W7    |
| S06-15   | IIFYM derived kcal and ring (D29)                                     | PR-W7    |
| V2-H2    | Blank stays missing (#36, D29)                                        | PR-W7    |
| V3-CP10  | IIFYM ring (D29)                                                      | PR-W7    |
| V3-CO02  | Automatic nutrition totals (D29)                                      | PR-W7    |
| R3-4     | Attainment status as the canvas computes it (D29)                     | PR-W7    |
| R3-5     | Percent fill against the target as the canvas computes it (D29)       | PR-W7    |
| R3-9     | Weekly and monthly means as the canvas computes them (D29)            | PR-W7    |
| R3-11    | Range targets as the canvas renders them (D29)                        | PR-W7    |
| R3-14    | Starter meals only where the canvas creates them (D29)                | PR-W7    |
| S07-15   | Weekly muscle volume panel (D29)                                      | PR-W8    |
| V3-CP13  | Muscle volume table (D29)                                             | PR-W8    |
| S09-10   | Time fields with the canvas editor (D28)                              | PR-W4    |
| V3-CO03  | Edits keep revision history (#79); the canvas edit flow is unchanged  | PR-W4    |
| R3-13    | Calories as the canvas offers it, an ordinary parameter               | PR-W4    |
| R3-12    | Habit percent fill as the canvas computes it (D31)                    | PR-W9    |
| V3-H4-02 | Trusted-runtime check on exact-1 flags                                | PR-04    |

## D37. Owner rulings O1 to O16 recorded

Owner decision (Marcel, 2026-10-20). The sixteen open items of the wiring spec are ruled. `icm/03-plan/output/WIRING-SPEC.md` section "Owner rulings" records each ruling with the options considered and the owning wave it lands on, and `docs/product-decisions.md` records the product-behaviour rulings as decisions #120 to #132. The wiring waves apply them; they are not reopened.

## D38. O17: clients sign in on the client look, and client links stay on /me

Owner decision (Marcel, 2026-10-20), ruling O17, card `auth-client`.

The auth routes #130 restyled (`/login`, `/reset-request`, `/reset`, `/invite`) wear the coach shell (O16). Clients sign in at their own address, so they get the same forms inside the client shell:

- `/me/login`, `/me/reset-request` and `/me/reset` render the forms, server actions and copy of #130 inside the root `/me` mounts (`appearance-root eg-root`, `data-mode`, the theme variables from `lib/canvas/ethereal-appearance.tsx`), with `Ethereal Geist` loaded. The CSS is layout only: `.auth-screen.eg-auth` in `app/auth.css` bridges the card's `--cd-*` tokens onto the `.eg-root` variables, so no colour is restated and both modes follow the shell's own `data-mode`.
- `/invite` picks its shell from the invitation's `intended_role`: a client invitation opens on the client look, a staff invitation on the coach look. An unusable link keeps the coach look.
- A signed-out visit to `/me` redirects to `/me/login`, not `/login`. Staff surfaces keep `/login`. Sign-in from `/me/login` runs the same action as `/login` (redirect to `/`, which sends staff to `/coach` and a client to `/me`), so a coach who signs in there is not locked out.
- Client-facing links stay on `/me`: the client password reset mail links to `/me/reset`, a client sign-out lands on `/me/login`, and a client invitation acceptance keeps its sign-in link on `/me/login`.

No new auth logic: the only new server-side reads are the invitation role for shell selection and the profile lookup that decides the reset link path.

The client screen `frontend/` is untouched.
