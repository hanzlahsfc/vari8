# K6-GATE — issue #178 trial load gate (test implementation)

Head: see `git log` on `beta/k6-gate`. Base: `Vari8-Beta` @
`2214105` (post-#193 merge).

## Retractions

- The first build's "134 requests, 0 errors / VERDICT PASS" was
  **false** (unclassified points + session decay).
- Repair 3's phase checks (80 % duration / 90 % VU peak) were
  **not issue-authoritative** — a single 500-VU spike could pass.
  They are replaced by window/continuity/sustained-concurrency checks
  below, and a capacity verdict is labeled local instrumentation,
  never staging certification.
- Repair 3's integration count (10/10) was **not reproducible** on
  the canonical `?schema=public` URL — the reviewer measured **8/10**
  because the suite's last-path-segment string replacement clobbered
  the schema parameter (a cleanup ran against the wrong DB; the
  reviewer dropped the leaked `app_nomarker_*` DBs). URL parsing now
  preserves every supported component.

## Repair round 4 — measurement trust and positive ownership

- **No peak-based certification** — phase verification uses the
  PLANNED window `[startTime, startTime+duration]`: measured points
  must cover it within 10 s of both edges, show no >30 s interior
  silence, and for constant-vus phases EVERY `vus` gauge sample
  strictly inside the window (5 s drain edges excluded) must be ≥
  planned VUs. A one-sample spike, boundary-contaminated peak and
  truncated run all fail; insufficient telemetry → INCONCLUSIVE.
- **Independent HTTP accounting** — `http_reqs` is counted from raw
  stream points, not manifest totals; manifest http_reqs must equal
  the raw count; `setupReqs` is bounded (≤ 2 — the /login probe) and
  cannot absorb unexplained requests (forged 999 fails).
- **Authorized cadence** — the report takes the expected interval
  from run config (`LOAD_RESOURCE_INTERVAL_S`); the resource file's
  declared interval must equal it (intervalSec=9999 fails), timestamps
  must be strictly increasing (duplicates/out-of-order fail), and
  every mandatory metric must appear in a majority (>50%) of samples
  (first-sample-only fails).
- **lane-init removed** — `lane-create` is the only ownership path
  (create → migrate → marker + 0600 lane file; failure drops only the
  DB it created). `installMarker` refuses to overwrite an existing
  marker. Integration proves: no adoption path exists, unmarked
  pre-existing lane-named DB refused, forged/stale lane files
  refused, victims survive, rollback works, shared names refused.
- **URL parsing** — DB URL derivation uses `new URL`/`pathname`
  everywhere (provision + tests + admin); `?schema=public` and other
  components survive.

## Bounded local smoke — final repaired run (harness check, NOT the gate)

5 VUs / ~33 s, `LOAD_PROFILE=smoke`, real `next start` + https against
a tool-created lane DB (`app_k6_mvm6sx1g16acd1`, dropped after):

```
TOOL EXECUTION: COMPLETE    — manifest+phases proven, counters agree,
                              raw http_reqs == 127 measured + 1 setup
CAPACITY ACCEPTANCE: INCONCLUSIVE (local instrumentation —
                              not staging certification)
                              FAIL only: 500-session hold phase
```

127 requests, all `success` (verified against raw ndjson). The
intermediate run on a fresh flag-off lane honestly reported 25
`http_error` on `checkins_page` → capacity FAIL, not suppressed — the
endpoint is gated by `ENABLE_CHECK_INS` + `APP_ENV=test` (flag name
corrected from my earlier restart env).

## Tests

- `tests/unit/load-gate.test.ts` — **40** tests: classification
  (concealed/state/consent/HTML-on-JSON/login/identity), remote
  disabled, hold500 required, durationToSec, buildManifest planned
  specs incl. executor/startTime, dual verdicts, reviewer replica,
  sustained-hold forgery (1-peak + boundary-contaminated + interior
  silence), forged setupReqs bound, raw-vs-manifest http_reqs, empty
  scenarios, cadence authorization (9999 + mismatched + missing),
  strict timestamp ordering, majority metric coverage, sparse/gap/
  single-sample windows, units.
- `tests/integration/k6-gate-provision.test.ts` — **11** tests on
  real PG with a tool-created lane (canonical `?schema=public` URL):
  no-lane-file refusal, no adoption path, 0600 manifest, tampered-
  manifest victim survival, stale manifest, forged token, stale lane
  file, unmarked pre-existing DB refused, shared denylist, create-
  failure rollback, scoped cleanup. Host verified: zero `app_nomarker_*`
  or lane residue.
- Mutations (restored byte-identically): sustained-hold check off /
  http≤ / cadence-always-valid / ownership skip → 5 unit + 5
  integration failures; concealed→success → 1.

## Gates

- `verify-local` at the new head — see gate log.
- 40 unit + 11 integration lane tests.

## Not done — the blocked half

- Staging execution: needs the issue-5 stack, a generator host, an
  approved remote-target mechanism (remote is disabled
  unconditionally), and owner decisions: hold500 duration/placement,
  distinct-user definition, CPU normalization policy, write mix.
- Local capacity PASS — when achievable — is explicitly not staging
  certification; the tool cannot present it as issue acceptance.
- The 2-hour soak and long-session cookie behavior are unproven.
