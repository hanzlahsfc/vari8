# Build prompt: Coach desktop frontend, version 1 — Sol 6.1 lead with Luna subagents

Build a complete, interactive first version of a **separate coach-side desktop mockup** in this repository. Implement the screens and interactions below; do not stop at a plan or static designs. The existing system mockup must remain untouched.

## Execution roles: Sol 6.1 coordinates, Luna builds

Run this prompt in a Codex chat with **GPT-6.1 Sol (`gpt-6.1-sol`) selected as the main model**. You are the lead: own architecture, shared data contracts, shell integration, design consistency, final browser inspection, and delivery. **Use GPT-6 Luna (`gpt-6-luna`) subagents for implementation and review. This is an explicit request to delegate, not an optional suggestion.** Do not implement the entire mockup alone or replace the requested Luna workers with Sol/Astra workers.

Use the available collaboration/subagent tools rather than creating separate user-facing chats. Where the spawning tool supports these arguments, set `model` to `gpt-6-luna` and `fork_turns` to `none` so the model override is actually applied. Give each worker a self-contained assignment with the absolute repository path, the relevant requirements from this prompt, both required design-skill paths, protected-file/storage rules, shared interfaces, owned directories, and expected checks. Confirm the worker model from the tool result/runtime metadata where available; do not merely call a same-model worker “Luna.” If explicit Luna selection is unavailable, report that limitation rather than claiming compliance or silently substituting models.

Work in this order:

1. **Sol 6.1 establishes the foundation:** inspect the repository and brief, record the baseline, choose the visual composition, and create the isolated `/coach` shell, provider, shared types, fixtures, navigation contracts, and appearance-token interface. Agree stable client/template/check-in/message IDs and mutation callbacks before parallel implementation.
2. **Delegate three independent work areas to Luna:** one agent owns `src/components/coach/templates/` for the library/editor; one owns `src/components/coach/checkins/` for calendar/review; one owns `src/components/coach/messages/` for chat. Each implements its full assigned workflow against the shared contracts and reads both design skills. Keep the lead plus these three workers within a four-agent concurrency limit, or reduce concurrency to the runtime's available limit.
3. **Delegate Appearance to Luna in the next wave:** when a slot is free, have a Luna agent own `src/components/coach/appearance/`, including the full settings and preview experience below. Sol handles the client/profile adapters and cross-screen integration. Reuse workers for follow-up fixes rather than accumulating idle agents.
4. **Sol integrates and reviews:** workers do not edit the shared provider, shell, route entry, shared fixtures/types, protected original files, or one another's directories. Requests for contract changes go to the lead. All agents share the filesystem, so do not overwrite another worker's changes or apply duplicate patches. Sol resolves integration issues, inspects every rendered work area, and refines visual consistency.
5. **Use Luna for a final independent audit:** check requirement coverage, appearance settings, old-mockup isolation, data retention, and cross-screen state consistency. Assign read-only reviews while Sol performs browser verification; then fix actionable findings and complete the required checks. The lead remains responsible for the finished result.

