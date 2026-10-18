# Round 3 judge brief (J-R3)

You are the judge, not a producer. Six lanes (G1 to G6) went looking for canvas elements, rules and runtime states that the gap matrix missed. Decide which of their new rows are real, which duplicate each other or existing rows, and which are wrong. Judge claim by claim from source, never by lane, model or confidence.

All paths under `/home/nexuslink/NEXUS_AI_CENTER/04_PROJECTS/Vari8/` unless absolute. Read first: `icm/02-gap-matrix/CONTEXT.md` (status meanings), `icm/02-gap-matrix/R3-brief.md` (what the lanes were told), `icm/03-plan/DECISIONS.md` (binding; D10 roles, D12 consent parked).

## Inputs

- Lane reports: `icm/02-gap-matrix/output/R3/G1.md` to `G6.md` (G4 rows also in `R3/G4-rows-final.md`; G6 parts in `R3/G6-part-*.md`). Census scripts and raw outputs sit next to them.
- Existing coverage: `icm/02-gap-matrix/output/F1/GAP-MATRIX.md` and `F1/S01..S12-*.md`, `icm/02-gap-matrix/output/V/V1..V3-*.md`.
- Source, read-only: `/home/nexuslink/vari8-worktrees/merge-proto` (canvas `frontend/`, backend at root, HEAD `58eb6ed`).

## Method

1. Collect every new row from G1 to G6 into one list with its lane id. Record the count per lane.
2. Deduplicate: rows from two lanes that name the same element merge into one (keep both lane ids). Rows that duplicate an existing F1 or V row become DUP-EXISTING with the existing row id.
3. Verify from source. Open both citations (canvas and backend) for: every CONFLICT row, every row two lanes disagree on, and a random sample of at least 25 percent of the rest (at least 3 per lane). Verdict per checked row: CONFIRMED, CORRECTED (give the right status and cite), or REJECTED (give the evidence).
4. If more than 1 in 5 sampled rows of a lane are REJECTED or CORRECTED, check every row of that lane.
5. Relabel per the decisions. A CONFLICT whose only basis is `docs/security/authorization-model.md` or an RBAC grant becomes a `ROLES` decision row (D10). A CONFLICT or row driven only by consent, health-data storage or data protection goes to `PARKED-D12`.
6. G4 says its 1328 dismissals were double-read by the same model family. Re-read a random 40 of them from source and report how many should have been rows.

## Output

`icm/02-gap-matrix/output/R3/R3-JUDGED.md`, written incrementally:

- Summary: rows in per lane, after dedupe, DUP-EXISTING, CONFIRMED, CORRECTED, REJECTED, ROLES, PARKED-D12, with the arithmetic shown.
- Table of every surviving row: `| id | lanes | surface | element | status | canvas path:line | backend path:line or none (searched: ...) | judge check |` where judge check is CONFIRMED, CORRECTED, or UNSAMPLED.
- Rejected and DUP-EXISTING lists with evidence.
- Per-lane reliability line (sampled, confirmed, corrected, rejected).
- The 40-dismissal recheck result.
- `## Self-check`: PASS or FAIL with evidence for (a) every lane row accounted for (counts reconcile), (b) every CONFLICT opened from source, (c) sample size met per lane, (d) only this file written, nothing started.

Read-only everywhere else. Cite `path:line`. Plain English, no long dashes.
