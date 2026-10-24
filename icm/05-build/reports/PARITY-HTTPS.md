# PARITY-HTTPS — issue #202 parity production startup repair

Base: `Vari8-Beta` `d1c4081022f2ac21070b28f284248fad2ef04839`.
Issue: https://github.com/hanzlahsfc/vari8/issues/202.

## Scope

`tools/parity/run.mjs` starts `next start` and gives production auth an
HTTP `BETTER_AUTH_URL`/`AUTH_URL`. The boot refusal is correct and must
stay. This lane fixes the harness to serve the root app through a real
loopback HTTPS origin, without weakening auth, changing UI/baseline
semantics, or claiming a visual pass when only startup succeeds.

## Plan

1. Reproduce the issue on `PARITY_PORT=<free>` against a disposable lane
   DB and preserve the startup-refusal log.
2. Add a task-owned loopback TLS proxy for the root parity run:
   - public browser origin `https://127.0.0.1:<PARITY_PORT>`;
   - backend `next start` on a distinct `127.0.0.1` backend port;
   - configured `BETTER_AUTH_URL` and `AUTH_URL` equal the HTTPS origin;
   - pinned `PARITY_PORT` requires both public and backend ports free;
   - reject malformed/out-of-range pairs;
   - generated certificates are in-memory only and scratch material is
     removed immediately;
   - backend process group and proxy listener are re-checked before and
     after captures, then cleaned in `finally`.
3. Preserve capture meaning: no baseline, selector, viewport, font,
   pixel threshold, app code, or production-auth changes. Pass HTTPS
   session cookies with their Secure attribute.
4. Add focused regression coverage for port-pair validation, HTTPS
   proxy forwarding/certificate cleanup, Secure-cookie conversion, and
   backend/proxy ownership expectations.
5. Verify on Node 24:
   - focused unit tests;
   - a limited capture startup proof through the real HTTPS origin (or a
     truthful diagnostic if full parity cannot run locally);
   - `npm run parity` result reported exactly: startup/capture versus
     visual comparison;
   - typecheck, lint, format/index checks, build, diff check.
6. Update this report, `docs/STATUS.md`, issue #202 and the linked draft
   PR with exact commands/exits and remaining visual limitations.

## Non-goals

No baseline refresh, production-auth exemption, `APP_ENV` bypass, remote
load, deployment, merge, self-approval, shared database mutation, or
changes to unrelated scripts/worktrees.

## Root cause reproduced

On `d1c4081`, `tools/parity/run.mjs` constructed
`http://127.0.0.1:<PARITY_PORT>` and exported it as `BETTER_AUTH_URL` /
`AUTH_URL` for `next start`. A disposable `app_parity_https` database on
the existing `app-db-1` container reproduced the issue under Node
v24.22.1:

```text
PARITY_PORT=55880 npm run parity -> exit 2
parity: server exited before answering
server.log: BETTER_AUTH_URL is an http: origin; production auth
  requires an https: base URL.
```

No screenshot comparison began. Raw evidence:
`_evidence/PARITY-HTTPS-run-before.log` and
`_evidence/PARITY-HTTPS-server-before.log`.

## Repair

- `tools/local-tls-proxy.mjs` now owns the established disposable-cert
  terminator used by E2E: generate a one-day 127.0.0.1 self-signed cert
  in `mkdtemp`, load it into memory, delete the material immediately,
  bind HTTPS only to loopback and forward to a loopback HTTP backend.
- `tests/e2e/tls-proxy.mjs` is now a thin wrapper around that helper;
  its real Playwright path remains HTTPS → loopback HTTP.
- `tools/parity/local-https.mjs` owns parity URL/port validation,
  trusted-CA requests for the disposable cert and Secure/SameSite cookie
  conversion.
- Root parity runs now reserve a public/backend port pair:
  `https://127.0.0.1:PARITY_PORT` for browser/auth and
  `http://127.0.0.1:PARITY_PORT+1` for `next start`. Occupied, malformed
  or duplicate pairs refuse before comparison.
- `BETTER_AUTH_URL`, `AUTH_URL`, the sign-in Origin and capture
  `baseUrl` all equal the public HTTPS origin. Production auth checks
  are untouched.
- Backend process-group ownership and proxy listener ownership are
  checked at startup and re-checked before/after captures. `finally`
  terminates the backend group and closes the proxy.
- Capture semantics are unchanged except `ignoreHTTPSErrors` for the
  disposable self-signed loopback cert. Baselines, selectors, viewport
  dimensions, fixed clock, pixel/DOM thresholds and fonts were not
  changed.

## Fresh verification — Node v24.22.1

Focused regression suite:
`npx vitest run tests/unit/parity-https.test.ts` → **7/7 passed,
exit 0**. Covers TLS forwarding/certificate cleanup, non-loopback
refusal, malformed or unusable port pairs, distinct unpinned pairs,
malformed/non-HTTPS `PARITY_URL`, and Secure/SameSite cookies.

Production parity run after the fix:

```text
PARITY_PORT=55880 npm run parity -> exit 1
manifest.baseUrl = https://127.0.0.1:55880
manifest.screens = 70
manifest.failures = 0
manifest.retried = 0
```

The startup defect is fixed: the production build booted through the
configured HTTPS origin, sign-in succeeded, and all 70 captures began
and completed. The visual comparison itself is **not green**: all 70
captured screens differ from the checked-in host baseline and are
reported truthfully as `parity FAIL: 70 problem(s)`. Evidence:
`_evidence/PARITY-HTTPS-run-after.log`,
`_evidence/PARITY-HTTPS-server-after.log`,
`_evidence/PARITY-HTTPS-manifest-after.json`, and
`_evidence/PARITY-HTTPS-report-after.html`. This is a baseline/host
visual result, not the original HTTP-auth startup refusal.

TLS/E2E regression path: `PLAYWRIGHT_PORT_BASE=55900 npx playwright
test` on the same disposable DB → **16 passed / 8 skipped / exit 0**.
The skipped reset-mail cases remain skips, not passes.

Standard gates after generation:

- `npm run format:check` → exit 0
- `npm run index` → generated the new tools router entry
- `npm run index:check` → exit 0
- `npm run typecheck` → exit 0
- `npm run lint` → exit 0, 0 errors / 81 pre-existing warnings
- `npm run test` → **1255/1255**, exit 0
- `npm run build` → exit 0
- `git diff --check` → exit 0

Cleanup verified after the final parity run: no listeners remain on
55880/55881, no `vari8-local-tls-*` material remains under `/tmp`, and
`app_parity_https` was dropped (`pg_database` count 0).

## Remaining limitation

The repair proves real HTTPS startup and complete capture, not visual
acceptance. All 70 comparisons currently fail against the committed
baseline. That evidence is preserved for independent review; no baseline
refresh or visual claim is made.
