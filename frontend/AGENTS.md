# Project instructions

Read [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) before making or reviewing product changes. It defines the current prototype boundary, source map, and preserved UI direction. Use [docs/agent-workflow/CONTEXT.md](docs/agent-workflow/CONTEXT.md) to select only the stage and role context needed for the task. This is a lightweight ICM adaptation; it does not add a runtime agent framework or rename product folders.

For non-trivial engineering work, follow the pinned project workflow in [docs/conductor-generic/SKILL.md](docs/conductor-generic/SKILL.md). The source commit and checksum are recorded in [PROVENANCE.md](docs/conductor-generic/PROVENANCE.md); do not replace its process with a second paraphrased policy. ICM describes how project context and stage handoffs are organized; the Conductor document remains the process reference. Use the task's authorized scope and higher-priority instructions when they differ.

Before editing a frontend file, inspect its callers and relevant project code. Do not assume that a UI affordance enforces backend authorization. This repository is a browser-only preview; keep changes within that boundary unless the user explicitly asks for a separately scoped integration.

These instructions apply to Codex, Luna, Devin, and other agents whenever this context is loaded. Provider entrypoints should point here rather than carry their own copy of project rules. For Devin CLI, pass the generated handoff as the initial prompt as described in `PROJECT_CONTEXT.md`; do not assume `DEVIN.md` is automatically discovered.
