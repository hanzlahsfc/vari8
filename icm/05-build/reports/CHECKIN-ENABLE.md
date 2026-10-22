# CHECKIN-ENABLE — turn the check-in loop on for the trial workspace

Card `CHECKIN-ENABLE`, issue #163. Worktree
`/Users/apple/Devin/vari8-worktrees/checkin-enable`, branch `beta/checkin-enable`,
base `09b1424` (origin/Vari8-Beta at branch time and at push; refetched before the
final gate run — no merge needed, the base did not move). PR #193 (draft → ready).
Node v26.8.1, npm 11.x. Not merged: an independent verifier decides SHIP or FIX.
Head at the time of writing: see §5.

## 1. What it does

The check-in loop shipped flag-gated and could not be exercised on the seeded trial
workspace. Three gaps closed it; this change removes them and nothing else.

- **Client fill panel had no rating control.** The seeded "Weekly check-in" form
  carries a required `rating` field (SCALE_1_10). `FieldControl` had cases for
  every other kind; a rating field rendered nothing, `isEmpty` kept it missing and
  Submit stayed disabled forever. The panel now renders the canvas scale select —
  stored integer 1–10 / 1–5, or the 1-based `CHECKIN_RATING_WORD_LABELS` position —
  and the submitted view renders rating (`8 / 10`, word label) and visual answers
  (`2 visuals`) instead of `—`, the same rules the staff detail's
  `displayCheckInAnswer` uses. Optional `visual` fields still render no control;
  media answers are out of this slice.
- **The seeded trial client could not sign in.** `33-checkins.seed.ts` created
  demo client users without credentials and the SEED-FIX credential client
  deliberately has no profile. The first canvas demo client
  (`emma.anders@canvas-demo.test`, owns Emma Anders's profile and seeded check-in
  history) now gets a Better Auth credential reusing `SEED_CLIENT_PASSWORD` — the
  8-var seed env contract is unchanged.
- **Canvas clients had no assignment rows.** `20-clients.seed.ts` now links every
  canvas client to the seeded ACTIVE COACH member as PRIMARY. Assigned-coach scope
  reads `client_assignment`, not the workspace boundary — without it the coach's
  review queue and per-client scheduling saw nobody.

`icm/05-build/RUNBOOK.md` documents the flag, the seeded identities and the loop.
No schema change, no new routes, no global enablement: `ENABLE_CHECK_INS=1` stays
an environment decision and still requires a trusted development/test runtime.

## 2. Commits

| SHA       | Paths                                                                                                                              | What                                                     |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `8200173` | `app/(tracker)/workspace/[workspaceId]/check-ins/checkin-submission-panel.tsx`, `tests/unit/checkin-submission-panel.dom.test.tsx` | rating control + submitted-view answers; 4 DOM tests     |
| `c1045b1` | `scripts/seed/20-clients.seed.ts`, `scripts/seed/33-checkins.seed.ts`, `tests/integration/seed-credentials.test.ts`                | PRIMARY coach assignments, Emma credential, seed test    |
| `b1ff4a0` | `icm/05-build/RUNBOOK.md`                                                                                                          | trial check-in enablement + walkthrough path             |
| `83dbe34` | `docs/index/COMPONENTS.md`, `docs/index/ROUTES.md`, `docs/index/SYMBOLS.md`                                                        | index regen — base index predated the #160 frontend sync |

## 3. Live verification (the issue's acceptance list)

Lane: `next start -p 3719`, `APP_ENV=test`, `DATABASE_URL=…app_prcheckin`
(dropped, `prisma migrate deploy`, `tsx scripts/seed/index.ts` — 15 clients,
14 recurring rules, 114 occurrences), `ENABLE_CHECK_INS=1`.
Receipts: `_evidence/CHECKIN-ENABLE/run2-01..15-*.png`, harness under
`_evidence/CHECKIN-ENABLE/harness/`.

