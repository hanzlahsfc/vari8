# Gap-matrix verification brief V1 to V3

Context: `icm/01-recon/BRIEF.md` (the operation), `icm/02-gap-matrix/CONTEXT.md` (status meanings). The canvas dictates.

Two independent teams mapped the same thing:

- Team F (Devin Fusion, Opus + SWE-2): `icm/02-gap-matrix/output/F1/S01..S12-*.md` and `F1/GAP-MATRIX.md`.
- Team H (Haiku and Luna lanes): `icm/01-recon/output/H1-canvas-core.md`, `H2-canvas-plans.md`, `H3-canvas-views.md`, `H4-unwired-config.md`, `L1-backend-domain.md`.

Source trees (read-only): `/home/nexuslink/vari8-worktrees/merge-proto` (canvas in `frontend/`, backend at root). All paths below are under `/home/nexuslink/NEXUS_AI_CENTER/04_PROJECTS/Vari8/`.

## Your job (slice named in your task)

1. Build the list of canvas elements in your slice from BOTH teams. Match rows that describe the same element.
2. For every element: does Team H's report contradict Team F's status or citations? Classify AGREE, F-ONLY (Team H missed it), H-ONLY (Team F missed it), DISAGREE.
3. For every DISAGREE and every H-ONLY row, open the source at both citations and decide which is right. Also open at least 5 AGREE rows chosen at random and confirm them.
4. Write `icm/02-gap-matrix/output/V/<slice>.md`: a summary count (AGREE, F-ONLY, H-ONLY, DISAGREE resolved F, DISAGREE resolved H), then a table `| element | F status | H status | verdict | correct status | evidence path:line |` for every non-AGREE row and every spot-checked AGREE row.

Rules: read-only on source and on both teams' files. Write only your one file. Write incrementally. Cite `path:line`. No long dashes.

Self-check (mandatory): re-read your file, list as PASS or FAIL: (1) every F row of your slice accounted for (give the count); (2) every H row of your slice accounted for (give the count); (3) every DISAGREE resolved from source; (4) 5 AGREE spot checks done; (5) only your file written.

## Slices

| slice    | F files                 | H sections                        |
| -------- | ----------------------- | --------------------------------- |
| V1-core  | S01, S02, S03, S04, S11 | H1, L1 canvas type comparison, H4 |
| V2-plans | S05, S06, S07           | H2, L1 canvas type comparison     |
| V3-views | S08, S09, S10, S12      | H3, H4, L1                        |
