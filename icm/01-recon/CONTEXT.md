# 01 Recon

## Inputs

| File                                          | Sections                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------- |
| `icm/01-recon/BRIEF.md`                       | whole file (the slice table names each lane's scope)                                  |
| Canvas, branch `FRONTEND`, folder `frontend/` | `PROJECT_CONTEXT.md`, `src/components/coach/model.ts`, `store.tsx`, the slice's files |
| Backend, branch `main`                        | `AGENTS.md`, `db/schema.prisma`, `lib/`, `app/`, `docs/product-decisions.md`          |

## Process

One lane per slice, read-only on both trees. Each lane writes one report with a `path:line` citation per row. Canvas lanes list screens, entities and interactions. Backend lanes list models, services, routes, flags and what is not reachable. One build lane merges the two branches in a throwaway worktree and records what builds.

## Outputs

`output/` holds one report per lane, named after its slice id (`H1-canvas-core.md`, `L1-backend-domain.md`, `D1-merge-prototype.md`, and so on). Stage 02 reads all of them.
