# 03 Plan

## Inputs

| File                                        | Sections                             |
| ------------------------------------------- | ------------------------------------ |
| `icm/02-gap-matrix/output/GAP-MATRIX.md`    | every non-WIRED row, the ORPHAN list |
| `icm/01-recon/output/L2-stack-merge.md`     | recommended merge architecture       |
| `icm/01-recon/output/D1-merge-prototype.md` | what merged and built for real       |

## Process

Turn the gap matrix into an ordered PR program. First the physical merge of the canvas into `TRACKER`, then configuration fixes, then one PR per canvas surface, wiring it to the backend. Each PR names its files, the observable result, and its live check. Owner approval gates the whole plan.

## Outputs

`output/PLAN.md`, marked `STATUS: AWAITING OWNER APPROVAL` until Marcel approves it.
