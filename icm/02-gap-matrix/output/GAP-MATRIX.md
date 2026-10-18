# Consolidated gap matrix

Source rows are from Team F S01–S12. V1–V3 verdicts are applied below. Each line points to the surface file row for the full evidence and wiring notes.

## Summary by surface

| Surface | WIRED | UNWIRED | UNCONFIGURED | PARTIAL | MISSING | CONFLICT | Total |
|---|---:|---:|---:|---:|---:|---:|---:|
| S01 | 0 | 1 | 3 | 21 | 19 | 0 | 44 |
| S02 | 0 | 1 | 0 | 3 | 21 | 6 | 31 |
| S03 | 0 | 0 | 5 | 14 | 4 | 4 | 27 |
| S04 | 0 | 0 | 7 | 5 | 1 | 0 | 13 |
| S05 | 0 | 0 | 1 | 13 | 13 | 3 | 30 |
| S06 | 0 | 1 | 1 | 8 | 6 | 6 | 22 |
| S07 | 0 | 1 | 3 | 14 | 8 | 4 | 30 |
| S08 | 0 | 11 | 4 | 5 | 18 | 0 | 38 |
| S09 | 0 | 1 | 5 | 16 | 9 | 4 | 35 |
| S10 | 0 | 3 | 3 | 5 | 10 | 0 | 21 |
| S11 | 0 | 6 | 6 | 9 | 8 | 3 | 32 |
| **Total** | 0 | 25 | 38 | 113 | 117 | 30 | 323 |

## Arithmetic and Team F delta

Team F baseline: 281 canvas rows = 0 WIRED + 24 UNWIRED + 36 UNCONFIGURED + 106 PARTIAL + 97 MISSING + 18 CONFLICT. V2 changes S06-03 from UNWIRED to UNCONFIGURED, so the Team F 281-row subtotal becomes 0 + 23 + 37 + 106 + 97 + 18 = 281.

Verification additions: 55 H-ONLY elements. Status-bearing additions: CONFLICT 12, MISSING 20, PARTIAL 7, UNCONFIGURED 1, UNWIRED 2. N/A UI or dead-code rows do not change the status totals.

Consolidated delta from Team F: +55 H-ONLY canvas elements, including 42 status-bearing elements and 13 N/A findings. The status-bearing total rises from 281 to 323.

## Non-WIRED elements by surface

Every Team F row remains, except S06-03 is corrected to UNCONFIGURED by V2. Row detail and evidence stay in the cited S-file row.

### S01 surface

| Row | Status | Element | Evidence row |
|---|---|---|---|
| S01-01 | PARTIAL | /coach page mounts the whole workspace client-side inside Suspense | `S01-*.md` |
| S01-02 | PARTIAL | Sidebar brand: uploaded logo image or "infinity." wordmark plus "COACH WORKSPACE" label | `S01-*.md` |
| S01-03 | PARTIAL | Section nav: Clients, Templates, Check-ins, Messages, Notes & to-dos | `S01-*.md` |
| S01-04 | MISSING | Nav count badges: pending check-ins and unread messages | `S01-*.md` |
| S01-05 | PARTIAL | Account block: initials avatar, coach name, "Coach" role, opens preferences dialog | `S01-*.md` |
| S01-06 | MISSING | Sidebar collapse toggle with persisted state | `S01-*.md` |
| S01-07 | PARTIAL | Utility header breadcrumb: Workspace / Section / Editor | `S01-*.md` |
| S01-08 | PARTIAL | Dark/light mode toggle in header | `S01-*.md` |
| S01-09 | MISSING | "Local demo" / "Session only" storage indicator | `S01-*.md` |
| S01-10 | MISSING | Workspace preferences dialog: accent picker, logo upload, availability text, in-app notification toggles, reset-mockup | `S01-*.md` |
| S01-11 | MISSING | Toast notice with Undo action | `S01-*.md` |
| S01-12 | PARTIAL | Client-side route model ?section&client&editor&review&plan&tab + navigation guard ref | `S01-*.md` |
| S01-13 | MISSING | Whole-state persistence: localStorage key coach-desktop-mockup-v1, isCoachState validation, migrate+normalize on hydrate | `S01-*.md` |
| S01-14 | PARTIAL | Client roster list: all non-archived clients with avatar, name, label, phase/week, assignment, next check-in, attention signals | `S01-*.md` |
| S01-15 | MISSING | Roster search box (matches name, label, phase, assigned template name) | `S01-*.md` |
| S01-16 | MISSING | Roster filter select: All athletes / Needs attention / Unread messages | `S01-*.md` |
| S01-17 | MISSING | Roster sort select: Name / Attention / Next check-in | `S01-*.md` |
| S01-18 | MISSING | Table vs card view toggle | `S01-*.md` |
| S01-19 | PARTIAL | Roster columns "Assigned template" and "Next check-in", card "Coaching since" | `S01-*.md` |
| S01-20 | UNWIRED | Client create — not drawn in canvas (roster has no Add/New control; seed clients only) | `S01-*.md` |
| S01-21 | MISSING | Client edit/archive: canvas stores archived (consumed by roster/messages/notes filters) and name; no edit UI drawn | `S01-*.md` |
| S01-22 | PARTIAL | Client profile header: avatar, name, label, phase, week, email, coaching since, height cm, next check-in summary | `S01-*.md` |
| S01-23 | PARTIAL | Profile header actions: "Check-in calendar" and "Open chat" with unread count | `S01-*.md` |
| S01-24 | PARTIAL | Profile tab bar: Overview / Plans / Check-ins / Notes & tasks / Onboarding (via ?tab=) | `S01-*.md` |
| S01-25 | UNCONFIGURED | Overview "Client setup" card: current bodyweight stat | `S01-*.md` |
| S01-26 | PARTIAL | Overview "Client setup" card: assigned template summary (name, views, nutrition mode, habits on/off) + "Preview assigned tool" | `S01-*.md` |
| S01-27 | PARTIAL | "Assign template" / "Change assignment" dialog with setup review and Assign & personalize | `S01-*.md` |
| S01-28 | PARTIAL | "Coaching rhythm" weekday toggles: multi-day recurring schedule effective tomorrow, history retained | `S01-*.md` |
| S01-29 | PARTIAL | Additional dates list + Add/Reschedule dialog (athlete, date, type Full/Custom, note to athlete, duplicate guard) | `S01-*.md` |
| S01-30 | MISSING | Per-client "Allow priority flags" toggle (priority messages) | `S01-*.md` |
| S01-31 | MISSING | Notes & tasks tab: private coach notes (visible only in workspace) + general coaching notes | `S01-*.md` |
| S01-32 | MISSING | Coach to-dos per client (checkbox list, add) | `S01-*.md` |
| S01-33 | PARTIAL | Client-assigned tasks: add (dueDate = today+7 fixed), list with checkbox, overdue/completed counts | `S01-*.md` |
| S01-34 | PARTIAL | Check-ins tab: submission history rows (date, type, note/answer preview, status, open review) | `S01-*.md` |
| S01-35 | UNCONFIGURED | Onboarding tab: submitted onboarding Q&A retained with the profile | `S01-*.md` |
| S01-36 | UNCONFIGURED | Store slice: templates + editorDrafts (owned by templates surface) | `S01-*.md` |
| S01-37 | PARTIAL | Store slices: submissions + reviewDrafts + extras + schedules (owned by check-ins surface) | `S01-*.md` |
| S01-38 | MISSING | Store slices: messages + drafts + media attachments (owned by messages surface) | `S01-*.md` |
| S01-39 | PARTIAL | Store slices: client.plans, habits, retiredHabits, entries, exerciseLibrary, coach-level plan (owned by plans/habits/daily surfaces) | `S01-*.md` |
| S01-40 | MISSING | Store slices: coachNotes + coachTodos top-level (owned by notes surface) | `S01-*.md` |
| S01-41 | PARTIAL | Shared canvas UI primitives + polish styles (Button, IconButton, Avatar, SearchBox, Select, Toggle, Empty, Dialog, PageTitle, Surface, Transition, Status, previews) | `S01-*.md` |
| V1-C6 | MISSING | Empty roster state, “No athletes match” with Clear filters | S01 shell roster, clients.tsx:149-164 |
| V1-C7 | MISSING | Athlete not found state with Back to athletes | S01 shell roster, clients.tsx:93-107 |
| V3-RT03 | N/A | /coach product route surface | S01 shell, frontend/src/app/coach/page.tsx:12 |
| V3-CP17 | N/A | Client preview empty states | S01 shell, client-preview.tsx:891,909 |
| V3-H4-08 | N/A | CI runs duplicate build, single workflow | S12 orphans, ci.yml:48; playwright.config.ts:18 |
| V3-L1-CoachState | MISSING | CoachState aggregate has no backend equivalent | S01 shell, coach/model.ts:714-739 |

