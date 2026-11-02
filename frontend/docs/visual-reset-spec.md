# Visual reset: specification (step 2)

Reference: the owner's "Fitness Health Tracker / FitPal" mobile template
screenshot (dark, tone-elevated rounded cards, one vivid accent used
sparingly, pill chips, large confident numbers, soft charts). Keep light and
dark mode and the custom accent. Guided by the high-end visual design and
Apple design skills, adapted to a data-dense coaching product.

## Principles

1. **Tone, not lines.** Cards and fields separate from the page by surface
   tone (and in light mode a very soft shadow), not by 1px grey borders.
   Hairlines remain only where rows inside one card need dividing.
2. **One accent, used sparingly.** The accent marks the primary action, the
   active/selected state, the current day/bar in charts and key highlights.
   Everything else stays neutral. Neutral surfaces stay achromatic in both
   modes regardless of accent.
3. **Generous rounding, concentric radii.** Large rounded cards, pill
   chips and buttons, circular icon buttons. Inner radius = outer radius
   minus padding.
4. **Confident numbers, quiet labels.** Big semibold tabular metrics with
   tight tracking; small muted labels.
5. **Calm motion.** Press feedback on pointer-down, custom easing, nothing
   bouncy unless a gesture carried momentum. Reduced motion respected.
6. **Same component, same look, everywhere.** Light mode is as finished as
   dark mode.

## Colour roles (`src/lib/vari8-theme.ts`, `makeSurfaceRoles` / text / border)

| Role | Dark | Light |
| --- | --- | --- |
| canvas | #0B0B0C | #F2F2F4 |
| surface-navigation | #111113 | #FFFFFF |
| surface (cards) | #161618 | #FFFFFF |
| surface-subtle | #1B1B1E | #F7F7F8 |
| surface-raised | #1F1F22 | #FFFFFF |
| surface-inset / field | #1C1C1F | #F2F2F4 |
| surface-interactive (hover) | #232327 | #EDEDF0 |
| surface-selected | #2A2A2E | #E6E6EA |
| surface-featured | #1B1B1E | #F7F7F8 |
| surface-overlay (popups, sheets) | #1F1F22 | #FFFFFF |
| text | #F4F4F5 | #18181B |
| text-secondary | #A1A1A8 | #5F5F67 |
| text-tertiary | #8A8A92 | #6E6E76 |
| border (hairline dividers) | rgba-equivalent #232326 | #E7E7EA |
| border-control | keep the contrast-safe 3:1 computation, base #6E6E76 | same |

Contrast-safety calls stay (`contrastSafe` on text, status, focus). Accent
resolution (action fill, on-action, accent-text, chart, focus) stays as is.

## Geometry and type (`src/styles/vari8-tokens.css`)

- Radii: `--v8-radius-card` / `--v8-radius-panel` 20px; `--v8-radius-overlay`
  24px; `--v8-radius-field` and `--v8-radius-control` 14px;
  `--v8-radius-compact` / `--v8-radius-dense` 10px; pill unchanged.
- Card padding: sm 16px, md 20px, lg 24px (unchanged values, new radii).
- Shadows (new tokens):
  - `--v8-shadow-card`: dark `none`; light
    `0 1px 2px rgba(16,16,20,.04), 0 6px 20px rgba(16,16,20,.05)`.
  - `--v8-shadow-overlay`: dark `0 16px 48px rgba(0,0,0,.5)`; light
    `0 12px 40px rgba(16,16,20,.12)`.
  Mode-dependent values are set via `[data-mode]` selectors or the theme
  resolver, whichever the code already uses for mode-specific tokens.
- Type scale: page title 30/36 weight 600 tracking -0.02em; section title
  18/24 weight 600 tracking -0.01em; card heading 15/20 weight 600; body
  15/22 (phone 16/24); label 13/18 weight 500; supporting 12/16; metric
  32/36 and large 40/44 weight 600 tracking -0.025em, tabular numerals.
- Font: keep the registered Geist face.
- Icons: Lucide with `strokeWidth` 1.6 for UI icons at 18–20px (navigation,
  buttons, rows). Set through a shared default where icons are rendered by
  shared components; feature code may keep explicit values ≤1.75.
