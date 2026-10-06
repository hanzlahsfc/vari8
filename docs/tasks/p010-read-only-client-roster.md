# P-010 — Read-only staff client roster

- **Status:** `3965792` independently reviewed PASS (no P0/P1/P2) by
  `opencode-go/deepseek-v4.1-flash`; two P3 hardening repairs applied in R2
  (staff-only nav pin, users-table invariant) — repair delta awaits its own
  independent review
- **Branch:** `feature/p010-read-only-client-roster`
- **Base:** verified `origin/main` `d050566a13781bb7d2b9bafa9ee3147527d28b37`
  (contains the merged P-008 onboarding form-definition builder)
- **Supersedes:** the earlier proposed "staff invitation management" slice was
  rejected — no invitation issuance/listing/revocation/resend, no raw-token
  surface. `assertInvitationOrchestrationExternallyExposable` stays intact.

## Scope

One read-only staff surface: `GET /workspace/[workspaceId]/clients` inside the
existing authenticated workspace shell, plus a role-aware "Clients" nav entry.
The page re-authorizes through the existing guarded service
`listAccessibleClientProfiles` (`lib/workspace/clients.ts`) — no new service,
no boundary module, no schema, no RBAC change.

Effective visibility (existing `clientProfiles/read` matrix, unchanged):

- WORKSPACE_OWNER → workspace scope (all clients in the workspace)
- COACH / ASSISTANT_COACH → assigned scope (ACTIVE ClientAssignment only)
- SUPPORT → denied; PLATFORM_ADMIN → denied (matrix + PD29-style guard)
- CLIENT → `own` scope exists, but the workspace shell already denies CLIENT
  via `workspaceSettings/read`; the roster page never renders for CLIENT.
- Non-member / SUSPENDED / REMOVED / cross-workspace → fail closed.

## Design decisions

- **Cursor param `c`**: opaque clientProfile id ("rows with id > c").
  Strict validation: single value only (array → reject), non-empty,
  `^[a-z0-9]{1,64}$` charset+length bound. Malformed/duplicated/oversized →
  `forbidden()` (repo-standard non-disclosing 403, same convention as the
  P-008 preview `src` param).
- **History param `p`**: comma-separated stack of prior-page cursors so a real
  "Previous" link works with the service's forward-only cursor. Entries are
  valid cursors, with `-` (not a valid cursor) as the page-1 sentinel allowed
  only at index 0. Bounds: ≤ 64 entries, ≤ 2048 raw chars. `p` without `c` is
  incoherent → reject.
- **Fixed page size:** `ROSTER_PAGE_SIZE = 25` (service default limit; the
  service clamps 1..100 regardless).
- **Href builders** produce only `c`/`p` params on the canonical route path —
  no unrelated query propagation.
- **Fields shown:** `name`, `createdAt`, `updatedAt` (the service's
  `ClientProfileSummary`; Date → ISO date `YYYY-MM-DD`). No user ids, emails,
  assignments, tokens, health data.
- **Errors:** `AccessDeniedError` → `forbidden()`; anything else propagates
  (500), matching the codebase's "deny ≠ fault" mapping. Reads write no audit
  events (service performs no audit writes).

## Files

- `lib/workspace/roster-query.ts` (new) — pure cursor/history parse + href
  builders + `ROSTER_PAGE_SIZE` (unit-testable, no I/O).
- `app/workspace/[workspaceId]/clients/page.tsx` (new) — the route.
- `components/workspace-nav.tsx` — one nav item
  (`clientProfiles`/`read`).
- `app/globals.css` — minimal tokenized pagination styles (if needed).
- Tests: `tests/unit/client-roster.test.ts`,
  `tests/unit/client-roster-nav.dom.test.tsx`,
  `tests/integration/p010-client-roster.test.ts`,
  `tests/e2e/client-roster.spec.ts`.
- Docs: this file, `docs/STATUS.md`.

## TDD order

1. Unit RED: `npx vitest run tests/unit/client-roster.test.ts` (module absent).
2. Unit RED (nav DOM): `npx vitest run tests/unit/client-roster-nav.dom.test.tsx`.
3. Integration: `INTEGRATION_DATABASE_URL=postgresql://app:app_dev_password@127.0.0.1:<port>/p010_int?schema=public npx vitest run --config vitest.integration.config.ts tests/integration/p010-client-roster.test.ts`
   — characterization/regression coverage of the existing reviewed service;
   expected green on first run except any assertion pinning the new surface
   contract. Recorded honestly.
4. E2E RED: `DATABASE_URL=postgresql://app:app_dev_password@127.0.0.1:<port>/p010_e2e?schema=public npx playwright test tests/e2e/client-roster.spec.ts`
   (route absent → 404).
5. Implement module → page → nav → CSS; GREEN each suite.
6. Full gates: `git diff --check`, `format:check`, `typecheck`, `lint`,
   `test`, `test:integration` (disposable PG), `prisma` format/validate/
   `migrate deploy` + `migrate status`, `build`, `test:e2e` (full suite).

## Acceptance (observable)

- Owner sees all workspace clients; coach/assistant see only ACTIVE assigned;
  empty state otherwise; SUPPORT/CLIENT/platform-admin/non-member/cross-workspace
  → HTTP 403; unauthenticated → `/login`.
