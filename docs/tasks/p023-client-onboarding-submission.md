# P-023 — Client onboarding submission (decision record + implementation contract)

Status: decision-record branch — `docs/p023-client-onboarding-decisions`.
Owner-approved decisions #82–#85 recorded in `docs/product-decisions.md`;
plan independently reviewed **PASS** (P-023-R3-R1); **implementation has not
begun** and requires a separate authorized prompt after this record merges.

## Verified repository state

- `origin/main` = `721359de74e2a478929e05498e38c73d3c32b225` (PR #25 merge;
  parents `ea81502` + `3c9c796`).
- Main CI run `37928268841` / job `113812393437`: SUCCESS on `721359d`.
- Remote branches: `main` only before this branch. Protection: strict
  `verify`, admin enforcement, force-push/deletion blocked.
- `ENABLE_DAILY_ENTRY` dev-gated, default-off; nothing deployed or
  production-enabled.
- Highest pre-existing decision number: #81.

## Review chronology

| Stage                   | Author                            | Artifact                                                     | Verdict                                      |
| ----------------------- | --------------------------------- | ------------------------------------------------------------ | -------------------------------------------- |
| P-023 plan              | Devin SWE-2 High (Cognition)      | `P-023-client-onboarding-slice-plan.md` `293751c6…`          | —                                            |
| P-023-R1 review         | `opencode-go/deepseek-v4.1-flash` | `P-023-R1-independent-review.md` `0f8d634e…`                 | **CONDITIONAL PASS** — 2×P1, 4×P2, 4×P3      |
| P-023-R2 corrected plan | Devin SWE-2 High                  | `P-023-R2-client-onboarding-plan.md` `bc3137b2…`             | —                                            |
| P-023-R2-R1 review      | `opencode-go/deepseek-v4.1-flash` | `P-023-R2-R1-independent-review.md` `459729a1…`              | **CONDITIONAL PASS** — 6 bounded corrections |
| P-023-R3 final plan     | Devin SWE-2 High                  | `P-023-R3-client-onboarding-plan.md` `4b6383ac…` (210 lines) | —                                            |
| P-023-R3-R1 review      | `opencode-go/deepseek-v4.1-flash` | `P-023-R3-R1-independent-review.md` `54632ff3…` (83 lines)   | **PASS — no P0/P1/P2**                       |

## R1 P1 findings and their resolution (in R3 §10/§13)

- **P1-1 authorization TOCTOU** — resolved: outside the transaction there is
  only gate/session/bounded-parse (no authorization decision, nothing
  persisted or returned); inside the Serializable transaction the caller's
  own `ClientProfile` is resolved from `(workspaceId, actorUserId)`, the
  assignment pre-read is scoped to that own profile, then `onbassign` +
  `member` advisories, `workspace_member FOR UPDATE`, and only then
  `authorize(..., createPrismaAuthorizationRepo(tx))` requiring `own`.
- **P1-2 unreachable idempotency** — resolved: the owned existing-submission
  lookup by `assignmentId` precedes ACTIVE-state enforcement, so replay
  after COMPLETED returns the durable result with zero second write/audit;
  claim is at-most-one durable submission.

## R2-R1 corrections and final disposition (R3 §6)

1. **Wire format (P2-A):** `answersJson` is an ordered **array** of
   `{fieldId, value}` records — duplicate `fieldId`s rejected before
   canonicalization (impossible under an object-keyed format).
2. **Revision-free answer table (P2-B):** `OnboardingSubmissionAnswer` =
   `id, submissionId, workspaceId, fieldId, kind, valueText?, valueNumeric?,
valueDate?, valueOptionIds?`; unique `(submissionId, fieldId)`; composite
   FK `(submissionId, workspaceId) → OnboardingSubmission(id, workspaceId)`;
   no revision identifier/sequence/pointer anywhere.
