# Frontend status

## 2026-11-16 — P841 combined candidate: saved-reply scope, check-in staleness, extra-date zone label — committed pending scoped integration review

One candidate branch, beta/p841-accepted-fixes, combining the three
accepted local repairs onto Settings head 79335092. Source and test
files were applied byte-identically from each accepted tip — no
conflicts; the only overlapping file was this status record, merged
by keeping every fix's entry.

Included tips: beta/p830-reply-drafts at d1068278 (saved-reply remount
scope, commits cab1435 + d1068278), beta/p833-stale-checkin at
811676f4 (stale check-in guard, feedback alignment and submit-guard
release, commits c360caff + a37704a3 + 811676f4),
beta/p839-timezone-label at f3226362 (extra-date zone label).

Gates on the combined candidate (Node 24.22.3): npm run check exit 0
(370/370), npm run ui:check exit 1 (21 unchanged baseline
violations), git diff --check exit 0. Targeted smoke reruns on the
candidate in a disposable profile: p830-replies-fixed.mjs 11/11,
p837-guard-release.mjs 8/8 (labelled test-only in-provider injection
plus the synthetic double activation), p835-double-submit.mjs 4/4,
p839-tz-label.mjs 6/6. Concurrent-tab storage is unchanged and
Marcel's decision on it remains pending.

## 2026-11-16 — P837 submit-guard release after rejection — committed pending narrow closure review

Repairs the remaining P836 finding on beta/p833-stale-checkin
(parent a37704a); #255, #256, the saved-reply branch and the main
checkout untouched.

1. The P835 in-flight guard never released after a write-time
   rejection: a genuinely stale attempt rejected inside the updater
   left the Submit button inert for the life of the form.
2. The guard now releases when the render that knows filedId
   commits without the matching submission — React does not render
   inside a batch, so a missing record there is the settled outcome
   of that attempt, not a pending one. The draft and the actual
   rejection stay; a later Submit revalidates against current
   state, rejects again while the occurrence is still stale, and
   files once the block clears — never retargeting the draft.
3. No result is read from inside the updater, no side effect runs
   there, and the guard is not cleared merely because a submission
   is not yet visible — the release happens on the render that
   observes the committed outcome of that attempt.

Gates (Node 24.22.3): npm run check exit 0 (369/369), npm run
ui:check exit 1 (21 unchanged baseline violations), git diff
--check exit 0.

Browser evidence (disposable profile): p837-guard-release.mjs —
the write-time rejection is unreachable through in-session UI, so
the trigger is a labelled test-only injection: a competing
submission dispatched into the mounted provider's React state via
its fiber hook, queued ahead of the form's write in the same
batch. Parent head (a37704a) 7/8 — rejection alert and draft
correct, but the unblocked Submit stayed inert (stuck-guard
defect). Fixed head 8/8 — only the injected record written, alert
plus draft intact, a still-stale retry revalidates and rejects
again, and after the block clears the same Submit revalidates and
files the draft against the bound occurrence. p835-double-submit
replayed on the fixed head: 4/4 — one stored submission, success
visible, no false rejection. Midnight matrix not repeated: the
binding and header path is unchanged.

## 2026-11-16 — P839 extra check-in date label follows the workspace zone — committed pending independent review

Repairs the P816 time-zone label finding on a separate branch,
beta/p839-timezone-label, from Settings head 79335092; #255, #256
and the local check-in/saved-reply repairs untouched.

1. Defect reproduced in a disposable browser: Region changed to
   America/New_York through the real Settings UI, the athlete
   profile's Add date dialog still labelled the field
   "Date · Europe/Vienna" — it was hardcoded.
2. The label now resolves through resolvedTimeZone(state.preferences),
   the same workspace-scoped source the calendar uses. The Vienna
   default and date-only storage are unchanged; no scheduling logic
   or shared weekday/month labels touched.
3. Verified rendered: label reads "Date · America/New_York" after the
   zone change and after reload; a picked day in the picker stores
   exactly that calendar date in extras; resetting the workspace
   returns the label to "Date · Europe/Vienna".

Gates (Node 24.22.3): npm run check exit 0 (368/368), npm run
ui:check exit 1 (21 unchanged baseline violations), git diff
--check exit 0. Browser evidence: p839-tz-label.mjs — 4/6 on the
base head (the two label checks fail on the hardcoded Vienna),
6/6 after the fix.

