# Frontend status

## 2026-11-14 — P813 Settings Phase 1b — implemented, gates green, browser-verified

Built on Phase 1a head a8dafb3 (beta/p806-settings-phase-1a preserved);
work on beta/p813-settings-phase-1b in /private/tmp/vari8-p813-settings-1b.

- Region & units: searchable time zone, locale/date format with live
  example, 12/24-hour, body-weight and load units. All display paths go
  through the store-driven display config; bare YYYY-MM-DD renders in UTC
  (date-only stays on its calendar day) and naive datetime stamps keep
  their coach-zone wall time. New-template units come from preferences;
  stored templates and measurements are untouched.
- Availability: per-day working hours with multiple ranges, add/remove,
  copy to weekdays, inline overlap/reversed/malformed validation and an
  all-off-week rejection. The athlete Messages header shows the grouped
  summary ("Usually replies Mon to Fri, 09:00 to 18:00, Vienna time")
  plus the optional availability note. The legacy coach Messages
  availability field and its caption are preserved. No vacations, no
  outside-hours auto-replies (out of scope).
- Coaching rules: editable check-in deadline is the single overdue
  source for the coach calendar/list, the athlete apps and the coach
  athlete-overview widget. pickCheckInCard in model.ts shares the card
  rule: today's own check-in past its deadline shows Overdue instead of
  being masked by the next future event; an older missed check-in still
  yields to the upcoming one. "Due today by HH:MM" copy on home, sheet
  and desktop check-ins surfaces. Feedback target (24h/48h/two working
  days/none) computes reply-due/late chips over configured working
  hours and zone, DST-safe. Reset to defaults on the card.
- Messages: editable saved replies — add, edit, reorder, delete with
  Undo, 20-reply cap, Reset to default. Workspaces without the field
  fall back to the three existing snippets; an intentionally empty list
  stays empty after reload. The composer "Reusable replies" menu now
  feeds from the saved list.
- Compatibility: every new preference key is optional in isCoachState;
  forward-compatible guards added for checkInMoves (to: string|null),
  client.appMode and message.auto. Legacy workspaces load unchanged.
- Tests: settings.test.mjs +14 cases (26/26 in file) covering legacy
  defaults, date-only stability across zones, naive wall-time stability,
  deadline boundaries incl. DST, working-hours validation/inclusion,
  all four feedback targets, template-unit isolation, saved-reply
  absent/empty/persist, note migration and summary grouping.
- Gates (Node 24.22.3): `npm run check` exit 0 (348/348 tests, agent
  context, typecheck, lint, build); `npm run ui:check` exit 1 with the
  same 21 baseline violations, none in changed files; `git diff --check`
  clean.
- Browser evidence (disposable Chrome profiles, seeded localStorage):
  all nine Settings categories render and route, phone drill-in works;
  availability editor saves valid ranges, blocks invalid ones, enables
  Saturday; deadline 20:00 persists; athlete Messages shows the
  working-hours line and note; composer lists/inserts all three replies;
  coach list and overview widget mark today's check-in Overdue after the
  deadline; athlete mobile home + sheet show "Due today by HH:MM" before
  and "Overdue" after; athlete desktop Check-ins surface matches.
  Probes: /tmp/v8-verify/p813-*.mjs; shots: /tmp/v8-verify/shots/p813-*.
- Gaps/labels: vacations and outside-hours auto-replies explicitly not
  built (Phase 1b scope). No athlete-facing feedback promise (spec).
  checkInMoves is guarded for forward compatibility only; move
  application through eventsBetween is not part of this slice.
- Pending: independent OpenCode / DeepSeek V4.1 Flash review.


## 2026-11-05 — P810 Settings Phase 1a scope cleanup — gates green

- Athlete-facing availability deferred to Phase 1b: the mobile Messages
  header no longer reads `preferences.availability`; it keeps the coach
  profile name, photo and title. The legacy field stays editable in
  Profile → Availability and still feeds the coach Messages caption.
  No migration, no working hours.
- CommittedInput reconciliation fixed: the reported sequence
  (type "Liliana ", Enter, continue to "LilianaX", blur) previously lost
  the second edit because the normalized echo was read as an external
  write. The field now takes a `normalize` prop and the pure
  `settings/committed.ts` model applies the same rule to submission and
  acknowledgement — echoes acknowledge, Enter-then-blur saves once, an
  unchanged normalized draft saves nothing, and a genuine external write
  or reset still discards a stale draft. Callers (Name, Title,
  Availability, Business name) pass their projection rule.
- Regression evidence (settings.test.mjs 14/14): transition-level tests
  on `decideCommit`/`acknowledgeValue` cover the reported sequence,
  debounced normalization with empty→default fallback, Enter+blur
  single-save, no-op on unchanged normalized value, and external-write
  protection; source inspection asserts the athlete header no longer
  reads `preferences.availability` while the coach caption still does.
  No DOM harness exists — rendered interaction remains browser-pending.
- Gates (Node 24.22.3): `npm run check` exit 0 (336/336); `ui:check`
  exit 1 with the same 21 baseline violations (none in changed files);
  `git diff --check` clean.

## 2026-11-05 — P808 Settings Phase 1a review repairs — gates green

- Accent boundary restored: shared `vari8-theme` keeps its legacy
  `#EB91B8` fallback; the coach default moved to `accent-contrast.ts` as
  exported `DEFAULT_ACCENT` `#C9CCD3`, which is also the invalid-accent
  fallback. Invalid-accent expectations updated in both contrast suites.
- Availability: the Phase-1b `availabilityNote` field and its wiring were
  removed entirely. The existing `preferences.availability` is editable
  from Profile via the shared committed field and still feeds the coach
  Messages caption (and the athlete thread header line).
- Hydration-safe first render: `useSystemMode` and `useNarrowSettings`
  resolve matchMedia after hydration so server and first client render
  agree; live updates, explicit coach/athlete overrides and the phone
  drill-in are preserved. Tab resolution moved to pure
  `settings/tabs.ts`; the breadcrumb now uses `resolveSettingsTab` so an
  invalid tab shows Profile's label on desktop and the plain Settings
  crumb on the phone index.
- Storage labelled an estimate throughout: "Storage used (estimate)",
  "Estimate from the serialized workspace" and "About X of a typical
  ~5 MB browser budget" — no quota implication.
- Shared controls: `CommittedInput` now wraps the shared `Input`
  (accessible label/hint) and guards against double-commit
  (Enter-then-blur) and stale-draft overwrites. Logo previews render
  inside nested `v8-theme` frames at their intended `data-mode` — no raw
  colours, per-background inspection preserved.
- Tests (settings.test.mjs 9/9): +tab-resolution contract (invalid →
  Profile on desktop, index on phone), +coach/shared default separation
  (real `accentControlColors` fallback + vari8-theme source inspection),
  +availability round-trip with messages.tsx consumer inspection.
- Gates (Node 24.22.3): `npm run check` exit 0 (331/331); `ui:check`
  exit 1 with the same 21 baseline violations (none in changed files);
  `git diff --check` clean. Browser verification still pending
  authorisation — not claimed.

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
