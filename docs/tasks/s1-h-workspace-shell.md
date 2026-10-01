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
2. Workspace list resolved from the session (the session gate already requires an ACTIVE user —
   `auth()` invalidates non-ACTIVE/deactivated sessions in `lib/auth/session.ts`; the list query
   additionally requires ACTIVE membership and ACTIVE workspace).
3. Workspace shell route with server-side guard wiring (`authorize`; `authorizeCollection` is not
   used by this slice because the only collection is the actor's own self-scoped list).
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
- No rate limiting (not needed for this slice: the only unauthenticated surfaces this slice
  adds or changes are the `/workspace*` → `/login` redirect and a `signOut` server action, not a
  new unauthenticated endpoint. The pre-existing public pages `/`, `/library/*`, `/sheets`,
  `/daily` are unchanged).

### 1a. Deferred prerequisites (recorded, not silently dropped)

`docs/security/consent-audit.md:154-167` and `docs/tasks/stage-1-plan.md:114` record that
**DENY-attempt auditing** and **login-outcome auditing** are deferred to the routing slice and
are required before exposure, pending a `TODO(human)` abuse-volume policy. This plan does not
implement them and does not silently drop them:

- S1-H adds the first user-reachable **authorization denial** (the 403 page), but exposes **no
  audited mutation**: the shell only reads the actor's own `workspaceMember` rows and renders;
  it never reaches the S1-C/S1-D/S1-E audited writes (consent, assignment, invitation). The
  "required before exposure" note therefore continues to gate the **mutation** exposure, which
  stays unreachable (`assert*ExternallyExposable` remain fail-closed and unimported by `app/**`).
- DENY-event and login-outcome audit rows are **not** written by S1-H; implementing them needs
  the abuse-volume policy decision (`TODO(human)`), which is not invented here. This deferral is
  recorded in §9 and in `docs/STATUS.md` at handoff, so it is not lost.
- The 403 page writes nothing and discloses nothing about the workspace.

## 2. Locked behavior this slice must honor

- Role/status are read from the database **per request** via the existing S1-B guard
  (`lib/auth/guard.ts`), never trusted from JWT claims; each request targets exactly one
  workspace validated against an ACTIVE membership.
- Denials are structural; the outward surface is a 403 page that reveals nothing about the
  workspace (no name, no existence confirmation).
- Cross-workspace, non-member, inactive-workspace, and role-denied cases (for an authenticated
  actor) all resolve to 403 (not 404, not a redirect loop).
- A **deactivated / non-`ACTIVE` user** is removed at the session gate (`auth()` returns null),
  so they are redirected to `/login` — they never reach `authorize` and never see a 403. 403 is
  reserved for authenticated-but-unauthorized requests.
- The public sign-in page and `/` remain reachable unauthenticated (unchanged); `/workspace*`
  requires a session.

## 3. Routes and contracts

Ordering is fixed on every `/workspace/[workspaceId]*` route: **session gate first**
(`requireSessionUser`), then **authorization** (`requireWorkspaceAccess`). An unauthenticated
request to any `/workspace*` path — including a deep link to `/workspace/<id>` — redirects to
`/login`; only an authenticated request can reach the authorization step, which yields HTTP 403
on denial. The `/workspace` **list** page runs only the session gate plus the self-scoped
`listSessionWorkspaces` read (no `requireWorkspaceAccess`), as documented in §5/§7.

| Route | Session gate (first) | Authorization (then, server) | Denied result |
| --- | --- | --- | --- |
| `/workspace` | `requireSessionUser` | self-scoped list of the session user's ACTIVE staff workspaces (see §5) | `redirect('/login')` when unauthenticated |
| `/workspace/[workspaceId]` (layout) | `requireSessionUser` | `workspaceSettings` **read** (`authorize`) | unauthenticated → `redirect('/login')`; authorized-session denial → `forbidden()` → HTTP 403 |
| `/workspace/[workspaceId]` (overview) | `requireSessionUser` (cache-shared) | `workspaceSettings` **read** (`authorize`) re-run by the page (layouts do not re-run on client navigation) | `forbidden()` → HTTP 403 |
| `/workspace/[workspaceId]/admin` | `requireSessionUser` (cache-shared) | `workspaceSettings` **write** (`authorize`) — owner-only | `forbidden()` → HTTP 403 |

Matrix check (`lib/auth/rbac.ts`): `workspaceSettings` read = `ws` for OWNER/COACH/ASSISTANT,
denied for SUPPORT/CLIENT; write = `workspace` for OWNER only, denied for COACH/ASSISTANT/
SUPPORT/CLIENT; PLATFORM_ADMIN read = `platform`, write = `denied`. Because the layout and
`/admin` use the single-record `authorize` (with a `workspaceId`), a **non-member**
PLATFORM_ADMIN is denied at the ACTIVE-membership step (`membership_missing_or_inactive`); a
PLATFORM_ADMIN who *is* a workspace member is evaluated by that membership role. So `/admin` is a
clean owner-only 403 demo inside a workspace the user already belongs to.

## 4. Files

New:

- `lib/auth/route-guard.ts` (server-only) —
  - `resolveWorkspaceAccess(session, request, client?)`: wraps `authorize` and returns
    `AuthorizationContext | null` (null on `AccessDeniedError`); never throws outward.
  - `requireWorkspaceAccess(session, request, client?)`: calls `resolveWorkspaceAccess`; on
    null calls `forbidden()` from `next/navigation`.
  - `requireSessionUser()`: `cache()`-wrapped; one `auth()` call per request → `{ userId,
    session }` (the raw `SessionLike` is returned too); redirects to `/login` when
    unauthenticated.
  - `listSessionWorkspaces(userId, client?)`: DB-scoped list of the user's ACTIVE **staff**
    workspaces — `workspaceMember` where `userId`, `status: ACTIVE`, `workspace.status: ACTIVE`,
    and the role resolves `workspaceSettings`/`read` to `workspace` (OWNER/COACH/ASSISTANT);
    minimal fields (`id`, `name`, `role`). CLIENT/SUPPORT-only memberships are intentionally not
    listed in this staff shell (their product surfaces are future slices), so the list never
    offers a workspace that would immediately 403 on entry.
  - `getAuthorizedWorkspaceSummary(ctx, client?)`: post-authorization scoped read of the
    workspace `name` by `ctx.workspaceId` (the `AuthorizationContext` carries no name); the only
    name-bearing source for the shell header, used only after `requireWorkspaceAccess` succeeds.
- `app/forbidden.tsx` — access-denied UI (rendered by `forbidden()`, HTTP 403).
- `app/workspace/page.tsx` — signed-in workspace list; calls `requireSessionUser()` then
  `listSessionWorkspaces(userId)`; empty state when none.
- `app/workspace/[workspaceId]/layout.tsx` — shell chrome; calls `requireSessionUser()` first
  (unauthenticated → `redirect('/login')`), then `requireWorkspaceAccess(..., workspaceSettings/read)`
  (denied → `forbidden()`), then `getAuthorizedWorkspaceSummary(ctx)` for the name; renders
  workspace name + `ctx.workspaceRole` + role-aware nav + `SignOutButton`.
- `app/workspace/[workspaceId]/page.tsx` — overview (no sensitive data); it re-runs
  `requireWorkspaceAccess(..., workspaceSettings/read)` itself (Next layouts are not re-executed
  on client-side navigation, so each page authorizes server-side on every request).
- `app/workspace/[workspaceId]/admin/page.tsx` — owner-only placeholder; guards
  `workspaceSettings/write`.
- `components/workspace-nav.tsx` — server component; nav links filtered by `resolveScope`
  (cosmetic; pages re-authorize).
- `components/sign-out-button.tsx` — client component rendering a `<form action={signOutAction}>`
  submit button; placed in the shell header.
- `app/logout/actions.ts` — `signOutAction` server action (`signOut({ redirectTo: '/login' })`),
  imported by `components/sign-out-button.tsx`.
- `tests/unit/route-guard.test.ts`, `tests/integration/s1-h-route-guard.test.ts`,
  `tests/e2e/workspace-shell.spec.ts`, `tests/e2e/global-setup.ts`,
  `tests/e2e/global-teardown.ts`.

Touched:

- `next.config.ts` — `experimental.authInterrupts: true` (enables `forbidden()`), documented.
- `playwright.config.ts` — `globalSetup: "tests/e2e/global-setup.ts"` and
  `globalTeardown: "tests/e2e/global-teardown.ts"`. Setup runs `prisma migrate deploy`
  (idempotent no-op when current) and **upserts** reserved synthetic fixtures under a namespaced
  scheme — emails ending `@s1h-e2e.test` and workspace slug `s1h-e2e-workspace`. No broad
  `deleteMany`; the teardown removes only rows carrying those reserved identifiers, so the 21
  existing E2E test cases (7 spec files) and any pre-existing rows are provably unaffected
  (assert by counting rows outside the reserved namespace before/after). Both setup and teardown
  resolve the database via `process.env.DATABASE_URL ?? "postgresql://app:app_dev_password@127.0.0.1:5433/app_dev?schema=public"`
  — the same fallback as `playwright.config.ts` — because Playwright does not load `.env` and
  `webServer.env` does not reach the runner process.
- `components/app-nav.tsx` — add a static `/workspace` link.
- `app/globals.css` — shell styles with desktop/tablet/mobile breakpoints.
- `docs/tasks/s1-h-workspace-shell.md` (this file), `docs/STATUS.md`.

**No `db/**` change** — gate: `git diff 3d04829 -- db/` empty.

## 5. Guard design (fail closed)

```ts
// lib/auth/route-guard.ts (server-only)
import { cache } from "react";

export async function resolveWorkspaceAccess(
  session: SessionLike,
  request: { resource: Resource; action: Action; workspaceId: string },
  client: PrismaLike = prisma,
): Promise<AuthorizationContext | null>;
export async function requireWorkspaceAccess(...): Promise<AuthorizationContext>; // forbidden() on null
// Memoized per request (React cache): layout + page share ONE auth()/session-gate read.
export const requireSessionUser = cache(
  async (): Promise<{ userId: string; session: SessionLike }> => {
    /* auth() once; redirect('/login') when unauthenticated */
  },
);
export async function listSessionWorkspaces(
  userId: string,
  client: PrismaLike = prisma,
): Promise<{ id: string; name: string; role: WorkspaceRole }[]>;
// Post-authorization scoped read of the workspace name (AuthorizationContext has none).
// Accepts only a workspace-scoped context; fails closed if ctx.workspaceId is absent.
export async function getAuthorizedWorkspaceSummary(
  ctx: AuthorizationContext & { workspaceId: string },
  client: PrismaLike = prisma,
): Promise<{ id: string; name: string }>;
```

Call sequence (exact; no guessing required). `requireSessionUser` is wrapped in React
`cache()`, so a `/workspace/[workspaceId]` deep link performs **exactly one** `auth()` call
per request even though both the layout and the page call it.

- List page (`app/workspace/page.tsx`):
  `const { userId } = await requireSessionUser();` → `await listSessionWorkspaces(userId)`.
- Shell layout (`app/workspace/[workspaceId]/layout.tsx`):
  `const { userId, session } = await requireSessionUser();` →
  `const ctx = await requireWorkspaceAccess(session, { resource: "workspaceSettings", action: "read", workspaceId });`
  → `const { name } = await getAuthorizedWorkspaceSummary(ctx);` →
  `const switcher = await listSessionWorkspaces(userId);` (the desktop sidebar's workspace
  switcher reuses the same staff-scoped list). Renders name + `ctx.workspaceRole` + switcher.
- Overview page (`app/workspace/[workspaceId]/page.tsx`): calls `requireSessionUser()`
  (cache-shared — same one `auth()` as the layout) and then `requireWorkspaceAccess(...)` again,
  so `authorize` re-runs per route and the page authorizes server-side on client-side
  navigations too.
- Admin page (`app/workspace/[workspaceId]/admin/page.tsx`):
  `const { session } = await requireSessionUser();` →
  `await requireWorkspaceAccess(session, { resource: "workspaceSettings", action: "write", workspaceId });`.

The session gate runs before `requireWorkspaceAccess`, so an unauthenticated deep link redirects
to `/login` and never reaches `authorize`.

- `resolveWorkspaceAccess` reuses `authorize(session, request, createPrismaAuthorizationRepo(client))`
  and maps `AccessDeniedError` → `null`. It does **not** catch unexpected DB errors (those
  propagate to the framework as 500, never as a false 403).
- `forbidden()` renders `app/forbidden.tsx` with status 403 (Next `authInterrupts`). This is
  **verified supported** by the installed `next@15.5.25` (`forbidden` is exported from
  `next/navigation`; the flag exists in the config schema; the renderer maps it to HTTP 403).
  No fallback is planned. (If a future Next version dropped it, the only acceptable fallback
  would be a documented deviation returning a real 403 — never a 200 page or a redirect — and
  the E2E status assertion would be updated to the real status.)
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

Unit (`tests/unit/route-guard.test.ts`, with `@/auth`'s `auth`, `next/navigation`'s
`redirect`/`forbidden`, and the guard repo all mocked):

- `resolveWorkspaceAccess` returns the context when the guard allows and `null` on every
  `AccessDeniedError` reason; unexpected errors are not swallowed.
- `requireWorkspaceAccess` calls `forbidden()` exactly when `resolveWorkspaceAccess` is null.
- `requireSessionUser` calls `redirect('/login')` when `auth()` is null/empty and otherwise
  returns `{ userId, session }` from a single `auth()` call.
- `listSessionWorkspaces` query is scoped to the session user + ACTIVE membership + ACTIVE
  workspace and selects minimal fields.

Integration (`tests/integration/s1-h-route-guard.test.ts`, real disposable PostgreSQL):

- owner/coach/assistant resolve `workspaceSettings/read`; SUPPORT/CLIENT/non-member deny;
  DEACTIVATED user denies; SUSPENDED/REMOVED membership denies; SUSPENDED workspace denies.
- `/admin` contract: owner resolves `workspaceSettings/write`; coach/assistant/SUPPORT/CLIENT/
  non-member/platform-admin deny.
- Cross-workspace: a member of workspace A gets `null` for workspace B.
- `listSessionWorkspaces` returns only the user's ACTIVE staff workspaces (excludes SUSPENDED
  workspace, SUSPENDED/REMOVED membership, other users, and CLIENT/SUPPORT-only memberships) and
  never leaks other members.

