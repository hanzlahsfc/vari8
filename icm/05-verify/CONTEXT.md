# 05 Verify

## Inputs

| File                             | Sections                |
| -------------------------------- | ----------------------- |
| `icm/04-build/output/<pr-id>.md` | head SHA, changed paths |
| `icm/03-plan/output/PLAN.md`     | that PR's live check    |

## Process

A different model than the builder verifies. Drive the real running app in a browser at desktop and mobile widths. Compare the screen to the canvas. Tests alone do not count.

## Outputs

`output/<pr-id>-verdict.md` with `VERDICT: PASS | FAIL`, screenshots, and the list of what could not be checked.
