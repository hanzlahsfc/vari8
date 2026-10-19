# Implement template assignment → individual client setup in `/coach` — Sol 6.1 lead, Luna subagents

**Run this prompt in a Codex chat with Sol 6.1 (`gpt-6.1-sol`) selected as the main model.** The instructions below assign work to Luna subagents; pasting this prompt does not change the main chat’s selected model.

Implement this workflow in the **existing `/coach` frontend prototype**. Extend the working coach app; do not create another app or stop at a plan. Adapt the client profile so it becomes the coach’s home for assigning the client’s tool and creating/managing that client’s nutrition, training, goals, and optional habits.

The existing **Coaching UI · Ethereal edition meal-plan editor** is the visual and behavioral reference for meal-plan authoring. Bring that experience into `/coach` with controlled client data and isolated persistence.

## Read first and respect the current implementation

Repository: `/Users/lilianamansfeld/Documents/ChatGPT/ui sys`.

Read these sources before coding:

- `AGENTS.md`, including the installed Next.js documentation requirement. Read relevant guides in `node_modules/next/dist/docs/` for navigation, client state and any framework APIs you change.
- `/Users/lilianamansfeld/Documents/ChatGPT/infinity/coaching-system-development-brief.html`: especially Intent, system map/terms, W03/W10, Template editor, N01–N03/N08, P01–P08, Habit Tracker, and onboarding/setup workflows.
- `MEALPLANS.md`: this records later, narrower meal-plan decisions and takes precedence over the broader brief for the existing prescribed-meal experience.
- `prompts/coach-desktop-v1-build-prompt.md`: use its app/storage isolation requirements and product context; the current code is authoritative where the implementation has since evolved.
- Current `/coach` shell, template editor, client profile, previews and appearance. Inspect their actual rendered desktop and mobile state before changing UI.

Use the existing project’s design language. Apply relevant available UI skills while retaining the project’s preferences for purposeful glass, depth, lighting and motion. This is an operational workflow inside an established interface, not a visual redesign.

## Execution: Sol 6.1 coordinates, Luna implements and reviews

You are **Sol 6.1**, the lead. Own architecture, shared contracts, integration, verification and delivery. **Use GPT-6 Luna (`gpt-6-luna`) subagents for implementation and independent review. This is an explicit request to delegate.** Do not implement the entire workflow alone or silently substitute Sol/Astra workers for Luna.

Use the collaboration/subagent tools, not new user-facing chats. Select workers explicitly with `model: "gpt-6-luna"` and `fork_turns: "none"` where supported so the model override applies. Supply each worker with the absolute repository path, relevant requirements/reference files, shared interfaces, protected paths/storage rules, owned files and expected checks. Confirm the selected worker model from tool/runtime metadata when available. If explicit Luna selection is unavailable, report that limitation instead of claiming compliance or silently changing models.

Work in these phases:

1. **Sol establishes the foundation:** inspect the current implementation and dirty-tree baseline; define typed client plan state, backward-compatible migration, draft/active semantics, selectors, assignment mutation and navigation/callback contracts. Implement the shared foundation before workers depend on it. Keep the existing `/coach` app and Ethereal isolation intact.
2. **Luna nutrition worker:** own new coach-scoped nutrition editor components/styles and focused domain tests. Adapt the Ethereal meal-plan experience and IIFYM authoring against Sol’s controlled client/store interfaces, without mounting Ethereal persistence controllers.
3. **Luna training worker:** own new training editor components/styles, carry-forward helpers and focused domain tests. Implement evergreen/week-based authoring and resolved prescription output against the shared contracts.
4. **Luna profile/setup worker:** own the agreed profile/setup UI files, including `clients.tsx` when assigned, and profile-specific styles. Implement assignment continuation, plan summaries, editor entry/return, goals and optional habit setup. Use the shared assignment mutation; request contract changes from Sol. Do not edit shared provider/model files or other workers’ editors.
5. **Sol integrates:** own shared `model.ts`, `store.tsx`, route/shell changes, assignment domain behavior, preview adapters and check-in compatibility. Do not edit a worker-owned file while that worker is changing it; integrate those files after handoff. Resolve cross-screen state issues, run required checks, inspect actual desktop/mobile layouts and fix findings.
6. **Luna independently audits:** reuse an available worker for a read-only requirements/regression review, covering client isolation, migrations, draft/active behavior, training carry-forward, preserved Ethereal state and workflow completeness. Sol resolves actionable findings and delivers the finished implementation.

