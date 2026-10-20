# Wiring inventory: coach screens

Checkout: /home/nexuslink/vari8-worktrees/beta, branch Vari8-Beta, HEAD 15120f877de3438a63a0e49839aea11774baefe3 (read only).
Canvas: frontend/ (mock data). Backend: app/, lib/, db/schema.prisma. Brief: spec/core-coaching-system-brief.html. Plan: icm/03-plan/output/PLAN.md.
Table columns: item | brief id | canvas file:line | backend file:line or MISSING | gap note. Unverified claims are marked UNVERIFIED.

Status: complete. 26 screens, 205 gaps. Rows were produced by seven read-only sub-agents and merged here; 2 or more rows per table were spot-checked against the code (marked "spot-checked").

## Facts that apply to every screen

- Schema has 48 models (db/schema.prisma:124-1843). There is no Note, CoachTask/Todo, Message, Conversation, Media/Attachment, Goal, Preference, Appearance or Branding model. Spot-checked by listing every `^model` line.
- ClientProfile (db/schema.prisma:293-334) carries name and timestamps; the roster service returns only id, workspaceId, name, createdAt, updatedAt (lib/workspace/clients.ts:44-50) ordered by id (lib/workspace/clients.ts:241).
- Guards: requireSessionUser (lib/auth/route-guard.ts:185), requireWorkspaceAccess (route-guard.ts:70), requireDailyTrackerAccess (route-guard.ts:87), requireClientSetupAccess (route-guard.ts:139); services re-authorize in-transaction via the RBAC matrix (lib/auth/rbac.ts) and resolveScope (rbac.ts:443).
- Canvas state: one local store (frontend/src/components/coach/store.tsx, seedState in model.ts). PR-W0 splits it per domain (icm/03-plan/output/PLAN.md:1456).
- TrainingSessionBooking (db/schema.prisma:1843) is KEPT but FLAGGED. No coach canvas screen draws bookings. It could appear on the check-in calendar or the training tab later; not proposed for removal.

## Screen 1: Roster (ClientsWorkspace)

Canvas: frontend/src/components/coach/clients.tsx:51-292. Backend page: app/workspace/[workspaceId]/clients/page.tsx.

| item                                                            | brief id | canvas file:line           | backend file:line or MISSING                                                                                  | gap note                                                                                                               |
| --------------------------------------------------------------- | -------- | -------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Roster list of client profiles                                  | W01      | clients.tsx:65-92          | app/workspace/[workspaceId]/clients/page.tsx:57-61; lib/workspace/clients.ts:215 listAccessibleClientProfiles | Returns id/name/timestamps only (clients.ts:44-50); no label, phase, week, template or attention fields                |
| Search (name, label, phase, template)                           | W01      | clients.tsx:115-119, 68-73 | MISSING                                                                                                       | lib/workspace/roster-query.ts:42-65 parses only cursors; planned PR-SV1 (PLAN.md:1178)                                 |
| Filter All / Needs attention / Unread                           | W01, W02 | clients.tsx:120-125, 75-81 | MISSING                                                                                                       | No attention or unread data server-side                                                                                |
| Sort Name / Attention / Next check-in                           | W01      | clients.tsx:126-131, 82-90 | MISSING                                                                                                       | findMany orderBy id asc (clients.ts:241, spot-checked)                                                                 |
| Table / Cards toggle                                            | W01      | clients.tsx:132-147        | n/a (UI)                                                                                                      | Backend table at page.tsx:175                                                                                          |
| Row name + label                                                | W03      | clients.tsx:194-195        | name db/schema.prisma:297; label MISSING                                                                      | No label column on ClientProfile                                                                                       |
| Row avatar                                                      | W03      | clients.tsx:192            | MISSING                                                                                                       | No avatar field on ClientProfile or User                                                                               |
| Row phase + week                                                | W03      | clients.tsx:199-201        | MISSING                                                                                                       | No phase/week columns; PR-M0 schema v2 (PLAN.md:613) UNVERIFIED as adding them                                         |
| Row assigned template + tab count                               | W03, W10 | clients.tsx:203-210        | ClientSetup db/schema.prisma:917; CoachingTemplate :818                                                       | Roster query does not join ClientSetup                                                                                 |
| Row next check-in                                               | W02, W06 | clients.tsx:43-50, 213-215 | CheckInInstance.dueAt db/schema.prisma:1285                                                                   | Data exists, not surfaced; PR-SV1 read model (PLAN.md:1164-1178)                                                       |
| Row attention signals (awaiting feedback, unread, overdue task) | W02      | clients.tsx:57-63, 218-239 | partial: CheckInSubmission :1337, CheckInReview :1403, ClientTask :1560                                       | Unread MISSING (no Message model); no composed read; lib/workspace/attention.ts planned (PLAN.md:1172), does not exist |
| "Up to date" empty state                                        | W02      | clients.tsx:236-238        | MISSING                                                                                                       | Depends on attention read                                                                                              |
| Card coachingSince                                              | W03      | clients.tsx:271            | MISSING                                                                                                       | No start-date column                                                                                                   |
| Archived clients hidden                                         | W01      | clients.tsx:70             | MISSING                                                                                                       | No archivedAt on ClientProfile; PR-M1 archive/restore (PLAN.md:732)                                                    |
| Pagination (backend only)                                       | n/a      | none                       | lib/workspace/roster-query.ts:16, 85-105                                                                      | Canvas has no pager; backend 25/page cursor                                                                            |

Auth/role: requireSessionUser (route-guard.ts:185) then authorizeCollection for clientProfiles/read (lib/workspace/clients.ts:220-228): owner workspace scope, coach/assistant ACTIVE assignments (clients.ts:104-121).
Owning wave: PR-W2 (PLAN.md:1505), depends on PR-SV1 (PLAN.md:1164). Gaps: 11.

## Screen 2: Client profile / 360 header and tabs

Canvas: clients.tsx:293-981 (ClientProfile, ExtraDateDialog). Backend: no clients/[clientProfileId]/page.tsx landing page exists; only subpages checkins, coaches, daily, dashboard, meal-plan, onboarding, training-program (app/workspace/[workspaceId]/clients/[clientProfileId]/). readClientProfile (lib/workspace/clients.ts:251) returns name + timestamps.

| item                                            | brief id      | canvas file:line                  | backend file:line or MISSING                                                                                                                                                                             | gap note                                                                                                                                    |
| ----------------------------------------------- | ------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Header name, label, phase, week                 | W03           | clients.tsx:331-332               | name db/schema.prisma:297                                                                                                                                                                                | label/phase/week MISSING                                                                                                                    |
| Email                                           | W03           | clients.tsx:357                   | User.email db/schema.prisma:126 via ClientProfile.userId :296                                                                                                                                            | Not exposed by readClientProfile                                                                                                            |
| coachingSince                                   | W03           | clients.tsx:359                   | MISSING                                                                                                                                                                                                  | No column (brief W03 asks for start date)                                                                                                   |
| heightCm                                        | W03           | clients.tsx:360                   | MISSING                                                                                                                                                                                                  | No column                                                                                                                                   |
| Current bodyweight                              | W03           | clients.tsx:397-398               | DailyEntry db/schema.prisma:1001                                                                                                                                                                         | No latest-value read for profile                                                                                                            |
| Assigned template summary                       | W03, W10      | clients.tsx:401-416               | ClientSetup :917, CoachingTemplateVersion :847; lib/coaching/client-setup.ts                                                                                                                             | Canvas stores template snapshot, backend pins a version id; display plumbing UNVERIFIED                                                     |
| Preview assigned tool                           | W10           | clients.tsx:419-422, 748-754      | MISSING as client preview                                                                                                                                                                                | PR-W3 (PLAN.md:1557)                                                                                                                        |
| Assign / change template inline                 | W10           | clients.tsx:755-805, 815-881      | lib/coaching/client-setup.ts:539 createClientSetupAssignment; client-setup-transition.ts                                                                                                                 | Shape mismatch (snapshot vs version pin)                                                                                                    |
| Recurring check-in weekdays, effective tomorrow | W06           | clients.tsx:449-489; model.ts:627 | CheckInScheduleRule db/schema.prisma:1483 (one weekday per row :1488, localTimeMinutes, timezone); createCheckInRuleAction app/workspace/[workspaceId]/clients/[clientProfileId]/checkins/actions.ts:601 | Canvas weekday array vs backend one rule per weekday with time + IANA zone; canvas has no time or zone input                                |
| Additional dates + Add date dialog              | W06           | clients.tsx:490-519, 883-981      | CheckInInstance :1285; scheduleCheckInInstanceAction checkins/actions.ts:81; cancelCheckInInstanceAction :150                                                                                            | note field MISSING; Full/Custom must map to a formId; duplicate guard matches unique key db/schema.prisma:1326 (spot-checked)               |
| Priority messages toggle                        | W08, M04      | clients.tsx:522-530               | MISSING                                                                                                                                                                                                  | No permission column (grep "priority" in schema: none)                                                                                      |
| Open chat button                                | M01           | clients.tsx:336-350               | MISSING                                                                                                                                                                                                  | No messaging backend                                                                                                                        |
| Submission history + Open review                | W09           | clients.tsx:542-582               | CheckInSubmission :1337, CheckInReview :1403, CheckInFeedback :1432; viewCheckInSubmissionDetail checkins/actions.ts:212                                                                                 | Covered                                                                                                                                     |
| Private coach notes list/add/remove             | W04           | clients.tsx:586-606, 657-663      | MISSING                                                                                                                                                                                                  | No note model; PR-M3 lib/notes (PLAN.md:817-831)                                                                                            |
| General coaching notes                          | W04           | clients.tsx:607-612               | MISSING                                                                                                                                                                                                  | Visibility rule undefined in brief W04                                                                                                      |
| Coach to-dos list/toggle/add                    | W07           | clients.tsx:613-632, 665-671      | MISSING                                                                                                                                                                                                  | No coach-task model; ClientTask is a different scope                                                                                        |
| "Add to" kind select                            | W04, W05, W07 | clients.tsx:633-642               | partial                                                                                                                                                                                                  | Only client-task branch has a backend                                                                                                       |
| Client tasks list/add (due +7d)                 | W05           | clients.tsx:692-731, 673-684      | ClientTask :1560; lib/tasks/service.ts:253 assign, :311 edit, :391 cancel, :583 listStaffClientTasks                                                                                                     | Covered for management                                                                                                                      |
| Coach toggles client task complete              | W05           | clients.tsx:705-721               | lib/tasks/service.ts:487-494                                                                                                                                                                             | CONFLICT: completion is own-scope only, staff rejected (spot-checked); status enum OPEN/COMPLETED/CANCELLED vs canvas open/complete/overdue |
| Onboarding answers                              | W03, W11      | clients.tsx:734-746               | OnboardingSubmission :1103, OnboardingSubmissionAnswer :1143; app/.../clients/[clientProfileId]/onboarding/page.tsx                                                                                      | Covered                                                                                                                                     |
| Archive / restore client                        | W01           | UNVERIFIED in clients.tsx         | MISSING                                                                                                                                                                                                  | PR-M1 (PLAN.md:732)                                                                                                                         |
| Coach assignment (backend only)                 | W03           | not on canvas                     | lib/workspace/clients.ts:429 assignCoach, :543 setPrimaryCoach; app/.../coaches/page.tsx                                                                                                                 | Owner-only backend with no canvas surface                                                                                                   |

