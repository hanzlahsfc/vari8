# Tickets from production-readiness audit

Code tickets: 95. People gaps: 10.

## Index by owning PLAN PR

PLAN ids come from PLAN v1, DECISIONS D15 to D36 and the draft PLAN v2 card graph (`icm/05-build/graph.json`). Checklist ids (`PR-001` to `PR-147`) are a separate namespace. `NEW` tickets need a card before they can be built. The orchestrator files GitHub issues; this file creates none.

| Owner | Tickets |
|---|---|
| PLAN PR-01 | PR-123 [P1], PR-125 [P1] |
| PLAN PR-03 | PR-039 [P0], PR-062 [P0], PR-132 [P1], PR-136 [P1] |
| PLAN PR-04 | PR-094 [P1], PR-140 [P1] |
| PLAN PR-05 | PR-002 [P0], PR-003 [P0], PR-005 [P0], PR-009 [P0], PR-010 [P0], PR-011 [P0], PR-013 [P0], PR-023 [P0], PR-092 [P0], PR-004 [P1], PR-014 [P1], PR-047 [P1], PR-090 [P1], PR-108 [P1], PR-110 [P1], PR-012 [P2], PR-139 [P2], PR-142 [P2], PR-143 [P2] |
| PLAN PR-31 | PR-131 [P2] |
| PLAN PR-M0 | PR-001 [P0], PR-015 [P0], PR-024 [P0], PR-017 [P1], PR-022 [P1] |
| PLAN PR-MEDIA | PR-042 [P1], PR-076 [P2] |
| PLAN PR-R1 | PR-065 [P2], PR-137 [P2] |
| PLAN PR-SV1 | PR-032 [P1] |
| PLAN PR-W3 | PR-128 [P2] |
| PLAN PR-X1 | PR-141 [P2] |
| NEW (no PLAN PR owns it) | PR-019 [P0], PR-020 [P0], PR-036 [P0], PR-037 [P0], PR-038 [P0], PR-041 [P0], PR-045 [P0], PR-046 [P0], PR-068 [P0], PR-074 [P0], PR-077 [P0], PR-081 [P0], PR-082 [P0], PR-133 [P0], PR-146 [P0], PR-016 [P1], PR-018 [P1], PR-021 [P1], PR-026 [P1], PR-031 [P1], PR-044 [P1], PR-050 [P1], PR-051 [P1], PR-060 [P1], PR-063 [P1], PR-064 [P1], PR-069 [P1], PR-070 [P1], PR-075 [P1], PR-078 [P1], PR-080 [P1], PR-083 [P1], PR-086 [P1], PR-087 [P1], PR-093 [P1], PR-097 [P1], PR-124 [P1], PR-126 [P1], PR-130 [P1], PR-134 [P1], PR-147 [P1], PR-048 [P2], PR-049 [P2], PR-059 [P2], PR-061 [P2], PR-066 [P2], PR-067 [P2], PR-084 [P2], PR-085 [P2], PR-088 [P2], PR-089 [P2], PR-096 [P2], PR-135 [P2], PR-138 [P2], PR-144 [P2] |

## Shared-fix groups

Tickets in one group share one fix and should land in one card.

| Group | Owner | Tickets | Fix |
|---|---|---|---|
| G1 Better Auth login hardening | PLAN PR-05 | PR-002, PR-003, PR-004, PR-005, PR-013, PR-014, PR-110 | One Better Auth config: email normalization hook, 60 minute single-use reset, twoFactor with backup codes, revokeSessions, DB-backed rateLimit (also sign-up, D17). Survivor tests from AUTH-DECISION.md: 429 on login, two-browser revocation, inactive sign-in denied, malformed bearer 401, expired reset fails. |
| G2 ROLES table and scoped access | PLAN PR-05 | PR-009, PR-010, PR-011 | lib/auth/roles.ts from D15, one server check, one table-driven test of every actor by capability, getViewer() scoping every read; delete CUT-AT-REPLACE permission tests. |
| G3 Admin, support and impersonation | PLAN PR-05 | PR-012, PR-142, PR-143 | Better Auth admin plugin plus an audit row per impersonation. D15 denies a platform console today, so confirm scope with the owner before building UI. |
| G4 API boundary | PLAN PR-05 | PR-023, PR-108, PR-047 | Zod at every app/api/v1 boundary and server action, versioned routes, sign-in and failed sign-in audit events. |
| G5 Hosting baseline | NEW | PR-019, PR-020, PR-021, PR-078, PR-045, PR-046, PR-060, PR-061, PR-063, PR-064, PR-066, PR-067, PR-068, PR-077 | Needs the owner's hosting and database vendor choice first. Then: managed Postgres with PITR and TLS, a separate migration role, staging, IaC, rollback, health endpoint, domain and TLS, budget alerts. |
| G6 Observability | NEW | PR-080, PR-081, PR-082, PR-083, PR-084, PR-085, PR-086, PR-087, PR-088, PR-089, PR-124 | Structured logger with request id, error tracking, external uptime check on a DB-touching health route, alert routing to a named person, runbooks. |
| G7 Mail | NEW | PR-074, PR-075, PR-126, PR-069, PR-070 | Needs the owner's mail provider choice (D17). Then SPF, DKIM, DMARC, bounce handling, templates, and a durable queue for sends. |
| G8 Local gate and supply chain | PLAN PR-03 | PR-062, PR-039, PR-132 | Commit verify-local.sh as scripts/verify-local.sh, fix format:check, add npm audit or osv-scanner (owner to confirm), clear the 4 high advisories. |
| G9 Schema chain | PLAN PR-M0 | PR-001, PR-015, PR-017, PR-022, PR-024 | One migration set for canvas entities with a design doc, rollback note per migration, a drift guard so prisma migrate dev cannot drop the 83 raw-SQL FKs, timestamptz on identity tables. |

## Verification tasks (UNVERIFIED rows, no code ticket yet)

These need a live probe on a local stack before they can be graded. P0 rows block launch until graded PRESENT.

- [P0] PR-025 Apostrophes in names: No string-built SQL with user values seen in samples; all 140 raw calls not read one by one. Needs the live probe: create Siobhan O'Brien-Nunez with accents, view profile and any export.
- [P0] PR-040 Input sanitization everywhere a user can type: Static review clean: React escapes user text and no user HTML is rendered. Needs the live probe (save img onerror and =HYPERLINK into note fields, view them). No CSP backs it up (PR-044).
- [P1] PR-122 Pages that load on hotel wifi: Needs a throttled live run: Playwright with a 400 kbps, 400 ms RTT profile on /login, the workspace dashboard and the daily entry form, plus next build route sizes. Statically, no route-level loading UI exists in the root app.
- [P1] PR-129 Keyboard navigation and screen reader support: Static signals look reasonable but no keyboard or screen reader walkthrough is recorded. Needs a live keyboard-only pass of login, daily entry, check-in and the canvas dialogs (Tab order, Escape, focus trap and return).

## Code tickets

### [P0] PR-001 Designed schema, not improvised tables

Owning PLAN PR: PLAN PR-M0. Shared fix group: G9.

Labels: production-readiness, area:data-model, severity:p0

Current state (PARTIAL): db/schema.prisma: 48 models, 235 @relation, 76 @unique or @@unique (rg -c); ownership design in docs/security/data-ownership.md:1-30 Owner: PLAN PR-M0. Foreign keys and natural-key uniques are broad, incl. composite same-workspace FKs. The design doc covers Stage 1 only and still says no migration exists yet (data-ownership.md:3-4). D1 says canvas entities lack tables today.

Why it matters: Duplicate entities, missing foreign keys and nullable everything; every new feature fights the schema and data drifts into contradictory states.

Acceptance: re-run the check and get PRESENT. Check: Read the schema file (`prisma/schema.prisma`, `db/schema.prisma`, `**/migrations/*.sql`). `rg -n "@relation|REFERENCES|@@unique|UNIQUE" <schema>` shows foreign keys and uniqueness. `rg -c "String\?" <schema>` against total fields flags blanket nullability. PRESENT: an ER diagram or design doc exists, every relation has a foreign key, natural keys are unique. PARTIAL: keys exist but no doc, or several tables duplicate one concept.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P0] PR-002 Login works with a plus sign in the email

Owning PLAN PR: PLAN PR-05. Shared fix group: G1.

Labels: production-readiness, area:auth, severity:p0

Current state (PARTIAL): lib/credentials.ts:29-30 normalizeEmail trims and lowercases; used at lib/credentials.ts:44, lib/tokens/store.ts:70, lib/workspace/invitations.ts:88, lib/auth/password-reset.ts:66; regex at password-reset.ts:72 accepts plus Owner: PLAN PR-05. Normalization before lookup is in place and the regex allows plus. User.email @unique is case-sensitive at db/schema.prisma:126, so safety depends on every writer normalizing. Live plus-address probe not run. PR-05-OWNED: normalization moves to a Better Auth sign-in hook.

Why it matters: `jane+work@example.com` cannot sign up or log in because a regex or URL encoding turns `+` into a space, or case differences create two accounts.

Acceptance: re-run the check and get PRESENT. Check: `rg -n "email.*(regex|RegExp|match|test)|z\.string\(\)\.email|toLowerCase\(\)" lib app`. Live: sign up and log in with `test+probe@<domain>` and `Test+Probe@<domain>`; both must reach one account. Check the reset link with a plus address survives URL encoding. PRESENT: live probe passes and emails are normalized (trim, lowercase) before unique lookup.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P0] PR-003 Password reset links expire and work once

Owning PLAN PR: PLAN PR-05. Shared fix group: G1.

Labels: production-readiness, area:auth, severity:p0

Current state (PARTIAL): lib/tokens/store.ts:36 ACCESS_TOKEN_TTL_MS 12 h, :145 expiresAt; lib/tokens/crypto.ts:77 randomBytes(32), :99 sha256 stored hash; lib/auth/password-reset.ts:343 atomic claim, :374 sessionVersion increment; tests/integration/s1-f2d-password-reset.test.ts:379,477,579 Owner: PLAN PR-05. Random, hashed, single-use, revokes sessions on reset. Expiry is 12 h, longer than the decided 60 minutes (AUTH-DECISION orchestrator ruling). AUTH-DECISION citations re-verified at this commit. PR-05-OWNED.

Why it matters: A leaked or forwarded reset email is a permanent account takeover key.

Acceptance: re-run the check and get PRESENT. Check: `rg -n "reset|verificationToken|expires|usedAt|consumed" lib app <schema>`. Token must be random (`crypto.randomBytes` or equivalent), stored hashed, carry an expiry (minutes to an hour), and be deleted or marked used on success. Live: request a reset, use the link, then open it again: second use must fail. Wait past expiry on a fresh link: must fail. PRESENT: both live probes fail closed and old sessions are revoked after reset.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P0] PR-005 Session timeout and kill all sessions

Owning PLAN PR: PLAN PR-05. Shared fix group: G1.

Labels: production-readiness, area:auth, severity:p0

Current state (PARTIAL): auth.config.ts:16 JWT strategy, no maxAge or updateAge set (rg -> exit 1); lib/auth/session.ts:64-82 sessionVersion gate on every request; lib/auth/password-reset.ts:374 bump on reset; app/logout/actions.ts:6-7 signOut only Owner: PLAN PR-05. Revocation works on password reset via sessionVersion (tests/integration/s1-f2b-session-runtime.test.ts:99). Timeouts are Auth.js defaults (30 days absolute), no idle limit, no sign-out-everywhere action. PR-05-OWNED: Better Auth revokeSessions.

Why it matters: Stolen cookies stay valid forever and you cannot evict an attacker or an offboarded staff member.

Acceptance: re-run the check and get PRESENT. Check: Auth config `maxAge`/`updateAge` (`rg -n "maxAge|updateAge|session:" auth.ts auth.config.ts lib/auth`). JWT sessions cannot be revoked without a denylist or version counter; database sessions can be deleted. `rg -n "sessionVersion|tokenVersion|deleteMany\(.*session" lib app`. Live: log in on two browsers, trigger "sign out everywhere" or a password change, reload the other browser: it must be logged out. PRESENT: idle and absolute timeouts set, and the revoke-all probe passes.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P0] PR-009 Roles deeper than admin and everyone else

Owning PLAN PR: PLAN PR-05. Shared fix group: G2.

Labels: production-readiness, area:authz, severity:p0

Current state (MISSING): lib/auth/roles.ts absent; lib/auth/rbac.ts:126,134,149,164,172 coach scope assigned not workspace; :148,:163,:182,:418 owner plan and review writes assigned only; :89 coach workspaceSettings write denied; :214 owner coachNotes write denied; :118 coach clientAssignments denied; :167 client trainingPlansLogs write own Owner: PLAN PR-05. D15 decided cells not enforced: staff should hold equal rights over every workspace client (D22); today coaches need an assignment and owners need one for plan writes. Client plan edits are blocked in services (lib/trainingprogram/service.ts:586-590), not by one table. Enforcement is server side: 1 route file (Auth.js catch-all), 24 server-action files with 88 actions, authorize() in 25 lib services (guard.ts:235). No table-driven role test. PR-05-OWNED.

