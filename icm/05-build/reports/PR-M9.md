# PR-M9 report: Dashboard configuration adapter

Card `icm/05-build/cards/pr-m9-dashboard-config.md`, issue #121, PR #122.
Lane database `app_wb_m9`, lane port 3935. Base `origin/Vari8-Beta` at
`6d06cf8`. Code head in this report:
`6d4c0479e385195942576ab666b219915af7d331` (`6d4c047`).

This round changed the report only. The code, the seed and the test
below are the ones already on the branch; no file under `db/` changed
and no source file was touched.

## What changed (branch)

- `lib/dashboard/config-schema.ts`: `WidgetSettings.labels` and
  `historyPeriod` are optional, matching the canvas contract
  (`frontend/src/components/ethereal/builder/model.ts:25-37`). Both are
  validated when present (enum, bounds, label keys subset of fields) and
  preserved verbatim otherwise, so a canvas draft converts back
  unchanged. `visibility` stays required: it is backend-only provenance
  the canvas has no field for. The widget-id alphabet widened to
  `^[A-Za-z0-9-]{1,40}$` so canvas seed ids (`seed-BN01`) validate
  alongside generated UUIDs.
- `lib/dashboard/adapter.ts`: `draftToConfig(draft, visibility =
"client")` injects `visibility` into every widget and runs
  `validateDashboardConfig`; `configToDraft(config)` validates and
  strips `visibility`. Both directions return `{ ok, reason }`: a draft
  outside the persisted contract (24-widget cap, per-kind source and
  summary allowlists, per-breakpoint rect geometry, bounds) fails
  conversion instead of degrading silently.
- `scripts/seed/36-dashboard.seed.ts`: the two demo literals from the
  canvas demo state, the Ethereal studio `emptyDraft` written to
  `workspace.studio_dashboard_draft`, and the coach
  `createDashboardDraft()` converted through the adapter and upserted as
  `client_dashboard_layout.config` for every demo client profile.
  Idempotent: an unchanged canonical config skips the write.
- `tests/unit/dashboard-adapter.test.ts`: round-trip guard over both
  demo layouts, visibility inject and strip, rejection at 25 widgets,
  verbatim optional settings.
- `app/workspace/[workspaceId]/clients/[clientProfileId]/dashboard/dashboard-editor.tsx`:
  one expression made optional-safe for the widened type
  (`s.labels[f]` becomes `s.labels?.[f]`). No markup, style or copy
  change.
- `docs/index/SYMBOLS.md`: regenerated after the last base merge.

## Acceptance: every canvas demo layout converts and converts back unchanged

I enumerated the demo layouts from the canvas source, not from the seed:

```
grep -rn "createDashboardDraft\|emptyDashboardDraft\|emptyDraft" frontend/src/components/{coach,ethereal}/builder/
frontend/src/components/coach/builder/schema.ts:22   emptyDashboardDraft  (base literal)
frontend/src/components/coach/builder/schema.ts:124  createDashboardDraft (4 widgets + arrange(desktop, 1040))
frontend/src/components/ethereal/builder/dashboard-builder.tsx:69  emptyDraft (studio initial state)
```

Two distinct demo layouts exist. `coach/builder/model.ts:874` puts
`createDashboardDraft()` on every demo template variant, and
`coach-dashboard.tsx:252` falls back to the same function, so no third
distinct layout exists.

| #   | Source                                                     | Name             | Widgets | draft sha256 (key-sorted JSON)                                     |
| --- | ---------------------------------------------------------- | ---------------- | ------- | ------------------------------------------------------------------ |
| 1   | `ethereal/builder/dashboard-builder.tsx:69` `emptyDraft()` | Maya's dashboard | 0       | `3b82543ef41f1579530718a9f2733bcf36033ae752d65c8d3ebc3d76f16aa45e` |
| 2   | `coach/builder/schema.ts:124` `createDashboardDraft()`     | Daily overview   | 4       | `c9936b2d8ab6914bc59bf7e3931ca5a62f8998a3e160c97458733a59a1eede4a` |

