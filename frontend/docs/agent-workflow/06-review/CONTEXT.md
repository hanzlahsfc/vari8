# 06 — Review and handoff

## Inputs

- Current diff, task acceptance criteria, and validation evidence.
- Fresh, read-only reviewer context for the changed behavior.

## Process

Review against the request, identify only actionable defects, and preserve a single Git writer. Keep handoff notes short: outcome, changed paths, evidence, limits, and next action. Do not stage, commit, push, open a PR, merge, deploy, or write to external services unless the user’s current authorization covers that action.

## Outputs

- Findings with exact paths and evidence, or an explicit no-findings result with scope and limits.
- A concise portable handoff for the next stage or user.