Why it matters: Support staff can delete customers, assistants see billing, and every new role request becomes an `if (user.isAdmin)` patch.

Acceptance: re-run the check and get PRESENT. Check: `rg -n "role|permission|can\(|hasPermission|rbac" lib/auth <schema>`. PRESENT: a role by capability matrix in one place, checked server-side in every route and server action (`rg -n "export (async function|const) (GET|POST|PUT|PATCH|DELETE)" app/api` versus guard calls in the same files). A generated table test covers every role by capability.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P0] PR-010 No IDOR: user A cannot read user B by changing an id

Owning PLAN PR: PLAN PR-05. Shared fix group: G2.

Labels: production-readiness, area:authz, severity:p0

Current state (PARTIAL): npm run test:integration (scratch run at 55a0f08, disposable DB) -> exit 0: 55 files, 873 tests passed, including tests/integration/s1-b-authorization.test.ts:194,220 and tests/integration/mealplan-i1.test.ts:428 two-user cases; lib/auth/guard.ts:300-319 own and assigned scopes Owner: PLAN PR-05. Server-side scoping holds and the two-user suites pass. PARTIAL because the scopes are per service and change under D15 (staff equal over every workspace client, D22) in PLAN PR-05; the live two-user browser replay has not run. Bite of these suites not re-checked by this audit.

Why it matters: Any logged-in user enumerates other users' records by editing a number or cuid in the URL or request body.

Acceptance: re-run the check and get PRESENT. Check: `rg -n "findUnique\(\{ ?where: ?\{ ?id" lib app` and confirm each lookup also filters by owner, workspace or an access check. Live: log in as user A, copy a resource URL or API call, replay it with user B's session; expect 403 or 404. Repeat for read, update, delete. PRESENT: every resource route scopes by owner or tenant and the two-user probe fails closed.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P0] PR-011 Tenant isolation

Owning PLAN PR: PLAN PR-05. Shared fix group: G2.

Labels: production-readiness, area:authz, severity:p0

Current state (PARTIAL): npm run test:integration (scratch run at 55a0f08) -> exit 0, 873 passed, including tests/integration/p010-client-roster.test.ts:91,167 and tests/integration/p021-daily-entry.test.ts:330 cross-workspace cases; rg 'ROW LEVEL SECURITY,CREATE POLICY' db lib -> no matches; 140 queryRawUnsafe or executeRawUnsafe calls in lib Owner: PLAN PR-05. Isolation is enforced per service through authorize() with workspaceId, not centrally (no scoped client, no RLS), and raw SQL bypasses any central layer. Cross-workspace tests exist and must bite when run. getViewer() and v1 boundary arrive in PR-05.

Why it matters: One query missing a tenant filter shows a customer another customer's records.

Acceptance: re-run the check and get PRESENT. Check: Every tenant-owned table has `workspaceId`/`tenantId` (see PR-029). Look for a central scoped client or Prisma extension, or Postgres RLS (`rg -n "\$extends|ENABLE ROW LEVEL SECURITY|CREATE POLICY" lib db`). Grep for raw queries bypassing it: `rg -n "\$queryRaw|\$executeRaw" lib app`. Live: two workspaces, cross-request every list endpoint. PRESENT: central enforcement plus a cross-tenant test that bites.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P0] PR-013 Rate limits on login

Owning PLAN PR: PLAN PR-05. Shared fix group: G1.

Labels: production-readiness, area:auth, severity:p0

Current state (MISSING): rg -n -i 'ratelimit,rate-limit,limiter,429' app lib auth.ts auth.config.ts -> no matches; app/login/actions.ts:17-21 calls signIn with no limiter Owner: PLAN PR-05. No limiter on login, reset request or invite accept. PR-05-OWNED: Better Auth DB-backed rateLimit; D17 also requires a sign-up limit.

Why it matters: Credential stuffing and password guessing run at full speed against every account.

Acceptance: re-run the check and get PRESENT. Check: `rg -n "ratelimit|rate-limit|@upstash/ratelimit|limiter|429" lib app middleware.ts proxy.ts`. Confirm limits on login, signup, reset request and MFA verify, keyed by IP and by account. Live: send 20 failed logins in a minute (against your own staging only) and expect HTTP 429 or a delay. PRESENT: limits on all four endpoints and the probe returns 429.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P0] PR-015 Migrations run forward and roll back

Owning PLAN PR: PLAN PR-M0. Shared fix group: G9.

Labels: production-readiness, area:data-model, severity:p0

Current state (PARTIAL): npx prisma migrate diff --from-migrations db/migrations --to-schema-datamodel db/schema.prisma --shadow-database-url <disposable app_prodready_shadow> --exit-code -> exit 2: 83 'Removed foreign key' entries over 28 tables; migrate deploy -> exit 0, migrate status -> exit 0 'Database schema is up to date' (35 migrations); no down SQL or expand/contract note in db/migrations Owner: PLAN PR-M0. Forward migrations apply cleanly. The drift is intentional raw-SQL composite FKs that schema.prisma cannot see (documented inline, for example db/migrations/20260930170000_stage1_account_security/migration.sql:23), so a careless prisma migrate dev in the schema chain would emit a migration dropping 83 tenant-integrity FKs. No gate guards this and no migration has a rollback plan.

Why it matters: A bad deploy cannot be undone without hand-written SQL under pressure, and staging and production schemas drift.

Acceptance: re-run the check and get PRESENT. Check: `ls prisma/migrations db/migrations` and confirm every schema change has a committed migration. `npx prisma migrate status` against a dev or staging database must report no pending or failed migrations, and the drift check must exit 0. Prisma 6: `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "$SHADOW_DATABASE_URL" --exit-code` (exit 0 no drift, 2 drift, 1 error). `--from-migrations` replays every migration into a shadow database, so `SHADOW_DATABASE_URL` must point at an empty, disposable Postgres database the command may wipe, never production or a shared dev database. Prisma 7 reads the shadow URL from `datasource.shadowDatabaseUrl` in `prisma.config.ts` instead of the flag. Adjust paths to the repo (Vari8: `db/migrations`, `db/schema.prisma`). Prisma has no automatic down migration: PRESENT means a documented rollback per migration (a down SQL file or an expand/contract plan). Rails/Knex/Alembic: grep for `down`/`downgrade` bodies that are not empty.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P0] PR-019 Nightly backups

Owning PLAN PR: NEW (no PLAN PR owns it). Shared fix group: G5.

Labels: production-readiness, area:data-safety, severity:p0

Current state (MISSING): rg -n -i 'pg_dump,pgbackrest,wal-g,backup' scripts docs README.md docker-compose.yml -> only decision text in docs/product-decisions.md:202,235,373 Owner: NEW. No deployment and no backup schedule, script or provider config. Must exist before live client data.

Why it matters: One bad migration, ransomware event or provider incident loses all customer data.

Acceptance: re-run the check and get PRESENT. Check: Provider console or CLI: managed Postgres backup schedule and retention (for example `aws rds describe-db-instances --query "DBInstances[].BackupRetentionPeriod"`, Supabase/Neon dashboard). Self-hosted: `crontab -l`, systemd timers, `rg -n "pg_dump|pgbackrest|wal-g" scripts infra`. PRESENT: automated daily backup, retention of at least 7 days, stored in a separate account or region, alert on failure.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P0] PR-020 Tested restore

Owning PLAN PR: NEW (no PLAN PR owns it). Shared fix group: G5.

Labels: production-readiness, area:data-safety, severity:p0

Current state (MISSING): rg -ln -i 'restore' docs -> no restore runbook (hits are template rollback product text) Owner: NEW. No restore runbook or drill.

Why it matters: The backup turns out to be empty, encrypted with a lost key, or takes 14 hours to restore, discovered during the incident.

Acceptance: re-run the check and get PRESENT. Check: Look for a restore runbook and its last run log (`rg -ln "restore" docs runbooks`). Ask for the date and duration of the last restore drill. Live (staging): restore the latest backup to a scratch database and run `psql -c "select count(*) from <core table>"` against production counts. PRESENT: a dated drill within the last quarter with measured restore time.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P0] PR-023 Server-side validation

Owning PLAN PR: PLAN PR-05. Shared fix group: G4.

Labels: production-readiness, area:input, severity:p0

Current state (PARTIAL): package.json:22-29 no zod dependency; 17 hand-written lib/**/*boundary.ts validators (e.g. lib/onboarding/forms-boundary.ts:76,89); app/login/actions.ts:17-19 passes raw formData to signIn Owner: PLAN PR-05. Most server actions validate through hand-rolled boundary modules; D8 Zod is absent and there is no app/api/v1. Login relies on credentials.ts type checks. Live invalid-payload probe not run. PR-05-OWNED: Zod at every boundary.

Why it matters: Anyone with curl bypasses the form and writes negative amounts, 10 MB strings or other users' ids.

Acceptance: re-run the check and get PRESENT. Check: For each route handler and server action, look for schema parsing at the top: `rg -n "\.parse\(|\.safeParse\(" app/api lib` versus `rg -n "await (req|request)\.json\(\)|formData\(\)" app`. Every input path must parse before use. Live: POST an invalid payload with curl directly to the API and expect HTTP 400 with field errors, not 500 and not success. PRESENT: every write boundary validates and the curl probe returns 400.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P0] PR-024 Timezones stored correctly

Owning PLAN PR: PLAN PR-M0. Shared fix group: G9.

Labels: production-readiness, area:data-model, severity:p0

Current state (PARTIAL): db/schema.prisma:135,136,165,166,214,215,285,286,298,299,343,344,345 are bare DateTime (13 of 122; 95 are Timestamptz, rest @db.Date); no timezone column on User or ClientProfile; app/(tracker)/workspace/[workspaceId]/check-ins/page.tsx:75 server component calls toLocaleString('en-GB') without timeZone Owner: PLAN PR-M0. Identity tables (User, Workspace, WorkspaceMember, CoachProfile, ClientProfile, ClientAssignment) keep timestamp without zone. psql show timezone on the local stack -> UTC. Plans and schedules carry an IANA zone; users do not. A DST test bites: tests/integration/training-i1a.test.ts:1493. Server-rendered due dates use the server zone.

Why it matters: Reminders fire at the wrong hour, daily totals split across the wrong day, and DST shifts move events by an hour.

Acceptance: re-run the check and get PRESENT. Check: On PostgreSQL a bare Prisma `DateTime` maps to `timestamp(3)` without time zone and needs no annotation, so search for the fields that lack one: `rg -n "\bDateTime\b" <schema> | rg -v "@db.Timestamptz"` (Vari8: `db/schema.prisma`). On a migrated database the same columns show up with `psql "$DATABASE_URL" -c "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND data_type = 'timestamp without time zone'"`. PRESENT: every DateTime is `@db.Timestamptz`, or the repo documents a UTC convention (an ADR or schema comment) and enforces it in the app: writes go through Prisma (which sends UTC), the database session zone is UTC (`psql "$DATABASE_URL" -c "show timezone"`, because `@default(now())` becomes `CURRENT_TIMESTAMP`, which a timestamp column stores in the session zone), and raw SQL time writes are absent (`rg -n "now\(\)|CURRENT_TIMESTAMP|SET TIME ZONE" <migrations> lib`). PARTIAL: bare `DateTime` fields without that documented and enforced convention. Also required for PRESENT: users carry an IANA zone (`rg -n "timezone|timeZone|tz" <schema>`), local-day logic uses it (`rg -n "new Date\(\)\.get(Hours|Date|Day)|toLocaleDateString\(\)" lib app` flags server-local date math), and a test covers a DST boundary.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P0] PR-036 Secrets out of code, repo and chat history

Owning PLAN PR: NEW (no PLAN PR owns it).

Labels: production-readiness, area:security, severity:p0

Current state (PARTIAL): git grep at HEAD for AKIA, PRIVATE KEY, sk_live, ghp_, xox, AUTH_SECRET=, inline postgres passwords: only 127.0.0.1 dev or CI URLs (.env.example:11, .github/workflows/ci.yml:25,27, playwright.config.ts:72,126,173, tests/e2e/global-setup.ts:31, docs/tasks and icm docs) and .env.example:15 placeholder; .gitignore covers .env and .env.*; git ls-files shows only .env.example Owner: NEW. No live secret in the tree. Full-history scan not run (lead: gitleaks detect --log-opts=--all). No pre-commit secret hook; no production secret store chosen.

Why it matters: A key committed once lives forever in git history, forks and the AI transcript; anyone with read access can use it.

Acceptance: re-run the check and get PRESENT. Check: `gitleaks detect --source . --log-opts="--all"` or `trufflehog git file://. --only-verified`. `git ls-files | rg -n "\.env($|\.)" | rg -v "example|sample"` must be empty. `.gitignore` covers `.env*`. Ask where secrets live in production (platform env vars, a secret manager). PRESENT: scanners clean on full history, secrets only in env or a vault, a pre-commit secret hook. Report findings by file and line, never the value.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P0] PR-037 Rotate keys exposed to AI tools or configs

