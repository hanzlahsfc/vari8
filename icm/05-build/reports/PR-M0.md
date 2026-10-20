# PR-M0 report

Card `icm/05-build/cards/pr-m0-schema-v2.md`, issue #99, PR #100. Branch `beta/pr-m0-schema-v2`, base `1b066e4` (merge base with `origin/Vari8-Beta`). Code head verified by the gate: `e8facf1`. This report is committed after that head and changes no code.

## What changed

- `db/migrations/20261020120000_schema_v2_enums/` (`migration.sql`, `down.sql`): `ParameterKind` gains BLOOD_PRESSURE, LOCATION_RATING, CONTEXT, MULTI_CHOICE (TIME and DURATION already existed); `CheckInAnswerKind` gains RATING, VISUAL. It is a separate directory because PostgreSQL cannot use a new enum value in the transaction that adds it.
- `db/migrations/20261020120100_schema_v2/` (`migration.sql`, `down.sql`), with `db/schema.prisma` matching it:
  - Workspace: retention_days (default 90), appearance mode, accent, font and density, logo media id, availability text, two notification toggles, studio dashboard draft (D25, D27, D31).
  - Member: sidebar_collapsed.
  - ClientProfile: label, coaching_since, height_cm, archived_at, archive_reason, priority_messages_allowed (D20, D27). There are no phase or week columns because D27 derives them from the assigned plan.
  - CoachingTemplate: description, plus deleted_at and restore_until (D24).
  - Template JSON slots: a CHECK limits summaryParameterIds to 4 on the draft and on the version definition (D31).
  - Habit: reason.
  - CheckInInstance: coach_note and cancel_restore_until (D24).
  - CheckInSubmissionAnswer: value_rating, the RATING and VISUAL shapes, and media for VISUAL answers in `checkin_answer_media`.
  - DailyEntryRevisionValue: columns and a kind/column CHECK for all ten kinds. TIME is stored as minutes 0 to 1439 (D28), BLOOD_PRESSURE as systolic plus diastolic, and MULTI_CHOICE as a jsonb array.
  - New tables:
    - Coach tools: CoachNote (PRIVATE or GENERAL, O13), CoachTask (D26), TrackerComment (one per client, date and parameter), ClientGoal.
    - Libraries: SavedMeal, ExerciseLibraryItem.
    - Plans: ClientPlan (the flat `Plan`), IifymPlan with IifymPlanVersion (mirrors the meal plan).
    - Messaging and media: Conversation (one per client), Message (idempotent on client_request_id), MessageAttachment, MessageDraft (one per author per conversation), MessageDraftAttachment, MessageRead, MediaObject (20 MB cap, D20), CheckInAnswerMedia.
  - Integrity: 33 composite same-workspace foreign keys, restore-window CHECKs (D24) and content CHECKs.
  - Timezones (PR-024): every remaining bare timestamp is now TIMESTAMPTZ(6), on users, sessions, accounts, verifications, workspace, workspace_member, coach_profile, client_profile and client_assignment.
- `lib/db-types/`: Zod 4 schemas and types for the new JSON columns (template slots, dashboard draft, message links, saved meal, IIFYM payload, meal targets) and the `ClientPlansRows` aggregate type.
- `tests/integration/schema-v2.test.ts`: 13 integrity tests (section E of the spec).
- `tests/integration/s1-f1-token-schema.test.ts`: one test inserts its stage-1 scratch workspace with raw SQL, because the generated client now selects the new workspace columns.
- `lib/coaching/parameters.ts`: two `as ParameterKind` casts. This file is outside the card's file list. The widened enum broke the file's closed six-value union, and the file already uses the same cast at line 438. Types only, no behavior change.
- `db/AGENTS.md`: migration conventions (never `migrate dev`, `down.sql` from PR-M0 on, enum additions in their own directory). `docs/index/*` was regenerated.

## Commands and exit codes

Full log: `/home/nexuslink/vari8-worktrees/_evidence/PR-M0/build/commands.log`.

