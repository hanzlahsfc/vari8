# Coach app consistency audit (2026-11-09)

Evidence: `/tmp/audit/` — 43 surfaces × dark/light screenshots, computed-style
dumps (`styles/*.json`), grouped analysis `analysis-dark.txt`
(`scripts/analyze.mjs`). Reference: `docs/DESIGN_SYSTEM.md` and the visual
reset spec (tone not borders; one accent for primary/selected/current).

## Findings

### 1. Type roles drift (biggest source of "looks inconsistent")

Reference values are the approved visual reset spec
(`docs/visual-reset-spec.md` "Type scale", mirrored in
`src/styles/vari8-tokens.css`); DESIGN_SYSTEM.md's older table is superseded.

| Role (reset spec / token) | Found |
| --- | --- |
| Page title 30/36 w600 (`--v8-font-size-page-title`) | `PageHeader` h1 matches; client profile name **22/33 w650**; Messages title **15/22 w400** (looks like a label, not a page title) |
| Section title 18/24 w600 | h2 18/24 on Notes/Check-ins cards (ok as sections); setup Tracker/Timeline sections **17/20**; calendar range **16/24** |
| Card heading 15/20 w600 | matches on plan cards, review answers, roster/template cards; deviants: Overview cards **w650**, meal plan overview **16/20 w550**, Active plan **14/20** |
| Supporting 12/16 | 12/16 (ok), plus 12/22, 12/18, 11/16.5, 14/21 and **15/22** used for subtitles/descriptions — 15px descriptions under 15px card titles remove the hierarchy |
| Label 13/18 w500 | field labels render **14/21** w500; schedule day labels 12/18; checkbox/toggle labels in **three sizes** (12/18, 14/21, 15/22.5) |
| — (not in system) | uppercase micro-labels in 5 forms: tracker/timeline group titles 10px w700, "COACH NOTE" 11px w600, "CUSTOMIZED" chip, "CLIENT SETUP" / "TEMPLATE SETUP" nav heading, "COACH WORKSPACE" |

Card titles are the same size as the text under them on roster cards and
check-in review answers (15 vs 15), so hierarchy relies on weight only.

### 2. Fields

- Template editor "01 Tabs": Template name (`Input`, 14px) vs Description
  (`TextArea`, **16px**) — the mismatch you noticed. TextArea uses the phone
  size on desktop; its focus ring also differs from Input.
- Custom inline inputs outside the shared Input: check-in question label
  (15px, h35, r8), tracker/timeline group name (15px, h31, r6), meal food
  quantity (h32).

### 3. Selected / current-item states

- Tabs and segmented controls: filled accent pill (consistent) — except
  **four** tab-like controls with their own treatment: meal-plan option tabs
  and Weekly/Cycle (dark surface + border + shadow), training Weekly/Custom
  rotation (surface + shadow), training session tabs (accent fill + accent
  border).
- Segmented sizes: 14px standard, 12px (timeline Newest/Oldest), 11px
  (preview Coach/Client app).
- Navigation "you are here": sidebar = accent-tinted fill + 1px accent border
  + shadow, r12, 15px, 51px tall; setup left nav = same tint + border, r9,
  14px, 45px; profile tabs = filled accent pill. Three treatments for the
  same meaning; the bordered ones break the reset spec.

### 4. Borders and radii in dark mode (spec: tone, not borders)

Resting 1px borders on: tracker tiles (r12), timeline phase blocks (r14),
meal-plan overview/schedule cards (r20), meal food lists (r19), training
rotation/volume cards (r16), client-app check-in cards (r14), messages
panels/header/composer, setup editor header, plan footers, calendar days,
sidebar edge + account button. Radii in use: 20, 19, 18, 16, 15, 14, 12, 9,
8, 6 (tokens: 24 overlay, 20 card, 14 control/nested, 10 compact, pill).
Card padding: 20, 24 (template cards), 20/22, 16/18, 12, 9, 5.

### 5. Buttons and chips

- Shared `Button`/`IconButton` are consistent (40 / 32px pills).
- Custom one-offs: meal move/save/remove circles (h34), question expand
  (h26 r6), structure flags (h21 r6), dashed "Add column" (h28 r8) vs dashed
  calendar "Add date" (h44 pill), schedule variant pickers (13px, bordered).
- Two status-pill components (`cd-status` 12/18 vs `v8-status` 12/17 w500);
  tracker day chip is r6 rectangle, structure chips r0.

### 6. Tracker / timeline headers

Group titles: uppercase 10px w700 muted; column labels 11px w600 muted;
units inline; week label 12px; phase header accent. Three header styles
across tables (tracker/timeline 11px uppercase-ish; roster + review `th`
12/18 w450; calendar weekday 12/18 w400).

### 7. Page header stacking

Editors stack utility breadcrumb + accent back link + eyebrow + title. The
client profile uses its own header (avatar, 22px name) and Messages has no
page header at all.

### To verify

- One tracker capture at 1920 rendered the phone fallback ("The tracker is
  designed for desktop.") — `narrow` uses `window.innerWidth < 900`; likely a
  capture-timing artifact, re-check during the fix run.

## Owner decisions (2026-11-09)

- **Overline:** keep uppercase micro-labels as ONE official style:
  11/16, weight 600, letter-spacing 0.06em, uppercase, text-secondary. Used
  for tracker/timeline group titles, sidebar "Coach workspace", setup nav
  heading, field-group captions like "Coach note", and the Customized chip
  text. Add as tokens (`--v8-font-size-overline` etc.) + a shared class.
- **Tracker/timeline headers:** two lines — overline group title on top;
  column name below at 12/16 w500 text-secondary, unit as a muted
  (text-tertiary, w400) suffix on the same line, e.g. "Ø kg", "Water L".
  Same header style for every data table (client list, check-in review,
  calendar weekdays): 12/16 w500 text-secondary.
- **Current item in sidebar + setup left nav (lead's call, owner deferred):**
  tone fill (`--v8-surface-selected`), no border, no shadow, label
  text-primary w500, icon/number in accent. Same radius (14px) and height
  (40px) in both menus; label 14/20.

## Proposed fix batches

1. Type roles: one set of shared classes/tokens for page title, section
   title, card title, supporting text, table header, and (if kept) overline;
   apply to every surface above.
2. Selected states: tabs/segmented all filled-accent pill via shared
   `Tabs`/`SegmentedControl`; one navigation current-item treatment for
   sidebar + setup nav.
3. Fields: TextArea matches Input size/focus on desktop; inline custom
   inputs move to shared `Input size="sm"`.
4. Surfaces: drop resting borders in dark mode, snap radii/padding to tokens.
5. Buttons/chips: one Status component, one dashed "add" button, custom
   icon circles → `IconButton size="sm"`.
6. Tracker/timeline headers and the sidebar (menu bar) restyled per decisions.