### S02 surface

| Row | Status | Element | Evidence row |
|---|---|---|---|
| S02-01 | MISSING | Conversations panel: search, All/Unread/Flagged tabs, per-client rows (avatar, name, last-message time, excerpt or "Draft:" prefix, unread badge, priority flag icon) | `S02-*.md` |
| S02-02 | PARTIAL | Chat header: back button, avatar, athlete name + "label · phase" link to profile, thread-search toggle, context-panel toggle | `S02-*.md` |
| S02-03 | MISSING | Thread search bar + match count inside a conversation | `S02-*.md` |
| S02-04 | MISSING | Message thread: date dividers, text bubbles by sender, attachments via MediaCard, context links, per-message time, empty state | `S02-*.md` |
| S02-05 | CONFLICT | Read state: unread badges, auto mark-read on open, per-message "read" indicator with check icon on coach messages | `S02-*.md` |
| S02-06 | MISSING | Priority flag: flag toggle on client messages, priority bubble label, per-athlete priorityMessages permission + context-panel display; managed on the client profile | `S02-*.md` |
| S02-07 | MISSING | Composer: textarea, Enter to send / Shift+Enter newline, Send button, per-client draft persistence (text + attachments + link survive navigation via localStorage) | `S02-*.md` |
| S02-08 | CONFLICT | Attachment affordance: "Choose photo, video or file" picker, 20 MB client-side cap, preview strip with remove, file input | `S02-*.md` |
| S02-09 | CONFLICT | Context links in composer and bubbles: "Link nutrition plan", "Link training program", "Link latest check-in", rendered as in-bubble nav buttons | `S02-*.md` |
| S02-10 | MISSING | Emoji picker (fixed 8-emoji grid inserting into draft) | `S02-*.md` |
| S02-11 | MISSING | Reusable replies menu (3 hardcoded SNIPPETS appended to draft) | `S02-*.md` |
| S02-12 | CONFLICT | Voice note button + dialog using DemoRecorder kind="voice" (synthesized demo wav, attach to draft) | `S02-*.md` |
| S02-13 | MISSING | "New message" scroll pill + per-thread scroll-position memory | `S02-*.md` |
| S02-14 | PARTIAL | AthleteContext side panel: avatar, name, "phase · Week n", next check-in + Open calendar, assigned template + tab count, priority permission display, awaiting-check-in/profile/plan link buttons | `S02-*.md` |
| S02-15 | MISSING | Coach availability caption under the Messages title ("Weekdays · 09:00–18:00") | `S02-*.md` |
| S02-16 | MISSING | Welcome/empty states: "A conversation, with the whole picture" panel and "Say hello to {name}" empty thread | `S02-*.md` |
| S02-17 | MISSING | Notes toolbar: search box + scope select ("Everyone & workspace" / "Workspace only" / per athlete) | `S02-*.md` |
| S02-18 | MISSING | Private notes column, workspace scope: list, count, edit/delete | `S02-*.md` |
| S02-19 | MISSING | Client-linked private notes: same list rows with athlete owner chip; stored on client.internalNotes | `S02-*.md` |
| S02-20 | MISSING | Workspace to-dos: Open/Completed/All status tabs, checkbox toggle, edit/delete | `S02-*.md` |
| S02-21 | PARTIAL | Client-linked to-dos (client.coachTasks {id,title,complete}) in the same column with athlete owner chip | `S02-*.md` |
| S02-22 | MISSING | Add/Edit dialog for notes and to-dos: "Keep in" destination select (workspace vs athlete), textarea, Save; delete with undo toast | `S02-*.md` |
| S02-23 | UNWIRED | Owner chip on note/todo rows linking to the athlete profile | `S02-*.md` |
| S02-24 | CONFLICT | MediaCard: type icon, name, size/"Local demo media" label, remove; image preview link, audio/video players, download link; "Media kept as metadata after reload. Reattach to preview." fallback | `S02-*.md` |
| S02-25 | CONFLICT | DemoRecorder: record → preview → discard/attach for "voice" (synthesized wav) and "video" (canvas-capture webm); used for voice notes here and video feedback in check-ins | `S02-*.md` |
| S02-26 | MISSING | Persisted workspace shape: messages, drafts, notes, todos, media metadata under localStorage key "coach-desktop-mockup-v1"; blobs are session-only object URLs revoked on unload | `S02-*.md` |
| V1-X2 | MISSING | Load demo audio preview button | S02 messages media, media.tsx:107-111 |
| V3-L1-Media | MISSING | Media type has no backend model | S02 messages media, coach/model.ts:666-672 |
| V3-L1-Message | MISSING | Message type has no backend model | S02 messages, coach/model.ts:673-685 |
| V3-L1-CoachTask | MISSING | CoachTask and coachTodos have no backend model | S02 notes, clients/model.ts:14 |
| V3-L1-ClientNote | MISSING | ClientNote, internalNotes and generalNotes have no backend model | S02 notes, clients/model.ts:22,31-32 |

### S03 surface

| Row | Status | Element | Evidence row |
|---|---|---|---|
| V2-WS04 | PARTIAL | Check-in schedule card in setup page | S03 check-ins, workspace.tsx:199 |
| S03-01 | MISSING | Coach "Check-ins" page shell, one workspace-wide board for all athletes | `S03-*.md` |
| S03-02 | PARTIAL | Calendar board: Week 7-column, Month grid, Agenda list, prev/next/Today, per-day add buttons; events for every athlete in range | `S03-*.md` |
| S03-03 | PARTIAL | Filters: Athlete select, Status select, "Europe/Vienna · Monday first" caption | `S03-*.md` |
| S03-04 | UNCONFIGURED | "N awaiting feedback" pending count | `S03-*.md` |
| S03-05 | PARTIAL | Event status values: Scheduled / Overdue / Awaiting feedback / Feedback sent | `S03-*.md` |
| S03-06 | PARTIAL | Event chip: athlete avatar + name, "origin · type" label | `S03-*.md` |
| S03-07 | PARTIAL | Event detail popover: "Check-in details", date, status, Origin, Update rows, extra note, Open review/feedback, Open conversation, View athlete profile | `S03-*.md` |
| S03-08 | PARTIAL | "Add extra date" dialog: athlete, date (min today), "Requested update" Custom/Full, note to athlete, duplicate guard | `S03-*.md` |
| S03-09 | PARTIAL | Reschedule additional date / Remove additional date with undo toast | `S03-*.md` |
| S03-10 | PARTIAL | Recurring weekly check-in schedule: weekday toggles, effective from tomorrow, history retained | `S03-*.md` |
| S03-11 | CONFLICT | Recurring occurrences auto-appear on the calendar derived from the schedule, unbounded horizon | `S03-*.md` |
| S03-12 | UNCONFIGURED | Review workspace mount via route.review deep link | `S03-*.md` |
| S03-13 | PARTIAL | "In X's words" answer list + athlete note | `S03-*.md` |
| S03-14 | MISSING | Submitted visuals grid + lightbox dialog | `S03-*.md` |
| S03-15 | PARTIAL | "Tracker & progress" panel inside review: parameter values, habit consistency, 7-day entries table | `S03-*.md` |
| S03-16 | MISSING | Flagged training notes panel (exercise, set, date, note, open training setup) | `S03-*.md` |
| S03-17 | PARTIAL | Sent-feedback view: text, sent date, "Sent locally" caption | `S03-*.md` |
| S03-18 | CONFLICT | Video feedback: DemoRecorder attach + MediaCard in draft and sent feedback | `S03-*.md` |
| S03-19 | CONFLICT | Plan adjustments bundled with feedback: Nutrition/Training activated cards, "Changes included with feedback" list, "View updated client plan" links | `S03-*.md` |
| S03-20 | CONFLICT | Feedback lands in the client conversation as a message with links; "View in conversation" | `S03-*.md` |
| S03-21 | MISSING | Composer draft auto-kept per submission ("Draft kept automatically. Opening a review does not mark it answered.") | `S03-*.md` |
| S03-22 | PARTIAL | "Submit feedback" single click marks the submission answered and sends | `S03-*.md` |
| S03-23 | UNCONFIGURED | Client fills and submits the check-in questionnaire (implied data source; canvas draws no client UI) | `S03-*.md` |
| S03-24 | UNCONFIGURED | Submission history list on client profile "Check-ins" tab (cross-surface, drawn in clients.tsx) | `S03-*.md` |
| S03-25 | PARTIAL | Check-in question set per template variant: label, type, required, options | `S03-*.md` |
| V3-CP15 | UNCONFIGURED | Check-in form preview in client preview | S03 check-ins, client-preview.tsx:842,852 |

