# Authorization model (Stage 1)

Default-deny, server-enforced role/resource/action matrix. UI visibility is **never**
authorization.

## Shipped surface (PR-05, `lib/auth/roles.ts`)

The code-level source of truth is `CAPABILITY_MATRIX` in `lib/auth/roles.ts`.
Public roles per the owner's D10/D15 decision: **owner**, **coach**, **client**.
Persisted `MemberRole` values map as `WORKSPACE_OWNER→owner`, `COACH→coach`,
`CLIENT→client`; `ASSISTANT_COACH` and `SUPPORT` map to **no role → deny**
until the owner assigns them D15 capabilities. Scopes: `workspace` (any client
in the workspace), `own` (own records only), `deny`.

| Capability           | owner     | coach     | client |
| -------------------- | --------- | --------- | ------ |
| roster.read          | workspace | workspace | deny   |
| plan.read            | workspace | workspace | own    |
| plan.write           | workspace | workspace | deny   |
| clientData.read      | workspace | workspace | own    |
| own.read / own.write | own       | own       | own    |
| notes.write          | workspace | workspace | deny   |
| tasks.manage         | workspace | workspace | deny   |
| library.manage       | workspace | workspace | deny   |
| message.write        | workspace | workspace | own    |
| appearance.write     | workspace | workspace | deny   |
| member.invite        | workspace | workspace | deny   |

Key owner rulings encoded here: a coach **can** edit a client's plan
(`plan.write: workspace`), a client **cannot** (`deny`) — enforced at the
`/api/v1` route helper, which resolves viewer → ACTIVE workspace membership →
role → non-deny scope before the single service call runs.

## Target model (below is the plan; only the shipped surface above is code)

## Scope vocabulary

| Scope       | Meaning (evaluated server-side)                                                       |
| ----------- | ------------------------------------------------------------------------------------- |
| `own`       | The actor's own `ClientProfile` (client reading/writing their own data)               |
| `assigned`  | A client the actor coaches via an **active `ClientAssignment`** in the same workspace |
| `workspace` | Any client/member inside the actor's `Workspace`, per role                            |
| `platform`  | Platform-administration operation (non-health; never client health or exports)        |
| `—`         | **Denied** (no access)                                                                |

Every cell is written `read / write`; `—/—` means both denied.

## Roles

- **Platform:** `PLATFORM_ADMIN` (on `User.platformRole`; not a workspace role).
- **Workspace:** `WORKSPACE_OWNER`, `COACH`, `ASSISTANT_COACH`, `SUPPORT`, `CLIENT`.

## Matrix (`R / W`)

| Resource                  | PlatformAdmin | Owner   | Coach       | Assistant | Support | Client    |
| ------------------------- | ------------- | ------- | ----------- | --------- | ------- | --------- |
| workspace settings        | plat / —      | ws / ws | ws / —      | ws / —    | — / —   | — / —     |
| members & invitations     | plat / —      | ws / ws | — / —       | — / —     | — / —   | — / —     |
| client invitations        | — / —         | — / ws  | — / ws      | — / —     | — / —   | — / —     |
| client assignments        | — / —         | ws / ws | — / —       | — / —     | — / —   | — / —     |
| client profiles           | — / —         | ws / ws | asg / asg   | asg / —   | — / —   | own / own |
| daily tracking            | — / —         | ws / —  | ws / asg †  | asg / —   | — / —   | own / own |
| meal plans                | — / —         | ws / —  | ws / asg †  | asg / —   | — / —   | own / —   |
| training plans & logs     | — / —         | ws / —  | asg / asg   | asg / —   | — / —   | own / own |
| check-in instances        | — / —         | ws / ws | ws / asg †  | asg / —   | — / —   | own / —   |
| check-ins & coach reviews | — / —         | ws / —  | ws / asg †  | asg / —   | — / —   | own / own |
| cycle data                | — / —         | — / — ⚠ | asg / asg ⚠ | — / —     | — / —   | own / own |
| bloodwork                 | — / —         | — / — ⚠ | asg / asg ⚠ | — / —     | — / —   | own / own |
| PED/HRT data              | — / —         | — / —   | — / — ⚠     | — / —     | — / —   | — / —     |
| coach notes               | — / —         | ws / —  | asg / asg   | asg / —   | — / —   | — / — ⚠   |
| client notes              | — / —         | ws / —  | asg / asg   | asg / —   | — / —   | own / own |
| consent                   | — / —         | — / —   | — / —       | — / —     | — / —   | own / own |
| food/exercise master data | plat / plat   | ws / —  | ws / —      | ws / —    | — / —   | ws / —    |
| exports & erasure         | — / —         | ws / ws | asg / —     | — / —     | — / —   | own / own |
| audit-log access          | plat / —      | ws / —  | — / —       | — / —     | — / —   | — / —     |
| private media/files       | — / —         | ws / —  | asg / asg   | asg / —   | — / —   | own / own |
| onboarding assignments    | — / —         | ws / ws | asg / asg   | asg / —   | — / —   | — / —     |

Legend / decisions:

- † **Coach reads are workspace-wide on the plan + client-data resources**
  (D10 answer 3 / D22, owner ruling 2026-10-27): staff hold the same data
  capabilities over every client of their workspace, so `dailyTracking`,
  `mealPlans`, `checkinInstances` and `checkinsCoachReviews` reads are `ws`
  for COACH without an ACTIVE `ClientAssignment`. Writes stay `asg` per
  decision #111; assistant stays `asg / —`.
- **Support is denied by default** to all client data. Any support access requires an explicit,
  separately-authorized grant (`TODO(human)`).
