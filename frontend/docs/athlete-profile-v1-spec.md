# Athlete profile v1 (step 3, first version)

Goal: a coach opens an athlete and understands status, timeline, plans and
key data within seconds, and can schedule deloads, diet breaks and refeed
days, where a refeed day or diet break can use its own meal plan option
without changing the prescribed plan. Built in the approved visual system
(`docs/visual-reset-spec.md`, `docs/DESIGN_SYSTEM.md`). First version for the
owner to react to; decisions below are the design lead's.

## Placement

`/coach?section=clients&client=<id>`, the **Overview** tab becomes the new
athlete overview. The other tabs (Plans, Check-ins, Notes & tasks,
Onboarding) stay. Everything the old Overview offered moves into the new
page: Preview assigned tool, Change assignment, Edit plans, recurring
check-in rhythm and additional dates, priority-message toggle.

## Layout (desktop, content max 1280px; single column below 900px)

1. **Header.** Avatar 56px, name (page title), subline: current phase name
   (from `phasePlan`), "Week N of M" in that phase, and "X weeks out" when a
   contest date is set. Actions right: "Open client app" (ghost, new tab
   `/client?client=<id>`), "Change assignment" (secondary), "Edit plans"
   (primary).
2. **Status tiles** (4 across, 2×2 on tablet, 1 column on phone), each a
   card with label, big tabular value, one supporting line:
   - Bodyweight: latest value + unit; "7-day avg X · ±Y vs prior 7 days";
     small accent sparkline of the last 28 days.
   - Training this week: "D of S sessions" done; supporting line with
     in-progress count and flagged notes count.
   - Nutrition today: today's resolved option label (e.g. "Training day" or
     "Refeed day"), kcal and protein of that option; a "Timeline" chip when
     the option comes from a timeline override.
   - Next check-in: date; supporting line "N awaiting your feedback".
3. **Timeline card** (full width). Header: "Timeline", contest date field
   (VARI8 DatePicker, optional, saved on the athlete), "Add to timeline"
   primary button. Body: a horizontal track covering the phase plan (or 16
   weeks from 4 weeks ago when there is no phase plan): phase segments
   labelled (neutral tones, current phase in accent-soft with accent text),
   week ticks, a "Today" marker in accent, the contest date as a flag
   marker, and events: deload and diet break as labelled bars spanning their
   dates, refeed days as dots (label on hover/focus and in the list). Below
   the track: list of events, upcoming first then past (muted), each row
   with kind chip, dates, note, override label ("Meal plan: Refeed day"),
   and edit/delete icon buttons (delete with undo toast, existing `toast`).
   The track scrolls horizontally inside the card on narrow widths.
4. **Two columns.**
   - Left (2/3): **Needs attention**: check-ins awaiting feedback, flagged
     set notes from `trainingLogs` (exercise, set, date, note), missed
     sessions this week, sessions left in progress. Each row links to the
     relevant existing place (check-in review, Plans tab). Empty state:
     "Nothing needs attention". Then **Recent training**: last 5 logged
     sessions (date, session name, "X of Y sets done", flag icon when a
     note is flagged, status chip).
   - Right (1/3): **Current plans** as compact cards: Training (program
     name, week N of M, next session), Nutrition (plan name, today's option,
     upcoming override if within 7 days), Supplements (item count,
     must-haves listed), Activity targets (formatted current targets). Each
     card has a "Change" ghost button navigating to the existing editor
     route for that plan. Then **Coaching setup**: recurring check-in
     weekdays + additional dates + priority-message toggle (reuse the
     existing controls from the old Overview).

## Timeline events

```ts
type TimelineEventKind = "deload" | "diet-break" | "refeed";
type TimelineEvent = {
  id: string;
  kind: TimelineEventKind;
  startDate: string;   // ISO date
  endDate: string;     // ISO date, >= startDate; refeed defaults to one day
  note: string;
  nutritionOverride?: { source: "mealPlan" | "iifym"; optionId: string };
};
// CoachClient.timelineEvents?: TimelineEvent[]; CoachClient.contestDate?: string
```

- Add/edit dialog (VARI8 Modal): kind (SegmentedControl: Deload, Diet
  break, Refeed day), date (refeed) or date range (others) with VARI8
  pickers, note, and for diet break and refeed: "Meal plan for these days"
  Select listing the athlete's active nutrition options (meal plan variants
  or IIFYM options, by label) plus "Keep regular plan". Deload has no
  override in v1 (training override comes later; the row says "Training
  unchanged").
- Validation: end ≥ start; refeed ranges up to 3 days; events of the same
  kind may not overlap; the override option must exist in the active plan.
- The regular plan is never modified. A resolver
  `nutritionForDate(client, date)` returns the regular option for that date
  (using the existing schedule selection logic in `plans/domain.ts`) unless a
  diet-break or refeed event with an override covers the date, in which
  case it returns the override option and the event.
- Client side (minimal proof): in the client app, Plans → Nutrition shows a
  banner on covered days, "Refeed day today: <option label>" (or "Diet
  break"), and shows that option's meals when the existing view can be given
  a variant; otherwise the banner names the option and the builder records a
  ruling.

## Pure logic (tested)

`src/components/coach/athlete/timeline.ts`: `validateTimelineEvent`,
`eventsOnDate`, `nutritionForDate`, `weeksOut(contestDate, today)`,
`currentPhase(phasePlan, today)` (phase, week in phase, total weeks),
`attentionItems(state, client, today)`, `weekTrainingSummary(state, client,
today)`, `bodyweightSummary(client, today)`. Today = `localToday()`.

## Demo data

One-time seed (`demoSeeds.athleteProfileDemo`) for Amara (client-007), only
filling what is missing: a phase plan (Contest prep 14 weeks starting 6
weeks before today, Peak week 1 week, Post-show 6 weeks), contest date at the
end of the peak week, a "Refeed day" meal plan variant (higher carbs) added to
her active meal plan without changing its schedule, and events: a refeed day
2 days after today using that variant, a deload in 3 weeks (one week), a diet
break later in prep (7 days, using her regular rest-day or daily option),
plus one past refeed. Never overwrite owner data.

## Out of scope for v1

Cross-athlete status overview on the Clients list, training overrides for
deloads, peak week/show-day tools, coach session-review screen, and
redesigning the other tabs.
