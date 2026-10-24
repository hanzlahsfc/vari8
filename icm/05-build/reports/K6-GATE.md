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

- **Setup ops tagged AND code-bounded**: `setup()` emits
  `tags:{setup_op:"origin_probe"}`; `SUPPORTED_SETUP_OPS` is bound in
  report.mjs — a manifest `setupOps:["evil"]` fails even with a
  matching raw tag; missing/surplus/duplicate/unknown ops all fail;
  `raw = measured + tagged_setup_ops` exactly. URL matching is gone.
- **Per-metric coverage computed INSIDE the run window**: earliest
  AND latest in-window sample must carry each metric, no contiguous
  absence > 3× cadence, no interpolation; pre-run samples cannot mask
  missing in-window metrics.
- **Cleanup binds target identity**: `manifest.targetId === live
workspace.slug`. (`targetId` is a user-editable label — not
  production attestation.)
- **Catchable termination handled**: lane-create installs
  SIGTERM/SIGINT handlers that stop provisioning, drop only the
  created DB and exit nonzero — integration-proven with zero residue.
  SIGKILL/machine failure remains the documented residual window
  (manual `DROP DATABASE` of the lane name).
- **Fault hooks test-gated**: `K6_GATE_FAULT` is honored ONLY with
  `NODE_ENV=test` + `CONFIRM_DISPOSABLE_DB` — inert in a normal
  lane-create (integration-proven).
- **Mutation evidence**: `icm/05-build/reports/k6-gate-mutations/`
  — final-code baseline hash, four guard-disable diffs, failing
  logs+exits, byte-identical restore (HASHES-IDENTICAL), green
  reruns.
- **Preserved-run outcome corrected** (per independent review): on
  the preserved 127-request raw with `LOAD_RESOURCE_INTERVAL_S=4`,
  the current report prints TOOL EXECUTION FAILED (pre-tag manifest,
  1 unexplained request) and RESOURCE COMPLETENESS PASS for all
  metrics — the missing tail falls after the measured window and is
  correctly excluded. The preserved artifacts were later replaced by
  the fresh bounded smoke below; the recorded outcome stands.

## Fresh bounded smoke (repair-7 head, k6 v1.3.0, documented sequence)

lane-create → provision → sampler (`LOAD_INTERVAL_S=4`) → k6
`LOAD_PROFILE=smoke` → report (`LOAD_RESOURCE_INTERVAL_S=4`) →
cleanup. Raw reconciliation: **120 http_reqs = 119 measured +
1 `setup_op:"origin_probe"` point** — tag verified in the real
stream; all 119 workload requests `success`; manifest `setupOps`
matches.

```
TOOL EXECUTION: COMPLETE
RESOURCE COMPLETENESS: all metrics PASS in-window
CAPACITY ACCEPTANCE: UNAVAILABLE
STAGING: NOT PERFORMED
VERDICT: FAIL (capacity unreachable by construction)
```

Lane DB + fixtures dropped; only builder `app_k6_it` remains.

## Preserved-run outcome (127 requests, historical)

Per independent review at `b435fff`: TOOL EXECUTION FAILED (pre-tag
manifest, 1 unexplained request) and RESOURCE COMPLETENESS PASS
in-window (the missing tail lies after the measured window). The raw
artifacts were subsequently replaced by the fresh smoke above; the
recorded outcome stands.

## Tests

- Unit **46**: classification, remote-disabled, manifest,
  phase diagnostics, capacity-unreachable, tagged+code-bounded op
  accounting (untagged/dup/unknown/forged-op forgery), unexplained
  surplus, in-window per-metric coverage, cadence authorization,
  ordering, sparse windows, units.
- Integration **16** on canonical `?schema=public`: no-lane-file,
  no-adoption, 0600, targetId mismatch, lane-create write failure,
  marker-fault drop, SIGTERM handled (zero residue, nonzero exit),
  fault-hook inertness outside test context, tampered/stale manifest,
  forged/stale lane, unmarked DB, denylist, rollback, scoped cleanup.
- Mutations: accounting/coverage/bounded-ops/targetId off → 2+4+1
  unit + 1 integration failures — diffs/logs/hashes in
  `k6-gate-mutations/`; restored byte-identically.
- verify-local: see gate log at commit.

## Remaining issue-178 acceptance (NOT this lane)

Owner decisions: hold500 duration/placement, distinct-user
definition, CPU normalization, write mix, approved remote-target
mechanism; issue-5 staging stack; generator host; sustained
authenticated-concurrency telemetry (per-scenario tagged VU gauges or
equivalent). Until those exist, the tool reports what it can prove
and nothing more.
