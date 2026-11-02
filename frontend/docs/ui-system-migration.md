# UI system migration implementation plan

> For agentic workers: use the approved rollout and project Conductor workflow. Luna implements bounded frontend tasks; the main session owns independent review. Do not spawn another reviewer or perform Git writes.

Goal: apply the approved VARI8 system throughout Coach, its client previews, and functional Ethereal studio screens without changing domain behavior or saved browser state.

Architecture: retain the existing theme resolver and shared controls. Shared layout compositions own repeated geometry. Migrate consumers in bounded groups and delete superseded rules with their callers.

Tech stack: existing Next.js 16, React 19, TypeScript, Base UI and CSS. No dependency additions.

Spec: `reports/ui-system-audit-2026-10-20/system.md`. Rollout: `reports/ui-system-audit-2026-10-20/rollout.md`, approved by the user in this chat.

## Constraints and review focus

- Preserve all current storage keys, illustrative records, form value callbacks, draft/active separation, grid schemas and route behavior.
- Use the current checkout, which contains the approved uncommitted prototype. Baseline snapshot and hashes are under ignored `.agent-runs/2026-10-20-ui-migration/`. No Git cleanup, commits, PRs or publication.
- Controls 32/40/48px, touch minimum 44px; 12px control, 16px card, 24px overlay radii; use semantic colors and existing accent resolution.
- Preserve labels, hints, errors, native form names, minimum dates, composite date-time serialization, read-only and disabled distinctions.
- Verify nested popups inherit the right dialog/theme and restore focus, including keyboard Escape and selection.
- Verify narrow embedded editors as well as viewport width. Training weekday labels must remain identifiable; tables scroll locally.
- Keep persistent preview up. Use fresh current-tree checks and real rendered evidence. Do not mark pending coverage passed.

## Work packages and ownership

### 0. Baseline

- [x] Snapshot current source and record Git status before product edits.
- [x] Baseline lint: exit 0, 221 files.
- [x] Baseline typecheck: exit 0.
- [x] Baseline production build: exit 0; log in `.agent-runs/2026-10-20-ui-migration/baseline-build.log`.

### 1. Shared components and layouts

Owner: foundation worker. Files: `src/components/vari8/`, `src/styles/vari8-tokens.css`, `docs/DESIGN_SYSTEM.md` only.

- [x] Inspect actual component APIs, callers and local Next.js styling/client-component guide.
- [x] For behavior changes, add a meaningful failing check, run it, implement, then confirm green. Use rendered checks for reversible styling.
- [x] Add consistent field `size?: ControlSize` support and shared density; coarse-pointer touch sizing; composite field metadata and Modal sizes.
- [x] Add `layouts.tsx` and `layouts.css`: PageHeader, Toolbar, FormGrid, Section and EditorHeader. Props use ReactNode slots and ordinary div/header attributes; layouts never own domain state. Publish exact signatures before consumers use them.
- [x] Update working specimens and documentation, including disabled/read-only and size parity.
- [x] Run four existing VARI8 checks; report exact changes and known limits. Main reviews output.

### 2. Coach controls and workflows

Owner: Coach workflow worker. Files: top-level `src/components/coach/` excluding `client-preview*`, `client-plan-preview*`, `habits-tab*`, domain model/store and muscle helpers. No files under plans, builder, client-tracker-preview or VARI8.

- [x] Inspect callers. Migrate adapters to styled VARI8 Button, IconButton, Input/TextArea, Select, Toggle, Modal and date/time fields. Preserve existing exported APIs temporarily where many callers depend on them.
- [x] Replace repeated page/filter/form/section geometry with shared layouts, first in roster and extra-date dialog.
- [x] Remove generic CSS overrides that alter migrated controls. Migrate local legacy controls explicitly; no blanket stylesheet restyle of unmigrated features.
- [x] Migrate shell/preferences, roster/card/profile tabs and assignments; all eight template sections; check-in calendar/review; messages; notes and their dialogs.
- [x] Keep application state, routing, domain validation and callbacks unchanged.
- [x] Report remaining patterns/exceptions and run scoped syntax/type checks after coordination. Main reviews representative screens before broad completion.

