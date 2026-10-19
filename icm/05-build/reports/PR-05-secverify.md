# PR-05 security verify (PR #69, issue #58)

Verifier: urokodaki (independent; did not build this). Date: 2026-10-19, 02:40 to 04:05 CEST.

## Verdict: FIX

Three P0 gaps block the merge. All three are in the login limiter and session revocation, which this PR set out to close.

1. The `/login` form has no rate limit at all. The limiter only runs on the HTTP router; the form calls `auth.api.signInEmail` directly.
2. The HTTP limiter trusts a client-supplied `X-Forwarded-For`. Rotating the header gives unlimited guesses. Behind a proxy that appends to the header, every user shares one bucket, so one attacker locks everyone out.
3. Password change revokes other sessions only when the caller passes `revokeOtherSessions: true`. Without the flag, every old session keeps working.

The rest holds up. Every `/api/v1` route returns 401 for missing or malformed credentials. Cross-workspace and client-to-client access is denied on the PR-05 surface. Invites are single-use. Reset links expire at 60 minutes and work once. Cookies are HttpOnly, SameSite=Lax, and Secure with the `__Secure-` prefix under HTTPS. No secret was added in the diff.

## Target

| Field | Value |
|---|---|
| Worktree | `/home/nexuslink/vari8-worktrees/pr-05-auth-api` |
| Branch | `beta/pr-05-auth-api` |
| Head | `e68a2ef` (feat(auth): session export + post-merge e2e rewiring) |
| Base | `origin/Vari8-Beta` @ `ea8f514` (merge-base with head). The local `Vari8-Beta` ref is stale (`c0485ea`, ahead 8 / behind 5); I diffed against `origin/Vari8-Beta`. Diff: 115 files, +3496 / -32702. |
| Deployed URL | none. Local `next start` (production build) on 127.0.0.1:3651. |
| Database | `app_pr05sec` on 127.0.0.1:5433, created for this run, 36 migrations applied, synthetic users only. |
| Builder | Devin swe-2-max. Function lane: Haiku (separate). |

Inputs read: `AUTH-DECISION.md` incl. the 02:12 ruling (read from the `beta` worktree, commit `48ab4ef`; the file is not in this branch), `icm/03-plan/OWNER-ANSWERS-1018.md` (Q3, Q4), `icm/05-build/reports/PR-05.md`, `icm/05-build/audits/PRODREADY-BASELINE.md` auth, authz, input and security rows (read from the `beta` worktree; not in this branch), `icm/05-build/cards/PR-05.md`.

Skills: `production-readiness-checklist`, `verification-before-completion`. `security-diff-scan` is not installed in this profile; I did the diff scan by hand (grep for secret patterns, targeted read of every added auth file).

## Method

- Build: `npm run build` exit 0 at `e68a2ef`.
- Seed: two coach self-signups (workspace A and B, `lib/auth/signup.ts`), four invites accepted through `lib/workspace/invitations.ts` (client A1, A2, B1, coach A), two invites left open for the HTTP probe.
- Server postures, all `NODE_ENV=production next start`:
  - Run 1: no `MAIL_DELIVERY_ADAPTER`; `APP_ENV=development ENABLE_TRAINING_PLANS=1` so the training-plan server action can be exercised (the flag is hard-off in a production runtime).
  - Run 2: `MAIL_DELIVERY_ADAPTER=dev-file`, mailbox in scratch.
  - Run 3: `BETTER_AUTH_SECRET` and `AUTH_SECRET` unset.
  - Run 4: `BETTER_AUTH_URL=https://127.0.0.1:3651`.
  - Run 5: same as run 2 (reset-link origin and mass-assignment probes).
- Clients: Node `fetch` for HTTP, real Chromium (Playwright 1.63) for forms, Prisma reads and writes on `app_pr05sec` for time shifts and status changes.
- 171 recorded probes: 144 PASS, 27 FAIL (tally of the raw results files). Eight FAIL rows are probe artifacts, controls or reclassified rows (item 3 row count, item 6 no-XFF, item 7 two positive controls, item 4 peek, item 5 three poisoning rows); each is explained under its item. No token, cookie or password value appears in this report.

## Summary per item

