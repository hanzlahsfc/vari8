# STATUS — App foundation & extraction build

Append-only loop memory (newest first). "Done" = the exact gate re-run on the current
tree with a real exit code. This repo covers Phases 1–12 (foundation + spreadsheet-source
extraction) only, not the workbook UI itself.

## 2026-10-01 — Phase 1.1 production Daily Tracker shell — implementation + independent review PASS (feature branch)

- Built the first production-oriented Daily Tracker UI foundation: a real,
  server-authorized route at `/workspace/[workspaceId]/daily` reached through the
  role-aware workspace navigation. Delivered `lib/daily-tracker.ts` (verified
  section/field contract), `components/tracker/*` (reusable field/section/shell
  primitives), the route page, a `workspace-nav` entry, and a
  `requireDailyTrackerAccess` collection guard (existing `authorizeCollection`
  primitive; no RBAC/session/auth-semantics change). Non-persistent by design:
  entry/saving is honestly unavailable until Phase 4, with no writes, no
  localStorage, no fabricated records or computed data.
- Source fidelity from the **available** Phase 0.1 blueprint (`b05c130`, off
  verified `main` `fc2c936`): exactly the nine verified sections and only source
  labels/units; `CALORIES` renders only `TODO(product)`; E2/PROG/coach-notes
  excluded; only biofeedback 1–10 and DAY LABEL ∈ {HIGH, MEDIUM, LOW} encoded.
- TDD: unit contract RED (module absent) → GREEN. Gates on the exact tree
  (real exit codes): `git diff --check` 0; `format:check` 0; `typecheck` 0;
  `lint` 0; `test` 0 (39 files / 421; +9); `build` 0 (route emitted);
  `test:e2e` 0 (41 browser tests; +10 at 1440/834/390 incl. keyboard/focus and
  overflow); `test:integration` 0 (17 files / 198 on disposable `tracker_p11_int`;
  +2). Mutations caught and restored byte-exact: guard deny→plain throw (integration
  FAIL); MENSES cycle-consent flag removed (unit FAIL).
- Independent fresh-context read-only review of frozen `fb973fd` (tree
  `447c851`, verified unchanged): **PASS**, no blocking findings; reviewer model
  `opencode-go/glm-5.3` differs from builder `opencode-go/deepseek-v4.1-flash`
  (model diversity verified). Non-blocking notes recorded in the task record.
- Record: `docs/tasks/phase-1-1-daily-tracker-shell.md`. No `db/**`, schema,
  migration, dependency, or `app/api/**` change; Phase B0 `/daily` untouched;
  no `TRACKER 2.0.md`/client data. **No PR/merge/deploy; branch pushed for
  collaborators; persistence/consent/client shell/formulas remain deferred.**

## 2026-10-01 — Phase 0.1 PRGRSS source blueprint & Daily Tracker spec (docs only)

- New `docs/tasks/phase-0-1-source-blueprint.md`: manifest of the 11 HTML exports
  - `resources/` (formulas, validations, conditional formats, hidden rows, and
    Apps Script are **absent**; two referenced `cellImage_*_0` images are missing);
    a field-level Daily Tracker crosswalk (labels independently confirmed in the
    source HTML, 82 `Averages` week blocks) with type/units marked
    CONFIRMED/INTERPRETATION/UNKNOWN; a 15-item unknown/conflict list each with its
    resolving source; a remaining-sheet inventory; and proposed acceptance criteria
    for the first Daily Tracker slice.
- Source fidelity: no workbook contents or client data committed; `TRACKER 2.0.md`
  stays out of Git; product name undecided. Documentation only — no
  app/schema/migration/dependency/route/UI change.
- Independent reviewer-agent review: four rounds (separate fresh-context read-only
  agents; builder never self-approved). Rounds 1–3 FAILed on source-fidelity/
  consistency issues (prototype existence, consent gating, `NUTRITION & DIGESTION`,
  units, PED count, column consistency), all repaired; **round 4 PASS** with only
  low non-blocking wording observations, folded in after the PASS.
- Checks: `format:check` 0, `git diff --check` 0, `lint` 0, `typecheck` 0.
- Branch `feature/phase-0-1-source-blueprint` off verified `main` `fc2c936`;
  pushed for collaborators. **No PR/merge/deploy; Daily Tracker implementation not
  started.**

## 2026-10-01 — S1-H workspace shell + 403 routing — implementation PASS (feature branch)

- Plan `docs/tasks/s1-h-workspace-shell.md` (plan review took four rounds;
  final independent **PASS** after repairs). Implemented test-first on
  `feature/s1-h-workspace-shell` off `main` `3d04829`.
- Delivered: `lib/auth/route-guard.ts` (session gate + `authorize` wiring →
  `forbidden()`); `app/workspace` list + `[workspaceId]` shell
  (session → authorize → name); owner-only `[workspaceId]/admin`; a real
  HTTP 403 via `app/forbidden.tsx` + `next.config.ts`
  `experimental.authInterrupts`; role-aware `components/workspace-nav.tsx`;
  sign-out (`app/logout/actions.ts` + `components/sign-out-button.tsx`);
  form-factor shell CSS (desktop sidebar / tablet top-bar / mobile stacked).
  **No schema/migration/package change; no `app/**` import of
  invitation/reset/export/storage or `assert*ExternallyExposable`.**
- Deferred (recorded, not dropped): DENY-attempt and login-outcome auditing
  remain deferred pending the `TODO(human)` abuse-volume policy; this slice
  exposes no audited mutation (plan §1a).
- RED→GREEN: unit `route-guard` RED (module absent) → 11/11; real-PG
  integration 6/6; E2E 10 new browser tests (real 403 + 1440/834/390 widths).
  Mutations caught and restored byte-exact: swallow-all-errors,
  no-session-redirect, drop-ACTIVE-membership, drop-ACTIVE-workspace,
  admin-guard-read (E2E).
- Gates (real exit codes): `git diff --check` 0; `npm ci` 0; prisma
  format/validate/generate/migrate deploy/status 0; `format:check` 0;
  `typecheck` 0; `lint` 0; `test` 0 (412/38 files); `test:integration` 0
  (196/16 files); `build` 0; `test:e2e` 0 (31, incl. 10 new); `npm audit`
  1 moderate + 4 high (unchanged). `git diff 3d04829 -- db/` empty.
- Independent implementation review (separate `opencode-go/deepseek-v4.1-flash`
  session, read-only, fresh context): **PASS** — no blocking findings; the P2
  STATUS omission and P3 clarifications were folded in.
- **No PR yet; feature branch pushed for collaborators. Not merged/deployed.**

## 2026-10-01 — S1-G implementation — independent DeepSeek review PASS (feature branch)

- Fresh read-only implementation review of `db099ec` by
  `opencode-go/deepseek-v4.1-flash` in a separate `opencode run` session
  (builder SWE-2 High; reviewer different model, fresh context,
  tree-verified unchanged): **PASS**.
- Verified with line refs: own-path actor resolution ignoring supplied
  client ids; scoped path rejecting `own`; `client_outside_workspace`
  denial on cross-tenant ids; workspace-predicate defense in depth;
  manifest derived from emitted rows; bounded id-cursor pagination with
  the ceiling checked before emission (never silent truncation); exactly
  one tx-bound `EXPORT`/`client_export` audit on success;
  P2034/P2010(40001/40P01) bounded retry; retention all-or-nothing with no
  deletion; null storage backend cannot mint URLs; fail-closed key/TTL
  validation; tests assert the load-bearing invariants.
- Non-blocking observations only: generic DB errors propagate raw (not
  mapped to `GdprError`); per-field allowlist closure relies on query
  `select`; the multi-page test counts rows rather than instrumenting
  fetches.
- S1-G reviewed scope is built and independently PASSed. Erasure,
  retention enforcement, a real storage backend, and any external
  exposure remain deferred on `TODO(human)` decisions + S1-H routing.
- **No PR/merge/deploy; branch pushed for collaborators.**

## 2026-10-01 — S1-G implementation built test-first — pending independent review (feature branch)

- Implemented only the approved policy-independent scope (plan rev 3,
  `924b999` PASS): `lib/gdpr/export.ts` (allowlist own/scoped export,
  manifest derived from emitted rows, id-cursor pagination, hard
  `export_too_large` ceiling), `lib/gdpr/retention.ts` (policy-as-data, all
  durations `TODO(human)` except the referenced access-token constant,
  all-or-nothing evaluator, no enforcement), `lib/storage.ts`
  (provider-neutral port, fail-closed key/TTL validation, null backend),
  `lib/gdpr.ts` (exposure gate), `client_export` added to
  `AUDIT_RESOURCE_TYPES`. **No schema/migration, no routes/UI, no erasure
  code, no vendor SDK.**
- TDD observed: RED (3 unit files fail, modules absent) → GREEN.
  Unit 401/401 (37 files) exit 0; integration 190/190 (15 files) exit 0
  on a fresh disposable `postgres:16-alpine` (`127.0.0.1:55441`; app DB
  untouched).
- Mutation checks (all restored byte-exact, SHA-256 verified): allowlist
  bypass · manifest count skipped · audit subject dropped · ceiling not
  enforced · single-page stop · TTL over-bound accepted · retention due on
  null duration · null-backend presign minting a URL · own-export honoring
  a caller client id · workspace predicate dropped · `own`-scope rejection
  removed — each produced a targeted test failure.
- Gates on current tree (real exit codes): `git diff --check` 0;
  `npm ci` 0; prisma format/validate/generate/migrate deploy/status 0;
  `format:check` 0; `typecheck` 0; `lint` 0; `test` 401/401 exit 0;
  `test:integration` 190/190 exit 0; `build` 0; `test:e2e` 21/21 exit 0;
  `npm audit` 5 known vulns (unchanged baseline). Boundary greps empty:
  no `app/**` import of the new modules; no vendor coupling;
  `git diff 8369451 -- db/` empty.
