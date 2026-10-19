# ROUTES.md - Next route index

Generated file. Do not edit by hand: changes are overwritten by `npm run index`.
Verify the committed copy is current with `npm run index:check` (exit 1 = drift).

Source: page/layout/route files under `app/` (backend) and `frontend/src/app/` (canvas).
Counts: 46 backend pages, 1 API routes, 8 layouts, 3 canvas pages.

Columns: `server`/`client` comes from the `use client` directive; `Auth (detected)` lists the
guard helpers called by the route file or one of its ancestor layouts. Detection is textual:
treat a missing guard as unverified, and read `lib/auth/route-guard.ts` for real enforcement.

Route groups (do not add a path segment): `(tracker)`.

## Backend pages (`app/`)

| Path | File | Rendered | Auth (detected) |
|---|---|---|---|
| `/` | `app/page.tsx` | server | none detected |
| `/daily` | `app/daily/page.tsx` | server | none detected |
| `/invite` | `app/invite/page.tsx` | server | none detected |
| `/library/exercises` | `app/library/exercises/page.tsx` | server | none detected |
| `/library/foods` | `app/library/foods/page.tsx` | server | none detected |
| `/login` | `app/login/page.tsx` | server | none detected |
| `/reset` | `app/reset/page.tsx` | server | none detected |
| `/reset-request` | `app/reset-request/page.tsx` | server | none detected |
| `/workspace` | `app/workspace/page.tsx` | server | requireSessionUser |
| `/workspace/[workspaceId]` | `app/workspace/[workspaceId]/page.tsx` | server | requireSessionUser + requireWorkspaceAccess (some via layout) |
| `/workspace/[workspaceId]/admin` | `app/workspace/[workspaceId]/admin/page.tsx` | server | requireSessionUser + requireWorkspaceAccess (some via layout) |
| `/workspace/[workspaceId]/check-ins` | `app/(tracker)/workspace/[workspaceId]/check-ins/page.tsx` | server | requireSessionUser (some via layout) |
| `/workspace/[workspaceId]/check-ins/[instanceId]` | `app/(tracker)/workspace/[workspaceId]/check-ins/[instanceId]/page.tsx` | server | requireSessionUser (some via layout) |
| `/workspace/[workspaceId]/checkins/forms` | `app/workspace/[workspaceId]/checkins/forms/page.tsx` | server | requireSessionUser + requireWorkspaceAccess (some via layout) |
| `/workspace/[workspaceId]/checkins/forms/[formId]` | `app/workspace/[workspaceId]/checkins/forms/[formId]/page.tsx` | server | requireSessionUser + requireWorkspaceAccess (some via layout) |
| `/workspace/[workspaceId]/checkins/forms/[formId]/preview` | `app/workspace/[workspaceId]/checkins/forms/[formId]/preview/page.tsx` | server | requireSessionUser + requireWorkspaceAccess (some via layout) |
| `/workspace/[workspaceId]/checkins/forms/new` | `app/workspace/[workspaceId]/checkins/forms/new/page.tsx` | server | requireSessionUser + requireWorkspaceAccess (some via layout) |
| `/workspace/[workspaceId]/checkins/review-queue` | `app/workspace/[workspaceId]/checkins/review-queue/page.tsx` | server | requireSessionUser + requireWorkspaceAccess (some via layout) |
| `/workspace/[workspaceId]/client-setups` | `app/workspace/[workspaceId]/client-setups/page.tsx` | server | requireClientSetupAccess + requireSessionUser + requireWorkspaceAccess (some via layout) |
| `/workspace/[workspaceId]/clients` | `app/workspace/[workspaceId]/clients/page.tsx` | server | requireSessionUser + requireWorkspaceAccess (some via layout) |
| `/workspace/[workspaceId]/clients/[clientProfileId]/checkins` | `app/workspace/[workspaceId]/clients/[clientProfileId]/checkins/page.tsx` | server | requireSessionUser + requireWorkspaceAccess (some via layout) |
| `/workspace/[workspaceId]/clients/[clientProfileId]/coaches` | `app/workspace/[workspaceId]/clients/[clientProfileId]/coaches/page.tsx` | server | requireSessionUser + requireWorkspaceAccess (some via layout) |
| `/workspace/[workspaceId]/clients/[clientProfileId]/daily` | `app/workspace/[workspaceId]/clients/[clientProfileId]/daily/page.tsx` | server | requireSessionUser + requireWorkspaceAccess (some via layout) |
| `/workspace/[workspaceId]/clients/[clientProfileId]/dashboard` | `app/workspace/[workspaceId]/clients/[clientProfileId]/dashboard/page.tsx` | server | requireSessionUser + requireWorkspaceAccess (some via layout) |
| `/workspace/[workspaceId]/clients/[clientProfileId]/meal-plan` | `app/workspace/[workspaceId]/clients/[clientProfileId]/meal-plan/page.tsx` | server | requireSessionUser + requireWorkspaceAccess (some via layout) |
| `/workspace/[workspaceId]/clients/[clientProfileId]/onboarding` | `app/workspace/[workspaceId]/clients/[clientProfileId]/onboarding/page.tsx` | server | requireSessionUser + requireWorkspaceAccess (some via layout) |
| `/workspace/[workspaceId]/clients/[clientProfileId]/training-program` | `app/workspace/[workspaceId]/clients/[clientProfileId]/training-program/page.tsx` | server | requireSessionUser + requireWorkspaceAccess (some via layout) |
| `/workspace/[workspaceId]/clients/[clientProfileId]/training-program/[programId]` | `app/workspace/[workspaceId]/clients/[clientProfileId]/training-program/[programId]/page.tsx` | server | requireSessionUser + requireWorkspaceAccess (some via layout) |
| `/workspace/[workspaceId]/daily` | `app/(tracker)/workspace/[workspaceId]/daily/page.tsx` | server | requireDailyTrackerAccess + requireSessionUser (some via layout) |
| `/workspace/[workspaceId]/dashboard` | `app/(tracker)/workspace/[workspaceId]/dashboard/page.tsx` | server | requireSessionUser |
| `/workspace/[workspaceId]/exercises` | `app/workspace/[workspaceId]/exercises/page.tsx` | server | requireSessionUser + requireWorkspaceAccess (some via layout) |
| `/workspace/[workspaceId]/home` | `app/(tracker)/workspace/[workspaceId]/home/page.tsx` | server | requireSessionUser (some via layout) |
| `/workspace/[workspaceId]/meal-plan` | `app/(tracker)/workspace/[workspaceId]/meal-plan/page.tsx` | server | requireSessionUser (some via layout) |
| `/workspace/[workspaceId]/nutrition` | `app/workspace/[workspaceId]/nutrition/page.tsx` | server | requireSessionUser + requireWorkspaceAccess (some via layout) |
| `/workspace/[workspaceId]/onboarding` | `app/(tracker)/workspace/[workspaceId]/onboarding/page.tsx` | server | requireOnboardingSubmissionsAccess + requireSessionUser (some via layout) |
| `/workspace/[workspaceId]/onboarding/[assignmentId]` | `app/(tracker)/workspace/[workspaceId]/onboarding/[assignmentId]/page.tsx` | server | requireOnboardingSubmissionsAccess + requireSessionUser (some via layout) |
| `/workspace/[workspaceId]/onboarding/assignments` | `app/workspace/[workspaceId]/onboarding/assignments/page.tsx` | server | requireOnboardingAssignmentsAccess + requireSessionUser + requireWorkspaceAccess (some via layout) |
| `/workspace/[workspaceId]/onboarding/forms` | `app/workspace/[workspaceId]/onboarding/forms/page.tsx` | server | requireSessionUser + requireWorkspaceAccess (some via layout) |
| `/workspace/[workspaceId]/onboarding/forms/[formId]` | `app/workspace/[workspaceId]/onboarding/forms/[formId]/page.tsx` | server | requireSessionUser + requireWorkspaceAccess (some via layout) |
| `/workspace/[workspaceId]/onboarding/forms/[formId]/preview` | `app/workspace/[workspaceId]/onboarding/forms/[formId]/preview/page.tsx` | server | requireSessionUser + requireWorkspaceAccess (some via layout) |
| `/workspace/[workspaceId]/onboarding/forms/new` | `app/workspace/[workspaceId]/onboarding/forms/new/page.tsx` | server | requireSessionUser + requireWorkspaceAccess (some via layout) |
| `/workspace/[workspaceId]/parameters` | `app/workspace/[workspaceId]/parameters/page.tsx` | server | requireSessionUser + requireWorkspaceAccess (some via layout) |
| `/workspace/[workspaceId]/templates` | `app/workspace/[workspaceId]/templates/page.tsx` | server | requireSessionUser + requireWorkspaceAccess (some via layout) |
| `/workspace/[workspaceId]/templates/[templateId]` | `app/workspace/[workspaceId]/templates/[templateId]/page.tsx` | server | requireSessionUser + requireWorkspaceAccess (some via layout) |
| `/workspace/[workspaceId]/templates/[templateId]/preview` | `app/workspace/[workspaceId]/templates/[templateId]/preview/page.tsx` | server | requireSessionUser + requireWorkspaceAccess (some via layout) |
| `/workspace/[workspaceId]/training-program` | `app/(tracker)/workspace/[workspaceId]/training-program/page.tsx` | server | requireSessionUser (some via layout) |

