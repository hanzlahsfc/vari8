# SYMBOLS.md - exported symbol index

Generated file. Do not edit by hand: changes are overwritten by `npm run index`.
Verify the committed copy is current with `npm run index:check` (exit 1 = drift).

Source: TypeScript compiler API over `lib/**` and `frontend/src/lib/**`.
Counts: 138 modules with exports, 1362 exported symbols.

Signatures are one line, collapsed from source and cut at 200 characters with a trailing `...`.
Signatures are source text only (no compiler-inferred types), so the output never depends on installed packages.
Imported type names are shown without their `import("...")` prefix.

## `frontend/src/lib/coaching-data.ts`

- `export type Client = (typeof seed.clients)[number]`
- `export type Meal = (typeof seed.mealPlan.variants)[number]["meals"][number]`
- `export type MealVariant = (typeof seed.mealPlan.variants)[number]`
- `export type VariantId = "td" | "ntd"`
- `export const clientProfile = seed.clientProfile`
- `export const clients = seed.clients`
- `export const dashboard = seed.dashboard`
- `export function formatDate(value: string, withYear = false): string`
- `export function getVariant(id: VariantId): MealVariant`
- `export function isEmma(client: Client): boolean`
- `export const mealVariants = seed.mealPlan.variants`
- `export const seed = source`
- `export function templateName(client: Client): string`

## `frontend/src/lib/ethereal-appearance.tsx`

- `export type Appearance = { mode: AppearanceMode; accent: string; font: AppearanceFont; }`
- `export type AppearanceFont = | "sans" | "serif" | "condensed" | "mono" | "rounded"`
- `export type AppearanceMode = "light" | "dark"`
- `export function AppearanceProvider({ children }: { children: ReactNode })`
- `export const defaultAppearance: Appearance`
- `export const fontOptions: { id: AppearanceFont; label: string; name: string; family: string; }[]`
- `export function normalizeHex(value: string): string | null`
- `export function themeVariables(appearance: Appearance): CSSProperties`
- `export function useAppearance(): AppearanceContextValue`

## `frontend/src/lib/reduced-motion.ts`

- `export function useReducedMotion(): boolean`

## `frontend/src/lib/utils.ts`

- `export { cn } from "cn"`

## `lib/api/v1.ts`

- `export class ApiError extends Error (1 members)`
- `export type ApiViewer = { userId: string; email: string; name: string | null; }`
- `export type ApiWorkspaceContext = { workspaceId: string; memberId: string; role: Role; scope: Exclude<CapabilityScope, "deny">; }`
- `export type V1RouteContext<P, Q> = { viewer: ApiViewer; workspace: ApiWorkspaceContext; params: P; query: Q; request: Request; }`
- `export type V1RouteDefinition<P, Q, R> = { capability: Capability; params: ZodType<P>; query?: ZodType<Q>; handler: (ctx: V1RouteContext<P, Q>) => Promise<R>; }`
- `export function defineApiV1Route<P extends { workspaceId: string }, Q, R>(def: V1RouteDefinition<P, Q, R>)`

## `lib/audit.ts`

- `export const ACCOUNT_AUDIT_ACTIONS = ["PASSWORD_RESET"] as const`
- `export const ACCOUNT_AUDIT_RESOURCES = ["user", "access_token"] as const`
- `export const AUDIT_ACTIONS = [ "READ", "CREATE", "UPDATE", "DELETE", "EXPORT", "GRANT", "REVOKE", "INVITE", "ASSIGN", "DENY", "LOGIN", "PASSWORD_RESET", ] as const`
- `export const AUDIT_RESOURCE_TYPES = [ "consent", "client_assignment", "access_token", "user", "client_export", "onboarding_form", "onboarding_assignment", "parameter_definition", "coaching_template...`
- `export type AccountAuditContext = { subjectUserId: string; actorUserId?: string | null; actorRole?: MemberRole | null; }`
- `export type AccountAuditEventInput = | { action: "PASSWORD_RESET"; resourceType: "access_token"; resourceId?: string | null; meta?: AccountAuditMeta; } | { action: "PASSWORD_RESET"; resourceType: "...`
- `export type AccountAuditEventRow = { id: string; actorUserId: string | null; action: string; resourceType: string; resourceId: string | null; result: string; at: Date; }`
- `export type AccountAuditMeta = { resetStage?: "REQUESTED" | "COMPLETED"; }`
- `export type AuditAction = (typeof AUDIT_ACTIONS)[number]`
- `export class AuditError extends Error (1 members)`
- `export type AuditErrorCode = | "invalid_input" | "audit_metadata_forbidden" | "audit_write_failed" | "audit_not_wired_for_external_use"`
- `export type AuditEventInput = { action: AuditAction; resourceType: AuditResourceType; resourceId?: string | null; subjectClientProfileId?: string | null; meta?: AuditMeta; }`
- `export type AuditEventRow = { id: string; workspaceId: string | null; actorUserId: string | null; actorRole: string | null; action: string; resourceType: string; resourceId: string | null; subjectC...`
- `export type AuditMeta = { kind?: ConsentKind; version?: string; changed?: boolean; count?: number; role?: "PRIMARY" | "COACH"; status?: "ACTIVE" | "REMOVED" | "ARCHIVED" | "PUBLISHED"; targetRole?:...`
- `export type AuditResourceType = (typeof AUDIT_RESOURCE_TYPES)[number]`
- `export function buildAccountAuditEvent(context: AccountAuditContext, input: AccountAuditEventInput): Prisma.AuditEventUncheckedCreateInput`
- `export function buildAuditEvent(context: AuthorizationContext, input: AuditEventInput): Prisma.AuditEventUncheckedCreateInput`
- `export async function listAccountAuditEvents(input: { subjectUserId: string; limit?: number; cursor?: string }, client: PrismaClient | PrismaLike = prisma): Promise<{ items: AccountAuditEventRow[];...`
- `export async function listAuditEvents(session: SessionLike, input: { workspaceId: string; limit?: number; cursor?: string }, client: PrismaClient | PrismaLike = prisma): Promise<{ items: AuditEvent...`
- `export function sanitizeAccountAuditMeta(meta?: AccountAuditMeta): AccountAuditMeta | undefined`
- `export function sanitizeAuditMeta(meta?: AuditMeta): AuditMeta | undefined`
- `export async function writeAccountAuditEvent(tx: Prisma.TransactionClient, input: AccountAuditContext & AccountAuditEventInput): Promise<void>`
- `export async function writeAuditEvent(tx: Prisma.TransactionClient, context: AuthorizationContext, input: AuditEventInput): Promise<void>`

## `lib/auth/guard.ts`

- `export class AccessDeniedError extends Error (2 members)`
- `export type AuthorizationContext = { userId: string; platformRole: PlatformRole; workspaceId?: string; workspaceMemberId?: string; workspaceRole?: WorkspaceRole; grantedScope: Exclude<Scope, "denie...`
- `export type AuthorizationRepo = { getUser(id: string): Promise<{ id: string; platformRole: PlatformRole; status: UserStatus; } | null>; getWorkspace( id: string, ): Promise<{ id: string; status: Wo...`
- `export type AuthorizationRequest = { resource: Resource; action: Action; workspaceId?: string; clientProfileId?: string; }`
- `export type CollectionContext = { userId: string; platformRole: PlatformRole; workspaceId: string; workspaceMemberId: string; workspaceRole: WorkspaceRole; grantedScope: CollectionScope; }`
- `export type CollectionScope = "workspace" | "assigned" | "own"`
- `export type DenialReason = | "unauthenticated" | "user_missing" | "user_inactive" | "workspace_required" | "workspace_missing_or_inactive" | "membership_missing_or_inactive" | "role_denied" | "clie...`
- `export type MembershipStatus = "INVITED" | "ACTIVE" | "SUSPENDED" | "REMOVED"`
- `export type PlatformRole = "USER" | "PLATFORM_ADMIN"`
- `export type SessionLike = { user?: { id?: string | null } | null } | null | undefined`
- `export type UserStatus = "ACTIVE" | "DEACTIVATED" | "INVITED"`
- `export type { WorkspaceRole } from "./rbac"`
- `export type WorkspaceStatus = "ACTIVE" | "SUSPENDED"`
- `export async function authorize(session: SessionLike, request: AuthorizationRequest, repo: AuthorizationRepo = prismaAuthorizationRepo): Promise<AuthorizationContext>`
- `export async function authorizeCollection(session: SessionLike, request: { resource: Resource; action: Action; workspaceId?: string }, repo: AuthorizationRepo = prismaAuthorizationRepo): Promise<Co...`

## `lib/auth/password-reset-boundary.ts`

- `export type ResetCompletionResult = { ok: true } | { ok: false; message: string }`
- `export type ResetGate = { deliveryAvailable?: boolean }`
- `export type ResetLinkState = { state: "ready" | "invalid" }`
- `export type ResetRequestResult = { ok: true; message: string } | { ok: false; message: string }`
- `export interface VerificationLookup (1 members)`
- `export async function completePasswordReset(input: { rawToken: unknown; password: unknown }, gate?: ResetGate): Promise<ResetCompletionResult>`
- `export async function getResetLinkState(rawToken: unknown, client: VerificationLookup = prisma, gate?: ResetGate): Promise<ResetLinkState>`
- `export function passwordResetDeliveryConfigured(): boolean`
- `export function passwordResetMessage(error: unknown): string`
- `export async function requestPasswordResetFromForm(email: unknown, gate?: ResetGate): Promise<ResetRequestResult>`

## `lib/auth/rate-limit.ts`

- `export class RateLimitExceededError extends Error (1 members)`
- `export type RateLimitOutcome = { allowed: true } | { allowed: false; retryAfter: number }`
- `export type RateLimitRule = { window: number; max: number }`
- `export function accountLimitKey(purpose: string, normalizedEmail: string): string`
- `export async function consumeRateLimit(key: string, rule: RateLimitRule, client: Pick<typeof prisma, "rateLimit"> = prisma): Promise<RateLimitOutcome>`
- `export function resolveTrustedClientIp(requestHeaders: Headers): string | null`
- `export function userLimitKey(purpose: string, userId: string): string`

## `lib/auth/rbac.ts`

- `export type Action = "read" | "write"`
- `export const PRINCIPAL_ROLES = ["PLATFORM_ADMIN", ...WORKSPACE_ROLES] as const`
- `export type PrincipalRole = (typeof PRINCIPAL_ROLES)[number]`
- `export const RBAC_MATRIX: Record<Resource, Record<PrincipalRole, ScopeCell>>`
- `export const RESOURCES = [ "workspaceSettings", "membersInvitations", "clientInvitations", "clientAssignments", "clientProfiles", "dailyTracking", "mealPlans", "trainingPlansLogs", "checkinsCoachRe...`
- `export type Resource = (typeof RESOURCES)[number]`
- `export type Scope = "own" | "assigned" | "workspace" | "platform" | "denied"`
- `export type ScopeCell = Record<Action, Scope>`
- `export const WORKSPACE_ROLES = [ "WORKSPACE_OWNER", "COACH", "ASSISTANT_COACH", "SUPPORT", "CLIENT", ] as const`
- `export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number]`
- `export function isAction(value: unknown): value is Action`
- `export function isPrincipalRole(value: unknown): value is PrincipalRole`
- `export function isResource(value: unknown): value is Resource`
- `export function resolveScope(resource: Resource, action: Action, role: PrincipalRole): Scope | undefined`

## `lib/auth/roles.ts`

- `export const CAPABILITIES = Object.keys(CAPABILITY_MATRIX) as Capability[]`
- `export const CAPABILITY_MATRIX: Record< Capability, Record<Role, CapabilityScope> >`
- `export type Capability = | "roster.read" | "plan.read" | "plan.write" | "clientData.read" | "own.read" | "own.write" | "notes.write" | "tasks.manage" | "library.manage" | "message.write" | "appeara...`
- `export type CapabilityScope = "workspace" | "own" | "deny"`
- `export const ROLES = ["owner", "coach", "client"] as const`
- `export type Role = "owner" | "coach" | "client"`
- `export function capabilityScope(role: Role, capability: Capability): CapabilityScope`
- `export function memberRoleToRole(role: MemberRole): Role | null`

## `lib/auth/route-guard.ts`

- `export type SessionWorkspaceSummary = { id: string; name: string; role: WorkspaceRole; }`
- `export type WorkspaceAccessRequest = { resource: Resource; action: Action; workspaceId: string; }`
- `export async function getAuthorizedWorkspaceSummary(ctx: AuthorizationContext & { workspaceId: string }, client: PrismaLike = prisma): Promise<{ id: string; name: string }>`
- `export async function listSessionWorkspaces(userId: string, client: PrismaLike = prisma): Promise<SessionWorkspaceSummary[]>`
- `export async function requireClientSetupAccess(session: SessionLike, workspaceId: string, client: PrismaLike = prisma): Promise<CollectionContext>`
- `export async function requireDailyTrackerAccess(session: SessionLike, workspaceId: string, client: PrismaLike = prisma): Promise<CollectionContext>`
- `export async function requireOnboardingAssignmentsAccess(session: SessionLike, workspaceId: string, client: PrismaLike = prisma): Promise<CollectionContext>`
- `export async function requireOnboardingSubmissionsAccess(session: SessionLike, workspaceId: string, client: PrismaLike = prisma): Promise<CollectionContext>`
- `export const requireSessionUser = cache( async (): Promise<{ userId: string; session: SessionLike }> => { const session = await auth(); const userId = session?.user?.id; if (typeof userId !== "stri...`
- `export async function requireWorkspaceAccess(session: SessionLike, request: WorkspaceAccessRequest, client: PrismaLike = prisma): Promise<AuthorizationContext>`
- `export async function resolveWorkspaceAccess(session: SessionLike, request: WorkspaceAccessRequest, client: PrismaLike = prisma): Promise<AuthorizationContext | null>`

## `lib/auth/server.ts`

- `export type AuthServer = typeof auth`
- `export function assertAuthSecretConfigured(): void`
- `export const auth = betterAuth({ appName: "Vari8", secret: process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET, baseURL: process.env.BETTER_AUTH_URL ?? process.env.AUTH_URL, database: prismaA...`

## `lib/auth/signup.ts`

- `export class SignupError extends Error (1 members)`
- `export type SignupErrorCode = "invalid_input" | "email_taken"`
- `export type SignupInput = { name: unknown; email: unknown; password: unknown; workspaceName: unknown; }`
- `export type SignupResult = { userId: string; workspaceId: string }`
- `export async function signUpCoachAccount(input: SignupInput, client: PrismaClient = prisma): Promise<SignupResult>`

## `lib/auth/viewer.ts`

- `export type CanvasRole = "Owner" | "Coach"`
- `export type CanvasViewer = { name: string; initials: string; role: CanvasRole; workspace: { id: string; name: string }; }`
- `export type ClientViewer = { name: string; initials: string; workspace: { id: string; name: string }; clientProfileId: string; }`
- `export type Viewer = { id: string; email: string; name: string | null }`
- `export async function getCanvasViewer(userId: string): Promise<CanvasViewer | null>`
- `export async function getClientViewer(userId: string): Promise<ClientViewer | null>`
- `export async function getViewer(): Promise<Viewer | null>`
- `export async function getViewerFromHeaders(requestHeaders: Headers): Promise<Viewer | null>`
- `export function initialsOf(name: string): string`
- `export async function signOutPath(userId: string | undefined | null): Promise<string>`

## `lib/boundary.ts`

- `export type ClosedMessages<C extends string> = Record<C, string>`
- `export type SafeResult<C extends string, T> = | { ok: true; value: T } | { ok: false; code: C; message: string; detail?: Record<string, unknown>; }`
- `export function fail<C extends string, T = never>(messages: ClosedMessages<C>, code: C, detail?: Record<string, unknown>): SafeResult<C, T>`
- `export function failMessage(message: string): { ok: false; message: string }`
- `export async function guard<F, T>(options: { enabled: boolean; off: () => F; map: (error: unknown) => F; }, fn: () => Promise<T>): Promise<{ ok: true; value: T } | F>`
- `export function mapError<F>(error: unknown, mapping: { denied: () => F; consent?: (error: ConsentError) => F; domain: (error: unknown) => F | null | undefined; serializationConflict?: () => F; fall...`

## `lib/canvas/coaching-data.ts`

- `export type Client = (typeof seed.clients)[number]`
- `export type Meal = (typeof seed.mealPlan.variants)[number]["meals"][number]`
- `export type MealVariant = (typeof seed.mealPlan.variants)[number]`
- `export type VariantId = "td" | "ntd"`
- `export const clientProfile = seed.clientProfile`
- `export const clients = seed.clients`
- `export const dashboard = seed.dashboard`
- `export function formatDate(value: string, withYear = false): string`
- `export function getVariant(id: VariantId): MealVariant`
- `export function isEmma(client: Client): boolean`
- `export const mealVariants = seed.mealPlan.variants`
- `export const seed = source`
- `export function templateName(client: Client): string`

## `lib/canvas/ethereal-appearance.tsx`

- `export type Appearance = { mode: AppearanceMode; accent: string; font: AppearanceFont; }`
- `export type AppearanceFont = | "sans" | "serif" | "condensed" | "mono" | "rounded"`
- `export type AppearanceMode = "light" | "dark"`
- `export function AppearanceProvider({ children }: { children: ReactNode })`
- `export const defaultAppearance: Appearance`
- `export const fontOptions: { id: AppearanceFont; label: string; name: string; family: string; }[]`
- `export function normalizeHex(value: string): string | null`
- `export function themeVariables(appearance: Appearance): CSSProperties`
- `export function useAppearance(): AppearanceContextValue`

## `lib/canvas/reduced-motion.ts`

- `export function useReducedMotion(): boolean`

## `lib/canvas/utils.ts`

- `export { cn } from "cn"`

## `lib/catalog.ts`

- `export const EXERCISE_FIELDS = [ "id", "name", "muscleGroup", "primaryTarget", "additionalTargets", "equipment", "movementPattern", "positionSetup", "cues", "videoLink", ] as const`
- `export const FOOD_FIELDS = [ "no", "food", "amount", "unit", "calories", "protein", "carbs", "fats", "state", "category", ] as const`
- `export type SparseCell = { row: number; col: number; rowSpan: number; colSpan: number; className: string | null; kind: SparseCellKind; text: string; checkbox?: "checked" | "unchecked"; }`
- `export type SparseCellKind = "text" | "redacted" | "checkbox"`
- `export type SparseGrid = { cells: SparseCell[]; rows: number; cols: number; redactedCount: number; emptyOmitted: number; }`
- `export function exerciseFacets(records: ExerciseRecord[]): { muscleGroups: string[]; equipment: string[]; }`
- `export function foodCategories(records: FoodRecord[]): string[]`
- `export function searchExercises(records: ExerciseRecord[], query: string, filters: { muscleGroup?: string; equipment?: string } = {}): ExerciseRecord[]`
- `export function searchFoods(records: FoodRecord[], query: string, category = ""): FoodRecord[]`
- `export function sheetDisplayName(sourceFile: string): string`
- `export function toSparseGrid(cells: ExtractionCell[]): SparseGrid`

## `lib/checkin/calendar.ts`

- `export type CheckInCalendarCell = { key: string; weekday: number; inMonth: boolean; }`
- `export function checkInCalendarDayKey(instantIso: string, timeZone: string): string`
- `export function checkInCalendarMonthCells(year: number, month: number): CheckInCalendarCell[]`

## `lib/checkin/forms-boundary.ts`

- `export type ActionResult<T> = { ok: true; value: T } | { ok: false; message: string }`
- `export type BoundaryDeps = { db?: PrismaClient }`
- `export async function archiveCheckInFormFromAction(_session: SessionLike, _input: { workspaceId: string; formId: string }, _deps: BoundaryDeps = {}): Promise<ActionResult<{ formId: string }>>`
- `export async function createCheckInFormFromAction(_session: SessionLike, _input: { workspaceId: string; name: string }, _deps: BoundaryDeps = {}): Promise<ActionResult<{ formId: string }>>`
- `export async function getCheckInFormForWorkspace(_session: SessionLike, _input: { workspaceId: string; formId: string }, _deps: BoundaryDeps = {}): Promise<ActionResult<CheckInFormDetail>>`
- `export async function listCheckInFormsForWorkspace(_session: SessionLike, _input: { workspaceId: string }, _deps: BoundaryDeps = {}): Promise<ActionResult<{ forms: CheckInFormSummary[] }>>`
- `export async function openCheckInDraftFromAction(_session: SessionLike, _input: { workspaceId: string; formId: string }, _deps: BoundaryDeps = {}): Promise<ActionResult<{ revision: number; definiti...`
- `export async function publishCheckInFromAction(_session: SessionLike, _input: { workspaceId: string; formId: string; expectedRevision: number }, _deps: BoundaryDeps = {}): Promise<ActionResult<{ ve...`
- `export async function saveCheckInDraftFromAction(_session: SessionLike, _input: { workspaceId: string; formId: string; expectedRevision: number; draftJson: string; name?: string; }, _deps: Boundary...`

## `lib/checkin/forms-gate.ts`

- `export type CheckInRuntimeClass = RuntimeClass`
- `export type CheckInsEnv = RuntimeEnv & { ENABLE_CHECK_INS?: string }`
- `export const classifyCheckInRuntime: (env?: RuntimeEnv) => CheckInRuntimeClass`
- `export function isCheckInsEnabled(env: CheckInsEnv = process.env): boolean`

## `lib/checkin/forms.ts`

