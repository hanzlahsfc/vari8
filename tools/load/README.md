# K6-GATE — trial load gate (issue #178)

Executable load-test tooling for the 500-concurrent-session gate. The
100-user local run (`messages.md`, external) stays the baseline only.

## Components

| File            | Purpose                                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `config.mjs`    | Shared, k6-free contract: profiles, target/bounds validation, response classification, `memToMb`. Loaded by the k6 script AND the unit tests.                      |
| `trial-gate.js` | k6 script — `smoke` (bounded local check) and `gate` (ramp 0→750/10 min, 250-VU 2 h soak, optional `hold500` scenario).                                            |
| `provision.ts`  | `loadgate-*` fixture workspace lifecycle — disposable-DB guard, ownership-validated transactional cleanup, 0600 manifest.                                          |
| `resources.mjs` | NDJSON sampler: app/DB CPU (docker % or process-tree cputime delta), RAM (MiB/GiB-aware), pg connections vs limit, restart counts, host core count.                |
| `report.mjs`    | Acceptance table per scenario + verdict. Fail-closed on unclassified points, counter drift, malformed output, missing resources, or an uncollected 500-hold phase. |

## The "500 concurrent" contract

- "Concurrent" = active VUs with live verified sessions. The issue's
  profile (750-VU ramp → 250 soak) never _holds_ 500; the only
  500-concurrent moment is the transient ramp crossover.
  `LOAD_HOLD500_MIN=<n>` inserts a sustained 500-VU window between ramp
  and soak — it is **required** for `LOAD_PROFILE=gate` (the gate
  refuses to run without it: the duration is an unresolved owner
  acceptance decision). Its presence is an execution fact only — the
  untagged global `vus` gauge cannot prove scenario-specific
  authenticated sessions, so it never authorizes capacity PASS.
- Workload is READ traffic only (session/roster APIs + page GETs under
  verified sessions). Nothing here submits data; the issue's
  thresholds cover latency/errors/resources, not a write mix.

## Run evidence contract

Every run must produce three artifacts:

1. `k6.ndjson` — the `--out json` stream; every `load_latency` point
   carries `endpoint`, `class`, `scenario`, `time`.
2. `*-manifest.json` — emitted by `handleSummary` from the PLANNED
   configuration (`PLANNED_SCENARIOS`, captured in init context):
   profile, scenario specs (`planned.vus`/`durationSec`), expected
   workload endpoints, iterations, vusMax, httpReqs, loadRequests,
   and the bounded `setupOps` identity list (`["origin_probe"]`).
   The report reconciles raw `http_reqs` points carrying the
   `setup_op` tag operation-for-operation, AND validates the manifest
   plan against `SUPPORTED_SETUP_OPS` bound in report.mjs — a manifest
   may only plan ops the script supports; an unknown name in either
   direction is a forgery, not setup.
3. `resources.ndjson` — first line `{"type":"meta","intervalSec":N}`
   records the collector's cadence. The report receives the EXPECTED
   cadence from run config (`LOAD_RESOURCE_INTERVAL_S`) — the file
   cannot authorize its own sampling standard — then requires:
   declared == expected, timestamps strictly increasing, samples
   bracketing the run window within 2× interval, no gap > 3× interval,
   count ≥ `floor(window/interval)` (min 2), and every mandatory
   metric with time coverage — present in the first AND last in-window
   sample AND no contiguous absence span > 3× interval (a missing tail
   is a real gap; majority presence is not coverage).

The report verifies execution against OBSERVED evidence, not manifest
assertions (all phase rules are builder-chosen EXECUTION DIAGNOSTICS,
labeled as such — they flag truncated/interrupted runs and carry no
issue acceptance authority):

- per-scenario measured points must cover the PLANNED window
  `[startTime, startTime+duration]` within 10 s of both edges, with
  no interior point gap > 30 s — diagnostics only, not acceptance
- exact HTTP accounting against the RAW stream: every `http_reqs`
  point must be either a measured workload point or a `setup_op`-
  tagged setup request — `raw = measured + observed_setup_ops`
  exactly, and each planned op must be observed exactly once; a
  surplus of even one request (or an untagged /login) is unexplained
  and fails
