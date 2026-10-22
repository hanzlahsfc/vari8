# AUTH-RESTYLE report

Card `AUTH-RESTYLE`, issue #129, PR #130 (base `Vari8-Beta`, `bb31401`).
Branch `beta/auth-restyle`, round 3.

Lane: `app_authrs` and `app_authrs_it` on the local Postgres cluster at `127.0.0.1:5434` (role `app`,
password from `.env`). The shared `5433` cluster rejects that credential with `password authentication
failed for user "app"`, so this lane uses the throwaway cluster the earlier rounds created: same role,
same password, same 70-table schema, nothing else on it. Dev server on 3955, e2e server on 3000.

Round 1 and round 2 were both returned FIX on the same point: the auth pages did not look like the
canvas. This round found why the second attempt missed.

## The shell question, measured

Round 2 measured against the Ethereal shell (`components/canvas/ethereal/ethereal-shell.css`, class
`eg-root`), because the round 2 verification note quoted `rgb(5,5,5)`, `rgb(16,16,16)` and
`0 16px 44px rgb(0 0 0 / 23%)`.

Those are the Ethereal shell's numbers. `/coach` does not render that shell. Probed live on this base
as a signed-in coach, `/coach` contains `.coach-root` and no `.eg-root` and no `.appearance-root` at
all:

```
/coach  .coach-root  present     .eg-root absent     .appearance-root absent
```

So the shape that `/` sends every coach to is `components/canvas/coach/coach.css`. `/me` and
`/(canvas)/ethereal` are the Ethereal shell (`AppearanceProvider`, `appearance-root eg-root`).

Auth follows the coach studio because `/` sends every signed-in coach to `/coach`, and `/coach` is the
screen the card is compared against. The Ethereal numbers are recorded below for the record, not
matched.

### Measured: `/coach` (`.coach-root`), the shell auth now paints

| Property           | `/coach` `.coach-root`, pro-dark              | `/coach`, light (`data-mode="light"`) | auth `/login` before (base)    | auth `/login` now                                                   |
| ------------------ | --------------------------------------------- | ------------------------------------- | ------------------------------ | ------------------------------------------------------------------- |
| `background-color` | `rgb(8, 8, 8)`                                | `rgb(244, 244, 244)`                  | `rgb(25, 25, 25)` (body)       | `rgb(8, 8, 8)` / `rgb(244, 244, 244)`                               |
| `color`            | `rgb(244, 244, 244)`                          | `rgb(28, 28, 28)`                     | `rgb(255, 255, 255)`           | `rgb(244, 244, 244)` / `rgb(28, 28, 28)`                            |
| `font-family`      | `"Coach Geist", system-ui, sans-serif`        | same                                  | `"Golos Text", system-ui, ...` | `"Coach Geist", system-ui, sans-serif`                              |
| `font-size`        | `15px`                                        | `15px`                                | `16px`                         | `15px`                                                              |
| `box-shadow`       | `none`                                        | `none`                                | `none`                         | `none`                                                              |
| card surface       | `rgb(15, 15, 15)` (`--cd-surface`)            | `rgb(255, 255, 255)`                  | no card, plain column          | `rgb(15, 15, 15)` / `rgb(255, 255, 255)`, 12px, inset top highlight |
| input              | `rgb(11, 11, 11)` (`--cd-field`), 999px       | `rgb(255, 255, 255)`, 999px           | transparent, app-shell border  | `rgb(11, 11, 11)` / `rgb(255, 255, 255)`, 999px                     |
| primary button     | accent fill `rgb(235, 145, 184)`, 44px, 999px | same                                  | `rgb(227, 67, 50)`, 40px, 9px  | `rgb(235, 145, 184)`, 44px, 999px                                   |

`/login`, `/signup`, `/reset-request`, `/reset?token=not-a-real-token` and
`/invite?workspace=canvas-demo&token=not-a-real-token` all measure the same three root properties as
`/coach`: 10 of 10 page and theme combinations match, recorded in
`AUTH-RESTYLE/after/measurements.json`.

