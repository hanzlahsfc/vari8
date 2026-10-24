# K6-GATE — issue #178 trial load gate (test implementation)

Head: see `git log` on `beta/k6-gate`. Base: `Vari8-Beta` @
`2214105` (post-#193 merge).

## Correction to the earlier smoke claim

The first build's "134 requests, 0 errors / VERDICT PASS" was **false**:
the emitted `load_latency` points carried no `class` tag, so the parser
bucketed all of them `unknown` and counted zero failures while the raw
run actually contained 40 refusals (401s), 70 redirects (307 login
bounces) and 19 transport errors — the session cookie's `Expires`
parses to a past instant inside k6's cookie jar
(`expires=-6795364578871`), so auth decayed after the first iteration.
That claim is retracted; the repaired run below is what the tool now
reports.

## Repair round (post-FIX review)

Root causes fixed:

- **False classification** — every `load_latency` point now carries
  `{endpoint, class}`; `classify`/`classifyResponse` moved to a shared,
  k6-free module (`config.mjs`) so tests exercise the same code the
  script runs. Response contract covers structured refusals,
  `ok:false`, and state-based denials (`state:"DENIED"` etc.); 3xx is
  its own `redirect` class (redirects disabled); a 2xx carrying a
  refusal body is `concealed_refusal` and fails the run.
- **Report fail-closed** — zero requests, unclassified points,
  malformed lines, counter-vs-latency disagreement, missing/partial
  resources (CPU/RAM/pg-limit/restart coverage each separately
  required), and an uncollected 500-hold phase all block PASS.
- **Auth repair** — the Set-Cookie value is pinned from sign-in and
  sent explicitly (jar replay was decaying mid-run); the bearer token
  also goes to API routes; `session_verify` must return the fixture
  user's `user.id` before measured traffic starts — a bare 200 is not
  authentication. Auth decay keeps its failed request counted and
  re-authenticates as a separate `reauth` metric.
- **Workload phases** — `gate` is now three named scenarios: `ramp`
  0→750/10m, `hold500` (LOAD_HOLD500_MIN, off by default), `soak`
  250/2h constant hold — the earlier stage list was a 2 h ramp _down_
  from 750, not a soak. Per-scenario report tables. The acceptance
  wording's 500-concurrent pass has no home in the specified profile;
  `hold500` is the exposed choice, and without it the verdict is
  inconclusive by design.
- **Resources** — MiB/GiB memory units (the old parser turned 1.2 GiB
  into 1 MB), docker `RestartCount` / PID `lstart` restart signals,
  process-tree CPU (cputime-delta) + RSS summation for host PID mode,
  `hostCpus` recorded for multicore normalization context.
- **Fixture safety** — `CONFIRM_DISPOSABLE_DB` must equal the
  lane-shaped `DATABASE_URL` db name; cleanup re-validates ownership
  **from the database** (loadgate emails + fixture workspace membership)
  before deleting in one transaction; tampered/stale manifests delete
  nothing; manifests are 0600.
- **Target safety** — remote targets need `LOAD_ALLOW_REMOTE=1` AND
  `LOAD_TARGET_ID` matching the manifest; `setup()` aborts on
  redirect-to-foreign-host; `LOAD_MAX_VUS` must be a finite positive
  integer (NaN no longer bypasses the cap).
- **Honest labeling** — the workload is read traffic; nothing is
  called a "submission".

## Bounded local smoke — repaired run (harness check, NOT the gate)

Production `next start` (flag on), seeded `app_chkenable_live`, TLS
proxy `https://127.0.0.1:3870`; 5 VUs / 30 s, `LOAD_PROFILE=smoke`:

| endpoint       | count | p50  | p95   | p99   |
| -------------- | ----- | ---- | ----- | ----- |
| sign_in        | 5     | 81ms | 105ms | 105ms |
| checkins_page  | 24    | 45ms | 87ms  | 113ms |
| client_home    | 24    | 44ms | 80ms  | 500ms |
| workspace_page | 8     | 45ms | 67ms  | 67ms  |
| client_daily   | 24    | 35ms | 64ms  | 68ms  |
| session        | 32    | 22ms | 44ms  | 105ms |
| clients        | 8     | 23ms | 37ms  | 37ms  |
| session_verify | 5     | 9ms  | 13ms  | 13ms  |

130 requests — **all classified `success` this time** (raw tags
verified against the ndjson directly, not inferred): sessions held
across every iteration; `session_verify` matched each fixture user's
id. Resources sampled: app tree ~0–0.2 % CPU / 44 MB RSS peak, DB
< 9 % CPU, pg connections 11/100, zero restarts.

**VERDICT: FAIL — on exactly one check:** `500-session hold phase
collected` (hold500 off by design in a smoke run). Every measured
check passed; the missing phase correctly blocks PASS. That is the
tool working: the smoke proves the harness, it is not a 500-concurrent
result and never claims one.

## Tests

- `tests/unit/load-gate.test.ts` — 22 tests: classification matrix
  (concealed/state/redirect/transport), target + bounds validation
  (NaN, remote, targetId), acceptance scenario shape (hold not
  ramp-down, hold500 insertion), percentiles, the reviewer's failing
  run shape as a sanitized fixture (must FAIL with 40 refusals +
  70 redirects), counter drift, empty/malformed input, partial
  resources, restart detection, MiB/GiB units, threshold boundary
  (p95=400 fails, 399 passes).
- `tests/integration/k6-gate-provision.test.ts` — 5 tests on real PG
  via the real CLI: wrong-DB refusal, 0600 manifest, **tampered
  manifest deletes nothing (victims survive)**, stale manifest
  refusal, scoped legitimate cleanup.
- Mutations run (restored byte-identically): `p95ms 400→4000` → 4
  failures; concealed→success relabel → 2 failures; missing `class`
  tag → `unclassified` row + FAIL (structural, not a mutation).

## Gates

- `verify-local` at the repair head: see the gate log (unit
  104 files / 1212 + new suites, integration runs — this lane adds a
  `tests/integration` file, e2e 10/7/0, build/migrate/format/lint/
  typecheck/index clean).
- 22 unit + 5 integration tests green; typecheck 0; lint 0 errors and
  zero warnings in lane files.

## Not done — the blocked half

- **Staging execution is not authorized or performed**: no deployed
  stack (issue #5), no separate generator host, no 500-VU or 2 h run.
- The `gate` profile + `hold500` are implemented and config-validated;
  the certification run awaits staging access.
- CPU semantics: docker `CPUPerc` (100 % = one host core) with
  `hostCpus` recorded; PID mode uses process-tree cputime deltas. The
  "CPU < 70 %" acceptance unit is applied to the raw docker
  percentage — multicore normalization policy is a recorded open
  choice, not silently decided.
- `firstSaturated` reports the first failing resource check only when
  resources were actually sampled; otherwise "unavailable".
