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
  acceptance decision), and without a `hold500` phase in the results
  the verdict is inconclusive — never PASS.
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
   setupReqs.
3. `resources.ndjson` — first line `{"type":"meta","intervalSec":N}`
   records the collector's cadence. The report receives the EXPECTED
   cadence from run config (`LOAD_RESOURCE_INTERVAL_S`) — the file
   cannot authorize its own sampling standard — then requires:
   declared == expected, timestamps strictly increasing, samples
   bracketing the run window within 2× interval, no gap > 3× interval,
   count ≥ `floor(window/interval)` (min 2), and every mandatory
   metric present in a majority (>50%) of samples.

The report verifies execution against OBSERVED evidence, not manifest
assertions:

- per-scenario measured points must cover the PLANNED window
  `[startTime, startTime+duration]` within 10 s of both edges, with
  no interior point gap > 30 s
- constant-vus phases (hold500): every `vus` gauge sample strictly
  inside the window (5 s drain edges excluded) must be ≥ planned
  VUs — constant-vus guarantees exactly N, so a single peak can never
  prove a sustained hold; ramping phases carry no VU requirement
- exact HTTP accounting against the RAW stream: `http_reqs` points
  counted independently must equal `load_requests` + a bounded
  `setupReqs` (≤ 2 — the /login probe); manifest http_reqs must equal
  the raw count; any surplus/deficit is unexplained
- `load_requests` counter == measured points
- expected workload endpoints present; auth-only, truncated and
  endpoint-absent runs are inconclusive

And reports THREE independent dispositions:

- **TOOL EXECUTION** — complete / incomplete / failed (the planned run
  happened and is internally consistent).
- **CAPACITY ACCEPTANCE** — pass / fail / inconclusive (measured
  thresholds + mandatory resource coverage + a sustained hold; a local
  capacity verdict is explicitly _not_ staging certification).
- **STAGING CERTIFICATION** — not performed by this tool; requires the
  issue-5 stack, a generator host and an approved remote mechanism.

Exit 0 requires execution COMPLETE and capacity PASS.

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

## Local bounded smoke

```bash
CONFIRM_DISPOSABLE_DB=<lane-db> tsx tools/load/provision.ts create \
  --clients 9 --coaches 3 --out tools/load/out/fixtures.json
k6 run -e TARGET_URL=https://127.0.0.1:PORT \
  -e FIXTURES=$PWD/tools/load/out/fixtures.json \
  -e LOAD_PROFILE=smoke --out json=$PWD/tools/load/out/k6.ndjson \
  tools/load/trial-gate.js
LOAD_APP_PID=<pid> LOAD_DB_CONTAINER=<pg-container> \
  LOAD_PG_DB=<lane-db> node tools/load/resources.mjs \
  > tools/load/out/resources.ndjson   # runs alongside
node tools/load/report.mjs tools/load/out/k6.ndjson \
  tools/load/out/resources.ndjson <durationSec>
CONFIRM_DISPOSABLE_DB=<lane-db> tsx tools/load/provision.ts \
  cleanup --file tools/load/out/fixtures.json
```

## Staging gate (separate, authorized step)

`LOAD_PROFILE=gate` + `LOAD_HOLD500_MIN` for the 500-session
measurement, a generator host separate from the app host,
`resources.mjs` on the app/DB host. Staging deployment, remote
targeting and remote execution enablement are **not** part of this
lane and require a separately approved target mechanism first.
