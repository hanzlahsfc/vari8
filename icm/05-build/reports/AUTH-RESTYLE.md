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
