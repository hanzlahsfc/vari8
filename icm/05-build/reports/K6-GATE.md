# K6-GATE — issue #178 trial load gate (test implementation)

Head: see `git log` on `beta/k6-gate`. Base: `Vari8-Beta` @
`2214105` (post-#193 merge).

## Retractions

- The first build's "134 requests, 0 errors / VERDICT PASS" was
  **false**: `load_latency` points carried no `class` tag, so the
  parser bucketed everything `unknown` and counted zero failures while
  the raw run actually contained 40 refusals, 70 redirects and 19
  transport errors (session decay — see below).
- The first repair's cookie claim ("jar computes `Expires` as a past
  instant") was **unverified** — pinning the Set-Cookie value is a
  working workaround; the exact jar-side expiry behavior is not
  diagnosed. Two-hour session behavior is unproven either way.

## Repair round 2 (post second FIX review)

- **Complete-run evidence** — `handleSummary` emits a run manifest
  (profile, planned scenarios, expected workload endpoints, iterations,
  vusMax, httpReqs, loadRequests, duration). `report.mjs` cross-checks:
  measured points must equal the manifest's `loadRequests` and the
  `load_requests` counter; `httpReqs` must cover measured + auth/setup
  traffic; every expected workload endpoint and planned scenario must
  appear. Auth-only, one-point, truncated and manifest-less runs are
  inconclusive.
- **Endpoint-specific classification** — JSON endpoints rejecting
  non-JSON 200s (`unexpected_html`); served login forms detected and
  classified `login_page`; `state:"consent_missing"`-style denials are
  refusals, not success. `session_verify` compares `user.id` against
  the fixture — a 200 naming another user is `identity_mismatch`, and
  re-authentication re-verifies identity before serving traffic. The
  failed measured request stays failed; reauth is separately tagged.
- **Resource coverage** — every mandatory metric separately required
  (app CPU, app RAM, pg connections + limit, app AND db restart
  signals). Samples must bracket the measured run window with no
  > 3×-median-interval gap — the preserved 9m39s-gap smoke would now
  > fail coverage. CPU: docker CPUPerc/cputime-delta units (100% = one
  > core) normalized to whole-host share via `hostCpus`; the "CPU < 70%"
  > check is on the host share.
- **Fixture lifecycle** — provisioning is one transaction; a
  post-commit manifest-write failure rolls the fixture rows back.
  `CONFIRM_DISPOSABLE_DB` + a shared-DB denylist (`app_dev`, `app_e2e`,
  `app`, `postgres`, `app_integration_test`). Integration suite
  cleans up its own victim rows (FK-order, verified: lane DB empty
  after run).
- **Remote execution disabled** — non-loopback targets are refused
  unconditionally; no `LOAD_ALLOW_REMOTE` escape exists in this lane.
  An approved remote-target mechanism is a separate prerequisite.
- **hold500 required** — `LOAD_PROFILE=gate` refuses to run without
  `LOAD_HOLD500_MIN` (the recorded unresolved owner decision), and the
  verdict requires a `hold500` phase to have emitted points.
- **PR body corrected** — the retracted "134 requests" claim removed;
  corrected counts throughout.

## Bounded local smoke — repaired run 2 (harness check, NOT the gate)

Production `next start` (flag on), seeded `app_chkenable_live`, TLS
proxy `https://127.0.0.1:3870`; 5 VUs / 33 s, `LOAD_PROFILE=smoke`:

| endpoint       | count | p50  | p95   | p99   |
| -------------- | ----- | ---- | ----- | ----- |
| sign_in        | 5     | 69ms | 166ms | 166ms |
| session_verify | 5     | 15ms | 89ms  | 89ms  |
| client_home    | 22    | 40ms | 77ms  | 116ms |
| checkins_page  | 22    | 35ms | 63ms  | 93ms  |
| workspace_page | 9     | 28ms | 59ms  | 59ms  |
| client_daily   | 22    | 26ms | 44ms  | 53ms  |
| session        | 31    | 18ms | 43ms  | 46ms  |
| clients        | 9     | 18ms | 29ms  | 29ms  |

125 requests — all `success` (verified against raw ndjson); manifest
proves the planned run (7 workload endpoints + auth traffic all
accounted); resources cover the window: peak 7.2 % cpu units
(0.9 % host share), 55 MB app RSS, pg 10/100, restarts 0.

**VERDICT: FAIL — only `500-session hold phase collected`.** Honest
inconclusive: every measured check passed; the missing gate phase
correctly blocks PASS. A smoke proves the harness; it is not a
500-concurrent result.

## Tests

- `tests/unit/load-gate.test.ts` — 27 tests: classification matrix
  (concealed/state/consent-missing/HTML-on-JSON/login-page/identity),
  remote-disabled regardless of flags, required hold500, manifest
  cross-checks (auth-only/one-point/truncated/missing endpoints),
  counter drift, reviewer-run replica (40 refusals + 70 redirects →
  FAIL with correct totals), resource gaps/window/partial coverage,
  memory units, threshold boundary.
- `tests/integration/k6-gate-provision.test.ts` — 7 tests on real PG:
  wrong-DB refusal, 0600 manifest, tampered-manifest victim survival,
  stale-manifest refusal, **shared-DB denylist** (app_dev/e2e/it
  refused even when confirmed), **create-failure rollback**, scoped
  cleanup. Suite leaves the lane DB empty.
- Mutations (restored byte-identically): concealed→success relabel →
  1 failure; manifest check disabled → 2 failures; coverage check
  weakened → stale/gap tests fail; denylist removed → shared-DB test
  fails.

## Gates

- `verify-local` at the new head — see gate log.
- 27 unit + 7 integration lane tests; typecheck/lint/format/index via
  the gate.

## Not done — the blocked half

- Staging execution: needs the issue-5 stack, a generator host, an
  approved remote-target mechanism, and the hold500 duration/placement
  owner decision. Unresolved acceptance choices: hold500 duration +
  placement, distinct-user definition, CPU-normalization policy,
  write mix if intended.
- The 2-hour soak behavior and long-session cookie behavior are
  unproven — pinning is a workaround, not a diagnosis.
