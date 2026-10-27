# ROUTES.md - Next route index

Generated file. Do not edit by hand: changes are overwritten by `npm run index`.
Verify the committed copy is current with `npm run index:check` (exit 1 = drift).

Source: page/layout/route files under `app/` (backend) and `frontend/src/app/` (canvas).
Counts: 58 backend pages, 55 API routes, 14 layouts, 5 canvas pages.

Columns: `server`/`client` comes from the `use client` directive; `Auth (detected)` lists the
guard helpers called by the route file or one of its ancestor layouts. Detection is textual:
treat a missing guard as unverified, and read `lib/auth/route-guard.ts` for real enforcement.

Route groups (do not add a path segment): `(auth)`, `(canvas)`, `(tracker)`.

## Backend pages (`app/`)

| Path | File | Rendered | Auth (detected) |
|---|---|---|---|
| `/` | `app/(canvas)/page.tsx` | server | requireSessionUser |
| `/client` | `app/(canvas)/client/page.tsx` | server | auth |
| `/coach` | `app/(canvas)/coach/page.tsx` | server | requireCanvasAccess |
| `/daily` | `app/daily/page.tsx` | server | none detected |
| `/ethereal` | `app/(canvas)/ethereal/page.tsx` | server | requireCanvasAccess |
| `/invite` | `app/invite/page.tsx` | server | auth |
| `/library/exercises` | `app/library/exercises/page.tsx` | server | none detected |
| `/library/foods` | `app/library/foods/page.tsx` | server | none detected |
| `/login` | `app/login/page.tsx` | server | none detected |
| `/me` | `app/(canvas)/me/page.tsx` | server | requireClientAccess |
| `/me/login` | `app/(canvas)/me/(auth)/login/page.tsx` | server | none detected |
| `/me/reset` | `app/(canvas)/me/(auth)/reset/page.tsx` | server | none detected |
| `/me/reset-request` | `app/(canvas)/me/(auth)/reset-request/page.tsx` | server | none detected |
| `/reset` | `app/reset/page.tsx` | server | none detected |
| `/reset-request` | `app/reset-request/page.tsx` | server | none detected |
| `/sheets` | `app/sheets/page.tsx` | server | requireSheetViewer |
| `/sheets/[slug]` | `app/sheets/[slug]/page.tsx` | server | requireSheetViewer |
| `/signup` | `app/signup/page.tsx` | server | none detected |
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
| `/workspace/[workspaceId]/clients/[clientProfileId]/macro-targets` | `app/workspace/[workspaceId]/clients/[clientProfileId]/macro-targets/page.tsx` | server | requireSessionUser + requireWorkspaceAccess (some via layout) |
| `/workspace/[workspaceId]/clients/[clientProfileId]/meal-plan` | `app/workspace/[workspaceId]/clients/[clientProfileId]/meal-plan/page.tsx` | server | requireSessionUser + requireWorkspaceAccess (some via layout) |
| `/workspace/[workspaceId]/clients/[clientProfileId]/onboarding` | `app/workspace/[workspaceId]/clients/[clientProfileId]/onboarding/page.tsx` | server | requireSessionUser + requireWorkspaceAccess (some via layout) |
| `/workspace/[workspaceId]/clients/[clientProfileId]/photos` | `app/workspace/[workspaceId]/clients/[clientProfileId]/photos/page.tsx` | server | requireSessionUser + requireWorkspaceAccess (some via layout) |
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
| `/api/auth/[...all]` | `app/api/auth/[...all]/route.ts` | GET, POST | none detected |
| `/api/v1/auth/refresh` | `app/api/v1/auth/refresh/route.ts` | POST | none detected |
| `/api/v1/media/[workspaceId]` | `app/api/v1/media/[workspaceId]/route.ts` | - | none detected |
| `/api/v1/media/[workspaceId]/[mediaObjectId]` | `app/api/v1/media/[workspaceId]/[mediaObjectId]/route.ts` | - | none detected |
| `/api/v1/media/object` | `app/api/v1/media/object/route.ts` | GET, PUT | none detected |
| `/api/v1/workspaces/[workspaceId]/checkins/instances` | `app/api/v1/workspaces/[workspaceId]/checkins/instances/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/checkins/instances/[instanceId]` | `app/api/v1/workspaces/[workspaceId]/checkins/instances/[instanceId]/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/checkins/instances/[instanceId]/cancel` | `app/api/v1/workspaces/[workspaceId]/checkins/instances/[instanceId]/cancel/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/checkins/instances/[instanceId]/submit` | `app/api/v1/workspaces/[workspaceId]/checkins/instances/[instanceId]/submit/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/checkins/instances/next` | `app/api/v1/workspaces/[workspaceId]/checkins/instances/next/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/checkins/schedule-rules` | `app/api/v1/workspaces/[workspaceId]/checkins/schedule-rules/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/checkins/schedule-rules/[ruleId]/generate` | `app/api/v1/workspaces/[workspaceId]/checkins/schedule-rules/[ruleId]/generate/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/checkins/schedule-rules/[ruleId]/status` | `app/api/v1/workspaces/[workspaceId]/checkins/schedule-rules/[ruleId]/status/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/checkins/schedule-versions` | `app/api/v1/workspaces/[workspaceId]/checkins/schedule-versions/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/checkins/submissions` | `app/api/v1/workspaces/[workspaceId]/checkins/submissions/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/checkins/submissions/[submissionId]` | `app/api/v1/workspaces/[workspaceId]/checkins/submissions/[submissionId]/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/checkins/submissions/[submissionId]/feedback` | `app/api/v1/workspaces/[workspaceId]/checkins/submissions/[submissionId]/feedback/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/checkins/submissions/[submissionId]/review` | `app/api/v1/workspaces/[workspaceId]/checkins/submissions/[submissionId]/review/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/checkins/submissions/[submissionId]/tracker-context` | `app/api/v1/workspaces/[workspaceId]/checkins/submissions/[submissionId]/tracker-context/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/clients` | `app/api/v1/workspaces/[workspaceId]/clients/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/activity-targets` | `app/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/activity-targets/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/daily-entries/history` | `app/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/daily-entries/history/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/iifym-plans` | `app/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/iifym-plans/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/iifym-plans/publish` | `app/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/iifym-plans/publish/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/iifym-plans/timezone` | `app/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/iifym-plans/timezone/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/meal-plans` | `app/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/meal-plans/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/meal-plans/publish` | `app/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/meal-plans/publish/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/meal-plans/versions/[versionId]` | `app/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/meal-plans/versions/[versionId]/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/nutrition-logs` | `app/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/nutrition-logs/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/progress-photos` | `app/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/progress-photos/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/progress-photos/[entryId]` | `app/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/progress-photos/[entryId]/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/progress-photos/compare` | `app/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/progress-photos/compare/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/supplement-plan` | `app/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/supplement-plan/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/tasks/[taskId]` | `app/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/tasks/[taskId]/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/training-logs` | `app/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/training-logs/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/training-programs` | `app/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/training-programs/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/training-programs/[programId]` | `app/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/training-programs/[programId]/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/training-programs/[programId]/publish` | `app/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/training-programs/[programId]/publish/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/training-programs/[programId]/versions/[versionId]` | `app/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/training-programs/[programId]/versions/[versionId]/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/daily-entries` | `app/api/v1/workspaces/[workspaceId]/daily-entries/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/daily-entries/[entryDate]` | `app/api/v1/workspaces/[workspaceId]/daily-entries/[entryDate]/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/exercise-library` | `app/api/v1/workspaces/[workspaceId]/exercise-library/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/iifym-plans` | `app/api/v1/workspaces/[workspaceId]/iifym-plans/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/messages` | `app/api/v1/workspaces/[workspaceId]/messages/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/nutrition-logs` | `app/api/v1/workspaces/[workspaceId]/nutrition-logs/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/nutrition-logs/[entryDate]` | `app/api/v1/workspaces/[workspaceId]/nutrition-logs/[entryDate]/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/session` | `app/api/v1/workspaces/[workspaceId]/session/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/tasks` | `app/api/v1/workspaces/[workspaceId]/tasks/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/training-logs` | `app/api/v1/workspaces/[workspaceId]/training-logs/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/training-logs/sessions` | `app/api/v1/workspaces/[workspaceId]/training-logs/sessions/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/training-logs/sessions/[sessionLogId]` | `app/api/v1/workspaces/[workspaceId]/training-logs/sessions/[sessionLogId]/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/training-logs/sessions/[sessionLogId]/finish` | `app/api/v1/workspaces/[workspaceId]/training-logs/sessions/[sessionLogId]/finish/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/training-logs/sessions/[sessionLogId]/sets` | `app/api/v1/workspaces/[workspaceId]/training-logs/sessions/[sessionLogId]/sets/route.ts` | - | none detected |
| `/api/v1/workspaces/[workspaceId]/training-program` | `app/api/v1/workspaces/[workspaceId]/training-program/route.ts` | - | none detected |
| `/logout` | `app/logout/route.ts` | POST | getSession |

## Backend layouts (`app/`)

Layouts enforce the guards below for every route beneath them.

| Path | File | Rendered | Auth (detected) |
|---|---|---|---|
| `/` | `app/(canvas)/layout.tsx` | server | none detected |
| `/` | `app/layout.tsx` | server | none detected |
| `/login` | `app/login/layout.tsx` | server | none detected |
| `/me` | `app/(canvas)/me/(auth)/layout.tsx` | server | none detected |
| `/reset` | `app/reset/layout.tsx` | server | none detected |
| `/reset-request` | `app/reset-request/layout.tsx` | server | none detected |
| `/signup` | `app/signup/layout.tsx` | server | none detected |
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
| `/` | `frontend/src/app/page.tsx` | server | none detected |
| `/client` | `frontend/src/app/client/page.tsx` | server | none detected |
| `/coach` | `frontend/src/app/coach/page.tsx` | server | none detected |
| `/dev/design-system` | `frontend/src/app/dev/design-system/page.tsx` | server | none detected |
| `/ethereal` | `frontend/src/app/ethereal/page.tsx` | server | none detected |

Canvas root layout (wraps every canvas page, no guard): `frontend/src/app/layout.tsx`