- ⚠ **Owner and assistant access to cycle/bloodwork is TODO(human).** Default is denied; only an
  assigned COACH may access, and access stays gated by policy/consent until signed off. This
  removes the earlier assistant/owner inconsistency.
- ⚠ **PED/HRT is a hard-gated, coach-only capability.** Until legal/policy sign-off
  (`TODO(human)`) every PED/HRT scope is denied, including coach. The `asg/asg` shown is the
  target once approved; never client-visible.
- ⚠ **Coach notes → client is denied** pending an approved shared-visibility model
  (`TODO(human)`); internal notes must never be client-visible.
- **Consent** is a client-only resource (`own/own`); see `consent-audit.md`.
- **Onboarding assignments** (P-013, product-decisions #31): staff-only
  assignment records — client + immutable published form version + lifecycle,
  never answers. `assigned` scope resolves through the actor's current ACTIVE
  `ClientAssignment` at query time on every call; a coach's write here never
  mutates `ClientAssignment`. The surface is additionally dev-gated
  (`ENABLE_ONBOARDING_ASSIGNMENTS=1`) and returns 404 when disabled. The P-008
  `onboardingFormTemplates` resource (ws/ws owner, ws/ws coach, all others
  denied) governs form-definition management and is unchanged.
- **Coaching library** (P-014, product-decisions #41–#42): two closed
  resources — `parameterDefinitions` and `coachingTemplates` — both
  workspace-shared at ws/ws for WORKSPACE_OWNER and COACH; ASSISTANT_COACH,
  SUPPORT, CLIENT, and PLATFORM_ADMIN are denied outright (platform admin
  denied even with an active membership — the denied-resource set covers
  both). The surface is dev-gated (`ENABLE_COACHING_TEMPLATES=1`): routes
  404 and every server action/boundary refuses before auth or input binding
  when the flag is off. Template definitions only — no client data,
  assignments, or answers exist on these resources.
- **Invitations** (S1-F2C): `members & invitations` covers staff invitation
  creation (COACH/ASSISTANT_COACH), owner-only listing, and owner-only
  revocation — deliberately owner-exclusive. `client invitations` is a distinct
  resource so a COACH's CLIENT-invite write can never widen staff invitation
  permission. Owner may invite COACH/ASSISTANT_COACH/CLIENT; COACH may invite
  CLIENT only; WORKSPACE_OWNER/SUPPORT/platform-admin invitations do not
  exist. Every invite write requires an ACTIVE workspace + ACTIVE membership
  (re-read at mutation time).
- **Client assignments** are managed by the workspace OWNER. Rules: assignments never cross
  workspaces; a COACH cannot self-assign; every assignment change is audited. Creating an
  assignment **does not** bypass the cycle/bloodwork/PED policy gates above.
- **Assistant write scope is TODO(human).** Default: read assigned, write denied.
- **Check-In resources** (P-025-A/P-025-B, decisions #92–#97): three
  closed resources — `checkinFormDefinitions` (staff-managed forms only),
  `checkinInstances` (one-off schedule/cancel: owner ws/ws, coach ws/asg
  after the D10/D22 read widening, assistant asg/— read-only, client own/—), and
  `checkinsCoachReviews`
  (client submission/history own/own; staff review write deferred to
  P-025-C). SUPPORT and CLIENT writes are denied; **all three resources
  are in the platform-admin denied set** — a PLATFORM_ADMIN is denied even
  with an ACTIVE workspace membership of any role, enforced in
  `authorize`/`authorizeCollection`, never by UI hiding. The surface is
  dev-gated (`ENABLE_CHECK_INS="1"` AND trusted dev/test runtime;
  production fails closed).
- Master data is a **platform-owned** shared catalog (read-only to workspaces); only platform
  (and workspace owners for workspace-local extensions, if approved) administer it.
- **Platform admin cannot read client health data or client exports** (`—/—`); audit read is
  metadata-only.

## Enforcement (not UI)

- One default-deny guard used by every server boundary: `authorize(actor, action, resource,
{ workspaceId, clientProfileId })`.
- **Role and status are read from the database on every request** (not trusted from stale JWT
  claims). Membership must be `ACTIVE`; non-`ACTIVE` users/members are denied immediately.
- The request targets **exactly one workspace**; the supplied `workspaceId` is validated against
  an ACTIVE membership of the actor before any scope check. Multi-workspace membership is
  allowed, but each request is scoped to one workspace.
- Denials return a typed 403 with a structural reason; no data returned.
- **List/collection queries must scope in the query `where`** to the actor's workspace and
  assignment; single-record reads go through the guard.
- Platform-admin health access and client exports are denied; any future exception is a
  separate, explicitly authorized, audited capability.

## Required denial cases (planned tests)

1. A member of workspace A cannot read workspace B data (any resource).
2. An unassigned coach is denied health data.
3. A client cannot read another client (same or different workspace).
4. A client is denied all PED/HRT access.
5. `SUPPORT` is denied client data unless an explicit grant exists.
6. A removed/deactivated member or non-ACTIVE user is denied immediately.
7. A `ClientAssignment` in a different workspace never grants access.
8. Direct server calls (guessed URL / RSC action / API) are denied even when UI hides them.
9. Exports/erasure/audit reads respect the matrix.
10. `PLATFORM_ADMIN` cannot read client health data or exports by default.
11. A COACH cannot self-assign; an OWNER assignment cannot bypass cycle/bloodwork/PED gates.

## Prime State relationship

Reuses the **guard shape** and **RBAC-as-data** structure. Prime State's single-coach `assigned`
predicate (`client.coach_user_id === user.id`) is replaced by a **workspace-scoped assignment
lookup**; its single-coach assumption is explicitly not carried over.
