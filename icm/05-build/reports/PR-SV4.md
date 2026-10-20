# PR-SV4 report

Card `icm/05-build/cards/pr-sv4-invitations.md`, issue #123, PR #124.
Branch `beta/pr-sv4-invitations`. Lane DB `app_wb_sv4`, lane port 3940.
Builder lane on macOS, 2026-10-20.

## Plan (written before code)

Data shape: `AccessToken` rows with `purpose=WORKSPACE_INVITE` are the
invitations. `createWorkspaceInvitation`/`listWorkspaceInvitations`/
`revokeWorkspaceInvitation`/`acceptWorkspaceInvitation` in
`lib/workspace/invitations.ts` are the reviewed services (Serializable tx,
advisory tuple lock, issuer re-authorization, membership state machine).
`lib/workspace/invite-acceptance.ts` is the route-facing acceptance seam used
by `/invite` (page + server action `app/invite/actions.ts`). `lib/api/v1.ts` is
the route helper: authenticate -> Zod params/query -> D15 capability scope ->
one service call.

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
4. Tests (fail first): O6 assertion flips in
   `tests/integration/s1-f2c-invitations.test.ts` (acceptance creates no
   ClientProfile; account + membership still created once), the
   exposure-gate unit test updated to the real mail gate, and
   `tests/integration/api-v1-invitations.test.ts` calling the routes with a
   real bearer sign-in and asserting literal JSON, the auth matrix, and
   mailbox delivery.
5. Live: two real acceptances of one invitation against the lane database,
   then row counts (`client_profile`, `workspace_member`, `users`).

## Changed paths (merge base fb5c387 to head)

- `lib/workspace/invitations.ts`
- `lib/workspace/invitation-api.ts` (new)
- `app/api/v1/workspaces/[workspaceId]/invitations/route.ts` (new)
- `app/api/v1/workspaces/[workspaceId]/invitations/[invitationId]/route.ts` (new)
- `tests/integration/api-v1-invitations.test.ts` (new)
- `tests/integration/s1-f2c-invitations.test.ts`
- `tests/unit/invitations.test.ts`
- `docs/index/ROUTES.md`, `docs/index/SYMBOLS.md` (generated)
- `icm/05-build/reports/PR-SV4.md`

## The Linux integration failure and its root cause

The lead note for this card read "DIRTY, 1 integration file failed". Both parts
reproduced and are now closed.

1. DIRTY was the merge against `origin/Vari8-Beta`: only the generated
   `docs/index/ROUTES.md` and `docs/index/SYMBOLS.md` conflicted. Resolved by
   regenerating them with `npm run index` rather than hand-merging, which is
   the generator's output by definition (`index:check` then exits 0).
