# TB0 — test audit pass 2, per-describe-block bite check

Lane TB0, 36 files (12 integration, 24 unit) from `TB0.txt`. Source commit
58eb6ed. Four workers (`TB0-w1`..`TB0-w4`), each in its own scratch worktree
with its own database (`app_tb_tb0_w1`..`w4`), merged by the lead. Worker
reports: `TB0-w1.md`, `TB0-w2.md`, `TB0-w3.md`, `TB0-w4.md` in this directory.

## Summary

- 116 top-level describe blocks audited across 36 files, 563 tests,
  ~12,534 block lines.
- Verdicts: 107 blocks KEEP (547 tests, ~12,226 lines), 9 blocks CUT
  (16 tests, ~308 lines).
- CUT share: 2.8% by tests, 2.5% by lines.
- Baselines: all 36 files green on first run. Only anomaly: 1 conditional
  `it.skipIf` in source-config.test.ts (real source folder absent on this
  machine); the block's other tests ran and bit.
- No file is a full CUT. 28 files KEEP-ALL, 8 files TRIM.
- Lead adjudication: one worker KEEP row flipped to CUT (see below).

## Table

| file | block | lines | tests | target | verdict | reason or mutation | failed tests |
|---|---|---|---|---|---|---|---|
| tests/integration/habits-schema.test.ts | HABITS-I1 schema (real PG) | 259 | 5 | db/migrations/20261015000000_habits_i1/migration.sql (tables, enum, CHECKs, uniques, composite coherence FK, RESTRICT/SET NULL) | KEEP | `CHECK ("weekdays" >= 0 AND "weekdays" <= 127)` -> `<= 126` in migration.sql (schema dropped first so migrate deploy re-applied the mutated DDL) | 2: "enforces boundary + log uniqueness per habit per day", "enforces same-workspace coherence FK + RESTRICT + SET NULL" |
| tests/integration/i4-next-checkin.test.ts | FI-I4 next-Check-In selection (real PG) | 344 | 8 | lib/checkin/instances.ts getOwnNextCheckInInstance | KEEP | `orderBy: [{ dueAt: "asc" }]` -> `"desc"` in lib/checkin/instances.ts:1314 | 2: "picks the earliest eligible dueAt; deterministic id tiebreak", "overdue scheduled precedes future scheduled" |
| tests/integration/p008-onboarding-forms.test.ts | P-008 onboarding forms (real PG) | 2591 | 46 | lib/onboarding/forms.ts create/list/get/save/publish/open/archive + guard + audit | KEEP | `form.draft_revision !== input.expectedRevision` -> `===` in lib/onboarding/forms.ts:503 | 19, incl. "save -> publish produces an immutable version", "stale revision is rejected; forged fieldId is rejected", "concurrent publish produces exactly one version", "save writes audit atomically", "mutations bind the authz repo to the TRANSACTION client" |
| tests/unit/checkin-calendar.test.ts | parseCheckInCalendarRange | 61 | 5 | lib/checkin/instances.ts parseCheckInCalendarRange | KEEP | `> CALENDAR_RANGE_MAX_DAYS * 86400_000` -> `>=` in lib/checkin/instances.ts:697 | 1: "accepts a span at exactly the bound" |
| tests/unit/checkin-calendar.test.ts | checkInCalendarDayKey | 21 | 2 | lib/checkin/calendar.ts checkInCalendarDayKey | KEEP | `timeZone,` -> `timeZone: "UTC",` in lib/checkin/calendar.ts:15 | 1: "buckets an instant onto the viewer-local calendar day" |
| tests/unit/checkin-calendar.test.ts | checkInCalendarMonthCells | 24 | 2 | lib/checkin/calendar.ts checkInCalendarMonthCells | KEEP | `getUTCDay() + 6` -> `+ 5` in lib/checkin/calendar.ts:38 | 1: "returns exactly 42 Monday-start cells covering the month" |
| tests/unit/checkin-forms.test.ts | P-025-A shared server-only check-in feature resolver | 63 | 4 | lib/checkin/forms-gate.ts isCheckInsEnabled | KEEP | `ENABLE_CHECK_INS !== "1"` -> `===` in lib/checkin/forms-gate.ts:43 | 3: "enables only when the flag is exactly '1'...", "fails closed when the flag is unset, off, or malformed", "explicit APP_ENV wins over baked NODE_ENV both ways" |
| tests/unit/checkin-forms.test.ts | P-025-A RBAC — checkinFormDefinitions | 35 | 3 | lib/auth/rbac.ts RESOURCES, resolveScope (checkinFormDefinitions matrix), CHECKIN_FIELD_KINDS | KEEP | `COACH: c("workspace", "workspace")` -> `c("assigned", "workspace")` in the checkinFormDefinitions cell, lib/auth/rbac.ts:287 | 1: "owner and coach have workspace read/write; all others denied". Note: the other 2 tests in this block are constant pins and did not bite |
| tests/unit/checkin-forms.test.ts | P-025-A dual-role PLATFORM_ADMIN denial | 97 | 5 | lib/auth/guard.ts authorize PLATFORM_ADMIN deny-set | KEEP | `PLATFORM_ADMIN_DENIED_RESOURCES.has(resource)` -> `false` in authorize, lib/auth/guard.ts:270 | 4: all four generated dual-role PLATFORM_ADMIN + ACTIVE {OWNER,COACH} cases |
| tests/unit/checkin-forms.test.ts | P-025-A validateCheckInDefinition | 337 | 12 | lib/checkin/forms.ts validateCheckInDefinition | KEEP | `knownKind === undefined \|\| knownKind !== kind` -> `knownKind === kind` in lib/checkin/forms.ts:206 | 2: "trusts only current-draft ids; presented foreign/retired ids are forbidden", "option ids must be bound to THIS field in the current draft" |
| tests/unit/checkin-forms.test.ts | P-025-A seam — app never imports the service directly | 19 | 1 | none (scans app/** source text for a forbidden import specifier) | CUT | static source scan; calls no code under test (same rule that cut client-setup-boundary-imports.test.ts in pass 1) | n/a |
| tests/unit/checkin-tracker-context.test.ts | reconcileTrackerContextScopes | 34 | 18 | lib/checkin/tracker-context.ts reconcileTrackerContextScopes | KEEP | `checkinScope === "assigned" \|\| dailyScope === "assigned"` -> `&&` in lib/checkin/tracker-context.ts:71 | 3: "checkin=workspace daily=assigned", "checkin=assigned daily=workspace", "never widens assigned to workspace" |
| tests/unit/checkin-tracker-context.test.ts | declared-date contract (shared parser) | 32 | 5 | lib/daily-entry/service.ts parseDeclaredDate | KEEP | `DATE_RE = /^\d{4}-\d{2}-\d{2}$/` -> `\d{1}` month group in lib/daily-entry/service.ts:140 | 1: "accepts canonical YYYY-MM-DD within bounds" |
| tests/unit/client-roster.test.ts | parseRosterQuery — cursor `c` | 33 | 6 | lib/workspace/roster-query.ts parseRosterQuery (cursor path) | KEEP | `CURSOR_PATTERN = /^[a-z0-9]{1,64}$/i` -> `{1,32}` in lib/workspace/roster-query.ts:25 | 1: "rejects an oversized cursor" |
| tests/unit/client-roster.test.ts | parseRosterQuery — history `p` | 38 | 7 | lib/workspace/roster-query.ts parseRosterQuery (history path) | KEEP | `if (index !== 0) return null` -> `index !== 1` in lib/workspace/roster-query.ts:47 | 2: "accepts a start sentinel plus cursors", "rejects the start sentinel anywhere but index 0" |
| tests/unit/client-roster.test.ts | roster pagination hrefs | 49 | 7 | lib/workspace/roster-query.ts nextRosterHref, prevRosterHref, rosterPageNumber | KEEP | `parts.push(\`p=...\`)` -> `` `x=...` `` in lib/workspace/roster-query.ts:67 | 4: "next from page 1 pushes the start sentinel", "next from page 2 appends the current cursor", "previous from page 3 restores the page-2 cursor and history", "built hrefs carry only c/p params" |
| tests/unit/client-roster.test.ts | fixed page size | 7 | 1 | ROSTER_PAGE_SIZE constant | CUT | constant pin: asserts only Number.isInteger + numeric bounds on a config constant; no behavior called | n/a |
| tests/unit/client-setup-boundary.test.ts | P-016 boundary — flag-off fails before any input work | 52 | 4 | lib/coaching/client-setup-boundary.ts enabled() / isClientSetupEnabled gate | KEEP | `return isClientSetupEnabled(process.env.ENABLE_CLIENT_SETUP)` -> `return true` in lib/coaching/client-setup-boundary.ts:97 | 4: all "returns the feature-off result without touching the db" rows |
| tests/unit/client-setup-boundary.test.ts | P-016 boundary — input binding | 46 | 1 | lib/coaching/client-setup-boundary.ts boundedId / boundedIndex | KEEP | `Number.isSafeInteger(value)` -> `true` in lib/coaching/client-setup-boundary.ts:75 | 1: "rejects overlong/missing/malformed inputs before delegating" |
| tests/unit/client-setup-boundary.test.ts | P-016 boundary — error mapping | 53 | 2 | lib/coaching/client-setup-boundary.ts CODE_TO_MESSAGE / mapError | KEEP | `assignment_not_accessible: DENIED` -> `GENERIC` in lib/coaching/client-setup-boundary.ts:50 | 1: "maps service error codes to stable messages" |
| tests/unit/client-setup-selection.test.ts | P-016-R2 boundary — serialized choices carry no internal ids | 69 | 2 | lib/coaching/client-setup-boundary.ts listAssignFormChoices / listClientSetupsForWorkspace serialization | KEEP | `clients.map(({ name }) => ({ name }))` -> `({ name, id }) => ({ name, id })` in lib/coaching/client-setup-boundary.ts:146 | 1: "assign form choices return display labels + one fingerprint, no ids" |
| tests/unit/client-setup-selection.test.ts | P-016-R2 boundary — positional assign resolution | 96 | 7 | lib/coaching/client-setup-boundary.ts assignTemplateFromAction binding | KEEP | `fingerprint === null` -> `fingerprint === undefined` in the assign 4-way null check, lib/coaching/client-setup-boundary.ts:208 | 1: "rejects missing fingerprint without touching the service" (a boundedIndex mutation could not bite: reject rows bail on the fingerprint check first) |
| tests/unit/client-setup-selection.test.ts | P-016-R2 boundary — positional cancel resolution | 73 | 6 | lib/coaching/client-setup-boundary.ts cancelSetupAssignmentFromAction binding | KEEP | `pinIndex === null` -> `pinIndex === -1` in lib/coaching/client-setup-boundary.ts:247 | 3: "rejects a negative index", "rejects a non-integer index", "rejects a NaN index" |
| tests/unit/client-setup.test.ts | P-016 client-setup dev gate | 12 | 11 | lib/coaching/client-setup-gate.ts isClientSetupEnabled | KEEP | `return env === "1"` -> `return env === "true"` at client-setup-gate.ts:16 | is enabled only by the exact value '1'; is disabled for "true" |
| tests/unit/client-setup.test.ts | P-016 client-setup contract constants | 14 | 2 | lib/coaching/client-setup-gate.ts CLIENT_SETUP_LIMITS, ClientSetupError | CUT | constant pin: restates CLIENT_SETUP_LIMITS values and the error name/message shape | n/a |
| tests/unit/coaching-nav.dom.test.tsx | P-014 workspace nav - Parameters and Templates entries | 40 | 7 | components/workspace-nav.tsx WorkspaceNav | KEEP | drop `"COACH"` from the parameters roles pin at workspace-nav.tsx:89 | shows both entries for COACH when the flag is enabled |
| tests/unit/coaching-parameters.test.ts | validateParameterCreate | 151 | 9 | lib/coaching/parameters.ts validateParameterCreate | KEEP | `out.min > out.max` -> `out.min < out.max` at parameters.ts:176 | accepts declarative min/max only on MEASUREMENT and bounds-checks it |
| tests/unit/coaching-parameters.test.ts | applyParameterEdits (revision + semantic lock) | 70 | 5 | lib/coaching/parameters.ts applyParameterEdits | KEEP | `next.revision = state.revision + 1` -> `next.revision = state.revision` at parameters.ts:415 | applies display edits and bumps revision; semantic edits rejected after first published reference |
| tests/unit/credentials.test.ts | authorizeCredentials | 86 | 6 | lib/credentials.ts authorizeCredentials | KEEP | `user.status !== "ACTIVE"` -> `=== "ACTIVE"` at credentials.ts:57 | returns the safe user shape for valid credentials; normalizes the email before lookup; denies inactive accounts with the same generic result |
| tests/unit/credentials.test.ts | normalizeEmail | 7 | 1 | lib/credentials.ts normalizeEmail | KEEP | `value.trim().toLowerCase()` -> `value.trim()` at credentials.ts:30 | trims and lowercases strings and rejects non-strings |
| tests/unit/crosssheet.test.ts | buildCrossSheetData | 33 | 4 | lib/extraction/crosssheet.ts buildCrossSheetData, renderCrossSheetMarkdown | KEEP | `if (!names.has(value)) continue` -> `if (value === "") continue` at crosssheet.ts:48 | finds reference-data text matches with locations; omits values that are not reference data or safe labels; renders markdown without leaking non-safe values |
| tests/unit/dashboard-autosave.test.ts | autosave coordinator (I1-R5) | 190 | 13 | lib/dashboard/autosave-coordinator.ts commitDashboardConfig, flushDashboardSlot | KEEP | `slot.dirty = true` -> `slot.dirty = false` at autosave-coordinator.ts:280 | terminal failure keeps the draft and an honest failed state; conflict with divergent server state keeps the draft as conflict |
| tests/unit/dashboard-autosave.test.ts | purge while in-flight (I1-R6 P3-3) | 67 | 2 | lib/dashboard/autosave-coordinator.ts clearAllDashboardSlots | KEEP | drop the `cancelSlotTimer(slot)` loop at autosave-coordinator.ts:422 | a cleared slot cannot resurrect its draft or schedule queued work |
| tests/unit/dashboard-autosave.test.ts | bounded clean-slot retention (I1-R6 P3-4) | 24 | 2 | lib/dashboard/autosave-coordinator.ts acquireDashboardSlot eviction | KEEP | `MAX_CLEAN_SLOTS = 8` -> `= 100` at autosave-coordinator.ts:84 | clean slots are evicted oldest-first beyond the cap; dirty slots are never evicted |
| tests/integration/p014-coaching-templates.test.ts | schema constraints | 133 | 4 | db/migrations 20261007090000_p014_coaching_foundation (composite FKs, archive CHECK, RESTRICT) | KEEP | dropped live constraint `ctp_parameter_workspace_fkey` via psql inside the lever command; constraint re-added afterwards (verified in pg_constraint) | rejects a version-parameter reference across workspaces |
| tests/integration/p014-coaching-templates.test.ts | authorization | 88 | 6 | lib/coaching/parameters.ts + templates.ts via lib/auth/rbac.ts parameterDefinitions cell | KEEP | parameterDefinitions `ASSISTANT_COACH: D` -> `c("workspace", "workspace")` at rbac.ts:314 | denies ASSISTANT_COACH all parameter/template access |
| tests/integration/p014-coaching-templates.test.ts | parameter lifecycle | 56 | 3 | lib/coaching/parameters.ts updateParameter, archiveParameter | KEEP | `row.revision !== input.expectedRevision` -> `===` at parameters.ts:725 | rejects stale expectedRevision with zero mutation and zero audit |
| tests/integration/p014-coaching-templates.test.ts | template lifecycle and publish protocol | 327 | 8 | lib/coaching/templates.ts publishTemplate ack/snapshot, saveTemplateDraft, openTemplateDraft | KEEP | `param.revision !== item.acknowledgedParameterRevision` -> `===` at templates.ts:830 | creates/saves/publishes v1 immutably; idempotent publish replay; post-publish display edit never mutates the snapshot; parameter_changed conflict; stale draft revision is a stable conflict; archive is terminal |
| tests/integration/p014-coaching-templates.test.ts | concurrency | 142 | 3 | lib/coaching/templates.ts publishTemplate replay path + lock order | KEEP | `if (row.draft === null)` -> `if (true)` at templates.ts:779 | concurrent publish replay produces one version; overlapping-parameter publishes commit without deadlock |
| tests/integration/p014-coaching-templates.test.ts | audit integrity | 44 | 1 | none (test hand-builds its own prisma.$transaction) | CUT | re-tests the framework: proves Postgres rolls back a hand-made transaction on a forced bad audit insert; no application code runs inside the tx | n/a |
| tests/integration/p014-coaching-templates.test.ts | parameter list pagination | 53 | 2 | lib/coaching/parameters.ts listParameters cursor | KEEP | `if (!anchor)` -> `if (anchor)` at parameters.ts:566 | pages deterministically beyond 25; a foreign or unknown cursor fails closed |
| tests/integration/p014-coaching-templates.test.ts | option tombstones | 46 | 1 | lib/coaching/parameters.ts applyParameterEdits tombstone rule | KEEP | `!liveIds.has(id) \|\| tombstones.has(id)` -> `!liveIds.has(id) && !tombstones.has(id)` at parameters.ts:398 | removed option IDs stay tombstoned across later transactions |
| tests/integration/p022-staff-daily-review.test.ts | list authorization | 128 | 11 | lib/daily-entry/service.ts listStaffDailyEntries scope gate | KEEP | drop `&& ctx.grantedScope !== "assigned"` at service.ts:772 | assigned coach and assistant see the list |
| tests/integration/p022-staff-daily-review.test.ts | list consent and paging | 102 | 4 | lib/daily-entry/service.ts listStaffDailyEntries consent gate + keyset paging | KEEP | `orderBy: { entryDate: "desc" }` -> `"asc"` at service.ts:801 (kept on paging/cursor/zero-audit coverage; the consent-missing test alone would not justify it under D12) | newest-first bounded keyset pagination |
| tests/integration/p022-staff-daily-review.test.ts | detail authorization and minimization | 189 | 8 | lib/daily-entry/service.ts readStaffDailyEntryDetail scope gate + snapshot render | KEEP | drop `&& ctx.grantedScope !== "assigned"` at service.ts:914 | assigned coach + assistant read the detail |
| tests/integration/p022-staff-daily-review.test.ts | detail audit atomicity | 73 | 3 | lib/daily-entry/service.ts readStaffDailyEntryDetailTx audit write | KEEP | `meta: { changed: false }` -> `{ changed: true }` at service.ts:1078 | one committed detail read writes exactly one structural READ audit |
| tests/integration/p022-staff-daily-review.test.ts | serialization races | 184 | 5 | lib/daily-entry/service.ts readStaffDailyEntryDetail locked member/assignment/consent protocol | KEEP | `member.status !== "ACTIVE"` -> `!== "SUSPENDED"` at service.ts:896 | a committed read serializes before a later removal (no torn state) |
| tests/integration/p022-staff-daily-review.test.ts | query bounds | 32 | 1 | lib/daily-entry/service.ts readStaffDailyEntryDetailTx query count | KEEP | inserted a per-value findMany loop before service.ts:1049 (simulated N+1) | detail read stays bounded (no per-value N+1) |
| tests/integration/p023-onboarding-submission.test.ts | migration contract | 113 | 3 | db/migrations 20261010000000_p023_onboarding_submissions (composite FKs, kind/column CHECK, uniques) | KEEP | dropped live constraint `onboarding_submission_answer_kind_value_ck` via psql inside the lever command; CHECK re-added afterwards | rejects answers violating the kind<->column CHECK |
| tests/integration/p023-onboarding-submission.test.ts | submit transaction | 192 | 5 | lib/onboarding/submissions.ts submitOnboardingAssignment | KEEP | `if (f.required)` -> `if (!f.required)` at submissions.ts:293 | all 5 block tests (first submit, valid replay, malformed/oversized replay, concurrent double-submit, audit failure rollback) |
| tests/integration/p023-onboarding-submission.test.ts | authorization + non-disclosure | 97 | 3 | lib/onboarding/submissions.ts member role check + authorize | KEEP | `member.role !== "CLIENT"` -> `!== "COACH"` at submissions.ts:515 | cancelled/superseded terminal assignments refuse |
| tests/integration/p023-onboarding-submission.test.ts | consent boundary | 54 | 3 | lib/onboarding/submissions.ts checkRequiredConsent, submissions-boundary | CUT | block's only distinguishing coverage is the consent gate; consent rules parked under D12; the bounded-metadata piece duplicates own reads | n/a |
| tests/integration/p023-onboarding-submission.test.ts | pinned-version integrity | 44 | 1 | lib/onboarding/submissions.ts pinned formVersion lookup | KEEP | `findUnique(id)` -> `findFirst(formId orderBy versionSeq desc)` at submissions.ts:610 | submits against the pinned version even after a later publication |
| tests/integration/p023-onboarding-submission.test.ts | own reads | 61 | 2 | lib/onboarding/submissions.ts listOwnOnboardingAssignments, renderSubmittedAnswers | KEEP | `.join(", ")` -> `.join(",")` at submissions.ts:~818 | fillable -> submitted -> submitted detail round-trips own answers |
| tests/integration/p023-onboarding-submission.test.ts | boundary gate | 33 | 1 | lib/onboarding/submissions-boundary.ts gated() flag check | KEEP | `return isOnboardingSubmissionEnabled(...)` -> `return true` at submissions-boundary.ts:74 | flag-off returns feature-off before any DB work |
| tests/integration/p023-onboarding-submission.test.ts | repair A - trusted dev/test consent boundary (real path) | 73 | 4 | lib/onboarding/submission-consent.ts env-classified dev consent registry | CUT | exists to prove the dev/test-only consent registry fails closed in production; consent-policy enforcement parked under D12 | n/a |
| tests/integration/p023-onboarding-submission.test.ts | repair B - consent precedes answer materialization | 50 | 2 | lib/onboarding/submissions.ts loadOwnOnboardingDetail consent ordering | CUT | only asserts consent ordering before answer materialization; parked under D12 | n/a |
| tests/integration/p023-onboarding-submission.test.ts | repair C - P2002 fully-authorized replay | 168 | 7 | lib/onboarding/submissions.ts unique-violation re-entry | KEEP | `if (!isUniqueViolation(error)) throw error` -> `if (isUniqueViolation(error)) throw error` at submissions.ts:692 | forced conflict -> bounded re-entry returns already_submitted; membership suspended/removed at the conflict; consent withdrawn at the conflict; vanished-source conflict resubmits; persistent conflict exhausts safely |
| tests/integration/phase-1-1-daily-tracker-guard.test.ts | Phase 1.1 Daily Tracker route guard (real PG) | 113 | 2 | lib/auth/route-guard.ts requireDailyTrackerAccess | KEEP | `session` -> `null` in the authorizeCollection call, route-guard.ts:94 | allows every role with a granted dailyTracking read scope |
| tests/integration/phase-2-2-exercise-import.test.ts | Phase 2.2 Exercise catalog import (real PG) | 338 | 8 | lib/exercise/import.ts importExerciseCatalog, lib/exercise/search.ts | KEEP | `previous !== record.rowFingerprint` -> `previous === record.rowFingerprint`, import.ts:107 | idempotent identical re-run changes and inserts nothing; updates only rows whose fingerprint changed |
| tests/integration/phase-3-2-password-reset.test.ts | Phase 3.2 password-reset boundary (real PG) | 305 | 6 | lib/auth/password-reset.ts resetPasswordWithToken, lib/auth/password-reset-boundary.ts | KEEP | `sessionVersion: { increment: 1 }` -> `increment: 0`, password-reset.ts:365 | successful reset (password changed, token consumed, sv +1, audit atomic); reused/expired/revoked/malformed/wrong-purpose tokens fail identically |
| tests/unit/guard.test.ts | authorize — default deny | 143 | 7 | lib/auth/guard.ts authorize | KEEP | `if (user.status !== "ACTIVE")` -> `if (false)`, guard.ts:251 | denies INVITED/DEACTIVATED users |
| tests/unit/guard.test.ts | authorize — scopes | 243 | 7 | lib/auth/guard.ts authorize (own/assigned/client checks) | KEEP | `client.userId !== userId` -> `client.userId === userId`, guard.ts:311 | own scope requires matching ClientProfile.userId and workspace |
| tests/unit/guard.test.ts | authorize — PD29 platform-admin dual-role on onboardingFormTemplates | 129 | 8 | lib/auth/guard.ts PLATFORM_ADMIN_DENIED_RESOURCES | KEEP | removed `"onboardingFormTemplates"` from the deny-set, guard.ts:133 | dual-role PLATFORM_ADMIN + ACTIVE WORKSPACE_OWNER/COACH denied read AND write, both collection-path cases |
| tests/unit/guard.test.ts | CLIENT-TASKS-I1 (decision 109) — platform-admin deny-set | 42 | 5 | lib/auth/guard.ts PLATFORM_ADMIN_DENIED_RESOURCES | KEEP | removed `"clientTasks"` from the deny-set, guard.ts:158 | denies PLATFORM_ADMIN with ACTIVE workspace-owner/assigned-coach/assistant/client member on clientTasks (4 of 5) |
| tests/unit/guard.test.ts | HABITS-I1 (decision 110) — platform-admin deny-set | 42 | 5 | lib/auth/guard.ts PLATFORM_ADMIN_DENIED_RESOURCES | KEEP | removed `"habits"` from the deny-set, guard.ts:162 | denies PLATFORM_ADMIN with ACTIVE members on habits (4 of 5) |
| tests/unit/guard.test.ts | SOLO-COACH-I1 (decision 111) — platform-admin deny-set: clientAssignments | 71 | 6 | lib/auth/guard.ts PLATFORM_ADMIN_DENIED_RESOURCES | KEEP | removed `"clientAssignments"` from the deny-set, guard.ts:167 | denies PLATFORM_ADMIN + ACTIVE workspace-owner on clientAssignments (read + write + collection) |
| tests/unit/habits-date.test.ts | parseHabitStartDate | 44 | 4 | lib/habits/date.ts parseHabitStartDate | KEEP | `canonical < today` -> `canonical <= today`, date.ts:89 | accepts today and future dates up to today+5y; leap-day today normalizes the horizon to Mar-01 |
| tests/unit/habits-date.test.ts | parseHabitEndDate | 24 | 2 | lib/habits/date.ts parseHabitEndDate | KEEP | `canonical < opts.startDate` -> `canonical <= opts.startDate`, date.ts:105 | accepts null and dates >= startDate within the horizon |
| tests/unit/habits-date.test.ts | parseWeekdayMask — caller zero-mask rejection | 14 | 3 | lib/habits/date.ts parseWeekdayMask | KEEP | `input < WEEKDAY_MASK_MIN` -> `input <= WEEKDAY_MASK_MIN`, date.ts:116 | accepts integers 1..127 |
| tests/unit/habits-date.test.ts | weekday bits (Mon=bit0 .. Sun=bit6) | 13 | 2 | lib/habits/date.ts weekdayBit, maskCoversDate | KEEP | `dow === 0 ? 6 : dow - 1` -> `dow === 0 ? 5 : dow - 1`, date.ts:126 | maps known dates to ISO weekday bits; maskCoversDate applies the mask |
| tests/unit/habits-date.test.ts | shiftDateUtc + serverTodayUtc (UTC-pinned) | 27 | 2 | lib/habits/date.ts shiftDateUtc | KEEP | `d + days` -> `d - days`, date.ts:57 | shifts across month/year and leap boundaries |
| tests/unit/habits-date.test.ts | habitPeriodDays | 16 | 2 | lib/habits/date.ts habitPeriodDays | KEEP | `PERIOD_DAYS[period] ?? null` -> `?? 0`, date.ts:147 | rejects unknown periods |
| tests/unit/habits-date.test.ts | formatHabitDate — timezone-independent display | 6 | 1 | lib/habits/date.ts formatHabitDate | KEEP | `timeZone: "UTC"` -> `timeZone: "America/New_York"`, date.ts:159 | formats the declared date pinned to UTC |
| tests/unit/invite-acceptance.test.ts | getInviteLinkState (non-consuming peek) | 62 | 3 | lib/workspace/invite-acceptance.ts getInviteLinkState | KEEP | `!peek.valid \|\| peek.purpose !== "WORKSPACE_INVITE"` -> `!peek.valid`, invite-acceptance.ts:52 | returns invalid for every non-active or foreign shape |
| tests/unit/invite-acceptance.test.ts | acceptInvitationMessage (safe error mapping) | 55 | 3 | lib/workspace/invite-acceptance.ts acceptInvitationMessage | KEEP | `if (error instanceof InvitationError)` -> `if (!(error instanceof InvitationError))`, invite-acceptance.ts:125 | maps token failures to one generic invalid-link message; explains identity and policy failures; never echoes internals |
| tests/unit/onboarding-draft-editor.dom.test.tsx | DraftEditor — mount surface + client-local edit contract | 23 | 2 | components/onboarding/draft-editor.tsx updateName | KEEP | `({ ...prev, name, dirty: true })` -> `dirty: false`, draft-editor.tsx:116 | a metadata edit arms dirty and enables save (also failed 6 tests in sibling blocks) |
| tests/unit/onboarding-draft-editor.dom.test.tsx | DraftEditor — props reseed through the real component | 58 | 3 | components/onboarding/state.ts reseedDraftState | KEEP | `local.dirty \|\| incoming.revision < local.revision` -> `incoming.revision < local.revision`, state.ts:73 | preserves dirty local edits when NEWER server props arrive |
| tests/unit/onboarding-draft-editor.dom.test.tsx | DraftEditor — save wiring | 321 | 10 | components/onboarding/draft-editor.tsx save + state.ts adoptSavedResult | KEEP | `state.fields.map(toPayloadField)` -> `state.fields`, draft-editor.tsx:212 | cleared helpText saves as a normalized omission |
| tests/unit/onboarding-draft-editor.dom.test.tsx | DraftEditor — field structure ops (DOM-visible) | 122 | 12 | components/onboarding/state.ts addDraftField, draft-editor.tsx structure ops | KEEP | `{ options: [{ label: "" }] }` -> `{ options: [{ label: "pre-filled" }] }`, state.ts:117 | adding singleChoice via the real control renders exactly one blank option row; singleChoice and multiChoice add rows |
| tests/unit/onboarding-draft-editor.dom.test.tsx | DraftEditor — structure-ops payload subset (deferred to ES-3) | 113 | 4 | components/onboarding/draft-editor.tsx removeField/moveFieldUp reindex | KEEP | `order: i` -> `order: i + 10` in the removeField reindex, draft-editor.tsx:127 | remove+add keeps contiguous orders and surviving ids; move+remove keeps option values AND optionIds |
| tests/unit/onboarding-draft-editor.dom.test.tsx | DraftEditor — lifecycle controls | 190 | 7 | components/onboarding/draft-editor.tsx publish/archive | KEEP | `disabled={pending \|\| state.dirty}` -> `disabled={pending}` on publish, draft-editor.tsx:435 | publish enabled on clean mount, disabled while dirty, re-enabled after save |
| tests/unit/onboarding-draft-editor.dom.test.tsx | OpenDraftButton — reopen surface | 45 | 2 | components/onboarding/open-draft-button.tsx reopen | KEEP | `openDraft(workspaceId, formData)` -> `openDraft(workspaceId, new FormData())`, open-draft-button.tsx:51 | issues openDraft exactly once with formId |
| tests/unit/onboarding-forms.test.ts | P-008 validation — definition bounds | 168 | 6 | lib/onboarding/forms.ts validateDefinition | KEEP | `labelMax: 200` -> `labelMax: 201`, forms.ts:51 | rejects over-limit fields, labels, help text, options, names |
| tests/unit/onboarding-forms.test.ts | P-008 validation — field ID trust | 105 | 2 | lib/onboarding/forms.ts validateDefinition (forged-id rule) | KEEP | `if (knownKind === undefined \|\| knownKind !== kind)` -> `if (false)`, forms.ts:167 | round-trips server-issued IDs and rejects forged/removed ones |
| tests/unit/onboarding-forms.test.ts | P-008 boundary — raw payload bound before parse | 27 | 1 | lib/onboarding/forms-boundary.ts saveDraftFromAction | CUT | duplicates the same-named, stronger block in onboarding-forms-boundary.test.ts (same oversized-draftJson rejection plus spy assertions that JSON.parse and the service never ran) | n/a |
| tests/unit/onboarding-forms.test.ts | P-008 RBAC — onboardingFormTemplates | 33 | 2 | lib/auth/rbac.ts resolveScope matrix row | KEEP | `COACH: c("workspace", "workspace")` -> `COACH: D` in the onboardingFormTemplates row, rbac.ts:275 | owner and coach have workspace read/write; others denied (the second test, FIELD_KINDS length 6, is a constant pin) |
| tests/unit/onboarding-forms.test.ts | P-008 seam — app never imports the service | 20 | 1 | none (scans app/** source text for a forbidden import specifier) | CUT | static source scan; calls no code under test. Lead adjudication: worker recorded KEEP via an injected-import mutation, but this is the identical architecture-lint pattern CUT in checkin-forms (this lane) and in both pass-1 boundary-imports files | n/a |
| tests/unit/password-policy.test.ts | S1-F2B password policy | 102 | 10 | lib/password-policy.ts validatePasswordPolicy, lib/password.ts | KEEP | `PASSWORD_MIN_CODE_POINTS = 10` -> `= 11`, password-policy.ts:23 | accepts exactly 10 and exactly 128 code points; counts code points not UTF-16 units; NFC-normalizes; imposes no composition rules (plus 3 failures in the next block). Note: "bounds are the approved values" is a constant pin riding inside a biting block |
| tests/unit/password-policy.test.ts | P3.1+P3.2 setup password policy | 42 | 5 | lib/password-policy.ts validatePasswordSetup | KEEP | `/[0-9]/` -> `/[0-9]{2}/` in the digit check, password-policy.ts:63 | accepts a >=10-code-point password containing a digit; still NFC-normalizes first |
| tests/unit/password-policy.test.ts | hash boundary normalization | 10 | 1 | lib/password.ts hashPassword | KEEP | `derive(password.normalize("NFC"), ...)` -> `derive(password, ...)`, password.ts:47 | hashPassword canonicalizes even when called without the policy |
| tests/integration/s1-f2b-token-cleanup.test.ts | S1-F2B token cleanup (real PostgreSQL) | 210 | 5 | lib/tokens/store.ts cleanupTerminalAccessTokens + CLEANUP_VICTIMS_SQL | KEEP | `}) < $1` -> `}) > $1` in lib/tokens/store.ts:332 (victim predicate inverted) | deletes only terminal rows older than 30 days; batch bound removes exactly 1000 per call; concurrent calls safe |
| tests/integration/s1-f2d-password-reset.test.ts | S1-F2D password-reset orchestration (real PG) | 650 | 18 | lib/auth/password-reset.ts requestPasswordReset / resetPasswordWithToken, real Auth.js | KEEP | `if (!current \|\| current.status !== "ACTIVE") return null;` -> `if (!current) return null;` at password-reset.ts:223 | INVITED and DEACTIVATED accounts -> ACCOUNT_EXISTS, no token/audit; user deactivated mid-request fails closed |
| tests/integration/s1-h-route-guard.test.ts | S1-H route guard (real PG) | 190 | 6 | lib/auth/route-guard.ts resolveWorkspaceAccess, requireWorkspaceAccess, listSessionWorkspaces, getAuthorizedWorkspaceSummary | KEEP | `ctx === null` -> `ctx !== null` at route-guard.ts:76 (deny/allow mapping inverted) | requireWorkspaceAccess throws on denial, returns context on allow; getAuthorizedWorkspaceSummary reads the authorized workspace name |
| tests/unit/password-reset-token-failure.test.ts | safeTokenHash classification | 40 | 1 | lib/auth/password-reset.ts safeTokenHash | KEEP | `if (error instanceof TokenError)` -> `if (error instanceof PasswordResetError)` at password-reset.ts:416 | TokenError -> invalid_token; unexpected failure -> reset_failed |
| tests/unit/redact.test.ts | redactSheet | 69 | 6 | lib/extraction/redact.ts redactSheet | KEEP | `{ ...cell, text: placeholder }` -> `{ ...cell }` at redact.ts:182 | redacts person-specific values and replaces text with the placeholder |
| tests/unit/redact.test.ts | MENSES cycle-phase guide (source-aware region) | 28 | 2 | lib/extraction/redact.ts mensesGuideRegion usage in redactSheet | KEEP | `slug === "menses" ? mensesGuideRegion(cells) : null` -> `null` at redact.ts:150 | keeps the full guide block |
| tests/unit/redact.test.ts | isSafeCellText | 27 | 3 | lib/extraction/redact.ts isSafeCellText | KEEP | `if (SAFE_SHEETS.has(slug)) return true;` -> `return false;` at redact.ts:126 | treats reference databases as safe but still blocks contacts |
| tests/unit/redact.test.ts | sortRedactions | 34 | 1 | lib/extraction/redact.ts sortRedactions | KEEP | row asc -> row desc comparator at redact.ts:206 | orders deterministically by artifact, row, col, category |
| tests/unit/sheet-viewer-gate.test.ts | isSheetViewerEnabled | 9 | 1 | lib/sheet-viewer.ts isSheetViewerEnabled | KEEP | `return env === "1";` -> `return env !== "1";` at sheet-viewer.ts:9 | disabled unless the flag is exactly 1 |
| tests/unit/sheet-viewer-gate.test.ts | requireSheetViewer (fail-closed gate used by the pages) | 10 | 2 | lib/sheet-viewer.ts requireSheetViewer | KEEP | `if (!isSheetViewerEnabled(env)) notFound();` -> `if (isSheetViewerEnabled(env))` at sheet-viewer.ts:14 | throws (notFound) when disabled; does not throw when enabled |
| tests/unit/source-config.test.ts | resolveSheetsSourceDir | 11 | 2 | lib/extraction/source.ts resolveSheetsSourceDir | KEEP | `value.length > 0 ? value : DEFAULT` -> `? DEFAULT : value` at source.ts:32 | defaults to the supplied exports folder; honors an explicit override |
| tests/unit/source-config.test.ts | isInsideRepo | 7 | 1 | lib/extraction/source.ts isInsideRepo | KEEP | `rel === "" \|\| (!rel.startsWith("..") && !isAbsolute(rel))` -> `rel === "";` at source.ts:38 | detects paths inside, equal to, and outside the repo root |
| tests/unit/source-config.test.ts | isPathGitIgnored | 6 | 1 | lib/extraction/source.ts isPathGitIgnored | KEEP | `return true;` -> `return false;` at source.ts:112 | recognizes ignored raw paths and rejects committed spec output |
| tests/unit/source-config.test.ts | assertRawDirIsIgnored | 11 | 2 | lib/extraction/source.ts assertRawDirIsIgnored | KEEP | `if (!ignored) {` -> `if (ignored) {` at source.ts:131 | accepts an ignored raw destination; fails closed for a non-ignored one |
| tests/unit/source-config.test.ts | validateSheetsSourceDir | 61 | 5 (1 skipped) | lib/extraction/source.ts validateSheetsSourceDir | KEEP | `if (isInsideRepo(resolved, repoRoot))` -> `if (!isInsideRepo(...))` at source.ts:61 | rejects a source dir inside the repository; reports all sheets missing in an empty dir; flags a differently-named file that slugs to a known sheet |
| tests/unit/storage.test.ts | S1-G storage port | 90 | 30 | lib/storage.ts clientObjectPrefix, assertClientObjectKey, assertPresignGetTtl, nullObjectStorage, assertObjectStorageExternallyExposable | KEEP | `ttlSeconds > maxTtlSeconds` -> `ttlSeconds >= maxTtlSeconds` at storage.ts:107 | assertPresignGetTtl accepts an in-bound positive integer |
| tests/unit/training-payload.test.ts | normalizeTrainingDraft — strictness | 60 | 2 | lib/trainingprogram/payload.ts normalizeTrainingDraft | KEEP | `if (obj.programMode !== "WEEK_BASED")` -> `!== "WEEK_BASEDD"` at payload.ts:259 | accepts a minimal valid draft |
| tests/unit/training-payload.test.ts | normalizeFieldConfig | 21 | 1 | lib/trainingprogram/payload.ts normalizeFieldConfig | KEEP | `out[k] = v === true;` -> `out[k] = v === false;` at payload.ts:81 | accepts subsets, rejects unknown keys and non-booleans |
| tests/unit/training-payload.test.ts | materializeWeeks — override-boundary resolution (P4 §3) | 71 | 7 | lib/trainingprogram/payload.ts materializeWeeks via resolveBoundary | KEEP | `if (w <= week && w > best) best = w;` -> `if (w < week && w > best)` at payload.ts:437 | required counterexample 3,3,3,6,6,5,5; equal-valued override protects the week; absence boundaries; session/exercise order; weekCount shrink truncates |
| tests/unit/training-payload.test.ts | validatePublishCompleteness | 61 | 1 | lib/trainingprogram/payload.ts validatePublishCompleteness | KEEP | `if (cfg.sets && ex.sets === undefined)` -> `ex.sets !== undefined` at payload.ts:562 | requires >=1 exercise; sets/reps required only when toggled |
| tests/unit/training-payload.test.ts | projectForClient — hidden fields never serialize (P4 §6) | 24 | 1 | lib/trainingprogram/payload.ts projectForClient | KEEP | `if (k === "catalogItemId" \|\| enabled.has(k))` -> `\|\| !enabled.has(k)` at payload.ts:592 | disabled-field values are omitted; retained values stay in storage |
| tests/unit/training-payload.test.ts | canonicalDraftContent — `changed` marker identity (G) | 22 | 1 | lib/trainingprogram/payload.ts canonicalDraftContent | KEEP | `confirmedTimezone: input.confirmedTimezone,` -> `confirmedTimezone: null,` at payload.ts:642 | covers the complete draft including confirmedTimezone |
| tests/unit/training-payload.test.ts | week math under the immutable anchor | 24 | 3 | lib/trainingprogram/weeks.ts weekStartInstant/addDays, weekIndex, boundaryInstant, ceiling | KEEP | `addDays(startDate, 7 * (week - 1))` -> `addDays(startDate, 7 * week)` at weeks.ts:92 | weekIndex and boundary instants are pure local-date arithmetic |
| tests/unit/training-payload.test.ts | gvAt / governed spans (P8 §5) | 65 | 3 | lib/trainingprogram/weeks.ts gvAt | KEEP | `if (v.activationInstant.getTime() > t.getTime()) continue;` -> `>= t.getTime()` at weeks.ts:156 | activation exactly at t is eligible (inclusive boundary) |
| tests/unit/training-payload.test.ts | versionForWeek + marker (P8 §5.2/§5.4) | 66 | 2 | lib/trainingprogram/weeks.ts weekMarker | KEEP | `if (base === null \|\| candidates.length === 0) return null;` -> `if (base === null) return null;` at weeks.ts:285 | mid-week revision labelled updated/updates; first publish never |

## Per-file verdicts

- tests/integration/habits-schema.test.ts: KEEP-ALL
- tests/integration/i4-next-checkin.test.ts: KEEP-ALL
- tests/integration/p008-onboarding-forms.test.ts: KEEP-ALL
- tests/integration/p014-coaching-templates.test.ts: TRIM (keep all blocks except `audit integrity`)
- tests/integration/p022-staff-daily-review.test.ts: KEEP-ALL
- tests/integration/p023-onboarding-submission.test.ts: TRIM (keep all blocks except `consent boundary`, `repair A`, `repair B`)
- tests/integration/phase-1-1-daily-tracker-guard.test.ts: KEEP-ALL
- tests/integration/phase-2-2-exercise-import.test.ts: KEEP-ALL
- tests/integration/phase-3-2-password-reset.test.ts: KEEP-ALL
- tests/integration/s1-f2b-token-cleanup.test.ts: KEEP-ALL
- tests/integration/s1-f2d-password-reset.test.ts: KEEP-ALL
- tests/integration/s1-h-route-guard.test.ts: KEEP-ALL
- tests/unit/checkin-calendar.test.ts: KEEP-ALL
- tests/unit/checkin-forms.test.ts: TRIM (keep: shared resolver, RBAC checkinFormDefinitions, dual-role PLATFORM_ADMIN denial, validateCheckInDefinition)
- tests/unit/checkin-tracker-context.test.ts: KEEP-ALL
- tests/unit/client-roster.test.ts: TRIM (keep: parseRosterQuery cursor c, parseRosterQuery history p, roster pagination hrefs)
- tests/unit/client-setup-boundary.test.ts: KEEP-ALL
- tests/unit/client-setup-selection.test.ts: KEEP-ALL
- tests/unit/client-setup.test.ts: TRIM (keep: P-016 client-setup dev gate)
- tests/unit/coaching-nav.dom.test.tsx: KEEP-ALL
- tests/unit/coaching-parameters.test.ts: KEEP-ALL
- tests/unit/credentials.test.ts: KEEP-ALL
- tests/unit/crosssheet.test.ts: KEEP-ALL
- tests/unit/dashboard-autosave.test.ts: KEEP-ALL
- tests/unit/guard.test.ts: KEEP-ALL
- tests/unit/habits-date.test.ts: KEEP-ALL
- tests/unit/invite-acceptance.test.ts: KEEP-ALL
- tests/unit/onboarding-draft-editor.dom.test.tsx: KEEP-ALL
- tests/unit/onboarding-forms.test.ts: TRIM (keep: definition bounds, field ID trust, RBAC; cut: raw payload bound before parse, seam)
- tests/unit/password-policy.test.ts: KEEP-ALL
- tests/unit/password-reset-token-failure.test.ts: KEEP-ALL
- tests/unit/redact.test.ts: KEEP-ALL
- tests/unit/sheet-viewer-gate.test.ts: KEEP-ALL
- tests/unit/source-config.test.ts: KEEP-ALL
- tests/unit/storage.test.ts: KEEP-ALL
- tests/unit/training-payload.test.ts: KEEP-ALL

## Lead spot-check (independent re-runs in the TB0 lead worktree + app_tb_tb0)

KEEP mutations re-run by the lead, all failed the claimed block's own tests:

- w1: tracker-context `||` -> `&&` (3 failures), client-setup-selection
  `fingerprint === null` -> `undefined` (1 failure), i4-next-checkin
  dueAt asc -> desc (2 failures, the two claimed tests)
- w2: credentials `!== "ACTIVE"` -> `===` (3 failures), autosave
  `slot.dirty = true` -> `false` (2 failures), p022 entryDate desc -> asc
  (1 failure, "newest-first bounded keyset pagination")
- w3: habits-date `canonical < today` -> `<=` (2 failures), password-policy
  MIN_CODE_POINTS 10 -> 11 (8 failures), phase-3-2 sessionVersion
  increment 1 -> 0 (2 failures)
- w4: sheet-viewer `env === "1"` -> `!==` (3 failures), storage `>` -> `>=`
  (1 failure), s1-f2b `}) < $1` -> `> $1` (3 failures)

CUT calls re-judged by the lead by reading every cut block: all 8 hold.
w2's two live-DB mutations verified restored (both constraints present in
pg_constraint afterwards). One adjudication: the onboarding-forms seam block
was flipped KEEP -> CUT for consistency (static source scan, no code under
test; identical pattern was cut by w1 and twice in pass 1).

## Could not check

None. All 36 files ran a green baseline and every block was judged.

## Self-check

- (a) Every file in `TB0.txt` has its blocks listed: 36 files, 116 blocks
  (w1: 23, w2: 35, w3: 33, w4: 25). PASS.
- (b) Every KEEP block has a mutation that failed at least one of its own
  tests: 107 KEEP rows each name a lever-run mutation and the failed tests;
  the lead re-ran 12 of them (3+ per worker, both unit and integration) and
  re-judged all 8 CUT calls by reading. PASS.
- (c) Worktrees and databases removed, nothing left running: `git worktree
  remove --force` on TB0 and TB0-w1..w4 (all clean except pre-existing
  npm-ci.log), `dropdb` on app_tb_tb0 and app_tb_tb0_w1..w4 (pg_database
  query confirms gone), process census empty of vitest/vari8-tb processes.
  Lane scratch files (lever.sh, worker brief, file slices) removed. PASS.
- (d) Nothing written outside `icm/03-plan/output/TA/` in the repo: only
  TB0.md and TB0-w1..w4.md. PASS.
