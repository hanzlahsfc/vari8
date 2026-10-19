# TB1-w2 describe-level audit

Worker TB1-w2, integration slice B. Worktree
`/home/nexuslink/.hermes/cache/scratch/vari8-tb/TB1-w2` at 58eb6ed, database
`app_tb_tb1_w2`. Baselines (all green, real passed counts not skipped):

- tests/integration/s1-c-client-assignments.test.ts: 9 passed
- tests/integration/s1-e-audit.test.ts: 14 passed
- tests/integration/s1-f1-token-schema.test.ts: 26 passed
- tests/integration/s1-f2a-token-store.test.ts: 14 passed
- tests/integration/s1-f2b-session-runtime.test.ts: 7 passed
- tests/integration/s1-f2b-session.test.ts: 6 passed
- tests/integration/s1-g-export.test.ts: 9 passed

| file                                              | block                                                       | lines   | tests | target                                                                                            | verdict | reason or mutation                                                                                                                                                              | failed tests                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------- | ----------------------------------------------------------- | ------- | ----- | ------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| tests/integration/s1-c-client-assignments.test.ts | S1-C client ownership & assignments                         | 26-619  | 9     | lib/workspace/clients.ts, lib/auth/guard.ts via real repo                                         | KEEP    | lib/workspace/clients.ts:108 base filter `{ workspaceId: ctx.workspaceId }` -> `{}`                                                                                             | OWNER lists only clients in their workspace; foreign-workspace profiles are never returned; all list queries stay workspace-scoped with a bounded limit                                                                                                                                                                                                                                     |
| tests/integration/s1-e-audit.test.ts              | S1-E metadata-only audit                                    | 34-751  | 14    | lib/audit.ts with lib/consent.ts and lib/workspace/clients.ts as transaction partners             | KEEP    | lib/audit.ts:361 buildAuditEvent `result: "ALLOW"` -> `"DENY"`                                                                                                                  | successful grant commits consent row and exactly one GRANT audit event; revoke commits one REVOKE event with structural meta only; assignment mutations each commit their audit event                                                                                                                                                                                                       |
| tests/integration/s1-f1-token-schema.test.ts      | S1-F1 access_token + session_version (real PostgreSQL)      | 51-426  | 24    | db/migrations (access_token CHECKs, unique hash, FKs, users.session_version)                      | KEEP    | db/migrations/20260930150000_stage1_access_tokens/migration.sql:68 dropped `AND "created_by_user_id" IS NOT NULL` from access_token_invite_shape CHECK; DB recreated before run | rejects an invite without created_by_user_id                                                                                                                                                                                                                                                                                                                                                |
| tests/integration/s1-f1-token-schema.test.ts      | S1-F1 migration applies on top of existing data             | 428-504 | 2     | db/migrations/20260930150000_stage1_access_tokens applied over pre-migration data                 | KEEP    | same migration.sql:11 `session_version ... DEFAULT 0` -> `DEFAULT 7`; DB recreated before run                                                                                   | existing users receive session_version = 0 (no rewrite)                                                                                                                                                                                                                                                                                                                                     |
| tests/integration/s1-f2a-token-store.test.ts      | S1-F2A token store (real PostgreSQL)                        | 41-546  | 14    | lib/tokens/store.ts, lib/tokens.ts                                                                | KEEP    | lib/tokens/store.ts:242 claimAccessToken where clause dropped `consumedAt: null`                                                                                                | claims an active token exactly once; second claim fails structurally; two concurrent claims yield exactly one success                                                                                                                                                                                                                                                                       |
| tests/integration/s1-f2b-session-runtime.test.ts  | S1-F2B session revocation through the real Auth.js pipeline | 65-203  | 7     | auth.ts real NextAuth pipeline via lib/auth/session.ts authNodeCallbacks                          | KEEP    | lib/auth/session.ts:146 `return allowed ? next : null;` -> `return next;`                                                                                                       | sessionVersion bump makes real auth() unauthenticated; missing, malformed, non-integer, negative sv all fail closed; non-ACTIVE and unknown/deleted users are unauthenticated; malformed/missing subject fails closed; DB failure fails closed; /api/auth/session returns null and clears the cookie on invalidation; update payloads cannot inject or refresh sv through the real pipeline |
| tests/integration/s1-f2b-session.test.ts          | S1-F2B session version (real PostgreSQL)                    | 45-185  | 6     | lib/auth/session.ts (createSessionCallbacks), lib/credentials.ts, lib/password.ts, auth.config.ts | KEEP    | lib/auth/session.ts:146 `return allowed ? next : null;` -> `return next;`                                                                                                       | incrementing sessionVersion invalidates the old JWT; fresh sign-in works; DEACTIVATED and INVITED users are rejected even with a matching sv; missing, malformed, non-integer, and negative sv are all rejected; unknown user and missing sub are rejected                                                                                                                                  |
| tests/integration/s1-g-export.test.ts             | S1-G export                                                 | 18-356  | 9     | lib/gdpr/export.ts, lib/auth/guard.ts                                                             | KEEP    | lib/gdpr/export.ts:296 `ctx.grantedScope === "own"` -> `!== "own"`                                                                                                              | scoped export honors the matrix: owner workspace, assigned coach allowed; others denied; client cannot use the scoped path even for their own profile                                                                                                                                                                                                                                       |

Per-file verdict lines:

- tests/integration/s1-c-client-assignments.test.ts: KEEP-ALL
- tests/integration/s1-e-audit.test.ts: KEEP-ALL
- tests/integration/s1-f1-token-schema.test.ts: KEEP-ALL
- tests/integration/s1-f2a-token-store.test.ts: KEEP-ALL
- tests/integration/s1-f2b-session-runtime.test.ts: KEEP-ALL
- tests/integration/s1-f2b-session.test.ts: KEEP-ALL
- tests/integration/s1-g-export.test.ts: KEEP-ALL

## Could not check

None

## Self-check

- 7 files audited, 8 top-level describe blocks (s1-f1-token-schema.test.ts has two
  top-level describes; every other file has exactly one).
- Verdicts: 8 KEEP, 0 CUT. Every KEEP row names a mutation that made at least one of
  the block's own tests fail (logs: /tmp/tb1-w2-*.log, lever: /tmp/tb1-w2-mutate.sh).
- Worktree clean: `git -C <worktree> status --porcelain` empty after every mutation
  (script asserts) and at the end (verified, 0 lines).
- Post-restore sanity: s1-f2b-session.test.ts re-run green (6 passed) on the
  recreated database, proving all mutations were reverted.
- Nothing written outside this output file and /tmp; no commits, no pushes; only
  database app_tb_tb1_w2 was touched; worktree and database left in place for the
  lane lead.
