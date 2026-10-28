# Frontend status

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