### S04 surface

| Row | Status | Element | Evidence row |
|---|---|---|---|
| S04-01 | UNCONFIGURED | Habits tab header: title, today's date line, "N of M checked today" | `S04-*.md` |
| S04-02 | UNCONFIGURED | Week strip, Mon-Sun, today highlighted | `S04-*.md` |
| S04-03 | UNCONFIGURED | Filter buttons All / To do / Done + filtered-empty block | `S04-*.md` |
| S04-04 | PARTIAL | Habit row: name, "frequency · goal" line, reason paragraph, state pill | `S04-*.md` |
| S04-05 | UNCONFIGURED | Done toggle button with animated check (Mark done / Undo) | `S04-*.md` |
| S04-06 | UNCONFIGURED | Empty states: "No habits set up / defined in client setup" and filtered-empty "Show all habits" | `S04-*.md` |
| S04-07 | PARTIAL | "Recorded completions" aside: per-habit cumulative completed count + frequency/goal + "dated habit history is not available" note | `S04-*.md` |
| S04-08 | PARTIAL | Coach habit manager: list with "{n} completions", add/edit form (name, frequency, goal, reason), archive to retiredHabits | `S04-*.md` |
| S04-09 | PARTIAL | Template-level "Include Habit Tracker" toggle + preview + gating of the client Habits tab on variant.habits; "Habits: enabled/off" shown in assign dialog and profile summary | `S04-*.md` |
| S04-10 | MISSING | "Include habit status in check-ins" toggle + check-in review row "Habit consistency X / 7 days" | `S04-*.md` |
| S04-11 | UNCONFIGURED | Plans-summary "Habits" module row (count, "Edit/Configure habits" nav) gated on setup.habits; disabled-state empty "Habit Tracker is not enabled" | `S04-*.md` |
| S04-12 | PARTIAL | Persisted canvas shape: CoachClient.habits[] + retiredHabits[] inside coach-desktop-mockup-v1 localStorage state | `S04-*.md` |
| S04-13 | UNCONFIGURED | Builder widgets "Today's habits" (TL21) and "Habit consistency" (TL22) over HabitRecord{scheduledDates,completions[date,status done/skipped]} | `S04-*.md` |

### S05 surface

| Row | Status | Element | Evidence row |
|---|---|---|---|
| S05-01 | PARTIAL | Template library screen: search box, count, template cards showing name, description, view/habit/nutrition tags, assigned-client count, edited date | `S05-*.md` |
| S05-02 | PARTIAL | Add template + "Resume draft" chips across drafts | `S05-*.md` |
| S05-03 | MISSING | Duplicate template ("Independent copy created") | `S05-*.md` |
| S05-04 | UNCONFIGURED | Rename template dialog | `S05-*.md` |
| S05-05 | CONFLICT | Delete template with undo toast; assigned clients keep their snapshot | `S05-*.md` |
| S05-06 | PARTIAL | Preview template dialog (full multi-tab client preview) | `S05-*.md` |
| S05-07 | PARTIAL | Assign dialog: client picker (search, non-archived), config summary, "Assign & personalize"; also inline assign in client profile | `S05-*.md` |
| S05-08 | PARTIAL | Editor shell: name input, unsaved-draft state, save (Cmd+S), restore saved, discard, leave/exit guard, section nav | `S05-*.md` |
| S05-09 | MISSING | Tabs section: description textarea + per-tab toggles (Dashboard, Tracker, Timeline/Roadmap, Nutrition, Training Program, Check-In) + Habits toggle | `S05-*.md` |
| S05-10 | MISSING | Dashboard config section (CoachDashboardEditor, bindDashboardUnits) | `S05-*.md` |
| S05-11 | PARTIAL | Tracker "Daily fields": ordered list, add/remove/reorder rows | `S05-*.md` |
| S05-12 | PARTIAL | Per-field settings: unit Select from parameter.units, choice-labels textarea (field.options override), period-start note | `S05-*.md` |
| S05-13 | PARTIAL | "Add parameter" library browser: grouped by category, search, availability counts, per-item Add | `S05-*.md` |
| S05-14 | PARTIAL | "Include cycle tracking" toggle, auto-adds bleeding-level + period-start, hides cycle params when off | `S05-*.md` |
| S05-15 | MISSING | "Daily overview" metric pins: up to 4 numeric fields, reorder/remove, add via select | `S05-*.md` |
| S05-16 | MISSING | Roadmap config: per-compatible-field toggle, calculation select (Weekly average/Trend/Target vs actual/Adherence), comparison flag | `S05-*.md` |
| S05-17 | MISSING | Phase selection toggle + comma-separated phase options | `S05-*.md` |
| S05-18 | MISSING | Nutrition mode segmented control (Meal plan / IIFYM macro targets) | `S05-*.md` |
| S05-19 | PARTIAL | Training section: eight prescription-field checkboxes | `S05-*.md` |
| S05-20 | MISSING | Reusable set choices: editable option lists + default per setType/progression/tempo/rest | `S05-*.md` |
| S05-21 | MISSING | Volume display toggle, breakdown label ("Muscle groups / week"), presentation Table/Heatmap | `S05-*.md` |
| S05-22 | PARTIAL | Check-In section: question CRUD (label, type, options, required, reorder, duplicate), included-summaries checkboxes, form preview (Full form/Custom update) | `S05-*.md` |
| S05-23 | MISSING | Habits section: Include Habit Tracker toggle, preview, "Include habit status in check-ins" | `S05-*.md` |
| S05-24 | CONFLICT | Variant machinery: variants[], defaultVariant, legacyConfigurations, Assignment.variantId, switchVariant, templateSetup/normalizeTemplateSetups collapse | `S05-*.md` |
| S05-25 | MISSING | Whole-state persistence: localStorage STORAGE_KEY, isCoachState validation, migrate + normalize on hydrate, "kept on this device" copy | `S05-*.md` |
| V1-L7 | N/A | Dead switchVariant helper, no screen caller | S05 templates, model.ts:998-1012 |
| V2-H4 | CONFLICT | Goal picker offers cycle-tracking parameters | S05 templates, setup-ui.tsx:342-346; decisions #73/#38 |
| V2-H9 | N/A | “Cycle” naming collision between meal schedule and menstrual-cycle data | S06 nutrition, nutrition/editor.tsx:27; authorization-model.md:53 |
| V3-L1-Plan | MISSING | Flat Plan entity has no backend model | S05 templates, coach/model.ts:635-643 |
| V3-L1-PlanVersion | PARTIAL | PlanVersion type differs from backend plan versioning | S05 templates, plans/types.ts:6-11 |
| V3-L1-PlanLifecycle | PARTIAL | PlanLifecycle type differs from backend lifecycle | S05 templates, plans/types.ts:12-16 |
| V3-L1-ClientPlans | MISSING | ClientPlans aggregate has no backend equivalent | S05 templates, plans/types.ts:74-81 |

### S06 surface