Auth/role: subpages use requireSessionUser (route-guard.ts:185) and per-service authorize; coaches page owner-only (lib/workspace/clients.ts:349-361). Missing profile landing route.
Owning wave: PR-W2 (PLAN.md:1505); notes/to-dos PR-W10 (PLAN.md:1907) on PR-M3 (PLAN.md:817); priority/chat PR-MSG (PLAN.md:1406). Gaps: 14.

## Screen 3: Profile habits tab

Canvas: frontend/src/components/coach/habits-tab.tsx. Brief habits rows at spec/core-coaching-system-brief.html:279-281 carry no function id.

| item                             | brief id       | canvas file:line                 | backend file:line or MISSING                               | gap note                                                        |
| -------------------------------- | -------------- | -------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------- |
| Habit name                       | habits (no id) | habits-tab.tsx:169               | Habit.name db/schema.prisma:1608                           | Covered                                                         |
| Frequency                        | habits         | habits-tab.tsx:171; model.ts:660 | HabitSchedule weekdays bitmask db/schema.prisma:1630-1636  | Shape mismatch: free text vs ISO weekday bitmask (spot-checked) |
| Goal                             | habits         | habits-tab.tsx:171               | Habit.target :1609                                         | Covered                                                         |
| Reason                           | habits         | habits-tab.tsx:173               | MISSING                                                    | No column on Habit (db/schema.prisma:1603-1615, spot-checked)   |
| Completion count                 | habits         | habits-tab.tsx:191-193           | HabitLog :1648; lib/habits/service.ts:994 habitConsistency | Derivable                                                       |
| Coach check-off toggle           | habits         | habits-tab.tsx:134-167           | lib/habits/service.ts:714 setHabitLog                      | Logging is client own-scope; coach write path MISSING           |
| Filter All / To do / Done        | habits         | habits-tab.tsx:38-47, 97-109     | listStaffHabits lib/habits/service.ts:827                  | Covered                                                         |
| "Dated history unavailable" copy | habits         | habits-tab.tsx:184-201           | HabitLog stores dated rows :1648                           | Canvas copy contradicts backend capability                      |
| Retired habits                   | habits         | model.ts:649                     | Habit.archivedAt :1612; archiveHabit service.ts:629        | Covered                                                         |

Auth/role: staff habit management at app/workspace/[workspaceId]/clients/[clientProfileId]/dashboard/actions.ts:92-136, re-authorized in lib/habits/service.ts.
Owning wave: PR-W5 (PLAN.md:1657). Gaps: 4.

## Screen 4: Client 360 preview shell

Canvas: frontend/src/components/coach/client-preview.tsx:857-978 (banner 894-907, tabs Dashboard/Tracker/Roadmap/Nutrition/Training/Check-In/Habits 914-926). No single backend equivalent; closest are per-client staff subpages under app/workspace/[workspaceId]/clients/[clientProfileId]/.

| item                                                              | brief id | canvas file:line                                  | backend file:line or MISSING                                          | gap note                                                                                             |
| ----------------------------------------------------------------- | -------- | ------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Banner name/avatar/template                                       | W03      | client-preview.tsx:895-907                        | ClientProfile.name db/schema.prisma:297                               | Avatar MISSING                                                                                       |
| Variant resolution from assignment snapshot                       | W10      | client-preview.tsx:867-869                        | ClientSetupPin :939; CoachingTemplateVersion.definition Json :847-853 | Snapshot vs pinned version Json; mapping UNVERIFIED                                                  |
| Tabs driven by configuration.views + habits                       | W10, T02 | client-preview.tsx:877-887                        | CoachingTemplate.draft Json :826                                      | Draft accepts only title/sections (lib/coaching/templates.ts:150-158); no views slot (see Screen 10) |
| Tracker tab comments state                                        | T04      | client-preview.tsx:172-227                        | MISSING                                                               | No comment model; TrackerComment planned PR-M3 (PLAN.md:629, 817-831)                                |
| Roadmap phase badge + per-week phase select                       | R03      | client-preview.tsx:258-316; roadmap-preview.ts:38 | MISSING                                                               | No phase model                                                                                       |
| Roadmap weekly rows (average, trend, adherence, target vs actual) | R02, R04 | roadmap-preview.ts:39-94                          | MISSING (aggregation); raw values DailyEntryRevisionValue :1069-1088  | No rollup service; no goals table (Screen 24)                                                        |
| Nutrition tab targets + macro ring                                | N02, N06 | client-preview.tsx:383-557                        | MealPlanVersion.payload :1706; lib/mealplan/payload.ts:46-51          | Ring is derived math; decision 115 "nothing is calculated" (see Screen 15)                           |
| Meal plan client preview table                                    | N01      | client-plan-preview.tsx:59-205                    | MealPlanVersion.payload :1706                                         | Canvas portions vs foodText blob (payload.ts:53-63)                                                  |
| Training tab week sessions + prescription                         | P03      | client-preview.tsx:712-839                        | TrainingProgram/Version :1750-1841                                    | Per-set shape mismatch (Screen 18); bookings KEPT, FLAGGED, not drawn                                |
| Muscle volume table + body heatmap                                | P02      | client-preview.tsx:738-777, 629-699               | MISSING                                                               | No volume compute; GAP-MATRIX V3-CP13 CONFLICT (decision 116)                                        |
| Check-In tab preview                                              | C01, C03 | client-preview.tsx:842-854                        | CheckInForm/Version :1216-1284                                        | Form preview only                                                                                    |
| Habits tab coach toggle done                                      | habits   | client-preview.tsx:889-896, 961-971               | lib/habits/service.ts:714 (client own)                                | Staff write MISSING                                                                                  |

Auth/role: per-subpage resources (dailyTracking, clientDashboards, mealPlans, trainingPlansLogs) via resolveScope (lib/auth/rbac.ts:443).
Owning wave: PR-W3 client preview (PLAN.md:1557); tabs also PR-W4/W6/W7/W8/W9. Gaps: 10.

## Screen 5: Tracker Today / tracking view

Canvas: frontend/src/components/coach/client-tracker-preview/today-view.tsx, tracker-cell.tsx, tracking-view.tsx, time-input.tsx. Staff read today: listStaffDailyEntries lib/daily-entry/service.ts:742 and readStaffDailyEntryDetail :859 via app/workspace/[workspaceId]/clients/[clientProfileId]/daily/page.tsx:36-76 (flat date list + one entry detail).

