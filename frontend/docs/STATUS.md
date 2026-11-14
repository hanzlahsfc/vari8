# Frontend status

## 2026-11-05 — P806 Settings Phase 1a — implemented, gates green, awaiting browser verification

- New routed Settings workspace replaces the preferences dialog:
  `/coach?section=settings&tab=<category>` with Profile, Branding,
  Appearance, Notifications and Data. The sidebar account button and the
  header gear both route there with `aria-current`; Settings stays out of
  the main NAV. Breadcrumb shows Workspace / Settings / <category>. Invalid
  or missing tabs fall back to Profile. Phones get category drill-in with
  a back-to-list control (`hidden`-based, CSS guarded).
- Profile: coach name, title, photo and availability note — all optional
  persisted fields — feed the sidebar account block and the athlete app's
  coach identity (mobile Home + Messages headers, session attribution).
- Branding: business name, dark + light logo slots on the shared image
  pipeline (PNG/JPG/WebP, 2 MB, 512 px logo / 256 px square photo, data-URL
  cap and inline errors preserved), the handoff's 8 named presets plus
  custom hex, and a coach/athlete × light/dark preview card.
- Appearance: Platinum `#C9CCD3` is the new seed/reset default; saved
  accents load unchanged. Light/Dark/Match-system is workspace-only via
  optional `followSystemMode`; the athlete app resolves its own
  `client.appMode` (or the phone) through shared `coach-theme` helpers and
  keeps coach logos + colour. The header sun/moon quick toggle is kept and
  clears the system-follow flag.
- Notifications: every toggle has a real consumer on this base — unread
  badge (`preferences.notifications`), check-ins badge (`notify.checkIns`),
  task-reminder toasts (`notify.taskReminders`, existing 30 s consumer) and
  priority-first sorting (`priorityNotifications` → `sortedConversationClients`
  in model.ts). The caption states no email/system notifications are sent.
- Data: serialized-state storage estimate with image contribution, dated
  workspace JSON export, and demo reset via the shared Dialog (no native
  confirm); reset restores `seedState()` (Platinum).
- Compatibility: all new fields optional and guarded; legacy workspaces
  validate and load unchanged (`settings.test.mjs`). Demo export
  regenerated (workspace.json only). Fixed pink in the demo recorder now
  reads `preferences.accent`. `appearance-controls.tsx` (the dead dialog
  control) removed.
- Tests: `settings.test.mjs` 6/6 — legacy load, optional-field guard,
  Platinum seed vs preserved saved accents, coach/athlete mode
  independence, logo resolution, priority sort. `accent-contrast.checks.mjs`
  now runs all 8 presets through action + surface contrast.
- Gates (Node 24.22.3): `npm run check` exit 0 (328/328 tests,
  agent-context, typecheck, lint, build); `npm run ui:check` exit 1 with
  the 21 unchanged baseline violations (none in settings.css);
  `git diff --check` clean.
- Pending: browser verification (preview not authorised for this slice) —
  category reload/back, phone drill-in, keyboard navigation, both modes,
  logo backgrounds, athlete Home mode switch, preset contrast, saved
  feedback, reset modal, notification consumers, export + storage display.

## 2026-10-27 — client app + coach Plans/Nutrition redesign + meal-plan editor — verified locally

- Client app (`/client`): a polished phone-width client across Home,
  Messages, check-ins, Tracker, Plans, Training, Session, Logbook, Meal plan,
  Supplements, Activity, Overview and Timeline — privacy-filtered against the
  client-facing view, persisted local state, responsive desktop/phone.
- Coach Plans → Nutrition: a two-card layout (Active plan with an aligned
  Day-type macro table + upcoming temporary plans, collapsible Previous
  plans), temporary plans keep their "Temporary" chip and move to Previous
  once their end date passes (`splitTemporaryNutrition`), and a "Start from"
  Blank / Copy-of-current radio choice in the temporary editor.
- Meal-plan editor: Motion `Reorder` meal dragging, food-search single focus
  ring, alternative portions that scale with the main quantity, a compact
  time picker (Hour/Minute fields, common-time chips, "No specific time"
  → "Any time"), and a "Use a schedule" toggle whose off state is the
  client-chooses flexible mode (no more ambiguous multi-option manual).
- Demo rev 11: carb-cycling prep variants + temporary refeed; export
  regenerated (byte-identical, `npm run export:demo`).
- `npm run check` in `frontend/`: typecheck, lint `--error-on-warnings`,
  tests and build — all pass.


## 2026-10-26 — coach Tracker tab + template field formatting — verified locally

- Coach Tracker tab (`/coach` → athlete → Tracker): template-driven columns
  grouped by parameter group (Body/Health/Cycle/Nutrition/Recovery/Training/
  Activity/Notes), tile-per-week layout with measured column widths, sticky
  date mask + soft fade, phase separators, neutral summary band, hover wash
  vs today accent tint, session-only group pin/collapse + Reset layout,
  coach read-only cells with per-cell/day note popover (`${date}:note:${fieldId}`,
  `${date}:coach-note`), logged-session dialog, check-in marker → review.
- Template editor: tracker field settings gain Decimals (0/1/2, numeric
  non-rating) + Week summary (Average/Total/Count/None) backed by
  `FieldConfig.decimals`/`summary` and `defaultDecimals`/`defaultSummary`.
- Demo rev 9: Amara gains rhr/fbg/bp/cycle/nutrition/recovery/training/activity
  fields with deterministic 70-day values + text notes; export regenerated
  (byte-identical, `npm run export:demo`).
- `npm run check` in `frontend/`: 319/319 tests, agent-context:check,
  typecheck, lint `--error-on-warnings`, build — all pass.

## 2026-10-25 — athlete profile v3 + client app — verified locally

- Athlete profile v3: Overview cards (phase progress with date range,
  nutrition targets vs actual, calorie intake, bodyweight, expenditure,
  physique comparison, training program), Timeline with grouped
  plan/logged column bands, per-variant nutrition plan columns,
  compare-with-logged sub-lines, drag-to-pan and fixed 44px rows,
  back-to-back `ClientPhase[]` phases (no overarching phase plan),
  Plans cards, Notes & tasks, and client check-ins with photos.
- Standalone client app at `/client`; visual reset updates; demo-data
  revision 8 seeds plan history (earlier nutrition and activity target
  versions) so past weeks show the plan that was in effect.
- `npm run check` in `frontend/`: 319/319 tests, agent-context:check,
  typecheck (`next typegen && tsc --noEmit`), `biome check --error-on-warnings`
  and `next build` all exit 0.