Keep Sol plus at most three active Luna workers within the available concurrency limit; stagger work if fewer slots are available. All agents share the filesystem. Use explicit file ownership and stable contracts, avoid duplicate edits, and reuse workers for follow-up fixes. Sol remains responsible for completing the whole task rather than stopping after delegation.

## 1. Scope, isolation and current starting point

Work in `src/components/coach/` and, only if necessary, `src/app/coach/`. Preserve the existing `/coach` shell, appearance settings, branding, navigation and unrelated features. Record the dirty working-tree baseline and preserve all existing modified/untracked work.

Keep `/`, `/ethereal`, their components, appearance behavior and browser data unchanged. Do not mount `MealplanWorkspace`, `ClientsWorkspace`, or other Ethereal controllers inside `/coach`: they own separate state and persistence. Import safe pure helpers/data; adapt the needed editor/presentation code into the coach namespace when isolation requires it. Do not modify the original Ethereal editor to make the new flow work. Scope new styles to the existing `.coach-root` or CSS modules; avoid CSS leakage through global `mp-*`/`eg-*` selectors.

Use the existing `CoachProvider` and **`coach-desktop-mockup-v1`** storage envelope as the single source of truth. No new independent plan/client localStorage stores. Never write to `coaching-mealplans-v1`, `coaching-clients-workspace-v1`, `coaching-ethereal-appearance-v1`, dashboard/tracker keys, or clear browser storage globally. No backend, authentication, real client delivery or deployment is requested.

Existing foundations to extend:

| Area | Current files / behavior |
| --- | --- |
| Templates and assignment | `templates.tsx`, `template-setup.ts`, `model.ts`: library/editor already exist; assignment stores an independent deep-copied template snapshot. |
| Shared state/navigation | `store.tsx`: hydrated `CoachState`, validation, notices, query routes, navigation guard. |
| Client profile and setup | `clients.tsx`: current profile, assignment picker, `PlanDialog`; nutrition/training dialogs are shallow placeholders. |
| Meal-plan reference | `src/components/ethereal/mealplan/mealplan-workspace.tsx`, its CSS, `model.ts`, overview, schedule, date/time, swap and saved-meal components. |
| Client previews | `client-preview.tsx`, `client-plan-preview.tsx`: real-client meal preview currently generates sample meals; training also uses sample prescriptions. Replace these fallbacks for actual clients. |
| Review integration | `check-ins.tsx`, `model.ts` (`ReviewDraft`, `submitFeedback`): current adjustment and change-link behavior depends on the old flat `Plan`. |

All relative paths in the table are under `src/components/coach/` unless explicitly prefixed otherwise.

## 2. Product model: configuration first, client content second

A reusable template defines the client tool’s views, fields/units, dashboard/roadmap configuration, training prescription fields, check-in questionnaire, nutrition presentation and optional Habit Tracker. **Actual foods, exercise prescriptions, individual goals and habit definitions belong to the client.** Do not add an individual meal/program editor to the reusable template editor.

Keep these concepts distinct:

- Template configuration and the client’s assigned snapshot.
- Meal-plan presentation versus IIFYM presentation.
- Nutrition options such as Training day/Rest day/custom labels within one individual nutrition plan.
- Nutrition scheduling, training weeks and check-in dates.
- Prescriptions/goals versus recorded measurements, food intake, performance and habit completions.

Preserve the current `singleTemplateSetup`/`normalizeTemplateSetups` behavior: one current configuration, retained legacy configurations. Assign the canonical configuration using its `defaultVariant`; retained legacy configurations are compatibility/history data, not new assignment choices. Do not resurrect the removed multi-variant template editor. Any supported presentation/configuration change must preserve the same client ID, plans, entries, submissions and history. Hiding a module or switching Meal plan/IIFYM must not delete its saved data.

Assignment must keep an independent configuration snapshot. Updating/deleting a source template must not silently change or erase assigned client setups. Reassignment changes the configuration, retains client content/history, and explains newly enabled/hidden modules. It must not automatically activate plans or reset them to sample content.

Deep-clone assigned configuration while retaining its internal IDs and references: isolation comes from separate client-owned object graphs, not renaming template fields/widgets/questions. New client-authored plan/session/exercise/meal entities need unique IDs. Duplicate actions generate IDs only for the duplicated entities and remap their local references, including schedule/option links, without altering the source or unrelated records.

