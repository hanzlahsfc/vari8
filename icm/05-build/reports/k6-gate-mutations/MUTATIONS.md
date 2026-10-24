# K6-GATE repair-5 mutation evidence (sanitized, task-owned)

Each mutation: exact changed expression (diff), failing run + exit,
byte-identical restore (sha256), green rerun.

| #   | Guard mutated                                             | Change                                | Failing evidence                                                                                                   | Restore               |
| --- | --------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------- |
| 1   | HTTP accounting (`unexplained !== 0`)                     | `mut-accounting+window-coverage.diff` | `mut-unit6.txt` — exit 1, fails: `42+2-login forgery`, `manifest http_reqs disagreeing`                            | `hashes-restored.txt` |
| 2   | In-window metric coverage (first/last in-window presence) | same diff                             | `mut-unit6.txt` — fails: `first sample`, `contiguous tail`, `pre-run sample cannot mask`, `missing last in-window` | same                  |
| 3   | Cleanup targetId binding (`f.targetId !== ws.slug`)       | `mut-targetId-off.diff`               | `mut-int6.txt` — exit 1, fails: `mismatched targetId refuses`, `legitimate cleanup` (cascade)                      | `hashes-restored.txt` |

- `hashes-before.txt` / `hashes-restored.txt` — sha256 of
  `tools/load/report.mjs` + `tools/load/provision.ts`; identical.
- `rerun-unit-green.txt` (45/45) and `rerun-integration-green.txt`
  (15/15) after restore.
- Integration run left zero `app_k6_*`/`app_nomarker_*` residue;
  builder `app_k6_it` untouched.

Mutations were applied with `sed` to single expressions, never
reverted by checkout — the working tree's prior uncommitted state
was preserved (a restore with stale backups is exactly what loses
work; backups were taken immediately before this run).
