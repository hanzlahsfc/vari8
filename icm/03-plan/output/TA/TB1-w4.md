# TB1-w4 describe-level audit

Worktree: /home/nexuslink/.hermes/cache/scratch/vari8-tb/TB1-w4 @ 58eb6ed (detached).
Lever: /tmp/tb1-w4-mutate.sh. Logs: /tmp/tb1-w4-*.log.

| file | block | lines | tests | target | verdict | reason or mutation | failed tests |
|---|---|---|---|---|---|---|---|---|
| tests/unit/parameter-classification-dom.test.tsx | P-020A classification serialization — no raw ids | 46-129 | 3 | app/workspace/[workspaceId]/parameters/parameter-manager.tsx submitClassify + classify cell render | KEEP | m1: parameter-manager.tsx:362 select id classifyIndex -> row.id, 1 failed; m2: parameter-manager.tsx:81 parameterIndex -> row.id, 1 failed; m3: parameter-manager.tsx:355 invert classifyIndex undefined guard, 3 failed | m1: renders the control bound by classifyIndex only; m2: submits only positional index + fingerprint + revision + classification; m3: all 3 |
| tests/unit/parse.test.ts | parseSheetHtml | 51-112 | 9 | lib/extraction/parse.ts parseSheetHtml | KEEP | m1: parse.ts:37 CHECKED_HREF -> unchecked id, 1 failed; m2: parse.ts:100 rowspan coverage loop bound rowSpan -> 1, 2 failed | m1: decodes checkbox state and flags unrecognised state as TODO(product); m2: resolves spans to a stable anchor without fabricating covered cells, skips freezebar spacers so columns stay aligned |
| tests/unit/password-reset-delivery.test.ts | passwordResetDeliveryAvailable | 15-37 | 3 | lib/auth/password-reset-delivery.ts passwordResetDeliveryAvailable + deliverPasswordResetToken | KEEP | m1: password-reset-delivery.ts:49 Object.hasOwn(ADAPTERS, name) -> name.length > 0, 1 failed; m2: password-reset-delivery.ts:75 insert throw in no-adapter sink branch, 1 failed | m1: an env value alone cannot enable delivery; m2: the no-op sink resolves without throwing and leaks nothing |
| tests/unit/rbac.test.ts | RBAC matrix | 325-434 | 5 | lib/auth/rbac.ts RBAC_MATRIX + resolveScope | KEEP | m1: rbac.ts:237 foodExerciseMasterData PLATFORM_ADMIN platform/platform -> D, 1 failed; m2: rbac.ts:449 unknown-guard return undefined -> "denied", 1 failed; m3: rbac.ts:219 coachNotes CLIENT D -> own/own, 2 failed; m4: rbac.ts:274 onboardingFormTemplates COACH workspace/workspace -> assigned/assigned, 2 failed | m1: matches the reviewed matrix exactly; m2: fails closed for unknown resource/action/role; m3: matches the reviewed matrix exactly + pins the security-critical denials; m4: matches the reviewed matrix exactly + onboardingFormTemplates: direct per-role resolveScope cells (P-008) |
| tests/unit/retention.test.ts | S1-G retention policy | 16-125 | 14 | lib/gdpr/retention.ts evaluateRetention + assertAutomaticRetentionConfigured + RETENTION_POLICY | KEEP | m1: retention.ts:108 cutoff now-retainForMs -> now, 1 failed; m2: retention.ts:105 some(null)->every(null) on unset guard, 2 failed; m3: retention.ts:117 assertAutomaticRetentionConfigured throw -> return, 1 failed | m1: computes cutoffs when a full policy is injected; m2: evaluateRetention returns nothing due while any family is unset + returns empty when any injected family is unset; m3: automatic enforcement fails closed — no job may exist |
| tests/unit/route-guard.test.ts | resolveWorkspaceAccess | 94-166 | 3 | lib/auth/route-guard.ts resolveWorkspaceAccess | KEEP | route-guard.ts:55 AccessDeniedError catch return null -> throw, 2 failed | returns null (not throw) on every authorization denial (+ calls forbidden() exactly when the guard denies from sibling block) |
| tests/unit/route-guard.test.ts | requireWorkspaceAccess | 168-192 | 2 | lib/auth/route-guard.ts requireWorkspaceAccess | KEEP | route-guard.ts:69 if (ctx === null) forbidden() -> return ctx, 1 failed | calls forbidden() exactly when the guard denies |
| tests/unit/route-guard.test.ts | requireSessionUser | 194-213 | 3 | lib/auth/route-guard.ts requireSessionUser | KEEP | route-guard.ts:171 redirect("/login") -> redirect("/other"), 2 failed | redirects to /login when unauthenticated, redirects when the session has no user id |
| tests/unit/route-guard.test.ts | listSessionWorkspaces | 215-251 | 1 | lib/auth/route-guard.ts listSessionWorkspaces | KEEP | route-guard.ts:189 role in STAFF_WORKSPACE_ROLES -> ["CLIENT"], 1 failed | scopes by user + ACTIVE membership + ACTIVE workspace + staff role, minimal fields |
| tests/unit/route-guard.test.ts | getAuthorizedWorkspaceSummary | 253-272 | 2 | lib/auth/route-guard.ts getAuthorizedWorkspaceSummary | KEEP | route-guard.ts:237 workspaceId guard -> if (false), 1 failed | fails closed when the context has no workspace id |
| tests/unit/source-data-policy.test.ts | source-data policy: committed catalog artifacts are synthetic fixtures | 26-74 | 4 | spec/data/_.json + spec/sheets/_-database.json committed artifacts | KEEP | m1: foods.json sourceFile -> REAL-EXPORT, 1 failed; m2: nutrition-database.json sourceFile -> REAL-EXPORT, 1 failed; m3: exercises.json inject "Chicken Breast" note field, 1 failed; m4: exercises.json sourceFile -> REAL-EXPORT, 1 failed | m1: foods.json is a synthetic fixture; m2: catalog sheet grids are synthetic fixtures; m3: contains none of the known real catalog records; m4: exercises.json is a synthetic fixture |
| tests/unit/theme.test.ts | pro-dark theme | 52-70 | 2 | themes/pro-dark.css token values | CUT | constant pin: restates exact hex literals and the font name from the css; no computation, any legitimate palette change fails it | — |
| tests/unit/theme.test.ts | pro-white theme | 72-99 | 3 | themes/pro-white.css luminance + WCAG contrast | KEEP | pro-white.css:11 --color-base #f7f7f5 -> #2a2a2a, 2 failed (token-parity test is a pin but the contrast and luminance-threshold tests compute from the tokens) | is a distinct light theme, meets WCAG AA contrast for body text and success |
| tests/unit/theme.test.ts | theme application | 101-117 | 2 | app/layout.tsx data-theme + app/** hex scan | KEEP | m1: layout.tsx:12 data-theme pro-dark -> pro-white, 1 failed; m2: app/page.tsx inject #a1b2c3 literal, 1 failed | m1: selects pro-dark on the html element; m2: keeps hex colors out of application styles and components |
| tests/unit/token-exposure.test.ts | S1-F1 external-exposure boundary | 10-42 | 3 | lib/tokens.ts assertTokenFlowsExternallyExposable + assertAccountSecurityExternallyExposable | KEEP | m1: tokens.ts:30-32 token-flows throw -> return, 1 failed; m2: tokens.ts:67-69 account-security throw -> return, 1 failed. Weak test: "pure structural boundary" passes vacuously when the function stops throwing (assertions inside catch never run; only arity pin bites) | m1: fails closed: token flows are not exposable; m2: S1-F2B: the account-security surface is not exposable either |
| tests/unit/transition-diff.test.ts | P-020B computeTransitionDiff | 65-367 | 10 | lib/coaching/transition-diff.ts computeTransitionDiff + computeDiffHash | KEEP | m1: transition-diff.ts:416 warningCount +=1 -> +=2, 2 failed; m2: transition-diff.ts:259 semanticDrift(to) -> semanticDrift(from,from), 1 failed; m3: transition-diff.ts:395 category-rank comparator a-b -> b-a, 1 failed | m1: classifies added and removed items by category with warning on removal + detects rebound; m2: fails closed on defensive semantic drift between bound parameters; m3: orders entries deterministically by explicit category rank then identity |
| tests/unit/transition-diff.test.ts | P-020B transition summary validation | 369-414 | 2 | lib/coaching/transition-diff.ts buildTransitionSummary + validateTransitionSummary | KEEP | transition-diff.ts:477 schemaVersion !==1 -> !==2, 2 failed | builds and round-trips a valid summary, rejects extras wrong direction missing keys and bad counts |
| tests/unit/transition-review.test.ts | P-020B reviewFingerprint | 30-62 | 11 | lib/coaching/client-setup-transition.ts computeReviewFingerprint | KEEP | m1: client-setup-transition.ts:187 material.direction -> material.workspaceId (dup field, direction dropped from hash), 1 failed; m2: client-setup-transition.ts:195 material.templateStatus -> "", 1 failed | m1: changes when direction changes (upgrade not-equals rollback); m2: it.each case changes when templateStatus changes |
| tests/unit/transition-review.test.ts | P-020B serializeTransitionReview — sole browser boundary | 64-172 | 1 | lib/coaching/client-setup-transition-boundary.ts serializeTransitionReview | KEEP | client-setup-transition-boundary.ts:187 inject parameterId: e.parameterId into serialized diff entry, 1 failed | strips every raw database id from the serialized payload |

Per-file verdict lines:

- tests/unit/parameter-classification-dom.test.tsx: KEEP-ALL
- tests/unit/parse.test.ts: KEEP-ALL
- tests/unit/password-reset-delivery.test.ts: KEEP-ALL
- tests/unit/rbac.test.ts: KEEP-ALL
- tests/unit/retention.test.ts: KEEP-ALL
- tests/unit/route-guard.test.ts: KEEP-ALL
- tests/unit/source-data-policy.test.ts: KEEP-ALL
- tests/unit/theme.test.ts: TRIM (keep blocks pro-white theme, theme application)
- tests/unit/token-exposure.test.ts: KEEP-ALL (weak test inside: "pure structural boundary" is vacuous when the function stops throwing)
- tests/unit/transition-diff.test.ts: KEEP-ALL
- tests/unit/transition-review.test.ts: KEEP-ALL

## Could not check

None. Every file ran a green baseline (3/9/3/5/14/11/4/7/3/12/12 tests, no skips) and every non-CUT block produced at least one failing own-test under mutation.

## Anomalies and mutation no-ops

- parameter-classification-dom m3 first attempt (render `<div />` instead of null for missing classifyIndex) was a no-op (0 failures): it added no select. Retried by inverting the guard, killed all 3 tests.
- rbac.ts first m2 attempt (`?? "denied"` on the final return) was unreachable: the isResource/isAction/isPrincipalRole guard returns undefined first. Retried at the guard itself, killed the fail-closed test.
- Lever script /tmp/tb1-w4-mutate.sh was fixed mid-run: `grep -c -F` counts matching lines, not occurrences of a multi-line string; the uniqueness check now runs inside python only. Contract (assert-once, replace, run, restore, assert clean) unchanged.

## Self-check

- 11 files audited, 19 top-level describe blocks, 18 KEEP / 1 CUT.
- Every KEEP row cites at least one mutation run in /tmp/tb1-w4-*.log with named failed tests from that block.
- `git -C worktree status --porcelain` empty at end; nothing written outside the output file and /tmp.