- `export const CHECKIN_FIELD_KINDS = [ "shortText", "longText", "number", "date", "singleChoice", "multiChoice", "rating", "visual", ] as const`
- `export const CHECKIN_FORM_LIMITS = { maxFields: 100, minPublishFields: 1, labelMax: 200, helpTextMax: 500, classificationMax: 64, minOptions: 1, maxOptions: 50, optionLabelMax: 200, nameMax: 120, d...`
- `export const CHECKIN_RATING_SCHEMES = [ "SCALE_1_10", "SCALE_1_5", "WORD_LABELS", ] as const`
- `export const CHECKIN_RATING_WORD_LABELS = [ "Low", "Okay", "Good", "Excellent", ] as const`
- `export type CheckInDefinition = { title: string; fields: CheckInField[] }`
- `export type CheckInField = { fieldId: string; kind: CheckInFieldKind; label: string; required: boolean; order: number; helpText?: string; options?: CheckInOption[]; ratingScheme?: CheckInRatingSche...`
- `export type CheckInFieldKind = (typeof CHECKIN_FIELD_KINDS)[number]`
- `export type CheckInFormDetail = { id: string; name: string; status: "ACTIVE" | "ARCHIVED"; draftRevision: number; draft: CheckInDefinition | null; versions: Array<{ versionSeq: number; publishedAt:...`
- `export class CheckInFormError extends Error (1 members)`
- `export type CheckInFormErrorCode = | "invalid_input" | "form_not_accessible" | "form_archived" | "no_open_draft" | "stale_revision" | "forbidden_field_id" | "publish_incomplete" | "serialization_co...`
- `export type CheckInFormSummary = { id: string; name: string; status: "ACTIVE" | "ARCHIVED"; draftRevision: number; hasDraft: boolean; latestVersionSeq: number | null; updatedAt: string; }`
- `export type CheckInOption = { optionId: string; label: string }`
- `export type CheckInRatingScheme = (typeof CHECKIN_RATING_SCHEMES)[number]`
- `export async function archiveCheckInForm(session: SessionLike, input: { workspaceId: string; formId: string }, client?: PrismaClient): Promise<{ formId: string }>`
- `export async function createCheckInForm(session: SessionLike, input: { workspaceId: string; name: string }, client?: PrismaClient): Promise<{ formId: string }>`
- `export async function getCheckInForm(session: SessionLike, input: { workspaceId: string; formId: string }, client?: PrismaClient): Promise<CheckInFormDetail>`
- `export async function listCheckInForms(session: SessionLike, input: { workspaceId: string }, client?: PrismaClient): Promise<CheckInFormSummary[]>`
- `export async function openCheckInDraft(session: SessionLike, input: { workspaceId: string; formId: string }, client?: PrismaClient): Promise<{ revision: number; definition: CheckInDefinition }>`
- `export async function publishCheckInForm(session: SessionLike, input: { workspaceId: string; formId: string; expectedRevision: number }, client?: PrismaClient): Promise<{ versionSeq: number }>`
- `export async function saveCheckInFormDraft(session: SessionLike, input: { workspaceId: string; formId: string; expectedRevision: number; draft: unknown; name?: string; }, client?: PrismaClient): Pr...`
- `export function validateCheckInDefinition(input: unknown, knownIds: { fieldIds: Map<string, CheckInFieldKind>; optionIds: Map<string, string>; }, opts: { forPublish: boolean }): CheckInDefinition`

## `lib/checkin/instances-boundary.ts`

- `export { CheckInInstanceError }`
- `export type { CheckInInstanceState }`
- `export type CheckInSafeResult<T> = | { ok: true; value: T } | { ok: false; code: | "denied" | "invalid_input" | "not_available" | "already_submitted" | "consent_missing" | "policy_not_configured" |...`
- `export type { StaffCheckInReviewQueueItem }`
- `export async function cancelCheckInInstanceFromAction(session: Session, input: CancelCheckInInstanceInput, deps: CheckInInstanceDeps = {}): Promise<CheckInSafeResult<CancelCheckInInstanceResult>>`
- `export async function createCheckInScheduleRuleFromAction(session: Session, input: CreateCheckInScheduleRuleInput, deps: CheckInScheduleDeps = {}): Promise<CheckInSafeResult<CreateCheckInScheduleRu...`
- `export async function generateCheckInScheduleRuleInstancesFromAction(session: Session, input: GenerateCheckInScheduleRuleInput, deps: CheckInScheduleDeps = {}): Promise<CheckInSafeResult<GenerateCh...`
- `export async function getOwnCheckInInstance(session: Session, input: GetOwnCheckInInstanceInput, deps: CheckInInstanceDeps = {}): Promise<CheckInSafeResult<OwnCheckInInstanceDetail>>`
- `export async function listCheckInScheduleRulesForClient(session: Session, input: { workspaceId: string; clientProfileId: string }, deps: CheckInScheduleDeps = {}): Promise<CheckInSafeResult<{ items...`
- `export async function listOwnCheckInFeedbackItems(session: Session, input: ListOwnCheckInFeedbackInput, deps: CheckInInstanceDeps = {}): Promise<CheckInSafeResult<CheckInFeedbackPage>>`
- `export async function listOwnCheckInInstances(session: Session, input: { workspaceId: string }, deps: CheckInInstanceDeps = {}): Promise<CheckInSafeResult<{ items: OwnCheckInInstanceItem[] }>>`
- `export async function listSchedulableVersionsForClient(session: Session, input: { workspaceId: string; clientProfileId: string }, deps: CheckInInstanceDeps = {}): Promise<CheckInSafeResult<{ option...`
- `export async function listStaffCheckInFeedback(session: Session, input: ListCheckInFeedbackInput, deps: CheckInInstanceDeps = {}): Promise<CheckInSafeResult<CheckInFeedbackPage>>`
- `export async function listStaffCheckInInstances(session: Session, input: { workspaceId: string; clientProfileId: string }, deps: CheckInInstanceDeps = {}): Promise<CheckInSafeResult<{ items: StaffC...`
- `export async function listStaffCheckInReviewQueue(session: Session, input: { workspaceId: string; cursor?: string }, deps: CheckInInstanceDeps = {}): Promise< CheckInSafeResult<{ items: StaffCheckI...`
- `export async function listStaffCheckInSubmissions(session: Session, input: { workspaceId: string; clientProfileId: string }, deps: CheckInInstanceDeps = {}): Promise<CheckInSafeResult<{ items: Staf...`
- `export async function markCheckInSubmissionReviewedFromAction(session: Session, input: MarkCheckInSubmissionReviewedInput, deps: CheckInInstanceDeps = {}): Promise<CheckInSafeResult<MarkCheckInSubm...`
- `export { parseCheckInSubmissionParam }`
- `export async function projectStaffCheckInScheduleOccurrences(session: Session, input: ProjectCheckInScheduleOccurrencesInput, deps: CheckInScheduleDeps = {}): Promise<CheckInSafeResult<ProjectCheck...`
- `export async function readCheckInReviewTrackerContextFromAction(session: Session, input: { workspaceId: string; clientProfileId: string; submissionId: string; entryDate: string; }, deps: CheckInTra...`
- `export async function readOwnCheckInCalendar(session: Session, input: { workspaceId: string; from: string; to: string }, deps: CheckInInstanceDeps = {}): Promise< CheckInSafeResult<{ items: OwnChec...`
- `export async function readOwnNextCheckInInstance(session: Session, input: { workspaceId: string }, deps: CheckInInstanceDeps = {}): Promise<CheckInSafeResult<{ next: OwnNextCheckInInstance | null }>>`
- `export async function readStaffCheckInCalendar(session: Session, input: { workspaceId: string; clientProfileId: string; from: string; to: string; }, deps: CheckInInstanceDeps = {}): Promise< CheckI...`
- `export async function readStaffCheckInSubmissionDetail(session: Session, input: { workspaceId: string; clientProfileId: string; submissionId: string; }, deps: CheckInInstanceDeps = {}): Promise<Che...`
- `export async function resolveCheckInFeedbackSendFromAction(session: Session, input: ResolveCheckInFeedbackSendInput, deps: CheckInInstanceDeps = {}): Promise<CheckInSafeResult<ResolveCheckInFeedbac...`
- `export async function scheduleCheckInInstanceFromAction(session: Session, input: ScheduleCheckInInstanceInput, deps: CheckInInstanceDeps = {}): Promise<CheckInSafeResult<ScheduleCheckInInstanceResu...`
- `export async function sendCheckInFeedbackFromAction(session: Session, input: SendCheckInFeedbackInput, deps: CheckInInstanceDeps = {}): Promise<CheckInSafeResult<SendCheckInFeedbackResult>>`
- `export async function setCheckInScheduleRuleStatusFromAction(session: Session, input: SetCheckInScheduleRuleStatusInput, deps: CheckInScheduleDeps = {}): Promise<CheckInSafeResult<SetCheckInSchedul...`
- `export async function submitCheckInInstanceFromAction(session: Session, input: SubmitCheckInInstanceInput, deps: CheckInInstanceDeps = {}): Promise<CheckInSafeResult<SubmitCheckInInstanceResult>>`

## `lib/checkin/instances.ts`

- `export const CALENDAR_RANGE_MAX_DAYS = 95`
- `export const CHECKIN_FEEDBACK_BODY_MAX = 2000`
- `export const CHECKIN_FEEDBACK_NONCE_MAX = 64`
- `export const CHECKIN_FEEDBACK_PAGE_SIZE = 50`
- `export const CHECKIN_INSTANCE_LIMITS = { answersJsonMaxBytes: 128 * 1024, answerTextMax: 4000, optionIdsMaxPerField: 50, visualMediaIdsMax: 10, coachNoteMax: 500, idMax: 128, dueTzMax: 64, dueAtMin...`
- `export const CHECKIN_REVIEW_QUEUE_PAGE_SIZE = 50`
- `export type CancelCheckInInstanceInput = { workspaceId: string; clientProfileId: string; instanceId: string; }`
- `export type CancelCheckInInstanceResult = { status: "cancelled" }`
- `export type CanonicalCheckInAnswer = { fieldId: string; kind: (typeof KIND_TO_ENUM)[keyof typeof KIND_TO_ENUM]; answered: boolean; valueText: string | null; valueNumeric: string | null; valueDate: ...`
- `export type { CheckInDefinition }`
- `export type CheckInFeedbackItem = { id: string; sentAt: string; byName: string; body: string; }`
- `export type CheckInFeedbackPage = { items: CheckInFeedbackItem[]; nextCursor: string | null; hasMore: boolean; }`
- `export type { CheckInField }`
- `export type CheckInInstanceDeps = { db?: PrismaLike; registry?: ConsentPolicyRegistry; }`
- `export class CheckInInstanceError extends Error (1 members)`
- `export type CheckInInstanceErrorCode = | "invalid_input" | "not_available" | "already_submitted" | "instance_not_accessible" | "consent_missing" | "policy_not_configured" | "serialization_conflict"...`
- `export type CheckInInstanceLifecycleInput = { cancelledAt: Date | null; cancelledByMemberId: string | null; hasSubmission: boolean; hasReview?: boolean; }`
- `export type CheckInInstancePresentation = { state: CheckInInstanceState; late: boolean; }`
- `export type CheckInInstanceState = "CANCELLED" | "REVIEWED" | "SUBMITTED" | "SCHEDULED"`
- `export type GetOwnCheckInInstanceInput = { workspaceId: string; instanceId: string; }`
- `export const KIND_TO_ENUM = { shortText: "SHORT_TEXT", longText: "LONG_TEXT", number: "NUMBER", date: "DATE", singleChoice: "SINGLE_CHOICE", multiChoice: "MULTI_CHOICE", rating: "RATING", visual: "...`
- `export type ListCheckInFeedbackInput = { workspaceId: string; clientProfileId: string; submissionId: string; cursor?: string; limit?: number; }`
- `export type ListCheckInInstancesInput = { workspaceId: string; clientProfileId: string; range?: { from: string; to: string }; }`
- `export type ListOwnCheckInFeedbackInput = { workspaceId: string; instanceId: string; cursor?: string; }`
- `export type MarkCheckInSubmissionReviewedInput = { workspaceId: string; clientProfileId: string; submissionId: string; }`
- `export type MarkCheckInSubmissionReviewedResult = { status: "reviewed" | "already_reviewed"; reviewedAt: string; }`
- `export type OwnCheckInInstanceDetail = { instanceId: string; formName: string; versionSeq: number; dueAt: string; state: CheckInInstanceState; late: boolean; submittedAt: string | null; definition:...`
- `export type OwnCheckInInstanceInput = { workspaceId: string; range?: { from: string; to: string }; }`
- `export type OwnCheckInInstanceItem = { instanceId: string; formName: string; versionSeq: number; dueAt: string; state: CheckInInstanceState; late: boolean; submittedAt: string | null; }`
- `export type OwnNextCheckInInstance = { instanceId: string; formName: string; dueAt: string; late: boolean; }`
- `export type PrismaLike = Pick< PrismaClient, | "$transaction" | "$queryRawUnsafe" | "checkInInstance" | "checkInSubmission" | "checkInSubmissionAnswer" | "checkInReview" | "checkInFeedback" | "chec...`
- `export type RawCheckInAnswerEntry = { fieldId: string; value: unknown }`
- `export type ResolveCheckInFeedbackSendInput = { workspaceId: string; clientProfileId: string; submissionId: string; clientRequestId: string; }`
- `export type ResolveCheckInFeedbackSendResult = | { status: "sent"; feedbackId: string; sentAt: string; byName: string; body: string; } | { status: "not_sent" }`
- `export type ScheduleCheckInInstanceInput = { workspaceId: string; clientProfileId: string; formId: string; formVersionId: string; dueAt: string; dueTz?: string | null; coachNote?: string | null; }`
- `export type ScheduleCheckInInstanceResult = | { status: "scheduled"; instanceId: string } | { status: "already_scheduled"; instanceId: string }`
- `export type ScheduleFormOption = { position: number; formName: string; versionSeq: number; formId: string; formVersionId: string; }`
- `export type SendCheckInFeedbackInput = { workspaceId: string; clientProfileId: string; submissionId: string; body: string; clientRequestId: string; }`
- `export type SendCheckInFeedbackResult = { status: "sent" | "already_sent"; feedbackId: string; sentAt: string; byName: string; body: string; }`
- `export type StaffCheckInInstanceItem = { instanceId: string; formId: string; formName: string; versionSeq: number; dueAt: string; dueTz: string | null; coachNote: string | null; state: CheckInInsta...`
- `export type StaffCheckInReviewQueueItem = { submissionId: string; instanceId: string; clientProfileId: string; clientName: string; formName: string; versionSeq: number; dueAt: string; submittedAt: ...`
- `export type StaffCheckInSubmissionDetail = { submissionId: string; instanceId: string; formName: string; versionSeq: number; dueAt: string; submittedAt: string; late: boolean; reviewed: { byName: s...`
- `export type StaffCheckInSubmissionFieldView = { fieldId: string; label: string; kind: string; required: boolean; display: string; mediaIds: string[]; }`
- `export type StaffCheckInSubmissionItem = { instanceId: string; submissionId: string; formName: string; versionSeq: number; dueAt: string; dueTz: string | null; submittedAt: string; late: boolean; r...`
- `export type SubmitCheckInInstanceInput = { workspaceId: string; instanceId: string; answersJson: string; }`
- `export type SubmitCheckInInstanceResult = | { status: "submitted"; submissionId: string } | { status: "already_submitted"; submissionId: string }`
- `export function buildCheckInReviewQueueWhere(scope: "workspace" | "assigned", ctx: { workspaceId: string; workspaceMemberId: string }, cursor: { submittedAt: Date; id: string } | undefined): Prisma...`
- `export async function cancelCheckInInstance(session: SessionLike, input: CancelCheckInInstanceInput, deps: CheckInInstanceDeps = {}): Promise<CancelCheckInInstanceResult>`
- `export function canonicalizeCheckInAnswers(definition: CheckInDefinition, raw: readonly RawCheckInAnswerEntry[]): CanonicalCheckInAnswer[]`
- `export function deriveCheckInQueueCanReview(role: string, rowHasActiveAssignment: boolean): boolean`
- `export async function getOwnCheckInInstance(session: SessionLike, input: GetOwnCheckInInstanceInput, deps: CheckInInstanceDeps = {}): Promise<OwnCheckInInstanceDetail>`
- `export async function getOwnNextCheckInInstance(session: SessionLike, input: { workspaceId: string }, deps: CheckInInstanceDeps = {}): Promise<OwnNextCheckInInstance | null>`
- `export async function listCheckInFeedback(session: SessionLike, input: ListCheckInFeedbackInput, deps: CheckInInstanceDeps = {}): Promise<CheckInFeedbackPage>`
- `export async function listCheckInInstancesForClient(session: SessionLike, input: ListCheckInInstancesInput, deps: CheckInInstanceDeps = {}): Promise<{ items: StaffCheckInInstanceItem[]; truncated?:...`
- `export async function listCheckInReviewQueue(session: SessionLike, input: { workspaceId: string; cursor?: string }, deps: CheckInInstanceDeps = {}): Promise<{ items: StaffCheckInReviewQueueItem[]; ...`
- `export async function listCheckInSubmissionsForClient(session: SessionLike, input: ListCheckInInstancesInput, deps: CheckInInstanceDeps = {}): Promise<{ items: StaffCheckInSubmissionItem[] }>`
- `export async function listOwnCheckInFeedback(session: SessionLike, input: ListOwnCheckInFeedbackInput, deps: CheckInInstanceDeps = {}): Promise<CheckInFeedbackPage>`
- `export async function listOwnCheckInInstances(session: SessionLike, input: OwnCheckInInstanceInput, deps: CheckInInstanceDeps = {}): Promise<{ items: OwnCheckInInstanceItem[]; truncated?: boolean }>`
- `export async function listSchedulableFormVersions(session: SessionLike, input: { workspaceId: string; clientProfileId: string }, deps: CheckInInstanceDeps = {}): Promise<{ options: ScheduleFormOpti...`
- `export async function markCheckInSubmissionReviewed(session: SessionLike, input: MarkCheckInSubmissionReviewedInput, deps: CheckInInstanceDeps = {}): Promise<MarkCheckInSubmissionReviewedResult>`
- `export function normalizeCheckInFeedbackBody(raw: unknown): string | null`
- `export function parseCheckInAnswersJson(raw: unknown): RawCheckInAnswerEntry[]`
- `export function parseCheckInCalendarRange(raw: { from?: unknown; to?: unknown; }): { from: Date; to: Date } | null`
- `export function parseCheckInCoachNote(raw: unknown): string | null`
- `export function parseCheckInDueAt(raw: unknown): Date | null`
- `export function parseCheckInDueTz(raw: unknown): string | null`
- `export function parseCheckInReviewQueueCursor(raw: string): { submittedAt: Date; id: string; }`
- `export function parseCheckInSubmissionParam(value: string | string[] | undefined): | { status: "none" } | { status: "invalid" } | { status: "ok"; submissionId: string }`
- `export function projectCheckInInstancePresentation(row: CheckInInstanceLifecycleInput & { dueAt: Date; submittedAt: Date | null; }, now: Date = new Date()): CheckInInstancePresentation`
- `export function projectCheckInInstanceState(row: CheckInInstanceLifecycleInput): CheckInInstanceState`
- `export async function readCheckInSubmissionDetail(session: SessionLike, input: { workspaceId: string; clientProfileId: string; submissionId: string; }, deps: CheckInInstanceDeps = {}): Promise<Staf...`
- `export async function resolveCheckInFeedbackSend(session: SessionLike, input: ResolveCheckInFeedbackSendInput, deps: CheckInInstanceDeps = {}): Promise<ResolveCheckInFeedbackSendResult>`
- `export async function scheduleCheckInInstance(session: SessionLike, input: ScheduleCheckInInstanceInput, deps: CheckInInstanceDeps = {}): Promise<ScheduleCheckInInstanceResult>`
- `export async function sendCheckInFeedback(session: SessionLike, input: SendCheckInFeedbackInput, deps: CheckInInstanceDeps = {}): Promise<SendCheckInFeedbackResult>`
- `export async function submitCheckInInstance(session: SessionLike, input: SubmitCheckInInstanceInput, deps: CheckInInstanceDeps = {}): Promise<SubmitCheckInInstanceResult>`

## `lib/checkin/schedules.ts`

- `export const CHECKIN_SCHEDULE_HORIZON_DAYS = CHECKIN_SCHEDULE_LIMITS.horizonDays`
- `export const CHECKIN_SCHEDULE_LIMITS = { idMax: 128, horizonDays: 56, projectionRangeMaxDays: 95, } as const`
- `export { CheckInInstanceError }`
- `export type CheckInRuleWeekday = (typeof WEEKDAYS)[number]`
- `export type CheckInScheduleDeps = { db?: PrismaLike; now?: () => Date; }`
- `export type CheckInScheduleRuleItem = { ruleId: string; formId: string; formName: string; weekday: CheckInRuleWeekday; localTimeMinutes: number; timezone: string; startDate: string; endDate: string...`
- `export type CreateCheckInScheduleRuleInput = { workspaceId: string; clientProfileId: string; formId: string; weekday: string; localTimeMinutes: number; timezone: string; startDate: string; endDate?...`
- `export type CreateCheckInScheduleRuleResult = | { status: "created"; ruleId: string } | { status: "replaced"; ruleId: string; endedRuleId: string }`
- `export type GenerateCheckInScheduleRuleInput = { workspaceId: string; clientProfileId: string; ruleId: string; }`
- `export type GenerateCheckInScheduleRuleResult = | { status: "generated"; examinedThrough: string | null; created: number; alreadyGenerated: number; skippedConflicts: string[]; unrepresentable: stri...`
- `export type ProjectCheckInScheduleOccurrencesInput = { workspaceId: string; clientProfileId: string; rangeStart: string; rangeEnd: string; }`
- `export type ProjectCheckInScheduleOccurrencesResult = { items: ProjectedCheckInOccurrence[]; unrepresentable: { ruleId: string; occurrenceDate: string }[]; }`
- `export type ProjectedCheckInOccurrence = { ruleId: string; formId: string; occurrenceDate: string; dueAt: string; }`
- `export type SetCheckInScheduleRuleStatusInput = { workspaceId: string; clientProfileId: string; ruleId: string; action: "pause" | "resume" | "end"; }`
- `export type SetCheckInScheduleRuleStatusResult = | { status: "paused" } | { status: "resumed" } | { status: "ended"; cancelledCount: number }`
- `export async function createCheckInScheduleRule(session: SessionLike, input: CreateCheckInScheduleRuleInput, deps: CheckInScheduleDeps = {}): Promise<CreateCheckInScheduleRuleResult>`
- `export function enumerateRuleOccurrenceDates(input: { weekday: CheckInRuleWeekday; startDate: string; endDate: string | null; todayLocal: string; }): string[]`
- `export function enumerateRuleOccurrenceDatesInRange(input: { weekday: CheckInRuleWeekday; startDate: string; endDate: string | null; rangeStart: string; rangeEnd: string; }): string[]`
- `export async function generateCheckInScheduleRuleInstances(session: SessionLike, input: GenerateCheckInScheduleRuleInput, deps: CheckInScheduleDeps = {}): Promise<GenerateCheckInScheduleRuleResult>`
- `export async function listCheckInScheduleRules(session: SessionLike, input: { workspaceId: string; clientProfileId: string }, deps: CheckInScheduleDeps = {}): Promise<{ items: CheckInScheduleRuleIt...`
- `export function parseCheckInScheduleLocalDate(raw: unknown): string | null`
- `export function parseCheckInScheduleLocalTimeMinutes(raw: unknown): number | null`
- `export function parseCheckInScheduleWeekday(raw: unknown): CheckInRuleWeekday | null`
- `export async function projectCheckInScheduleOccurrences(session: SessionLike, input: ProjectCheckInScheduleOccurrencesInput, deps: CheckInScheduleDeps = {}): Promise<ProjectCheckInScheduleOccurrenc...`
- `export async function setCheckInScheduleRuleStatus(session: SessionLike, input: SetCheckInScheduleRuleStatusInput, deps: CheckInScheduleDeps = {}): Promise<SetCheckInScheduleRuleStatusResult>`