| # | Guarantee | PRODREADY rows | Result |
|---|---|---|---|
| 1 | Session revocation on change and reset | PR-005 | FAIL (reset PASS, change FAIL) |
| 2 | Inactive lockout | PR-005, PR-002 | FAIL (app routes PASS, auth endpoints FAIL) |
| 3 | 401 on missing or malformed credentials | PR-005, PR-023, PR-108 | PASS |
| 4 | Invites single-use, wrong purpose fails | PR-003 (token class), PR-011 | PASS |
| 5 | Reset links 60 min, single use | PR-003 | PASS, with findings F5, F6, F8 |
| 6 | Rate limit per IP and per account | PR-013, PR-014 | FAIL |
| 7 | Roles and IDOR | PR-009, PR-010, PR-011 | FAIL (pre-existing page leak; PR-05 surface PASS) |
| 8 | Email normalisation | PR-002, PR-014 | PASS |
| 9 | Secrets and cookies | PR-036, PR-037, PR-041, PR-045 | FAIL (boots without a secret; cookies and diff PASS) |
| 10 | Fail closed without a mail adapter | PR-003, PR-074 | FAIL (pages fail closed, API does not; no leak in body) |

## P0 findings

F1. Login form bypasses the rate limiter. P0, PR-013.
- Where: `app/login/actions.ts:17` calls `signIn` in `auth.ts:36`, which calls `authServer.api.signInEmail(...)` directly. Better Auth applies `rateLimit` only inside its HTTP router (`node_modules/better-auth/dist/api/index.mjs:172`, `onRequestRateLimit`). Direct `auth.api.*` calls skip it. `app/signup/actions.ts:28` has the same gap.
- Probe: Chromium, `/login`, 15 wrong passwords for `owner.b`, then the right one. Result: 15 x "Invalid email or password.", 0 limited, the 16th landed on `/`. No `rate_limit` row changed. Re-run at 04:04 (12 wrong for `client.a1`): 0/12 limited.
- Breaks: the only sign-in UI accepts unlimited password guesses.
- Close: put a limiter in front of the server action keyed on client IP and normalized email (or route the form through the HTTP handler), and add a live test that the 11th form attempt is refused.

F2. HTTP limiter trusts `X-Forwarded-For`. P0, PR-013 and PR-014.
- Where: `lib/auth/server.ts:81-90` sets `rateLimit` but no `advanced.ipAddress` (`trustedProxies` or `ipAddressHeaders`). Better Auth then trusts any single-value `X-Forwarded-For` (`node_modules/@better-auth/core/src/utils/ip.ts:334-341`) and maps any multi-hop value to one shared key `no-trusted-ip` (`node_modules/better-auth/dist/api/rate-limiter/index.mjs`, `NO_TRUSTED_IP_KEY`).
- Probes:
  - Fixed spoofed IP: 12 wrong -> `401 x10, 429, 429`. Per-IP limit works.
  - Same limited IP with `OWNER.B@…`, `owner.b+1@…`, ` owner.b@…`: `429, 429, 429`. Case, plus and whitespace variants do not reset the per-IP bucket.
  - Rotating `X-Forwarded-For` from one client, one account: `401 x30, 429 x0`. Re-run: `401 x15, 429 x0`.
  - Per account: after 42 failures on `owner.b` the right password from a new IP returned 200. There is no per-account counter.
  - Proxy chain (`client, 10.0.0.1`): attacker 198.51.100.1 sent 11 failures, then a different user 203.0.113.50 through the same proxy with the right password got `429`. The `rate_limit` table held one row `no-trusted-ip|/sign-in/email`.
