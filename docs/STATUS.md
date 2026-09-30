# STATUS — App foundation & extraction build

Append-only loop memory (newest first). "Done" = the exact gate re-run on the current
tree with a real exit code. This repo covers Phases 1–12 (foundation + spreadsheet-source
extraction) only, not the workbook UI itself.

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
