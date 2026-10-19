# PR-03b — react-hooks v6 findings fixed, rules back to error

Worktree `/home/nexuslink/vari8-worktrees/pr-03-react-hooks`, branch
`beta/pr-03-react-hooks`, base `3399b0c` (Vari8-Beta at PR-02 merge).
Issue #60. Node v26.8.2, npm 11.19.1.

PR-02 downgraded four eslint-plugin-react-hooks v6 rules to `warn` because 11
findings in pre-existing code failed them. This card fixes every finding at its
root cause and restores all four rules to `error`. Lint exits 0 with zero
react-hooks findings; the only remaining warnings are the 5 pre-existing
`@typescript-eslint/no-unused-vars` items untouched by this card.

## 1. Findings and fixes

All fixes keep behavior and visuals identical; no markup, class, copy, or style
changed anywhere.

| # | File | Rule | Fix |
|---|---|---|---|
| 1 | `app/(tracker)/workspace/[workspaceId]/check-ins/checkin-submission-panel.tsx` | set-state-in-effect | Success consequence moved into the action path: `useActionState` wraps the server action and clears dirty + marks submitted on `ok`. The effect keeps only `router.refresh()` (external cache sync). |
| 2 | `app/(tracker)/workspace/[workspaceId]/dashboard/client-habits-widget.tsx` | set-state-in-effect | Prop adoption via the documented render-time prev-compare: when `initial` identity changes, `setHabits(initial)` runs in the adjust pass instead of an effect. |
| 3 | `app/workspace/[workspaceId]/clients/[clientProfileId]/dashboard/dashboard-editor.tsx` | refs (2) | `routerRef.current` and `latestConfig.current` now sync inside a `useEffect` instead of during render. |
| 4 | same | purity | `Date.now()` id minting moved to module-scope `mintWidgetId(kind)`; `addWidget` calls it. Same id format and uniqueness. |
| 5 | `components/checkin/checkin-calendar.tsx` | set-state-in-effect | Result is keyed to its request range (`{range, value}`); the render derives `result` as null while a new range is in flight, the same loading surface the removed `setResult(null)` produced. Async callback setState stays. |
| 6 | `components/checkin/draft-editor.tsx` | set-state-in-effect | Prop reseed via render-time prev-compare on `[initialName, initialRevision, initialDraft]`; `reseedDraftState` runs through the updater with the same monotonic semantics. |
| 7 | `components/checkin/feedback-thread.tsx` | set-state-in-effect | Mount reconciliation's synchronous `setNonce`/`setReconcile` moved inside the async flow that performs the resolve call; ordering (nonce restore then "checking") unchanged. |
| 8 | same | immutability | `const [body, setBody] = useState("")` moved above the effects that reference `setBody`. The success-effect's setter batch moved inside the async boundary for symmetry with finding 7; dedup via `lastHandledRef` preserved. |
| 9 | `components/onboarding/draft-editor.tsx` | set-state-in-effect | Same prev-compare reseed as finding 6. |
| 10 | `components/trainingprogram/program-bookings.tsx` | set-state-in-effect | History/cursor/error adoption via render-time prev-compare on `initial`. |

That is 8 files, 11 findings (dashboard-editor contributes 3, feedback-thread 2).

`eslint.config.mjs`: the four rules are `"error"` again; comment updated.

### Why the prev-compare pattern

React documents "adjusting state during render" (store the previous prop, set
state conditionally) as the replacement for prop-sync effects. A probe file
against the installed plugin confirmed the pattern passes the full recommended
preset including `react-hooks/set-state-in-render`, which is also enabled at
error level via the Next config.

## 2. `frontend/` (canvas)

Biome (`biome check . --error-on-warnings`, 199 files): **zero findings**.
The canvas has no hook findings, so no canvas file was touched; markup and
styles are byte-identical. No exceptions to note.

## 3. Visual parity evidence

Screenshots from the running app (`next dev --turbopack`, seeded fixture
workspace `pr03b-workspace`), full page, before and after the fixes at 1440 and
390 px. All 16 pairs are **pixel-identical** (`compare -metric AE` = 0).

Directory: `icm/05-build/evidence/PR-03b/{before,after}/`

| Screen | Component(s) covered |
|---|---|
| `checkin-draft-editor-{1440,390}.png` | `CheckInDraftEditor` |
| `onboarding-draft-editor-{1440,390}.png` | `DraftEditor` (onboarding) |
| `staff-checkins-thread-{1440,390}.png` | `CheckInFeedbackThread` + staff `CheckInCalendar` |
| `dashboard-editor-{1440,390}.png` | `DashboardEditor` |
| `training-program-bookings-{1440,390}.png` | `TrainingBookings` |
| `client-checkins-calendar-{1440,390}.png` | client `CheckInCalendar` |
| `checkin-submission-panel-{1440,390}.png` | `CheckInSubmissionPanel` fill form |
| `client-dashboard-habits-{1440,390}.png` | `ClientHabitsWidget` |

`fixtures.json` records the seeded ids (workspace, client profile, forms,
instance, submission, program). The training program was created through the
real UI flow (create form) because `readStaffTrainingProgramFromAction`
requires a fully normalized draft.

## 4. Gates (fresh runs, this tree)

| Command | Exit | Notes |
|---|---|---|
| `npm run typecheck` | 0 | `tsc --noEmit` clean |
| `npm run lint` | 0 | zero react-hooks findings; 5 pre-existing no-unused-vars warnings |
| `npm run test` | 0 | 105 files passed, 4 skipped; 1308 tests passed |
| `npm run build` | 0 | `next build --turbopack` |
| `cd frontend && npm run build` | 0 | `next build` static export; required `npm install` first (frontend deps were absent in this worktree) |
| `cd frontend && npx biome check . --error-on-warnings` | 0 | 199 files, no findings |

`app/api/` was not touched; integration tests were not required by the footer
(no `db/`, `lib/`, or `app/api/` changes).

## 5. Environment notes

- Local Postgres container `vari8-db-1`, database `app_pr03b` (created for this
  card, dropped after verification).
- Dev server ran with `ENABLE_CHECK_INS=1 ENABLE_CLIENT_DASHBOARD=1
  ENABLE_TRAINING_PLANS=1 ENABLE_ONBOARDING_SUBMISSION=1
  ENABLE_ONBOARDING_ASSIGNMENTS=1` on `http://localhost:3620`. `127.0.0.1` broke
  the dev HMR websocket (client never hydrated); `localhost` worked. Screenshots
  use `localhost`.
- `next dev` appended its generated `nextjs-agent-rules` block to `AGENTS.md`;
  reverted before commit.

## 6. Limitations

- The submission-panel fix relies on `useActionState` accepting a wrapped
  action; behavior verified by lint/typecheck/build and identical screenshots.
  The fill form was captured in its pristine state in both passes.
- Screenshots are dev-server output (same render path as prod for these
  components); the production build also passes.
- Fixtures are synthetic; seeded ids carry the `pr03b` namespace.
