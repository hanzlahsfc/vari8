# VZ-DATA report: gap-matrix data lane

## Delivered

- `viz/extract.py`: stdlib parser. Reads `output/GAP-MATRIX.md` and `F1-card.md`, writes `viz/matrix.json`. Nothing is parsed or edited by hand.
- `viz/matrix.json`: the data contract for the page lane. 338 rows, 12 surface buckets, 30 conflicts, 7 roles rows, 6 parked rows, 82 orphans, delta 323 + 19 - 4 = 338.
- `viz/check_data.py`: independent re-parse of the summary table plus asserts, exit 0.

## Model decisions (read before consuming)

- `surfaces` = S01 to S11 (names taken from the F1-card surface table) plus one bucket `ROLES` named `ROLES decision (round 3)`. S12 is not a status surface: it is the ORPHAN inventory and is carried under `orphans` (count 82), exactly as the contract separates it. `surfaces` ids equal `summary` keys.
- `rows` = status-bearing rows only. The 13 `N/A` findings in the surface tables are excluded (they have no status), so the row count is 338 = 0 WIRED + 26 + 37 + 120 + 118 + 30 + 7.
- `round3` = true on the 19 ids starting `R3-`: 16 on S surfaces (R3-1..R3-15, R3-19) plus R3-23, R3-24, R3-25 on the ROLES bucket. This matches `delta.round3_added` = 19.
- `decision`: CONFLICT rows copy the binding decision from the CONFLICT table (e.g. `#112`, `#115`, `# runtime-gate policy`); ROLES rows get `D10`. No CONFLICT or ROLES row is left without a decision.
- `parked` holds the 6 rows of the Parked appendix. `delta.parked` is 4, the active rows removed from 323 (V3-H4-03, S09-17, V2-H4, S11-23). The other 2 appendix rows (R3-JUDGED G6-102, G6-504) were never active matrix rows, so they are listed but not counted in the arithmetic.
- Element strings are preserved verbatim from the source. That leaves 4 em dashes and 2 en dashes inside quoted UI labels (S01-20, S06-09, S07-21, S02-15, S11-15). They are source data, not authored page prose.

## Self-check

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | `extract.py` regenerates `matrix.json` from source with stdlib only | PASS | `python3 extract.py` writes the file; `rows=338 na_excluded=13 conflicts=30 roles=7 parked=6 orphans=82` |
| 2 | 338 rows | PASS | `check_data.py`: `PASS 338 rows (got 338)` |
| 3 | Every row id unique | PASS | `PASS every row id unique` (338 unique) |
| 4 | Per-surface counts equal the summary table, cell by cell | PASS | 12 `PASS surface Sxx counts == summary table` lines, S01 S45 through ROLES S3 |
| 5 | Per-status totals equal the summary table Total row | PASS | `PASS totals == summary Total {WIRED:0, UNWIRED:26, UNCONFIGURED:37, PARTIAL:120, MISSING:118, CONFLICT:30, ROLES:7, total:338}` |
| 6 | Per-status recount from rows equals totals | PASS | 6 `PASS status <S> recount n == total n` lines |
| 7 | Every CONFLICT and ROLES row has a decision | PASS | `PASS every CONFLICT and ROLES row has a decision (missing: [])` |
| 8 | `conflicts` array covers every CONFLICT row (30), ids match | PASS | `PASS conflicts array 30 == 30`; `PASS conflict ids match CONFLICT rows` |
| 9 | `roles` array covers every ROLES row (7), ids match | PASS | `PASS roles array 7 == 7`; `PASS role ids match ROLES rows` |
| 10 | Orphans count 82 equals items, ids unique | PASS | `PASS orphans 82 (count=82, items=82)` |
| 11 | Delta arithmetic | PASS | `PASS delta 323+19-4 == after == rows` |
| 12 | `surfaces` ids equal `summary` keys | PASS | `PASS surfaces ids == summary keys` |
| 13 | `check_data.py` exits 0 | PASS | `0 failure(s)` then `EXIT=0` |

Full run: `cd output/viz && python3 extract.py && python3 check_data.py` gives all PASS and exits 0.

## Not touched

`viz/template.html`, `viz/build.py`, `viz/gap-matrix.html` belong to the page lane and were not read or written here. Only `viz/extract.py`, `viz/matrix.json`, `viz/check_data.py` and this report exist from this lane.