For the general coordination pattern, see [official OpenAI multi-agent guidance](https://developers.openai.com/api/docs/guides/responses-multi-agent). Actual worker selection must use the tools and model names available in the current Codex environment; this task does not require building an API orchestration service.

## Read first

- Repository: `/Users/lilianamansfeld/Documents/ChatGPT/ui sys`
- Functional source: `/Users/lilianamansfeld/Documents/ChatGPT/infinity/coaching-system-development-brief.html`
- Project instructions: `AGENTS.md`
- Required design skills: `/Users/lilianamansfeld/.agents/skills/apple-design/SKILL.md` and `/Users/lilianamansfeld/.codex/skills/high-end-visual-design/SKILL.md`. Read and actively use both.
- Read the relevant installed Next.js guides under `node_modules/next/dist/docs/` before writing code, especially App Router layouts/pages and CSS. Use this project's Next.js, React, Tailwind, shadcn/ui, and `motion/react` foundation.

The brief describes the larger product. This build focuses on **Templates, Check-ins, Messages, and full Appearance settings**, with the existing roster/profile experience carried into the new coach workspace. Do not expand into the optional paid modules, marketing, billing, production authentication, wearable integrations, migration, or a new client-facing app. Onboarding and universal coach notes may remain within existing profile capabilities; a new onboarding builder or standalone notes workspace is outside this first version.

## 1. Isolation is a hard requirement

Create the new entry point at **`/coach`** using `src/app/coach/page.tsx`. Keep new components, models, fixtures, and styles under `src/components/coach/` and, if useful, `src/app/coach/`. Provide navigation inside the new workspace. Open it directly for review; do not add a link to the old mockup by editing its navigation.

Do not edit, replace, move, reformat, or revert existing files. In particular, protect `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/ethereal/`, `src/app/globals.css`, `src/components/ethereal/`, `src/lib/ethereal-appearance.tsx`, `src/lib/coaching-data.ts`, existing fixtures, and `AGENTS.md`. The root `/` and `/ethereal` routes must keep their existing behavior. Keep package/configuration files unchanged and prefer installed dependencies.

There is already modified and untracked user work, including the current coaching shell, roster/profile, mealplan components, artifacts, and scripts. Record the baseline before making changes and preserve it. Never use a cleanup/reset operation on this work.

Preserve all existing browser storage. Do not mount `EtherealApp`, `AppearanceProvider`, `ClientsWorkspace`, `DashboardBuilder`, `ClientTracker`, or `MealplanWorkspace` directly if they read/write their existing persistence keys. Protect these keys:

- `coaching-ethereal-appearance-v1`
- `ethereal-dashboard-draft-v1` and `ethereal-dashboard-records-v1`
- `coaching-client-tracker-maya-v1`
- `coaching-clients-workspace-v1`
- `coaching-mealplans-v1`

Use an independent coach state provider with versioned storage under **`coach-desktop-mockup-v1`** only. Persist templates, assignments, clients, schedules, submissions, conversations, drafts, and preferences in one versioned JSON envelope; do not introduce secondary storage keys. Hydrate before saving, validate stored data, and fall back to usable session state when storage is unavailable. Never clear all storage. A reset action affects only this mockup.

Reuse existing pure models, fixtures, and presentational primitives through imports where safe. Treat imported models/fixtures as read-only and deep-copy seed records before editing. `ClientRoster` and `ClientProfile` accept data and callbacks; they are candidates for presentation-only reuse through a new controller, never through `ClientsWorkspace`. Audit their side effects and CSS imports first: current roster styling expects `.eg-root`, and their imported styles are global rather than isolated CSS modules. Do not blindly import legacy CSS or add a legacy theme wrapper to fix appearance. If embedding them would limit navigation, duplicate state, or expose unsafe style dependencies, copy the minimum needed code/styles into the new namespace, scope them to a unique coach root, and adapt them there. Do not alter the originals. Similarly, adapt the dashboard builder into the new namespace if controlled state and isolated persistence cannot be achieved without modifying its original implementation.

New CSS must be scoped to the coach root or CSS modules. Do not inject global resets or generic selectors that can affect the old routes when Next.js retains styles across navigation. The root layout already supplies the reduced-motion Motion provider.

## 2. Visual concept: an Ethereal coaching operations desk

Extend the current system's visual language into a usable desktop workspace. Inspect the existing shell, appearance tokens, roster, profile, dashboard widgets, tracker configurator, and mealplan before designing. The result should clearly belong to the same product.

Use a persistent, quiet left navigation rail with **Clients, Templates, Check-ins, Messages**, plus a clearly reachable **Appearance** settings entry near the bottom. The main working surface changes by section; a compact utility header identifies the current page and relevant actions. Default the first visit to **Templates** so the principal new workflow is immediately visible. Support browser back/forward and shareable section/client/editor state within `/coach` using routes or query parameters.

Apply the requested skills together:

- **High-End Visual Design:** choose the Ethereal Glass material direction; retain the existing Geist typeface, dark charcoal foundation, soft accent lighting, precise hairlines, and diffused depth. Default accent is the current rose `#EB91B8`. Use deliberate nested shell/core construction on major work surfaces, concentric radii near the existing 28px/22px treatment, and restrained inset highlights. Keep fine icon strokes consistent with the system. Provide isolated light/dark and accent controls.
- **Apple Design:** prioritize immediate press feedback, familiar interaction models, clear wayfinding, reversible transitions, forgiving edits, and interruptible motion. Functional chrome may float above scrolling content with purposeful translucency. Use critically damped `motion/react` springs with no bounce for ordinary panel/selection changes, approximately 0.2–0.35s response. Use transform and opacity; reserve momentum/velocity behavior for real dragging. Honor the existing reduced-motion provider, reduced transparency, and increased contrast preferences.
- Adapt the high-end skill's marketing-page recipes to this application. Large landing-page headings, 96–160px section padding, compulsory full-screen menus, universal entrance choreography, or double containers around every table row would harm this workspace. Use 14–16px working text, roughly 28–40px page titles, 24–32px main gutters, and tighter related control groups. Keep the editor, calendar, and chat dense enough to work in. Project-specific instructions and the existing system language take precedence over generic aesthetic prescriptions.
- Use coherent accent lighting at structural/focal areas; keep reading surfaces quiet. Blur belongs to fixed/sticky chrome and overlays rather than large scrolling content. Do not introduce decorative charts, fabricated business metrics, repeated feature cards, or ambient animation loops.

Primary desktop targets are **1440×900 and 1280×800**. Use the available width for work. At narrow widths, collapse side inspectors and switch to an agenda or conversation-first flow, retaining every essential action. Check **390×844** as a responsive fallback. All controls need clear labels, visible keyboard focus, adequate contrast, and deliberate hover/press/disabled/loading treatment. Do not communicate status with color alone.

### Full Appearance settings

Carry over the existing system's full customization experience in an independently implemented coach settings screen, including working controls and live previews. Inspect `src/components/ethereal/appearance-views.tsx`, its related styles, and `src/lib/ethereal-appearance.tsx` as read-only references; do not mount the original persistence-backed provider or modify those files.

- **Mode:** Light and Dark selection, immediately reflected in the coach shell and all new workspaces. Default to Dark.
- **Accent:** selectable Rose (`#EB91B8`), Berry (`#C5457C`), Ocean (`#3565B7`), Forest (`#2B7157`), Teal (`#68D0C0`), and Amber (`#E9B66E`) presets, plus a custom color picker and editable hex value. Validate custom values inline without replacing the last valid accent while the user is still typing.
- **Typography:** the same five choices as the current system: Geist/Sans, Garamond/Serif, Avenir Next Condensed/Condensed, Menlo/Monospace, and System Rounded/Rounded. Show each choice in its own typeface, use the existing local font assets/platform fallbacks, and apply the selected font consistently to the coach UI. Keep this explicit user-controlled font selection even where a generic design skill prefers a single font. Do not fetch fonts from a third party or change global font settings.
- **Live previews:** show representative dashboard/widget, tracker/form, calendar-status, and chat/control samples that update immediately for mode, accent, and font. Include a comfortable/compact preview-density toggle matching the reference experience; treat it as preview-only unless a workspace-density setting is deliberately implemented. Preview interactions must not alter real mockup client entries, templates, drafts, or messages.
- **Scope and persistence:** settings affect this coach mockup and its sample previews. They do not change the old mockup, silently modify saved template definitions, or overwrite individual athlete data. Store `{ mode, accent, font }` within the new provider's existing `coach-desktop-mockup-v1` envelope and restore it on reload. Apply tokens on the unique coach root, not `html`/`body` or legacy roots.
- **Reset appearance:** restore Dark, Rose, and Geist only; keep templates, assignments, messages, schedules, and drafts intact. This is separate from resetting the entire demo.
- **Quality:** check readable text, focus rings, selection indicators, status labels, charts, and incoming/outgoing bubbles across both modes, all accents, and all font choices. Derive suitable foreground colors rather than using the chosen accent blindly as text. Preserve layout with longer/wider fonts, prevent an avoidable theme flash during hydration, and honor reduced transparency/contrast preferences.

## 3. Domain model and shared state

Keep these distinctions explicit in the UI and models:

1. A **template** is a reusable configuration of the client tool: view structure, variants, widgets, available fields, calculations, and form questions.
2. A **client setup** owns that athlete's plans, targets, schedules, habits, entries, training logs, tasks, check-ins, and conversation. Actual meal plans and exercise prescriptions are configured for the athlete, not inside the reusable template.
3. A **template variant** changes presentation, such as Meal plan versus IIFYM. Switching it must retain the same client ID, entries, plans, and history. It must never create a fresh tracker or discard data.
4. A **nutrition variant** is a client meal/target option such as training/rest day. It is a separate concept from a template variant.
5. The optional **Habit Tracker** is independent of ordinary Tracker measurement fields. Template configuration enables it; client setup defines the habits, frequencies, goals, and reasons.
6. Coach-only notes/to-dos remain distinct from client-assigned tasks. A flagged training set note is distinct from a priority chat message.

Keep one shared local source of truth for new mockup clients, assignments, schedules, submissions, and conversations. Use stable IDs and derive attention/unread/pending counts from state. Reuse the existing illustrative athlete identities. Seed enough coherent examples to exercise the flows: saved templates, recurring and additional dates, full and smaller submissions, answered and unanswered check-ins, flagged training notes, unread chats, permitted priority messages, and one empty state. Place calendar examples around the current demo week; do not leave every event in an unrelated historical week. Use a consistent date reference and Europe/Vienna timezone with Monday as the first weekday.

The brief leaves template-edit propagation, some calculations, and custom-submission matching unresolved. Choose reversible **demo assumptions**, record them in the implementation handoff, and avoid implying production rules are settled. In this mockup, saving a library template does not silently overwrite assigned clients; assignment explicitly applies a configuration snapshot. Keep technical/product-decision notes out of normal user-facing flows.

## 4. Templates: library and full editor

### Library

Show a considered, scannable library of saved templates. Each entry exposes name, short description, variants, last edited date, and assignment count where backed by state. Include search, a clear **Add template** action, and **Edit, Duplicate, Rename, Delete, Preview, Assign** actions. Search and empty/no-results states must work.

Add template opens the full editor with a new independent draft. Editing opens that template's configuration. Duplicating produces a separate ID and independently editable settings. Delete removes the library item with undo; preserve existing client assignment snapshots. Do not delete clients or history as a side effect.

### Editor structure

Use a substantial workspace rather than a small settings modal: section navigation on the left, the main configuration canvas in the center, and an inspector/preview where appropriate. Keep template name, variant selector, unsaved status, **Preview**, **Save template**, and a clear return path visible. Support cancel/discard, restore saved settings, validation, and unsaved-change protection when leaving. Cmd/Ctrl+S may save while the editor is active.

The editor must cover the six core views and optional habits. Every section below must have working controls, saved configuration, and a meaningful preview; do not ship decorative tabs or empty panels:

- **Views & variants:** Dashboard, Tracker, Timeline/Roadmap, Mealplan, Training Program, Check-In. Present the six core views clearly. Create/rename/duplicate/delete alternative presentation variants and choose the default. Preview switching between meal-plan and IIFYM presentations with the same sample athlete record. Keep the optional Habit Tracker as a separate inclusion control.
- **Dashboard:** use the existing iOS-widget-style grid language and widget content. A plus action opens a categorized widget gallery including nutrition, training, lifestyle, and habits. Add, configure, reposition, resize, and remove widgets. Select actual parameter sources and supported summaries. Small widgets simplify their content; larger ones show more detail. Dragging must work, with keyboard/button alternatives. Persist layouts per template/variant; never reuse the old builder's draft or client-record keys.
- **Tracker:** grouped, searchable parameter library with selectable/reorderable fields. Include bodyweight/weigh-in time, recovery/lifestyle, activity, and health examples such as RHR, FBG, and BP. Configure available units and ratings (1–10, 1–5, or word labels). Show a usable tracker preview. Units/ratings carry through relevant dashboard, roadmap, and check-in previews. Parameter deselection changes visibility, not historical client data.
- **Timeline/Roadmap:** select parameters first, then choose applicable supported calculations and optional planning comparisons. Offer meaningful examples such as weekly average, trend, target versus actual, and adherence. Only expose compatible calculations, and show what the selected calculation means. Render a weekly preview from selected fields. Weight, nutrition, activity, measurements, phases, and planned weight are examples, not a fixed mandatory column list. Do not invent unsupported health or body-fat formulas.
- **Mealplan:** explain through clear labels and a preview that actual meal count, meal labels/times, foods/swaps, macro/calorie targets, and nutrition schedules belong to individual client setup. Show how the current presentation variant exposes the built-in mealplan or IIFYM experience. Do not turn this section into a reusable meal prescription editor or rebuild the existing mealplan product.
- **Training:** configure enabled exercise/prescription fields: sets, fixed reps/rep ranges, tempo, set type, rest/pause, detailed instructions, and progression notes/system. Configure whether volume is displayed, its supported breakdown, and table/heatmap presentation. Provide a sample exercise/logbook preview with set-note context. Actual exercises, evergreen versus week-based program choice, and week count belong to client program setup. Any program preview must honor carry-forward instructions: three sets in week 1 persist until a change to four in week 4; earlier weeks remain unchanged and later weeks inherit four until another change.
- **Check-In:** functioning questionnaire builder with add/edit/reorder/duplicate/remove, required/optional settings, and appropriate field types such as short/long text, numeric, rating, choice, and visual upload. Select included summaries/statuses such as average bodyweight, nutrition, sleep, and habits. Preview the full form and a smaller custom update, which starts with bodyweight and supports selected metrics, visuals, and a note. Do not pretend the rules for coach-requested custom metrics are fully specified.
- **Habits:** enable/disable the independent feature and show its separate logging preview and optional summary sources. Actual habit definitions, goals, frequency, and purpose are client-specific. Never mix habits into ordinary Tracker field selection or coach to-dos.

Assignment opens a client picker and updates only the selected client's local assignment. The assigned preview reflects the saved template/variant while preserving existing plans and history. An unsaved template cannot silently be assigned as though saved.

## 5. Check-ins: weekly calendar and connected review

Always initialize the calendar to **one week** on entry. Show an explicit date range, seven readable day columns, current-day indication, **Previous, Next, Today**, and **Week / Month / Agenda** timeframe controls. Previous/next moves by the selected timeframe. Week is the default; other modes must really render the chosen period.

Check-ins are primarily date-based, so use a week board with stacked athlete entries rather than inventing hourly appointment slots. Each item shows athlete identity, recurring/additional origin, full/custom type where known, and a clear status. Distinguish **scheduled, overdue, submitted awaiting feedback, feedback sent**. Separate submission state from response state so opening a submission never completes it.

Generate recurring entries from each client's weekday schedule and merge extra dates without accidental duplicates. Add an extra date from the calendar, edit/reschedule/remove an extra date, and show the same schedule in that client's coach-side profile. Changing a recurring schedule affects future generated occurrences; preserve submitted history. Provide useful client/status filters and readable empty periods. Do not automatically claim that any submission on the same date satisfies an extra request; use explicit fixture associations or an explicit selection for the demo.

Selecting an item opens an anchored detail panel with relevant actions. Submitted items open a full **check-in review workspace** containing:

- The submitted full/custom questionnaire, selected summaries, notes, and visuals.
- Athlete tracker/progress context from the same client.
- Flagged training notes with exercise, set, and date intact.
- Coach feedback draft, a video-feedback affordance, and relevant client-plan links.

Provide a reviewable Loom-style video-feedback demo: recording/preview/attach/remove states, clearly local/demo media with a usable preview. Browser capture is optional and may only begin on explicit user interaction; the entire review must work without media permissions. Do not use inert recording buttons or imply an actual upload.

Demonstrate a plan adjustment in the client's local setup, using a small focused panel rather than rebuilding all plan editors. Track the actual changed values and generate a plain-language change summary plus links to the affected client plan. **Submit feedback** commits the response, adds the feedback/video reference and applicable change links to the athlete's conversation, updates calendar/review status, and removes it from the awaiting-response count. Closing or reopening review preserves the draft and leaves it awaiting feedback. Prevent duplicate submission.

## 6. Messages: familiar WhatsApp Web behavior

Make Messages feel like WhatsApp Web in layout and interaction, adapted to the current design system. This is the platform's own coach–athlete messaging, not a WhatsApp integration.

- Left conversation pane: search, **All / Unread / Flagged** filters, avatar/initials, athlete name, latest message excerpt, timestamp, unread badge, and permitted priority indicator. Support selecting conversations, searching within a thread, and opening from a calendar/profile context.
- Main chat pane: persistent athlete header, chronological incoming/outgoing bubbles, date separators, attachment cards, contextual workout/meal/check-in links, and modest local demo delivery/read metadata. Do not fabricate remote delivery acknowledgements. Show meaningful seeded status examples and label locally sent messages appropriately.
- Bottom composer: multiline text, Send, attachment menu, emoji picker, reusable reply snippets, and voice-note controls. Enter sends; Shift+Enter inserts a line break; respect text composition/IME. Disable empty sends. Preserve each conversation's draft when switching athletes.
- Sending text immediately adds a local message, updates the conversation excerpt/order and count, and keeps the correct client context. Sending is explicitly local to the mockup; show one quiet workspace-level demo indication rather than repeated warnings.
- Photos/files/videos use a real file picker, preview/removal before sending, and a visible attachment in the thread. Voice notes provide record/stop/preview/send/discard states; allow a usable seeded demo clip if recording is unavailable. Do not access microphone/camera until the user requests recording. Manage attachment object URLs correctly. If storing binary media across reload is out of scope, retain metadata and offer reattachment without broken players.
- Include a collapsible athlete context pane with next check-in, assigned template, priority permission, and links to profile, plans, and the relevant submission. Keep internal coach notes out of client message payloads.
- Opening a conversation marks its unread messages read in local shared state. Auto-scroll when already at the bottom; preserve the reading position otherwise and expose a new-message affordance. Keep conversation and chat scrolling independent.
- Availability and notification preferences open working controls with saved local state. Do not request system notification permission or imply real push delivery. Per-client priority-message permission follows the profile setting; permitted flags receive distinct in-app attention, while training flags remain separate. Disabling permission blocks new priority flags without erasing historical messages.

## 7. Existing roster/profile and cross-screen continuity

Carry the existing roster and athlete profile into the separate coach shell without redesigning their core content. Preserve filtering/sorting, table/card selection, identity, labels, coaching dates, onboarding submission, notes/tasks, schedules, assignment, check-in history, and priority permission where already available.

Provide working paths from an athlete to their chat, assigned-template preview, check-in calendar, and submitted review. If direct reuse of the existing component cannot route these actions correctly, adapt a copy in the new coach namespace. In the new mockup, do not maintain a second disconnected mini-chat or check-in review inside a profile: route those actions to the shared Messages/Check-ins workflows. Keep the current original profile unchanged.

Template assignment, variant switching, extra check-in dates, feedback status, unread badges, and priority permission must stay consistent across the new workspace. Notes that remain coach-only must never leak into outgoing feedback, client previews, or chat.

## 8. Build, inspect, and finish

Implement all three priority workspaces and full Appearance settings to usable first-version depth. Prefer fewer well-completed controls over an inventory of fake features. Every visible action must do something meaningful, or have an explicit unavailable state with a reason. Mock external services honestly; core editing, scheduling, review, local messaging, and appearance customization must actually work.

Run the app and inspect the actual rendered `/coach` screens in a browser at the desktop sizes and responsive fallback above. Exercise at least these journeys:

1. Create a template; configure widgets, tracker fields/units, roadmap calculations, training fields, and check-in questions; save; reload and reopen; duplicate; delete the duplicate and undo.
2. Preview and assign a saved template; switch its presentation variant; verify athlete entries/history remain intact and previews reflect configuration.
3. Enter Check-ins in week view; use previous/next/today; switch timeframe; add an extra date and verify profile/calendar consistency.
4. Open an awaiting check-in; inspect tracker and flagged set context; draft feedback; close/reopen without marking answered; make a client-plan adjustment; submit feedback and verify status/count/chat/change-link updates.
5. Filter/search chats; switch athletes while preserving drafts; send text, a snippet, an attachment, and demo voice media; check unread handling, priority permission, context links, and independent scrolling.
6. Check keyboard navigation, focus return after panels/dialogs, reduced motion, light/dark contrast, long content, empty states, narrow layout, and absence of obstructed controls or page overflow.
7. Open Appearance; change mode, each accent preset/custom hex, and each font; verify live samples and every workspace update; reload to confirm persistence; reset appearance and verify domain data survives. Verify the original mockup's appearance and storage remain unchanged.

Run `npm run typecheck`, `npm run lint`, and `npm run build`. Fix issues introduced by this work; report unrelated baseline failures without rewriting protected files. Add focused checks for meaningful new logic such as template isolation, recurrence/date handling, non-destructive variant switching, and feedback/unread state transitions, using existing tooling. Do not install a test framework merely for this mockup.

Finally verify that all pre-existing files and old storage keys are unchanged, and open `/` or `/ethereal` to check that the original mockup still works. Account for framework-generated artifacts separately; do not call the isolation check passed if protected application files changed.

Deliver the working `/coach` mockup, a concise summary of implemented flows, the exact preview URL, and what was actually tested and visually inspected. Briefly identify the implementation/review work performed by Luna subagents and any model-selection limitation. Record remaining product assumptions and other limitations briefly. If browser inspection is unavailable, say so clearly instead of claiming visual verification.