## 2026-11-15 — P835 check-in feedback and due-header alignment — committed pending narrow closure review

Repairs the two low-severity P834 findings on
beta/p833-stale-checkin (parent c360caff); #255, #256, the
saved-reply branch and the main checkout untouched.

1. Rapid duplicate submission. Two activations inside the same React
   batch each passed the pre-check against the uncommitted snapshot;
   the second write was rejected in-updater and its filedId won, so
   the form swapped the first submission's success for a false
   "already submitted" rejection. Reproduced on the parent head with
   a synthetic double click in a disposable browser (one stored
   submission, false rejection shown). An in-flight guard now ignores
   a second activation of the same form; the stored submission still
   decides which outcome renders, and the updater stays pure — no
   side effects or result reads inside it. A genuinely stale form
   still rejects and keeps its draft.
2. Due header alignment. The occurrence binding moved into a shared
   useCheckInTarget hook: the mobile sheet header and the new
   "Filing for <date>" caption inside the form read the same bound
   id + effective date that submit writes. After the coach-zone day
   rolls over the dashboard may advance, but the open form's header
   and caption keep the opened date; reopening binds the newly
   selected occurrence. Moved recurring and extra-date submissions
   preserved (p833-valid-paths.mjs still 3/3).

Gates (Node 24.22.3): npm run check exit 0 (369/369), npm run
ui:check exit 1 (21 unchanged baseline violations), git diff
--check exit 0.

Browser evidence (disposable profile, labelled): p835-double-submit.mjs
— parent head stores one submission but shows a false stale
rejection (2/4, reproduced defect); fixed head stores exactly one
submission and shows success (4/4). p835-midnight.mjs 16/16 —
controlled browser clock via CDP Emulation.setVirtualTimePolicy at
2026-11-15T22:58Z (23:58 in seeded coach zone Europe/Vienna), no
real midnight waited: mobile sheet header keeps "15 Nov" after the
zone rolls to 16 Nov, desktop form caption keeps "Filing for Sun 15
Nov", both file recurring:client-001:2026-11-15 @ 2026-11-15, the
22 Nov occurrence stays untouched. Stale-rejection coverage stays
model-level plus the in-updater recheck — the client surface still
has no in-session trigger; cross-tab snapshots remain unsolved.

## 2026-11-15 — P833 stale check-in submission guard — committed pending independent review

Repair for the P821 stale-open-form finding on beta/p833-stale-checkin,
branched from beta/p818-settings-phase-1c (head 79335092); #255, #256,
the saved-reply branch and the main checkout untouched.

1. Finding confirmed through ordinary interaction. The open form
   re-resolves its occurrence on every render — the occurrence prop
   follows pickCheckInCard through the shared minute clock — so a
   filled form left open across the coach-zone day boundary silently
   retargets to the next occurrence. On a byte-identical base the
   Sunday 15 Nov check-in submitted as recurring:client-001:2026-11-22;
   the coach timezone fixture was seeded via storage, the boundary
   wait and submit were real UI.
2. The form now binds the opened occurrence (stable id + effective
   date) on the first render where the local day is real — the
   local-today hook yields the seeded TODAY constant until its effect
   runs, another stale snapshot — and revalidates that binding at the
   point of writing via checkInSubmissionTarget, both before and inside
   the state updater. Moved, skipped, removed and already-submitted
   occurrences are rejected; the draft stays visible and explains how
   to reopen the current check-in from Home. No silent re-attach to
   the next occurrence and no overwrite of an existing submission.
3. Reachability limits stated plainly: the athlete app has no
   in-session mutation that reaches checkInMoves or another
   submission, so moved/skipped/submitted rejections cannot be
   triggered through ordinary client-side interaction; they are
   covered by model tests and the in-updater recheck only. Cross-tab
   or coach-side changes remain the known stale-snapshot limitation
   and are out of scope.
4. Regressions in model.test.mjs: moved (reported with the new date),
   skipped and removed (gone), already-submitted, plus valid
   moved-occurrence, extra-date and unbound legacy targets; an
   occurrence that merely became overdue still files.

Gates (Node 24.22.3): npm run check exit 0 (369/369), npm run ui:check
exit 1 (21 unchanged baseline violations), git diff --check exit 0.

