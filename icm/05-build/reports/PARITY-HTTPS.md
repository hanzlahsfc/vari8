# PARITY-HTTPS — issue #202 parity production startup repair

Base: `Vari8-Beta` `d1c4081022f2ac21070b28f284248fad2ef04839`.
Residual-repair code head: `9e183d025c29d1da8e83e009ac4ac77a0c50cfa0`.
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
3. Preserve comparison meaning: no baseline, shot-index recipe,
   comparison selector, viewport, font, pixel threshold, app code, or
   production-auth changes. Harness-only click scoping may be corrected
   when validation proves it captured the wrong element. Pass HTTPS
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
- Capture validates the expected pathname and rejects
  auth/authorization/error content immediately after navigation. After
  the recipe it waits, bounded, for the expected screen contract:
  pathname/hash, required query parameters, screen-specific content and
  selected/open state (`aria-current`, `aria-selected`, `aria-pressed`,
  `data-active`, open dialogs). The manifest records `finalUrl` and
  `marker`. Screens without click recipes have explicit content/state
  markers rather than generic navigation labels.
- The template-habits recipe now scopes its section clicks to the
  template navigation instead of unrelated right-panel toggles; the
  `Training Program` recipe label resolves to the actual `Training`
  navigation item while the original recipe remains in the manifest.
- Backend process-group ownership and proxy listener ownership are
  checked at startup and re-checked before/after captures. The spawned
  backend gets a per-run `PARITY_OWNERSHIP_TOKEN`; descendant processes
  inherit it. Cleanup records PID, PGID, host process-start time and
  token ownership, signals verified member/listener PIDs individually —
  never `-PGID` — and rechecks PID/start/token immediately before
  `SIGTERM` or `SIGKILL`. Same-PGID processes without ownership proof,
  inspection failures and foreign listeners are reported, never killed;
  unverified residue makes cleanup incomplete rather than green.
- Comparison semantics are unchanged except `ignoreHTTPSErrors` for the
  disposable self-signed loopback cert. Baselines, shot-index recipes,
  comparison selectors, viewport dimensions, fixed clock, pixel/DOM
  thresholds and fonts were not changed; the only selector-like edit is
  the harness's `STEP_SCOPES`/recipe-label resolution above, which makes
  the intended template-navigation step deterministic.

Certificate limitation: the temporary directory is created before
OpenSSL runs and is removed in `finally` after key/cert bytes are in
memory. A `SIGKILL` in the narrow window before that `finally` can still
leave the empty/partial `mkdtemp` directory; this is not claimed to be
covered.

## Fresh verification — Node v24.22.1

Focused regression suite:
`npx vitest run tests/unit/parity-https.test.ts` → **17/17 passed,
exit 0**. Covers TLS forwarding/certificate cleanup, non-loopback
refusal, malformed or unusable port pairs, distinct unpinned pairs,
occupied public-port race refusal, live spawned listener cleanup, live
leader-exit descendant cleanup with an unrelated listener preserved,
injected same-PGID/unverified identity refusal, owned descendant
cleanup, escalation identity recheck, inspection fail-closed behavior,
authenticated route/query/content/state rejection, explicit markers for
no-click screens, malformed/non-HTTPS `PARITY_URL`, Secure/SameSite,
Domain/Path and controlled-clock `Max-Age`/`Expires` semantics.

Targeted mutations:

- Ownership predicate removed → **1 expected failure**, exit 1:
  same-PGID unverified identities were incorrectly sent SIGTERM and
  SIGKILL. Exact patch/log/restore hash:
  `icm/05-build/reports/parity-https-identity-mutation/`.
- Mutations were restored by exact inverse edits and the focused suite
  returned to **17/17**, exit 0. Restored SHA-256:
  `tools/parity/local-https.mjs`
  `285fcd92fd28e411c8b1871d0133db1c40d7a2c2612c24477201288ea5cf0206`;
  `tools/parity/capture.mjs`
  `2cb445bcd4b0a5736b8b650ab6b7ec9f275d001528b04965bc31d1c8a513291a`;
  `tests/unit/parity-https.test.ts`
  `b38001487495f50366bdababa1451745deb5bbaf80341b05a074c76f450d2b24`;
  `tools/parity/run.mjs`
  `ce42737a606e4e24444ed07c8df9fa1c80ac99d2add58b80ee30c741b7f63bed`.
- Earlier cookie-expiry, leader-lifetime, unconditional-capture and
  query/state mutations remain preserved receipts; their hashes refer to
  earlier file versions, not this head.

Production parity run after the residual repairs:

```text
PARITY_PORT=55880 npm run parity -> exit 1
manifest.baseUrl = https://127.0.0.1:55880
manifest.screens = 70
manifest.failures = 0
manifest.retried = 0
```

All 70 captures pass the stronger screen contract. The run also exposed
one real recipe defect rather than weakening it: `s04-template-habits`
was previously clicking right-panel toggles while passing on the generic
`Habits` navigation text. After the scope/label correction, both
viewports capture the actual `Habits` editor section. Sample final URLs:
`s01-profile-overview` uses
`/coach?section=clients&client=client-013`; `s10-clients-studio` uses
`/ethereal#clients`. Login/error content and wrong query/state produce
capture failure, not a saved screenshot.

