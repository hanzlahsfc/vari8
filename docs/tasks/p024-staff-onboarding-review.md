# P-024 — Staff onboarding-submission review: planning chronology, review record, decision record

This record captures the complete P-024 planning and review chronology,
the owner's six approved decisions (#86–#91), the settled authorization
matrix, and the binding engineering contract. **No implementation is
authorized by this record**; a separate implementation prompt is required.

## Verified starting state (2026-10-10)

- `origin/main` = `2fda76141332a0ca842fba4b73f13b54bfa31085` — the PR #28
  merge commit (parents `bb9e42d` + reviewed `451a9af`). PR #28 MERGED;
  main CI run `37985984646`, job `114007975624`, SUCCESS on `2fda761`.
- Remote contains only `main`; the merged P-023 feature branch was deleted
  after green main CI. Protection: strict `verify`, `enforce_admins`,
  force-push/deletion blocked.
- Nothing deployed; `ENABLE_ONBOARDING_SUBMISSION` default-off; production
  consent unconfigured/fail-closed; no real-client data.
- Highest prior product-decision: #85; P-024 decisions are #86–#91.

## Current capability and gap

Merged on main: form builder (P-008), staff assignments (P-013), and the
merged P-023 client submission flow — `OnboardingSubmission` +
immutable `OnboardingSubmissionAnswer`, `unique(assignmentId)`, composite
coherence FKs, the shared `resolveOnboardingSubmissionConsentPolicy()`,
and the `onboardingSubmissions` CLIENT-own RBAC cell (every staff role
denied, dual-role-inclusive). **No authorized staff read or review path
exists for submitted onboarding answers** — the onboarding loop is
one-sided, exactly as DailyEntry was before P-022.

## Planning and review chronology

1. **P-024** (Devin SWE-2 High) — initial plan artifact
   (`/Users/apple/Downloads/P-024-staff-onboarding-review-plan.md`,
   SHA-256 `d9c25f07ea22770fdfa5492f8894fce665fcf604da680b8ac727f299776d358f`, 434 lines).
2. **P-024-R1** (`opencode-go/deepseek-v4.1-flash`) — **FAIL**
   (`/Users/apple/Downloads/P-024-R1-independent-review.md`, SHA-256
   `ba3ebefeea55e9b694fb96e3b6eef4698dc490fda4f99403556cd03a060a2cb4`, 110 lines):
   - **P1-1** — fabricated #37 citation ("act only through valid
     workspace membership" does not exist) justifying omission of the new
     resource from `PLATFORM_ADMIN_DENIED_RESOURCES`; a dual-role admin
     could have read/reviewed through membership.
   - **P1-2** — non-existent advisory key
     `onbassign:{ws}:{assignmentId}` and no specified derivation of the
     lock tuple from browser-supplied identifiers.
   - **P2-1** — schema not implementable: four missing Prisma relation
     backfields.
   - **P2-2** — wide unique specified raw-SQL-only (schema drift) with a
     leading-`id` redundancy left unjustified.
   - **P2-3** — protocol did not branch workspace-owner scope (no
     `ClientAssignment`) from assigned scope (required locked
     `ClientAssignment`).
   - **P3s** — `updatedAt` on a terminal record; a "26 sections"
     miscount; the `checkRequiredConsent` export caveat; reviewer-
     identity display folded rather than asked.
3. **P-024-R2** (Devin SWE-2 High) — complete self-contained replacement
   (`/Users/apple/Downloads/P-024-R2-staff-onboarding-review-plan.md`,
   SHA-256 `7abad9b84557acf9512327da3166b0b3534b7d8a80076bea19ae2a0e792d7202`, 586 lines, 26 top-level sections): fabricated
   citation removed and platform-admin denial treated as settled policy
   (resource added to the deny set); established
   `onbassign:{workspaceId}:{clientProfileId}:{formId}` key derived from a
   bounded answer-free scoped pre-read; all four backfields declared; the
   wide unique declared in `schema.prisma` as the intentional composite-FK
   target; explicit workspace/assigned branches; `updatedAt` dropped;
   reviewer identity promoted to an explicit owner question; the owner
   package expanded to six questions.
