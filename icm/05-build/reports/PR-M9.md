# PR-M9 report — Dashboard configuration adapter

Card `icm/05-build/cards/pr-m9-dashboard-config.md`, issue #121, PR #122.
Lane DB `app_m9`, port 3890. Base `origin/Vari8-Beta` at f00d37b.

## What changed

- `lib/dashboard/config-schema.ts` — `WidgetSettings.labels` and
  `historyPeriod` are now optional, matching the canvas contract
  (`frontend/src/components/ethereal/builder/model.ts:25-37`). Both are
  still validated when present (enum, bounds, label keys ⊆ fields) and
  preserved verbatim otherwise, so a canvas draft converts back
  unchanged. `visibility` stays required — it is backend-only
  provenance the canvas has no field for. The widget-id alphabet
  widened to `^[A-Za-z0-9-]{1,40}$` to accept canvas seed ids
  (`seed-BN01`) alongside generated UUIDs.
- `lib/dashboard/adapter.ts` (new) — `draftToConfig(draft, visibility
= "client")` injects the backend-only `visibility` into every widget
  (the canvas renders every widget on the client dashboard) and runs
  `validateDashboardConfig`; `configToDraft(config)` validates and
  strips `visibility`. Both directions return `{ ok, reason }`: a draft
  that violates the persisted contract (24-widget cap, per-kind
  allowlists, per-breakpoint rect geometry, bounds) fails conversion
  instead of degrading.
- `scripts/seed/36-dashboard.seed.ts` (new) — two demo literals copied
  verbatim from the canvas demo state: the studio `emptyDraft`
  ("Maya’s dashboard", ethereal builder) stored on
  `workspace.studio_dashboard_draft`, and `createDashboardDraft()`
  ("Daily overview", BN01/BN15/TL26/TL11 with desktop rects produced by
  running the canvas `arrange`) converted via the adapter and upserted
  as `client_dashboard_layout.config` for every demo client profile.
  Idempotent (canonical comparison skips unchanged rows).
- `tests/unit/dashboard-adapter.test.ts` (new) — round-trip guard on
  both demo layouts (strict equality), visibility inject/strip, cap
  rejection at 25 widgets, verbatim optional-settings checks.
- `app/workspace/[workspaceId]/clients/[clientProfileId]/dashboard/dashboard-editor.tsx`
  — one expression (`s.labels[f]` -> `s.labels?.[f]`) made
  optional-safe for the widened type; no markup/style/copy change.
- `docs/index/SYMBOLS.md` — regenerated (`npm run index`, check exit 0).

## Decisions

- Verbatim optionals over normalization: storing `labels`/`historyPeriod`
  only when the canvas carried them makes draft -> config -> draft
  exact for every canvas-valid draft, not just the demo literals. The
  alternative (fill defaults on write, strip on read) is lossy when the
  canvas explicitly stores a default value.
- `visibility` default "client" in the adapter: the canvas has no
  staff-hidden widget concept; a canvas draft is the shared layout.
  `defaultWidgetSettings` still emits `"staff"` for editor-created
  widgets in the old UI — unchanged.
- Seed covers studio draft + per-client layouts; template-variant
  dashboards live inside `CoachingTemplate.draft`, which is PR-M4's
  domain (templates are not seeded by this card).

## Commands and exit codes

- `npx tsx scratch/dump-demo-drafts.ts` (canvas `createDashboardDraft()`
  dump for the seed literal) — exit 0.
- `npx vitest run tests/unit/dashboard-adapter.test.ts` — 4/4 pass, exit 0.
- `npx vitest run tests/unit/dashboard-config*.test.ts tests/unit/dashboard-autosave*.test.ts` — 35/35 pass, exit 0.
- `npx tsc --noEmit` — exit 0.
- `npx eslint <changed files>` — exit 0 (one pre-existing warning at
  config-schema.ts `bp`, present on the base commit).
- `npx prettier --check <changed files>` — exit 0 after `--write`.
- `npm run db:fresh` on `app_m9` — exit 0;
  `[seed] dashboard: studio draft + 15 client layout(s) (15 written)`.
- `npm run seed:dev` re-run — exit 0; `0 written, 15 unchanged`
  (idempotent). Also confirmed the lane guard refuses without
  NODE_ENV=development (exit 1, expected).
- DB spot check: stored config `name` "Daily overview", 4 widgets,
  `visibility` "client" injected, `labels` key absent (verbatim
  preservation at the DB level); studio draft "Maya’s dashboard",
  0 widgets.
- `npm run index` + `npm run index:check` — exit 0.
- Gate: `BASE_SHA=$(git merge-base HEAD origin/Vari8-Beta)
LANE_DB=app_m9 LANE_PORT=3890 CARD=PR-M9
icm/05-build/tools/verify-local.sh` — see below.

## Live proof (real app, lane DB, playwright chromium)

- Dev server on port 3890 (`ENABLE_CLIENT_DASHBOARD=1`), lane DB
  `app_m9` seeded via `npm run db:fresh`; sign-in via the standing-orders
  credential workaround (`scratch/live-user.ts`, `accounts` row —
  SEED-FIX not yet merged).
- Staff editor `/workspace/<ws>/clients/<profile>/dashboard` as owner:
  4/4 demo widgets render at 1440x900 and 390x844.
- Client view `/workspace/<ws>/dashboard` as a client linked to the
  profile: 4/4 widgets via the server-side projection, name "Daily
  overview", at both widths.
- Evidence: `_evidence/PR-M9/build/staff-1440.png`, `staff-390.png`,
  `client-1440.png`, `client-390.png`, `live-proof-transcript.txt`,
  `dev-server.log`, `npm-ci*.log`, `tsc.log`.

## Gate result

(pending — filled after the run)

## Matrix rows closed

None (foundation/tooling PR).

## Open items / not proven

- No canvas screen changes: parity gate (D32) not applicable on this
  branch (harness not present); live proof used the existing backend
  dashboard surfaces.
- The staff editor page does not display the layout name; "Daily
  overview" visibility was verified on the client view only.
- `configToDraft` of a config containing `visibility: "staff"` widgets
  loses that marking by design (documented in adapter comments).
