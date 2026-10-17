# ICM research and project adaptation

## Research source

Jake Van Clief and David McDermott, “Interpretable Context Methodology: Folder Structure as Agent Architecture,” arXiv:2603.16021v2, 18 March 2026. [Full text](https://arxiv.org/html/2603.16021v2). The v2 full text names the method Interpretable Context Methodology (ICM); the abstract also mentions “Model Workspace Protocol” as an earlier label. This repository follows the v2 ICM terminology.

The paper describes five context layers: workspace identity; task routing; stage contracts; stable references; and per-run working artifacts. It recommends scoped inputs, one job per stage, plain-text contracts with Inputs/Process/Outputs, and human review at stage boundaries. Its fit is strongest for repeated, sequential workflows with reviewable outputs. It reports practitioner experience but no controlled comparison of staged and monolithic prompting, and cross-model performance remains untested in the paper.

## Local mapping

| ICM layer | This workspace | Use |
| --- | --- | --- |
| 0: identity | `AGENTS.md` and provider pointers | Identify this project and send every agent to the shared context. |
| 1: routing | `docs/agent-workflow/CONTEXT.md` | Choose one current stage and role; do not load unrelated stages or history. |
| 2: stage contract | `docs/agent-workflow/0*/CONTEXT.md` and `roles/*.md` | State exact Inputs, Process, and Outputs for the selected task. |
| 3: stable reference | `PROJECT_CONTEXT.md`, `docs/references/`, pinned Conductor workflow | Product boundary, source map, verified research, and engineering process. |
| 4: working artifact | `.agent-runs/<run-id>/` | Per-run brief, evidence summary, decision log, and handoff notes; ignored by Git. |

The router is sequential by default, following ICM’s intended shape. When the task or existing agent workflow explicitly calls for independent parallel work, isolate worker ownership and context; the lead remains the only Git writer. Reviewers receive read-only scope.

## What is enforced here

ICM is the context and handoff design basis. It is not an application runtime, CI system, or authorization mechanism. The local `agent-context` checker verifies required files, local links, publication mappings, and the pinned Conductor checksum. The project’s separate lint, type, test, and build commands remain the applicable source checks. The standalone preview does not have or pass the target full-stack app’s database, RBAC, consent, or audit gates. Its P1, P2, and I4 integration scopes are not authorization to wire this preview or simulate security.

## Adaptation limits

This is a small adaptation of the paper, not a vendored ICM implementation. It keeps the production UI folder layout unchanged, uses Markdown as the contract interface, and adds no automatic stage runner. Local checks prove the context files and handoff contract are present; they do not prove that every agent will follow them or that they improve model performance.
