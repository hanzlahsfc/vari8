# DATA-MODEL.md - Prisma data dictionary

Generated file. Do not edit by hand: changes are overwritten by `npm run index`.
Verify the committed copy is current with `npm run index:check` (exit 1 = drift).

Source: `db/schema.prisma`.
Counts: 78 models, 40 enums, 792 scalar fields, 472 relation fields.

`Kind` is derived from the field type: `scalar` (Prisma scalar), `enum` (schema enum), `relation`
(another model's name; a field carrying `@relation(fields: ...)` is the foreign-key side, one
without it is the back-relation). Migrations live in `db/migrations/`; never edit an applied one.

## Models

| Model | Fields | Relations | Source |
|---|---|---|---|
| [`AccessToken`](#accesstoken) | 16 | 3 | `db/schema.prisma:655` |
| [`Account`](#account) | 14 | 1 | `db/schema.prisma:234` |
| [`ActivityTarget`](#activitytarget) | 18 | 3 | `db/schema.prisma:2467` |
| [`AuditEvent`](#auditevent) | 19 | 4 | `db/schema.prisma:610` |
| [`CheckInAnswerMedia`](#checkinanswermedia) | 7 | 3 | `db/schema.prisma:2752` |
| [`CheckInFeedback`](#checkinfeedback) | 13 | 4 | `db/schema.prisma:1736` |
| [`CheckInForm`](#checkinform) | 20 | 7 | `db/schema.prisma:1509` |
| [`CheckInFormVersion`](#checkinformversion) | 13 | 5 | `db/schema.prisma:1541` |
| [`CheckInInstance`](#checkininstance) | 25 | 8 | `db/schema.prisma:1578` |
| [`CheckInReview`](#checkinreview) | 11 | 4 | `db/schema.prisma:1707` |
| [`CheckInScheduleRule`](#checkinschedulerule) | 27 | 9 | `db/schema.prisma:1787` |
| [`CheckInSubmission`](#checkinsubmission) | 21 | 11 | `db/schema.prisma:1634` |
| [`CheckInSubmissionAnswer`](#checkinsubmissionanswer) | 15 | 4 | `db/schema.prisma:1674` |
| [`ClientAssignment`](#clientassignment) | 11 | 2 | `db/schema.prisma:567` |
| [`ClientDashboardLayout`](#clientdashboardlayout) | 12 | 3 | `db/schema.prisma:1833` |
| [`ClientGoal`](#clientgoal) | 14 | 4 | `db/schema.prisma:2430` |
| [`ClientPlan`](#clientplan) | 17 | 3 | `db/schema.prisma:2550` |
| [`ClientProfile`](#clientprofile) | 52 | 40 | `db/schema.prisma:497` |
| [`ClientSetup`](#clientsetup) | 8 | 3 | `db/schema.prisma:1165` |
| [`ClientSetupPin`](#clientsetuppin) | 27 | 10 | `db/schema.prisma:1187` |
| [`ClientTask`](#clienttask) | 20 | 5 | `db/schema.prisma:1863` |
| [`CoachNote`](#coachnote) | 14 | 3 | `db/schema.prisma:2358` |
| [`CoachProfile`](#coachprofile) | 6 | 1 | `db/schema.prisma:485` |
| [`CoachTask`](#coachtask) | 16 | 4 | `db/schema.prisma:2382` |
| [`CoachingTemplate`](#coachingtemplate) | 22 | 6 | `db/schema.prisma:1060` |
| [`CoachingTemplateVersion`](#coachingtemplateversion) | 14 | 6 | `db/schema.prisma:1095` |
| [`CoachingTemplateVersionParameter`](#coachingtemplateversionparameter) | 8 | 4 | `db/schema.prisma:1124` |
| [`ConsentRecord`](#consentrecord) | 10 | 2 | `db/schema.prisma:590` |
| [`Conversation`](#conversation) | 10 | 4 | `db/schema.prisma:2642` |
| [`DailyEntry`](#dailyentry) | 13 | 5 | `db/schema.prisma:1249` |
| [`DailyEntryRevision`](#dailyentryrevision) | 16 | 5 | `db/schema.prisma:1281` |
| [`DailyEntryRevisionValue`](#dailyentryrevisionvalue) | 14 | 2 | `db/schema.prisma:1318` |
| [`ExerciseCatalogItem`](#exercisecatalogitem) | 15 | 1 | `db/schema.prisma:786` |
| [`ExerciseImportRowOutcome`](#exerciseimportrowoutcome) | 8 | 1 | `db/schema.prisma:845` |
| [`ExerciseImportRun`](#exerciseimportrun) | 16 | 1 | `db/schema.prisma:819` |
| [`ExerciseLibraryItem`](#exerciselibraryitem) | 17 | 4 | `db/schema.prisma:2522` |
| [`Habit`](#habit) | 14 | 4 | `db/schema.prisma:1906` |
| [`HabitLog`](#habitlog) | 8 | 2 | `db/schema.prisma:1954` |
| [`HabitSchedule`](#habitschedule) | 6 | 1 | `db/schema.prisma:1938` |
| [`IifymPlan`](#iifymplan) | 20 | 6 | `db/schema.prisma:2578` |
| [`IifymPlanVersion`](#iifymplanversion) | 16 | 4 | `db/schema.prisma:2607` |
| [`MealPlan`](#mealplan) | 20 | 6 | `db/schema.prisma:1979` |
| [`MealPlanVersion`](#mealplanversion) | 16 | 4 | `db/schema.prisma:2013` |
| [`MediaObject`](#mediaobject) | 18 | 8 | `db/schema.prisma:2303` |
| [`MemberPreference`](#memberpreference) | 9 | 2 | `db/schema.prisma:468` |
| [`Message`](#message) | 16 | 5 | `db/schema.prisma:2662` |
| [`MessageAttachment`](#messageattachment) | 7 | 3 | `db/schema.prisma:2688` |
| [`MessageDraft`](#messagedraft) | 13 | 4 | `db/schema.prisma:2702` |
| [`MessageDraftAttachment`](#messagedraftattachment) | 7 | 3 | `db/schema.prisma:2724` |
| [`MessageRead`](#messageread) | 5 | 2 | `db/schema.prisma:2738` |
| [`NutritionCatalogItem`](#nutritioncatalogitem) | 14 | 0 | `db/schema.prisma:708` |
| [`NutritionImportRowOutcome`](#nutritionimportrowoutcome) | 8 | 1 | `db/schema.prisma:762` |
| [`NutritionImportRun`](#nutritionimportrun) | 16 | 1 | `db/schema.prisma:736` |
| [`NutritionLog`](#nutritionlog) | 17 | 5 | `db/schema.prisma:1351` |
| [`OnboardingForm`](#onboardingform) | 19 | 6 | `db/schema.prisma:870` |
| [`OnboardingFormAssignment`](#onboardingformassignment) | 19 | 7 | `db/schema.prisma:933` |
| [`OnboardingFormVersion`](#onboardingformversion) | 11 | 4 | `db/schema.prisma:898` |
| [`OnboardingSubmission`](#onboardingsubmission) | 20 | 9 | `db/schema.prisma:1393` |
| [`OnboardingSubmissionAnswer`](#onboardingsubmissionanswer) | 11 | 2 | `db/schema.prisma:1433` |
| [`OnboardingSubmissionReview`](#onboardingsubmissionreview) | 11 | 4 | `db/schema.prisma:1459` |
| [`ParameterDefinition`](#parameterdefinition) | 29 | 8 | `db/schema.prisma:1012` |
| [`ProgressPhotoEntry`](#progressphotoentry) | 13 | 4 | `db/schema.prisma:2333` |
| [`RateLimit`](#ratelimit) | 4 | 0 | `db/schema.prisma:272` |
| [`SavedMeal`](#savedmeal) | 13 | 2 | `db/schema.prisma:2498` |
| [`Session`](#session) | 10 | 1 | `db/schema.prisma:193` |
| [`SpentRefreshToken`](#spentrefreshtoken) | 5 | 0 | `db/schema.prisma:221` |
| [`SupplementPlan`](#supplementplan) | 15 | 5 | `db/schema.prisma:2771` |
| [`SupplementPlanItem`](#supplementplanitem) | 23 | 3 | `db/schema.prisma:2802` |
| [`TrackerComment`](#trackercomment) | 13 | 4 | `db/schema.prisma:2407` |
| [`TrainingProgram`](#trainingprogram) | 32 | 9 | `db/schema.prisma:2057` |
| [`TrainingProgramVersion`](#trainingprogramversion) | 19 | 6 | `db/schema.prisma:2116` |
| [`TrainingSessionBooking`](#trainingsessionbooking) | 19 | 6 | `db/schema.prisma:2152` |
| [`TrainingSessionLog`](#trainingsessionlog) | 18 | 5 | `db/schema.prisma:2192` |
| [`TrainingSetLog`](#trainingsetlog) | 13 | 3 | `db/schema.prisma:2228` |
| [`User`](#user) | 28 | 17 | `db/schema.prisma:133` |
| [`Verification`](#verification) | 6 | 0 | `db/schema.prisma:259` |
| [`Workspace`](#workspace) | 74 | 57 | `db/schema.prisma:281` |
| [`WorkspaceMember`](#workspacemember) | 73 | 64 | `db/schema.prisma:365` |

## Enums

- `AccessTokenPurpose` (`db/schema.prisma:116`): WORKSPACE_INVITE, PASSWORD_RESET
- `ActivityTargetKind` (`db/schema.prisma:2452`): MINIMUM, MAXIMUM, RANGE, FIXED, CARDIO
- `AppearanceDensity` (`db/schema.prisma:2273`): COMFORTABLE, COMPACT
- `AppearanceFont` (`db/schema.prisma:2265`): SANS, SERIF, CONDENSED, MONO, ROUNDED
- `AppearanceMode` (`db/schema.prisma:2260`): LIGHT, DARK
- `AssignmentRole` (`db/schema.prisma:44`): PRIMARY, COACH
- `AssignmentStatus` (`db/schema.prisma:49`): ACTIVE, REMOVED
- `AuditAction` (`db/schema.prisma:91`): READ, CREATE, UPDATE, DELETE, EXPORT, GRANT, REVOKE, INVITE, ASSIGN, DENY, LOGIN, PASSWORD_RESET
- `AuditResult` (`db/schema.prisma:111`): ALLOW, DENY
- `AuditScope` (`db/schema.prisma:106`): WORKSPACE, ACCOUNT
- `CheckInAnswerKind` (`db/schema.prisma:1497`): SHORT_TEXT, LONG_TEXT, NUMBER, DATE, SINGLE_CHOICE, MULTI_CHOICE, RATING, VISUAL
- `CheckInFormStatus` (`db/schema.prisma:1489`): ACTIVE, ARCHIVED
- `CheckInScheduleRuleStatus` (`db/schema.prisma:1762`): ACTIVE, PAUSED, ENDED
- `CheckInWeekday` (`db/schema.prisma:1768`): MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY, SUNDAY
- `ClientSetupPinStatus` (`db/schema.prisma:1152`): ACTIVE, CANCELLED
- `ClientTaskStatus` (`db/schema.prisma:54`): OPEN, COMPLETED, CANCELLED
- `CoachNoteVisibility` (`db/schema.prisma:2279`): PRIVATE, GENERAL
- `CoachingTemplateStatus` (`db/schema.prisma:1007`): ACTIVE, ARCHIVED
- `ConsentKind` (`db/schema.prisma:77`): PRIVACY_NOTICE, HEALTH_DATA, CYCLE, PHOTOS, BLOODWORK, PED_HRT
- `ConsentSource` (`db/schema.prisma:86`): CLIENT_SELF, COACH_ATTESTED
- `ExerciseImportOutcome` (`db/schema.prisma:127`): IMPORTED, REJECTED, DUPLICATE
- `HabitLogStatus` (`db/schema.prisma:63`): DONE, SKIPPED
- `MediaKind` (`db/schema.prisma:2289`): IMAGE, VIDEO, AUDIO, DOCUMENT
- `MemberRole` (`db/schema.prisma:29`): WORKSPACE_OWNER, COACH, ASSISTANT_COACH, SUPPORT, CLIENT
- `MemberStatus` (`db/schema.prisma:37`): INVITED, ACTIVE, SUSPENDED, REMOVED
- `MessageSenderKind` (`db/schema.prisma:2284`): CLIENT, STAFF
- `NutritionImportOutcome` (`db/schema.prisma:121`): IMPORTED, REJECTED, DUPLICATE
- `OnboardingAnswerKind` (`db/schema.prisma:1384`): SHORT_TEXT, LONG_TEXT, NUMBER, DATE, SINGLE_CHOICE, MULTI_CHOICE
- `OnboardingAssignmentStatus` (`db/schema.prisma:926`): ACTIVE, SUPERSEDED, CANCELLED
- `OnboardingFormStatus` (`db/schema.prisma:865`): ACTIVE, ARCHIVED
- `ParameterDataClassification` (`db/schema.prisma:1000`): GENERAL_HEALTH, CYCLE, BLOODWORK, PED_HRT
- `ParameterKind` (`db/schema.prisma:975`): MEASUREMENT, RATING, TIME, DURATION, OPTION, TEXT, BLOOD_PRESSURE, LOCATION_RATING, CONTEXT, MULTI_CHOICE
- `ParameterStatus` (`db/schema.prisma:995`): ACTIVE, ARCHIVED
- `PinTransitionKind` (`db/schema.prisma:1160`): UPGRADE, ROLLBACK
- `PlanNutritionVariant` (`db/schema.prisma:2296`): TRAINING_DAY, REST_DAY
- `PlatformRole` (`db/schema.prisma:13`): USER, PLATFORM_ADMIN
- `RatingScheme` (`db/schema.prisma:989`): SCALE_1_10, SCALE_1_5, WORD_LABELS
- `SupplementItemStatus` (`db/schema.prisma:71`): MUST_HAVE, OPTIONAL, NONE
- `UserStatus` (`db/schema.prisma:18`): ACTIVE, DEACTIVATED, INVITED
- `WorkspaceStatus` (`db/schema.prisma:24`): ACTIVE, SUSPENDED

## Model detail

### AccessToken

`db/schema.prisma:655` - 16 fields, 3 relations. Constraints: `@@index([workspaceId, purpose, targetEmail, intendedRole], map: "access_token_invite_target_idx")`, `@@index([userId, purpose], map: "access_token_user_id_purpose_idx")`, `@@index([expiresAt], map: "access_token_expires_at_idx")`, `@@index([workspaceId, purpose, id], map: "access_token_ws_invite_list_idx")`, `@@map("access_token")`.

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

`db/schema.prisma:234` - 14 fields, 1 relations. Constraints: `@@unique([providerId, accountId])`, `@@index([userId])`, `@@map("accounts")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `userId` | `String` | scalar | `@map("user_id")` |
| `accountId` | `String` | scalar | `@map("account_id")` |
| `providerId` | `String` | scalar | `@map("provider_id")` |
| `accessToken` | `String?` | scalar | `@map("access_token")` |
| `refreshToken` | `String?` | scalar | `@map("refresh_token")` |
| `accessTokenExpiresAt` | `DateTime?` | scalar | `@map("access_token_expires_at") @db.Timestamptz(6)` |
| `refreshTokenExpiresAt` | `DateTime?` | scalar | `@map("refresh_token_expires_at") @db.Timestamptz(6)` |
| `scope` | `String?` | scalar | - |
| `idToken` | `String?` | scalar | `@map("id_token")` |
| `password` | `String?` | scalar | - |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `user` | `User` | relation | `@relation(fields: [userId], references: [id], onDelete: Cascade)` |

### ActivityTarget

`db/schema.prisma:2467` - 18 fields, 3 relations. Constraints: `@@unique([clientProfileId, metric, effectiveFrom], map: "activity_target_client_metric_day_key")`, `@@unique([id, workspaceId], map: "activity_target_id_workspace_id_key")`, `@@index([workspaceId, clientProfileId, metric, effectiveFrom], map: "activity_target_workspace_client_idx")`, `@@map("activity_target")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `clientProfileId` | `String` | scalar | `@map("client_profile_id")` |
| `metric` | `String` | scalar | - |
| `kind` | `ActivityTargetKind?` | enum | - |
| `stepMin` | `Int?` | scalar | `@map("step_min")` |
| `stepMax` | `Int?` | scalar | `@map("step_max")` |
| `sessionsPerWeek` | `Int?` | scalar | `@map("sessions_per_week")` |
| `minutesPerSession` | `Decimal?` | scalar | `@map("minutes_per_session") @db.Decimal(10, 2)` |
| `effectiveFrom` | `DateTime` | scalar | `@map("effective_from") @db.Date` |
| `stoppedAt` | `DateTime?` | scalar | `@map("stopped_at") @db.Timestamptz(6)` |
| `revision` | `Int` | scalar | `@default(1)` |
| `createdByMemberId` | `String` | scalar | `@map("created_by_member_id")` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `clientProfile` | `ClientProfile` | relation | `@relation("ActivityTargetClient", fields: [clientProfileId], references: [id], onDelete: Restrict)` |
| `createdByMember` | `WorkspaceMember` | relation | `@relation("ActivityTargetCreator", fields: [createdByMemberId], references: [id], onDelete: Restrict)` |

### AuditEvent

`db/schema.prisma:610` - 19 fields, 4 relations. Constraints: `@@index([workspaceId, at])`, `@@index([workspaceId, id])`, `@@index([subjectUserId, at])`, `@@index([subjectUserId, id], map: "audit_event_subject_user_id_id_idx")`, `@@map("audit_event")`.

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

### CheckInAnswerMedia

`db/schema.prisma:2752` - 7 fields, 3 relations. Constraints: `@@id([answerId, mediaObjectId])`, `@@map("checkin_answer_media")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `answerId` | `String` | scalar | `@map("answer_id")` |
| `mediaObjectId` | `String` | scalar | `@map("media_object_id")` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `position` | `Int` | scalar | `@default(0)` |
| `answer` | `CheckInSubmissionAnswer` | relation | `@relation(fields: [answerId], references: [id], onDelete: Restrict)` |
| `mediaObject` | `MediaObject` | relation | `@relation(fields: [mediaObjectId], references: [id], onDelete: Restrict)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |

### CheckInFeedback

`db/schema.prisma:1736` - 13 fields, 4 relations. Constraints: `@@unique([submissionId, clientRequestId])`, `@@index([submissionId, sentAt, id])`, `@@index([workspaceId, clientProfileId])`, `@@map("checkin_feedback")`.

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

`db/schema.prisma:1509` - 20 fields, 7 relations. Constraints: `@@unique([id, workspaceId])`, `@@index([workspaceId, status])`, `@@map("checkin_form")`.

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

`db/schema.prisma:1541` - 13 fields, 5 relations. Constraints: `@@unique([formId, versionSeq])`, `@@unique([id, workspaceId, formId])`, `@@unique([formId, publishOriginRevision], map: "checkin_form_version_publish_origin_key")`, `@@map("checkin_form_version")`.

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

`db/schema.prisma:1578` - 25 fields, 8 relations. Constraints: `@@unique([id, workspaceId, clientProfileId, formId, formVersionId], map: "checkin_instance_wide_coherence_key")`, `@@unique([workspaceId, clientProfileId, formId, dueAt], map: "checkin_instance_duplicate_schedule_key")`, `@@unique([originRuleId, occurrenceDate], map: "checkin_instance_occurrence_key")`, `@@index([workspaceId, clientProfileId, dueAt])`, `@@index([workspaceId, id])`, `@@index([formVersionId])`, `@@index([originRuleId])`, `@@map("checkin_instance")`.

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
| `coachNote` | `String?` | scalar | `@map("coach_note")` |
| `cancelRestoreUntil` | `DateTime?` | scalar | `@map("cancel_restore_until") @db.Timestamptz(6)` |
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

`db/schema.prisma:1707` - 11 fields, 4 relations. Constraints: `@@unique([submissionId])`, `@@index([workspaceId, clientProfileId])`, `@@map("checkin_review")`.

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

`db/schema.prisma:1787` - 27 fields, 9 relations. Constraints: `@@unique([id, workspaceId, clientProfileId], map: "checkin_schedule_rule_coherence_key")`, `@@index([workspaceId, clientProfileId, status])`, `@@map("checkin_schedule_rule")`.

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

`db/schema.prisma:1634` - 21 fields, 11 relations. Constraints: `@@unique([instanceId])`, `@@unique([id, workspaceId, clientProfileId], map: "checkin_submission_coherence_key")`, `@@index([workspaceId, clientProfileId])`, `@@index([workspaceId, id])`, `@@index([workspaceId, submittedAt, id])`, `@@map("checkin_submission")`.

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
| `progressPhotos` | `ProgressPhotoEntry[]` | relation | `@relation("ProgressPhotoEntrySubmission")` |

### CheckInSubmissionAnswer

`db/schema.prisma:1674` - 15 fields, 4 relations. Constraints: `@@unique([submissionId, fieldId])`, `@@unique([id, workspaceId])`, `@@index([workspaceId])`, `@@map("checkin_submission_answer")`.

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
| `valueRating` | `Int?` | scalar | `@map("value_rating")` |
| `submission` | `CheckInSubmission` | relation | `@relation(fields: [submissionId], references: [id], onDelete: Restrict)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `clientProfile` | `ClientProfile` | relation | `@relation("CheckInAnswerClient", fields: [clientProfileId], references: [id], onDelete: Restrict)` |
| `media` | `CheckInAnswerMedia[]` | relation | - |

### ClientAssignment

`db/schema.prisma:567` - 11 fields, 2 relations. Constraints: `@@unique([clientProfileId, coachMemberId])`, `@@index([workspaceId])`, `@@index([coachMemberId, status])`, `@@index([clientProfileId, status])`, `@@map("client_assignment")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `clientProfileId` | `String` | scalar | `@map("client_profile_id")` |
| `coachMemberId` | `String` | scalar | `@map("coach_member_id")` |
| `role` | `AssignmentRole` | enum | - |
| `status` | `AssignmentStatus` | enum | `@default(ACTIVE)` |
| `assignedAt` | `DateTime` | scalar | `@default(now()) @map("assigned_at") @db.Timestamptz(6)` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `clientProfile` | `ClientProfile` | relation | `@relation("ClientAssignmentClient", fields: [clientProfileId], references: [id], onDelete: Restrict)` |
| `coachMember` | `WorkspaceMember` | relation | `@relation("ClientAssignmentCoach", fields: [coachMemberId], references: [id], onDelete: Restrict)` |

### ClientDashboardLayout

`db/schema.prisma:1833` - 12 fields, 3 relations. Constraints: `@@unique([workspaceId, clientProfileId])`, `@@unique([id, workspaceId])`, `@@index([clientProfileId])`, `@@map("client_dashboard_layout")`.

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

### ClientGoal

`db/schema.prisma:2430` - 14 fields, 4 relations. Constraints: `@@unique([id, workspaceId])`, `@@index([clientProfileId, parameterId, targetDate])`, `@@map("client_goal")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `clientProfileId` | `String` | scalar | `@map("client_profile_id")` |
| `parameterId` | `String` | scalar | `@map("parameter_id")` |
| `targetValue` | `Decimal` | scalar | `@map("target_value") @db.Decimal(30, 8)` |
| `unit` | `String` | scalar | - |
| `targetDate` | `DateTime` | scalar | `@map("target_date") @db.Date` |
| `createdByMemberId` | `String` | scalar | `@map("created_by_member_id")` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `clientProfile` | `ClientProfile` | relation | `@relation("ClientGoalClient", fields: [clientProfileId], references: [id], onDelete: Restrict)` |
| `parameter` | `ParameterDefinition` | relation | `@relation("ClientGoalParameter", fields: [parameterId], references: [id], onDelete: Restrict)` |
| `createdByMember` | `WorkspaceMember` | relation | `@relation("ClientGoalCreator", fields: [createdByMemberId], references: [id], onDelete: Restrict)` |

### ClientPlan

`db/schema.prisma:2550` - 17 fields, 3 relations. Constraints: `@@unique([id, workspaceId])`, `@@map("client_plan")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `clientProfileId` | `String` | scalar | `@unique @map("client_profile_id")` |
| `calories` | `Int?` | scalar | - |
| `protein` | `Int?` | scalar | - |
| `sets` | `Int?` | scalar | - |
| `instructions` | `String` | scalar | `@default("")` |
| `nutritionVariant` | `PlanNutritionVariant?` | enum | `@map("nutrition_variant")` |
| `programMode` | `String` | scalar | `@default("WEEK_BASED") @map("program_mode")` |
| `weeks` | `Int` | scalar | `@default(1)` |
| `revision` | `Int` | scalar | `@default(1)` |
| `updatedByMemberId` | `String?` | scalar | `@map("updated_by_member_id")` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `clientProfile` | `ClientProfile` | relation | `@relation("ClientPlanClient", fields: [clientProfileId], references: [id], onDelete: Restrict)` |
| `updatedByMember` | `WorkspaceMember?` | relation | `@relation("ClientPlanUpdater", fields: [updatedByMemberId], references: [id], onDelete: Restrict)` |

### ClientProfile

`db/schema.prisma:497` - 52 fields, 40 relations. Constraints: `@@unique([workspaceId, userId])`, `@@unique([id, workspaceId])`, `@@index([workspaceId])`, `@@index([workspaceId, archivedAt])`, `@@map("client_profile")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `userId` | `String?` | scalar | `@map("user_id")` |
| `name` | `String` | scalar | - |
| `label` | `String?` | scalar | `@map("label")` |
| `coachingSince` | `DateTime?` | scalar | `@map("coaching_since") @db.Date` |
| `heightCm` | `Decimal?` | scalar | `@map("height_cm") @db.Decimal(5, 1)` |
| `archivedAt` | `DateTime?` | scalar | `@map("archived_at") @db.Timestamptz(6)` |
| `archiveReason` | `String?` | scalar | `@map("archive_reason")` |
| `priorityMessagesAllowed` | `Boolean` | scalar | `@default(false) @map("priority_messages_allowed")` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `user` | `User?` | relation | `@relation(fields: [userId], references: [id], onDelete: SetNull)` |
| `assignments` | `ClientAssignment[]` | relation | `@relation("ClientAssignmentClient")` |
| `consents` | `ConsentRecord[]` | relation | - |
| `auditSubjectEvents` | `AuditEvent[]` | relation | - |
| `onboardingAssignments` | `OnboardingFormAssignment[]` | relation | `@relation("OnboardingAssignmentClient")` |
| `clientSetups` | `ClientSetup[]` | relation | `@relation("ClientSetupClient")` |
| `clientSetupPins` | `ClientSetupPin[]` | relation | `@relation("ClientSetupPinClient")` |
| `dailyEntries` | `DailyEntry[]` | relation | `@relation("ClientProfileDailyEntries")` |
| `nutritionLogs` | `NutritionLog[]` | relation | `@relation("ClientProfileNutritionLogs")` |
| `onboardingSubmissions` | `OnboardingSubmission[]` | relation | `@relation("OnboardingSubmissionClient")` |
| `checkInInstances` | `CheckInInstance[]` | relation | `@relation("CheckInInstanceClient")` |
| `checkInSubmissions` | `CheckInSubmission[]` | relation | `@relation("CheckInSubmissionClient")` |
| `progressPhotos` | `ProgressPhotoEntry[]` | relation | `@relation("ProgressPhotoEntryClient")` |
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
| `supplementPlan` | `SupplementPlan?` | relation | `@relation("SupplementPlanClient")` |
| `supplementPlanItems` | `SupplementPlanItem[]` | relation | `@relation("SupplementPlanItemClient")` |
| `trainingPrograms` | `TrainingProgram[]` | relation | `@relation("TrainingProgramClient")` |
| `trainingProgramVersions` | `TrainingProgramVersion[]` | relation | `@relation("TrainingProgramVersionClient")` |
| `trainingBookings` | `TrainingSessionBooking[]` | relation | `@relation("TrainingBookingClient")` |
| `trainingSessionLogs` | `TrainingSessionLog[]` | relation | `@relation("TrainingSessionLogClient")` |
| `trainingSetLogs` | `TrainingSetLog[]` | relation | `@relation("TrainingSetLogClient")` |
| `coachNotes` | `CoachNote[]` | relation | `@relation("CoachNoteClient")` |
| `coachTasks` | `CoachTask[]` | relation | `@relation("CoachTaskClient")` |
| `trackerComments` | `TrackerComment[]` | relation | `@relation("TrackerCommentClient")` |
| `clientGoals` | `ClientGoal[]` | relation | `@relation("ClientGoalClient")` |
| `activityTargets` | `ActivityTarget[]` | relation | `@relation("ActivityTargetClient")` |
| `clientPlan` | `ClientPlan?` | relation | `@relation("ClientPlanClient")` |
| `iifymPlan` | `IifymPlan?` | relation | `@relation("IifymPlanClient")` |
| `iifymPlanVersions` | `IifymPlanVersion[]` | relation | `@relation("IifymPlanVersionClient")` |
| `conversations` | `Conversation[]` | relation | `@relation("ConversationClient")` |

### ClientSetup

`db/schema.prisma:1165` - 8 fields, 3 relations. Constraints: `@@unique([workspaceId, clientProfileId])`, `@@unique([id, workspaceId])`, `@@unique([id, clientProfileId])`, `@@index([clientProfileId])`, `@@map("client_setup")`.

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

`db/schema.prisma:1187` - 27 fields, 10 relations. Constraints: `@@unique([clientSetupId, seq])`, `@@unique([id, clientSetupId])`, `@@unique([id, workspaceId, templateVersionId])`, `@@unique([id, clientProfileId])`, `@@index([workspaceId, id])`, `@@index([clientProfileId, status])`, `@@index([templateId, status])`, `@@index([templateVersionId])`, `@@map("client_setup_pin")`.

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

`db/schema.prisma:1863` - 20 fields, 5 relations. Constraints: `@@unique([id, workspaceId])`, `@@index([workspaceId, clientProfileId, dueDate])`, `@@index([workspaceId, clientProfileId, status])`, `@@map("client_task")`.

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

### CoachNote

`db/schema.prisma:2358` - 14 fields, 3 relations. Constraints: `@@unique([id, workspaceId])`, `@@index([workspaceId, clientProfileId])`, `@@map("coach_note")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `clientProfileId` | `String?` | scalar | `@map("client_profile_id")` |
| `visibility` | `CoachNoteVisibility` | enum | `@default(PRIVATE)` |
| `body` | `String` | scalar | - |
| `authorMemberId` | `String` | scalar | `@map("author_member_id")` |
| `revision` | `Int` | scalar | `@default(1)` |
| `deletedAt` | `DateTime?` | scalar | `@map("deleted_at") @db.Timestamptz(6)` |
| `restoreUntil` | `DateTime?` | scalar | `@map("restore_until") @db.Timestamptz(6)` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `clientProfile` | `ClientProfile?` | relation | `@relation("CoachNoteClient", fields: [clientProfileId], references: [id], onDelete: Restrict)` |
| `authorMember` | `WorkspaceMember` | relation | `@relation("CoachNoteAuthor", fields: [authorMemberId], references: [id], onDelete: Restrict)` |

### CoachProfile

`db/schema.prisma:485` - 6 fields, 1 relations. Constraints: `@@map("coach_profile")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceMemberId` | `String` | scalar | `@unique @map("workspace_member_id")` |
| `displayName` | `String` | scalar | `@map("display_name")` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `workspaceMember` | `WorkspaceMember` | relation | `@relation(fields: [workspaceMemberId], references: [id], onDelete: Cascade)` |

### CoachTask

`db/schema.prisma:2382` - 16 fields, 4 relations. Constraints: `@@unique([id, workspaceId])`, `@@index([workspaceId, clientProfileId])`, `@@map("coach_task")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `clientProfileId` | `String?` | scalar | `@map("client_profile_id")` |
| `title` | `String` | scalar | `@db.VarChar(120)` |
| `completedAt` | `DateTime?` | scalar | `@map("completed_at") @db.Timestamptz(6)` |
| `completedByMemberId` | `String?` | scalar | `@map("completed_by_member_id")` |
| `createdByMemberId` | `String` | scalar | `@map("created_by_member_id")` |
| `revision` | `Int` | scalar | `@default(1)` |
| `deletedAt` | `DateTime?` | scalar | `@map("deleted_at") @db.Timestamptz(6)` |
| `restoreUntil` | `DateTime?` | scalar | `@map("restore_until") @db.Timestamptz(6)` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `clientProfile` | `ClientProfile?` | relation | `@relation("CoachTaskClient", fields: [clientProfileId], references: [id], onDelete: Restrict)` |
| `createdByMember` | `WorkspaceMember` | relation | `@relation("CoachTaskCreator", fields: [createdByMemberId], references: [id], onDelete: Restrict)` |
| `completedByMember` | `WorkspaceMember?` | relation | `@relation("CoachTaskCompleter", fields: [completedByMemberId], references: [id], onDelete: Restrict)` |

### CoachingTemplate

`db/schema.prisma:1060` - 22 fields, 6 relations. Constraints: `@@unique([id, workspaceId])`, `@@index([workspaceId, status])`, `@@map("coaching_template")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `name` | `String` | scalar | - |
| `description` | `String` | scalar | `@default("")` |
| `deletedAt` | `DateTime?` | scalar | `@map("deleted_at") @db.Timestamptz(6)` |
| `restoreUntil` | `DateTime?` | scalar | `@map("restore_until") @db.Timestamptz(6)` |
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

`db/schema.prisma:1095` - 14 fields, 6 relations. Constraints: `@@unique([templateId, versionSeq])`, `@@unique([templateId, publishOriginRevision])`, `@@unique([id, workspaceId])`, `@@unique([id, templateId, workspaceId])`, `@@map("coaching_template_version")`.

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

`db/schema.prisma:1124` - 8 fields, 4 relations. Constraints: `@@id([versionId, parameterId])`, `@@index([parameterId])`, `@@map("coaching_template_version_parameter")`.

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

`db/schema.prisma:590` - 10 fields, 2 relations. Constraints: `@@index([clientProfileId, kind, version, revokedAt])`, `@@map("consent_record")`.

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

### Conversation

`db/schema.prisma:2642` - 10 fields, 4 relations. Constraints: `@@unique([workspaceId, clientProfileId])`, `@@unique([id, workspaceId])`, `@@index([workspaceId, lastMessageAt])`, `@@map("conversation")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `clientProfileId` | `String` | scalar | `@map("client_profile_id")` |
| `lastMessageAt` | `DateTime?` | scalar | `@map("last_message_at") @db.Timestamptz(6)` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `clientProfile` | `ClientProfile` | relation | `@relation("ConversationClient", fields: [clientProfileId], references: [id], onDelete: Restrict)` |
| `messages` | `Message[]` | relation | - |
| `drafts` | `MessageDraft[]` | relation | - |

### DailyEntry

`db/schema.prisma:1249` - 13 fields, 5 relations. Constraints: `@@unique([workspaceId, clientProfileId, entryDate])`, `@@unique([id, workspaceId])`, `@@unique([id, clientProfileId])`, `@@unique([id, workspaceId, clientProfileId])`, `@@index([clientProfileId, entryDate])`, `@@map("daily_entry")`.

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
| `nutritionLog` | `NutritionLog?` | relation | - |

### DailyEntryRevision

`db/schema.prisma:1281` - 16 fields, 5 relations. Constraints: `@@unique([dailyEntryId, seq])`, `@@unique([id, dailyEntryId])`, `@@unique([id, workspaceId])`, `@@unique([id, clientProfileId])`, `@@index([clientSetupPinId])`, `@@index([clientProfileId])`, `@@index([dailyEntryId, declaredAt])`, `@@map("daily_entry_revision")`.

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

`db/schema.prisma:1318` - 14 fields, 2 relations. Constraints: `@@id([revisionId, parameterId])`, `@@index([parameterId])`, `@@map("daily_entry_revision_value")`.

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
| `valueMinutes` | `Int?` | scalar | `@map("value_minutes")` |
| `valueSystolic` | `Int?` | scalar | `@map("value_systolic") @db.SmallInt` |
| `valueDiastolic` | `Int?` | scalar | `@map("value_diastolic") @db.SmallInt` |
| `valueOptionIds` | `Json?` | scalar | `@map("value_option_ids")` |
| `revision` | `DailyEntryRevision` | relation | `@relation(fields: [revisionId], references: [id], onDelete: Restrict)` |
| `parameter` | `ParameterDefinition` | relation | `@relation(fields: [parameterId], references: [id], onDelete: Restrict)` |

### ExerciseCatalogItem

`db/schema.prisma:786` - 15 fields, 1 relations. Constraints: `@@index([muscleGroup])`, `@@index([equipment])`, `@@map("exercise_catalog_item")`.

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
| `libraryItems` | `ExerciseLibraryItem[]` | relation | `@relation("ExerciseLibraryCatalogItem")` |

### ExerciseImportRowOutcome

`db/schema.prisma:845` - 8 fields, 1 relations. Constraints: `@@unique([importRunId, sourceRow])`, `@@index([importRunId, outcome])`, `@@map("exercise_import_row_outcome")`.

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

`db/schema.prisma:819` - 16 fields, 1 relations. Constraints: `@@index([sourceFingerprint])`, `@@map("exercise_import_run")`.

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

### ExerciseLibraryItem

`db/schema.prisma:2522` - 17 fields, 4 relations. Constraints: `@@unique([id, workspaceId])`, `@@index([workspaceId, archivedAt])`, `@@map("exercise_library_item")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `name` | `String` | scalar | `@db.VarChar(120)` |
| `muscle` | `String` | scalar | - |
| `secondaryMuscles` | `String[]` | scalar | `@default([]) @map("secondary_muscles")` |
| `notes` | `String` | scalar | `@default("")` |
| `catalogItemId` | `String?` | scalar | `@map("catalog_item_id")` |
| `demoMediaId` | `String?` | scalar | `@map("demo_media_id")` |
| `createdByMemberId` | `String` | scalar | `@map("created_by_member_id")` |
| `revision` | `Int` | scalar | `@default(1)` |
| `archivedAt` | `DateTime?` | scalar | `@map("archived_at") @db.Timestamptz(6)` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `catalogItem` | `ExerciseCatalogItem?` | relation | `@relation("ExerciseLibraryCatalogItem", fields: [catalogItemId], references: [id], onDelete: SetNull)` |
| `demoMedia` | `MediaObject?` | relation | `@relation("ExerciseDemoMedia", fields: [demoMediaId], references: [id], onDelete: Restrict)` |
| `createdByMember` | `WorkspaceMember` | relation | `@relation("ExerciseLibraryItemCreator", fields: [createdByMemberId], references: [id], onDelete: Restrict)` |

### Habit

`db/schema.prisma:1906` - 14 fields, 4 relations. Constraints: `@@unique([id, workspaceId])`, `@@index([workspaceId, clientProfileId])`, `@@map("habits")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `clientProfileId` | `String` | scalar | `@map("client_profile_id")` |
| `name` | `String` | scalar | `@db.VarChar(120)` |
| `target` | `String` | scalar | `@db.VarChar(120)` |
| `reason` | `String` | scalar | `@default("")` |
| `revision` | `Int` | scalar | `@default(1)` |
| `archivedAt` | `DateTime?` | scalar | `@map("archived_at") @db.Timestamptz(6)` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `clientProfile` | `ClientProfile` | relation | `@relation("HabitClient", fields: [clientProfileId], references: [id], onDelete: Restrict)` |
| `schedules` | `HabitSchedule[]` | relation | - |
| `logs` | `HabitLog[]` | relation | - |

### HabitLog

`db/schema.prisma:1954` - 8 fields, 2 relations. Constraints: `@@unique([habitId, date])`, `@@map("habit_logs")`.

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

`db/schema.prisma:1938` - 6 fields, 1 relations. Constraints: `@@unique([habitId, effectiveFrom])`, `@@map("habit_schedules")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `habitId` | `String` | scalar | `@map("habit_id")` |
| `effectiveFrom` | `DateTime` | scalar | `@map("effective_from") @db.Date` |
| `weekdays` | `Int` | scalar | `@db.SmallInt` |
| `endDate` | `DateTime?` | scalar | `@map("end_date") @db.Date` |
| `habit` | `Habit` | relation | `@relation(fields: [habitId], references: [id], onDelete: Restrict)` |

### IifymPlan

`db/schema.prisma:2578` - 20 fields, 6 relations. Constraints: `@@unique([id, workspaceId])`, `@@unique([id, workspaceId, clientProfileId])`, `@@index([workspaceId])`, `@@map("iifym_plan")`.

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
| `clientProfile` | `ClientProfile` | relation | `@relation("IifymPlanClient", fields: [clientProfileId], references: [id], onDelete: Restrict)` |
| `createdByMember` | `WorkspaceMember` | relation | `@relation("IifymPlanCreator", fields: [createdByMemberId], references: [id], onDelete: Restrict)` |
| `draftSavedByMember` | `WorkspaceMember?` | relation | `@relation("IifymPlanDraftSaver", fields: [draftSavedByMemberId], references: [id], onDelete: Restrict)` |
| `timezoneSetByMember` | `WorkspaceMember?` | relation | `@relation("IifymPlanTimezoneSetter", fields: [timezoneSetByMemberId], references: [id], onDelete: Restrict)` |
| `versions` | `IifymPlanVersion[]` | relation | - |

### IifymPlanVersion

`db/schema.prisma:2607` - 16 fields, 4 relations. Constraints: `@@unique([iifymPlanId, versionSeq])`, `@@unique([iifymPlanId, publishOriginRevision], map: "iifym_plan_version_publish_origin_key")`, `@@unique([id, workspaceId, iifymPlanId])`, `@@index([iifymPlanId, effectiveDate, versionSeq])`, `@@index([iifymPlanId, activationInstant])`, `@@map("iifym_plan_version")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `iifymPlanId` | `String` | scalar | `@map("iifym_plan_id")` |
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
| `iifymPlan` | `IifymPlan` | relation | `@relation(fields: [iifymPlanId], references: [id], onDelete: Restrict)` |
| `clientProfile` | `ClientProfile` | relation | `@relation("IifymPlanVersionClient", fields: [clientProfileId], references: [id], onDelete: Restrict)` |
| `publishedByMember` | `WorkspaceMember` | relation | `@relation("IifymPlanVersionPublisher", fields: [publishedByMemberId], references: [id], onDelete: Restrict)` |

### MealPlan

`db/schema.prisma:1979` - 20 fields, 6 relations. Constraints: `@@unique([id, workspaceId])`, `@@unique([id, workspaceId, clientProfileId])`, `@@index([workspaceId])`, `@@map("meal_plan")`.

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

`db/schema.prisma:2013` - 16 fields, 4 relations. Constraints: `@@unique([mealPlanId, versionSeq])`, `@@unique([mealPlanId, publishOriginRevision], map: "meal_plan_version_publish_origin_key")`, `@@unique([id, workspaceId, mealPlanId])`, `@@index([mealPlanId, effectiveDate, versionSeq])`, `@@index([mealPlanId, activationInstant])`, `@@map("meal_plan_version")`.

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

### MediaObject

`db/schema.prisma:2303` - 18 fields, 8 relations. Constraints: `@@unique([id, workspaceId])`, `@@index([workspaceId, createdAt])`, `@@map("media_object")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `kind` | `MediaKind` | enum | - |
| `storageKey` | `String` | scalar | `@unique @map("storage_key")` |
| `fileName` | `String` | scalar | `@map("file_name")` |
| `contentType` | `String` | scalar | `@map("content_type")` |
| `byteSize` | `BigInt` | scalar | `@map("byte_size")` |
| `uploadedByUserId` | `String?` | scalar | `@map("uploaded_by_user_id")` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `deletedAt` | `DateTime?` | scalar | `@map("deleted_at") @db.Timestamptz(6)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `uploadedBy` | `User?` | relation | `@relation("MediaObjectUploader", fields: [uploadedByUserId], references: [id], onDelete: SetNull)` |
| `logoForWorkspaces` | `Workspace[]` | relation | `@relation("WorkspaceLogo")` |
| `exerciseDemos` | `ExerciseLibraryItem[]` | relation | `@relation("ExerciseDemoMedia")` |
| `messageAttachments` | `MessageAttachment[]` | relation | - |
| `messageDraftAttachments` | `MessageDraftAttachment[]` | relation | - |
| `checkinAnswerMedia` | `CheckInAnswerMedia[]` | relation | - |
| `progressPhoto` | `ProgressPhotoEntry?` | relation | - |

### MemberPreference

`db/schema.prisma:468` - 9 fields, 2 relations. Constraints: `@@unique([workspaceId, memberId, key])`, `@@index([memberId])`, `@@map("member_preference")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `memberId` | `String` | scalar | `@map("member_id")` |
| `key` | `String` | scalar | - |
| `enabled` | `Boolean` | scalar | `@default(true)` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `member` | `WorkspaceMember` | relation | `@relation(fields: [memberId], references: [id], onDelete: Cascade)` |

### Message

`db/schema.prisma:2662` - 16 fields, 5 relations. Constraints: `@@unique([conversationId, clientRequestId])`, `@@unique([id, workspaceId])`, `@@index([conversationId, sentAt, id])`, `@@map("message")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `conversationId` | `String` | scalar | `@map("conversation_id")` |
| `senderKind` | `MessageSenderKind` | enum | `@map("sender_kind")` |
| `senderUserId` | `String?` | scalar | `@map("sender_user_id")` |
| `body` | `String` | scalar | `@default("")` |
| `priority` | `Boolean` | scalar | `@default(false)` |
| `links` | `Json?` | scalar | - |
| `clientRequestId` | `String` | scalar | `@map("client_request_id")` |
| `sentAt` | `DateTime` | scalar | `@default(now()) @map("sent_at") @db.Timestamptz(6)` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `conversation` | `Conversation` | relation | `@relation(fields: [conversationId], references: [id], onDelete: Restrict)` |
| `sender` | `User?` | relation | `@relation("MessageSender", fields: [senderUserId], references: [id], onDelete: SetNull)` |
| `attachments` | `MessageAttachment[]` | relation | - |
| `reads` | `MessageRead[]` | relation | - |

### MessageAttachment

`db/schema.prisma:2688` - 7 fields, 3 relations. Constraints: `@@id([messageId, mediaObjectId])`, `@@map("message_attachment")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `messageId` | `String` | scalar | `@map("message_id")` |
| `mediaObjectId` | `String` | scalar | `@map("media_object_id")` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `position` | `Int` | scalar | `@default(0)` |
| `message` | `Message` | relation | `@relation(fields: [messageId], references: [id], onDelete: Restrict)` |
| `mediaObject` | `MediaObject` | relation | `@relation(fields: [mediaObjectId], references: [id], onDelete: Restrict)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |

### MessageDraft

`db/schema.prisma:2702` - 13 fields, 4 relations. Constraints: `@@unique([conversationId, authorUserId])`, `@@unique([id, workspaceId])`, `@@map("message_draft")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `conversationId` | `String` | scalar | `@map("conversation_id")` |
| `authorUserId` | `String` | scalar | `@map("author_user_id")` |
| `body` | `String` | scalar | `@default("")` |
| `links` | `Json?` | scalar | - |
| `revision` | `Int` | scalar | `@default(1)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `conversation` | `Conversation` | relation | `@relation(fields: [conversationId], references: [id], onDelete: Restrict)` |
| `author` | `User` | relation | `@relation("MessageDraftAuthor", fields: [authorUserId], references: [id], onDelete: Cascade)` |
| `attachments` | `MessageDraftAttachment[]` | relation | - |

### MessageDraftAttachment

`db/schema.prisma:2724` - 7 fields, 3 relations. Constraints: `@@id([draftId, mediaObjectId])`, `@@map("message_draft_attachment")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `draftId` | `String` | scalar | `@map("draft_id")` |
| `mediaObjectId` | `String` | scalar | `@map("media_object_id")` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `position` | `Int` | scalar | `@default(0)` |
| `draft` | `MessageDraft` | relation | `@relation(fields: [draftId], references: [id], onDelete: Cascade)` |
| `mediaObject` | `MediaObject` | relation | `@relation(fields: [mediaObjectId], references: [id], onDelete: Restrict)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |

### MessageRead

`db/schema.prisma:2738` - 5 fields, 2 relations. Constraints: `@@id([messageId, userId])`, `@@index([userId])`, `@@map("message_read")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `messageId` | `String` | scalar | `@map("message_id")` |
| `userId` | `String` | scalar | `@map("user_id")` |
| `readAt` | `DateTime` | scalar | `@map("read_at") @db.Timestamptz(6)` |
| `message` | `Message` | relation | `@relation(fields: [messageId], references: [id], onDelete: Cascade)` |
| `user` | `User` | relation | `@relation(fields: [userId], references: [id], onDelete: Cascade)` |

### NutritionCatalogItem

`db/schema.prisma:708` - 14 fields, 0 relations. Constraints: `@@index([category])`, `@@map("nutrition_catalog_item")`.

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

`db/schema.prisma:762` - 8 fields, 1 relations. Constraints: `@@unique([importRunId, sourceRow])`, `@@index([importRunId, outcome])`, `@@map("nutrition_import_row_outcome")`.

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

`db/schema.prisma:736` - 16 fields, 1 relations. Constraints: `@@index([sourceFingerprint])`, `@@map("nutrition_import_run")`.

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

### NutritionLog

`db/schema.prisma:1351` - 17 fields, 5 relations. Constraints: `@@unique([dailyEntryId])`, `@@unique([workspaceId, clientProfileId, entryDate])`, `@@unique([id, workspaceId])`, `@@index([clientProfileId, entryDate])`, `@@map("nutrition_log")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `dailyEntryId` | `String` | scalar | `@map("daily_entry_id")` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `clientProfileId` | `String` | scalar | `@map("client_profile_id")` |
| `entryDate` | `DateTime` | scalar | `@map("entry_date") @db.Date` |
| `protein` | `Decimal?` | scalar | `@db.Decimal(9, 3)` |
| `carbohydrate` | `Decimal?` | scalar | `@db.Decimal(9, 3)` |
| `fat` | `Decimal?` | scalar | `@db.Decimal(9, 3)` |
| `createdByMemberId` | `String` | scalar | `@map("created_by_member_id")` |
| `updatedByMemberId` | `String` | scalar | `@map("updated_by_member_id")` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `dailyEntry` | `DailyEntry` | relation | `@relation(fields: [dailyEntryId], references: [id], onDelete: Restrict)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `clientProfile` | `ClientProfile` | relation | `@relation("ClientProfileNutritionLogs", fields: [clientProfileId], references: [id], onDelete: Restrict)` |
| `createdByMember` | `WorkspaceMember` | relation | `@relation("NutritionLogCreator", fields: [createdByMemberId], references: [id], onDelete: Restrict)` |
| `updatedByMember` | `WorkspaceMember` | relation | `@relation("NutritionLogUpdater", fields: [updatedByMemberId], references: [id], onDelete: Restrict)` |

### OnboardingForm

`db/schema.prisma:870` - 19 fields, 6 relations. Constraints: `@@unique([id, workspaceId])`, `@@index([workspaceId, status])`, `@@map("onboarding_form")`.

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

`db/schema.prisma:933` - 19 fields, 7 relations. Constraints: `@@unique([id, workspaceId, clientProfileId, formId, formVersionId])`, `@@index([workspaceId, id])`, `@@index([clientProfileId, status])`, `@@index([formId, status])`, `@@index([formVersionId])`, `@@map("onboarding_form_assignment")`.

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

`db/schema.prisma:898` - 11 fields, 4 relations. Constraints: `@@unique([formId, versionSeq])`, `@@unique([id, formId])`, `@@index([formId, publishOriginRevision])`, `@@map("onboarding_form_version")`.

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

`db/schema.prisma:1393` - 20 fields, 9 relations. Constraints: `@@unique([assignmentId])`, `@@unique([id, workspaceId])`, `@@unique([id, workspaceId, clientProfileId])`, `@@index([workspaceId, clientProfileId])`, `@@index([workspaceId, id])`, `@@map("onboarding_submission")`.

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

`db/schema.prisma:1433` - 11 fields, 2 relations. Constraints: `@@unique([submissionId, fieldId])`, `@@index([workspaceId])`, `@@map("onboarding_submission_answer")`.

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

`db/schema.prisma:1459` - 11 fields, 4 relations. Constraints: `@@unique([submissionId])`, `@@index([workspaceId, clientProfileId])`, `@@index([workspaceId, id])`, `@@map("onboarding_submission_review")`.

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

`db/schema.prisma:1012` - 29 fields, 8 relations. Constraints: `@@unique([workspaceId, key])`, `@@unique([id, workspaceId])`, `@@index([workspaceId, status])`, `@@map("parameter_definition")`.

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
| `trackerComments` | `TrackerComment[]` | relation | `@relation("TrackerCommentParameter")` |
| `clientGoals` | `ClientGoal[]` | relation | `@relation("ClientGoalParameter")` |

### ProgressPhotoEntry

`db/schema.prisma:2333` - 13 fields, 4 relations. Constraints: `@@unique([id, workspaceId])`, `@@unique([id, workspaceId, clientProfileId])`, `@@index([clientProfileId, takenOn])`, `@@index([workspaceId, clientProfileId])`, `@@map("progress_photo_entry")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `clientProfileId` | `String` | scalar | `@map("client_profile_id")` |
| `mediaObjectId` | `String` | scalar | `@unique @map("media_object_id")` |
| `takenOn` | `DateTime` | scalar | `@map("taken_on") @db.Date` |
| `checkInSubmissionId` | `String?` | scalar | `@map("checkin_submission_id")` |
| `clientVisible` | `Boolean` | scalar | `@default(true) @map("client_visible")` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `deletedAt` | `DateTime?` | scalar | `@map("deleted_at") @db.Timestamptz(6)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `clientProfile` | `ClientProfile` | relation | `@relation("ProgressPhotoEntryClient", fields: [clientProfileId], references: [id], onDelete: Restrict)` |
| `mediaObject` | `MediaObject` | relation | `@relation(fields: [mediaObjectId], references: [id], onDelete: Restrict)` |
| `checkInSubmission` | `CheckInSubmission?` | relation | `@relation("ProgressPhotoEntrySubmission", fields: [checkInSubmissionId], references: [id], onDelete: Restrict)` |

### RateLimit

`db/schema.prisma:272` - 4 fields, 0 relations. Constraints: `@@map("rate_limit")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `key` | `String` | scalar | `@unique` |
| `count` | `Int` | scalar | - |
| `lastRequest` | `BigInt` | scalar | `@map("last_request")` |

### SavedMeal

`db/schema.prisma:2498` - 13 fields, 2 relations. Constraints: `@@unique([id, workspaceId])`, `@@index([workspaceId, sortOrder])`, `@@map("saved_meal")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `name` | `String` | scalar | `@db.VarChar(120)` |
| `meal` | `Json` | scalar | - |
| `sortOrder` | `Int` | scalar | `@default(0) @map("sort_order")` |
| `createdByMemberId` | `String` | scalar | `@map("created_by_member_id")` |
| `revision` | `Int` | scalar | `@default(1)` |
| `deletedAt` | `DateTime?` | scalar | `@map("deleted_at") @db.Timestamptz(6)` |
| `restoreUntil` | `DateTime?` | scalar | `@map("restore_until") @db.Timestamptz(6)` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `createdByMember` | `WorkspaceMember` | relation | `@relation("SavedMealCreator", fields: [createdByMemberId], references: [id], onDelete: Restrict)` |

### Session

`db/schema.prisma:193` - 10 fields, 1 relations. Constraints: `@@index([userId])`, `@@index([familyId])`, `@@map("sessions")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `userId` | `String` | scalar | `@map("user_id")` |
| `token` | `String` | scalar | `@unique` |
| `expiresAt` | `DateTime` | scalar | `@map("expires_at") @db.Timestamptz(6)` |
| `ipAddress` | `String?` | scalar | `@map("ip_address")` |
| `userAgent` | `String?` | scalar | `@map("user_agent")` |
| `familyId` | `String?` | scalar | `@map("family_id")` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `user` | `User` | relation | `@relation(fields: [userId], references: [id], onDelete: Cascade)` |

### SpentRefreshToken

`db/schema.prisma:221` - 5 fields, 0 relations. Constraints: `@@index([familyId])`, `@@map("spent_refresh_tokens")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `tokenHash` | `String` | scalar | `@unique @map("token_hash")` |
| `familyId` | `String` | scalar | `@map("family_id")` |
| `expiresAt` | `DateTime` | scalar | `@map("expires_at") @db.Timestamptz(6)` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |

### SupplementPlan

`db/schema.prisma:2771` - 15 fields, 5 relations. Constraints: `@@unique([id, workspaceId])`, `@@unique([id, workspaceId, clientProfileId])`, `@@index([workspaceId])`, `@@map("supplement_plan")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `clientProfileId` | `String` | scalar | `@unique @map("client_profile_id")` |
| `name` | `String` | scalar | - |
| `revision` | `Int` | scalar | `@default(1)` |
| `savedByMemberId` | `String?` | scalar | `@map("saved_by_member_id")` |
| `savedAt` | `DateTime?` | scalar | `@map("saved_at") @db.Timestamptz(6)` |
| `createdByMemberId` | `String` | scalar | `@map("created_by_member_id")` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `clientProfile` | `ClientProfile` | relation | `@relation("SupplementPlanClient", fields: [clientProfileId], references: [id], onDelete: Restrict)` |
| `savedByMember` | `WorkspaceMember?` | relation | `@relation("SupplementPlanSaver", fields: [savedByMemberId], references: [id], onDelete: Restrict)` |
| `createdByMember` | `WorkspaceMember` | relation | `@relation("SupplementPlanCreator", fields: [createdByMemberId], references: [id], onDelete: Restrict)` |
| `items` | `SupplementPlanItem[]` | relation | - |

### SupplementPlanItem

`db/schema.prisma:2802` - 23 fields, 3 relations. Constraints: `@@unique([planId, position])`, `@@unique([id, workspaceId])`, `@@index([planId])`, `@@index([workspaceId])`, `@@map("supplement_plan_item")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `planId` | `String` | scalar | `@map("plan_id")` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `clientProfileId` | `String` | scalar | `@map("client_profile_id")` |
| `position` | `Int` | scalar | - |
| `itemRefId` | `String?` | scalar | `@map("item_ref_id")` |
| `productRefId` | `String` | scalar | `@map("product_ref_id")` |
| `brand` | `String` | scalar | - |
| `productName` | `String` | scalar | `@map("product_name")` |
| `referenceQuantity` | `Decimal?` | scalar | `@map("reference_quantity") @db.Decimal(14, 4)` |
| `quantityUnit` | `String?` | scalar | `@map("quantity_unit")` |
| `declaredAmount` | `Decimal?` | scalar | `@map("declared_amount") @db.Decimal(14, 4)` |
| `declaredUnit` | `String?` | scalar | `@map("declared_unit")` |
| `productUrl` | `String?` | scalar | `@map("product_url")` |
| `quantity` | `Decimal` | scalar | `@db.Decimal(14, 4)` |
| `doseUnit` | `String` | scalar | `@map("dose_unit")` |
| `timing` | `String` | scalar | - |
| `status` | `SupplementItemStatus` | enum | - |
| `notes` | `String` | scalar | - |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `plan` | `SupplementPlan` | relation | `@relation(fields: [planId], references: [id], onDelete: Cascade)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `clientProfile` | `ClientProfile` | relation | `@relation("SupplementPlanItemClient", fields: [clientProfileId], references: [id], onDelete: Restrict)` |

### TrackerComment

`db/schema.prisma:2407` - 13 fields, 4 relations. Constraints: `@@unique([clientProfileId, entryDate, parameterId])`, `@@unique([id, workspaceId])`, `@@map("tracker_comment")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `clientProfileId` | `String` | scalar | `@map("client_profile_id")` |
| `entryDate` | `DateTime` | scalar | `@map("entry_date") @db.Date` |
| `parameterId` | `String` | scalar | `@map("parameter_id")` |
| `body` | `String` | scalar | - |
| `authorMemberId` | `String` | scalar | `@map("author_member_id")` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `clientProfile` | `ClientProfile` | relation | `@relation("TrackerCommentClient", fields: [clientProfileId], references: [id], onDelete: Restrict)` |
| `parameter` | `ParameterDefinition` | relation | `@relation("TrackerCommentParameter", fields: [parameterId], references: [id], onDelete: Restrict)` |
| `authorMember` | `WorkspaceMember` | relation | `@relation("TrackerCommentAuthor", fields: [authorMemberId], references: [id], onDelete: Restrict)` |

### TrainingProgram

`db/schema.prisma:2057` - 32 fields, 9 relations. Constraints: `@@unique([id, workspaceId])`, `@@unique([id, workspaceId, clientProfileId])`, `@@index([workspaceId])`, `@@index([replacesProgramId])`, `@@map("training_program")`.

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
| `sessionLogs` | `TrainingSessionLog[]` | relation | - |

### TrainingProgramVersion

`db/schema.prisma:2116` - 19 fields, 6 relations. Constraints: `@@unique([programId, versionSeq])`, `@@unique([programId, publishOriginRevision], map: "training_program_version_publish_origin_key")`, `@@unique([id, workspaceId, programId])`, `@@index([programId, activationInstant])`, `@@map("training_program_version")`.

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
| `sessionLogs` | `TrainingSessionLog[]` | relation | - |

### TrainingSessionBooking

`db/schema.prisma:2152` - 19 fields, 6 relations. Constraints: `@@index([programId, scheduledDate])`, `@@index([workspaceId, clientProfileId, scheduledDate], map: "training_session_booking_client_scope_date_idx")`, `@@map("training_session_booking")`.

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

### TrainingSessionLog

`db/schema.prisma:2192` - 18 fields, 5 relations. Constraints: `@@unique([workspaceId, clientProfileId, programId, sessionId, bookedWeek, performedDate], map: "training_session_log_natural_key")`, `@@unique([id, workspaceId, clientProfileId])`, `@@index([workspaceId, clientProfileId, performedDate], map: "training_session_log_client_date_idx")`, `@@map("training_session_log")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `clientProfileId` | `String` | scalar | `@map("client_profile_id")` |
| `programId` | `String` | scalar | `@map("program_id")` |
| `pinnedVersionId` | `String` | scalar | `@map("pinned_version_id")` |
| `sessionId` | `String` | scalar | `@map("session_id")` |
| `bookedWeek` | `Int` | scalar | `@map("booked_week")` |
| `performedDate` | `DateTime` | scalar | `@map("performed_date") @db.Date` |
| `status` | `String` | scalar | `@default("IN_PROGRESS")` |
| `startedAt` | `DateTime` | scalar | `@default(now()) @map("started_at") @db.Timestamptz(6)` |
| `completedAt` | `DateTime?` | scalar | `@map("completed_at") @db.Timestamptz(6)` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `clientProfile` | `ClientProfile` | relation | `@relation("TrainingSessionLogClient", fields: [clientProfileId], references: [id], onDelete: Restrict)` |
| `program` | `TrainingProgram` | relation | `@relation(fields: [programId], references: [id], onDelete: Restrict)` |
| `pinnedVersion` | `TrainingProgramVersion` | relation | `@relation(fields: [pinnedVersionId], references: [id], onDelete: Restrict)` |
| `sets` | `TrainingSetLog[]` | relation | - |

### TrainingSetLog

`db/schema.prisma:2228` - 13 fields, 3 relations. Constraints: `@@unique([sessionLogId, exerciseId, setKey], map: "training_set_log_set_key")`, `@@index([workspaceId, clientProfileId], map: "training_set_log_client_idx")`, `@@map("training_set_log")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `sessionLogId` | `String` | scalar | `@map("session_log_id")` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `clientProfileId` | `String` | scalar | `@map("client_profile_id")` |
| `exerciseId` | `String` | scalar | `@map("exercise_id")` |
| `setKey` | `String` | scalar | `@map("set_key")` |
| `position` | `Int` | scalar | - |
| `actuals` | `Json` | scalar | - |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `sessionLog` | `TrainingSessionLog` | relation | `@relation(fields: [sessionLogId], references: [id], onDelete: Restrict)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `clientProfile` | `ClientProfile` | relation | `@relation("TrainingSetLogClient", fields: [clientProfileId], references: [id], onDelete: Restrict)` |

### User

`db/schema.prisma:133` - 28 fields, 17 relations. Constraints: `@@map("users")`.

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
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
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
| `mediaObjectsUploaded` | `MediaObject[]` | relation | `@relation("MediaObjectUploader")` |
| `messagesSent` | `Message[]` | relation | `@relation("MessageSender")` |
| `messageDrafts` | `MessageDraft[]` | relation | `@relation("MessageDraftAuthor")` |
| `messageReads` | `MessageRead[]` | relation | - |

### Verification

`db/schema.prisma:259` - 6 fields, 0 relations. Constraints: `@@unique([identifier])`, `@@map("verifications")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `identifier` | `String` | scalar | - |
| `value` | `String` | scalar | - |
| `expiresAt` | `DateTime` | scalar | `@map("expires_at") @db.Timestamptz(6)` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |

### Workspace

`db/schema.prisma:281` - 74 fields, 57 relations. Constraints: `@@map("workspace")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `name` | `String` | scalar | - |
| `slug` | `String` | scalar | `@unique` |
| `status` | `WorkspaceStatus` | enum | `@default(ACTIVE)` |
| `retentionDays` | `Int` | scalar | `@default(90) @map("retention_days")` |
| `appearanceMode` | `AppearanceMode` | enum | `@default(DARK) @map("appearance_mode")` |
| `appearanceAccent` | `String` | scalar | `@default("#EB91B8") @map("appearance_accent") @db.VarChar(7)` |
| `appearanceFont` | `AppearanceFont` | enum | `@default(SANS) @map("appearance_font")` |
| `appearanceDensity` | `AppearanceDensity` | enum | `@default(COMFORTABLE) @map("appearance_density")` |
| `logoMediaId` | `String?` | scalar | `@map("logo_media_id")` |
| `availabilityText` | `String` | scalar | `@default("") @map("availability_text")` |
| `notificationsEnabled` | `Boolean` | scalar | `@default(true) @map("notifications_enabled")` |
| `priorityNotificationsEnabled` | `Boolean` | scalar | `@default(true) @map("priority_notifications_enabled")` |
| `studioDashboardDraft` | `Json?` | scalar | `@map("studio_dashboard_draft")` |
| `studioDashboardDraftRevision` | `Int` | scalar | `@default(1) @map("studio_dashboard_draft_revision")` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `logoMedia` | `MediaObject?` | relation | `@relation("WorkspaceLogo", fields: [logoMediaId], references: [id], onDelete: Restrict)` |
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
| `nutritionLogs` | `NutritionLog[]` | relation | - |
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
| `trainingSessionLogs` | `TrainingSessionLog[]` | relation | - |
| `trainingSetLogs` | `TrainingSetLog[]` | relation | - |
| `supplementPlans` | `SupplementPlan[]` | relation | - |
| `supplementPlanItems` | `SupplementPlanItem[]` | relation | - |
| `mediaObjects` | `MediaObject[]` | relation | - |
| `coachNotes` | `CoachNote[]` | relation | - |
| `coachTasks` | `CoachTask[]` | relation | - |
| `trackerComments` | `TrackerComment[]` | relation | - |
| `clientGoals` | `ClientGoal[]` | relation | - |
| `savedMeals` | `SavedMeal[]` | relation | - |
| `exerciseLibraryItems` | `ExerciseLibraryItem[]` | relation | - |
| `clientPlans` | `ClientPlan[]` | relation | - |
| `iifymPlans` | `IifymPlan[]` | relation | - |
| `iifymPlanVersions` | `IifymPlanVersion[]` | relation | - |
| `conversations` | `Conversation[]` | relation | - |
| `messages` | `Message[]` | relation | - |
| `messageDrafts` | `MessageDraft[]` | relation | - |
| `messageAttachments` | `MessageAttachment[]` | relation | - |
| `messageDraftAttachments` | `MessageDraftAttachment[]` | relation | - |
| `checkinAnswerMedia` | `CheckInAnswerMedia[]` | relation | - |
| `activityTargets` | `ActivityTarget[]` | relation | - |
| `progressPhotoEntries` | `ProgressPhotoEntry[]` | relation | - |
| `memberPreferences` | `MemberPreference[]` | relation | - |

### WorkspaceMember

`db/schema.prisma:365` - 73 fields, 64 relations. Constraints: `@@unique([workspaceId, userId])`, `@@unique([id, workspaceId])`, `@@index([workspaceId, status])`, `@@index([workspaceId, role])`, `@@index([userId])`, `@@map("workspace_member")`.

| Field | Type | Kind | Attributes |
|---|---|---|---|
| `id` | `String` | scalar | `@id @default(cuid())` |
| `workspaceId` | `String` | scalar | `@map("workspace_id")` |
| `userId` | `String` | scalar | `@map("user_id")` |
| `role` | `MemberRole` | enum | - |
| `status` | `MemberStatus` | enum | `@default(INVITED)` |
| `stateVersion` | `Int` | scalar | `@default(0) @map("state_version")` |
| `sidebarCollapsed` | `Boolean` | scalar | `@default(false) @map("sidebar_collapsed")` |
| `createdAt` | `DateTime` | scalar | `@default(now()) @map("created_at") @db.Timestamptz(6)` |
| `updatedAt` | `DateTime` | scalar | `@updatedAt @map("updated_at") @db.Timestamptz(6)` |
| `workspace` | `Workspace` | relation | `@relation(fields: [workspaceId], references: [id], onDelete: Restrict)` |
| `user` | `User` | relation | `@relation(fields: [userId], references: [id], onDelete: Restrict)` |
| `coachProfile` | `CoachProfile?` | relation | - |
| `preferences` | `MemberPreference[]` | relation | - |
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
| `nutritionLogsCreated` | `NutritionLog[]` | relation | `@relation("NutritionLogCreator")` |
| `nutritionLogsUpdated` | `NutritionLog[]` | relation | `@relation("NutritionLogUpdater")` |
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
| `supplementPlansCreated` | `SupplementPlan[]` | relation | `@relation("SupplementPlanCreator")` |
| `supplementPlansSaved` | `SupplementPlan[]` | relation | `@relation("SupplementPlanSaver")` |
| `trainingProgramsCreated` | `TrainingProgram[]` | relation | `@relation("TrainingProgramCreator")` |
| `trainingProgramsDraftsSaved` | `TrainingProgram[]` | relation | `@relation("TrainingProgramDraftSaver")` |
| `trainingProgramsTimezonesSet` | `TrainingProgram[]` | relation | `@relation("TrainingProgramTimezoneSetter")` |
| `trainingProgramsCancelled` | `TrainingProgram[]` | relation | `@relation("TrainingProgramCanceller")` |
| `trainingProgramVersionsPublished` | `TrainingProgramVersion[]` | relation | `@relation("TrainingProgramVersionPublisher")` |
| `trainingBookingsScheduled` | `TrainingSessionBooking[]` | relation | `@relation("TrainingBookingScheduler")` |
| `trainingBookingsCancelled` | `TrainingSessionBooking[]` | relation | `@relation("TrainingBookingCanceller")` |
| `coachNotesAuthored` | `CoachNote[]` | relation | `@relation("CoachNoteAuthor")` |
| `coachTasksCreated` | `CoachTask[]` | relation | `@relation("CoachTaskCreator")` |
| `coachTasksCompleted` | `CoachTask[]` | relation | `@relation("CoachTaskCompleter")` |
| `trackerCommentsAuthored` | `TrackerComment[]` | relation | `@relation("TrackerCommentAuthor")` |
| `clientGoalsCreated` | `ClientGoal[]` | relation | `@relation("ClientGoalCreator")` |
| `activityTargetsCreated` | `ActivityTarget[]` | relation | `@relation("ActivityTargetCreator")` |
| `savedMealsCreated` | `SavedMeal[]` | relation | `@relation("SavedMealCreator")` |
| `exerciseLibraryItemsCreated` | `ExerciseLibraryItem[]` | relation | `@relation("ExerciseLibraryItemCreator")` |
| `clientPlansUpdated` | `ClientPlan[]` | relation | `@relation("ClientPlanUpdater")` |
| `iifymPlansCreated` | `IifymPlan[]` | relation | `@relation("IifymPlanCreator")` |
| `iifymPlanDraftsSaved` | `IifymPlan[]` | relation | `@relation("IifymPlanDraftSaver")` |
| `iifymPlanTimezonesSet` | `IifymPlan[]` | relation | `@relation("IifymPlanTimezoneSetter")` |
| `iifymPlanVersionsPublished` | `IifymPlanVersion[]` | relation | `@relation("IifymPlanVersionPublisher")` |
