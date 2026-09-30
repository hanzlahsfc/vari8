# S1-F2B repair plan — DeepSeek FAIL findings

Independent review (opencode-go/deepseek-v4.1-flash) **FAIL**ed `ac9857e`.
Repair plan only — no production changes yet. Builder: SWE-2 High.

## Root cause verified against installed runtime (next-auth@5.0.0-beta.32 / @auth/core@0.41.3)

- `next-auth/lib/index.js` `getSession()` (the server `auth()` path) wraps our
  `session` callback as `(await config.callbacks.session(...)) ??
{ ...args[0].session, expires }` — a `null` return coalesces to the
  token-derived default session with `user` populated. `auth()` therefore
  stayed authenticated on every rejection our callback produced.
- `@auth/core/lib/actions/session.js` (the `/api/auth/session` route-handler
  path — also the pipeline `getSession` invokes): `callbacks.jwt` returning
  **`null`** (typed `Awaitable<JWT | null>`) → `token === null` →
  `sessionStore.clean()` clearing cookies are pushed and `response.body` stays
  `null` → both `auth()` and the session endpoint are unauthenticated.

**Selected mechanism:** gate inside the `jwt` callback — `null` token
invalidates. On sign-in (`user` present) stamp `sv`; on every other invocation
validate `sub`/`sv` against a fresh PK read → `null` on any failure. The
`session` callback reverts to pure base delegation (a null token never reaches
it). Cookie-clearing comes free via `sessionStore.clean()`.

## Repairs

1. **P0 real-path revocation** — move the gate from `session` to `jwt`;
   `lib/auth/session.ts` (`createSessionCallbacks`) returns `null` for invalid
   tokens; no `null as unknown as Session` remains. Runtime regression test
   through the real `Auth()` pipeline (`@auth/core`) with the actual
   `authNodeCallbacks` object wired into `auth.ts` + real signed JWT cookies
   (`@auth/core/jwt` encode, same secret/salt/cookie name): proves all invalid
   cases return null body + cleared cookie, valid sessions still work, and
   `update` payloads can't inject `sv`.
2. **P2 audit reader index** — additive migration adds
   `audit_event_subject_user_id_id_idx` `(subject_user_id, id)` matching the
   existing id-cursor pagination; `@@index([subjectUserId, id], map:...)` in
   schema; `EXPLAIN` asserted on an analyzed fixture (documented, not
   exaggerated — planner is free to choose otherwise on tiny tables).
3. **P3 cleanup index** — same migration adds an expression index on the
   effective terminal timestamp + id; `CLEANUP_VICTIMS_SQL` rewritten to use
   the same expression (`ORDER BY expr, id LIMIT 1000` → index serves scan +
   order + bound). `EXPLAIN` evidence on an analyzed multi-thousand-row
   fixture.
4. **P3 deliberate composition** — `createSessionCallbacks` spreads the base
   callbacks object and overrides only `jwt`/`session`; regression tests prove
   preserved base behavior + no resurrection.
5. **Docs** — record FAIL, repairs, runtime proof, index design, remaining
   risks; review still pending; never self-approved.

## Mutations to prove

jwt-gate bypassed · missing-sv accepted · status/version/DB-error checks
removed · `sv` settable from update payload · composition spread removed ·
audit index absent (EXPLAIN/plan or predicate test) · cleanup terminal
semantics weakened · cleanup LIMIT removed.

## Gates

Full gate set on fresh disposable PG; docs updated; scoped commits; normal
push; re-review pending.
