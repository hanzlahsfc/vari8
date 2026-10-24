# K6-GATE mutation evidence — repair-8 final baseline (sanitized, task-owned)

Baseline was frozen AFTER the repair-8 functional changes and Prettier pass.
`hashes-before.txt` and `baseline-blobs.txt` record the exact source SHA-256 and
Git blob IDs. Each `.diff` was generated between that frozen snapshot and a
single-line guard mutant — never from an older committed repair diff. Applying
each patch to its recorded baseline reproduced the mutant byte-for-byte
(`mut*-apply-proof.txt`). Restoration used explicit reverse application of the
same patch, not checkout/reset; `hashes-restored.txt` matches the baseline
(`restore-proof.txt`: HASHES-IDENTICAL).

Per-mutation scratch roots were unique and explicit:
`_evidence/K6-GATE/repair8-mutations-20261024-1806/mut*/repo/tools/load/*`.
No generic `/tmp` backup and no destructive checkout restoration was used.

| #   | Guard mutated                                                                     | Patch                           | Command / exit                                        | Result                                                                                                      |
| --- | --------------------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | HTTP accounting (`unexplained == null \|\| unexplained !== 0`)                    | `mut1-accounting-off.diff`      | `npx vitest run tests/unit/load-gate.test.ts`, exit 1 | 2 unit failures: `42+2-login forgery`, `manifest http_reqs disagreeing`                                     |
| 2   | In-window coverage (`pres[0] !== inWin[0].t \|\| pres.at(-1) !== inWin.at(-1).t`) | `mut2-window-coverage-off.diff` | `npx vitest run tests/unit/load-gate.test.ts`, exit 1 | 4 unit failures: `first sample`, `contiguous tail`, `pre-run sample cannot mask`, `missing last in-window`  |
| 3   | Bounded ops (`!SUPPORTED_SETUP_OPS.includes(op)` on planned ops)                  | `mut3-bounded-ops-off.diff`     | `npx vitest run tests/unit/load-gate.test.ts`, exit 1 | 1 unit failure: `manifest cannot authorize ops`                                                             |
| 4   | Cleanup target binding (`f.targetId !== ws.slug`)                                 | `mut4-targetId-off.diff`        | focused disposable-PG command attempted               | **Not fresh-proven:** Docker daemon unavailable and `INTEGRATION_DATABASE_URL` unset; 22/22 skipped, exit 0 |

Post-restore focused unit rerun: `rerun-unit-green.txt` (46/46, exit 0).
Post-restore disposable-PG integration command:
`rerun-integration-unavailable.txt` (22/22 skipped, exit 0; no DB was created
or changed). The repair-7 integration logs are retained only as explicitly
superseded context in `mut4-output-superseded.txt` and
`rerun-integration-green-superseded.txt`; they are not relabeled as fresh
repair-8 evidence.

The repair-7 mutation diffs are superseded because they were generated from
older committed blobs and mixed the repair delta with the guard mutation. The
current patches contain only the intended one-line guard change.