| item                                                                                                | brief id | canvas file:line                                 | backend file:line or MISSING                                                                | gap note                                                                                           |
| --------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Day heading + "n of m recorded"                                                                     | T04      | today-view.tsx:122-138                           | DailyEntry :1001-1029                                                                       | Derivable; no count read                                                                           |
| Daily overview strip (up to 4 pins)                                                                 | T04      | today-view.tsx:141-159                           | MISSING slot                                                                                | summaryParameterIds planned (PLAN.md:630)                                                          |
| Category sidebar with counts                                                                        | T01      | today-view.tsx:163-230                           | ParameterDefinition.group :783                                                              | OK                                                                                                 |
| Numeric/rating cell edit (client mode)                                                              | T04      | tracker-cell.tsx:262-367                         | valueNumeric/valueRating :1076-1077; saveDailyEntry lib/daily-entry/service.ts:328          | Client-own write exists                                                                            |
| Coach "Log data" on behalf                                                                          | T04      | tracking-view.tsx:93-107                         | lib/daily-entry/service.ts:386                                                              | CONFLICT: service requires own scope (spot-checked) though rbac.ts:134 grants COACH assigned write |
| Unit conversion display/input                                                                       | T03      | preview-model.ts:115-200; tracker-cell.tsx:39-84 | ParameterDefinition.unit :785                                                               | Canonical-unit storage UNVERIFIED                                                                  |
| Structured text kinds (blood pressure, multi-choice + note, location rating, context, period start) | T01      | tracker-cell.tsx:681-1175                        | ParameterKind :741-748 has MEASUREMENT, RATING, TIME, DURATION, OPTION, TEXT (spot-checked) | These kinds MISSING; valueText :1079 only; additions planned (PLAN.md:630, D28)                    |
| Time inputs 12/24h                                                                                  | T01      | time-input.tsx                                   | ParameterKind TIME :744                                                                     | Kind exists; value column for time UNVERIFIED                                                      |
| Cycle day derived, cycle group gating                                                               | T01      | view-model.ts:62-107                             | dataClassification :794; lib/daily-tracker.ts:41                                            | Consent rules parked (D12)                                                                         |
| Coach note per date + parameter (500 chars)                                                         | T04, P06 | tracker-cell.tsx:369-378, 581-633                | MISSING                                                                                     | TrackerComment planned PR-M3                                                                       |
| Mode switch Log data / Coach notes + Configure                                                      | T04      | tracking-view.tsx:92-121                         | MISSING                                                                                     | No staff write or comment endpoints                                                                |
| Future-date logging disabled                                                                        | T04      | today-view.tsx:272, 284                          | lib/daily-entry/service.ts:143                                                              | Bounds UNVERIFIED                                                                                  |
| Overwrite vs revisions                                                                              | T04      | client-preview.tsx:208-218                       | DailyEntryRevision :1032-1066 append-only                                                   | Intentional divergence (GAP-MATRIX V3-CO03)                                                        |

Auth/role: client requireDailyTrackerAccess (route-guard.ts:87); staff dailyTracking/read workspace or assigned (daily/page.tsx:59-76).
Owning wave: PR-W4 (PLAN.md:1607); staff series read PR-SV2 (PLAN.md:1226). Gaps: 6.

## Screen 6: Tracker Week view

Canvas: client-tracker-preview/week-view.tsx.

| item                                                                     | brief id | canvas file:line                             | backend file:line or MISSING   | gap note                                                     |
| ------------------------------------------------------------------------ | -------- | -------------------------------------------- | ------------------------------ | ------------------------------------------------------------ |
| 7-day grid per parameter, click to day                                   | T04      | week-view.tsx:98-150, 197-224                | raw rows :1001-1088            | No per-parameter range read for staff; PR-SV2 (PLAN.md:1226) |
| Collapsible groups                                                       | T01      | week-view.tsx:152-185                        | ParameterDefinition.group :783 | OK                                                           |
| Weekly summary column (average, latest, total, most frequent, completed) | T04, R02 | week-view.tsx:226-240; view-model.ts:186-279 | MISSING                        | No aggregation service                                       |
| Future cells disabled                                                    | T04      | week-view.tsx:115-116                        | lib/daily-entry/service.ts:143 | OK                                                           |

Auth/role: staff dailyTracking/read. Owning wave: PR-W4 (PLAN.md:1607). Gaps: 2.

## Screen 7: Trends view

Canvas: client-tracker-preview/trends-view.tsx.

| item                                         | brief id | canvas file:line        | backend file:line or MISSING | gap note                          |
| -------------------------------------------- | -------- | ----------------------- | ---------------------------- | --------------------------------- |
| Metric picker (max 3) + span 7/30/56/90/180d | T04      | trends-view.tsx:30-33   | MISSING                      | No staff series endpoint; PR-SV2  |
| Numeric line/bar charts                      | T04      | trends-view.tsx:77-451  | MISSING (series read)        | Raw values only                   |
| Latest / Average / Change footer             | R02      | trends-view.tsx:465-491 | MISSING                      | Not computed server-side          |
| Completion grid (yes/no strips)              | T04      | trends-view.tsx:496-594 | MISSING                      | Needs structured kinds (Screen 5) |
| Dated text-entry list                        | T04      | trends-view.tsx:596-633 | MISSING                      | Same                              |

Auth/role: intended staff dailyTracking/read. Owning wave: PR-W4 (PLAN.md:1607). Gaps: 5.

## Screen 8: Template library

Canvas: frontend/src/components/coach/templates.tsx:187-435 (TemplateLibrary). Backend: app/workspace/[workspaceId]/templates/page.tsx, actions.ts; lib/coaching/templates.ts; CoachingTemplate db/schema.prisma:818-845 (name, status, draft Json, draftRevision).

| item                                                        | brief id | canvas file:line                               | backend file:line or MISSING                            | gap note                                                                                                        |
| ----------------------------------------------------------- | -------- | ---------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Cards: name, description, tags, assigned count, edited date | W10      | templates.tsx:283-390                          | listTemplates lib/coaching/templates.ts:435-476         | Returns name/status/hasDraft/latestVersionSeq/updatedAt; no description, tags or count                          |
| Search name + description                                   | W10      | templates.tsx:196-198, 244-248                 | MISSING                                                 | No search param                                                                                                 |
| Add template                                                | W10      | templates.tsx:199-203                          | createTemplate actions.ts:123-150; templates.ts:549-585 | Wired; creates {title, sections:[]}                                                                             |
| Resume-draft chips                                          | W10      | templates.tsx:253-265                          | draft :826; openTemplateDraft actions.ts:191-215        | One server draft vs canvas per-template local drafts                                                            |
| Duplicate                                                   | W10      | templates.tsx:204-212                          | MISSING                                                 | GAP-MATRIX S05-03                                                                                               |
| Rename                                                      | W10      | templates.tsx:401-432                          | saveTemplateDraft name (actions.ts:170-172)             | No standalone rename; canvas maxLength 80 (templates.tsx:408) vs MAX_NAME_LEN 120 (actions.ts:33), spot-checked |
| Delete with undo                                            | W10      | templates.tsx:213-230                          | archiveTemplate actions.ts:250-277                      | CONFLICT S05-05: archive terminal, no restore                                                                   |
| Preview (multi-tab client preview)                          | W10      | templates.tsx:166-186, 373-376                 | templates/[templateId]/preview/page.tsx:24-83           | CONFLICT: backend renders sections/items only                                                                   |
| Tags (views, habits, nutrition mode)                        | W10      | templates.tsx:358-364; template-setup.ts:11-27 | MISSING                                                 | No slots                                                                                                        |
| Assigned count                                              | W10      | templates.tsx:284-286                          | derivable from ClientSetupPin :939                      | No count query                                                                                                  |

Auth/role: requireSessionUser (route-guard.ts:185) at templates/page.tsx:37; flag isCoachingTemplatesEnabled (page.tsx:34); rbac coachingTemplates (lib/auth/rbac.ts:318-325: owner + coach workspace read/write; assistant, client, support, admin denied; spot-checked).
Owning wave: PR-W3 (PLAN.md:1557). Gaps: 8.

## Screen 9: Template editor

Canvas: templates.tsx:455-829 plus sections to :2271. Backend draft shape {title, sections[].items[]{parameterKey, required, order}} (lib/coaching/templates.ts:47-61, validator 178-294).