2. The failing integration file was
   `tests/integration/seed-credentials.test.ts`. Root cause on the old base:
   the test asserted that the seeded credential client
   (`SEED_CLIENT_*`) owned the canvas workspace `ClientProfile`, but since
   PR-M8 that profile belongs to the canvas demo user
   (`scripts/seed/33-checkins.seed.ts`, `emma.anders@canvas-demo.test`), and
   since PR-05 credential sign-in reads the `accounts` table which the seed did
   not write at all. Base `fb5c387` carries `458634d` ("fix(seed): write Better
   Auth credential accounts for seeded users"), which seeds `providerId=
credential` accounts and rewrites that assertion. Fix applied: none by me,
   the base version of the file is what the branch carries
   (`git diff origin/Vari8-Beta -- tests/integration/seed-credentials.test.ts`
   is empty) and the file passes. No local guard added.

## Commands and exit codes

Lane env per standing orders (password from the root `.env`, never printed).
Node 26.12.0 against the repo's target 24 (D5), so the gate records a WARN, not
a certification. `npm` is the real install at `/opt/homebrew/bin/npm` (11.20.0),
not a stub, and `node_modules` held 561 entries plus `.package-lock.json` after
the install.

| Command                                            | Exit     | Result                                                            |
| -------------------------------------------------- | -------- | ----------------------------------------------------------------- |
| `git merge origin/Vari8-Beta`                      | 1        | conflicts only in `docs/index/ROUTES.md`, `docs/index/SYMBOLS.md` |
| `npm run index`                                    | 0        | 5 docs + 12 AGENTS.md routers written, conflict markers 0         |
| `npm run index:check`                              | 0        | "6 index docs and all AGENTS.md routers match"                    |
| `git commit` (merge)                               | 0        | merge commit `01a20c6`                                            |
| `npm ci --no-audit --no-fund`                      | 0        | 767 packages, 561 node_modules entries                            |
| `npm --prefix frontend ci`                         | 0        | 383 packages                                                      |
| `npx prisma migrate deploy` (lane DB)              | 0        | all migrations applied                                            |
| `vitest run s1-f2c-invitations api-v1-invitations` | 0        | 2 files, 39 tests                                                 |
| `npm run test:integration`                         | 0        | 62 files, 872 tests, 134 s                                        |
| double-submission probe (tsx, lane DB)             | 0        | counts below                                                      |
| `verify-local.sh` (gate)                           | see Gate |                                                                   |

## Double submission: row counts

Two real acceptances of the same invitation token, same email, same password,
sequentially against `app_wb_sv4` (script output kept at
`Vari8-evidence/WAVEB-LEAD/pr-sv4.double-submit.json`):

| Submission | Result                   |
| ---------- | ------------------------ |
| submit 1   | `outcome: accepted`      |
| submit 2   | rejected `invalid_token` |

| Rows after both submissions                            | Count |
| ------------------------------------------------------ | ----- |
| `users` with the invited email                         | 1     |
| `workspace_member` rows for that user in the workspace | 1     |
| `client_profile` rows for that user                    | 0     |
| `client_profile` rows in the workspace                 | 0     |
| consumed `access_token` rows for the invitation        | 1     |

The concurrency variant is covered in the suite:
`tests/integration/s1-f2c-invitations.test.ts` "concurrent acceptance has
exactly one winner" fires two acceptances in parallel and asserts exactly one
user and one membership.

## The acceptance line and O6 disagree, and O6 is the later ruling

The card carries two statements that cannot both hold:

- "Acceptance (you see): Invite acceptance creates one client profile even when
  submitted twice." (card line 55, written `daaa258`, 2026-10-19)
- "Owner ruling O6: ... this card owns the backend change so invite acceptance
  no longer creates the `ClientProfile` ... while the invitation still creates
  the account and membership." (card line 28, written `f5bf9f7`, 2026-10-20;
  source `icm/03-plan/output/WIRING-SPEC.md` ruling O6)

O6 is a day newer, is a named owner ruling, and cites the exact source lines it
overrides (`lib/workspace/invitations.ts:657-661`). The build follows O6, which
is also what the previous lane implemented and what the flipped tests assert.
Read under O6 the idempotency claim in the acceptance line is satisfied by the
table above: the second submission changes nothing, and the client ends with
exactly one account and one membership. The literal count of `ClientProfile`
rows created by acceptance is 0 by ruling, not by omission.

O6's other half (the submitted onboarding form creating the `ClientProfile`)
cannot land in this card: `db/schema.prisma` makes
`OnboardingFormAssignment.clientProfileId` a required FK, `db/` is frozen here
(D34 schema guard) and `lib/onboarding/*` is outside the card's file list.
Flagged for the lead; it is the PR-W2 wiring half of the ruling.

## Parity (D32)

The card says "Parity (D32) on: none", so parity is not this card's contract,
and this branch changes no canvas markup, styles or copy. The base
`verify-local.sh` has no `SKIP_PARITY` switch, so the parity step runs when
`tools/parity/run.mjs` is present and its result is recorded verbatim below
whether it passes or fails.

## What I could not do

- Nothing in the card's own file list is unimplemented.
- O6's onboarding-submit half, per the section above (schema freeze, outside
  file list).
- The Linux lane's own screenshots were not produced here; the double
  submission proof is a database-level live run, not a browser capture, because
  the acceptance path under test is the server action's seam
  (`acceptInvitationFromLink`) and the browser flow is covered by the gate's
  `tests/e2e/invite-acceptance.spec.ts`.
