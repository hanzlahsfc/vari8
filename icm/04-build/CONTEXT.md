# 04 Build

## Inputs

| File                           | Sections                       |
| ------------------------------ | ------------------------------ |
| `icm/03-plan/output/PLAN.md`   | the one PR section being built |
| `AGENTS.md`                    | operating rules, boundaries    |
| The canvas files that PR names | the screen being wired         |

## Process

The workflow every change follows, gates included, is `icm/05-build/TEAM-WORKFLOW.md`.

One PR, one `beta/<slug>` branch off `Vari8-Beta`, one worktree. The canvas is the visual and functional reference. Match it. Keep every backend security gate (RBAC, consent, audit). No secrets, no real client data.

## Outputs

`output/<pr-id>.md` holding the branch, head SHA, changed paths, and the commands run with exit codes.
