# One page frame for wide screens

## Intent

Most coaches use wide monitors. Today every section and tab picks its own
width (main column 1280 / 1680 / 1760 / uncapped, plan editors 1200, setup
panels 1100, forms 860), and the tracker/timeline break out of the column
when their table is wide. Switching pages makes edges and menus jump, and
turning on "Compare with logged" makes the timeline suddenly stretch.

User decision (2026-11-04): **page edges and menus always stay in one place
when switching tabs/pages**, and the frame **fills the screen up to ~2400px**
(option 2). Readability is kept by laying wide pages out as side-by-side
panels, not by stretching text.

## Goals

- One frame for every page: same left/right edge for page header, profile
  header, tab bar, page titles and toolbars, at a given window size.
- The frame only changes on window resize, never on navigation or on toggles
  (compare with logged, collapsing groups, future weeks).
- Nothing grows past the frame. Content wider than the frame scrolls inside it.
- Wide frames are used: tables fill the frame, editors show panels side by side.

## Non-goals / anti-goals

- No full-width stretched text blocks or form fields (unreadable on 2560+).
- No per-page breakout or "wide mode".
- Not a redesign of page content beyond how it fills the width.

## The frame

- `.cd-main`: one max content width of **2400px** for every section, plus the
  gutter, centred in the area right of the sidebar. Gutter
  `clamp(24px, 2vw, 40px)`.
- At 1440px window ≈ 1180px content, 1920 ≈ 1620, 2560 ≈ 2270, 3440 → 2400
  (centred, side margins only on ultrawide).
- Remove: per-section caps (`cd-main-clients/templates/wide` max-widths and
  their `:has()` overrides), the `.ap-header`/tab-bar pin, `[data-wide]`
  breakout CSS, `nextWide`/`wide-breakout.ts` and the `data-wide` state in
  tracker and timeline.

## How each page type fills the frame

1. **Tables** (tracker, timeline, later logbook / weekly volume):
   - The table is always exactly the frame width.
   - Columns keep their measured natural width as a minimum. If the natural
     total is narrower than the frame, the extra width is distributed across
     the data columns proportionally (date/week column stays fixed). No cap:
     a table that fills the width like a spreadsheet, with row lines and row
     hover carrying the eye.
   - If the natural total is wider than the frame, columns stay natural and the
     table scrolls/drag-pans inside the frame (as today).
   - Toggles (compare with logged, collapsing a group, showing future weeks)
     only redistribute width inside the frame. Collapsing a group gives its
     width to the others, animated together with the existing width
     transition. Measure the container (frame), not the canvas, to avoid
     feedback loops.
2. **Plans and editors** (meal plan first; training, supplements, setup
   editor, check-in builder later): a full-width header area (overview,
   schedule, tools) and side-by-side panels below, each of comfortable width.
   - **Meal plan:** variants show as columns. Columns =
     min(number of variants, 3, floor((width + gap) / (720 + gap))). So 1 at
     1440, 2 at 1920, 3 at 2560. Each column has its own header (variant
     label, a switcher to choose which variant it shows when there are more
     variants than columns, duplicate, delete). The first column is the active
     variant; the rest follow in order. With one column the current tab UI
     stays. Overview, schedule and saved-meal library span the full width.
3. **Lists** (clients, templates, check-ins inbox, notes): card grids with
   auto-fill columns or list + detail split. Designed in the rollout, not the
   trial.

## Trial scope (before rollout)

- Frame applied to the **client profile** (Clients section: profile header,
  tab bar, all tabs).
- Real wide layouts for **Tracker**, **Timeline** and the **Meal plan editor**
  (client Plans → Nutrition, and the same editor in Templates → Nutrition).
- ~~Other profile tabs keep their current inner layout, centred under the
  stable header.~~ Rejected after review (2026-11-04): narrow centred islands
  under a full-width header look broken. Every profile tab's content spans the
  full frame; width is used by rails, grids and columns, never by stretching
  text lines or form fields.
- Meal-plan column minimum is the measured width at which a food row (name,
  amount, macros, Add alternative, Swap food) stays on one line, not 720px.
- Other sections are untouched in the trial.
- Checked at 1440, 1920, 2560 and 3440, dark and light.

## Review round 2 (2026-11-05)

- **Meal plan columns are a sliding window**, not per-column picks. Columns
  show a contiguous run of options in plan order (1-2, 2-3, 3-4 …). An option
  strip above the columns lists every option (the visible run marked) with
  previous/next buttons that shift the window by one and "Add option" at the
  end. Adding an option appends it and shifts the window so the new option is
  the last visible column (1-2 → 2-3). Clicking a hidden option in the strip
  moves the window the minimum amount to include it. Arrow/Home/End keys in
  the strip move the active option and the window follows. The active option
  is the one last selected or interacted with; its column is marked. The
  per-column "show another option" switcher is removed.
- **Supplement plans are grouped by timing.** Groups are derived from the
  free-text timing (trimmed, case-insensitive), ordered by time of day
  (waking, breakfast, pre-, intra-, post-workout, lunch, afternoon, dinner,
  bed; unknown timings after in first-appearance order; "No timing set"
  last). Each group has a heading with its count and its own "Add
  supplement" that pre-fills the timing. The timing field suggests existing
  timings and common presets so groups don't fragment. A card moves to its new
  group when the timing field is committed (blur / Enter), never per
  keystroke. Move up/down works within a group. The read-only plan view uses
  the same grouping. No data-model change.
- **Rollout to every section**: one `.cd-main` frame (2400 + gutters) for all
  sections, scrollbar gutter reserved app-wide.
  - Templates lists: card grids with auto-fill columns.
  - Client roster: fills the frame (table columns distribute width, or card
    grid with auto-fill).
  - Check-ins calendar: fills the frame; the details panel is a right rail on
    wide frames. Review: answers and photos/progress side by side, text capped.
  - Notes: To-dos and Notes side by side as two columns on wide frames (tabs
    stay below that width).
  - Messages: **one explicit exception to the 2400 frame** (owner decision,
    Run C). The conversation rail starts flush at the main area's left edge
    (directly right of the sidebar, no gutter or frame margin) and the thread
    runs to the viewport's right edge. The rail keeps
    `clamp(320px, 22%, 400px)`; bubbles stay capped at `min(82%, 720px)` and
    the composer stays inside the chat column. Mobile (≤760px) is unchanged.
  - Unchanged: settings dialog, client-app preview overlay, mobile layouts.

## Left to the builder

- Exact gap values, column header styling (reuse existing tabs/select
  primitives and the design-system tokens).
- Saved-meal library "use meal" in multi-column mode targets the column the
  coach last interacted with (default first column); report if awkward.
