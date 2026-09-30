# Data ownership (Stage 1)

Defines who owns every client and health record for the new multi-tenant product. Owns = the
FK that a row's access is always scoped through. This is a plan; no migration exists yet.

## Ownership chain

```
User ──(platform identity; 0..n)── WorkspaceMember ── 1 ── Workspace (tenant boundary)
                                            │
                          ┌─────────────────┼──────────────────┐
                    CoachProfile        ClientProfile        (roles)
                                            │
                          ┌─────────────────┼───────────────────┐
                    ClientAssignment   Health records      Consent records
                    (coach ├─ client)  (daily, cycle,      (per client)
                                        nutrition, training,
                                        check-ups, notes,
                                        media, PED/HRT)
```

## Entities

| Entity                | Owner (FK)                                           | Notes                                                                                                                                                                                                                  |
| --------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `User`                | platform                                             | Identity only; carries **platform** account status/role, not workspace roles                                                                                                                                           |
| `Workspace`           | platform                                             | Tenant boundary; every client-scoped row resolves to exactly one workspace                                                                                                                                             |
| `WorkspaceMember`     | `Workspace`                                          | Links a `User` to a `Workspace` with a workspace role and status; `@@unique(workspaceId,userId)`; `state_version` is a DB-owned generation bumped by trigger on every status/role change (S1-F2C invitation freshness) |
| `CoachProfile`        | `WorkspaceMember`                                    | Coach-specific profile; one per coach membership                                                                                                                                                                       |
| `ClientProfile`       | `Workspace` (`workspaceId` NOT NULL)                 | The client; may link an optional `User` (client login)                                                                                                                                                                 |
| `ClientAssignment`    | `ClientProfile` + `WorkspaceMember` (coach)          | Many-to-many; supports **multiple assigned coaches**; `role` PRIMARY/COACH; status ACTIVE/REMOVED; carries `workspaceId` so coach and client must share one workspace                                                  |
| `AccessToken`         | `Workspace` (invites) / `User` (reset, verification) | Purpose-scoped, hashed, expiring, single-use tokens                                                                                                                                                                    |
| Client health records | `ClientProfile` (`clientProfileId` NOT NULL)         | One owner; never owned by a coach or a workspace directly                                                                                                                                                              |
| Consent records       | `ClientProfile`                                      | Append-only grants/revocations                                                                                                                                                                                         |
| Media/files           | `ClientProfile`                                      | Object keys prefixed by workspace + client                                                                                                                                                                             |
| Audit records         | `Workspace` (+ optional `ClientProfile`)             | Metadata-only; retained independently of client erasure                                                                                                                                                                |

## Ownership rules (normative)

1. **Every client belongs to exactly one workspace.** `ClientProfile.workspaceId` is required;
   a client cannot be shared across workspaces.
2. **Every health record belongs to exactly one client.** Each health table carries a required
   `clientProfileId`. No health row is owned by a coach, a `WorkspaceMember`, or a `User`.
3. **Coaches do not own client data.** A coach's access is derived from an active
   `ClientAssignment` inside the same workspace; deleting the assignment removes access without
   touching the data.
4. **Multiple coaches are supported.** A client may have one PRIMARY coach plus additional
   COACH assignments; nothing in the schema assumes a single coaching relationship.
5. **A `ClientProfile` may reuse a `User`** (the client's login) or exist without one; both
   forms are workspace-owned.
6. **Health data never crosses a workspace boundary.** Any query for client-scoped rows must be
   constrained by the workspace the actor belongs to.
7. **Platform administration is not ownership.** A platform admin does not own workspace or
   health data and (by default) has no health-data or client-export scope — see the
   authorization model.
8. **Assignments cannot cross workspaces.** A `ClientAssignment` carries `workspaceId`, which
   must equal both the client's and the coach member's workspace; writes validate this.

## Sensitive record inventory → owner

| Record family                 | Examples (from the workbook, later stages)              | Owner                                                                                            |
| ----------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Daily tracking                | daily entries, weight, sleep, steps, cardio, biometrics | `ClientProfile`                                                                                  |
| Cycle / menses                | cycle day, bleeding, symptoms, energy                   | `ClientProfile`                                                                                  |
| Nutrition                     | meal plans, targets, target-log snapshots               | `ClientProfile` (plan belongs to the client; catalog is platform-scoped, see below)              |
| Training                      | programs, sessions, logbook entries                     | `ClientProfile`                                                                                  |
| Check-ins                     | submissions, coach reviews, photos/links                | `ClientProfile`                                                                                  |
| Notes                         | coach notes, client notes                               | `ClientProfile` (note body; author recorded)                                                     |
| Bloodwork                     | reports and reviews                                     | `ClientProfile`                                                                                  |
| PED/HRT                       | protocol + change log                                   | `ClientProfile` (access policy TODO(human))                                                      |
| Media/files                   | progress photos, voice notes, reports                   | `ClientProfile` (private storage)                                                                |
| **Food/exercise master data** | shared catalogs                                         | **Platform** (single global catalog; read-only to workspaces) — reference data, not client-owned |
| Consent                       | grants/revocations                                      | `ClientProfile`                                                                                  |
| Audit                         | metadata-only events                                    | `Workspace`                                                                                      |

## Acceptance check

Every row in the "sensitive record inventory" has exactly one owner; no row is owned by a coach,
member, or user; ownership always resolves to a single `ClientProfile` (health) or a single
`Workspace` (audit/tenant). See `docs/security/authorization-model.md`.
