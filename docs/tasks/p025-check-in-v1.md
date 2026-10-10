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

Decisions #92–#97 are on `main` (merge `89e9e1d`, PR #30). **P-025-A** is
merged on `main` (merge `49408db`, PR #31). **P-025-B implementation** —
one-off Check-In instances, staff scheduling/cancellation, client
list/detail/submission, consent-gated answers — is complete on candidate
branch `feature/p025b-check-in-instances-submissions` pending
independent different-model review. No review/feedback/recurrence/
notification surface exists (P-025-C/P-025-D remain unauthorized and
unimplemented). `ENABLE_CHECK_INS` remains default-off; nothing is
deployed or production-enabled.

## P-025-A implementation record (2026-10-10)

Branch `feature/p025a-check-in-form-definitions` from exact verified
`origin/main` `89e9e1d1f266978bef804b01e766b5b4b94a1b3d`.

**Schema** — migration `20261010170000_p025a_checkin_forms`: enum
`CheckInFormStatus` (ACTIVE/ARCHIVED), enum `CheckInAnswerKind`
(SHORT_TEXT/LONG_TEXT/NUMBER/DATE/SINGLE_CHOICE/MULTI_CHOICE), table
`checkin_form` (mutable draft + status/provenance only), table
`checkin_form_version` (immutable published snapshots).
DB-enforced invariants: `UNIQUE(id, workspace_id)` coherence target,
`UNIQUE(form_id, version_seq)` sequence authority,
`UNIQUE(form_id, publish_origin_revision)` publish-replay authority,
`UNIQUE(id, workspace_id, form_id)` on the version, composite same-
workspace FKs for every member provenance column and the
version→form coherence claim, `ON DELETE RESTRICT` on all
relationships. No instance/submission/answer/review tables.

**Domain + service** — `lib/checkin/forms.ts`: closed error vocabulary,
server-minted `f_`/`o_` IDs, field-kind immutability per fieldId,
tombstone enforcement (a presented ID must be bound in the CURRENT
draft — retired IDs never resurrect), bounded normalization (field/option
counts, label/help/classification lengths, 64KiB definition bytes),
publish completeness. Service ops run the reviewed protocol: member
advisory `member:{ws}:{user}` → `workspace_member` FOR UPDATE →
in-transaction `authorize(checkinFormDefinitions,…)` → `checkin_form`
FOR UPDATE → mutation → structural audit LAST — all inside one
Serializable transaction with bounded retry. Publish pins the exact
normalized draft revision in `publish_origin_revision`, closes the
draft, and replay returns the existing committed version (no duplicate
row/audit). `openCheckInDraft` seeds v2 editing from the LATEST
immutable version — earlier versions are never touched. Archive is
terminal, idempotent (no duplicate audit), preserves history.

**Feature boundary** — `lib/checkin/forms-gate.ts`: the ONE shared
server-only resolver `isCheckInsEnabled(env)` — `ENABLE_CHECK_INS ===
"1"` AND trusted runtime classification (`APP_ENV` allowlist, else
`NODE_ENV`; missing/unknown/malformed → production-safe). Pages
`notFound()` and actions deny BEFORE session/FormData/DB work.
`ENABLE_CHECK_INS` documented commented-off in `.env.example`.

**Authorization** — `checkinFormDefinitions` in `RESOURCES` + matrix:
WORKSPACE_OWNER and COACH get workspace read/write; ASSISTANT_COACH,
CLIENT, SUPPORT, PLATFORM_ADMIN denied. `PLATFORM_ADMIN_DENIED_RESOURCES`
now includes `checkinFormDefinitions` AND the pre-stubbed
`checkinsCoachReviews` (dual-role-inclusive — binding requirement).
`checkinInstances` does not exist yet; its deny-set inclusion is
mandatory when introduced in P-025-B.

**Boundary/actions/UI** — `lib/checkin/forms-boundary.ts` byte-bounds
`draftJson` BEFORE `JSON.parse`, maps the closed error vocabulary to
pinned safe copy. `app/workspace/[workspaceId]/checkins/actions.ts`:
feature gate → session gate → bounded FormData → boundary; closed
`{ok, value|message}` results, success-only revalidation. Staff pages
under `checkins/forms/` (library, new, editor, preview), components
`components/checkin/` (draft editor with `beforeunload` + two-step
archive + aria-live alert, open-draft, create), gated nav entry.
Preview is read-only with zero persistence (no form/action/storage);
`src` selection is explicit, no fallback.

**Verification** — unit suite green incl. `checkin-forms.test.ts` (25),
`checkin-forms-boundary.test.ts` (4); disposable-PG integration green:
`p025a-checkin-schema` (8: enums/columns/uniques/RESTRICT/no out-of-slice
tables/composite-FK coherence), `p025a-checkin-forms` (14: lifecycle,
denied roles incl. dual-role PA, stale revision, concurrent save/publish,
deterministic seq, replay, v1-immutability-after-v2, archive
restrictions, tenant isolation, revocation race, malformed-no-mutation,
retired-ID resurrection denied), `p025a-checkin-actions` (8: action
lifecycle, role/PA/dual denial, forged-tenant denial, flag-off zero
writes, bounded-input contract). Production-build E2E
`checkin-forms.spec.ts` 10/10 across 1440/834/390 incl. flag-off 404s,
nav gating, stale-conflict, beforeunload, ≥44px targets, no overflow,
preview zero-persistence probes (revision/versions/audit unchanged on
both draft and version preview legs).
**Mutation testing** — 14 scratch mutations each proved failing then
reverted byte-identical (all BITES; the dropped-byte-bound mutation
initially survived at the action layer and was re-proven against the
new dedicated boundary unit test).
**Databases** — `p025a_integration_test` (local docker-compose Postgres
only), `p025a_shadow` (transient prisma-diff shadow for the reviewer's
drift check), and the reviewer's own `p025a_review` — **all dropped and
verified absent** after final verification (`pg_database` LIKE 'p025a%'
→ empty). No production or builder/reviewer DBs touched. E2E ran on
the dev `app_dev` database via the standard harness.

**Independent review** — `opencode-go/deepseek-v4.1-flash` on candidate
`fca8854` vs base `89e9e1d`: **PASS**, no P0/P1. Findings repaired:
P2-1 schema/index drift → `@@unique([formId,publishOriginRevision],
map:"checkin_form_version_publish_origin_key")`; P2-2 closed-branch
archive → two-step Confirm/Cancel; P3s → create wrapped in bounded
retry, `:3102` explicit flag-off, `name` well-formedness, nav `roles`
pin, audit-rollback trigger test. Post-repair gates all green.

## P-025-B implementation record (2026-10-10)

Branch `feature/p025b-check-in-instances-submissions` from exact verified
`origin/main` `49408db567b2359fade1a9499b5a02a4c58994c4` (the P-025-A
merge). Authorized scope: one-off Check-In instances, staff
scheduling/cancellation, client-owned list/detail/submission, typed
immutable answers, consent-gated submit/history, derived lifecycle —
NO review/acknowledgement (P-025-C), NO recurrence/custom/feedback/
notifications/DailyEntry embedding (P-025-D).

**Schema** — migration `20261010190000_p025b_checkin_instances`:
`checkin_instance` (immutable ws/client/form/version pin, `due_at`
Timestamptz, optional `due_tz` label, scheduling + nullable paired
cancellation provenance, no stored status, no answer columns),
`checkin_submission` (immutable, no `updated_at`,
`UNIQUE(instance_id)` idempotency anchor, composite answer target
`(id, workspaceId, clientProfileId)`), `checkin_submission_answer`
(immutable typed rows, `UNIQUE(submission_id, field_id)`, raw-SQL
kind↔column CHECK). Composite coherence FKs everywhere: instance →
`(id, workspaceId)` ClientProfile, `version_coherence` →
`(form_version_id, workspace_id, form_id)` CheckInFormVersion,
provenance → `(member_id, workspace_id)` WorkspaceMember; submission →
the full 5-column instance tuple; answers → `(submission_id,
workspace_id, client_profile_id)`. Paired-provenance CHECK:
`cancelled_at`/`cancelled_by_member_id` both-or-neither. All
history-preserving FKs `ON DELETE RESTRICT`. Unanswered OPTIONAL
fields store NO row — the CHECK makes an "empty answer" inexpressible.

**Derived lifecycle** — one shared projector
(`projectCheckInInstanceState`/`projectCheckInInstancePresentation` in
`lib/checkin/instances.ts`): CANCELLED when valid paired provenance →
SUBMITTED when a coherent submission exists → else SCHEDULED. No stored
status column; `late` derives from `dueAt` vs `submittedAt`/now and
never mutates state (#93). Designed so P-025-C can insert REVIEWED
without a stored mutable column.

**RBAC** — `checkinInstances` added with the decision-#95 matrix
(owner ws/ws, coach asg/asg, assistant asg/—, client own/—, SUPPORT and
PLATFORM_ADMIN denied); `checkinsCoachReviews` client own/own cell
drives the submission domain. All three Check-In resources are in
`PLATFORM_ADMIN_DENIED_RESOURCES` — dual-role PA denied in
`authorize`/`authorizeCollection` before membership authority.

**Locking/concurrency** — `chkin:{ws}:{clientProfileId}:{formId}`
advisory → `member:{ws}:{userId}` advisory → member FOR UPDATE →
in-transaction `authorize` → assigned-scope coherent ACTIVE
`ClientAssignment` re-resolve+lock (owner takes NO assignment path) →
profile FOR UPDATE → instance → submission → consents in kind order →
mutation → structural audit last. Serializable + bounded retry; P2002
re-enters the COMPLETE protocol once, second conflict →
`serialization_conflict`. Answer-free bounded pre-read runs before any
advisory so foreign/mutated tuples acquire ZERO locks (proven).
Lock-order cross-check: `chkin` precedes `member` (same order as
`csetup`→`member`, `onbassign`→`member`); no writer acquires `member`
before `chkin`; row-lock order never inverts — acyclic.

**Consent** — `resolveCheckInConsentPolicy` (trusted dev/test only →
static `check-in-dev-*` registry; production/unknown/missing →
unconfigured fail-closed). Submission locks required rows FOR UPDATE
before any answer-row write; submitted-answer detail requires active
consent on every read; withdrawal blocks new submission AND detail,
list headers remain (#85-compatible).

**Boundary/actions/UI** — `lib/checkin/instances-boundary.ts` maps the
closed vocabulary (`denied`, `invalid_input`, `not_available`,
`consent_missing`, `policy_not_configured`, `serialization_conflict`)
to safe copy. Staff route
`app/workspace/[workspaceId]/clients/[clientProfileId]/checkins/`
(schedule form with positional select — no internal IDs in browser
values — plus two-step destructive cancel). Client route
`app/(tracker)/workspace/[workspaceId]/check-ins/` + `/[instanceId]`
(force-dynamic, no-store headers via `next.config.ts`; list = bounded
metadata only, zero answer values on GET). Client panel mirrors the
P-023 onboarding panel (controlled fields, `aria-invalid`/
`aria-describedby`/`role=alert`/`aria-live`, dirty-only `beforeunload`
removed post-submit and on unmount, ≥44px targets, no raw internal
IDs). Nav links in daily/onboarding shells + roster — all flag-gated.

**Verification** — unit 1057 green incl. `checkin-instances.test.ts`
(25: RBAC cells, dual-role deny-set, projector, parsers, canonicalizer,
resolver, closed vocabulary); disposable-PG integration 575 green incl.
`p025b-checkin-instances` (23: role matrix incl. dual-role PA + SUPPORT,
owner-without-assignment, composite-FK/CHECK rejections, idempotent
replay, concurrent schedule/submit/cancel races, consent lock/withdraw,
audit-last trigger rollback, replay-no-second-audit, zero-advisory on
foreign tuples); P-025-B E2E `checkin-instances.spec.ts` 14/14
(flag-off 404s + zero audits, owner/coach schedule, two-step cancel,
assistant/foreign-profile denial, client list/detail/submit,
late marker, cancelled non-disclosure, consent-withdrawn detail deny,
beforeunload lifecycle, no-store GET+POST, 1440/834/390, ≥44px, no
overflow, positional select values, no P-025-C controls).
`git diff --check`, `tsc --noEmit`, `eslint`, `prettier`,
`prisma format/validate/generate`, fresh disposable-PG migrate deploy,
and `migrate diff` all clean (the only remaining diff lines are the
pre-existing SQL-only composite-FK/CHECK names every slice shares —
same accepted class as P-021/P-023/P-025-A).

**Bug found by the real-browser gate** — the first E2E submission run
exposed a CHECK violation that unit+integration fixtures missed:
unanswered OPTIONAL fields produced all-NULL answer rows that the
kind↔column CHECK correctly rejected. Fixed by storing only answered
rows (the CHECK semantics make "empty answer" inexpressible by design);
regression coverage is the `expect(answers).toHaveLength(4)` assertion
for a 5-field form submitted with one optional field empty.

**Mutation testing** — 22 scratch mutations, each reverted. BITES:
deny-set removal (×2), assistant-write grant, owner-requires-
assignment, advisory-key weakening, pre-read removal, consent-reorder,
trusted-env bypass, production-synthetic-consent, P2002 outside-
transaction shortcut, cancel-after-submit acceptance, projector
ignoring cancellation, submission→instance coherence-FK drop,
kind↔column CHECK drop, audit-before-mutation, replay-second-audit,
raw internal ID in browser value (real-browser E2E). NO-BITE (each
masked by a second layer — recorded honestly): own-profile rebinding
weakened (authorize `own` check still denies), assigned-scope lock skip
(authorize's `getActiveAssignment` still denies), replay-lookup
reordering (projector `hasSubmission` statically false in that path),
`checkin_submission.instance_id` unique drop (chkin advisory + row
locks serialize; unique remains the backstop), answer-level coherence-
FK drop (no answer-level incoherent-tuple test exists — coverage note),
beforeunload-after-submit (unmount cleanup removes the listener; the
ref guards only the pre-refresh window).

**Databases** — `p025b_integration_test` on the local docker-compose
Postgres only; E2E ran on dev `app_dev` via the standard harness; a
transient `dbg*` scratch fixture set was created and removed during
E2E debugging. No production or unrelated databases touched.

## Next gate

The P-025-B candidate branch is pushed for inspection; PR/merge remain
separately authorized. Next gate: independent different-model review of
the exact final head by `opencode-go/deepseek-v4.1-flash`. P-025-C
(coach review/acknowledgement) and P-025-D (recurrence/custom/feedback/
notifications) remain unauthorized and unimplemented.

## Independent review record — P-025-B-I1-R1 (2026-10-10)

Reviewer `opencode-go/deepseek-v4.1-flash` reviewed the complete candidate
`49408db..9b60cf3` (`P-025-B-I1-R1-independent-review.md`). **Technical
verdict: FAIL**; PR clearance HELD FOR REPAIR; a separate owner process
exception was also required.

- **P1-1 (merge-blocking):** the new per-row roster "Check-Ins" link
  added a focusable stop per row, so `tests/e2e/client-roster.spec.ts`
  "keyboard traversal reaches pagination links with visible focus"
  exhausted its hard-coded 40-tab budget before "Next page" — reproduced
  3/3 on the candidate, passed on `origin/main`. CI `verify` runs the
  full `npm run test:e2e`, so the candidate would have been red.
- **P3-1..P3-3:** no-bite mutations without direct probes — assignment-
  lock skip (no race probe), `unique(instance_id)` drop (no backstop
  probe), answer→submission coherence FK drop (no answer-level
  incoherent-tuple test).
- **P3-4:** rebinding/replay-order/beforeunload no-bites masked by
  second layers.
- **P3-5:** builder ran only the focused P-025-B E2E, never the full
  repository E2E gate — the gap that let P1-1 ship.
- **P3-6:** pre-existing project-wide raw-SQL composite-FK naming drift
  (not introduced by this slice).
- The review also confirmed: scope fidelity vs decisions #92–#97, schema
  soundness, derived-lifecycle correctness, RBAC/dual-role denial,
  consent boundary, lock/idempotency correctness, no P-025-C/D surface —
  and independently re-ran every gate (unit 1057, integration 575,
  focused E2E 14/14, full E2E with the single deterministic failure).

## Owner process exception (2026-10-10) — owner-granted, bounded

The **owner** accepted the already-recorded initial P-025-B test-order
deviation (the E2E spec was authored after the UI; the integration
suite's initial all-fail run was a fixture bug, not contract RED).
Recorded exactly:

- applies **only** to that already-recorded deviation;
- is **not precedent**;
- does **not** retroactively make the original sequence RED-first;
- does **not** waive the P1-1 repair, the new invariant tests,
  full-suite verification, mutation testing, independent re-review, CI,
  separate PR/merge authorization, production restrictions, or future
  test-first requirements;
- the acceptance is attributed to the owner, **not** the reviewer.

## P-025-B-I1-R2 repair record (2026-10-10)

On `feature/p025b-check-in-instances-submissions`, forward-only from
`9b60cf3`.

**P1-1 reproduction (before any edit):**
`npx playwright test tests/e2e/client-roster.spec.ts -g "keyboard traversal"`
→ `expect(focused).toBe(true)` / `Received: false` at spec line 361,
exit 1 — reproduced **3/3** on the unmodified head.

**Root cause:** wsB's page-1 roster renders 25 rows; the new per-row
"Check-Ins" `<Link>` added 25 focusable stops, exhausting the test's
fixed 40-tab budget before the "Next page" link. The production markup
is correct — real `<Link>`, accessible name "Check-Ins", correct
`/clients/{id}/checkins` destination — so the repair is a **test-contract
update**, not a production change and not link removal.

**Repair:** the test now derives its bound from the rendered focusable
count (+4 slack) and records each visited stop's accessible text + href,
asserting: every rendered "Check-Ins" row action is keyboard-reached
(exactly `PAGE_SIZE` stops), every rendered "Daily entries" action is
reached (flag-conditional count), all destinations match
`/clients/{id}/checkins`, all row actions precede the pagination link,
and focus-visible still shows an outline. GREEN 3/3 post-repair.

**New invariant coverage (characterization + mutation evidence):**

- `answer→submission composite FK rejects an incoherent answer tuple` —
  direct insert with foreign workspaceId/clientProfileId rejected;
  scratch-dropping the FK makes the test fail.
- `unique(instance_id) is an independent DB backstop` — two competing
  direct inserts bypassing the service → exactly one commits, loser is
  P2002; scratch-dropping the index makes the test fail.
- `assignment revoked while a coach schedule holds the lock` — a
  barrier-held `FOR UPDATE` + REMOVED update races the real service
  protocol → `not_assigned` denial, zero instance, zero audit, REMOVED
  assignment. Skipping `lockAssignmentForScope` makes the test fail —
  this is the direct race probe the R1 no-bite #5 lacked.
- `replay is honored even though the derived lifecycle is already
SUBMITTED` — pins the pre-replay SUBMITTED projection; a genuine
  control-flow swap (state rejection with real presence before the
  lookup) fails three tests.
- E2E `beforeunload is suppressed immediately on success — inside the
pre-unmount window` — synthetic cancelable beforeunload dispatch:
  untouched→no handler, dirty→prevented, post-response→suppressed while
  the refresh is held, submitted-state→no dialog. A leaked-listener
  mutation fails it. (Honest note: `submittedRef`/`setDirty` alone are
  not observable — the action's `revalidatePath` returns the new RSC
  payload in the action response, making unmount atomic; the biting
  mutation is the listener leak itself.)
- **Rebinding probe disposition (D):** no clean behavioral probe exists —
  `client_profile @@unique(workspaceId, userId)` gives a client exactly
  one own profile, so a weakened rebind can only return a foreign
  profile which the `authorize` own-check then denies (`not_owner`).
  The rebinding's value is error-shape/ordering, not a separable
  security outcome; retained as defense-in-depth, documented rather
  than fabricated.

**Repair-delta mutations (8, all reverted, byte-identical after):**
link-out-of-tab-order → roster traversal FAIL; wrong accessible name →
roster traversal FAIL; wrong destination → roster traversal FAIL;
answer-FK drop → incoherent-answer test FAIL; `unique(instance_id)` drop
→ backstop test FAIL; assigned-lock skip → race test FAIL; replay-after-
state swap → 3 tests FAIL; beforeunload listener leak → window test FAIL.

**Verification:** `git diff --check`, `tsc`, `eslint`, `prettier`,
`prisma validate/generate` all clean; unit **1057/1057**; disposable-PG
integration **579/579** (37 files; P-025-B file 27/27); `npm run build`
clean; **full E2E `npm run test:e2e`: 303 passed / 12 skipped / 0
failed** — the deterministic roster regression is gone and the new
window test passes.

## Next gate (post-repair)

Fresh independent different-model review of the complete candidate
`49408db..HEAD` including the repair delta and this owner-exception
record, by `opencode-go/deepseek-v4.1-flash`. PR/merge remain separately
authorized. P-025-C/D still unauthorized and unimplemented.

## P-025-C implementation record (2026-10-10)

**Scope** — staff submission-header list, explicit answer-detail reveal
(one structural READ audit per committed view), terminal review
acknowledgement (assigned coach only; exactly one immutable
`checkin_review` row per submission — who + when only; no notes, no
feedback, no workflow gate). Decisions #86–#91 carried by #96.

**Schema** — `checkin_review` (migration
`20261011010000_p025c_checkin_review`): `unique(submission_id)` terminal
anchor (#86 analog); composite coherence FKs →
`checkin_submission(id,workspace_id,client_profile_id)`,
`client_profile(id,workspace_id)`, `workspace_member(id,workspace_id)`;
RESTRICT everywhere; no `updated_at` (immutable). `checkin_review` added
to `AUDIT_RESOURCE_TYPES`; projector inserts `REVIEWED` between
CANCELLED and SUBMITTED.

**Authorization** — `checkinsCoachReviews` already carries the split:
staff detail read `ws`(owner)/`assigned`(coach,assistant); mark
`assigned`(coach) only. Mark enforces `grantedScope === "assigned"` AND
the unconditional ACTIVE-assignment re-resolve + FOR UPDATE — denied
cells yield `grantedScope:"denied"` without throwing, so both barriers
are load-bearing (proved by mutation). `checkInReview.reviewedByMemberId`
is member provenance; `canMark` = assigned scope + `COACH` role.

**Privacy/audit** — detail re-locks consent FOR UPDATE before any
answer-row query (spy-proven zero answer reads after withdrawal); one
`READ checkin_submission` audit per committed explicit detail; passive
list/GET writes zero audits; audit-last rollback. Withdrawal blocks
detail + mark; header list stays bounded (#85). Reviewer name/timestamp
bounded to authorized staff only (#91) — client surfaces never join
review rows and show the unchanged "Submitted" state.

**UI** — server-rendered header rows (no answers); "View details" POST
→ detail region (aria-live, labelled answers from the pinned version,
bounded reviewer provenance); "Mark reviewed" appears only for the
assigned-coach cell after a successful detail view — the mark action
re-authorizes independently (UI hint never trusted). Two-step is not
needed (acknowledgement is non-destructive). no-store + force-dynamic
inherited; pending-disabled controls; ≥44px; no overflow at
1440/834/390.

**Repair during E2E** — `checkin-instances` spec's "no review controls"
assertion updated to the client surface only (staff-side controls are
the authorized P-025-C feature); `global-teardown.ts` reserved-user list
gained assistant + support (pre-existing gap — first slice where the
assistant is an audit actor); `p025a-checkin-schema`/`s1-a-identity`
table allow-lists gained `checkin_review`.

**Mutations (8, all reverted byte-identically):** deny-set removal →
dual-role PA mark/read FAIL ×2; projector REVIEWED→SUBMITTED → unit
FAIL ×2; assigned-gate+assignment-lock removal → owner-marks FAIL;
consent-after-answers → zero-read spy FAIL; READ-audit omission →
audit-count FAIL; idempotent-lookup omission → replay+concurrent FAIL
×2; mark-consent omission → withdrawal FAIL; canMark role-check removal
→ assistant-enable FAIL.

**Verification** — tsc/eslint/prettier/prisma validate+generate clean;
fresh disposable-PG migrate deploy; unit 1063; integration 594 (P-025-C
file 15/15); build clean; **full E2E 310 passed / 12 skipped / 0
failed** incl. review flow, provenance bounds, consent, flag-off,
keyboard + responsive.

## Next gate

Independent different-model review of the complete P-025-C candidate on
`feature/p025c-check-in-staff-review`. PR/merge remain separately
authorized. P-025-D still unauthorized and unimplemented.
