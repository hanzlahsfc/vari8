# K6-GATE — issue #178 trial load gate (test implementation)

Head: see `git log` on `beta/k6-gate`. Base: `Vari8-Beta` @
`2214105` (post-#193 merge). **Issue #178 remains OPEN — this lane
delivers safe local instrumentation only.**

## Capacity certification: unavailable by construction

Repair 5 removes every capacity-pass path. The report prints:

```
TOOL EXECUTION: complete|incomplete|failed   (script ran its plan)
RESOURCE COMPLETENESS: per-metric checks     (evidence quality)
CAPACITY ACCEPTANCE: UNAVAILABLE             (unreachable)
STAGING: NOT PERFORMED
VERDICT: FAIL (nonzero always)
```

Reasons capacity PASS is unreachable: (a) the untagged global `vus`
gauge cannot prove sustained, scenario-specific **authenticated**
concurrency — even a perfect all-500 series proves nothing; (b) the
owner acceptance configuration (hold duration/placement, distinct
users, CPU normalization, write mix, approved staging mechanism) is
unresolved. No synthetic or real input can produce CAPACITY PASS;
`verdict.pass` is a hard `false`. The 10s/30s phase rules are now
explicitly labeled builder-chosen **execution diagnostics** — they
flag truncated/interrupted runs and carry no acceptance authority.

## Other repairs

- **HTTP accounting is URL-exact**: every raw `http_reqs` point must
  be a measured workload point or an OBSERVED `/login` setup probe —
  `raw = measured + observed_setup` exactly, and the manifest's
  declared `setupReqs` must equal the observed setup count. The
  reviewer's 44-raw/42-measured/`setupReqs:2` forgery fails; honest
  accounting passes.
- **Per-metric time coverage**: each mandatory metric must be present
  in the first AND last in-window sample with no contiguous absence
  span > 3× cadence — the first-4-of-7 contiguous tail fails; a brief
  interior dropout passes; majority presence is gone.
- **Cleanup binds target identity**: `manifest.targetId === live
workspace.slug` — a forged manifest cannot retarget another
  fixture set. (`targetId` is user-editable label, documented — not
  production attestation.)
- **lane-create failure paths tested**: lane-file write failure
  drops only the DB that invocation created (verified via pg_database
  diff); no adoption path exists; markers are never overwritten.
- **README is executable**: full lane-create → provision → sampler →
  k6 → report (`LOAD_RESOURCE_INTERVAL_S`) → cleanup sequence.
- **Preserved evidence corrected**: the 127-request raw smoke's
  resources.ndjson has app CPU in 10/25 samples, RAM 11, pg 11 — a
  contiguous missing tail. The prior claim "only hold500 missing"
  was FALSE; under per-metric coverage the report correctly shows
  FAIL on app CPU / RAM / pg connections / pg limit coverage. The
  raw artifacts are preserved in `tools/load/out/` (gitignored).

## Preserved smoke interpretation (127 requests, all success)

TOOL EXECUTION: COMPLETE — manifest, phases, counters, raw accounting
all consistent. RESOURCE COMPLETENESS: app CPU/RAM/pg/limit coverage
FAIL (PID sampler intermittently missed the process tree — honest
instrumentation gap). CAPACITY: UNAVAILABLE. STAGING: NOT PERFORMED.
VERDICT: FAIL — and no corrected sampler could change that outcome
without owner acceptance configuration.

## Tests

- Unit **42**: classification, remote-disabled, manifest,
  phase diagnostics (coverage/silence/forged-peak-ignored),
  capacity-unreachable, 44/42/2 forgery, unexplained surplus,
  per-metric coverage (first-sample-only, contiguous tail, interior
  dropout vs long gap), cadence authorization, ordering, sparse/single
  sample windows, units.
- Integration **13** on canonical `?schema=public`: no-lane-file,
  no-adoption, 0600, targetId mismatch, lane-create failure drops only
  own DB, tampered/stale manifest, forged/stale lane, unmarked DB,
  denylist, rollback, scoped cleanup.
- Mutations: accounting off / tail-coverage off → 4 unit failures;
  targetId off → 2 integration failures (refusal test + cascade);
  restored byte-identically.
- verify-local: see gate log at commit.

## Remaining issue-178 acceptance (NOT this lane)

Owner decisions: hold500 duration/placement, distinct-user
definition, CPU normalization, write mix, approved remote-target
mechanism; issue-5 staging stack; generator host; sustained
authenticated-concurrency telemetry (per-scenario tagged VU gauges or
equivalent). Until those exist, the tool reports what it can prove
and nothing more.
