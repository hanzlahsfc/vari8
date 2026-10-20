# CANVAS-HYDRATION plan

Issue #70, branch `beta/canvas-hydration-fix`, worktree
`/home/nexuslink/vari8-worktrees/canvas-hydration-fix`.

## Root cause (confirmed in node_modules)

- `framer-motion` `use-props.mjs` `useHTMLProps`: when `props.tabIndex ===
undefined` and `props.whileTap` (or `onTap`/`onTapStart`) is set, it renders
  `tabIndex=0` into the DOM props. `motion.button` with `whileTap` therefore
  emits `tabindex="0"` in SSR HTML.
- `framer-motion` `use-reduced-motion.mjs` `useReducedMotion()` calls
  `initPrefersReducedMotion()` lazily _during render_. On the server it is a
  no-op, so `prefersReducedMotion.current === null` (falsy). On the client it
  reads `window.matchMedia("(prefers-reduced-motion)")` synchronously, so the
  hydration render sees the real device value.
- `frontend/src/components/ethereal/coaching-app.tsx` line 125:
  `whileTap={reduceMotion ? undefined : { scale: 0.975 }}`. With the device set
  to reduce motion, the server renders `tabindex="0"` (whileTap present) and
  the hydration render omits it (whileTap undefined) -> React hydration
  mismatch on every `.eg-segment` button. The same mechanism can flip
  `initial`/`animate`/`transition` props anywhere `useReducedMotion()` gates
  them (17 callsites), e.g. the `motion.div` at coaching-app.tsx:148.
- The console notice is `warnOnce("You have Reduced Motion enabled on your
device. Animations may not appear as expected.", "reduced-motion-disabled")`
  inside the same hook; it fires for every `useReducedMotion` caller,
  including `coach/ui.tsx:288` (`Transition`).

## Fix (shared seam, not per button)

- New `frontend/src/lib/reduced-motion.ts`: `useReducedMotion()` built on
  `useSyncExternalStore` with `getServerSnapshot() => false`, so SSR and the
  hydration render both see `false`; the real media value applies after mount
  and live `change` events still work. Same return contract
  (`boolean | null` becomes `boolean`; all callsites use truthiness).
- All `useReducedMotion` imports in `src/` switch from `motion/react` to the
  shared module (other named imports stay on `motion/react`).

## Acceptance and how it is proven

- Repro first: `cd frontend && npm run dev -- --port 3973` in background;
  Playwright chromium at `reducedMotion: "reduce"` (the environment that
  triggers the bug) and `"no-preference"`; routes `/coach`, `/`, `/ethereal`;
  capture console messages per load.
- Pixels: screenshots `/coach` (carded route) and the affected studio route
  at 1440x900 and 390x844 before and after the fix, same browser/env/fonts;
  `magick compare -metric AE -fuzz 0` must report 0 differing pixels.
  Determinism control: two captures of the unchanged build diff to 0.
- Keyboard: record the Tab focus sequence (tag/label/text/class per focused
  element) before and after; identical.
- Gates: `cd frontend && npm run build` exit 0; root `verify-local.sh`
  (format, typecheck, lint, unit, build, frontend ci/typecheck/lint/test/
  build) exit 0; `npm run index` + `npm run index:check` exit 0 before push.
- Evidence under `icm/05-build/evidence/CANVAS-HYDRATION/`; report at
  `icm/05-build/reports/CANVAS-HYDRATION.md`.