Result: **2 of 2 demo layouts convert and convert back
byte-identically.** For each one the probe takes the canvas object,
runs `draftToConfig` then `configToDraft`, serializes both the original
and the returned draft as key-sorted JSON and compares sha256. The
hashes are equal, byte counts equal (103 and 1158), 0 failures.

The probe (throwaway, outside the tree, log kept as evidence) also
checks drift between canvas and seed: the seed constants are
byte-identical to the two canvas literals, so the seeded data cannot
silently diverge from the canvas.

Cap check on the same run:

```
PASS 25 widgets rejected :: widgets_count
PASS rejection reason is widgets_count :: widgets_count
PASS 24 widgets accepted :: ok
```

Lane database read-back, every seeded row, same adapter:

```
workspace=cmvimkde400008ojz3wa40hjw layouts=15
PASS workspace.studio_dashboard_draft equals canvas emptyDraft() :: 3b82543ef41f1579
PASS stored studio draft converts back byte-identically :: 3b82543ef41f1579
expected canvas config sha256=8c669d3f3e6914bc94c7fdab80f89816e184b3e4f6a7084df511b72f0bc181ec
PASS all 15 client layouts equal the converted canvas draft :: 15/15
PASS canvas draft widgets in DB = 4
widget ids in store: seed-BN01,seed-BN15,seed-TL26,seed-TL11
visibility in store: client
sql: select count(*), count(distinct md5(config::text)), min(length(config::text)) ...
15 | 1 | 1403
```

Every one of the 15 stored layouts is the same 1403-byte config,
revision 1, and each converts back to the canvas draft
(`c9936b2d...`) and forward again to the stored bytes
(`8c669d3f...`).

Committed unit guard: `npx vitest run tests/unit/dashboard-adapter.test.ts`
exit 0, 4 tests passed, including the 25-widget rejection and the
round-trip assertion.

## Live proof, 1440 and 390

Production build served by `next start` on port 3935 against
`app_wb_m9`. `APP_ENV=development` and `ENABLE_CLIENT_DASHBOARD=1` are
required because the dashboard route resolves through the dev-only gate
(`lib/dashboard/gate.ts`); the build is still the production build, so
this is the shipped bundle with the flag open, which is how the lane
runs it.

Run: 32 checks PASS, 0 FAIL, `LIVE: PASS`.

Client view `/workspace/cmvimkde400008ojz3wa40hjw/dashboard`, both widths:

- HTTP 200, heading `Daily overview` (the stored config name).
- 4 widgets in stored reading order:
  `client-widget-BN01 Bodyweight trend`, `client-widget-BN15 Nutrition today`,
  `client-widget-TL26 Your training`, `client-widget-TL11 Sleep duration`.
- 4 honest placeholders (`not connected yet`), 0 empty-state nodes, 0
  console errors.
- Geometry measured from the DOM: at 1440 all four widgets share y=77
  in one row (widths 275 each); at 390 they stack in a single column at
  y=77/183/289/395, width 390.

Staff editor
`/workspace/cmvimkde400008ojz3wa40hjw/clients/cmvimkdil000v8ojzvkjnne83/dashboard`
as the workspace owner, both widths: HTTP 200, all four widget titles
present, panel titled `Maya Patel's dashboard`, 0 console errors.

Screenshots (absolute paths):

- `/Users/marcelspatz/NEXUS_AI_CENTER/04_PROJECTS/Vari8/.worktrees/pr-m9-dashboard-config/_evidence/PR-M9/build/client-dashboard-1440.png`
- `/Users/marcelspatz/NEXUS_AI_CENTER/04_PROJECTS/Vari8/.worktrees/pr-m9-dashboard-config/_evidence/PR-M9/build/client-dashboard-390.png`
- `/Users/marcelspatz/NEXUS_AI_CENTER/04_PROJECTS/Vari8/.worktrees/pr-m9-dashboard-config/_evidence/PR-M9/build/staff-editor-1440.png`
- `/Users/marcelspatz/NEXUS_AI_CENTER/04_PROJECTS/Vari8/.worktrees/pr-m9-dashboard-config/_evidence/PR-M9/build/staff-editor-390.png`