## `lib/checkin/timezone.ts`

- `export const CHECKIN_TZ_LIMITS = { minIsoYear: 2000, maxIsoYear: 2100, timezoneMax: 64, gapBoundMinutes: 181, } as const`
- `export type ResolveLocalInstantResult = | { status: "ok"; instant: Date } | { status: "unrepresentable" } | { status: "invalid" }`
- `export function isValidIanaTimeZone(zone: string): boolean`
- `export function localDateInZone(instant: Date, zone: string): string | null`
- `export function resolveLocalInstant(zone: string, localDate: string, minuteOfDay: number): ResolveLocalInstantResult`

## `lib/checkin/tracker-context.ts`

- `export type CheckInTrackerContextDeps = { db?: PrismaLike; checkinRegistry?: ConsentPolicyRegistry; dailyRegistry?: ConsentPolicyRegistry; authorize?: typeof authorize; }`
- `export type CheckInTrackerContextInput = { workspaceId: string; clientProfileId: string; submissionId: string; entryDate: string; }`
- `export type CheckInTrackerContextResult = StaffDailyEntryDetail`
- `export async function readCheckInReviewTrackerContext(session: SessionLike, input: CheckInTrackerContextInput, deps: CheckInTrackerContextDeps = {}): Promise<StaffDailyEntryDetail>`
- `export function reconcileTrackerContextScopes(checkinScope: string | null | undefined, dailyScope: string | null | undefined): "workspace" | "assigned" | "denied"`

## `lib/coaching/client-setup-boundary.ts`

- `export type ActionResult<T> = { ok: true; value: T } | { ok: false; message: string }`
- `export type AssignFormChoices = { clients: SetupClientChoice[]; templates: SetupTemplateChoice[]; listFingerprint: string; }`
- `export type SetupClientChoice = { name: string }`
- `export type SetupRowList = { items: TemplateAssignmentSummary[]; nextCursor: string | null; fingerprint: string; }`
- `export type SetupTemplateChoice = { name: string; latestVersionSeq: number; }`
- `export type { TemplateAssignmentSummary }`
- `export async function assignTemplateFromAction(session: SessionLike, input: { workspaceId: string; clientIndex: number; templateIndex: number; listFingerprint: string; }, deps: { db?: PrismaClient ...`
- `export async function cancelSetupAssignmentFromAction(session: SessionLike, input: { workspaceId: string; pinIndex: number; rowFingerprint: string }, deps: { db?: PrismaClient } = {}): Promise<Acti...`
- `export async function listAssignFormChoices(session: SessionLike, input: { workspaceId: string }, deps: { db?: PrismaClient } = {}): Promise<ActionResult<AssignFormChoices>>`
- `export async function listClientSetupsForWorkspace(session: SessionLike, input: { workspaceId: string; limit?: number; cursor?: string }, deps: { db?: PrismaClient } = {}): Promise<ActionResult<Set...`

## `lib/coaching/client-setup-gate.ts`

- `export const CLIENT_SETUP_LIMITS = { idMax: 128, listDefaultLimit: 25, listMaxLimit: 100, indexMax: 100_000, } as const`
- `export class ClientSetupError extends Error (1 members)`
- `export type ClientSetupErrorCode = | "invalid_input" | "assignment_not_accessible" | "assignment_not_active" | "client_not_eligible" | "template_not_eligible" | "assignment_conflict" | "serializati...`
- `export function isClientSetupEnabled(flag: string | undefined, env: RuntimeEnv = process.env): boolean`

## `lib/coaching/client-setup-transition-boundary.ts`

- `export type ActionResult<T> = { ok: true; value: T } | { ok: false; message: string }`
- `export type SerializedDiffEntry = { category: DiffCategory; parameterKey: string | null; parameterLabel: string | null; reboundParameterKey: string | null; reboundParameterLabel: string | null; det...`
- `export type SerializedProviderImpact = { consumerKey: string; contractVersion: number; affectedParameters: Array<{ parameterKey: string; impactRole: ImpactRole; count: string; earliestDate: string ...`
- `export type TransitionReviewPayload = { direction: TransitionDirection; templateName: string; currentVersionSeq: number; targetVersionSeq: number; targetPublishedAt: string; categories: Record<Diff...`
- `export type TransitionTargetsPayload = { canUpgrade: boolean; latestVersionSeq: number | null; currentVersionSeq: number; templateName: string; rollbackTargets: Array<{ index: number; versionSeq: n...`
- `export async function executeTransitionFromAction(session: SessionLike, input: { workspaceId: string; pinIndex: number; rowFingerprint: string; direction: string; targetIndex?: number; reviewFinger...`
- `export async function getTransitionTargetsFromAction(session: SessionLike, input: { workspaceId: string; pinIndex: number; rowFingerprint: string }, deps: Deps = {}): Promise<ActionResult<Transitio...`
- `export async function reviewTransitionFromAction(session: SessionLike, input: { workspaceId: string; pinIndex: number; rowFingerprint: string; direction: string; targetIndex?: number; }, deps: Deps...`
- `export function serializeTransitionReview(review: InternalTransitionReview): TransitionReviewPayload`

## `lib/coaching/client-setup-transition-gate.ts`

- `export class ClientSetupTransitionError extends Error (1 members)`
- `export type ClientSetupTransitionErrorCode = | "invalid_input" | "assignment_not_accessible" | "assignment_not_active" | "transition_not_available" | "no_upgrade_available" | "incoherent_definition...`
- `export function isClientSetupTransitionsEnabled(transitionsEnv: string | undefined, clientSetupEnv: string | undefined, env: RuntimeEnv = process.env): boolean`

## `lib/coaching/client-setup-transition.ts`

- `export type InternalTransitionReview = { workspaceId: string; clientProfileId: string; clientSetupId: string; pinId: string; templateId: string; templateName: string; templateStatus: string; actorM...`
- `export type InternalTransitionTargets = { clientProfileId: string; templateId: string; templateName: string; currentVersionSeq: number; canUpgrade: boolean; latestVersionSeq: number | null; rollbac...`
- `export type ReviewFingerprintMaterial = { actorMemberId: string; workspaceId: string; clientProfileId: string; pinId: string; currentVersionId: string; direction: TransitionDirection; targetVersion...`
- `export function computeReviewFingerprint(material: ReviewFingerprintMaterial): string`
- `export async function executeClientSetupTransition(session: SessionLike, input: { workspaceId: string; pinIndex: number; rowFingerprint: string; direction: TransitionDirection; targetIndex?: number...`
- `export async function getTransitionTargets(session: SessionLike, input: { workspaceId: string; pinIndex: number; rowFingerprint: string }, client: PrismaClient = defaultPrisma): Promise<InternalTra...`
- `export function isTransitionDirection(value: unknown): value is TransitionDirection`
- `export async function resolveTransitionPin(session: SessionLike, input: { workspaceId: string; pinIndex: number; rowFingerprint: string }, client: PrismaClient = defaultPrisma): Promise<{ pinId: st...`
- `export async function reviewClientSetupTransition(session: SessionLike, input: { workspaceId: string; pinIndex: number; rowFingerprint: string; direction: TransitionDirection; targetIndex?: number;...`

## `lib/coaching/client-setup.ts`

- `export type AssignableSetupClient = { id: string; name: string }`
- `export type AssignableTemplate = { id: string; name: string; latestVersionSeq: number; createdAt: string; }`
- `export type TemplateAssignmentSummary = { index: number; clientName: string; templateName: string; templateArchived: boolean; versionSeq: number; status: "ACTIVE" | "SUPERSEDED" | "CANCELLED"; assi...`
- `export async function cancelClientSetupAssignment(session: SessionLike, input: { workspaceId: string; pinId: string }, client: PrismaClient = defaultPrisma): Promise<void>`
- `export { computeSelectionFingerprint } from "./selection-fingerprint"`
- `export async function createClientSetupAssignment(session: SessionLike, input: { workspaceId: string; clientProfileId: string; templateId: string }, client: PrismaClient = defaultPrisma): Promise<{...`
- `export async function listAssignableSetupClients(session: SessionLike, input: { workspaceId: string }, client: PrismaClient = defaultPrisma): Promise<AssignableSetupClient[]>`
- `export async function listAssignableTemplates(session: SessionLike, input: { workspaceId: string }, client: PrismaClient = defaultPrisma): Promise<AssignableTemplate[]>`
- `export async function listClientSetupPinIds(session: SessionLike, input: { workspaceId: string }, client: PrismaClient = defaultPrisma): Promise<{ ids: string[]; fingerprint: string }>`
- `export async function listClientSetups(session: SessionLike, input: { workspaceId: string; limit?: number; cursor?: string }, client: PrismaClient = defaultPrisma): Promise<{ items: TemplateAssignm...`
- `export async function resolveAssignSelection(session: SessionLike, input: { workspaceId: string; clientIndex: number; templateIndex: number; fingerprint: string; }, client: PrismaClient = defaultPr...`
- `export async function resolveCancelSelection(session: SessionLike, input: { workspaceId: string; pinIndex: number; fingerprint: string }, client: PrismaClient = defaultPrisma): Promise<{ pinId: str...`

## `lib/coaching/daily-entry-eligibility.ts`

- `export type DailyEntryEligibilityReason = | "snapshot_malformed" | "duplicate_parameter" | "metadata_incoherent" | "missing_classification" | "malformed_classification" | "specialist_classification...`
- `export function evaluateDailyEntryVersionEligibility(definition: unknown): { eligible: boolean; reasonCodes: DailyEntryEligibilityReason[]; }`

## `lib/coaching/daily-entry-impact.ts`

- `export const DAILY_ENTRY_CONSUMER: ConsumerDeclaration`
- `export function createDailyEntryImpactProvider(db: PrismaLike, clientProfileId: string): TransitionImpactProvider`

## `lib/coaching/gate.ts`

- `export const COACHING_LIMITS = { definitionMaxBytes: 64 * 1024, maxDepth: 4, maxSections: 32, maxItemsPerSection: 64, maxItemsPerTemplate: 128, maxOptions: 64, labelMax: 120, helpTextMax: 500, keyM...`
- `export function isCoachingTemplatesEnabled(flag: string | undefined, env: RuntimeEnv = process.env): boolean`

## `lib/coaching/impact-consumers.ts`

- `export const DECLARED_CONSUMERS: readonly ConsumerDeclaration[]`
- `export const PROVIDER_FACTORIES: Readonly< Record<string, TransitionImpactProviderFactory> >`
- `export type TransitionImpactProviderFactory = (ctx: { db: PrismaLike; clientProfileId: string; }) => TransitionImpactProvider`
- `export function composeProviderSet(db: PrismaLike, clientProfileId: string): ProviderSet`
- `export function validateProviderFactories(declarations: readonly ConsumerDeclaration[], factories: Readonly<Record<string, TransitionImpactProviderFactory>>): void`

## `lib/coaching/parameter-classification-gate.ts`

- `export function isParameterClassificationEnabled(flag: string | undefined, env: RuntimeEnv = process.env): boolean`

## `lib/coaching/parameters-boundary.ts`

- `export type ActionResult<T> = { ok: true; value: T } | { ok: false; message: string }`
- `export type BoundaryDeps = { db?: PrismaClient }`
- `export type { ParameterDetail }`
- `export type { ParameterSummary }`
- `export async function archiveParameterFromAction(_session: SessionLike, _input: { workspaceId: string; parameterId: string }, _deps: BoundaryDeps = {}): Promise<ActionResult<{ parameterId: string }>>`
- `export async function classifyParameterFromAction(_session: SessionLike, _input: { workspaceId: string; parameterIndex: number; expectedRevision: number; fingerprint: string; classification: string...`
- `export async function createParameterFromAction(_session: SessionLike, _input: { workspaceId: string; inputJson: string }, _deps: BoundaryDeps = {}): Promise<ActionResult<{ parameterId: string; key...`
- `export async function getParameterForWorkspace(_session: SessionLike, _input: { workspaceId: string; parameterId: string }, _deps: BoundaryDeps = {}): Promise<ActionResult<ParameterDetail>>`
- `export async function listClassificationContext(_session: SessionLike, _input: { workspaceId: string }, _deps: BoundaryDeps = {}): Promise< ActionResult<{ fingerprint: string; indexByParameterId: R...`
- `export async function listParametersForWorkspace(_session: SessionLike, _input: { workspaceId: string; limit?: number; cursor?: string }, _deps: BoundaryDeps = {}): Promise< ActionResult<{ paramete...`
- `export async function updateParameterFromAction(_session: SessionLike, _input: { workspaceId: string; parameterId: string; expectedRevision: number; inputJson: string; }, _deps: BoundaryDeps = {}):...`

## `lib/coaching/parameters.ts`

- `export const ASSIGNABLE_CLASSIFICATIONS = [ "GENERAL_HEALTH", "CYCLE", ] as const satisfies readonly ParameterDataClassification[]`
- `export const PARAMETER_CLASSIFICATIONS = [ "GENERAL_HEALTH", "CYCLE", "BLOODWORK", "PED_HRT", ] as const`
- `export const PARAMETER_KINDS = [ "MEASUREMENT", "RATING", "TIME", "DURATION", "OPTION", "TEXT", ] as const`
- `export type ParameterDataClassification = (typeof PARAMETER_CLASSIFICATIONS)[number]`
- `export type ParameterDetail = ParameterSummary & { helpText: string | null; unit: string | null; ratingScheme: RatingScheme | null; options: ParameterOption[]; validation: ParameterValidation | nul...`
- `export class ParameterError extends Error (1 members)`
- `export type ParameterErrorCode = | "invalid_input" | "parameter_not_accessible" | "parameter_archived" | "stale_revision" | "stale_selection" | "semantics_locked" | "already_classified" | "classifi...`
- `export type ParameterKind = (typeof PARAMETER_KINDS)[number]`
- `export type ParameterOption = { optionId: string; label: string }`
- `export type ParameterState = { id: string; key: string; kind: ParameterKind; label: string; helpText: string | null; unit: string | null; ratingScheme: RatingScheme | null; options: ParameterOption...`
- `export type ParameterSummary = { id: string; key: string; kind: ParameterKind; label: string; status: "ACTIVE" | "ARCHIVED"; dataClassification: ParameterDataClassification | null; revision: number...`
- `export type ParameterValidation = { min?: number; max?: number }`
- `export const RATING_SCHEMES = [ "SCALE_1_10", "SCALE_1_5", "WORD_LABELS", ] as const`
- `export type RatingScheme = (typeof RATING_SCHEMES)[number]`
- `export function applyParameterEdits(state: ParameterState, patch: unknown, opts: { published?: boolean } = {}): ParameterState`
- `export async function archiveParameter(session: SessionLike, input: { workspaceId: string; parameterId: string }, client?: PrismaClient): Promise<{ parameterId: string }>`
- `export async function classifyParameter(session: SessionLike, input: { workspaceId: string; parameterIndex: number; expectedRevision: number; fingerprint: string; classification: ParameterDataClass...`
- `export async function createParameter(session: SessionLike, input: { workspaceId: string; input: unknown }, client?: PrismaClient): Promise<{ parameterId: string; key: string }>`
- `export async function getParameter(session: SessionLike, input: { workspaceId: string; parameterId: string }, client?: PrismaClient): Promise<ParameterDetail>`
- `export async function listClassifiableParameterIds(session: SessionLike, input: { workspaceId: string }, client: PrismaClient | Prisma.TransactionClient = defaultPrisma): Promise<{ ids: string[]; f...`
- `export async function listParameters(session: SessionLike, input: { workspaceId: string; limit?: number; cursor?: string }, client?: PrismaClient): Promise<{ parameters: ParameterSummary[]; nextCur...`
- `export async function updateParameter(session: SessionLike, input: { workspaceId: string; parameterId: string; expectedRevision: number; input: unknown; }, client?: PrismaClient): Promise<{ revisio...`
- `export function validateParameterCreate(input: unknown): { kind: ParameterKind; label: string; helpText: string | null; unit: string | null; ratingScheme: RatingScheme | null; options: ParameterOpt...`

## `lib/coaching/selection-fingerprint.ts`

- `export function computeSelectionFingerprint(...groups: string[][]): string`

## `lib/coaching/templates-boundary.ts`

- `export type ActionResult<T> = { ok: true; value: T } | { ok: false; message: string }`
- `export type BoundaryDeps = { db?: PrismaClient }`
- `export type { TemplateDetail }`
- `export type { TemplateDraft }`
- `export type { TemplateSummary }`
- `export type { TemplateVersionDefinition }`
- `export async function archiveTemplateFromAction(_session: SessionLike, _input: { workspaceId: string; templateId: string }, _deps: BoundaryDeps = {}): Promise<ActionResult<{ templateId: string }>>`
- `export async function createTemplateFromAction(_session: SessionLike, _input: { workspaceId: string; name: string }, _deps: BoundaryDeps = {}): Promise<ActionResult<{ templateId: string }>>`
- `export async function getTemplateForWorkspace(_session: SessionLike, _input: { workspaceId: string; templateId: string }, _deps: BoundaryDeps = {}): Promise<ActionResult<TemplateDetail>>`
- `export async function getTemplateVersionForWorkspace(_session: SessionLike, _input: { workspaceId: string; templateId: string; versionSeq: number; }, _deps: BoundaryDeps = {}): Promise< ActionResul...`
- `export async function listTemplatesForWorkspace(_session: SessionLike, _input: { workspaceId: string }, _deps: BoundaryDeps = {}): Promise<ActionResult<{ templates: TemplateSummary[] }>>`
- `export async function openTemplateDraftFromAction(_session: SessionLike, _input: { workspaceId: string; templateId: string }, _deps: BoundaryDeps = {}): Promise<ActionResult<{ revision: number; def...`
- `export async function publishTemplateFromAction(_session: SessionLike, _input: { workspaceId: string; templateId: string; expectedRevision: number; }, _deps: BoundaryDeps = {}): Promise<ActionResul...`
- `export async function saveTemplateDraftFromAction(_session: SessionLike, _input: { workspaceId: string; templateId: string; expectedRevision: number; draftJson: string; name?: string; }, _deps: Bou...`

## `lib/coaching/templates.ts`

- `export class CoachingTemplateError extends Error (1 members)`
- `export type CoachingTemplateErrorCode = | "invalid_input" | "template_not_accessible" | "template_archived" | "no_open_draft" | "stale_revision" | "forbidden_item_id" | "parameter_not_publishable" ...`
- `export type DraftItem = { itemId: string; parameterKey: string; parameterId: string; acknowledgedParameterRevision: number; required: boolean; order: number; }`
- `export type DraftSection = { sectionId: string; label: string; order: number; items: DraftItem[]; }`
- `export type ParameterResolution = { id: string; revision: number } | null`
- `export type TemplateDetail = { id: string; name: string; status: "ACTIVE" | "ARCHIVED"; draftRevision: number; draft: TemplateDraft | null; versions: Array<{ versionSeq: number; publishedAt: string...`
- `export type TemplateDraft = { title: string; sections: DraftSection[] }`
- `export type TemplateSummary = { id: string; name: string; status: "ACTIVE" | "ARCHIVED"; draftRevision: number; hasDraft: boolean; latestVersionSeq: number | null; updatedAt: string; }`
- `export type TemplateVersionDefinition = { title: string; sections: Array<{ sectionId: string; label: string; order: number; items: Array<{ itemId: string; parameterId: string; parameterKey: string;...`
- `export async function archiveTemplate(session: SessionLike, input: { workspaceId: string; templateId: string }, client?: PrismaClient): Promise<{ templateId: string }>`
- `export async function createTemplate(session: SessionLike, input: { workspaceId: string; name: string }, client?: PrismaClient): Promise<{ templateId: string }>`
- `export async function getTemplate(session: SessionLike, input: { workspaceId: string; templateId: string }, client?: PrismaClient): Promise<TemplateDetail>`
- `export async function getTemplateVersion(session: SessionLike, input: { workspaceId: string; templateId: string; versionSeq: number }, client?: PrismaClient): Promise<{ versionId: string; versionSe...`
- `export async function listTemplates(session: SessionLike, input: { workspaceId: string }, client?: PrismaClient): Promise<TemplateSummary[]>`
- `export async function openTemplateDraft(session: SessionLike, input: { workspaceId: string; templateId: string }, client?: PrismaClient): Promise<{ revision: number; definition: TemplateDraft }>`
- `export async function publishTemplate(session: SessionLike, input: { workspaceId: string; templateId: string; expectedRevision: number }, client?: PrismaClient): Promise<{ versionSeq: number }>`
- `export async function saveTemplateDraft(session: SessionLike, input: { workspaceId: string; templateId: string; expectedRevision: number; draft: unknown; name?: string; }, client?: PrismaClient): P...`
- `export function validateTemplateDraft(input: unknown, knownIds: { sectionIds: Set<string>; itemIds: Set<string> }, opts: { resolveParameter: (keyOrId: string) => ParameterResolution; forPublish: bo...`

## `lib/coaching/transition-diff.ts`

