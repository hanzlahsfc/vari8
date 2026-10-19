# PR-05 test reconciliation

One row per audit block in every test file this PR touched. Audit source:
`icm/03-plan/output/TEST-AUDIT.md` block tables. Actions: **kept** (verbatim or
restored verbatim at the same path), **rewired** (guarantee re-expressed against
Better Auth seams at the same path), **replaced** (old-matrix assertion retired;
D15 coverage lives in `tests/unit/roles.test.ts` +
`tests/integration/api-v1-session.test.ts`), **rewritten** (guarantee re-proven
in `tests/integration/pr05-security.test.ts`).

| File | Block | Tests | Audit verdict | Action / new location |
|---|---|---:|---|---|
| `tests/integration/checkin-feedback-i1.test.ts` | TB2.022 CHECK-IN-FEEDBACK-I1 (real PG) | 21 | CUT-AT-REPLACE | Kept — restored verbatim |
| `tests/integration/checkin-overview-i1.test.ts` | TB1.001 CHECK-IN-OVERVIEW-I1 review queue (real PG) | 18 | CUT-AT-REPLACE | Kept — restored verbatim |
| `tests/integration/checkin-recurrence-i1.test.ts` | TB3.001 CHECK-IN-RECURRENCE-I1 (real PG) | 18 | CUT-AT-REPLACE | Kept — restored verbatim |
| `tests/integration/client-tasks.test.ts` | TB3.002 CLIENT-TASKS-I1 (real PG) | 14 | CUT-AT-REPLACE | Kept — restored verbatim |
| `tests/integration/dashboard-layout.test.ts` | TB3.003 DASHBOARD-I1 layout persistence (real PG) | 7 | CUT-AT-REPLACE | Kept — restored verbatim |
| `tests/integration/dashboard-layout.test.ts` | TB3.004 DASHBOARD-I1 hardening (I1-R2) | 3 | CUT-AT-REPLACE | Kept — restored verbatim |
| `tests/integration/habits.test.ts` | TB1.002 HABITS-I1 (real PG) | 35 | CUT-AT-REPLACE | Kept — restored verbatim |
| `tests/integration/i4-next-checkin.test.ts` | TB0.002 FI-I4 next-Check-In selection (real PG) | 8 | CUT-AT-REPLACE | Kept — restored verbatim |
| `tests/integration/mealplan-i1.test.ts` | TB3.005 MEAL-PLAN-I1 (real PG) | 19 | CUT-AT-REPLACE | Kept — restored verbatim |
| `tests/integration/p008-onboarding-actions.test.ts` | TB2.025 P-008 onboarding actions (real PG) | 12 | CUT-AT-REPLACE | Kept — restored verbatim |
| `tests/integration/p008-onboarding-forms.test.ts` | TB0.003 P-008 onboarding forms (real PG) | 46 | CUT-AT-REPLACE | Kept — restored verbatim |
| `tests/integration/p010-client-roster.test.ts` | TB2.002 P-010 client roster (real PG) | 9 | CUT-AT-REPLACE | Kept — restored verbatim |
| `tests/integration/p013-onboarding-assignments.test.ts` | TB2.013 schema constraints | 3 | GUARD | Kept — removed blocks restored verbatim |
| `tests/integration/p013-onboarding-assignments.test.ts` | TB2.014 authorization | 7 | CUT-AT-REPLACE | Kept — removed blocks restored verbatim |
| `tests/integration/p013-onboarding-assignments.test.ts` | TB2.015 eligibility | 2 | CUT-AT-REPLACE | Kept — removed blocks restored verbatim |
| `tests/integration/p013-onboarding-assignments.test.ts` | TB2.016 create / replace / cancel lifecycle | 12 | GUARD | Kept — removed blocks restored verbatim |
| `tests/integration/p013-onboarding-assignments.test.ts` | TB2.017 authorization order and non-disclosure (P2-1) | 2 | CUT-AT-REPLACE | Kept — removed blocks restored verbatim |
| `tests/integration/p013-onboarding-assignments.test.ts` | TB2.018 form-picker authorization (P2-3) | 1 | CUT-AT-REPLACE | Kept — removed blocks restored verbatim |
| `tests/integration/p013-onboarding-assignments.test.ts` | TB2.019 platform-admin dual role (P3) | 1 | CUT-AT-REPLACE | Kept — removed blocks restored verbatim |
| `tests/integration/p013-onboarding-assignments.test.ts` | TB2.020 assistant assigned read scope (P3) | 1 | CUT-AT-REPLACE | Kept — removed blocks restored verbatim |
| `tests/integration/p013-onboarding-assignments.test.ts` | TB2.021 feature gate | 1 | GUARD | Kept — removed blocks restored verbatim |
| `tests/integration/p014-coaching-templates.test.ts` | TB0.035 schema constraints | 4 | GUARD | Untouched — block was never removed |
| `tests/integration/p014-coaching-templates.test.ts` | TB0.036 authorization | 6 | CUT-AT-REPLACE | Replaced — old-matrix assertions retired; D15 coverage in tests/unit/roles.test.ts + tests/integration/api-v1-session.test.ts |
| `tests/integration/p014-coaching-templates.test.ts` | TB0.037 parameter lifecycle | 3 | GUARD | Untouched — block was never removed |
| `tests/integration/p014-coaching-templates.test.ts` | TB0.038 template lifecycle and publish protocol | 8 | GUARD | Untouched — block was never removed |
| `tests/integration/p014-coaching-templates.test.ts` | TB0.039 concurrency | 3 | GUARD | Untouched — block was never removed |
| `tests/integration/p014-coaching-templates.test.ts` | TB0.040 audit integrity | 1 | CUT pass 2 | Replaced — old-matrix assertions retired; D15 coverage in tests/unit/roles.test.ts + tests/integration/api-v1-session.test.ts |
| `tests/integration/p014-coaching-templates.test.ts` | TB0.041 parameter list pagination | 2 | GUARD | Untouched — block was never removed |
| `tests/integration/p014-coaching-templates.test.ts` | TB0.042 option tombstones | 1 | GUARD | Untouched — block was never removed |
| `tests/integration/p016-client-setup.test.ts` | TB2.007 schema constraints | 3 | GUARD | Kept — removed blocks restored verbatim |
| `tests/integration/p016-client-setup.test.ts` | TB2.008 authorization | 7 | CUT-AT-REPLACE | Kept — removed blocks restored verbatim |
| `tests/integration/p016-client-setup.test.ts` | TB2.009 eligibility | 2 | CUT-AT-REPLACE | Kept — removed blocks restored verbatim |
| `tests/integration/p016-client-setup.test.ts` | TB2.010 create / cancel lifecycle | 17 | CUT-AT-REPLACE | Kept — removed blocks restored verbatim |
| `tests/integration/p016-client-setup.test.ts` | TB2.011 P-016-R2 positional selection + fingerprint resolution | 13 | CUT-AT-REPLACE | Kept — removed blocks restored verbatim |
| `tests/integration/p020b-template-transitions.test.ts` | TB3.006 migration + lineage invariants | 5 | GUARD | Kept — removed blocks restored verbatim |
| `tests/integration/p020b-template-transitions.test.ts` | TB3.007 review + execute | 10 | CUT-AT-REPLACE | Kept — removed blocks restored verbatim |
| `tests/integration/p020b-template-transitions.test.ts` | TB3.008 synthetic provider behavior | 2 | GUARD | Kept — removed blocks restored verbatim |
| `tests/integration/p020b-template-transitions.test.ts` | TB3.009 concurrency + atomicity | 2 | GUARD | Kept — removed blocks restored verbatim |
| `tests/integration/p020b-template-transitions.test.ts` | TB3.010 feature gate | 1 | CUT pass 2 | Kept — removed blocks restored verbatim |
| `tests/integration/p021-daily-entry.test.ts` | TB1.009 schema constraints | 5 | GUARD | Kept — removed blocks restored verbatim |
| `tests/integration/p021-daily-entry.test.ts` | TB1.010 save lifecycle | 13 | CUT-AT-REPLACE | Kept — removed blocks restored verbatim |
| `tests/integration/p021-daily-entry.test.ts` | TB1.011 daily-entry C2 impact provider | 1 | GUARD | Kept — removed blocks restored verbatim |
| `tests/integration/p022-staff-daily-review.test.ts` | TB0.043 list authorization | 11 | CUT-AT-REPLACE | Kept — removed blocks restored verbatim |
| `tests/integration/p022-staff-daily-review.test.ts` | TB0.044 list consent and paging | 4 | CUT-AT-REPLACE | Kept — removed blocks restored verbatim |
| `tests/integration/p022-staff-daily-review.test.ts` | TB0.045 detail authorization and minimization | 8 | CUT-AT-REPLACE | Kept — removed blocks restored verbatim |
| `tests/integration/p022-staff-daily-review.test.ts` | TB0.046 detail audit atomicity | 3 | GUARD | Kept — removed blocks restored verbatim |
| `tests/integration/p022-staff-daily-review.test.ts` | TB0.047 serialization races | 5 | CUT-AT-REPLACE | Kept — removed blocks restored verbatim |
| `tests/integration/p022-staff-daily-review.test.ts` | TB0.048 query bounds | 1 | GUARD | Kept — removed blocks restored verbatim |
| `tests/integration/p023-onboarding-submission.test.ts` | TB0.049 migration contract | 3 | GUARD | Kept — removed blocks restored verbatim |
| `tests/integration/p023-onboarding-submission.test.ts` | TB0.050 submit transaction | 5 | GUARD | Kept — removed blocks restored verbatim |
| `tests/integration/p023-onboarding-submission.test.ts` | TB0.051 authorization + non-disclosure | 3 | CUT-AT-REPLACE | Kept — removed blocks restored verbatim |
| `tests/integration/p023-onboarding-submission.test.ts` | TB0.052 consent boundary | 3 | CUT-AT-REPLACE | Kept — removed blocks restored verbatim |
| `tests/integration/p023-onboarding-submission.test.ts` | TB0.053 pinned-version integrity | 1 | GUARD | Kept — removed blocks restored verbatim |
| `tests/integration/p023-onboarding-submission.test.ts` | TB0.054 own reads | 2 | VISIBLE | Kept — removed blocks restored verbatim |
| `tests/integration/p023-onboarding-submission.test.ts` | TB0.055 boundary gate | 1 | GUARD | Kept — removed blocks restored verbatim |
| `tests/integration/p023-onboarding-submission.test.ts` | TB0.056 repair A ,  trusted dev/test consent boundary (real path) | 4 | CUT-AT-REPLACE | Kept — removed blocks restored verbatim |
| `tests/integration/p023-onboarding-submission.test.ts` | TB0.057 repair B ,  consent precedes answer materialization | 2 | CUT-AT-REPLACE | Kept — removed blocks restored verbatim |
| `tests/integration/p023-onboarding-submission.test.ts` | TB0.058 repair C ,  P2002 fully-authorized replay | 7 | CUT-AT-REPLACE | Kept — removed blocks restored verbatim |
| `tests/integration/p024-onboarding-review.test.ts` | TB3.011 P-024 staff onboarding review (real PG) | 23 | CUT-AT-REPLACE | Kept — restored verbatim |
| `tests/integration/p025a-checkin-actions.test.ts` | TB3.012 P-025-A checkin actions (real PG) | 8 | CUT-AT-REPLACE | Kept — restored verbatim |
| `tests/integration/p025a-checkin-forms.test.ts` | TB3.013 P-025-A check-in form service (real PG) | 15 | CUT-AT-REPLACE | Kept — restored verbatim |
| `tests/integration/p025b-checkin-instances.test.ts` | TB1.012 P-025-B check-in instances (real PG) | 27 | CUT-AT-REPLACE | Kept — restored verbatim |
| `tests/integration/p025c-checkin-review.test.ts` | TB1.013 P-025-C check-in staff review (real PG) | 19 | CUT-AT-REPLACE | Kept — restored verbatim |
| `tests/integration/p025d2-checkin-calendar.test.ts` | TB2.023 P-025-D2 calendar list (real PG) | 10 | CUT-AT-REPLACE | Kept — removed blocks restored verbatim |
| `tests/integration/p025d2-checkin-calendar.test.ts` | TB2.024 P-025-D2 R2 truncation signal (real PG) | 4 | GUARD | Kept — removed blocks restored verbatim |
| `tests/integration/p025d6-checkin-tracker-context.test.ts` | TB2.006 P-025-D6 tracker context (real PG) | 35 | CUT-AT-REPLACE | Kept — restored verbatim |
| `tests/integration/phase-1-1-daily-tracker-guard.test.ts` | TB0.059 Phase 1.1 Daily Tracker route guard (real PG) | 2 | CUT-AT-REPLACE | Kept — restored verbatim |
| `tests/integration/phase-3-2-password-reset.test.ts` | TB0.061 Phase 3.2 password-reset boundary (real PG) | 6 | GUARD | Rewired — mailbox→digest-only verification row→consume→revocation pipeline |
| `tests/integration/s1-b-authorization.test.ts` | TB3.016 S1-B authorization (real PostgreSQL) | 13 | CUT-AT-REPLACE | Kept — restored verbatim |
| `tests/integration/s1-c-client-assignments.test.ts` | TB1.015 S1-C client ownership & assignments | 9 | CUT-AT-REPLACE | Kept — restored verbatim |
| `tests/integration/s1-f2a-token-store.test.ts` | TB1.019 S1-F2A token store (real PostgreSQL) | 14 | GUARD | Partially rewritten — 2 reset-issuance tests moved to `tests/integration/pr05-security.test.ts` (digest-only storage, user-scoped supersede); the 12 access-token tests stay |
| `tests/integration/s1-f2b-session-runtime.test.ts` | TB1.020 S1-F2B session revocation through the real Auth.js pipeline | 7 | GUARD | Rewired — real auth() seam, cookie+bearer, forged/expired, fail-closed store |
| `tests/integration/s1-f2b-session.test.ts` | TB1.021 S1-F2B session version (real PostgreSQL) | 6 | GUARD | Rewired — session-row lifecycle, row-deletion revocation, deactivation |
| `tests/integration/s1-f2c-invitations.test.ts` | TB3.018 S1-F2C invitation orchestration (real PG) | 32 | CUT-AT-REPLACE | Kept — restored verbatim |
| `tests/integration/s1-f2d-password-reset.test.ts` | TB0.093 S1-F2D password-reset orchestration (real PG) | 18 | GUARD | Rewired — TB0.093 contracts vs Better Auth verification rows |
| `tests/integration/s1-g-export.test.ts` | TB1.022 S1-G export | 9 | CUT-AT-REPLACE | Kept — restored verbatim |
| `tests/integration/s1-h-route-guard.test.ts` | TB0.094 S1-H route guard (real PG) | 6 | CUT-AT-REPLACE | Kept — restored verbatim |
| `tests/integration/solo-coach-i1.test.ts` | TB2.001 SOLO-COACH-I1 owner-as-coach (real PG) | 6 | CUT-AT-REPLACE | Kept — restored verbatim |
| `tests/integration/training-i1a.test.ts` | TB2.012 TRAINING-I1A (real PG) | 20 | CUT-AT-REPLACE | Kept — restored verbatim |
| `tests/unit/audit.test.ts` | TB2.026 sanitizeAuditMeta | 43 | GUARD | Untouched — block was never removed |
| `tests/unit/audit.test.ts` | TB2.027 buildAuditEvent | 5 | GUARD | Untouched — block was never removed |
| `tests/unit/audit.test.ts` | TB2.028 writeAuditEvent | 2 | CUT pass 2 | Replaced — old-matrix assertions retired; D15 coverage in tests/unit/roles.test.ts + tests/integration/api-v1-session.test.ts |
| `tests/unit/audit.test.ts` | TB2.029 listAuditEvents | 2 | CUT-AT-REPLACE | Replaced — old-matrix assertions retired; D15 coverage in tests/unit/roles.test.ts + tests/integration/api-v1-session.test.ts |
| `tests/unit/audit.test.ts` | TB2.030 listAccountAuditEvents (S1-F2B internal primitive) | 1 | GUARD | Untouched — block was never removed |
| `tests/unit/audit.test.ts` | TB2.031 buildAccountAuditEvent (S1-F2B) | 21 | GUARD | Untouched — block was never removed |
| `tests/unit/checkin-feedback.test.ts` | TB1.023 CHECK-IN-FEEDBACK-I1 RBAC ,  checkinFeedback | 4 | CUT-AT-REPLACE | Kept — restored verbatim |
| `tests/unit/checkin-feedback.test.ts` | TB1.024 CHECK-IN-FEEDBACK-I1 deny-set + audit registry | 1 | CUT pass 2 | Kept — restored verbatim |
| `tests/unit/checkin-feedback.test.ts` | TB1.025 CHECK-IN-FEEDBACK-I1 dual-role PLATFORM_ADMIN denial | 5 | CUT-AT-REPLACE | Kept — restored verbatim |
| `tests/unit/checkin-feedback.test.ts` | TB1.026 CHECK-IN-FEEDBACK-I1 boundary exports | 1 | CUT pass 2 | Kept — restored verbatim |
| `tests/unit/checkin-forms.test.ts` | TB0.007 P-025-A shared server-only check-in feature resolver | 4 | GUARD | Untouched — block was never removed |
| `tests/unit/checkin-forms.test.ts` | TB0.008 P-025-A RBAC ,  checkinFormDefinitions | 3 | CUT-AT-REPLACE | Replaced — old-matrix assertions retired; D15 coverage in tests/unit/roles.test.ts + tests/integration/api-v1-session.test.ts |
| `tests/unit/checkin-forms.test.ts` | TB0.009 P-025-A dual-role PLATFORM_ADMIN denial | 5 | CUT-AT-REPLACE | Replaced — old-matrix assertions retired; D15 coverage in tests/unit/roles.test.ts + tests/integration/api-v1-session.test.ts |
| `tests/unit/checkin-forms.test.ts` | TB0.010 P-025-A validateCheckInDefinition | 12 | GUARD | Untouched — block was never removed |
| `tests/unit/checkin-forms.test.ts` | TB0.011 P-025-A seam ,  app never imports the service directly | 1 | CUT pass 2 | Replaced — old-matrix assertions retired; D15 coverage in tests/unit/roles.test.ts + tests/integration/api-v1-session.test.ts |
| `tests/unit/checkin-instances.test.ts` | TB2.040 P-025-B ,  checkinInstances RBAC matrix | 2 | CUT-AT-REPLACE | Replaced — old-matrix assertions retired; D15 coverage in tests/unit/roles.test.ts + tests/integration/api-v1-session.test.ts |
| `tests/unit/checkin-instances.test.ts` | TB2.041 P-025-B ,  platform-admin deny-set completeness | 2 | CUT-AT-REPLACE | Replaced — old-matrix assertions retired; D15 coverage in tests/unit/roles.test.ts + tests/integration/api-v1-session.test.ts |
| `tests/unit/checkin-instances.test.ts` | TB2.042 P-025-B ,  derived lifecycle projector | 2 | VISIBLE | Untouched — block was never removed |
| `tests/unit/checkin-instances.test.ts` | TB2.043 P-025-B ,  dueAt and payload bounds | 2 | GUARD | Untouched — block was never removed |
| `tests/unit/checkin-instances.test.ts` | TB2.044 P-025-B ,  answer canonicalization (typed, definition-bound) | 14 | GUARD | Untouched — block was never removed |
| `tests/unit/checkin-instances.test.ts` | TB2.045 P-025-B ,  consent policy resolver | 1 | CUT-AT-REPLACE | Replaced — old-matrix assertions retired; D15 coverage in tests/unit/roles.test.ts + tests/integration/api-v1-session.test.ts |
| `tests/unit/checkin-instances.test.ts` | TB2.046 P-025-B ,  closed error vocabulary | 1 | CUT pass 2 | Replaced — old-matrix assertions retired; D15 coverage in tests/unit/roles.test.ts + tests/integration/api-v1-session.test.ts |
| `tests/unit/checkin-instances.test.ts` | TB2.047 P-025-B ,  boundary seam exists for app-facing calls | 1 | CUT pass 2 | Replaced — old-matrix assertions retired; D15 coverage in tests/unit/roles.test.ts + tests/integration/api-v1-session.test.ts |
| `tests/unit/checkin-review.test.ts` | TB2.053 P-025-C ,  REVIEWED in the derived projector | 2 | VISIBLE | Kept — restored verbatim |
| `tests/unit/checkin-review.test.ts` | TB2.054 P-025-C ,  audit resource union | 1 | CUT pass 2 | Kept — restored verbatim |
| `tests/unit/checkin-review.test.ts` | TB2.055 P-025-C ,  service exports | 1 | CUT pass 2 | Kept — restored verbatim |
| `tests/unit/checkin-review.test.ts` | TB2.056 P-025-C ,  boundary exports | 1 | CUT pass 2 | Kept — restored verbatim |
| `tests/unit/checkin-review.test.ts` | TB2.057 P-025-C ,  checkinsCoachReviews capability split | 1 | CUT-AT-REPLACE | Kept — restored verbatim |
| `tests/unit/checkin-tracker-context.test.ts` | TB0.012 reconcileTrackerContextScopes | 18 | CUT-AT-REPLACE | Replaced — old-matrix assertions retired; D15 coverage in tests/unit/roles.test.ts + tests/integration/api-v1-session.test.ts |
| `tests/unit/checkin-tracker-context.test.ts` | TB0.013 declared-date contract (shared parser) | 5 | GUARD | Untouched — block was never removed |
| `tests/unit/clients-service.test.ts` | TB1.028 buildClientProfileWhere | 1 | GUARD | Untouched — block was never removed |
| `tests/unit/clients-service.test.ts` | TB1.029 normalizeLimit | 2 | GUARD | Untouched — block was never removed |
| `tests/unit/clients-service.test.ts` | TB1.030 validateName | 1 | GUARD | Untouched — block was never removed |
| `tests/unit/clients-service.test.ts` | TB1.031 coachTargetRoleIsEligible | 1 | CUT-AT-REPLACE | Replaced — old-matrix assertions retired; D15 coverage in tests/unit/roles.test.ts + tests/integration/api-v1-session.test.ts |
| `tests/unit/clients-service.test.ts` | TB1.032 authorizeCollection | 2 | CUT-AT-REPLACE | Replaced — old-matrix assertions retired; D15 coverage in tests/unit/roles.test.ts + tests/integration/api-v1-session.test.ts |
| `tests/unit/clients-service.test.ts` | TB1.033 listAccessibleClientProfiles | 1 | GUARD | Untouched — block was never removed |
| `tests/unit/clients-service.test.ts` | TB1.034 createClientProfile | 1 | GUARD | Untouched — block was never removed |
| `tests/unit/clients-service.test.ts` | TB1.035 updateClientProfileName | 2 | CUT-AT-REPLACE | Replaced — old-matrix assertions retired; D15 coverage in tests/unit/roles.test.ts + tests/integration/api-v1-session.test.ts |
| `tests/unit/clients-service.test.ts` | TB1.036 assignCoach | 2 | CUT-AT-REPLACE | Replaced — old-matrix assertions retired; D15 coverage in tests/unit/roles.test.ts + tests/integration/api-v1-session.test.ts |
| `tests/unit/clients-service.test.ts` | TB1.037 structural errors | 1 | CUT pass 2 | Replaced — old-matrix assertions retired; D15 coverage in tests/unit/roles.test.ts + tests/integration/api-v1-session.test.ts |
| `tests/unit/credentials.test.ts` | TB0.029 authorizeCredentials | 6 | GUARD | Rewired — kept scrypt hash/verify, normalizeEmail, generic sign-in gate |
| `tests/unit/credentials.test.ts` | TB0.030 normalizeEmail | 1 | GUARD | Rewired — kept scrypt hash/verify, normalizeEmail, generic sign-in gate |
| `tests/unit/guard.test.ts` | TB0.062 authorize ,  default deny | 7 | CUT-AT-REPLACE | Kept — restored verbatim |
| `tests/unit/guard.test.ts` | TB0.063 authorize ,  scopes | 7 | CUT-AT-REPLACE | Kept — restored verbatim |
| `tests/unit/guard.test.ts` | TB0.064 authorize ,  PD29 platform-admin dual-role on onboardingFormTemplates | 8 | CUT-AT-REPLACE | Kept — restored verbatim |
| `tests/unit/guard.test.ts` | TB0.065 CLIENT-TASKS-I1 (decision 109) ,  platform-admin deny-set | 5 | CUT-AT-REPLACE | Kept — restored verbatim |
| `tests/unit/guard.test.ts` | TB0.066 HABITS-I1 (decision 110) ,  platform-admin deny-set | 5 | CUT-AT-REPLACE | Kept — restored verbatim |
| `tests/unit/guard.test.ts` | TB0.067 SOLO-COACH-I1 (decision 111) ,  platform-admin deny-set: clientAssignments | 6 | CUT-AT-REPLACE | Kept — restored verbatim |
| `tests/unit/invitations.test.ts` | TB1.047 S1-F2C invitation helpers | 6 | CUT-AT-REPLACE | Kept — restored verbatim |
| `tests/unit/invitations.test.ts` | TB1.048 P2002 race classification | 2 | GUARD | Kept — restored verbatim |
| `tests/unit/invitations.test.ts` | TB1.049 list query bound | 1 | GUARD | Kept — restored verbatim |
| `tests/unit/invitations.test.ts` | TB1.050 post-lock re-authorization | 1 | CUT-AT-REPLACE | Kept — restored verbatim |
| `tests/unit/onboarding-forms.test.ts` | TB0.084 P-008 validation ,  definition bounds | 6 | GUARD | Untouched — block was never removed |
| `tests/unit/onboarding-forms.test.ts` | TB0.085 P-008 validation ,  field ID trust | 2 | GUARD | Untouched — block was never removed |
| `tests/unit/onboarding-forms.test.ts` | TB0.086 P-008 boundary ,  raw payload bound before parse | 1 | CUT pass 2 | Replaced — old-matrix assertions retired; D15 coverage in tests/unit/roles.test.ts + tests/integration/api-v1-session.test.ts |
| `tests/unit/onboarding-forms.test.ts` | TB0.087 P-008 RBAC ,  onboardingFormTemplates | 2 | CUT-AT-REPLACE | Replaced — old-matrix assertions retired; D15 coverage in tests/unit/roles.test.ts + tests/integration/api-v1-session.test.ts |
| `tests/unit/onboarding-forms.test.ts` | TB0.088 P-008 seam ,  app never imports the service | 1 | CUT pass 2 | Replaced — old-matrix assertions retired; D15 coverage in tests/unit/roles.test.ts + tests/integration/api-v1-session.test.ts |
| `tests/unit/onboarding-review.test.ts` | TB3.054 onboardingSubmissionReviews ,  resource and matrix (P-024) | 2 | CUT-AT-REPLACE | Replaced — old-matrix assertions retired; D15 coverage in tests/unit/roles.test.ts + tests/integration/api-v1-session.test.ts |
| `tests/unit/onboarding-review.test.ts` | TB3.055 onboardingSubmissionReviews ,  dual-role platform-admin denial | 1 | CUT-AT-REPLACE | Replaced — old-matrix assertions retired; D15 coverage in tests/unit/roles.test.ts + tests/integration/api-v1-session.test.ts |
| `tests/unit/onboarding-review.test.ts` | TB3.056 onboardingSubmissionReviews ,  consent mapping (P-024) | 1 | CUT-AT-REPLACE | Replaced — old-matrix assertions retired; D15 coverage in tests/unit/roles.test.ts + tests/integration/api-v1-session.test.ts |
| `tests/unit/onboarding-review.test.ts` | TB3.057 audit resource ,  onboarding_submission_review (P-024) | 1 | CUT pass 2 | Replaced — old-matrix assertions retired; D15 coverage in tests/unit/roles.test.ts + tests/integration/api-v1-session.test.ts |
| `tests/unit/onboarding-submission.test.ts` | TB3.058 P-023 gate | 1 | GUARD | Untouched — block was never removed |
| `tests/unit/onboarding-submission.test.ts` | TB3.059 P-023-I1-R2 trusted consent-policy resolver (Repair A) | 5 | CUT-AT-REPLACE | Replaced — old-matrix assertions retired; D15 coverage in tests/unit/roles.test.ts + tests/integration/api-v1-session.test.ts |
| `tests/unit/onboarding-submission.test.ts` | TB3.060 P-023 parseAnswersJson | 8 | GUARD | Untouched — block was never removed |
| `tests/unit/onboarding-submission.test.ts` | TB3.061 P-023 canonicalizeAnswers | 10 | GUARD | Untouched — block was never removed |
| `tests/unit/onboarding-submission.test.ts` | TB3.062 P-023 RBAC | 1 | CUT-AT-REPLACE | Replaced — old-matrix assertions retired; D15 coverage in tests/unit/roles.test.ts + tests/integration/api-v1-session.test.ts |
| `tests/unit/onboarding-submission.test.ts` | TB3.063 P-023 route-leaf uniqueness | 1 | CUT pass 2 | Replaced — old-matrix assertions retired; D15 coverage in tests/unit/roles.test.ts + tests/integration/api-v1-session.test.ts |
| `tests/unit/password-reset-boundary.test.ts` | TB3.064 getResetLinkState (non-consuming peek) | 3 | GUARD | Kept — removed blocks restored verbatim |
| `tests/unit/password-reset-boundary.test.ts` | TB3.065 requestPasswordResetFromForm (non-enumerating) | 3 | GUARD | Kept — removed blocks restored verbatim |
| `tests/unit/password-reset-boundary.test.ts` | TB3.066 passwordResetMessage (safe error mapping) | 3 | GUARD | Kept — removed blocks restored verbatim |
| `tests/unit/password-reset-boundary.test.ts` | TB3.067 completePasswordReset | 2 | GUARD | Kept — removed blocks restored verbatim |
| `tests/unit/password-reset-boundary.test.ts` | TB3.068 delivery-capability gate (fail closed until a real adapter) | 3 | GUARD | Kept — removed blocks restored verbatim |
| `tests/unit/password-reset-delivery.test.ts` | TB1.061 passwordResetDeliveryAvailable | 3 | GUARD | Rewired — mailDeliveryConfigured env matrix + dev-file sendMail |
| `tests/unit/password-reset-token-failure.test.ts` | TB0.095 safeTokenHash classification | 1 | GUARD | Rewired — boundary fail-closed cases via fake verification client |
| `tests/unit/password-reset.test.ts` | TB2.088 S1-F2D password-reset ,  unit surface | 12 | GUARD | Rewired — kept TB2.088 boundary/audit-metadata; dropped deleted service machinery |
| `tests/unit/password-reset.test.ts` | TB2.089 route boundary | 1 | CUT pass 2 | Rewired — kept TB2.088 boundary/audit-metadata; dropped deleted service machinery |
| `tests/unit/rbac.test.ts` | TB1.062 RBAC matrix | 5 | CUT-AT-REPLACE | Kept — restored verbatim |
| `tests/unit/route-guard.test.ts` | TB1.064 resolveWorkspaceAccess | 3 | CUT-AT-REPLACE | Replaced — old-matrix assertions retired; D15 coverage in tests/unit/roles.test.ts + tests/integration/api-v1-session.test.ts |
| `tests/unit/route-guard.test.ts` | TB1.065 requireWorkspaceAccess | 2 | CUT-AT-REPLACE | Replaced — old-matrix assertions retired; D15 coverage in tests/unit/roles.test.ts + tests/integration/api-v1-session.test.ts |
| `tests/unit/route-guard.test.ts` | TB1.066 requireSessionUser | 3 | CUT-AT-REPLACE | Replaced — old-matrix assertions retired; D15 coverage in tests/unit/roles.test.ts + tests/integration/api-v1-session.test.ts |
| `tests/unit/route-guard.test.ts` | TB1.067 listSessionWorkspaces | 1 | CUT-AT-REPLACE | Replaced — old-matrix assertions retired; D15 coverage in tests/unit/roles.test.ts + tests/integration/api-v1-session.test.ts |
| `tests/unit/route-guard.test.ts` | TB1.068 getAuthorizedWorkspaceSummary | 2 | GUARD | Untouched — block was never removed |
| `tests/unit/session-version.test.ts` | TB3.070 S1-F2B session-version gate | 7 | GUARD | Rewired — kept fail-closed viewer gate; JWT/sessionVersion machinery CAR-replaced |
| `tests/unit/token-store.test.ts` | TB2.094 S1-F2A token store (unit) | 10 | GUARD | Partially rewritten — the reset-shape test moved to `tests/integration/pr05-security.test.ts`; the 8 token-store tests stay |

