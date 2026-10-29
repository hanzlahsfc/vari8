# Athlete profile v2 (owner feedback on v1)

Changes to `docs/athlete-profile-v1-spec.md`. Owner decisions are marked
**Owner**; the rest are design-lead calls.

## Header

- **Owner:** no "More" dropdown (it was cut off), no quick links for
  Preview assigned tool or Check-in calendar.
- Header actions: "Edit plans" (primary), "Open client app" (secondary, new
  tab), chat icon button with unread badge. "Change assignment" moves into
  the Coaching setup widget ("Template: <name> · Change").
- Subline drops "X weeks out" (**Owner:** contest/target date is a later
  add-on). Keep "Contest prep · Week 7 of 14".

## Widgets and customization

**Owner:** the overview is semi-customizable by the coach, **configured in
the template builder, replacing the dashboard builder there.** Lead
decisions:

- In the template editor, the current Dashboard section (dashboard builder)
  is replaced by an **"Athlete overview"** section: one row per widget with
  a Toggle (visible) and move-up / move-down icon buttons, plus "Reset to
  default", and a small live preview of the resulting grid (widget titles in
  their widths). Saved on the template variant as
  `variant.athleteOverview?: { widgets: { id: AthleteWidgetId; visible:
  boolean }[] }` (ordered), validated in the template guard.
- A client's overview uses the layout of their assigned template variant
  (from the assignment snapshot, the same way other template settings are
  read). Clients without an assignment use the default layout. Missing or
  unknown ids fall back to the default; new ids added later appear at their
  default position.
- No customize control on the overview itself; a quiet "Layout from
  template <name> · Edit" link at the bottom of the overview opens that
  template's Athlete overview section.
- The dashboard builder is removed from the template editor. The client
  app's Home keeps rendering the variant's existing saved dashboard
  read-only so clients see no regression; Home is redesigned with the
  client app (step 5). Builder code stays in the repo, unused by the editor.
- Layout: a 12-column grid on desktop that flows widgets in the chosen order.
  Each widget has a fixed width: small = 3 columns, medium = 6, full = 12.
  Tablet: small 6 / medium 12; phone: everything 12.

| Widget id | Title | Width | Default |
| --- | --- | --- | --- |
| `bodyweight` | Bodyweight | small | visible |
| `next-check-in` | Next check-in | small | visible |
| `nutrition-targets` | Nutrition targets | medium | visible |
| `activity-targets` | Activity targets | medium | visible |
| `needs-attention` | Needs attention | medium | visible |
| `recent-training` | Recent training | medium | visible |
| `timeline` | Timeline | full | visible |
| `coaching-setup` | Coaching setup | medium | visible |
| `training-plan` | Training program | medium | hidden |
| `supplements` | Supplements | medium | hidden |

Default order is the table order. Removed from v1 (**Owner**): "Training
this week" and "Nutrition today" tiles; training program and supplements are
no longer shown by default (available as optional widgets).

## Nutrition targets widget (high priority, editable in place)

**Owner:** prescribed macros (IIFYM) or meal plan totals visible at a
glance and adjustable directly from the overview.

- Shows the active nutrition plan name and one column per nutrition option
  (e.g. Training day / Rest day / Refeed day): kcal, protein, carbs, fat in
  large tabular numbers; the option that applies today is marked "Today"
  (respecting timeline overrides). Fixed / range / minimum target wording is
  kept as the existing formatters produce it.
- **IIFYM:** "Adjust" switches the numbers into inline numeric fields
  (filled VARI8 inputs) per option. "Save" opens a small confirm with the
  date the change applies from (default today, VARI8 DatePicker, today or
  later) and saves a new active plan version through the existing plan
  lifecycle functions in `plans/domain.ts`, so the previous version stays in
  history. "Cancel" discards. Validation reuses the existing target
  validators.
- **Meal plan:** totals per option are computed from the plan (same totals
  the editor shows). "Adjust" opens the existing meal plan editor inside a
  full-size VARI8 Modal so the coach never leaves the overview, saving
  through its normal path. If the editor cannot be embedded without changing
  its behaviour, navigate to it instead and record a ruling.
- No plan: empty state with "Create nutrition plan" (navigates to the editor).

## Activity targets widget (editable in place)

- Shows current steps target (min / max / range / fixed wording) and cardio
  "N × M min per week", plus the date the current version started and the
  previous value ("was 8,000+ until 19 Oct").
- "Adjust" shows inline fields (steps kind SegmentedControl + value(s),
  sessions per week, minutes per session) and saves through
  `writeActivityTarget` effective today, with the existing same-day
  replacement confirmation.

## Timeline widget

- **Owner:** keep the timeline view, but deloads and refeeds are usually
  decided at short notice; remove the contest/target date (field and flag).
- Quick add buttons in the widget header: "Refeed", "Diet break", "Deload"
  (secondary pills) open the existing dialog pre-filled with that kind and
  today's date; "Add to timeline" stays as the general entry.
- The track focuses on the near term: 4 weeks back to 8 weeks ahead by
  default, with the phase plan as context; a "Full plan" toggle shows the
  whole phase plan.
- The event list shows upcoming and the last 4 weeks; older events collapse
  behind "Show earlier (N)".

## Needs attention

- Rename "Session left in progress" to "Unfinished session", meta "Started
  <weekday date> · X of Y sets". Only list unfinished sessions whose
  scheduled date is before today.
- Other rows unchanged.

## Optional widgets

`training-plan`: program name, week N of M, next session, "Change".
`supplements`: count, must-haves, "Change". Both reuse the v1 plan cards.
