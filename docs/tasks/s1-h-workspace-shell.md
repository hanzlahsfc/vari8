# S1-H — authenticated workspace shell + server-side guard wiring + 403 routing

**Plan only — committed before production code.** Builder: SWE-2 High.
Branch `feature/s1-h-workspace-shell` off verified `main` `3d04829`
(S1-G merged via PR #2; post-merge CI passed).

Sources: `docs/tasks/stage-1-plan.md` §9 (row S1-H), `docs/security/authorization-model.md`,
`docs/security/consent-audit.md`, `docs/product-decisions.md` #3 (platform-specific UI direction),
`lib/auth/rbac.ts`, `lib/auth/guard.ts`, `lib/workspace/access.ts`, `auth.ts`, `app/**`.

## 1. Objective / non-goals

Deliver the **authenticated workspace shell** and the **server-side authorization/403 routing**
slice: a signed-in user can see their ACTIVE workspaces, enter a workspace shell, and any
denied access renders a real HTTP 403 access-denied page. Authorization is enforced in server
code on every route; UI visibility is never authorization.

In scope:

1. Session gate: unauthenticated requests to `/workspace*` redirect to `/login`.
2. Workspace list resolved from the session (ACTIVE user, ACTIVE membership, ACTIVE workspace).
3. Workspace shell route with server-side guard wiring (`authorize`/`authorizeCollection`).
4. Real HTTP 403 access-denied page (`app/forbidden.tsx` via Next `forbidden()`).
5. Role-aware navigation (cosmetic only — every route re-authorizes server-side).
6. Form-factor-appropriate layout: informative desktop/web, plus distinct tablet and mobile
   interfaces (not one layout stretched).
7. Sign-out.

Explicitly OUT of scope (do not build, do not expose):

- No invitation, password-reset, export (S1-G), or storage route/service exposure. The S1-G
  services and `lib/workspace/invitations.ts` / `lib/auth/password-reset.ts` stay internal and
  unimported by `app/**`.
- No workbook calculations, no health modules, no client/health data reads.
- No workspace/member CRUD, no assignment UI, no audit-log UI.
- No product name invention (placeholder `App` remains), no branding, no i18n.
- No schema/migration change. No new dependency. No vendor/RLS/Supabase.
- No rate limiting (not needed — the only public surface remains sign-in, unchanged).

## 2. Locked behavior this slice must honor

- Role/status are read from the database **per request** via the existing S1-B guard
  (`lib/auth/guard.ts`), never trusted from JWT claims; each request targets exactly one
  workspace validated against an ACTIVE membership.
- Denials are structural; the outward surface is a 403 page that reveals nothing about the
  workspace (no name, no existence confirmation).
- Cross-workspace, non-member, inactive-user, inactive-workspace, and role-denied cases all
  resolve to 403 (not 404, not a redirect loop).
- The public sign-in page and `/` remain reachable unauthenticated (unchanged); `/workspace*`
  requires a session.

## 3. Routes and contracts

| Route | Session | Authorization (server) | Denied result |
| --- | --- | --- | --- |
| `/workspace` | required (`redirect('/login')`) | list the session user's ACTIVE memberships in ACTIVE workspaces | `redirect('/login')` when unauthenticated |
| `/workspace/[workspaceId]` (layout) | required | `workspaceSettings` **read** (`authorize`) | `forbidden()` → HTTP 403 |
| `/workspace/[workspaceId]` (overview) | inherited | none beyond the layout guard | 403 via layout |
| `/workspace/[workspaceId]/admin` | inherited | `workspaceSettings` **write** (`authorize`) — owner-only | `forbidden()` → HTTP 403 |

Matrix check (`lib/auth/rbac.ts`): `workspaceSettings` read = `ws` for OWNER/COACH/ASSISTANT,
denied for SUPPORT/CLIENT; write = `workspace` for OWNER only, denied for COACH/ASSISTANT/
SUPPORT/CLIENT; PLATFORM_ADMIN read = `platform` (collection guard rejects platform scope), write
denied. So `/admin` is a clean owner-only 403 demo inside a workspace the user already belongs to.

## 4. Files

New:

- `lib/auth/route-guard.ts` (server-only) —
  - `resolveWorkspaceAccess(session, request, client?)`: wraps `authorize` and returns
    `AuthorizationContext | null` (null on `AccessDeniedError`); never throws outward.
  - `requireWorkspaceAccess(session, request, client?)`: calls `resolveWorkspaceAccess`; on
    null calls `forbidden()` from `next/navigation`.
  - `requireSessionUser()`: `auth()` → session user id or `redirect('/login')`.
  - `listSessionWorkspaces(session)`: DB-scoped list of the user's ACTIVE workspaces
    (`workspaceMember` where `userId`, `status: ACTIVE`, `workspace.status: ACTIVE`), minimal
    fields (`id`, `name`, `role`).
- `app/forbidden.tsx` — access-denied UI (rendered by `forbidden()`, HTTP 403).
- `app/workspace/page.tsx` — signed-in workspace list (uses `requireSessionUser` +
  `listSessionWorkspaces`); empty state when none.
- `app/workspace/[workspaceId]/layout.tsx` — shell chrome; guards `workspaceSettings/read`
  via `requireWorkspaceAccess`; renders workspace name + role + role-aware nav + sign-out.
- `app/workspace/[workspaceId]/page.tsx` — overview (no sensitive data).
- `app/workspace/[workspaceId]/admin/page.tsx` — owner-only placeholder; guards
  `workspaceSettings/write`.
- `components/workspace-nav.tsx` — server component; nav links filtered by `resolveScope`
  (cosmetic; pages re-authorize).
- `app/logout/actions.ts` — `signOutAction` server action (`signOut({ redirectTo: '/login' })`).
- `tests/unit/route-guard.test.ts`, `tests/integration/s1-h-route-guard.test.ts`,
  `tests/e2e/workspace-shell.spec.ts`, `tests/e2e/global-setup.ts`.

Touched:

- `next.config.ts` — `experimental.authInterrupts: true` (enables `forbidden()`), documented.
- `playwright.config.ts` — `globalSetup` to migrate + seed synthetic E2E fixtures.
- `components/app-nav.tsx` — add a static `/workspace` link.
- `app/globals.css` — shell styles with desktop/tablet/mobile breakpoints.
- `docs/tasks/s1-h-workspace-shell.md` (this file), `docs/STATUS.md`.

**No `db/**` change** — gate: `git diff 3d04829 -- db/` empty.

## 5. Guard design (fail closed)

```ts
// lib/auth/route-guard.ts (server-only)
export async function resolveWorkspaceAccess(
  session: SessionLike,
  request: { resource: Resource; action: Action; workspaceId: string },
  client: PrismaLike = prisma,
): Promise<AuthorizationContext | null>;
export async function requireWorkspaceAccess(...): Promise<AuthorizationContext>; // forbidden() on null
export async function requireSessionUser(): Promise<{ userId: string }>; // redirect('/login')
export async function listSessionWorkspaces(
  session: SessionLike,
): Promise<{ id: string; name: string; role: WorkspaceRole }[]>;
```

- `resolveWorkspaceAccess` reuses `authorize(session, request, createPrismaAuthorizationRepo(client))`
  and maps `AccessDeniedError` → `null`. It does **not** catch unexpected DB errors (those
  propagate to the framework as 500, never as a false 403).
- `forbidden()` renders `app/forbidden.tsx` with status 403 (Next 15 auth interrupts). If the
  installed Next build does not support `authInterrupts`, the plan falls back to a dedicated
  `/403` route reached via `redirect('/403')`; that deviation must be recorded and the E2E
  assertion updated to the real status. Primary path is the real 403.
- The shell layout guards `workspaceSettings/read`; `/admin` guards `workspaceSettings/write`.
  Both run server-side per request with a DB re-read.

## 6. UI / form-factor direction

- **Desktop/web (≥1024px):** two-column shell — persistent left sidebar (workspace switcher
  list + role-aware nav) and a content region with a workspace header (name, role, sign-out).
- **Tablet (640–1023px):** top app bar with the workspace header and a horizontally scrollable
  nav row; content full width; touch-sized targets (≥44px).
- **Mobile (<640px):** compact header, single-column content, nav as a stacked list / bottom
  tab row; no horizontal document overflow at 390px.
- One design system: colors/spacing exclusively from the existing theme tokens
  (`themes/pro-dark.css`), no hex in `globals.css`. Distinct layouts per form factor — never one
  layout stretched.

## 7. RED tests, commands, acceptance

TDD: failing tests first, watch them fail, minimal GREEN, mutation-check load-bearing
assertions, restore byte-exact.

Unit (`tests/unit/route-guard.test.ts`, mocked repo + `next/navigation`):

- `resolveWorkspaceAccess` returns the context when the guard allows and `null` on every
  `AccessDeniedError` reason; unexpected errors are not swallowed.
- `requireWorkspaceAccess` calls `forbidden()` exactly when `resolveWorkspaceAccess` is null.
- `requireSessionUser` calls `redirect('/login')` when `auth()` is null/empty and returns the
  user id otherwise.
- `listSessionWorkspaces` query is scoped to the session user + ACTIVE membership + ACTIVE
  workspace and selects minimal fields.

Integration (`tests/integration/s1-h-route-guard.test.ts`, real disposable PostgreSQL):

- owner/coach/assistant resolve `workspaceSettings/read`; SUPPORT/CLIENT/non-member deny;
  DEACTIVATED user denies; SUSPENDED/REMOVED membership denies; SUSPENDED workspace denies.
- `/admin` contract: owner resolves `workspaceSettings/write`; coach/assistant/SUPPORT/CLIENT/
  non-member/platform-admin deny.
- Cross-workspace: a member of workspace A gets `null` for workspace B.
- `listSessionWorkspaces` returns only the user's ACTIVE workspaces (excludes SUSPENDED
  workspace, SUSPENDED/REMOVED membership, other users) and never leaks other members.