- Pagination bounded to 25/page; next/prev stable and non-overlapping.
- No mutation controls; no POST/action requests from the page.
- No viewport overflow at 1440/834/390; keyboard focus visible; 44px targets.
- Zero audit/mutation writes on read.

## Non-goals / explicit exclusions

No create/edit/delete, no assignments UI, no intake/submissions, no invitations
or tokens, no email delivery, no formulas, no client-visible surface, no deploy.

## Execution record (real commands, real exit codes)

RED (observed before any production code):

- `npx vitest run tests/unit/client-roster.test.ts tests/unit/client-roster-nav.dom.test.tsx`
  → exit 1: `ERR_MODULE_NOT_FOUND` for `lib/workspace/roster-query`; nav DOM
  3/4 fail (no Clients link for owner/coach/assistant; SUPPORT pass).
- `INTEGRATION_DATABASE_URL=postgresql://app:app_dev_password@127.0.0.1:5433/p010_int?schema=public
npx vitest run --config vitest.integration.config.ts tests/integration/p010-client-roster.test.ts`
  → exit 1: module import failure on `roster-query`.
- `DATABASE_URL=postgresql://app:app_dev_password@127.0.0.1:5433/p010_e2e?schema=public
npx playwright test tests/e2e/client-roster.spec.ts` → exit 1: 23/23 fail
  (route absent — 404/redirect assertions).

GREEN (same commands after implementation):

- Unit `25/25` (21 query seam + 4 nav DOM); integration `9/9`; e2e `23/23`.
- Test-side repairs during integration/e2e bring-up (tests only, recorded):
  `assign` fixture helper gained the required `role` argument; the
  no-mutation request listener moved after `signIn` so the login POST is not
  counted.
- Full gates on the final tree: `git diff --check` 0; `npm run format:check` 0;
  `npm run typecheck` 0; `npm run lint` 0; `npm run test` → **613/613**;
  `npm run test:integration` on disposable `p010_int` → **298/298**;
  `npx prisma validate` OK, `prisma format --check` OK,
  `prisma migrate status` → 13 applied / none pending (no schema change);
  `npm run build` → 0 (`/workspace/[workspaceId]/clients` dynamic, 0 B);
  full `npx playwright test` → **175 passed / 12 skipped** (pre-existing
  reset-route skips) + 1 flake: `onboarding-forms.spec.ts:2209` timed out on
  `no-draft` in the full run, passed isolated rerun in 706ms — recorded, not
  related to this diff.

Same-model self-review notes (not independent review):

- Page re-authorizes via the reviewed service; `AccessDeniedError` →
  `forbidden()`, all other errors propagate to 500 (repo convention).
- Cursor charset bound (`^[a-z0-9]{1,64}$`i) plus history depth/length bounds
  keep `c`/`p` strictly server-safe; malformed input never reaches the service.
- Rendered fields are exactly `name`, `createdAt`, `updatedAt` — the
  `ClientProfileSummary` select; no ids/emails/assignments/tokens exposed.
- CLIENT nav entry: the generic scope filter (`own` ≠ denied) would include it,
  but the shell's `workspaceSettings/read` gate 403s CLIENT before nav renders;
  e2e pins the route denial.
- Disposable DBs `p010_int`/`p010_e2e` live on the repo's compose PostgreSQL;
  they are scratch fixtures, droppable after review.

## Independent review disposition (P-010-R1 → P-010-R2)

Independent reviewer `opencode-go/deepseek-v4.1-flash` reviewed `3965792`:
**PASS, no P0/P1/P2 findings.** Eight P3 observations, dispositioned below;
the repairs in this round were reviewed-separately deltas (the repair commit
itself gets its own independent review — not claimed here).

| Ref  | Finding                                                                                                     | Disposition                                                                                                                                                              |
| ---- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P3-1 | Staff-only nav pin missing (CLIENT resolves `own` scope; hidden only because the shell denies CLIENT first) | **Repaired (R2):** item-level `roles` pin on the Clients entry; DOM spec adds the CLIENT assertion (observed RED → GREEN). Cosmetic only; route authorization unchanged. |
| P3-2 | Read-only invariant did not snapshot `users`                                                                | **Repaired (R2):** `users` count added to the zero-mutation snapshot (authorized + denied reads). Passes immediately — defense-in-depth, not fabricated RED.             |
| P3-3 | Client-profile id exposed as URL cursor                                                                     | Accepted: opaque identifier; authorization stays workspace/scope-constrained; fixing requires an out-of-scope service-contract change.                                   |
| P3-4 | URL history/page-number fabrication                                                                         | Accepted: cosmetic only; cannot alter authorization or query scope.                                                                                                      |
| P3-5 | UTC date rendering                                                                                          | Deferred: cosmetic until a product timezone/display policy exists.                                                                                                       |
| P3-6 | Test-harness adjustments inside the implementation commit                                                   | Accepted: no assertions were removed.                                                                                                                                    |
| P3-7 | Platform-admin-with-membership resolves member scope                                                        | Pre-existing dual-role policy question, not widened by P-010; tracked separately — no redesign here.                                                                     |
| P3-8 | Unknown query parameters ignored                                                                            | Accepted: consistent with route conventions; generated links preserve only `c`/`p`.                                                                                      |
