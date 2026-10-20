# DATA-MODEL.md - Prisma data dictionary

Generated file. Do not edit by hand: changes are overwritten by `npm run index`.
Verify the committed copy is current with `npm run index:check` (exit 1 = drift).

Source: `db/schema.prisma`.
Counts: 52 models, 31 enums, 513 scalar fields, 306 relation fields.

`Kind` is derived from the field type: `scalar` (Prisma scalar), `enum` (schema enum), `relation`
(another model's name; a field carrying `@relation(fields: ...)` is the foreign-key side, one
without it is the back-relation). Migrations live in `db/migrations/`; never edit an applied one.

## Models

| Model | Fields | Relations | Source |
|---|---|---|---|
| [`AccessToken`](#accesstoken) | 16 | 3 | `db/schema.prisma:507` |
| [`Account`](#account) | 14 | 1 | `db/schema.prisma:196` |
| [`AuditEvent`](#auditevent) | 19 | 4 | `db/schema.prisma:462` |
| [`CheckInFeedback`](#checkinfeedback) | 13 | 4 | `db/schema.prisma:1515` |
| [`CheckInForm`](#checkinform) | 20 | 7 | `db/schema.prisma:1299` |
| [`CheckInFormVersion`](#checkinformversion) | 13 | 5 | `db/schema.prisma:1331` |
| [`CheckInInstance`](#checkininstance) | 23 | 8 | `db/schema.prisma:1368` |
| [`CheckInReview`](#checkinreview) | 11 | 4 | `db/schema.prisma:1486` |
| [`CheckInScheduleRule`](#checkinschedulerule) | 27 | 9 | `db/schema.prisma:1566` |
| [`CheckInSubmission`](#checkinsubmission) | 20 | 10 | `db/schema.prisma:1420` |
| [`CheckInSubmissionAnswer`](#checkinsubmissionanswer) | 13 | 3 | `db/schema.prisma:1459` |
| [`ClientAssignment`](#clientassignment) | 11 | 2 | `db/schema.prisma:419` |
| [`ClientDashboardLayout`](#clientdashboardlayout) | 12 | 3 | `db/schema.prisma:1612` |
| [`ClientProfile`](#clientprofile) | 31 | 25 | `db/schema.prisma:376` |
| [`ClientSetup`](#clientsetup) | 8 | 3 | `db/schema.prisma:1000` |
| [`ClientSetupPin`](#clientsetuppin) | 27 | 10 | `db/schema.prisma:1022` |
| [`ClientTask`](#clienttask) | 20 | 5 | `db/schema.prisma:1643` |
| [`CoachProfile`](#coachprofile) | 6 | 1 | `db/schema.prisma:364` |
| [`CoachingTemplate`](#coachingtemplate) | 19 | 6 | `db/schema.prisma:901` |
| [`CoachingTemplateVersion`](#coachingtemplateversion) | 14 | 6 | `db/schema.prisma:930` |
| [`CoachingTemplateVersionParameter`](#coachingtemplateversionparameter) | 8 | 4 | `db/schema.prisma:959` |
| [`ConsentRecord`](#consentrecord) | 10 | 2 | `db/schema.prisma:442` |
| [`DailyEntry`](#dailyentry) | 12 | 4 | `db/schema.prisma:1084` |
| [`DailyEntryRevision`](#dailyentryrevision) | 16 | 5 | `db/schema.prisma:1115` |
| [`DailyEntryRevisionValue`](#dailyentryrevisionvalue) | 10 | 2 | `db/schema.prisma:1152` |
| [`ExerciseCatalogItem`](#exercisecatalogitem) | 14 | 0 | `db/schema.prisma:638` |
| [`ExerciseImportRowOutcome`](#exerciseimportrowoutcome) | 8 | 1 | `db/schema.prisma:694` |
| [`ExerciseImportRun`](#exerciseimportrun) | 16 | 1 | `db/schema.prisma:668` |
| [`Habit`](#habit) | 13 | 4 | `db/schema.prisma:1686` |
| [`HabitLog`](#habitlog) | 8 | 2 | `db/schema.prisma:1731` |
| [`HabitSchedule`](#habitschedule) | 6 | 1 | `db/schema.prisma:1716` |
| [`MealPlan`](#mealplan) | 20 | 6 | `db/schema.prisma:1755` |
| [`MealPlanVersion`](#mealplanversion) | 16 | 4 | `db/schema.prisma:1789` |
| [`NutritionCatalogItem`](#nutritioncatalogitem) | 14 | 0 | `db/schema.prisma:560` |
| [`NutritionImportRowOutcome`](#nutritionimportrowoutcome) | 8 | 1 | `db/schema.prisma:614` |
| [`NutritionImportRun`](#nutritionimportrun) | 16 | 1 | `db/schema.prisma:588` |
| [`OnboardingForm`](#onboardingform) | 19 | 6 | `db/schema.prisma:719` |
| [`OnboardingFormAssignment`](#onboardingformassignment) | 19 | 7 | `db/schema.prisma:782` |
| [`OnboardingFormVersion`](#onboardingformversion) | 11 | 4 | `db/schema.prisma:747` |
| [`OnboardingSubmission`](#onboardingsubmission) | 20 | 9 | `db/schema.prisma:1186` |
| [`OnboardingSubmissionAnswer`](#onboardingsubmissionanswer) | 11 | 2 | `db/schema.prisma:1226` |
| [`OnboardingSubmissionReview`](#onboardingsubmissionreview) | 11 | 4 | `db/schema.prisma:1252` |
| [`ParameterDefinition`](#parameterdefinition) | 27 | 6 | `db/schema.prisma:856` |
| [`RateLimit`](#ratelimit) | 4 | 0 | `db/schema.prisma:234` |
| [`Session`](#session) | 9 | 1 | `db/schema.prisma:178` |
| [`TrainingProgram`](#trainingprogram) | 31 | 8 | `db/schema.prisma:1833` |
| [`TrainingProgramVersion`](#trainingprogramversion) | 18 | 5 | `db/schema.prisma:1891` |
| [`TrainingSessionBooking`](#trainingsessionbooking) | 19 | 6 | `db/schema.prisma:1926` |
| [`User`](#user) | 24 | 13 | `db/schema.prisma:124` |
| [`Verification`](#verification) | 6 | 0 | `db/schema.prisma:221` |
| [`Workspace`](#workspace) | 38 | 32 | `db/schema.prisma:243` |
| [`WorkspaceMember`](#workspacemember) | 54 | 46 | `db/schema.prisma:287` |

## Enums

- `AccessTokenPurpose` (`db/schema.prisma:107`): WORKSPACE_INVITE, PASSWORD_RESET
- `AssignmentRole` (`db/schema.prisma:44`): PRIMARY, COACH
- `AssignmentStatus` (`db/schema.prisma:49`): ACTIVE, REMOVED
- `AuditAction` (`db/schema.prisma:82`): READ, CREATE, UPDATE, DELETE, EXPORT, GRANT, REVOKE, INVITE, ASSIGN, DENY, LOGIN, PASSWORD_RESET
- `AuditResult` (`db/schema.prisma:102`): ALLOW, DENY
- `AuditScope` (`db/schema.prisma:97`): WORKSPACE, ACCOUNT
- `CheckInAnswerKind` (`db/schema.prisma:1290`): SHORT_TEXT, LONG_TEXT, NUMBER, DATE, SINGLE_CHOICE, MULTI_CHOICE
- `CheckInFormStatus` (`db/schema.prisma:1282`): ACTIVE, ARCHIVED
- `CheckInScheduleRuleStatus` (`db/schema.prisma:1541`): ACTIVE, PAUSED, ENDED
- `CheckInWeekday` (`db/schema.prisma:1547`): MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY, SUNDAY
- `ClientSetupPinStatus` (`db/schema.prisma:987`): ACTIVE, CANCELLED
- `ClientTaskStatus` (`db/schema.prisma:54`): OPEN, COMPLETED, CANCELLED
- `CoachingTemplateStatus` (`db/schema.prisma:851`): ACTIVE, ARCHIVED
- `ConsentKind` (`db/schema.prisma:68`): PRIVACY_NOTICE, HEALTH_DATA, CYCLE, PHOTOS, BLOODWORK, PED_HRT
- `ConsentSource` (`db/schema.prisma:77`): CLIENT_SELF, COACH_ATTESTED
- `ExerciseImportOutcome` (`db/schema.prisma:118`): IMPORTED, REJECTED, DUPLICATE
- `HabitLogStatus` (`db/schema.prisma:63`): DONE, SKIPPED
- `MemberRole` (`db/schema.prisma:29`): WORKSPACE_OWNER, COACH, ASSISTANT_COACH, SUPPORT, CLIENT
- `MemberStatus` (`db/schema.prisma:37`): INVITED, ACTIVE, SUSPENDED, REMOVED
- `NutritionImportOutcome` (`db/schema.prisma:112`): IMPORTED, REJECTED, DUPLICATE
- `OnboardingAnswerKind` (`db/schema.prisma:1177`): SHORT_TEXT, LONG_TEXT, NUMBER, DATE, SINGLE_CHOICE, MULTI_CHOICE
- `OnboardingAssignmentStatus` (`db/schema.prisma:775`): ACTIVE, SUPERSEDED, CANCELLED
- `OnboardingFormStatus` (`db/schema.prisma:714`): ACTIVE, ARCHIVED
- `ParameterDataClassification` (`db/schema.prisma:844`): GENERAL_HEALTH, CYCLE, BLOODWORK, PED_HRT
- `ParameterKind` (`db/schema.prisma:824`): MEASUREMENT, RATING, TIME, DURATION, OPTION, TEXT
- `ParameterStatus` (`db/schema.prisma:839`): ACTIVE, ARCHIVED
- `PinTransitionKind` (`db/schema.prisma:995`): UPGRADE, ROLLBACK
- `PlatformRole` (`db/schema.prisma:13`): USER, PLATFORM_ADMIN
- `RatingScheme` (`db/schema.prisma:833`): SCALE_1_10, SCALE_1_5, WORD_LABELS
- `UserStatus` (`db/schema.prisma:18`): ACTIVE, DEACTIVATED, INVITED
- `WorkspaceStatus` (`db/schema.prisma:24`): ACTIVE, SUSPENDED

## Model detail

### AccessToken

`db/schema.prisma:507` - 16 fields, 3 relations. Constraints: `@@index([workspaceId, purpose, targetEmail, intendedRole], map: "access_token_invite_target_idx")`, `@@index([userId, purpose], map: "access_token_user_id_purpose_idx")`, `@@index([expiresAt], map: "access_token_expires_at_idx")`, `@@index([workspaceId, purpose, id], map: "access_token_ws_invite_list_idx")`, `@@map("access_token")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `purpose` | `AccessTokenPurpose` | enum | - |
| `tokenHash` | `String` | scalar | `@unique @map("token_hash")` |
| `workspaceId` | `String?` | scalar | `@map("workspace_id")` |
| `userId` | `String?` | scalar | `@map("user_id")` |
| `targetEmail` | `String?` | scalar | `@map("target_email")` |
| `intendedRole` | `MemberRole?` | enum | `@map("intended_role")` |
| `createdByUserId` | `String?` | scalar | `@map("created_by_user_id")` |
| `targetMemberStateVersion` | `Int?` | scalar | `@map("target_member_state_version")` |
| `expiresAt` | `DateTime` | scalar | `@map("expires_at") @db.Timestamptz(6)` |
| `consumedAt` | `DateTime?` | scalar | `@map("consumed_at") @db.Timestamptz(6)` |
| `revokedAt` | `DateTime?` | scalar | `@map("revoked_at") @db.Timestamptz(6)` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `workspace` | `Workspace?` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `user` | `User?` | relation | `@relation("AccessTokenUser", fields: [userId], references: [id], onDelete: Cascade)` |
| `createdBy` | `User?` | relation | `@relation("AccessTokenCreator", fields: [createdByUserId], references: [id], onDelete: Restrict)` |

### Account

`db/schema.prisma:196` - 14 fields, 1 relations. Constraints: `@@unique([providerId, accountId])`, `@@index([userId])`, `@@map("accounts")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `userId` | `String` | scalar | `@map("user_id")` |
| `accountId` | `String` | scalar | `@map("account_id")` |
| `providerId` | `String` | scalar | `@map("provider_id")` |
| `accessToken` | `String?` | scalar | `@map("access_token")` |
| `refreshToken` | `String?` | scalar | `@map("refresh_token")` |
| `accessTokenExpiresAt` | `DateTime?` | scalar | `@map("access_token_expires_at")` |
| `refreshTokenExpiresAt` | `DateTime?` | scalar | `@map("refresh_token_expires_at")` |
| `scope` | `String?` | scalar | - |
| `idToken` | `String?` | scalar | `@map("id_token")` |
| `password` | `String?` | scalar | - |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at")` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at")` |
| `user` | `User` | relation | `@relation(fields: [userId], references: [id], onDelete: Cascade)` |

### AuditEvent

`db/schema.prisma:462` - 19 fields, 4 relations. Constraints: `@@index([workspaceId, at])`, `@@index([workspaceId, id])`, `@@index([subjectUserId, at])`, `@@index([subjectUserId, id], map: "audit_event_subject_user_id_id_idx")`, `@@map("audit_event")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `scope` | `AuditScope` | enum | `@default(WORKSPACE)` |
| `workspaceId` | `String?` | scalar | `@map("workspace_id")` |
| `actorUserId` | `String?` | scalar | `@map("actor_user_id")` |
| `actorRole` | `MemberRole?` | enum | `@map("actor_role")` |
| `action` | `AuditAction` | enum | - |
| `resourceType` | `String` | scalar | `@map("resource_type")` |
| `resourceId` | `String?` | scalar | `@map("resource_id")` |
| `subjectClientProfileId` | `String?` | scalar | `@map("subject_client_profile_id")` |
| `subjectUserId` | `String?` | scalar | `@map("subject_user_id")` |
| `result` | `AuditResult` | enum | - |
| `reason` | `String?` | scalar | - |
| `at` | `DateTime` | scalar | `@default(now()) @db.Timestamptz(6)` |
| `ip` | `String?` | scalar | - |
| `meta` | `Json?` | scalar | - |
| `workspace` | `Workspace?` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `actor` | `User?` | relation | `@relation(fields: [actorUserId], references: [id], onDelete: SetNull)` |
| `subjectClientProfile` | `ClientProfile?` | relation | `@relation(fields: [subjectClientProfileId], references: [id], onDelete: SetNull)` |
| `subjectUser` | `User?` | relation | `@relation("AuditSubjectUser", fields: [subjectUserId], references: [id], onDelete: Restrict)` |

### CheckInFeedback

`db/schema.prisma:1515` - 13 fields, 4 relations. Constraints: `@@unique([submissionId, clientRequestId])`, `@@index([submissionId, sentAt, id])`, `@@index([workspaceId, clientProfileId])`, `@@map("checkin_feedback")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `clientProfileId` | `String` | scalar | `@map("client_profile_id")` |
| `submissionId` | `String` | scalar | `@map("submission_id")` |
| `authoredByMemberId` | `String` | scalar | `@map("authored_by_member_id")` |
| `body` | `String` | scalar | - |
| `clientRequestId` | `String` | scalar | `@map("client_request_id")` |
| `sentAt` | `DateTime` | scalar | `@default(now()) @map("sent_at") @db.Timestamptz(6)` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `clientProfile` | `ClientProfile` | relation | `@relation("CheckInFeedbackClient", fields: [clientProfileId], references: [id], onDelete: Restrict)` |
| `submission` | `CheckInSubmission` | relation | `@relation(fields: [submissionId], references: [id], onDelete: Restrict)` |
| `authoredBy` | `WorkspaceMember` | relation | `@relation("CheckInFeedbackAuthor", fields: [authoredByMemberId], references: [id], onDelete: Restrict)` |

### CheckInForm

`db/schema.prisma:1299` - 20 fields, 7 relations. Constraints: `@@unique([id, workspaceId])`, `@@index([workspaceId, status])`, `@@map("checkin_form")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `name` | `String` | scalar | - |
| `status` | `CheckInFormStatus` | enum | `@default(ACTIVE)` |
| `archivedAt` | `DateTime?` | scalar | `@map("archived_at") @db.Timestamptz(6)` |
| `archivedByMemberId` | `String?` | scalar | `@map("archived_by_member_id")` |
| `draft` | `Json?` | scalar | - |
| `draftRevision` | `Int` | scalar | `@default(1) @map("draft_revision")` |
| `draftSavedByMemberId` | `String?` | scalar | `@map("draft_saved_by_member_id")` |
| `draftUpdatedAt` | `DateTime?` | scalar | `@map("draft_updated_at") @db.Timestamptz(6)` |
| `createdByMemberId` | `String` | scalar | `@map("created_by_member_id")` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `createdByMember` | `WorkspaceMember` | relation | `@relation("CheckInFormCreator", fields: [createdByMemberId], references: [id], onDelete: Restrict)` |
| `archivedByMember` | `WorkspaceMember?` | relation | `@relation("CheckInFormArchiver", fields: [archivedByMemberId], references: [id], onDelete: Restrict)` |
| `versions` | `CheckInFormVersion[]` | relation | - |
| `instances` | `CheckInInstance[]` | relation | `@relation("CheckInInstanceForm")` |
| `submissions` | `CheckInSubmission[]` | relation | `@relation("CheckInSubmissionForm")` |
| `scheduleRules` | `CheckInScheduleRule[]` | relation | `@relation("CheckInScheduleRuleForm")` |

### CheckInFormVersion

`db/schema.prisma:1331` - 13 fields, 5 relations. Constraints: `@@unique([formId, versionSeq])`, `@@unique([id, workspaceId, formId])`, `@@unique([formId, publishOriginRevision], map: "checkin_form_version_publish_origin_key")`, `@@map("checkin_form_version")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `formId` | `String` | scalar | `@map("form_id")` |
| `versionSeq` | `Int` | scalar | `@map("version_seq")` |
| `definition` | `Json` | scalar | - |
| `publishOriginRevision` | `Int` | scalar | `@map("publish_origin_revision")` |
| `publishedAt` | `DateTime` | scalar | `@default(now()) @map("published_at") @db.Timestamptz(6)` |
| `publishedByMemberId` | `String` | scalar | `@map("published_by_member_id")` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `form` | `CheckInForm` | relation | `@relation(fields: [formId], references: [id], onDelete: Restrict)` |
| `publishedByMember` | `WorkspaceMember` | relation | `@relation("CheckInFormVersionPublisher", fields: [publishedByMemberId], references: [id], onDelete: Restrict)` |
| `instances` | `CheckInInstance[]` | relation | `@relation("CheckInInstanceFormVersion")` |
| `submissions` | `CheckInSubmission[]` | relation | `@relation("CheckInSubmissionFormVersion")` |

### CheckInInstance

`db/schema.prisma:1368` - 23 fields, 8 relations. Constraints: `@@unique([id, workspaceId, clientProfileId, formId, formVersionId], map: "checkin_instance_wide_coherence_key")`, `@@unique([workspaceId, clientProfileId, formId, dueAt], map: "checkin_instance_duplicate_schedule_key")`, `@@unique([originRuleId, occurrenceDate], map: "checkin_instance_occurrence_key")`, `@@index([workspaceId, clientProfileId, dueAt])`, `@@index([workspaceId, id])`, `@@index([formVersionId])`, `@@index([originRuleId])`, `@@map("checkin_instance")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `clientProfileId` | `String` | scalar | `@map("client_profile_id")` |
| `formId` | `String` | scalar | `@map("form_id")` |
| `formVersionId` | `String` | scalar | `@map("form_version_id")` |
| `dueAt` | `DateTime` | scalar | `@map("due_at") @db.Timestamptz(6)` |
| `dueTz` | `String?` | scalar | `@map("due_tz")` |
| `scheduledByMemberId` | `String` | scalar | `@map("scheduled_by_member_id")` |
| `scheduledAt` | `DateTime` | scalar | `@default(now()) @map("scheduled_at") @db.Timestamptz(6)` |
| `originRuleId` | `String?` | scalar | `@map("origin_rule_id")` |
| `occurrenceDate` | `DateTime?` | scalar | `@map("occurrence_date") @db.Date` |
| `cancelledByMemberId` | `String?` | scalar | `@map("cancelled_by_member_id")` |
| `cancelledAt` | `DateTime?` | scalar | `@map("cancelled_at") @db.Timestamptz(6)` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `clientProfile` | `ClientProfile` | relation | `@relation("CheckInInstanceClient", fields: [clientProfileId], references: [id], onDelete: Restrict)` |
| `form` | `CheckInForm` | relation | `@relation("CheckInInstanceForm", fields: [formId], references: [id], onDelete: Restrict)` |
| `formVersion` | `CheckInFormVersion` | relation | `@relation("CheckInInstanceFormVersion", fields: [formVersionId], references: [id], onDelete: Restrict)` |
| `scheduledByMember` | `WorkspaceMember` | relation | `@relation("CheckInInstanceScheduler", fields: [scheduledByMemberId], references: [id], onDelete: Restrict)` |
| `cancelledByMember` | `WorkspaceMember?` | relation | `@relation("CheckInInstanceCanceller", fields: [cancelledByMemberId], references: [id], onDelete: Restrict)` |
| `originRule` | `CheckInScheduleRule?` | relation | `@relation(fields: [originRuleId], references: [id], onDelete: Restrict)` |
| `submissions` | `CheckInSubmission[]` | relation | - |

### CheckInReview

`db/schema.prisma:1486` - 11 fields, 4 relations. Constraints: `@@unique([submissionId])`, `@@index([workspaceId, clientProfileId])`, `@@map("checkin_review")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `clientProfileId` | `String` | scalar | `@map("client_profile_id")` |
| `submissionId` | `String` | scalar | `@map("submission_id")` |
| `reviewedByMemberId` | `String` | scalar | `@map("reviewed_by_member_id")` |
| `reviewedAt` | `DateTime` | scalar | `@default(now()) @map("reviewed_at") @db.Timestamptz(6)` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `clientProfile` | `ClientProfile` | relation | `@relation("CheckInReviewClient", fields: [clientProfileId], references: [id], onDelete: Restrict)` |
| `submission` | `CheckInSubmission` | relation | `@relation(fields: [submissionId], references: [id], onDelete: Restrict)` |
| `reviewedByMember` | `WorkspaceMember` | relation | `@relation("CheckInReviewReviewer", fields: [reviewedByMemberId], references: [id], onDelete: Restrict)` |

### CheckInScheduleRule

`db/schema.prisma:1566` - 27 fields, 9 relations. Constraints: `@@unique([id, workspaceId, clientProfileId], map: "checkin_schedule_rule_coherence_key")`, `@@index([workspaceId, clientProfileId, status])`, `@@map("checkin_schedule_rule")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `clientProfileId` | `String` | scalar | `@map("client_profile_id")` |
| `formId` | `String` | scalar | `@map("form_id")` |
| `weekday` | `CheckInWeekday` | enum | - |
| `localTimeMinutes` | `Int` | scalar | `@map("local_time_minutes")` |
| `timezone` | `String` | scalar | - |
| `startDate` | `DateTime` | scalar | `@map("start_date") @db.Date` |
| `endDate` | `DateTime?` | scalar | `@map("end_date") @db.Date` |
| `status` | `CheckInScheduleRuleStatus` | enum | `@default(ACTIVE)` |
| `createdByMemberId` | `String` | scalar | `@map("created_by_member_id")` |
| `pausedAt` | `DateTime?` | scalar | `@map("paused_at") @db.Timestamptz(6)` |
| `pausedByMemberId` | `String?` | scalar | `@map("paused_by_member_id")` |
| `endedAt` | `DateTime?` | scalar | `@map("ended_at") @db.Timestamptz(6)` |
| `endedByMemberId` | `String?` | scalar | `@map("ended_by_member_id")` |
| `replacedByRuleId` | `String?` | scalar | `@unique @map("replaced_by_rule_id")` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `clientProfile` | `ClientProfile` | relation | `@relation("CheckInScheduleRuleClient", fields: [clientProfileId], references: [id], onDelete: Restrict)` |
| `form` | `CheckInForm` | relation | `@relation("CheckInScheduleRuleForm", fields: [formId], references: [id], onDelete: Restrict)` |
| `createdByMember` | `WorkspaceMember` | relation | `@relation("CheckInScheduleRuleCreator", fields: [createdByMemberId], references: [id], onDelete: Restrict)` |
| `pausedByMember` | `WorkspaceMember?` | relation | `@relation("CheckInScheduleRulePauser", fields: [pausedByMemberId], references: [id], onDelete: Restrict)` |
| `endedByMember` | `WorkspaceMember?` | relation | `@relation("CheckInScheduleRuleEnder", fields: [endedByMemberId], references: [id], onDelete: Restrict)` |
| `replacedByRule` | `CheckInScheduleRule?` | relation | `@relation("CheckInScheduleRuleReplacement", fields: [replacedByRuleId], references: [id], onDelete: Restrict)` |
| `replacesRule` | `CheckInScheduleRule?` | relation | `@relation("CheckInScheduleRuleReplacement")` |
| `instances` | `CheckInInstance[]` | relation | - |

### CheckInSubmission

`db/schema.prisma:1420` - 20 fields, 10 relations. Constraints: `@@unique([instanceId])`, `@@unique([id, workspaceId, clientProfileId], map: "checkin_submission_coherence_key")`, `@@index([workspaceId, clientProfileId])`, `@@index([workspaceId, id])`, `@@index([workspaceId, submittedAt, id])`, `@@map("checkin_submission")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `clientProfileId` | `String` | scalar | `@map("client_profile_id")` |
| `formId` | `String` | scalar | `@map("form_id")` |
| `formVersionId` | `String` | scalar | `@map("form_version_id")` |
| `instanceId` | `String` | scalar | `@map("instance_id")` |
| `submittedByUserId` | `String` | scalar | `@map("submitted_by_user_id")` |
| `submittedByMemberId` | `String` | scalar | `@map("submitted_by_member_id")` |
| `submittedAt` | `DateTime` | scalar | `@default(now()) @map("submitted_at") @db.Timestamptz(6)` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `clientProfile` | `ClientProfile` | relation | `@relation("CheckInSubmissionClient", fields: [clientProfileId], references: [id], onDelete: Restrict)` |
| `form` | `CheckInForm` | relation | `@relation("CheckInSubmissionForm", fields: [formId], references: [id], onDelete: Restrict)` |
| `formVersion` | `CheckInFormVersion` | relation | `@relation("CheckInSubmissionFormVersion", fields: [formVersionId], references: [id], onDelete: Restrict)` |
| `instance` | `CheckInInstance` | relation | `@relation(fields: [instanceId], references: [id], onDelete: Restrict)` |
| `submittedByUser` | `User` | relation | `@relation("CheckInSubmissionSubmittedByUser", fields: [submittedByUserId], references: [id], onDelete: Restrict)` |
| `submittedByMember` | `WorkspaceMember` | relation | `@relation("CheckInSubmissionSubmittedByMember", fields: [submittedByMemberId], references: [id], onDelete: Restrict)` |
| `answers` | `CheckInSubmissionAnswer[]` | relation | - |
| `reviews` | `CheckInReview[]` | relation | - |
| `feedback` | `CheckInFeedback[]` | relation | - |

### CheckInSubmissionAnswer

`db/schema.prisma:1459` - 13 fields, 3 relations. Constraints: `@@unique([submissionId, fieldId])`, `@@index([workspaceId])`, `@@map("checkin_submission_answer")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `submissionId` | `String` | scalar | `@map("submission_id")` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `clientProfileId` | `String` | scalar | `@map("client_profile_id")` |
| `fieldId` | `String` | scalar | `@map("field_id")` |
| `kind` | `CheckInAnswerKind` | enum | - |
| `valueText` | `String?` | scalar | `@map("value_text")` |
| `valueNumeric` | `Decimal?` | scalar | `@map("value_numeric") @db.Decimal(23, 6)` |
| `valueDate` | `DateTime?` | scalar | `@map("value_date") @db.Date` |
| `valueOptionIds` | `Json?` | scalar | `@map("value_option_ids")` |
| `submission` | `CheckInSubmission` | relation | `@relation(fields: [submissionId], references: [id], onDelete: Restrict)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `clientProfile` | `ClientProfile` | relation | `@relation("CheckInAnswerClient", fields: [clientProfileId], references: [id], onDelete: Restrict)` |

### ClientAssignment

`db/schema.prisma:419` - 11 fields, 2 relations. Constraints: `@@unique([clientProfileId, coachMemberId])`, `@@index([workspaceId])`, `@@index([coachMemberId, status])`, `@@index([clientProfileId, status])`, `@@map("client_assignment")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `clientProfileId` | `String` | scalar | `@map("client_profile_id")` |
| `coachMemberId` | `String` | scalar | `@map("coach_member_id")` |
| `role` | `AssignmentRole` | enum | - |
| `status` | `AssignmentStatus` | enum | `@default(ACTIVE)` |
| `assignedAt` | `DateTime` | scalar | `@default(now()) @map("assigned_at")` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at")` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at")` |
| `clientProfile` | `ClientProfile` | relation | `@relation("ClientAssignmentClient", fields: [clientProfileId], references: [id], onDelete: Restrict)` |
| `coachMember` | `WorkspaceMember` | relation | `@relation("ClientAssignmentCoach", fields: [coachMemberId], references: [id], onDelete: Restrict)` |

### ClientDashboardLayout

`db/schema.prisma:1612` - 12 fields, 3 relations. Constraints: `@@unique([workspaceId, clientProfileId])`, `@@unique([id, workspaceId])`, `@@index([clientProfileId])`, `@@map("client_dashboard_layout")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `clientProfileId` | `String` | scalar | `@map("client_profile_id")` |
| `config` | `Json` | scalar | - |
| `configVersion` | `Int` | scalar | `@default(1) @map("config_version")` |
| `revision` | `Int` | scalar | `@default(1)` |
| `updatedByMemberId` | `String?` | scalar | `@map("updated_by_member_id")` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `clientProfile` | `ClientProfile` | relation | `@relation("ClientDashboardLayoutClient", fields: [clientProfileId], references: [id], onDelete: Restrict)` |
| `updatedByMember` | `WorkspaceMember?` | relation | `@relation("DashboardLayoutEditor", fields: [updatedByMemberId], references: [id], onDelete: Restrict)` |

### ClientProfile

`db/schema.prisma:376` - 31 fields, 25 relations. Constraints: `@@unique([workspaceId, userId])`, `@@unique([id, workspaceId])`, `@@index([workspaceId])`, `@@map("client_profile")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `userId` | `String?` | scalar | `@map("user_id")` |
| `name` | `String` | scalar | - |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at")` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at")` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `user` | `User?` | relation | `@relation(fields: [userId], references: [id], onDelete: SetNull)` |
| `assignments` | `ClientAssignment[]` | relation | `@relation("ClientAssignmentClient")` |
| `consents` | `ConsentRecord[]` | relation | - |
| `auditSubjectEvents` | `AuditEvent[]` | relation | - |
| `onboardingAssignments` | `OnboardingFormAssignment[]` | relation | `@relation("OnboardingAssignmentClient")` |
| `clientSetups` | `ClientSetup[]` | relation | `@relation("ClientSetupClient")` |
| `clientSetupPins` | `ClientSetupPin[]` | relation | `@relation("ClientSetupPinClient")` |
| `dailyEntries` | `DailyEntry[]` | relation | `@relation("ClientProfileDailyEntries")` |
| `onboardingSubmissions` | `OnboardingSubmission[]` | relation | `@relation("OnboardingSubmissionClient")` |
| `checkInInstances` | `CheckInInstance[]` | relation | `@relation("CheckInInstanceClient")` |
| `checkInSubmissions` | `CheckInSubmission[]` | relation | `@relation("CheckInSubmissionClient")` |
| `checkInReviews` | `CheckInReview[]` | relation | `@relation("CheckInReviewClient")` |
| `checkInFeedback` | `CheckInFeedback[]` | relation | `@relation("CheckInFeedbackClient")` |
| `checkInScheduleRules` | `CheckInScheduleRule[]` | relation | `@relation("CheckInScheduleRuleClient")` |
| `checkInAnswers` | `CheckInSubmissionAnswer[]` | relation | `@relation("CheckInAnswerClient")` |
| `onboardingSubmissionReviews` | `OnboardingSubmissionReview[]` | relation | `@relation("OnboardingReviewClient")` |
| `dashboardLayouts` | `ClientDashboardLayout[]` | relation | `@relation("ClientDashboardLayoutClient")` |
| `clientTasks` | `ClientTask[]` | relation | `@relation("ClientTaskClient")` |
| `habits` | `Habit[]` | relation | `@relation("HabitClient")` |
| `mealPlan` | `MealPlan?` | relation | `@relation("MealPlanClient")` |
| `mealPlanVersions` | `MealPlanVersion[]` | relation | `@relation("MealPlanVersionClient")` |
| `trainingPrograms` | `TrainingProgram[]` | relation | `@relation("TrainingProgramClient")` |
| `trainingProgramVersions` | `TrainingProgramVersion[]` | relation | `@relation("TrainingProgramVersionClient")` |
| `trainingBookings` | `TrainingSessionBooking[]` | relation | `@relation("TrainingBookingClient")` |

### ClientSetup

`db/schema.prisma:1000` - 8 fields, 3 relations. Constraints: `@@unique([workspaceId, clientProfileId])`, `@@unique([id, workspaceId])`, `@@unique([id, clientProfileId])`, `@@index([clientProfileId])`, `@@map("client_setup")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `clientProfileId` | `String` | scalar | `@map("client_profile_id")` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `clientProfile` | `ClientProfile` | relation | `@relation("ClientSetupClient", fields: [clientProfileId], references: [id], onDelete: Restrict)` |
| `pins` | `ClientSetupPin[]` | relation | - |

### ClientSetupPin

`db/schema.prisma:1022` - 27 fields, 10 relations. Constraints: `@@unique([clientSetupId, seq])`, `@@unique([id, clientSetupId])`, `@@unique([id, workspaceId, templateVersionId])`, `@@unique([id, clientProfileId])`, `@@index([workspaceId, id])`, `@@index([clientProfileId, status])`, `@@index([templateId, status])`, `@@index([templateVersionId])`, `@@map("client_setup_pin")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `clientSetupId` | `String` | scalar | `@map("client_setup_id")` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `clientProfileId` | `String` | scalar | `@map("client_profile_id")` |
| `seq` | `Int` | scalar | - |
| `templateId` | `String` | scalar | `@map("template_id")` |
| `templateVersionId` | `String` | scalar | `@map("template_version_id")` |
| `status` | `ClientSetupPinStatus` | enum | `@default(ACTIVE)` |
| `assignedByMemberId` | `String` | scalar | `@map("assigned_by_member_id")` |
| `assignedAt` | `DateTime` | scalar | `@default(now()) @map("assigned_at") @db.Timestamptz(6)` |
| `endedByMemberId` | `String?` | scalar | `@map("ended_by_member_id")` |
| `endedAt` | `DateTime?` | scalar | `@map("ended_at") @db.Timestamptz(6)` |
| `supersedesPinId` | `String?` | scalar | `@unique @map("supersedes_pin_id")` |
| `transitionKind` | `PinTransitionKind?` | enum | `@map("transition_kind")` |
| `transitionSummary` | `Json?` | scalar | `@map("transition_summary")` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `clientSetup` | `ClientSetup` | relation | `@relation(fields: [clientSetupId], references: [id], onDelete: Restrict)` |
| `supersedesPin` | `ClientSetupPin?` | relation | `@relation("PinSupersession", fields: [supersedesPinId], references: [id], onDelete: Restrict)` |
| `supersededByPin` | `ClientSetupPin?` | relation | `@relation("PinSupersession")` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `clientProfile` | `ClientProfile` | relation | `@relation("ClientSetupPinClient", fields: [clientProfileId], references: [id], onDelete: Restrict)` |
| `template` | `CoachingTemplate` | relation | `@relation("ClientSetupPinTemplate", fields: [templateId], references: [id], onDelete: Restrict)` |
| `templateVersion` | `CoachingTemplateVersion` | relation | `@relation("ClientSetupPinVersion", fields: [templateVersionId], references: [id], onDelete: Restrict)` |
| `assignedByMember` | `WorkspaceMember` | relation | `@relation("ClientSetupPinAssignedBy", fields: [assignedByMemberId], references: [id], onDelete: Restrict)` |
| `endedByMember` | `WorkspaceMember?` | relation | `@relation("ClientSetupPinEndedBy", fields: [endedByMemberId], references: [id], onDelete: Restrict)` |
| `dailyEntryRevisions` | `DailyEntryRevision[]` | relation | - |

### ClientTask

`db/schema.prisma:1643` - 20 fields, 5 relations. Constraints: `@@unique([id, workspaceId])`, `@@index([workspaceId, clientProfileId, dueDate])`, `@@index([workspaceId, clientProfileId, status])`, `@@map("client_task")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `clientProfileId` | `String` | scalar | `@map("client_profile_id")` |
| `title` | `String` | scalar | - |
| `dueDate` | `DateTime` | scalar | `@map("due_date") @db.Date` |
| `status` | `ClientTaskStatus` | enum | `@default(OPEN)` |
| `revision` | `Int` | scalar | `@default(1)` |
| `assignedByMemberId` | `String` | scalar | `@map("assigned_by_member_id")` |
| `assignedAt` | `DateTime` | scalar | `@default(now()) @map("assigned_at") @db.Timestamptz(6)` |
| `completedByUserId` | `String?` | scalar | `@map("completed_by_user_id")` |
| `completedAt` | `DateTime?` | scalar | `@map("completed_at") @db.Timestamptz(6)` |
| `cancelledByMemberId` | `String?` | scalar | `@map("cancelled_by_member_id")` |
| `cancelledAt` | `DateTime?` | scalar | `@map("cancelled_at") @db.Timestamptz(6)` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `clientProfile` | `ClientProfile` | relation | `@relation("ClientTaskClient", fields: [clientProfileId], references: [id], onDelete: Restrict)` |
| `assignedByMember` | `WorkspaceMember` | relation | `@relation("ClientTaskAssigner", fields: [assignedByMemberId], references: [id], onDelete: Restrict)` |
| `completedBy` | `User?` | relation | `@relation("ClientTaskCompleter", fields: [completedByUserId], references: [id], onDelete: SetNull)` |
| `cancelledByMember` | `WorkspaceMember?` | relation | `@relation("ClientTaskCanceller", fields: [cancelledByMemberId], references: [id], onDelete: Restrict)` |

### CoachProfile

`db/schema.prisma:364` - 6 fields, 1 relations. Constraints: `@@map("coach_profile")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceMemberId` | `String` | scalar | `@unique @map("workspace_member_id")` |
| `displayName` | `String` | scalar | `@map("display_name")` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at")` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at")` |
| `workspaceMember` | `WorkspaceMember` | relation | `@relation(fields: [workspaceMemberId], references: [id], onDelete: Cascade)` |

### CoachingTemplate

`db/schema.prisma:901` - 19 fields, 6 relations. Constraints: `@@unique([id, workspaceId])`, `@@index([workspaceId, status])`, `@@map("coaching_template")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `name` | `String` | scalar | - |
| `status` | `CoachingTemplateStatus` | enum | `@default(ACTIVE)` |
| `archivedAt` | `DateTime?` | scalar | `@map("archived_at") @db.Timestamptz(6)` |
| `archivedByMemberId` | `String?` | scalar | `@map("archived_by_member_id")` |
| `draft` | `Json?` | scalar | - |
| `draftRevision` | `Int` | scalar | `@default(1) @map("draft_revision")` |
| `draftSavedByMemberId` | `String?` | scalar | `@map("draft_saved_by_member_id")` |
| `draftUpdatedAt` | `DateTime?` | scalar | `@map("draft_updated_at") @db.Timestamptz(6)` |
| `createdByMemberId` | `String` | scalar | `@map("created_by_member_id")` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `createdByMember` | `WorkspaceMember` | relation | `@relation("CoachingTemplateCreator", fields: [createdByMemberId], references: [id], onDelete: Restrict)` |
| `archivedByMember` | `WorkspaceMember?` | relation | `@relation("CoachingTemplateArchiver", fields: [archivedByMemberId], references: [id], onDelete: Restrict)` |
| `versions` | `CoachingTemplateVersion[]` | relation | - |
| `versionReferences` | `CoachingTemplateVersionParameter[]` | relation | - |
| `clientSetupPins` | `ClientSetupPin[]` | relation | `@relation("ClientSetupPinTemplate")` |

### CoachingTemplateVersion

`db/schema.prisma:930` - 14 fields, 6 relations. Constraints: `@@unique([templateId, versionSeq])`, `@@unique([templateId, publishOriginRevision])`, `@@unique([id, workspaceId])`, `@@unique([id, templateId, workspaceId])`, `@@map("coaching_template_version")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `templateId` | `String` | scalar | `@map("template_id")` |
| `versionSeq` | `Int` | scalar | `@map("version_seq")` |
| `definition` | `Json` | scalar | - |
| `publishOriginRevision` | `Int` | scalar | `@map("publish_origin_revision")` |
| `publishedAt` | `DateTime` | scalar | `@default(now()) @map("published_at") @db.Timestamptz(6)` |
| `publishedByMemberId` | `String` | scalar | `@map("published_by_member_id")` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `template` | `CoachingTemplate` | relation | `@relation(fields: [templateId], references: [id], onDelete: Restrict)` |
| `publishedByMember` | `WorkspaceMember` | relation | `@relation("CoachingTemplateVersionPublisher", fields: [publishedByMemberId], references: [id], onDelete: Restrict)` |
| `parameters` | `CoachingTemplateVersionParameter[]` | relation | - |
| `clientSetupPins` | `ClientSetupPin[]` | relation | `@relation("ClientSetupPinVersion")` |
| `dailyEntryRevisions` | `DailyEntryRevision[]` | relation | - |

### CoachingTemplateVersionParameter

`db/schema.prisma:959` - 8 fields, 4 relations. Constraints: `@@id([versionId, parameterId])`, `@@index([parameterId])`, `@@map("coaching_template_version_parameter")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `templateId` | `String` | scalar | `@map("template_id")` |
| `versionId` | `String` | scalar | `@map("version_id")` |
| `parameterId` | `String` | scalar | `@map("parameter_id")` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `template` | `CoachingTemplate` | relation | `@relation(fields: [templateId], references: [id], onDelete: Restrict)` |
| `version` | `CoachingTemplateVersion` | relation | `@relation(fields: [versionId], references: [id], onDelete: Restrict)` |
| `parameter` | `ParameterDefinition` | relation | `@relation(fields: [parameterId], references: [id], onDelete: Restrict)` |

### ConsentRecord

`db/schema.prisma:442` - 10 fields, 2 relations. Constraints: `@@index([clientProfileId, kind, version, revokedAt])`, `@@map("consent_record")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `clientProfileId` | `String` | scalar | `@map("client_profile_id")` |
| `kind` | `ConsentKind` | enum | - |
| `version` | `String` | scalar | - |
| `grantedAt` | `DateTime` | scalar | `@default(now()) @map("granted_at") @db.Timestamptz(6)` |
| `revokedAt` | `DateTime?` | scalar | `@map("revoked_at") @db.Timestamptz(6)` |
| `grantedByUserId` | `String?` | scalar | `@map("granted_by_user_id")` |
| `source` | `ConsentSource` | enum | `@default(CLIENT_SELF)` |
| `clientProfile` | `ClientProfile` | relation | `@relation(fields: [clientProfileId], references: [id], onDelete: Restrict)` |
| `grantedBy` | `User?` | relation | `@relation(fields: [grantedByUserId], references: [id], onDelete: SetNull)` |

### DailyEntry

`db/schema.prisma:1084` - 12 fields, 4 relations. Constraints: `@@unique([workspaceId, clientProfileId, entryDate])`, `@@unique([id, workspaceId])`, `@@unique([id, clientProfileId])`, `@@unique([id, workspaceId, clientProfileId])`, `@@index([clientProfileId, entryDate])`, `@@map("daily_entry")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `clientProfileId` | `String` | scalar | `@map("client_profile_id")` |
| `entryDate` | `DateTime` | scalar | `@map("entry_date") @db.Date` |
| `currentRevisionId` | `String?` | scalar | `@map("current_revision_id")` |
| `createdByMemberId` | `String` | scalar | `@map("created_by_member_id")` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `clientProfile` | `ClientProfile` | relation | `@relation("ClientProfileDailyEntries", fields: [clientProfileId], references: [id], onDelete: Restrict)` |
| `createdByMember` | `WorkspaceMember` | relation | `@relation("DailyEntryCreator", fields: [createdByMemberId], references: [id], onDelete: Restrict)` |
| `revisions` | `DailyEntryRevision[]` | relation | - |

### DailyEntryRevision

`db/schema.prisma:1115` - 16 fields, 5 relations. Constraints: `@@unique([dailyEntryId, seq])`, `@@unique([id, dailyEntryId])`, `@@unique([id, workspaceId])`, `@@unique([id, clientProfileId])`, `@@index([clientSetupPinId])`, `@@index([clientProfileId])`, `@@index([dailyEntryId, declaredAt])`, `@@map("daily_entry_revision")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `dailyEntryId` | `String` | scalar | `@map("daily_entry_id")` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `clientProfileId` | `String` | scalar | `@map("client_profile_id")` |
| `clientSetupPinId` | `String` | scalar | `@map("client_setup_pin_id")` |
| `templateVersionId` | `String` | scalar | `@map("template_version_id")` |
| `seq` | `Int` | scalar | - |
| `canonicalHash` | `String` | scalar | `@map("canonical_hash")` |
| `declaredAt` | `DateTime` | scalar | `@map("declared_at") @db.Timestamptz(6)` |
| `createdByMemberId` | `String` | scalar | `@map("created_by_member_id")` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `entry` | `DailyEntry` | relation | `@relation(fields: [dailyEntryId], references: [id], onDelete: Restrict)` |
| `pin` | `ClientSetupPin` | relation | `@relation(fields: [clientSetupPinId], references: [id], onDelete: Restrict)` |
| `templateVersion` | `CoachingTemplateVersion` | relation | `@relation(fields: [templateVersionId], references: [id], onDelete: Restrict)` |
| `createdByMember` | `WorkspaceMember` | relation | `@relation("DailyEntryRevisionCreator", fields: [createdByMemberId], references: [id], onDelete: Restrict)` |
| `values` | `DailyEntryRevisionValue[]` | relation | - |

### DailyEntryRevisionValue

`db/schema.prisma:1152` - 10 fields, 2 relations. Constraints: `@@id([revisionId, parameterId])`, `@@index([parameterId])`, `@@map("daily_entry_revision_value")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `revisionId` | `String` | scalar | `@map("revision_id")` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `parameterId` | `String` | scalar | `@map("parameter_id")` |
| `kind` | `ParameterKind` | enum | - |
| `valueNumeric` | `Decimal?` | scalar | `@map("value_numeric") @db.Decimal(30, 8)` |
| `valueRating` | `Int?` | scalar | `@map("value_rating")` |
| `valueOptionId` | `String?` | scalar | `@map("value_option_id")` |
| `valueText` | `String?` | scalar | `@map("value_text")` |
| `revision` | `DailyEntryRevision` | relation | `@relation(fields: [revisionId], references: [id], onDelete: Restrict)` |
| `parameter` | `ParameterDefinition` | relation | `@relation(fields: [parameterId], references: [id], onDelete: Restrict)` |

### ExerciseCatalogItem

`db/schema.prisma:638` - 14 fields, 0 relations. Constraints: `@@index([muscleGroup])`, `@@index([equipment])`, `@@map("exercise_catalog_item")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `sourceId` | `Int` | scalar | `@unique @map("source_id")` |
| `rowFingerprint` | `String` | scalar | `@map("row_fingerprint")` |
| `name` | `String` | scalar | - |
| `muscleGroup` | `String?` | scalar | `@map("muscle_group")` |
| `primaryTarget` | `String?` | scalar | `@map("primary_target")` |
| `additionalTargets` | `String?` | scalar | `@map("additional_targets")` |
| `equipment` | `String?` | scalar | - |
| `movementPattern` | `String?` | scalar | `@map("movement_pattern")` |
| `positionSetup` | `String?` | scalar | `@map("position_setup")` |
| `cues` | `String?` | scalar | - |
| `videoLink` | `String?` | scalar | `@map("video_link")` |
| `firstImportedAt` | `DateTime` | scalar | `@default(now()) @map("first_imported_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |

### ExerciseImportRowOutcome

`db/schema.prisma:694` - 8 fields, 1 relations. Constraints: `@@unique([importRunId, sourceRow])`, `@@index([importRunId, outcome])`, `@@map("exercise_import_row_outcome")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `importRunId` | `String` | scalar | `@map("import_run_id")` |
| `sourceRow` | `Int` | scalar | `@map("source_row")` |
| `sourceId` | `Int?` | scalar | `@map("source_id")` |
| `outcome` | `ExerciseImportOutcome` | enum | - |
| `reasonCode` | `String?` | scalar | `@map("reason_code")` |
| `reasonField` | `String?` | scalar | `@map("reason_field")` |
| `importRun` | `ExerciseImportRun` | relation | `@relation(fields: [importRunId], references: [id], onDelete: Cascade)` |

### ExerciseImportRun

`db/schema.prisma:668` - 16 fields, 1 relations. Constraints: `@@index([sourceFingerprint])`, `@@map("exercise_import_run")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `sourceName` | `String` | scalar | `@map("source_name")` |
| `sourceFingerprint` | `String` | scalar | `@map("source_fingerprint")` |
| `scannedRowCount` | `Int` | scalar | `@map("scanned_row_count")` |
| `sourceRowCount` | `Int` | scalar | `@map("source_row_count")` |
| `ignoredEmptyRowCount` | `Int` | scalar | `@map("ignored_empty_row_count")` |
| `acceptedCount` | `Int` | scalar | `@map("accepted_count")` |
| `rejectedCount` | `Int` | scalar | `@map("rejected_count")` |
| `duplicateCount` | `Int` | scalar | `@map("duplicate_count")` |
| `insertedCount` | `Int` | scalar | `@map("inserted_count")` |
| `updatedCount` | `Int` | scalar | `@map("updated_count")` |
| `unchangedCount` | `Int` | scalar | `@map("unchanged_count")` |
| `status` | `String` | scalar | - |
| `startedAt` | `DateTime` | scalar | `@default(now()) @map("started_at") @db.Timestamptz(6)` |
| `completedAt` | `DateTime` | scalar | `@default(now()) @map("completed_at") @db.Timestamptz(6)` |
| `rowOutcomes` | `ExerciseImportRowOutcome[]` | relation | - |

### Habit

`db/schema.prisma:1686` - 13 fields, 4 relations. Constraints: `@@unique([id, workspaceId])`, `@@index([workspaceId, clientProfileId])`, `@@map("habits")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `clientProfileId` | `String` | scalar | `@map("client_profile_id")` |
| `name` | `String` | scalar | `@db.VarChar(120)` |
| `target` | `String` | scalar | `@db.VarChar(120)` |
| `revision` | `Int` | scalar | `@default(1)` |
| `archivedAt` | `DateTime?` | scalar | `@map("archived_at") @db.Timestamptz(6)` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `clientProfile` | `ClientProfile` | relation | `@relation("HabitClient", fields: [clientProfileId], references: [id], onDelete: Restrict)` |
| `schedules` | `HabitSchedule[]` | relation | - |
| `logs` | `HabitLog[]` | relation | - |

### HabitLog

`db/schema.prisma:1731` - 8 fields, 2 relations. Constraints: `@@unique([habitId, date])`, `@@map("habit_logs")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `habitId` | `String` | scalar | `@map("habit_id")` |
| `date` | `DateTime` | scalar | `@db.Date` |
| `status` | `HabitLogStatus` | enum | - |
| `loggedByUserId` | `String?` | scalar | `@map("logged_by_user_id")` |
| `loggedAt` | `DateTime` | scalar | `@default(now()) @map("logged_at") @db.Timestamptz(6)` |
| `habit` | `Habit` | relation | `@relation(fields: [habitId], references: [id], onDelete: Restrict)` |
| `loggedBy` | `User?` | relation | `@relation("HabitLogLogger", fields: [loggedByUserId], references: [id], onDelete: SetNull)` |

### HabitSchedule

`db/schema.prisma:1716` - 6 fields, 1 relations. Constraints: `@@unique([habitId, effectiveFrom])`, `@@map("habit_schedules")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `habitId` | `String` | scalar | `@map("habit_id")` |
| `effectiveFrom` | `DateTime` | scalar | `@map("effective_from") @db.Date` |
| `weekdays` | `Int` | scalar | `@db.SmallInt` |
| `endDate` | `DateTime?` | scalar | `@map("end_date") @db.Date` |
| `habit` | `Habit` | relation | `@relation(fields: [habitId], references: [id], onDelete: Restrict)` |

### MealPlan

`db/schema.prisma:1755` - 20 fields, 6 relations. Constraints: `@@unique([id, workspaceId])`, `@@unique([id, workspaceId, clientProfileId])`, `@@index([workspaceId])`, `@@map("meal_plan")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `clientProfileId` | `String` | scalar | `@unique @map("client_profile_id")` |
| `title` | `String` | scalar | - |
| `timezone` | `String?` | scalar | - |
| `timezoneSetByMemberId` | `String?` | scalar | `@map("timezone_set_by_member_id")` |
| `timezoneSetAt` | `DateTime?` | scalar | `@map("timezone_set_at") @db.Timestamptz(6)` |
| `draft` | `Json?` | scalar | - |
| `draftRevision` | `Int` | scalar | `@default(1) @map("draft_revision")` |
| `draftSavedByMemberId` | `String?` | scalar | `@map("draft_saved_by_member_id")` |
| `draftUpdatedAt` | `DateTime?` | scalar | `@map("draft_updated_at") @db.Timestamptz(6)` |
| `createdByMemberId` | `String` | scalar | `@map("created_by_member_id")` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `clientProfile` | `ClientProfile` | relation | `@relation("MealPlanClient", fields: [clientProfileId], references: [id], onDelete: Restrict)` |
| `createdByMember` | `WorkspaceMember` | relation | `@relation("MealPlanCreator", fields: [createdByMemberId], references: [id], onDelete: Restrict)` |
| `draftSavedByMember` | `WorkspaceMember?` | relation | `@relation("MealPlanDraftSaver", fields: [draftSavedByMemberId], references: [id], onDelete: Restrict)` |
| `timezoneSetByMember` | `WorkspaceMember?` | relation | `@relation("MealPlanTimezoneSetter", fields: [timezoneSetByMemberId], references: [id], onDelete: Restrict)` |
| `versions` | `MealPlanVersion[]` | relation | - |

### MealPlanVersion

`db/schema.prisma:1789` - 16 fields, 4 relations. Constraints: `@@unique([mealPlanId, versionSeq])`, `@@unique([mealPlanId, publishOriginRevision], map: "meal_plan_version_publish_origin_key")`, `@@unique([id, workspaceId, mealPlanId])`, `@@index([mealPlanId, effectiveDate, versionSeq])`, `@@index([mealPlanId, activationInstant])`, `@@map("meal_plan_version")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `mealPlanId` | `String` | scalar | `@map("meal_plan_id")` |
| `clientProfileId` | `String` | scalar | `@map("client_profile_id")` |
| `versionSeq` | `Int` | scalar | `@map("version_seq")` |
| `effectiveDate` | `DateTime` | scalar | `@map("effective_date") @db.Date` |
| `effectiveTimezone` | `String` | scalar | `@map("effective_timezone")` |
| `activationInstant` | `DateTime` | scalar | `@map("activation_instant") @db.Timestamptz(6)` |
| `payload` | `Json` | scalar | - |
| `publishOriginRevision` | `Int` | scalar | `@map("publish_origin_revision")` |
| `publishedAt` | `DateTime` | scalar | `@default(now()) @map("published_at") @db.Timestamptz(6)` |
| `publishedByMemberId` | `String` | scalar | `@map("published_by_member_id")` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `mealPlan` | `MealPlan` | relation | `@relation(fields: [mealPlanId], references: [id], onDelete: Restrict)` |
| `clientProfile` | `ClientProfile` | relation | `@relation("MealPlanVersionClient", fields: [clientProfileId], references: [id], onDelete: Restrict)` |
| `publishedByMember` | `WorkspaceMember` | relation | `@relation("MealPlanVersionPublisher", fields: [publishedByMemberId], references: [id], onDelete: Restrict)` |

### NutritionCatalogItem

`db/schema.prisma:560` - 14 fields, 0 relations. Constraints: `@@index([category])`, `@@map("nutrition_catalog_item")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `sourceNo` | `Int` | scalar | `@unique @map("source_no")` |
| `rowFingerprint` | `String` | scalar | `@map("row_fingerprint")` |
| `name` | `String` | scalar | - |
| `amount` | `Float?` | scalar | - |
| `unit` | `String?` | scalar | - |
| `calories` | `Float?` | scalar | - |
| `protein` | `Float?` | scalar | - |
| `carbs` | `Float?` | scalar | - |
| `fats` | `Float?` | scalar | - |
| `state` | `String?` | scalar | - |
| `category` | `String?` | scalar | - |
| `firstImportedAt` | `DateTime` | scalar | `@default(now()) @map("first_imported_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |

### NutritionImportRowOutcome

`db/schema.prisma:614` - 8 fields, 1 relations. Constraints: `@@unique([importRunId, sourceRow])`, `@@index([importRunId, outcome])`, `@@map("nutrition_import_row_outcome")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `importRunId` | `String` | scalar | `@map("import_run_id")` |
| `sourceRow` | `Int` | scalar | `@map("source_row")` |
| `sourceNo` | `Int?` | scalar | `@map("source_no")` |
| `outcome` | `NutritionImportOutcome` | enum | - |
| `reasonCode` | `String?` | scalar | `@map("reason_code")` |
| `reasonField` | `String?` | scalar | `@map("reason_field")` |
| `importRun` | `NutritionImportRun` | relation | `@relation(fields: [importRunId], references: [id], onDelete: Cascade)` |

### NutritionImportRun

`db/schema.prisma:588` - 16 fields, 1 relations. Constraints: `@@index([sourceFingerprint])`, `@@map("nutrition_import_run")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `sourceName` | `String` | scalar | `@map("source_name")` |
| `sourceFingerprint` | `String` | scalar | `@map("source_fingerprint")` |
| `scannedRowCount` | `Int` | scalar | `@map("scanned_row_count")` |
| `sourceRowCount` | `Int` | scalar | `@map("source_row_count")` |
| `ignoredEmptyRowCount` | `Int` | scalar | `@map("ignored_empty_row_count")` |
| `acceptedCount` | `Int` | scalar | `@map("accepted_count")` |
| `rejectedCount` | `Int` | scalar | `@map("rejected_count")` |
| `duplicateCount` | `Int` | scalar | `@map("duplicate_count")` |
| `insertedCount` | `Int` | scalar | `@map("inserted_count")` |
| `updatedCount` | `Int` | scalar | `@map("updated_count")` |
| `unchangedCount` | `Int` | scalar | `@map("unchanged_count")` |
| `status` | `String` | scalar | - |
| `startedAt` | `DateTime` | scalar | `@default(now()) @map("started_at") @db.Timestamptz(6)` |
| `completedAt` | `DateTime` | scalar | `@default(now()) @map("completed_at") @db.Timestamptz(6)` |
| `rowOutcomes` | `NutritionImportRowOutcome[]` | relation | - |

### OnboardingForm

`db/schema.prisma:719` - 19 fields, 6 relations. Constraints: `@@unique([id, workspaceId])`, `@@index([workspaceId, status])`, `@@map("onboarding_form")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `name` | `String` | scalar | - |
| `status` | `OnboardingFormStatus` | enum | `@default(ACTIVE)` |
| `archivedAt` | `DateTime?` | scalar | `@map("archived_at") @db.Timestamptz(6)` |
| `archivedByMemberId` | `String?` | scalar | `@map("archived_by_member_id")` |
| `draft` | `Json?` | scalar | - |
| `draftRevision` | `Int` | scalar | `@default(1) @map("draft_revision")` |
| `draftSavedByMemberId` | `String?` | scalar | `@map("draft_saved_by_member_id")` |
| `draftUpdatedAt` | `DateTime?` | scalar | `@map("draft_updated_at") @db.Timestamptz(6)` |
| `createdByMemberId` | `String` | scalar | `@map("created_by_member_id")` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `createdByMember` | `WorkspaceMember` | relation | `@relation("OnboardingFormCreator", fields: [createdByMemberId], references: [id], onDelete: Restrict)` |
| `archivedByMember` | `WorkspaceMember?` | relation | `@relation("OnboardingFormArchiver", fields: [archivedByMemberId], references: [id], onDelete: Restrict)` |
| `versions` | `OnboardingFormVersion[]` | relation | - |
| `assignments` | `OnboardingFormAssignment[]` | relation | `@relation("OnboardingAssignmentForm")` |
| `submissions` | `OnboardingSubmission[]` | relation | `@relation("OnboardingSubmissionForm")` |

### OnboardingFormAssignment

`db/schema.prisma:782` - 19 fields, 7 relations. Constraints: `@@unique([id, workspaceId, clientProfileId, formId, formVersionId])`, `@@index([workspaceId, id])`, `@@index([clientProfileId, status])`, `@@index([formId, status])`, `@@index([formVersionId])`, `@@map("onboarding_form_assignment")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `clientProfileId` | `String` | scalar | `@map("client_profile_id")` |
| `formId` | `String` | scalar | `@map("form_id")` |
| `formVersionId` | `String` | scalar | `@map("form_version_id")` |
| `status` | `OnboardingAssignmentStatus` | enum | `@default(ACTIVE)` |
| `assignedByMemberId` | `String` | scalar | `@map("assigned_by_member_id")` |
| `assignedAt` | `DateTime` | scalar | `@default(now()) @map("assigned_at") @db.Timestamptz(6)` |
| `endedByMemberId` | `String?` | scalar | `@map("ended_by_member_id")` |
| `endedAt` | `DateTime?` | scalar | `@map("ended_at") @db.Timestamptz(6)` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `clientProfile` | `ClientProfile` | relation | `@relation("OnboardingAssignmentClient", fields: [clientProfileId], references: [id], onDelete: Restrict)` |
| `form` | `OnboardingForm` | relation | `@relation("OnboardingAssignmentForm", fields: [formId], references: [id], onDelete: Restrict)` |
| `formVersion` | `OnboardingFormVersion` | relation | `@relation("OnboardingAssignmentVersion", fields: [formVersionId], references: [id], onDelete: Restrict)` |
| `assignedByMember` | `WorkspaceMember` | relation | `@relation("OnboardingAssignmentAssignedBy", fields: [assignedByMemberId], references: [id], onDelete: Restrict)` |
| `endedByMember` | `WorkspaceMember?` | relation | `@relation("OnboardingAssignmentEndedBy", fields: [endedByMemberId], references: [id], onDelete: Restrict)` |
| `submission` | `OnboardingSubmission?` | relation | - |

### OnboardingFormVersion

`db/schema.prisma:747` - 11 fields, 4 relations. Constraints: `@@unique([formId, versionSeq])`, `@@unique([id, formId])`, `@@index([formId, publishOriginRevision])`, `@@map("onboarding_form_version")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `formId` | `String` | scalar | `@map("form_id")` |
| `versionSeq` | `Int` | scalar | `@map("version_seq")` |
| `definition` | `Json` | scalar | - |
| `publishOriginRevision` | `Int` | scalar | `@map("publish_origin_revision")` |
| `publishedAt` | `DateTime` | scalar | `@default(now()) @map("published_at") @db.Timestamptz(6)` |
| `publishedByMemberId` | `String` | scalar | `@map("published_by_member_id")` |
| `form` | `OnboardingForm` | relation | `@relation(fields: [formId], references: [id], onDelete: Restrict)` |
| `publishedByMember` | `WorkspaceMember` | relation | `@relation("OnboardingFormVersionPublisher", fields: [publishedByMemberId], references: [id], onDelete: Restrict)` |
| `assignments` | `OnboardingFormAssignment[]` | relation | `@relation("OnboardingAssignmentVersion")` |
| `submissions` | `OnboardingSubmission[]` | relation | `@relation("OnboardingSubmissionVersion")` |

### OnboardingSubmission

`db/schema.prisma:1186` - 20 fields, 9 relations. Constraints: `@@unique([assignmentId])`, `@@unique([id, workspaceId])`, `@@unique([id, workspaceId, clientProfileId])`, `@@index([workspaceId, clientProfileId])`, `@@index([workspaceId, id])`, `@@map("onboarding_submission")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `clientProfileId` | `String` | scalar | `@map("client_profile_id")` |
| `formId` | `String` | scalar | `@map("form_id")` |
| `formVersionId` | `String` | scalar | `@map("form_version_id")` |
| `assignmentId` | `String` | scalar | `@map("assignment_id")` |
| `submittedByUserId` | `String` | scalar | `@map("submitted_by_user_id")` |
| `submittedByMemberId` | `String` | scalar | `@map("submitted_by_member_id")` |
| `submittedAt` | `DateTime` | scalar | `@default(now()) @map("submitted_at") @db.Timestamptz(6)` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `clientProfile` | `ClientProfile` | relation | `@relation("OnboardingSubmissionClient", fields: [clientProfileId], references: [id], onDelete: Restrict)` |
| `form` | `OnboardingForm` | relation | `@relation("OnboardingSubmissionForm", fields: [formId], references: [id], onDelete: Restrict)` |
| `formVersion` | `OnboardingFormVersion` | relation | `@relation("OnboardingSubmissionVersion", fields: [formVersionId], references: [id], onDelete: Restrict)` |
| `assignment` | `OnboardingFormAssignment` | relation | `@relation(fields: [assignmentId], references: [id], onDelete: Restrict)` |
| `submittedByUser` | `User` | relation | `@relation("OnboardingSubmissionSubmittedByUser", fields: [submittedByUserId], references: [id], onDelete: Restrict)` |
| `submittedByMember` | `WorkspaceMember` | relation | `@relation("OnboardingSubmissionSubmittedByMember", fields: [submittedByMemberId], references: [id], onDelete: Restrict)` |
| `answers` | `OnboardingSubmissionAnswer[]` | relation | - |
| `review` | `OnboardingSubmissionReview?` | relation | - |

### OnboardingSubmissionAnswer

`db/schema.prisma:1226` - 11 fields, 2 relations. Constraints: `@@unique([submissionId, fieldId])`, `@@index([workspaceId])`, `@@map("onboarding_submission_answer")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `submissionId` | `String` | scalar | `@map("submission_id")` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `fieldId` | `String` | scalar | `@map("field_id")` |
| `kind` | `OnboardingAnswerKind` | enum | - |
| `valueText` | `String?` | scalar | `@map("value_text")` |
| `valueNumeric` | `Decimal?` | scalar | `@map("value_numeric") @db.Decimal(23, 6)` |
| `valueDate` | `DateTime?` | scalar | `@map("value_date") @db.Date` |
| `valueOptionIds` | `Json?` | scalar | `@map("value_option_ids")` |
| `submission` | `OnboardingSubmission` | relation | `@relation(fields: [submissionId], references: [id], onDelete: Restrict)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |

### OnboardingSubmissionReview

`db/schema.prisma:1252` - 11 fields, 4 relations. Constraints: `@@unique([submissionId])`, `@@index([workspaceId, clientProfileId])`, `@@index([workspaceId, id])`, `@@map("onboarding_submission_review")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `clientProfileId` | `String` | scalar | `@map("client_profile_id")` |
| `submissionId` | `String` | scalar | `@map("submission_id")` |
| `reviewedByMemberId` | `String` | scalar | `@map("reviewed_by_member_id")` |
| `reviewedAt` | `DateTime` | scalar | `@default(now()) @map("reviewed_at") @db.Timestamptz(6)` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `clientProfile` | `ClientProfile` | relation | `@relation("OnboardingReviewClient", fields: [clientProfileId], references: [id], onDelete: Restrict)` |
| `submission` | `OnboardingSubmission` | relation | `@relation(fields: [submissionId], references: [id], onDelete: Restrict)` |
| `reviewedByMember` | `WorkspaceMember` | relation | `@relation("OnboardingReviewReviewer", fields: [reviewedByMemberId], references: [id], onDelete: Restrict)` |

### ParameterDefinition

`db/schema.prisma:856` - 27 fields, 6 relations. Constraints: `@@unique([workspaceId, key])`, `@@unique([id, workspaceId])`, `@@index([workspaceId, status])`, `@@map("parameter_definition")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `key` | `String` | scalar | - |
| `kind` | `ParameterKind` | enum | - |
| `label` | `String` | scalar | - |
| `helpText` | `String?` | scalar | `@map("help_text")` |
| `group` | `String?` | scalar | `@map("group_label")` |
| `unit` | `String?` | scalar | - |
| `ratingScheme` | `RatingScheme?` | enum | `@map("rating_scheme")` |
| `options` | `Json?` | scalar | - |
| `retiredOptionIds` | `Json?` | scalar | `@map("retired_option_ids")` |
| `validation` | `Json?` | scalar | - |
| `dataClassification` | `ParameterDataClassification?` | enum | `@map("data_classification")` |
| `revision` | `Int` | scalar | `@default(1)` |
| `status` | `ParameterStatus` | enum | `@default(ACTIVE)` |
| `createdByMemberId` | `String` | scalar | `@map("created_by_member_id")` |
| `updatedByMemberId` | `String` | scalar | `@map("updated_by_member_id")` |
| `archivedAt` | `DateTime?` | scalar | `@map("archived_at") @db.Timestamptz(6)` |
| `archivedByMemberId` | `String?` | scalar | `@map("archived_by_member_id")` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `createdByMember` | `WorkspaceMember` | relation | `@relation("ParameterDefinitionCreator", fields: [createdByMemberId], references: [id], onDelete: Restrict)` |
| `updatedByMember` | `WorkspaceMember` | relation | `@relation("ParameterDefinitionUpdater", fields: [updatedByMemberId], references: [id], onDelete: Restrict)` |
| `archivedByMember` | `WorkspaceMember?` | relation | `@relation("ParameterDefinitionArchiver", fields: [archivedByMemberId], references: [id], onDelete: Restrict)` |
| `versionReferences` | `CoachingTemplateVersionParameter[]` | relation | - |
| `dailyEntryValues` | `DailyEntryRevisionValue[]` | relation | - |

### RateLimit

`db/schema.prisma:234` - 4 fields, 0 relations. Constraints: `@@map("rate_limit")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `key` | `String` | scalar | `@unique` |
| `count` | `Int` | scalar | - |
| `lastRequest` | `BigInt` | scalar | `@map("last_request")` |

### Session

`db/schema.prisma:178` - 9 fields, 1 relations. Constraints: `@@index([userId])`, `@@map("sessions")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `userId` | `String` | scalar | `@map("user_id")` |
| `token` | `String` | scalar | `@unique` |
| `expiresAt` | `DateTime` | scalar | `@map("expires_at")` |
| `ipAddress` | `String?` | scalar | `@map("ip_address")` |
| `userAgent` | `String?` | scalar | `@map("user_agent")` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at")` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at")` |
| `user` | `User` | relation | `@relation(fields: [userId], references: [id], onDelete: Cascade)` |

### TrainingProgram

`db/schema.prisma:1833` - 31 fields, 8 relations. Constraints: `@@unique([id, workspaceId])`, `@@unique([id, workspaceId, clientProfileId])`, `@@index([workspaceId])`, `@@index([replacesProgramId])`, `@@map("training_program")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `clientProfileId` | `String` | scalar | `@map("client_profile_id")` |
| `title` | `String` | scalar | - |
| `startDate` | `DateTime` | scalar | `@map("start_date") @db.Date` |
| `weekCount` | `Int` | scalar | `@map("week_count")` |
| `programMode` | `String` | scalar | `@default("WEEK_BASED") @map("program_mode")` |
| `fieldConfig` | `Json` | scalar | `@map("field_config")` |
| `confirmedTimezone` | `String?` | scalar | `@map("confirmed_timezone")` |
| `timezoneSetByMemberId` | `String?` | scalar | `@map("timezone_set_by_member_id")` |
| `timezoneSetAt` | `DateTime?` | scalar | `@map("timezone_set_at") @db.Timestamptz(6)` |
| `draft` | `Json?` | scalar | - |
| `draftRevision` | `Int` | scalar | `@default(1) @map("draft_revision")` |
| `draftSavedByMemberId` | `String?` | scalar | `@map("draft_saved_by_member_id")` |
| `draftUpdatedAt` | `DateTime?` | scalar | `@map("draft_updated_at") @db.Timestamptz(6)` |
| `replacesProgramId` | `String?` | scalar | `@map("replaces_program_id")` |
| `firstPublishedAt` | `DateTime?` | scalar | `@map("first_published_at") @db.Timestamptz(6)` |
| `cancelledAt` | `DateTime?` | scalar | `@map("cancelled_at") @db.Timestamptz(6)` |
| `cancelledByMemberId` | `String?` | scalar | `@map("cancelled_by_member_id")` |
| `lockedWeekHighWater` | `Int` | scalar | `@default(0) @map("locked_week_high_water")` |
| `createdByMemberId` | `String` | scalar | `@map("created_by_member_id")` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `clientProfile` | `ClientProfile` | relation | `@relation("TrainingProgramClient", fields: [clientProfileId], references: [id], onDelete: Restrict)` |
| `createdByMember` | `WorkspaceMember` | relation | `@relation("TrainingProgramCreator", fields: [createdByMemberId], references: [id], onDelete: Restrict)` |
| `draftSavedByMember` | `WorkspaceMember?` | relation | `@relation("TrainingProgramDraftSaver", fields: [draftSavedByMemberId], references: [id], onDelete: Restrict)` |
| `timezoneSetByMember` | `WorkspaceMember?` | relation | `@relation("TrainingProgramTimezoneSetter", fields: [timezoneSetByMemberId], references: [id], onDelete: Restrict)` |
| `cancelledByMember` | `WorkspaceMember?` | relation | `@relation("TrainingProgramCanceller", fields: [cancelledByMemberId], references: [id], onDelete: Restrict)` |
| `versions` | `TrainingProgramVersion[]` | relation | - |
| `bookings` | `TrainingSessionBooking[]` | relation | - |

### TrainingProgramVersion

`db/schema.prisma:1891` - 18 fields, 5 relations. Constraints: `@@unique([programId, versionSeq])`, `@@unique([programId, publishOriginRevision], map: "training_program_version_publish_origin_key")`, `@@unique([id, workspaceId, programId])`, `@@index([programId, activationInstant])`, `@@map("training_program_version")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `programId` | `String` | scalar | `@map("program_id")` |
| `clientProfileId` | `String` | scalar | `@map("client_profile_id")` |
| `versionSeq` | `Int` | scalar | `@map("version_seq")` |
| `effectiveDate` | `DateTime` | scalar | `@map("effective_date") @db.Date` |
| `effectiveTimezone` | `String` | scalar | `@map("effective_timezone")` |
| `activationInstant` | `DateTime` | scalar | `@map("activation_instant") @db.Timestamptz(6)` |
| `payload` | `Json` | scalar | - |
| `fieldConfig` | `Json` | scalar | `@map("field_config")` |
| `publishOriginRevision` | `Int` | scalar | `@map("publish_origin_revision")` |
| `publishedAt` | `DateTime` | scalar | `@default(now()) @map("published_at") @db.Timestamptz(6)` |
| `publishedByMemberId` | `String` | scalar | `@map("published_by_member_id")` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `program` | `TrainingProgram` | relation | `@relation(fields: [programId], references: [id], onDelete: Restrict)` |
| `clientProfile` | `ClientProfile` | relation | `@relation("TrainingProgramVersionClient", fields: [clientProfileId], references: [id], onDelete: Restrict)` |
| `publishedByMember` | `WorkspaceMember` | relation | `@relation("TrainingProgramVersionPublisher", fields: [publishedByMemberId], references: [id], onDelete: Restrict)` |
| `bookings` | `TrainingSessionBooking[]` | relation | - |

### TrainingSessionBooking

`db/schema.prisma:1926` - 19 fields, 6 relations. Constraints: `@@index([programId, scheduledDate])`, `@@index([workspaceId, clientProfileId, scheduledDate], map: "training_session_booking_client_scope_date_idx")`, `@@map("training_session_booking")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `clientProfileId` | `String` | scalar | `@map("client_profile_id")` |
| `programId` | `String` | scalar | `@map("program_id")` |
| `pinnedVersionId` | `String` | scalar | `@map("pinned_version_id")` |
| `sessionId` | `String` | scalar | `@map("session_id")` |
| `bookedWeek` | `Int` | scalar | `@map("booked_week")` |
| `scheduledDate` | `DateTime` | scalar | `@map("scheduled_date") @db.Date` |
| `scheduledByMemberId` | `String` | scalar | `@map("scheduled_by_member_id")` |
| `cancelledAt` | `DateTime?` | scalar | `@map("cancelled_at") @db.Timestamptz(6)` |
| `cancelledByMemberId` | `String?` | scalar | `@map("cancelled_by_member_id")` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `clientProfile` | `ClientProfile` | relation | `@relation("TrainingBookingClient", fields: [clientProfileId], references: [id], onDelete: Restrict)` |
| `program` | `TrainingProgram` | relation | `@relation(fields: [programId], references: [id], onDelete: Restrict)` |
| `pinnedVersion` | `TrainingProgramVersion` | relation | `@relation(fields: [pinnedVersionId], references: [id], onDelete: Restrict)` |
| `scheduledByMember` | `WorkspaceMember` | relation | `@relation("TrainingBookingScheduler", fields: [scheduledByMemberId], references: [id], onDelete: Restrict)` |
| `cancelledByMember` | `WorkspaceMember?` | relation | `@relation("TrainingBookingCanceller", fields: [cancelledByMemberId], references: [id], onDelete: Restrict)` |

### User

`db/schema.prisma:124` - 24 fields, 13 relations. Constraints: `@@map("users")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `email` | `String` | scalar | `@unique` |
| `passwordHash` | `String` | scalar | `@default("") @map("password_hash")` |
| `name` | `String?` | scalar | - |
| `platformRole` | `PlatformRole` | enum | `@default(USER) @map("platform_role")` |
| `status` | `UserStatus` | enum | `@default(ACTIVE)` |
| `sessionVersion` | `Int` | scalar | `@default(0) @map("session_version")` |
| `emailVerified` | `Boolean` | scalar | `@default(false) @map("email_verified")` |
| `image` | `String?` | scalar | - |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at")` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at")` |
| `sessions` | `Session[]` | relation | - |
| `accounts` | `Account[]` | relation | - |
| `memberships` | `WorkspaceMember[]` | relation | - |
| `clientProfiles` | `ClientProfile[]` | relation | - |
| `consentsGranted` | `ConsentRecord[]` | relation | - |
| `auditEvents` | `AuditEvent[]` | relation | - |
| `subjectAuditedEvents` | `AuditEvent[]` | relation | `@relation("AuditSubjectUser")` |
| `accessTokens` | `AccessToken[]` | relation | `@relation("AccessTokenUser")` |
| `issuedAccessTokens` | `AccessToken[]` | relation | `@relation("AccessTokenCreator")` |
| `onboardingSubmissionsSubmitted` | `OnboardingSubmission[]` | relation | `@relation("OnboardingSubmissionSubmittedByUser")` |
| `checkInSubmissionsSubmitted` | `CheckInSubmission[]` | relation | `@relation("CheckInSubmissionSubmittedByUser")` |
| `completedClientTasks` | `ClientTask[]` | relation | `@relation("ClientTaskCompleter")` |
| `habitLogs` | `HabitLog[]` | relation | `@relation("HabitLogLogger")` |

### Verification

`db/schema.prisma:221` - 6 fields, 0 relations. Constraints: `@@unique([identifier])`, `@@map("verifications")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `identifier` | `String` | scalar | - |
| `value` | `String` | scalar | - |
| `expiresAt` | `DateTime` | scalar | `@map("expires_at")` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at")` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at")` |

### Workspace

`db/schema.prisma:243` - 38 fields, 32 relations. Constraints: `@@map("workspace")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `name` | `String` | scalar | - |
| `slug` | `String` | scalar | `@unique` |
| `status` | `WorkspaceStatus` | enum | `@default(ACTIVE)` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at")` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at")` |
| `members` | `WorkspaceMember[]` | relation | - |
| `clientProfiles` | `ClientProfile[]` | relation | - |
| `auditEvents` | `AuditEvent[]` | relation | - |
| `accessTokens` | `AccessToken[]` | relation | - |
| `onboardingForms` | `OnboardingForm[]` | relation | - |
| `onboardingFormAssignments` | `OnboardingFormAssignment[]` | relation | - |
| `parameterDefinitions` | `ParameterDefinition[]` | relation | - |
| `coachingTemplates` | `CoachingTemplate[]` | relation | - |
| `coachingTemplateVersions` | `CoachingTemplateVersion[]` | relation | - |
| `coachingTemplateVersionParams` | `CoachingTemplateVersionParameter[]` | relation | - |
| `clientSetups` | `ClientSetup[]` | relation | - |
| `clientSetupPins` | `ClientSetupPin[]` | relation | - |
| `dailyEntries` | `DailyEntry[]` | relation | - |
| `onboardingSubmissions` | `OnboardingSubmission[]` | relation | - |
| `onboardingSubmissionAnswers` | `OnboardingSubmissionAnswer[]` | relation | - |
| `checkInForms` | `CheckInForm[]` | relation | - |
| `checkInFormVersions` | `CheckInFormVersion[]` | relation | - |
| `checkInInstances` | `CheckInInstance[]` | relation | - |
| `checkInSubmissions` | `CheckInSubmission[]` | relation | - |
| `checkInSubmissionAnswers` | `CheckInSubmissionAnswer[]` | relation | - |
| `checkInReviews` | `CheckInReview[]` | relation | - |
| `checkInFeedback` | `CheckInFeedback[]` | relation | - |
| `checkInScheduleRules` | `CheckInScheduleRule[]` | relation | - |
| `onboardingSubmissionReviews` | `OnboardingSubmissionReview[]` | relation | - |
| `clientDashboardLayouts` | `ClientDashboardLayout[]` | relation | - |
| `clientTasks` | `ClientTask[]` | relation | - |
| `habits` | `Habit[]` | relation | - |
| `mealPlans` | `MealPlan[]` | relation | - |
| `mealPlanVersions` | `MealPlanVersion[]` | relation | - |
| `trainingPrograms` | `TrainingProgram[]` | relation | - |
| `trainingProgramVersions` | `TrainingProgramVersion[]` | relation | - |
| `trainingSessionBookings` | `TrainingSessionBooking[]` | relation | - |

### WorkspaceMember

`db/schema.prisma:287` - 54 fields, 46 relations. Constraints: `@@unique([workspaceId, userId])`, `@@unique([id, workspaceId])`, `@@index([workspaceId, status])`, `@@index([workspaceId, role])`, `@@index([userId])`, `@@map("workspace_member")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `userId` | `String` | scalar | `@map("user_id")` |
| `role` | `MemberRole` | enum | - |
| `status` | `MemberStatus` | enum | `@default(INVITED)` |
| `stateVersion` | `Int` | scalar | `@default(0) @map("state_version")` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at")` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at")` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `user` | `User` | relation | `@relation(fields: [userId], references: [id], onDelete: Restrict)` |
| `coachProfile` | `CoachProfile?` | relation | - |
| `assignments` | `ClientAssignment[]` | relation | `@relation("ClientAssignmentCoach")` |
| `onboardingFormsCreated` | `OnboardingForm[]` | relation | `@relation("OnboardingFormCreator")` |
| `onboardingFormsArchived` | `OnboardingForm[]` | relation | `@relation("OnboardingFormArchiver")` |
| `onboardingFormVersions` | `OnboardingFormVersion[]` | relation | `@relation("OnboardingFormVersionPublisher")` |
| `onboardingAssignmentsCreated` | `OnboardingFormAssignment[]` | relation | `@relation("OnboardingAssignmentAssignedBy")` |
| `onboardingAssignmentsEnded` | `OnboardingFormAssignment[]` | relation | `@relation("OnboardingAssignmentEndedBy")` |
| `clientSetupPinsAssigned` | `ClientSetupPin[]` | relation | `@relation("ClientSetupPinAssignedBy")` |
| `clientSetupPinsEnded` | `ClientSetupPin[]` | relation | `@relation("ClientSetupPinEndedBy")` |
| `dailyEntriesCreated` | `DailyEntry[]` | relation | `@relation("DailyEntryCreator")` |
| `dailyEntryRevisionsCreated` | `DailyEntryRevision[]` | relation | `@relation("DailyEntryRevisionCreator")` |
| `onboardingSubmissionsSubmitted` | `OnboardingSubmission[]` | relation | `@relation("OnboardingSubmissionSubmittedByMember")` |
| `checkInFormsCreated` | `CheckInForm[]` | relation | `@relation("CheckInFormCreator")` |
| `checkInFormsArchived` | `CheckInForm[]` | relation | `@relation("CheckInFormArchiver")` |
| `checkInFormVersions` | `CheckInFormVersion[]` | relation | `@relation("CheckInFormVersionPublisher")` |
| `checkInInstancesScheduled` | `CheckInInstance[]` | relation | `@relation("CheckInInstanceScheduler")` |
| `checkInInstancesCancelled` | `CheckInInstance[]` | relation | `@relation("CheckInInstanceCanceller")` |
| `checkInSubmissions` | `CheckInSubmission[]` | relation | `@relation("CheckInSubmissionSubmittedByMember")` |
| `checkInReviews` | `CheckInReview[]` | relation | `@relation("CheckInReviewReviewer")` |
| `checkInFeedbackAuthored` | `CheckInFeedback[]` | relation | `@relation("CheckInFeedbackAuthor")` |
| `checkInScheduleRulesCreated` | `CheckInScheduleRule[]` | relation | `@relation("CheckInScheduleRuleCreator")` |
| `checkInScheduleRulesPaused` | `CheckInScheduleRule[]` | relation | `@relation("CheckInScheduleRulePauser")` |
| `checkInScheduleRulesEnded` | `CheckInScheduleRule[]` | relation | `@relation("CheckInScheduleRuleEnder")` |
| `onboardingSubmissionReviewsReviewed` | `OnboardingSubmissionReview[]` | relation | `@relation("OnboardingReviewReviewer")` |
| `dashboardLayoutsEdited` | `ClientDashboardLayout[]` | relation | `@relation("DashboardLayoutEditor")` |
| `assignedClientTasks` | `ClientTask[]` | relation | `@relation("ClientTaskAssigner")` |
| `cancelledClientTasks` | `ClientTask[]` | relation | `@relation("ClientTaskCanceller")` |
| `parametersCreated` | `ParameterDefinition[]` | relation | `@relation("ParameterDefinitionCreator")` |
| `parametersUpdated` | `ParameterDefinition[]` | relation | `@relation("ParameterDefinitionUpdater")` |
| `parametersArchived` | `ParameterDefinition[]` | relation | `@relation("ParameterDefinitionArchiver")` |
| `coachingTemplatesCreated` | `CoachingTemplate[]` | relation | `@relation("CoachingTemplateCreator")` |
| `coachingTemplatesArchived` | `CoachingTemplate[]` | relation | `@relation("CoachingTemplateArchiver")` |
| `coachingTemplateVersions` | `CoachingTemplateVersion[]` | relation | `@relation("CoachingTemplateVersionPublisher")` |
| `mealPlansCreated` | `MealPlan[]` | relation | `@relation("MealPlanCreator")` |
| `mealPlanDraftsSaved` | `MealPlan[]` | relation | `@relation("MealPlanDraftSaver")` |
| `mealPlanTimezonesSet` | `MealPlan[]` | relation | `@relation("MealPlanTimezoneSetter")` |
| `mealPlanVersionsPublished` | `MealPlanVersion[]` | relation | `@relation("MealPlanVersionPublisher")` |
| `trainingProgramsCreated` | `TrainingProgram[]` | relation | `@relation("TrainingProgramCreator")` |
| `trainingProgramsDraftsSaved` | `TrainingProgram[]` | relation | `@relation("TrainingProgramDraftSaver")` |
| `trainingProgramsTimezonesSet` | `TrainingProgram[]` | relation | `@relation("TrainingProgramTimezoneSetter")` |
| `trainingProgramsCancelled` | `TrainingProgram[]` | relation | `@relation("TrainingProgramCanceller")` |
| `trainingProgramVersionsPublished` | `TrainingProgramVersion[]` | relation | `@relation("TrainingProgramVersionPublisher")` |
| `trainingBookingsScheduled` | `TrainingSessionBooking[]` | relation | `@relation("TrainingBookingScheduler")` |
| `trainingBookingsCancelled` | `TrainingSessionBooking[]` | relation | `@relation("TrainingBookingCanceller")` |