| item                                                                      | brief id | canvas file:line                                   | backend file:line or MISSING                                                      | gap note                                                                |
| ------------------------------------------------------------------------- | -------- | -------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Name (max 80)                                                             | W10      | templates.tsx:576-582                              | name :822; 120 cap actions.ts:33                                                  | Length mismatch                                                         |
| Description                                                               | W10      | templates.tsx:655-665                              | MISSING                                                                           |                                                                         |
| View toggles (Dashboard, Tracker, Roadmap, Nutrition, Training, Check-In) | W10      | templates.tsx:666-690; model.ts:28-35              | MISSING                                                                           | Draft allows only title/sections (templates.ts:150-158)                 |
| Habits toggle                                                             | W10      | templates.tsx:683-689                              | MISSING                                                                           |                                                                         |
| 8-section editor nav                                                      | W10      | templates.tsx:436-445, 609-623                     | app/workspace/[workspaceId]/templates/[templateId]/template-editor.tsx:207-367    | CONFLICT: backend edits parameter sections only                         |
| Embedded dashboard config                                                 | D01      | templates.tsx:693-695, 864-877                     | MISSING at template level; per-client ClientDashboardLayout :1529-1554            | PR-M9 adapter (PLAN.md:1115-1130)                                       |
| Tracker fields list, order, remove                                        | T02      | templates.tsx:988-1187                             | sections[].items[]; ParameterDefinition :773-816                                  | Partial: nested sections vs flat FieldConfig (model.ts:565)             |
| Parameter library browser, groups, search                                 | T01      | templates.tsx:1188-1320                            | flat select in template-editor.tsx:268-273; lib/coaching/parameters.ts            | Partial                                                                 |
| Per-field unit override                                                   | T03      | templates.tsx:1095-1115                            | ParameterDefinition.unit :785 (single, publish-locked)                            | CONFLICT                                                                |
| Per-field option labels                                                   | T02      | templates.tsx:1116-1161                            | ParameterDefinition.options :787                                                  | CONFLICT (parameter-owned)                                              |
| Cycle tracking toggle                                                     | T01      | templates.tsx:893-905, 1280-1318                   | classification CYCLE :761-766                                                     | MISSING flag                                                            |
| Daily overview pins (max 4)                                               | T04      | templates.tsx:1322-1409; tracker-setup.ts:4-33     | MISSING                                                                           | Planned PLAN.md:630                                                     |
| Roadmap calculation toggles                                               | R01, R02 | templates.tsx:1413-1545                            | MISSING                                                                           |                                                                         |
| Phase selection + phase options                                           | R03      | templates.tsx:1546-1570                            | MISSING                                                                           |                                                                         |
| Rating scheme                                                             | T03      | templates.tsx:2007-2014                            | RatingScheme enum :750-754                                                        | Canvas puts it on question; backend on parameter                        |
| Nutrition mode Meal plan / IIFYM                                          | N01, N03 | templates.tsx:709-725                              | MISSING                                                                           | Planned PLAN.md:630                                                     |
| Training prescription fields (8)                                          | P01      | templates.tsx:1592-1613                            | MISSING at template; per-program fieldConfig lib/trainingprogram/payload.ts:33-44 | GAP-MATRIX S07-12                                                       |
| Set choice vocabularies + defaults                                        | P01      | templates.tsx:1650-1890; plans/training-options.ts | MISSING                                                                           | S07-13                                                                  |
| Volume toggle, breakdown, Table/Heatmap                                   | P02      | templates.tsx:1615-1645                            | MISSING                                                                           |                                                                         |
| Questionnaire builder (label, type, required, reorder)                    | C01      | templates.tsx:1891-2066                            | CheckInForm/Version :1216-1284 separate; template items are parameter refs        | CONFLICT; Visual upload type UNVERIFIED against CheckInAnswerKind :1207 |
| Included summaries                                                        | C02      | templates.tsx:2022-2053                            | MISSING                                                                           |                                                                         |
| FormPreview Full / Custom                                                 | C03, C04 | templates.tsx:2067-2271                            | preview/page.tsx:59-81 structural                                                 | Partial                                                                 |
| Save                                                                      | W10      | templates.tsx:489-522                              | saveTemplateDraft actions.ts:152-189 (CAS)                                        | Canvas validations (templates.tsx:491-503) have no server twin          |
| Publish                                                                   | W10      | none (save is final)                               | publishTemplate actions.ts:217-248                                                | CONFLICT: draft/publish lifecycle has no canvas affordance              |
| Variants machinery                                                        | W10      | model.ts:613-621, 998-1012                         | MISSING                                                                           | CONFLICT S05-24                                                         |

Auth/role: as Screen 8. Owning wave: PR-W3 (PLAN.md:1557); slots PR-M4 (PLAN.md:630, 875). Gaps: 24.

## Screen 10: Assign template dialog

Canvas: templates.tsx:81-165; assignTemplate model.ts:970-997.

| item                               | brief id | canvas file:line      | backend file:line or MISSING                                                             | gap note                                                               |
| ---------------------------------- | -------- | --------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Athlete picker (archived excluded) | W10      | templates.tsx:106-135 | listAssignableSetupClients lib/coaching/client-setup.ts:399; resolveAssignSelection :484 | Also wired at app/workspace/[workspaceId]/client-setups/actions.ts:128 |
| Template config summary            | W10      | templates.tsx:100-105 | MISSING                                                                                  | listAssignableTemplates (:429) returns no definition data              |
| Assign & personalize               | W10      | templates.tsx:143-161 | createClientSetupAssignment client-setup.ts:539-610                                      | CONFLICT: snapshot copy vs immutable version pin (ClientSetupPin :939) |
| Snapshot stored on client          | W10      | model.ts:622-626      | ClientSetupPin.templateVersionId                                                         | Shape mismatch                                                         |

Auth/role: rbac clientSetups (lib/auth/rbac.ts:333-340); requireClientSetupAccess (route-guard.ts:139). Owning wave: PR-W3 (PLAN.md:1557). Gaps: 3.

## Screen 11: Dashboard builder (template-embedded and per client)

Canvas: frontend/src/components/coach/builder/dashboard-builder.tsx, gallery.tsx, coach-dashboard.tsx. Backend per client: app/workspace/[workspaceId]/clients/[clientProfileId]/dashboard/page.tsx:35-55 and dashboard-editor.tsx; lib/dashboard/config-schema.ts; ClientDashboardLayout db/schema.prisma:1529-1554.

| item                                                                  | brief id | canvas file:line                               | backend file:line or MISSING                                                 | gap note                                        |
| --------------------------------------------------------------------- | -------- | ---------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------- |
| Grid, drag/resize, per-breakpoint layouts                             | D01      | dashboard-builder.tsx:119-1428                 | ClientDashboardLayout.config :1536; validateDashboardConfig config-schema.ts | Wired per client; template-level MISSING        |
| Dashboard name                                                        | D01      | dashboard-builder.tsx:137                      | config-schema.ts:46                                                          | Wired                                           |
| Add widget, gallery (19 kinds, grouped, search)                       | D02      | dashboard-builder.tsx:798; gallery.tsx:359-471 | WIDGET_KINDS config-schema.ts:66-88                                          | Same 19 kinds                                   |
| Undo / redo                                                           | D01      | dashboard-builder.tsx:150-223                  | autosave coordinator via dashboard-editor.tsx:43                             | Wired                                           |
| Client preview switch                                                 | D05      | dashboard-builder.tsx:825-836                  | projectClientDashboardConfig config-schema.ts:475-479                        | Wired                                           |
| Auto arrange, reset                                                   | D01      | dashboard-builder.tsx:855-888                  | UNVERIFIED                                                                   |                                                 |
| Widget settings (source, summary, period, fields, unit, size, target) | D03      | gallery.tsx:542-1100                           | WidgetSettings config-schema.ts:16-29                                        | Backend adds labels, historyPeriod, visibility  |
| Sizing                                                                | D04      | grid.ts; model.ts:1                            | SIZE_OPTIONS config-schema.ts:37-63                                          | Wired                                           |
| Per-widget audience staff/client                                      | D05      | MISSING on canvas                              | WidgetVisibility config-schema.ts:14, 28                                     | Canvas lacks control; PR-W9 item (PLAN.md:1871) |
| Autosave + revision CAS                                               | D01      | dashboard-builder.tsx:195-197, 784-788         | saveClientDashboardLayout dashboard/actions.ts:14-22; revision :1539         | Wired                                           |
| Data feeds for preview                                                | D05      | coach-dashboard.tsx:43-174                     | see Screen 12                                                                | Mostly MISSING                                  |

Auth/role: isClientDashboardEnabled (lib/dashboard/gate.ts); requireSessionUser; rbac clientDashboards (lib/auth/rbac.ts:344-351).
Owning wave: PR-W9 (PLAN.md:1857); adapter PR-M9 (PLAN.md:1115). Gaps: 3 (template slot, visibility control, auto-arrange/reset UNVERIFIED).

## Screen 12: Widget data contents

Canvas: builder/widget-content.tsx, progress-content.tsx, nutrition-content.tsx, coaching-content.tsx, additional-widget-content.tsx, nutrition-history.tsx, smooth-trend.tsx. Backend CONNECTED_KINDS = CU04, CU16, CU03, TL21, TL22 (lib/dashboard/config-schema.ts:92-98, spot-checked); others render "not connected yet" in app/(tracker)/workspace/[workspaceId]/dashboard/page.tsx:196-199.

