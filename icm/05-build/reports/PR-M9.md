# PR-M9 report: Dashboard configuration adapter

Card `icm/05-build/cards/pr-m9-dashboard-config.md`, issue #121, PR #122.
Lane database `app_wb_m9`, lane port 3935, base `origin/Vari8-Beta` at
fb5c387 (gate merge base 21f81ec). Code head in this report: 4f6cf94.

## What changed

- `lib/dashboard/config-schema.ts`: `WidgetSettings.labels` and
  `historyPeriod` are optional, matching the canvas contract
  (`frontend/src/components/ethereal/builder/model.ts:25-37`). Both are
  still validated when present (enum, bounds, label keys subset of
  fields) and preserved verbatim otherwise, so a canvas draft converts
  back unchanged. `visibility` stays required: it is backend-only
  provenance the canvas has no field for. The widget-id alphabet
  widened to `^[A-Za-z0-9-]{1,40}$` so canvas seed ids (`seed-BN01`)
  validate alongside generated UUIDs.
- `lib/dashboard/adapter.ts` (new): `draftToConfig(draft, visibility =
"client")` injects the backend-only `visibility` into every widget
  and runs `validateDashboardConfig`; `configToDraft(config)` validates
  and strips `visibility`. Both directions return `{ ok, reason }`: a
  draft that violates the persisted contract (24-widget cap, per-kind
  source and summary allowlists, per-breakpoint rect geometry, bounds)
  fails conversion instead of degrading silently.
