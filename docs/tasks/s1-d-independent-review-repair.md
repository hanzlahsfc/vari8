# S1-D independent review repair plan

Starting state: `main` and `origin/main` at `ec8250c`, clean worktree. Independent
`gpt-6-astra` review: **FAIL**. This is builder repair, not a new review. S1-E remains
blocked and no consent mutation is externally exposed.

## Scope and files

- `tests/unit/consent.test.ts`: RED cases for P2002 target validation, fresh
  transaction-bound authorization, changed status/membership/ownership/workspace,
  version drift, query ordering, exact-row and structural-error behavior.
- `tests/integration/s1-d-consent.test.ts`: genuine PostgreSQL duplicate-grant race
  through `grantOwnConsent`; capture actual Prisma error code/metadata (P2002 or
  P2034); use >100 synthetic historical rows to prove max 100, default 25,
  cursor remainder, unique and stable order.
- `lib/consent.ts`: narrow observed-index P2002 classifier; recovery inside a new
  Serializable transaction, with S1-B authorization and client/workspace checks
  before policy comparison and exact active-row query. Fail closed otherwise.
- `docs/tasks/s1-d-versioned-consent.md`, `docs/security/consent-audit.md`,
  `docs/STATUS.md`, `TRACKER 2.0.md`, and this record: correct transaction and
  PostgreSQL `TEXT`/CUID descriptions; capture review, evidence and pending re-review.
- `db/schema.prisma` and `db/migrations/**` are inspection-only. The additive S1-D
  migration and S1-A/S1-D raw indexes/constraints must remain unchanged.

## Sequence and observable acceptance

1. Add tests first and run focused unit/integration commands; record their RED
   failures against `ec8250c`. Observe raw-index P2002 metadata on real PostgreSQL,
   including a concurrent duplicate attempt. Use only the observed, unambiguous
   shape; if it is unavailable or unstable, return `consent_conflict` and document
   that callers may retry.
2. Implement the minimum recovery fix. Only exact `consent_record_active_version_key`
   P2002 may enter recovery. A new Serializable transaction must re-read active
   user, workspace, membership and client ownership through the tx-bound S1-B
   repository, preserve `consent/write`, reject policy drift, then query the exact
   active row. Return `changed:false` only after commit. PED/HRT and coach-attested
   paths remain denied. Any other P2002 is `consent_conflict`, with no consent read.
3. Mutation-prove the new tests: skip recovery authorization; move consent lookup
   before it; accept any target; accept missing/unknown metadata; infer target from
   an existing exact row; remove pagination clamp; reduce pagination fixture below
   101 rows. Each mutation must make a relevant test fail; restore exactly.
4. Run `git diff --check`, `npm ci`, `npx prisma format`, `npx prisma validate`,
   `npx prisma generate`, `npx prisma migrate deploy`, `npx prisma migrate status`,
   `npm run format:check`, `npm run typecheck`, `npm run lint`, `npm run test`,
   `npm run test:integration`, `npm run build`, `npm run test:e2e`. Record exit codes
   and test counts. Confirm generic invalid login, no route/UI/audit/S1-E change,
   and raw constraints still present.
5. Commit plan, production/tests, then documentation/handoff as separate scoped
   commits. After gates, confirm clean tree, fetch `origin`, stop on divergence,
   push normally to `origin/main`, fetch again, verify both SHAs match. No force push.

## Rollback and review

Revert the three scoped repair commits in reverse order if this repair must be
undone; do not roll back the already-applied additive consent migration. The
independent Astra re-review remains required before S1-D can pass or S1-E starts.

## Repair evidence and handoff

- Independent Astra verdict on `ec8250c`: **FAIL**, covering all five findings in the
  review request. Plan commit `6e8e2e6`; production/tests commit `942879e`.
- RED before production changes: focused unit suite exit 1, 16 failed / 16 passed.
  GREEN after repair: 32/32 focused unit tests; full unit 204/204; PostgreSQL
  integration 48/48. The bounding fixture has 137 synthetic revoked records.
- Real PostgreSQL raw-index duplicate: P2002 metadata exactly
  `{ "modelName": "ConsentRecord", "target": ["client_profile_id", "kind", "version"] }`.
  A synchronized pair of production `grantOwnConsent` calls returned one successful
  grant and one `consent_conflict`; the underlying concurrent Prisma error was P2034
  with `{ "modelName": "ConsentRecord" }`, and the database retained one active row.
  P2034 callers may retry. No index-name inference is made from an existing row.
- Mutation results (each temporary edit restored byte-for-byte): skipping recovery
  authorization 8 failures; querying consent before it 10; accepting any P2002 target
  5; accepting missing metadata 2; accepting an unknown target 1; treating an exact
  row alone as target proof 15; removing the pagination maximum 1 integration failure;
  reducing the fixture below 101 rows 1 integration failure.
- Required gates: `git diff --check` 0; `npm ci` 0; `npx prisma format` 0;
  `npx prisma validate` 0; `npx prisma generate` 0; `npx prisma migrate deploy` 0;
  `npx prisma migrate status` 0; `npm run format:check` 0; `npm run typecheck` 0;
  `npm run lint` 0; `npm run test` 0 (204); `npm run test:integration` 0 (48);
  `npm run build` 0; `npm run test:e2e` 0 (21). Prisma format and build initially
  hit sandbox permission errors and passed with authorized local cache/process access.
- Schema and migrations remained byte-for-byte unchanged; the S1-A same-workspace
  foreign keys and active-primary index, and S1-D active-consent index remain.
  Invalid login was generic in E2E. No routes, UI, audit table, S1-E code, PR or
  deployment were added. No mutation is externally exposed.
- **S1-D repaired after independent Astra FAIL; gates green; Astra re-review pending.**
  S1-E is blocked until the independent re-review passes.
