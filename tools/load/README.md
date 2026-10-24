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

- "Concurrent" = active VUs with live sessions. The issue's profile
  (750-VU ramp → 250 soak) never _holds_ 500; the only 500-concurrent
  moment is the transient ramp crossover. `LOAD_HOLD500_MIN=<n>`
  inserts a sustained 500-VU window between ramp and soak — required
  for the certification verdict; absent → "not collected", not PASS.
- Workload is READ traffic only (session/roster APIs + page GETs under
  verified sessions). Nothing here submits data; the issue's
  thresholds cover latency/errors/resources, not a write mix.

## Safety contract

- `TARGET_URL` explicit; non-loopback requires `LOAD_ALLOW_REMOTE=1`
  **and** `LOAD_TARGET_ID` equal to the fixture manifest's `targetId`.
  `setup()` aborts if the target redirects to another host.
- `LOAD_MAX_VUS` must be a finite positive integer and caps every
  scenario; malformed values abort at init.
- Fixture users (`@loadgate.invalid`) in one `loadgate-*` workspace;
  cleanup re-validates ownership from the database — a tampered
  manifest deletes nothing — and runs as one transaction.
- `provision.ts` refuses any database that isn't a confirmed lane
  (`DATABASE_URL` name must be a `app_*`/`test_*`/`*_it`/`*_review`
  lane AND equal `CONFIRM_DISPOSABLE_DB`).
- Manifests carry random fixture passwords — written mode 0600,
  deleted by cleanup, `tools/load/out/` gitignored.

## Response classification (shared contract)

Every `load_latency` point carries `endpoint` + `class` tags:
`success` | `refusal` (structured `{error.code}`/`{ok:false}`/
state-denial body on non-2xx) | `concealed_refusal` (2xx + refusal
body — fails the run) | `redirect` (3xx — redirects are disabled;
auth loss surfaces here) | `http_error` | `transport`.

Session cookies are pinned from the sign-in `Set-Cookie` value because
k6's jar computes the `Expires` as a past instant and drops them
mid-run; the bearer token goes to API routes too. `session_verify`
must return the fixture user's `user.id` before traffic starts —
a 200 alone is not authentication. Auth decay keeps its failed
request counted and re-authenticates as a separate `reauth` metric.

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
measurement, `LOAD_ALLOW_REMOTE=1` + `LOAD_TARGET_ID`, a generator
host separate from the app host, `resources.mjs` on the app/DB host.
Staging deployment and remote targeting are **not** part of this
lane.