- Browser: N/A — S1-G exposes no route/UI; the 21 existing desktop/mobile
  E2E tests ran as a regression gate only.
- **Next: second fresh-context independent DeepSeek review of the exact
  implementation diff; repair + re-review before completion is claimed.
  No PR/merge/deploy.**

## 2026-10-01 — S1-G plan rev 3 — independent DeepSeek re-review PASS (feature branch)

- Fresh read-only re-review of `2ef21e9` by `opencode-go/deepseek-v4.1-flash`
  in a separate `opencode run` session (builder is SWE-2 High — different
  model, fresh context, no edits; reviewer verified tree unchanged):
  **PASS**. D1 (parameterized `assertPresignGetTtl`) and D2 (blocked vs
  flagged-for-confirmation split) confirmed resolved with line refs;
  F1–F6 re-verified still resolved; claims cross-checked against
  schema/audit/rbac code. Non-blocking residuals noted only.
- The S1-G plan is now approved-for-implementation scope: allowlist
  export + counts manifest with explicit bounds, retention policy-as-data
  (all durations unset), provider-neutral fail-closed storage port. All
  erasure paths stay deferred on `TODO(human)` policy.
- **Next: implement the reviewed S1-G scope test-first on this branch;
  a second independent DeepSeek review of the implementation diff is
  required before completion is claimed.**

## 2026-10-01 — S1-G plan rev 3 — repaired after independent DeepSeek FAIL (feature branch)

- Independent read-only review of rev 2 (`cd6f449`) by
  `opencode-go/deepseek-v4.1-flash` in a separate `opencode run` session:
  **FAIL** — two findings, tree unchanged by the reviewer.
- D1: presign-TTL bound was asserted-enforced while its value stayed
  `TODO(human)` and was unreachable/untestable behind the null backend.
  Repair: bound enforcement is now a pure parameterized validator
  `assertPresignGetTtl(ttlSeconds, maxTtlSeconds)` every backend must call;
  unit tests pin it with explicit test operands; no production value
  invented.
- D2: coach (`asg` read) export was listed as both blocked and in-scope.
  Repair: §10 split into blocked `TODO(human)` items vs in-scope work
  flagged for product confirmation; coach export sits in the latter.
- Non-blocking repairs: `EXPORT_PAGE_SIZE`/`EXPORT_SECTION_ROW_MAX` given
  PROPOSED values (500 / 100_000); every promised mutation now maps to an
  enumerated test (multi-page pagination, ceiling → `export_too_large`
  with no audit row, own-export ignores a supplied client-id, TTL
  validator); real-browser requirement marked N/A for this slice —
  `test:e2e` is a regression gate only, S1-G exposes no browser surface.
- Verification: docs-only diff; `git diff --check` + `format:check` clean.
- **Next: fresh read-only re-review of the repaired plan; implementation
  still blocked until PASS.**

## 2026-10-01 — S1-G plan rev 2 — scope narrowed after external review findings (feature branch)

- Plan `docs/tasks/s1-g-privacy-storage.md` rewritten per six review
  findings; still plan-only, no production code/schema/route/UI.
- Erasure moved entirely out of scope: client deletion conflicts with the
  locked never-delete-consent-grants model (`consent-audit.md` §1 +
  `Restrict` FKs); account anonymization can orphan a sole-owned
  workspace; workspace anonymization has no resolved tx/storage sequence.
  Recorded requirements for the future design: storage-delete↔DB-tx is
  NOT atomic (idempotent `deletePrefix`, retry-safe erasure, residual
  state surfaces as `erasure_failed`); erasure audit rows never carry a
  deleted client identifier in `resourceId`.
- Export now specifies bounded pagination + a hard per-section ceiling
  with explicit `export_too_large` failure — never silent truncation.
- Remaining S1-G scope: allowlist export + counts manifest, retention
  policy-as-data (all durations `TODO(human)`, no automatic cleanup),
  provider-neutral fail-closed storage port (no backend, no Supabase).
- Verification: docs-only diff; `git diff --check` + `format:check` clean.
- **Next: independent read-only review of the repaired plan by
  `opencode-go/deepseek-v4.1-flash` (separate session); implementation is
  blocked until the plan returns PASS.**

## 2026-10-01 — S1-G privacy/storage plan written; S1-F2D status reconciled (feature branch)

- Base verified: `main`/`origin/main` =
  `836945140a4616953d2c9cd51b6b5101ef0b53fc`, working tree clean after
  fetch; existing `s1-f2d-password-reset` worktree left untouched.
- **Status reconciliation (supersedes stale wording below):** the earlier
  2026-10-01 entries that leave S1-F2D "review PENDING; no PR/merge/deploy"
  are stale. S1-F2D independently passed its final different-model review,
  was merged to `main` via PR #1 (merge commit `8369451`,
  2026-09-30T22:51:19Z), and post-merge CI on `main` passed (CI run
  36787929805, success, 3m27s). S1-F2D is complete. **S1-G and S1-H are not
  complete and not started** — no export/erasure/retention/storage or
  routing code exists.
- This task is PLAN ONLY: `docs/tasks/s1-g-privacy-storage.md` defines the
  S1-G scope (allowlist export + counts manifest, delete-vs-anonymize
  erasure, retention policy-as-data with `TODO(human)` durations,
  provider-neutral storage port), RED tests, exact gates, rollback,
  privacy boundaries, and the unresolved `TODO(human)` set. No production
  code, schema, migration, route, or UI changed.
- Verification this task: `git status`/`rev-parse`/`fetch` state above;
  `git diff --check` and `npm run format:check` on the docs-only diff.
- On `feature/s1-g-privacy-storage-plan`, pushed normally for collaborator
  visibility. **Stop: plan review precedes any implementation; no merge,
  PR, deploy, or S1-H.**

## 2026-10-01 — S1-F2D account-audit optional-field repair handoff (feature branch)

- Base: verified `main`/`origin/main` = `e2bffb46810f3b507aaeb9fa96e39ef8cc2f6b43`
  and local/remote feature = `ce01d95bde659b37346ecd389c9525a71f3b1c00`
  after fetch; isolated feature worktree clean. Plan `7604451`,
  implementation/tests `aed342b`; this handoff record follows.
- RED: `npx vitest run tests/unit/audit.test.ts` exit 1, 9 failed / 60 passed;
  direct production repro exit 0 returned null for malformed actorUserId,
  actorRole, resourceId. GREEN focused unit exit 0 (81/81); three separate
  silent-null mutations each exit 1 (3 targeted failures), restored byte-exact
  to SHA-256 `216b0370…f2298`. Captured-input single reads and pair rule held.
- Gates: `npm ci` 0 (423 packages audited); Prisma format/validate/generate 0,
  migrate deploy 0 (10), status 0; focused real-PG account-audit + reset tests
  0 (29/29); `format:check` 0; `typecheck` 0; `lint` 0; unit 0 (351/34 files);
  full integration 0 (180/13 files); build 0; E2E 0 (21 actual-browser,
  existing desktop/mobile flows); `git diff --check` 0. No reset route/UI
  exists, so no external browser reset-flow claim.
- `npm audit` exit 1: 1 moderate + 4 high (same recorded count); no dependency
  or security-policy changes. Fresh synthetic PostgreSQL container
  `s1f2d-audit-repair-db` (port 55439) stopped/auto-removed (exit 0,
  `docker ps -a` no match). Existing databases untouched. No schema/route/UI/
  provider change. Independent DeepSeek review **PENDING**; no PR/merge/deploy.

## 2026-10-01 — S1-F2D stable-input boundary design (feature branch)

- Post-review hardening: `requestPasswordReset` captures `options.deliver`
  and `input.email` exactly once at entry (trapped getters/proxies →
  `invalid_input` before any DB work) and invokes the captured sink
  unconditionally once post-commit — mid-flight reassignment cannot
  suppress delivery. `buildAccountAuditEvent` captures each consumed field
  once and validates/builds solely from the captures (getter/proxy/
  enumeration traps → structural `AuditError`); `resetStage` pair coupling
  and meta-free `PASSWORD_RESET`/`user` preserved.
- Mutations all caught: second `deliver` read (`?.` and direct), second
  `meta` read, removed sink validation — byte-exact restores.
- Gates (fresh disposable `s1f2d_boundary`, dropped): unit 328+, integration
  179+ incl. the real-PG reassignment case; `main` untouched; independent
  different-model re-review pending.

## 2026-10-01 — S1-F2D second repair (final capped loop, feature branch)

- DeepSeek re-review of the first repair FAILed on three items; all fixed:
  active task-document contract rewritten to match the implemented API
  (prior sections marked HISTORICAL); `deliver` is now a REQUIRED runtime-
  validated sink (`invalid_input` before any DB work when absent); account
  audit meta `resetStage` coupled to `PASSWORD_RESET`/`access_token` at type
  and runtime (PASSWORD_RESET/user keeps its meta-free allowed shape).
- Mutation evidence: optional-sink restore (1) · sink-validation removal (1)
  · resetStage on user resource (2) · stale-doc reintroduction caught by the
  rg consistency gate. Restores byte-exact.
- Gates (fresh disposable `s1f2d_repair2`, dropped): unit 328, integration
  179/13 files, build/e2e(21)/lint/typecheck all 0; npm audit unchanged
  (5 vulns). `main` untouched; **final independent different-model
  re-review pending; S1-H routing not started.**

## 2026-10-01 — S1-F2D repair after independent DeepSeek FAIL (feature branch)

