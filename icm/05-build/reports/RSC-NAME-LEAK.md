# RSC-NAME-LEAK - training-program page leaks a foreign client's name

Issue: #71. Branch: `beta/rsc-name-leak-fix`. Worktree: `/home/nexuslink/vari8-worktrees/rsc-name-leak-fix`.
DB owned by this card: `app_rsc_leak` on 127.0.0.1:5433 (dropped at the end).

## The defect

`app/workspace/[workspaceId]/clients/[clientProfileId]/training-program/page.tsx`
ran `prisma.clientProfile.findFirst({ where: { id: clientProfileId, workspaceId } })`
at :47-50, before the authorizing boundary call `readStaffTrainingProgramsFromAction`
at :52, and rendered `client.name` at :64 unconditionally. For a user of workspace A
requesting workspace B's client page, the workspace layout's `requireWorkspaceAccess`
produces HTTP 403 while the page's own render still completes and the foreign client
name is serialized into the RSC payload.

Rule applied (card): authorization runs before any lookup that returns tenant data.

## Plan

1. Census every `app/workspace/**/page.tsx` (+ layout) for the pattern "data read by
   URL ids before the authorization call". Direct `prisma.*` reads plus boundary-call
   ordering were inspected file by file.
2. RED: a live probe against the running app (real HTTP, real session cookie, real
   flight payload in the response body) plus an integration test that renders the
   real page components in-process and asserts on the produced element tree. Both
   must fail on the unfixed code.
3. Fix each affected page so the authorizing call precedes the `clientProfile`
   lookup; the name is only fetched after access is confirmed, and denied/!ok
   responses render without it.
4. GREEN: same probes pass; sibling denied paths (existence oracles, streamed
   panels) verified; mechanism gates + full local check suite.

## Page census (every file under app/workspace/ inspected)

Affected - same class (tenant-data read by URL ids before the authorization call):

- `app/workspace/[workspaceId]/clients/[clientProfileId]/training-program/page.tsx`
  - `clientProfile.findFirst` at :47-50 before `readStaffTrainingProgramsFromAction`
  at :52; name rendered at :64 even when `result.ok` is false. Reported leak.
- `app/workspace/[workspaceId]/clients/[clientProfileId]/training-program/[programId]/page.tsx`
  - same lookup at :52-55 before `readStaffTrainingProgramFromAction` at :57; name in
  eyebrow link at :84 renders on the denied path.
- `app/workspace/[workspaceId]/clients/[clientProfileId]/meal-plan/page.tsx`
  - same lookup at :47-50 before `readStaffMealPlanFromAction` at :52; name at :64
  renders on the denied path.
- `app/workspace/[workspaceId]/clients/[clientProfileId]/checkins/page.tsx`
  - same lookup at :71-74 before the four boundary calls at :76-95; name at :107
  renders on the denied path (`denied` branch keeps the h1).
- `app/workspace/[workspaceId]/clients/[clientProfileId]/coaches/page.tsx`
  - `clientProfile.findFirst` at :53-56 before `listClientAssignments` (the
  `clientAssignments/read` authorization) at :62. Denial throws `forbidden()` before
  the name renders, but the pre-authz `if (client === null) notFound()` leaks client
  existence as a 404-vs-403 oracle. Fixed for the class.
- `app/workspace/[workspaceId]/clients/[clientProfileId]/dashboard/page.tsx`
  - member + scope authorization at :47-55, then `clientProfile.findFirst` at :57-60
  before the client-scoped boundary read `readStaffDashboardLayout` at :63. Denial
  throws `notFound()` before render (no payload leak observed) but the lookup still
  precedes the client-scoped authorization; reordered for the class.

Checked - not affected (authorization precedes tenant reads, or self-scoped only):

- `app/workspace/page.tsx` - `listSessionWorkspaces` is self-scoped to the session user.
- `app/workspace/[workspaceId]/layout.tsx` - `requireWorkspaceAccess` at :31 precedes
  `getAuthorizedWorkspaceSummary` at :36 (the post-authorization name read).
- `app/workspace/[workspaceId]/page.tsx` - `requireWorkspaceAccess`, no tenant data.
- `app/workspace/[workspaceId]/admin/page.tsx` - `requireWorkspaceAccess` (write), no
  tenant data.