### Measured: the other shell, `/(canvas)/ethereal` (`.eg-root`)

Read from `components/canvas/ethereal/ethereal-shell.css` on this base, and confirmed live in the
round 2 lane:

| Property           | value                                             |
| ------------------ | ------------------------------------------------- |
| `background-color` | `rgb(5, 5, 5)` (`--eg-bg: #050505`)               |
| surface            | `rgb(16, 16, 16)` (`--eg-surface: #101010`)       |
| `font-family`      | `"Ethereal Geist", system-ui, sans-serif`, `14px` |
| panel shadow       | `0 16px 44px rgb(0 0 0 / 23%)`                    |

Auth does not match this one. Same app, different screen, and `/` does not send staff there.

## What changed

Auth keeps every page, form field, name attribute, server action, route and line of copy.

- `app/auth.css`: the token declarations are gone. What remains is the centred column, the card, the
  button, the messages, and the light-mode mirror.
- `app/{login,signup,reset,reset-request,invite}/layout.tsx`: import
  `@/components/canvas/coach/coach.css` and put `coach-root` on the root element next to
  `auth-screen`. Five identical files.
- `tests/e2e/auth-card.spec.ts`: rewritten as the canvas-parity guard (it previously asserted two
  hard-coded values that no longer apply).
- `icm/05-build/reports/AUTH-RESTYLE/{before,after}/`: recaptured screenshots.

The root element is `<div class="auth-screen coach-root">`. Because the class and the stylesheet are
the canvas's own, background, surface, text, muted, border, input, focus ring, font and page wash come
from `coach.css` with no numbers repeated here.

### Why importing `coach.css` cannot leak

`components/canvas/coach/coach.css` was checked selector by selector:

```
top-level selectors: 475
NOT .coach-root scoped: 0
```

The only global rules are the `@font-face` (a font name, harmless if loaded twice) and the keyframes.
Everything else starts with `.coach-root`. A global import of `components/canvas/app/globals.css` would
not be safe, because that file redefines `--surface` / `--border` / `--background` at `:root` and
would override `themes/pro-white.css` on every route; `coach.css` does not.

### What is still a literal in `app/auth.css`, and why

| Literal                                                                                                                                | Where                                           | Reason                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `#eb91b8`                                                                                                                              | `--cd-accent` on `.auth-screen`                 | The canvas reads the accent from its appearance store, which the auth routes do not mount. This is the canvas default accent. Everything else (`--cd-action-bg`, `--cd-action-text`, `--cd-accent-text`, `--cd-accent-ring`) derives from it and from the contrast `coach.css` already declares. |
| light block values (`#f4f4f4`, `#ffffff`, `#1c1c1c`, `#626262`, `rgb(35 25 35 / 12%)`, `rgb(35 25 35 / 3%)`, `rgb(255 255 255 / 85%)`) | `html[data-theme="pro-white"] .auth-screen`     | Line-for-line mirror of `.coach-root[data-mode="light"]`, keyed on this app's switch. The canvas toggles `data-mode` from its own store; the auth routes have no store to set it, so the values have to be re-keyed. This is the only repeated block.                                            |
| `#f2a4a8`, `#973d47`                                                                                                                   | `.auth-error`                                   | `coach.css` paints `.cd-error` from these two literals (the canvas has no danger token) and lightens the text in light mode. Same two values.                                                                                                                                                    |
| `rgb(255 255 255 / 25%)`                                                                                                               | `.auth-button` inset highlight                  | Copied from `.cd-primary`; the canvas has no token for it.                                                                                                                                                                                                                                       |
| `12px`, `999px`, `44px`, `clamp(...)`, `font-size: 13px/14px/15px/12px`                                                                | card, button, type                              | Geometry and type scale. The canvas defines no radius or space custom properties, so these are the same numbers `coach.css` uses for its panel, button and body text.                                                                                                                            |
| `color-mix(... 55%, #1c1c1c)`                                                                                                          | `--cd-accent-ring`, `--cd-accent-text` in light | Plain `#eb91b8` is 2.26:1 on white (measured). The mix lands on `#8e5c72`, 5.35:1 on white and 4.87:1 on `#f4f4f4`, so links and the focus ring pass AA in light mode.                                                                                                                           |