- `scripts/seed/36-dashboard.seed.ts` (new): two demo literals taken
  from the canvas demo state, the Ethereal studio `emptyDraft` ("Maya's
  dashboard", 0 widgets) written to `workspace.studio_dashboard_draft`,
  and the coach `createDashboardDraft()` ("Daily overview", BN01, BN15,
  TL26, TL11 with the desktop rects `arrange` produces at width 1040)
  converted through the adapter and upserted as
  `client_dashboard_layout.config` for every demo client profile.
  Idempotent: an unchanged canonical config skips the write.
- `tests/unit/dashboard-adapter.test.ts` (new): round-trip guard over
  both demo layouts (strict equality), visibility inject and strip,
  rejection at 25 widgets, verbatim optional settings.
- `app/workspace/[workspaceId]/clients/[clientProfileId]/dashboard/dashboard-editor.tsx`:
  one expression made optional-safe for the widened type (`s.labels[f]`
  becomes `s.labels?.[f]`). No markup, style or copy change.
- `docs/index/SYMBOLS.md`: regenerated after the base merge.
- `.prettierignore`: one line, `scratch/AGENTS.md`, inside the existing
  generated-router block.

Nothing under `db/` changed, so the D34 schema guard is not involved.

## The build failure and its root cause

The previous wave reported `npm run build` crashing. On this host there
is no build defect in the branch:

- `npm run build` standalone, twice: exit 0, "Compiled successfully in
  12.5s", route table printed, `.next/BUILD_ID` written.
- `build` step inside the gate: PASS in 17s. `frontend build`: PASS.

Root cause of the earlier crash was environmental, not code. The
worktree had no `node_modules`, and a stub `npm` earlier on `PATH` can
exit 0 while installing nothing, which turns `build` into an unresolved
import crash. Both traps were checked here before gating:

- `command -v npm` resolves to `/opt/homebrew/bin/npm`, a real install.
- After `npm ci`, `node_modules/.package-lock.json` exists and
  `node_modules` holds 561 entries (767 packages), `frontend` 383.

Host-load worker crashes remain possible on a busy machine (Next
collects page data with 11 workers), but nothing of that kind
reproduced in three builds today. No code change was made for it.

## Acceptance: the round trip

"Every canvas demo layout converts and converts back unchanged."

The canvas demo set for this domain is two distinct layouts:

1. Ethereal studio `emptyDraft()` ("Maya's dashboard", 0 widgets,
   desktop only).
2. Coach `createDashboardDraft()` ("Daily overview", 4 widgets, desktop
   rects at width 1040). Both demo variants (`newVariant()` at
   `model.ts:967` and `model.ts:1193`) carry this same draft, so there
   is no third distinct layout.

Count: 2 of 2 demo layouts convert and convert back unchanged, asserted
with `toStrictEqual` in `tests/unit/dashboard-adapter.test.ts`.

Two extra proofs run outside the committed test:

- An `npx tsx` probe importing the live canvas function:
  `createDashboardDraft()` from
  `frontend/src/components/coach/builder/schema.ts` is byte-identical
  to the seeded literal (JSON equality, `true`), and that live canvas
  output itself round-trips (`draftToConfig` then `configToDraft`, JSON
  equality). Probe total: 3 of 3 conversions exact, 0 failures.
- Live: the seeded config renders on the running app, see below.

## Commands and exit codes

All run in the worktree, `POSTGRES_PASSWORD` exported from the root
`.env`, never printed.

- `npm ci --no-audit --no-fund --prefer-offline`: exit 0, 767 packages.
- `npm --prefix frontend ci`: exit 0, 383 packages.
- `npx prisma generate`: exit 0.
- `npm run typecheck`: exit 0.
- `npm run build`: exit 0 (twice standalone, plus once in the gate).
- `npm run index`: exit 0, "wrote 5 docs and 12 AGENTS.md routers".
- `npm run index:check`: exit 0, "6 index docs and all AGENTS.md routers
  match the generator output".
- `npm run format:check`: exit 0.
- `npm run lint`: exit 0, 81 warnings, 0 errors (the `config-schema.ts`
  `bp` warning is on the base commit too).
- `npm run test`: exit 0, 94 files, 1052 tests.
- Demo-layout probe (`npx tsx`): 3 of 3 exact, see above.
- Lane DB: `npx prisma migrate deploy` exit 0; `npm run seed:dev`
  exit 0, `[seed] dashboard: studio draft + 15 client layout(s)
(15 written, 0 unchanged)`.

Gate, exactly as the card specifies:

```
BASE_SHA=21f81ec LANE_DB=app_wb_m9 LANE_PORT=3935 CARD=PR-M9 icm/05-build/tools/verify-local.sh
```

Log: `/Users/marcelspatz/NEXUS_AI_CENTER/04_PROJECTS/Vari8-evidence/WAVEB-LEAD/pr-m9-dashboard-config.check.log`

```
PASS clean tree (0s)
WARN node: target 24 (D5), running v26.12.0; recorded, not certified
PASS schema guard (D34) (0s)
PASS program generator check (1s)
PASS npm ci (14s)
PASS prisma generate (1s)
PASS frontend npm ci (6s)
PASS format check (12s)
PASS typecheck (3s)
PASS frontend typecheck (3s)
PASS lint (16s)
PASS frontend lint (1s)
PASS unit tests (14s)
PASS frontend tests (1s)
PASS integration tests (123s)
PASS migrate deploy (1s)
PASS build (17s)
PASS frontend build (9s)
PASS e2e flow specs (serialized) (20s)
FAIL parity regression (D32) exit=1 (229s)
VERIFY-LOCAL FAIL
```

Gate exit code: 1. Nineteen of twenty steps pass. The only failing step
is `parity regression (D32)`, which this card's contract excludes
("Parity (D32) on: none"). Verbatim failure tail:

```
FAIL s11-preferences@1440 px=788646 geom=0/0/98 text=0 ruled=3
parity FAIL: 70 problem(s), retried=0; report .../tools/parity/out/report.html
FAIL parity regression (D32) exit=1 (229s)
```

All 70 screens fail with `geom=0/0/N text=0`, including screens no lane
on this branch touches, which is the harness signature described in PR
#137: the committed baseline was captured on the Linux reference host
and the macOS font stack moves every text box. `SKIP_PARITY` is not in
`icm/05-build/tools/verify-local.sh` on `origin/Vari8-Beta` (grep count
0, re-checked after `git fetch` at the end of this run), so the step
cannot be skipped from the card side. PR #137 is still open. Parity was
not touched, per the card.

## Live proof

Dev server on port 3935 against `app_wb_m9`, `ENABLE_CLIENT_DASHBOARD=1`,
seeded through `npm run seed:dev`, sign-in through the seeded Better
Auth credentials (SEED-FIX is on this branch).

- Staff editor
  `/workspace/cmvh0qs1j00008oecy5avnk90/clients/cmvh0qs4r000h8oecsxfz1cxe/dashboard`
  as the workspace owner: 4 widget elements at 1440x900 and at 390x844,
  no page errors.
- Client dashboard `/workspace/cmvh0qs1j00008oecy5avnk90/dashboard` as
  the seeded client: heading "Daily overview", the four seeded widgets
  (Bodyweight trend, Nutrition today, Your training, Sleep duration) at
  1440x900 and at 390x844, no page errors. Each shows the honest "not
  connected yet" placeholder, which is the expected state for a layout
  with no wired data.

Screenshots:
`/Users/marcelspatz/NEXUS_AI_CENTER/04_PROJECTS/Vari8-evidence/WAVEB-LEAD/PR-M9/build/staff-1440.png`,
`staff-390.png`, `client-1440.png`, `client-390.png`. Server log:
`.../WAVEB-LEAD/pr-m9-dev-server.log`. The server was stopped and
`app_wb_m9` dropped when the proof finished.

## Matrix rows closed

None (foundation and tooling card).

## What I could not do

- A clean gate exit 0. The only failing step is the parity harness,
  which this card's contract excludes and which cannot be skipped until
  PR #137 lands `SKIP_PARITY=1` on `Vari8-Beta`.
- No new integration suite: the adapter is exercised through the seed
  and the live render, which is where the contract is observable.
- The staff editor page does not print the layout name, so the seeded
  name "Daily overview" is verified on the client view only.
- `configToDraft` of a config containing `visibility: "staff"` widgets
  drops that marking by design (documented in the adapter comments): a
  canvas draft has no field for it.
