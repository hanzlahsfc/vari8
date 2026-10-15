# SOLO-COACH-I1 — owner-as-coach assignments + assigned-owner review writes

Status: **candidate for independent review** (pushed branch, no PR/merge/deploy).
Base: `origin/main` `c63ddfb01005d0e853906d2ad3e3445ee5e7e3d5`.
Branch: `feature/solo-coach-i1`.
Contract: SOLO-COACH-P2 plan `2b0d7eca…` (125 lines) + planner report
`1d612e9a…` (71 lines) + P2-R1 independent review PASS `549a2916…` (119
lines). Decision: **#111**.

## Scope (authorized by PROMPT 166)

- `lib/auth/rbac.ts` — `checkinsCoachReviews` + `onboardingSubmissionReviews`
  owner write `denied → assigned` (amends #95 and #37/P-024 separately).
- `lib/auth/guard.ts` — `clientAssignments` added to
  `PLATFORM_ADMIN_DENIED_RESOURCES` (corrects the false P1 claim that it
  was already covered; a dual-role PLATFORM_ADMIN + ACTIVE owner member
  previously fell through to owner scope).
- `lib/workspace/clients.ts` — `coachTargetRoleIsEligible` admits
  `WORKSPACE_OWNER` for PRIMARY|COACH; new `listAssignableCoachMembers`
  owner-gated bounded selector `{memberId, displayName, role}`;
  `assertAssignmentMutationsExternallyExposable` removed — its
  fail-closed intent is discharged by this reviewed routing slice and
  replaced by the concrete action-layer contract + tests.
- `lib/checkin/instances.ts`, `lib/onboarding/review.ts` — `canMark`
  derives from write-scope resolution + ACTIVE `ClientAssignment`
  existence + lifecycle (`review === null`), not `role === "COACH"`.
  Intentionally tightens coach button visibility too (P3-c). Advisory
  only — write path still re-authorizes + FOR UPDATE-locks.
- `app/.../clients/[clientProfileId]/coaches/{page,actions,assignment-panel}`
  — owner-gated screen: assign (member + PRIMARY|COACH), set-primary,
  remove (confirm). Bounded FormData parsing, role allowlist, safe error
  mapping, revalidatePath on success, no GET mutations.
- `app/.../clients/page.tsx` — cosmetic-gated "Coaches" roster link
  (`clientAssignments/write` scope !== denied).

## Corrections recorded (prospective, no history rewrite)

- P1 plan's deny-set claim was false; fixed here with direct behavioral
  coverage (zero writes + zero audits asserted).
- SOLO-COACH-P2 plan line 5 cited `9c73ca68…` (125 lines) for the prior
  review — that is CHECK-IN-FEEDBACK-P1-R1; the correct citation is
  SOLO-COACH-P1-R1 `36b00197…` (113 lines). Fixed in records; the hashed
  plan artifact is left untouched.
- Plan §7's "blocking" owner labels are superseded — both answers are
  APPROVED and recorded in decision #111: deny-set entry = yes; owner
  PRIMARY|COACH eligibility = yes.

## Verification log

- RED commit `9e5b538`: unit/rbac matrix cells fail; unit/guard dual-role
  PA+owner resolves `undefined` (granted, not role_denied) on
  clientAssignments; actions module missing; integration solo-coach-i1
  6/6 fail (member_not_eligible on owner assign, deny fall-through,
  missing selector); p024/p025c owner-assigned cases fail with
  `role_denied` where `not_assigned`/success expected.
- GREEN on implementation commit `aae19f6`: focused unit 52/52
  (rbac+guard+actions); integration solo-coach-i1 6/6, s1-c 9/9,
  p024 23/23, p025c 19/19 on disposable `app_integration_test`.
- Contract-amendment commit `e32f4ce`: four pre-existing unit tests that
  encoded the old cells updated to the amended contract; Prettier on the
  new surface; E2E consent fixtures carry each surface's pinned
  dev-policy versions (check-in vs onboarding registries differ); the
  onboarding mark assertion uses the established poll-then-reload
  pattern.
- Gates on the final tree: `git diff --check` clean; `prettier --check .`
  clean; `npx eslint .` 0 errors (3 pre-existing warnings in unrelated
  files); `npx tsc --noEmit` exit 0; `npx prisma validate` +
  `prisma migrate status` → schema up to date, no migration needed;
  full unit `vitest run` 1209/1209; full integration (real PG,
  `app_integration_test`) 749/749; `next build` clean (new
  `clients/[id]/coaches` route, 1.79 kB).
- Mutation sweep (7 mutants, sha256-verified byte-identical restores):
  deny-set entry removal → dual-role integration test fails;
  WORKSPACE_OWNER eligibility removal → owner self-assign fails;
  checkinsCoachReviews owner cell → denied → p025c owner mark fails;
  onboardingSubmissionReviews owner cell → denied → p024 owner mark
  fails; canMark assignment-existence check removed (check-in) →
  unassigned-owner canMark=false fails; ASSIGN audit skipped → audit
  assertion fails; onboarding canMark reverted to role-only →
  owner-assigned canMark=true fails. No survivors.
- Focused E2E `coach-assignments.spec.ts` 3/3 (unassigned owner read +
  no mark control; real-UI self-assign PRIMARY → both review journeys;
  non-owner 403). Adjacent specs `checkin-review` 7/7,
  `staff-onboarding-review` 9/9, `client-roster` 23/23.

## Exclusions (unchanged)

No feedback implementation, staff overview/queue, retention defaults,
task/habit completion changes, new dependencies, feature-flag changes,
deployment, or shared/production DB access. No schema migration —
verified: all changes are code-level (matrix cells, deny-set, eligibility,
predicates, routing); `ClientAssignment`/`WorkspaceMember` models
unchanged.