Browser evidence (disposable profile): p833-stale.mjs — byte-identical
base head files the next occurrence after the day-boundary tick
(reproduced defect); fixed head files the opened occurrence (4/4).
p833-valid-paths.mjs 3/3 — ordinary desktop submit, moved recurring
occurrence keeping its stable id at the moved date, extra-date
occurrence. No rendered rejection path exists in the client surface;
see point 3.

## 2026-11-15 — P830 saved-reply remount scope — committed pending focused review

P816's deferred finding on a separate local branch
(`beta/p830-reply-drafts`, off `79335092`): rejecting a blank saved
reply bumped a single `restore` counter baked into EVERY row's key
(`key={`${reply.id}:${restore}`}`), so all reply inputs remounted.

Reproduction (rendered, disposable Chrome profile, preview :3300,
buggy head): marking DOM nodes showed all three inputs remount on a
blank rejection; clicking into another row's field at rejection time
leaves `document.activeElement` on BODY — the clicked input is
destroyed mid-click (focus theft). The literal "unsaved draft
discarded" case is NOT reachable through ordinary interaction: any
focus change commits a pending draft (blur-commit), so at rejection
time sibling rows hold committed text only — the remount restored the
just-saved value and nothing was lost. The <600 ms debounce window in
which a draft could truly be dropped cannot overlap a rejection from
another field, since triggering that rejection needs focus on the
rejecting row — which commits the draft first. Reported as observed;
no rendered draft-loss claimed.

Fix: rows key by stable `reply.id`; the remount signal is a per-reply
tick map (`settings/replies.ts`: `bumpReplyRestore`, `replyInputKey`)
applied to the CommittedInput's key only — a rejected blank edit
remounts just that field to restore its saved text; sibling rows keep
their nodes, drafts, debounce timers and focus. Card-level validation
(`cd-settings-error`) unchanged, storage untouched on rejection.

