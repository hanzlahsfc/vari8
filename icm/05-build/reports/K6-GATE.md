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
- Local working-tree `git diff --check` — exit 0 at repair-8. The
  later complete committed-receipt check `git diff --check
2214105..0c3c3d5` exposed 16 whitespace findings, exit 2; those are
  corrected below and the earlier unqualified “diff check 0” claim is
  superseded.
- `npx tsx -e "import('./tools/load/provision.ts')..."` — exit 0;
  import does not execute the CLI (`IMPORT_OK`).

## Disposable PostgreSQL evidence (repair 9, fresh)

Docker remains closed (`docker info` exit 1), so the verification used a
task-owned isolated cluster instead of shared tooling:
`embedded-postgres@16.14.0-beta.17` under
`_evidence/K6-GATE/repair9-pg-20261024-1838`, PostgreSQL **16.14** on
`127.0.0.1:55681`, scratch `pgdata`, and `app_k6_it?schema=public`.
The cluster was stopped and the scratch runtime/data directory removed
after verification. No shared database or service was changed.

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

Docker identity on this host is the compose container **`app-db-1`**:
image `postgres:16-alpine`, project `app`, service `db`, bound to
`127.0.0.1:5433`, volume `app_app-postgres`, healthy. There is no
`vari8-db-1` container; the earlier unblock wording was wrong for this
host. The only adapter used was the previously documented command map
`docker exec vari8-db-1 → docker exec app-db-1`, implemented as an
exported bash function that invokes the real Docker command and preserves
stdout/stderr/exit.

### Parity applicability

D32 says PR-01 gates all 35 canvas screens and “each wiring PR gates the
screens it wires” (`icm/03-plan/DECISIONS.md`). The local gate permits
`SKIP_PARITY=1` only for a card whose contract gates no screens; the
script records that case as a skip because the reference baseline is
host-specific (`icm/05-build/tools/verify-local.sh`).

Issue #178/K6-GATE is local load instrumentation, not a canvas wiring
PR. The complete base-to-head diff contains no rendered UI, styling,
font, asset, public file, `app/`, `components/`, `frontend/`, JSX/TSX,
CSS, image, or font changes. The applicable contract is therefore
**Parity (D32) on: none** — parity is NOT APPLICABLE/SKIPPED, not PASS.

### Runs

An earlier run at `5fbeef3` omitted `SKIP_PARITY`; it reached the real DB
stage and then failed only at `parity regression (D32)`, exit 2. That
run is preserved in `verify-local-canonical.txt`. The failure was a
harness startup defect: `tools/parity/run.mjs` launched production
`next start` with HTTP `BETTER_AUTH_URL`, and the app correctly refused
an HTTP auth origin. This exposed a separate tracking issue (#202); it
was not a visual regression and no parity/auth code was patched.

The applicable canonical invocation at `44bf054` used:

- `SKIP_PARITY=1` (explicit no-screen contract)
- `BASE_SHA=2214105…`
- `LANE_DB=app_k6_gate_skip`
- `LANE_PORT=55682`
- `CARD=K6-GATE`
- `REQUIRE_NODE24=1`
- `VARI8_WORKTREES=/Users/apple/Devin/vari8-worktrees`
- the same real `app-db-1` exec adapter
- private `.env` credentials

`verify-local-canonical.txt` and
`verify-local-canonical-skip-parity.txt` are whitespace-normalized
copies: trailing spaces were removed from 16 log lines and
whitespace-only blank lines were normalized. Command output, ordering,
summaries, counts, verdicts and exit statuses are unchanged. Original
pre-normalization copies are preserved outside the tracked tree at
`_evidence/K6-GATE/verify-local-canonical.raw-0c3c3d5.txt` (SHA-256
`557c3fb5f469673a2d51a750d4712102fe67dcfb1a3c3ef78895e99b27128fba`)
and
`_evidence/K6-GATE/verify-local-canonical-skip-parity.raw-0c3c3d5.txt`
(SHA-256 `f851b3c5bb8ce25e5ab76429201a66f9f2d81bc46467fde75e0f9e8e140eb973`).

`verify-local-canonical-skip-parity.txt`: **VERIFY-LOCAL PASS, exit 0**.
Passed: clean tree, schema guard, program generator, root/frontend
installs, Prisma generate, format/type/lint, root unit tests
(**1250/1250**), frontend lint/tests (**198/198**), disposable migrate
deploy, root/frontend builds, and e2e flow specs (**10 passed / 7
skipped / 0 failed**). Integration was skipped by the script's own
unchanged-path rule (`db/`, `lib/`, `app/api/` unchanged); the separate
focused lifecycle suite above remains **23/23, zero skipped** on real
PostgreSQL and is not counted as canonical integration evidence.
Parity is recorded as `SKIP`, never pass.

Task cleanup was verified through the same adapter: disposable
`app_k6_gate_verify` and `app_k6_gate_skip` are absent after their runs;
pre-existing builder `app_k6_it` remains unchanged. `app-db-1` and other
pre-existing Docker containers were left in their post-Docker-start
configured state; no duplicate or renamed container was created and no
shared database contents were modified.

## Remaining issue-178 acceptance (NOT this lane)

Owner decisions: hold500 duration/placement, distinct-user
definition, CPU normalization, write mix, approved remote-target
mechanism; issue-5 staging stack; generator host; sustained
authenticated-concurrency telemetry (per-scenario tagged VU gauges or
equivalent). Until those exist, the tool reports what it can prove
and nothing more.