- `load_requests` counter == measured points
- expected workload endpoints present; auth-only, truncated and
  endpoint-absent runs are inconclusive

And reports three dispositions — capacity certification is OFF:

- **TOOL EXECUTION** — complete / incomplete / failed (the planned run
  happened and is internally consistent — script completion only).
- **RESOURCE COMPLETENESS** — per-metric evidence quality (measured,
  not a verdict).
- **CAPACITY ACCEPTANCE: UNAVAILABLE** — `pass`/`fail`/`inconclusive`
  is replaced by unreachable UNAVAILABLE: the untagged global `vus`
  gauge cannot prove sustained scenario-specific AUTHENTICATED
  concurrency, and the owner acceptance configuration (hold duration/
  placement, distinct users, CPU normalization, write mix, approved
  staging mechanism) is unresolved. No synthetic or real input can
  produce CAPACITY PASS.
- **STAGING: NOT PERFORMED** — printed explicitly; requires the
  issue-5 stack, a generator host and an approved remote mechanism.

The tool exits nonzero on every run — it cannot self-certify.

## Safety contract

- `TARGET_URL` explicit; **remote execution is disabled in this
  lane** — no non-loopback target runs, regardless of
  `LOAD_ALLOW_REMOTE`. An approved remote-target mechanism (staging
  identity/attestation) is a separate prerequisite recorded in the
  issue before any staging execution.
- `LOAD_MAX_VUS` must be a finite positive integer and caps every
  scenario; malformed values abort at init.
- Fixture users (`@loadgate.invalid`) in one `loadgate-*` workspace;
  cleanup re-validates ownership from the database — a tampered
  manifest deletes nothing — and runs as one transaction. Provisioning
  is transactional and post-commit failures roll the fixture rows back.
- Positive lane ownership, exactly one path: `lane-create` builds a
  fresh `app_k6_*` database end-to-end (create, migrate, marker row +
  0600 `lane.json`). There is no adoption path — no command installs
  or overwrites a marker on an existing database; a failed
  `lane-create` drops only the database that invocation made.
  `create`/`cleanup` require the live marker to equal the lane file —
  a forged manifest, forged lane file, stale lane file, or an
  arbitrary pre-existing `app_*` database without the marker is
  refused. (The lane name must still pass the shape check + shared
  denylist: `app_dev`, `app_e2e`, `app`, `postgres`,
  `app_integration_test` — defense in depth, not ownership.)
- Manifests carry random fixture passwords — written mode 0600,
  deleted by cleanup, `tools/load/out/` gitignored.

## Response classification (shared contract)

Every `load_latency` point carries `endpoint` + `class` tags:
`success` | `refusal` (structured `{error.code}`/`{ok:false}`/
state-denial body on non-2xx) | `concealed_refusal` (2xx + refusal
body — fails the run) | `redirect` (3xx — redirects are disabled;
auth loss surfaces here) | `http_error` | `transport` |
`unexpected_html` (non-JSON body on a JSON endpoint) | `login_page`
(served login form — broken auth, not a page success) |
`identity_mismatch` (session names a different/unknown user).

Session handling: the Set-Cookie value captured at sign-in is sent
explicitly on every measured request plus the bearer token the API
routes accept — a workaround for the jar-side session decay observed
in the first smoke (exact jar expiry behavior unverified; no root-cause
claim). `session_verify` must return the fixture user's `user.id`
before traffic starts — a 200 alone is not authentication; a wrong id
is a measured `identity_mismatch`, including after re-authentication.
Auth decay keeps its failed request counted and re-authenticates as a
separate `reauth` metric.

## Local bounded smoke (complete, documented sequence)

