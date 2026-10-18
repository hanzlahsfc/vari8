# TB2-w3 — describe-level test audit (13 files)

Worktree: /home/nexuslink/.hermes/cache/scratch/vari8-tb/TB2-w3 @ 58eb6ed. Baselines run per file
alone with `npx vitest run tests/unit/<file>`; every mutation applied via ./tb-mutate.sh and
restored (worktree `git status` clean at end). Test counts per block verified against verbose
reporter output.

Summary: 46 top-level blocks judged — 40 KEEP (288 tests, 2516 lines), 6 CUT (7 tests, 76 lines).
CUT share: 7/295 tests (2.4%), 76/2592 block lines (2.9%).

| file | block | lines | tests | target | verdict | reason or mutation | failed tests |
| --- | --- | --- | --- | --- | --- | --- | --- |
| audit.test.ts | sanitizeAuditMeta | 182 | 43 | lib/audit.ts:sanitizeAuditMeta | KEEP | lib/audit.ts: `validator === undefined \|\| validator(value) !== true` -> `validator === undefined` | 14 of the block's it.each rows (rejects nested/array/email/oversized/jwt/hex/non-integer/negative/non-boolean/unknown role/unknown status x2/lowercase + non-structural version) |
| audit.test.ts | buildAuditEvent | 58 | 5 | lib/audit.ts:buildAuditEvent | KEEP | lib/audit.ts: `reason: null` -> `reason: "smuggled"` | builds a structural ALLOW event; never trusts caller-supplied actor or workspace fields |
| audit.test.ts | writeAuditEvent | 35 | 2 | lib/audit.ts:writeAuditEvent | KEEP | lib/audit.ts: `await tx.auditEvent.create({ data })` -> `void data` (in writeAuditEvent) | writes via the transaction client delegate |
| audit.test.ts | listAuditEvents | 67 | 2 | lib/audit.ts:listAuditEvents | KEEP | lib/audit.ts: `take: take + 1` -> `take: take` (workspace findMany) | lets the workspace owner read own-workspace events, bounded |
| audit.test.ts | listAccountAuditEvents (S1-F2B internal primitive) | 41 | 1 | lib/audit.ts:listAccountAuditEvents | KEEP | lib/audit.ts: `scope: "ACCOUNT"` -> `scope: "WORKSPACE"` (account where) | is subject-scoped, ACCOUNT-locked, bounded, and minimal |
| audit.test.ts | buildAccountAuditEvent (S1-F2B) | 279 | 21 | lib/audit.ts:buildAccountAuditEvent + writeAccountAuditEvent | KEEP | lib/audit.ts: meta pair rule `resourceType === "access_token"` -> `=== "user"` | captures each input field once — getter mutation cannot bypass the pair rule; rejects non-account actions/resources and missing subject |
| catalog.test.ts | searchFoods | 20 | 3 | lib/catalog.ts:searchFoods | KEEP | lib/catalog.ts: `record.category !== category` -> `===` | filters by category |
| catalog.test.ts | foodCategories | 9 | 1 | lib/catalog.ts:foodCategories | KEEP | lib/catalog.ts: dropped `.sort()` | returns unique, sorted, non-empty categories |
| catalog.test.ts | searchExercises | 18 | 2 | lib/catalog.ts:searchExercises | KEEP | lib/catalog.ts: `record.muscleGroup !== filters.muscleGroup` -> `===` | filters by muscle group and equipment |
| catalog.test.ts | exerciseFacets | 8 | 1 | lib/catalog.ts:exerciseFacets | KEEP | lib/catalog.ts: dropped `.sort()` in unique() | returns unique sorted facets |
| catalog.test.ts | toSparseGrid | 49 | 4 | lib/catalog.ts:toSparseGrid | KEEP | lib/catalog.ts: `isEmpty && !hasCheckbox` -> `isEmpty` | omits empty cells but keeps the full grid extent; preserves checkboxes, coordinates, and merged spans |
| catalog.test.ts | sheetDisplayName | 8 | 1 | lib/catalog.ts:sheetDisplayName | KEEP | lib/catalog.ts: `/\.html?$/i` -> `/\.xhtml$/i` | strips the html extension |
| checkin-forms-boundary.test.ts | P-025-A boundary — raw payload bound before parse | 77 | 3 | lib/checkin/forms-boundary.ts:parseDraftJson/saveCheckInDraftFromAction | KEEP | lib/checkin/forms-boundary.ts: `byteLength(draftJson) > MAX_DRAFT_JSON_BYTES` -> `draftJson.length > ...` | bounds BYTES, not characters — multibyte overflow rejects pre-parse |
| checkin-forms-boundary.test.ts | P-025-A boundary — closed error vocabulary maps to safe copy | 51 | 1 | lib/checkin/forms-boundary.ts:mapError/ERROR_MESSAGES | KEEP | lib/checkin/forms-boundary.ts: `fail(ERROR_MESSAGES[error.code] ?? GENERIC_ERROR)` -> `fail(GENERIC_ERROR)` | maps each typed code to its pinned message; unknown -> GENERIC |
| checkin-instances.test.ts | P-025-B — checkinInstances RBAC matrix | 23 | 2 | lib/auth/rbac.ts:checkinInstances cells | KEEP | lib/auth/rbac.ts: `CLIENT: c("own", "denied")` -> `c("own", "own")` | client own read only; SUPPORT and PLATFORM_ADMIN denied outright |
| checkin-instances.test.ts | P-025-B — platform-admin deny-set completeness | 67 | 2 | lib/auth/guard.ts:PLATFORM_ADMIN_DENIED_RESOURCES + authorize | KEEP | lib/auth/guard.ts: removed `"checkinInstances"` from the deny set | all three Check-In resources deny a dual-role platform admin |
| checkin-instances.test.ts | P-025-B — derived lifecycle projector | 107 | 2 | lib/checkin/instances.ts:projectCheckInInstanceState/Presentation | KEEP | lib/checkin/instances.ts: cancelled pair `&&` -> `\|\|` | derives CANCELLED > SUBMITTED > SCHEDULED from child rows only |
| checkin-instances.test.ts | P-025-B — dueAt and payload bounds | 24 | 2 | lib/checkin/instances.ts:parseCheckInDueAt/parseCheckInAnswersJson | KEEP | lib/checkin/instances.ts: year-range `\|\|` -> `&&` | accepts a sane ISO timestamp; rejects malformed/unbounded |
| checkin-instances.test.ts | P-025-B — answer canonicalization (typed, definition-bound) | 156 | 14 | lib/checkin/instances.ts:canonicalizeCheckInAnswers | KEEP | lib/checkin/instances.ts: dropped `.sort()` on multiChoice option ids | valid input produces one typed row per field, definition order |
| checkin-instances.test.ts | P-025-B — consent policy resolver | 34 | 1 | lib/checkin/instances-consent.ts:resolveCheckInConsentPolicy | KEEP | lib/checkin/instances-consent.ts: `=== "production"` -> `!== "production"` | synthetic registry requires flag AND trusted runtime. (Consent-version literals are D12-parked, but this block pins the fail-closed dev-registry gate — flag + trusted-runtime — a generic dev-exposure boundary, not consent mechanics.) |
| checkin-instances.test.ts | P-025-B — closed error vocabulary | 11 | 1 | lib/checkin/instances.ts:CheckInInstanceError | KEEP | lib/checkin/instances.ts: `super(code)` -> `super("internal detail")` | CheckInInstanceError carries only structural codes. (Thin — code/message round-trip — but the code->message pass-through is the contract callers consume and it bites.) |
| checkin-instances.test.ts | P-025-B — boundary seam exists for app-facing calls | 10 | 1 | lib/checkin/instances-boundary.ts:exports | CUT | typeof x === "function" checks only — export surface, no behavior | — |
| checkin-review-queue.test.ts | CHECK-IN-OVERVIEW-I1 — review-queue cursor codec | 29 | 9 | lib/checkin/instances.ts:parseCheckInReviewQueueCursor | KEEP | lib/checkin/instances.ts: dropped `id.includes("\|")` check | rejects malformed cursor "{ISO}\|a\|b" |
| checkin-review-queue.test.ts | CHECK-IN-OVERVIEW-I1 — queue WHERE builder | 56 | 3 | lib/checkin/instances.ts:buildCheckInReviewQueueWhere | KEEP | lib/checkin/instances.ts: `scope === "assigned"` -> `=== "workspace"` | all 3 tests (workspace anti-join, assigned semi-join, cursor OR branch) |
| checkin-review-queue.test.ts | CHECK-IN-OVERVIEW-I1 — derived canReview | 19 | 8 | lib/checkin/instances.ts:deriveCheckInQueueCanReview | KEEP | lib/checkin/instances.ts: dropped `&& rowHasActiveAssignment` | role=WORKSPACE_OWNER rowAssignment=false; role=COACH rowAssignment=false |
| checkin-review-queue.test.ts | CHECK-IN-OVERVIEW-I1 — deep-link param parser | 38 | 6 | lib/checkin/instances.ts:parseCheckInSubmissionParam | KEEP | lib/checkin/instances.ts: dropped `!validId(value)` | malformed param "" and 129-char rows -> invalid |
| checkin-review-queue.test.ts | CHECK-IN-OVERVIEW-I1 — exports | 13 | 2 | lib/checkin/instances.ts + instances-boundary exports | CUT | typeof checks plus a `PAGE_SIZE === 50` constant pin — re-states a constant | — |
| checkin-review.test.ts | P-025-C — REVIEWED in the derived projector | 56 | 2 | lib/checkin/instances.ts:projectCheckInInstanceState/Presentation | KEEP | lib/checkin/instances.ts: `return "REVIEWED"` -> `return "SUBMITTED"` | derives CANCELLED > REVIEWED > SUBMITTED > SCHEDULED; presentation keeps the late marker |
| checkin-review.test.ts | P-025-C — audit resource union | 11 | 1 | lib/audit.ts:AUDIT_RESOURCE_TYPES | CUT | Pins a constant array's contents/position ("checkin_review" once, after "checkin_submission") — re-states the constant, no mechanism exercised | — |
| checkin-review.test.ts | P-025-C — service exports | 8 | 1 | lib/checkin/instances.ts:exports | CUT | typeof checks only | — |
| checkin-review.test.ts | P-025-C — boundary exports | 8 | 1 | lib/checkin/instances-boundary.ts:exports | CUT | typeof checks only | — |
| checkin-review.test.ts | P-025-C — checkinsCoachReviews capability split | 28 | 1 | lib/auth/rbac.ts:checkinsCoachReviews cells | KEEP | lib/auth/rbac.ts: `WORKSPACE_OWNER: c("workspace", "assigned")` -> `c("assigned", "assigned")` | staff detail read = ws/assigned; mark = assigned only. (Write cells overlap checkin-instances.test.ts, but this block uniquely pins the READ column split.) |
| client-setup-actions.test.ts | P-016 server actions — flag-off ordering | 54 | 3 | app/.../client-setups/actions.ts + lib/coaching/client-setup-gate.ts | KEEP | lib/coaching/client-setup-gate.ts: `return env === "1"` -> `return true` | all 3 tests (assignTemplate + cancelSetupAssignment flag-off rows, FormData never read) |
| client-setup-actions.test.ts | P-016 server actions — flag-on validation | 86 | 9 | app/.../client-setups/actions.ts:indexField/singleString | KEEP | app/.../actions.ts: dropped `!/^\d+$/.test(raw)` in indexField | rejects a negative index before delegating |
| client-setup-transition-actions.test.ts | P-020B transition actions — flag ordering | 56 | 24 | app/.../client-setups/transition-actions.ts + lib/coaching/client-setup-transition-gate.ts | KEEP | lib/coaching/client-setup-transition-gate.ts: `transitionsEnv === "1" && isClientSetupEnabled(...)` -> `return true` | 21 of 24 tests (all flag-off and parent-off rows across the three actions) |
| client-tasks-boundary.test.ts | client-tasks boundary — gate first | 10 | 1 | lib/tasks/boundary.ts:guard | KEEP | lib/tasks/boundary.ts: flag-off `fail("not_available")` -> `fail("denied")` | flag-off returns not_available and never reaches the service |
| client-tasks-boundary.test.ts | client-tasks boundary — error vocabulary | 74 | 11 | lib/tasks/boundary.ts:mapError | KEEP | lib/tasks/boundary.ts: `isSerializationConflict(error)` -> `fail("not_available")` | maps raw P2034 / P2010-40001 / P2010-40P01 to serialization_conflict (3 rows) |
| coach-assignments-actions.test.ts | SOLO-COACH-I1 coach-assignment actions | 113 | 9 | app/.../coaches/actions.ts (assign/setPrimary/remove) | KEEP | app/.../coaches/actions.ts: dropped `!ASSIGNMENT_ROLES.has(role)` | assignCoachAction rejects out-of-allowlist role without calling the service |
| coaching-classification-actions.test.ts | P-020A classifyParameter action — flag-off ordering | 55 | 6 | app/.../parameters/actions.ts:classifyParameter + lib/coaching/parameter-classification-gate.ts | KEEP | lib/coaching/parameter-classification-gate.ts: `env === "1"` -> `env !== "1"` | flag=1 -> proceeds to auth and the boundary. (Flag-off rows still refused via the ENABLE_COACHING_TEMPLATES gate — the block's own proceed-path test catches the inversion.) |
| coaching-classification.test.ts | parameter-classification gate | 19 | 1 | lib/coaching/parameter-classification-gate.ts:isParameterClassificationEnabled | KEEP | lib/coaching/parameter-classification-gate.ts: `env === "1"` -> `env !== "1"` | enables only on the exact string "1" |
| coaching-classification.test.ts | classification boundary gate ordering | 26 | 1 | lib/coaching/parameters-boundary.ts:classifyParameterFromAction | CUT | Mutation applied: deleted the whole `!isParameterClassificationEnabled(...) return fail(OFF_ERROR)` check -> all 18 tests still passed. The flagOff() second gate (ENABLE_COACHING_TEMPLATES, unset in tests) produces the identical `{ok:false,"...not available."}` result, so the block cannot attribute the refusal to the classification gate it claims to pin. Only assertion is `r.ok false` + message contains "not available". | none — masked by the second gate |
| coaching-classification.test.ts | computeSelectionFingerprint | 15 | 2 | lib/coaching/selection-fingerprint.ts:computeSelectionFingerprint | KEEP | lib/coaching/selection-fingerprint.ts: hash `[...group].sort()` instead of `group` | changes when membership or ordering changes |
| coaching-classification.test.ts | evaluateDailyEntryVersionEligibility | 244 | 14 | lib/coaching/daily-entry-eligibility.ts | KEEP | lib/coaching/daily-entry-eligibility.ts: `cls !== "GENERAL_HEALTH"` -> `cls !== "CYCLE"` | accepts GENERAL_HEALTH MEASUREMENT; accepts RATING/OPTION/TEXT; rejects specialist classification CYCLE |
| daily-entry-canonical.test.ts | canonicalizeDecimal — grammar and normalization | 60 | 49 | lib/daily-entry/canonical.ts:canonicalizeDecimal | KEEP | lib/daily-entry/canonical.ts: `> MAX_FRACTION_DIGITS` -> `>=` | accepts "1.50000000", "-12,50000000", both 22-digit-boundary rows |
| daily-entry-canonical.test.ts | computeRevisionCanonicalHash | 112 | 5 | lib/daily-entry/canonical.ts:computeRevisionCanonicalHash | KEEP | lib/daily-entry/canonical.ts: `lp(p.dataClassification ?? "")` -> `lp("")` | produces the fixed compatibility vector; binds provenance, classification, pin, and version |
| daily-entry-canonical.test.ts | computeDailyEntryFormToken — actor-bound stale token | 68 | 11 | lib/daily-entry/canonical.ts:computeDailyEntryFormToken | KEEP | lib/daily-entry/canonical.ts: `lp(input.sessionUserId)` -> `lp("u")` | fails to replay across changed user |

## Per-file verdicts

- tests/unit/audit.test.ts — KEEP-ALL (6 blocks)
- tests/unit/catalog.test.ts — KEEP-ALL (6 blocks)
- tests/unit/checkin-forms-boundary.test.ts — KEEP-ALL (2 blocks)
- tests/unit/checkin-instances.test.ts — TRIM (keep all except "P-025-B — boundary seam exists for app-facing calls")
- tests/unit/checkin-review-queue.test.ts — TRIM (keep all except "CHECK-IN-OVERVIEW-I1 — exports")
- tests/unit/checkin-review.test.ts — TRIM (keep "P-025-C — REVIEWED in the derived projector" and "P-025-C — checkinsCoachReviews capability split")
- tests/unit/client-setup-actions.test.ts — KEEP-ALL (2 blocks)
- tests/unit/client-setup-transition-actions.test.ts — KEEP-ALL (1 block)
- tests/unit/client-tasks-boundary.test.ts — KEEP-ALL (2 blocks)
- tests/unit/coach-assignments-actions.test.ts — KEEP-ALL (1 block)
- tests/unit/coaching-classification-actions.test.ts — KEEP-ALL (1 block)
- tests/unit/coaching-classification.test.ts — TRIM (keep all except "classification boundary gate ordering")
- tests/unit/daily-entry-canonical.test.ts — KEEP-ALL (3 blocks)

## Could not check

Nothing. All 13 files ran alone, every non-CUT-on-sight block got a real mutation with attributed
failures, and every mutation was verified applied ("MUTATED") and restored ("file restored").

## Self-check

PASS.

(a) Coverage: 13/13 assigned files have all their top-level describe blocks listed —
    6+6+2+8+5+5+2+1+2+1+1+4+3 = 46 rows in the table, matching the grep enumeration of
    `^describe(` in each file. Baselines: 74+12+4+25+28+6+12+24+12+9+6+18+65 = 295 tests,
    matching the per-block test counts in the table (43+5+2+2+1+21; 3+1+2+1+4+1; 3+1;
    2+2+2+2+14+1+1+1; 9+3+8+6+2; 2+1+1+1+1; 3+9; 24; 1+11; 9; 6; 1+1+2+14; 49+5+11 = 295).
(b) Every KEEP block (40) has a recorded mutation that failed at least one of its own
    describe's tests; failed-test names are copied from verbose output with the full
    describe path, and every mutation output showed "MUTATED <file>" plus
    "MUTATION-RUN test-rc=1 (file restored)". The one mutation that produced zero
    failures (coaching-classification boundary gate ordering) is verdict CUT with the
    masking mechanism described.
(d) Nothing written outside this report file: `git status --short` in the worktree shows
    only `?? tb-mutate.sh` (the pre-existing untracked lever). No commits made. The only
    other writes were /tmp old/new string files consumed by the lever.