4. **P-024-R2-R1** (`opencode-go/deepseek-v4.1-flash`) — **PASS**
   (`/Users/apple/Downloads/P-024-R2-R1-independent-review.md`, SHA-256
   `ac03d41b5f969d81c03b81ab05414bec3c42b2be6f9f362c601989c6758bf0be`, 101 lines, 20 sections): no P0/P1/P2; every R1 finding
   verified closed against the exact `origin/main` code; the six-question
   package judged ready. Three non-blocking P3 notes recorded (per-coach
   fork also changes backrelation cardinality; the
   `client_profile`/`form-assignment` lock-order swap is serialized by
   the shared `onbassign` advisory; the intra-workspace advisory nuance
   matches the accepted P-022 precedent).
5. **Owner approval (2026-10-10)** — all six decisions approved as
   recommended; documentation-only record authorized.

## Approved decisions (#86–#91 in `docs/product-decisions.md`)

- **#86** One workspace-wide terminal review per submission — not
  per-coach; the reviewed state is shared workspace workflow evidence.
- **#87** The review acknowledgement is terminal — immutable; no unmark,
  reopen, reassign, or replace.
- **#88** Review is informational — it does not block or unlock any other
  workflow; downstream gating would require a separate decision.
- **#89** One structural READ audit per committed explicit "View details"
  action; zero audits on GET/pagination/prefetch/refresh/back-forward/
  failed requests; detail+audit commit atomically; at-least-once POST
  semantics.
- **#90** The UI enables "Mark reviewed" only after a successful detail
  view — a UX sequence, not authorization; the server independently
  re-authorizes; stale/revoked/withdrawn/foreign marks fail closed;
  assistants cannot mark.
- **#91** Reviewer identity + reviewed timestamp are bounded staff
  workflow metadata — visible only to staff currently authorized for that
  client's submission; never public, client-facing, or generally
  workspace-visible; never in unauthorized/foreign/SUPPORT/PLATFORM_ADMIN/
  client responses; never carries answers.

## Settled authorization (decision #37 — recorded, not forked)

Owner `workspace`-read, no `ClientAssignment` requirement, no mark; coach
`assigned` read + mark under a coherent ACTIVE `ClientAssignment`;
assistant `assigned` read, no mark; client denied the staff surface;
SUPPORT denied; PLATFORM_ADMIN denied **including dual-role** —
`onboardingSubmissionReviews` joins `PLATFORM_ADMIN_DENIED_RESOURCES` as a
binding engineering requirement, not a seventh decision. Coaching-
assignment removal/revocation ends coach/assistant access; owner access
continues per workspace scope subject to current membership, workspace,
consent, and feature mode.

## Binding engineering contract (accepted R2 plan — summarized; not yet implemented)

- Route `/workspace/[ws]/clients/[cp]/onboarding` + resource
  `onboardingSubmissionReviews`; `force-dynamic`; route-scoped
  `Cache-Control: no-store` on GET + both action POSTs.
- Shared fail-closed resolver (same flag + trusted dev/test runtime);
  bounded header-only list (zero answers, zero audits, strict `?c=`
  cursor); explicit `useActionState` detail + mark POSTs.
- Answer-free workspace/client-scoped pre-read →
  `onbassign:{ws}:{clientProfileId}:{formId}` advisory derived from the
  scoped row only; foreign/missing/incoherent fails before any lock;
  `OnboardingFormAssignment` vs `ClientAssignment` never conflated.
- Serializable tx: advisories → locked ACTIVE member → in-tx `authorize`
  → scope branch (owner: no `ClientAssignment`; assigned: re-resolve +
  lock ACTIVE `ClientAssignment`) → `client_profile` →
  `onboarding_form_assignment` → `onboarding_submission` → consent
  `FOR UPDATE` → answers/insert → structural audit last.
- `OnboardingSubmissionReview`: terminal immutable; `unique(submissionId)`;
  no answer columns; no `updatedAt`; all Prisma backrelations; declared
  `@@unique([id, workspaceId, clientProfileId])` on `OnboardingSubmission`
  as the composite-FK target; composite FKs + `ON DELETE RESTRICT`.
- Bounded one-time `P2002` re-entry through the full protocol; no
  outside-transaction reviewed-state shortcut; review never mutates
  submission/answers.