- Motion: keep the 120/180/240ms tokens; easing `cubic-bezier(.32,.72,0,1)`
  for sheets/overlays and `cubic-bezier(.23,1,.32,1)` for UI state; press
  `transform: scale(.97)` over 100ms on buttons, chips and tappable rows;
  `prefers-reduced-motion` turns scale/slide into opacity only.

## Shared controls (`src/components/vari8/*.css`)

- **Card:** surface fill, radius 20px, no border in either mode, light-mode
  `--v8-shadow-card`. Variants: `subtle` uses surface-subtle; `raised` uses
  surface-raised (+ shadow in light). Spotlight keeps its bounded accent
  wash.
- **Fields (Input, Select trigger, TextArea, Searchable/MultiSelect, date
  and time triggers):** filled with `--v8-field`, no visible border at rest
  in both modes (a transparent 1px border keeps layout stable), radius 14px.
  Hover: surface-interactive. Focus: 2px accent focus ring
  (`--v8-accent-focus`), no grey border. Error: danger ring. Disabled:
  50% opacity; read-only: field fill, no ring. This replaces all differing
  border treatments; no field may look harsher than another.
- **Buttons:** pill radius. Primary = accent action fill with on-action
  text. Secondary = surface-subtle fill, text colour, no border. Ghost =
  transparent, text colour, hover surface-interactive. Danger keeps its
  tokens. Heights per the existing size contract.
- **IconButton:** circular, surface-subtle fill, no border; ghost variant
  transparent.
- **SegmentedControl / Tabs:** track = field fill, pill radius, 4px inner
  padding; selected segment = accent action fill with on-action text (the
  reference's active chip). Unselected text secondary.
- **Chips / Status:** pill, 12px/16px text, weight 500. Neutral = surface-
  selected fill. Tones use a soft tinted fill (status colour mixed ~14%
  into the surface) with the status text colour. No borders.
- **Checkbox / Toggle:** checked = accent action fill; unchecked track =
  field fill; no grey outline except a 1.5px border-control outline on the
  unchecked checkbox for identifiability.
- **Modal / popups / menus:** surface-overlay, radius 24px (menus 16px),
  `--v8-shadow-overlay`, no border in dark mode, hairline in light mode.

## Client app shell and logbook (proof screens)

- **Top bar (standalone):** canvas background, no bottom border; client
  avatar circle + name left, "Local demo" neutral chip, coach link as ghost
  text.
- **Bottom navigation:** a floating bar inset 12px from the sides and
  bottom (plus safe area), radius 24px, surface-navigation at 88% opacity
  with `backdrop-filter: blur(20px) saturate(160%)` (solid when
  `prefers-reduced-transparency`), light-mode shadow-overlay. Items: icon
  20px stroke 1.6 and an 11px label; active item = accent action fill pill
  behind icon+label with on-action colour. Content gets bottom padding so
  nothing hides under the bar.
- **Sidebar (≥768px container):** surface-navigation, no border; active item
  = surface-selected pill with accent-text icon.
- **Section headings:** 18/24 semibold with an optional "See all"-style
  ghost link on the right.
- **Training week:** week title 22/28 semibold, date range secondary; a row
  of day chips Mon–Sun under the title (session days filled surface-subtle,
  today accent outline, done days with a small accent dot, selected day
  accent fill) as in the reference's day strip; session cards: radius 20px,
  surface, 16px padding, name 15/20 semibold, meta 12px secondary, status
  chip right; next session card gets an accent action-filled "Start" /
  "Resume" pill button inside the card (not floating beside it); done cards
  at 60% opacity with a check chip.
- **Session logger:** exercise cards radius 20px; "Last time" as an inset
  field-filled block radius 14px with values in tabular numerals; set rows
  as a compact grid: set number badge (circle 28px, surface-selected),
  weight and reps fields (field fill, 44px, centered tabular text, unit
  suffix inside the field), done toggle as a 36px circular check button
  (accent fill when done); note/flag as ghost icon buttons. Finish session =
  full-width accent pill above the bottom nav.

## Out of scope for step 2

Redesigning coach screens' layouts and the dashboard widgets. They inherit
the new tokens and controls automatically and are only checked for
breakage (overflow, unreadable text, broken layouts), not perfected.