## 3. Complete assignment and continuation journey

Support both existing entry points:

1. **Template library → Assign:** choose an existing non-archived client, review the selected setup, then **Assign & personalize**. Commit assignment and open that client’s setup/Plans workspace immediately, with their identity visible. Plain assignment may remain a secondary action if useful.
2. **Client profile → Assign template:** keep that client fixed while choosing a saved template. Show enough saved configuration to choose confidently, then continue directly to their individual setup.

Use one assignment mutation/service for both paths instead of divergent implementations. Cancel makes no changes. Disable invalid/duplicate submissions. If there are no saved templates, provide a working path to create one and a return to the same client. A client with no assignment must see an actionable empty state, not a broken editor or invented assignment.

After assignment, show a resumable setup workspace with Nutrition, Training, Goals and optional Habits as appropriate to the configuration, plus the existing check-in schedule/link. The coach can work in any order, save partial work and leave/reopen. This is not a mandatory wizard that makes every module a prerequisite for all others. Only show configured modules as active setup destinations. Retained hidden content stays available when re-enabled.

## 4. Adapt the client profile around the work

Keep the existing client identity, phase/label/coaching start context, bodyweight, check-in calendar/history, chat, onboarding answers, priority permissions and private/client task distinctions. Preserve recent profile simplifications; do not restore removed summary panels or duplicate chat/calendar interfaces.

Make assignment and actual plans legible at a glance:

- **Client setup:** assigned template name and relevant configuration summary; Assign/Change template; Preview assigned tool; Continue setup when unfinished.
- **Plans:** add a clear Plans tab or equally direct dedicated workspace linked from Overview. Give Nutrition, Training and optional Habits compact rows/sections with real status, relevant plan name/start date, and a specific Create/Continue/Edit action. Goals and check-in setup remain nearby and reachable.
- Show useful prescribed information drawn from real data: nutrition option totals/schedule; training program type/duration/session structure; configured habit names/frequency. Avoid fabricated completion percentages, adherence charts or treating seeded flat numbers as a fully authored plan.
- Focus the primary action on the next task: Assign template, Continue setup, or Edit plan. Keep Open chat and calendar accessible without competing oversized buttons.

Use a full-width working area for substantial editors, not the existing tiny `PlanDialog`. Keep a compact client identity/context header, plan type and status, visible save/activation feedback, and **Back to [client]**. Preserve useful profile tab/context and review origin on return. Support direct links, reload and browser Back/Forward using the existing query routing, including current nutrition/training plan URLs. Invalid IDs and unsupported plan types need recoverable empty states.

## 5. Nutrition: adapt the existing Ethereal editor faithfully

For Meal plan mode, reproduce the current editor’s working composition and interactions in the coach shell: one overview comparing options, schedule above a full-width editor, editable ordered meals, portions and approved alternatives. Keep its food search, themed time/date popovers, anchored swap picker, reusable saved meals, option duplication/deletion, readable client preview and archive history. Bind all of it to the selected `CoachClient` in shared coach state; do not recreate a private seeded client list or let the editor switch away from the profile’s client unnoticed.

Honor `MEALPLANS.md`:

- Prescribed food quantities define meal/day nutrition totals. **No separate meal/day target inputs in Meal plan mode and no per-meal frequency controls.**
- Start with one editable nutrition option; allow arbitrary coach labels and additional options. Retain daily/manual, weekday and repeating-rhythm scheduling, anchor date and calendar-day/DST correctness. Merely browsing an option does not change its prescription.
- Preserve food-specific quantity bases and units from `src/data/food-database.json`. Use source calories, even when they differ from macro-derived energy. Approved alternatives do not add to prescribed totals. Keep macro-energy ring behavior consistent with the reference.
- Retain independently copied saved meals, portions, swaps and archives. Editing a saved meal must not mutate meals already used in a plan.
- Client preview is a readable prescription with foods, quantities, alternatives, times, totals and schedule; it must not resemble a disabled editor.

For **IIFYM**, use a separate client-specific target editor appropriate to that existing presentation: calorie-only or macro goals, fixed/range/minimum targets, named options and applicable schedule. Preserve existing TD/NTD macro/ring preview capabilities while sourcing actual client targets. The Meal plan restriction on separate targets does not prohibit IIFYM targets. Do not force foods into IIFYM or manufacture a meal plan from legacy calorie/protein numbers.