3. **Composite-FK targets (P2-E):** verified on exact `origin/main` —
   `OnboardingForm @@unique([id, workspaceId])` **already exists** (`:568`;
   the R2-R1 review's missing-target claim was itself corrected in R3-R1
   §6 P3-2); `ClientProfile`, `OnboardingFormVersion(id,formId)`, and
   `WorkspaceMember(id,workspaceId)` targets exist. One new unique is
   required: `OnboardingFormAssignment
@@unique([id, workspaceId, clientProfileId, formId, formVersionId])`,
   serving both the `(id,workspaceId)` prefix target and the wide
   assignment↔version coherence FK.
4. **Exact bounds (P2-C):** reuse `FORM_LIMITS` (maxFields 100, labelMax
   200, helpTextMax 500, minOptions 1, maxOptions 50, optionLabelMax 200,
   nameMax 120, definitionMaxBytes 64 KiB) and `ASSIGNMENT_LIMITS.idMax =
128`; R3 §12 adds labeled engineering safety bounds (text char/byte,
   decimal grammar, date 1900–2100, choice counts, ≤64 KiB payload, zero
   answer reflection in errors).
5. **Foreign-lock scoping (P2-D):** the pre-read filters by
   assignmentId + workspaceId + caller's own resolved clientProfileId;
   foreign/missing IDs fail non-disclosingly before any `onbassign`
   advisory is acquired.
6. **DB-vs-service + `beforeunload` (P3):** §10 splits DB-enforced
   (composite-FK tenant/pin coherence) from service-enforced
   (ACTIVE/ownership/idempotency); §20 makes `beforeunload` dirty-only,
   removed after success and on unmount, test-covered.

## Owner-approved decisions (#82–#85)

- **#82** v1: submit once; submit transitions the assignment ACTIVE →
  COMPLETED (terminal); no reopen/reactivate/edit/resubmit/reuse; no
  same-chain revision model; future re-intake needs its own decision; the
  broader #33/#36 tension is deliberately not resolved beyond v1.
- **#83** `BASE_CONSENTS` may map to onboarding submissions only for
  synthetic dev/test data; it is not a production classification; the
  production registry stays unconfigured/fail-closed until field- or
  form-level consent classification is approved; #38 and #39/D-10 remain
  unresolved.
- **#84** implementation is authorized only under: synthetic-only,
  dev/test-only, dedicated default-off gate, production fail-closed, no
  deployment, no production flag enablement, no real-client collection or
  data, no staff answer review, no resubmission, no drafts/autosave, no
  C3/C4, no cycle/MENSES, no CALORIES, no unrelated expansion — and only
  after this record is independently reviewed, merged via the protected
  branch, and a separate implementation prompt is issued.
