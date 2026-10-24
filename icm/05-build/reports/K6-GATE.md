# K6-GATE — issue #178 trial load gate (test implementation)

Head: see `git log` on `beta/k6-gate`. Base: `Vari8-Beta` @
`2214105` (post-#193 merge).

## Retractions

- The first build's "134 requests, 0 errors / VERDICT PASS" was
  **false** (unclassified points + session decay).
- The first repair's cookie claim ("jar computes `Expires` as a past
  instant") was **unverified** — pinning is a workaround, not a
  diagnosis. Two-hour session behavior is unproven.

## Repair round 3 — independently verifiable completeness

- **Dual verdicts** — `report.mjs` now reports `TOOL EXECUTION`
  (complete / incomplete / failed) and `CAPACITY ACCEPTANCE`
  (pass / fail / inconclusive) independently. A completed smoke keeps
  capacity INCONCLUSIVE; missing acceptance configuration can never
  become capacity PASS.
- **Proven, not asserted, execution** — the manifest now carries the
  PLANNED scenario specs (`planned.vus`/`durationSec` per phase, from
  `PLANNED_SCENARIOS` captured in init context — the earlier
  `scenarios: []` bug was k6's options normalization). The report
  verifies each planned scenario against OBSERVED evidence: measured-
  point time extent ≥ 80 % of planned duration, and the `vus` gauge
  max inside that scenario's window ≥ 90 % of planned VUs. The
  reviewer's one-VU one-point `hold500` forgery fails both.
- **Exact HTTP accounting** — `http_reqs == load_requests + setupReqs`
  (setup probe + sign-in + session checks + workload + reauth are all
  measured requests). The `httpReqs=999` surplus probe fails.
- **Declared sampling cadence** — `resources.mjs` emits
  `{"type":"meta","intervalSec":N}`; coverage requires samples
  bracketing the run window within 2× interval, no gap > 3× interval,
  and ≥ `floor(window/interval)` (min 2). One-sample, two-sample and
  the preserved 9m39s-suspension file all fail.
- **Auth** — `sign_in` must be JSON-classified success AND produce a
  session artifact (cookie or bearer); a 200 without either is
  `identity_mismatch`. Every `session`/`session_verify` hit re-checks
  `user.id` — a wrong identity is a failure any time, including after
  reauth.
- **Positive lane ownership** — `lane-create` builds `app_k6_*`
  end-to-end; `lane-init` installs a `_k6_lane_ownership` marker row
  inside the database plus a 0600 `lane.json`. `create`/`cleanup`
  require the live marker == the lane file token AND the confirmed
  lane name (denylist retained). Forged manifests/lane files, stale
  lanes and unmarked pre-existing `app_*` databases are refused.
- **hold500 is required config, not optional** — the gate profile
  refuses without `LOAD_HOLD500_MIN` (unresolved owner decision), and
  capacity needs the phase OBSERVED at ≥ 450 VUs for ≥ 80 % of its
  planned duration.

## Bounded local smoke — final repaired run (harness check, NOT the gate)

5 VUs / ~33 s, `LOAD_PROFILE=smoke`, real `next start` + https:

```
TOOL EXECUTION: COMPLETE    — 5/5 checks (manifest+phases proven,
                              counters agree, httpReqs==load+setup)
CAPACITY ACCEPTANCE: INCONCLUSIVE — 15 measured checks pass;
                              FAIL only: 500-session hold phase
```

123 requests, all `success` (verified against raw ndjson). Per-endpoint:
sign_in p95 166ms, pages p95 ≤ 93ms, session API p95 34ms. Resources:
peak 3.4 % cpu units (0.4 % host share), 33 MB app RSS, pg 13/100,
restarts 0, interval 4 s.

The earlier truncated-sampler run is preserved as positive evidence:
12 samples ending 20 s before run end correctly fails
"resource samples cover the run window."

## Tests

- `tests/unit/load-gate.test.ts` — **33** tests: classification
  (concealed/state/consent/HTML-on-JSON/login/identity), remote
  disabled unconditionally, hold500 required, durationToSec,
  buildManifest planned specs, dual verdicts (smoke →
  execution-complete + capacity-inconclusive; breach → fail), reviewer-
  replica (40 refusals/70 redirects → FAIL), hold500 forgery (vus +
  duration observed), http surplus accounting, empty scenarios,
  missing endpoints/iterations, cadence/window/gap/single-sample
  coverage, partial metrics, units.
- `tests/integration/k6-gate-provision.test.ts` — **10** tests on real
  PG: confirm-guard refusal, 0600 manifest, tampered-manifest victim
  survival, stale-manifest refusal, **pre-existing unmarked DB
  refused**, **forged lane token refused**, **stale lane file
  refused**, shared-name denylist, create-failure rollback, scoped
  cleanup. Lane DB verified empty after the suite.
- Mutations (restored byte-identically): vus-check off / http≥ / skip
  min-samples / skip ownership → 6 unit + 3 integration failures;
  concealed→success → 1 failure.

## Gates

- `verify-local` at the new head — see gate log.
- 33 unit + 10 integration lane tests; typecheck/lint/format/index via
  the gate.

## Not done — the blocked half

- Staging execution: needs the issue-5 stack, a generator host, an
  approved remote-target mechanism (remote is disabled
  unconditionally), and owner decisions: hold500 duration/placement,
  distinct-user definition, CPU normalization policy, write mix.
- The 2-hour soak and long-session cookie behavior are unproven.