- `app/workspace/[workspaceId]/clients/page.tsx` - `listAccessibleClientProfiles`
  authorizes at :57 (denial → `forbidden()` at :63) before the own-membership lookup
  at :79, which reads only the session user's own `workspaceMember` row (role/status).
- `app/workspace/[workspaceId]/clients/[clientProfileId]/daily/page.tsx` - explicit
  `authorize(dailyTracking/read)` at :59-72 precedes `listStaffDailyEntries`; the
  client name comes from inside the authorized read (`list.clientName`).
- `app/workspace/[workspaceId]/clients/[clientProfileId]/onboarding/page.tsx`  - 
  explicit `authorize(onboardingSubmissionReviews/read)` at :55-68 precedes
  `listClientSubmissionsForReview`; the client name comes from inside the authorized
  read (`list.value.clientName`).
- `app/workspace/[workspaceId]/checkins/forms/page.tsx`,
  `checkins/forms/new/page.tsx`, `checkins/forms/[formId]/page.tsx`,
  `checkins/forms/[formId]/preview/page.tsx` - gate → session → boundary
  (`listCheckInFormsForWorkspace` / `requireWorkspaceAccess` write /
  `getCheckInFormForWorkspace`); `!ok` → `forbidden()` before any render.
- `app/workspace/[workspaceId]/checkins/review-queue/page.tsx` - boundary-first
  (`listStaffCheckInReviewQueue`), `!ok` → `forbidden()`.
- `app/workspace/[workspaceId]/client-setups/page.tsx`  - 
  `requireClientSetupAccess` at :59 precedes all reads.
- `app/workspace/[workspaceId]/exercises/page.tsx`,
  `nutrition/page.tsx` - `requireWorkspaceAccess` at :45/:38 precedes catalog reads
  (non-tenant reference data).
- `app/workspace/[workspaceId]/onboarding/forms/page.tsx`,
  `onboarding/forms/new/page.tsx`, `onboarding/forms/[formId]/page.tsx`,
  `onboarding/forms/[formId]/preview/page.tsx` - boundary-first
  (`listFormsForWorkspace` / `requireWorkspaceAccess` write / `getFormForWorkspace`).
- `app/workspace/[workspaceId]/onboarding/assignments/page.tsx`  - 
  `requireOnboardingAssignmentsAccess` at :63 precedes all reads.
- `app/workspace/[workspaceId]/parameters/page.tsx` - boundary-first
  (`listParametersForWorkspace`).
- `app/workspace/[workspaceId]/templates/page.tsx`,
  `templates/[templateId]/page.tsx`, `templates/[templateId]/preview/page.tsx`  - 
  boundary-first (`listTemplatesForWorkspace` / `getTemplateForWorkspace` /
  `getTemplateVersionForWorkspace`).

Also swept: `app/workspace/**/actions.ts`, `*.tsx` panels - server actions each
re-authorize through the boundary inside their own transaction; they are POST
surfaces, not RSC reads. No `page.tsx` outside the six listed above reads tenant data
by URL ids before its authorization call.

## Patch strategy

For each affected page the `prisma.clientProfile.findFirst` name lookup was moved
to after the authorizing boundary call and gated on its success:

- `training-program/page.tsx`: lookup now follows
  `readStaffTrainingProgramsFromAction` and runs only when `result.ok`.
- `training-program/[programId]/page.tsx`: same, gated on the detail read's
  `result.ok`.
- `meal-plan/page.tsx`: same, gated on `readStaffMealPlanFromAction`.
- `checkins/page.tsx`: lookup runs after the four boundary calls, only when
  `denied` is false.
- `coaches/page.tsx`: `listClientAssignments`/`listAssignableCoachMembers`
  authorization now precedes the client lookup; denial throws `forbidden()`
  first, so a denied caller gets a uniform 403 for missing and foreign clients
  (existence oracle closed).
- `dashboard/page.tsx`: `readStaffDashboardLayout` + `!result.ok -> notFound()`
  now precede the client lookup; the workspace-member role check stays first
  because it reads only the caller's own membership row.

Authorized rendering is unchanged: the same lookup still runs for permitted
callers and the name renders exactly as before.

## Reproduction (before the fix, live)

Two workspaces seeded in `app_rsc_leak`: user A owns workspace A; workspace B
holds `Client B1 LEAK-MARKER-7431`. Next dev on :3109 with
`ENABLE_TRAINING_PLANS=1`; a real Auth.js session cookie for user A.

