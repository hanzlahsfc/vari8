# CANVAS-HYDRATION: /coach hydration mismatch

Issue #70, branch `beta/canvas-hydration-fix`, worktree `/home/nexuslink/vari8-worktrees/canvas-hydration-fix`. Read issue #70 (`gh issue view 70`).

Symptom: on every load of `/coach` in `frontend/` (`next dev`), React reports a hydration mismatch: the `eg-segment` `motion.button` elements (Dashboard, Tracker, Clients, Meal plans) render `tabindex="0"` on the server and none on the client. Also a motion reduced-motion notice from `frontend/src/components/coach/ui.tsx:288`.

Find the root cause (server and client computing different props, likely a client-only value such as reduced-motion or focus state read during render). Fix it where all segment controls route through, not per button.

Hard rule: pixels identical. Prove it: capture `/coach` at 1440 and 390 px before your change and after, with Playwright, same viewport and fonts, and diff them (0 differing pixels, or explain any non-zero diff caused by animation timing and re-capture with animations settled). Keyboard tab order unchanged: record the focus sequence with Tab presses before and after, identical.

Acceptance: `/coach` loads with zero hydration warnings in the browser console (`next dev`), both screenshot diffs 0, tab order identical, `cd frontend && npm run build` 0. Put the before/after images and the console logs under `icm/05-build/evidence/CANVAS-HYDRATION/`.

Follow `icm/05-build/cards/PIPELINE-FOOTER.md` in your worktree completely (it is in this branch). node_modules: run `npm ci` in your worktree root (and `cd frontend && npm ci` if you build frontend) in the background with a log; never symlink node_modules (Turbopack rejects it). Long commands run in the background writing logs; never block one tool call longer than 4 minutes. Never write docs/STATUS.md.