- `export const DIFF_CATEGORY_RANK = { removed: 0, rebound: 1, added: 2, moved: 3, required: 4, display: 5, } as const`
- `export type DiffCategory = keyof typeof DIFF_CATEGORY_RANK`
- `export type DiffDetail = | "item_removed" | "item_rebound" | "item_added" | "item_moved" | "required_on" | "required_off" | "label_changed" | "help_changed" | "group_changed" | "title_changed" | "s...`
- `export const TRANSITION_SUMMARY_REASONS = ["REMOVED", "REBOUND"] as const`
- `export type TransitionCategories = Record<DiffCategory, number>`
- `export type TransitionDiff = { entries: TransitionDiffEntry[]; categories: TransitionCategories; warningCount: number; defective: boolean; diffHash: string; }`
- `export type TransitionDiffEntry = { category: DiffCategory; parameterId: string; parameterKey: string; parameterLabel: string | null; reboundParameterId?: string; reboundParameterKey?: string; rebo...`
- `export type TransitionDirection = "UPGRADE" | "ROLLBACK"`
- `export type TransitionSummary = { schemaVersion: 1; direction: TransitionDirection; categories: TransitionCategories; reasonCodes: TransitionSummaryReason[]; }`
- `export type TransitionSummaryReason = (typeof TRANSITION_SUMMARY_REASONS)[number]`
- `export function buildTransitionSummary(direction: TransitionDirection, categories: TransitionCategories): TransitionSummary`
- `export function computeDiffHash(entries: TransitionDiffEntry[]): string`
- `export function computeTransitionDiff(fromRaw: unknown, toRaw: unknown): TransitionDiff`
- `export function validateTransitionSummary(value: unknown): TransitionSummary | null`

## `lib/coaching/transition-impact.ts`

- `export const BLOCKED_REASON_RANK: Record<BlockedReasonCode, number>`
- `export type BlockedReasonCode = | "TARGET_INELIGIBLE" | "PROVIDER_UNAVAILABLE" | "PROVIDER_VERSION_MISMATCH" | "PROVIDER_EXECUTION_FAILED" | "PROVIDER_OUTPUT_INVALID" | "PROVIDER_REPORTED_BLOCK"`
- `export type CanonicalCount = string`
- `export type ConsumerDeclaration = { consumerKey: string; contractVersion: number; outputSchemaVersion: number; }`
- `export const IMPACT_REASON_RANK: Record<ImpactReasonCode, number>`
- `export const IMPACT_ROLE_RANK: Record<ImpactRole, number>`
- `export type ImpactReasonCode = "REMOVED_WITH_HISTORY" | "REBOUND_WITH_HISTORY"`
- `export type ImpactRole = "REMOVED" | "REBOUND_FROM" | "REBOUND_TO"`
- `export const PROVIDER_SET_MANIFEST_VERSION = 1`
- `export type ParameterImpact = { parameterId: string; parameterKey: string; impactRole: ImpactRole; count: CanonicalCount; earliestDate: string | null; latestDate: string | null; reasonCode: ImpactR...`
- `export type ProviderImpact = { consumerKey: string; contractVersion: number; affectedParameters: ParameterImpact[]; blockedReasonCodes: BlockedReasonCode[]; }`
- `export type ProviderSet = { declarations: readonly ConsumerDeclaration[]; providers: Readonly<Record<string, TransitionImpactProvider>>; }`
- `export type TransitionImpactInput = { direction: TransitionDirection; removed: Array<{ parameterId: string; parameterKey: string }>; reboundFrom: Array<{ parameterId: string; parameterKey: string }...`
- `export type TransitionImpactProvider = { evaluate( input: TransitionImpactInput, ): ProviderImpact | Promise<ProviderImpact>; }`
- `export function canonicalProviderOutputsHash(impacts: readonly ProviderImpact[]): string`
- `export async function collectProviderImpacts(set: ProviderSet, input: TransitionImpactInput): Promise<{ impacts: ProviderImpact[]; blockedReasonCodes: BlockedReasonCode[]; }>`
- `export function isCanonicalCalendarDate(value: unknown): value is string`
- `export function isCanonicalCount(value: unknown): value is CanonicalCount`
- `export function isValidImpactBounds(count: unknown, earliestDate: unknown, latestDate: unknown): boolean`
- `export function providerSetIdentity(declarations: readonly ConsumerDeclaration[]): string`
- `export function validateProviderSet(declarations: readonly ConsumerDeclaration[], providers: Readonly<Record<string, TransitionImpactProvider>>): void`

## `lib/consent.ts`

- `export type AuthorizedHealthOperation = { userId: string; workspaceId: string; clientProfileId: string; grantedScope: string; }`
- `export const BASE_CONSENTS: readonly ConsentKind[]`
- `export const CHECKIN_DEV_CONSENT = { PRIVACY_NOTICE: "check-in-dev-privacy-v1", HEALTH_DATA: "check-in-dev-health-v1", } as const`
- `export const CONSENT_KINDS: readonly ConsentKind[]`
- `export class ConsentError extends Error (1 members)`
- `export type ConsentErrorCode = | "invalid_input" | "policy_not_configured" | "coach_attested_unsupported" | "ped_hrt_not_approved" | "consent_missing" | "consent_conflict" | "audit_not_wired_for_ex...`
- `export type ConsentKind = | "PRIVACY_NOTICE" | "HEALTH_DATA" | "CYCLE" | "PHOTOS" | "BLOODWORK" | "PED_HRT"`
- `export type ConsentMutationResult = { kind: ConsentKind; changed: boolean }`
- `export type ConsentPolicyRegistry = { currentVersion(kind: ConsentKind): string | null; }`
- `export type ConsentRow = { kind: string; version: string; revokedAt: Date | null; }`
- `export type ConsentServiceDeps = { client?: PrismaClient; registry?: ConsentPolicyRegistry; }`
- `export type ConsentSource = "CLIENT_SELF" | "COACH_ATTESTED"`
- `export type ConsentStatusPage = { items: ConsentStatusRow[]; nextCursor: string | null; }`
- `export type ConsentStatusRow = { id: string; kind: ConsentKind; version: string; grantedAt: Date; revokedAt: Date | null; }`
- `export type ConsentVersionPair = { kind: ConsentKind; version: string }`
- `export type HealthOperationDeps = { client?: PrismaLike; registry?: ConsentPolicyRegistry; }`
- `export const MEALPLAN_DEV_CONSENT = { PRIVACY_NOTICE: "meal-plan-dev-privacy-v1", HEALTH_DATA: "meal-plan-dev-health-v1", } as const`
- `export const ONBOARDING_SUBMISSION_DEV_CONSENT = { PRIVACY_NOTICE: "onboarding-submission-dev-privacy-v1", HEALTH_DATA: "onboarding-submission-dev-health-v1", } as const`
- `export type OnboardingSubmissionConsentEnv = RuntimeEnv & { ENABLE_ONBOARDING_SUBMISSION?: string; }`
- `export type SubmissionRuntimeClass = RuntimeClass`
- `export const TRAINING_DEV_CONSENT = { PRIVACY_NOTICE: "training-plan-dev-privacy-v1", HEALTH_DATA: "training-plan-dev-health-v1", } as const`
- `export function assertConsentMutationsExternallyExposable(env: ConsentGateEnv = process.env): void`
- `export async function authorizeHealthOperation(session: SessionLike, input: { resource: Resource; action: "read" | "write"; workspaceId?: string; clientProfileId?: string; }, deps: HealthOperationD...`
- `export const classifySubmissionRuntime: ( env?: RuntimeEnv, ) => SubmissionRuntimeClass`
- `export function createStaticConsentPolicy(versions: Partial<Record<ConsentKind, string>>): ConsentPolicyRegistry`
- `export async function grantOwnConsent(session: SessionLike, input: { workspaceId: string; clientProfileId: string; kind: ConsentKind }, deps: ConsentServiceDeps = {}): Promise<ConsentMutationResult>`
- `export function hasExactActiveConsent(rows: readonly ConsentRow[], kind: ConsentKind, version: string): boolean`
- `export function isConsentKind(value: unknown): value is ConsentKind`
- `export async function readOwnConsentStatus(session: SessionLike, input: { workspaceId: string; clientProfileId: string; limit?: number; cursor?: string; }, deps: ConsentServiceDeps = {}): Promise<C...`
- `export function requiredConsentsFor(resource: Resource): readonly ConsentKind[] | undefined`
- `export function resolveCheckInConsentPolicy(env: { ENABLE_CHECK_INS?: string; APP_ENV?: string; NODE_ENV?: string; } = process.env): ConsentPolicyRegistry`
- `export function resolveMealPlanConsentPolicy(env: { ENABLE_MEAL_PLANS?: string; APP_ENV?: string; NODE_ENV?: string; } = process.env): ConsentPolicyRegistry`
- `export function resolveOnboardingSubmissionConsentPolicy(env: OnboardingSubmissionConsentEnv = process.env): ConsentPolicyRegistry`
- `export function resolveTrainingConsentPolicy(env: { ENABLE_TRAINING_PLANS?: string; APP_ENV?: string; NODE_ENV?: string; } = process.env): ConsentPolicyRegistry`
- `export async function revokeOwnConsent(session: SessionLike, input: { workspaceId: string; clientProfileId: string; kind: ConsentKind }, deps: ConsentServiceDeps = {}): Promise<ConsentMutationResult>`
- `export const unconfiguredConsentPolicy: ConsentPolicyRegistry`

## `lib/daily-entry/boundary.ts`

- `export type DailyEntryActionResult<T> = { ok: true; value: T } | { ok: false; message: string }`
- `export async function saveDailyEntryFromAction(session: SessionLike, input: unknown, deps: { entryEnabled?: boolean; db?: PrismaClient; registry?: ConsentPolicyRegistry; } = {}): Promise<DailyEntry...`

## `lib/daily-entry/canonical.ts`

- `export const FORM_TOKEN_DOMAIN = "DAILY-ENTRY-FORM-v1"`
- `export type HashParam = { parameterId: string; parameterKey: string; dataClassification: string | null; kind: string; snapshotRevision: number; sectionId: string; itemId: string; value: TaggedValue; }`
- `export const REVISION_HASH_DOMAIN = "DAILY-ENTRY-REV-v1"`
- `export type TaggedValue = | { tag: "absent" } | { tag: "measurement"; canonical: string } | { tag: "rating"; value: number } | { tag: "option"; optionId: string } | { tag: "text"; value: string }`
- `export function canonicalizeDecimal(raw: string): string | null`
- `export function computeDailyEntryFormToken(input: { workspaceId: string; clientProfileId: string; entryDate: string; pinId: string; templateVersionId: string; currentRevision: | { tag: "absent" } |...`
- `export function computeRevisionCanonicalHash(input: { pinId: string; templateVersionId: string; params: HashParam[]; }): string`

## `lib/daily-entry/gate.ts`

- `export class DailyEntryError extends Error (1 members)`
- `export type DailyEntryErrorCode = | "invalid_input" | "not_available" | "stale_form" | "consent_missing" | "policy_not_configured" | "ineligible" | "no_active_setup" | "serialization_conflict"`
- `export type DailyEntryMode = "off" | "persistent" | "conflict"`
- `export function isDailyEntryEnabled(flag: string | undefined, env: RuntimeEnv = process.env): boolean`
- `export function isDailyEntryPersistenceUsable(entryEnv: string | undefined, prototypeEnv: string | undefined, env: RuntimeEnv = process.env): boolean`
- `export { isDailyPrototypeEnabled } from "../daily-prototype"`
- `export function resolveDailyEntryMode(entryEnv: string | undefined, prototypeEnv: string | undefined, env: RuntimeEnv = process.env): DailyEntryMode`

## `lib/daily-entry/service.ts`

- `export const DAILY_ENTRY_DEV_CONSENT = { PRIVACY_NOTICE: "daily-entry-dev-privacy-v1", HEALTH_DATA: "daily-entry-dev-health-v1", } as const`
- `export type DailyEntryDeps = { db?: PrismaClient; registry?: ConsentPolicyRegistry; }`
- `export { DailyEntryError } from "./gate"`
- `export type DailyEntryHistoryEntry = { entryDate: string; declaredAt: string; revisionCount: number; values: DailyEntryHistoryRow[]; }`
- `export type DailyEntryHistoryRow = { parameterKey: string; label: string; unit: string | null; display: string; }`
- `export type DailyEntrySurface = | { state: "ready"; formToken: string; entryDate: string; sections: DailyEntrySurfaceSection[]; history: DailyEntryHistoryEntry[]; } | { state: "not_applicable" } | ...`
- `export type DailyEntrySurfaceItem = { ordinal: number; parameterKey: string; label: string; helpText: string | null; unit: string | null; kind: string; required: boolean; ratingScheme: string | nul...`
- `export type DailyEntrySurfaceSection = { sectionKey: string; label: string; items: DailyEntrySurfaceItem[]; }`
- `export const STAFF_ENTRY_PAGE_SIZE = 25`
- `export type SaveDailyEntryInput = { workspaceId: string; entryDate: string; formToken: string; values: OrdinalValue[]; }`
- `export type SaveDailyEntryResult = { status: "saved"; revisionSeq: number } | { status: "no_op" }`
- `export type StaffDailyEntryDetail = { entryDate: string; revisionSeq: number; revisionCount: number; declaredAt: string; values: DailyEntryHistoryRow[]; }`
- `export type StaffDailyEntryListItem = { entryDate: string; revisionCount: number; currentRevisionSeq: number | null; }`
- `export type StaffDailyEntryListResult = | { state: "ready"; clientName: string; items: StaffDailyEntryListItem[]; nextCursor: string | null; } | { state: "consent_missing" }`
- `export function dailyEntryConsentRegistry(entryFlagEnabled: boolean): ConsentPolicyRegistry`
- `export async function listStaffDailyEntries(session: SessionLike, input: { workspaceId: string; clientProfileId: string; cursor?: string }, deps: DailyEntryDeps = {}): Promise<StaffDailyEntryListRe...`
- `export async function loadDailyEntrySurface(session: SessionLike, input: { workspaceId: string; entryDate?: string }, deps: DailyEntryDeps = {}): Promise<DailyEntrySurface>`
- `export function parseDeclaredDate(raw: unknown): string`
- `export function parseStaffEntryCursor(raw: unknown): string | null`
- `export async function readStaffDailyEntryDetail(session: SessionLike, input: { workspaceId: string; clientProfileId: string; entryDate: string }, deps: DailyEntryDeps = {}): Promise<StaffDailyEntry...`
- `export async function readStaffDailyEntryDetailTx(tx: Prisma.TransactionClient, input: { workspaceId: string; clientProfileId: string; entryDate: string; ctx: Awaited<ReturnType<typeof authorize>>;...`
- `export async function saveDailyEntry(session: SessionLike, input: SaveDailyEntryInput, deps: DailyEntryDeps = {}): Promise<SaveDailyEntryResult>`

## `lib/daily-entry/validate.ts`

- `export const DAILY_ENTRY_TEXT_MAX = 5000`
- `export type OrdinalValue = { ordinal: number; raw: string }`
- `export type SnapshotParam = { parameterId: string; parameterKey: string; kind: string; required: boolean; unit: string | null; ratingScheme: string | null; options: Array<{ optionId: string; label:...`
- `export function resolveDailyEntryValues(values: readonly OrdinalValue[], ordinals: readonly string[], snapshot: readonly SnapshotParam[]): ResolveOk | ResolveErr`
- `export function validateDailyEntryValues(values: readonly OrdinalValue[], ordinals: readonly string[], snapshot: readonly SnapshotParam[]): ValidateOk | ValidateErr`

## `lib/daily-entry/week-groups.ts`

- `export type DailyEntryHistoryWeek = { weekStart: string; label: string; entries: DailyEntryHistoryEntry[]; }`
- `export function groupDailyHistoryByWeek(history: DailyEntryHistoryEntry[]): DailyEntryHistoryWeek[]`

## `lib/daily-prototype.ts`

- `export const BIOFEEDBACK_KEYS = biofeedback.map((field) => field.key)`
- `export const COMPUTED_COLUMNS = [ { key: "calories", label: "Calories (automatic)", marker: TODO_MARKER }, ]`
- `export const DAILY_FIELDS: DailyField[]`
- `export type DailyField = { key: string; label: string; group: string; type: DailyFieldType; unit?: string; min?: number; max?: number; options?: string[]; }`
- `export type DailyFieldType = "date" | "time" | "number" | "text" | "textarea" | "enum"`
- `export const EXCLUDED_FIELD_KEYS = [ "e2", "prog", "coachNote", "calories", "targets", "averages", ] as const`
- `export const TODO_MARKER = "TODO(product)"`
- `export type ValidationError = { field: string; message: string }`
- `export function isDailyPrototypeEnabled(flag: string | undefined, env: RuntimeEnv = process.env): boolean`
- `export function validateDailyEntry(values: Record<string, string>): ValidationError[]`

## `lib/daily-tracker.ts`

- `export const BIOFEEDBACK_FIELD_KEYS = biofeedbackFields.map( (field) => field.key, )`
- `export const DAILY_TRACKER_SECTIONS: readonly TrackerSection[]`
- `export const EXCLUDED_TRACKER_FIELD_KEYS = [ "e2", "prog", "coachNotes", "targets", "averages", ] as const`
- `export const TODO_PRODUCT_MARKER = "TODO(product)"`
- `export type TrackerField = { key: string; label: string; kind: TrackerFieldKind; unit?: string; hint?: string; min?: number; max?: number; options?: readonly string[]; }`
- `export type TrackerFieldKind = "text" | "date" | "time" | "number" | "enum" | "textarea" | "computed"`
- `export type TrackerSection = { id: string; name: string; fields: readonly TrackerField[]; requires?: readonly TrackerSectionRequirement[]; note?: string; }`
- `export type TrackerSectionRequirement = "cycleConsent"`
- `export type TrackerValidationError = { field: string; message: string }`
- `export type TrackerValues = Record<string, string>`
- `export function getSectionById(id: string): TrackerSection | undefined`
- `export function validateDailyTrackerValues(values: TrackerValues): TrackerValidationError[]`

## `lib/dashboard/adapter.ts`

- `export type DraftResult = { ok: true; draft: DashboardDraft } | { ok: false; reason: string }`
- `export function configToDraft(config: unknown): DraftResult`
- `export function draftToConfig(draft: unknown, visibility: WidgetVisibility = "client"): ValidationResult`

## `lib/dashboard/autosave-coordinator.ts`

- `export type AutosaveActions = { save(input: { workspaceId: string; clientProfileId: string; config: DashboardConfig; expectedRevision: number; }): Promise<AutosaveSaveResult>; reload(input: { works...`
- `export type AutosaveSaveResult = DashboardSafeResult<{ revision: number; config: DashboardConfig; }>`
- `export type AutosaveSlot = { key: string; userId: string; workspaceId: string; clientProfileId: string; canEdit: boolean; actions: AutosaveActions; latestConfig: DashboardConfig; confirmedRevision:...`
- `export type AutosaveState = "idle" | "saving" | "saved" | "failed" | "conflict" | "denied" | "readonly"`
- `export const abandonDashboardSlot = (slot: AutosaveSlot) =>`
- `export const acquireDashboardSlot = (input: { userId: string; workspaceId: string; clientProfileId: string; initialConfig: DashboardConfig; initialRevision: number; canEdit: boolean; actions: Autos...`
- `export const anyPendingSlot = (): AutosaveSlot | null =>`
- `export const cancelPendingTimer = () =>`
- `export const cancelSlotTimer = (slot: AutosaveSlot) =>`
- `export const clearAllDashboardSlots = () =>`
- `export const commitDashboardConfig = (slot: AutosaveSlot, next: DashboardConfig) =>`
- `export async function flushDashboardSlot(slot: AutosaveSlot, attempt = 1): Promise<void>`
- `export const flushPendingSlot = () =>`
- `export const reloadDashboardSlot = async (slot: AutosaveSlot) =>`
- `export const scheduleDashboardSlot = (slot: AutosaveSlot) =>`
- `export const slotPending = (slot: AutosaveSlot) =>`
- `export const stayDashboardSlot = (slot: AutosaveSlot) =>`
- `export const subscribeDashboardSlot = (slot: AutosaveSlot, listener: () => void): (() => void) =>`
- `export const travelDashboardConfig = (slot: AutosaveSlot, dir: "undo" | "redo") =>`

## `lib/dashboard/boundary.ts`

- `export type ClientDashboardLayout = { layoutId: string; config: DashboardConfig; updatedAt: string; }`
- `export type DashboardSafeResult<T> = | { ok: true; value: T } | { ok: false; code: | "denied" | "invalid_input" | "not_available" | "conflict" | "serialization_conflict"; message: string; }`
- `export async function readOwnDashboardLayout(session: Session, input: { workspaceId: string }, deps: DashboardDeps = {}): Promise<DashboardSafeResult<{ layout: ClientDashboardLayout | null }>>`
- `export async function readStaffDashboardLayout(session: Session, input: { workspaceId: string; clientProfileId: string }, deps: DashboardDeps = {}): Promise<DashboardSafeResult<{ layout: StaffDashb...`
- `export async function updateClientDashboardLayoutFromAction(session: Session, input: UpdateDashboardInput, deps: DashboardDeps = {}): Promise<DashboardSafeResult<{ revision: number; config: Dashboa...`

## `lib/dashboard/config-schema.ts`

