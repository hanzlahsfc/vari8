# Devin card D1: FRONTEND x main merge prototype

Read `/home/nexuslink/NEXUS_AI_CENTER/04_PROJECTS/Vari8/icm/01-recon/BRIEF.md` first for context (you are slice D1; its read-only rule does NOT apply to your own worktree below).

## Task

You work ONLY in `/home/nexuslink/vari8-worktrees/merge-proto` (a throwaway worktree on local branch `proto/merge-frontend`, based on `origin/main`). Never push. Never touch any other checkout.

1. `git merge --no-ff --no-edit origin/FRONTEND`. Record every conflict (file, both sides in one line each). Resolve conflicts the obvious way (keep both docs entries, keep main's code), commit locally.
2. Root app: `npm ci`, `npx prisma generate`, `npm run typecheck`, `npm run lint`, `npm run build`. Record exit codes and the first 30 lines of any failure.
3. Canvas app: `cd frontend && npm ci && npm run build` and its own lint/test scripts from `frontend/package.json`. Record exit codes and failures.
4. Check whether root tooling (tsconfig include, eslint, prettier, vitest globs, `.github/workflows/*`) picks up or breaks on `frontend/`. Cite the config lines.
5. Diff the canvas snapshot against Lilly's original repo commit: `git -C /home/nexuslink/NEXUS_AI_CENTER/_QUARANTINE/2026-10-18/coaching-client-tracker diff --stat ccef621` is NOT the right tool; instead compare file lists and sizes between `/home/nexuslink/NEXUS_AI_CENTER/_QUARANTINE/2026-10-18/coaching-client-tracker/src` and `frontend/src` (read-only on the quarantine copy). Report which files are newer or only in one side.
6. Do not run any dev server on port 3000. No browser, no GUI.

## Output

Write `/home/nexuslink/NEXUS_AI_CENTER/04_PROJECTS/Vari8/icm/01-recon/output/D1-merge-prototype.md` incrementally (one section per step above, written as soon as the step finishes): commands, exit codes, conflicts, failures, verdict "merges clean: yes/no", "root builds: yes/no", "canvas builds: yes/no", and the snapshot-vs-Lilly table. Also state the local merge commit SHA.

## Self-check (mandatory)

Re-read the report. List steps 1 to 6 as PASS or FAIL with evidence (command + exit code). You are not done until every step is PASS or FAIL with the reason.
