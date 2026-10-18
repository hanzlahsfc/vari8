# 02 Gap matrix

## Inputs

| File                                       | Sections                                                    |
| ------------------------------------------ | ----------------------------------------------------------- |
| `icm/01-recon/output/H*.md`                | screen and element tables, `## Entities`, `## Interactions` |
| `icm/01-recon/output/L1-backend-domain.md` | model census and the canvas type comparison                 |
| `icm/01-recon/output/H4-unwired-config.md` | flag table and `## Fix list`                                |

## Process

The canvas dictates. Take every canvas element and give it one status.

| Status       | Meaning                                                                                |
| ------------ | -------------------------------------------------------------------------------------- |
| WIRED        | backend model, service and route exist and serve this element as drawn                 |
| UNWIRED      | backend capability exists but no route, nav, or data path reaches this element         |
| UNCONFIGURED | backend exists but is off or broken in a normal run (flag, env, seed, consent version) |
| PARTIAL      | backend exists with a shape mismatch (missing fields, different rules)                 |
| MISSING      | no backend capability at all                                                           |
| CONFLICT     | the element collides with a binding security, consent, or health-data decision         |

Then list backend capabilities with no canvas element (ORPHAN). Each row cites both sides by `path:line`.

## Outputs

`output/GAP-MATRIX.md` (one row per canvas element, plus the ORPHAN list) and `output/VERIFY-gap.md` (an independent lane re-checks a sample of rows against source).