- `export type BreakpointName = "desktop" | "tablet" | "mobile"`
- `export const CONNECTED_KINDS = new Set<WidgetKind>([ "CU04", "CU16", "CU03", "TL21", "TL22", ])`
- `export type DashboardConfig = { version: 1; name: string; widgets: WidgetInstance[]; layouts: Partial<Record<BreakpointName, Record<string, Rect>>>; widths: Partial<Record<BreakpointName, number>>; }`
- `export const HISTORY_PERIODS = ["auto", "3m", "6m", "1y"] as const`
- `export type Rect = { x: number; y: number; w: number; h: number; size: SizeName; }`
- `export const SETTINGS_LIMITS = LIMITS`
- `export const SIZE_OPTIONS = SIZES`
- `export type SizeName = (typeof SIZES)[number]`
- `export type ValidationResult = { ok: true; config: DashboardConfig } | { ok: false; reason: string }`
- `export const WIDGET_CATALOGUE: Record< WidgetKind, { name: string; category: string; connected: boolean } >`
- `export const WIDGET_KINDS = [ "BN21", "BN01", "BN08", "BN15", "BN19", "TL26", "TL28", "TL06", "TL11", "TL14", "TL21", "TL22", "CU01", "CU02", "CU03", "CU04", "CU06", "CU09", "CU10", "CU16", ] as const`
- `export type WidgetInstance = { id: string; kind: WidgetKind; settings: WidgetSettings; }`
- `export type WidgetKind = (typeof WIDGET_KINDS)[number]`
- `export type WidgetSettings = { title: string; source: string; summary: string; period: string; historyPeriod?: "auto" | "3m" | "6m" | "1y"; target: boolean; size: SizeName; fields: string[]; labels...`
- `export type WidgetVisibility = "staff" | "client"`
- `export function canonicalizeDashboardConfig(config: DashboardConfig): string`
- `export function compactRects(rects: Record<string, Rect>): Record<string, Rect>`
- `export function defaultWidgetSettings(kind: WidgetKind): WidgetSettings`
- `export function projectClientDashboardConfig(config: DashboardConfig): DashboardConfig`
- `export function readingOrder(layout: Record<string, Rect>): string[]`
- `export function validateDashboardConfig(value: unknown): ValidationResult`
- `export const widgetOptionOptions = (kind: WidgetKind) =>`
- `export const widgetPeriodOptions = (kind: WidgetKind) =>`
- `export const widgetSizeOptions = () =>`
- `export const widgetSourceOptions = (kind: WidgetKind) =>`
- `export const widgetStaticFieldOptions = (kind: WidgetKind) =>`
- `export const widgetSummaryOptions = (kind: WidgetKind, source: string) =>`
- `export const widgetTargetAvailable = (kind: WidgetKind) =>`

## `lib/dashboard/gate.ts`

- `export type DashboardEnv = RuntimeEnv & { ENABLE_CLIENT_DASHBOARD?: string; }`
- `export function isClientDashboardEnabled(env: DashboardEnv = process.env): boolean`

## `lib/dashboard/navigation-guard.ts`

- `export type DashboardNavApi = { pending: () => boolean; cancelTimer: () => void; flush: () => void; navigateTo: (href: string) => void; }`
- `export type HeldNav = { href?: string; key?: string } | null`
- `export const bindDashboardNavGuard = (api: DashboardNavApi) =>`
- `export const clearHeldNavigation = () =>`
- `export const completeHeldNavigation = () =>`
- `export const heldNavigation = (): HeldNav =>`
- `export const unbindDashboardNavGuard = () =>`

## `lib/dashboard/service.ts`

- `export type DashboardDeps = { db?: PrismaLike }`
- `export class DashboardError extends Error (1 members)`
- `export type StaffDashboardLayout = { layoutId: string; revision: number; configVersion: number; config: DashboardConfig; updatedByMemberId: string | null; updatedAt: string; }`
- `export type UpdateDashboardInput = { workspaceId: string; clientProfileId: string; config: unknown; expectedRevision: number; }`
- `export async function readOwnDashboardLayout(session: SessionLike, input: { workspaceId: string }, deps: DashboardDeps = {}): Promise<{ layout: Omit< StaffDashboardLayout, "updatedByMemberId" | "co...`
- `export async function readStaffDashboardLayout(session: SessionLike, input: { workspaceId: string; clientProfileId: string }, deps: DashboardDeps = {}): Promise<{ layout: StaffDashboardLayout | nul...`
- `export async function updateClientDashboardLayout(session: SessionLike, input: UpdateDashboardInput, deps: DashboardDeps = {}): Promise<{ revision: number; config: DashboardConfig }>`

## `lib/db-types/client-plans.ts`

- `export type ClientPlansRows = { mealPlan: MealPlan | null; iifym: IifymPlan | null; training: TrainingProgram[]; goals: ClientGoal[]; plan: ClientPlan | null; }`

## `lib/db-types/dashboard-draft.ts`

- `export type DashboardBreakpoint = z.infer<typeof dashboardBreakpoint>`
- `export type DashboardDraft = z.infer<typeof dashboardDraft>`
- `export type DashboardLayout = z.infer<typeof dashboardLayout>`
- `export type DashboardRect = z.infer<typeof dashboardRect>`
- `export type DashboardSizeName = z.infer<typeof dashboardSizeName>`
- `export type DashboardWidgetInstance = z.infer<typeof dashboardWidgetInstance>`
- `export type DashboardWidgetKind = z.infer<typeof dashboardWidgetKind>`
- `export type DashboardWidgetSettings = z.infer<typeof dashboardWidgetSettings>`
- `export const dashboardBreakpoint = z.enum(["desktop", "tablet", "mobile"])`
- `export const dashboardDraft = z.object({ version: z.literal(1), name: z.string().max(80), widgets: z.array(dashboardWidgetInstance), layouts: z.partialRecord(dashboardBreakpoint, dashboardLayout), ...`
- `export const dashboardLayout = z.record(z.string(), dashboardRect)`
- `export const dashboardRect = z.object({ x: z.number().int(), y: z.number().int(), w: z.number().int(), h: z.number().int(), size: dashboardSizeName, })`
- `export const dashboardSizeName = z.enum([ "Compact", "Regular", "Wide", "Tall", "Expanded", ])`
- `export const dashboardWidgetInstance = z.object({ id: z.string(), kind: dashboardWidgetKind, settings: dashboardWidgetSettings, })`
- `export const dashboardWidgetKind = z.enum([ "BN21", "BN01", "BN08", "BN15", "BN19", "TL26", "TL28", "TL06", "TL11", "TL14", "TL21", "TL22", "CU01", "CU02", "CU03", "CU04", "CU06", "CU09", "CU10", "...`
- `export const dashboardWidgetSettings = z.object({ title: z.string(), source: z.string(), summary: z.string(), period: z.string(), target: z.boolean(), size: dashboardSizeName, fields: z.array(z.str...`

## `lib/db-types/iifym.ts`

- `export type IifymOption = z.infer<typeof iifymOption>`
- `export type IifymPayload = z.infer<typeof iifymPayload>`
- `export type VariantSchedule = z.infer<typeof variantSchedule>`
- `export const iifymOption = z.object({ id: z.string(), label: z.string(), targets: mealTargets, })`
- `export const iifymPayload = z.object({ options: z.array(iifymOption), schedule: variantSchedule, })`
- `export const variantSchedule = z.discriminatedUnion("mode", [ z.object({ mode: z.literal("manual"), selectedVariantId: z.string() }), z.object({ mode: z.literal("weekly"), days: z.partialRecord(wee...`
- `export const weekdayKey = z.enum(["1", "2", "3", "4", "5", "6", "7"])`

## `lib/db-types/index.ts`

- `export { ClientPlansRows } from "./client-plans"`
- `export { DashboardBreakpoint } from "./dashboard-draft"`
- `export { DashboardDraft } from "./dashboard-draft"`
- `export { DashboardLayout } from "./dashboard-draft"`
- `export { DashboardRect } from "./dashboard-draft"`
- `export { DashboardSizeName } from "./dashboard-draft"`
- `export { DashboardWidgetInstance } from "./dashboard-draft"`
- `export { DashboardWidgetKind } from "./dashboard-draft"`
- `export { DashboardWidgetSettings } from "./dashboard-draft"`
- `export { IifymOption } from "./iifym"`
- `export { IifymPayload } from "./iifym"`
- `export { MealTargets } from "./meal-targets"`
- `export { MessageLink } from "./message-links"`
- `export { MessageLinkRoute } from "./message-links"`
- `export { MessageLinks } from "./message-links"`
- `export { SavedMealFoodPortion } from "./saved-meal"`
- `export { SavedMealFoodSwap } from "./saved-meal"`
- `export { SavedMealPayload } from "./saved-meal"`
- `export { TargetStyle } from "./meal-targets"`
- `export { TargetValue } from "./meal-targets"`
- `export { TemplateDefinitionSlots } from "./template-slots"`
- `export { TemplateFieldOverride } from "./template-slots"`
- `export { TemplateModules } from "./template-slots"`
- `export { TemplateRoadmapRow } from "./template-slots"`
- `export { VariantSchedule } from "./iifym"`
- `export { dashboardBreakpoint } from "./dashboard-draft"`
- `export { dashboardDraft } from "./dashboard-draft"`
- `export { dashboardLayout } from "./dashboard-draft"`
- `export { dashboardRect } from "./dashboard-draft"`
- `export { dashboardSizeName } from "./dashboard-draft"`
- `export { dashboardWidgetInstance } from "./dashboard-draft"`
- `export { dashboardWidgetKind } from "./dashboard-draft"`
- `export { dashboardWidgetSettings } from "./dashboard-draft"`
- `export { iifymOption } from "./iifym"`
- `export { iifymPayload } from "./iifym"`
- `export { mealTargets } from "./meal-targets"`
- `export { messageLink } from "./message-links"`
- `export { messageLinkRoute } from "./message-links"`
- `export { messageLinks } from "./message-links"`
- `export { savedMealFoodPortion } from "./saved-meal"`
- `export { savedMealFoodSwap } from "./saved-meal"`
- `export { savedMealPayload } from "./saved-meal"`
- `export { targetStyle } from "./meal-targets"`
- `export { targetValue } from "./meal-targets"`
- `export { templateDefinitionSlots } from "./template-slots"`
- `export { templateFieldOverride } from "./template-slots"`
- `export { templateModules } from "./template-slots"`
- `export { templateRoadmapRow } from "./template-slots"`
- `export { variantSchedule } from "./iifym"`
- `export { weekdayKey } from "./iifym"`

## `lib/db-types/meal-targets.ts`

- `export type MealTargets = z.infer<typeof mealTargets>`
- `export type TargetStyle = z.infer<typeof targetStyle>`
- `export type TargetValue = z.infer<typeof targetValue>`
- `export const mealTargets = z.object({ style: targetStyle, calories: targetValue.optional(), protein: targetValue.optional(), carbs: targetValue.optional(), fat: targetValue.optional(), })`
- `export const targetStyle = z.enum(["calories", "macros"])`
- `export const targetValue = z.discriminatedUnion("kind", [ z.object({ kind: z.literal("fixed"), value: z.number() }), z.object({ kind: z.literal("range"), min: z.number(), max: z.number() }), z.obje...`

## `lib/db-types/message-links.ts`

- `export type MessageLink = z.infer<typeof messageLink>`
- `export type MessageLinkRoute = z.infer<typeof messageLinkRoute>`
- `export type MessageLinks = z.infer<typeof messageLinks>`
- `export const messageLink = z.object({ label: z.string(), route: messageLinkRoute, })`
- `export const messageLinkRoute = z.object({ section: z.enum(["clients", "templates", "check-ins", "messages", "notes"]), client: z.string().optional(), editor: z.string().optional(), review: z.strin...`
- `export const messageLinks = z.array(messageLink)`

## `lib/db-types/saved-meal.ts`

- `export type SavedMealFoodPortion = z.infer<typeof savedMealFoodPortion>`
- `export type SavedMealFoodSwap = z.infer<typeof savedMealFoodSwap>`
- `export type SavedMealPayload = z.infer<typeof savedMealPayload>`
- `export const savedMealFoodPortion = z.object({ foodId: z.string(), quantity: z.number(), swaps: z.array(savedMealFoodSwap).optional(), })`
- `export const savedMealFoodSwap = z.object({ foodId: z.string(), quantity: z.number(), note: z.string().optional(), })`
- `export const savedMealPayload = z.object({ id: z.string(), label: z.string(), time: z.string(), frequency: z.string().optional(), portions: z.array(savedMealFoodPortion), target: mealTargets.option...`

## `lib/db-types/template-slots.ts`

- `export type TemplateDefinitionSlots = z.infer<typeof templateDefinitionSlots>`
- `export type TemplateFieldOverride = z.infer<typeof templateFieldOverride>`
- `export type TemplateModules = z.infer<typeof templateModules>`
- `export type TemplateRoadmapRow = z.infer<typeof templateRoadmapRow>`
- `export const templateDefinitionSlots = z.object({ modules: templateModules.optional(), summaryParameterIds: z.array(z.string()).max(4).optional(), nutritionMode: z.enum(["MEAL_PLAN", "IIFYM"]).opti...`
- `export const templateFieldOverride = z.object({ parameterId: z.string(), unit: z.string(), options: z.array(z.string()).optional(), })`
- `export const templateModules = z.object({ views: z.array(z.string()), habits: z.boolean(), })`
- `export const templateRoadmapRow = z.object({ source: z.string(), calculation: z.string(), comparison: z.boolean(), })`

## `lib/db.ts`

- `export type SerializedRetryOptions = { maxAttempts: number; backoffBaseMs?: number; backoffCapMs?: number; isRetryable?: (error: unknown) => boolean; onExhausted?: (error: unknown) => unknown; onMi...`
- `export function isSerializationConflict(error: unknown): boolean`
- `export const prisma = globalForPrisma.prisma ?? new PrismaClient()`
- `export async function withSerializedRetry<T>(fn: () => Promise<T>, options: SerializedRetryOptions): Promise<T>`

## `lib/email.ts`

- `export function normalizeEmail(value: unknown): string`

## `lib/exercise/import.ts`

- `export class ExerciseImportError extends Error (1 members)`
- `export type ExerciseImportSummary = { runId: string; status: string; scannedRowCount: number; sourceRowCount: number; ignoredEmptyRowCount: number; acceptedCount: number; rejectedCount: number; dup...`
- `export async function importExerciseCatalog(client: PrismaClient, source: ExerciseSource, now: Date = new Date()): Promise<ExerciseImportSummary>`

## `lib/exercise/search.ts`

- `export const EXERCISE_SEARCH_MAX_LIMIT = 50`
- `export const EXERCISE_SEARCH_MIN_QUERY_LENGTH = 2`
- `export type ExerciseSearchParams = { query: string; muscleGroup?: string; equipment?: string; limit?: number; }`
- `export type ExerciseSearchResult = { query: string; muscleGroup: string; equipment: string; queryApplied: boolean; total: number; limit: number; items: ExerciseCatalogItem[]; }`
- `export async function listExerciseEquipment(client: PrismaClient): Promise<string[]>`
- `export async function listExerciseMuscleGroups(client: PrismaClient): Promise<string[]>`
- `export async function searchExerciseCatalog(client: PrismaClient, params: ExerciseSearchParams): Promise<ExerciseSearchResult>`

## `lib/exercise/source.ts`

- `export const EXERCISE_SOURCE_FIELDS = [ "id", "name", "muscleGroup", "primaryTarget", "additionalTargets", "equipment", "movementPattern", "positionSetup", "cues", "videoLink", ] as const`
- `export const EXERCISE_SOURCE_HEADERS: Record<ExerciseSourceField, string>`
- `export type ExerciseRejectedRow = { sourceRow: number; sourceId: number | null; reasonCode: ExerciseRejectionReason; reasonField?: ExerciseSourceField; }`
- `export type ExerciseRejectionReason = "missing_name" | "non_data_row" | "invalid_source_id" | "duplicate_source_id"`
- `export type ExerciseSource = { sourceName: string; sourceFingerprint: string; headerRow: number; columns: Record<ExerciseSourceField, number>; scannedRowCount: number; ignoredEmptyRowCount: number;...`
- `export class ExerciseSourceError extends Error (1 members)`
- `export type ExerciseSourceField = (typeof EXERCISE_SOURCE_FIELDS)[number]`
- `export type ExerciseSourceRecord = { sourceRow: number; sourceId: number; name: string; muscleGroup: string | null; primaryTarget: string | null; additionalTargets: string | null; equipment: string...`
- `export function extractExerciseSource(html: string, meta: { sourceName: string; sourceFingerprint: string }): ExerciseSource`

## `lib/extraction/contracts.ts`

- `export type ClassDeclarations = Record<string, string>`
- `export type CrossSheetLink = { value: string; sheets: string[]; count: number; }`
- `export const EXPECTED_SHEETS: readonly ExpectedSheet[]`
- `export type ExerciseArtifact = { version: number; sourceFile: string; count: number; records: ExerciseRecord[]; }`
- `export type ExerciseRecord = { id: string; name: string; muscleGroup: string; primaryTarget: string; additionalTargets: string; equipment: string; movementPattern: string; positionSetup: string; cu...`
- `export type ExpectedSheet = { file: string; slug: SheetSlug; }`
- `export type ExtractionCell = { row: number; col: number; rowSpan: number; colSpan: number; class: string | null; text: string; normalized?: number; checkbox?: "checked" | "unchecked"; todo?: string; }`
- `export type FoodArtifact = { version: number; sourceFile: string; count: number; skippedNumberedRows: number; records: FoodRecord[]; }`
- `export type FoodRecord = { no: string; food: string; amount: string; unit: string; calories: string; protein: string; carbs: string; fats: string; state: string; category: string; normalized?: Norm...`
- `export type NormalizedMacros = { calories?: number; protein?: number; carbs?: number; fats?: number; }`
- `export const REDACTED_PREFIX = "[REDACTED:"`
- `export type RedactionEntry = { artifact: string; sheet?: string; cell?: { row: number; col: number }; section?: string; fieldCategory: string; placeholder: string; reason: string; }`
- `export type RedactionManifest = { version: number; policy: string; placeholderConvention: string; redactions: RedactionEntry[]; }`
- `export const SHEET_SLUGS: Record<string, SheetSlug>`
- `export type SheetArtifact = { slug: string; sourceFile: string; cells: ExtractionCell[]; classes: Record<string, ClassDeclarations>; todos: string[]; }`
- `export type SheetSlug = | "daily-tracker" | "dashboard" | "timeline" | "mealplan" | "supplementation" | "menses" | "training" | "peaking" | "showday" | "exercise-database" | "nutrition-database"`
- `export type SheetSummaryArtifact = { slug: string; sourceFile: string; cellCount: number; rowCount: number; colCount: number; spannedCellCount: number; sections: SummarySection[]; repeatedBlocks: S...`
- `export type SummaryBlock = { kind: string; marker: string; count: number; distinctValues?: number; firstRow: number | null; lastRow: number | null; }`
- `export type SummarySection = { label: string; row: number; col: number; }`
- `export type ThemeArtifact = { version: number; derivation: string; combinations: ThemeCombination[]; }`
- `export type ThemeCombination = { background: string | null; text: string | null; border: string | null; font: string | null; seenIn: string[]; count: number; }`
- `export type TodoEntry = { scope: string; message: string; }`
- `export function redactedPlaceholder(category: string): string`
- `export function slugifySheetFileName(fileName: string): string`

## `lib/extraction/crosssheet.ts`

- `export type CrossSheetData = { foods: MatchEntry[]; exercises: MatchEntry[]; labels: MatchEntry[]; totals: { foods: number; exercises: number; labels: number }; }`
- `export type CrossSheetInput = { sheets: SheetCells[]; foodNames: ReadonlySet<string>; exerciseNames: ReadonlySet<string>; safeLabels: ReadonlySet<string>; }`
- `export type MatchEntry = { value: string; locations: MatchLocation[] }`
- `export type MatchLocation = { slug: string; row: number; col: number; count: number; }`
- `export type SheetCells = { slug: string; cells: ExtractionCell[] }`
- `export function buildCrossSheetData(input: CrossSheetInput): CrossSheetData`
- `export function renderCrossSheetMarkdown(data: CrossSheetData): string`

## `lib/extraction/css.ts`

- `export type ClassDeclarations = Record<string, string>`
- `export function parseCssDeclarations(css: string, wanted?: ReadonlySet<string>): Record<string, ClassDeclarations>`
- `export function pickClasses(allClasses: Record<string, ClassDeclarations>, used: ReadonlySet<string>): Record<string, ClassDeclarations>`

## `lib/extraction/databases.ts`

- `export const EXERCISE_ALIASES: Record<ExerciseField, string[]>`
- `export type ExerciseExtraction = { headerRow: number; columns: Partial<Record<ExerciseField, number>>; records: ExerciseRecord[]; skippedNumberedRows: number; missingHeaders: ExerciseField[]; }`
- `export type ExerciseField = | "id" | "name" | "muscleGroup" | "primaryTarget" | "additionalTargets" | "equipment" | "movementPattern" | "positionSetup" | "cues" | "videoLink"`
- `export const FOOD_ALIASES: Record<FoodField, string[]>`
- `export type FoodExtraction = { headerRow: number; columns: Partial<Record<FoodField, number>>; records: FoodRecord[]; skippedNumberedRows: number; missingHeaders: FoodField[]; }`
- `export type FoodField = | "no" | "food" | "amount" | "unit" | "calories" | "protein" | "carbs" | "fats" | "state" | "category"`
- `export function extractExercises(html: string): ExerciseExtraction`
- `export function extractFoods(html: string): FoodExtraction`
- `export function normalizeHeader(text: string): string`

## `lib/extraction/normalize.ts`

- `export function normalizeNumeric(raw: string): number | undefined`

## `lib/extraction/parse.ts`

- `export type ParsedSheet = { cells: ExtractionCell[]; classes: Record<string, ClassDeclarations>; todos: string[]; }`
- `export function parseSheetHtml(html: string, options: { baseClasses?: Record<string, ClassDeclarations> } = {}): ParsedSheet`

## `lib/extraction/redact.ts`

- `export type RedactedSheet = { artifact: SheetArtifact; redactions: RedactionEntry[]; keptCells: number; redactedCells: number; emptyCells: number; }`
- `export type SafeLabels = ReadonlySet<string>`
- `export function isSafeCellText(slug: SheetSlug, text: string, labels: SafeLabels): boolean`
- `export function redactSheet(slug: SheetSlug, sourceFile: string, cells: ExtractionCell[], classes: Record<string, Record<string, string>>, parserTodos: string[]): RedactedSheet`
- `export function safeLabelSet(slug: SheetSlug): SafeLabels`
- `export function sortRedactions(entries: RedactionEntry[]): RedactionEntry[]`

## `lib/extraction/source.ts`