- `READ onboarding_submission {changed:false}` per committed detail;
  `CREATE onboarding_submission_review {changed:true}` per committed
  review; audit failure rolls back and returns no answers.

## Future test/mutation contract (required at implementation)

Dual-role platform-admin denial + deny-set-removal mutation; SUPPORT and
platform-only denial; exact advisory-key shape + wrong-key mutation;
foreign submission → zero advisories; caller-mutated tuples cannot
redirect locks/reads; owner branch performs no `ClientAssignment`
dependency/lock; assigned branches lock + recheck the ACTIVE
`ClientAssignment`; assistant/owner cannot mark; consent before answers;
GET/pagination/prefetch/refresh → zero READ audits (+ audit-on-GET
mutation); one READ audit per committed detail; audit failure returns no
answers; mark control unavailable until successful detail (#90); server
rejects unauthorized direct marks; reviewer identity per #91; `P2002`
recovery rechecks authorization + consent; real disposable-PostgreSQL
composite-FK/unique/RESTRICT/concurrency proofs; browser coverage at
1440/834/390 + keyboard/focus/touch/loading/empty/overflow/error/revoked/
consent-withdrawn; behavioral value over raw counts.

## Exclusions

No answer editing/resubmission; no staff corrections; no profile
auto-population; no review notes/comments/tasks/notifications/messaging;
no check-ins, dashboards, meal plans, training, or habits; no downstream
workflow gating; no C3/C4; no cycle/MENSES; no CALORIES input; no
client-facing reviewer disclosure (that remains a production-enablement
gate, the #81 analogue); no production consent wording; no retention/
erasure/export implementation; no D-10 resolution; no deployment; no
real-client data.

## Status

Owner-approved decisions recorded on `origin/main`'s documentation line
via `docs/p024-staff-onboarding-review-decisions`.

**P-024-I1 implementation wave (this branch,
`feature/p024-staff-onboarding-review`):** Prompt 81 authorized
implementation within decisions #86–#91 and the binding R2 contract.
Delivered on this branch:

- `OnboardingSubmissionReview` Prisma model — `@@unique([submissionId])`
  terminal anchor, `@@unique([id, workspaceId, clientProfileId])` on
  `OnboardingSubmission` as the coherence-FK target, RESTRICT FKs, no
  `updatedAt` — plus migration `20261012000000_p024_onboarding_review`
  declaring the composite coherence/reviewer/client FKs in SQL.
- `onboardingSubmissionReviews` RBAC resource (matrix per the settled
  direction) + `PLATFORM_ADMIN_DENIED_RESOURCES` membership; consent
  mapping; `onboarding_submission_review` audit resource.
- `lib/onboarding/review.ts` — unlocked answer-free header list,
  `readSubmissionReviewDetail` and `markSubmissionReviewed`, each one
  Serializable transaction in the reviewed lock order
  (`onbassign:{ws}:{cp}:{form}` → `member:{ws}:{user}` advisories →
  member FOR UPDATE → in-tx authorize → assigned-scope ACTIVE
  ClientAssignment re-resolve + FOR UPDATE / owner never touches it →
  profile FOR UPDATE → COMPLETED form-assignment FOR UPDATE →
  submission FOR UPDATE → consent FOR UPDATE → answers or review
  insert → structural audit LAST). Replay returns `already_reviewed`
  after re-checking current consent; P2002 re-enters the whole protocol
  once.
- `lib/onboarding/review-boundary.ts` — the only app-facing entry;
  `ENABLE_ONBOARDING_SUBMISSION` gate first, non-disclosing vocabulary.
- Route `/workspace/[ws]/clients/[cp]/onboarding` (page + actions +
  panel), roster "Onboarding" column, route-scoped no-store in
  `next.config.ts`.
- Tests: unit RBAC/audit/consent (`tests/unit/onboarding-review.test.ts`),
  20-case real-PG integration (`tests/integration/p024-onboarding-review.test.ts`),
  9-case E2E (`tests/e2e/staff-onboarding-review.spec.ts`).

Self-review is NON-INDEPENDENT. No PR, merge, deployment, production
flag, or real-client data occurred for this task.

## Next gate

Independent different-model review of this documentation head before any
PR is created; merge remains separately authorized.
