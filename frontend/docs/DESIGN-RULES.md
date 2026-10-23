# Design rules

The binding rule sheet for UI work in this repository. `DESIGN_SYSTEM.md` stays
the visual reference; this file records what is enforced and what is planned.

How to use: run `npm run ui:check` before committing UI work. If a rule blocks a
real case, add an entry to `scripts/ui-system-exceptions.json` with a reason and
a removal condition. Never edit a check to make it pass.

Status values: `live in check` runs inside `npm run check`. `live manual
(reviewer runs)` is a working check the reviewer runs outside `check`.
`planned` names the script that will own the rule; it is not enforced yet.

## Tokens

### R1. Use only `--v8-*` colour roles in feature CSS for `color`, `background`, `border-color`, `outline-color` and `box-shadow`; never write a hex, rgb or hsl value in those properties.
- Check: `ui:check`
- Status: `live in check`

### R2. Set spacing only from the `--v8-space-*` scale or a layout primitive `gap` prop; never write raw lengths for padding, margin or gap.
- Check: `ui:check`
- Status: `planned`

### R3. Set radii only from the `--v8-radius-*` scale.
- Check: `ui:check`
- Status: `live in check`

### R4. Set type size and line height only from `--v8-font-size-*` and `--v8-line-height-*`.
- Check: `ui:check`
- Status: `live in check`

### R5. Give every interactive control its height from `--v8-control-height-sm`, `--v8-control-height-md` or `--v8-control-height-lg` and nothing else.
- Check: `ui:geometry`
- Status: `live manual (reviewer runs)`

## Controls

### R6. Build UI from the shared controls (`Button`, `IconButton`, `Input`, `Select` and the rest of `src/components/vari8/`); never write a raw `<button>`, `<input>`, `<select>` or `<textarea>` in feature TSX.
- Check: `ui:check`
- Status: `live in check`

### R7. Never pass `unstyled` to a shared action.
- Check: `ui:check`
- Status: `live in check`

### R8. Never override height, padding, border, radius, background, font, colour, shadow or outline on `.v8-*` selectors or on classes passed to shared controls.
- Check: `ui:check`
- Status: `live in check`

### R9. Add a new variant or size to the shared component and its CSS, then to the gallery matrix; never create it inside a feature file.
- Check: `test`
- Status: `planned`

### R10. Let the control size its icons; never pass a numeric `size` to an icon inside a control.
- Check: `ui:check`
- Status: `planned`

## Layout

### R11. Give components no outer margin; set space between siblings with `Toolbar`, `FormGrid`, `Section` or the planned `Stack` and `Inline` primitives.
- Check: `ui:check`
- Status: `planned`

## Overlays

### R12. Mount menus, selects, pickers, tooltips and modals through Base UI `Portal > Positioner > Popup` with flip and shift collision handling inside the owning `ThemeScope`; never position a popup inside its trigger wrapper.
- Check: `ui:geometry`
- Status: `live manual (reviewer runs)`

## Proof

### R13. Update the gallery matrix in the same commit as any shared control change.
- Check: `test`
- Status: `planned`

### R14. Pass the geometry snapshot for every control at every size in both modes before a shared change merges.
- Check: `ui:geometry`
- Status: `live manual (reviewer runs)`

## Exceptions

An exception is an entry in `scripts/ui-system-exceptions.json` with file,
selector, property and a reason carrying a removal condition. The stale
exception check fails the build once the debt is gone.

## Ratchet

`scripts/ui-baseline.json` holds today's per rule debt counts. A count may only
shrink: `ui:check` compares the file against the merge-base copy and fails on a
raise unless `V8_BASELINE_RAISE` names the reason.
