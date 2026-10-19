# CANVAS-HYDRATION evidence (issue #70)

Harness: `capture.mjs` (Playwright chromium headless, `next dev` on
127.0.0.1:3973, viewport screenshots 1440x900 and 390x844, deviceScaleFactor
1). Runs are split by `prefers-reduced-motion` emulation, because the bug only
fires when the device requests reduced motion.

## Layout

- `before/` raw capture of the unfixed canvas. Under `reduce`, `/` and
  `/ethereal` log the React hydration mismatch (`tabindex="0"` on the five
  `eg-segment` buttons present in SSR HTML, absent in the client render) and
  the Next dev overlay "1 Issue" badge is visible in the bottom-left of the
  screenshots. `/coach` shows no hydration error: its tree sits behind a
  `useSearchParams` Suspense bailout, so it is never hydrated against SSR DOM
  (the issue text names `/coach`; the `eg-segment` nav lives in the Ethereal
  studio served at `/` and `/ethereal`). The `coach/ui.tsx:288` console notice
  is motion's dev `warnOnce` fired by `useReducedMotion` under reduced motion.
- `before-b/` second capture of the same unfixed code. Screenshot diffs
  `before/` vs `before-b/`: 11 of 12 pairs identical; `reduce-root-390.png`
  differs by exactly 1 pixel at (16,350), a 2/255 single-channel delta on the
  rounded corner of the pink "Add widget" button. This is Chromium antialiasing
  jitter between page loads, not animation timing; it is recorded as the
  harness noise floor.
- `after/` raw capture of the fixed code. Zero hydration messages on every
  route in both envs; the issue badge never appears.
- `before-clean/` / `after-clean/`: captures with the dev overlay hidden
  (`nextjs-portal{display:none}` injected before screenshot), so only the
  canvas is compared. `before-clean` was captured with the fix stashed
  (hydration error reproduced in `console-reduce-{root,ethereal}.log`), and
  `after-clean` with the fix restored. All 12 pairs: **0 differing pixels**
  (`magick -compose difference -colorspace gray -threshold 0`).

## Tab order

- `tabs-*.log`: Tab-press focus sequences (28 presses, 1440 width, reduce env).
- `before/tabs-root.log` and `before/tabs-ethereal.log` show two extra
  `<nextjs-portal>` stops: the dev error overlay itself is focusable while the
  bug is active. That is part of the defect, not the canvas tab order.
- `before-clean/` vs `after-clean/` (overlay hidden): the focused elements are
  identical and in identical order on `/coach`, `/`, `/ethereal`. The only
  token-level difference is `tabindex="0"` on the five `eg-segment` buttons,
  which the fix removes post-mount under reduce; `<button>` stays natively
  focusable so order is unchanged. Normalized diffs (the attribute stripped)
  are byte-identical.

## Residual console line

The `reduce` logs still contain motion's dev warning
`You have Reduced Motion enabled on your device` (warnOnce key
`reduced-motion-disabled`). It is emitted by framer-motion's internal
`useReducedMotionConfig` inside every motion component under
`MotionConfig reducedMotion="user"`, not by app code, and it is not a
hydration warning. It cannot be removed without patching the library.
