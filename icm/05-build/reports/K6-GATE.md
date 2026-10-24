# K6-GATE — issue #178 trial load gate (local instrumentation only)

Head: see `git log` on `beta/k6-gate`. Base: `Vari8-Beta` @
`2214105` (post-#193 merge). **Issue #178 remains OPEN.** Owner scope
decision (PROMPT 387): PR #201 delivers local instrumentation
scaffolding only — it does not satisfy or close the issue, and no
merge is authorized.

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

- **Setup operations identified by tag, not URL**: `setup()` emits
  `tags:{setup_op:"origin_probe"}` and the manifest carries the
  bounded `setupOps` plan. Raw `http_reqs` points carrying the tag are
  the ONLY setup operations — an untagged /login, a duplicate probe,
  or an unexpected op name is unexplained traffic and fails the run:
  `raw = measured + observed_setup_ops` and each planned op observed
  exactly once.
- **Per-metric coverage computed INSIDE the run window**: a metric
  must be present in the earliest AND latest in-window sample with no
  contiguous absence > 3× cadence. A fully populated pre-run sample
  cannot mask a missing first in-window metric; out-of-window samples
  count for nothing; no interpolation substitutes old measurements.
- **Cleanup binds target identity**: `manifest.targetId === live
workspace.slug` — a forged manifest cannot retarget another
  fixture set. (`targetId` is user-editable label, documented — not
  production attestation.)
- **Lifecycle failure paths proven**: `K6_GATE_FAULT` (test-only
  hook) injects `marker` (throws before ownership → catch drops only
  the created DB) and `term` (SIGTERM → Node's default handler exits
  WITHOUT running catch → exactly the invocation's DB remains
  residual, its stale lane file still refused, documented manual
  recovery = drop the residual). SIGKILL/machine failure share that
  residual window — no cleanup is promised there; the documented
  recovery is `DROP DATABASE` of the lane name in `lane.json`.
- **Mutation evidence preserved**: `icm/05-build/reports/
k6-gate-mutations/` holds diffs, failing logs+exits, restore
  hashes and green reruns for the accounting, coverage and
  targetId guards.
- **README is executable**: full lane-create → provision → sampler →
  k6 → report (`LOAD_RESOURCE_INTERVAL_S`) → cleanup sequence.
- **Preserved evidence corrected**: the 127-request raw smoke's
  resources.ndjson has app CPU in 10/25 samples, RAM 11, pg 11 — a
  contiguous missing tail; the report shows those FAILs. The raw
  artifacts are preserved in `tools/load/out/` (gitignored). The
  preserved run's setup probe predates the `setup_op` tag, so its
  TOOL EXECUTION now reads incomplete — recorded honestly, artifacts
  untouched.

## Preserved smoke interpretation (127 requests, all success)

TOOL EXECUTION: INCOMPLETE under the tagged-op contract (the
preserved run's setup probe predates `setup_op` tagging — honest).
RESOURCE COMPLETENESS: app CPU/RAM/pg/limit coverage FAIL (contiguous
missing tail — honest sampler gap). CAPACITY: UNAVAILABLE.
STAGING: NOT PERFORMED. VERDICT: FAIL — as every run must read.

## Tests

- Unit **45**: classification, remote-disabled, manifest,
  phase diagnostics, capacity-unreachable, tagged-op accounting
  (untagged/dup/unknown-op forgery), unexplained surplus, in-window
  per-metric coverage (pre-run masking, missing last, interior
  dropout vs long gap, out-of-window-only), cadence authorization,
  ordering, sparse windows, units.
- Integration **15** on canonical `?schema=public`: no-lane-file,
  no-adoption, 0600, targetId mismatch, lane-create write failure,
  marker-fault drop, SIGTERM residual (only own DB + stale lane
  refused), tampered/stale manifest, forged/stale lane, unmarked DB,
  denylist, rollback, scoped cleanup.
- Mutations: accounting/coverage off → 6 unit failures; targetId
  off → 2 integration failures — diffs/logs/hashes in
  `k6-gate-mutations/`; restored byte-identically.
- verify-local: see gate log at commit.

## Remaining issue-178 acceptance (NOT this lane)

Owner decisions: hold500 duration/placement, distinct-user
definition, CPU normalization, write mix, approved remote-target
mechanism; issue-5 staging stack; generator host; sustained
authenticated-concurrency telemetry (per-scenario tagged VU gauges or
equivalent). Until those exist, the tool reports what it can prove
and nothing more.