- **#85** post-withdrawal: writes fail closed; detailed answer reads fail
  closed (including the client's own view); staff detail access stays
  unavailable; bounded operational list metadata (existence, assignment/
  form identity, status, submission date) may remain where already
  authorized; no answer content or superseded values in list metadata;
  restoration/renewed-consent deferred to a separate decision.

## Binding engineering contract (summary; full text in `docs/product-decisions.md`)

Ordered `{fieldId, value}` array wire format; pre-canonicalization duplicate
rejection; one immutable submission + revision-free answers per assignment;
the new wide `OnboardingFormAssignment` unique + enumerated composite FKs;
own-profile-scoped pre-read before advisories; membership locked before
tx-scoped `authorize`; existing-submission lookup before ACTIVE check;
`already_submitted` replay returning the original with zero mutation/audit;
R3 lock order, Serializable retry, audit-last rollback; R3 bounds;
dirty-only `beforeunload`; DB-vs-service CHECK split stated at
implementation time; dedicated `(tracker)` layout, `no-store`, 1440/834/390
responsive + a11y; synthetic fixtures only; production fail-closed; mutation
evidence required for important assertions.

## Exclusions and deferred work

Staff answer-review surface (later slice); resubmission; drafts/autosave;
profile auto-population (field-catalog decision pending); notifications/
email; production privacy wording; retention/erasure/export (#39/D-10);
consent classification (#38); C3/C4; real-client data; deployment;
CALORIES/cycle/medical inference; broad UI redesign.

## Post-merge CI incident (P-023-D-M2 test-only repair)

- PR #26 (this decision record) merged correctly at
  `7e3d007bd2284156b133967bae2a271ceb3b24a7`; merged tree byte-identical
  to the reviewed head `e536dd9`.
- Post-merge main CI run `37944252862` / job `113866287625` **failed**:
  `tests/integration/p021-daily-entry.test.ts` — "counts distinct entries
  once across superseded revisions" — the pre-existing assertion
  `expect(JSON.stringify(out)).not.toContain("75")` produced a false
  positive when the randomly generated parameter ID
  (`pd_w_p021_22_1791556186175`) happened to contain `75`. No raw answer
  value was leaked; the same code passed PR CI on an identical tree.
- No CI rerun, repair-in-place, revert, or branch deletion occurred
  before this repair task.
- Repair (branch `fix/p023-main-ci-p021-impact-assertion`, test-only):
  fixture now deterministically uses a `pd_75_*` parameter ID; the
  substring assertion is replaced by an exact `toStrictEqual` structural
  match (permitted top-level and per-parameter fields pinned; any
  unauthorized field — value, label, unit, option, free text — fails).
  Production code remains byte-identical to `origin/main`; the repaired
  assertion was mutation-verified (adding `value: "75"` to the provider
  output fails the test). The failed CI run remains in repository
  history; the repair is not merged or deployed and awaits
  different-model review before PR creation.

## Implementation (P-023-I1)

Authorized implementation slice — branch
`feature/p023-client-onboarding-submission`, base `origin/main`
`bb9e42d48b7ee763a76f26aa937b1796e247e7df` (post-PR-#27 merge, green main
CI run `37968491394`). Synthetic-only, dev/test-only, default-off gate
`ENABLE_ONBOARDING_SUBMISSION`, production fail-closed, no deployment.

### First-inspection summary (recorded before implementation)

- **Schema conventions:** `OnboardingFormAssignment` has `status`,
  `endedByMemberId`, `endedAt` already; `COMPLETED` is a schema-reserved
  enum value that no P-013 service writes. Composite-tenant uniques exist
  on `ClientProfile(id,workspaceId)`, `OnboardingForm(id,workspaceId)`,
  `OnboardingFormVersion(id,formId)`, `WorkspaceMember(id,workspaceId)`;
  the one required new target is
  `OnboardingFormAssignment @@unique([id, workspaceId, clientProfileId,
formId, formVersionId])`. Composite FKs are expressed in raw SQL
  migrations (P-021 precedent); partial indexes are migration-only.
- **Service conventions (P-021/P-022):** `db.$transaction(Serializable)`
  with bounded `P2034`/`P2010`-`40001`/`40P01` retry (≤8 attempts, capped
  backoff); `pg_advisory_xact_lock(hashtextextended(key,0))`; row locks
  via `SELECT … FOR UPDATE`; in-transaction `authorize` through
  `createPrismaAuthorizationRepo(tx)`; consent rows locked in
  deterministic kind order with exact-version match; `writeAuditEvent`
  last so audit failure rolls back.
- **Lock-order cross-check:** P-013 assignment writers take advisory
  `onbassign:{ws}:{client}:{form}` then the assignment row lock; P-021/22
  take `csetup` then `member` advisories then member→profile→consent
  rows; P-023 takes `onbassign` → `member` advisories then
  member→assignment→profile→consent→submission rows. No writer takes
  `member` before `onbassign`, and row-lock order never inverts — the
  graph is acyclic (no P-013 path acquires `member`, no P-021 path
  acquires `onbassign`).
- **Boundary conventions:** gate exact-match before session/FormData/DB;
  generic non-disclosing messages; `ActionResult<T>` shape.
- **Route conventions:** `(tracker)` dual-role chrome (staff →
  `WorkspaceNav`; ACTIVE CLIENT → reduced nav); `force-dynamic`; flag-off
  `notFound()`; `no-store` via route-scoped `next.config.ts` headers;
  `useActionState`-style client panels; staff `onboarding/` tree lives
  under `app/workspace/` — the new `(tracker)` leaf paths
  (`/workspace/[ws]/onboarding`, `/…/onboarding/[assignmentId]`) do not
  collide with staff leaves (`/…/onboarding/forms`, `/…/assignments`);
  a leaf-uniqueness test binds this.
- **Wire/validation conventions:** `FORM_LIMITS` (maxFields 100,
  definitionMaxBytes 64 KiB, maxOptions 50) and `ASSIGNMENT_LIMITS.idMax`
  (128) reused verbatim; array-of-records `answersJson` wire format;
  pre-canonicalization duplicate rejection; NFC text; strict decimal
  grammar; definition-order storage; optional-empty omitted.
- **Consent:** `PROTECTED_OPERATIONS.onboardingSubmissions =
BASE_CONSENTS` for synthetic dev/test only (decision #83); production
  registry stays unconfigured → fail-closed even if the flag is set.
- **Audit:** new `onboarding_submission` resource type; exactly one
  `CREATE {changed:true}` per first committed submission.
- **E2E:** Playwright multi-server layout (primary :3000 flags on;
  :3101 all-off proof server; :3102 dedicated proof server); fixtures
  seeded per-spec with deterministic reserved IDs and child-before-parent
  cleanup.

### Schema, migration, and DB-vs-service split

- Migration `20261010000000_p023_onboarding_submissions` — additive:
  `OnboardingAnswerKind` enum, `onboarding_submission` (unique
  `assignment_id`; unique `(id, workspace_id)` answer-FK target;
  `(workspace_id, client_profile_id)` discovery index; `(workspace_id,id)`
  cursor index), `onboarding_submission_answer` (unique
  `(submission_id, field_id)`), and the one new wide assignment unique
  `(id, workspace_id, client_profile_id, form_id, form_version_id)`.
- **DB-enforced:** all composite FKs — submission↔client/workspace,
  form/workspace, version/form, the wide assignment coherence tuple,
  member/workspace; answer↔submission/workspace; `ON DELETE RESTRICT`
  everywhere; the kind↔typed-column CHECK including `jsonb` array shape,
  single-choice = 1, multi-choice ≤ 50; `unique(assignment_id)` as the
  final double-submit backstop (P2002 → abort → fresh read →
  `already_submitted`).
- **Service-enforced (inside the Serializable tx):** ownership, ACTIVE
  state, idempotency ordering, option validity vs the pinned immutable
  definition, multi-choice dedup+sort, per-kind bounds, definition-order
  storage, completion provenance, single audit event. Immutability of
  answers is service contract — no write path ever updates these rows.
- Verified on a fresh disposable PG: `prisma migrate deploy` applied all
  31 migrations; incoherent-tuple inserts (foreign workspace, version ∉
  form) and CHECK violations rejected at the database.

### RED-first evidence

- `tests/integration/p023-onboarding-submission.test.ts` was written and
  run before the full service existed: initial run failed (module/
  behavior missing) — real RED. Subsequent failures during bring-up:
  boundary returned "feature is not available" until
  `ENABLE_ONBOARDING_SUBMISSION` was set in the suite; multi-choice
  display order corrected to definition order (was stored order).
- Two pre-existing guard tests legitimately updated: `s1-a-identity`
  table allowlist now includes the two reviewed tables; the P-008
  "no submission tables" guard now allows exactly the reviewed pair
  (any other submission table still fails).
- `tests/e2e/client-onboarding.spec.ts`: first runs exposed (a) a real
  commit-vs-read race in the spec (fixed by polling DB state), (b) the
  `(ws,client,form)` full-unique fixture constraint (extra assignments
  now each get their own form), (c) Playwright's hanging `page.reload()`
  after a dismissed beforeunload dialog (evaluate-driven reload), and
  (d) a leaked fixture profile blocking global teardown (namespaced
  cleanup).

### Mutation evidence (all reverted)

1. Duplicate-fieldId rejection disabled → unit test "rejects duplicate
   fieldIds" FAILED; reverted.
2. Locked assignment ACTIVE-state check removed → integration
   "cancelled/superseded terminal assignments refuse" FAILED; reverted.
3. Post-lock authorization bypassed (member role/status + in-tx
   `authorize` removed) → integration "denies every non-CLIENT role and
   inactive memberships" FAILED (suspended member submitted); reverted.
4. Idempotency lookup + P2002 recovery removed → integration replay test
   FAILED (P2002 surfaced raw); reverted.
5. `writeAuditEvent` removed → integration "first submit → … + one
   audit" FAILED; reverted.
6. `beforeunload` cleanup removed (permanent listener) → E2E
   "submitted form is not trapped" FAILED (post-submit navigation
   aborted); reverted. Note: the normal dirty-clear is actually
   belt-and-suspenders — the server re-render unmounts the form and the
   unmount-cleanup removes the listener regardless.

### Gate results on the implementation tree

- `npx prisma validate` exit 0; `npx prisma generate` exit 0;
  `prisma migrate deploy` on fresh disposable PG exit 0.
- `npm run typecheck` exit 0; `npm run lint` exit 0 (0 warnings on final
  tree); `npx prettier --check .` exit 0; `npm run build` exit 0 —
  `/workspace/[ws]/onboarding` and `/…/onboarding/[assignmentId]` render
  as dynamic leaves alongside the staff `onboarding/assignments|forms`
  leaves with no collision.
- Unit suite: 83 files / 998 tests PASS (incl. 21 new P-023 tests).
- Integration suite (disposable `app_integration_p023_impl`): 18/18
  P-023 tests + full suite PASS on the fixed tree.
- E2E `client-onboarding.spec.ts`: 10/10 PASS — flag-off 404s, discover,
  client-side + server-side validation, irreversible confirm, submit,
  read-only submitted view, staff Completed-without-answers, consent
  withdrawal, no-store headers, dirty-only beforeunload +
  post-success-not-trapped, keyboard/overflow/≥44px at 1440/834/390.

### Held boundary

No PR, no merge, nothing deployed, flag never enabled in production, no
real-client data, no staff answer review, no
resubmission/drafts/C3/C4/cycle/MENSES/CALORIES.

### Same-model review (non-independent) — 2026-10-09

Post-push review of head `44e8eac` by the same model (explicitly NOT the
required independent review). One genuine finding, repaired forward:

- `next.config.ts` no-store source `/workspace/:ws/onboarding/:assignmentId`
  also matched the staff `onboarding/assignments` + `onboarding/forms`
  leaves — an unrelated-route header change. Forward fix narrowed the
  source to `(?!assignments|forms)[^/]+`; production-build curl probes
  confirm staff leaves keep their own dynamic headers while the client
  leaves get explicit `no-store`.

Otherwise verified clean: tx order vs R3 §13, lock order (advisories →
member FOR UPDATE → post-lock authorize), idempotency-before-ACTIVE +
P2002 backstop, consent fail-closed detail writes AND fills, audit-last
atomicity, zero-answer-reflecting errors, no browser-supplied
profile/user IDs, no secrets or real data, all six mutations bite.

Branch pushed: `feature/p023-client-onboarding-submission` @
`44e8eacc02e8ffc7da36746715ac30a9130f52f2` (3 commits on `bb9e42d`).

## P-023-I1-R2 — independent-review FAIL repairs (2026-10-10)

Different-model review `opencode-go/deepseek-v4.1-flash` returned FAIL on
head `30f8f84` (two P1s + two P2s). The repairs below were RED-first on
every repaired path — precise RED accounting follows.

### Process deviation record (P2-L) — stated honestly

The initial P-023-I1 implementation was NOT fully test-first: the Prisma
schema/migration, gate module, and core service were authored before the
first unit/integration test file existed. This is a bounded deviation
from Conductor's RED-first rule, kept visible and never rewritten as
test-first.

On 2026-10-10 the owner accepted this one-time bounded initial
exception. The acceptance covers only the already-recorded initial
ordering deviation — it does not waive tests, security findings,
independent review, CI, separate merge approval, production
restrictions, or test-first requirements for future work, and it sets no
precedent. The independent technical PASS applies to exact head
`fceb037`.

### RED accounting for the R2 delta (corrected per review P3-1)

The R2 delta adds 18 tests total — five resolver unit tests plus
thirteen integration tests:

- The five resolver tests were written before the resolver existed, but
  their initial failure was a module-missing import — not five separate
  behavioral failures.
- Nine integration cases have preserved, directly observed RED failures
  before the corresponding production repairs (the trusted-env real-path
  collection case, both read-ordering cases, the suspended/removed/
  consent-withdrawn conflict cases, the vanished- and persistent-
  conflict cases, and replay-after-withdrawal).
- Approximately four further integration tests — the forced-conflict
  replay regression pin and the production/unclassified-env cases that
  coincidentally already held under the prior code — were added
  alongside or after implementation and have no preserved initial RED.

Every repaired security/privacy path — the trusted runtime boundary,
consent-before-answer-query ordering, the fully-authorized P2002
re-entry, and consent before `already_submitted` — has genuine RED
failures plus mutation evidence. The repairs therefore have real
RED-first evidence per path; the whole 18-test delta is not claimed as
strictly RED-first.

### Repair A — trusted dev/test consent boundary (P1-A)

New `lib/onboarding/submission-consent.ts`:
`resolveOnboardingSubmissionConsentPolicy()` requires BOTH
`ENABLE_ONBOARDING_SUBMISSION === "1"` AND a trusted runtime
classification (`APP_ENV` ∈ {development,test} wins when set; otherwise
baked `NODE_ENV` ∈ {development,test}; missing/unknown/production →
unconfigured). The flag-only `onboardingSubmissionConsentRegistry(true)`
selector was deleted and both route call sites now consume the shared
resolver via the boundary default — the flag alone can never configure
consent in production. `APP_ENV=test` is injected only into the
Playwright primary test server (`next start` is NODE_ENV=production).
Unit matrix: 5 new tests (26/26). Real-path integration: production
classification + flag on cannot collect or reveal; unclassified fails
closed; trusted test env collects without injection (4 new tests).
Mutation R2A (env distinction bypassed) → 2 unit + 3 integration
failures incl. real-path collection — reverted.

### Repair C — P2002 fully-authorized replay (P1-C)

The outside-transaction catch shortcut was deleted. `submitOnboarding
Assignment` now wraps the whole Serializable attempt in `attempt()`; on
P2002 it re-enters the SAME protocol exactly once — fresh own-profile
resolution, advisories, member FOR UPDATE, in-tx `authorize(own)`, and a
scoped owned-submission lookup — so `already_submitted` is never returned
without current membership, authorization, tenant scoping, and consent.
A second P2002 exhausts to `serialization_conflict` (no recursion).
Additionally, the in-tx replay branch now checks current consent BEFORE
returning `already_submitted` — finding a submission is not authority to
disclose it. New deterministic coverage via a one-shot miss proxy against
a real planted unique violation: forced-conflict replay (1 sub, 0
audits), suspended/removed member at conflict → denied, consent
withdrawn at conflict → `consent_missing`, vanished-conflict → normal
submit, persistent-conflict → `serialization_conflict`, replay after
withdrawal → `consent_missing` (7 new tests). Mutations R2C1 (outside-tx
shortcut restored) → 4 failures; R2C2 (replay consent skipped) → 2
failures; both reverted.

### Repair B — consent before answer materialization (P2-B)

`loadOwnOnboardingDetail` now runs a staged read: assignment header
(status, pinned definition, submission id/date — no answers) →
authorization + `checkRequiredConsent` → only then a dedicated
`onboardingSubmissionAnswer.findMany` for the submitted view. Proven by
a query-interception proxy: post-withdrawal the assignment query's select
contains no `answers` and zero `onboardingSubmissionAnswer` queries run
(2 new tests). Mutation R2B (answers re-eagerized in the header select)
fails the ordering test — reverted.

### Repair totals

Integration suite 31/31 on fresh disposable `app_integration_p023_r2`;
unit 26/26; typecheck/lint clean.

### Independent re-review + owner decision (2026-10-10)

`opencode-go/deepseek-v4.1-flash` returned **PASS** on exact head
`fceb037` (no P0/P1/P2; one non-blocking P3-1 chronology imprecision,
corrected by this section). The owner then accepted the one-time bounded
initial test-first exception — bounded to the already-recorded initial
ordering deviation only, no precedent, no waiver of future test-first
requirements.

## Next gate

A lightweight different-model review of the final docs-only delta
(`fceb037..new_head`) before any PR is created. PR creation remains held
until that review returns PASS; merge is separately authorized.
