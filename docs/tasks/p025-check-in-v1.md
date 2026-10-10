# P-025 — Check-In v1: planning chronology, review record, decision record

This record captures the complete P-025 planning and review chronology,
the owner's six approved decisions (#92–#97), the binding security
requirements, the inherited policy precedents, and the binding
engineering contract. **No implementation is authorized by this record**;
a separate implementation prompt is required per slice.

## Verified starting state (2026-10-10)

- `origin/main` = `03449737b7e21c4cfb8c68794d2b8ada6e265c3e` — the PR #29
  merge commit (parents `2fda761` + reviewed `8102594`). PR #29 MERGED;
  main CI run `38041205770`, job `114181645334`, SUCCESS on `0344973`.
- Remote contains only `main`; the merged P-024 docs branch was deleted
  after green main CI. Protection: strict `verify`, `enforce_admins`,
  force-push/deletion blocked.
- Nothing deployed; `ENABLE_ONBOARDING_SUBMISSION` default-off; no
  `ENABLE_CHECK_INS` exists; production consent unconfigured/fail-closed;
  no real-client data.
- Highest prior product-decision: #91; P-025 decisions are #92–#97.

## Current capability and gap

Merged on main: form builder (P-008), staff assignments (P-013),
DailyEntry (P-020B/P-021), read-only staff DailyEntry review (P-022),
and the merged P-023 client onboarding submission flow. The
`checkinsCoachReviews` RBAC cell exists in `lib/auth/rbac.ts` and maps to
`BASE_CONSENTS` in `lib/consent.ts`, and a `check-ins & coach reviews`
row is recorded in `docs/security/authorization-model.md` — **but no
service consumes it, it is absent from `PLATFORM_ADMIN_DENIED_RESOURCES`,
and no Check-In model, route, audit type, or feature flag exists.** The
row is a pre-stubbed, unexercised target, not owner approval. The brief's
C01–C07 Check-In workflow (submit → awaiting response → coach opens →
review → feedback) has no implementation surface at all.

## Planning and review chronology

1. **P-025** (Devin SWE-2 High) — initial plan artifact
   (`/Users/apple/Downloads/P-025-check-in-v1-plan.md`,
   SHA-256 `ccda30bb59cccf28b2d3c799c09fd13d871719083c883cecc9cf4eb2c475e7cf`,
   407 lines, 18 sections).
2. **P-025-R1** (`opencode-go/deepseek-v4.1-flash`) — **CONDITIONAL
   PASS** (`/Users/apple/Downloads/P-025-R1-independent-review.md`,
   SHA-256 `8d679473e63f096b76e937fa2ee25dd4b5e94f464c3882016023a76774e5b354`,
   147 lines, 29 sections): no P0/P1; four P2 findings:
   - **P2-1** — dual-role PLATFORM_ADMIN deny-set hardening was
     misclassified as owner question Q5; it is a binding fail-closed
     security requirement.
   - **P2-2** — the unused `checkinsCoachReviews` row was overstated as
     "pre-approved infrastructure"; it is an unexercised pre-stub, not
     owner authorization.
   - **P2-3** — `CheckInInstance.status` beside submission/review rows
     lacked a stated single source of truth (status/pointer
     disagreement risk).
   - **P2-4** — cancellation-after-submission was decided silently
     without an owner question.
3. **P-025-R2** (Devin SWE-2 High) — complete self-contained corrected
   replacement (`/Users/apple/Downloads/P-025-R2-check-in-v1-plan.md`,
   SHA-256 `6df18364b763b8e5fbfe747cee0d1874ff57cd2acfb7d9c810a084ff2c5929cb`,
   889 lines, 22 top-level sections): dual-role denial reclassified as a
   binding security requirement for all three Check-In resources in
   `PLATFORM_ADMIN_DENIED_RESOURCES` (RED test + deny-set-removal
   mutation required); pre-stub classification corrected; stored
   instance status removed in favor of derived state with shared
   projector and serialized transitions; cancellation-after-submission
   added as genuine owner question; answer composite-FK target pinned
   to `CheckInSubmission @@unique([id, workspaceId, clientProfileId])`;
   field classification named a production blocker; new
   `CheckInAnswerKind` enum chosen; three-resource capability split
   (`checkinFormDefinitions`, `checkinInstances`,
   `checkinsCoachReviews`); corrected six-question owner package.
