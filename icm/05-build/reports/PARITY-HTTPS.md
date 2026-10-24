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
  trusted-CA requests for the disposable cert, cookie conversion and
  owned-process cleanup.
- Root parity runs now **select/check** a public/backend port pair:
  `https://127.0.0.1:PARITY_PORT` for browser/auth and
  `http://127.0.0.1:PARITY_PORT+1` for `next start`. The bind-and-close
  probe checks availability only; it does not reserve ports. A public or
  backend port taken before the real listener starts fails closed and is
  never attached to or killed.
- `BETTER_AUTH_URL`, `AUTH_URL`, the sign-in Origin and capture
  `baseUrl` all equal the public HTTPS origin. Production auth checks
  are untouched.
- Cookie conversion now preserves `Secure`, `HttpOnly`, `SameSite`,
  `Domain`, `Path`, `Max-Age` and `Expires`. `Max-Age` wins over
  `Expires`, invalid `Max-Age` falls back to `Expires`, expired cookies
  stay expired and session cookies keep no `expires` field.
- Capture validates the final route and rejects auth/authorization/error
  content immediately after navigation. After the recipe it requires a
  screen-specific marker before saving the screenshot; the manifest now
  records `finalUrl` and `marker`. Screens without click recipes have
  explicit markers.
- Backend process-group ownership and proxy listener ownership are
  checked at startup and re-checked before/after captures. `finally`
  sends `SIGTERM` to the spawned backend group, waits for exit, uses
  bounded `SIGKILL` escalation only while the listener belongs to that
  same process group, and verifies the public/backend listeners are
  gone. A listener owned by another process is reported, never killed.
- Capture semantics are unchanged except `ignoreHTTPSErrors` for the
  disposable self-signed loopback cert. Baselines, selectors, viewport
  dimensions, fixed clock, pixel/DOM thresholds and fonts were not
  changed.

Certificate limitation: the temporary directory is created before
OpenSSL runs and is removed in `finally` after key/cert bytes are in
memory. A `SIGKILL` in the narrow window before that `finally` can still
leave the empty/partial `mkdtemp` directory; this is not claimed to be
covered.

## Fresh verification — Node v24.22.1

Focused regression suite:
`npx vitest run tests/unit/parity-https.test.ts` → **12/12 passed,
exit 0**. Covers TLS forwarding/certificate cleanup, non-loopback
refusal, malformed or unusable port pairs, distinct unpinned pairs,
occupied public-port race refusal, spawned-process termination/listener
verification, authenticated URL/content rejection, explicit markers for
no-click screens, malformed/non-HTTPS `PARITY_URL`, Secure/SameSite,
Domain/Path and controlled-clock `Max-Age`/`Expires` semantics.

Targeted mutations:

- Cookie expiry propagation removed → focused suite **1 expected
  failure**, exit 1.
- `captureProblem` made unconditional-success → **2 expected failures**,
  exit 1.
- Owned-process cleanup made a no-op → **1 expected listener-residue
  failure**, exit 1.
- Each mutation was restored by the exact inverse edit and the focused
  suite returned to **12/12**, exit 0. Restored SHA-256:
  `tools/parity/local-https.mjs`
  `87cd1ae18f7c4a4b03e1ec67a176d24d2a052d2770ef9b75b3fce53a9d06745f`;
  `tools/parity/capture.mjs`
  `4b26a2c0db424d4726e5c6800c23a6f2fb67f894a0ecb246ffd7322fc9d22ebb`.

Production parity run after the repair:

```text
PARITY_PORT=55880 npm run parity -> exit 1
manifest.baseUrl = https://127.0.0.1:55880
manifest.screens = 70
manifest.failures = 0
manifest.retried = 0
```

All 70 captures now pass authenticated-route/content validation. Sample
manifest evidence: `s01-roster@1440` ended at
`https://127.0.0.1:55880/coach?section=clients` with marker `Clients`;
`s08-builder@1440` ended at `/ethereal#dashboard` with marker
`Dashboard`; `s10-clients-studio@390` ended at `/ethereal#clients` with
marker `Clients`. Login/error content would become a capture failure,
not a saved screenshot.

The visual comparison itself remains **not green**: `parity FAIL: 70
problem(s)`, exit 1. Evidence:
`_evidence/PARITY-HTTPS-run-repair2.log`,
`_evidence/PARITY-HTTPS-server-repair2.log`,
`_evidence/PARITY-HTTPS-manifest-repair2.json`,
`_evidence/PARITY-HTTPS-report-repair2.html` and the copied current tree
`_evidence/PARITY-HTTPS-current-repair2/`.