The visual comparison itself remains **not green**: `parity FAIL: 70
problem(s)`, exit 1. Prompt 406 did not rerun all 70 captures solely to
confirm the same known-red comparison; the only fresh behavior under
repair was process identity/cleanup and one unused declaration, covered
by focused live/simulated tests and standard gates. Evidence:
`_evidence/PARITY-HTTPS-server-404f.log`,
`_evidence/PARITY-HTTPS-manifest-404f.json`,
`_evidence/PARITY-HTTPS-report-404f.html` and `tools/parity/out/`.

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
- `npm run lint` → exit 0, 0 errors / 81 warnings; `VIEW_TOGGLE` removed
- `npm run test` → **105 files / 1267 tests**, exit 0
- `npm run build` → exit 0
- `git diff --check` → exit 0

Cleanup verified after the final parity run: no listeners remain on
55880/55881, no `vari8-local-tls-*` material remains under `/tmp`, and
the disposable `app_parity_https` database was dropped
(`pg_database` count 0).

## Visual investigation

Latest real-parity provenance:

- Source: the strict-capture run used code byte-identical to commit
  `5e16ec8` for its changed files. Prompt 406's `9e183d0` changes
  process-identity cleanup and removes an unused constant; it does not
  alter capture recipes, images, baselines or comparison behavior, so
  the earlier real parity evidence is carried forward rather than
  rerunning all 70 captures.
- Launch: `PARITY_PORT=55880 npm run parity`; public loopback HTTPS
  `127.0.0.1:55880`, backend loopback HTTP `127.0.0.1:55881`, disposable
  DB `app_parity_https`.
- Runtime: Node `v24.22.1`, Playwright `1.63.0`, Chromium
  `153.0.8010.12`, macOS arm64, Darwin `27.0.0`.
- Screenshot configuration: `deviceScaleFactor=1`; viewports 1440×900
  and 390×844; `FIXED_NOW=2026-10-19T10:00:00+02:00`; timezone
  `Europe/Vienna`; `document.fonts.ready`, injected transition/animation
  freeze CSS, Playwright `animations: "disabled"`, hidden caret, service
  workers blocked and full-page screenshots.
- `InfinityGeist.woff2` is byte-identical between `public/` and
  `frontend/public/` (SHA-256
  `1b5ebfb3a01a97343ac96873e6d59a8cb285c66012b6a1ac509cb2765e995ba8`).

Baseline provenance remains incomplete:

- `icm/04-briefing/shots/index.json` names
  `/home/nexuslink/vari8-worktrees/merge-proto @ 58eb6ed`.
- Read-only checks found no `58eb6ed` object in local history
  (`git cat-file`/`git rev-list --all`), no matching remote ref in
  `git ls-remote`, and no local `/Users/apple/Devin/vari8-worktrees/
merge-proto` directory. The baseline manifest records
  `baseUrl=http://127.0.0.1:42645` and the same fixed clock, but not OS,
  Node, Playwright, Chromium, device scale or the source tree's dirty
  state.

Measured findings:

- **Determinism:** the `s08-builder@1440` image from the latest strict
  run is SHA-256
  `38b90ea2b787e52a3541e569bddb7736fe917852bd5fd45ffcc76af3dd93615c`,
  identical to the earlier repaired capture. The 70 failures are not
  local capture nondeterminism.
- **Builder raster differences:** `s08-builder@1440` differs from the
  committed baseline in 1,248,913 pixels over the whole page
  (`bbox 0,0 → 1439,970`): 800,613 differ by one channel unit,
  420,566 by two, 1,578 by three and 26,156 by more than three. DOM
  element count and text are unchanged. This is measured raster/layout
  variation, not proof of a host-only baseline cause.
- **Roster geometry:** `s01-roster@1440` has the same element count and
  no text differences, but 200 moved boxes with representative
  ~0.5–6.5px shifts. This is consistent with font/layout metrics, but
  the missing reference environment prevents attribution.
- **s04 recipe baseline:** the committed `s04-template-habits` baseline
  and the pre-repair captured image both show the template editor's
  **Tabs** state. The corrected captures at both viewports show the
  intended **Habits** state (`Include Habit Tracker`, selected `Habits`).
  Those two viewport comparisons are therefore not like-for-like visual
  regressions; they demonstrate a baseline/recipe-state defect. The
  baseline was not refreshed.
- **Page-size and element differences:** five screens changed page size
  and two changed element count. `s11-preferences` adds a
  `dialog > div > div[12] > form` and its button at both viewports;
  these remain unresolved real DOM differences unless the missing
  baseline source/environment explains them.
- **Prior frontend probe limitation:** the earlier same-host `frontend/`
  probe did not record the exact source commit, dirty state or launch
  configuration and captured only 68 screens with two recipe failures.
  It is retained as evidence that the current `frontend/` source and
  committed baseline are not a clean reference, but it is **not** used
  to explain the root-app failures.

Conclusion: HTTPS startup, authenticated capture and identity-checked
lifecycle repairs are verified, but mandatory visual parity remains
**FAIL**. `s04-template-habits` is now established as a
baseline/recipe-state defect and excluded from claims of application
visual regression. The missing reference source/environment remains the
blocker for attributing the other five size changes, two element-count
changes, `s11-preferences` DOM delta and pervasive raster differences.
No baseline refresh, tolerance or visual-acceptance claim is made.

## Remaining limitation / blockers

Issue #202 should remain open under the current workflow. What is fixed:
real HTTPS startup, authenticated capture validity, cookie semantics,
port/process lifecycle and shared E2E regression coverage. What remains
blocked: the current visual comparison is 70/70 failures, and exact
reproduction requires the unavailable baseline environment/source
provenance.