```
GET /workspace/<wsB>/clients/<clientB>/training-program   (as user A)
HTTP_STATUS=403
body contains: {"className":"app-title","children":["Training programs"," - Client B1 LEAK-MARKER-7431"]}
```

(In the captured payload the separator before `Client B1` was an em dash;
this document renders it as a hyphen to satisfy the no-em-dash docs rule.)

The 403 response carried the foreign client name in the RSC flight payload.

## Verification (after the fix)

Live probe, same dev server and seed:

```
GET /workspace/<wsB>/clients/<clientB>/training-program   (as user A)
HTTP_STATUS=403
LEAK-MARKER-7431 occurrences in full body: 0
payload title: ["Training programs",""]  (denied branch, no name)

GET same URL as workspace-B owner
HTTP_STATUS=200
name renders: "Training programs - Client B1 LEAK-MARKER-7431" (same em-dash note)
```

Integration regression `tests/integration/rsc-name-leak.test.ts` renders the
real page components in-process (real `auth()` session, real PG) and asserts:
denied render contains the denial copy, never the foreign name, and no
`select: { name: true }` clientProfile lookup ran; coaches returns a uniform
403 for foreign and nonexistent client ids; the authorized owner still sees
the name. On the unfixed code: 6 of 8 cases fail (name present / pre-authz
lookup observed / 404-vs-403 oracle). After the fix: 8 of 8 pass.

## Commands and results

| Command | Exit | Result |
| --- | --- | --- |
| `npm ci` | 0 | clean install |
| `npx prisma migrate deploy` (app_rsc_leak) | 0 | schema applied |
| live probe, unfixed (above) | - | 403 + foreign name in body (bug confirmed) |
| `npx vitest run --config vitest.integration.config.ts tests/integration/rsc-name-leak.test.ts`, unfixed | 1 | 6 failed / 2 passed (RED) |
| same, after fix | 0 | 8/8 passed (GREEN) |
| live probe, fixed (above) | - | 403, zero marker bytes; owner 200 with name |
| `npx tsc --noEmit` | 0 | clean (the one stale probe import was repaired, see below) |
| `npm run lint` | 0 | 0 errors, 3 pre-existing warnings in untouched files |
| `npm run test` | 0 | 1155/1155 unit tests |
| `npm run test:integration` (INTEGRATION_DATABASE_URL=app_rsc_leak) | 0 | 858/858, 54 files |
| `npm run build` | 0 | compiled + routes emitted |
| `cd frontend && npm ci` / `npm run build` | 0 | static build OK |
| `npm run index` / `npm run index:check` | 0 | regenerated, check OK |

Incidental repair required by the gates: `icm/05-build/evidence/PR-03b-verify-3/probes/variant-mount-timing.dom.test.tsx`
imported `./v3-deferred-thread`, but the file on disk is
`variant-deferred-thread.tsx` (broken on the base branch since commit 8a21ad0).
The import specifier was corrected; no behavior change.

## Independent review

Read-only verification by a separate model/context on the pushed diff
(`origin/Vari8-Beta..HEAD`): verdict FIXED. All six page orderings re-derived
from source, the coaches service path (`authorizeCollection` in
`lib/workspace/clients.ts:349-361,396-407`) confirmed to authorize before
returning, the `select: { name: true }` spy discriminator confirmed distinct
from the auth repo's `select: { id, workspaceId, userId }`, and a mental
mutation test confirms the new regression test fails if any page's gate is
reverted. The full `app/` denominator was enumerated: outside the six fixed
pages, the only direct prisma reads are caller-own `workspaceMember` rows
(auth inputs) and the client-side `(tracker)` self-scoped reads keyed by the
session `userId` (no URL-param client id) - none are in the leak class.

## Could not do / remaining uncertainty

- The `AGENTS.md` "nextjs-agent-rules" block in the diff was written by
  `next dev` (Next.js 16 agent-file injection), not by hand; committed so the
  tree stays clean per the block's own note.
- The client-facing (non-staff) surfaces under `app/` were out of scope for
  this census; the card scoped the sweep to `app/workspace/`.
- Denied responses still include the page's own denial copy inside the flight
  payload (by design); only tenant data is excluded.