## Look guard

`tests/e2e/auth-card.spec.ts`, two tests, one per theme. Each signs in as the seeded coach, opens
`/coach`, reads the computed `background-color`, `font-family` and `box-shadow` of the element that
actually exists there (`.coach-root`), then opens all five auth routes and fails on any difference.
The light test switches the canvas to its light mode through the canvas's own control first.

The guard bites. With `coach-root` removed from `app/login/layout.tsx` and nothing else changed:

```
npx playwright test tests/e2e/auth-card.spec.ts   exit 1   (2 failed: toHaveClass /coach-root)
```

With the class restored, the same spec exits 0 in the full suite run above.

`/reset-request` and `/reset` return 404 in the e2e build while no mail adapter is registered
(`mailDeliveryConfigured()`), and a closed route renders nothing to compare, so the guard skips a 404
instead of failing on it. Both routes are measured on the dev server and appear in the screenshots.

## Commands, exit codes

Worktree, `DATABASE_URL` on `app_authrs` (`app_authrs_it` for integration and e2e), `NODE_ENV` unset.

| Command                                                             | Exit  | Note                                                                                    |
| ------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------- |
| `npm ls --depth=0`                                                  | 0     | node_modules current                                                                    |
| `npm run index`                                                     | 0     | regenerated, committed                                                                  |
| `npm run index:check`                                               | 0     |                                                                                         |
| `npx prettier --check .`                                            | 0     | all files formatted                                                                     |
| `npm run typecheck`                                                 | 0     |                                                                                         |
| `npm run lint`                                                      | 0     |                                                                                         |
| `npm run test`                                                      | 0     | 94 files, 1075 tests                                                                    |
| `npm run test:integration`                                          | 1     | 59 of 60 files green, 856 of 858 tests; the one failing file is pre-existing, see below |
| `npm run build`                                                     | 0     | `Compiled successfully`, `NODE_ENV` unset                                               |
| `npx playwright test` (auth suite + guard)                          | 0     | 12 passed, 7 skipped (the skipped reset tokens need mail delivery)                      |
| `git diff origin/Vari8-Beta...HEAD --stat -- components/ frontend/` | empty | canvas and frontend untouched                                                           |

### The one integration failure, and why it is not this branch

`tests/integration/seed-credentials.test.ts` fails at line 128: the development seed does not create a
`ClientProfile` for the seeded client in the `canvas-demo` workspace, so `findFirstOrThrow` throws. It
fails the same way on `origin/Vari8-Beta` at `bb31401` with no auth change applied:

```
# base worktree, fresh database, only that file
npx vitest run --config vitest.integration.config.ts tests/integration/seed-credentials.test.ts
Tests  1 failed | 1 passed (2)
-> 128 const profile = await prisma.clientProfile.findFirstOrThrow(
```

Nothing in this branch touches `scripts/seed/`, `lib/` or the schema. The rest of the integration
suite was run without that file and exits 0.

## Evidence

`icm/05-build/reports/AUTH-RESTYLE/`:

- `before/`: 20 captures from a dev server on `origin/Vari8-Beta` (`bb31401`), five routes, 1440 and
  390, pro-dark and pro-white. Base values: page `rgb(25,25,25)`, `"Golos Text"` 16px, red
  `rgb(227,67,50)` button, no card.
- `after/`: 44 captures from the lane dev server, five routes idle plus the six card states, 1440 and
  390, both themes, and one canvas capture (`canvas-coach-1440-pro-dark.png`).
- `before/measurements.json` and `after/measurements.json`: the computed values behind every capture.

Every image was captured this round from a running server; none is reused from round 2.

## States exercised live

