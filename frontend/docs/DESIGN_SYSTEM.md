# VARI8 design system

The live development reference is `/dev/design-system`. Source owners are `src/lib/vari8-theme.ts` (semantic color resolution), `src/styles/vari8-tokens.css` (geometry, typography, materials and motion), and `src/components/vari8/` (shared controls and specimens). This guide records the current minimal direction. The playground remains development-only and must return 404 in production.

## Visual direction

Use a near-black neutral canvas, quiet slightly raised panels, clear type hierarchy, and restrained accent lighting. The fixed palette is achromatic; changing the accent must never give every neutral surface a colored undertone. A small accent wash may identify one lead region. Ordinary panels, fields and controls remain quiet. Do not add ornamental light pools, bright enclosing shells, glass blur, gradients on every card, or feature-specific copies of controls.

Both modes are supported. Light mode uses white card bases and soft neutral decorative button edges. Dark mode uses the neutral surface hierarchy below. Depth should clarify grouping, rather than compete with the content.

| Role | Dark | Light |
| --- | --- | --- |
| `canvas` | #080808 | #F5F5F5 |
| `surface-navigation` | #171717 | #FAFAFA |
| `surface` | #101010 | #FFFFFF |
| `surface-raised` | #212121 | #FFFFFF |
| `surface-inset` / `field` | #0C0C0C | #FAFAFA |
| `surface-interactive` | #1D1D1D | #F6F6F6 |
| `surface-selected` | #282828 | #EAEAEA |
| `surface-featured` | #1B1B1B | #F1F1F1 |
| `surface-overlay` | #242424 | #FFFFFF |

Card variants in light mode keep a white base; hierarchy comes from grouping and restrained elevation. The `spotlight` treatment uses the ordinary surface base with a small bounded accent wash. It does not reserve empty space for decoration. `--v8-material-app` provides a faint localized light over the neutral canvas. Use material highlight/shade and elevation tokens rather than inventing shadow recipes.

## Spacing and typography

Use the spacing scale 4, 8, 12, 16, 20, 24, 32, 40, 48 and 64px. Group related controls closely; separate sections more generously. Default card padding is 20px, compact 16px, spacious 24px. Standard page insets are 32px desktop, 24px tablet, 16px phone. Cards use a 16px radius, controls 12px, compact controls 8px. Do not apply a single radius to every layer.

| Role | Size / line height | Weight |
| --- | --- | --- |
| Page title | 28 / 34px | 550 |
| Section title | 20 / 28px | 550 |
| Card heading | 16 / 22px | Medium |
| Body | 15 / 22px; phone 16 / 24px | Regular |
| Label, control, table | 14 / 20px | Regular or medium |
| Supporting text | 12 / 18px | Regular |
| Metric | 32 / 36px or 40 / 44px | 450 |

Use the locally registered VARI8 Geist face. Numeric data uses tabular numerals. Keep units explicit, align records, and retain readable axes and captions. Dense tables scroll inside their named region, never across the whole page. Navigation labels must fit without accidental wrapping; narrow navigation has a deliberate stacked arrangement.

## Custom accents

`vari8Theme({ mode, accent })` preserves the exact saved `accent-raw` and resolves legible display roles. Apply the result through `ThemeScope`. Do not independently choose black or white for colored controls.

- `accent-primary`, `accent-hover`, `accent-pressed` and `on-accent` form a contrast-checked filled-control family.
- `accent-subtle`, `accent-surface`, `accent-border`, `accent-highlight` and `accent-glow` provide restrained selection and material emphasis.
- `accent-gradient-start` / `accent-gradient-end` are readable action gradient endpoints.
- `accent-chart-line` / `accent-chart-fill` and `accent-focus` serve data and keyboard focus.

All properties have the `--v8-` prefix. Existing action, soft, spotlight, chart and focus aliases remain owned by the resolver. The raw preference survives mode changes and reloads. Extremely pale/dark colors can produce adjusted action/text roles. Status colors retain independent positive/warning/danger/info meaning. Filled foreground and background update atomically during accent changes.