| item (family)                  | brief id | canvas file:line                             | backend file:line or MISSING                                        | gap note                                |
| ------------------------------ | -------- | -------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------- |
| Progress BN21, BN01, BN08      | D05      | progress-content.tsx                         | MISSING feed                                                        | DailyEntry exists, no source            |
| Nutrition BN15, BN19           | D05, N07 | nutrition-content.tsx; nutrition-history.tsx | MISSING feed                                                        | Formula CONFLICTs GAP-MATRIX R3-4..R3-9 |
| Training TL26, TL28            | D05      | widget-content.tsx                           | MISSING feed                                                        |                                         |
| Activity TL06 steps            | D05      | ethereal builder model                       | MISSING feed                                                        |                                         |
| Recovery TL11, TL14            | D05      | same                                         | MISSING feed                                                        |                                         |
| Habits TL21, TL22              | D05      | same                                         | readTodayHabits / readHabitConsistency (dashboard/page.tsx:105-124) | Wired                                   |
| Coaching CU01 focus, CU02 week | D05      | coaching-content.tsx                         | MISSING model                                                       |                                         |
| Client tasks CU03              | D05, W05 | same                                         | ClientTask :1560; dashboard/page.tsx:162-167                        | Wired                                   |
| Check-in status CU04           | D05      | same                                         | link only page.tsx:180-183                                          | Partial                                 |
| Coach feedback CU06            | D05      | same                                         | CheckInFeedback :1432; no feed                                      | MISSING feed                            |
| Roadmap CU09, CU10             | R04      | same                                         | MISSING model                                                       |                                         |
| Shortcuts CU16                 | D05      | same                                         | static LINKS page.tsx:127-130                                       | Partial                                 |
| Messages feed                  | D05, M01 | coach-dashboard.tsx:147-155                  | MISSING                                                             | No message model                        |

Owning wave: feeds PR-SV3 (PLAN.md:1260), wiring PR-W9 (PLAN.md:1857). Gaps: 11.

## Nutrition backend context (Screens 13-16)

MealPlan db/schema.prisma:1672 (title, timezone, draft Json, draftRevision); MealPlanVersion :1706 (immutable payload, effectiveDate, activationInstant). Payload contract lib/mealplan/payload.ts: targetMode FIXED/RANGE/MINIMUM per variant (:40), targets {value} | {min,max} | {min} (:43-44), meal {order, name, time?, frequency?, foodText, kcal?, proteinG?, carbsG?, fatG?} (:53-63), spot-checked. Service lib/mealplan/service.ts: saveMealPlanDraft :473, setMealPlanTimezone :615, publishMealPlanVersion :692, readStaffMealPlan :858. Actions app/workspace/[workspaceId]/clients/[clientProfileId]/meal-plan/actions.ts:60-197. No archive (schema comment :1666-1671). "Nothing is calculated" (decision 115). lib/nutrition holds only import.ts, search.ts, source.ts; the lib/nutrition/math.ts that PLAN.md:1771 names does not exist (verified by ls).
Auth: isMealPlansEnabled + requireSessionUser (meal-plan/page.tsx:33-36); in-transaction authorize resource mealPlans (lib/auth/rbac.ts:146-153). Owning wave: PR-W7 (PLAN.md:1757).

## Screen 13: Individual plan workspace (nutrition side)

Canvas: frontend/src/components/coach/plans/workspace.tsx (IndividualPlanWorkspace :151, PlanEditor :282); plans/types.ts:6-16.

| item                                                          | brief id | canvas file:line               | backend file:line or MISSING              | gap note                                         |
| ------------------------------------------------------------- | -------- | ------------------------------ | ----------------------------------------- | ------------------------------------------------ |
| Plan name                                                     | N01      | workspace.tsx:478-483          | MealPlan.title :1676                      | Backend max 80; canvas unbounded                 |
| Start date                                                    | N08      | workspace.tsx:485-489          | MealPlanVersion.effectiveDate :1716       | Canvas date on draft; backend only at publish    |
| Active version summary                                        | N08      | workspace.tsx:491-496          | currentVersion service.ts:438-448         | Resolved by activationInstant                    |
| Lifecycle label incl. "Active with draft changes", "Archived" | N08      | domain.ts:36-47                | MISSING                                   |                                                  |
| Save draft                                                    | N01      | workspace.tsx:325-336          | saveMealPlanDraft service.ts:473          | Payload shape incompatible (Screen 14)           |
| Review & activate                                             | N08      | workspace.tsx:365-416, 557-590 | publishMealPlanVersion service.ts:692     | Backend needs effectiveDate + confirmed timezone |
| History dialog with macro summary                             | N08      | workspace.tsx:595-637          | listMealPlanVersionsAction actions.ts:197 | Computed per-variant totals MISSING              |
| Validate on activate                                          | N01      | domain.ts:267-348              | normalizeMealPlanPayload payload.ts:180   | Structural only                                  |
| Unsaved-draft guard                                           | N01      | workspace.tsx:337-364          | draftRevision CAS service.ts:571-572      | UI only                                          |
| Preview draft                                                 | N01      | workspace.tsx:546-581          | components/mealplan/plan-version-view.tsx | Schedule text has no field                       |
| Timezone confirmation (backend only)                          | none     | MISSING on canvas              | setMealPlanTimezone service.ts:615        | Canvas must add or derive                        |

Gaps: 7.

## Screen 14: Meal plan editor (fixed meals)

Canvas: frontend/src/components/coach/plans/nutrition/editor.tsx (NutritionEditor :1157).

| item                                              | brief id | canvas file:line                   | backend file:line or MISSING                      | gap note                                      |
| ------------------------------------------------- | -------- | ---------------------------------- | ------------------------------------------------- | --------------------------------------------- |
| Option tabs add/rename/duplicate/delete           | N08      | editor.tsx:1297-1367               | variant {id,label} payload.ts:65-71               | Max 8, unique labels                          |
| Meal rows name/time/frequency, reorder            | N01      | editor.tsx:901-990, 1512-1529      | MealPlanMeal payload.ts:53-63                     | Wired shape                                   |
| Food portions (catalog food + quantity)           | N01      | editor.tsx:992-1018                | MISSING                                           | Backend has foodText blob only (spot-checked) |
| Swap alternatives + equivalent qty                | N01      | editor.tsx:207-282, 1039-1090      | MISSING                                           |                                               |
| Per-portion and per-meal kcal/macros              | N02, N06 | editor.tsx:1013-1018, 1145-1151    | hand-entered meal kcal/macros payload.ts:58-62    | CONFLICT S06-07 (computed vs entered)         |
| Overview + macro ring                             | N06      | editor.tsx:802-899                 | MISSING                                           | CONFLICT S06-08                               |
| Variant schedule (every day, weekly roles, cycle) | N03, N08 | editor.tsx:323-799; model.ts:63-76 | MISSING                                           | S06-09                                        |
| Saved meals library                               | N05      | editor.tsx:1116-1143, 1225-1480    | MISSING                                           | S06-10                                        |
| Food picker multi-select                          | N04      | editor.tsx:76-205                  | lib/nutrition/search.ts:30-61 not linked to plans |                                               |
| Archive plan                                      | N08      | model.ts:78-87, 529-544            | MISSING by design (:1666-1671)                    | CONFLICT                                      |

Gaps: 9.

## Screen 15: IIFYM / macro editor

Canvas: editor.tsx IifymEditor :1678.

| item                                 | brief id | canvas file:line                       | backend file:line or MISSING          | gap note                                                                 |
| ------------------------------------ | -------- | -------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------ |
| Named target options                 | N08      | editor.tsx:1685-1734                   | variant label payload.ts:65           | No separate IIFYM kind; canvas runs parallel lifecycles (types.ts:75-78) |
| Calories vs Macros style (exclusive) | N02      | editor.tsx:1640-1660; model.ts:681-686 | MealPlanMacroTargets payload.ts:46-51 | Backend allows both together                                             |
| Fixed / Range / Minimum per field    | N03      | editor.tsx:1538-1608                   | targetMode per variant payload.ts:40  | Per-field vs per-variant mismatch                                        |
| Minimum value shape                  | N03      | model.ts:19-22                         | {min} payload.ts:44                   | {kind,value} vs {min}; min<max rule                                      |
| Option schedule                      | N03      | editor.tsx:1704-1713                   | MISSING                               |                                                                          |
| Preview derived kcal (4/4/9)         | N06      | editor.tsx:1785-1902                   | MISSING                               | CONFLICT S06-15                                                          |

Gaps: 6.

## Screen 16: Food search / library

| item                                 | brief id | canvas file:line                                     | backend file:line or MISSING                                                               | gap note                                               |
| ------------------------------------ | -------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Food catalog fields                  | N04      | frontend/src/data/food-database.json; model.ts:12-17 | NutritionCatalogItem db/schema.prisma:477-499                                              | fat vs fats; DB has state/category, nullable nutrients |
| Name search                          | N04      | editor.tsx:82-90                                     | searchNutritionCatalog search.ts:46-58 (min 2 chars, limit 50)                             | Not connected to plan authoring                        |
| Category filter (backend only)       | N04      | none                                                 | listNutritionCategories search.ts:63-75                                                    |                                                        |
| Library page                         | N04      | none                                                 | app/workspace/[workspaceId]/nutrition/page.tsx:25; app/library/foods/page.tsx is a fixture |                                                        |
| Barcode scan, custom food, quick add | N04      | none on coach canvas                                 | MISSING                                                                                    | Client-side brief items                                |
| Saved meal search                    | N05      | editor.tsx:1233-1248                                 | MISSING                                                                                    |                                                        |