| Row | Status | Element | Evidence row |
|---|---|---|---|
| V3-CO02 | CONFLICT | Nutrition totals computed automatically | S06 nutrition, mealplan-workspace.tsx:850-857; decision #115 |
| S06-01 | PARTIAL | Plan lifecycle: draft + single active + history + archive, status labels, date-applicable selection | `S06-*.md` |
| S06-02 | PARTIAL | Plan name + startDate fields | `S06-*.md` |
| S06-03 | UNCONFIGURED | Variant ("option") tabs: add, rename, duplicate, delete options | `S06-*.md` |
| S06-04 | PARTIAL | Meal rows: name, time, frequency; add/remove/duplicate/reorder meals | `S06-*.md` |
| S06-05 | MISSING | Food portions inside a meal: food row = catalog food + quantity in food's own unit | `S06-*.md` |
| S06-06 | MISSING | Approved alternatives ("Swap" per portion: alt food + equivalent quantity + optional note) | `S06-*.md` |
| S06-07 | CONFLICT | Per-portion, per-meal and per-variant computed kcal/P/C/F display | `S06-*.md` |
| S06-08 | CONFLICT | Macro-energy distribution ring (P/C/F % at 4/4/9) in overview + IIFYM preview | `S06-*.md` |
| S06-09 | MISSING | Variant schedule: Every day / Weekly (training+rest roles, weekday strip, custom weekdays) / Repeating cycle (anchor date + steps 1–28d, ≤365d) | `S06-*.md` |
| S06-10 | MISSING | Saved meals library: save meal, search by meal/food, rename, duplicate, delete with undo, load into meal | `S06-*.md` |
| S06-11 | PARTIAL | Food database: 584 foods {id,name,amount,unit,protein,carbs,fat,calories} powering pickers + nutrient math | `S06-*.md` |
| S06-12 | PARTIAL | DatePicker + TimePicker themed popovers (calendar grid, Apply-commit time edit, Today/Clear) | `S06-*.md` |
| S06-13 | PARTIAL | Client plan preview: "Prepared for {client}", variant label, schedule instruction text, per-meal food/portion/swap table, meal totals | `S06-*.md` |
| S06-14 | PARTIAL | IIFYM editor: named target options; style Calories\|Macros; per-field Fixed\|Range\|Minimum values | `S06-*.md` |
| S06-15 | CONFLICT | IIFYM preview: target text, derived ~kcal from macro targets at 4/4/9, macro ring, schedule text | `S06-*.md` |
| S06-16 | PARTIAL | Plan validation on save/activate (name, valid start date, ≥1 option w/ positive portions, label/time validity, food refs exist, schedule completeness) | `S06-*.md` |
| V2-H2 | CONFLICT | Blank numeric inputs saved as zero, violates missing-is-not-zero | S06 nutrition, editor.tsx:1009; decision #115/#36 per V2 |
| V3-CP09 | MISSING | IIFYM day cards for training and rest days | S06 nutrition, client-preview.tsx:470,478 |
| V3-CP10 | CONFLICT | IIFYM macro distribution ring | S06 nutrition, client-preview.tsx:496,498; decision #115 |
| V3-CP11 | UNWIRED | ClientPlanPreview meal plan panel | S06 nutrition, client-preview.tsx:560,562 |
| V3-L1-IIFYM | MISSING | IifymOption and IifymPlan have no backend equivalent | S06 nutrition, plans/types.ts:17-25 |

### S07 surface

| Row | Status | Element | Evidence row |
|---|---|---|---|
| S07-01 | PARTIAL | Plans & targets "Training" module row: lifecycle status, plan name, start date, "N sessions · N weeks / Ongoing" detail | `S07-*.md` |
| S07-02 | PARTIAL | Plan meta: name input, "Starts" date picker, active-plan line; toolbar History/Preview draft/Save draft/Review & activate | `S07-*.md` |
| S07-03 | UNCONFIGURED | Draft persistence + unsaved-changes guard + "Saved draft and active client content are separate" | `S07-*.md` |
| S07-04 | PARTIAL | Activation-time validation error list + Review preview dialog | `S07-*.md` |
| S07-05 | PARTIAL | Activated plan history dialog: versions, retained prescription view, Discard draft, Archive active plan, Create replacement | `S07-*.md` |
| S07-06 | UNCONFIGURED | Week-based program structure + program length 1-52 + "overrides retained" note | `S07-*.md` |
| S07-07 | MISSING | Evergreen program mode ("Ongoing program", edits apply across program) | `S07-*.md` |
| S07-08 | UNCONFIGURED | Week nav strip W1..W52 + carry-forward override semantics ("edits apply until next override") | `S07-*.md` |
| S07-09 | PARTIAL | Session cards: add/rename/reorder/duplicate/remove | `S07-*.md` |
| S07-10 | PARTIAL | Exercise rows: name, muscle allocation select, library cue + snapshot banner, reorder/duplicate/remove | `S07-*.md` |
| S07-11 | PARTIAL | Per-set rows: index, reps, rep-range "Up to", tempo, type, rest selects, per-set instructions, add/remove set | `S07-*.md` |
| S07-12 | PARTIAL | Template-driven prescription field config (8 toggles + volume + breakdown + presentation) | `S07-*.md` |
| S07-13 | MISSING | Template option vocabularies + starting defaults for setType/progression/tempo/rest dropdowns | `S07-*.md` |
| S07-14 | PARTIAL | Exercise library: manage form (name, primary muscle enum, secondary groups multi-select, coaching notes), searchable picker, 10-item starter set, snapshot-on-pick | `S07-*.md` |
| S07-15 | CONFLICT | Weekly muscle volume panel: per-group working-set counts, unassigned row, Table or Heatmap presentation, total prescribed sets | `S07-*.md` |
| S07-16 | PARTIAL | Prescription read view: coach preview column, preview/history dialogs, client "Prescription for <date>" picker | `S07-*.md` |
| S07-17 | PARTIAL | Roadmap / Timeline tab: weekly rows (Mon-Sun), phase column + badge, per-metric cells (Weekly average / Trend / Adherence / Target vs actual), target from plans/goals, unit conversion | `S07-*.md` |
| S07-18 | MISSING | Goals editor (shared file): numeric field goals {fieldId, value, unit, date} feeding roadmap targets | `S07-*.md` |
| S07-19 | UNWIRED | Habits editor card (shared file, habits surface overlap): name/frequency/goal/reason, retire to retiredHabits | `S07-*.md` |
| S07-20 | MISSING | "Training Program" module visibility gate on the assigned setup (hidden module shows Empty, data retained) | `S07-*.md` |
| S07-21 | MISSING | Dashboard widget "Training week — Completed sessions" (source "sessions") | `S07-*.md` |
| S07-22 | MISSING | Activation records into check-in review draft (kind, versionId, name, startDate appended on activate when route.review) | `S07-*.md` |
| V1-L8 | N/A | Dead trainingSets helper, no screen caller | S07 training, model.ts:1173-1175 |
| V2-H5 | CONFLICT | Coach library notes render in client training view | S07 training, training/editor.tsx:307,907; authorization-model.md:59 |
| V2-H12 | CONFLICT | Authorization docs conflict on client training-plan write path | S07 training, authorization-model.md:34; product-decisions.md:1640 |
| V3-CP13 | CONFLICT | Muscle volume table | S07 training, client-preview.tsx:739,747; decision #116 |
| V3-CP14 | MISSING | Training session logbook | S07 training, client-preview.tsx:795,808 |
| V3-L1-TrainingSet | PARTIAL | TrainingSet, TrainingExercise and TrainingSession shapes differ | S07 training, plans/types.ts:26-57 |
| V3-L1-Exercise | PARTIAL | ExerciseDefinition is read-only in backend catalog | S07 training, plans/types.ts:35-41 |
| V3-L1-TrainingPlan | PARTIAL | TrainingPlan shape differs from backend | S07 training, plans/types.ts:58-66 |
| V3-L1-ClientGoal | MISSING | ClientGoal has no backend equivalent | S07 training, plans/types.ts:67-73 |

### S08 surface

