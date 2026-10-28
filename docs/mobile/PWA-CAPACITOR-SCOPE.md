# PWA and Capacitor 8 scope (PR-31)

Status: scope and decision package. This document defines what the mobile
surface is and what must be true before native work begins. It promises no
release: no app store submission, no production deployment, no public launch
is part of this card or implied by it.

## What this PR ships

- `app/manifest.ts`: a Web App Manifest for the app, `display: "standalone"`,
  `id`/`start_url`/`scope` `/`, pro-dark base color as `background_color` and
  `theme_color` (`themes/pro-dark.css`: `#191919`).
- `public/icons/**`: PNG tiles generated from the canvas brand mark
  (`.cd-brand-symbol`, three rotated rounded-square outlines in accent
  `#e34332` on base `#191919`). `icon-192` and `icon-512` for the install
  prompt, `icon-maskable-192` and `icon-maskable-512` inside the Android safe
  zone, `apple-touch-icon.png` linked from `app/layout.tsx` for iOS home
  screen tiles.
- Result: Chrome reports the app installable at 390 px width.

## What the installable PWA does not promise

- No offline support. No service worker ships, no cache storage is used, and
  the installed window is a thin shell over the live app. If the network is
  down, the PWA fails the same way the browser tab does.
- No push notifications, no background sync, no badge API.
- No native feature access (camera, health kits, file system).

## Authentication: what already exists (ruling O1)

Ruling O1 (WIRING-SPEC "Owner rulings", 2026-10-20) fixes the transport split:
same origin, `/api/v1` JSON routes, cookie session for web and PWA, bearer
token for Capacitor apps, one shared fetch client owned by PR-W0.

Already built:

- `lib/auth/server.ts`: Better Auth with the `bearer()` plugin. A session
  token presented as `Authorization: Bearer <token>` resolves to the same
  session a cookie would. Sessions are `session` table rows, `expiresIn`
  7 days, `updateAge` 1 day (rolling refresh); revocation is row deletion.
  Every session-bearing path deletes a non-ACTIVE user's sessions, so a
  bearer credential dies with the account.
- `lib/auth/viewer.ts` `getViewerFromHeaders`: resolves cookie or bearer to
  a viewer, fails closed to anonymous when the user is not ACTIVE.
- `lib/api/v1.ts`: every v1 route authenticates cookie or bearer, validates
  params with Zod, then authorizes on the caller's ACTIVE membership,
  workspace role and capability scope. Denial is an undifferentiated 403.
- `app/api/v1/auth/refresh/route.ts` (AUTH-ROTATE): bearer-only rotation.
  Spends the presented token before issuing a replacement, re-checks the
  account inside the handler (this route is not a Better Auth endpoint, so
  the ACTIVE hook does not run for it), throttles per token hash and per
  account, and records spent token hashes in a family ledger so a replay
  revokes the whole family. The shell contract is below.

## Capacitor 8 native scope (decision package)

The Capacitor app, when scheduled, is a thin native shell: iOS and Android
builds that load the web app and talk only to `/api/v1` over HTTPS (D6: the
static mobile bundle uses HTTP routes only; server actions stay web-only).
It reuses the same pages; no separate native UI is contemplated by this
card.

### Bearer token contract for the shell

Existing behavior (installed Better Auth 1.7.10, `lib/auth/server.ts`):

- Acquire: sign-in responses that set the session cookie also carry the
  session token in the `set-auth-token` response header (the bearer plugin
  emits it on any auth response that sets the cookie: sign-in, sign-up and
  rolling session refreshes, and adds it to `Access-Control-Expose-Headers`
  for browser callers). The shell reads that header and stores the value.
  Cookies are never used or persisted by the shell.
- Use: every `/api/v1` request carries `Authorization: Bearer <token>`. The
  bearer plugin verifies the HMAC signature, injects the token as the
  session cookie, and the same session resolution runs as for web. The
  server side of this contract is already shipped (above); the shell needs
  no new auth API to consume it.
- Expiry and refresh (AUTH-ROTATE, shipped): a bearer token now rotates.
  `POST /api/v1/auth/refresh` takes `Authorization: Bearer <token>` and
  returns `{ token, expiresAt, rotateAt }`. The presented token is spent
  server side in the same request (the session row is deleted before the
  replacement is created), so a token is single use. `expiresAt` is 7 days
  absolute from issue with no rolling extension, and `rotateAt` is 80 percent
  of that life: the shell rotates on reaching `rotateAt`, with a few minutes
  of jitter so a fleet does not rotate in lockstep. A cookie session is
  never accepted here and is never rotated by this route.
- Failures the shell must handle: 401 means the token is expired, spent,
  revoked, its account deactivated or its workspace membership gone. Clear
  the stored token and return to sign-in. That includes presenting a token
  that was already rotated out: the server treats it as a replay, deletes
  every session in that token's family (including the newest token), and
  answers 401, so a second device replaying an old value logs the family out.
  429 means the refresh throttle (20 per 10 minutes per account) tripped:
  back off and retry later, do not sign out.
- Expiry and revocation: an expired row is deleted on next resolution, so
  the bearer credential simply stops resolving. Sign-out deletes the row
  server side; `/api/auth/revoke-session` and `/api/auth/revoke-sessions` do
  the same for targeted or all sessions, and a deactivated account's
  sessions are deleted on any session-bearing path.
- Failure: a 401 means the token is expired, revoked or malformed; the
  shell clears the stored value and returns to sign-in. A 403 means
  authenticated but unauthorized and must not trigger re-sign-in.

Requirements a future native card must satisfy (not existing behavior):

- Store: the token lives in OS-protected storage only, iOS Keychain and
  Android Keystore (for example `@capacitor/preferences` is not sufficient;
  a secure-enclave plugin such as `capacitor-secure-storage` is the shape to
  evaluate). Never `localStorage`, never WebView cookie storage, never the
  app sandbox filesystem.
- Sign-out: call `/api/auth/sign-out`, then delete the stored token. A lost
  or wiped device is covered by session-row deletion server side; the shell
  adds no local revocation list.

### Gates before any native build

1. Product: an owner decision that a Capacitor shell is wanted at all, and
   on which platforms first. This card only prepares that decision.
2. Accounts and signing: Apple Developer and Google Play accounts, bundle
   ids, signing credentials and who holds them. None exist in this repo.
3. Security review of token storage and lifecycle (above) on real devices,
   plus deep link and universal link handling for invite and reset URLs.
4. Data protection review: consent and health-data rules are parked (D12)
   for the web app; a store submission forces that review, including what
   a WebView caches on disk.
5. Versioning: the pinned Capacitor 8 major, plugin allowlist, and an
   update policy for the web bundle the shell loads.
6. Parity and acceptance on device: the canvas comparison extended to the
   WebView, and the role matrix re-verified inside the shell.
7. Distribution decision: internal testing tracks first; no store release
   is implied anywhere in this program.

### Explicitly out of scope for PR-31

- No Capacitor dependency, config, or project scaffolding lands here.
- No token issuance, storage or lifecycle code; this document is the design
  the future card implements.
- No service worker, offline mode, push, or native APIs.
- No release, deployment, or store listing of any kind.