### 3. Plan editors and client presentation

Owner: plan/presentation worker. Files: `coach/plans/`, `coach/builder/`, `coach/client-tracker-preview/`, `coach/client-preview*`, `coach/client-plan-preview*`, `coach/habits-tab*`. No VARI8, root coach CSS/ui, model/store or Ethereal files.

- [x] Inspect current callers and contracts. Preserve plan behavior and dates, training prescriptions, tracker data and builder schemas.
- [x] First migrate training header/metadata/rotation and fix content-width compression with 200px weekday field preference and stacking context panel.
- [x] Migrate nutrition, goals/habits/setup, library dialogs, and date/time adapters; use shared components/layouts and remove component-specific geometry forks.
- [x] Apply shared roles to dashboard widgets and all seven client destinations, including tracker Today/Week/Trends and constrained previews.
- [x] Use real behavior checks for changes; run existing domain checks relevant to edited behavior. Main owns browser verification and independent review.

### 4. Ethereal functional surfaces

Owner: foundation worker after package 1 review. Files: `src/components/ethereal/`, `src/lib/ethereal-appearance.tsx` only if necessary, and scoped global CSS only after coordination.

- [x] Migrate the common control API, functional Dashboard/Tracker/Clients/Meal plans and Foundations specimens to VARI8.
- [x] Preserve Appearance's editorial layout, configured fonts and independent saved demo records.
- [x] Remove duplicate generic date/time/control implementations only after callers move. Keep domain ownership intact.
- [x] Verify source checks and representative rendered flows; report exceptions.

### 5. Integrate, verify and complete

Owner: main session. No separate Sol reviewer.

- [ ] Inspect all worker changes against baseline hashes/diffs and approved spec; send precise repairs to original owner. Main session performed representative source and screenshot review, not a full re-review of every inherited change; Ethereal `client-profile.tsx` still uses the local `cp-button`/`cp-tabs` family (bypasses shared actions/tabs) — adoption gap tracked below.
- [x] Render representative roster, training and extra-date dialog before accepting broader migration.
- [ ] Verify remaining ledger rows below. Keyboard, open popup, light/dark and pale/dark accent coverage ran in an isolated Chrome context at desktop and 390px, but aggregated popup assertions failed (date/time return-focus and select Enter-open); rows are partially verified, not complete. Documented limits in `resumed-verification-report.md`.
- [x] Run the shared checks, relevant domain suites, lint, typecheck and build. The full gate passed before the two repairs; lint, typecheck, build, drift and extended component checks passed again after the repairs. Domain models and context files were unchanged by the repairs. Logs are under `resumed-*.log`.
- [x] Verify production `/coach` and `/ethereal` return 200, `/dev/design-system` returns 404, and playground code is excluded. Confirmed on a temporary production server (stopped after checks); development preview kept running.
- [x] Remove obsolete adapters and add bounded drift checks. Update actual coverage and exceptions below, with evidence paths.

## Screen ledger