| Row | Status | Element | Evidence row |
|---|---|---|---|
| S08-01 | PARTIAL | Persisted dashboard draft document | `S08-*.md` |
| S08-02 | UNCONFIGURED | Coach dashboard editor screen (name input, canvas, card tools) | `S08-*.md` |
| S08-03 | UNWIRED | Dashboard name input (<=80, blur commit, rename) | `S08-*.md` |
| S08-04 | PARTIAL | Widget gallery: 19-kind library, category groups, search, staging, live preview, configure/replace forms | `S08-*.md` |
| S08-05 | PARTIAL | Widget settings form fields (title, source, summary, period, historyPeriod, target, size, fields, labels, option, unit) | `S08-*.md` |
| S08-06 | MISSING | Per-widget audience visibility (staff vs client) | `S08-*.md` |
| S08-07 | PARTIAL | Per-breakpoint layout rects and widths (desktop/tablet/mobile; x/y/w/h/size; mobile w=columns) | `S08-*.md` |
| S08-08 | UNWIRED | Drag/resize/keyboard gestures, size presets, move-step, reorder, auto arrange, duplicate | `S08-*.md` |
| S08-09 | UNWIRED | Undo/redo history | `S08-*.md` |
| S08-10 | UNCONFIGURED | Autosave state line ("Template draft") and implicit saves | `S08-*.md` |
| S08-11 | UNWIRED | Reset dashboard dialog; Load example layout | `S08-*.md` |
| S08-12 | UNCONFIGURED | "Client preview" toggle / previewOnly render | `S08-*.md` |
| S08-13 | MISSING | Source detail dialog per widget (widgetDetailKey routes: metric/exercise/nutrition/workouts/recovery/habits/tasks/checkins/feedback/destination/chat) | `S08-*.md` |
| S08-14 | MISSING | BN21 custom metric card (bodyweight/waist/steps; latest/average/total; kg/lb, cm/in) | `S08-*.md` |
| S08-15 | MISSING | BN01 bodyweight trend + weekly-average + WoW delta | `S08-*.md` |
| S08-16 | MISSING | BN08 weekly bodyweight change (absolute/percentage) | `S08-*.md` |
| S08-17 | MISSING | BN15 macro target summary (protein/carbs/fat, TD/NTD, circles/lines, dated targets) | `S08-*.md` |
| S08-18 | MISSING | BN19 nutrition intake trend (line/stacked/single, nutrient, week..year, target bands) | `S08-*.md` |
| S08-19 | MISSING | TL26 current/next workout (prescriptions, workoutSchedule, exercise/sets/reps/coach instructions) | `S08-*.md` |
| S08-20 | MISSING | TL28 exercise performance trend (load/reps/sets per exercise) | `S08-*.md` |
| S08-21 | MISSING | TL06 step count (latest/average/total, bars, stepsTarget) | `S08-*.md` |
| S08-22 | MISSING | TL11 sleep duration (h/min, average/latest/history) | `S08-*.md` |
| S08-23 | MISSING | TL14 recovery ratings (energy/stress/readiness scales, latest/distribution/history) | `S08-*.md` |
| S08-24 | UNWIRED | TL21 today's habits (scheduled list, done/skipped/not-logged, client toggles, per-habit labels, contributions mode) | `S08-*.md` |
| S08-25 | UNWIRED | TL22 habit consistency (counts, calendar, contribution strip, historyPeriod) | `S08-*.md` |
| S08-26 | MISSING | CU01 weekly focus (phase strip, emphasis, successCue, published date) | `S08-*.md` |
| S08-27 | MISSING | CU02 this week at a glance (roadmap week metrics, WoW delta, targets, focus strip) | `S08-*.md` |
| S08-28 | UNWIRED | CU03 client tasks (due window, open/completed/both, toggle) | `S08-*.md` |
| S08-29 | UNWIRED | CU04 check-in status (next scheduled, latest submission, draft marker, recurring/additional filter) | `S08-*.md` |
| S08-30 | MISSING | CU06 coach feedback (excerpt, read flag, video flag, plan-change links) | `S08-*.md` |
| S08-31 | MISSING | CU09 selected roadmap metrics (weekly trends, per-metric target) | `S08-*.md` |
| S08-32 | MISSING | CU10 current phase progress (elapsed bar, week N of M, phase dates, published milestones, days remaining) | `S08-*.md` |
| S08-33 | UNWIRED | CU16 quick links launcher (destination list + labels + live captions) | `S08-*.md` |
| S08-34 | MISSING | recordsForCoach mapping variant+client to SourceRecords (fixture-driven preview data) | `S08-*.md` |
| S08-35 | UNWIRED | Dirty-guard on navigation while editing | `S08-*.md` |
| S08-36 | UNWIRED | Interactive writes inside preview (habit done/skipped, task complete, TD/NTD switch) | `S08-*.md` |
| S08-37 | UNCONFIGURED | ENABLE_CLIENT_DASHBOARD flag runtime; gates the whole surface (builder entry + client render) | `S08-*.md` |
| V3-BWA01 | PARTIAL | Content dispatcher shell with layout measure and data-kind | S08 dashboard, widget-content.tsx:223,274-285 |
| V3-BWA14 | N/A | Empty-state component for all widget kinds | S08 dashboard, progress-content.tsx:77-93 |
| V3-EB15 | N/A | Builder footnote and aria-live toast | S08 dashboard, dashboard-builder.tsx:1523-1538 |
| V3-H4-07 | N/A | Thirteen never-referenced exports | S12 orphans, daily-entry/gate.ts:39; config-schema.ts:913-914 |

### S09 surface

| Row | Status | Element | Evidence row |
|---|---|---|---|
| S09-01 | PARTIAL | Tracker shell: title, client name, "Log data"/"Coach notes" entry-mode switch, Configure button, Today/Week/Trends view switch, status line | `S09-*.md` |
| S09-02 | PARTIAL | Monday-first 7-day strip with per-day recorded dots, prev/next week, return-Today, "future date logging unavailable" | `S09-*.md` |
| S09-03 | PARTIAL | Edit-in-progress guard blocking date/view switches | `S09-*.md` |
| S09-04 | PARTIAL | Today heading: weekday/date + "N of M recorded" completion dot | `S09-*.md` |
| S09-05 | MISSING | Daily overview strip: up to 4 pinned metrics in configured order (summaryParameterIds / Variant.trackerHighlights) | `S09-*.md` |
| S09-06 | PARTIAL | Category grouping of fields (Weight basics, Nutrition, Sleep, ...) in template order, with per-group recorded counts | `S09-*.md` |
| S09-07 | UNCONFIGURED | Numeric measurement cell: read value, inline edit, min/max + decimals validation, canonical-unit storage | `S09-*.md` |
| S09-08 | PARTIAL | Rating cell: 1-10 / 1-5 select, word-labels display ("Low/Moderate/High", sleep "Poor/Okay/Good") | `S09-*.md` |
| S09-09 | UNCONFIGURED | Clearing a recorded value back to empty | `S09-*.md` |
| S09-10 | CONFLICT | Time fields (weigh-in time, bedtime, wake-time) with 12/24-hour editor | `S09-*.md` |
| S09-11 | UNCONFIGURED | Blood-pressure "118/76" single formatted field | `S09-*.md` |
| S09-12 | UNCONFIGURED | Free-text daily note / context note fields | `S09-*.md` |
| S09-13 | UNCONFIGURED | Single-choice field (select from configured options) | `S09-*.md` |
| S09-14 | PARTIAL | Multi-choice field with optional note ({choices[], note} JSON) | `S09-*.md` |
| S09-15 | PARTIAL | Location-rating composite ({location, rating 1-10}) | `S09-*.md` |
| S09-16 | PARTIAL | Context field (answer Yes/No + context note) | `S09-*.md` |
| S09-17 | CONFLICT | Cycle tracking group: period-start checkbox, derived cycle day, bleeding level, cramps, PMS symptoms, basal body temperature | `S09-*.md` |
| S09-18 | PARTIAL | Week view: transposed 7-day metric x date table, sticky labels, collapsible groups, per-metric summary cell (Average / Latest / Total / Most frequent / Done) | `S09-*.md` |
| S09-19 | MISSING | Trends view: searchable metric picker (max 3), ranges 7/30/56/90/180 days, numeric line/bar charts, completion grids, dated text lists, latest/average/change footer, chart-to-day navigation | `S09-*.md` |
| S09-20 | MISSING | "Coach notes" mode: coach-only comment popover per value, dot marker, "Coach note:" display under the field | `S09-*.md` |
| S09-21 | PARTIAL | Coach viewing a client's recorded tracker data (values, ratings, text) | `S09-*.md` |
| S09-22 | PARTIAL | Configured display units + conversions (kg/lb, cm/in, L/fl oz, kcal/kJ, degC/degF, mg/dL<->mmol/L, mg<->g, 12/24h) | `S09-*.md` |
| S09-23 | PARTIAL | TrackerConfig projected from assigned template (parameterIds order, cycleTrackingEnabled, fieldUnits, fieldOptions, ratingScales, energyUnit, weightUnit/lengthUnit/waterUnit) | `S09-*.md` |
| S09-24 | PARTIAL | Client preview shell: banner (avatar, name, "Assigned/Sample athlete . template", preview note), tab strip (Dashboard, Tracker, Timeline/Roadmap, Nutrition, Training Program, Check-In, Habits), tracker state kept alive across tabs | `S09-*.md` |
| S09-25 | MISSING | Sample athlete + deterministic 56-day synthetic history for unassigned template preview | `S09-*.md` |
| S09-26 | PARTIAL | Persisted shapes: TrackerEntry[] {date, values{paramId:number}}, textValues Record<"date:paramId",string>, comments Record<"date:paramId",string>; standalone localStorage coaching-client-tracker-maya-v1 | `S09-*.md` |
| S09-27 | MISSING | Weight trend arrow on the cell ("Up/Down X kg compared with the previous recorded weight") | `S09-*.md` |
| S09-28 | PARTIAL | State messaging: "No tracking fields configured", "Future date . logging unavailable", "Finish editing to change dates or views", "Updated"/persistence hint | `S09-*.md` |
| V3-BWB15 | UNWIRED | SmoothTrend primitive exists without a product data path | S09 tracker, smooth-trend.tsx:62 |
| V3-CP06 | MISSING | Roadmap header and phase badge | S09 tracker, client-preview.tsx:258,263 |
| V3-CP07 | MISSING | Roadmap weekly table | S09 tracker, client-preview.tsx:274,325 |
| V3-CP08 | MISSING | Roadmap phase select per week | S09 tracker, client-preview.tsx:302 |
| V3-CP12 | MISSING | Body map heatmap | S09 tracker, client-preview.tsx:629,680 |
| V3-CO01 | CONFLICT | Coach note shown in client-facing tracker field | S09 tracker, today-view.tsx:308-312; authorization-model.md:40 |
| V3-CO03 | CONFLICT | Tracker edits overwrite values without revision history | S09 tracker, preview-model.ts:28-31; decision #79 |