Owning PLAN PR: NEW (no PLAN PR owns it).

Labels: production-readiness, area:security, severity:p0

Current state (PARTIAL): .env.example:15 AUTH_SECRET is a placeholder; no rotation procedure or dates in docs (rg -n -i 'rotat' docs/security -> no matches) Owner: NEW. No exposed key found in the tree. No production keys exist yet, and no per-key rotation record or procedure. AI chat transcripts were not scanned.

Why it matters: Keys pasted into a config file or chat last month are still valid and still in someone's logs.

Acceptance: re-run the check and get PRESENT. Check: List every key in `.env.example` and the provider dashboards; ask for the last rotation date per key. Any key found by PR-036 scans, in chat transcripts, or in shared configs counts as exposed. PRESENT: every exposed key rotated after exposure, rotation dates recorded, and a rotation procedure per provider.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P0] PR-038 Every installed package exists and is the intended one

Owning PLAN PR: NEW (no PLAN PR owns it).

Labels: production-readiness, area:security, severity:p0

Current state (PARTIAL): package.json:22-29 six runtime deps, :30-48 dev deps; package-lock.json tracked; package.json allowScripts list for prisma, esbuild, unrs-resolver, fsevents Owner: NEW. Small dependency set, lockfile committed, install scripts listed. No recorded npm view review per package; whether npm enforces allowScripts is unverified.

Why it matters: AI-suggested package names that do not exist get registered by attackers (slopsquatting), or a typo pulls a malicious lookalike.

Acceptance: re-run the check and get PRESENT. Check: For each dependency in `package.json`: `npm view <pkg> name repository.url maintainers time.created` and compare with the intended project. Flag packages created recently, with few downloads, or whose repository does not match. `npm ls --all --depth=0` for unexpected top-level entries. Check install scripts are allow-listed (`allowScripts`, `npm config get ignore-scripts`). PRESENT: every direct dependency reviewed and justified, lockfile committed.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P0] PR-039 Dependency scanning

Owning PLAN PR: PLAN PR-03. Shared fix group: G8.

Labels: production-readiness, area:security, severity:p0

Current state (MISSING): npm audit --omit=dev (scratch run at 55a0f08) -> exit 1: 4 high (deepmerge-ts <8.0.0 via @prisma/config and prisma; source-map-js 1.0.0 to 1.2.1, GHSA-68fv-2mgg-jv7q); npm audit (all deps) -> exit 1: 9 high; no dependabot.yml or renovate.json; icm/05-build/tools/verify-local.sh:77 runs npm ci --no-audit (untracked file) Owner: PLAN PR-03. No scanner in any gate, and four high advisories sit in production dependencies today. Add npm audit or osv-scanner to the D13 local gate (owner to confirm) and clear the four highs.

Why it matters: Known-vulnerable libraries ship and stay unpatched because nobody looks.

Acceptance: re-run the check and get PRESENT. Check: `npm audit --omit=dev` and `osv-scanner --lockfile=package-lock.json` (or `osv-scanner scan source -r .`). Look for Dependabot or Renovate config (`.github/dependabot.yml`, `renovate.json`). PRESENT: scan runs on every change (CI or the local gate) and no high or critical findings are open without a written reason.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P0] PR-041 OWASP protections: SQL injection, XSS, CSRF and the rest

Owning PLAN PR: NEW (no PLAN PR owns it).

Labels: production-readiness, area:security, severity:p0

Current state (PARTIAL): 140 queryRawUnsafe or executeRawUnsafe calls with bound params in sampled sites (lib/workspace/invitations.ts:213-240); no app/api write handlers besides app/api/auth/[...nextauth]/route.ts; no CSP (next.config.ts:7-75) Owner: NEW. SQLi: bound parameters in samples, not every call read. CSRF: writes are server actions (Next Origin check) and Auth.js routes (CSRF token). XSS: React escaping, no CSP. No semgrep or security-scan run.

Why it matters: Classic injection and cross-site attacks still account for most breaches of young apps.

Acceptance: re-run the check and get PRESENT. Check: SQLi: `rg -n 'queryRawUnsafe|executeRawUnsafe|\.query\(' lib app` must be empty, or every hit passes values as bound parameters (no string-built SQL). XSS: see PR-040, plus a CSP (PR-044). CSRF: state-changing routes accept only POST/PUT/PATCH/DELETE with SameSite cookies and an origin check or token (Next.js server actions check Origin; custom route handlers must too: `rg -n "export async function (POST|PUT|PATCH|DELETE)" app/api`). SSRF: `rg -n "fetch\((req|body|params|input)" lib app`. Run the `security-scan` skill or `npx semgrep --config p/owasp-top-ten`. PRESENT: no open high findings and each class has a named control.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P0] PR-045 Encryption at rest and in transit

Owning PLAN PR: NEW (no PLAN PR owns it). Shared fix group: G5.

Labels: production-readiness, area:security, severity:p0

Current state (MISSING): rg -n -i 'sslmode,ssl=true' .env.example lib -> no matches; .env.example AUTH_TRUST_HOST comment says terminate TLS in front of the app Owner: NEW. No deployment, no TLS requirement on the database URL, no storage or backup encryption config.

Why it matters: Stolen disks or snapshots expose data, and plaintext hops leak credentials.

Acceptance: re-run the check and get PRESENT. Check: Transit: `curl -sI http://<host>/` redirects to HTTPS; `openssl s_client -connect <host>:443 -tls1_1 </dev/null` fails; the database URL requires TLS (`rg -n "sslmode=require|ssl=true" .env.example lib`). Rest: provider storage and backup encryption enabled (console or CLI). PRESENT: TLS 1.2+ everywhere including app to database, encrypted volumes, backups and object storage.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P0] PR-046 Least privilege for people and agents

Owning PLAN PR: NEW (no PLAN PR owns it). Shared fix group: G5.

Labels: production-readiness, area:security, severity:p0

Current state (MISSING): docker-compose.yml:11-13 one app role used for both runtime and migrations; no IAM or role docs in docs/security Owner: NEW. No production access model. D35 says lanes never push, which limits agents on git only.

Why it matters: One leaked token or one confused AI agent with owner credentials can drop the production database.

Acceptance: re-run the check and get PRESENT. Check: List who and what holds production access: cloud IAM, database roles (`psql -c "\du"`), deploy tokens, CI secrets, and AI agent environments. PRESENT: app connects with a role that cannot alter schema, migrations run with a separate role, humans use individual accounts with MFA, AI agents get read-only or staging credentials unless a task needs more and a human approves.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P0] PR-062 Deploy pipeline runs the tests

Owning PLAN PR: PLAN PR-03. Shared fix group: G8.

Labels: production-readiness, area:deploy, severity:p0

Current state (PARTIAL): package.json:21 verify = typecheck, lint, test only; .github/workflows/ci.yml:4 points to scripts/check, which does not exist; icm/05-build/tools/verify-local.sh is untracked (not in 55a0f08). Scratch run at 55a0f08: typecheck -> exit 0; lint -> exit 0 (16 warnings); format:check -> exit 1 (66 files); unit -> exit 0 after git init (1308 pass); build -> exit 0 Owner: PLAN PR-03. D13 gate is not in the commit. The untracked verify-local.sh covers format, typecheck, lint, unit, integration, migrate, build and e2e but not dependency scanning, and format:check fails on the commit today. PR-03 promotes it to scripts/verify-local.sh.

Why it matters: Broken builds and regressions reach customers because nothing forces the checks before release.

Acceptance: re-run the check and get PRESENT. Check: Find the gate: `.github/workflows/*.yml`, other CI configs, or a local check script (`rg -n "\"verify\"|\"check\"" package.json`, `ls scripts`). Confirm it runs typecheck, lint, tests and build, and that deploys cannot happen without it (platform deploy hooks, branch protection, or a documented rule). Run it: `npm run verify; echo exit=$?`. PRESENT: one command runs all gates, it passes on the release commit, and the release process requires its output.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P0] PR-068 DNS, TLS certificates and renewals

Owning PLAN PR: NEW (no PLAN PR owns it). Shared fix group: G5.

Labels: production-readiness, area:deploy, severity:p0

Current state (MISSING): no domain or host in repo (.env.example AUTH_URL http://127.0.0.1:3000); no deployed URL Owner: NEW. No domain, certificate or renewal setup exists yet. Required before the first live user.

Why it matters: The certificate expires on a weekend, or the domain lapses, and the whole product is down with a browser warning.

Acceptance: re-run the check and get PRESENT. Check: `echo | openssl s_client -connect <host>:443 -servername <host> 2>/dev/null | openssl x509 -noout -issuer -enddate` shows issuer and expiry; automated issuers (Let's Encrypt, platform-managed) renew on their own. `whois <domain> | rg -i "expir"` for the domain. PRESENT: auto-renewing certificates, domain on auto-renew with a company payment method, an external expiry monitor (PR-082), DNS records in IaC or documented.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P0] PR-074 SPF, DKIM and DMARC

Owning PLAN PR: NEW (no PLAN PR owns it). Shared fix group: G7.

Labels: production-readiness, area:email, severity:p0

Current state (MISSING): lib/auth/password-reset-delivery.ts:36-41 ADAPTERS registry empty by design; no sending domain in repo Owner: NEW. No mail provider and no sending domain, so no SPF, DKIM or DMARC. D17 leaves the production provider an open owner choice; sign-up and reset need it before launch.

Why it matters: Password resets and invites land in spam or get rejected, so users cannot sign in.

Acceptance: re-run the check and get PRESENT. Check: `dig +short TXT <domain> | rg "v=spf1"`, `dig +short TXT <selector>._domainkey.<domain>` (selector from the email provider), `dig +short TXT _dmarc.<domain>`. Send a test message to a Gmail account and read "Show original" for SPF, DKIM and DMARC pass. PRESENT: all three pass, DMARC at `p=quarantine` or `p=reject` once reports are clean, sending from a subdomain or a dedicated provider domain.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P0] PR-077 Cost alerts

Owning PLAN PR: NEW (no PLAN PR owns it). Shared fix group: G5.

Labels: production-readiness, area:cost, severity:p0

Current state (MISSING): no hosting, database, mail or storage vendor configured in repo (lib/storage.ts:6-7 vendor open) Owner: NEW. No metered provider is chosen yet, so no alerts exist. Each provider needs a budget alert routed to a person when it is chosen.

Why it matters: A runaway loop, an AI agent stuck in retries or a scraping attack runs up a four-figure bill that is found on the invoice.

Acceptance: re-run the check and get PRESENT. Check: Billing alerts in each paid provider (cloud budgets, AI provider spend limits, email provider caps, database usage alerts). PRESENT: daily or threshold alerts on every metered provider, routed to a person, plus hard caps where the provider supports them.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P0] PR-081 Error tracking that groups issues

Owning PLAN PR: NEW (no PLAN PR owns it). Shared fix group: G6.

Labels: production-readiness, area:observability, severity:p0

Current state (MISSING): rg '@sentry,bugsnag,rollbar,honeybadger' package.json lib app -> no matches; no instrumentation.ts Owner: NEW. No error tracking. A production failure would be invisible.

Why it matters: Errors are invisible or arrive as thousands of separate emails, and nobody notices a broken checkout.

Acceptance: re-run the check and get PRESENT. Check: `rg -n "@sentry|bugsnag|rollbar|honeybadger|posthog.*exception" package.json lib app instrumentation.ts`. PRESENT: server and client errors captured with release, environment and user id (no PII beyond policy), source maps uploaded, grouped issues with alert rules for new and regressed issues.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P0] PR-082 External uptime checks

Owning PLAN PR: NEW (no PLAN PR owns it). Shared fix group: G6.

Labels: production-readiness, area:observability, severity:p0

Current state (MISSING): no health endpoint (see PR-064); no monitor config in repo Owner: NEW. No external uptime check and no health route that touches the database.

Why it matters: The site is down and the first person to notice is a customer.

Acceptance: re-run the check and get PRESENT. Check: Look for an external monitor (UptimeRobot, Better Stack, Checkly, Pingdom) on the homepage, login and a health endpoint that touches the database. `curl -s https://<host>/api/health` should return a status that reflects dependencies. PRESENT: checks from outside your network every minute or few, alerting a person, plus TLS expiry monitoring.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P0] PR-092 End-to-end tests for money flows

Owning PLAN PR: PLAN PR-05.

Labels: production-readiness, area:testing, severity:p0

Current state (PARTIAL): tests/e2e/invite-acceptance.spec.ts and tests/e2e/password-reset.spec.ts exist; icm/03-plan/output/TEST-AUDIT.md:27 cuts 41 old-UI e2e specs; no sign-up page or spec (D17); e2e not run at 55a0f08 by this audit Owner: PLAN PR-05. Onboarding flows have specs, but coach self-sign-up (D17) has none, the six reset e2e guards are unproven because delivery is disabled (TEST-AUDIT.md:34), and the live lane at 1440 and 390 has not run on this commit.

Why it matters: Signup, login or checkout breaks and nobody knows until revenue drops.