- `export const DEFAULT_SHEETS_SOURCE_DIR = "/Users/apple/Downloads/PRGRSS 2.0 extracted/Copy of PRGRSS 2.0"`
- `export class SourceConfigError extends Error (1 members)`
- `export type ValidatedSource = { dir: string; sheets: ExpectedSheet[]; missing: string[]; unexpected: string[]; }`
- `export function assertRawDirIsIgnored(rawDir: string, repoRoot: string): void`
- `export function isInsideRepo(target: string, repoRoot: string): boolean`
- `export function isPathGitIgnored(target: string, cwd: string): boolean`
- `export function resolveSheetsSourceDir(env: string | undefined): string`
- `export function validateSheetsSourceDir(dir: string, repoRoot: string): ValidatedSource`

## `lib/extraction/summaries.ts`

- `export const SUMMARY_CONFIG: Record<SheetSlug, SheetConfig>`
- `export function buildSheetSummary(slug: SheetSlug, sourceFile: string, cells: ExtractionCell[]): SheetSummaryArtifact`

## `lib/extraction/theme.ts`

- `export type SheetClasses = { slug: string; cells: ExtractionCell[]; classes: Record<string, ClassDeclarations>; }`
- `export function buildThemeArtifact(sheets: SheetClasses[]): ThemeArtifact`

## `lib/gdpr.ts`

- `export class GdprNotExposableError extends Error (1 members)`
- `export function assertGdprExternallyExposable(env: ConsentGateEnv = process.env): void`

## `lib/gdpr/export.ts`

- `export type AssignmentExportRow = { role: string; status: string; assignedAt: string; }`
- `export type ClientExportDocument = { formatVersion: 1; manifest: { sections: Record<ExportSection, number>; totalRecords: number; }; sections: ExportSectionsData; }`
- `export type ConsentExportRow = { kind: string; version: string; grantedAt: string; revokedAt: string | null; source: string; }`
- `export const EXPORT_PAGE_SIZE = 500`
- `export const EXPORT_SECTIONS = [ "clientProfile", "consents", "assignments", ] as const`
- `export const EXPORT_SECTION_ROW_MAX = 100_000`
- `export type ExportOptions = { pageSize?: number; maxSectionRows?: number; }`
- `export type ExportSection = (typeof EXPORT_SECTIONS)[number]`
- `export type ExportSectionsData = { clientProfile: { name: string; createdAt: string }; consents: ConsentExportRow[]; assignments: AssignmentExportRow[]; }`
- `export class GdprError extends Error (1 members)`
- `export type GdprErrorCode = | "invalid_input" | "client_not_accessible" | "export_too_large" | "serialization_conflict"`
- `export function buildExportDocument(sections: ExportSectionsData): ClientExportDocument`
- `export async function exportClientData(session: SessionLike, input: { workspaceId: string; clientProfileId: string }, client: PrismaClient = prisma, options?: ExportOptions): Promise<ClientExportDo...`
- `export async function exportOwnData(session: SessionLike, input: { workspaceId: string }, client: PrismaClient = prisma, options?: ExportOptions): Promise<ClientExportDocument>`

## `lib/gdpr/retention.ts`

- `export const RETENTION_FAMILIES = [ "clientProfile", "consentRecord", "auditEvent", "accessToken", "dailyTracking", "cycleData", "nutrition", "training", "checkIn", "note", "bloodwork", "pedHrt", "...`
- `export const RETENTION_POLICY: RetentionPolicy`
- `export class RetentionError extends Error (1 members)`
- `export type RetentionFamily = (typeof RETENTION_FAMILIES)[number]`
- `export type RetentionPolicy = Readonly< Record<RetentionFamily, RetentionPolicyEntry> >`
- `export type RetentionPolicyEntry = { retainForMs: number | null }`
- `export function assertAutomaticRetentionConfigured(env: ConsentGateEnv = process.env): void`
- `export function evaluateRetention(now: Date = new Date(), policy: RetentionPolicy = RETENTION_POLICY): { family: RetentionFamily; cutoff: Date }[]`
- `export function retentionFamilies(): readonly RetentionFamily[]`

## `lib/habits/boundary.ts`

- `export type HabitSafeResult<T> = | { ok: true; value: T } | { ok: false; code: | "denied" | "invalid_input" | "not_available" | "conflict" | "serialization_conflict"; message: string; }`
- `export const archiveHabitFromAction = (session: Session, input: { workspaceId: string; clientProfileId: string; habitId: string; expectedRevision: number; }, deps: HabitDeps = {}): Promise<HabitSaf...`
- `export const createHabitFromAction = (session: Session, input: { workspaceId: string; clientProfileId: string; name: unknown; target: unknown; startDate: unknown; weekdays: unknown; endDate?: unkno...`
- `export const editHabitFromAction = (session: Session, input: { workspaceId: string; clientProfileId: string; habitId: string; name?: unknown; target?: unknown; schedule?: { weekdays?: unknown; endD...`
- `export const readHabitChoices = (session: Session, input: { workspaceId: string; clientProfileId: string }, deps: HabitDeps = {}): Promise< HabitSafeResult<{ choices: { id: string; name: string }[]...`
- `export const readHabitConsistency = (session: Session, input: { workspaceId: string; clientProfileId?: string; period: unknown; fields?: unknown; }, deps: HabitDeps = {}): Promise<HabitSafeResult<H...`
- `export const readStaffHabits = (session: Session, input: { workspaceId: string; clientProfileId: string }, deps: HabitDeps = {}): Promise<HabitSafeResult<{ habits: HabitView[]; hasMore: boolean }>> =>`
- `export const readTodayHabits = (session: Session, input: { workspaceId: string; fields?: unknown }, deps: HabitDeps = {}): Promise< HabitSafeResult<{ habits: TodayHabitView[]; hasMore: boolean; dat...`
- `export const setHabitLogFromAction = (session: Session, input: { workspaceId: string; clientProfileId: string; habitId: string; date: unknown; desired: "DONE" | "CLEARED"; }, deps: HabitDeps = {}):...`

## `lib/habits/date.ts`

- `export const ARCHIVE_WEEKDAY_MASK = 0`
- `export const HABIT_HORIZON_YEARS = 5`
- `export const WEEKDAY_MASK_MAX = 127`
- `export const WEEKDAY_MASK_MIN = 1`
- `export function formatHabitDate(date: string): string`
- `export function habitPeriodDays(period: string): number | null`
- `export function maskCoversDate(mask: number, date: string): boolean`
- `export function parseHabitEndDate(input: unknown, opts: { startDate: string; today?: string }): string | null`
- `export function parseHabitStartDate(input: unknown, opts: { today?: string } = {}): string | null`
- `export function parseWeekdayMask(input: unknown): number | null`
- `export function serverTodayUtc(now: Date = new Date()): string`
- `export function shiftDateUtc(date: string, days: number): string`
- `export function weekdayBit(date: string): number`

## `lib/habits/service.ts`

- `export type HabitConsistencyResult = { period: string; from: string; to: string; rows: HabitConsistencyRow[]; totals: { scheduled: number; done: number; skipped: number; missing: number }; }`
- `export type HabitConsistencyRow = { habitId: string; name: string; target: string; scheduled: number; done: number; skipped: number; missing: number; }`
- `export type HabitDeps = { db?: PrismaLike; now?: Date }`
- `export class HabitError extends Error (1 members)`
- `export type HabitView = { id: string; name: string; target: string; archived: boolean; revision: number; schedule: { weekdays: number; endDate: string | null } | null; }`
- `export type TodayHabitView = { id: string; name: string; target: string; status: "DONE" | "SKIPPED" | "NONE"; }`
- `export async function archiveHabit(session: SessionLike, input: { workspaceId: string; clientProfileId: string; habitId: string; expectedRevision: number; }, deps: HabitDeps = {}): Promise<{ revisi...`
- `export async function createHabit(session: SessionLike, input: { workspaceId: string; clientProfileId: string; name: unknown; target: unknown; startDate: unknown; weekdays: unknown; endDate?: unkno...`
- `export async function editHabit(session: SessionLike, input: { workspaceId: string; clientProfileId: string; habitId: string; name?: unknown; target?: unknown; schedule?: { weekdays?: unknown; endD...`
- `export async function habitConsistency(session: SessionLike, input: { workspaceId: string; clientProfileId?: string; period: unknown; fields?: unknown; }, deps: HabitDeps = {}): Promise<HabitConsis...`
- `export async function listHabitChoices(session: SessionLike, input: { workspaceId: string; clientProfileId: string }, deps: HabitDeps = {}): Promise<{ choices: { id: string; name: string }[]; hasMo...`
- `export async function listStaffHabits(session: SessionLike, input: { workspaceId: string; clientProfileId: string }, deps: HabitDeps = {}): Promise<{ habits: HabitView[]; hasMore: boolean }>`
- `export async function listTodayHabits(session: SessionLike, input: { workspaceId: string; fields?: unknown }, deps: HabitDeps = {}): Promise<{ habits: TodayHabitView[]; hasMore: boolean; date: stri...`
- `export async function setHabitLog(session: SessionLike, input: { workspaceId: string; clientProfileId: string; habitId: string; date: unknown; desired: "DONE" | "CLEARED"; }, deps: HabitDeps = {}):...`

## `lib/mail/index.ts`

- `export const DEV_MAILBOX_FILE_ENV = "DEV_MAILBOX_FILE"`
- `export const MAIL_DELIVERY_ADAPTER_ENV = "MAIL_DELIVERY_ADAPTER"`
- `export type MailAdapter = (message: MailMessage) => Promise<void>`
- `export type MailMessage = { to: string; subject: string; text: string }`
- `export function mailDeliveryConfigured(): boolean`
- `export async function sendMail(message: MailMessage): Promise<void>`

## `lib/mealplan/boundary.ts`

- `export type MealPlanSafeResult<T> = | { ok: true; value: T } | { ok: false; code: | "denied" | "invalid_input" | "not_available" | "conflict" | "consent_missing" | "policy_not_configured" | "serial...`
- `export async function publishMealPlanVersionFromAction(session: Session, input: { workspaceId: string; clientProfileId: string; expectedRevision: number; effectiveDate: string; }, deps: MealPlanDep...`
- `export async function readOwnMealPlanFromAction(session: Session, input: { workspaceId: string }, deps: MealPlanDeps = {}): Promise<MealPlanSafeResult<OwnMealPlanView>>`
- `export async function readStaffMealPlanFromAction(session: Session, input: { workspaceId: string; clientProfileId: string; cursor?: number }, deps: MealPlanDeps = {}): Promise<MealPlanSafeResult<St...`
- `export async function readStaffMealPlanVersionFromAction(session: Session, input: { workspaceId: string; clientProfileId: string; versionId: string }, deps: MealPlanDeps = {}): Promise<MealPlanSafe...`
- `export async function saveMealPlanDraftFromAction(session: Session, input: { workspaceId: string; clientProfileId: string; expectedRevision: number; title?: string; draft: unknown; timezone?: strin...`
- `export async function setMealPlanTimezoneFromAction(session: Session, input: { workspaceId: string; clientProfileId: string; timezone: string }, deps: MealPlanDeps = {}): Promise<MealPlanSafeResult...`

## `lib/mealplan/gate.ts`

- `export type MealPlanRuntimeClass = RuntimeClass`
- `export type MealPlansEnv = RuntimeEnv & { ENABLE_MEAL_PLANS?: string }`
- `export const classifyMealPlanRuntime: ( env?: RuntimeEnv, ) => MealPlanRuntimeClass`
- `export function isMealPlansEnabled(env: MealPlansEnv = process.env): boolean`

## `lib/mealplan/limits.ts`

- `export const MEALPLAN_LIMITS = { titleMax: 80, maxVariants: 8, minPublishVariants: 1, maxMealsPerVariant: 24, minPublishMeals: 1, variantLabelMax: 80, variantIdMax: 64, mealNameMax: 80, mealTimeMax...`

## `lib/mealplan/payload.ts`

- `export const MEALPLAN_TARGET_MODES = ["FIXED", "RANGE", "MINIMUM"] as const`
- `export type MealPlanDraft = { variants: MealPlanVariant[] }`
- `export class MealPlanError extends Error (1 members)`
- `export type MealPlanErrorCode = | "invalid_input" | "plan_not_accessible" | "stale_revision" | "timezone_required" | "unrepresentable_date" | "publish_incomplete" | "consent_missing" | "policy_not_...`
- `export type MealPlanMacroTargets = { kcal: MealPlanTarget | null; proteinG: MealPlanTarget | null; carbsG: MealPlanTarget | null; fatG: MealPlanTarget | null; }`
- `export type MealPlanMeal = { order: number; name: string; time?: string; frequency?: string; foodText: string; kcal?: number; proteinG?: number; carbsG?: number; fatG?: number; }`
- `export type MealPlanTarget = { value: number } | { min: number; max: number } | { min: number }`
- `export type MealPlanTargetMode = (typeof MEALPLAN_TARGET_MODES)[number]`
- `export type MealPlanVariant = { id: string; label: string; targetMode: MealPlanTargetMode; targets: MealPlanMacroTargets; meals: MealPlanMeal[]; }`
- `export function normalizeMealPlanPayload(input: unknown, opts: { forPublish: boolean }): MealPlanDraft`

## `lib/mealplan/service.ts`

- `export type MealPlanActivation = | { status: "ok"; instant: Date } | { status: "unrepresentable" } | { status: "invalid" }`
- `export type MealPlanDeps = { db?: PrismaClient; registry?: ConsentPolicyRegistry; now?: Date; }`
- `export type { MealPlanDraft } from "./payload"`
- `export { MealPlanError } from "./payload"`
- `export type { MealPlanMacroTargets } from "./payload"`
- `export type { MealPlanMeal } from "./payload"`
- `export type { MealPlanTarget } from "./payload"`
- `export type { MealPlanTargetMode } from "./payload"`
- `export type { MealPlanVariant } from "./payload"`
- `export type MealPlanVersionDetail = { id: string; versionSeq: number; effectiveDate: string; effectiveTimezone: string; activationInstant: string; payload: MealPlanDraft; publishedAt: string; }`
- `export type MealPlanVersionHeader = { id: string; versionSeq: number; effectiveDate: string; effectiveTimezone: string; publishedAt: string; }`
- `export type OwnMealPlanView = { current: { versionSeq: number; effectiveDate: string; effectiveTimezone: string; payload: MealPlanDraft; } | null; upcoming: { versionSeq: number; effectiveDate: str...`
- `export type StaffMealPlanView = { plan: { id: string; title: string; timezone: string | null; draftRevision: number; draft: MealPlanDraft; } | null; versions: MealPlanVersionHeader[]; nextCursor: n...`
- `export function parseEffectiveDate(raw: unknown, now: Date = new Date()): string`
- `export async function publishMealPlanVersion(session: SessionLike, input: { workspaceId: string; clientProfileId: string; expectedRevision: number; effectiveDate: string; }, deps: MealPlanDeps = {}...`
- `export async function readOwnMealPlan(session: SessionLike, input: { workspaceId: string }, deps: MealPlanDeps = {}): Promise<OwnMealPlanView>`
- `export async function readStaffMealPlan(session: SessionLike, input: { workspaceId: string; clientProfileId: string; cursor?: number }, deps: MealPlanDeps = {}): Promise<StaffMealPlanView>`
- `export async function readStaffMealPlanVersion(session: SessionLike, input: { workspaceId: string; clientProfileId: string; versionId: string }, deps: MealPlanDeps = {}): Promise<MealPlanVersionDet...`
- `export function resolveMealPlanActivation(zone: string, effectiveDate: string): MealPlanActivation`
- `export async function saveMealPlanDraft(session: SessionLike, input: { workspaceId: string; clientProfileId: string; expectedRevision: number; title?: string; draft: unknown; timezone?: string; }, ...`
- `export async function setMealPlanTimezone(session: SessionLike, input: { workspaceId: string; clientProfileId: string; timezone: string }, deps: MealPlanDeps = {}): Promise<{ planId: string }>`

## `lib/nutrition/import.ts`

- `export class NutritionImportError extends Error (1 members)`
- `export type NutritionImportSummary = { runId: string; status: string; scannedRowCount: number; sourceRowCount: number; ignoredEmptyRowCount: number; acceptedCount: number; rejectedCount: number; du...`
- `export async function importNutritionCatalog(client: PrismaClient, source: NutritionSource, now: Date = new Date()): Promise<NutritionImportSummary>`

## `lib/nutrition/search.ts`

- `export const NUTRITION_SEARCH_MAX_LIMIT = 50`
- `export const NUTRITION_SEARCH_MIN_QUERY_LENGTH = 2`
- `export type NutritionSearchParams = { query: string; category?: string; limit?: number; }`
- `export type NutritionSearchResult = { query: string; category: string; queryApplied: boolean; total: number; limit: number; items: NutritionCatalogItem[]; }`
- `export async function listNutritionCategories(client: PrismaClient): Promise<string[]>`
- `export async function searchNutritionCatalog(client: PrismaClient, params: NutritionSearchParams): Promise<NutritionSearchResult>`

## `lib/nutrition/source.ts`

- `export const NUTRITION_SOURCE_FIELDS = [ "no", "food", "amount", "unit", "calories", "protein", "carbs", "fats", "state", "category", ] as const`
- `export const NUTRITION_SOURCE_HEADERS: Record<NutritionSourceField, string>`
- `export type NutritionRejectedRow = { sourceRow: number; sourceNo: number | null; reasonCode: NutritionRejectionReason; reasonField?: NutritionSourceField; }`
- `export type NutritionRejectionReason = | "missing_food" | "non_data_row" | "invalid_source_number" | "invalid_numeric" | "duplicate_source_number"`
- `export type NutritionSource = { sourceName: string; sourceFingerprint: string; headerRow: number; columns: Record<NutritionSourceField, number>; scannedRowCount: number; ignoredEmptyRowCount: numbe...`
- `export class NutritionSourceError extends Error (1 members)`
- `export type NutritionSourceField = (typeof NUTRITION_SOURCE_FIELDS)[number]`
- `export type NutritionSourceRecord = { sourceRow: number; sourceNo: number; name: string; amount: number | null; unit: string | null; calories: number | null; protein: number | null; carbs: number |...`
- `export function extractNutritionSource(html: string, meta: { sourceName: string; sourceFingerprint: string }): NutritionSource`

## `lib/onboarding/assignments-boundary.ts`

- `export type ActionResult<T> = { ok: true; value: T } | { ok: false; message: string }`
- `export type { AssignableClient } from "./assignments"`
- `export type { AssignableForm } from "./assignments"`
- `export type { AssignmentSummary } from "./assignments"`
- `export type BoundaryDeps = { db?: PrismaClient }`
- `export async function assignFormFromAction(_session: SessionLike, _input: { workspaceId: string; clientProfileId: string; formId: string }, _deps: BoundaryDeps = {}): Promise<ActionResult<{ assignm...`
- `export async function cancelAssignmentFromAction(_session: SessionLike, _input: { workspaceId: string; assignmentId: string }, _deps: BoundaryDeps = {}): Promise<ActionResult<{ cancelled: true }>>`
- `export async function listAssignableClientsForWorkspace(_session: SessionLike, _input: { workspaceId: string; limit?: number; cursor?: string }, _deps: BoundaryDeps = {}): Promise< ActionResult<{ i...`
- `export async function listAssignableFormsForWorkspace(_session: SessionLike, _input: { workspaceId: string }, _deps: BoundaryDeps = {}): Promise<ActionResult<AssignableForm[]>>`
- `export async function listAssignmentsForWorkspace(_session: SessionLike, _input: { workspaceId: string; limit?: number; cursor?: string }, _deps: BoundaryDeps = {}): Promise< ActionResult<{ items: ...`
- `export async function replaceAssignmentFromAction(_session: SessionLike, _input: { workspaceId: string; assignmentId: string }, _deps: BoundaryDeps = {}): Promise<ActionResult<{ changed: boolean; a...`

## `lib/onboarding/assignments-gate.ts`

- `export const ASSIGNMENT_LIMITS = { idMax: 128, listDefaultLimit: 25, listMaxLimit: 100, } as const`
- `export class OnboardingAssignmentError extends Error (1 members)`
- `export type OnboardingAssignmentErrorCode = | "invalid_input" | "assignment_not_accessible" | "assignment_not_active" | "client_not_eligible" | "form_not_eligible" | "assignment_conflict" | "serial...`
- `export function isOnboardingAssignmentsEnabled(flag: string | undefined, env: RuntimeEnv = process.env): boolean`

## `lib/onboarding/assignments.ts`

- `export type AssignableClient = { id: string; name: string }`
- `export type AssignableForm = { id: string; name: string; latestVersionSeq: number; }`
- `export type AssignmentSummary = { id: string; clientName: string; formId: string; formName: string; versionSeq: number; latestVersionSeq: number | null; status: "ACTIVE" | "SUPERSEDED" | "CANCELLED...`
- `export async function cancelOnboardingAssignment(session: SessionLike, input: { workspaceId: string; assignmentId: string }, client: PrismaClient = defaultPrisma): Promise<void>`
- `export async function createOnboardingAssignment(session: SessionLike, input: { workspaceId: string; clientProfileId: string; formId: string }, client: PrismaClient = defaultPrisma): Promise<{ assi...`
- `export async function listAssignableClients(session: SessionLike, input: { workspaceId: string; limit?: number; cursor?: string }, client: PrismaClient = defaultPrisma): Promise<{ items: Assignable...`
- `export async function listAssignableForms(session: SessionLike, input: { workspaceId: string }, client: PrismaClient = defaultPrisma): Promise<AssignableForm[]>`
- `export async function listOnboardingAssignments(session: SessionLike, input: { workspaceId: string; limit?: number; cursor?: string }, client: PrismaClient = defaultPrisma): Promise<{ items: Assign...`
- `export async function replaceOnboardingAssignment(session: SessionLike, input: { workspaceId: string; assignmentId: string }, client: PrismaClient = defaultPrisma): Promise<{ changed: boolean; assi...`

## `lib/onboarding/forms-boundary.ts`