### S10 surface

| Row | Status | Element | Evidence row |
|---|---|---|---|
| S10-01 | PARTIAL | /coach Appearance > Color mode switch (light/dark, role=switch) | `S10-*.md` |
| S10-02 | MISSING | /coach Accent color (native picker, hex input, 4 suggestion swatches, Reset accent) | `S10-*.md` |
| S10-03 | MISSING | Workspace logo upload (PNG/JPG/WebP <=2MB, canvas-resize to <=512px data URL, preview, remove) | `S10-*.md` |
| S10-04 | MISSING | Ethereal studio shell: routes / (re-export) and /ethereal, sticky island header, 5-page segmented nav, hash routing #appearance|#dashboard|#tracker|#clients|#mealplan, skip link, footer | `S10-*.md` |
| S10-05 | PARTIAL | Ethereal appearance provider: {mode,accent,font} state, localStorage coaching-ethereal-appearance-v1, themeVariables() contrast-safe derivation of --accent-ink/--accent-border/--accent-ring/--chart-line, font family vars | `S10-*.md` |
| S10-06 | PARTIAL | AppearanceScreen "01 Light" segmented mode control | `S10-*.md` |
| S10-07 | MISSING | AppearanceScreen "02 Accent": color well picker, hex field, 6 named swatches, validity feedback | `S10-*.md` |
| S10-08 | MISSING | AppearanceScreen "03 Typography": 5-option font radio list (sans/serif/condensed/mono/rounded) with live specimens | `S10-*.md` |
| S10-09 | MISSING | Appearance reset + "Saved automatically on this device" note | `S10-*.md` |
| S10-10 | MISSING | Appearance preview panel: Roomy/Compact density toggle, live BodyweightTrend + NutritionTargets specimens, summary chips, sample profile card ("Emma Anders") | `S10-*.md` |
| S10-11 | MISSING | Foundations specimen gallery (type/numbers, actions/states, text+validation, choices+tabs, compact health fields incl. BP mask, confirm/empty feedback) | `S10-*.md` |
| S10-12 | MISSING | Ethereal primitive library (Avatar, StatusLabel, LabelTag, Segmented, SelectControl, TextInput, CheckboxControl, SwitchControl, Tabs, Widget) | `S10-*.md` |
| S10-13 | UNWIRED | BodyweightTrend + NutritionTargets specimen components (SVG monotone chart, period select 7/14/30, metrics strip, macro target bars, add-sample-snack demo) | `S10-*.md` |
| S10-14 | UNCONFIGURED | Dashboard builder editor: name field, Add widget, undo/redo, Client preview switch, auto-arrange, reset dialog, drag/keyboard move+resize, per-breakpoint layouts, card menus | `S10-*.md` |
| S10-15 | UNCONFIGURED | Dashboard draft persistence: localStorage ethereal-dashboard-draft-v1 + validation isValidDraft | `S10-*.md` |
| S10-16 | MISSING | Sample records the widgets read: localStorage ethereal-dashboard-records-v1 + SourceRecords (bodyweight, waist, steps, macroTargets, macroIntake, calorieTargets/Intake, sleep, coachingPlan, weeklyFocus, roadmapWeeks, milestones, prescriptions, workoutSchedule, exerciseSessions, recovery, habits, tasks, checkInSchedule, checkIns, feedback, messages) | `S10-*.md` |
| S10-17 | UNCONFIGURED | Widget gallery: 20-kind catalogue in 9 categories, search+category filter, staged multi-add, configure/replace side form (title, source, graph format, nutrient, fields, labels, unit, period, history, size, target toggle), live preview | `S10-*.md` |
| S10-18 | PARTIAL | Client tracker studio page: configurator (categories body/nutrition/recovery/movement, parameter pick, unit config, summary pick, rating scale), tracking grid (dated cells, rating/number entry, coach comments), persistence key coaching-client-tracker-maya-v1 | `S10-*.md` |
| S10-19 | UNWIRED | Clients studio page: roster (search, signals, attention), client profile editor, per-client tracker preview, onboarding invitation drafts, reset-demo; key coaching-clients-workspace-v1 | `S10-*.md` |
| S10-20 | UNWIRED | Meal plans studio page: plan/variant editing, nutrition targets, cycle schedule, saved-meal library, food swap picker, archive, client plan preview; key coaching-mealplans-v1 | `S10-*.md` |
| S10-21 | PARTIAL | Ethereal theme token layer: eg-root data-mode vars (--canvas/--surface/--text/--muted/--border/--success/--warning/--danger/--accent-*) + atmosphere/grain effects; app/appearance.css legacy .ap-* block | `S10-*.md` |
| V3-RT05 | N/A | Skip-to-content link | S10 appearance, coaching-app.tsx:87-93 |
| V3-RT06 | N/A | Wordmark button | S10 appearance, coaching-app.tsx:96-105 |
| V3-ES08 | N/A | Appearance toast | S10 appearance, appearance-views.tsx:374 |

### S11 surface