Acceptance: re-run the check and get PRESENT. Check: `ls tests/e2e; rg -n "test\(" tests/e2e | rg -i "signup|login|checkout|invite|onboard"`. Run `npx playwright test` against a running app. PRESENT: the flows that make money or onboard users run end to end in a browser at desktop and mobile widths and pass on the release commit.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P0] PR-133 Code review on every change

Owning PLAN PR: NEW (no PLAN PR owns it).

Labels: production-readiness, area:code-health, severity:p0

Current state (PARTIAL): gh api repos/hanzlahsfc/The-great-tracker-/branches/{Vari8-Beta,TRACKER,main}/protection -> HTTP 404 each; gh pr list --state merged --limit 10 -> 10 of 10 merged PRs (#47 to #57) with 0 GitHub reviews; AGENTS.md:47-48 builder never approves own work; icm/05-build/reports/PR-02-verify.md agent verifier report; no CODEOWNERS Owner: NEW. A written review rule exists and PR-02 has a verifier report from a different model, but no branch has protection, merged PRs carry no recorded GitHub review, reviewers are AI agents, and docs commits land directly on Vari8-Beta (6b54a7d, 17352b0).

Why it matters: AI-written and rushed code reaches production unread.

Acceptance: re-run the check and get PRESENT. Check: `gh api repos/<owner>/<repo>/branches/<branch>/protection` for required reviews, or `gh pr list --state merged --limit 30 --json number,reviews` to see merged PRs with zero reviews. `git log --first-parent --oneline <integration branch> | head` for direct pushes. PRESENT: every merge to the integration and release branches has an approving review by someone other than the author.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P0] PR-146 Accounts, domains and repos owned by the company

Owning PLAN PR: NEW (no PLAN PR owns it).

Labels: production-readiness, area:ownership, severity:p0

Current state (MISSING): git remote -v -> github.com/hanzlahsfc/The-great-tracker-; DECISIONS.md:60 issues in hanzlahsfc/The-great-tracker- Owner: NEW. Repo sits under a personal GitHub account, not a company org. No inventory of domain, hosting, database, mail or app store accounts exists. Owner to confirm legal owner and second admin.

Why it matters: The prototype builder leaves and the domain, cloud account, app store listing or repo leaves with them.

Acceptance: re-run the check and get PRESENT. Check: List every account: domain registrar, DNS, hosting, database, email provider, payment provider, app stores, GitHub org, analytics, AI providers. For each, record the legal owner, billing method and admin users. `whois <domain>` for registrant. PRESENT: all in the company's name with at least two company admins and recovery set to company addresses.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-004 MFA with a recovery path

Owning PLAN PR: PLAN PR-05. Shared fix group: G1.

Labels: production-readiness, area:auth, severity:p1

Current state (MISSING): rg -n -i 'totp,otplib,webauthn,passkey,mfa,twoFactor,recoveryCode' app lib db/schema.prisma package.json -> no matches Owner: PLAN PR-05. No MFA for any role. PR-05-OWNED: Better Auth twoFactor plugin with backup codes.

Why it matters: Password reuse leads straight to takeover; without recovery codes, a lost phone becomes a support escalation with identity verification by email.

Acceptance: re-run the check and get PRESENT. Check: `rg -n "totp|otplib|webauthn|passkey|mfa|twoFactor|recoveryCode" lib app <schema>`. PRESENT: TOTP or passkeys available (required for staff and admin roles), single-use recovery codes stored hashed, and a documented support process for full loss. PARTIAL: MFA exists without recovery codes, or only for some roles.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-014 Lockouts that do not lock out the owner

Owning PLAN PR: PLAN PR-05. Shared fix group: G1.

Labels: production-readiness, area:auth, severity:p1

Current state (MISSING): rg -n -i 'failedAttempts,lockedUntil,lockout' lib db/schema.prisma -> no matches (only serialization retry backoff constants in services) Owner: PLAN PR-05. No failure counter, delay or lock. PR-05-OWNED: Better Auth 2FA lockout plus rate limit.

Why it matters: Hard lockouts let anyone lock a known user out by guessing wrong on purpose; no lockout lets attackers guess forever.

Acceptance: re-run the check and get PRESENT. Check: `rg -n "failedAttempts|lockedUntil|lockout|backoff" lib <schema>`. PRESENT: progressive delay or temporary lock per account, CAPTCHA or step-up after N failures, a self-serve unlock by email, and an alert on lock storms. MISSING: permanent lock with admin-only unlock, or no counter at all.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-016 Migrations that do not lock hot tables

Owning PLAN PR: NEW (no PLAN PR owns it).

Labels: production-readiness, area:data-model, severity:p1

Current state (MISSING): rg -n 'CONCURRENTLY' db/migrations -> exit 1; rg -n 'lock_timeout' db/migrations -> exit 1; 77 plain CREATE INDEX statements in db/migrations/**/migration.sql Owner: NEW. No lock timeout or concurrent index builds. Harmless on empty pre-launch tables, but nothing enforces the rule for the PR-M0 and PR-R2 migrations.

Why it matters: `ALTER TABLE` takes an exclusive lock; adding a column with a volatile default or building an index without `CONCURRENTLY` freezes writes during business hours.

Acceptance: re-run the check and get PRESENT. Check: `rg -n "CREATE INDEX(?! CONCURRENTLY)|ALTER TABLE .* (ADD|ALTER) COLUMN .* NOT NULL|ALTER COLUMN .* TYPE" -P <migrations dir>`. Look for `SET lock_timeout` in migration scripts. PRESENT: large-table changes use expand/contract, `CREATE INDEX CONCURRENTLY`, and a lock timeout. PARTIAL: tables are small today and the team knows the rule but nothing enforces it.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-017 Indexes for production-sized data

Owning PLAN PR: PLAN PR-M0. Shared fix group: G9.

Labels: production-readiness, area:data-model, severity:p1

Current state (PARTIAL): db/schema.prisma: 72 @@index (e.g. :274-276 WorkspaceMember, audit indexes near :410-413); 77 CREATE INDEX in db/migrations Owner: PLAN PR-M0. Indexes are deliberate on hot paths (workspace, client, cursor). Not checked one by one against every FK, and no large-seed EXPLAIN exists. Lead: EXPLAIN ANALYZE roster and check-in board queries on a large seed.

Why it matters: Queries that scan the whole table are instant on seed data and time out at a few million rows, usually on the busiest screen.

Acceptance: re-run the check and get PRESENT. Check: `rg -n "@@index|@index|CREATE INDEX" <schema and migrations>` and compare with the `where`/`orderBy` fields used in `rg -n "findMany|findFirst|where:" lib app`. Every foreign key and every filter column on a large table needs an index. Live: `psql "$DATABASE_URL" -c "EXPLAIN ANALYZE <hot query>"` on a seeded copy, look for `Seq Scan` on big tables. PRESENT: foreign keys indexed and hot queries show index scans on a large seed.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-018 Connection pooling

Owning PLAN PR: NEW (no PLAN PR owns it).

Labels: production-readiness, area:data-model, severity:p1

Current state (PARTIAL): lib/db.ts:3-9 global PrismaClient singleton; rg -n -i 'pgbouncer,connection_limit' .env.example lib -> exit 1 Owner: NEW. Singleton client present. No pooler URL or connection_limit in any config. There is no deployment, so production pooling is undefined.

Why it matters: Serverless or multi-instance deploys open one connection per request or per lambda and exhaust Postgres `max_connections` during a spike.

Acceptance: re-run the check and get PRESENT. Check: `rg -n "connection_limit|pgbouncer|pool|PrismaClient\(" lib db .env.example`. Confirm a single PrismaClient instance (global singleton in dev) and a pooler (PgBouncer, Supabase/Neon pooler, Prisma Accelerate) in production. `psql -c "show max_connections"` against expected instances times pool size. PRESENT: pooler URL in production config plus a singleton client.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-021 Point-in-time recovery

Owning PLAN PR: NEW (no PLAN PR owns it). Shared fix group: G5.

Labels: production-readiness, area:data-safety, severity:p1

Current state (MISSING): rg -n -i 'PITR,point.in.time,archive_mode' docs db scripts -> no matches Owner: NEW. No PITR configuration or procedure; no hosting chosen.

Why it matters: A `DELETE` without `WHERE` at 15:00 can only be undone to last night's backup, losing a day of writes.

Acceptance: re-run the check and get PRESENT. Check: Provider PITR setting enabled with a window (RDS automated backups, Supabase/Neon PITR, pgBackRest/WAL-G archiving with `archive_mode=on`: `psql -c "show archive_mode"`). PRESENT: PITR on, window of at least 7 days, a documented restore-to-timestamp procedure. PARTIAL: daily snapshots only.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-022 Soft deletes for user-facing data

Owning PLAN PR: PLAN PR-M0. Shared fix group: G9.

Labels: production-readiness, area:data-safety, severity:p1

Current state (PARTIAL): db/schema.prisma:641,799,824,1221,1612 archivedAt on OnboardingForm, ParameterDefinition, CoachingTemplate, CheckInForm, Habit; ClientProfile and ClientTask have none Owner: PLAN PR-M0. Soft archive on library entities only. D24 timed restore and D27 client archive with 90-day retention are decided but not built.

Why it matters: "I deleted it by accident" means restoring a whole database to recover one record.

Acceptance: re-run the check and get PRESENT. Check: `rg -n "deletedAt|archivedAt|isDeleted" <schema>` on user-facing entities, and confirm reads filter them (`rg -n "deletedAt: null" lib`). PRESENT: soft delete on user content, a restore path (UI or support tool), and a purge job that hard-deletes after the retention window (ties to PR-035 and PR-057).

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-026 Emoji, accents and right-to-left text

Owning PLAN PR: NEW (no PLAN PR owns it).

Labels: production-readiness, area:i18n, severity:p1

Current state (PARTIAL): psql show server_encoding on local postgres:16-alpine -> UTF8; length limits use String.length (lib/onboarding/forms-boundary.ts:89, lib/coaching/templates-boundary.ts:105); rg 'dir="auto"' and 'Intl.Segmenter' in app components lib -> no matches Owner: NEW. Storage is UTF-8. Limits count UTF-16 units, not graphemes, and user content has no dir=auto. Emoji and Arabic round-trip not run.

Why it matters: Names truncate mid-character, emoji become `?`, length checks count bytes, and RTL text flips surrounding punctuation.

Acceptance: re-run the check and get PRESENT. Check: Database encoding `psql -c "show server_encoding"` must be `UTF8` (MySQL: `utf8mb4`). `rg -n "\.length ?[<>]=?|maxLength|substring\(|slice\(" lib components` near user text, and check limits count characters or graphemes (`Intl.Segmenter`). Live: save `Zoë 👩🏽‍💻 مرحبا` in a name and a note, view it, export it, email it. Check `dir="auto"` on user-content containers. PRESENT: round trip is byte-identical and the layout holds.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-031 Duplicate submit protection

Owning PLAN PR: NEW (no PLAN PR owns it).

Labels: production-readiness, area:input, severity:p1

Current state (PARTIAL): 143 disabled-while-pending hits in app components; db/schema.prisma:1126 and :1361 at-most-one submission uniques; expectedRevision CAS in lib services (139 idempotency or revision hits) Owner: NEW. Client and server guards on submissions and drafts. Plain creates (tasks, habits, templates) have no idempotency key. Live double-submit probe not run.

Why it matters: Four clicks create four orders, four check-ins or four invitations.

Acceptance: re-run the check and get PRESENT. Check: Forms disable the submit button while pending (`rg -n "useFormStatus|pending|isSubmitting|disabled=" app components`). Server side: unique constraints or idempotency keys on create endpoints (`rg -n "@@unique|idempotency" <schema> lib`). Live: double-click submit quickly and replay the request twice with curl; one record must result. PRESENT: both client and server guard.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-032 Pagination that works on page 400

Owning PLAN PR: PLAN PR-SV1.

Labels: production-readiness, area:api, severity:p1

Current state (PARTIAL): lib/audit.ts:459-463 keyset (where id gt cursor, orderBy id, take+1); lib/checkin/instances.ts:1105 take listMax; lib/coaching/client-setup.ts:415 and lib/workspace/clients.ts:408 findMany with no take Owner: PLAN PR-SV1. Keyset pagination with a capped page size exists on audit, review queue, roster and history lists. Some staff picker lists return the full authorized set unbounded. No HTTP list API yet. Live deep-page timing not run.

Why it matters: `OFFSET 10000` scans and discards rows, so deep pages time out; unbounded list endpoints return the whole table.

Acceptance: re-run the check and get PRESENT. Check: `rg -n "skip:|offset|findMany\(" lib app/api` and confirm every list query has `take`/`limit` with a server-side maximum. PRESENT: cursor or keyset pagination on large or growing lists (`cursor:` in Prisma, `WHERE id > $last`), a max page size, stable ordering with a unique tiebreaker. Live: request a page far down a seeded large list and time it.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-042 Safe file uploads

Owning PLAN PR: PLAN PR-MEDIA.

Labels: production-readiness, area:security, severity:p1