## Component reuse

Reuse `Button`, `IconButton`, `Card`, `Input`, `Select`, `Tabs`, `SegmentedControl`, `Toggle`, `Checkbox`, `Modal`, `Tooltip`, `Navigation`, `Table`, `Status` and `DropdownMenu` from `components.tsx`. Reuse the extended fields listed below. Keep domain behavior and saved application state in their existing owners.

Buttons, single-line inputs, selects, searchable/multi-selects, dates and times use the shared `size="sm" | "md" | "lg"` contract: 32px, 40px and 48px on desktop. Up to 760px or on coarse-pointer devices, sm and md controls have a 44px target and lg stays 48px. TextArea accepts the same size API while keeping its multiline minimum height. Cards retain default/subtle/raised variants, padding sizes and plain/spotlight treatment. Use shared control styling and semantics across migrated features.

`Select` owns its styled popup as well as its trigger. Its controlled API is `value` plus `onValueChange(value: string)`; use `defaultValue` when uncontrolled. `onOpenChange(open)` reports popup dismissal for consumers coordinating a larger editing state. Do not fabricate native change events. Preserve labels, hints, error IDs, disabled/read-only states and form names. Its current callers in the playground are migrated together.

`Checkbox` accepts `indeterminate` for aggregate selections; it keeps the controlled boolean callback and exposes the mixed state to assistive technology.

## Extended field inventory

Import extended fields from `src/components/vari8/inputs.tsx`; their shared styles are loaded with the component library. The Inputs section of the playground groups working specimens by purpose and shows all field families at each supported size.

| Need | Shared control / pattern |
| --- | --- |
| Text, email, telephone, URL, search, password, numeric values | `Input` with the appropriate native type; password visibility example uses an inline action |
| Multiline notes | `TextArea` with label, hint, error and native textarea attributes |
| Single selection | `Select` with a themed Base UI popup |
| Search and selection | `SearchableSelect` with filtering and an empty-result state |
| Multiple selection | `MultiSelect` with visible selected labels and checked menu options |
| Calendar date | `DatePicker`, ISO `YYYY-MM-DD` value |
| Time | `TimePicker`, 24-hour `HH:mm`, including individual minutes |
| Date range | `DateRangePicker`, controlled start/end and order validation |
| Date and time together | `DateTimePicker`, controlled date/time parts, optional label/hint/error/name/read-only and 12/24-hour display |
| Month / ISO week | `MonthPicker` / `WeekPicker` with themed selectors |
| Boolean / exclusive choices | `Checkbox`, `Toggle`, `SegmentedControl`, and styled native radio groups |
| Continuous value | Styled native range with `.v8-range`, keyboard adjustment and a visible value |
| Files / color values | `Input type="file"` / `Input type="color"` with themed visible controls |

Calendar and time compositions expose controlled value callbacks; the consuming form owns submission and domain validation. `Input` and `Select` support form names. File and color chooser dialogs remain owned by the operating system; the visible field and chooser button follow the theme. Calendar, time, select and searchable menus are authored and themed inside the interface.

`Input`, `Select`, `TextArea`, `SearchableSelect`, `MultiSelect`, `DatePicker`, and `TimePicker` accept `size="sm" | "md" | "lg"`. Native input `size` can be set through `nativeSize`. Date and time fields accept `name`; their hidden form value uses the unchanged ISO date or `HH:mm` time value. Date/time composites accept a group label, hint, error, name, disabled/read-only state, and size; composite names use `.start` / `.end` and `.date` / `.time` suffixes. `hourFormat="12"` changes the picker display while preserving the 24-hour value callback. Month and week names submit their existing ISO value through a hidden form field.

