# docs/index - the generated system index

An agent landing anywhere in this repo can route from the top-level `AGENTS.md` routers into
these four files instead of crawling the tree. Everything here is generated; findings go in the
code and in the source docs, not in the index.

## Files

| File            | Answers                                                                                                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ROUTES.md`     | Which Next routes exist in `app/` and `frontend/src/app`, which file renders each, server or client, and which guard helpers it calls. API routes list their HTTP methods. |
| `SYMBOLS.md`    | Every exported symbol per module in `lib/` and `frontend/src/lib`, one-line signature, TypeScript compiler API.                                                            |
| `DATA-MODEL.md` | Prisma models, fields, relations, enums and constraints, with source line numbers.                                                                                         |
| `GLOSSARY.md`   | Domain terms with the file that defines them, the program slice ids, and the live feature flags.                                                                           |

Top-level directories that lack an `AGENTS.md` get a short one (max 25 lines) with the same
purpose, an inventory, and a pointer to the right index file.

## Commands

| Command                                                                                      | Effect                                                                                                                      |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `npm run index`                                                                              | Regenerates all four docs and every managed `AGENTS.md` router, in place.                                                   |
| `npm run index:check`                                                                        | Regenerates into a temp directory, compares, exits 1 with the drifted paths and the first differing line.                   |
| `npx tsx scripts/index/generate.ts --refresh-glossary --spec <file> --ref <repo path label>` | Re-extracts the slice table in `scripts/index/glossary-seed.json` from the F1 wiring spec, which is kept outside this repo. |

Prerequisites are the same as `npm run typecheck`: `npm ci` and `npx prisma generate`, so the
compiler can state inferred types. No new dependency was added: `tsx` and `typescript` were
already dev dependencies.

## Adding things

- **A curated glossary term:** add it to `scripts/index/glossary-seed.json`, then `npm run index`.
- **A directory:** nothing. A new top-level directory gets a router on the next run.
- **Hand-written router notes:** write below the second marker in that `AGENTS.md`. Text outside
  the two markers is preserved verbatim; only the marked block is rewritten. Do not move or
  delete the markers, and `index:check` reports a router whose markers are gone.
- **A curated directory purpose:** `DIR_PURPOSE` in `scripts/index/generate.ts`.

## Guarantees

- Deterministic: no timestamps, no absolute paths, no locale collation. Every section is
  sorted by code point and asserted monotonic before the file is written.
- Idempotent: two consecutive runs produce byte-identical files, so the check is a plain
  comparison and never a coin flip.
- Robust to new files: the route, symbol, model and router inventories are discovered by walking
  the tree, not from a hand-kept list. Adding a route, a module or a model changes the output on
  the next run and makes `index:check` fail until the index is regenerated and committed.