E2E (`tests/e2e/workspace-shell.spec.ts`, real browser; `tests/e2e/global-setup.ts` migrates +
seeds synthetic fixtures):

- Unauthenticated `/workspace` and `/workspace/<id>` redirect to `/login`.
- Signed in as owner: `/workspace` lists the workspace; `/workspace/<id>` renders the shell
  (workspace name + role); `/workspace/<id>/admin` renders the owner area.
- Signed in as coach: `/workspace/<id>` renders; `/workspace/<id>/admin` returns **HTTP 403**
  and shows the access-denied page; the workspace name is not disclosed on the 403 page.
- Signed in as non-member: `/workspace/<id>` returns HTTP 403.
- Form factors: at 1440px, 834px, and 390px the shell renders with no document horizontal
  overflow and usable navigation; assert distinct layout markers per breakpoint (sidebar vs
  top-bar vs stacked).
- Sign-out returns to `/login`.

Focused commands:
`npx vitest run tests/unit/route-guard.test.ts`;
`npm run test:integration -- tests/integration/s1-h-route-guard.test.ts`;
`npx playwright test tests/e2e/workspace-shell.spec.ts`.

Full gates (real exit codes recorded in STATUS): `git diff --check` 0; `npm ci` 0;
`npx prisma format`/`validate`/`generate`/`migrate deploy`/`migrate status` 0;
`npm run format:check`/`typecheck`/`lint`/`test` 0; `npm run test:integration` 0;
`npm run build` 0; `npm run test:e2e` 0 (existing 21 + new shell specs); `npm audit` recorded
(no force-fix).

