# K6-GATE — issue #178 trial load gate (local instrumentation only)

Head: see `git log` on `beta/k6-gate`. Base: `Vari8-Beta` @
`2214105` (post-#193 merge). **Issue #178 remains OPEN.** Owner scope
decision (PROMPT 387): PR #201 delivers local instrumentation
scaffolding only — it does not satisfy or close the issue, and no
merge is authorized.

## Repair-8 plan (PROMPT 391)

Paths: `tools/load/provision.ts`,
`tests/integration/k6-gate-provision-harness.ts` (new test-only entry),
`tests/integration/k6-gate-provision.test.ts`, `tools/load/README.md`,
this record, and `icm/05-build/reports/k6-gate-mutations/*`.

Planned changes: export the provisioning runner behind a CLI entry
check; inject deterministic lifecycle hooks only through the test
harness; track `CREATE DATABASE` as an explicit pending/created/failed
promise state and make catchable termination await it before dropping
only a successfully created lane; add equivalent signal contracts for
fixture creation and cleanup transaction windows; remove every
`K6_GATE_FAULT` read from the shipping CLI; regenerate mutation diffs
from the final formatted baseline in unique per-mutant evidence
directories; update the report/PR body with fresh-vs-carried evidence.

Acceptance commands: `npx vitest run tests/unit/load-gate.test.ts`;
`npm run typecheck`; `npm run lint`; `npm run format:check`;
`npm run index:check`; `npm run build`; `git diff --check`; disposable
PG focused integration command (`INTEGRATION_DATABASE_URL=... npx vitest
run --config vitest.integration.config.ts
tests/integration/k6-gate-provision.test.ts`) when a database is
available. Docker/PG availability must be probed first; unavailable
infrastructure is reported, never relabeled as fresh.

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
- **Catchable termination is stateful across every tested window**:
  lane-create records `CREATE DATABASE` pending/created/failed and a
  signal waits for the create result before dropping only a lane this
  invocation successfully created; failed/existing CREATE is preserved.
  Fixture create/cleanup wait for their transaction to settle — rollback
  leaves atomic zero-change state, while committed work is completed or
  removed only through the scoped fixture-delete path. SIGKILL/machine
  failure remains a separate residual limit (manual `DROP DATABASE` of
  the lane name).
- **No shipping fault switch**: `provision.ts` exports `main(hooks)`;
  only `tests/integration/k6-gate-provision-harness.ts` injects
  barriers/faults. Normal CLI execution does not read `K6_GATE_FAULT`.
- **Mutation evidence**: regenerated for repair 8 under
  `icm/05-build/reports/k6-gate-mutations/` — exact formatted baseline
  SHA/git blob, one-guard patches from that snapshot, fresh failing logs
  for the three unit-detectable report mutants, apply-to-baseline
  reproduction for all four patches, byte-identical restore, and a green
  unit rerun. The targetId mutant's behavioral disposable-PG bite could
  not be freshly proven without a database; it is marked unavailable,
  not carried as fresh.
- **Preserved-run outcome corrected** (per independent review): on
  the preserved 127-request raw with `LOAD_RESOURCE_INTERVAL_S=4`,
  the current report prints TOOL EXECUTION FAILED (pre-tag manifest,
  1 unexplained request) and RESOURCE COMPLETENESS PASS for all
  metrics — the missing tail falls after the measured window and is
  correctly excluded. The preserved artifacts were later replaced by
  the fresh bounded smoke below; the recorded outcome stands.

## Carried bounded smoke (repair-7 head, k6 v1.3.0, documented sequence)

No fresh k6 smoke was run for repair 8 because workload/report code is
byte-identical to the verified head: `trial-gate.js` git blob
`fad1bc5`, `config.mjs` `10869d3`, `resources.mjs` `c8060c6`, and
`report.mjs` `7aaf93e`; `git diff --quiet HEAD --` those paths exited 0.
The carried sequence was lane-create → provision → sampler
(`LOAD_INTERVAL_S=4`) → k6 `LOAD_PROFILE=smoke` → report
(`LOAD_RESOURCE_INTERVAL_S=4`) → cleanup. Raw reconciliation:
**120 http_reqs = 119 measured + 1 `setup_op:"origin_probe"` point** —
tag verified in the real stream; all 119 workload requests `success`;
manifest `setupOps` matches.

```
TOOL EXECUTION: COMPLETE
RESOURCE COMPLETENESS: all metrics PASS in-window
CAPACITY ACCEPTANCE: UNAVAILABLE
STAGING: NOT PERFORMED
VERDICT: FAIL (capacity unreachable by construction)
```

Lane DB + fixtures dropped; only builder `app_k6_it` remains.

## Preserved-run outcome (127 requests, historical, superseded)

Per independent review at `b435fff`: TOOL EXECUTION FAILED (pre-tag
manifest, 1 unexplained request) and RESOURCE COMPLETENESS PASS
in-window (the missing tail lies after the measured window). The raw
artifacts were subsequently replaced by the 120-request smoke above and
**cannot be reproduced from the builder output directory**; only the
recorded reviewed outcome is retained.

## Verification (Node v24.22.1 via `npx -p node@24.22.1`)

Fresh mechanism/behavior checks, unmasked exits:

- `npm run typecheck` — exit 0.
- `npx vitest run tests/unit/load-gate.test.ts` — exit 0, **46/46**.
- `npm run test` — exit 0, **1250/1250** unit tests.
- `npm run lint` — exit 0, 0 errors / 81 pre-existing warnings.
- `npm run format:check` — exit 0.
- `npm run index:check` — exit 0.
- `npm run build` — exit 0.
- `git diff --check` — exit 0.
- `npx tsx -e "import('./tools/load/provision.ts')..."` — exit 0;
  import does not execute the CLI (`IMPORT_OK`).

Disposable PostgreSQL is **not available** on this host:
`docker info` exits 1 and `INTEGRATION_DATABASE_URL` is unset. The
focused integration command therefore ran under Node 24.22.1 but
reported **22/22 skipped, exit 0**; it created no lane DB and proves
only that the suite parses/skips cleanly. The repair-7 `16/16`
integration result remains carried/superseded context, not fresh
repair-8 evidence.

Added but not freshly executable here: deterministic `SIGTERM`/`SIGINT`
during in-flight `CREATE DATABASE`, CREATE-failure-during-termination,
existing-database refusal, fixture-create transaction signal atomicity,
fixture-cleanup transaction signal completion, and no-unrelated-row
checks. Tested signal windows are exactly: before release of the create
barrier, inside the fixture-create transaction before commit, and
inside the cleanup transaction before commit.

Mutations: report accounting/coverage/bounded-ops mutants fail fresh
unit runs (2/4/1 expected failures, exit 1); all four patches apply to
recorded baselines byte-for-byte and reverse-restore to
`HASHES-IDENTICAL`. The targetId disposable-PG mutant was applied and
restored, but its behavioral bite is explicitly unavailable here (22/22
skipped); prior mut4/integration logs are named `*-superseded.txt`.

`verify-local.sh` was not run: it requires a clean tree plus
`POSTGRES_PASSWORD` and Docker access to `vari8-db-1`; Docker is down
and no password was available. This is a limitation, not a pass.

## Remaining issue-178 acceptance (NOT this lane)

Owner decisions: hold500 duration/placement, distinct-user
definition, CPU normalization, write mix, approved remote-target
mechanism; issue-5 staging stack; generator host; sustained
authenticated-concurrency telemetry (per-scenario tagged VU gauges or
equivalent). Until those exist, the tool reports what it can prove
and nothing more.
