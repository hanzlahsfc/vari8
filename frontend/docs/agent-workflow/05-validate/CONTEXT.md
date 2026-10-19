# 05 — Validate

## Inputs

- Exact changed files and the plan’s acceptance criteria.
- Relevant local commands and source code; no backend gates are implied.

## Process

Run checks that directly establish the requested behavior and report exact commands/results. For UI behavior, inspect the real flow at relevant sizes when that is in scope. For context changes, run `npm run agent-context:check` and `npm run agent-context:test`. Never claim a gate that was not run on the current tree. The preview cannot pass the target’s database, RBAC, consent, or audit gates.

## Outputs

- Exact validation evidence, failures, and remaining limits.
- A repair loop for confirmed issues, then re-run the affected checks.
