# AUTH-RESTYLE report

Card `AUTH-RESTYLE`, issue #129, PR #130 (base `Vari8-Beta`).
Branch `beta/auth-restyle`, merged up to `Vari8-Beta` at a5cf559 (PR-W0 / #132 merged).
Lane: `app_authrs` on 127.0.0.1:5433, dev server on 3955.

Round 2. Round 1 was returned FIX: behaviour, gates, themes and copy passed, the look did not.

## What went wrong in round 1

The auth pages were styled with the app-shell theme tokens (`themes/pro-dark.css`,
`themes/pro-white.css`): `--color-base`, `--color-surface`, `--color-surface-2`,
`--color-text-primary`, `--color-text-secondary`, `--color-success`, `--space-1..8`,
`--font-size-sm`, `--radius-md`. O16 says the auth pages match the app using the canvas
vocabulary, and 13 of the 16 custom properties used in `app/auth.css` do not exist in the canvas
stylesheets at all.

Measured effect on `/login` at 1440 in pro-dark: page `rgb(25,25,25)`, card `rgb(40,40,40)`,
radius 8px, no shadow, button `rgb(45,45,45)` with an accent border, font Golos Text. The canvas
renders `rgb(7,7,7)`, `rgb(20,20,20)`, 12px with a panel shadow, an accent-filled primary with a
black label, and Helvetica Neue.

## What changed

Auth keeps every page, form field, name attribute, server action, route and line of copy.

- `app/auth.css`: rewritten on the canvas vocabulary. Nothing else.
- `app/{login,signup,reset,reset-request,invite}/layout.tsx`: comment only. The wrapper
  (`.auth-screen > .auth-card`) and the `@/app/auth.css` import are unchanged from round 1.
- `tests/e2e/auth-card.spec.ts` (new): the look guard, see below.
- `icm/05-build/reports/AUTH-RESTYLE/{before,after}/` (new): the screenshots.

No `page.tsx`, `actions.ts`, `*-form.tsx`, route or copy line was touched. `git diff
origin/Vari8-Beta...HEAD --stat -- components/ frontend/` is empty, so the canvas sources and the
frontend copy are untouched.

## The canvas vocabulary, scoped

Source of truth: `frontend/src/app/globals.css` (the `:root` block and the
`.appearance-root[data-mode="light"]` block) and `frontend/src/app/appearance.css`. Declared on
`.auth-screen` only:

| Token                | pro-dark                                         | pro-white                     |
| -------------------- | ------------------------------------------------ | ----------------------------- |
| `--canvas`           | `#070707`                                        | `#f4f4f4`                     |
| `--surface`          | `#141414`                                        | `#ffffff`                     |
| `--surface-subtle`   | `#1b1b1b`                                        | `#ebebeb`                     |
| `--text`             | `#f2f2f2`                                        | `#1c1c1c`                     |
| `--muted-foreground` | `#b6b6b6`                                        | `#626262`                     |
| `--border`           | `rgb(220 220 220 / 13%)`                         | `rgb(40 40 40 / 14%)`         |
| `--input`            | `rgb(220 220 220 / 20%)`                         | `rgb(40 40 40 / 22%)`         |
| `--panel-shadow`     | `0 22px 56px rgb(0 0 0 / 38%)`                   | `0 16px 40px rgb(0 0 0 / 9%)` |
| `--font-ui`          | `"Helvetica Neue", Helvetica, Arial, sans-serif` | same (inherited)              |

Spacing and type use the canvas's own idiom, not the app-shell scale: the canvas defines no
`--space-*` and no `--font-size-*`, so the card uses `padding: clamp(20px, 5vw, 28px)`, the field
gap is 6px, labels are 12px, inputs are 44px tall with a 7px radius, and the panel is 12px with
`--panel-shadow`. Accent is consumed the way the canvas consumes it, `var(--accent, #eb91b8)`:
`--accent` is never a token, every canvas stylesheet passes a literal fallback.

Two mappings worth stating:

1. Theme switch. The canvas switches on `.appearance-root[data-mode="light"|"dark"]`; this app
   switches on `html[data-theme="pro-dark"|"pro-white"]` (`app/layout.tsx:12`). The dark set is
   the base on `.auth-screen` and `html[data-theme="pro-white"] .auth-screen` overrides it, so
   both themes work from the app's own toggle. That mapping is one comment line at the top of
   the file.
2. Focus ring. The canvas derives `--accent-ring` from the accent to hold 3:1. Plain `#eb91b8` is
   2.26:1 on the light surface, so the light block mixes it to 55% with `#1c1c1c`. No new colour
   name is introduced, only the canvas's own contrast treatment.

## Why the canvas stylesheets are not imported

Two canvas files exist twice, byte identical, at `components/canvas/app/`. Importing either one
globally is wrong for a reason that has nothing to do with the build: `frontend/src/app/globals.css`
sets `:root { --foreground: var(--text); --background: var(--canvas); --card: var(--surface);
--border; --input }`, and those are the names the app shell reads from `themes/pro-*.css`. A
global import overrides pro-white for every route in the app. So the values are declared in the
auth scope instead of imported, and the app shell outside the auth routes computes exactly as
before.

### Correction to round 1, which asserted the opposite

Round 1 recorded that importing the canvas stylesheets into the auth layouts broke `npm run build`
with a prerender error on `/_global-error` (`Cannot read properties of null (reading 'useContext')`).
That attribution was wrong and is retracted. The verifier added both imports to all five layouts at
this head and `npm run build` exited 0. What does reproduce that exact error is exporting
`NODE_ENV=development` into the build: this round hit the identical `useContext` null failure,
exit 1, and the identical build exited 0 once `NODE_ENV` was left to `next build`. Environment
artefact, not the import. The token collision above is the real reason not to import.

## Look guard

`tests/e2e/auth-card.spec.ts`, one rule: `/login` renders `.auth-screen` with the canvas background
and exactly one `.auth-card` carrying `rgb(20, 20, 20)` and a 12px radius, asserted on computed
style. Round 1 had no such guard: deleting the `.auth-card` wrapper left the auth e2e suite 8/8
green because every form still worked. With the wrapper removed this spec fails on the
`toHaveCount(1)` and on both computed checks.

## Commands, exit codes

Worktree commands, `DATABASE_URL` on `app_authrs`, `BETTER_AUTH_URL` on `http://127.0.0.1:3955`.
The integration suites need a disposable database (`INTEGRATION_DATABASE_URL`), otherwise all 59
files skip and the run exits 0 having tested nothing.

| Command                                                | Exit | Note                                         |
| ------------------------------------------------------ | ---- | -------------------------------------------- |
| `npm ci` (root)                                        | 0    |                                              |
| `npm ci` (frontend)                                    | 0    |                                              |
| `npx prisma migrate deploy`                            | 0    | 38 migrations, none pending                  |
| `npm run seed:dev`                                     | 0    |                                              |
| `npm run index`                                        | 0    | no diff                                      |
| `npm run index:check`                                  | 0    |                                              |
| `npx prettier --check .`                               | 0    |                                              |
| `npm run typecheck`                                    | 0    |                                              |
| `npm run lint`                                         | 0    |                                              |
| `npm run test`                                         | 0    | 92 files, 1043 tests                         |
| `npx vitest run --config vitest.integration.config.ts` | 0    | with `INTEGRATION_DATABASE_URL` set          |
| `npm run build`                                        | 0    | `Compiled successfully`, `NODE_ENV` unset    |
| `npx playwright test tests/e2e/auth-card.spec.ts`      | 0    | guard passes with the card, fails without it |

## Evidence

Before and after, captured from the running app at 1440x900 and 390x844 in both themes, five routes:

| Route            | Before (app-shell tokens)                | After (canvas tokens)                   |
| ---------------- | ---------------------------------------- | --------------------------------------- |
| `/login`         | `before/login-1440-pro-dark.png`         | `after/login-1440-pro-dark.png`         |
| `/signup`        | `before/signup-1440-pro-dark.png`        | `after/signup-1440-pro-dark.png`        |
| `/reset-request` | `before/reset-request-1440-pro-dark.png` | `after/reset-request-1440-pro-dark.png` |
| `/reset`         | `before/reset-1440-pro-dark.png`         | `after/reset-1440-pro-dark.png`         |
| `/invite`        | `before/invite-1440-pro-dark.png`        | `after/invite-1440-pro-dark.png`        |

Each route also has `-390-pro-dark`, `-1440-pro-white` and `-390-pro-white`. Full set: 20 files in
`before/`, 21 in `after/` (the extra one is `canvas-after-signin-1440.png`, the canvas after a real
sign-in). Files sit next to this report under `icm/05-build/reports/AUTH-RESTYLE/`.

## States exercised live

Dev server on 3955, Playwright (Chromium), seeded accounts from `app_authrs`.

Computed styles after the change, `/login`, pro-dark: page `rgb(7,7,7)`, card `rgb(20,20,20)` with
`rgba(0,0,0,0.38) 0 22px 56px`, radius 12px, font `"Helvetica Neue"`, input 44px, button
`rgb(235,145,184)` with label `rgb(11,11,11)`, 9px radius, 40px tall. pro-white: page
`rgb(244,244,244)`, card `rgb(255,255,255)` with `rgba(0,0,0,0.09) 0 16px 40px`, text
`rgb(28,28,28)`, same accent and button geometry.

Same values on `/signup`, `/reset-request`, `/reset?token=...` (real token minted through the form
and read out of the dev mailbox) and `/invite?workspace=...&token=...` (real invitation issued by
`createWorkspaceInvitation` against `app_authrs`).

No horizontal overflow at any of the 20 combinations: `document.documentElement.scrollWidth` equals
`innerWidth` at 390 (card 358 wide) and at 1440 (card 416).

Sign-in: `coach@vari8.test` on `/login` submitted, landed on `/` with title
"Coaching UI, Ethereal edition", `.appearance-root` present, `.auth-card` absent, body background
`rgb(7,7,7)`, so the auth stylesheet does not reach the canvas.

App shell unchanged: `/workspace` computed styles measured with the change stashed and again with
it applied are identical in both themes (pro-white body `rgb(247,247,245)`, `Golos Text`, 16px,
`.app-main` padding 32px, `.app-title` 24px; pro-dark body `rgb(25,25,25)`, `--color-base`
`#191919`).

## Not proven

- Submitting state (button `disabled` while the action runs) is styled but not screenshotted: the
  local round trip is too short. The rule is `.auth-button:disabled`, driven by `useActionState`
  pending in the unchanged form components.
- Locked and rate-limited states need the rate limiter to trip. Not exercised.
- No automated a11y run (axe) beyond the focus ring, the 3:1 ring contrast above and the 44px
  inputs. The primary button is 40px tall because the canvas primary is 40px.

## O16 conformance

Auth is not part of the canvas parity comparison: `tools/parity/run.mjs` was not modified and auth
routes were not added to it. The isolation claim is carried by the empty
`git diff origin/Vari8-Beta...HEAD -- components/ frontend/` and by the `/workspace` before and
after computed-style comparison above.