## Backend API routes (`app/api/`)

| Path | File | Methods | Auth (detected) |
|---|---|---|---|
| `/api/auth/[...nextauth]` | `app/api/auth/[...nextauth]/route.ts` | GET, POST | none detected |

## Backend layouts (`app/`)

Layouts enforce the guards below for every route beneath them.

| Path | File | Rendered | Auth (detected) |
|---|---|---|---|
| `/` | `app/layout.tsx` | server | none detected |
| `/workspace/[workspaceId]` | `app/workspace/[workspaceId]/layout.tsx` | server | requireSessionUser + requireWorkspaceAccess |
| `/workspace/[workspaceId]/check-ins` | `app/(tracker)/workspace/[workspaceId]/check-ins/layout.tsx` | server | requireSessionUser |
| `/workspace/[workspaceId]/daily` | `app/(tracker)/workspace/[workspaceId]/daily/layout.tsx` | server | requireSessionUser |
| `/workspace/[workspaceId]/home` | `app/(tracker)/workspace/[workspaceId]/home/layout.tsx` | server | requireSessionUser |
| `/workspace/[workspaceId]/meal-plan` | `app/(tracker)/workspace/[workspaceId]/meal-plan/layout.tsx` | server | requireSessionUser |
| `/workspace/[workspaceId]/onboarding` | `app/(tracker)/workspace/[workspaceId]/onboarding/layout.tsx` | server | requireSessionUser |
| `/workspace/[workspaceId]/training-program` | `app/(tracker)/workspace/[workspaceId]/training-program/layout.tsx` | server | requireSessionUser |

## Canvas pages (`frontend/src/app/`)

Lilly's canvas app. It is authoritative for screens and appearance; the backend is built to serve it.

| Path | File | Rendered | Auth (detected) |
|---|---|---|---|
| `/` | `frontend/src/app/layout.tsx` | server | none detected |
| `/` | `frontend/src/app/page.tsx` | server | none detected |
| `/coach` | `frontend/src/app/coach/page.tsx` | server | none detected |
| `/ethereal` | `frontend/src/app/ethereal/page.tsx` | server | none detected |
