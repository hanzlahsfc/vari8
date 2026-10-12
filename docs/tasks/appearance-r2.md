# APPEARANCE-R2 — Live theme-switch staleness: diagnosis (no defect)

## Mandate

APP-ACCEPTANCE-R1 reported that `color-mix(var(--color-*)…)` surfaces
(`.home-card`, `.de-card`, `.de-week`, `.de-datenav`, …) keep pro-dark
computed colors after an in-page Dark→Light toggle "until navigation."
R2's job: reproduce in isolation, diagnose honestly, repair only if a
real defect exists.

## Environment (task-owned)

- Disposable PostgreSQL `acc2_db` on the local Docker instance (fresh
  `prisma migrate deploy`), synthetic `acc2` workspace/client/pin —
  **not** shared `app_dev`.
- Production build of `107860e4` on `next start -p 3300` with the dev
  flag matrix; Playwright Chromium 153.0.8010.12.
- Served CSS byte-identical to the build chunk (verified via
  `.next/static/chunks/*.css`).

## Reproduction result — defect NOT confirmed

Observed behavior (measured, both directions, no navigation):

| t after click | `.home-card` computed bg (Dark→Light)        |
| ------------- | -------------------------------------------- |
| +0 ms         | `oklab(0.2768 … / 0.78)` (still dark)        |
| +50 ms        | `oklab(0.6153 … / 0.78)` (mid-interpolation) |
| +100 ms       | `oklab(0.9978 … / 0.78)` (nearly white)      |
| +250 ms       | `color(srgb 1 1 1 / 0.78)` (fully light)     |

Light→Dark converges identically; the DailyEntry `.de-card` also
converges at +0 ms (its measured value was already correct at first
read). Cold load with stored `pro-white` is correct before paint.

## Diagnosis

The "stale" reading is the **declared transition**: every affected
selector carries `transition: background(-color) 170–180ms` (hover/focus
polish, `app/globals.css` ~1271/1339/1485). A click→measure at ~0–150 ms
samples the in-flight crossfade. `getComputedStyle` forces a style
recalc but returns the _interpolated_ animated value, not the target —
the acceptance run's single-shot read caught transition start.

- Built CSS is correct: `background:var(--color-surface)` fallback +
  `@supports`-gated `color-mix` — verified in the served chunk.
- Plain `var()` colors flip immediately; nothing is "stuck."
- No injected instrumentation — reproduced on the shipped CSS/JS.

## Decision: no code change

The symptom is a 180 ms background crossfade — deliberate-looking
micro-motion that also powers hover feedback. Under
`prefers-reduced-motion` the switch is instant (transitions already
`none`). Removing/special-casing the transition would remove intended
hover polish and is not justified by the evidence. Per the task's own
stop condition, no speculative fix, no forced-repaint workaround.

Residual consideration (cosmetic, owner-disclosed, not repaired): a
~0–180 ms low-contrast window exists mid-transition on color-mix
surfaces while text color snaps but background animates. If the owner
wants an instant theme snap instead of a crossfade, the scoped change
is to gate the background transition off during a theme change — that
is a design decision, not a bug fix.

## Evidence artifacts

- `/tmp/acc2-light-toggled.png`, `/tmp/acc2-light-cold.png`,
  `/tmp/acc2-t60ms.png`, `/tmp/acc2-t1500ms.png`
- Repro scripts: `acc2-repro*.mjs` (task-owned, removed with cleanup)
- Disposable DB `acc2_db` dropped after verification.
