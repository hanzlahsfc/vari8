# TRAINING-I1A — week-based training programs (task record)

Builder: SWE-2 High (Devin). Branch: `feature/training-i1a` from
`origin/main` `5f9cb41…`. Synthetic-only: no PR, merge, deployment,
production enablement, real-client use, shared/production migration.

## Contract precedence (latest first)

1. PROMPT 244 explicit S/G corrections + owner rules.
2. A3 `45fe661d…8473` — overrides A2 §3 Level-2 (scoped preamble),
   A2 §4.1 `noOp` (→ `changed:false`), A2 §2.1 (marginMs ≥ stmtMs);
   adds Clause E activation floor.
3. A2 `7737934b…8d7f` — overrides A1 §1.2 (v1-only predecessor
   compare), A1 §2.1–2.2 (audited read tx, no READ ONLY; error map
   57014/55P03/P2028/P2024 → service_unavailable; 40001/40P01 bounded
   whole-tx retry), A1 §3.2 (two-level history pagination), A1 §3.4
   (fold failure → internal error), A1 §1.3 (save `expectedRevision`
   CAS + one bump/one audit + UI resync).
4. A1 `579fd897…51a3` — overrides P9 §4.3 bullet 1, P9 §5 replay +
   uniqueness clauses, P9 §6 `takesOverImmediately` (→ pre-commit
   `confirmation_required`); appends keyset/fold/constraint-map/RED
   items.
5. P9 `8cf99c34…74ff` — base plan; all unoverridden clauses stand
   (immutable anchor, instant takeover, chain/tail/single-root/
   leaf-cancel, sparse boundaries, field projection, consent/audit,
   start-date lock, Timestamptz(6), unrepresentable_date, pending =
   above-current-only, "Starts [D]", bounded access).

## S/G corrections (this prompt, applied)

- **S** — staff version history: after exact-target authorization +
  consent, staff version reads return ALL authorized published
  versions (future, shadowed, beyond-cutoff, cancelled-program) with
  derived labels (`current|superseded|pending|dead|cancelled`;
  `scheduled|shadowed|beyond_cutoff` per version). Client visibility
  filters never applied to staff. Deterministic `version_seq` keyset,
  N+1 completeness.
- **G** — cancel audit: `UPDATE` on `training_program`,
  `meta: {changed:true}` only — no `predecessorId`/`takeoverInstant`
  keys, no `CANCELLED` status. Idempotent cancel replay = no audit.
  Publish audit meta: `version` + `date` + `status:"PUBLISHED"` only.
  Save audit: `changed:false|true` over the canonical whole draft
  (incl. confirmedTimezone). `changed:false` events on revision-
  minting saves are permitted — audit module comment updated.

## Surfaces (exact paths)

- `db/schema.prisma` — `TrainingProgram`/`TrainingProgramVersion`.
- `db/migrations/<ts>_training_i1a/migration.sql` — tables, composite
  coherence FKs, partial indexes (`training_program_single_root`,
  `training_program_live_successor`, `training_program_tail`,
  `training_program_version_activation`), CHECKs.
- `lib/training/{gate,consent,limits,payload,service,boundary}.ts`.
- `lib/auth/rbac.ts` — `trainingPlansLogs` owner write denied→assigned.
- `lib/auth/guard.ts` — add `trainingPlansLogs` to
  `PLATFORM_ADMIN_DENIED_RESOURCES`.
- `lib/audit.ts` — `training_program` + `training_program_version`
  resource types; stale comment update.
- `lib/consent.ts` — `trainingPlansLogs` BASE_CONSENTS wiring (check
  existing registration first).
- Staff: `app/workspace/[workspaceId]/clients/[clientProfileId]/training/`;
  client: `app/(tracker)/workspace/[workspaceId]/training/`.
- Tests: `tests/unit/training-*.test.ts`,
  `tests/integration/training-i1a.test.ts`, `tests/e2e/training.spec.ts`.

## Commands / acceptance

- `npx prisma migrate dev`/deploy on disposable DBs
  (`training_i1_fresh`, `training_i1_upgrade` from a base-migrations
  clone); drift = none; exact index/constraint inventory asserted.
- `npm run test` (unit), `test:integration` against
  `INTEGRATION_DATABASE_URL=…/training_i1_int`, `npm run typecheck`,
  `lint`, `format:check`, `build`, `test:e2e` (full).
- RED-first: tests committed before lib code.
- Real-PG evidence: serialization race on first-publish claim, P2002
  meta shapes, statement_timeout + pool-leak check, page-boundary
  completeness, replay v1/v2 root/replacement, cancel/leaf rules,
  consent revocation race.

## Scope fence

No Evergreen, dated sessions, logging, set review, volume,
progression formulas, recommendations, dashboard widgets, template-
variant field-config wiring (named follow-on — program-level
`fieldConfig` is the interim authority). Client write cell on
`trainingPlansLogs` stays `own` (future logging) but program
management rejects CLIENT at the operation level.

## Outcome (2026-10-18)

- Branch `feature/training-i1a`; all contract clauses implemented
  including S (staff lifecycle-unfiltered labelled history) and G
  (`UPDATE`/`{changed:true}` cancel audit).
- Actual surface paths (supersede the sketch above):
  staff `app/workspace/[workspaceId]/clients/[clientProfileId]/training-program/`;
  client `app/(tracker)/workspace/[workspaceId]/training-program/`;
  lib under `lib/trainingprogram/`; components under
  `components/trainingprogram/`; migration
  `db/migrations/20261017195754_training_i1a/`.
- Gates: unit 1328/1328; integration 843/843; typecheck/lint/
  format:check/prisma validate/build clean; focused E2E 4/4; full E2E
  re-run recorded in STATUS.
- Real defects found and fixed during RED→GREEN: JSONB key-reorder vs
  canonical comparison (stable `canonicalJson`); cancel takeover op-clock;
  v1 backdated-start bounds; high-water persistence on publish.
- Mutation sweep: 3/4 bite; M2 client-own-write no-bite (assignment-lock
  defense-in-depth) — recorded in STATUS/builder report.
- `s1-a-identity` schema inventory updated (two approved training
  tables; "program" forbidden guard narrowed) — same pattern as
  MEAL-PLAN-I1-R2.
- Decision #116 recorded. Stopped at pushed candidate; no PR; no
  production enablement.

## Outcome — R2 repair (2026-10-18, commit `4dbe363b…`)

- Independent R1 review (CONDITIONAL PASS) repair: P2-1 deny-set
  isolation test, P2-2 publish-time wholly-past stale-draft test,
  P3-2 gvAt inclusive-boundary unit test, P3-1 Prettier fix, P3-3
  "Instructions"→"Detailed instructions" label; `client-home.spec.ts`
  `e2eDatabaseUrl()` env-hardening (test-only, disclosed).
- Targeted mutations: deny-set removal, wholly-past invariant disable,
  gvAt `>`→`>=` — all bite the new tests; restored byte-identical.
- Gates on repair tree: unit 1329/1329; integration 845/845;
  typecheck/lint/format/build clean; focused E2E 4/4; full E2E
  415/427 (12 skipped), 0 failures.
- Corrections: original format:check claim was inaccurate; original
  deny-set/history tests did not isolate the controls; report scope
  was 37 paths (15 modified + 22 new); non-blocking baseline-query
  optimization deferred as follow-up.
- Builder report `~/Downloads/TRAINING-I1A-R2-builder-report.md`.
  Stopped at pushed repair; no PR; no production enablement.
