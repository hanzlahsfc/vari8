# Authorization model (Stage 1)

Default-deny, server-enforced role/resource/action matrix. UI visibility is **never**
authorization. This is a plan; nothing is implemented here.

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
| client assignments        | — / —         | ws / ws | — / —       | — / —     | — / —   | — / —     |
| client profiles           | — / —         | ws / ws | asg / asg   | asg / —   | — / —   | own / own |
| daily tracking            | — / —         | ws / —  | asg / asg   | asg / —   | — / —   | own / own |
| meal plans                | — / —         | ws / —  | asg / asg   | asg / —   | — / —   | own / —   |
| training plans & logs     | — / —         | ws / —  | asg / asg   | asg / —   | — / —   | own / own |
| check-ins & coach reviews | — / —         | ws / —  | asg / asg   | asg / —   | — / —   | own / own |
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

Legend / decisions:

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
- **Client assignments** are managed by the workspace OWNER. Rules: assignments never cross
  workspaces; a COACH cannot self-assign; every assignment change is audited. Creating an
  assignment **does not** bypass the cycle/bloodwork/PED policy gates above.
- **Assistant write scope is TODO(human).** Default: read assigned, write denied.
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