| Row | Status | Element | Evidence row |
|---|---|---|---|
| S11-01 | UNWIRED | Signed-in coach identity chip: avatar initials, "Liliana Mansfeld", "Coach" role label in sidebar | `S11-*.md` |
| S11-02 | UNWIRED | Implied authenticated coach session (whole /coach app assumes a signed-in coach; canvas has zero auth UI) | `S11-*.md` |
| S11-03 | UNWIRED | No sign-out affordance in canvas | `S11-*.md` |
| S11-04 | PARTIAL | Single fixed "COACH WORKSPACE" container | `S11-*.md` |
| S11-05 | PARTIAL | Client roster of "your athletes" (card/table list with phase, week, unread, overdue tasks, check-in state) | `S11-*.md` |
| S11-06 | PARTIAL | Client identity fields on profile header (email, coaching since, height) | `S11-*.md` |
| S11-07 | PARTIAL | "Preview assigned tool" → coach renders the client's own tool (dashboard/tracker/roadmap/nutrition/training/check-in/habits) | `S11-*.md` |
| S11-08 | PARTIAL | Preview write isolation ("changes stay inside preview") + dormant role switch "Log data" vs "Coach notes" | `S11-*.md` |
| S11-09 | MISSING | Coach-only internal notes ("Internal note · Coach-only"; privateCoachNotes.visibility=coach_only) | `S11-*.md` |
| S11-10 | MISSING | General/shared notes "Visible to you and your coach" | `S11-*.md` |
| S11-11 | UNCONFIGURED | Client tasks assigned by coach, completed by client (due dates, open/overdue/complete) | `S11-*.md` |
| S11-12 | MISSING | Coach personal to-dos linked to a client ("Coach to-do" / coachTasks) | `S11-*.md` |
| S11-13 | MISSING | Two-party chat: messages from "client"|"coach", unread counts, attachments | `S11-*.md` |
| S11-14 | MISSING | Per-client permission toggle "Allow this client to flag a message for coach attention" | `S11-*.md` |
| S11-15 | UNCONFIGURED | "Submitted onboarding" tab — client-submitted Q&A retained on the profile, coach reads them | `S11-*.md` |
| S11-16 | UNWIRED | "Onboarding invitation drafts (name · email · Not sent)" list | `S11-*.md` |
| S11-17 | UNWIRED | Invite acceptance → new client account + profile (canvas implies email-invited clients; draws no accept screen) | `S11-*.md` |
| S11-18 | UNWIRED | The implied "me" client view: standalone tracker pinned to one client ("Maya Chen", STORAGE_KEY coaching-client-tracker-maya-v1) | `S11-*.md` |
| S11-19 | UNCONFIGURED | Client logs own daily tracker entries and cell comments | `S11-*.md` |
| S11-20 | UNCONFIGURED | Client check-in submission + coach's returned feedback (awaiting feedback / feedback sent) | `S11-*.md` |
| S11-21 | PARTIAL | Archived clients hidden from the roster | `S11-*.md` |
| S11-22 | PARTIAL | Workspace preferences dialog: logo upload, availability string, notification toggles, theme | `S11-*.md` |
| S11-23 | UNCONFIGURED | Implied consent: canvas collects health/tracking data and onboarding answers with no consent step anywhere | `S11-*.md` |
| S11-24 | MISSING | Implied first coach/workspace bootstrap (canvas opens into a fully populated coaching workspace) | `S11-*.md` |
| S11-25 | UNCONFIGURED | Implied account recovery ("forgot password" on a real login) | `S11-*.md` |
| S11-26 | PARTIAL | Single implied coach role; canvas draws no owner/assistant/support distinction | `S11-*.md` |
| S11-27 | PARTIAL | Coach assigns the tool/template to a client directly ("Assign template") | `S11-*.md` |
| V3-CO05 | CONFLICT | Standalone tracker binds data to one named client without clientId | S11 identity, client-tracker.tsx:16,19-23; authorization-model.md:32-33 |
| V3-H4-04 | MISSING | No workspace or owner bootstrap | S11 identity, package.json:5-7; invitations.ts:185 |
| V3-H4-05 | MISSING | No mail library; password reset pages return 404 | S11 identity, password-reset-delivery.ts:43-45,72-77 |
| V3-H4-03 | CONFLICT | No route may grant consent; assertion fails closed | S11 identity, consent.ts:145-151 |
| V3-H4-02 | CONFLICT | Runtime-gate gap on exact-1 flags | S11 identity, daily-entry/gate.ts:22-24; sheet-viewer.ts:8-10 |
| V3-H4-02b | N/A | AUTH_TRUST_HOST is not read by app code | S11 identity, auth.config.ts:17 |

## CONFLICT rows and binding decisions

| Row | Surface | Decision | Treatment |
|---|---|---|---|
| S02-05 | S02 | #112 | No read receipts or read/seen state. Use only allowed response status. |
| S02-09 | S02 | #112 | Hide plan-change context links pending approval. |
| S02-12 | S02 | #96, #112 | Voice and media wait for approval and storage controls. |
| S02-25 | S02 | #96, #112 | Do not ship demo recording as real voice or video capture. |
| S02-08 | S02 | #96, #101, #112 | Blocked pending Q2. No attachment or media behavior until approval. |
| S02-24 | S02 | #101, #112 | Blocked pending storage, consent and retention decisions. |
| S03-11 | S03 | #114 | Use explicit generation only. No automatic replenishment. |
| S03-18 | S03 | #101, #112 | Video feedback blocked pending Q2 and media decision. |
| S03-19 | S03 | #114 | No automatic program changes bundled with feedback. |
| S03-20 | S03 | #96, #112 | Plan-change links and messaging remain blocked. |
| S05-05 | S05 | #44 | Terminal archive only. Replace Undo with confirmation. |
| S05-24 | S05 | #63 | Do not implement template variants. |
| S06-07 | S06 | #115 | No automatic totals or derived nutrition calculations. |
| S06-08 | S06 | #115 | No 4/4/9 ring or derived percentages. |
| S06-15 | S06 | #115 | No computed IIFYM kcal or macro ring. |
| S07-15 | S07 | #116 | No weekly muscle-volume calculation. |
| S09-10 | S09 | #75 | Hide time fields pending a binding format decision. |
| S09-17 | S09 | #73, #38 | Cycle data stays excluded pending legal/privacy approval. |
| V2-H2 | S06 | #36, #115 | Blank numeric inputs must remain missing, not be written as zero. |
| V2-H4 | S05 | #73, #38 | Goal picker must exclude cycle parameters. |
| V2-H5 | S07 | authorization-model.md:59 | Coach-private notes must not render in client views. |
| V2-H12 | S07 | product-decisions.md:1640; authorization-model.md:34 | Resolve the written policy conflict before client-write implementation. |
| V3-CP10 | S06 | #115 | No computed macro ring. |
| V3-CP13 | S07 | #116 | No muscle-volume panel. |
| V3-CO01 | S09 | authorization-model.md:40 | Remove coach-only note from client-facing field. |
| V3-CO02 | S06 | #115 | No automatic nutrition totals. |
| V3-CO03 | S09 | #79 | Keep revision history; never overwrite history. |
| V3-CO05 | S11 | authorization-model.md:32-33 | Use authenticated client/workspace scope, not fixed client identity. |
| V3-H4-02 | S11 | # runtime-gate policy | Add trusted-runtime checks to exact-1 gates before enabling them. |
| V3-H4-03 | S11 | consent.ts:145-151 | Consent grant remains blocked until approved route and review. |

## ORPHANS

Backend-only rows remain from S12. See `S12-backend-orphans.md` for cited row details. Team F lists 76 rows: api 1 + page and action 7 + page 6 + action 2 + model 16 + service 42 + flag 2 = 76. V3 cross-check confirms all 76; no contradictory verdict changed keep/drop disposition.

