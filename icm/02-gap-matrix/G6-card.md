# Devin card G6: backend reverse census (Fusion lead + SWE-2 workers)

Read `/home/nexuslink/NEXUS_AI_CENTER/04_PROJECTS/Vari8/icm/02-gap-matrix/R3-brief.md` fully first. It defines round 3, the output format, and the rules. You are lane G6.

## Skills to apply

Read these files fully before starting and apply them (name the rule each changed in `## Skills applied`):

- `/home/nexuslink/projects/cursor-plugins/pstack/skills/poteto-mode/SKILL.md` and its `playbooks/investigation.md`
- `/home/nexuslink/projects/cursor-plugins/pstack/skills/principle-build-the-lever/SKILL.md`
- `/home/nexuslink/projects/cursor-plugins/pstack/skills/principle-prove-it-works/SKILL.md`
- `/home/nexuslink/projects/cursor-plugins/pstack/skills/swarm/SKILL.md` (coverage-matrix partitioning for your workers)
- `/home/nexuslink/.hermes/skills/research/grounded-citations/SKILL.md`

## Your domain

The whole backend, enumerated mechanically, in reverse: every Prisma model, every field, every enum value (`db/schema.prisma`); every RBAC permission and role grant (`lib/auth/rbac.ts`); every consent kind and version; every audit event name; every `ENABLE_*` flag; every page, layout, route handler and server action under `app/`; every exported service function under `lib/`. For each item: which canvas element uses it (cite an existing matrix row or the canvas `path:line`), or ORPHAN. Then the cross-cutting checks the canvas implies but rounds 1 and 2 may have skipped: per-role visibility (owner, coach, assistant coach, support, client) for every surface, empty and error states the backend can return, and consent or audit requirements each canvas write path must satisfy.

## Fan-out

Write your census script first (Prisma schema parse, `rbac.ts` parse, `grep -n "use server"`, TypeScript export listing), save it under `R3/G6-census.*`, run it, then partition the uncovered items across SWE-2 workers with `run_subagent` (`builder` profile, model `swe`, `is_background: true`) and a read-only rule. Each worker writes `R3/G6-part-<n>.md`; you merge into `R3/G6.md` and spot-check at least 3 rows per worker at both citations. Re-dispatch any worker whose rows do not hold.

## Rules

Work from `/home/nexuslink/vari8-worktrees/merge-proto`, read-only (`git status --short` must stay empty). Write only under `/home/nexuslink/NEXUS_AI_CENTER/04_PROJECTS/Vari8/icm/02-gap-matrix/output/R3/`. No installs, no servers, no GUI, no push. Kill everything you start and include `ps -eo pid,etime,args | grep -E '[n]ode|[n]ext'` in your self-check.