Current state (PARTIAL): lib/storage.ts:63-87 tenant-prefixed key validation, :96-110 presign TTL bound, :117-123 null backend fails closed; no put, size or content-type checks; rg -n -i 'upload,multipart,putObject' app lib -> only storage.ts comments Owner: PLAN PR-MEDIA. No upload path exists yet. D20 adds 20 MB attachments and voice notes; the port lacks size limit, magic-byte check, attachment disposition and malware scan.

Why it matters: Uploaded HTML or SVG runs script on your domain, huge files exhaust disk, and malware gets shared through your app.

Acceptance: re-run the check and get PRESENT. Check: `rg -n "upload|multipart|formData\(\)|putObject|presign" lib app`. PRESENT: size limit enforced server-side, content type checked by magic bytes not extension, files stored in object storage on a separate domain or with `Content-Disposition: attachment`, never under a path the web server executes, and a malware scan (ClamAV or provider scanning) before sharing. Live: upload an SVG containing `<script>` and an oversized file.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-044 Security headers on every response

Owning PLAN PR: NEW (no PLAN PR owns it).

Labels: production-readiness, area:security, severity:p1

Current state (MISSING): next.config.ts:7-75 headers() sets only Referrer-Policy no-referrer on /invite and /reset and Cache-Control no-store on some routes; no CSP, HSTS, X-Frame-Options, nosniff or Permissions-Policy; no middleware.ts or proxy.ts Owner: NEW. Security headers absent on pages, API and assets.

Why it matters: Clickjacking, MIME sniffing, referrer leaks and missing HTTPS enforcement.

Acceptance: re-run the check and get PRESENT. Check: `curl -sI https://<host>/ | rg -i "strict-transport-security|content-security-policy|x-frame-options|frame-ancestors|x-content-type-options|referrer-policy|permissions-policy"` on a page, an API route and a static asset. Config: `rg -n "headers\(\)|Content-Security-Policy" next.config.* middleware.ts proxy.ts`. PRESENT: HSTS, a CSP without `unsafe-inline` for scripts (nonces or hashes), frame protection, nosniff and a referrer policy on all three probes.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-047 Audit logs without secrets

Owning PLAN PR: PLAN PR-05. Shared fix group: G4.

Labels: production-readiness, area:security, severity:p1

Current state (PARTIAL): db/schema.prisma:379-415 AuditEvent with actor, action, resource, result, at; lib/audit.ts:25-26 closed metadata allowlist, :218-222 forbidden token-shaped values; rg -n 'console.' lib app -> 0 hits Owner: PLAN PR-05. Structural audit on mutations with secret-free metadata. Sign-ins and failed sign-ins are not audited (account actions only PASSWORD_RESET, lib/audit.ts:173); add them in the Better Auth hooks in PLAN PR-05. No logger, so no runtime log redaction probe.

Why it matters: You cannot answer who changed what during an incident, or the logs themselves leak passwords, tokens and card numbers.

Acceptance: re-run the check and get PRESENT. Check: `rg -n "auditLog|AuditEvent|audit\(" lib <schema>` for who/what/when/target records on sensitive actions. `rg -n "console\.log\(.*(password|token|secret|authorization|card)" -i lib app` must be empty; check the logger has redaction (`rg -n "redact" lib`). Live: perform a login and a password change, then grep the log output for the password and session token. PRESENT: audit trail for admin and data-changing actions, redaction proven by the probe.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-050 Vulnerability disclosure process

Owning PLAN PR: NEW (no PLAN PR owns it).

Labels: production-readiness, area:security, severity:p1

Current state (MISSING): no public/ directory, no .well-known/security.txt; rg -n -i 'vulnerability disclosure,security.txt' docs -> no matches Owner: NEW. No disclosure contact or triage process.

Why it matters: A researcher's report goes to an unread inbox or gets ignored, then appears publicly.

Acceptance: re-run the check and get PRESENT. Check: `curl -s https://<host>/.well-known/security.txt` returns a contact and expiry (RFC 9116). A monitored security inbox and a documented triage SLA exist. PRESENT: security.txt live, inbox monitored, triage steps written.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-051 Stolen laptop plan

Owning PLAN PR: NEW (no PLAN PR owns it).

Labels: production-readiness, area:security, severity:p1

Current state (MISSING): rg -n -i 'stolen,laptop,revoke ssh' docs -> no matches Owner: NEW. No stolen-device procedure.

Why it matters: A lost machine with production sessions, SSH keys and `.env` files stays a live key to the business for days.

Acceptance: re-run the check and get PRESENT. Check: Ask for the written procedure and test it on paper: full-disk encryption required, device inventory, how to revoke SSH keys, cloud sessions, GitHub tokens and password manager sessions per person, and which secrets to rotate. PRESENT: checklist exists, every person with production access has disk encryption and MFA, revocation can complete within an hour.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-060 Dev, staging and production that match

Owning PLAN PR: NEW (no PLAN PR owns it). Shared fix group: G5.

Labels: production-readiness, area:deploy, severity:p1

Current state (MISSING): git ls-files has no staging or production config; no .nvmrc at root, no engines in package.json:1-61; .github/workflows/ci.yml:35 node-version 22 vs frontend/.nvmrc 24; scratch run used node v26.7.0 Owner: NEW. Only a local dev environment exists. No staging, no production, and the Node major differs between root CI (22), canvas (24) and D5 target (24).

Why it matters: Code passes locally and on staging, then fails in production because of a different Node version, database version, env var or feature flag.

Acceptance: re-run the check and get PRESENT. Check: Compare runtime pins: `.nvmrc`, `package.json` `engines`, Dockerfile base image, `docker-compose.yml` Postgres image, and the hosting platform's settings. Diff env var names: `.env.example` versus the platform's variable list (names only). PRESENT: same major versions everywhere, a staging environment with production-like config and its own database, and every env var documented in `.env.example`.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-063 One-click rollback

Owning PLAN PR: NEW (no PLAN PR owns it). Shared fix group: G5.

Labels: production-readiness, area:deploy, severity:p1

Current state (MISSING): no deploy platform config in git ls-files; rg -ln -i 'rollback' docs -> only template-version rollback product text Owner: NEW. No deployment, so no rollback path or runbook. Migrations carry no rollback plan (PR-015).

Why it matters: A bad Friday deploy stays live while someone reverts commits and waits for a fresh build.

Acceptance: re-run the check and get PRESENT. Check: Platform support (Vercel "Promote"/instant rollback, Fly `fly releases` plus redeploy of a previous image, Kubernetes `kubectl rollout undo`) and a runbook entry. Database changes must be backward compatible with the previous release (expand/contract, PR-015). PRESENT: rollback to the previous release in under five minutes, rehearsed once, documented.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-064 Zero-downtime deploys

Owning PLAN PR: NEW (no PLAN PR owns it). Shared fix group: G5.

Labels: production-readiness, area:deploy, severity:p1

Current state (MISSING): git grep -n -iE 'healthz,readyz,/api/health' app lib -> no matches; find app/api -name route.ts -> only app/api/auth/[...nextauth]/route.ts Owner: NEW. No hosting and no health endpoint to gate a rolling deploy.

Why it matters: Every deploy drops requests, logs users out or shows errors while the new version starts.

Acceptance: re-run the check and get PRESENT. Check: Hosting type (serverless and rolling deploys are zero-downtime by default; a single VM with `pm2 restart` is not). Health checks configured (`rg -n "healthcheck|/api/health|readiness" .`). Live: run `while true; do curl -s -o /dev/null -w "%{http_code}\n" https://<staging>/api/health; sleep 0.5; done` during a staging deploy and count non-200 responses. PRESENT: zero failed probes and migrations that do not break the old version.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-069 Background job queues

Owning PLAN PR: NEW (no PLAN PR owns it). Shared fix group: G7.

Labels: production-readiness, area:reliability, severity:p1

Current state (MISSING): rg -n 'bullmq,pg-boss,graphile-worker,inngest,trigger.dev,qstash' package.json lib -> no matches; lib/auth/password-reset-delivery.ts ADAPTERS empty, no mail sent today Owner: NEW. No durable queue. Nothing slow runs today, but mail (D17 sign-up, reset), media processing (D20) and transcription (FOLLOW-UP-TRANSCRIBE) will need one.

Why it matters: Sending emails, generating reports or calling slow APIs inside the request freezes the page and loses work when the request times out.

Acceptance: re-run the check and get PRESENT. Check: `rg -n "bullmq|pg-boss|graphile-worker|inngest|trigger\.dev|qstash|sqs" package.json lib`. Find slow work in request handlers: `rg -n "sendMail|sendEmail|generatePdf|await fetch\(" app/api lib/services`. PRESENT: anything slow or retryable runs in a durable queue with a worker, not in the request path and not in a fire-and-forget promise.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-070 Retries with backoff

Owning PLAN PR: NEW (no PLAN PR owns it). Shared fix group: G7.

Labels: production-readiness, area:reliability, severity:p1

Current state (PARTIAL): lib/auth/password-reset.ts:111-113 MAX_ATTEMPTS 8, BACKOFF_BASE_MS 10, BACKOFF_CAP_MS 50; commit de5f7b3 retries PG serialization conflicts in client tasks Owner: NEW. Bounded retries exist for database serialization conflicts. No outbound third-party calls exist yet, so no retry policy for them.

Why it matters: One transient 503 from a provider becomes a lost order, a missing email or a failed sync.

Acceptance: re-run the check and get PRESENT. Check: `rg -n "retry|backoff|p-retry|attempts|exponential" lib`. PRESENT: outbound calls to third parties and queue jobs retry with exponential backoff, jitter and a cap, only on retryable errors, and only for idempotent operations (PR-030).

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-075 Bounce and complaint handling

Owning PLAN PR: NEW (no PLAN PR owns it). Shared fix group: G7.

Labels: production-readiness, area:email, severity:p1

Current state (MISSING): git grep -n -iE 'bounce,complaint,suppress' lib app -> no matches Owner: NEW. No mail provider, so no bounce or complaint handling.

Why it matters: Sending repeatedly to dead addresses and complainers destroys sender reputation and the provider suspends the account.

Acceptance: re-run the check and get PRESENT. Check: `rg -n "bounce|complaint|suppress|webhook" lib app/api` near the email provider. PRESENT: provider webhooks for bounces and complaints processed, addresses suppressed, users with a bounced email told to update it in the app.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-078 Written and tested disaster recovery plan

Owning PLAN PR: NEW (no PLAN PR owns it). Shared fix group: G5.

Labels: production-readiness, area:data-safety, severity:p1

Current state (MISSING): rg -ln -i 'disaster recovery,RTO,RPO' docs -> no matches Owner: NEW. No DR plan.

Why it matters: When the provider region, the database or the main account is lost, nobody knows the order of steps, the RTO, or where the credentials are.

Acceptance: re-run the check and get PRESENT. Check: `rg -ln "disaster recovery|RTO|RPO" docs`. PRESENT: a written plan with RTO and RPO targets, who does what, where backups and break-glass credentials live, and a dated exercise in the last 12 months. PARTIAL: plan exists but never exercised.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-080 Structured logs

Owning PLAN PR: NEW (no PLAN PR owns it). Shared fix group: G6.

Labels: production-readiness, area:observability, severity:p1

Current state (MISSING): git grep -c -E 'console.(log,error,warn,info)' app lib -> 0; rg 'pino,winston,@logtape' package.json -> no matches Owner: NEW. No logger at all. Server errors are not recorded anywhere beyond the framework default.

Why it matters: At 3am you grep unstructured text across instances and cannot follow one request or one user.

Acceptance: re-run the check and get PRESENT. Check: `rg -n "pino|winston|@logtape|console\.log\(" lib app | head`. PRESENT: a JSON logger with level, timestamp, request id and user or tenant id on every line, shipped to a searchable store (platform logs, Axiom, Better Stack, Loki), with redaction (PR-047). PARTIAL: platform logs only, mostly `console.log`.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-083 Alerts that page a human, tuned

Owning PLAN PR: NEW (no PLAN PR owns it). Shared fix group: G6.

Labels: production-readiness, area:observability, severity:p1

Current state (MISSING): no monitoring tool configured (see PR-080, PR-081) Owner: NEW. No alert rules and no paging path.

Why it matters: Nobody is woken when payments fail, or alerts fire so often that everyone ignores them.

Acceptance: re-run the check and get PRESENT. Check: List alert rules in the monitoring and error tools and where they route (phone, PagerDuty, Opsgenie, Slack). Ask for alert counts per week and the share acted upon. PRESENT: alerts on user-facing symptoms (error rate, latency, failed payments, queue depth) route to a person on call; noisy alerts are tuned or removed.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-086 On-call rotation

Owning PLAN PR: NEW (no PLAN PR owns it). Shared fix group: G6.

Labels: production-readiness, area:observability, severity:p1

Current state (MISSING): git grep -i -E 'on-call,pager' docs README.md -> no matches Owner: NEW. No rotation and no paging path. See RO-05.

Why it matters: Alerts fire into a channel nobody watches at night or on holidays.