| Screen or pattern | Shared replacements | Required verification | State |
| --- | --- | --- | --- |
| Coach shell and preferences | Navigation, IconButton, Modal, fields | Collapse/expand/narrow, saved mode/accent, focus | Verified 2026-10-21: collapse, prefs dialog, mode/accent persistence, 390px shell |
| Clients roster and cards | PageHeader, Toolbar, fields, Table, Card, Status | Search/filter/sort, cards, empty, local scroll | Migrated; phone/desktop reviewed |
| Profile Overview | Section, Card, choices, date fields | Assignments, rhythm, date popup | Migrated; phone reviewed |
| Profile Plans | FormGrid, fields, actions | Phase plan, goals, habits, modules | Migrated; phone reviewed |
| Profile Check-ins | Table, Status, dialog | History and review navigation | Migrated; phone empty state reviewed |
| Profile Notes & tasks | Tabs, form fields, Modal | Add/edit/completion/reminders | Migrated; phone reviewed |
| Profile Onboarding | Section, fields, Status | Existing onboarding behavior | Migrated; phone reviewed |
| Template library | PageHeader, Toolbar, Card, DropdownMenu | Add/edit/preview/assign/menu/empty | Migrated; all eight panels reviewed at desktop/phone |
| Template Tabs | Section, Toggle, TextArea | Enabled destinations and description | Migrated; all eight panels reviewed at desktop/phone |
| Template Dashboard | Builder with shared Card/fields | Gallery, preview, move/resize | Migrated; all eight panels reviewed at desktop/phone |
| Template Tracker | FormGrid, fields/choices | Configure and save/cancel | Migrated; all eight panels reviewed at desktop/phone |
| Template Timeline / Roadmap | Section, fields | Current configuration and preview | Migrated; all eight panels reviewed at desktop/phone |
| Template Nutrition | Shared setup fields | Modes/options and preserved values | Migrated; all eight panels reviewed at desktop/phone |
| Template Training | Shared setup fields and dialogs | Library/options and preserved values | Migrated; all eight panels reviewed at desktop/phone |
| Template Check-In | Shared setup fields | Existing questionnaire settings | Migrated; all eight panels reviewed at desktop/phone |
| Template Habits | Shared setup fields/choices | Existing habit settings | Migrated; all eight panels reviewed at desktop/phone |
| Nutrition editor | EditorHeader, FormGrid, fields, Tabs, Modal | Schedule, foods, saved meals, history, preview/activate | Migrated; draft, popup, preview/history reviewed |
| Training editor | EditorHeader, context layout, fields, Tabs, Modal | Weekday compression, exercise/prescription/library, preview/activate | Migrated; phone/tablet reviewed |
| Check-in calendar | PageHeader, Toolbar, Select, dialog | Week/Month/Agenda/filter/date/details | Verified 2026-10-21: Week/Month/Agenda, filters, day detail dialog |
| Check-in review | Section, context layout, TextArea | Visuals, draft and response states | Verified 2026-10-21: day dialog to review workspace, draft state |
| Messages | Master/detail, fields, menus | Empty/list/thread/narrow, composer and contextual actions | Verified 2026-10-21: list/thread/composer, thread search + emoji actions, 390px |
| Notes workspace | PageHeader, Toolbar, Tabs, Modal | Scope/search/empty/add/edit/reminders | Verified 2026-10-21: tabs, search, add note/to-do dialogs incl. reminder fields |
| Client Dashboard | Shared widget roles | Charts, periods, saved grid | Migrated; phone reviewed |
| Client Tracker | Shared fields/choices/table | Today/Week/Trends, cell and time popups | Migrated; Today/Week/Trends and nested time reviewed |
| Client Timeline / Roadmap | Section and status roles | Existing phases and layout | Migrated; phone reviewed |
| Client Nutrition | Shared plan presentation | Meals/targets/schedule | Migrated; phone empty state and draft preview reviewed |
| Client Training Program | Shared plan presentation | Sessions and set interactions | Migrated; phone empty state reviewed |
| Client Check-In | Shared fields | Questionnaire and state | Migrated; phone reviewed |
| Client Habits | Shared choice/status roles | Completion and calendar | Migrated; phone reviewed |
| Ethereal Appearance | VARI8 controls, editorial layout | Fonts/mode/accent, Foundations | Verified 2026-10-21: mode/accent/fonts, Foundations incl. compact density |
| Ethereal Dashboard | Shared widget/control roles | Gallery, charts, move/resize, preview | Verified 2026-10-21: gallery add, keyboard move cancel, resize surface cancel |
| Ethereal Tracker | Shared fields/choices/table | Configure, Today/Week/Trends | Verified 2026-10-21: configure mixed checkbox, Today/Week/Trends; rating edit blur defect fixed (see evidence) |
| Ethereal Clients | Shared list/profile controls | Filters, views, profile/dialogs | Verified 2026-10-21: roster anchors, profile tabs, priority switch |
| Ethereal Meal plans | Shared editor fields/dialogs | Schedule, saved meals, history, date/time | Verified 2026-10-21: schedule, saved-meal select/load, history, variant tabs |
| Development playground | Actual shared controls/layouts | Theme/state matrix, production exclusion | Partially verified 2026-10-21: 4 mode/accent combos (`--v8-accent-raw` exact), modal open/Escape + focus return, select ArrowDown open → Enter commit / Escape → trigger focus, and 390px all passed; date/time popup return-focus and select Enter-open unresolved in automation (inconsistent between isolated and long sequences) |