| State                                    | How it was reached                                                                      | Result                                                                                  |
| ---------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| idle, 5 routes, both themes, both widths | plain navigation                                                                        | 20 captures, no horizontal overflow (`scrollWidth` equals `innerWidth` at 390 and 1440) |
| submitting                               | `POST /login` held for 4s by request interception                                       | button disabled, canvas action colours                                                  |
| field error                              | sign-up with a 5 character password                                                     | `Password must be at least 10 characters.`                                              |
| server error                             | sign-in with an unknown account                                                         | `Invalid email or password.`                                                            |
| success                                  | `/login?reset=1` and `/login?inviteAccepted=1`                                          | both banners                                                                            |
| rate limited                             | 11 wrong attempts on one email                                                          | `Too many attempts. Please try again later.`                                            |
| invalid or expired token                 | `/reset?token=not-a-real-token`, `/invite?workspace=canvas-demo&token=not-a-real-token` | both render the safe state                                                              |

Sign-in over HTTP still lands on `/coach` with `.coach-root` present and no `.auth-card` leaking into
the canvas.

## O16 conformance

Auth is not part of the canvas parity comparison: `tools/parity/run.mjs` was not modified and auth
routes were not added to it. Isolation rests on the empty
`git diff origin/Vari8-Beta...HEAD -- components/ frontend/` and on `coach.css` being `.coach-root`
scoped end to end.

## What could not be done

- The Ethereal shell is not matched, by design. It is the client and studio shell, not the screen `/`
  sends a coach to. Both sets of numbers are in this report if the owner wants the other one.
- `tests/integration/seed-credentials.test.ts` stays red on this base for the reason above. It is a seed
  gap, not an auth-surface gap, and fixing it is outside this card.
- The e2e guard cannot see `/reset` and `/reset-request` in CI while mail delivery is unconfigured;
  those two are covered by the dev-server measurement and the screenshots instead.

## Repair round 1 (run 49, base `09b1424`, 2026-10-22)

The card's acceptance list says every state must be styled, including field error. A read-only audit of
the merged #130 result found three gaps that the earlier closure record missed. All three are CSS plus
one pseudo-class, none touches a route, a server action, a form field name or a copy string.

### 1. The field-error state did not exist

No `:invalid`, `:user-invalid` or `[aria-invalid]` rule existed anywhere in `app/auth.css`, and no auth
form set `aria-invalid`. The five forms validate with the browser's own constraint attributes
(`required`, `type="email"`), so the styled surface is the native `:user-invalid` state: it fires only
after the person has left the field or tried to submit, where a bare `:invalid` would paint a field red
on first paint. Added at `app/auth.css:153-169`: `.auth-screen .auth-input:user-invalid`, the
`html[data-theme="pro-white"] .auth-screen:not(.eg-auth)` mirror at `#973d47`, and
`.auth-screen.eg-auth` at `var(--danger)`. The two literals are the pair `.auth-error` already uses ten
lines below, which in turn is copied from `coach.css:1184`.

Rejected: propagating a server-side field error. `requestReset` returns one message with no field
attribution (`app/reset-request/actions.ts`), and giving the action a field shape would change the
server contract the card freezes. The `type="email"` constraint already blocks a malformed address
before submit, so the native state is the state a person actually reaches.

### 2. Submitting was cursor-only

`app/auth.css:196-199` set `cursor: progress` on `.auth-button:disabled` and nothing else, so the only
visible change while the action was in flight was the pointer. Added `opacity: 0.72`.

### 3. The focus ring on `/invite` and `/reset*` was the legacy red, not the canvas accent

`app/globals.css:87-96` carried four pre-canvas rules (`.invite-form .auth-input:focus-visible` and its
three siblings) at specificity 0,3,0 painting `outline: 2px solid var(--color-accent)`. That beat
`.coach-root :focus-visible` (0,2,0) at `components/canvas/coach/coach.css:88-90`, so those two routes
rang in the app's legacy accent (`#e34332` dark, `#b23325` light, `themes/pro-dark.css:14` and
`themes/pro-white.css:16`) while every other auth route rang in `--cd-accent-ring`. Deleted the four
rules. The canvas ring now applies, including `outline-offset: 4px` from `coach.css:83-87`, which is
what `/coach` itself renders. Client-shell routes (`/me/login`, `/me/reset`, `/me/reset-request`) keep
their ring from `components/canvas/ethereal/ethereal-shell.css:133`, so no route lost a focus indicator.