- Independent review FAILed the initial S1-F2D slice. Repairs landed:
  corrected FOR UPDATE/Snapshot visibility claims (SSI abort + bounded retry
  is what resolves post-snapshot inserts); token validated structurally
  BEFORE password policy/hash; public request result narrowed to
  `{outcome}` only with a REQUIRED runtime-validated post-commit `deliver` sink (never called
  for missing/ineligible accounts; delivery failure → `reset_failed`, no
  replay; missing sink → `invalid_input` before any DB work); consume audit attribution corrected to `actorUserId=null`/
  `actorRole=null` (bearer-token auth, not a session); retries bumped to
  `MAX_ATTEMPTS=8` + bounded backoff (repeated 3-way/8-way bursts: zero
  `serialization_conflict`, one active token each); real-CSRF
  `/api/auth/session` update test (strict 200+null+cleared-cookie);
  `resetStage` rescoped to an account-only audit meta set
  (`AccountAuditMeta`/`sanitizeAccountAuditMeta`); `safeTokenHash` maps
  TokenError→`invalid_token`, unexpected→`reset_failed`.
- Repair mutations all caught: token-after-policy (1 unit) · delivery in
  result (12) · sink for ineligible (1) · actor=account (1) · MAX_ATTEMPTS=3
  (1 unit + 1 burst) · workspace resetStage (1) · safeTokenHash catch-all
  (1) · invalid-CSRF test (1). Restored byte-exact (shasum-verified).
- Gates: unit 324+·integration on fresh disposable DB — see task record for
  exact counts; `main` untouched; independent different-model re-review
  pending. No schema/route/UI/provider/rate-limit change.

## 2026-09-30 — S1-F2B repair — independent re-review PASS (opencode-go/deepseek-v4.1-flash)

- Read-only independent re-review of the repair range `ac9857e..ae7c6d5`
  (HEAD `ae7c6d5`, full S1-F2B range `87a6e85..ae7c6d5`), each repair commit
  (`70bd307` plan, `0c13818` implementation, `ae7c6d5` record) inspected.
  Independence: repair built by SWE-2 High; reviewer is a different model.
  **PASS.**
- P0 (real `auth()` bypass) independently reproduced against installed
  next-auth@5.0.0-beta.32: the gate now lives in the `jwt` callback
  (`Awaitable<JWT | null>`). The reviewer drove the real pipeline
  (`auth({req,res})` getSession path, RSC `auth()` via stubbed headers,
  `handlers.GET/POST`, real `@auth/core/jwt` cookies): valid session
  authenticates; legacy/no-`sv`, stale after bump, malformed `sv`/`sub`,
  DEACTIVATED, INVITED, unknown, deleted, and DB-failure all return `null`;
  reboot with fresh `sv` works; `/api/auth/session` → `200` body `null` +
  clearing `Set-Cookie`; real sign-in issues current DB `sv`; client update
  payload cannot inject/refresh `sv` (verified with a valid CSRF token).
- P2/P3 indexes independently verified on fresh PostgreSQL with `ANALYZE`d
  fixtures: `Index Scan using audit_event_subject_user_id_id_idx` (no sort);
  `Index Scan using access_token_terminal_cleanup_idx` (no sort, `LIMIT 1000`).
  New effective-terminal-ts predicate proven exactly equivalent to the original
  four-branch predicate over 11,008 rows incl. all boundary shapes (0
  disagreements).
- P4: `createSessionCallbacks` deliberately spreads base callbacks; base keys
  survive; null token cannot be resurrected.
- Migration `20260930180000_stage1_f2b_review_indexes` additive only (two
  `CREATE INDEX`); published `20260930170000` untouched; prior CHECKs/FKs/
  indexes live.
- Independent mutation checks (restored byte-exact): jwt gate bypassed (6
  runtime fails) · status/version/DB-error bypassed (4) · update writes `sv`
  (1 unit) · `...base` removed (1 unit) · audit index dropped (2) · cleanup
  GREATEST→LEAST (1) · cleanup LIMIT removed (1).
- Gates (fresh disposable DBs, dropped): `git diff --check` 0; `npm ci` 0;
  prisma format/validate/generate 0; `migrate deploy` 0 (9); `migrate status` 0;
  `format:check` 0; `typecheck` 0; `lint` 0; `npm run test` 0 (309/31);
  `test:integration` 0 (131/11, real PG); `build` 0; `test:e2e` 0 (21).
  `npm audit`: 1 moderate + 4 high (unchanged; no force-fix).
- Non-blocking: the `auth()` RSC path does not surface the cleared cookie (the
  token is dead; cleanup lands on the next `/api/auth/session` or sign-in);
  planner freedom on tiny tables is documented; no protected route exists yet,
  so browser-level enforcement is covered by the runtime harness rather than E2E.
- **S1-F2B is independently PASS at `ae7c6d5`.** No repair, orchestration,
  route, UI, email, PR, or deploy by the reviewer. Next: S1-F2C.

## 2026-09-30 — S1-F2A independent review PASS (opencode-go/deepseek-v4.1-flash)

- Read-only independent review of range `0d503b7..fb0713b` (HEAD `fb0713b`), each
  commit (`7a9336b` implementation, `fb0713b` docs) inspected separately.
  Independence: S1-F2A built by SWE-2 High; reviewer is a different model.
  **PASS.**
- Transaction boundary: every state-changing primitive takes a caller
  `Prisma.TransactionClient`; the store imports no global client and opens no
  transaction; rollback proven on real PostgreSQL (failed claim/issue leaves
  `consumed_at` NULL / no row). (Observation: TS does not structurally exclude a
  full `PrismaClient` from the tx parameter — convention, not compile error.)
- Issuance: S1-F0 generation; only canonical 64-hex SHA-256 digest stored (raw
  token absent from every column); expiry exactly +12 h; S1-F1 shapes satisfied;
  RNG/DB failure fails closed.
- Email: shared `normalizeEmail` (login-identical; trim+lowercase; no Gmail
  rewriting); empty/non-string/>254 rejected structurally.
