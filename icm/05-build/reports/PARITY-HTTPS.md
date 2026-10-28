# PARITY-HTTPS — issue #202 parity production startup repair

Base: `Vari8-Beta` `d1c4081022f2ac21070b28f284248fad2ef04839`.
Residual-repair code head: `8b5424f825dddd7e515882d69d346b46157ef849`.
Issue: https://github.com/hanzlahsfc/vari8/issues/202.

## Prompt 410 bounded repair — Codex builder

Behavioral baseline: `bd036ece2a758a1d725e511077b9e93c4c5cc2ad`
(initial PGID fix `a3b5217`, then JSDoc inspector typing). Builder is
Codex, not SWE-2 and not an independent reviewer.

Plan/acceptance: extract the runner's listener ownership check into
`tools/parity/local-https.mjs`, reuse the cleanup PID/PGID/start predicate,
and add a literal same-PID/start/different-PGID refusal in
`tests/unit/parity-https.test.ts`. Run focused RED/GREEN, standard units,
format/type/lint/index/build checks, and one direct-Next loopback
startup/shutdown proof. Regenerate the start-identity mutant from an
exact formatted baseline, apply-check/apply/fail/reverse/hash/green.
Do not change capture/baseline inputs or repeat the known-red 70-shot run.

Production currently registers only the directly spawned Next leader.
The current listener is that PID and has bounded real-chain proof.
`registerOwnedProcess` and its descendant tests exercise the helper;
production does not automatically discover/register descendants. Any
unregistered future descendant is not killed and produces explicit
incomplete-cleanup reporting. This is a safe limitation, not full
automatic descendant-cleanup coverage.

The earlier IPC regression timing failure was builder-reported history;
no original receipt was preserved, so it cannot be independently verified.
No new test is presented as a replacement for that missing original log.

Fresh results, Node v24.22.1:

- Literal same-PID/start/different-PGID regression: RED before the fix
  (`expected true to be false`), GREEN afterward. `ownsPort` now imports
  the same canonical PID/PGID/start predicate used by cleanup, rather
  than maintaining a weaker runner-local predicate.
- Focused suite: **20/20**, exit 0 after final mutation restore.
- Standard `npm run test`: **105 files / 1270 tests**, exit 0, 17.65s.
  This ran on the fixed behavior before the JSDoc-only typing commit;
  no subsequent behavior/test change. Focused tests ran on the final code.
- `npm run typecheck`, `npm run lint`, `npm run build`: exit 0 after
  the inspector JSDoc correction. An earlier typecheck caught inferred
  required `ppid`; the public helper now uses existing `ProcessInspector`.
- `npm run index:check`: exit 0 after unit fixtures completed. A check
  concurrent with system-index tests observed their temporary README
  removal; the tracked README was restored by the tests, not altered here.
- Sandbox-only focused tests initially failed loopback `EPERM`; the
  permitted real-localhost run passed. No failure was silently counted
  as a pass or attributed to application behavior.
- Direct Next probe: dynamic loopback port 64361, listener/leader PID
  95692, PGID 95692, matching start identity, `/login` 200 and
  `ownsPort=true`; cleanup `[]`, exit 143, no remaining listeners.
  Synthetic startup credentials and a dead DB URL ensured no account or
  database mutation. Receipt: `parity-https-identity-mutation/prompt410-real-chain.txt`.
- Pure start-identity mutant: final-baseline patch apply-check/apply
  succeeds; selected guard test fails (unexpected SIGKILL), inverse
  application restores SHA-256
  `6c885487e5c523f61fabb3d4dc3f0a4152e408cd278e01a87da4cd9374bf0cb9`,
  then focused 20/20. See `prompt410-mutation.txt`; the original corrupt
  patch is retained as `start-identity-off.superseded.txt`, not accepted
  historical applicable evidence.

No new all-70 parity/E2E/browser screenshot run was performed for this
ownership-only repair. Prior visual receipts below are historical:
70 valid captures, 70 visual problems; s04 Tabs-versus-Habits state,
s11 DOM and five size/two element changes remain unresolved. Issue #202
and PR #203 remain open/draft; no SHIP, waiver or merge is claimed.

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
- Backend process ownership no longer relies on `ps eww` environment
  text: on this host that output mixes argv/environment and the actual
  `npx → next-server` chain exposed no token on either process. The
  runner now invokes `node node_modules/next/dist/bin/next` directly;
  the spawned PID becomes the `next-server` listener. Startup records a
  PID/PGID/process-start registry for the spawned group leader;
  `registerOwnedProcess` adds a descendant only while its parent lineage
  resolves to a registered member in the same original PGID. Cleanup
  signals only registry identities, rechecked by PID/PGID/start before
  `SIGTERM` or `SIGKILL`; same-PGID argv-only processes, malformed/null
  records, inspection failures and foreign listeners are reported,
  never killed. Missing ownership returns an explicit cleanup problem.
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