Do not add food diaries, consumed/remaining intake, barcode scanning, recipes unrelated to existing saved meals, or client food logging. Keep the source Ethereal meal-plan workspace and its stored drafts unchanged.

## 6. Training: real individual programming

Replace the one-exercise sets/instructions placeholder with a usable client-specific program editor. The assigned configuration controls available prescription fields; the client program supplies their values.

- Evergreen is ongoing with no required end/week count. Week-based has a selectable, validated week count, a program start date anchoring week 1 and clear week navigation.
- Add/name/reorder/duplicate/remove sessions and exercises; create editable set prescriptions with fixed reps or rep ranges and the enabled fields such as tempo, set type, rest/pause, progression notes and instructions. Use a small practical exercise selector or custom name entry rather than requiring a new external exercise service.
- Implement the brief’s carry-forward rule with stable session/exercise/set identities and week-effective changes. Week 1 persists until an override; an override at week 4 affects weeks 4 onward until the next override. Earlier weeks and independent later overrides stay unchanged. Make the scope of a week edit visible. Removals and reorders must also resolve predictably from the chosen week.
- Example to verify: 3 leg-extension sets in week 1 → 3 in weeks 2–3; change to 4 at week 4 → 4 later; a separate week-6 override survives a later edit at week 4.
- Show the selected week’s resolved prescription in client preview. Keep logged performance and set notes separate from prescriptions. Preserve existing notes/flags and future set instruction context; no new logging or video workflow is needed.
- Respect the template’s volume visibility/presentation. Use saved prescriptions for displayed volume, reuse `muscle-volume.ts` where compatible, and retain the current muscle-groups-per-week direction. Keep unknown/custom exercise allocation explicitly unassigned unless the coach supplies a supported mapping. Do not invent new physiological calculations.

## 7. Goals, optional habits and schedule

Allow meaningful client-specific goals for the configured measures, with unit/date context where needed. Keep goals separate from recorded measurements and avoid a hard-coded mandatory collection of roadmap fields. Nutrition goals come from the applicable nutrition plan/targets; do not introduce a second conflicting source.

When Habit Tracker is enabled, author actual client habits with name, frequency, goal and reason; support add/edit/remove with saved state. Keep habit setup/status independent from ordinary Tracker fields, client tasks and private coach to-dos. Disabling the feature hides it without deleting definitions/history. Use the existing check-in schedule and additional-date workflows; do not build a second calendar.

## 8. Explicit prototype lifecycle and persistence decisions

The source brief does not define publication/version rules. Use this small, explicit frontend contract:

- Each nutrition/training plan has a saved coach draft and an optional immutable **active** snapshot; history is retained when replaced. Statuses derive from actual state: Not started, Draft, Active, Active with draft changes, and Archived/no active plan. Hidden/not configured is separate from completion. Goals, habits and schedule can use straightforward explicit saves without an additional publication system.
- **Save draft** persists incomplete work without changing active client content. Show saving/session-only/failure states honestly.
- **Activate plan** validates that module and commits a snapshot for the local client preview. Use a reviewable preview and clear action; do not add a multi-step approval ceremony. A quiet workspace demo label explains that activation is local, with no account/email delivery.
- Subsequent edits change the draft only. The assigned client view continues to use the active snapshot; the coach can preview a draft explicitly labeled as such. Activate modules independently; incomplete unrelated modules cannot block valid nutrition/training activation.
- Store plan start dates as date-only values. Activation commits the version immediately in this prototype; a future start date is shown as “Starts [date]”. Resolve the applicable prescription by date across retained activated versions: keep the previous applicable plan before the new start date, or show no applicable plan if none exists. Never apply future targets to earlier dates. Avoid adding a separate release scheduler.
- Archive/replace preserves earlier prescriptions and client history. Do not create history entries on every draft save or silently change active plans while archiving a draft. Provide a clear action to create a replacement when there is no active plan.

Extend typed coach state and its nested validation deliberately. Add a backward-compatible migration/defaulting layer **before** validating the new shape, so existing version-1 state loads without reset. Preserve IDs, templates/assignment snapshots, existing flat plan values, entries, habits, schedules, extras, submissions, messages, notes, drafts, preferences and media metadata. Legacy target/program values are retained as legacy summaries or mapped where meaningful; do not pretend scalar values prove an authored active meal/program exists.