## Decisions and evidence

- 2026-10-20: user approved the complete proposal. Proceed without another design approval or execution-method question.
- 2026-10-20: work in the current approved prototype checkout with disjoint file ownership. New Git worktrees would omit the untracked product; no Git operations are needed.
- 2026-10-20: baseline source snapshot includes 255 files. Baseline lint and typecheck pass.

- 2026-10-21: all implementation packages are integrated. Full lint passes on 221 files; drift fixture tests and scan pass with six exact accessible-label visibility exceptions. Theme checks pass 17 cases, shared component/date/motion checks pass, domain suites pass 20 cases, and context checks pass 16 cases. Final build/typecheck and the remaining rendered ledger coverage are still pending.
- 2026-10-21: the preview reached its memory threshold and stalled during automatic restart while reading dependency files. Recovery uses the existing supervisor. Final verification must report actual completion, not reuse baseline build evidence.
- 2026-10-21 (resumed session, Codex `01a15b27` recovery): before the two repairs, the full gate passed: `ui:check` (11 reviewed exceptions), lint (219 files), typecheck, build, theme (17), components, date-utils, overlay-motion, domain suites (20), context (16). Production spot-check: `/coach` 200, `/ethereal` 200, `/dev/design-system` 404, no playground code in client chunks. Post-repair checks are recorded separately below. Logs: `.agent-runs/2026-10-20-ui-migration/resumed-*.log`; report: `resumed-verification-report.md`.
- 2026-10-21: two review-confirmed defects fixed. (1) `SearchableSelect` put `name`/`disabled`/`required` on `Combobox.Input` instead of `Combobox.Root`, so FormData serialized the visible label, not the option value — moved to Root; SSR assertions added to `components.checks.mjs` (RED/GREEN logs: `h1-red.log`, `h1-green.log`). (2) `NumericTrackerCell` rating editor had no blur exit — blurring an unopened select left `editing` stuck and disabled all tracker navigation; added a guarded `onBlurCapture` on `.tc-cell` that cancels without stealing focus. Live regression `resumed-tracker-blur-regression.mjs` passes 10/10 on both the Ethereal mount and the Coach preview mount (`h2-red.log`/`h2-green.log`, `tracker-blur-regression.json`).
- 2026-10-21: corrected playground evidence — `--v8-accent-raw` equals the exact chosen hex in all four mode combos (`playground-recheck-results.json`). Unresolved: focus after date/time popup close was inconsistent — inside the `data-closed` popup in the long aggregated sequence (2/2 runs) vs on the trigger in isolated flows (6/6); cause unconfirmed, possibly test-sequencing artifact. Enter-on-select-trigger similarly opened on fresh pages but not in the aggregated context. Flagged for manual keyboard check; no speculative popup changes made.
- 2026-10-21: post-repair `npm run lint` (219 files) and `npm run build` pass on the repaired tree (`resumed-final-lint.log`, `resumed-final-build.log`); production spot-check re-run on the new build — `/coach` 200, `/ethereal` 200, `/dev/design-system` 404 (`resumed-final-prod.log`).
- Remaining adoption gap (migration not wholly complete): `src/components/ethereal/clients/client-profile.tsx` still renders local `cp-button`/`cp-tabs` (`client-profile.css`: `.cp-button` 36px/pill, `.cp-button-small` 31px/11px, custom `.cp-tabs`) outside the shared actions/tabs — not part of the 11 reviewed exceptions.
