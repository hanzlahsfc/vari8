# K6-GATE mutation evidence — final-code baseline (sanitized, task-owned)

Baseline: sha256 of `tools/load/report.mjs` + `tools/load/provision.ts`
at the final repair-7 head (post-format; mutation diffs are guard-disabling line changes — unaffected by the format pass, verified by hash equality and green reruns on the formatted code) (`hashes-before.txt` == `hashes-restored.txt`,
verified `diff` → HASHES-IDENTICAL). Each mutation disables exactly
one guard expression; failing command+exit and output are preserved;
each file restored byte-identically BEFORE the next mutation.

| #   | Guard mutated                                                                     | Diff                            | Failing run                | Result                                                                                                     |
| --- | --------------------------------------------------------------------------------- | ------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1   | HTTP accounting (`unexplained == null \|\| unexplained !== 0`)                    | `mut1-accounting-off.diff`      | `mut1-output.txt` (exit 1) | 2 unit failures: `42+2-login forgery`, `manifest http_reqs disagreeing`                                    |
| 2   | In-window coverage (`pres[0] !== inWin[0].t \|\| pres.at(-1) !== inWin.at(-1).t`) | `mut2-window-coverage-off.diff` | `mut2-output.txt` (exit 1) | 4 unit failures: `first sample`, `contiguous tail`, `pre-run sample cannot mask`, `missing last in-window` |
| 3   | Bounded ops (`!SUPPORTED_SETUP_OPS.includes(op)` on planned)                      | `mut3-bounded-ops-off.diff`     | `mut3-output.txt` (exit 1) | 1 unit failure: `manifest cannot authorize ops`                                                            |
| 4   | Cleanup target binding (`f.targetId !== ws.slug`)                                 | `mut4-targetId-off.diff`        | `mut4-output.txt` (exit 1) | 1 integration failure: `mismatched targetId refuses`                                                       |

Green reruns after byte-identical restore: `rerun-unit-green.txt`
(46/46), `rerun-integration-green.txt` (16/16).

Backups were taken immediately before each mutation and restored
per-mutation — no repair diff was used as a mutation, and no mutation
evidence predates the final code.