4. **P-025-R2-R1** (`opencode-go/deepseek-v4.1-flash`) — **PASS**
   (`/Users/apple/Downloads/P-025-R2-R1-independent-review.md`,
   SHA-256 `18462d88c3af8f224feffebcf52706fa11f0f732697758bb6a090b1c50fc7853`,
   135 lines, 29 sections): no P0/P1/P2; all four R1 P2s verified closed
   against exact `origin/main`; owner package judged ready; recommended
   first slice P-025-A. Four non-blocking P3 notes recorded (forbid
   submission-row deletion in the service + regression test; state
   draft-save audit policy; check-in role cells inherited from
   pre-stub/#37 recorded as policy direction; `chkin` added to the
   global advisory-key table at implementation).
5. **Owner approval (2026-10-10)** — all six decisions approved as
   recommended; documentation-only record authorized.

## Approved decisions (#92–#97 in `docs/product-decisions.md`)

- **#92** One-off Check-Ins only in v1 — individually scheduled
  instances; recurring schedules, recurrence rules, calendar
  materialization, skipped occurrences, rescheduling series, and
  reminder automation deferred; future recurrence requires separate
  approval.
- **#93** Single due timestamp; no opening/closing window; late
  submission allowed while otherwise eligible and visibly marked late;
  `dueTz` is a label, not a timezone policy; timezone/DST/grace/closure
  rules deferred.
- **#94** Client-created custom Check-Ins deferred — clients cannot
  create instances or questionnaires; D-05 unresolved; v1 Check-Ins
  originate from staff-managed definitions and scheduling.
- **#95** Workspace owners and coaches may create/edit/publish/archive/
  schedule Check-In forms; owner paths need no `ClientAssignment`;
  coach client-specific operations need a coherent ACTIVE
  `ClientAssignment`; assistants cannot write forms or scheduling and
  cannot mark; clients cannot manage; owners cannot mark reviewed;
  assigned coaches acknowledge reviews; SUPPORT/PLATFORM_ADMIN denied.
- **#96** v1 staff review is a terminal acknowledgement only — written,
  video, audio, attachment feedback, change summaries, coaching
  messages, and automated recommendations deferred; no messaging or
  notification behavior; reviewer identity follows #91.
- **#97** Only unsubmitted SCHEDULED instances may be cancelled; no
  `SUBMITTED→CANCELLED` or `REVIEWED→CANCELLED`; submitted answers and
  review history immutable and historically visible; corrections need a
  separate future policy; cancellation carries ending provenance and is
  terminal.

## Binding security requirements (recorded, not owner choices)

- `checkinFormDefinitions`, `checkinInstances`, and
  `checkinsCoachReviews` must join `PLATFORM_ADMIN_DENIED_RESOURCES` at
  implementation: PLATFORM_ADMIN denied including a dual-role
  administrator with an ACTIVE workspace membership of any role;
  SUPPORT and platform-only callers denied. **Not yet implemented.**
- The existing `checkinsCoachReviews` RBAC/consent entries are
  pre-stubbed, unexercised targets — evidence of intended architecture,
  not prior owner approval.

## Inherited policy precedents

- **#82** — no client resubmission precedent; Check-In resubmission
  remains excluded.
- **#85** — consent-withdrawal precedent: writes and detail reads fail
  closed; bounded operational list metadata may remain visible.
- **#86** — workspace-terminal review precedent.
- **#91** — reviewer identity/timestamp bounded to currently authorized
  staff.
- These are design precedents for P-025, not claims that Check-In
  exists.

## Binding engineering contract (accepted R2 plan — summarized; not yet implemented)

- Check-In is a distinct domain from onboarding; reuse limited to
  validation, renderer, authorization, consent, audit, and transaction
  patterns — no premature generic "everything is a form" abstraction.
- Models: `CheckInForm`, `CheckInFormVersion`, `CheckInInstance`,
  `CheckInSubmission`, `CheckInSubmissionAnswer`, `CheckInReview`.
  Published versions are immutable self-contained snapshots; new domain
  `CheckInAnswerKind`; stable field IDs, labels, kinds, option IDs/
  text, required state, validation, display order, classification
  metadata, retired-option tombstones.
