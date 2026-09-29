# STATUS — App foundation & extraction build

Append-only loop memory (newest first). "Done" = the exact gate re-run on the current
tree with a real exit code. This repo covers Phases 1–12 (foundation + spreadsheet-source
extraction) only, not the workbook UI itself.

## 2026-09-29 — Stage 1 / S1-D (versioned consent) — gates PASS; independent review PENDING

- Built: `ConsentRecord` + `ConsentKind`/`ConsentSource` schema/migration (partial unique index
  where `revoked_at IS NULL`); `lib/consent.ts` (fail-closed policy registry, grant/revoke/read
  own consent in Serializable tx with tx-bound auth, exact-version gate, closed protected
  mapping, PED/HRT + coach-attested fail-closed, audit exposure assertion). No routes/UI/audit.
- Verified: `npm run test` → 184 passed; `npm run test:integration` → 44 passed (real PostgreSQL).
  Full gates: `git diff --check` 0; `npm ci` 0; prisma format/validate/generate 0; migrate
  deploy/status 0; `format:check` 0; `typecheck` 0; `lint` 0; `build` 0; `test:e2e` 21. Migration
  is additive (no DROP). Mutation-proved 5 invariants.
- Review: fresh-context but **same model (NOT independent)**; found a HIGH fail-open (workspace
  scope with omitted clientProfileId dropped the query filter). Repaired + regression tests;
  affected gates re-run green. **Independent different-model review PENDING** — S1-D not marked
  complete; mutations remain unexposed.
- Not pushed. Next action: independent review of S1-D, then S1-E (metadata-only audit logging).

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
