# SYSTEM-INDEX-SPEC: generated index for agent navigation

Goal: an agent that lands anywhere in the repo finds the right file in one or two reads instead of a crawl, so lanes search less and spend fewer tokens. The index is generated, deterministic and checked, never hand-maintained. PR-X1 (#62, in flight) builds it; PR-X2 rebuilds it on the final tree.

## Outputs

| File                       | Content                                                                                                                                                                         | Source of truth                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `docs/index/ROUTES.md`     | Every Next route under `app/` (and `frontend/src/app` until PR-R1): URL pattern, rendering file, server or client, the auth guard helpers it calls, HTTP methods for API routes | the file tree plus the TypeScript AST                                    |
| `docs/index/SYMBOLS.md`    | Every exported symbol per module in `lib/` (and `frontend/src/lib`): kind and one-line signature with inferred types                                                            | TypeScript compiler API                                                  |
| `docs/index/DATA-MODEL.md` | Prisma models, fields, relations, enums and constraints, each with its `db/schema.prisma` line                                                                                  | `db/schema.prisma`                                                       |
| `docs/index/GLOSSARY.md`   | Domain terms (client, template, check-in, tracker, workspace, ...) with the defining file, the program slice ids, and the live `ENABLE_*` flags                                 | `scripts/index/glossary-seed.json` plus a scan of `process.env.ENABLE_*` |
| `docs/index/README.md`     | What each file answers and how to regenerate                                                                                                                                    | hand-written once                                                        |
| `<dir>/AGENTS.md` routers  | For each top-level directory: purpose, an inventory of its subdirectories, and a pointer to the index file that answers questions about it; max 25 lines in the generated block | the tree plus `DIR_PURPOSE` in the generator                             |

Routers use two markers. Only the block between them is rewritten; hand-written notes outside the markers survive every run.

## Commands

- `npm run index`: regenerate every output in place.
- `npm run index:check`: regenerate into a temp directory, compare, exit 1 and name the drifted paths and the first differing line.

## Rules

1. Deterministic: no timestamps, no absolute paths, no locale-dependent sort. Every list sorted by code point; the generator asserts order before writing. Two consecutive runs are byte-identical.
2. Discovered, not listed: routes, modules, models and directories come from walking the tree, so a new route or module changes the output on the next run.
3. No new dependency: `tsx` and `typescript` are already dev dependencies. Prerequisites match `npm run typecheck` (`npm ci`, `npx prisma generate`).
4. Skips: `.git`, `.next`, `node_modules`, `target`, build output, `icm/` evidence and generated parity output.
5. The index is a map, not documentation: findings and decisions stay in code comments and `icm/`; the index only points.

## Acceptance (the PR-X1 verifier checks)

- `npm run index` twice in a row produces no diff.
- Adding one route file without regenerating makes `npm run index:check` exit 1 and name `docs/index/ROUTES.md`.
- A hand-written note below the router marker survives a run.
- `tests/unit/system-index.test.ts` drives the generator on a fixture tree and asserts literal output lines (D14: it fails when the generator breaks).
- PR-X2, on the final tree: `npm run index:check` exits 0 and every router names only paths that exist; PR-03's `scripts/verify-local.sh` runs `index:check`.