Auth: requireWorkspaceAccess resource foodExerciseMasterData read (nutrition/page.tsx:37-42; rbac.ts:236-243). Gaps: 4.

## Screen 17: Training program editor

Canvas: frontend/src/components/coach/plans/training/editor.tsx (TrainingEditor :961, TrainingPrescription :918), plans/types.ts:26-66. Backend: TrainingProgram/Version db/schema.prisma:1750-1841; lib/trainingprogram/payload.ts; service.ts (save :717, publish :1044); actions app/workspace/[workspaceId]/clients/[clientProfileId]/training-program/actions.ts:68-323.

| item                                                          | brief id      | canvas file:line                                 | backend file:line or MISSING                                     | gap note                                                 |
| ------------------------------------------------------------- | ------------- | ------------------------------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------- |
| Plan name                                                     | P03           | workspace.tsx:479-483                            | title :1754 (80 cap actions.ts:89-90)                            | OK                                                       |
| Start date                                                    | P07           | workspace.tsx:485-489                            | startDate :1757, locked after publish                            | Canvas does not lock                                     |
| Evergreen / week-based                                        | P07           | editor.tsx:1019-1028                             | programMode :1762                                                | OK, locked at publish                                    |
| Length weeks                                                  | P07           | editor.tsx:1032-1045 (max 52)                    | actions.ts:93-96 (1-104)                                         | Cap mismatch, spot-checked                               |
| Week nav + carry-forward                                      | P08           | editor.tsx:1066-1086; types.ts:88-111            | payload.ts:143-168; materializeWeeks :489                        | Representation differs                                   |
| Sessions add/rename/reorder/remove                            | P03           | editor.tsx:741-783, 1103-1149                    | payload.ts:148-165                                               | OK                                                       |
| Exercise muscle allocation                                    | P02           | editor.tsx:571-591                               | MISSING                                                          | Draft exercise has name + catalogItemId only             |
| Per-set rows (reps, repsMax, tempo, type, rest, instructions) | P01, P03      | editor.tsx:439-541; types.ts:26-34               | flat per-exercise cells payload.ts:452-464                       | SHAPE MISMATCH V3-L1-TrainingSet (spot-checked types.ts) |
| Progression select                                            | P01           | editor.tsx:642-653                               | progressionNotes free text                                       | Vocabulary MISSING                                       |
| Set type/tempo/rest vocabularies + defaults                   | P01           | training-options.ts:1-19                         | MISSING (fieldConfig 8 booleans, payload.ts:33-44, spot-checked) | S07-13                                                   |
| 8-field config                                                | P01           | model.ts:555-564                                 | TRAINING_FIELD_KEYS payload.ts:33-44                             | 1:1                                                      |
| Volume config                                                 | P02           | editor.tsx:379-437                               | MISSING                                                          |                                                          |
| Future coach note on a set                                    | P05           | UNVERIFIED on canvas (per-set instructions only) | instructions cell                                                | No future-set note concept                               |
| Draft / activate / history                                    | P03           | workspace.tsx:447-545                            | save :717, publish :1044                                         | Publish needs effectiveDate + timezone                   |
| Client prescription for date                                  | P03           | workspace.tsx:862-870                            | readOwnTrainingProgram service.ts:2159                           | Date resolution agreement UNVERIFIED                     |
| Bookings                                                      | none in brief | none on canvas                                   | TrainingSessionBooking :1843-1874                                | KEPT, FLAGGED                                            |

Auth: isTrainingPlansEnabled (lib/trainingprogram/gate.ts:34) then requireSessionUser; rbac trainingPlansLogs (lib/auth/rbac.ts:161-168). Owning wave: PR-W8 (PLAN.md:1807), payload PR-M6 (PLAN.md:970). Gaps: 8.

## Screen 18: Exercise library and picker

Canvas: editor.tsx:117-377 (LibraryPicker, ExerciseLibraryManager); plans/types.ts:35-41. Backend: ExerciseCatalogItem db/schema.prisma:555-580 (import-only, "Deliberately NOT Training" :550-554); lib/exercise/search.ts:33-98; app/workspace/[workspaceId]/exercises/page.tsx:26-127.

| item                                | brief id     | canvas file:line            | backend file:line or MISSING           | gap note                                                                                  |
| ----------------------------------- | ------------ | --------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------- |
| Library list + count                | P03          | editor.tsx:228-251, 332-372 | ExerciseCatalogItem :555               | Global import vs coach library                                                            |
| Search by name/muscle               | P03          | editor.tsx:126-135          | searchExerciseCatalog search.ts:33     | Muscle enum vs free text                                                                  |
| Add / edit / remove custom exercise | P01          | editor.tsx:202-362          | MISSING                                | Import-only; PR-M6 item (PLAN.md:980)                                                     |
| Secondary muscles                   | P02          | editor.tsx:281-303          | additionalTargets :564 single string   | Shape mismatch                                                                            |
| Coaching notes                      | P01          | editor.tsx:305-313          | cues :568                              | Import-authored                                                                           |
| Snapshot on pick                    | P03          | editor.tsx:636-641, 824-838 | catalogItemId reference payload.ts:155 | Draft semantics differ                                                                    |
| Exercise demo media                 | M01-adjacent | not drawn                   | videoLink :569                         | Media model MISSING; PR-MEDIA (PLAN.md:1357) scope is messages; exercise demos UNASSIGNED |

Auth: requireWorkspaceAccess foodExerciseMasterData read (exercises/page.tsx:44-49). Owning wave: PR-W8 (PLAN.md:1807). Gaps: 6.

## Screen 19: Muscle volume summary

Canvas: editor.tsx:379-437; training-model.ts:30-49; muscle-volume.ts:1-66.

| item                          | brief id | canvas file:line       | backend file:line or MISSING | gap note                                     |
| ----------------------------- | -------- | ---------------------- | ---------------------------- | -------------------------------------------- |
| Per-group weekly working sets | P02      | muscle-volume.ts:34-66 | MISSING                      | lib/training/volume.ts planned (PLAN.md:981) |
| Warm-up exclusion             | P02      | training-model.ts:41   | MISSING                      | Blocked by per-set shape                     |
| Unassigned row                | P02      | editor.tsx:426-431     | MISSING                      |                                              |
| Heatmap vs Table              | P02      | editor.tsx:397-411     | MISSING                      | Not in fieldConfig                           |
| Total sets                    | P02      | editor.tsx:395         | MISSING                      |                                              |

Owning wave: PR-M6 compute + PR-W8 wiring. Gaps: 5.

## Screen 20: Check-in review queue and review workspace

Canvas: frontend/src/components/coach/check-ins.tsx:442-804 (review mount 66-80). Backend: app/workspace/[workspaceId]/checkins/review-queue/page.tsx and actions.ts; app/workspace/[workspaceId]/clients/[clientProfileId]/checkins/actions.ts; lib/checkin/instances.ts, instances-boundary.ts.

| item                                           | brief id | canvas file:line                          | backend file:line or MISSING                                                                       | gap note                                                     |
| ---------------------------------------------- | -------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Awaiting feedback counter                      | W09, C05 | check-ins.tsx:93, 325-327                 | listStaffCheckInReviewQueue (review-queue/page.tsx:40)                                             | Queue, no count                                              |
| Open review                                    | C05      | check-ins.tsx:66-80, 442                  | viewCheckInSubmissionDetail checkins/actions.ts:212; readCheckInSubmissionDetail instances.ts:2031 | Covered                                                      |
| Answers + athlete note                         | C05      | check-ins.tsx:500-511                     | CheckInSubmissionAnswer db/schema.prisma:1376-1398                                                 | No note column on CheckInSubmission :1337                    |
| Submitted visuals + lightbox                   | C04, C05 | check-ins.tsx:512-525, 765-772            | MISSING                                                                                            | No media model; S03-14                                       |
| Tracker & progress, 7-day table                | C05      | check-ins.tsx:537-574                     | showCheckInReviewTrackerContext checkins/actions.ts:315                                            | One date per call; range read MISSING                        |
| Habit consistency X/7                          | C02, C05 | check-ins.tsx:542-547                     | habitConsistency lib/habits/service.ts:994                                                         | Include-in-check-in flag MISSING (S04-10)                    |
| Flagged training notes                         | P04, P06 | check-ins.tsx:576-609 (spot-checked)      | MISSING                                                                                            | No set-note model; S03-16                                    |
| Feedback draft autosave                        | C05      | check-ins.tsx:446-460, 636-648            | MISSING                                                                                            | CheckInFeedback committed-only :1432; S03-21                 |
| Video feedback                                 | C06, M05 | check-ins.tsx:649-663; media.tsx          | MISSING                                                                                            | S03-18 CONFLICT, decision D-09                               |
| Plan adjustments bundle                        | C07      | check-ins.tsx:664-746; model.ts:702-712   | MISSING                                                                                            | S03-19 CONFLICT; decision 114 bans automatic program changes |
| Submit feedback (review + send + message link) | C05, C07 | check-ins.tsx:747-760; model.ts:1100-1154 | markCheckInSubmissionReviewed actions.ts:258; sendCheckInFeedbackAction :439                       | Two steps, text only; message link MISSING (S03-20)          |
| Sent feedback view                             | C05      | check-ins.tsx:614-626                     | CheckInFeedback body/sentAt :1438-1440; listStaffCheckInFeedbackAction actions.ts:545              | Video and changes MISSING                                    |
| View in conversation                           | M05      | check-ins.tsx:143-146, 627-632            | MISSING                                                                                            | No messaging                                                 |