Acceptance: re-run the check and get PRESENT. Check: Ask who is on call this week and how they are paged. Look for a schedule (PagerDuty, Opsgenie, Better Stack, a shared calendar). PRESENT: a named person for every hour of the week with a backup, a paging path that reaches a phone, and a test page within the last month.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-087 Runbooks

Owning PLAN PR: NEW (no PLAN PR owns it). Shared fix group: G6.

Labels: production-readiness, area:observability, severity:p1

Current state (MISSING): ls docs/runbooks runbooks -> absent; git ls-files grep -i runbook -> none at 55a0f08 Owner: NEW. No operational runbooks (rollback, restore, key rotation, block a user). The program RUNBOOK in icm/05-build covers build lanes, not operations.

Why it matters: The on-call engineer sees "queue depth critical" and does not know what it means or what to do.

Acceptance: re-run the check and get PRESENT. Check: `ls docs/runbooks runbooks 2>/dev/null; rg -ln "runbook" docs`. Each alert rule links to a runbook entry. PRESENT: runbooks for each alert plus common tasks (rollback, restore, rotate a key, block an abusive user), each with commands and owners.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-090 Unit tests by someone who knows the logic

Owning PLAN PR: PLAN PR-05.

Labels: production-readiness, area:testing, severity:p1

Current state (PARTIAL): icm/03-plan/output/TEST-AUDIT.md:22 GUARD 1199 tests in the D14 categories; bite check in scratch copy: removing the clientTasks deny at lib/auth/guard.ts:158 -> npx vitest run tests/unit/guard.test.ts exit 1, 4 failed; replacing the TOKEN_PATTERN check at lib/tokens/crypto.ts:94 -> tests/unit/token-crypto.test.ts exit 1, 7 failed; restored -> both pass Owner: PLAN PR-05. Backend logic tests bite in the two sampled cases. Missing: the table-driven ROLES test (D15, PR-05) and tests for the canvas calculations once they move to the shared module (D29, PR-W7 and PR-W8). Permission tests are CUT-AT-REPLACE.

Why it matters: Tests assert whatever the code currently returns, so they pass on wrong formulas and catch nothing.

Acceptance: re-run the check and get PRESENT. Check: Read tests for core business logic (formulas, pricing, permissions, dates). Each should assert a literal expected value from a spec or a hand calculation, not a value copied from the output. Bite check: break the function in a scratch copy and run `npx vitest run <file>`; the test must fail. PRESENT: core logic covered by tests that bite.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-093 Load testing before launch

Owning PLAN PR: NEW (no PLAN PR owns it).

Labels: production-readiness, area:testing, severity:p1

Current state (MISSING): git grep -l 'k6,artillery,autocannon,locust' (excluding lockfiles and binaries) -> no load test Owner: NEW. No load test and no staging to run one against.

Why it matters: The launch email brings ten times normal traffic and the database or connection pool falls over.

Acceptance: re-run the check and get PRESENT. Check: `rg -ln "k6|artillery|autocannon|locust" .`. PRESENT: a load test against staging at expected launch peak times a safety factor, with p95 latency and error rate recorded, and the bottleneck known. Run only against environments you own.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-094 Production-like test data without production data

Owning PLAN PR: PLAN PR-04.

Labels: production-readiness, area:testing, severity:p1

Current state (PARTIAL): git ls-files grep -i seed -> none; .gitignore excludes /sources/ /exports/ /sheets/ /raw/ raw exports; spec/redaction-manifest.json lists redactions per docs/redaction-policy.md Owner: PLAN PR-04. Raw health data is kept out of git and committed sheet output is redacted. No seed or factory exists, so there is no synthetic volume data. PR-04 adds the dev seed (D23: canvas demo set).

Why it matters: Tests miss edge cases, or production personal data leaks into laptops and test tools.

Acceptance: re-run the check and get PRESENT. Check: `ls prisma/seed* db/seed* scripts/*seed*`. `rg -n "pg_dump.*prod|production" scripts` for copies of production into dev. PRESENT: a seed or factory that produces volume and edge cases (long names, unicode, many records) synthetically; any production copy is anonymized by a script.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-097 Accessibility compliance

Owning PLAN PR: NEW (no PLAN PR owns it).

Labels: production-readiness, area:ux, severity:p1

Current state (MISSING): git grep '@axe-core,jest-axe,axe-playwright' package.json frontend/package.json tests frontend -> exit 1; tests/e2e/a11y.spec.ts:11-29 checks one h1 and a labelled nav on old routes only and is CUT-FILE in PR-03 (TEST-AUDIT.md:83); docs/STATUS.md:44-45 no accessibility audit claimed Owner: NEW. No automated axe or Lighthouse checks in either app and no conformance statement. ARIA use is common (173 aria- attributes in app and components, 797 in frontend/src). D32 parity compares role and accessible name but is not an a11y audit.

Why it matters: Enterprise and public-sector contracts require WCAG 2.1/2.2 AA, and users with disabilities cannot use the product.

Acceptance: re-run the check and get PRESENT. Check: `npx @axe-core/cli https://<host>/<page>` or Lighthouse accessibility category on every main screen; `rg -n "@axe-core|jest-axe|axe-playwright" package.json tests`. PRESENT: no serious or critical axe violations on main screens, a manual keyboard and screen reader pass (PR-129), and a written conformance statement if contracts ask.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-108 Versioned API

Owning PLAN PR: PLAN PR-05. Shared fix group: G4.

Labels: production-readiness, area:api, severity:p1

Current state (MISSING): find app/api -name route.ts -> only app/api/auth/[...nextauth]/route.ts; no app/api/v1 directory Owner: PLAN PR-05. D6 versioned app/api/v1 routes do not exist yet; all reads and writes go through server actions. No written breaking-change policy. PR-05-OWNED: PR-05 builds the app/api/v1 boundary.

Why it matters: Changing a response field breaks the mobile app still installed on old phones and every customer integration.

Acceptance: re-run the check and get PRESENT. Check: `ls app/api; rg -n "/api/v[0-9]" app lib`. PRESENT: a version in the path or header, a written policy for breaking changes, and old versions kept until clients migrate. Mobile clients pin a version.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-110 API rate limits that protect without blocking integrations

Owning PLAN PR: PLAN PR-05. Shared fix group: G1.

Labels: production-readiness, area:api, severity:p1

Current state (MISSING): git grep -i -E ratelimit, rate-limit, 429 or Retry-After in lib app auth.ts auth.config.ts -> exit 1; middleware.ts and proxy.ts absent Owner: PLAN PR-05. No limiter on any endpoint or action. PR-05-OWNED for auth routes: Better Auth DB-backed rateLimit (AUTH-DECISION.md:21). Limits for app/api/v1 data routes are not yet in any card; add them to PLAN PR-05 acceptance.

Why it matters: One script or abusive client takes down the API for everyone; overly tight global limits break good customers.

Acceptance: re-run the check and get PRESENT. Check: `rg -n "ratelimit|429|Retry-After" lib app middleware.ts proxy.ts`. PRESENT: limits per key or user and per tenant, `429` with `Retry-After` and rate headers, higher limits configurable per customer, expensive endpoints limited separately. Live: burst a staging endpoint and check headers.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-123 Empty, loading and error states on every screen

Owning PLAN PR: PLAN PR-01.

Labels: production-readiness, area:ux, severity:p1

Current state (PARTIAL): git ls-files for loading.tsx, error.tsx, not-found.tsx, global-error.tsx -> none (only app/forbidden.tsx); empty states at app/workspace/[workspaceId]/clients/page.tsx:171, templates/page.tsx:57, app/(tracker)/workspace/[workspaceId]/check-ins/page.tsx:61; frontend/src/components/coach/coach-app.tsx:240 loading status Owner: PLAN PR-01. Empty-state copy exists on list screens, but the root app has no loading, error, not-found or global-error boundaries, so a thrown error shows the framework default. The canvas has a loading state; PR-01 makes it the product UI.

Why it matters: New users see a blank page and think the app is broken; failures look like infinite spinners.

Acceptance: re-run the check and get PRESENT. Check: For each route, look for `loading.tsx`, `error.tsx` and empty-list branches (`rg -n "length === 0|isEmpty|EmptyState" app components`). Live: visit each screen as a new user with no data, with the API blocked in DevTools, and with a slow network. PRESENT: every screen shows a designed empty state, a loading state and an actionable error state.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-124 Error messages a customer can act on

Owning PLAN PR: NEW (no PLAN PR owns it). Shared fix group: G6.

Labels: production-readiness, area:ux, severity:p1

Current state (PARTIAL): lib/daily-entry/boundary.ts:18-22 specific messages (unavailable, denied, check the form, reload) with generic fallback; 'Something went wrong. Please try again in a moment.' in 34 places across app components lib Owner: NEW. Known failures map to actionable copy and no internals reach the browser. The generic fallback carries no reference id support can look up (needs PR-080 logging), and errors are form-level, not attached to fields.

Why it matters: "Something went wrong" generates support tickets and abandoned flows.

Acceptance: re-run the check and get PRESENT. Check: `rg -n "Something went wrong|An error occurred|Unknown error" app components lib`. PRESENT: errors say what happened and what to do next, validation errors attach to the field, server errors include a reference id that support can look up, and no stack traces reach the user.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-125 Forms keep input after a validation error

Owning PLAN PR: PLAN PR-01.

Labels: production-readiness, area:ux, severity:p1

Current state (PARTIAL): app/invite/invite-form.tsx:40 defaultValue from returned state; components/checkin/draft-editor.tsx:307 controlled inputs; app/invite/invite-form.tsx:67 form-level role=alert error Owner: PLAN PR-01. Server actions return submitted values on failure and editors hold controlled state, so input survives. No focus move to the failing field was found. Needs a live long-form check.

Why it matters: A user fills a long form, one field fails, and everything they typed is gone.

Acceptance: re-run the check and get PRESENT. Check: Live: fill a long form, submit with one invalid field, confirm all other values remain and focus moves to the error. Code: `rg -n "useActionState|defaultValue|reset\(" app components` and check server actions return submitted values on failure.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-126 Emails render in every client

Owning PLAN PR: NEW (no PLAN PR owns it). Shared fix group: G7.

Labels: production-readiness, area:email, severity:p1

Current state (MISSING): rg 'react-email,mjml,maizzle' package.json -> no matches; no email templates in git ls-files Owner: NEW. No transactional templates exist yet.

Why it matters: Buttons vanish in Outlook, dark mode makes text unreadable, and links break on mobile.

Acceptance: re-run the check and get PRESENT. Check: `rg -n "react-email|mjml|@react-email|maizzle" package.json` (table-based tooling helps). Send every template to Gmail web, Gmail mobile, Outlook and Apple Mail, or use Litmus or Email on Acid. PRESENT: every transactional template checked in at least these clients, a plain-text part included, links absolute.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-130 Translations and locale formatting

Owning PLAN PR: NEW (no PLAN PR owns it).

Labels: production-readiness, area:i18n, severity:p1

Current state (PARTIAL): no i18n library in package.json; hard-coded locales: components/checkin/feedback-thread.tsx:91 en-GB, lib/tasks/date.ts:90 en; app/layout.tsx:12 lang en; no locale column in db/schema.prisma Owner: NEW. Single language with Intl formatting, but locale is hard-coded and some server-rendered dates pass no timeZone (app/(tracker)/workspace/[workspaceId]/check-ins/page.tsx:75), so they render in the server zone.

Why it matters: German users read `10/11/2026` as 10 November, numbers show `1,5` versus `1.5` inconsistently, and strings are hard-coded English.

Acceptance: re-run the check and get PRESENT. Check: `rg -n "next-intl|i18next|react-intl|Intl\.(DateTimeFormat|NumberFormat)" lib app components`. `rg -n "toFixed\(|toLocaleString\(\)" lib components` flags formatting without a locale. PRESENT: user locale stored, all dates and numbers through `Intl` with that locale, strings in message catalogs if more than one language ships. PARTIAL: single language but locale-aware formatting.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-132 Code a human can read

Owning PLAN PR: PLAN PR-03. Shared fix group: G8.

Labels: production-readiness, area:code-health, severity:p1

Current state (PARTIAL): npm run typecheck (scratch run at 55a0f08) -> exit 0; npm run lint -> exit 0 with 16 warnings, 0 errors; npm run format:check -> exit 1, 66 files; tsconfig.json:11 and frontend/tsconfig.json:7 strict true; eslint.config.mjs:13-18 four react-hooks rules downgraded to warn Owner: PLAN PR-03. Strict types and lint pass. Format check fails on the commit and the hook findings are downgraded until PLAN PR-03 (Biome, react-hooks fixes). Frontend typecheck and lint not run by this audit.

Why it matters: Nobody can safely change code they cannot follow, so every fix is a rewrite or a guess.

Acceptance: re-run the check and get PRESENT. Check: Sample core modules. Look for clear names, small functions, no deep nesting, consistent patterns. Mechanical signals: lint and format clean (`npx biome check .` or `npx eslint .`), `tsc --noEmit` clean with `strict`, `rg -c "any\b" --type ts lib app`. PRESENT: a reviewer new to the module can explain what it does in a few minutes, and strict typing plus lint pass.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-134 Branching strategy

