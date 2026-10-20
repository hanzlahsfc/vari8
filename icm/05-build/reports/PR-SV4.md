# PR-SV4 report

Card `icm/05-build/cards/pr-sv4-invitations.md`, issue #123, PR #124.
Branch `beta/pr-sv4-invitations`. Lane DB `app_sv4`, lane port 3895.

## Plan (written before code, per AGENTS.md)

Data shape: `AccessToken` rows with `purpose=WORKSPACE_INVITE` are the
invitations. `createWorkspaceInvitation`/`listWorkspaceInvitations`/
`revokeWorkspaceInvitation`/`acceptWorkspaceInvitation` in
`lib/workspace/invitations.ts` are the reviewed services (Serializable tx,
advisory tuple lock, issuer re-authorization, membership state machine).
`lib/workspace/invite-acceptance.ts` is the route-facing acceptance seam used
by `/invite` (page + server action). `lib/api/v1.ts` is the route helper:
authenticate -> Zod params/query -> D15 capability scope -> one service call.

Change set:

1. `lib/workspace/invitations.ts` (O6): remove the `ClientProfile` create in
   `acceptWorkspaceInvitation`; acceptance still creates the user account and
   the workspace membership. The profile-coherence gate (opposite-class
   profile -> `membership_conflict`) stays. `CoachProfile` creation for staff
   invites stays. Repurpose
   `assertInvitationOrchestrationExternallyExposable` into the real
   fail-closed gate it documents: it throws `invitations_not_exposable` while
   no mail delivery adapter is registered (`mailDeliveryConfigured()`).
2. New `lib/workspace/invitation-api.ts`: route-facing boundary for the staff
   operations. `createInvitationFromApi` = delivery gate + per-issuer rate
   limit + `createWorkspaceInvitation` + delivery through the PR-05 mail port
   (`sendMail`, dev-file adapter default outside production) carrying the
   `/invite?workspace=..&token=..` link. `listInvitationsFromApi`,
   `revokeInvitationFromApi` map the service's structural errors
   (`AccessDeniedError`, `InvitationError`) to `ApiError` statuses. The file
   name deliberately avoids the `workspace/invitations` substring that the
   pinned import scan (`tests/unit/invitations.test.ts`) bans from `app/`.
3. New routes `app/api/v1/workspaces/[workspaceId]/invitations/route.ts`
   (GET list, POST create) and `.../invitations/[invitationId]/route.ts`
   (DELETE revoke), capability `member.invite` (D15: owner+coach workspace
   scope, client deny; the service still enforces owner-only list/revoke and
   coach CLIENT-only creation internally).
4. Tests (fail first): flip the O6 assertions in
   `tests/integration/s1-f2c-invitations.test.ts` (acceptance creates no
   ClientProfile; account + membership still created once), update the
   exposure-gate unit test to the real mail gate, add
   `tests/integration/api-v1-invitations.test.ts` calling the routes with a
   real bearer sign-in and asserting literal JSON, the auth matrix, and
   mailbox delivery.
5. Gate: `verify-local.sh` with `BASE_SHA=$(git merge-base HEAD
origin/Vari8-Beta) LANE_DB=app_sv4 LANE_PORT=3895 CARD=PR-SV4`, exit 0.
6. Live: seeded `app_sv4`, dev server on 3895, playwright chromium at
   1440x900 and 390x844: create via the API, read the dev mailbox, accept
   through `/invite`, re-drive acceptance -> exactly one account + one
   membership, zero `ClientProfile` rows created by acceptance (O6).

## Commands and exit codes

(to be filled)

## Live check

(to be filled)

## Matrix rows closed

- S01-20 (API level; the visible roster Add control is PR-W2 per O8)
- S11-16 (list endpoint; the canvas list wiring is PR-W2)
- S11-17 (acceptance backend; account + membership under O6)

## Open items / deviations

- Card names `app/api/v1/invitations/**`; routes are placed under
  `app/api/v1/workspaces/[workspaceId]/invitations/` because the v1 route
  helper requires `workspaceId` in the route params and that is the existing
  convention (`clients`, `session`).
- O6's other half (the onboarding submission creating the `ClientProfile`,
  and `OnboardingFormAssignment` accepting a client before a profile exists)
  is NOT implementable inside this card: `db/schema.prisma` makes
  `OnboardingFormAssignment.clientProfileId` a required FK and `db/` is frozen
  for this card (D34, schema guard), and `lib/onboarding/*` is outside the
  card's file list. Flagged for the lead.