### Measured, live

Temporary Playwright probe against `next start` on 127.0.0.1:3000 with the lane database
`app_authrs` (private cluster, 127.0.0.1:3995). The probe was deleted before the commit.

```
PROBE field-error  idle border rgba(255,255,255,0.12)  :user-invalid true  border rgb(242,164,168)
PROBE submitting   idle {opacity 1, cursor pointer}    disabled {opacity 0.72, cursor progress}
PROBE focus ring   /reset-request fixed rgb(235,145,184)  with-old-rule rgb(227,67,50)
```

The third line is the bite: re-injecting the deleted rule at runtime turns the ring back into
`#e34332`, which is exactly the mismatch the repair removes. `/reset-request` is `/coach`-shell on
`/coach`'s own accent `#eb91b8` once the rule is gone.

Existing suites, which compare computed styles against the live `/coach` and `/me` roots and sign in
through the real action, all pass unchanged:

```
tests/e2e/auth-card.spec.ts         2 passed  (pro-dark, pro-white root match)
tests/e2e/me-auth-look.spec.ts      5 passed
tests/e2e/password-reset.spec.ts    7 passed, 2 skipped (delivery-gated 404 pairs)
tests/e2e/invite-acceptance.spec.ts 8 passed
total 24 tests: 22 passed, 2 skipped, 0 failed
```

Screenshots at 1440 and 390 px for idle, field error, submitting, server error, the focused reset
field and the `/coach` reference: `Vari8-evidence/scratch/auth-restyle-r1/screens/` (12 files).

### Gates

```
npx prettier --check .         0
npm run typecheck              0
npm run lint                   0  (81 warnings, 0 errors)
npm run index                  0
npm run index:check            0
npm run test                   0  (98 files, 1115 tests)
npm run build                  0  (NODE_ENV unset)
```

`cd frontend && npm run build` was not run: no file under `frontend/` changed in this branch
(`git diff --name-only origin/Vari8-Beta...HEAD` lists `app/` and `docs/index/` and one test).

### Two base defects this branch had to step over

1. `tests/unit/system-index.test.ts:274` pinned `MotionProvider`'s route list as `/, /coach, /ethereal`.
   FRONTEND-SYNC (#160) added `/dev/design-system` under the same root layout, so the generator now
   emits `/, /coach, /dev/design-system, /ethereal` and the literal went stale. It fails on the
   untouched checkout at `09b1424` (measured: 2 failed of 18 there, 1 of 18 in a fresh worktree). The
   generator is right, so the literal was updated and the comment now says why.
2. `playwright.config.ts:26` sets `APP_ENV=test` for its own webServer, and `npm run build` with
   `APP_ENV=test` fails at prerender: `Error occurred prerendering page "/_global-error"`,
   `TypeError: Cannot read properties of null (reading 'useContext')`. Without `APP_ENV` the same build
   is exit 0. So `npm run test:e2e` cannot start its own server on this base. Workaround used here:
   build without `APP_ENV`, then `APP_ENV=test npm run start` and let Playwright reuse the running
   server. The build-time failure is untouched by this card and belongs to whoever owns the runtime
   classification in `lib/runtime.ts`.

`npm run index` also rewrites `docs/index/COMPONENTS.md`, `ROUTES.md` and `SYMBOLS.md` on this base,
because #160 landed frontend sources without regenerating the index. Those regenerated files are in
this commit, which is what makes `index:check` exit 0.

### Still open

- `aria-busy` on the submitting form is not set. The visible state is fixed; announcements ride on the
  disabled button. Adding it means touching five form components for a non-visual gain, so it is a
  separate call.
- The coach auth routes still paint the accent from the `#eb91b8` literal at `app/auth.css:30` rather
  than from the appearance store (`components/canvas/coach/coach-app.tsx:83-86`), because the auth
  shell does not mount that provider. Retargeting it is a behaviour-adjacent change and needs the
  owner.