- Replacement revocation: independently reproduced on real PostgreSQL — only the
  exact matching active invite (and the exact user's reset) revoked; all other
  rows byte-identical.
- Atomic claim: conditional `updateMany` + exact-row retrieval; malformed rejected
  before DB work; indistinguishable `{ok:false}`; concurrent claims → exactly one
  success (Read Committed; `P2034` under Serializable — propagates); unexpected DB
  errors propagate.
- Inspection: only `{valid,purpose,expiresAt}`; malformed/missing/expired/revoked/
  consumed all `{valid:false}` with no identity fields.
- Exposure: both assertions fail closed; no email/fake-delivery seam, no
  account/password/membership/profile/session/audit/RBAC mutation, no route/UI
  import of the store; no registration or cross-workspace sharing.
- Gates (fresh disposable DBs, dropped): `git diff --check` 0; `npm ci` 0;
  prisma format/validate/generate 0; `migrate deploy` 0 (7); `migrate status` 0;
  `format:check` 0; `typecheck` 0; `lint` 0; `npm run test` 0 (287/29);
  `test:integration` 0 (102/7, real PG); `build` 0; `test:e2e` 0 (21).
  `npm audit`: 1 moderate + 4 high (unchanged; no force-fix).
- Non-blocking observations: `Prisma.TransactionClient`/`PrismaClient`
  assignability (caller discipline); app-clock `expiresAt` vs DB-clock
  `created_at` (fail-closed under extreme skew); `normalizeEmail` imported from
  `lib/credentials.ts` (no cycle/DB coupling); Serializable loser returns `P2034`.
- **S1-F2A is independently PASS at `fb0713b`.** No repair, service, route, UI,
  email, PR, or deploy by the reviewer. Full S1-F still blocked on open
  `TODO(human)` items; orchestration services remain blocked.

## 2026-09-30 — S1-F1 re-review PASS (opencode-go/deepseek-v4.1-flash)

- Independent DeepSeek read-only re-review of the repaired tree at HEAD
  `8331bc53648f7e6ed64a9bf9ff4e3c8745882087` (full range `3e7733a..8331bc5`;
  repair-only `bedbe12..8331bc5`), each repair commit (`2d23249`, `8331bc5`)
  inspected separately. Independence: S1-F1 + repair built by SWE-2 High;
  reviewer is a different model. **PASS.**
- Constraint verified in `pg_constraint`: `access_token_token_hash_sha256_hex` =
  `octet_length(token_hash) = 64 AND token_hash ~ '^[a-f0-9]{64}$'`. The published
  `20260930150000` migration is byte-identical to `bedbe12` (untouched); the
  repair is a new additive migration with one `ADD CONSTRAINT` (no DROP/DML/
  normalization/rewrite).
- Adversarial real-PG inserts: valid lowercase 64-hex accepted; duplicate digest
  rejected (`23505`); raw 43-char base64url, uppercase/mixed hex, whitespace
  (leading/trailing/internal), empty, arbitrary, 63/65-char, 100k text,
  fullwidth/unicode, newline/CR/CRLF/tab, zero-width, `g`-text, `+`-text all
  rejected (`23514`); NUL rejected at input; no rejected insertion left material.
  200 `lib/tokens/crypto.ts` digests + known-answer digest inserted (constraint
  satisfied); a raw S1-F0 token rejected directly.
- Additive migration on existing bad data fails closed: deploy through
  `20260930150000`, insert a raw 43-char token (old schema allows), apply
  `20260930160000` → `ERROR: check constraint … violated by some row` (exit 3);
  row unchanged, no constraint added, no normalize/delete/rewrite.
- Test quality mutation-checked (DB-level constraint substitution, no repo
  edits): CHECK removed → 2 failed; uppercase regex → 1; `^[a-f0-9]+$` → 1;
  length-only → 1; renamed → 1; raw-b64url regex → 9. Fixture rewrite uses a real
  SHA-256 hex digest.
- Full S1-F1 re-check clean: invite/reset shapes, NULL handling, allowed roles,
  expiry, global uniqueness, email PII/no standalone index, delete behavior,
  `session_version` default + no JWT change, prior S1-A–S1-E constraints/indexes,
  fail-closed exposure assertion. No token lifecycle/external flow.
- Gates: `git diff --check` 0; `npm ci` 0; prisma format/validate/generate 0;
  `migrate deploy` 0 (7); `migrate status` 0; `format:check` 0; `typecheck` 0;
  `lint` 0; `npm run test` 0 (277/28); `test:integration` 0 (88/6, real PG);
  `build` 0; `test:e2e` 0 (21). `npm audit`: 1 moderate + 4 high (unchanged; no
  force-fix). No repair/token service/route/UI/email/PR/deploy by the reviewer.
- **S1-F1 is independently PASS at `8331bc5`.** Full S1-F still blocked on the
  open `TODO(human)` policy items; token lifecycle services remain blocked.

## 2026-09-30 — S1-F0 token-crypto — independent review PASS (opencode-go/deepseek-v4.1-flash)

- Independently reviewed range `96c6380..4f713e9` (HEAD `4f713e9`), read-only,
  each commit inspected separately. Independence: S1-F0 built by SWE-2 High;
  reviewer is a different model. **PASS**.
- Randomness: `crypto.randomBytes(32)` (256-bit CSPRNG, fail closed), no
  `Math.random`/UUID/timestamp/secret/fallback/injectable seam.
- Canonical encoding independently verified: alphabet indices ≡ 0 mod 4 →
  `AEIMQUYcgkosw048`; 200,000 random 32-byte base64url values were all 43 chars
  with a canonical final char; 50,000 `generateAccessToken()` outputs all
  validate. The final-char restriction is mathematically correct and does not
  reject generator output.
- Hashing: SHA-256 lowercase hex; the known-answer `sha256("A"*43)` was
  recomputed independently and matches (algorithm genuinely pinned).
- Secret handling: no module state/logging; `TokenError("token_invalid")` only;
  message and stack contain no input. Proxies/boxed/symbol/array/`Buffer`/padded/
  alternative/oversized/unicode all rejected structurally.
- Runtime boundary: `node:crypto` only; no `server-only` convention in this repo;
  no production callers yet; no mutable global state.
- Scope held: only `lib/tokens/crypto.ts` + its unit test + docs — no
  schema/migration/db/invite/reset/membership/role/session/email/route/UI/audit
  changes. S1-F remains crypto-only and BLOCKED; founder answers not recorded.
- Gates (reviewer-run): `git diff --check` 0; `npm ci` 0; `format:check` 0;
  `typecheck` 0; `lint` 0; `npm run test` 0 (275 passed / 27 files; token-crypto
  24/24); `npm run build` 0; `npm run test:e2e` 0 (21 passed). `npm audit`:
  1 moderate + 4 high (unchanged advisories; no force-fix).
- Non-blocking: plain `string` type aliases (raw/hash interchangeable at compile
  time; no callers, named fields — F3); redundant `≤128` bound beside the 43-char
  pattern; stale "21 tests" counts corrected to 24.
- Next: record the founder answers, then implement the separately reviewed S1-F
  Phase 1 schema foundation (still no routes/email until the flow decisions land).

## 2026-10-01 — S1-F2C final documentation re-review PASS (opencode-go/deepseek-v4.1-flash)

- Read-only final, documentation-only re-review of range `367fb99..02a7730`
  (`fa33589` UI-direction reconciliation, `02a7730` record), HEAD `02a7730`.
  Independence: implementation built by SWE-2 High; reviewer is a different
  model and issued all three prior independent FAILs. **PASS.**
- `git diff 367fb99..02a7730 -- lib tests db app` **empty** — zero code/test/
  schema/migration/UI changes; changed files are exactly the seven expected
  docs. The implementation at `367fb99` already independently passed every
  full gate; this range is documentation only.
- TRACKER §3 "faithful sheet layouts; do not redesign" now struck through +
  **SUPERSEDED**; Stage 3 rewritten to the per-form-factor direction (desktop
  = complete desktop-focused redesign; tablet/mobile form-factor-specific;
  one shared design system; per-factor navigation, information density,
  panels, tables, dashboards, interactions; no stretch/shrink). The false
  changelog claim about §3 is corrected with a dated CORRECTION note.
- All active guidance (`product-decisions.md` #3, `implementation-plan.md` §1,
  STATUS, TRACKER §3 + Stage 3) consistently states the direction; an
  exhaustive `rg` classification found no unmarked active contradiction
  (remaining hits are superseded-struck or historical task/review evidence).
- Boundaries: product name undecided (none invented); Prime Tracker
  (Marcel + Mike) untouched and not the visual target; no UI implemented.
  `s1f2c_repair2` no longer exists (read-only verified).
- Verification: `git diff --check` 0; `npm run format:check` 0;
  `git diff --check 367fb99..HEAD` 0; `git diff --exit-code 367fb99..HEAD --
lib tests db app` 0.
- **S1-F2C independently PASS. Platform-specific UI direction reconciled.
  Prime Tracker untouched. Next eligible slice: S1-F2D (not started).**
- Residual (non-blocking) UI-planning notes: "Marcel and Mike are finalizing
  Prime Tracker" is conveyed as ownership + do-not-modify rather than the word
  "finalizing"; Stage 3's visual-assertion bullet names desktop+mobile widths
  (tablet width could be added); the `## 12. Change log` heading is duplicated
  per entry (pre-existing structural quirk).

## 2026-10-01 — S1-F2C documentation-only repair after third DeepSeek FAIL

- Third review verdict: all code/security/concurrency/migration/test areas
  independently **PASS**; FAIL was documentation only — superseded
  "faithful sheet layout" wording still active in TRACKER §3 + Stage 3, and
  a false changelog claim. Corrected; Stage 3 now records the
  per-form-factor direction (desktop/web redesign, platform-appropriate
  tablet/mobile, shared design system, per-factor navigation/density/panels/
  tables/dashboards/interactions).
- Disposable DB `s1f2c_repair2` verified abandoned and removed.
- Product name still undecided; Prime Tracker untouched (Marcel + Mike).
- **Final independent DeepSeek documentation re-review pending; S1-F2D not
  started.**

## 2026-09-30 — S1-F2C second repair after second DeepSeek FAIL; re-review PENDING

- Post-lock freshness barrier now row-locks users → workspace →
  workspace_member (FOR UPDATE) after the advisory-lock wait, then re-runs
  the guard — six mid-wait race cases deny with zero side effects.
- Role-based `state_version` increments pinned by real-PG tests (+1 status,
  +1 role, +1 combined, +0 unrelated; forge-proof).
- Gates: unit 319, integration 162/12, e2e 21; 5 repair mutations caught.
- Latest product/UI direction recorded (docs only): per-form-factor
  desktop/web redesign, NOT Prime Tracker's tablet/mobile layout; product
  name still undecided; Prime Tracker untouched.
- **Next: independent DeepSeek re-review of S1-F2C → then S1-F2D.**

## 2026-09-30 — S1-F2C REPAIRED after DeepSeek independent FAIL; re-review PENDING

- DeepSeek FAIL repaired: clock-based freshness replaced by causal
  `workspace_member.state_version` (DB trigger-owned; additive migration
  `20260930190000` + `access_token.target_member_state_version` snapshot);
  issuer re-auth now uses the reviewed guard; fail-closed profile coherence;
  truthful `INVITE`/`access_token` acceptance audit (`acceptedAs`);
  authorize-before-lock + FOR UPDATE re-check; strict P2002 classification;
  new `access_token_ws_invite_list_idx` with real EXPLAIN evidence.
- Gates: unit 318, integration 159/12 real-PG files, e2e 21; 15 repair
  mutations caught + restored byte-exact. Record:
  `docs/tasks/s1-f2c-review-repair.md` + `s1-f2c-invitations.md`.
- **Next: independent DeepSeek re-review of S1-F2C → then S1-F2D.**

## 2026-09-30 — S1-F2C invitation orchestration implemented; independent review PENDING

- `lib/workspace/invitations.ts`: create/replace (owner→staff|client,
  coach→client), owner-only list/revoke, atomic acceptance for new + existing
  users, membership state machine incl. fresh-invite restoration, tx-coupled
  audit, post-commit provider-neutral delivery. No routes/UI/email.
- RBAC: new `clientInvitations` resource; matrix exact-tested.
- Gates: unit 315, integration 152/12 real-PG files, build 0, e2e 21; 14
  mutations caught + restored byte-exact. Plan+record:
  `docs/tasks/s1-f2c-invitations.md`.
- **Next: independent different-model review of S1-F2C → then S1-F2D.**

## 2026-09-30 — S1-F2B REPAIRED after DeepSeek independent FAIL; re-review PENDING

- DeepSeek review of `ac9857e`: **FAIL** — session-callback `null` was
  coalesced to a default session by next-auth `getSession` (auth() stayed
  authenticated); account-reader index mismatched the id cursor; cleanup query
  had no supporting index; callback composition replaced base keys.
- Repair: gate moved to the `jwt` callback (runtime-supported `JWT | null`;
  null → `auth()` null + `/api/auth/session` null + cookie cleared);
  deliberate callback composition; additive migration
  `20260930180000_stage1_f2b_review_indexes` (`audit_event(subject_user_id,id)`
  - `access_token` terminal-expression index); runtime tests exercise real
    `auth()`/`handlers` end-to-end.
- Gates: unit 309, integration 131/11 real-PG (incl. real `auth()` pipeline +
  EXPLAIN evidence), build 0, e2e 21. 8 repair mutations caught, restored
  byte-exact.
- **Next: DeepSeek independent re-review → then S1-F2C.**

## 2026-09-30 — S1-F2B account-security foundation landed; independent review PENDING

- `20260930170000_stage1_account_security` (additive): `AuditScope`
  discriminator, nullable `workspaceId`, `subjectUserId` (`Restrict`), named
  ownership CHECKs, `(subject_user_id, at)` index; `AuditAction` +=
  `PASSWORD_RESET`. Existing rows backfill `WORKSPACE`; workspace listings
  hard-filter scope.
- Account writer/reader (`writeAccountAuditEvent`, `listAccountAuditEvents`)
  are separate closed internal paths — no workspace fabrication, nullable
  actor, same meta allowlist.
- `lib/password-policy.ts`: 10–128 code points, NFC (no NFKC/trim/case-fold/
  composition); `lib/password.ts` normalizes NFC at both boundaries.
- `User.sessionVersion` is now live: JWT `sv` claim at sign-in; `session`
  callback does one PK re-read of `status`+`sessionVersion` per request and
  rejects stale/missing/malformed/indistinguishably (no caching; legacy JWTs
  stale). Integration proof: bump → session null, fresh sign-in sv=1 works.
- `cleanupTerminalAccessTokens`: CTE + `DELETE…RETURNING`, ≤1000/call,
  GREATEST(consumed,revoked) precedence, active rows structurally safe.
- RED (6/10 fail pre-migration) + 14 mutations caught & restored byte-exact.
  Gates: unit 308, integration 122/10 real-PG, E2E 21, build/typecheck/lint/
  format green. No orchestration, routes, or email.
- **Next: fresh different-model independent review of S1-F2B before
  S1-F2C invitations.**

## 2026-09-30 — Aleks's final S1-F answers reconciled; orchestration plan ready (docs only)

- `docs/product-decisions.md` #20–28 + `docs/open-questions.md` + S1-F plan §2:
  invite acceptance (new users set password; existing sign in as invited email;
  invite = verification), ACTIVE-only reset, **password min 10** (explicit
  change from proposed 15 — recorded risk), no composition rules,
  **different reset response by account existence** (explicit accepted
  enumeration risk — not best practice), workspace-admin invite revocation,
  30-day token retention, account-level reset audit, provider-neutral backend.
- Still open: email provider/sender/domain, product-facing `WORKSPACE_OWNER`
  name, rate-limit mechanism, DENY-event volume, cross-workspace sharing.
- New `docs/tasks/s1-f2b-orchestration-plan.md`: S1-F2B (account audit scope
  discriminator + password policy + `sessionVersion`→JWT + 30-day cleanup) →
  S1-F2C (invitations) → S1-F2D (reset) → routing slice. Includes the chosen
  nullable-`workspaceId` + `WORKSPACE`/`ACCOUNT` scope + `subjectUserId` audit
  design with ownership CHECKs and `WORKSPACE` backfill.
- Documentation/planning only — no production code, schema, or migration
  changed. **Next: implement + independently review S1-F2B.**

## 2026-09-30 — S1-F2A internal token primitives landed; independent review PENDING

- `lib/tokens/store.ts`: internal, transaction-bound primitives only —
  `issueWorkspaceInviteToken`, `issuePasswordResetToken`,
  `revokeMatchingInviteTokens`, `revokeUserResetTokens`, `claimAccessToken`
  (conditional `updateMany` — atomic single-claim), `inspectAccessToken`
  (minimal validity shape). Every state-changing call requires a caller's
  `Prisma.TransactionClient`; nothing uses the global client or opens its own
  transaction. Raw tokens returned once, never stored/logged; expiry =
  `ACCESS_TOKEN_TTL_MS` (12 h, founder-decided). Email via shared
  `normalizeEmail` (same rule as credential login).
- `assertTokenPrimitivesExternallyExposable` added to `lib/tokens.ts`; both
  assertions fail closed. No app/route file imports the store (grep-verified).
- No schema/migration change. No invite/reset service, acceptance, eligibility,
  password change, sessionVersion wiring, audit event, email, route, UI, RBAC
  change, retention, or rate limiting — those encode open `TODO(human)` items.
- RED: both new test files failed (module absent). GREEN: unit 10, integration
  14 on disposable `s1f2a_verify`. Mutation-proved ×11 (hash-only storage, TTL,
  claim/revoke predicates, atomic claim, tx binding, error hygiene) — all
  restored byte-for-byte. A coupled-scope test weakness was found and fixed
  mid-build (wrong-purpose claim must keep a matching owner scope).
- Gates (fresh `s1f2a_final`, dropped): unit 287 · integration 102 · format,
  typecheck, lint, build, e2e 21 all 0.
- **Independent different-model review of S1-F2A is required before any
  orchestration service.** Full S1-F remains blocked on open founder items.
- Record: `docs/tasks/s1-f2a-token-primitives.md`.

## 2026-09-30 — S1-F1 review FAIL repaired — token_hash format CHECK; re-review PENDING

- Independent DeepSeek review of `bedbe12`: **FAIL** — `token_hash` TEXT enforced
  uniqueness only; the DB accepted raw bearer tokens and malformed/oversized
  values (a caller bypassing `lib/tokens/crypto.ts` could store non-canonical
  digests).
- Repair: additive migration `20260930160000_stage1_access_token_hash_format`
  adds CHECK `access_token_token_hash_sha256_hex`
  (`octet_length = 64 AND ~ '^[a-f0-9]{64}$'`). Published `20260930150000`
  migration untouched. Test fixtures now generate real SHA-256 hex.
- RED on unrepaired tree (disposable `s1f1_red`): exit 1, 2 failed / 24 passed
  (8 bad-hash classes accepted incl. raw 43-char base64url token; CHECK absent).
  GREEN post-repair: 26/26. Mutation-proved: CHECK removed → 2 failures;
  regex weakened to `^[a-f0-9]+$` → 1 failure; restored byte-identical.
- Gates re-run green on fresh `s1f1_final` (dropped): migrate deploy 0 (7
  migrations), status 0, format/typecheck/lint 0, unit 277, integration 88,
  build 0, e2e 21.
- **Independent re-review still PENDING** — this repair does not mark S1-F1
  passed. No token lifecycle service, no other behavior change.

## 2026-09-30 — S1-F Phase 1 (S1-F1) — AccessToken + sessionVersion schema landed; review PENDING

- `db/schema.prisma`: `AccessToken` model + `AccessTokenPurpose`
  (`WORKSPACE_INVITE`/`PASSWORD_RESET` only), `User.sessionVersion Int
@default(0)`, relations. `db/migrations/20260930150000_stage1_access_tokens/` —
  additive (enum, table, `users` column, unique `token_hash`, three scoped
  indexes, three FKs, three raw CHECK constraints; verified no DROP).
- Constraints: `access_token_invite_shape` (workspace/email/role/issuer required;
  role ∈ {COACH, ASSISTANT_COACH, CLIENT}; `user_id` null until consumed);
  `access_token_reset_shape` (user required; all invite fields null);
  `access_token_expiry_after_creation` (`expires_at > created_at`). FKs:
  workspace Restrict, user Cascade (ephemeral user-owned rows), issuer Restrict.
  `target_email` is documented plaintext PII, never standalone-indexed.
- Fail-closed boundary: `lib/tokens.ts` `assertTokenFlowsExternallyExposable()`
  throws `token_flows_not_exposable` until issuance/consumption services,
  password policy, email delivery, session-version JWT wiring, audit ownership,
  rate limiting, and route review all exist.
- Suite caught a real defect pre-commit: `NULL IN (…)` passed the invite CHECK —
  fixed with explicit `IS NOT NULL`.
- RED: focused integration exit 1 (table/migration absent); unit exit 1
  (`lib/tokens` absent). Mutation evidence: 7 cases, all restored byte-for-byte
  (see `docs/tasks/s1-f1-token-schema.md`).
- Gates (disposable `s1f1_final`, dropped): `git diff --check` 0; `npm ci` 0;
  prisma format/validate/generate 0; `migrate deploy` 0 (6); `migrate status` 0;
  `format:check` 0; `typecheck` 0; `lint` 0; `npm run test` 0 (277);
  `test:integration` 0 (87, real PG); `build` 0; `test:e2e` 0 (21).
  `lib/tokens/crypto.ts` unchanged.
- **Independent different-model review PENDING** — required before any token
  service. No issuance/consumption/invite/reset/email/route/UI/audit/RBAC/auth
  behavior added.

## 2026-09-30 — S1-F Phase 1 (part A) — founder answers recorded; schema work pending

- Founder answers relayed by Hanzlah recorded in `docs/product-decisions.md`
  #13–19: invite-only initial product; product roles coach/assistant-coach/client
  (owner's product-facing name open); client self-onboarding (no pre-created
  profile → no `clientProfileId` on tokens); multi-coach sharing within a
  workspace; 12-hour invite/reset expiry; replacement cancels matching links;
  reset logs out other devices; password rules + email provider/sender/domain
  remain undecided pending product name.
- Conservative engineering interpretations recorded separately (not founder
  decisions): keep `WORKSPACE_OWNER`; RBAC unchanged; intended invite policy
  owner→{COACH,ASSISTANT_COACH,CLIENT}, coach→CLIENT; `sessionVersion` for
  logout-on-reset; single-workspace client ownership; no cross-workspace
  health-data sharing.
- `docs/open-questions.md` #16–27 updated: #16/#19/#20/#23 answered;
  #17/#18 partial; #21/#22/#24–27 still `TODO(human)`.
- `s1-f-invites-recovery-plan.md` §2 sections marked ANSWERED/PARTIAL/OPEN;
  §4.1 updated to the S1-F1-as-built design (no `clientProfileId`, plaintext
  `target_email`); §8 blockers re-scoped.
- S1-F0 was independently reviewed **PASS** (`opencode-go/deepseek-v4.1-flash`,
  `3e7733a`). Next: S1-F1 schema (`AccessToken` + `User.sessionVersion`),
  test-first on real PostgreSQL.

## 2026-09-30 — S1-F0 token-crypto foundation — implemented; gates green; independent review PENDING

- `lib/tokens/crypto.ts` (policy-neutral primitives only): `generateAccessToken()`
  returns `{ rawToken, tokenHash }` — 32 CSPRNG bytes as unpadded base64url
  (43 chars, `[A-Za-z0-9_-]`); `hashAccessToken()` validates (string, ≤128 chars,
  exact 43-char base64url) then returns the SHA-256 hex digest;
  `TokenError("token_invalid")` carries codes only, never input contents. No
  module state, no logging, no randomness-injection seam, no comparison helper
  (consume path is a DB lookup by unique hash — see `s1-f0-token-crypto.md`).
- Validation additionally restricted to the strict canonical form
  (`[AEIMQUYcgkosw048]` final char — the only 16 indices 32-byte base64url can
  emit) after fresh-context review finding F1.
- Scope held: no `AccessToken` model, migration, invite/reset behavior,
  registration, email verification, expiry/invalidation/resend policy, session
  revocation, email provider, rate limiting, audit wiring, routes/UI/E2E. No
  `TODO(human)` resolved; `product-decisions.md`/`open-questions.md` untouched.
- RED: `npx vitest run tests/unit/token-crypto.test.ts` → exit 1 (module absent)
  before `lib/tokens/crypto.ts` existed.
- Mutation evidence (each restored byte-for-byte, `shasum`
  `115b335567875114c41e25f73712ca2ff8115946` before/after on the pre-repair
  file): deterministic bytes → 2 failures; 128-bit entropy → 14; raw-as-hash →
  5; format check removed → 5; whitespace allowed → 1; input in error message →
  8; oversized accepted → 2. Post-repair re-check: loosening the canonical
  final-char class back to `{43}` → 1 failure.
- Gates: `git diff --check` 0; `npm ci` 0 (audit: 1 moderate + 4 high, unchanged
  advisories, no force-fix); `format:check` 0; `typecheck` 0; `lint` 0;
  `npm run test` 0 (275 passed, 27 files); `npm run build` 0; `npm run test:e2e`
  0 (21 passed). No DB gate run — this slice touches no schema/table.
- Review: fresh-context read-only review → **PASS WITH FINDINGS** (F1 canonical
  final-char looseness, F2 unpinned digest algorithm — both repaired and
  mutation-rechecked; F3/F4 informational). Reviewer is a subagent sharing the
  builder's model, so this is **NOT** an independent review — a different-model
  review is still required.
- **Full S1-F remains BLOCKED** on Marcel/Aleks answers (`open-questions.md`
  #16–27). Next: independent different-model review of S1-F0, then collect the
  product decisions.

## 2026-09-30 — S1-F (invites/recovery) — plan written; implementation BLOCKED on human decisions

- `docs/tasks/s1-f-invites-recovery-plan.md` written (plan only): 15-area decision
  checklist with options + unapproved recommendations, proposed safe invariants,
  proposed `AccessToken` field-by-field design (one purpose-scoped table
  recommended), service boundary matrix, and the RED test plan for implementation.
- Key reality captured: Auth.js uses **JWT sessions** — existing sessions cannot be
  revoked after password reset without new infrastructure (decision flagged);
  `AuditEvent.workspaceId` is required so user-owned reset/login audit rows need a
  schema decision (open design point §4.2 of the plan).
- No schema change, migration, `lib/tokens.ts`, route, UI, or token code was added —
  documentation only. Verification: `git diff --check` 0; `format:check` 0;
  `typecheck` 0; `lint` 0; `npm run test` 0.
- **Next: collect Marcel/Aleks's answers, record them in `product-decisions.md`/
  `open-questions.md`, then write the S1-F implementation prompt.**

## 2026-09-30 — S1-E independent re-review — PASS (opencode-go/deepseek-v4.1-flash)

- Re-reviewed the repaired S1-E tree at `9f02983` (full range `3415812..9f02983`;
  repair-only `b97c5b5..9f02983`), read-only. Independence: S1-E + repair built by
  SWE-2 High; reviewer authored the earlier FAIL and re-verified independently.
  **PASS** after verifying all four findings.
- P1 (metadata allowlist): `Map`-based own-key lookup + strict `=== true` +
  exception normalization + `Object.defineProperty`. Real PostgreSQL: own
  `constructor`/`toString`/`valueOf`/`__proto__` keys and a throwing getter all
  reject `audit_metadata_forbidden` (no raw `TypeError`); canary leaked 0 rows.
  Mutation check (own-key protection reverted → 2 unit failures) restored
  byte-for-byte.
- P2 (`setPrimaryCoach`): already-active sole primary → `changed:false`, no write,
  no event (`[true,false,false,true]`; UPDATE events 1→2 only on the real switch;
  one ACTIVE PRIMARY). Forced audit failure rolled back a genuine change.
- P3 (docs): closed allowlist wording corrected; deferred items (DENY events,
  login, platform-admin reads, health wrapper, retention, SUPPORT access) retained
  with rationale/prerequisite slices — not dropped.
- P4 (index): additive `20260929170000_stage1_audit_read_index` adds
  `(workspace_id, id)`; `(workspace_id, at)`, S1-A composite FKs, and both partial
  unique indexes remain live.
- Gates (fresh disposable DBs, dropped): `git diff --check` 0; `npm ci` 0;
  prisma format/validate/generate 0; `migrate deploy` 0 (5); `migrate status` 0;
  `format:check` 0; `typecheck` 0; `lint` 0; `npm run test` 0 (251);
  `test:integration` 0 (62, real PG); `build` 0; `test:e2e` 0 (21).
  `npm audit`: 1 moderate + 4 high (unchanged advisories; no force-fix).
- **S1-E is independently PASS at `9f02983`.** No external exposure
  (`assert*ExternallyExposable` still throws). Next: S1-F is eligible for planning
  only, still BLOCKED on the invite/recovery `TODO(human)` policy; S1-G/S1-H remain
  later.

## 2026-09-30 — S1-E independent review FAIL (DeepSeek) repaired; re-review PENDING

- `opencode-go/deepseek-v4.1-flash` independently reviewed `3415812..b97c5b5` and
  returned **FAIL** on four findings (see `docs/tasks/s1-e-audit.md`):
  P1 fail-open metadata allowlist (`Object.prototype` members resolved as
  validators — reviewer persisted a sensitive canary); P2 `setPrimaryCoach`
  returned `changed:true` + duplicate `UPDATE` event when already primary; P3
  documentation drift (DENY/login/platform-admin/health-audit claims vs the
  implemented subset; recursive deny-list wording); P4 read-path index mismatch
  (`(workspace_id, at)` vs `id`-cursor pagination).
- Repair by SWE-2 High (builder, not reviewer): `META_VALIDATORS` is now a `Map`
  (own-key `get`) + strict `=== true` + exception normalization to
  `audit_metadata_forbidden` + `Object.defineProperty` clean-object build;
  `setPrimaryCoach` early-returns `changed:false` with no writes/event when the
  target is already the sole ACTIVE PRIMARY (index-guaranteed); additive
  migration `20260929170000_stage1_audit_read_index` adds `(workspace_id, id)`
  (EXPLAIN shows Index Only Scan on the read path; `(workspace_id, at)` kept);
  docs reconciled with an explicit deferred-items table.
- RED on `b97c5b5`: unit exit 1 (8/47 failed — prototype keys bypassed,
  TypeError leaked); integration exit 1 (3/14 — canary persisted, duplicate
  event, missing index).
- Mutation evidence (restored byte-for-byte): prototype-chain lookup → 2 unit +
  canary PG failure; unknown keys → 24; no normalization → 1; unconditional
  primary audit → 1; non-tx audit → 6; missing workspace predicate → 1; index
  omitted from migration → 1.
- Gates on repaired tree (fresh disposable `s1e_verify_db`, dropped): all green —
  unit 251, integration 62 (real PG), E2E 21, build 0, typecheck/lint/
  format/prisma 0; `npm audit` unchanged (1 moderate + 4 high).
- Commits: plan `b52848c`; repair `4f8c939`; this handoff commit.
- **S1-E is NOT independently reviewed.** Builder repair only; a fresh
  different-model re-review is required before S1-F or any external exposure.
  S1-F remains blocked.

## 2026-09-29 — Stage 1 / S1-E (metadata-only audit) — implemented; gates green; independent review PENDING

- Built by SWE-2 High: `AuditEvent` + `AuditAction`/`AuditResult` enums, additive
  migration `20260929160000_stage1_audit_events` (no DROP; Restrict/SetNull FKs;
  `workspace_id, at` index); `lib/audit.ts` (closed meta allowlist + value-shape
  rejection, transaction-client-only `writeAuditEvent`, owner-scoped bounded
  `listAuditEvents` 25/100 cursor); audit writes coupled inside the S1-D consent
  and S1-C assignment Serializable transactions (`GRANT`, `REVOKE`, `ASSIGN`,
  `UPDATE`; `changed:true` only; audit failure rolls the mutation back; denied/
  failed/idempotent paths write nothing). No routes/actions/UI; assertions still
  fail closed.
- RED: unit suite exit 1 (module absent); integration exit 1 (table absent).
- Mutation evidence (restored byte-for-byte): missing grant audit → 3 failures;
  meta-validator bypass → 11; non-tx audit write → 4; dropped workspace scope →
  1; audit on no-change revoke → 1; missing removal audit → 1.
- Gates (fresh disposable `s1e_final_db`, dropped): `git diff --check` 0;
  `npm ci` 0; prisma format/validate/generate 0; `migrate deploy` 0 (4);
  `migrate status` 0; `format:check` 0; `typecheck` 0; `lint` 0;
  `npm run test` 0 (239); `test:integration` 0 (56); `build` 0; `test:e2e` 0
  (21). `npm audit`: 1 moderate + 4 high (unchanged recorded advisories).
- Deferred (`TODO(human)`-class): DENY audit for denied attempts (pre-tx denials
  cannot share the mutation transaction; needs abuse policy), audit retention
  period, SUPPORT audit-read policy, platform-admin audit read plumbing.
- Commits: plan `45752bc`; implementation `87a4d0a`; this handoff commit follows.
  **Not pushed. Independent different-model review required before S1-F or any
  external exposure.**

## 2026-09-29 — S1-D independent re-review — PASS (SWE-2 High)

- **SWE-2 High** independently re-reviewed the complete S1-D tree at `3415812`
  (range `85feade..3415812`, repair `ec8250c..3415812`), read-only, and returned
  **PASS**. The earlier `gpt-6-astra` FAIL at `ec8250c` and its repair history are
  preserved below and in `docs/tasks/s1-d-versioned-consent.md`.
- Verified on a fresh disposable PostgreSQL (`s1d_review_db`, dropped after): migration
  additive (no DROP); S1-A composite FKs + `client_assignment_one_active_primary_key`
  - `consent_record_active_version_key` live; P2002 recovery accepts only the observed
    raw-index metadata and re-authorizes in a fresh Serializable transaction; P2034 →
    `consent_conflict`; real concurrent grant left exactly one active row; 137-row
    history test proves 100-item max / 25 default / cursor traversal; every consent query
    workspace-scoped; authorization precedes policy/registry/consent reads; PED_HRT and
    COACH_ATTESTED denied; no route/UI/API exposure, no audit table, no S1-E code.
- Gates (real exit codes): `git diff --check` 0; `npm ci` 0; `prisma format` 0;
  `prisma validate` 0; `prisma generate` 0; `migrate deploy` 0; `migrate status` 0;
  `format:check` 0; `typecheck` 0; `lint` 0; `npm run test` 0 (204);
  `test:integration` 0 (48); `build` 0; `test:e2e` 0 (21). `npm audit`: 1 moderate +
  4 high (unchanged recorded advisories; no force-fix).
- **S1-D is PASS.** Next: plan `docs/tasks/s1-e-audit.md`, then implement S1-E
  test-first; S1-E still requires its own independent different-model review and does
  not by itself authorize exposing mutations.

## 2026-09-29 — S1-D repaired after independent Astra FAIL; gates green; Astra re-review pending

- `gpt-6-astra` reviewed `ec8250c` and failed five items: stale authorization in P2002
  recovery; unrelated P2002 accepted; ineffective five-row pagination bound; inaccurate
  read-transaction documentation; UUID wording for PostgreSQL `TEXT`/CUID identifiers.
- Plan `6e8e2e6`, production/tests repair `942879e`. Recovery now verifies the observed
  raw-index P2002 metadata and repeats `consent/write` authorization inside a new Serializable
  transaction before any consent read; version drift and unrelated conflicts fail closed.
- RED: `npx vitest run tests/unit/consent.test.ts` → exit 1, 16 failed / 16 passed before
  production repair. PostgreSQL raw-index P2002 target was
  `["client_profile_id","kind","version"]` with `modelName:"ConsentRecord"`; synchronized
  production-service duplicate race returned P2034, one active row, one structural conflict.
  The bound now uses 137 synthetic revoked rows. Eight temporary mutations across the
  requested cases each caused a test failure and were restored.
- Gates on repair tree: `git diff --check` 0; `npm ci` 0; Prisma format/validate/generate 0;
  migrate deploy/status 0; format/typecheck/lint 0; unit 204/204; integration 48/48;
  build 0; E2E 21/21. Invalid login remained generic. Migration and S1-A/S1-D raw
  constraints unchanged. No route, UI, audit table or S1-E code added.
- This is builder repair, not independent approval. S1-E remains blocked; no consent or
  assignment mutation is externally exposed. Next action: independent Astra re-review.

## 2026-09-29 — Stage 1 / S1-D (versioned consent) — implementation hardened; gates PASS; independent review PENDING

- Built: `ConsentRecord` + `ConsentKind`/`ConsentSource` schema/migration (partial unique index
  where `revoked_at IS NULL`); `lib/consent.ts` (fail-closed policy registry, grant/revoke/read
  own consent (grant/revoke in Serializable transactions; read guarded separately),
  exact-version gate, closed protected
  mapping, PED/HRT + coach-attested fail-closed, audit exposure assertion). No routes/UI/audit.
- Hardening (builder repair from preliminary findings, NOT an independent review): authorization
  now precedes policy/version resolution; workspace relation predicate embedded in every consent
  query; `authorizeHealthOperation` loads only the required active `(kind, version)` rows;
  `readOwnConsentStatus` is bounded/cursor-paginated (default 25, max 100); racing P2002 is
  idempotent only when the exact active row exists, else `consent_conflict`; PED/HRT granting
  denied even with a registry version; `consent-audit.md` corrected to the actual partial index.
  RED evidence (5 new tests failed pre-repair) + 5 hardening mutations proven and restored.
- Verified: `npm run test` → 189 passed; `npm run test:integration` → 46 passed (real PostgreSQL).
  Full gates: `git diff --check` 0; `npm ci` 0; prisma format/validate/generate 0; migrate
  deploy/status 0; `format:check` 0; `typecheck` 0; `lint` 0; `build` 0; `test:e2e` 21. Migration
  is additive (no DROP). Mutation-proved 5 invariants (plus 5 hardening mutations).
- Review: fresh-context but **same model (NOT independent)**; found a HIGH fail-open (workspace
  scope with omitted clientProfileId dropped the query filter). Repaired + regression tests;
  affected gates re-run green. **Independent different-model review PENDING** — S1-D not marked
  complete; mutations remain unexposed.
- Not pushed. Next action: fresh independent different-model S1-D review, then S1-E
  (metadata-only audit logging) only after PASS.

## 2026-09-29 — Stage 1 / S1-C (client ownership & assignments) — PASS (local, not pushed)

- Built: `lib/workspace/clients.ts` (guarded client-profile list/read/create/update; assignment
  list/assign/set-primary/remove), `authorizeCollection` (guard), tx-client adapter type.
  Workspace-scoped queries, bounded cursor lists (25/100), coach-capable target rules, Serializable
  transactions, structural errors. Schema only additions: none.
- Verified: `npm run test` → 172 passed; `npm run test:integration` → 35 passed (S1-A/S1-B/S1-C,
  real PostgreSQL). Full gates: `git diff --check` 0; `npm ci` 0; prisma validate/generate/deploy/
  status 0; `format:check` 0; `typecheck` 0; `lint` 0; `build` 0; `test:e2e` 21;
  `git diff 3adb56f -- db/` empty. Mutation-proved the workspace predicate, REMOVED-assignment
  handling, and assistant-primary denial.
- Review: independent fresh-context subagent (shares the builder's model — diversity not claimed)
  PASS with 2 non-blocking observations, both hardened; re-check PASS.
- Audit-wiring limitation: assignment mutations cannot be externally exposed until S1-E couples
  audit writing (`assertAssignmentMutationsExternallyExposable`).
- Not pushed. Next action: S1-D (versioned consent).

## 2026-09-29 — Stage 1 / S1-B (authorization core) — PASS (local, not pushed)

- Built: reviewed RBAC matrix (`lib/auth/rbac.ts`); default-deny, DB-resolved guard
  (`lib/auth/guard.ts` + `AccessDeniedError`); narrow workspace-constrained Prisma adapter
  (`lib/workspace/access.ts`); inactive-login denial. No routes/UI/consent/audit/tokens/GDPR/
  schema.
- Verified: `npm run test` → 158 passed (rbac 4, guard 14, credentials +inactive);
  `npm run test:integration` → 26 passed (real PostgreSQL: S1-A 13 + S1-B 13). Full gates:
  `git diff --check` 0; `npm ci` 0; prisma validate/generate/deploy/status 0; `format:check` 0;
  `typecheck` 0; `lint` 0; `build` 0; `test:e2e` 21; `git diff eb33a4d -- db/` empty.
- Review: independent fresh-context subagent (shares the builder's model — diversity not claimed)
  PASS; one minor stale-comment finding fixed and re-checked. Mutation-proved the SUPPORT denial
  and the workspace-scoped client query.
- Not pushed. Next action: S1-C (client ownership & assignment services).

## 2026-09-29 — Stage 1 / S1-A (identity & multi-tenant schema) — PASS (local, not pushed)

- Built: `User.platformRole`/`status` (safe defaults); `Workspace`, `WorkspaceMember`,
  `CoachProfile`, `ClientProfile`, `ClientAssignment` + enums/indexes; migration
  `20260929120000_stage1_identity_tenancy` with composite same-workspace FKs and an
  active-primary partial unique index. Schema only.
- Verified (real disposable PostgreSQL): integration `npm run test:integration` → 0; 13 passed
  (migration on existing user + auth preserved; cross-workspace rejected; multiple coaches;
  single active primary; removal keeps client; no forbidden tables; constraint-presence).
  Full gates: `git diff --check` 0; `npm ci` 0; prisma validate/generate/deploy/status 0;
  `format:check` 0; `typecheck` 0; `lint` 0; `test` 139; `build` 0; `test:e2e` 21.
- Review: independent fresh-context subagent (shares the builder's model — diversity not claimed)
  PASS with 4 findings, all fixed, re-check PASS. Behavioral gate = real migration/constraint
  suite (no UI; no browser evidence).
- Not pushed. Next action: S1-B (RBAC + default-deny guard), test-first.

## 2026-09-29 — Stage 1 planning (multi-tenant security) — plan reviewed; implementation NOT started

- Part A (docs reconciliation): updated TRACKER HEAD to `f40d9a8` + local-only status; replaced
  "Marshall" with "Marcel"; recorded the received `CRE8_Input_Flow_Overview.html`, its confirmed
  CRE8 mappings, and its stated limits; removed "forthcoming schematic" wording; noted it
  explicitly excludes PRGRSS 2.0.
- Part B (plan): `docs/tasks/stage-1-plan.md`, `docs/security/data-ownership.md`,
  `docs/security/authorization-model.md`, `docs/security/consent-audit.md` — tenant/identity
  model, default-deny authorization matrix (10+ denial cases), versioned consent, metadata-only
  audit, invite/recovery tokens, GDPR/storage boundaries, and an 8-slice implementation sequence.
- Verified: `git diff --check` 0; `npm run format:check` 0; `npm run verify` 0 (139 tests);
  `npm run test` unaffected. No migration, no `db/schema.prisma` change, no Stage 1 code.
- Review: independent fresh-context subagent (shares the builder's model — diversity not claimed)
  FAILED first with 14 findings; all 14 fixed and re-checked to PASS.
- Not pushed. Next action: implement Stage 1 slice S1-A only after plan approval.

## 2026-09-29 — Stage 0 (repository/process correction) — PASS (local, not pushed)

- Built: root `AGENTS.md`; `docs/product-decisions.md`; corrected `docs/open-questions.md`
  licensing wording; `docs/tasks/stage-0.md` plan; `lib/sheet-viewer.ts` dev gate for
  `/sheets*`; `package.json` `format:check`; expanded CI (Postgres service + prisma
  generate/validate + format/typecheck/lint/test/build/e2e); `.prettierignore` ignores
  generated `spec/`; Playwright `webServer.env` supplies a deterministic test-only
  `AUTH_SECRET` + `DATABASE_URL`; mechanical Prettier normalization.
- Verified (final tree): `git diff --check` 0; `npm ci` 0; `format:check` 0; `typecheck` 0;
  `lint` 0; `test` → 21 files / 139 tests; `npx prisma validate` 0; `build` 0;
  `test:e2e` → 21 passed; `npm audit` → 1 (1 moderate + 4 high, no safe fix).
- Behavioral: flags OFF → `/sheets*` 404; flags ON → `/sheets*` and `/daily` 200; invalid login
  generic error, no crash; 390px/1440px no document overflow; no console errors.
- Review: independent fresh-context subagent (shares the builder's model — diversity not
  claimed), PASS with 2 non-blocking findings, both repaired.
- Risks: audit advisories unresolved (next→16 major, prisma→6.12.0 downgrade); 99 MB cell
  artifacts stay out of production request paths; large formatting-only diff.
- Not pushed. Next action: prepare/review the Stage 1 multi-tenant security plan before any
  migration.

## 2026-09-29 — Phase B0 (Daily Tracker prototype) — PASS

- Built: dev-only, client-side, in-memory Daily Tracker entry prototype at `/daily`
  (`lib/daily-prototype.ts`, `app/daily/*`) with a visible "not saved" notice and
  an in-memory week view. Source-backed fields only; computed column shows `TODO(product)`.
- No persistence of any kind (no DB/schema/server actions/localStorage/cookies). Gated by
  `ENABLE_DAILY_PROTOTYPE=1` (reached directly at `/daily`, not linked); production default returns 404.
- Verified: `npm run verify` → 0 (133 tests); `npm run build` → 0; `npm run test:e2e` → 0
  (21 passed; asserts no write network request + refresh clears state).
- Blocked: persistence requires stakeholder decisions (roles/ownership, access scoping,
  retention/deletion, consent/audit, exposure/licensing).
- Next action: none — await decisions before Phase B1.

## 2026-09-29 — Phase A (product UI) — PASS

- Built: read-only Foods/Exercises libraries (`spec/data/*.json`) and a read-only viewer for
  all 11 sheets (`spec/sheets/<slug>.json` + summaries); sparse grid rendering (empty cells not
  rendered, spans/coords preserved); redacted cells show a neutral `▨` marker; tokenized theme.
- Modules: `lib/catalog.ts`, `lib/spec-artifacts.ts`, `components/app-nav.tsx`; routes
  `/sheets`, `/sheets/[slug]`, `/library/foods`, `/library/exercises`.
- Verified: `npm run verify` → 0 (123 tests); `npm run build` → 0; `npm run test:e2e` → 0
  (16 passed incl. a11y + 390px mobile). Read-only; no auth/exposure change.
- Caveats: licensing/exposure decision unresolved; no formulas/estimation/roles/writes.
- Next action: await approval for Phase B (source-clear daily entry) — not started.

## 2026-09-29 — Phase 12 — PASS

- Final audit: local == remote == `e6cdcb7` before the Phase 12 fix; all 11 redacted cell
  artifacts + 11 summaries + `theme.json` + `cross-sheet.md` + `spec/data/*.json` + manifest
  present and schema-valid; manifest bijective with redacted cells (20,856); 0 leaked
  `normalized`/`todo`; no client/DOB/secret in tracked files or published history.
- Narrow fix: MENSES `CYCLE PHASE GUIDE` kept via a source-located region (`mensesGuideRegion`),
  since it is generic static product copy; client values outside the region stay redacted.
  Counts now 11,052 kept / 20,856 redacted / 780,030 empty; manifest 20,878.
- Verified: `npm run verify` → exit 0 (106 tests); `--redacted` twice → byte-identical; guards
  (`--raw` no dir, `--raw` into `spec/sheets`) exit 1; source untouched; size 99 MB (reported,
  left unchanged).
- Deliverable scope: foundation + extraction artifacts only — NOT the workbook UI or formulas
  absent from the HTML export.
- Next action: none (awaiting direction); product roadmap is separate (see final report).

## 2026-09-29 — Phase 11 — PASS

- Built: `lib/extraction/redact.ts` (fail-closed, source-aware redaction); `--redacted` mode
  in `scripts/extract-sheets.ts`; committed `spec/sheets/<slug>.json` ×11 (811,938 cells
  total) and `spec/redaction-manifest.json`. Final counts (post Phase 12 fix): 11,052 kept,
  20,856 redacted, 780,030 empty; manifest 20,878 (20,856 cell-level + 22 document-level).
- Redacted categories: `client.daily-entry`, `client.profile`, `client.plan`,
  `client.mealplan`, `client.menses`, `client.peaking`, `client.show`, and `vendor.contact`
  (1 vendor credit in the Nutrition reference sheet). No original values in artifacts or
  manifest; redacted cells carry no `normalized`; contacts blocked everywhere.
- Verified: `npm run verify` → exit 0 (104 tests). `--redacted` twice → byte-identical
  (sheets + manifest diffs exit 0). Source dir untouched. `--raw` guard intact.
- Caveats: committed artifacts are large (~99 MB, dominated by 780k empty cells); the MENSES
  cycle-phase guide is over-redacted (phase words also appear as client values).
- Next action: Phase 12 (final verification and delivery), then the separate product roadmap.

## 2026-09-29 — Phase 10 — PASS

- Built: `lib/extraction/{summaries,theme,crosssheet}.ts`; `--spec-only` mode in
  `scripts/extract-sheets.ts`; committed `spec/sheets/<slug>.summary.json` (11),
  `spec/theme.json`, `spec/cross-sheet.md`; tests for summaries/theme/cross-sheet/privacy.
- Verified: `npm run verify` → exit 0 (89 tests). `npm run extract:sheets -- --spec-only`
  twice → summaries/theme/cross-sheet diffs exit 0 (byte-identical). Source dir untouched.
  Privacy: only curated static labels, reference-data names, and CSS values emitted; no cell
  dumps; cross-sheet omits client-bearing values.
- Caveats: summary block boundaries are marker-inferred; committed redacted `spec/sheets`
  cell artifacts remain deferred to the redaction phase.
- Next action: Phase 11 (test, determinism, privacy pass).

## 2026-09-29 — Phase 9 — PASS

- Built: `lib/extraction/databases.ts`; `spec/data/foods.json` (599), `spec/data/exercises.json`
  (546); `--data-only` mode.
- Verified: `npm run verify` → exit 0; `--data-only` twice → no diff.

## 2026-09-29 — Phase 8 — PASS

- Built: `lib/extraction/{parse,css,normalize}.ts`; parse all 11 sheets; `--raw` opt-in.
- Verified: 811,938 cells parsed; checkbox counts match markup; determinism via diff.

## 2026-09-29 — Phase 7 — PASS

- Built: extraction contract (`docs/extraction-contract.md`, `lib/extraction/{contracts,source}.ts`)
  and non-writing `--dry-run`.

## 2026-09-29 — Phase 6 — PASS

- Built: Docker Postgres, minimal Prisma `User` migration, Auth.js Credentials (JWT, scrypt),
  tokenized `pro-dark`/`pro-white` themes, `.env.example`, README. Part A gate passed before
  Phase 7.

## 2026-09-29 — Phase 5 — PASS

- Built: Next.js 15 / React 19 / strict TS / Tailwind 4 / Vitest / Playwright / ESLint /
  Prettier scaffold; neutral "app" identity; smoke test.

## 2026-09-29 — Phase 4 — PASS

- Built: redacted `docs/source-inventory.md`, `docs/reuse-assessment.md`,
  `docs/implementation-plan.md`, `docs/redaction-policy.md`, `docs/open-questions.md`,
  `spec/redaction-manifest.json`. Plan committed before code.

## 2026-09-29 — Phase 3 — PASS

- Reuse/adapt/omit assessment of Prime State (technical foundation only).

## 2026-09-29 — Phase 2 — PASS

- Audited 11 exports + resources; flagged PII; confirmed xlsx absent.

## 2026-09-29 — Phase 1 — PASS

- Cloned the empty new repository; Prime State untouched.

## Open TODO(product) items

- Missing `Copy of PRGRSS 2.0.xlsx` (formulas/validations/hidden rows unrecoverable).
- Missing images `cellImage_2050288505_0.jpg`, `cellImage_227302925_0.jpg`.
- Formula semantics (calories, averages, cycle estimation, T-minus, meal subtotals),
  water/salt average swap, sparkline config, SUPPLEMENTATION/PEAKING/SHOWDAY wiring.
- Product name/branding, license terms, PED/HRT policy, i18n.
