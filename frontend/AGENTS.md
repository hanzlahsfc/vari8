# Project instructions

For non-PR work built by Luna, the main session owns independent review. Do not spawn a separate Sol reviewer unless the user explicitly requests one. PR work remains subject to the user's Devin ownership rule.

Read [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) before making or reviewing product changes. It defines the current prototype boundary, source map, and preserved UI direction. Use [docs/agent-workflow/CONTEXT.md](docs/agent-workflow/CONTEXT.md) to select only the stage and role context needed for the task. This is a lightweight ICM adaptation; it does not add a runtime agent framework or rename product folders.

For non-trivial engineering work, follow the pinned project workflow in [docs/conductor-generic/SKILL.md](docs/conductor-generic/SKILL.md). The source commit and checksum are recorded in [PROVENANCE.md](docs/conductor-generic/PROVENANCE.md); do not replace its process with a second paraphrased policy. ICM describes how project context and stage handoffs are organized; the Conductor document remains the process reference. Use the task's authorized scope and higher-priority instructions when they differ.

Before editing a frontend file, inspect its callers and relevant project code. Do not assume that a UI affordance enforces backend authorization. This repository is a browser-only preview; keep changes within that boundary unless the user explicitly asks for a separately scoped integration.

Before browser work, run `npm run preview:up` and confirm `npm run preview:status` reports both the app and reports server healthy. Use the persistent project runner for browser checks; leave it running after the task. `npm run preview:down` is for an explicit request to stop the local preview. Production builds use `.next` while Next.js 16 dev output stays in `.next/dev`; do not restart the preview for routine source edits because Next.js hot reloads them.

These instructions apply to Codex, Luna, Devin, and other agents whenever this context is loaded. Provider entrypoints should point here rather than carry their own copy of project rules. For Devin CLI, pass the generated handoff as the initial prompt as described in `PROJECT_CONTEXT.md`; do not assume `DEVIN.md` is automatically discovered.

For shared UI roles, primitive APIs, reuse rules, and visual exceptions, read [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) before changing migrated components. The enforced and planned rules live in [docs/DESIGN-RULES.md](docs/DESIGN-RULES.md); run `npm run ui:check` before committing UI work. Keep fixed surfaces achromatic, derive lighting from the custom accent, and verify shared changes in both modes with pale and dark accents. Verify open field popups, keyboard selection and narrow layouts as well as their closed triggers.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
