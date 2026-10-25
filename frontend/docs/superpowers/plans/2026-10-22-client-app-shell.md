# Client app shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the coach-only preview tab row with a standalone, mobile-first client app (Home, Plans, Tracker, Training, Check-ins) that the coach preview also renders.

**Architecture:** A pure section model decides which sections and Plans sub-sections a client sees. A `ClientApp` component composes the existing client views (moved verbatim out of `client-preview.tsx`) behind one navigation that is a bottom bar in narrow containers and a sidebar in wide ones (CSS container queries, so the coach's phone frame behaves like a phone on a desktop viewport). A new `/client` route renders `ClientApp` for a fictional client from the same browser-local coach state.

**Tech Stack:** Next.js 16 app router (read `node_modules/next/dist/docs/01-app` before adding the route), React client components, shared VARI8 controls in `src/components/vari8/`, lucide-react icons, Node test runner.

**Spec:** `docs/client-app-frontend-design.md` (slice 1, "Shell"). Slices 2 (Training) and 3 (Check-ins) get their own plans after this lands. The spec's single shared "today" is introduced in the slice 2 plan, where logs and schedules first depend on it; this slice keeps each reused view's existing clock unchanged.

## Global Constraints

- Browser-only preview with fictional data; no backend, login screen or sync. Coach-to-client loop is shown in the same browser.
- Follow `AGENTS.md`, `PROJECT_CONTEXT.md`, `docs/DESIGN_SYSTEM.md`: shared VARI8 controls, achromatic fixed surfaces, accent-derived lighting.
- Section order and labels exactly: `Home`, `Plans`, `Tracker`, `Training`, `Check-ins`.
- Bottom bar when the app container is narrower than 768 px; sidebar at 768 px and wider.
- Plans sub-section order and labels exactly: `Nutrition`, `Supplements`, `Activity targets`, `Timeline / Roadmap`.
- No coach navigation, coach notes or coach-only data inside the client app.
- Touch targets at least 44 px; safe-area insets respected on the standalone route.
- Do not change behavior of the reused views (tracker, roadmap, nutrition, training prescription, check-in form, habits, dashboard). Moves are verbatim.
- Do not commit in this workspace (the owner has not been committing here); report changed paths instead.
- Leave the persistent preview (`npm run preview:up`, port 3000/3001) running; Next hot-reloads source edits.

## Review Focus

- A `/client` URL with a missing, unknown or unassigned client id: shows an empty state with a link back to the coach workspace, never a crash or the seed client. (Task 3 browser check.)
- First paint of `/client` before local state hydrates: must not flash seed data then swap to stored data. (Task 3: render a loading state until `hydrated`.)
- The coach preview on a desktop viewport in Phone mode: must show the bottom bar, because the decision uses the container width, not the viewport. (Task 2 browser check.)
- Old preview entry points pass legacy tab names (`PREVIEW_TAB_BY_SECTION` in `templates.tsx`, e.g. `Supplements`, `Training Program`): they must land on the matching section and Plans sub-section. (Task 1 test `sectionForLegacyTab`.)
- Switching sections and back must keep in-progress tracker edits (the current preview keeps the tracker mounted with `hidden`). (Task 2 browser check.)

---

### Task 1: Section model

**Files:**
- Create: `src/components/client-app/sections.ts`
- Test: `src/components/client-app/sections.test.mjs`

**Interfaces:**
- Consumes: `Variant` (`src/components/coach/model.ts:598`), `ClientPlans` (`src/components/coach/plans/types.ts:80`). Type-only imports, so the file runs under `--experimental-strip-types`.
- Produces:
  ```ts
  export type ClientAppSectionId = "home" | "plans" | "tracker" | "training" | "check-ins";
  export type ClientPlanPart = "nutrition" | "supplements" | "activity-targets" | "roadmap";
  export type ClientAppSection = { id: ClientAppSectionId; label: string; planParts: ClientPlanPart[] };
  export const PLAN_PART_LABELS: Record<ClientPlanPart, string>;
  export function clientAppSections(
    configuration: Pick<Variant, "views" | "habits">,
    plans: Pick<ClientPlans, "supplements" | "activityTargets"> | undefined,
  ): ClientAppSection[];
  export function sectionForLegacyTab(
    tab: string | undefined,
  ): { section: ClientAppSectionId; planPart?: ClientPlanPart } | undefined;
  ```

Rules (from the spec): `home` ⇐ view `Dashboard`; `tracker` ⇐ view `Tracker` or `habits === true`; `training` ⇐ `Training Program`; `check-ins` ⇐ `Check-In`; plan part `nutrition` ⇐ view `Nutrition` or legacy `Mealplan`; `roadmap` ⇐ `Timeline / Roadmap`; `supplements` ⇐ `plans?.supplements` present; `activity-targets` ⇐ `plans?.activityTargets?.length > 0`. `plans` is included only when it has at least one part. `planParts` is `[]` for other sections. Order is fixed regardless of `views` order.

- [ ] **Step 1: Write the failing tests**

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { clientAppSections, sectionForLegacyTab } from "./sections.ts";

const ALL = ["Dashboard", "Tracker", "Timeline / Roadmap", "Nutrition", "Training Program", "Check-In"];
const ids = (sections) => sections.map((s) => s.id);

test("all views plus assigned plans give five sections in fixed order", () => {
  const sections = clientAppSections({ views: [...ALL].reverse(), habits: false },
    { supplements: { items: [] }, activityTargets: [{ id: "v1" }] });
  assert.deepEqual(ids(sections), ["home", "plans", "tracker", "training", "check-ins"]);
  assert.deepEqual(sections.map((s) => s.label), ["Home", "Plans", "Tracker", "Training", "Check-ins"]);
  assert.deepEqual(sections[1].planParts, ["nutrition", "supplements", "activity-targets", "roadmap"]);
  assert.deepEqual(sections[0].planParts, []);
});

test("plan-driven parts appear without their template view; empty targets do not", () => {
  const sections = clientAppSections({ views: ["Check-In"], habits: false },
    { supplements: { items: [] }, activityTargets: [] });
  assert.deepEqual(ids(sections), ["plans", "check-ins"]);
  assert.deepEqual(sections[0].planParts, ["supplements"]);
});

test("Plans is hidden when no part qualifies; legacy Mealplan counts as Nutrition", () => {
  assert.deepEqual(ids(clientAppSections({ views: ["Tracker"], habits: false }, undefined)), ["tracker"]);
  const legacy = clientAppSections({ views: ["Mealplan"], habits: false }, undefined);
  assert.deepEqual(legacy[0].planParts, ["nutrition"]);
});

test("habits alone enable Tracker; nothing enabled gives no sections", () => {
  assert.deepEqual(ids(clientAppSections({ views: [], habits: true }, undefined)), ["tracker"]);
  assert.deepEqual(clientAppSections({ views: [], habits: false }, undefined), []);
});

test("legacy preview tab names map to sections and plan parts", () => {
  assert.deepEqual(sectionForLegacyTab("Dashboard"), { section: "home" });
  assert.deepEqual(sectionForLegacyTab("Habits"), { section: "tracker" });
  assert.deepEqual(sectionForLegacyTab("Supplements"), { section: "plans", planPart: "supplements" });
  assert.deepEqual(sectionForLegacyTab("Timeline / Roadmap"), { section: "plans", planPart: "roadmap" });
  assert.deepEqual(sectionForLegacyTab("Nutrition"), { section: "plans", planPart: "nutrition" });
  assert.deepEqual(sectionForLegacyTab("Training Program"), { section: "training" });
  assert.deepEqual(sectionForLegacyTab("Check-In"), { section: "check-ins" });
  assert.equal(sectionForLegacyTab("Unknown"), undefined);
  assert.equal(sectionForLegacyTab(undefined), undefined);
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `node --experimental-strip-types --loader ./src/components/coach/plans/test-loader.mjs --test src/components/client-app/sections.test.mjs`
Expected: FAIL, module `./sections.ts` not found.

- [ ] **Step 3: Implement `sections.ts`** with the interfaces and rules above.

- [ ] **Step 4: Run and confirm it passes**

Same command. Expected: 5 tests pass.

---

### Task 2: `ClientApp` shell and coach preview frame

**Files:**
- Create: `src/components/client-app/views.tsx`: move verbatim from `src/components/coach/client-preview.tsx` everything except `ClientPreview` (helpers `trackerConfig`, `trackerEntries`, `parameterGroups`, `foodMap`, segment helpers, `illustrativeTrainingPlan`, and `DashboardTab`, `TrackerTab`, `RoadmapTab`, `NutritionTab`, `TrainingTab`, `IllustrativeTrainingTab`, `CheckInTab`). Export the seven view components and `trackerConfig`. Fix relative imports (`./x` → `../coach/x`). Keep `import "../coach/client-preview.css"` wherever the moved markup's classes need it.
- Create: `src/components/client-app/client-app.tsx`
- Create: `src/components/client-app/client-app.css`
- Modify: `src/components/coach/client-preview.tsx`: reduce to `ClientPreview` (same exported signature) rendering the banner and a framed `ClientApp`.

**Interfaces:**
- Consumes: Task 1's `clientAppSections`, `sectionForLegacyTab`, `PLAN_PART_LABELS`; `SupplementPlanView` (`coach/supplements/plan-view`); `TargetSummary` (`coach/targets/target-summary`) with `versions={client.plans?.activityTargets ?? []}`, `date={useLocalToday()}` (`coach/targets/use-local-today`, the clock the tracker and roadmap already use), `mode="week"`; `HabitsTab`; VARI8 `SegmentedControl` (`vari8/components.tsx:471`).
- Produces:
  ```ts
  export function ClientApp(props: {
    configuration: Variant;
    client: CoachClient;
    illustrative: boolean;          // true for template sample previews (existing `!client` cases)
    initialTab?: string;            // legacy tab name, mapped with sectionForLegacyTab
    context: "standalone" | "preview";
  }): JSX.Element;
  ```

Behavior:
- One `<nav aria-label="Client app">` with one button per section (icon + label, `aria-current="page"` on the active one). Icons: `House`, `ClipboardList`, `Activity`, `Dumbbell`, `CalendarCheck`. The app root has `container-type: inline-size`. Below 768 px container width the nav is a bottom bar sticky to the bottom of the app; at 768 px and wider it is a left sidebar. Same markup, CSS only.
- Home renders `DashboardTab`. Plans renders a `SegmentedControl` of its `planParts` (hidden when only one part), then the part: `NutritionTab`, `SupplementPlanView`, `TargetSummary`, `RoadmapTab`. Tracker renders `TrackerTab` (if the `Tracker` view is enabled) then `HabitsTab` (if `habits`), with `habitDone` state owned by `ClientApp`. Training renders `TrainingTab`. Check-ins renders `CheckInTab`.
- Keep the tracker mounted while other sections are shown (`hidden` attribute, as today) so in-progress edits survive section switches; keep its existing `key`.
- No sections: render the existing `Empty` with title "No sections enabled" and body "Enable at least one tab in the template's Tabs section."
- `ClientPreview`: keeps its banner; adds a `SegmentedControl` labelled "Preview width" with options `Phone` (default) and `Desktop`; Phone renders `ClientApp` inside a 390 px wide frame whose height fits the dialog with internal scrolling; Desktop renders it full width. Passes `context="preview"` and `illustrative={!client}`. For assigned clients add a link "Open client app" to `/client?client=<id>` (new tab, `rel="noopener"`).

- [ ] **Step 1: Move the views** into `views.tsx`, leaving `ClientPreview` temporarily importing them. Run `npm run typecheck`. Expected: exit 0.
- [ ] **Step 2: Implement `ClientApp` and its CSS**, then switch `ClientPreview` to it.
- [ ] **Step 3: Static checks.** Run `npm run typecheck && npm run lint && npm run ui:check`. Expected: all exit 0.
- [ ] **Step 4: Browser check (coach preview).** `npm run preview:status` reports app and reports healthy. At a 1440 px viewport open `client-001` → Overview → "Preview assigned tool". Phone mode shows the bottom bar; Desktop mode shows the sidebar. Visit each section; Plans shows the sub-sections Emma has. Type a tracker value, switch to Plans and back: the value is still there. Open the template library preview for a template (sample athlete) and check it still renders. Repeat Phone mode in light mode and with a pale accent (`#EB91B8`) and a dark accent. Check the Plans segmented control and the "Preview width" control by keyboard. Save screenshots outside Git under `.agent-runs/2026-10-22-client-app-shell/`.

---

### Task 3: Standalone `/client` route

**Files:**
- Create: `src/app/client/page.tsx`: `metadata` title "Client app — local demo"; renders `<Suspense><ClientRoute /></Suspense>` like `src/app/coach/page.tsx`.
- Create: `src/components/client-app/client-route.tsx` ("use client"): wraps `CoachProvider`, reads `client` from `useSearchParams`.
- Create: `src/components/coach/coach-theme.ts`: `export function coachThemeStyle(preferences: CoachState["preferences"]): CSSProperties`, extracted verbatim from `coach-app.tsx:102-141` (the `themeVariables`/`vari8Theme`/`accentControlColors` style object).
- Modify: `src/components/coach/coach-app.tsx:102-141`: use `coachThemeStyle(state.preferences)`; no visual change.

**Interfaces:**
- Consumes: `CoachProvider`, `useCoach` (`coach/store.tsx`), `templateSetup(snapshot, variantId)` (`coach/template-setup`), Task 2's `ClientApp`.
- Produces: route `/client?client=<id>`; `coachThemeStyle`.

Behavior:
- Root element: `className="coach-root v8-theme client-app-route"`, `data-mode`, `style={coachThemeStyle(state.preferences)}`, so all existing scoped styles and the owner's mode/accent apply.
- Until `hydrated` is true, render a minimal loading state ("Loading demo…"), never seed data.
- Client found with an assignment: top bar with client name, a VARI8 `Status` reading "Local demo", and a link "Coach workspace" to `/coach?section=clients&client=<id>`; then `ClientApp` with `configuration = templateSetup(client.assignment.snapshot, client.assignment.variantId)`, `illustrative={false}`, `context="standalone"`. The app fills `100dvh`; the bottom bar pads `env(safe-area-inset-bottom)`.
- Missing/unknown id or no assignment: `Empty` titled "No client app to show" with body "Choose a client with an assigned template in the coach workspace." and a link "Coach workspace" to `/coach?section=clients`.

- [ ] **Step 1: Extract `coachThemeStyle`** and use it in `coach-app.tsx`. Run `npm run typecheck`. Expected: exit 0. Spot-check `/coach` renders identically in both modes.
- [ ] **Step 2: Add the page and `ClientRoute`.**
- [ ] **Step 3: Static checks.** `npm run typecheck && npm run lint && npm run ui:check` exit 0; re-run the Task 1 test command, 5 pass.
- [ ] **Step 4: Browser check (standalone).** At 390×844 and 1440×900 open `http://127.0.0.1:3000/client?client=client-001`: bottom bar at 390, sidebar at 1440, no console errors, no flash of different data on reload. Open `/client`, `/client?client=nope`, and a client without an assignment: each shows the empty state with a working link. Edit something in the coach workspace (e.g. a supplement plan item), reload `/client?client=client-001` in the same browser: the change shows. Dark and light mode, pale and dark accent. Screenshots to `.agent-runs/2026-10-22-client-app-shell/`.
- [ ] **Step 5: Record.** Set the design doc's status line to "Slice 1 (shell) implemented; slices 2–3 pending." and list changed paths in the final report.
