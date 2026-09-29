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