Regression: settings.test.mjs 47/47 (+1 — a rejection changes only
that reply's input key). Browser probe `p830-replies-fixed.mjs`
(11/11, disposable CDP profile): ordinary pointer interaction shows
the click into another row keeps focus through the rejection;
test-triggered input events show the affected field remounting and
restoring while siblings keep their DOM nodes and text, and that a
pending draft plus its commit timer survive the rejection and write
to storage; duplicate-text autosave, reorder, delete + Undo all
preserved.

Gates (Node 24.22.3): `npm run check` — 369/369 tests, agent-context,
typecheck, lint, build all exit 0 (one format fix after first lint
run); `npm run ui:check` exit 1 — the same 21 baseline violations,
none new, none suppressed; `git diff --check` exit 0.

## 2026-11-15 — P820 vacation submission linkage and scoped Undo — committed pending focused closure review

Repairs P819 findings 1-4 on beta/p818-settings-phase-1c (head
db66554); same worktree; Phase 1a, Phase 1b, Tasks and the main
checkout untouched.

1. Submissions bind to the actual occurrence. CheckInForm now accepts
   the occurrence the athlete opened; the mobile sheet passes the
   move-aware due event and the desktop app passes its next event.
   Generic entry points resolve through pickCheckInCard — the same
   move-aware path as the calendar and cards — covering extras, skips
   and re-dated moves, and never fall back to another recurring ID.
   The submission stores the occurrence's stable id and effective date.
   Submitted occurrences stay protected on later vacation edits,
   shortening and restore: their move records are kept so the filed
   submission is never re-dated.
2. Vacation messaging resolves on the coach's day. The athlete send
   path computes the coach day via resolvedTimeZone/zonedToday at send
   time and stamps both the athlete message and the automatic reply
   with it, matching the banner and coach chip. Rescheduling notices
   are stamped with the coach day as well.
3. Undo is scoped to the saved operation. undoVacationSave now takes a
   save record (saved vacation, optional prior record, saved moves,
   prior moves, exact notice ids). The record reverts only when it is
   still what that save wrote; save-created moves are removed and
   replaced moves restored by exact event/destination identity, so a
   later inline reschedule — even one carrying the same vacationId —
   is preserved; only the exact notice messages the save created are
   removed, leaving later athlete messages and automatic replies alone.
4. Focused regressions added: moved recurring and extra submissions,
   coach-zone boundary days, and save Undo after a later reschedule
   and automatic reply.

Gates (Node 24.22.3): npm run check exit 0 (368/368), settings.test.mjs
46/46 with the custom loader, npm run ui:check exit 1 (21 unchanged
baseline violations), git diff --check exit 0.

Browser evidence (disposable profile): p820-submission.mjs 11/11 — a
real athlete form submitted the moved occurrence and stored
recurring:client-002:2026-11-17 at the moved date; the coach calendar
showed it awaiting feedback with "Moved from 17 Nov"; delete+restore
kept the filed move. p820-boundary.mjs 14/14 — a real timezone
override put the browser a day behind the coach day both ways:
banner and reply follow the coach day, stamps match, one reply per
conversation across reload. p820-undo.mjs 11/11 — save with notices,
a later same-vacationId inline reschedule, an away reply, then the
original save Undo: 9/9 save moves reverted, the later reschedule
preserved, exactly the 9 notices removed.

Remaining gap, labelled: each route mounts its own store provider and
persists its snapshot on the next write, so a message sent from the
athlete app while the coach app is open is dropped by the coach tab's
next write — including the undo write. This predates vacations and
affects any concurrent write; undo scoping itself preserves
in-lineage replies (regression "undo preserves a later inline
reschedule and automatic reply"). P816 carry-forwards and P819's
low-severity picker/clash items remain open. No push, PR, merge,
deployment or message to Marcel.

## 2026-11-15 — P818 Settings Phase 1c: vacations, rescheduling, away messages — committed pending independent review

Final Phase 1 slice on beta/p818-settings-phase-1c over 20c407b (the
accepted P815 head); separate worktree; Phase 1a, Tasks and the main
checkout untouched.

- Vacation editor in Availability (settings/vacations.tsx): add, edit
  and delete with a list of affected check-ins before saving, per-row
  and bulk choices (move before, move after — first working day back is
  the default — pick a date, skip, keep). Submitted check-ins are
  read-only and never moved. Unresolved clashes — against existing
  check-ins or between proposals — block saving. Editing shows restore
  rows for moved events that fall outside the edited range; deleting
  offers "Delete and restore dates". Saving shows an Undo that reverts
  only that vacation's moves and the messages it created; later
  unrelated edits survive.
- Shared scheduling path: eventsBetween applies checkInMoves in one
  place so the coach calendar, lists and both athlete layouts agree.
  Event IDs stay stable so submissions still attach (a submission
  anchors its occurrence to the date it was filed against; submitted
  check-ins never move). to:null skips the occurrence; destinations
  outside the queried range are included. The coach side shows
  "Moved from …"; check-ins inside a vacation that were never
  rescheduled get a "During your vacation" chip with inline
  before/after/date/skip/keep controls that honour clash detection.
  Vacation days pause the feedback target and contribute no working
  hours.
- Away messages: the athlete apps (mobile home + messages, desktop
  overview + messages) show an away banner with the until/back dates;
  the coach header shows a vacation chip. An athlete message sent
  during a vacation triggers one automatic reply per conversation per
  vacation ({start}/{end}/{return} placeholders filled), labelled
  "Automatic reply" in both apps and deduplicated across reload via
  message.vacationId. Optional per-athlete rescheduling notices are
  sent on save when enabled.
- Compatibility: vacations, checkInMoves, message.auto and
  message.vacationId are all optional guarded fields; legacy workspaces
  load unchanged. No outside-hours replies, no Phase 2 work, no
  Tasks/Notes/backend changes. P816's three findings carried forward.

Gates (Node 24.22.3): npm run check exit 0 (363 tests, agent-context,
typecheck, Biome, build); settings.test.mjs 41/41 via the test loader
(+12 Phase 1c cases covering inclusive bounds, working-day navigation,
affected selection, submitted protection, move semantics and range
boundaries, clash detection, undo scoping, reply dedup across reload,
rescheduling notices, guards and the feedback pause); npm run ui:check
exit 1 with the same 21 baseline violations; git diff --check clean.

Browser (disposable profile, probe /tmp/v8-verify/p818-vacation.mjs
18/18): editor lists 17 affected check-ins before save; bulk "move
all → after" produces real proposed-move clashes that disable saving
until resolved per-row; vacation + moves persist; toast Undo removes
them; re-add → coach chip "On vacation until 21 Nov"; athlete banner
"Your coach is away until Sat 21 Nov. Back on Mon 23 Nov"; athlete
send → exactly one "Automatic reply" with filled placeholders; second
send → no second reply; coach thread labels it; delete-and-restore
clears the vacation and all its moves. p818-movedfrom.mjs: the coach
calendar event renders "Moved from 16 Nov". Probe caught a real bug —
submitted rows were being assigned the default choice and moved; fixed
before commit. Preview for this worktree runs on 3100/3101 (the 1b
preview on 3000/3001 was left running).

Carried forward: P816 findings; undo removes auto-replies tagged with
the vacation id as well as save-created notices (an edge acceptable for
this slice); the delete dialog restores only unsubmitted moves.

## 2026-11-14 — P815 repair of Phase 1b review findings — committed pending independent review

Repair pass on beta/p813-settings-phase-1b over b001698 (P813 head);
Phase 1a, Tasks and the main checkout untouched.

- Display settings are now workspace-scoped: the mutable module-global
  display config is gone from user-facing formatting. The provider
  derives a Display object (region + bound formatDate/formatClock) from
  the active workspace via useDisplay(); formatting APIs in model.ts
  take the config explicitly. Reset restores Europe/Vienna, en-GB and
  24-hour. Date-only values still render in UTC; offset-bearing instants
  format as instants, naive stamps as coach-zone wall time. The
  hardcoded "Europe/Vienna" caption on the calendar toolbar now reads
  the configured zone.
- Deadline/DST: overdue once the deadline minute ends (due through the
  whole 20:00 minute, overdue from 20:01, coach zone). Spring-forward
  gap deadlines resolve to the first valid instant after the gap — never
  an earlier wall time; repeated autumn times keep the first occurrence.
  A working-hours range entirely inside a spring gap contributes zero
  elapsed time; split ranges and transition-crossing windows are covered
  by tests. Submitted check-ins and date-only schedules unchanged.
- Live updates: a single provider clock (useCoachNow) ticks just past
  each minute boundary and refreshes on focus/visibility; coach
  calendar, lists and overview plus both athlete layouts take now from
  it, so an open screen crosses the cutoff with no reload. No per-row
  timers; timers clean up on unmount. The feedback chip stays coach-only.
- Saved replies: composer entries key by stable reply id (identical
  text stays independently selectable); legacy fallback replies get
  stable ids. An emptied edit is never persisted — it shows a
  validation alert and the field restores the stored value. Delete with
  Undo, the 20-reply cap and intentionally empty lists preserved.
- Agent-context gate: the P813 STATUS block now records +12 focused
  cases (not 14) and carries no machine-specific paths.
- Tests: settings.test.mjs 29/29 including new regressions for display
  defaults/workspace isolation, the cutoff boundary, DST arithmetic,
  working-hours gap handling and duplicate-text/blank saved replies.
- Gates (Node 24.22.3): npm run check exit 0 (351/351 tests, agent
  context, typecheck, Biome lint, production build); npm run ui:check
  exit 1 with the same 21 baseline violations as the Phase 1a head,
  none in changed files; git diff --check clean.
- Browser evidence (disposable Chrome profile, seeded localStorage):
  New York/en-US/12-hour workspace renders en-US check-in dates, 12-hour
  message times, "New York time" on the athlete surface and the
  configured zone in the calendar caption; reload keeps all of it; Data
  reset returns Vienna/en-GB/24h and the UI re-renders. New templates
  seed lb weight units (Unit for Bodyweight = lb). An open coach
  calendar and an open athlete mobile home both cross a real deadline
  (Scheduled/Due → Overdue) with no navigation. Duplicate saved replies
  with identical text store distinct ids and appear as two composer
  items; a blank edit shows the alert, restores the stored text and
  leaves storage unchanged. Probes kept in local scratch (outside VCS).
- Unexercised/labels: live crossing verified on the coach Week view and
  athlete mobile home; the list/overview and desktop athlete paths share
  the same clock wiring but were not separately crossed in the browser.
  Focus/visibility re-eval on tab resume is exercised by the clock's
  listeners; background-tab throttling was not emulated. Design-system
  month/day-name internals still format in en-GB (out of scope).


## 2026-11-14 — P813 Settings Phase 1b — implemented, gates green, browser-verified

Built on Phase 1a head a8dafb3 (beta/p806-settings-phase-1a preserved);
work on beta/p813-settings-phase-1b.

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
- Tests: settings.test.mjs +12 cases (26/26 in file) covering legacy
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
  Probe scripts and screenshots kept in the agent's local scratch
  directory (outside version control).
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