## Totals

| Action | Tests |
|---|---:|
| Kept (verbatim / restored) | 706 |
| Rewired to Better Auth | 68 |
| Replaced by D15 matrix coverage | 78 |
| Rewritten in pr05-security.test.ts | 3 |
| Untouched | 186 |

## New coverage added by this PR (not in the audit tables)

- `tests/unit/roles.test.ts` — D15 capability matrix (12 capabilities × roles).
- `tests/integration/api-v1-session.test.ts` — `/api/v1` auth/tenancy/capability enforcement.
- `tests/integration/pr05-security.test.ts` — 15 probes for the fix-pass findings (hashed identifiers, supersede, bearer deactivation, account limiter, canonical reset URLs, mail-gating, secret enforcement, roster cursor, fail-closed session lookup).
- `tests/integration/auth-flow.test.ts` — Better Auth sign-up/sign-in pipeline.

## Notes

- The 28 whole-file CUT-AT-REPLACE deletions and 4 KEEP-ALL deletions are
  reversed: every file exists again, KEEP blocks preserved.
- `member.remove` was removed from the capability matrix (D10/Q3: no
  capability beyond the canvas); the matrix now declares 12 capabilities.
- `tests/e2e/password-reset.spec.ts` was rewired to Better Auth (hashed
  `verification` identifiers, account rows) and regained the superseded-link
  case.