E2E (`tests/e2e/workspace-shell.spec.ts`, real browser; `tests/e2e/global-setup.ts` migrates +
upserts reserved synthetic fixtures under `@s1h-e2e.test` / slug `s1h-e2e-workspace`, with a
matching teardown that removes only those rows — idempotent and non-damaging to the existing
21 specs and pre-existing data):

- Unauthenticated `/workspace` and `/workspace/<id>` redirect to `/login`.
- Signed in as owner: `/workspace` lists the workspace; `/workspace/<id>` renders the shell
  (workspace name + role); `/workspace/<id>/admin` renders the owner area.
- Signed in as coach: `/workspace/<id>` renders; `/workspace/<id>/admin` returns **HTTP 403**
  and shows the access-denied page; the workspace name is not disclosed on the 403 page.
- Signed in as non-member: `/workspace/<id>` returns HTTP 403.
- Deactivated-session behavior is mechanized: the test signs in while the account is ACTIVE,
  then flips `User.status` to `DEACTIVATED` directly via Prisma (a deactivated account cannot
  sign in), and asserts `/workspace` and `/workspace/<id>` redirect to `/login` (not 403).
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
- Every `/workspace/[workspaceId]*` route performs a server-side `authorize` call before
  rendering any workspace data (integration + E2E). The `/workspace` list page is a
  **self-scoped read**: `listSessionWorkspaces(userId)` filters by the session user's `userId`
  plus ACTIVE membership and ACTIVE workspace, so it can never return another user's workspace
  and needs no `authorize` call (it exposes no cross-tenant record).
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
- DENY-attempt auditing and login-outcome auditing remain **deferred** (§1a) pending the
  `TODO(human)` abuse-volume policy; this slice exposes no audited mutation, and
  `consent-audit.md`'s "required before exposure" note continues to gate mutation exposure,
  which stays unreachable. The deferral is recorded in `docs/STATUS.md` at handoff.
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