Process-identity limitation: rechecking PID/PGID/start immediately
before each signal narrows, but cannot eliminate, the inherent
inspect-then-signal TOCTOU window. A PID/PGID could still be reused
between the final identity read and `kill`. The code does not claim to
close that window and does not use PGID-only, port-only, argv-only or
environment-substring fallback.

## Historical verification before Prompt 410 — Node v24.22.1

Focused regression suite:
`npx vitest run tests/unit/parity-https.test.ts` → **19/19 passed,
exit 0**. Covers TLS forwarding/certificate cleanup, non-loopback
refusal, malformed or unusable port pairs, distinct unpinned pairs,
occupied public-port race refusal, live spawned listener cleanup, live
registered-descendant cleanup after leader exit with an unrelated
listener preserved, missing-ownership refusal, same-PGID argv-only
refusal, malformed/null record fail-closed behavior, owned descendant
cleanup, escalation identity recheck, inspection fail-closed behavior,
authenticated route/query/content/state rejection, explicit markers for
no-click screens, malformed/non-HTTPS `PARITY_URL`, Secure/SameSite,
Domain/Path and controlled-clock `Max-Age`/`Expires` semantics.

Bounded real-chain proof:
`node node_modules/next/dist/bin/next start -p 55984 -H 127.0.0.1`
produced listener PID `76370`, the same PID/PGID/start identity recorded
in the ownership registry. `stopOwnedProcessGroup` returned `[]`, exit
was `143`, and no listener/owned process remained. Receipt:
`icm/05-build/reports/parity-https-identity-mutation/real-chain-proof.txt`.
A direct `npx next start` probe reproduced the prior defect: neither
`npm exec` nor `next-server` exposed the token through `ps eww`, so the
old ownership check could not verify the real listener.

Targeted mutations:

- Process-start identity removed from ownership and signal recheck →
  **1 expected failure**, exit 1: a same-PID/same-PGID process with a
  different start time received `SIGKILL`. Exact patch/log/restore
  evidence: `icm/05-build/reports/parity-https-identity-mutation/`.
- Mutations were restored by exact inverse edits and the focused suite
  returned to **19/19**, exit 0. Immediate restore hashes and final
  post-hardening hashes are preserved in the mutation directory; final
  SHA-256:
  `tools/parity/local-https.mjs`
  `9309f4de41d2ad2bc9f36b2e67af778ac8f9f775dbdad2ae01f289e0f4bf2fb3`;
  `tools/parity/run.mjs`
  `53d3bd8102002cff50721bdefce9db1f64d3ace43a78edf55c29a0f2ed2e59ac`;
  `tests/unit/parity-https.test.ts`
  `d430db3a311dffc08149f8e14c9e4589d287122a83a11410fdeffb9f9b6250aa`;
  `tools/parity/capture.mjs`
  `2cb445bcd4b0a5736b8b650ab6b7ec9f275d001528b04965bc31d1c8a513291a`.
- Earlier cookie-expiry, leader-lifetime, unconditional-capture,
  query/state and ownership-predicate mutations remain preserved
  receipts; their hashes refer to earlier file versions, not this head.

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
problem(s)`, exit 1. Prompts 406/408 did not rerun all 70 captures
solely to confirm the same known-red comparison; the fresh behavior was
process ownership/cleanup plus an unused declaration, covered by focused
live/simulated tests, a bounded real server proof and standard gates.
Evidence:
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
- `npm run test` → **105 files / 1269 tests**, exit 0
- `npm run build` → exit 0
- `git diff --check` → exit 0

Cleanup verified after the final parity run: no listeners remain on
55880/55881, no `vari8-local-tls-*` material remains under `/tmp`, and
the disposable `app_parity_https` database was dropped
(`pg_database` count 0).

## Visual investigation

Latest real-parity provenance:

- Source: the strict-capture run used code byte-identical to commit
  `5e16ec8` for its changed files. The prompt-406/408 process-identity
  cleanup commits do not alter capture recipes, images, baselines or
  comparison behavior, so
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
