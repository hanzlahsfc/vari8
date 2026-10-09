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

## Next gate

Independent different-model review of this documentation head before any PR
is created. Implementation is not authorized until that review passes, the
record merges, and a separate implementation prompt is issued.