- No mutable stored instance status — one shared derived-state
  projector: CANCELLED (paired cancellation provenance) → REVIEWED
  (coherent review) → SUBMITTED (coherent submission) → SCHEDULED.
  Submission, review, and cancellation serialize under advisory
  `chkin:{workspaceId}:{clientProfileId}:{formId}` plus the instance
  row lock; tuples derive only from bounded server-side tenant/client-
  scoped pre-reads; foreign/incoherent input fails before advisories.
- Owner paths have no `ClientAssignment` dependency; assigned paths
  re-resolve and lock a coherent ACTIVE `ClientAssignment`; client
  operations rebind to own profile; consent before answer queries;
  feature-mode and authorization rechecked in-transaction; `P2002`
  re-enters the full protocol once; audit last with rollback.
- One structural `READ checkin_submission` audit per committed explicit
  staff detail; passive GET/list/pagination/prefetch/refresh creates
  zero audits; lists carry bounded metadata and no answer values;
  errors never reflect submitted answers; reviewer metadata per #91.
- `ON DELETE RESTRICT` throughout; required Prisma composite targets
  and backfields declared; answer FK
  `(submissionId, workspaceId, clientProfileId)` →
  `CheckInSubmission(id, workspaceId, clientProfileId)`; no answer
  values copied into instance or review rows.
- Synthetic `BASE_CONSENTS` dev/test only; production classification
  unresolved and fail-closed; shared server-only `ENABLE_CHECK_INS`
  resolver — default-off, trusted development/test only,
  production/unknown fail-closed, shared by pages/actions, absent from
  client bundles.

## Implementation slices (each separately authorized)

- **P-025-A** — Check-In form definitions and immutable published
  versions: enabling infrastructure, not independently client-visible.
  **Recommended first slice** — still requires an implementation
  prompt.
- **P-025-B** — one-off instance scheduling and client submission:
  first client-visible Check-In value.
- **P-025-C** — authorized staff detail and review acknowledgement.
- **P-025-D** — deferred: recurrence, custom Check-Ins, richer
  feedback.

Each slice requires separate authorization, RED-first evidence, real
disposable-PostgreSQL integration, production-build browser testing,
mutation checks, different-model review, separate PR and merge
approval, and default-off behavior.

## Future test/mutation contract (required at implementation)

Dual-role PLATFORM_ADMIN denial + deny-set-removal mutation;
pre-stubbed RBAC cells not treated as approval; exact advisory-key
shape; zero advisory acquisition for foreign input; owner path with no
`ClientAssignment`; assigned path locking coherent ACTIVE
`ClientAssignment`; client-own rebinding; immutable form versions;
derived-state consistency; cancellation/submission/review races; no
cancellation after submission; duplicate submission and review; `P2002`
full-protocol recovery; answer composite-FK coherence; answer-kind/
typed-column CHECK; consent-before-answer query; consent withdrawal;
audit atomicity and rollback; zero audit on passive reads; trusted-
environment feature boundary; bounded-list privacy; browser behavior at
1440px/834px/390px; keyboard, focus, screen-reader, touch, overflow,
loading, empty, error, revoked, closed, submitted, and late states;
scratch mutations proving critical assertions fail.

## Exclusions

No recurrence/calendar materialization; no notifications; no messaging;
no dashboards/analytics; no AI advice or summaries; no nutrition/meal
plans; no training; no habits; no C3/C4; no cycle tracking; no
CALORIES; no billing; no deployment; no production enablement; no
real-client data; no text/video/audio/attachment feedback; no
client-created custom Check-Ins; no resubmission; no cancellation
after submission; no P-024 implementation; no retention/erasure/export;
no D-10 resolution.

## Production blockers

Real consent classification for Check-In fields (currently
unconfigured/fail-closed — synthetic `BASE_CONSENTS` is dev/test only);
retention/erasure policy (D-10); notification delivery; timezone/calendar
policy; staff-visibility disclosure (the #81 analogue); feedback legal/
privacy review if rich feedback is ever added; deployment configuration.

## Status

Owner-approved decisions recorded on `docs/p025-check-in-decisions`.
**Implementation remains unauthorized** — it requires a separate
implementation prompt per slice after this record is independently
reviewed and merged. No PR, merge, deployment, database mutation, or
production enablement occurred for this task.

## Next gate

Independent different-model review of this documentation head before
any PR is created; merge remains separately authorized. Recommended
first implementation slice after merge and separate prompt: **P-025-A
— Check-In form definitions**.