| Command                                                                                                    | Exit | Result                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx prisma validate`                                                                                      | 0    | schema valid; `prisma format` stable                                                                                                        |
| `prisma migrate deploy` on fresh `app_prm0`                                                                | 0    | 38 migrations; `migrate status` up to date                                                                                                  |
| `prisma migrate diff --from-migrations db/migrations --to-schema-datamodel db/schema.prisma`               | 0    | 116 DropForeignKey (83 existing + 33 new raw composite FKs), plus 3 DropIndex and 2 RenameIndex, all identical at the base; no column drift |
| Seeded path: base `migrate deploy` + `npm run seed:dev`, then this branch `migrate deploy` + `seed:dev`    | 0    | 15 clients seeded; the 2 new migrations applied on top; the seed is idempotent on the new schema                                            |
| Down path: both `down.sql` files in order, then a schema dump                                              | 0    | dump equal to the dump taken before up (only pg_dump restrict tokens differ); re-deploy exit 0                                              |
| `vitest run tests/integration/schema-v2.test.ts`                                                           | 0    | 13/13; each test fails with its constraint removed (`bite.log`, 0 non-biting)                                                               |
| Most affected existing integration suites (8 files)                                                        | 0    | 118/118                                                                                                                                     |
| `npm run typecheck`, `npm run lint`, `npm run index:check`                                                 | 0    | lint: 3 warnings, all present before this PR                                                                                                |
| `icm/05-build/tools/verify-local.sh` (BASE_SHA=1b066e4, LANE_DB=app_prm0_gate, LANE_PORT=3731, CARD=PR-M0) | 1    | stops at `program generator check`; see below                                                                                               |
| The same script with only the generator-check block removed (`verify-local-nogen.diff`)                    | 0    | all 19 steps PASS, including integration (423 s), build, e2e flow specs and the parity regression (D32)                                     |

Generator check: `generate.py --check` reports 16 `icm/05-build/cards/*.md` files that differ from the generator's output. The same 16 files fail when it runs on a worktree at the base `1b066e4`. This branch changes nothing under `icm/05-build/` except this report, so the failure is on the base branch, not caused by this PR.

## Live check

The app ran on port 3731 against a migrated and seeded lane database. No screen changes are expected from this PR.

- Owner signed in, screenshots at 1440 and 390: `/home/nexuslink/vari8-worktrees/_evidence/PR-M0/build/owner-1440.png`, `owner-390.png`, `owner-client-1440.png`, `owner-client-390.png`.
- `GET /api/v1/workspaces/<id>/clients` as owner returns HTTP 200 and lists the 15 seeded clients (`owner-api-clients.txt`). Signed out, the same call returns 401 (`api-v1-clients-unauth.txt`).
- A protected page visited while signed out redirects to `/login` (`signedout-1440.png`).
- No console errors and no 500 responses.

## Parity

D32 parity: no screens are owned by this card. The parity regression step of the gate passed.

## Matrix rows closed

- V3-L1-Plan: `client_plan`.
- V3-L1-ClientPlans: the aggregate is backed by `meal_plan`, `iifym_plan`, `training_program`, `client_goal` and `client_plan`, typed as `ClientPlansRows`.
- V3-L1-IIFYM: `iifym_plan` and `iifym_plan_version`; the payload is typed in `lib/db-types/iifym.ts`.
- V3-L1-ClientGoal: `client_goal`.
- PR-001: every canvas entity has a designed table.
- PR-015: both migrations have a down path, tested by the round trip above, and `db/AGENTS.md` forbids `migrate dev`.
- PR-024: no bare timestamps remain.

## What I could not do or chose

- The PR-04 seed writes no Better Auth credential `accounts` rows, so no seeded user can sign in. For the live check I inserted one owner credential row on the throwaway lane database (outside git). The seed needs a credential path before later lanes can sign in. Neither a client user nor a second-workspace staff user is seeded, so their role screenshots and the foreign-workspace probe were not possible.
- MessageDraft is unique per (conversation, author), not per conversation alone, so two staff members never overwrite each other's draft.
- No timezone column was added to User or ClientProfile, because the canvas draws none (PR-024 note).
- The keyboard-only pass does not apply: this PR changes no interaction.