Hydrate before writing. Preserve unreadable raw saved content rather than immediately overwriting it with seeds; show a recoverable notice/session fallback. Handle missing/partial plan data, invalid numbers and unknown references without crashing. Keep editing usable if storage is blocked/full, but report session-only state. Avoid independent copies of client collections and duplicate mutable sources of plan truth. Derived selectors/adapters can support old consumers while they are migrated.

## 9. Connect previews and check-in review to the same plans

Real-client assigned-tool previews must read that client’s active plans/configuration and show honest not-set states. Remove generated sample meals/programs as fallbacks for actual clients. Template-only previews may retain clearly labeled illustrative data and must never save it into a client just by opening preview.

Audit `PlanDialog`, `Plan`, `ReviewDraft`, `submitFeedback`, `recordsForCoach`/plan target adapters and every reader of `client.plan`. Replace/adapt old scalar adjustment paths so they cannot silently diverge from the new nutrition/training state. Profile summaries, client previews and relevant existing summaries must agree on the active plan and selected date/option/week.

Check-in review must open the same individual editor with a return path to the same submission and preserve its draft feedback. Record actual activated changes for the existing feedback summary and plan links; draft-only edits must not claim the client plan was updated. Opening/editing/activating a plan must not mark a check-in answered or send a message. The existing explicit Submit feedback action remains the sole feedback commit, with duplicate protection. Preserve compatibility with existing stored review drafts and historical change messages; do not rebuild messaging/video review.

## 10. Design, accessibility and verification

Extend the current coach materials, nested surfaces, typography, accent and light/dark settings. Let the editor use available space; use quiet sections and separators rather than wrapping every field in a rounded card. Keep action hierarchy and statuses clear. Adapt borrowed/reference styles to coach tokens; no new branding or generic dashboard redesign.

Use `motion/react` selectively with the existing reduced-motion provider. Keep visible keyboard focus, labeled inputs, accessible dialogs/popovers and focus restoration. Handle empty/loading/invalid/disabled/saved states. At mobile widths, stack editor controls, keep identity/back/save reachable, prevent document overflow and nested scrolling traps, and use practical touch targets. Scrollable tables may have a local overflow container.

Implement meaningful tests for new domain risks: assignment isolation with configuration IDs/references retained, client separation, storage migration, drafts versus active snapshots, unique duplicated plan entities with correctly remapped local references, training carry-forward and plan-change summaries. Reuse the existing Node test patterns. Run relevant existing coach and meal-plan regression tests, `npm run typecheck`, `npm run build`, and focused Biome checks for changed files. Report existing/unrelated failures accurately; do not reformat the whole dirty repository or install unnecessary dependencies.

Run and inspect actual `/coach` UI at 1440×900, 1280×800 and approximately 390px mobile, including light/dark coverage. Verify these journeys:

1. Existing saved workspace loads with all unrelated data intact; protected Ethereal keys/routes remain unchanged.
2. From library, assign a saved template to Client A and continue directly to A’s setup. Repeat from profile; cancel is side-effect free; no-template/no-library states have working next actions.
3. Save/reopen an incomplete nutrition draft, finish meals/options/schedule/swaps, preview, activate, reload and see the exact prescription in A’s profile/assigned view. Edit the draft and verify active content stays unchanged until activation.
4. Give Client B the same template. Edits to A or the source template leave B and A’s assigned snapshot independent. Changing assignment/presentation retains all client plans/history.
5. Configure IIFYM targets without foods; preview actual calories/macros and applicable option. Switch presentation without erasing either form of nutrition data.
6. Build an evergreen program and a week-based program; verify carry-forward, earlier-week preservation and later overrides, save/reload and actual client preview.
7. Configure client goals, optional habits and check-in dates; verify correct visibility and separate private/client information.
8. Open plan setup from a check-in, return with feedback draft intact, and activate changes. Only explicit feedback submission answers the check-in and includes accurate links/changes.
9. Exercise archive/replacement, no-active states, invalid direct links, Back/Forward, storage failure, keyboard access and responsive save/back controls.

Fix issues found in the rendered workflow and reinspect the affected areas. In the final response, summarize what changed, the routes to try, tests run and actual desktop/mobile inspection. State any remaining limitation plainly. Do not claim backend delivery or visual verification that did not occur.