- Breaks: on a directly exposed host the limiter is a header away from useless. Behind nginx with `proxy_add_x_forwarded_for`, any attacker locks every user out of sign-in.
- Close: set `advanced.ipAddress.trustedProxies` (or the platform's trusted header) for the chosen host, and add a per-account throttle on normalized email (PR-014). The hosting choice is open in the baseline, so this needs the owner's host decision to be final.

F3. Password change revokes other sessions only on request. P0, PR-005 (AUTH-DECISION guarantee 1).
- Where: `lib/auth/server.ts:44-48` lists `/change-password` for the policy hook, but nothing forces `revokeOtherSessions`. There is no change-password UI, so the flag is whatever the API caller sends.
- Probes:
  - With `revokeOtherSessions: true`: other session S2 -> v1 401 (cookie and bearer), page `/workspace/:wsA/home` -> 307 `/login`. The caller's own pre-change cookie -> 401. One fresh session row left. PASS.
  - Without the flag: change 200, other session S4 -> v1 200, page 200. FAIL.
- Breaks: someone who changes a password after a compromise keeps the attacker signed in.
- Close: force the flag in `hooks.before` for `/change-password` (set `ctx.body.revokeOtherSessions = true`), or revoke all sessions for the user in an after-hook, and add the two-session test.

## Other findings

F4. A deactivated user's session still works on Better Auth's own endpoints. P1, PR-005.
- Where: the status check runs only on `/sign-in/email` (`lib/auth/server.ts:93-106`) and in `lib/auth/viewer.ts:203` for app routes. Session rows are not deleted on deactivation.
- Probe (coach A set `DEACTIVATED` with a live session): v1 cookie 401, v1 bearer 401, page 307 `/login`, correct-password sign-in 401 with the same message as a wrong password, case and whitespace variants refused. But `GET /api/auth/get-session` 200 with the session, `GET /api/auth/list-sessions` 200, `POST /api/auth/update-user {name}` 200 and the name changed in the DB, `POST /api/auth/change-password` 200. Two session rows remained.
- Close: delete the user's sessions when status leaves ACTIVE, and reject non-ACTIVE users in a `hooks.before` for every session-bearing auth path.

F5. Reset tokens are stored in plaintext. P1, PR-003.
- Where: `lib/auth/server.ts:55-76` leaves `verification.storeIdentifier` at its default. The row is `identifier = 'reset-password:' + raw token`. The old store kept only a sha256 hash (`lib/tokens/crypto.ts`), so this is a regression.
- Probe: the mailed token equals the identifier suffix (compared in code, value not printed). Anyone with read access to the DB or a backup can reset any account with a pending link.
- Close: set `verification: { storeIdentifier: "hashed" }` (supported in better-auth 1.7.10, `node_modules/better-auth/dist/db/internal-adapter.mjs:717`) and update the `/reset` peek in `lib/auth/password-reset-boundary.ts:55-61`, which looks the token up by raw identifier.

F6. An older reset link still works after a newer one was used. P2, PR-003.
- Probe: request link A, request link B, use B (200), then use A (200). A second successful reset from a stale link.
- Close: after a successful reset, delete every `reset-password:*` verification row whose `value` is that user id.

F7. Sign-up is an unthrottled account-existence oracle. P1, PR-013 (D17 asks for a sign-up limit).
- Where: `lib/auth/signup.ts:79` and `app/signup/actions.ts:35` return "An account already exists for that email." No limiter (see F1).
- Probe: 12 rapid submissions with existing emails, 12/12 answered "already exists".
- Close: add the same limiter as F1, or answer generically and send a mail.

F8. Reset-link origin comes from the request, not the configured base URL. P2, PR-003.
- Where: `lib/auth/server.ts:65-67` builds the link from `new URL(request.url).origin`.
- Probe: with `Host: evil.example` or `X-Forwarded-Host: evil.example` the link pointed to `http://localhost:3651`, not to `evil.example` (no poisoning) and not to the configured `http://127.0.0.1:3651`. With `X-Forwarded-Proto: https` the scheme followed the header.
- Breaks: links can point at an internal host behind a proxy, and the scheme follows a client header.
- Close: always use `BETTER_AUTH_URL`.

F9. Reset API endpoints do not fail closed without a mail adapter. P2, PR-003 and PR-074.
- Where: the delivery gate covers the pages and server actions only (`lib/auth/password-reset-boundary.ts:31-32`). `POST /api/auth/request-password-reset` and `/api/auth/reset-password` stay live.
- Probe (run 1, no adapter): `/reset-request` 404, `/reset?token=…` 404, no "Forgot" link on `/login`. `POST /api/auth/request-password-reset` returned the same 200 body for a known and an unknown email (no leak) but minted a verification row for the known account (0 -> 1). The send failed in the background ("mail delivery is not configured" in the server log). The token is never delivered, so the risk is low.
- Close: in `sendResetPassword` or a before-hook, refuse both endpoints when `mailDeliveryConfigured()` is false, before a token is written.

F10. Reset requests leak account existence by timing. P2, PR-003.
- Probe (run 2, 8 samples each): known 16 to 17 ms, unknown 9 to 10 ms. The ranges do not overlap. Bodies were identical. A real mail provider will widen the gap.
- Where: `lib/auth/server.ts:64-73`; Better Auth awaits `sendResetPassword` unless background tasks are configured.
- Note: AUTH-DECISION line 72 asks to re-confirm the owner's 2026-09-30 ruling that reset responses may reveal existence. This is an owner call. If non-enumeration stays the goal, send the mail off the request path.

F11. The server boots without an auth secret. P2, PR-037.
- Where: `lib/auth/server.ts:52` reads `BETTER_AUTH_SECRET ?? AUTH_SECRET` with no startup check.
- Probe (run 3, both unset): server ready, `/login` 200, `/api/auth/get-session` 500, sign-in 500, `GET /api/v1/…/session` with no credentials 500 `{"error":{"code":"internal"}}`. Auth fails closed on first use, but the app does not refuse to boot, and v1 returns 500 instead of 401 in this posture.
- Close: throw at module load (or in `instrumentation.ts`) when the secret is missing or short in production.

F12. The D15 role matrix is not enforced on server actions. P1, PR-009.
- Where: `lib/auth/roles.ts` is used only by `lib/api/v1.ts:91` and the session route. The training-plan server action still authorizes through `lib/auth/rbac.ts:148,163,182` (owner write scope `assigned`).
- Probe: owner A without an assignment saving a draft for own client A1 got "You don't have access to this training program." D15 says owner and coach have `plan.write: workspace`. With an ACTIVE assignment the same call passed authorization and stopped at the training policy gate ("Training programs aren't available right now", `lib/trainingprogram/boundary.ts:91-92`).
- This fails safe. Q3 holds: the client is denied on the same payload. `docs/security/authorization-model.md:30-33` says the rule is enforced at `/api/v1`, but no `/api/v1` plan-write route exists yet.
- Close: route plan writes through the matrix, or record that the ROLES PR replaces `rbac.ts`.

F13. A pre-existing page leaks a foreign client's name. P2 now, P1 before training plans ship. PR-010 and PR-011. Not in the PR-05 diff.
- Where: `app/workspace/[workspaceId]/clients/[clientProfileId]/training-program/page.tsx:47-50` reads `clientProfile.name` by URL ids with no authorization, and `:64` renders it.
- Probe: owner A -> workspace B client B1 training page: HTTP 403, but the RSC payload carries `"Training programs — Client B1"`. Client A1 -> client A2: 403 with `"— Client A2"`. The dashboard, daily and meal-plan pages for the same ids returned 403 with no name.
- Reachable only with `ENABLE_TRAINING_PLANS=1` in a non-production runtime (`lib/trainingprogram/gate.ts`).
- Close: authorize before the lookup, or derive the name from the authorized service result.

F14. The `/invite` peek renders the form for a mismatched workspace. P2. Pre-existing.
- Probe: the workspace A invite token presented with the workspace B id rendered `invite-page`. Submitting was refused ("invalid or has already been used"), no membership was created, and the token was not consumed.
- Close: bind the workspace in the peek (`lib/workspace/invite-acceptance.ts`, `getInviteLinkState`).

Notes, no ticket:
- `sessions.token` is stored raw (Better Auth default). The DB row is a bearer credential. Treat DB access accordingly.
- `lib/workspace/roster.ts:44,47` orders by `(createdAt, id)` but pages by `id > cursor`. Pages can skip or repeat rows. Workspace scoping is unaffected. Functional, so it is for the Haiku lane.

## Item detail

### 1. Session revocation (PR-005): FAIL
| Request | Expected | Actual | Result |
|---|---|---|---|
| `POST /api/auth/change-password` with `revokeOtherSessions: true` from S1 | 200 | 200, new token | PASS |
| S2 cookie -> `GET /api/v1/workspaces/:wsA/session` | 401 | 401 | PASS |
| S2 bearer -> same | 401 | 401 | PASS |
| S2 cookie -> `GET /workspace/:wsA/home` | redirect to /login | 307 -> /login | PASS |
| S1 pre-change cookie -> v1 | 401 | 401 | PASS |
| `change-password` without the flag, then S4 -> v1 | 401 | 200 | FAIL (F3) |
| Same S4 -> page | redirect | 200 | FAIL (F3) |
| Reset via `/reset` form (run 2), pre-reset S1 and S2: v1 cookie / v1 bearer / page | 401 / 401 / redirect | 401 / 401 / 307 -> /login, both sessions | PASS |
| Cookie cache: Set-Cookie names on sign-in | no `session_data` cookie | only `better-auth.session_token`. `session.cookieCache` is not set (`lib/auth/server.ts:77-80`) | PASS |

### 2. Inactive lockout (PR-005, PR-002): FAIL
| Request | Expected | Actual | Result |
|---|---|---|---|
| Deactivated user's cookie -> v1 session | 401 | 401 | PASS |
| Deactivated user's bearer -> v1 clients | 401 | 401 | PASS |
| Deactivated user's cookie -> `/workspace/:wsA/clients` | redirect, no roster | 307 -> /login, no names | PASS |
| Sign-in with the correct password | 401, same message as a wrong password | 401 "Invalid email or password" | PASS |
| Sign-in `COACH.A@probe.test` and `  coach.a@probe.test  ` | refused | 401, no token, both | PASS |
| Same cookie -> `/api/auth/get-session`, `list-sessions`, `update-user`, `change-password` | refused | 200 on all four; name changed | FAIL (F4) |
| `guard.ts` check kept | unchanged | `git diff --stat origin/Vari8-Beta HEAD -- lib/auth/guard.ts` is empty; the deny is still at `lib/auth/guard.ts:206,251` | PASS |

### 3. Missing or malformed credentials (PR-005, PR-023, PR-108): PASS
Routes found (`find app -name route.ts`, plus the build route table): `app/api/v1/workspaces/[workspaceId]/clients/route.ts` (GET), `app/api/v1/workspaces/[workspaceId]/session/route.ts` (GET). There is no `middleware.ts` or `proxy.ts`.
| Request | Expected | Actual | Result |
|---|---|---|---|
| 2 routes x 2 workspace ids (real, nonexistent) x 11 credential variants: none, garbage cookie, forged signed-shape cookie, 6000-char cookie, empty cookie, garbage bearer, empty bearer, dotted bearer, 6000-char bearer, Basic scheme, bearer plus garbage cookie | 401 `unauthenticated` | 401 `{"error":{"code":"unauthenticated"}}` on all 44 | PASS |
| Expired session row (expires_at moved into the past), cookie and bearer | 401 | 401, 401 | PASS |
| POST, PUT, PATCH, DELETE on `/clients` with no credentials | not 200, not 500 | 405 x4 (no handler) | PASS |
| `sessions` and `rate_limit` row counts around 3 malformed calls | unchanged | 17 -> 17, 36 -> 36 | PASS |
Artifact: the first row-count check read 4 -> 4 against an expected +1. Better Auth deletes an expired session row when it reads it, so the setup row went away. The recount above replaces it. Caveat: with no auth secret set, these routes return 500 (F11).

### 4. Invites (PR-003 token class, PR-011): PASS
| Request | Expected | Actual | Result |
|---|---|---|---|
| Accept invite A3 in tab 1 (Chromium form) | redirect to /login?inviteAccepted=1 | as expected | PASS |
| Submit the same token from tab 2 (form already rendered) | refused, 1 user, 1 membership | "This invitation link is invalid or has already been used.", 1 user, 1 membership | PASS |
| Reload the accepted invite URL | invalid page | `invite-invalid` | PASS |
| Sign in with the original password, then with the replay password | 200 / 401 | 200 / 401 | PASS |
| A `PASSWORD_RESET`-purpose `access_token` on `/invite` | invalid | `invite-invalid` (the DB refused a workspace-shaped reset row; a user-shaped row was used) | PASS |
| A Better Auth reset token on `/invite` | invalid | `invite-invalid` | PASS |
| Invite token A4 posted to `/api/auth/reset-password` | 400 INVALID_TOKEN | 400 INVALID_TOKEN | PASS |
| A4 still usable as an invite afterwards | `invite-page` | `invite-page` | PASS |
| A4 with the workspace B id: page, then submit | refused, no membership, not consumed | page rendered the form (F14); submit refused, no membership in B, token not consumed | PASS |

### 5. Reset links (PR-003): PASS, with findings
| Request | Expected | Actual | Result |
|---|---|---|---|
| `/reset-request` form (adapter on) | 200, generic copy | 200, generic copy | PASS |
| Mail in the dev mailbox | 1 message with a link | yes | PASS |
| Verification row TTL | 3600 s | 3600 s (`lib/auth/server.ts:74`) | PASS |
| Token at rest | hashed | plaintext | FAIL (F5) |
| `/reset?token=<valid>` | form | 200 with form | PASS |
| Submit the form | new password works | `/login?reset=1`, new password signs in | PASS |
| Same token again via API | 400 INVALID_TOKEN | 400 INVALID_TOKEN | PASS |
| `/reset?token=<used>` | no form | no form, "invalid or expired" copy | PASS |
| `expires_at` set 1 s in the past | 400 | 400 INVALID_TOKEN | PASS |
| `expires_at` set to 59 min ahead (positive control) | 200 | 200 | PASS |
| Older link after a newer one was used | refused | 200 | FAIL (F6) |
| `Host` or `X-Forwarded-Host: evil.example` on the reset request | link does not point at evil.example | link at `http://localhost:3651`; scheme follows `X-Forwarded-Proto` | PASS for poisoning; F8 for the origin |
| 4 reset requests from one IP in 60 s | 3, then 429 | 200, 200, 200, 429 | PASS |

### 6. Rate limit (PR-013, PR-014): FAIL
| Request | Expected | Actual | Result |
|---|---|---|---|
| 12 wrong, one fixed XFF | 10 x 401, then 429 | 401 x10, 429, 429 | PASS |
| Same IP, email variants (upper case, plus, leading space) | 429 | 429, 429, 429 | PASS |
| 30 wrong on one account, rotating XFF | limited | 401 x30, 0 x 429 | FAIL (F2) |
| Per account: right password after 42 failures | throttle or lockout | 200 | FAIL (F2, PR-014) |
| Proxy chain: attacker fills the bucket, then a different user | 200 for the real user | 429 | FAIL (F2) |
| Control: single-value XFF client right after | 200 | 200 | PASS |
| `/login` form, 15 wrong, then right | limited after 10 | 0/15 limited, right password signed in | FAIL (F1) |
| Sign-up form, 12 rapid submissions | throttled | 12/12 answered | FAIL (F7) |
Artifact: one probe with no XFF showed a "real user" 429. Next.js fills `X-Forwarded-For` from the socket, so both callers were 127.0.0.1, which is the same client. The proxy-chain probe replaces it.

### 7. Roles and IDOR (PR-009, PR-010, PR-011): FAIL (pre-existing), PR-05 surface PASS
| Request | Expected | Actual | Result |
|---|---|---|---|
| Owner A -> `/api/v1/workspaces/:wsB/clients` and `/session`, cookie and bearer | 403 | 403 / 403, both routes | PASS |
| Coach A -> workspace B, both routes | 403 | 403 / 403 | PASS |
| Client A1 -> `/api/v1/workspaces/:wsA/clients` | 403 | 403 / 403 | PASS |
| Client A1 -> `/api/v1/workspaces/:wsB/session` | 403 | 403 / 403 | PASS |
| Owner A and coach A -> own roster (control) | 200 | 200 / 200 | PASS |
| Session export, client A1 | role client, `plan.write` deny, `roster.read` deny | as expected | PASS |
| Session export, owner A: `user.id` | owner A only | owner A | PASS |
| Owner A -> B1 dashboard, daily; coach A -> B1 meal plan; owner A -> workspace B clients | no B1 data | 403, no name | PASS |
| Owner A -> `/workspace/:wsA/clients/:B1/training-program` (mixed ids) | no B1 data | 200, no name | PASS |
| Owner A -> `/workspace/:wsB/clients/:B1/training-program` | no B1 data | 403, "Client B1" in RSC payload | FAIL (F13, pre-existing) |
| Client A1 -> `/workspace/:wsA/clients/:A2/training-program` | no A2 data | 403, "Client A2" in RSC payload | FAIL (F13, pre-existing) |
| Client A1 -> A2 dashboard, daily; workspace A roster page | no A2 data | 403, no name | PASS |
| `saveTrainingDraftAction`: client A1 on own plan (Q3) | denied | "You don't have access to this training program." | PASS |
| Same as client A1 on A2; owner A on B1; owner A with mixed ids; anonymous | denied | denied, all four | PASS |
| `training_programs` rows after the denied calls | 0 new | 0 -> 0 | PASS |
| Owner A without an assignment, own client (D15 control) | allowed per D15 | denied | F12 (fails safe) |
| Owner A with an ACTIVE assignment | passes authorization | passed authz, stopped at the policy gate | control for the Q3 deny |

### 8. Email normalisation (PR-002, PR-014): PASS
| Request | Expected | Actual | Result |
|---|---|---|---|
| Sign-in `OWNER.A@PROBE.TEST`, `Owner.A@Probe.Test` | 200, same user | 200, same user id | PASS |
| Sign-in `  owner.a@probe.test  ` over the HTTP API | not 500, no new account | 400 (Better Auth email validation). The form path trims first (`auth.ts:36-38`) | PASS |
| Sign-in `owner.a+x@probe.test` | 401, no account | 401 | PASS |
| `POST /api/auth/sign-up/email` with a case variant | refused | 400 "Email and password sign up is not enabled" | PASS |
| Sign-up form with `OWNER.A@PROBE.TEST`, `  owner.a@probe.test  `, `Owner.A@probe.test` | refused, no new user | "An account already exists", user count 7 -> 7 | PASS |
| Real `owner.a` sign-in after the duplicates | 200 | 200 | PASS |
| 11 wrong with a case variant from IP P, then the real user from IP Q | real user 200 | P: 401 x10, 429; real 200 | PASS |
| User count across all variants | unchanged | 6 -> 6 | PASS |

### 9. Secrets and cookies (PR-036, PR-037, PR-041, PR-045): FAIL on boot check
| Request | Expected | Actual | Result |
|---|---|---|---|
| `git diff origin/Vari8-Beta HEAD` added lines grep for AKIA, private keys, `sk_live`, `ghp_`, `xox*`, quoted secret or password literals of 12+ chars, URLs with inline passwords | none live | 19 hits, all synthetic test-fixture passwords in `tests/**` and the report's prose. No credential URL added. `.env.example` adds a `BETTER_AUTH_SECRET` placeholder only. No `.env`, key or pem file in the diff | PASS |
| Local DB password string in the diff | not added | 1 occurrence, a context line in `.env.example` (pre-existing documented local default; baseline PR-036) | PASS |
| Set-Cookie over http | HttpOnly, SameSite=Lax | `Max-Age=604800; Path=/; HttpOnly; SameSite=Lax` | PASS |
| Set-Cookie with `BETTER_AUTH_URL=https://…` | `__Secure-`, Secure, HttpOnly, Lax | `__Secure-better-auth.session_token; …; HttpOnly; Secure; SameSite=Lax` | PASS |
| The same token under the un-prefixed name | 401 | 401 | PASS |
| Session-cookie POST to `/api/auth/update-user` with an evil, missing or `null` Origin | 403 | 403 x3, name unchanged | PASS |
| `/api/auth/sign-in/email` from an evil Origin | 403 | 403 | PASS |
| `update-user` with email, status, `emailVerified`, `platformRole` | protected fields unchanged | email change 400; other fields ignored, none changed | PASS |
| `delete-user`, `change-email` | refused | 404, 400 | PASS |
| Boot with no `BETTER_AUTH_SECRET` or `AUTH_SECRET` | refuse to start | boots; pages 200; auth 500; v1 500 | FAIL (F11) |

### 10. Fail closed without `MAIL_DELIVERY_ADAPTER` (PR-003, PR-074): FAIL
| Request | Expected | Actual | Result |
|---|---|---|---|
| `GET /reset-request` | 404 | 404 | PASS |
| `GET /reset?token=…` | 404 | 404 | PASS |
| `/login` "Forgot your password" link | absent | absent | PASS |
| `POST /api/auth/request-password-reset`, known vs unknown email | same refusal, no token row | same 200 body (no leak), token row minted for the known account | FAIL on fail-closed (F9); PASS on leak |
| `POST /api/auth/reset-password` with a forged token | 4xx | 400 INVALID_TOKEN | PASS |
| Adapter on: known vs unknown body | identical | identical, +1 mail | PASS |
| Adapter on: timing, 8 samples each | no gap | 16 to 17 ms vs 9 to 10 ms | F10 (owner question) |

## Impact on PRODREADY-BASELINE rows (re-grade after PR-05, for the next audit)

| Row | Baseline | Proposed now | Why |
|---|---|---|---|
| PR-002 | PARTIAL | PRESENT | Live case, plus and whitespace probes pass; no duplicates, no lockout of the real user (item 8). |
| PR-003 | PARTIAL | PARTIAL | 60 min and single use now hold. Tokens are plaintext at rest (F5); older links survive (F6). |
| PR-005 | PARTIAL | PARTIAL | Reset revokes everything. Change revokes only on request (F3); deactivated sessions live on auth endpoints (F4). 7-day expiry, 1-day update age (`lib/auth/server.ts:77-80`). |
| PR-009 | MISSING | PARTIAL | Matrix exists and is enforced at `/api/v1`; server actions still use `rbac.ts` (F12). |
| PR-010 | PARTIAL | PARTIAL | PR-05 surface passes; pre-existing name leak on the flag-gated training page (F13). |
| PR-011 | PARTIAL | PARTIAL | v1 helper scopes centrally; services unchanged. |
| PR-013 | MISSING (P0) | PARTIAL (P0 gap) | HTTP limiter exists but is bypassable (F2); the form path has none (F1); sign-up has none (F7). |
| PR-014 | MISSING | MISSING | No per-account throttle; proxy-chain global lockout (F2). |
| PR-023 | PARTIAL | PARTIAL | Zod at the v1 boundary only. |
| PR-041 | PARTIAL | PARTIAL | CSRF Origin enforcement on auth endpoints verified live; no CSP still. |

## Tickets (for the builder; acceptance = re-run the named probe)

| Id | Sev | Finding | Acceptance |
|---|---|---|---|
| T1 | P0 | F1 form-login limiter | 11th wrong `/login` form attempt for one email or IP is refused in Chromium; right password then refused until the window ends. Same for `/signup`. |
| T2 | P0 | F2 trusted IP plus per-account throttle | Rotating `X-Forwarded-For` gets 429 within 10 attempts on one account; a different user behind the same proxy is not locked out; config names the trusted proxy for the chosen host. |
| T3 | P0 | F3 change revokes all | `change-password` without the flag leaves zero prior sessions (v1 401, page redirect). Test with two sessions. |
| T4 | P1 | F4 deactivation | After deactivation, `get-session` returns null, `update-user` and `change-password` refuse, session rows 0. |
| T5 | P1 | F5 hashed reset tokens | `verifications.identifier` does not contain the mailed token; reset still works once. |
| T6 | P1 | F7 sign-up oracle | Rapid duplicate sign-ups are throttled or answered generically. |
| T7 | P1 | F12 D15 on server actions | Owner and coach can write any workspace client's plan without an assignment; client still denied. Or a recorded decision that the ROLES PR does this. |
| T8 | P2 | F6 stale reset links | After a successful reset, every other outstanding reset link for that user returns INVALID_TOKEN. |
| T9 | P2 | F8 link origin | Mailed link always uses `BETTER_AUTH_URL`, whatever the Host or X-Forwarded-* headers. |
| T10 | P2 | F9 API fail-closed | With no adapter, `POST /api/auth/request-password-reset` and `/reset-password` refuse and write no verification row. |
| T11 | P2 | F11 secret at boot | `next start` in production exits non-zero without a secret. |
| T12 | P2 | F13 pre-existing page leak | Training page for a foreign client id carries no client name in HTML or RSC payload. |
| T13 | P2 | F14 invite peek | `/invite` with a foreign workspace id renders `invite-invalid`. |

Owner decision: F10, whether reset responses may reveal account existence (AUTH-DECISION line 72, owner ruling of 2026-09-30). Hosting choice is needed to finalize T2.

## Not covered

- The PR's own unit, integration and e2e suites were not re-run here; that is the Haiku function lane. Test bite was not checked.
- Full git-history secret scan (gitleaks is not installed); only the PR diff was scanned.
- MFA and lockout (PR-004, PR-014 beyond the limiter) are out of this PR's built scope.
- Mobile bearer refresh rotation is deferred by the 02:12 ruling.

## Cleanup

Server on 3651 stopped (`ss -ltnp | grep :3651` returned nothing) and database `app_pr05sec` dropped (`dropdb` ok; `pg_database` count for the name is 0). The scratch env file holding the local DB credential and the generated auth secret was deleted. Probe scripts and raw results JSON stay in `/home/nexuslink/.hermes/profiles/urokodaki/cache/scratch/pr05sec/`, which is pruned after 24 h. The worktree's `.next/` was rebuilt by `npm run build` (gitignored). Nothing was committed, pushed or merged. The only new file from this run is this report.
