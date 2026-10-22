# Agent workflow router — Layer 1

## Inputs

- The current user request and any explicit scope or authorization.
- `AGENTS.md` and only the relevant sections of `PROJECT_CONTEXT.md`.
- This router; load one stage contract at a time.

## Process

Classify the request, then use the smallest path that can complete it:

| Request | Stage path |
| --- | --- |
| Simple explanation or read-only lookup | `01-intake` → `02-scout` |
| Documentation or context work | `01-intake` → `02-scout` → `03-plan` when multi-step → `04-build` → `05-validate` → `06-review` |
| Product behavior or bug fix | `01-intake` → `02-scout` → `03-plan` → `04-build` → `05-validate` → `06-review` |
| Feature styling or shared-control change | `01-intake` → `02-scout` → `03-plan` → `04-build` → `05-validate` (`npm run check` now runs `ui:check`, the drift scanner) → `06-review` |
| Publication or external action | Run the relevant implementation/review path first; use `06-review` to check the exact authority before any external action. |

The stages follow the Conductor reference. ICM supplies the file-based context boundaries and human-reviewable handoffs. Do not load all stages, prior chat history, or archive folders by default. A task may use an explicitly authorized independent worker, but the workflow itself is sequential and the lead owns integration and Git writes.

If a task stops between stages, save only its necessary inputs, evidence, and next action under `.agent-runs/<run-id>/`. Keep stable project rules in Layer 3 references. Do not copy credentials, real client data, full logs, or broad histories into a handoff.

## Outputs

- One selected stage contract and its bounded input set.
- A readable result or a precise blocker for the user.
- For multi-step work, concise run evidence and next action under `.agent-runs/<run-id>/` when useful.