- `export type ActionResult<T> = { ok: true; value: T } | { ok: false; message: string }`
- `export type BoundaryDeps = { db?: PrismaClient }`
- `export async function archiveFormFromAction(_session: SessionLike, _input: { workspaceId: string; formId: string }, _deps: BoundaryDeps = {}): Promise<ActionResult<{ formId: string }>>`
- `export async function createFormFromAction(_session: SessionLike, _input: { workspaceId: string; name: string }, _deps: BoundaryDeps = {}): Promise<ActionResult<{ formId: string }>>`
- `export async function getFormForWorkspace(_session: SessionLike, _input: { workspaceId: string; formId: string }, _deps: BoundaryDeps = {}): Promise<ActionResult<FormDetail>>`
- `export async function listFormsForWorkspace(_session: SessionLike, _input: { workspaceId: string }, _deps: BoundaryDeps = {}): Promise<ActionResult<{ forms: FormSummary[] }>>`
- `export async function openDraftFromAction(_session: SessionLike, _input: { workspaceId: string; formId: string }, _deps: BoundaryDeps = {}): Promise<ActionResult<{ revision: number; definition: For...`
- `export async function publishFromAction(_session: SessionLike, _input: { workspaceId: string; formId: string; expectedRevision: number }, _deps: BoundaryDeps = {}): Promise<ActionResult<{ versionSe...`
- `export async function saveDraftFromAction(_session: SessionLike, _input: { workspaceId: string; formId: string; expectedRevision: number; draftJson: string; name?: string; }, _deps: BoundaryDeps = ...`

## `lib/onboarding/forms.ts`

- `export const FIELD_KINDS = [ "shortText", "longText", "number", "date", "singleChoice", "multiChoice", ] as const`
- `export const FORM_LIMITS = { maxFields: 100, minPublishFields: 1, labelMax: 200, helpTextMax: 500, minOptions: 1, maxOptions: 50, optionLabelMax: 200, nameMax: 120, definitionMaxBytes: 64 * 1024, }...`
- `export type FieldKind = (typeof FIELD_KINDS)[number]`
- `export type FieldOption = { optionId: string; label: string }`
- `export type FormDefinition = { title: string; fields: FormField[] }`
- `export type FormDetail = { id: string; name: string; status: "ACTIVE" | "ARCHIVED"; draftRevision: number; draft: FormDefinition | null; versions: Array<{ versionSeq: number; publishedAt: string; d...`
- `export type FormField = { fieldId: string; kind: FieldKind; label: string; required: boolean; order: number; helpText?: string; options?: FieldOption[]; }`
- `export type FormSummary = { id: string; name: string; status: "ACTIVE" | "ARCHIVED"; draftRevision: number; hasDraft: boolean; latestVersionSeq: number | null; updatedAt: string; }`
- `export class OnboardingFormError extends Error (1 members)`
- `export type OnboardingFormErrorCode = | "invalid_input" | "form_not_accessible" | "form_archived" | "no_open_draft" | "stale_revision" | "forbidden_field_id" | "publish_incomplete" | "serialization...`
- `export async function archiveOnboardingForm(session: SessionLike, input: { workspaceId: string; formId: string }, client?: PrismaClient): Promise<{ formId: string }>`
- `export async function createOnboardingForm(session: SessionLike, input: { workspaceId: string; name: string }, client?: PrismaClient): Promise<{ formId: string }>`
- `export async function getOnboardingForm(session: SessionLike, input: { workspaceId: string; formId: string }, client?: PrismaClient): Promise<FormDetail>`
- `export async function listOnboardingForms(session: SessionLike, input: { workspaceId: string }, client?: PrismaClient): Promise<FormSummary[]>`
- `export async function openOnboardingDraft(session: SessionLike, input: { workspaceId: string; formId: string }, client?: PrismaClient): Promise<{ revision: number; definition: FormDefinition }>`
- `export async function publishOnboardingForm(session: SessionLike, input: { workspaceId: string; formId: string; expectedRevision: number }, client?: PrismaClient): Promise<{ versionSeq: number }>`
- `export async function saveOnboardingFormDraft(session: SessionLike, input: { workspaceId: string; formId: string; expectedRevision: number; draft: unknown; name?: string; }, client?: PrismaClient):...`
- `export function validateDefinition(input: unknown, knownIds: { fieldIds: Map<string, FieldKind>; optionIds: Map<string, string>; }, opts: { forPublish: boolean }): FormDefinition`

## `lib/onboarding/review-boundary.ts`

- `export type ActionResult<T> = { ok: true; value: T } | { ok: false; message: string }`
- `export type BoundaryDeps = { db?: PrismaClient; registry?: ConsentPolicyRegistry; }`
- `export type { StaffOnboardingAnswerRow } from "./review"`
- `export type { StaffOnboardingReviewDetail } from "./review"`
- `export type { StaffOnboardingSubmissionItem } from "./review"`
- `export type { StaffOnboardingSubmissionList } from "./review"`
- `export async function listClientSubmissionsForReview(_session: SessionLike, _input: { workspaceId: string; clientProfileId: string; cursor?: string }, _deps: BoundaryDeps = {}): Promise<ActionResul...`
- `export async function markSubmissionReviewedFromAction(_session: SessionLike, _input: { workspaceId: string; clientProfileId: string; submissionId: string; }, _deps: BoundaryDeps = {}): Promise<Act...`
- `export async function viewSubmissionReviewDetail(_session: SessionLike, _input: { workspaceId: string; clientProfileId: string; submissionId: string; }, _deps: BoundaryDeps = {}): Promise<ActionRes...`

## `lib/onboarding/review.ts`

- `export type MarkSubmissionReviewedInput = { workspaceId: string; clientProfileId: string; submissionId: string; }`
- `export type MarkSubmissionReviewedResult = { status: "reviewed" | "already_reviewed"; reviewedAt: string; }`
- `export type OnboardingReviewDeps = { db?: PrismaClient; registry?: ConsentPolicyRegistry; }`
- `export type StaffOnboardingAnswerRow = { fieldId: string; label: string; kind: FieldKind; display: string; }`
- `export type StaffOnboardingReviewDetail = { submissionId: string; formName: string; versionSeq: number; submittedAt: string; reviewed: { byName: string; at: string } | null; canMark: boolean; answe...`
- `export type StaffOnboardingSubmissionItem = { submissionId: string; formName: string; versionSeq: number; submittedAt: string; reviewed: { byName: string; at: string } | null; }`
- `export type StaffOnboardingSubmissionList = | { state: "ready"; clientName: string; items: StaffOnboardingSubmissionItem[]; nextCursor: string | null; } | { state: "consent_missing" }`
- `export async function listClientOnboardingSubmissions(session: SessionLike, input: { workspaceId: string; clientProfileId: string; cursor?: string }, deps: OnboardingReviewDeps = {}): Promise<Staff...`
- `export async function markSubmissionReviewed(session: SessionLike, input: MarkSubmissionReviewedInput, deps: OnboardingReviewDeps = {}): Promise<MarkSubmissionReviewedResult>`
- `export async function readSubmissionReviewDetail(session: SessionLike, input: { workspaceId: string; clientProfileId: string; submissionId: string; }, deps: OnboardingReviewDeps = {}): Promise<Staf...`

## `lib/onboarding/submission-gate.ts`

- `export class OnboardingSubmissionError extends Error (1 members)`
- `export type OnboardingSubmissionErrorCode = | "invalid_input" | "not_available" | "consent_missing" | "policy_not_configured" | "serialization_conflict"`
- `export const SUBMISSION_LIMITS = { idMax: ASSIGNMENT_LIMITS.idMax, answersJsonMaxBytes: FORM_LIMITS.definitionMaxBytes, maxAnswers: FORM_LIMITS.maxFields, shortTextMaxChars: 1000, shortTextMaxBytes...`
- `export function isOnboardingSubmissionEnabled(flag: string | undefined, env: RuntimeEnv = process.env): boolean`

## `lib/onboarding/submissions-boundary.ts`

- `export type ActionResult<T> = { ok: true; value: T } | { ok: false; message: string }`
- `export type BoundaryDeps = { db?: PrismaClient; registry?: ConsentPolicyRegistry; }`
- `export type { OwnAssignmentItem } from "./submissions"`
- `export type { OwnFormField } from "./submissions"`
- `export type { OwnOnboardingDetail } from "./submissions"`
- `export type { OwnSubmittedAnswer } from "./submissions"`
- `export async function listOwnAssignmentsForWorkspace(_session: SessionLike, _input: { workspaceId: string }, _deps: BoundaryDeps = {}): Promise<ActionResult<{ items: OwnAssignmentItem[] }>>`
- `export async function loadOwnDetailForRoute(_session: SessionLike, _input: { workspaceId: string; assignmentId: string }, _deps: BoundaryDeps = {}): Promise<ActionResult<OwnOnboardingDetail>>`
- `export async function submitOnboardingFromAction(_session: SessionLike, _input: { workspaceId: string; assignmentId: string; answersJson: string; }, _deps: BoundaryDeps = {}): Promise<ActionResult<...`

## `lib/onboarding/submissions.ts`

- `export type CanonicalAnswer = { fieldId: string; kind: | "SHORT_TEXT" | "LONG_TEXT" | "NUMBER" | "DATE" | "SINGLE_CHOICE" | "MULTI_CHOICE"; valueText: string | null; valueNumeric: string | null; va...`
- `export { ONBOARDING_SUBMISSION_DEV_CONSENT } from "../consent"`
- `export type OnboardingSubmissionDeps = { db?: PrismaClient; registry?: ConsentPolicyRegistry; }`
- `export { OnboardingSubmissionError } from "./submission-gate"`
- `export type OwnAssignmentItem = { assignmentId: string; formName: string; status: "ACTIVE" | "SUPERSEDED" | "CANCELLED" | "COMPLETED"; assignedAt: string; submittedAt: string | null; }`
- `export type OwnFormField = { fieldId: string; kind: FieldKind; label: string; helpText: string | null; required: boolean; options: { optionId: string; label: string }[]; }`
- `export type OwnOnboardingDetail = | { state: "ready"; assignmentId: string; title: string; fields: OwnFormField[]; } | { state: "submitted"; assignmentId: string; title: string; submittedAt: string...`
- `export type OwnSubmittedAnswer = { fieldId: string; label: string; display: string; }`
- `export type RawAnswerEntry = { fieldId: string; value: unknown }`
- `export type SubmitOnboardingInput = { workspaceId: string; assignmentId: string; answersJson: string; }`
- `export type SubmitOnboardingResult = | { status: "submitted"; submissionId: string } | { status: "already_submitted"; submissionId: string }`
- `export function canonicalizeAnswers(definition: unknown, raw: readonly RawAnswerEntry[]): CanonicalAnswer[]`
- `export async function listOwnOnboardingAssignments(session: SessionLike, input: { workspaceId: string }, deps: OnboardingSubmissionDeps = {}): Promise<{ items: OwnAssignmentItem[] }>`
- `export async function loadOwnOnboardingDetail(session: SessionLike, input: { workspaceId: string; assignmentId: string }, deps: OnboardingSubmissionDeps = {}): Promise<OwnOnboardingDetail>`
- `export function parseAnswersJson(raw: unknown): RawAnswerEntry[]`
- `export async function submitOnboardingAssignment(session: SessionLike, input: SubmitOnboardingInput, deps: OnboardingSubmissionDeps = {}): Promise<SubmitOnboardingResult>`

## `lib/password-policy.ts`

- `export const PASSWORD_MAX_CODE_POINTS = 128`
- `export const PASSWORD_MIN_CODE_POINTS = 10`
- `export class PasswordPolicyError extends Error (1 members)`
- `export type PasswordPolicyErrorCode = "password_too_short" | "password_too_long" | "password_needs_digit"`
- `export function validatePasswordPolicy(candidate: unknown): string`
- `export function validatePasswordSetup(candidate: unknown): string`

## `lib/password.ts`

- `export async function hashPassword(password: string): Promise<string>`
- `export async function verifyPassword(password: string, stored: string): Promise<boolean>`

## `lib/runtime.ts`

- `export type ConsentGateEnv = RuntimeEnv & { ENABLE_CONSENT_GATES?: string }`
- `export type RuntimeClass = "development" | "test" | "production"`
- `export type RuntimeEnv = { APP_ENV?: string; NODE_ENV?: string }`
- `export function classifyRuntime(env: RuntimeEnv = process.env): RuntimeClass`
- `export function consentGatesEnabled(env: ConsentGateEnv = process.env): boolean`
- `export function devFlagEnabled(flag: string | undefined, env: RuntimeEnv = process.env): boolean`
- `export function isDevRuntime(env: RuntimeEnv = process.env): boolean`

## `lib/sheet-viewer.ts`

- `export function isSheetViewerEnabled(flag: string | undefined, env: RuntimeEnv = process.env): boolean`
- `export function requireSheetViewer(flag: string | undefined, env: RuntimeEnv = process.env): void`

## `lib/spec-artifacts.ts`

- `export type SheetListItem = { slug: SheetSlug; file: string; name: string }`
- `export function getExercises(): ExerciseArtifact`
- `export function getFoods(): FoodArtifact`
- `export function getSheetArtifact(slug: SheetSlug): SheetArtifact`
- `export function getSheetSummary(slug: SheetSlug): SheetSummaryArtifact`
- `export function isSheetSlug(value: string): value is SheetSlug`
- `export function listSheets(): SheetListItem[]`
- `export function sheetDisplayName(file: string): string`

## `lib/storage.ts`

- `export const DEFAULT_PRESIGN_TTL_SECONDS = 300`
- `export const MAX_MEDIA_BYTES = 20 * 1024 * 1024`
- `export const MAX_PRESIGN_TTL_SECONDS = 3600`
- `export const MEDIA_CONTENT_TYPES: Readonly<Record<string, MediaKindName>>`
- `export type MediaKindName = "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT"`
- `export type ObjectStorageBackend = { readonly name: string; presignGet(key: string, ttlSeconds: number): Promise<PresignedDownload>; presignPut( key: string, options: { contentType: string; byteSiz...`
- `export type PresignedDownload = { readonly url: string; readonly expiresAt: string; }`
- `export type PresignedUpload = { readonly url: string; readonly method: "PUT"; readonly headers: Record<string, string>; readonly expiresAt: string; }`
- `export class StorageError extends Error (1 members)`
- `export type StorageErrorCode = | "invalid_input" | "invalid_key" | "invalid_ttl" | "invalid_signature" | "payload_too_large" | "unsupported_media_type" | "storage_not_configured"`
- `export function assertClientObjectKey(key: unknown, workspaceId: string, clientProfileId: string): string`
- `export function assertMediaByteSize(byteSize: unknown): number`
- `export function assertPresignGetTtl(ttlSeconds: number, maxTtlSeconds: number): void`
- `export function clientObjectPrefix(workspaceId: string, clientProfileId: string): string`
- `export async function getObjectStorage(): Promise<ObjectStorageBackend>`
- `export function mediaKindForContentType(contentType: unknown): MediaKindName | null`
- `export const nullObjectStorage: ObjectStorageBackend`
- `export function parseClientObjectKey(key: unknown): { workspaceId: string; clientProfileId: string; objectId: string; }`
- `export function presignTtlSeconds(env: Record<string, string | undefined> = process.env): number`

## `lib/storage/local.ts`

- `export type LocalStorageConfig = { dir: string; secret: string; }`
- `export function localObjectPath(dir: string, key: string): string`
- `export const localObjectStorage: ObjectStorageBackend`
- `export function localStorageConfig(env: Record<string, string | undefined> = process.env): LocalStorageConfig`
- `export async function readLocalObject(key: string): Promise<Uint8Array | null>`
- `export function verifyLocalObjectSignature(input: { secret: string; op: "get" | "put"; key: string; expiresAt: number; signature: string; now?: number; }): boolean`
- `export async function writeLocalObject(key: string, bytes: Uint8Array): Promise<void>`

## `lib/storage/s3.ts`

- `export type S3Config = { endpoint: string; bucket: string; region: string; accessKeyId: string; secretAccessKey: string; pathStyle: boolean; }`
- `export function presignS3Url(input: { config: S3Config; method: "GET" | "PUT"; key: string; ttlSeconds: number; extraHeaders?: Record<string, string>; now?: Date; }): { url: string; headers: Record...`
- `export function s3Config(env: Record<string, string | undefined> = process.env): S3Config | null`
- `export const s3ObjectStorage: ObjectStorageBackend`

## `lib/tasks/boundary.ts`

- `export type TaskSafeResult<T> = | { ok: true; value: T } | { ok: false; code: | "denied" | "invalid_input" | "not_available" | "conflict" | "serialization_conflict"; message: string; }`
- `export const assignClientTaskFromAction = (session: Session, input: { workspaceId: string; clientProfileId: string; title: unknown; dueDate: unknown; }, deps: TaskDeps = {}): Promise<TaskSafeResult...`
- `export const cancelClientTaskFromAction = (session: Session, input: { workspaceId: string; clientProfileId: string; taskId: string; expectedRevision: number; }, deps: TaskDeps = {}): Promise<TaskSa...`
- `export const editClientTaskFromAction = (session: Session, input: { workspaceId: string; clientProfileId: string; taskId: string; title?: unknown; dueDate?: unknown; expectedRevision: number; }, de...`
- `export const readOwnClientTasks = (session: Session, input: { workspaceId: string; option?: "open" | "completed" | "both"; }, deps: TaskDeps = {}): Promise<TaskSafeResult<{ tasks: TaskView[]; hasMo...`
- `export const readStaffClientTasks = (session: Session, input: { workspaceId: string; clientProfileId: string }, deps: TaskDeps = {}): Promise<TaskSafeResult<{ tasks: TaskView[]; hasMore: boolean }>...`
- `export const setClientTaskCompletionFromAction = (session: Session, input: { workspaceId: string; clientProfileId: string; taskId: string; desired: "COMPLETED" | "OPEN"; expectedRevision: number; }...`

## `lib/tasks/date.ts`

- `export const TASK_DUE_HORIZON_YEARS = 5`
- `export type TaskDueState = "overdue" | "due-today" | "upcoming"`
- `export function formatTaskDueDate(dueDate: string): string`
- `export function parseTaskDueDate(input: unknown, opts: { today?: string } = {}): string | null`
- `export function serverTodayUtc(now: Date = new Date()): string`
- `export function taskDueState(dueDate: string, today: string = serverTodayUtc()): TaskDueState`

## `lib/tasks/service.ts`

- `export type TaskDeps = { db?: PrismaLike }`
- `export class TaskError extends Error (1 members)`
- `export type TaskView = { id: string; title: string; dueDate: string; status: "OPEN" | "COMPLETED" | "CANCELLED"; dueState: TaskDueState; completedAt: string | null; assignedByMemberId: string; revi...`
- `export async function assignClientTask(session: SessionLike, input: { workspaceId: string; clientProfileId: string; title: unknown; dueDate: unknown; }, deps: TaskDeps = {}): Promise<{ id: string; ...`
- `export async function cancelClientTask(session: SessionLike, input: { workspaceId: string; clientProfileId: string; taskId: string; expectedRevision: number; }, deps: TaskDeps = {}): Promise<{ revi...`
- `export async function editClientTask(session: SessionLike, input: { workspaceId: string; clientProfileId: string; taskId: string; title?: unknown; dueDate?: unknown; expectedRevision: number; }, de...`
- `export async function listOwnClientTasks(session: SessionLike, input: { workspaceId: string; option?: "open" | "completed" | "both"; }, deps: TaskDeps = {}): Promise<{ tasks: TaskView[]; hasMore: b...`
- `export async function listStaffClientTasks(session: SessionLike, input: { workspaceId: string; clientProfileId: string }, deps: TaskDeps = {}): Promise<{ tasks: TaskView[]; hasMore: boolean }>`
- `export async function setClientTaskCompletion(session: SessionLike, input: { workspaceId: string; clientProfileId: string; taskId: string; desired: "COMPLETED" | "OPEN"; expectedRevision: number; }...`

## `lib/tokens.ts`

- `export class AccountSecurityNotExposableError extends Error (1 members)`
- `export class TokenFlowNotExposableError extends Error (1 members)`
- `export class TokenPrimitivesNotExposableError extends Error (1 members)`
- `export function assertAccountSecurityExternallyExposable(): never`
- `export function assertTokenFlowsExternallyExposable(): never`
- `export function assertTokenPrimitivesExternallyExposable(): never`

## `lib/tokens/crypto.ts`

- `export type AccessTokenHash = string`
- `export type GeneratedAccessToken = { rawToken: RawAccessToken; tokenHash: AccessTokenHash; }`
- `export type RawAccessToken = string`
- `export class TokenError extends Error (1 members)`
- `export type TokenErrorCode = "token_invalid"`
- `export function generateAccessToken(): GeneratedAccessToken`
- `export function hashAccessToken(candidate: unknown): AccessTokenHash`

## `lib/tokens/store.ts`

- `export const ACCESS_TOKEN_CLEANUP_BATCH_LIMIT = 1000`
- `export const ACCESS_TOKEN_TERMINAL_RETENTION_MS = 30 * 24 * 60 * 60 * 1000`
- `export const ACCESS_TOKEN_TTL_MS = 12 * 60 * 60 * 1000`
- `export class TokenStoreError extends Error (1 members)`
- `export type TokenStoreErrorCode = "invalid_input" | "token_store_failed"`
- `export async function claimAccessToken(tx: Prisma.TransactionClient, input: { rawToken: unknown; purpose: AccessTokenPurpose; workspaceId?: string; userId?: string; }): Promise<{ ok: true; token: A...`
- `export async function cleanupTerminalAccessTokens(db: PrismaClient | Prisma.TransactionClient, options?: { now?: Date; retentionMs?: number }): Promise<{ deletedCount: number }>`
- `export async function inspectAccessToken(db: | Prisma.TransactionClient | PrismaClient | { accessToken: Pick< Prisma.TransactionClient["accessToken"], "findUnique" >; }, rawToken: unknown, binding?...`
- `export async function issueWorkspaceInviteToken(tx: Prisma.TransactionClient, input: { workspaceId: string; targetEmail: string; intendedRole: MemberRole; createdByUserId: string; targetMemberState...`
- `export async function revokeMatchingInviteTokens(tx: Prisma.TransactionClient, input: { workspaceId: string; targetEmail: string; intendedRole: MemberRole; }): Promise<{ revokedCount: number }>`

## `lib/trainingprogram/boundary.ts`