| Acceptance                                                        | Result                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client submits at 390px; post-due submission marked late          | PASS — overdue note visible, submission written, `submitted_at > due_at = t` (run2-04..06)                                                                                                                                                                       |
| Required validation                                               | PASS — Submit disabled until both required fields answered (guard re-verified live each fill pass; DOM test asserts disabled→enabled)                                                                                                                            |
| Acked row leaves the queue; repeat ack returns `already_reviewed` | PASS — row absent after ack, mark button gone; service replay returned `{"status":"already_reviewed"}` against the live DB (run2-09, run2-11)                                                                                                                    |
| Flag off → every check-in route 404 before any database read      | PASS — authenticated coach on `next start` without the flag: `/check-ins`, `/check-ins/[id]`, `/checkins/review-queue`, `/checkins/forms`, `/clients/[id]/checkins` all 404; `isCheckInsEnabled()` is the first statement in each page/action (run2-14, run2-15) |
| Queue rows expose no answer text                                  | PASS — DOM sweep of `review-queue-row` text asserts the submitted answers are absent; header projection only (run2-07)                                                                                                                                           |
| Foreign staff 403                                                 | PASS — `staff2` (seed-second-workspace) got 403 on the review queue (run2-13)                                                                                                                                                                                    |
| Seeded trial workspace runs the whole loop on the server pages    | PASS — coach schedule → 390px client submit (late) → queue → ack → text feedback → client reads feedback (run2-01..12)                                                                                                                                           |
| Feedback visibility                                               | PASS — `checkin-client-feedback-item` shows "Sofia Miller · … Strong week — keep the same morning routine…" on the client's submitted view (run2-12)                                                                                                             |

Earlier dev-server attempt failed to hydrate (Next 16 blocks `/_next/hmr` from
127.0.0.1 without `allowedDevOrigins`, leaving client components dead) — the proof
lane therefore runs `next start` + `APP_ENV=test`, matching the runbook note.

## 4. Gates (exit codes)

- `npm run format:check` — 0
- `npm run typecheck` — 0
- `npm run lint` — 0 (81 warnings, 0 errors; all pre-existing, none in touched files)
- `npm run index` then `npm run index:check` — 0 (`index:check OK: 6 index docs and all AGENTS.md routers match`)
- `npx vitest run tests/unit/checkin-*.test.ts* ` — 12 files, 134 tests, 0 failures
- `npx vitest run --config vitest.integration.config.ts tests/integration/seed-credentials.test.ts` (`INTEGRATION_DATABASE_URL=…app_prcheckin_it`, real PG + real `tsx scripts/seed/index.ts` entrypoint) — 3/3 pass
- `npm run build` — 0 (Next 16.3.8 webpack)
- Parity (D32) — not applicable: no canvas screen changed; the baseline is captured on the Linux reference host and cannot run here (`verify-local.sh` documents this)
- `verify-local.sh` end-to-end — not run on this host (expects container `vari8-db-1`; this host's compose service runs as `app-db-1`). Its individual steps above were run directly with the same exits.

Mutation evidence (fresh `app_prcheckin_it` each time — the seed is idempotent, so a
mutant only bites on a clean DB):

- `SCALE_1_10` option count 10→9 → `checkin-submission-panel.dom.test.tsx` fails the
  option-label assertion. Restored.
- Skip the `33-checkins` credential upsert → `expectCredential(emma…)` fails
  (`account` null). Restored.
- Skip the `20-clients` assignment upsert → `expect(assignments).toBe(15)` gets 0.
  Restored.

## 5. Open items / limits

- **Out of scope by design:** the `/coach` canvas board wiring is PR #147 (open,
  another lane); `visual` fields render no client control (media answers deferred);
  `docs/STATUS.md` intentionally not edited (workflow rule).
- **Duplicate scheduled one-off:** the walkthrough scheduled the same 2026-10-23
  one-off twice during iteration — disposable lane data only, no code impact.
- **Client-role flag-off on staff routes returns 403, not 404** — the workspace
  layout's role gate precedes the page's flag check for a role that could never
  open those pages. Flag-on behaviour is unaffected.
- `ENABLE_CHECK_INS` alone never enables production (`lib/checkin/forms-gate.ts`,
  `devFlagEnabled` + `classifyRuntime`); the trial flips it per environment only.

Head: `83dbe34` plus this report's commit.
