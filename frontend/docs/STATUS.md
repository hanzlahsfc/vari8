# Frontend status

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