Auth/role: isCheckInsEnabled then requireSessionUser (review-queue/page.tsx:30-44); rbac checkinsCoachReviews (lib/auth/rbac.ts:180-187).
Owning wave: PR-W6 (PLAN.md:1707). Gaps: 11.

## Screen 21: Check-in calendar

Canvas: check-ins.tsx week board 332-368, month 369-390, agenda 391-402, popovers 102-242; events from eventsBetween (model.ts:1055).

| item                            | brief id | canvas file:line                           | backend file:line or MISSING                                      | gap note                                                                                                           |
| ------------------------------- | -------- | ------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Week/Month/Agenda, all athletes | W06      | check-ins.tsx:49-101, 332-402              | readStaffCheckInCalendar lib/checkin/instances-boundary.ts:218    | Requires clientProfileId (spot-checked); no workspace-wide feed; app/api/v1/calendar planned PR-SV1 (PLAN.md:1172) |
| Event status                    | W06, W09 | check-ins.tsx:118, 318-323                 | projectCheckInInstanceState lib/checkin/instances.ts:98           | Projected; Feedback sent join UNVERIFIED                                                                           |
| Origin / type chip              | W06      | check-ins.tsx:202-209                      | originRuleId db/schema.prisma:1303; formVersionId :1289-1290      | Full/Custom needs a form mapping                                                                                   |
| Extra note                      | W06      | check-ins.tsx:102-127; model.ts:633        | MISSING                                                           | No note column on CheckInInstance (spot-checked)                                                                   |
| Add extra date                  | W06      | check-ins.tsx:256-260; clients.tsx:883-982 | scheduleCheckInInstance instances.ts:749; unique :1326            | See note/type gaps                                                                                                 |
| Reschedule additional date      | W06      | check-ins.tsx:151-155 (spot-checked)       | MISSING                                                           | Only cancel exists                                                                                                 |
| Remove with undo                | W06      | check-ins.tsx:156-175                      | cancelCheckInInstance instances.ts:906                            | No undo restore                                                                                                    |
| Recurring occurrences           | W06      | model.ts:1055-1081                         | CheckInScheduleRule :1483; generation horizon T+56 (PLAN.md:1080) | Canvas unbounded (GAP-MATRIX CONFLICT)                                                                             |
| Filters + timezone caption      | W06      | check-ins.tsx:297-329                      | CheckInScheduleRule.timezone :1492                                | Canvas asserts one global zone                                                                                     |
| Training bookings on calendar   | none     | not drawn                                  | TrainingSessionBooking :1843                                      | KEPT, FLAGGED                                                                                                      |

Auth/role: requireWorkspaceAccess (route-guard.ts:70); per-client calendar action at clients/[clientProfileId]/checkins/actions.ts:362.
Owning wave: PR-SV1 read model (PLAN.md:1164); UI wiring in PR-W6 (PLAN.md:1707) UNVERIFIED as explicit. Gaps: 7.

## Screen 22: Parameters (coach side)

Canvas: ParameterValue frontend/src/components/coach/ui.tsx:314-327; catalog model.ts:50-68, 92-552; FieldConfig model.ts:565. Backend: app/workspace/[workspaceId]/parameters/page.tsx and actions.ts; lib/coaching/parameters.ts.

| item                                         | brief id | canvas file:line        | backend file:line or MISSING                                                | gap note                         |
| -------------------------------------------- | -------- | ----------------------- | --------------------------------------------------------------------------- | -------------------------------- |
| Catalog id/name/group                        | T01      | model.ts:50-53, 92      | ParameterDefinition :777-783; listParameters lib/coaching/parameters.ts:541 | OK                               |
| Units list per parameter                     | T03      | model.ts:54, 565        | unit :785 single                                                            | Mismatch                         |
| Rating 1-10 / 1-5 / words                    | T03      | model.ts:70             | RatingScheme :750-754                                                       | OK                               |
| Input types                                  | T01      | model.ts:57-66          | ParameterKind :741-748                                                      | Six canvas types unmodelled      |
| Per-parameter calculations                   | R02      | model.ts:56, 69         | MISSING                                                                     |                                  |
| Sample values                                | T04      | model.ts:55; ui.tsx:324 | DailyEntryRevisionValue :1069                                               | Mock only                        |
| Cycle group                                  | T01      | tracker-setup.ts:10-12  | classification CYCLE :762-765; classifyParameter parameters.ts:830          | Parked (D12)                     |
| Create/edit/archive parameter (backend only) | T01      | no canvas manager       | parameters.ts:650, :697, :904                                               | Backend orphan, no canvas screen |

Auth/role: requireSessionUser + guarded service (parameters/page.tsx:39-47); flag isCoachingTemplatesEnabled (parameters/actions.ts:6).
Owning wave: selection in PR-W3 (PLAN.md:1557); manager UI UNASSIGNED. Gaps: 5.

## Screen 23: Client setup

Canvas: frontend/src/components/coach/plans/setup-ui.tsx (ClientGoalsEditor :360, ClientHabitsEditor, ClientPlansSummary); tracker-setup.ts; roadmap-preview.ts. Backend: app/workspace/[workspaceId]/client-setups/page.tsx and actions.ts; lib/coaching/client-setup.ts.

| item                                     | brief id | canvas file:line                     | backend file:line or MISSING                                             | gap note                                    |
| ---------------------------------------- | -------- | ------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------- |
| Configured from template                 | W10      | setup-ui.tsx:78-81, 217-220          | ClientSetup/Pin :917-993                                                 | OK                                          |
| Assign template                          | W10      | setup-ui.tsx:224-237                 | assignTemplate client-setups/actions.ts:128                              | OK                                          |
| Cancel/replace assignment                | W10      | clients.tsx / workspace.tsx          | cancelSetupAssignment actions.ts:160; client-setup.ts:700                | OK                                          |
| Plans & targets rows                     | N08, P03 | setup-ui.tsx:36-48, 127-178, 241-273 | MealPlan :1672; TrainingProgram :1750                                    | Lifecycle vocabulary mismatch               |
| Nutrition detail cadence/kcal/protein    | N03      | setup-ui.tsx:50-76, 100-116          | MealPlanVersion :1706                                                    | Computed totals UNVERIFIED                  |
| Goals editor                             | R04      | setup-ui.tsx:360-560                 | MISSING                                                                  | No goal model (grep "goal" in schema: none) |
| Goal field gating                        | T02      | setup-ui.tsx:336-358                 | CoachingTemplateVersionParameter :876-891                                | Inputs exist                                |
| Habits editor name/frequency/goal/reason | habits   | setup-ui.tsx:562-654                 | createHabit lib/habits/service.ts:411; editHabit :490; archiveHabit :629 | reason MISSING; frequency text vs bitmask   |
| Roadmap targets from goals               | R04      | roadmap-preview.ts:25-96             | MISSING                                                                  |                                             |
| Overview pins                            | T04      | tracker-setup.ts:20-32               | version definition Json :853                                             | Config blob                                 |

Auth/role: requireClientSetupAccess (route-guard.ts:139); rbac clientSetups (lib/auth/rbac.ts:333-340).
Owning wave: PR-W3 (PLAN.md:1557); habits PR-W5 (PLAN.md:1657); goals PR-W4 (PLAN.md:1607). Gaps: 5.

## Screen 24: Notes and to-dos

Canvas: frontend/src/components/coach/notes.tsx.

| item                        | brief id | canvas file:line                 | backend file:line or MISSING | gap note                         |
| --------------------------- | -------- | -------------------------------- | ---------------------------- | -------------------------------- |
| Workspace note              | W07      | notes.tsx:37-42; model.ts:717    | MISSING                      | PR-M3 lib/notes (PLAN.md:825)    |
| Client-linked note          | W04, W07 | notes.tsx:39-41                  | MISSING                      | GAP-MATRIX V3-L1-ClientNote      |
| Workspace to-do             | W07      | notes.tsx:43-48; model.ts:718    | MISSING                      | ClientTask :1560 is client scope |
| Client-linked to-do         | W07      | notes.tsx:49-56                  | MISSING                      |                                  |
| Search                      | W07      | notes.tsx:201-205                | MISSING                      |                                  |
| Scope select                | W07      | notes.tsx:206-215                | MISSING                      |                                  |
| Open / Completed / All tabs | W07      | notes.tsx:226-239                | MISSING                      |                                  |
| Add dialog with destination | W07      | notes.tsx:338-394                | MISSING                      |                                  |
| Edit                        | W07      | notes.tsx:65-69, 343-361         | MISSING                      |                                  |
| Delete with undo            | W07      | notes.tsx:163-168                | MISSING                      |                                  |
| Toggle complete             | W07      | notes.tsx:247-254 (spot-checked) | MISSING                      |                                  |
| Owner chip to profile       | W07      | notes.tsx:169-181                | MISSING                      |                                  |

