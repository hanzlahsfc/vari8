# Fold-in brief, part 1: round 3 into GAP-MATRIX.md (FM lane)

All paths under `/home/nexuslink/NEXUS_AI_CENTER/04_PROJECTS/Vari8/`. Read first: `icm/02-gap-matrix/CONTEXT.md`, `icm/03-plan/DECISIONS.md` (D10 roles, D12 consent parked), `icm/03-plan/FOLD-IN-NOTES.md` items 5 and 9.

## Inputs

- Current matrix: `icm/02-gap-matrix/output/GAP-MATRIX.md`.
- Judged round 3: `icm/02-gap-matrix/output/R3/R3-JUDGED.md`. It is the only source for round-3 rows. Use the judge's corrected status and citations, never the lane's original. Rejected and DUP-EXISTING rows are not added; where the judge says a DUP-EXISTING row corrects the existing row, apply that correction to the existing row.

## Edit `icm/02-gap-matrix/output/GAP-MATRIX.md`

1. Add every surviving round-3 row under its surface with a new id `R3-<n>` and the judge's lane ids in a source column or note. Keep every existing id unchanged.
2. Relabel per D10: every CONFLICT whose only basis is `docs/security/authorization-model.md` or an RBAC grant becomes a `ROLES` decision row. Apply this to existing rows too, not only round 3.
3. Per D12: move consent, health-data storage and data-protection rows out of the active lists into a new `## Parked: consent and health data` section, each with its id and one line on what it is.
4. Update the summary table: counts per surface per status, arithmetic shown, delta from the previous totals (previous total, plus round 3, minus relabels, minus parked).
5. Add one line under the title: `Round 3 folded in from R3-JUDGED.md (judge gpt-6.1-sol), 2026-10-18.`

Write section by section. Plain English, no long dashes, cite `path:line` as the judge did.

## Self-check (append as `## Fold-in self-check`)

PASS or FAIL with evidence: (a) every surviving R3-JUDGED row appears exactly once (give the count and list ids), (b) no rejected or DUP-EXISTING row was added, (c) summary arithmetic reconciles, (d) every ROLES relabel and every parked row is listed with its old status, (e) only `GAP-MATRIX.md` was written (`git status --porcelain` output).
