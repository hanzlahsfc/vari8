# AGENTS.md - db/

<!-- BEGIN GENERATED: scripts/index/generate.ts (npm run index) -->
Purpose: Prisma schema and migrations. One migration per model change; never edit an applied migration.
Top-level files: schema.prisma
Read next: docs/index/DATA-MODEL.md while working in here. Repo-wide index: docs/index/README.md.
Rules: see the repo-root AGENTS.md and CONTEXT.md.
<!-- END GENERATED -->

<!-- Hand-written notes go below this line. Everything outside the two markers
     is preserved verbatim by `npm run index`; only the generated block is rewritten. -->

## Conventions

- Never run `prisma migrate dev`/`db push`: the schema cannot express the raw
  composite FKs, CHECKs, partial/expression indexes and triggers migrations
  carry - a dev diff would drop them. Deploy only; author migrations by hand
  and review `prisma migrate diff` output before handing off.
- From PR-M0 on, every migration directory carries a `down.sql` (Prisma ignores it): it
  reverses the up migration and ends with
  `DELETE FROM "_prisma_migrations" WHERE migration_name = '<dir>';`.
- `ALTER TYPE ... ADD VALUE` gets its own directory when the same deploy
  consumes the new values (PG forbids use in the adding transaction).
- Merge order (issue #164, owner decision): `20261023000000_supplement_plan`
  (PR #162) first, then `20261022090000_auth_rotate` (PR #158).
