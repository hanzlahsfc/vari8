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

## Repair-9 plan (PROMPT 393)

Paths: `tests/integration/k6-gate-provision-harness.ts`,
`tests/integration/k6-gate-provision.test.ts`,
`icm/05-build/reports/k6-gate-mutations/mut4-*`,
this record, `tools/load/README.md`, and `docs/STATUS.md`.

Plan: create a task-owned PostgreSQL 16 environment without Docker by
installing `embedded-postgres@16.14.0-beta.17` into a unique scratch
directory under `_evidence/K6-GATE/`; initialize only loopback storage
there; run it on a free 127.0.0.1 port; export
`INTEGRATION_DATABASE_URL=postgresql://app:<random>@127.0.0.1:<port>/app_k6_it?schema=public`;
and destroy the scratch cluster after verification. Split the CREATE
race proof into (a) an injected pending-promise dependency test, which
controls settlement precisely, and (b) a real SQL-in-flight probe that
polls `pg_stat_activity` for the lane `CREATE DATABASE` before sending
the signal. Repeated signals are asserted to coalesce cleanup.

Acceptance: focused integration suite reports all tests, zero skipped,
exit 0 on canonical `?schema=public`; no `app_k6_*` residue remains;
targetId mutant produces a behavioral failure and reverse-restores
byte-identically; `verify-local.sh` is run if the isolated PG can meet
its explicit contract, otherwise its exact Docker/shared-container
mismatch is recorded without modifying shared machinery.

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

## Disposable PostgreSQL evidence (repair 9, fresh)

Docker remains closed (`docker info` exit 1), so the verification used a
task-owned isolated cluster instead of shared tooling:
`embedded-postgres@16.14.0-beta.17` under
`_evidence/K6-GATE/repair9-pg-20261024-1838`, PostgreSQL **16.14** on
`127.0.0.1:55681`, scratch `pgdata`, and `app_k6_it?schema=public`.
No shared database or service was changed.

Focused command (canonical `?schema=public`):

```bash
INTEGRATION_DATABASE_URL=<local-url> \
  npx vitest run --config vitest.integration.config.ts \
  tests/integration/k6-gate-provision.test.ts
```

`rerun-integration-green.txt`: **23/23 passed, zero skipped, exit 0**.
The suite covers no-lane refusal, no adoption path, 0600 manifest,
targetId mismatch, lane-create write failure, fixture create/cleanup
transaction windows, tampered/stale manifests and lanes, unmarked/shared
database refusal, ownership-bound scoped cleanup, and victim-row
survival. Post-suite residue check returned only builder `app_k6_it` for
`app_k6_%` and no `loadgate_%` databases.

Exact signal-test distinction:

- **Pending-promise control:** `SIGTERM` and `SIGINT` are delivered after
  `create-sql-dispatched` while the injected create promise is held
  before settlement; the opposite signal is then sent before release.
  This proves promise/scope synchronization and repeated-signal
  coalescing, not SQL-in-flight timing.
- **Actual SQL-in-flight probe:** a 2000-table template makes
  `CREATE DATABASE ... TEMPLATE` long enough for `pg_stat_activity` to
  report the exact statement `state='active'`; SIGTERM is then sent
  while PostgreSQL reports it active. The create result is awaited, the
  created lane DB is dropped, the lane file is gone, and exit is
  nonzero.
- **Create failure during termination:** SQL is dispatched, a duplicate
  `CREATE DATABASE` fails, the injected promise is held before
  settlement, repeated signals arrive, and the pre-existing database is
  preserved.
- **Fixture windows:** signals land inside `beforeFixtureCommit` and
  `beforeCleanupCommit`; rollback/compensation and committed cleanup
  are asserted without partial fixture rows or victim changes.

Mutations: report accounting/coverage/bounded-ops mutants fail fresh
unit runs (2/4/1 expected failures, exit 1); all four patches apply to
recorded baselines byte-for-byte and reverse-restore to
`HASHES-IDENTICAL`. The targetId mutant ran the full disposable-PG
suite and produced two behavioral failures (mismatched `targetId`
accepted; subsequent legitimate cleanup failed), exit 1. It was
reverse-restored to blob `a298a892`/SHA-256 `d95bbc5f` and the focused
suite reran green.

## Canonical gate result

`verify-local.sh` was invoked under Node v24.22.1 with
`REQUIRE_NODE24=1`, `BASE_SHA=2214105…`, `LANE_DB=app_k6_it`, and the
script-supported `VARI8_WORKTREES=/Users/apple/Devin/vari8-worktrees`
adapter. `verify-local-repair9.txt` shows clean tree, schema guard,
generator check, installs, Prisma generate, format/type/lint/unit checks,
and frontend checks proceeding before the canonical DB stage. The script
then exits 1 at its hardcoded `docker exec vari8-db-1` step because
Docker Desktop is closed and `vari8-db-1` is unavailable. It also emits a
stale-host `realpath` warning from `program-config.json` (`/home/nexuslink/...`).

This is **not** a canonical pass. The isolated PostgreSQL environment
cannot satisfy that script without replacing its shared container
adapter; no lock, stage, container-name, or Docker behavior was faked.
Exact user action for a canonical run: start Docker Desktop so
`docker info` succeeds, make the approved `vari8-db-1` PostgreSQL
container available on `127.0.0.1:5433`, and rerun the script with the
real `POSTGRES_PASSWORD` from the root `.env` (never printed).

## Remaining issue-178 acceptance (NOT this lane)

Owner decisions: hold500 duration/placement, distinct-user
definition, CPU normalization, write mix, approved remote-target
mechanism; issue-5 staging stack; generator host; sustained
authenticated-concurrency telemetry (per-scenario tagged VU gauges or
equivalent). Until those exist, the tool reports what it can prove
and nothing more.