Logs and probes in the same `build/` directory: `roundtrip-probe.log`,
`db-readback.log`, `live.log`, `db-fresh.log`, `build.log`,
`typecheck.log`, `lint.log`, `server.log`, `env.sh`.

Two lane fixture facts the verifier needs, both stated rather than
hidden:

- The seeded client credential (`SEED_CLIENT_EMAIL`,
  `emma.anders@vari8.test`) ends up with no client profile: after
  `00-workspace.seed.ts` links it to Emma Anders,
  `33-checkins.seed.ts:278-296` re-points the first three profiles at
  credential-less demo users. To exercise the client route I linked
  `Maya Patel` (a profile with no user) to that credential in the
  throwaway lane database. Its stored config is the same 1403-byte,
  `8c669d3f...` config as all 15 rows, so the render proves the demo
  layout, not a hand-made one.
- The lane has 0 rows in `client_assignment`, so a coach resolves to
  scope `assigned` with nothing assigned and the staff editor 404s. The
  staff proof therefore uses the workspace owner, who has `workspace`
  scope.

## Commands and exit codes

Run in the worktree with `POSTGRES_PASSWORD` and the `SEED_*` values
read from the repo `.env`; no value printed or written into the tree.

- `createdb app_wb_m9` (native PG17 on 127.0.0.1:5433): exit 0.
- `npx tsx scripts/db-fresh.ts` (that is `npm run db:fresh`,
  `DB_FRESH_SKIP_CATALOGS=1`, catalogs are not part of this card):
  exit 0, 4 seed modules on `app_wb_m9`, `[seed] dashboard: studio draft

* 15 client layout(s) (15 written, 0 unchanged)`.

- `npm run build`: exit 0 (TypeScript step inside it passed).
- `npx next start -p 3935`: ready, `/login` 200, `/workspace/x/dashboard` 307.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0, 81 warnings, 0 errors (the `config-schema.ts`
  `bp` warning is on the base commit too).
- `npx vitest run tests/unit/dashboard-adapter.test.ts`: exit 0, 4 passed.
- Demo-layout probe (`npx tsx`, canvas import): exit 0, `PROBE: PASS`.
- Lane read-back (`npx tsx`): exit 0, `READBACK: PASS`, 15/15.
- Browser run (`node live.mjs`, Playwright chromium, 1440x900 and
  390x844): exit 0, `LIVE: PASS`, 32 checks.
- `npx prettier --check icm/05-build/reports/PR-M9.md`: exit 0.
- `npx tsx scripts/index/generate.ts` (that is `npm run index`): exit 0,
  "wrote 5 docs and 13 AGENTS.md routers"; `--check`: exit 0, "6 index
  docs and all AGENTS.md routers match". Nothing tracked changed
  (`git status --porcelain` empty). Note for the wave: creating the
  gitignored `_evidence/` directory makes `index:check` demand
  `_evidence/AGENTS.md` until the generator runs once, which is what
  every other lane worktree already has.
- Server stopped after the run; port 3935 refused afterwards.

## Gate

Not run this round. `origin/Vari8-Beta` at `6d06cf8`, the base of this
branch, fails `tests/unit/system-index.test.ts:127` on its own, with no
card code involved, so `verify-local.sh` aborts at the unit step before
reaching anything this card changes. The gate is pending on PR #145.
There is no green receipt for this head, and no READY line was written.

## Matrix rows closed

None (foundation and tooling card).

## What I could not do

- A gate receipt for this head. Blocked by the base unit failure in
  PR #145; the card's own unit guard, typecheck, lint and build all
  exit 0 above.
- Pixel agreement between the canvas rects and the rendered client
  dashboard. The stored config carries the canvas rects (desktop
  y=0/y=3 grid at width 1040), but the client page renders them through
  its own CSS grid, so the live geometry proves presence and reading
  order, not rect coordinates. The rect geometry is proven at the
  adapter boundary (the stored config is the converted canvas layout).
- A coach-scoped staff view: no `client_assignment` rows exist in this
  lane, so only the owner scope is reachable.
- No new integration suite: the adapter is exercised through the seed,
  the lane read-back and the live render, which is where the contract is
  observable.