Auth/role: none yet; convention requireWorkspaceAccess (route-guard.ts:70) plus in-transaction authorize as in lib/tasks/service.ts:4-10.
Owning wave: PR-W10 (PLAN.md:1907) on PR-M3 (PLAN.md:817-832). Gaps: 12.

## Screen 25: Messaging

Canvas: frontend/src/components/coach/messages.tsx; media.tsx.

| item                                     | brief id | canvas file:line                                | backend file:line or MISSING                      | gap note                                        |
| ---------------------------------------- | -------- | ----------------------------------------------- | ------------------------------------------------- | ----------------------------------------------- |
| Conversation list                        | M01      | messages.tsx:60-68, 200-260                     | MISSING                                           | No Conversation/Message model                   |
| Search + All/Unread/Flagged              | M03      | messages.tsx:184-199                            | MISSING                                           |                                                 |
| Mark read on open                        | M01      | messages.tsx:96-104                             | MISSING                                           | GAP-MATRIX CONFLICT: brief has no read tracking |
| Thread bubbles, dividers                 | M01      | messages.tsx:360-456                            | MISSING                                           |                                                 |
| Attachments                              | M01      | messages.tsx:391-393, 677-704; media.tsx:44-128 | MISSING; lib/storage.ts presign only              | PR-MEDIA (PLAN.md:1357)                         |
| Voice note                               | M01      | messages.tsx:660-662, 734-749                   | MISSING                                           | Demo recorder                                   |
| Reply snippets                           | M03      | messages.tsx:35-39 (spot-checked), 527-544      | MISSING                                           | Hard-coded                                      |
| Context links                            | M02      | messages.tsx:556-609                            | MISSING                                           |                                                 |
| Send + drafts                            | M01      | messages.tsx:123-160                            | MISSING                                           |                                                 |
| Priority flag gated by client permission | W08, M04 | messages.tsx:161-169, 425-451                   | MISSING                                           | No priority column (spot-checked)               |
| Availability caption                     | M03      | messages.tsx:173-175                            | MISSING                                           |                                                 |
| Athlete context panel                    | M02      | messages.tsx:754-854                            | partial: CheckInInstance, CoachingTemplateVersion |                                                 |
| Thread search                            | M03      | messages.tsx:315-342                            | MISSING                                           |                                                 |
| Emoji, scroll pill                       | none     | messages.tsx:508-526, 463-476                   | n/a                                               | UI                                              |

Auth/role: none yet. Owning wave: PR-MSG (PLAN.md:1406), depends on PR-MEDIA (PLAN.md:1357) and PR-W0 (PLAN.md:1456). No W-wave. Gaps: 13.

## Screen 26: Settings and appearance

Canvas: frontend/src/components/coach/coach-app.tsx:289-368; appearance-controls.tsx; frontend/src/lib/ethereal-appearance.tsx.

| item                       | brief id | canvas file:line                     | backend file:line or MISSING | gap note                                                  |
| -------------------------- | -------- | ------------------------------------ | ---------------------------- | --------------------------------------------------------- |
| Light/dark mode            | none     | appearance-controls.tsx:117-162      | MISSING                      | Workspace :160-202 has no appearance; planned PLAN.md:628 |
| Accent colour              | none     | appearance-controls.tsx:163-233      | MISSING                      |                                                           |
| Workspace logo upload      | none     | appearance-controls.tsx:235-295      | MISSING                      | dataUrl vs planned media id                               |
| Availability text          | M03      | coach-app.tsx:303-318 (spot-checked) | MISSING                      |                                                           |
| Notification toggles       | M03      | coach-app.tsx:319-339                | MISSING                      |                                                           |
| Sidebar collapsed (member) | none     | coach-app.tsx:152-176                | MISSING                      | WorkspaceMember :204-279                                  |
| Reset mockup               | none     | coach-app.tsx:343-361                | n/a                          | Demo                                                      |

Auth/role: requireWorkspaceAccess (route-guard.ts:70); member-scoped for sidebar (PLAN.md:782).
Owning wave: PR-W10 (PLAN.md:1907); backend PR-M2 lib/workspace/preferences.ts (PLAN.md:768-783). Gaps: 6.

## Summary

Blocker = needs a new model, a contract change or an owner decision before the screen can be wired (y), versus wiring onto existing or already-planned services (n).

| screen                        | W-wave (PLAN.md line)                      | gaps | blocker                                                   |
| ----------------------------- | ------------------------------------------ | ---- | --------------------------------------------------------- |
| 1 Roster                      | PR-W2 (1505), PR-SV1 (1164)                | 11   | y (ClientProfile fields, attention read)                  |
| 2 Client profile              | PR-W2 (1505), PR-W10 (1907), PR-MSG (1406) | 14   | y (notes, priority, task-completion conflict)             |
| 3 Profile habits tab          | PR-W5 (1657)                               | 4    | n                                                         |
| 4 Client 360 preview          | PR-W3 (1557)                               | 10   | n (inherits other screens' blockers)                      |
| 5 Tracker today               | PR-W4 (1607), PR-SV2 (1226)                | 6    | y (staff write scope, structured kinds)                   |
| 6 Tracker week                | PR-W4 (1607)                               | 2    | n                                                         |
| 7 Trends                      | PR-W4 (1607)                               | 5    | n                                                         |
| 8 Template library            | PR-W3 (1557)                               | 8    | n                                                         |
| 9 Template editor             | PR-W3 (1557), PR-M4 (630, 875)             | 24   | y (template definition contract)                          |
| 10 Assign dialog              | PR-W3 (1557)                               | 3    | y (snapshot vs version pin)                               |
| 11 Dashboard builder          | PR-W9 (1857), PR-M9 (1115)                 | 3    | n                                                         |
| 12 Widget data                | PR-W9 (1857), PR-SV3 (1260)                | 11   | n                                                         |
| 13 Plan workspace (nutrition) | PR-W7 (1757)                               | 7    | n                                                         |
| 14 Meal plan editor           | PR-W7 (1757)                               | 9    | y (food portions, schedule, decision 115)                 |
| 15 IIFYM editor               | PR-W7 (1757)                               | 6    | y (target-mode shape, decision 115)                       |
| 16 Food search                | PR-W7 (1757)                               | 4    | n                                                         |
| 17 Training editor            | PR-W8 (1807), PR-M6 (970)                  | 8    | y (per-set shape)                                         |
| 18 Exercise library           | PR-W8 (1807), PR-M6 (980)                  | 6    | y (no coach-editable library model)                       |
| 19 Muscle volume              | PR-W8 (1807), PR-M6 (981)                  | 5    | n (after 17)                                              |
| 20 Check-in review            | PR-W6 (1707)                               | 11   | y (media, set notes, feedback bundle, decisions D-09/114) |
| 21 Check-in calendar          | PR-SV1 (1164), PR-W6 (1707) UNVERIFIED     | 7    | n                                                         |
| 22 Parameters                 | PR-W3 (1557); manager UNASSIGNED           | 5    | n                                                         |
| 23 Client setup               | PR-W3 (1557), PR-W4 (1607), PR-W5 (1657)   | 5    | y (no goal model)                                         |
| 24 Notes and to-dos           | PR-W10 (1907), PR-M3 (817)                 | 12   | y (no model)                                              |
| 25 Messaging                  | PR-MSG (1406), no W-wave                   | 13   | y (no model)                                              |
| 26 Settings                   | PR-W10 (1907), PR-M2 (768)                 | 6    | n (planned columns)                                       |
| Total                         |                                            | 205  | 15 y                                                      |

## Brief functions with no canvas screen and no backend

- N04 food logging: barcode scan, custom food, quick add. No canvas match (rg "barcode", "quick.?add", "custom food" over frontend/src: none) and no food-log model or service (rg over lib, db/schema.prisma: none). Backend catalog search exists (lib/nutrition/search.ts:30-61) but only as a reference list.
- P05 future coach notes on a set. No canvas match (rg "future set", "coach note.*set": none) and no backend field (TRAINING_FIELD_KEYS lib/trainingprogram/payload.ts:33-44).

Close calls, not in the list: N06 consumed vs remaining has canvas widgets (builder/nutrition-history.tsx) but no food-log backend. P04 client set notes have a coach display (check-ins.tsx:576-609) but no backend. W11 onboarding form builder and the T01 parameter manager have backend (app/workspace/[workspaceId]/onboarding/forms/, lib/coaching/parameters.ts:650-904) but no coach canvas screen.

## Corrections made while merging

- One sub-agent claimed ParameterKind lacks TIME and DURATION; it has both (db/schema.prisma:744-745). The tables above use the corrected value.
- Brief ids were normalized against spec/core-coaching-system-brief.html:274-283: P07 program type, P08 carry-forward, P02 volume, N03 target options, N08 variants and history, C06 video feedback, C07 change summary.