Observable acceptance criteria:

- `git diff 3d04829 -- db/` empty (no schema/migration).
- `rg -n "lib/gdpr|lib/storage|workspace/invitations|auth/password-reset|tokens/store" app/`
  empty — the shell imports none of the deferred/exposure-gated services.
- `rg -n "assert.*ExternallyExposable" app/` empty.
- Every `/workspace*` route performs a server-side `authorize`/`authorizeCollection` call before
  rendering any workspace data (integration + E2E).
- A denied role receives a real HTTP 403 (E2E), not a 200 page.
- No product name invented; `App` placeholder only.
- `TRACKER 2.0.md` stays out of version control; Prime Tracker untouched.

Mutations to prove (each restored byte-exact): layout guard removed · `/admin` guard removed ·
`resolveWorkspaceAccess` swallowing all errors (false allow) · `listSessionWorkspaces` dropping
the ACTIVE-membership predicate · workspace predicate dropped (cross-tenant leak) ·
`requireSessionUser` not redirecting unauthenticated · forbidden() replaced by a 200 render ·
role-aware nav showing owner-only link to a coach (cosmetic only — must NOT be the sole guard;
the page guard mutation above is the load-bearing one).

## 8. Rollback

No migration and no external state: rollback = revert the S1-H commits on the feature branch.
The shell reads existing tables only; nothing is written. `git diff 3d04829 -- db/` empty is a
hard gate. Re-run the focused unit/integration/E2E files after any revert.

## 9. Boundaries and review requirements

- No route exposes invitation/reset/export/storage; `assert*ExternallyExposable` stay fail-closed
  and unimported by `app/**`.
- No sensitive data leaves the server unauthorized: the shell reads only the session user's own
  membership rows; the overview shows no client/health data; the 403 page discloses nothing.
- No new dependency; no vendor/RLS/Supabase; no product name; no i18n.
- Forbidden git ops per AGENTS: no `reset --hard`, `clean`, `checkout -- <path>`, `add -A`,
  force-push, deploy.
- Independent review: a different model than the builder
  (`opencode-go/deepseek-v4.1-flash`, separate session, fresh context), read-only — **plan review
  before any implementation**, then a second implementation review of the exact diff before a PR.
  The builder never approves its own work; findings are repaired and re-checked; fail-closed
  verdicts; capped rounds.
- **This task stops at the pushed plan.** Implementation starts only after plan review PASS.