Owning PLAN PR: NEW (no PLAN PR owns it).

Labels: production-readiness, area:code-health, severity:p1

Current state (PARTIAL): DECISIONS.md:221 D35 integration branch Vari8-Beta, one beta/<card-slug> branch per card, merge through icm/05-build/tools/integrate.sh; AGENTS.md:4 still says TRACKER becomes main; integrate.sh not in tree Owner: NEW. Strategy is written and branches follow it (beta/pr-03-*, beta/pr-05-auth-api). AGENTS.md:4 is stale against D35, integrate.sh is untracked (not in 55a0f08), and no branch is protected (see PR-133).

Why it matters: Two people overwrite each other, release branches carry half-finished work, and nobody knows what is deployed.

Acceptance: re-run the check and get PRESENT. Check: `git branch -a`, `git log --graph --oneline -30`, and the contributing doc. PRESENT: a written strategy (trunk plus short feature branches, or integration plus release), protected release branch, and one branch per task.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-136 Framework upgrades before end of support

Owning PLAN PR: PLAN PR-03.

Labels: production-readiness, area:code-health, severity:p1

Current state (PARTIAL): package.json next 16.3.8, react 19.3.0 (merge 55a0f08 PR #57); next-auth 5.0.0-beta.32; .github/workflows/ci.yml:35 node-version 22 vs frontend/.nvmrc 24; typescript ^5 root vs 6.0.3 frontend Owner: PLAN PR-03. D2 Next 16 upgrade landed. Root still targets Node 22 and an Auth.js beta (PR-05-OWNED: replaced by Better Auth); no dated plan for the Prisma major. Lead to run npm ls next react prisma typescript --depth=0 and compare with endoflife.date.

Why it matters: The framework stops receiving security patches and the next CVE has no fix for your version.

Acceptance: re-run the check and get PRESENT. Check: `npm ls next react prisma typescript --depth=0` and compare with each project's support policy and https://endoflife.date (`curl -s https://endoflife.date/api/nodejs.json` and similar). Check the Node runtime too. PRESENT: every framework and runtime on a supported line with a planned date for the next major.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-140 README that gets a new engineer running in an hour

Owning PLAN PR: PLAN PR-04.

Labels: production-readiness, area:code-health, severity:p1

Current state (PARTIAL): README.md:23-42 env, docker compose, install, migrate, dev; .env.example tracked; README.md:69-70 no registration or seeded account Owner: PLAN PR-04. Setup steps exist but a new engineer cannot sign in: no seed, no sign-up. Not timed on a clean machine. PLAN PR-04 adds the dev seed; PR-D1 rewrites README and setup.

Why it matters: Onboarding takes days of asking the one person who knows.

Acceptance: re-run the check and get PRESENT. Check: Follow the README on a clean machine or container: clone, install, `docker compose up`, seed, `npm run dev`, run tests. Time it. PRESENT: under an hour with no undocumented step, and `.env.example` complete.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P1] PR-147 Bus factor above one

Owning PLAN PR: NEW (no PLAN PR owns it).

Labels: production-readiness, area:ownership, severity:p1

Current state (MISSING): git shortlog -sne --no-merges --since=6.months -> hanzlahcodex 459, Marcel Spatz 38, App Builder 25, lillymsf 8; git log on db/schema.prisma db/migrations -> hanzlahcodex 34 of 37 Owner: NEW. Backend and schema knowledge is concentrated in one human account; App Builder is an agent. No record of who can deploy, restore or rotate keys (no deployment exists).

Why it matters: One person's illness or departure stops deploys, incident response and knowledge of the system.

Acceptance: re-run the check and get PRESENT. Check: `git shortlog -sn --no-merges --since="6 months ago"` and per-area ownership (`git log --format='%an' -- <dir> | sort | uniq -c | sort -rn | head`). List who can deploy, restore, rotate keys and access billing. PRESENT: at least two people (or one person plus a contracted backup) can do each critical task, proven by having done it.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P2] PR-012 Audited impersonation for support

Owning PLAN PR: PLAN PR-05. Shared fix group: G3.

Labels: production-readiness, area:authz, severity:p2

Current state (MISSING): rg -n -i 'impersonat,actAs,loginAs,assumeUser' app lib -> no matches Owner: PLAN PR-05. No impersonation, acceptable pre-launch since no deployment and no support production access exists. D15 denies platform admin and support every cell. PR-05-OWNED: Better Auth admin plugin has no audit log, so an audit row must be added.

Why it matters: Support asks for passwords or screenshots, or engineers query production directly with no record of who looked at what.

Acceptance: re-run the check and get PRESENT. Check: `rg -n "impersonat|actAs|loginAs|assumeUser" lib app`. PRESENT: impersonation limited to a support role, shown with a visible banner, time-boxed, blocked from sensitive actions (password, billing), and every start and stop written to an audit log with actor, target and reason. MISSING is acceptable pre-launch only if support has no production access at all.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P2] PR-048 Penetration test before enterprise review

Owning PLAN PR: NEW (no PLAN PR owns it).

Labels: production-readiness, area:security, severity:p2

Current state (MISSING): rg -n -i 'pentest,penetration test' docs icm/03-plan -> no matches Owner: NEW. No external or internal pentest. Running the security-threat-model and security-scan skills would make it PARTIAL.

Why it matters: The customer's security team finds the holes first and the deal dies or stalls.

Acceptance: re-run the check and get PRESENT. Check: Ask for the latest pentest report date, scope and remediation status. PRESENT: an external test of the production-like environment within 12 months with criticals fixed and retested. PARTIAL: internal review only (for example the `security-threat-model` and `security-scan` skills plus OWASP ZAP baseline on staging).

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P2] PR-049 Security questionnaire answers with evidence

Owning PLAN PR: NEW (no PLAN PR owns it).

Labels: production-readiness, area:compliance, severity:p2

Current state (MISSING): rg -n -i 'questionnaire,CAIQ,SIG Lite' docs -> no matches Owner: NEW. No answer bank. P2.

Why it matters: Every enterprise deal pauses for weeks while someone improvises answers.

Acceptance: re-run the check and get PRESENT. Check: Look for a maintained answer bank (CAIQ, SIG Lite or a custom doc) with links to evidence: policies, pentest summary, backup drill logs, access reviews. PRESENT: answer bank exists and each claim links to evidence that would survive a follow-up question.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P2] PR-059 Quarterly access reviews

Owning PLAN PR: NEW (no PLAN PR owns it).

Labels: production-readiness, area:compliance, severity:p2

Current state (MISSING): rg -n -i 'access review' docs icm -> no matches Owner: NEW. No access review record. P2.

Why it matters: Former contractors and stale tokens keep production access for months.

Acceptance: re-run the check and get PRESENT. Check: Ask for the last review record: list of people and service accounts with access to production, database, cloud, repo admin, payment and email providers, signed by an owner with a date. PRESENT: a dated review within the last quarter with removals recorded.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P2] PR-061 Infrastructure as code

Owning PLAN PR: NEW (no PLAN PR owns it). Shared fix group: G5.

Labels: production-readiness, area:deploy, severity:p2

Current state (MISSING): git ls-files grep -iE 'dockerfile,vercel,fly.toml,render.yaml,terraform,.tf' -> no matches; docker-compose.yml:6-24 local PostgreSQL only Owner: NEW. No infrastructure described in files beyond the local dev database. P2.

Why it matters: The production setup lives in one person's memory and a console; rebuilding after an incident or moving providers is guesswork.

Acceptance: re-run the check and get PRESENT. Check: `ls infra terraform pulumi cdk *.tf fly.toml vercel.json render.yaml docker-compose*.yml 2>/dev/null`. PRESENT: databases, DNS, buckets, queues and env var definitions described in versioned files; a new environment can be stood up from the repo plus secrets. PARTIAL: platform config files only, databases and DNS created by hand but documented.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P2] PR-065 Feature flags

Owning PLAN PR: PLAN PR-R1.

Labels: production-readiness, area:deploy, severity:p2

Current state (PARTIAL): lib/sheet-viewer.ts:8-14 env === '1' else notFound(); app/sheets/page.tsx:13, app/sheets/[slug]/page.tsx:25; app/daily/page.tsx:15 isDailyPrototypeEnabled; lib/checkin/forms-gate.ts:19-40 flag plus trusted runtime APP_ENV or NODE_ENV allowlist Owner: PLAN PR-R1. Flags default off and fail closed with 404. The sheet viewer and daily prototype are not bound to a trusted runtime, so setting the env var in a production build exposes them; the check-in gates are runtime-bound. PR-R1 deletes the raw viewer, PR-R3 removes product flags.

Why it matters: Unfinished features block deploys or leak to customers; risky changes cannot be turned off without a rollback.

Acceptance: re-run the check and get PRESENT. Check: `rg -n "featureFlag|isEnabled\(|flags\.|unleash|growthbook|launchdarkly|posthog.*feature" lib app`. PRESENT: a flag mechanism that can change at runtime or per environment, defaults to off in production for unfinished work, and flags fail closed. Dev-only tools gated by a flag must be unreachable in production builds.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P2] PR-066 Autoscaling for traffic spikes

Owning PLAN PR: NEW (no PLAN PR owns it). Shared fix group: G5.

Labels: production-readiness, area:reliability, severity:p2

Current state (MISSING): no hosting config in git ls-files (see PR-061) Owner: NEW. No scaling rules because no hosting exists. P2.

Why it matters: Monday morning load saturates a fixed server and requests time out.

Acceptance: re-run the check and get PRESENT. Check: Hosting config: serverless functions scale by default; containers need min/max instances set (`fly.toml` `[http_service] min_machines_running`, Kubernetes HPA, Render autoscaling). Database and connection pool limits must scale with it (PR-018). PRESENT: scaling rules set and a load test (PR-093) showed headroom. N/A with reason: a single-tenant tool with known small load.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P2] PR-067 CDN for static assets

Owning PLAN PR: NEW (no PLAN PR owns it). Shared fix group: G5.

Labels: production-readiness, area:reliability, severity:p2

Current state (MISSING): no hosting config or CDN in git ls-files; next build -> exit 0 emits /_next/static assets with no host in front Owner: NEW. No CDN. Most managed hosts provide one; decide with the hosting choice. P2.

Why it matters: Users far from the origin wait seconds for JavaScript, images and fonts.

Acceptance: re-run the check and get PRESENT. Check: `curl -sI https://<host>/_next/static/<file> | rg -i "cache-control|x-vercel-cache|cf-cache-status|x-cache|age"`. PRESENT: static assets served from a CDN with long immutable cache headers, images optimized. Most managed hosts provide this; self-hosted needs Cloudflare or similar in front.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P2] PR-076 Storage lifecycle rules

Owning PLAN PR: PLAN PR-MEDIA.

Labels: production-readiness, area:cost, severity:p2

Current state (MISSING): lib/storage.ts:117-123 null backend fails closed; no bucket or lifecycle config in repo Owner: PLAN PR-MEDIA. No object store yet. Lifecycle and orphan cleanup belong with the S3 adapter. P2.

Why it matters: Temp files, old exports and orphaned uploads accumulate and the storage bill grows every month.

Acceptance: re-run the check and get PRESENT. Check: Object storage lifecycle rules (`aws s3api get-bucket-lifecycle-configuration --bucket <bucket>` or provider console). `rg -n "tmp|temp|export" lib/storage*` for files that are never deleted. PRESENT: lifecycle expiry on temp and export prefixes, orphan cleanup job for deleted records, log retention set.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P2] PR-084 Dashboards for latency, errors and throughput

Owning PLAN PR: NEW (no PLAN PR owns it). Shared fix group: G6.

Labels: production-readiness, area:observability, severity:p2

Current state (MISSING): no monitoring tool configured (see PR-080, PR-081) Owner: NEW. No latency, error or throughput dashboard. P2.

Why it matters: You cannot tell whether a deploy made things slower or whether an incident is over.

Acceptance: re-run the check and get PRESENT. Check: Look for a dashboard (platform analytics, Grafana, Datadog, Axiom) showing request rate, error rate and p95 latency per route, plus database and queue health. PRESENT: one dashboard link in the runbook that answers "is it healthy right now".

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P2] PR-085 Distributed tracing

Owning PLAN PR: NEW (no PLAN PR owns it). Shared fix group: G6.

Labels: production-readiness, area:observability, severity:p2

Current state (MISSING): rg '@opentelemetry,registerOTel,@vercel/otel' package.json lib -> no matches; no request id in any code path Owner: NEW. No tracing and no request ids. For a single service, request ids in structured logs (PR-080) would suffice. P2.

Why it matters: One slow request spans the app, database, queue and a third party, and you cannot see which hop is slow.

Acceptance: re-run the check and get PRESENT. Check: `rg -n "@opentelemetry|registerOTel|@vercel/otel|trace" instrumentation.ts lib package.json`. PRESENT: traces with spans for database queries and outbound calls, request ids propagated into logs and jobs. N/A with reason: a single service with few dependencies, where request ids in logs suffice.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P2] PR-088 Postmortems that change something