```bash
# 1. Create a task-owned lane database — the ONLY ownership path.
DATABASE_URL=<admin-url> tsx tools/load/provision.ts lane-create \
  --lane tools/load/out/lane.json
#    → writes the lane file (0600) and prints the lane DB name;
#      on failure it drops only the database it created.

# 2. Provision fixtures into the lane (DATABASE_URL must be the lane).
DATABASE_URL=<lane-url> CONFIRM_DISPOSABLE_DB=<lane-db> \
  tsx tools/load/provision.ts create \
  --clients 9 --coaches 3 --out tools/load/out/fixtures.json \
  --lane tools/load/out/lane.json

# 3. Run the bounded smoke while the sampler watches the app/DB.
LOAD_APP_PID=<pid> LOAD_DB_CONTAINER=<pg-container> \
  LOAD_PG_DB=<lane-db> LOAD_INTERVAL_S=4 node tools/load/resources.mjs \
  > tools/load/out/resources.ndjson   # runs alongside
k6 run -e TARGET_URL=https://127.0.0.1:PORT \
  -e FIXTURES=$PWD/tools/load/out/fixtures.json \
  -e LOAD_PROFILE=smoke --out json=$PWD/tools/load/out/k6.ndjson \
  -e LOAD_SUMMARY_OUT=$PWD/tools/load/out/summary.json \
  tools/load/trial-gate.js

# 4. Report — the expected cadence must come from RUN CONFIG, and the
#    run manifest is required for the execution checks.
LOAD_RESOURCE_INTERVAL_S=4 node tools/load/report.mjs \
  tools/load/out/k6.ndjson tools/load/out/resources.ndjson \
  tools/load/out/summary-manifest.json <durationSec>

# 5. Cleanup — bound to lane ownership + manifest targetId.
DATABASE_URL=<lane-url> CONFIRM_DISPOSABLE_DB=<lane-db> \
  tsx tools/load/provision.ts cleanup \
  --file tools/load/out/fixtures.json --lane tools/load/out/lane.json
```

Catchable `SIGTERM`/`SIGINT` behavior is explicit by lifecycle window:

- `lane-create` tracks `CREATE DATABASE` as pending/created/failed. A
  signal during the pending window stops later provisioning, waits for
  the create promise, drops the DB only when this invocation's create
  succeeded, removes only the lane file this invocation wrote, and exits
  nonzero. A failed or already-existing database is never dropped.
- A signal during the later lane file/migrate/marker windows waits for
  that tracked operation to settle, then performs the same own-DB
  cleanup and exits nonzero.
- Fixture `create` runs in one transaction. A signal during it waits
  for commit/rollback: rollback leaves zero fixture rows; a committed
  transaction is immediately removed by the same scoped fixture-delete
  transaction. The manifest is removed only if this invocation wrote it.
- Fixture `cleanup` likewise waits for its deletion transaction. A
  rolled-back transaction leaves fixture+manifest intact; a committed
  transaction completes the scoped deletion by removing the manifest.
- `SIGKILL`, machine failure, or an equivalent uncatchable stop cannot
  run these handlers. The only documented residual is exactly that
  invocation's `app_k6_*` lane DB if the failure happens after a
  successful `CREATE DATABASE`; its stale lane file still refuses all
  fixture commands. Manual recovery: `DROP DATABASE "<lane.dbName from
lane.json>"`.

The shipping CLI has no fault-injection switch and never interprets
`K6_GATE_FAULT`. Deterministic lifecycle failures/synchronization live
only in `tests/integration/k6-gate-provision-harness.ts`, which injects
`ProvisionHooks` into the exported runner for the disposable-PG suite.
The suite separately covers an injected pending create promise (promise
scope/repeated-signal control) and a real `CREATE DATABASE` observed
`state='active'` in `pg_stat_activity` (SQL-in-flight timing).

The report always prints three dispositions: TOOL EXECUTION
(complete/incomplete/failed — script ran its plan), RESOURCE
COMPLETENESS (evidence-quality checks), and CAPACITY ACCEPTANCE:
UNAVAILABLE — certification requires owner acceptance configuration
plus authenticated-concurrency telemetry this tool does not have, so
capacity PASS is unreachable by construction. STAGING: NOT PERFORMED
is explicit.

## Staging gate (separate, authorized step)

`LOAD_PROFILE=gate` + `LOAD_HOLD500_MIN` for the 500-session
measurement, a generator host separate from the app host,
`resources.mjs` on the app/DB host. Staging deployment, remote
targeting and remote execution enablement are **not** part of this
lane and require a separately approved target mechanism first.