- S12-01 Auth.js v5 route handler. Evidence: `app/api/auth/[...nextauth]/route.ts:1`.
- S12-02 Login page + credentials action. Evidence: `app/login/page.tsx:7, app/login/actions.ts:1`.
- S12-03 Logout action. Evidence: `app/logout/actions.ts:1`.
- S12-04 Invitation acceptance page + action. Evidence: `app/invite/page.tsx:18, app/invite/actions.ts:1, app/invite/invite-form.tsx:1`.
- S12-05 Password reset request page + action. Evidence: `app/reset-request/page.tsx:18, app/reset-request/actions.ts:1`.
- S12-06 Password reset page + action. Evidence: `app/reset/page.tsx:21, app/reset/actions.ts:1`.
- S12-07 Forbidden (403) boundary. Evidence: `app/forbidden.tsx:1`.
- S12-08 Raw workbook sheet index (dev tool). Evidence: `app/sheets/page.tsx:12`.
- S12-09 Raw workbook sheet detail (dev tool). Evidence: `app/sheets/[slug]/page.tsx:20`.
- S12-10 Workspace list (workspace picker). Evidence: `app/workspace/page.tsx:15`.
- S12-11 Owner-only workspace admin area. Evidence: `app/workspace/[workspaceId]/admin/page.tsx:12`.
- S12-12 Client coach-assignment panel + actions. Evidence: `app/workspace/[workspaceId]/clients/[clientProfileId]/coaches/page.tsx:33, .../coaches/actions.ts:1, assignment-panel.tsx:1`.
- S12-13 Onboarding form library + create/edit/preview. Evidence: `app/workspace/[workspaceId]/onboarding/forms/page.tsx:31, forms/new/page.tsx:1, forms/[formId]/page.tsx:1, forms/[formId]/preview/page.tsx:1`.
- S12-14 Onboarding form CRUD server actions. Evidence: `app/workspace/[workspaceId]/onboarding/actions.ts:158`.
- S12-15 Onboarding form assignments + actions. Evidence: `app/workspace/[workspaceId]/onboarding/assignments/page.tsx:44, assignments/actions.ts:1`.
- S12-16 Staff onboarding-submission review. Evidence: `app/workspace/[workspaceId]/clients/[clientProfileId]/onboarding/page.tsx:32, actions.ts:106 (markOnboardingSubmissionReviewed), review-panel.tsx:1`.
- S12-17 User model (platform identity). Evidence: `db/schema.prisma:124`.
- S12-18 Workspace model (tenant boundary). Evidence: `db/schema.prisma:160`.
- S12-19 WorkspaceMember model. Evidence: `db/schema.prisma:203`.
- S12-20 CoachProfile model. Evidence: `db/schema.prisma:278`.
- S12-21 ClientAssignment model (coach-client link). Evidence: `db/schema.prisma:332`.
- S12-22 ConsentRecord model. Evidence: `db/schema.prisma:355`.
- S12-23 AuditEvent model. Evidence: `db/schema.prisma:375`.
- S12-24 AccessToken model (invite/reset tokens). Evidence: `db/schema.prisma:420`.
- S12-25 NutritionImportRun model. Evidence: `db/schema.prisma:501`.
- S12-26 NutritionImportRowOutcome model. Evidence: `db/schema.prisma:527`.
- S12-27 ExerciseImportRun model. Evidence: `db/schema.prisma:581`.
- S12-28 ExerciseImportRowOutcome model. Evidence: `db/schema.prisma:607`.
- S12-29 OnboardingForm model. Evidence: `db/schema.prisma:632`.
- S12-30 OnboardingFormVersion model. Evidence: `db/schema.prisma:660`.
- S12-31 OnboardingFormAssignment model. Evidence: `db/schema.prisma:695`.
- S12-32 OnboardingSubmissionReview model. Evidence: `db/schema.prisma:1165`.
- S12-33 Metadata-only audit logger. Evidence: `lib/audit.ts:1`.
- S12-34 Authorization guard (authorize/AccessDeniedError). Evidence: `lib/auth/guard.ts:1`.
- S12-35 RBAC role/resource matrix. Evidence: `lib/auth/rbac.ts:1`.
- S12-36 Route guard (requireSessionUser/requireWorkspaceAccess). Evidence: `lib/auth/route-guard.ts:1`.
- S12-37 Session helpers. Evidence: `lib/auth/session.ts:1`.
- S12-38 Password-reset service. Evidence: `lib/auth/password-reset.ts:1`.
- S12-39 Password-reset route boundary. Evidence: `lib/auth/password-reset-boundary.ts:1`.
- S12-40 Password-reset delivery port. Evidence: `lib/auth/password-reset-delivery.ts:1`.
- S12-41 Versioned consent service + gates. Evidence: `lib/consent.ts:14`.
- S12-42 Credentials verification. Evidence: `lib/credentials.ts:3`.
- S12-43 Prisma client singleton. Evidence: `lib/db.ts:1`.
- S12-44 Extraction contracts (sheet artifact types). Evidence: `lib/extraction/contracts.ts:1`.
- S12-45 Extraction cross-sheet pass. Evidence: `lib/extraction/crosssheet.ts:1`.
- S12-46 Extraction CSS parsing. Evidence: `lib/extraction/css.ts:1`.
- S12-47 Extraction database parsing. Evidence: `lib/extraction/databases.ts:1`.
- S12-48 Extraction normalize. Evidence: `lib/extraction/normalize.ts:1`.
- S12-49 Extraction parse. Evidence: `lib/extraction/parse.ts:1`.
- S12-50 Extraction redaction. Evidence: `lib/extraction/redact.ts:1`.
- S12-51 Extraction source loader. Evidence: `lib/extraction/source.ts:1`.
- S12-52 Extraction summaries. Evidence: `lib/extraction/summaries.ts:1`.
- S12-53 Extraction theme. Evidence: `lib/extraction/theme.ts:1`.
- S12-54 GDPR boundary (fails closed). Evidence: `lib/gdpr.ts:1`.
- S12-55 GDPR allowlist export. Evidence: `lib/gdpr/export.ts:1`.
- S12-56 GDPR retention policy-as-data. Evidence: `lib/gdpr/retention.ts:1`.
- S12-57 Nutrition catalog importer. Evidence: `lib/nutrition/import.ts:1`.
- S12-58 Exercise catalog importer. Evidence: `lib/exercise/import.ts:1`.
- S12-59 Onboarding form service. Evidence: `lib/onboarding/forms.ts:126`.
- S12-60 Onboarding form boundary. Evidence: `lib/onboarding/forms-boundary.ts:1`.
- S12-61 Onboarding assignment service. Evidence: `lib/onboarding/assignments.ts:237`.
- S12-62 Onboarding assignment boundary. Evidence: `lib/onboarding/assignments-boundary.ts:80`.
- S12-63 Onboarding assignment gate. Evidence: `lib/onboarding/assignments-gate.ts:1`.
- S12-64 Onboarding submission review service. Evidence: `lib/onboarding/review.ts:379`.
- S12-65 Onboarding review boundary. Evidence: `lib/onboarding/review-boundary.ts:83`.
- S12-66 Password policy (15-char setup rules). Evidence: `lib/password-policy.ts:1`.
- S12-67 Password hashing. Evidence: `lib/password.ts:1`.
- S12-68 Sheet-viewer flag gate. Evidence: `lib/sheet-viewer.ts:7`.
- S12-69 Access-token helpers. Evidence: `lib/tokens.ts:1`.
- S12-70 Token hashing/crypto. Evidence: `lib/tokens/crypto.ts:1`.
- S12-71 Token store (claim/inspect). Evidence: `lib/tokens/store.ts:1`.
- S12-72 Prisma authorization repo. Evidence: `lib/workspace/access.ts:9`.
- S12-73 Workspace invitations service. Evidence: `lib/workspace/invitations.ts:1`.
- S12-74 Invite-acceptance route boundary. Evidence: `lib/workspace/invite-acceptance.ts:12`.
- S12-75 ENABLE_SHEET_VIEWER flag. Evidence: `lib/sheet-viewer.ts:7, app/sheets/page.tsx:13`.
- S12-76 ENABLE_ONBOARDING_ASSIGNMENTS flag. Evidence: `lib/onboarding/assignments-boundary.ts:80, app/workspace/[workspaceId]/onboarding/assignments/page.tsx`.

## Action mapping and self-check

Every status-bearing non-WIRED row maps by surface to the PR set below. CONFLICT rows map to their named owner decision in the conflict table and remain blocked until that decision changes. The optional PR-MSG and PR-MEDIA rows cover only their approved subsets.

| Surface | Team F rows | Planned PRs |
|---|---:|---|
| S01 | 41 | PR-01, PR-M1, PR-SV1, PR-SV4, PR-W1, PR-W2 |
| S02 | 26 | PR-M3, PR-W10, PR-MSG, PR-MEDIA |
| S03 | 25 | PR-M8, PR-W6, PR-MEDIA |
| S04 | 13 | PR-M7, PR-W5, PR-SV3 |
| S05 | 25 | PR-M4, PR-W3 |
| S06 | 16 | PR-M5, PR-W7, PR-MEDIA |
| S07 | 22 | PR-M6, PR-W8 |
| S08 | 37 | PR-M9, PR-SV3, PR-W9 |
| S09 | 28 | PR-SV2, PR-W4 |
| S10 | 21 | PR-M2, PR-W10 |
| S11 | 27 | PR-04, PR-05, PR-W1, PR-W2 |
| S12 | 76 orphans | Keep, expose or retire per existing security decisions; no surface wiring assumed |

**Self-check.**

1. Summary counts reconcile. PASS. Team F arithmetic is 0 + 23 + 37 + 106 + 97 + 18 = 281 after the one V2 relabel. V adds 42 status-bearing rows and 13 N/A findings. Consolidated totals are 0 WIRED + 25 UNWIRED + 38 UNCONFIGURED + 113 PARTIAL + 117 MISSING + 30 CONFLICT = 323 status-bearing rows. Total element findings are 323 + 13 N/A = 336.
2. Every non-WIRED row has a PR or decision mapping. PASS by surface table and conflict table. No unmapped status-bearing rows are identified.
3. ORPHAN list. PASS. All 76 S12 IDs remain listed, grouped by backend capability kind in the source and counted 1 + 7 + 6 + 2 + 16 + 42 + 2 = 76.
4. V verdicts. PASS. V1 S04-04 stays PARTIAL. V2 relabels S06-03 as UNCONFIGURED and S07-07 stays MISSING. V3 corrects S08-04's catalogue count to 20 and adds its 44 H-only findings.

## Cross-check resolutions

- V1: S04-04 remains PARTIAL. H1 incorrectly says the habit tab lists only today’s habits. The canvas filter checks completion only.
- V2: S06-03 changes from UNWIRED to UNCONFIGURED because an action exists behind `ENABLE_MEAL_PLANS`. S07-07 remains MISSING because evergreen mode is reserved and unsupported, not a CONFLICT.
- V3: S08-04 remains PARTIAL, and its catalogue count is corrected from 19 to 20. The canvas and backend both have 20 kinds in nine categories.
- H-ONLY records above preserve the V evidence. N/A rows describe studio chrome, helper code, or tooling, not backend capability statuses.