Owning PLAN PR: NEW (no PLAN PR owns it). Shared fix group: G6.

Labels: production-readiness, area:observability, severity:p2

Current state (MISSING): git ls-files grep -i -E 'postmortem,incident' -> none Owner: NEW. No postmortem template or record. P2.

Why it matters: The same incident repeats because lessons stay in a chat thread.

Acceptance: re-run the check and get PRESENT. Check: `rg -ln "postmortem|incident review|post-incident" docs`. PRESENT: a blameless template, a postmortem for every customer-visible incident, and action items tracked as tickets with owners and closure dates.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P2] PR-089 Status page

Owning PLAN PR: NEW (no PLAN PR owns it). Shared fix group: G6.

Labels: production-readiness, area:observability, severity:p2

Current state (MISSING): no status page config or link in app or docs Owner: NEW. No status page. P2.

Why it matters: During an outage support is flooded and customers assume the worst.

Acceptance: re-run the check and get PRESENT. Check: Look for a status page (Better Stack, Instatus, Atlassian Statuspage, a static page) linked from the app and help docs. PRESENT: reachable when the app is down (separate hosting), updated during incidents, components match the product.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P2] PR-096 Testing on old and slow hardware

Owning PLAN PR: NEW (no PLAN PR owns it).

Labels: production-readiness, area:testing, severity:p2

Current state (MISSING): rg -l lighthouse (excluding fonts and shots) -> none; next build -> exit 0 at 55a0f08, no budget recorded Owner: NEW. No throttled performance numbers. P2.

Why it matters: The app is unusable on the five-year-old laptop or low-end phone a key customer uses.

Acceptance: re-run the check and get PRESENT. Check: Lighthouse with CPU throttling: `npx lighthouse https://<host>/<page> --only-categories=performance --throttling-method=simulate`, or Chrome DevTools CPU 4x/6x slowdown on the main screens. Check JavaScript bundle size from `next build` output. PRESENT: main flows usable with 4x CPU slowdown and a mid-range phone profile, with recorded numbers.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P2] PR-128 Undo

Owning PLAN PR: PLAN PR-W3.

Labels: production-readiness, area:ux, severity:p2

Current state (PARTIAL): Confirm-before-destroy state in app/workspace/[workspaceId]/parameters/parameter-manager.tsx:66 and clients/[clientProfileId]/coaches/assignment-panel.tsx:49; habit Undo in app/(tracker)/workspace/[workspaceId]/dashboard/client-habits-widget.tsx:105; soft archive column db/schema.prisma:641 Owner: PLAN PR-W3. Confirmations and soft archive exist. The D24 timed restore behind canvas Undo toasts is not built.

Why it matters: Accidental deletes and bulk changes become support tickets or permanent loss.

Acceptance: re-run the check and get PRESENT. Check: Live: delete an item, archive, bulk edit. PRESENT: destructive actions offer undo (toast with undo, trash with restore) or a confirmation for irreversible ones, backed by soft deletes (PR-022).

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P2] PR-131 Back button that works

Owning PLAN PR: PLAN PR-31.

Labels: production-readiness, area:ux, severity:p2

Current state (PARTIAL): app/(tracker)/workspace/[workspaceId]/daily/daily-entry-panel.tsx:171 date in URL via router.push; app/workspace/[workspaceId]/clients/page.tsx:60 cursor from search params; daily-entry-panel.tsx:166 unsaved-changes confirm on navigation Owner: PLAN PR-31. Paging and date state live in the URL and unsaved edits are guarded. Capacitor Android back mapping does not exist yet. Needs a live list, detail, edit, back check.

Why it matters: Back exits the app, loses filters and form state, or resubmits a form.

Acceptance: re-run the check and get PRESENT. Check: Live: navigate list to detail to edit, use browser and Android back, and check filters, tabs and pagination live in the URL (`rg -n "useSearchParams|router\.(push|replace)" app components`). PRESENT: back returns to the previous view with state intact; submissions use redirect-after-post.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P2] PR-135 Monthly dependency upgrades

Owning PLAN PR: NEW (no PLAN PR owns it).

Labels: production-readiness, area:code-health, severity:p2

Current state (MISSING): No renovate.json, .github/dependabot.yml or upgrade cadence in repo (git ls-files grep -> exit 1) Owner: NEW. No upgrade cadence or bot. Lead to run npm outdated in root and frontend for major-behind counts.

Why it matters: Upgrades pile up until a security fix needs three majors at once.

Acceptance: re-run the check and get PRESENT. Check: `npm outdated` and count packages behind by a major. Look for Renovate or Dependabot config or a monthly upgrade ticket. PRESENT: no direct dependency more than one major behind without a written reason, and an upgrade cadence on the calendar.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P2] PR-137 Dead code removed

Owning PLAN PR: PLAN PR-R1.

Labels: production-readiness, area:code-health, severity:p2

Current state (PARTIAL): lib/daily-prototype.ts, app/daily, app/sheets raw viewer still in tree; frontend/src/components/ethereal (73 files) parallels coach (progress-content.tsx 2313 vs 2319 lines, 478-line diff); DECISIONS.md:206-213 D33 reduction plan Owner: PLAN PR-R1. Dead and duplicated code is known and scheduled for deletion with a zero-caller census. knip not run (npx knip).

Why it matters: Abandoned first attempts confuse readers and AI tools, keep vulnerable dependencies alive and get edited by mistake.

Acceptance: re-run the check and get PRESENT. Check: `npx knip` (unused files, exports and dependencies) or `npx ts-prune`. `rg -n "_old|_v2|_backup|copy\.tsx|deprecated" -g '!node_modules'`. PRESENT: knip clean or each finding justified.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P2] PR-138 No giant files

Owning PLAN PR: NEW (no PLAN PR owns it).

Labels: production-readiness, area:code-health, severity:p2

Current state (MISSING): git ls-files ts tsx (excluding tests) wc -l above 800 lines -> 38 files, 13 in root; lib/trainingprogram/service.ts 3504, lib/checkin/instances.ts 3401, frontend/src/components/coach/builder/progress-content.tsx 2319 Owner: NEW. Several hand-written modules are three to four times the limit with no recorded reason. No PR plans to split them; PR-R1 removes some frontend duplicates only.

Why it matters: A 2,000-line file nobody can review, test or merge without conflicts.

Acceptance: re-run the check and get PRESENT. Check: `git ls-files '*.ts' '*.tsx' | xargs wc -l | sort -n | tail -15`. PRESENT: no hand-written source file above roughly 500 to 800 lines without a reason (generated files excluded), and large modules split by responsibility.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P2] PR-139 Architecture decisions recorded

Owning PLAN PR: PLAN PR-05.

Labels: production-readiness, area:code-health, severity:p2

Current state (PARTIAL): icm/03-plan/DECISIONS.md D1 to D36 with reasons and dates (last change 6b54a7d 2026-10-19); docs/product-decisions.md:3; code links such as eslint.config.mjs:11 citing D4a; DECISIONS.md:110 D16a not yet recorded though icm/05-build/AUTH-DECISION.md:95 accepted Better Auth Owner: PLAN PR-05. Decision log is current and reasoned. D16a and the D5 auth row are not updated for the accepted Better Auth verdict.

Why it matters: A year later nobody knows why the system is built this way, so decisions get reversed blindly.

Acceptance: re-run the check and get PRESENT. Check: `ls docs/adr docs/decisions; rg -ln "Decision|ADR" docs`. PRESENT: decisions written with context, options and reasons, dated, and linked from the code area they affect.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P2] PR-141 Documentation for whoever inherits this

Owning PLAN PR: PLAN PR-X1.

Labels: production-readiness, area:code-health, severity:p2

Current state (PARTIAL): docs/ holds STATUS.md, product-decisions.md, implementation-plan.md, security/ (authorization-model.md superseded per DECISIONS.md:103); git ls-files grep runbook, architecture or deploy -> none Owner: PLAN PR-X1. Rich history and decision docs, but no architecture overview, data-flow or integration list, deploy guide, runbooks or per-doc owner.

Why it matters: When the builder leaves, operations, data flows and integrations become archaeology.

Acceptance: re-run the check and get PRESENT. Check: `ls docs`. PRESENT: an architecture overview, data flow and integration list, environment and deploy guide, runbooks (PR-087), and an owner per document, updated within the last few months.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P2] PR-142 Admin panel for operations

Owning PLAN PR: PLAN PR-05. Shared fix group: G3.

Labels: production-readiness, area:ops-tooling, severity:p2

Current state (PARTIAL): app/workspace/[workspaceId]/admin/page.tsx:9-30 owner-only area, 'Settings management is not' implemented; DECISIONS.md:99 platform admin denied Owner: PLAN PR-05. A guarded placeholder page only; no find user, resend invite or disable account. PR-05-OWNED: Better Auth admin plugin. Owner decision D15 currently denies a platform admin console.

Why it matters: Every account fix, plan change or data correction is a raw SQL query in production.

Acceptance: re-run the check and get PRESENT. Check: `rg -ln "admin" app`. PRESENT: an internal admin area behind a staff role (server-enforced) covering common operations (find user, change plan, resend invite, disable account), with every action audit-logged (PR-047).

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P2] PR-143 Support tooling

Owning PLAN PR: PLAN PR-05. Shared fix group: G3.

Labels: production-readiness, area:ops-tooling, severity:p2

Current state (MISSING): git grep -i impersonat in lib app -> exit 1; DECISIONS.md:101 support role stays unused Owner: PLAN PR-05. No support view, user lookup or impersonation. PR-05-OWNED: Better Auth admin impersonation (AUTH-DECISION.md:25 notes no built-in audit log; PR-05 adds an audit row test, AUTH-DECISION.md:85).

Why it matters: Customer success pings engineering for every "why can't this user log in".

Acceptance: re-run the check and get PRESENT. Check: Look for a support view (user lookup, recent activity, email delivery status, subscription state) and help-desk integration. PRESENT: support answers the top ten question types without engineering, within their role's permissions and with impersonation audited (PR-012).

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

### [P2] PR-144 Changelog customers can read

Owning PLAN PR: NEW (no PLAN PR owns it).

Labels: production-readiness, area:ops-tooling, severity:p2

Current state (MISSING): git ls-files grep -i changelog -> exit 1 Owner: NEW. No customer changelog. docs/STATUS.md is an engineering log, not customer language.

Why it matters: Customers miss new features and are surprised by changes, which generates tickets.

Acceptance: re-run the check and get PRESENT. Check: `ls CHANGELOG.md; rg -ln "changelog|release notes|what's new" app docs`. PRESENT: a dated, customer-language changelog published in the app or on the website, updated with every release that users notice.

Verification: a verifier other than the builder re-runs the check and pastes the evidence.

## People

Staffing gaps for the owner. Not code tickets; no severity.

- RO-01 Senior engineer reads every AI line before ship: Review is covered only by AI agent lanes; an agent lane is not a person. No named senior human reviewer reads every line.. Without it: AI-generated code ships unread, carrying plausible-looking bugs, insecure patterns and dead ends.
- RO-02 Backend engineer designs the data model: D34 is a process rule, not an owner. hanzlahcodex authored most schema commits, but no record names an accountable schema reviewer; PR-M0 schema work is assigned to agent cards.. Without it: The schema grows table by table from prompts and the second customer breaks it (PR-001, PR-029).
- RO-03 Senior engineer explains cascading fixes: No person is accountable for root-cause analysis; fixes are built and verified by agent lanes.. Without it: Each AI fix creates new bugs because nobody understands root causes, and the bug count climbs.
- RO-04 DevOps owns deploys, rollbacks, servers and the cloud bill: Nobody owns deploys, rollbacks, servers or the cloud bill; there is no deployment yet.. Without it: Deploys, rollbacks and spending have no owner, so failures and runaway costs go unnoticed.
- RO-05 Someone answers the 3am page: No on-call schedule or named responder.. Without it: Payments stop at night and stay stopped until morning.
- RO-06 Security patches the framework within the week: Framework patching happens through orchestrated agent cards; no named person watches advisories.. Without it: A public framework CVE stays exploitable on your site for weeks.
- RO-08 QA tests what the AI says it tested: Verification is assigned to a different AI model, not a person. The named local check script is untracked at this commit (icm/05-build/tools/verify-local.sh).. Without it: "All tests pass" claims from builders or AI agents go unchecked and broken features ship.
- RO-09 Backend engineer runs live migrations safely: No production database and no named owner for live migrations.. Without it: A live migration locks tables or loses rows.
- RO-11 Architect turns "works on my laptop" into "works for every customer": Isolation, scaling and failure-mode design review is done by agent judge lanes; no named human architect.. Without it: Designs that work for one user fail under concurrency, multiple tenants and production scale.
- RO-12 Senior engineer debugs when the AI cannot: No production system and no record of a person debugging it.. Without it: When the AI loops on a bug, the team has nobody who can debug the system directly, and outages last days.
