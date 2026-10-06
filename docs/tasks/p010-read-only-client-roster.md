# P-010 — Read-only staff client roster

- **Status:** plan committed before any production code (TDD recovery discipline)
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