TLS/E2E regression path on the same disposable DB:
`PLAYWRIGHT_PORT_BASE=55900 npx playwright test` → **16 passed /
8 skipped**, exit 0. The earlier **10 passed / 7 skipped** receipt was
the narrower `verify-local.sh` E2E subset, not this full suite and not
new E2E coverage added by this PR.

Standard gates:

- `npm run format:check` → exit 0
- `npm run index` → generated the new tools router entry
- `npm run index:check` → exit 0
- `npm run typecheck` → exit 0
- `npm run lint` → exit 0, 0 errors / 81 pre-existing warnings
- `npm run test` → **105 files / 1262 tests**, exit 0
- `npm run build` → exit 0
- `git diff --check` → exit 0

Cleanup verified after the final parity run: no listeners remain on
55880/55881 or the temporary frontend probe port, no
`vari8-local-tls-*` material remains under `/tmp`, and the disposable
`app_parity_https` database was dropped (`pg_database` count 0).

## Visual investigation

Environment measured on this host:

- Playwright `1.63.0`, Chromium for Testing `chrome-mac-arm64`
  (`chromium-1243`), macOS arm64, Darwin `27.0.0`.
- `deviceScaleFactor=1`; viewports are 1440×900 and 390×844.
- `FIXED_NOW=2026-10-19T10:00:00+02:00`, timezone `Europe/Vienna`.
- Capture waits for `document.fonts.ready`, disables transitions and
  animations with injected CSS plus `animations: "disabled"`, hides the
  caret, blocks service workers and takes full-page screenshots.
- `InfinityGeist.woff2` is byte-identical between `public/` and
  `frontend/public/` (SHA-256
  `1b5ebfb3a01a97343ac96873e6d59a8cb285c66012b6a1ac509cb2765e995ba8`).
- Baseline manifest records `baseUrl=http://127.0.0.1:42645` and the
  same fixed clock but does **not** record OS, Chromium version or a
  reproducible source worktree. `icm/04-briefing/shots/index.json`
  names `/home/nexuslink/vari8-worktrees/merge-proto @ 58eb6ed`; that
  object is not present in this repository, so the exact reference
  source/environment is unavailable.

Measured findings:

- **Determinism:** the `s08-builder@1440` current image from the prior
  repaired run and the post-validation run are pixel-identical
  (`diff=0`). The 70 failures are not caused by run-to-run capture
  nondeterminism on this host.
- **Builder raster differences:** `s08-builder@1440` differs from the
  committed baseline in 1,248,913 pixels over the whole page
  (`bbox 0,0 → 1439,970`): 800,613 differ by one channel unit,
  420,566 by two, 1,578 by three and 26,156 by more than three. This is
  predominantly pervasive low-channel raster/anti-aliasing variation,
  while DOM element count and text are unchanged.
- **Roster geometry:** `s01-roster@1440` has the same element count and
  no text differences, but 200 moved boxes; representative labels move
  or resize by roughly 0.5–6.5px. This is consistent with font/layout
  metric differences, but the exact reference browser/OS is not
  recorded, so a host cause is not proven.
- **Page-size and element differences:** five screens changed page size
  and two changed element count. `s11-preferences` concretely adds a
  `dialog > div > div[12] > form` and its button at both viewports; that
  is a real DOM change versus baseline, not raster noise.
- **Controlled frontend probe:** a fresh production build of the
  current `frontend/` directory was captured on this host and compared
  with the committed baseline. It is materially different (for
  `s08-builder@1440`: 1,497,233 changed pixels, mostly >3) because the
  frontend source has evolved and one recipe no longer resolves. This
  controlled run establishes that the checked-in baseline is stale for
  the current frontend source; it does not establish that all root-app
  differences are host-only.

Conclusion: the startup/auth/capture defect is repaired, but mandatory
visual parity remains **FAIL**. The evidence separates deterministic
low-channel rendering differences from real DOM/page-size changes, but
cannot prove a host-only cause without the missing baseline OS,
browser/version and source worktree. No baseline refresh, tolerance or
visual-acceptance claim is made.

## Remaining limitation / blockers

Issue #202 should remain open under the current workflow. What is fixed:
real HTTPS startup, authenticated capture validity, cookie semantics,
port/process lifecycle and shared E2E regression coverage. What remains
blocked: the current visual comparison is 70/70 failures, and exact
reproduction requires the unavailable baseline environment/source
provenance.