- `export type TrainingSafeResult<T> = | { ok: true; value: T } | { ok: false; code: | "denied" | "invalid_input" | "not_found" | "conflict" | "consent_missing" | "policy_not_configured" | "service_un...`
- `export async function bookTrainingSessionFromAction(session: Session, input: Parameters<typeof bookTrainingSession>[1], deps: TrainingDeps = {}): Promise<TrainingSafeResult<{ bookingId: string; rep...`
- `export async function cancelTrainingProgramFromAction(session: Session, input: Parameters<typeof cancelTrainingProgram>[1], deps: TrainingDeps = {}): Promise< TrainingSafeResult<{ programId: string...`
- `export async function cancelTrainingSessionBookingFromAction(session: Session, input: Parameters<typeof cancelTrainingSessionBooking>[1], deps: TrainingDeps = {}): Promise< TrainingSafeResult<{ boo...`
- `export async function moveTrainingSessionBookingFromAction(session: Session, input: Parameters<typeof moveTrainingSessionBooking>[1], deps: TrainingDeps = {}): Promise<TrainingSafeResult<{ bookingI...`
- `export async function publishTrainingProgramVersionFromAction(session: Session, input: Parameters<typeof publishTrainingProgramVersion>[1], deps: TrainingDeps = {}): Promise< TrainingSafeResult<{ v...`
- `export async function readOwnTrainingBookingHistoryFromAction(session: Session, input: Parameters<typeof readOwnTrainingBookingHistory>[1], deps: TrainingDeps = {}): Promise<TrainingSafeResult<Clie...`
- `export async function readOwnTrainingHistoryFromAction(session: Session, input: Parameters<typeof readOwnTrainingHistory>[1], deps: TrainingDeps = {}): Promise<TrainingSafeResult<ClientHistoryPage>>`
- `export async function readOwnTrainingProgramFromAction(session: Session, input: { workspaceId: string }, deps: TrainingDeps = {}): Promise<TrainingSafeResult<OwnTrainingView>>`
- `export async function readOwnTrainingProgramVersionsFromAction(session: Session, input: Parameters<typeof readOwnTrainingProgramVersions>[1], deps: TrainingDeps = {}): Promise<TrainingSafeResult<Cl...`
- `export async function readOwnTrainingVersionFromAction(session: Session, input: Parameters<typeof readOwnTrainingVersion>[1], deps: TrainingDeps = {}): Promise<TrainingSafeResult<OwnVersionDetail>>`
- `export async function readStaffTrainingBookingsFromAction(session: Session, input: Parameters<typeof readStaffTrainingBookings>[1], deps: TrainingDeps = {}): Promise<TrainingSafeResult<StaffBooking...`
- `export async function readStaffTrainingProgramFromAction(session: Session, input: Parameters<typeof readStaffTrainingProgram>[1], deps: TrainingDeps = {}): Promise<TrainingSafeResult<StaffProgramDe...`
- `export async function readStaffTrainingProgramVersionFromAction(session: Session, input: Parameters<typeof readStaffTrainingProgramVersion>[1], deps: TrainingDeps = {}): Promise<TrainingSafeResult<...`
- `export async function readStaffTrainingProgramsFromAction(session: Session, input: Parameters<typeof readStaffTrainingPrograms>[1], deps: TrainingDeps = {}): Promise<TrainingSafeResult<StaffProgram...`
- `export async function saveTrainingProgramDraftFromAction(session: Session, input: Parameters<typeof saveTrainingProgramDraft>[1], deps: TrainingDeps = {}): Promise<TrainingSafeResult<{ programId: s...`
- `export async function setTrainingProgramTimezoneFromAction(session: Session, input: Parameters<typeof setTrainingProgramTimezone>[1], deps: TrainingDeps = {}): Promise<TrainingSafeResult<{ programI...`

## `lib/trainingprogram/gate.ts`

- `export type TrainingPlansEnv = RuntimeEnv & { ENABLE_TRAINING_PLANS?: string }`
- `export type TrainingRuntimeClass = RuntimeClass`
- `export const classifyTrainingRuntime: ( env?: RuntimeEnv, ) => TrainingRuntimeClass`
- `export function isTrainingPlansEnabled(env: TrainingPlansEnv = process.env): boolean`

## `lib/trainingprogram/limits.ts`

- `export const TRAINING_LIMITS = { titleMax: 120, weekCountMin: 1, weekCountMax: 52, maxSessions: 24, maxExercisesPerSession: 24, sessionNameMax: 80, exerciseNameMax: 120, catalogItemIdMax: 64, setsM...`

## `lib/trainingprogram/payload.ts`

- `export type BoundaryMap<V> = Record<string, V>`
- `export type MaterializedExercise = { id: string; name: string; catalogItemId?: string; sets?: number; reps?: string; tempo?: string; setType?: string; rest?: string; instructions?: string; progress...`
- `export type MaterializedProgram = { programMode: "WEEK_BASED" | "EVERGREEN"; startDate: string; weekCount: number; weeks: MaterializedWeek[]; }`
- `export type MaterializedSession = { id: string; name: string; exercises: MaterializedExercise[]; }`
- `export type MaterializedWeek = { week: number; sessions: MaterializedSession[]; }`
- `export const TRAINING_FIELD_KEYS = [ "sets", "fixedReps", "repRanges", "tempo", "setType", "restPause", "instructions", "progressionNotes", ] as const`
- `export type TrainingDraft = { programMode: "WEEK_BASED" | "EVERGREEN"; sessions: { id: string; name: string }[]; exercises: { id: string; sessionId: string; name: string; catalogItemId?: string; }[...`
- `export class TrainingError extends Error (3 members)`
- `export type TrainingFieldConfig = Record<TrainingFieldKey, boolean>`
- `export type TrainingFieldKey = (typeof TRAINING_FIELD_KEYS)[number]`
- `export function canonicalDraftContent(input: { title: string; startDate: string; weekCount: number; fieldConfig: TrainingFieldConfig; confirmedTimezone: string | null; draft: TrainingDraft; }): string`
- `export function canonicalJson(value: unknown): string`
- `export function emptyTrainingDraft(programMode: TrainingDraft["programMode"] = "WEEK_BASED"): TrainingDraft`
- `export function enabledPayloadKeys(cfg: TrainingFieldConfig): ReadonlySet<string>`
- `export function materializeWeeks(draft: TrainingDraft, startDate: string, weekCount: number): MaterializedProgram`
- `export function normalizeFieldConfig(raw: unknown): TrainingFieldConfig`
- `export function normalizeTrainingDraft(raw: unknown): TrainingDraft`
- `export function projectForClient(materialized: MaterializedProgram, cfg: TrainingFieldConfig): MaterializedProgram`
- `export function validatePublishCompleteness(materialized: MaterializedProgram, cfg: TrainingFieldConfig): void`

## `lib/trainingprogram/service.ts`

- `export type ClientAgendaItem = { bookingId: string; scheduledDate: string; bookedWeek: number; session: MaterializedSession; }`
- `export type ClientBooking = { bookingId: string; scheduledDate: string; bookedWeek: number; session: MaterializedSession; }`
- `export type ClientBookingHistoryPage = { bookings: ClientBookingHistoryRow[]; nextCursor: { scheduledDate: string; id: string } | null; hasMore: boolean; }`
- `export type ClientBookingHistoryRow = { bookingId: string; scheduledDate: string; bookedWeek: number; sessionName: string; session: MaterializedSession; replacedProgramLabel: string | null; }`
- `export type ClientHistoryPage = { programs: { programId: string; startDate: string; takeoverInstant: string; superseded: boolean; }[]; nextCursor: { firstPublishedAt: string; id: string } | null; }`
- `export type ClientVersionsPage = { programId: string; versions: { id: string; versionSeq: number; effectiveDate: string; activationInstant: string; }[]; nextCursor: number | null; }`
- `export type { MaterializedExercise } from "./payload"`
- `export type { MaterializedProgram } from "./payload"`
- `export type { MaterializedSession } from "./payload"`
- `export type { MaterializedWeek } from "./payload"`
- `export type OwnTrainingView = { state: "none" | "upcoming" | "active" | "completed"; agenda: ClientAgendaItem[]; current: { programId: string; title: string; versionSeq: number; weekIndex: number; ...`
- `export type OwnVersionDetail = { id: string; programId: string; versionSeq: number; effectiveDate: string; activationInstant: string; scheduled: boolean; payload: MaterializedProgram; }`
- `export type StaffBooking = { bookingId: string; scheduledDate: string; bookedWeek: number; pinnedVersionSeq: number; session: MaterializedSession; cancelledAt: string | null; programUpdatedSinceBoo...`
- `export type StaffBookingsPage = { upcoming: StaffBooking[]; history: StaffBooking[]; nextCursor: { scheduledDate: string; id: string } | null; hasMore: boolean; canWrite: boolean; }`
- `export type StaffProgramDetail = { program: { id: string; title: string; startDate: string; weekCount: number; programMode: "WEEK_BASED" | "EVERGREEN"; fieldConfig: TrainingFieldConfig; confirmedTi...`
- `export type StaffProgramList = { programs: TrainingProgramListItem[]; nextCursor: { createdAt: string; id: string } | null; canWrite: boolean; }`
- `export type StaffVersionDetail = { id: string; programId: string; versionSeq: number; effectiveDate: string; effectiveTimezone: string; activationInstant: string; fieldConfig: TrainingFieldConfig; ...`
- `export { TRAINING_FIELD_KEYS } from "./payload"`
- `export type TrainingDeps = { db?: PrismaClient; registry?: ConsentPolicyRegistry; now?: Date; }`
- `export type { TrainingDraft } from "./payload"`
- `export { TrainingError } from "./payload"`
- `export type { TrainingFieldConfig } from "./payload"`
- `export type TrainingProgramListItem = { programId: string; title: string; startDate: string; weekCount: number; programMode: "WEEK_BASED" | "EVERGREEN"; firstPublishedAt: string | null; cancelledAt...`
- `export async function bookTrainingSession(session: SessionLike, input: { workspaceId: string; clientProfileId: string; programId: string; sessionId: string; scheduledDate: string; }, deps: Training...`
- `export async function cancelTrainingProgram(session: SessionLike, input: { workspaceId: string; clientProfileId: string; programId: string; }, deps: TrainingDeps = {}): Promise<{ programId: string;...`
- `export async function cancelTrainingSessionBooking(session: SessionLike, input: { workspaceId: string; clientProfileId: string; programId: string; bookingId: string; }, deps: TrainingDeps = {}): Pr...`
- `export async function moveTrainingSessionBooking(session: SessionLike, input: { workspaceId: string; clientProfileId: string; programId: string; bookingId: string; scheduledDate: string; }, deps: T...`
- `export function parseEffectiveDate(raw: unknown, now: Date): string`
- `export async function publishTrainingProgramVersion(session: SessionLike, input: { workspaceId: string; clientProfileId: string; programId: string; expectedRevision: number; effectiveDate: string; ...`
- `export async function readOwnTrainingBookingHistory(session: SessionLike, input: { workspaceId: string; cursor?: { scheduledDate: string; id: string }; }, deps: TrainingDeps = {}): Promise<ClientBo...`
- `export async function readOwnTrainingHistory(session: SessionLike, input: { workspaceId: string; cursor?: { firstPublishedAt: string; id: string }; }, deps: TrainingDeps = {}): Promise<ClientHistor...`
- `export async function readOwnTrainingProgram(session: SessionLike, input: { workspaceId: string }, deps: TrainingDeps = {}): Promise<OwnTrainingView>`
- `export async function readOwnTrainingProgramVersions(session: SessionLike, input: { workspaceId: string; programId: string; cursorSeq?: number; }, deps: TrainingDeps = {}): Promise<ClientVersionsPage>`
- `export async function readOwnTrainingVersion(session: SessionLike, input: { workspaceId: string; programId: string; versionId: string; }, deps: TrainingDeps = {}): Promise<OwnVersionDetail>`
- `export async function readStaffTrainingBookings(session: SessionLike, input: { workspaceId: string; clientProfileId: string; programId: string; cursor?: { scheduledDate: string; id: string }; }, de...`
- `export async function readStaffTrainingProgram(session: SessionLike, input: { workspaceId: string; clientProfileId: string; programId: string; versionCursor?: number; }, deps: TrainingDeps = {}): P...`
- `export async function readStaffTrainingProgramVersion(session: SessionLike, input: { workspaceId: string; clientProfileId: string; programId: string; versionId: string; }, deps: TrainingDeps = {}):...`
- `export async function readStaffTrainingPrograms(session: SessionLike, input: { workspaceId: string; clientProfileId: string; cursor?: { createdAt: string; id: string }; }, deps: TrainingDeps = {}):...`
- `export function resolveTrainingActivation(zone: string, effectiveDate: string): | { status: "ok"; instant: Date } | { status: "unrepresentable" } | { status: "invalid" }`
- `export async function saveTrainingProgramDraft(session: SessionLike, input: { workspaceId: string; clientProfileId: string; programId?: string; expectedRevision: number; title?: string; startDate?:...`
- `export async function setTrainingProgramTimezone(session: SessionLike, input: { workspaceId: string; clientProfileId: string; programId: string; timezone: string; }, deps: TrainingDeps = {}): Promi...`

## `lib/trainingprogram/weeks.ts`

- `export type VersionInstant = { id: string; versionSeq: number; effectiveDate: string; effectiveTimezone: string; activationInstant: Date; publishedAt: Date; }`
- `export function addDays(localDate: string, days: number): string`
- `export function boundaryInstant(zone: string, localDate: string): Date`
- `export function ceiling(anchorTz: string, startDate: string, weekCount: number, highWater: number, now: Date): number`
- `export function formatLocalDate(t: number): string`
- `export function governedSpan(versions: readonly VersionInstant[], v: VersionInstant, cutoffInstant: Date | null): { from: Date; to: Date } | null`
- `export function gvAt<T extends VersionInstant>(versions: readonly T[], t: Date, cutoffInstant: Date | null): T | null`
- `export function gvBefore<T extends VersionInstant>(versions: readonly T[], x: Date, cutoffInstant: Date | null): T | null`
- `export function isShadowed(versions: readonly VersionInstant[], v: VersionInstant): boolean`
- `export function localDateOf(instant: Date, zone: string): string`
- `export function parseLocalDate(raw: string): number`
- `export function versionForWeek<T extends VersionInstant>(versions: readonly T[], anchorTz: string, startDate: string, week: number, t: Date, cutoffInstant: Date | null): { version: T | null; state:...`
- `export function weekEndInstant(anchorTz: string, startDate: string, week: number): Date`
- `export function weekIndex(startDate: string, localDate: string): number`
- `export function weekMarker(versions: readonly VersionInstant[], anchorTz: string, startDate: string, week: number, t: Date): { label: "updated" | "updates"; effectiveDate: string } | null`
- `export function weekStartInstant(anchorTz: string, startDate: string, week: number): Date`
- `export function whollyPastWeeks(anchorTz: string, startDate: string, weekCount: number, now: Date): number`

## `lib/workspace/access.ts`

- `export type PrismaLike = PrismaClient | Prisma.TransactionClient`
- `export function createPrismaAuthorizationRepo(client: PrismaLike = prisma): AuthorizationRepo`
- `export const prismaAuthorizationRepo = createPrismaAuthorizationRepo()`

## `lib/workspace/clients.ts`

- `export type AssignmentMutationResult = { clientProfileId: string; coachMemberId: string; role: "PRIMARY" | "COACH"; status: "ACTIVE" | "REMOVED"; changed: boolean; }`
- `export type AssignmentSummary = { id: string; clientProfileId: string; coachMemberId: string; role: "PRIMARY" | "COACH"; status: "ACTIVE" | "REMOVED"; assignedAt: Date; }`
- `export const CLIENT_LIST_DEFAULT_LIMIT = 25`
- `export const CLIENT_LIST_MAX_LIMIT = 100`
- `export type ClientProfileSummary = { id: string; workspaceId: string; name: string; createdAt: Date; updatedAt: Date; }`
- `export type ServiceErrorCode = | "invalid_input" | "client_not_accessible" | "member_not_eligible" | "assignment_not_accessible" | "assignment_conflict" | "serialization_conflict" | "audit_not_wire...`
- `export class WorkspaceServiceError extends Error (1 members)`
- `export async function assignCoach(session: SessionLike, input: { workspaceId: string; clientProfileId: string; coachMemberId: string; role?: "PRIMARY" | "COACH"; }, client: PrismaClient = prisma): ...`
- `export function buildClientProfileWhere(scope: CollectionContext["grantedScope"], ctx: { workspaceId: string; userId: string; workspaceMemberId: string }): Prisma.ClientProfileWhereInput`
- `export function coachTargetRoleIsEligible(targetRole: WorkspaceRole, requestedRole: "PRIMARY" | "COACH"): boolean`
- `export async function createClientProfile(session: SessionLike, input: { workspaceId: string; name: unknown }, client: PrismaClient = prisma): Promise<ClientProfileSummary>`
- `export async function listAccessibleClientProfiles(session: SessionLike, input: { workspaceId: string; limit?: number; cursor?: string }, client: PrismaClient = prisma): Promise<{ items: ClientProf...`
- `export async function listAssignableCoachMembers(session: SessionLike, input: { workspaceId: string }, client: PrismaClient = prisma): Promise<{ memberId: string; displayName: string; role: Workspa...`
- `export async function listClientAssignments(session: SessionLike, input: { workspaceId: string; clientProfileId: string; limit?: number; cursor?: string; }, client: PrismaClient = prisma): Promise<...`
- `export function normalizeLimit(limit?: number): number`
- `export async function readClientProfile(session: SessionLike, input: { workspaceId: string; clientProfileId: string }, client: PrismaClient = prisma): Promise<ClientProfileSummary>`
- `export async function removeClientAssignment(session: SessionLike, input: { workspaceId: string; clientProfileId: string; coachMemberId: string; }, client: PrismaClient = prisma): Promise<Assignmen...`
- `export async function setPrimaryCoach(session: SessionLike, input: { workspaceId: string; clientProfileId: string; coachMemberId: string; }, client: PrismaClient = prisma): Promise<AssignmentMutati...`
- `export async function updateClientProfileName(session: SessionLike, input: { workspaceId: string; clientProfileId: string; name: unknown }, client: PrismaClient = prisma): Promise<ClientProfileSumm...`
- `export function validateName(name: unknown): string`

## `lib/workspace/invitations.ts`

- `export type AcceptanceOutcome = "accepted" | "already_member"`
- `export type AcceptanceResult = { outcome: AcceptanceOutcome; userId: string; membershipId: string; workspaceId: string; }`
- `export type CreatedInvitation = { invitationId: string; expiresAt: Date; delivery: InvitationDeliveryPayload; }`
- `export type InvitableRole = "COACH" | "ASSISTANT_COACH" | "CLIENT"`
- `export type InvitationDeliveryPayload = { kind: "workspace_invite"; to: string; rawToken: RawAccessToken; expiresAt: Date; workspaceId: string; }`
- `export class InvitationError extends Error (1 members)`
- `export type InvitationErrorCode = | "invalid_input" | "invalid_token" | "identity_required" | "identity_mismatch" | "account_ineligible" | "membership_conflict" | "serialization_conflict" | "invita...`
- `export type InvitationStatus = "active" | "consumed" | "revoked" | "expired"`
- `export type InvitationSummary = { id: string; targetEmail: string; intendedRole: InvitableRole; expiresAt: Date; status: InvitationStatus; }`
- `export async function acceptWorkspaceInvitation(session: SessionLike, input: { workspaceId: string; rawToken: unknown; name?: unknown; password?: unknown; }, client: PrismaClient = prisma): Promise...`
- `export function assertInvitationOrchestrationExternallyExposable(): never`
- `export async function createWorkspaceInvitation(session: SessionLike, input: { workspaceId: string; targetEmail: unknown; intendedRole: unknown }, client: PrismaClient = prisma): Promise<CreatedInv...`
- `export function invitationResource(intendedRole: InvitableRole): "membersInvitations" | "clientInvitations"`
- `export function isExpectedUniqueRace(error: Prisma.PrismaClientKnownRequestError)`
- `export function isInvitableRole(value: unknown): value is InvitableRole`
- `export async function listWorkspaceInvitations(session: SessionLike, input: { workspaceId: string; limit?: number; cursor?: string }, client: PrismaLike = prisma): Promise<{ items: InvitationSummar...`
- `export async function revokeWorkspaceInvitation(session: SessionLike, input: { workspaceId: string; invitationId: unknown }, client: PrismaClient = prisma): Promise<{ changed: boolean }>`

## `lib/workspace/invite-acceptance.ts`

- `export type InviteAcceptanceResult = { ok: true } | { ok: false; message: string }`
- `export type InviteLinkState = { state: "ready" } | { state: "invalid" }`
- `export async function acceptInvitationFromLink(session: SessionLike, input: { workspaceId: unknown; rawToken: unknown; name?: unknown; password?: unknown; }, client: PrismaClient = prisma): Promise...`
- `export function acceptInvitationMessage(error: unknown): string`
- `export async function getInviteLinkState(input: { workspaceId: unknown; rawToken: unknown }, client: PrismaClient = prisma): Promise<InviteLinkState>`
- `export async function getInviteShellRole(input: { workspaceId: unknown; rawToken: unknown }, client: PrismaClient = prisma): Promise<"client" | "staff" | null>`

## `lib/workspace/roster-query.ts`

- `export const HISTORY_START = "-"`
- `export const ROSTER_PAGE_SIZE = 25`
- `export type RosterQuery = { cursor: string | undefined; history: string[]; }`
- `export function nextRosterHref(base: string, current: RosterQuery, nextCursor: string): string`
- `export function parseRosterQuery(raw: { c?: string | string[]; p?: string | string[]; }): RosterQuery | null`
- `export function prevRosterHref(base: string, history: string[]): string | null`
- `export function rosterPageNumber(history: string[]): number`

## `lib/workspace/roster.ts`

- `export type ClientRosterEntry = { clientProfileId: string; name: string; }`
- `export type ClientRosterResult = { items: ClientRosterEntry[]; nextCursor: string | null; }`
- `export const ROSTER_DEFAULT_LIMIT = 25`
- `export const ROSTER_MAX_LIMIT = 100`
- `export function encodeRosterCursor(createdAt: Date, id: string): string`
- `export async function listWorkspaceClientRoster(viewer: ApiViewer, workspace: ApiWorkspaceContext, input: { limit?: number; cursor?: string }, client: PrismaLike = prisma): Promise<ClientRosterResult>`
- `export function parseRosterCursor(cursor: string): { createdAt: Date; id: string } | null`