Shared fields use the 40px control-height token on desktop and a 44px touch target at narrow widths or on coarse-pointer devices; large controls remain 48px. Their border uses the existing control edge in light mode and the quieter card border in dark mode. Select popups stay 6px from their trigger, align to its start edge, and flip sides when space is limited instead of aligning the selected item over the trigger. Decorative navigation icons have no enclosing tile; the navigation item itself carries selection and focus states.

## Layout compositions

Import `PageHeader`, `Toolbar`, `FormGrid`, `Section`, and `EditorHeader` from `src/components/vari8/layouts.tsx`. They provide semantic page/action groupings and shared responsive spacing; consumers still choose content and width. Layout components accept standard HTML attributes, including `aria-labelledby`, `aria-label`, `id`, and `className`.

`PageHeader` takes `title`, optional `description` and `actions`, optional content, and a `width` of `standard` (1280px maximum) or `wide` (1760px maximum). `Toolbar` wraps its fields at preferred search/filter widths. `FormGrid` takes one, two, or three as its maximum column count and reduces columns according to its own available width, including embedded previews. `Section` takes an optional title/description/action group and required content. `EditorHeader` takes a back link or callback, context, title, status, and action group; use the same order for nutrition and training.

`Modal` accepts `size="compact" | "standard" | "wide" | "full"`, capped at 480px, 640px, 960px, or viewport width minus 32px. The existing `maxWidth` prop remains available for a caller-specific width exception.

```tsx
<DatePicker label="Session date" value={date} onValueChange={setDate} />
<TimePicker label="Session time" value={time} onValueChange={setTime} />
<Select label="Session type" value={type} onValueChange={setType} options={options} />
```

## Interaction and accessibility

Show a visible label for every field. Keep errors readable, linked to the control, and explain recovery. Treat read-only and disabled as distinct states. Preserve focus outlines, keyboard operation and selection semantics. Text field boundaries remain identifiable even when decorative button borders are softer. Phone fields use at least 16px text and 44px targets.

Popups must inherit the active theme and accent. Mount inside the owning `ThemeScope`, or inside the nearest native dialog when present; never attach blindly to the first theme or document body. Date/time selection must update the value, dismiss appropriately and restore focus. Calendars support arrow keys, Home/End and PageUp/PageDown. Dates displayed during server rendering use an explicit consistent locale, avoiding hydration changes between server and browser.

The calendar marks the chosen day with a filled accent circle and today with a quiet outline when it is not selected. The time popup edits hour and minute directly; presets update its draft, Apply commits it, and Cancel, close, outside click or Escape discard it. Clear commits an empty value immediately.

Use the 120/180/240ms motion tokens and shared easing. Avoid routine layout animation and respect reduced-motion overrides. Animations must not be necessary to understand or operate a control.

The shared modal and date/time picker may use brief opacity and scale motion for pointer or touch opens and dismissals. Keyboard opens, Escape, and keyboard selection stay immediate; reduced motion uses an 80ms opacity fade without scaling. Keep Select and other frequent controls immediate.

## Change boundaries and verification

Do not redesign unmigrated application pages when changing the playground. Keep legacy `--cd-*`, `--eg-*` and other application consumers intact. New migrated features consume semantic roles and shared primitives. A temporary alias or exception needs an owner and a removal condition.

Before adding a raw color, spacing, radius or shadow, look for its role. When changing shared controls, update their specimens and check both modes, arbitrary accents, keyboard focus, errors, disabled/selected/pressed states and narrow layouts. The baseline accent sample is lavender, pink, turquoise, orange, lime, near-white and very dark blue.

Run the theme and component checks, field utility checks when applicable, repository lint, typecheck and build. Check the real rendered open menus and pickers, not only closed controls. Verify that the production route and client chunks exclude the development playground. Current implementation evidence is under `reports/vari8-clean-system/`; historical comparison pages describe earlier iterations, not the current system.

Run `npm run ui:check` to execute the scanner fixture self-tests and scan Coach/Ethereal feature CSS and TSX for shared-control style drift. Exact reviewed exceptions are recorded in `scripts/ui-system-exceptions.json`.
