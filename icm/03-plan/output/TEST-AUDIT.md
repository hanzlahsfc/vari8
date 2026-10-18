STATUS: AWAITING OWNER APPROVAL

# Independent test audit

This is the deletion and retention list for PR-03 and later builders. Source is `58eb6ed` in the merge prototype. I read the six accepted pass-1 reports and all five pass-2 tables, checked their block boundaries against source, and independently exercised the samples below. The rejected Luna report is not an input. D10, D12, D13 and D14 override conflicting older plan text and producer rationales.

## Judgment and counting rules

- GUARD means a behavior that is difficult to establish in a browser. A failing mutation alone does not qualify. Server input validation, tenant isolation, tokens and passwords, date rules, calculations and data integrity qualify. UI output, navigation, labels, layout limits and UI-only flags do not.
- Every original pass-2 block has one final tag below. A mixed block that explicitly asserts today's role matrix is CUT-AT-REPLACE, not permanently GUARD. Do not delete its independent concurrency, transaction, date or token guarantees without first extracting or rewriting those guarantees in the replacing PR. This is deliberately conservative accounting of whole mixed blocks, not a claim that every test in them is obsolete.
- CUT-AT-REPLACE stays runnable until its named PR. PR-05 replaces permission assertions only after the owner supplies ROLES. It must add one table-driven test of every role by capability against the real new server check. GUARD blocks using old authorization only as setup get REWIRE, not deletion.
- AUTH is unresolved. `PLAN.md` PR-05 says Auth.js plus own tokens is the default pending the owner's choice. There is no evidence that Auth.js has already been replaced. Its session-revocation guards therefore remain GUARD, with a conditional PR-05 replacement action if AUTH selects Better Auth. Token/password service contracts survive either library choice.
- PR-04 is the proposed replacement point for parked consent, classification and health-data policy gates, because it makes backend features reachable. This requires an explicit plan amendment before execution. Current PR-04 still says "No ... consent bypass" and no existing plan PR explicitly deletes consent. D12 now overrides that wording. Do not invent a completed consent replacement or delete these suites in PR-03. Tracker cycle projection cases are deferred to PR-W4, whose build section hides cycle fields.
- Four whole files skip on the hardcoded macOS export directory and are CUT-FILE. The otherwise useful `source-config.test.ts` has one such skipped case, removed separately below. No real sheets were fabricated.
- `auth.spec.ts` is VISIBLE. Its entire source checks form labels and one unknown email's error string. It does not compare existing and missing accounts or prove authentication security. D14's explicit rule wins over TA-CE's KEEP and the brief's suggested GUARD/CUT-AT-REPLACE choice. Real credential, token and session guards remain. Owner approval of this explicit adjudication is required along with this report.
- Counts use physical source lines, including shared setup exactly once. Each block owns its source span. A named within-block exclusion owns its own span. Shared imports, hooks, enclosing describes and blank lines belong to GUARD if the file retains a guard, otherwise CUT-AT-REPLACE, otherwise the file's cut tag. These are reproducible accounting allocations, not a prediction of an exact deletion diff after import cleanup. Tests count expanded runtime cases, including declared skips, not `expect` calls. The blocks column counts the 517 pass-2 blocks only; it does not pretend pass-1 cuts or e2e support files received pass-2 block audits.

## Summary

| Final tag | Files containing this tag | Pass-2 blocks | Tests | Physical lines |
|---|---:|---:|---:|---:|
| GUARD | 128 | 283 | 1199 | 29239 |
| VISIBLE | 29 | 80 | 145 | 3017 |
| CUT-AT-REPLACE | 66 | 108 | 850 | 32251 |
| CUT pass 1 | 13 | 0 | 57 | 1056 |
| CUT pass 2 | 41 | 46 | 109 | 1880 |
| e2e CUT | 41 | 0 | 398 | 18377 |
| Total, distinct files | 232 | 517 | 2758 | 85820 |

Files in a mixed file count in more than one tag row. Do not add that column. The distinct action partition is **67 KEEP-ALL + 67 TRIM + 61 CUT-FILE + 37 whole-file CUT-AT-REPLACE = 232**. The last group is 28 PR-05 files and 9 PR-04 files. Mixed files have their replacement PRs in the action list.

Inventory arithmetic is **109 unit + 53 integration + 23 canvas + 47 e2e/support = 232 files**. Lines are **21,757 + 39,233 + 5,433 + 19,397 = 85,820**. Tests are **1,329 + 845 + 157 + 427 = 2,758**, including declared skips. The old notes counted 55 integration files and about 85,900 lines; this accepted pass-1 census contains 53. The 41 old-UI specs contain 18,377 physical lines, not the reported 18,418.

Permanent GUARD accounts for **29,239 / 85,820 lines = 34.07%**, and **1,199 / 2,758 tests = 43.47%**. Six candidate GUARD e2e cases are still unproven because delivery is disabled. Do not count those skips as passed guards.

PR-03 cuts **24,330 allocated lines**, including mixed-file cuts. Another **32,251 allocated lines** stay until their replacement PR. That is not permission to delete mixed-suite integrity guarantees. The eventual non-permanent share is **65.93%**, not a forced 75% target.

Producer arithmetic corrections are material to confidence, not to the tagging rule. TB0 row sums are 12,542 estimated block lines, not its 12,534 summary. TB2 KEEP rows sum to 12,891 estimated lines, not 12,951; adding its 170 CUT lines gives 13,061. The final line accounting uses actual source spans and counts all setup once.

The original pass-1 CUT on `consent.test.ts` moves to PR-04 CUT-AT-REPLACE, and `client-setup-rbac.test.ts` moves to PR-05 CUT-AT-REPLACE. This follows D14's later instruction to retain replaced-code tests until replacement, rather than silently applying the older CUT decision. Other pass-1 CUT files stay CUT.

## What the verifier actually ran

All installs, builds, tests and mutations ran in detached scratch worktree `/home/nexuslink/.hermes/cache/scratch/vari8-jta`, not in the root checkout. The only database was disposable `app_jta` in `vari8-db-1` on port 5433. Node was **v26.7.0**, not the target Node 24. These results prove this source snapshot on the available runtime, not target-runtime certification.

- Root `npm ci` and `npx prisma generate` exited 0. Canvas `npm ci` exited 0. npm reported 11 root dependency vulnerabilities and 7 canvas high-severity vulnerabilities. No audit fix or dependency change was made.
- `npm run test` exited 0. 1,306 passed, 23 skipped, 0 failed. The 22 tests in the four fully skipped external-source files and the additional source-config case are not proof.
- `INTEGRATION_DATABASE_URL=postgresql://app:app_dev_password@127.0.0.1:5433/app_jta npm run test:integration` exited 0. All 845 tests passed against real PostgreSQL. An earlier run used an incorrect local placeholder password and failed at initialization. It was discarded and rerun with the compose-documented password; database credentials were not changed.
- `npm --prefix frontend test` exited 0. 157 passed, 0 skipped, 0 failed.
- Playwright `--list` collected 427 cases in 44 spec files. The 47-file e2e inventory also contains 3 support files. The 398 cases in the 41 old-UI specs were inventoried, not run.
- The auth, invite and reset files ran headlessly against three fresh production builds on isolated port 3217, using `app_jta`. Baseline and restored builds each passed 17 cases, skipped 12 and failed 0. The mutated build passed 4, skipped 12 and failed 13. Each flow file had its own production-source mutation and at least one of its cases failed. No screenshots or GUI windows were opened.
- The 12 reset flow skips are real. `lib/auth/password-reset-delivery.ts` has an empty adapter registry. Six of those skipped cases are GUARD candidates and remain UNPROVEN through the browser. The other six are visible UI cases to cut. Only the two route-closed guards actually ran. Do not describe the complete password-reset flow as verified. Its underlying unit and real-DB service contracts did run.

Raw evidence remains outside the repository at `/home/nexuslink/.hermes/cache/scratch/vari8-jta-data/`: baseline JSON and logs, `source-census.json`, `classified.json`, `carveouts.json`, `final-data.json`, `mutations.jsonl`, all focused baseline/mutant/restored logs, and `e2e-{baseline,mutant,restored}.json`. `mutate.py`, `e2e-mutate.py`, `source-census.cjs`, `classify.py` and `aggregate.py` record the commands and counting rules. The deleted worktree is not needed to read these results.

## Per-file action list

Each source file appears once. KEEP-ALL refers to this audit's approved GUARD content. TRIM lists retained blocks and separately names delayed replacement blocks. In a TRIM file, PR-03 deletes all VISIBLE and CUT pass-2 blocks plus the named within-block exclusions. It must not delete a listed CUT-AT-REPLACE block early. The e2e table supplies retained cases for the two mixed flow files.

- `frontend/scripts/agent-context.test.mjs`: CUT-FILE in PR-03.
- `frontend/scripts/mealplan-model.test.ts`: KEEP-ALL.
- `frontend/scripts/mealplan-overview.test.ts`: KEEP-ALL.
- `frontend/src/components/coach/accent-contrast.test.mjs`: TRIM (keep blocks TB4.030, TB4.031); cut VISIBLE in PR-03.
- `frontend/src/components/coach/client-tracker-preview/example-client.checks.mjs`: CUT-FILE in PR-03.
- `frontend/src/components/coach/client-tracker-preview/example-history.checks.mjs`: TRIM (retain replacement blocks only); cut VISIBLE in PR-03; CUT-AT-REPLACE in PR-W4 blocks TB4.037.
- `frontend/src/components/coach/client-tracker-preview/preview-model.test.mjs`: TRIM (keep blocks TB4.039, TB4.041); cut VISIBLE in PR-03.
- `frontend/src/components/coach/client-tracker-preview/view-model.test.mjs`: TRIM (keep blocks TB4.042, TB4.046, TB4.047, TB4.048); cut VISIBLE in PR-03; CUT-AT-REPLACE in PR-W4 blocks TB4.044, TB4.049.
- `frontend/src/components/coach/model.test.mjs`: TRIM (keep blocks TB4.052, TB4.053, TB4.054, TB4.055, TB4.056, TB4.057, TB4.059, TB4.060, TB4.061, TB4.062, TB4.064); cut VISIBLE in PR-03.
- `frontend/src/components/coach/muscle-volume.test.mjs`: KEEP-ALL.
- `frontend/src/components/coach/plans/nutrition/model.checks.mjs`: KEEP-ALL.
- `frontend/src/components/coach/plans/training/training-model.checks.mjs`: KEEP-ALL.
- `frontend/src/components/coach/roadmap-preview.test.mjs`: KEEP-ALL.
- `frontend/src/components/coach/template-setup.test.mjs`: KEEP-ALL.
- `frontend/src/components/coach/tracker-setup.checks.mjs`: TRIM (keep blocks TB4.079, TB4.081); cut VISIBLE, CUT pass 2 in PR-03.
- `frontend/src/components/ethereal/builder/coaching-refinement.test.mjs`: CUT-FILE in PR-03.
- `frontend/src/components/ethereal/builder/expansion.test.mjs`: TRIM (keep blocks TB4.094, TB4.095, TB4.098); cut VISIBLE in PR-03.
- `frontend/src/components/ethereal/builder/fixture-history.test.mjs`: TRIM (keep blocks TB4.101, TB4.102, TB4.103, TB4.104); cut CUT pass 2 in PR-03.
- `frontend/src/components/ethereal/builder/refinement.test.mjs`: TRIM (keep blocks TB4.105); cut VISIBLE in PR-03.
- `frontend/src/components/ethereal/builder/smooth-trend.test.mjs`: CUT-FILE in PR-03.
- `frontend/src/components/ethereal/builder/widgets.test.mjs`: TRIM (keep blocks TB4.123, TB4.124, TB4.127); cut VISIBLE, CUT pass 2 in PR-03.
- `frontend/src/components/ethereal/client-tracker/model.test.mjs`: KEEP-ALL.
- `frontend/src/components/ethereal/clients/model.test.mjs`: TRIM (keep blocks TB4.146, TB4.147); cut VISIBLE in PR-03.
- `tests/e2e/a11y.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/appearance.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/auth.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/checkin-calendar.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/checkin-feedback.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/checkin-forms.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/checkin-instances.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/checkin-recurrence.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/checkin-review-queue.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/checkin-review.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/checkin-tracker-context.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/client-dashboard.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/client-home.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/client-onboarding.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/client-roster.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/client-setup-transitions.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/client-setup.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/client-tasks.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/coach-assignments.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/coaching-templates.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/daily-entry-conflict.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/daily-entry-lily.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/daily-tracker.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/daily.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/exercise-catalog.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/fixture-sweep.ts`: KEEP-ALL.
- `tests/e2e/global-setup.ts`: KEEP-ALL.
- `tests/e2e/global-teardown.ts`: KEEP-ALL.
- `tests/e2e/habits.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/home-next-checkin.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/invite-acceptance.spec.ts`: TRIM (keep the GUARD cases in the flow table); cut VISIBLE in PR-03; REWIRE in PR-05.
- `tests/e2e/library.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/mealplan.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/nutrition-catalog.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/onboarding-assignments.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/onboarding-forms-security.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/onboarding-forms.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/parameter-classification.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/password-reset.spec.ts`: TRIM (keep the GUARD cases in the flow table); cut VISIBLE in PR-03; REWIRE in PR-05 if AUTH changes the session implementation.
- `tests/e2e/sheets.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/smoke.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/staff-daily-review.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/staff-onboarding-review.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/theme.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/training-program.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/workspace-daily-entry.spec.ts`: CUT-FILE in PR-03.
- `tests/e2e/workspace-shell.spec.ts`: CUT-FILE in PR-03.
- `tests/integration/checkin-feedback-i1.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/checkin-overview-i1.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/checkin-recurrence-i1.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/client-tasks.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/dashboard-layout.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/habits-schema.test.ts`: KEEP-ALL.
- `tests/integration/habits.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/i4-next-checkin.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/mealplan-i1.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/p008-onboarding-actions.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/p008-onboarding-forms.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/p008-onboarding-schema.test.ts`: CUT-FILE in PR-03.
- `tests/integration/p010-client-roster.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/p013-onboarding-assignments.test.ts`: TRIM (keep blocks TB2.013, TB2.016, TB2.021); CUT-AT-REPLACE in PR-05 blocks TB2.014, TB2.015, TB2.017, TB2.018, TB2.019, TB2.020; REWIRE in PR-05.
- `tests/integration/p014-coaching-templates.test.ts`: TRIM (keep blocks TB0.035, TB0.037, TB0.038, TB0.039, TB0.041, TB0.042); cut CUT pass 2 in PR-03; CUT-AT-REPLACE in PR-05 blocks TB0.036; REWIRE in PR-05.
- `tests/integration/p016-client-setup.test.ts`: TRIM (keep blocks TB2.007); CUT-AT-REPLACE in PR-05 blocks TB2.008, TB2.009, TB2.010, TB2.011.
- `tests/integration/p020a-parameter-classification.test.ts`: TRIM (keep blocks TB1.007, TB1.008); CUT-AT-REPLACE in PR-04 blocks TB1.003, TB1.004, TB1.005, TB1.006.
- `tests/integration/p020b-template-transitions.test.ts`: TRIM (keep blocks TB3.006, TB3.008, TB3.009); cut CUT pass 2 in PR-03; CUT-AT-REPLACE in PR-05 blocks TB3.007; REWIRE in PR-05.
- `tests/integration/p021-daily-entry.test.ts`: TRIM (keep blocks TB1.009, TB1.011); CUT-AT-REPLACE in PR-05 blocks TB1.010; REWIRE in PR-05.
- `tests/integration/p022-staff-daily-review.test.ts`: TRIM (keep blocks TB0.046, TB0.048); CUT-AT-REPLACE in PR-05 blocks TB0.043, TB0.045, TB0.047; CUT-AT-REPLACE in PR-04 blocks TB0.044.
- `tests/integration/p023-onboarding-submission.test.ts`: TRIM (keep blocks TB0.049, TB0.050, TB0.053, TB0.055); cut VISIBLE in PR-03; CUT-AT-REPLACE in PR-05 blocks TB0.051, TB0.058; CUT-AT-REPLACE in PR-04 blocks TB0.052, TB0.056, TB0.057; REWIRE in PR-05.
- `tests/integration/p024-onboarding-review.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/p025a-checkin-actions.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/p025a-checkin-forms.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/p025a-checkin-schema.test.ts`: TRIM (keep blocks TB3.014); cut CUT pass 2 in PR-03; cut the named within-block exceptions below in PR-03.
- `tests/integration/p025b-checkin-instances.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/p025c-checkin-review.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/p025d2-checkin-calendar.test.ts`: TRIM (keep blocks TB2.024); CUT-AT-REPLACE in PR-05 blocks TB2.023; REWIRE in PR-05.
- `tests/integration/p025d6-checkin-tracker-context.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/phase-1-1-daily-tracker-guard.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/phase-2-1-nutrition-import.test.ts`: KEEP-ALL.
- `tests/integration/phase-2-2-exercise-import.test.ts`: KEEP-ALL.
- `tests/integration/phase-3-1-invite-acceptance.test.ts`: KEEP-ALL; REWIRE in PR-05.
- `tests/integration/phase-3-2-password-reset.test.ts`: KEEP-ALL.
- `tests/integration/s1-a-identity.test.ts`: TRIM (keep blocks TB2.003, TB2.004); cut CUT pass 2 in PR-03; cut the named within-block exceptions below in PR-03.
- `tests/integration/s1-b-authorization.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/s1-c-client-assignments.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/s1-d-consent.test.ts`: CUT-AT-REPLACE in PR-04.
- `tests/integration/s1-e-audit.test.ts`: KEEP-ALL; REWIRE in PR-05.
- `tests/integration/s1-f1-token-schema.test.ts`: TRIM (keep blocks TB1.017, TB1.018); cut CUT pass 2 in PR-03; cut the named within-block exceptions below in PR-03.
- `tests/integration/s1-f2a-token-store.test.ts`: KEEP-ALL.
- `tests/integration/s1-f2b-account-audit.test.ts`: KEEP-ALL; REWIRE in PR-05.
- `tests/integration/s1-f2b-session-runtime.test.ts`: KEEP-ALL; REWIRE in PR-05 if AUTH replaces Auth.js; if AUTH replaces Auth.js, CUT-AT-REPLACE in PR-05 instead.
- `tests/integration/s1-f2b-session.test.ts`: KEEP-ALL; REWIRE in PR-05 if AUTH replaces Auth.js; if AUTH replaces Auth.js, CUT-AT-REPLACE in PR-05 instead.
- `tests/integration/s1-f2b-token-cleanup.test.ts`: KEEP-ALL.
- `tests/integration/s1-f2c-invitations.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/s1-f2d-password-reset.test.ts`: KEEP-ALL; REWIRE in PR-05 if AUTH replaces Auth.js; if AUTH replaces Auth.js, CUT-AT-REPLACE in PR-05 instead.
- `tests/integration/s1-g-export.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/s1-g-retention.test.ts`: CUT-FILE in PR-03.
- `tests/integration/s1-h-route-guard.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/solo-coach-i1.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/integration/teardown-sweep.test.ts`: KEEP-ALL.
- `tests/integration/training-i1a.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/unit/audit.test.ts`: TRIM (keep blocks TB2.026, TB2.027, TB2.030, TB2.031); cut CUT pass 2 in PR-03; CUT-AT-REPLACE in PR-05 blocks TB2.029.
- `tests/unit/catalog.test.ts`: TRIM (retain replacement blocks only); cut VISIBLE in PR-03; CUT-AT-REPLACE in PR-04 blocks TB2.036.
- `tests/unit/checkin-calendar.test.ts`: KEEP-ALL.
- `tests/unit/checkin-feedback.test.ts`: TRIM (retain replacement blocks only); cut CUT pass 2 in PR-03; CUT-AT-REPLACE in PR-05 blocks TB1.023, TB1.025.
- `tests/unit/checkin-forms-boundary.test.ts`: TRIM (keep blocks TB2.038); cut VISIBLE in PR-03.
- `tests/unit/checkin-forms.test.ts`: TRIM (keep blocks TB0.007, TB0.010); cut CUT pass 2 in PR-03; CUT-AT-REPLACE in PR-05 blocks TB0.008, TB0.009.
- `tests/unit/checkin-instances.test.ts`: TRIM (keep blocks TB2.043, TB2.044); cut VISIBLE, CUT pass 2 in PR-03; CUT-AT-REPLACE in PR-05 blocks TB2.040, TB2.041; CUT-AT-REPLACE in PR-04 blocks TB2.045.
- `tests/unit/checkin-review-queue-nav.dom.test.tsx`: CUT-FILE in PR-03.
- `tests/unit/checkin-review-queue.test.ts`: TRIM (keep blocks TB2.048, TB2.049, TB2.051); cut CUT pass 2 in PR-03; CUT-AT-REPLACE in PR-05 blocks TB2.050; REWIRE in PR-05.
- `tests/unit/checkin-review.test.ts`: TRIM (retain replacement blocks only); cut VISIBLE, CUT pass 2 in PR-03; CUT-AT-REPLACE in PR-05 blocks TB2.057.
- `tests/unit/checkin-schedule-timezone.test.ts`: KEEP-ALL.
- `tests/unit/checkin-schedules.test.ts`: KEEP-ALL.
- `tests/unit/checkin-tracker-context.test.ts`: TRIM (keep blocks TB0.013); CUT-AT-REPLACE in PR-05 blocks TB0.012.
- `tests/unit/client-roster-nav.dom.test.tsx`: CUT-FILE in PR-03.
- `tests/unit/client-roster.test.ts`: TRIM (keep blocks TB0.014, TB0.015); cut VISIBLE, CUT pass 2 in PR-03.
- `tests/unit/client-setup-actions.test.ts`: KEEP-ALL; REWIRE in PR-05.
- `tests/unit/client-setup-boundary-imports.test.ts`: CUT-FILE in PR-03.
- `tests/unit/client-setup-boundary.test.ts`: TRIM (keep blocks TB0.018, TB0.019); cut VISIBLE in PR-03.
- `tests/unit/client-setup-nav.dom.test.tsx`: CUT-FILE in PR-03.
- `tests/unit/client-setup-rbac.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/unit/client-setup-selection.test.ts`: KEEP-ALL.
- `tests/unit/client-setup-transition-actions.test.ts`: KEEP-ALL; REWIRE in PR-05.
- `tests/unit/client-setup.test.ts`: TRIM (keep blocks TB0.024); cut CUT pass 2 in PR-03.
- `tests/unit/client-tasks-boundary.test.ts`: KEEP-ALL.
- `tests/unit/client-tasks-date.test.ts`: KEEP-ALL.
- `tests/unit/clients-service.test.ts`: TRIM (keep blocks TB1.028, TB1.029, TB1.030, TB1.033, TB1.034); cut CUT pass 2 in PR-03; CUT-AT-REPLACE in PR-05 blocks TB1.031, TB1.032, TB1.035, TB1.036; REWIRE in PR-05.
- `tests/unit/coach-assignments-actions.test.ts`: KEEP-ALL; REWIRE in PR-05.
- `tests/unit/coaching-actions.test.ts`: KEEP-ALL; REWIRE in PR-05.
- `tests/unit/coaching-boundary-imports.test.ts`: CUT-FILE in PR-03.
- `tests/unit/coaching-boundary.test.ts`: KEEP-ALL; REWIRE in PR-05.
- `tests/unit/coaching-classification-actions.test.ts`: CUT-AT-REPLACE in PR-04.
- `tests/unit/coaching-classification.test.ts`: TRIM (keep blocks TB2.067); CUT-AT-REPLACE in PR-04 blocks TB2.065, TB2.066, TB2.068.
- `tests/unit/coaching-gate.test.ts`: TRIM (keep blocks TB3.033); cut CUT pass 2 in PR-03.
- `tests/unit/coaching-nav.dom.test.tsx`: CUT-FILE in PR-03.
- `tests/unit/coaching-parameters.test.ts`: KEEP-ALL.
- `tests/unit/coaching-templates.test.ts`: KEEP-ALL.
- `tests/unit/consent.test.ts`: CUT-AT-REPLACE in PR-04.
- `tests/unit/credentials.test.ts`: KEEP-ALL.
- `tests/unit/crosssheet.test.ts`: CUT-AT-REPLACE in PR-04.
- `tests/unit/daily-entry-canonical.test.ts`: KEEP-ALL.
- `tests/unit/daily-entry-impact.test.ts`: KEEP-ALL.
- `tests/unit/daily-entry-validate.test.ts`: KEEP-ALL.
- `tests/unit/daily-prototype.test.ts`: TRIM (keep blocks TB2.074, TB2.075); cut CUT pass 2 in PR-03.
- `tests/unit/daily-tracker.test.ts`: TRIM (keep blocks TB3.036); cut CUT pass 2 in PR-03; cut the named within-block exceptions below in PR-03.
- `tests/unit/daily-week-groups.test.ts`: KEEP-ALL.
- `tests/unit/dashboard-autosave-ssr.test.ts`: TRIM (keep blocks TB1.041); cut CUT pass 2 in PR-03; cut the named within-block exceptions below in PR-03.
- `tests/unit/dashboard-autosave.test.ts`: KEEP-ALL.
- `tests/unit/dashboard-config-habits.test.ts`: KEEP-ALL.
- `tests/unit/dashboard-config.test.ts`: TRIM (keep blocks TB2.077, TB2.080); cut VISIBLE, CUT pass 2 in PR-03.
- `tests/unit/databases-real.test.ts`: CUT-FILE in PR-03.
- `tests/unit/databases.test.ts`: KEEP-ALL.
- `tests/unit/exercise-source.test.ts`: KEEP-ALL.
- `tests/unit/extraction-contract.test.ts`: TRIM (keep blocks TB2.081); cut CUT pass 2 in PR-03; CUT-AT-REPLACE in PR-04 blocks TB2.082; cut the named within-block exceptions below in PR-03.
- `tests/unit/gdpr-export.test.ts`: CUT-AT-REPLACE in PR-04.
- `tests/unit/guard.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/unit/habits-boundary.test.ts`: KEEP-ALL.
- `tests/unit/habits-date.test.ts`: KEEP-ALL.
- `tests/unit/invitations.test.ts`: TRIM (keep blocks TB1.048, TB1.049); CUT-AT-REPLACE in PR-05 blocks TB1.047, TB1.050; REWIRE in PR-05.
- `tests/unit/invite-acceptance.test.ts`: KEEP-ALL.
- `tests/unit/mealplan-gate.test.ts`: TRIM (keep blocks TB1.051, TB1.052); CUT-AT-REPLACE in PR-04 blocks TB1.053.
- `tests/unit/mealplan-payload.test.ts`: KEEP-ALL.
- `tests/unit/mealplan-timezone.test.ts`: KEEP-ALL.
- `tests/unit/normalize.test.ts`: KEEP-ALL.
- `tests/unit/nutrition-source.test.ts`: KEEP-ALL.
- `tests/unit/onboarding-actions.test.ts`: TRIM (keep blocks TB3.041, TB3.042, TB3.043); cut CUT pass 2 in PR-03; cut the named within-block exceptions below in PR-03; REWIRE in PR-05.
- `tests/unit/onboarding-assignments-actions.test.ts`: KEEP-ALL; REWIRE in PR-05.
- `tests/unit/onboarding-assignments-boundary-imports.test.ts`: CUT-FILE in PR-03.
- `tests/unit/onboarding-assignments-boundary.test.ts`: KEEP-ALL; REWIRE in PR-05.
- `tests/unit/onboarding-assignments-nav.dom.test.tsx`: CUT-FILE in PR-03.
- `tests/unit/onboarding-assignments.test.ts`: TRIM (keep blocks TB2.086); cut CUT pass 2 in PR-03.
- `tests/unit/onboarding-draft-editor.dom.test.tsx`: TRIM (keep blocks TB0.078, TB0.079, TB0.081); cut VISIBLE in PR-03.
- `tests/unit/onboarding-draft-editor.test.ts`: TRIM (keep blocks TB3.049, TB3.050); cut VISIBLE in PR-03.
- `tests/unit/onboarding-forms-boundary.test.ts`: TRIM (keep blocks TB3.052, TB3.053); cut CUT pass 2 in PR-03; cut the named within-block exceptions below in PR-03; REWIRE in PR-05.
- `tests/unit/onboarding-forms.test.ts`: TRIM (keep blocks TB0.084, TB0.085); cut CUT pass 2 in PR-03; CUT-AT-REPLACE in PR-05 blocks TB0.087.
- `tests/unit/onboarding-review.test.ts`: TRIM (retain replacement blocks only); cut CUT pass 2 in PR-03; CUT-AT-REPLACE in PR-05 blocks TB3.054, TB3.055; CUT-AT-REPLACE in PR-04 blocks TB3.056.
- `tests/unit/onboarding-submission.test.ts`: TRIM (keep blocks TB3.058, TB3.060, TB3.061); cut CUT pass 2 in PR-03; CUT-AT-REPLACE in PR-04 blocks TB3.059; CUT-AT-REPLACE in PR-05 blocks TB3.062.
- `tests/unit/parameter-classification-dom.test.tsx`: CUT-AT-REPLACE in PR-04.
- `tests/unit/parse-real-sheets.test.ts`: CUT-FILE in PR-03.
- `tests/unit/parse.test.ts`: KEEP-ALL.
- `tests/unit/password-policy.test.ts`: TRIM (keep blocks TB0.089, TB0.090, TB0.091); cut CUT pass 2 in PR-03; cut the named within-block exceptions below in PR-03.
- `tests/unit/password-reset-boundary.test.ts`: KEEP-ALL.
- `tests/unit/password-reset-delivery.test.ts`: KEEP-ALL.
- `tests/unit/password-reset-token-failure.test.ts`: KEEP-ALL.
- `tests/unit/password-reset.test.ts`: TRIM (keep blocks TB2.088); cut CUT pass 2 in PR-03.
- `tests/unit/password.test.ts`: KEEP-ALL.
- `tests/unit/playwright-config.test.ts`: CUT-FILE in PR-03.
- `tests/unit/rbac.test.ts`: CUT-AT-REPLACE in PR-05.
- `tests/unit/redact-real.test.ts`: CUT-FILE in PR-03.
- `tests/unit/redact.test.ts`: CUT-AT-REPLACE in PR-04.
- `tests/unit/retention.test.ts`: CUT-AT-REPLACE in PR-04.
- `tests/unit/route-guard.test.ts`: TRIM (keep blocks TB1.068); CUT-AT-REPLACE in PR-05 blocks TB1.064, TB1.065, TB1.066, TB1.067; REWIRE in PR-05.
- `tests/unit/session-version.test.ts`: TRIM (keep blocks TB3.070); cut CUT pass 2 in PR-03; cut the named within-block exceptions below in PR-03; REWIRE in PR-05 if AUTH replaces Auth.js; if AUTH replaces Auth.js, CUT-AT-REPLACE in PR-05 instead.
- `tests/unit/sheet-viewer-gate.test.ts`: KEEP-ALL.
- `tests/unit/source-config.test.ts`: TRIM (keep blocks TB0.103, TB0.104, TB0.105, TB0.106); cut CUT pass 2 in PR-03; cut the named within-block exceptions below in PR-03.
- `tests/unit/source-data-policy.test.ts`: CUT-AT-REPLACE in PR-04.
- `tests/unit/spec-artifacts-real.test.ts`: CUT-FILE in PR-03.
- `tests/unit/spec-artifacts.test.ts`: TRIM (retain replacement blocks only); cut CUT pass 2 in PR-03; CUT-AT-REPLACE in PR-04 blocks TB3.072.
- `tests/unit/staff-daily-review.test.ts`: KEEP-ALL.
- `tests/unit/storage.test.ts`: KEEP-ALL.
- `tests/unit/summaries.test.ts`: KEEP-ALL.
- `tests/unit/theme-artifact.test.ts`: KEEP-ALL.
- `tests/unit/theme.test.ts`: TRIM (keep blocks TB1.071); cut CUT pass 2 in PR-03; cut the named within-block exceptions below in PR-03.
- `tests/unit/token-crypto.test.ts`: TRIM (keep blocks TB2.091, TB2.092); cut CUT pass 2 in PR-03.
- `tests/unit/token-exposure.test.ts`: TRIM (keep blocks TB1.073); cut CUT pass 2 in PR-03; cut the named within-block exceptions below in PR-03.
- `tests/unit/token-store.test.ts`: TRIM (keep blocks TB2.094); cut CUT pass 2 in PR-03; cut the named within-block exceptions below in PR-03.
- `tests/unit/training-payload.test.ts`: TRIM (keep blocks TB0.108, TB0.109, TB0.110, TB0.111, TB0.113, TB0.114, TB0.115, TB0.116); cut VISIBLE in PR-03.
- `tests/unit/transition-diff.test.ts`: KEEP-ALL.
- `tests/unit/transition-impact.test.ts`: TRIM (keep blocks TB2.095, TB2.096, TB2.097, TB2.098); cut CUT pass 2 in PR-03.
- `tests/unit/transition-review.test.ts`: KEEP-ALL; REWIRE in PR-05.

## GUARD inventory by category

Builders should add a test only in one of these categories and only with a literal outcome and a mutation that fails the case. Do not restore deleted rendering matrices under new names.

### Calculations

23 pass-2 blocks, 57 retained cases after within-block cuts. Blocks: `TB1.011`, `TB1.068`, `TB1.071`, `TB1.074`, `TB2.072`, `TB2.085`, `TB2.090`, `TB2.097`, `TB2.098`, `TB3.006`, `TB3.008`, `TB3.074`, `TB4.024`, `TB4.025`, `TB4.030`, `TB4.031`, `TB4.039`, `TB4.041`, `TB4.048`, `TB4.067`, `TB4.071`, `TB4.072`, `TB4.079`.

### Data integrity

81 pass-2 blocks, 306 retained cases after within-block cuts. Blocks: `TB0.001`, `TB0.028`, `TB0.032`, `TB0.033`, `TB0.034`, `TB0.035`, `TB0.038`, `TB0.039`, `TB0.041`, `TB0.042`, `TB0.046`, `TB0.048`, `TB0.049`, `TB0.050`, `TB0.053`, `TB0.060`, `TB0.075`, `TB0.078`, `TB0.079`, `TB0.100`, `TB1.007`, `TB1.009`, `TB1.016`, `TB1.029`, `TB1.033`, `TB1.034`, `TB1.042`, `TB1.043`, `TB1.044`, `TB1.048`, `TB1.049`, `TB2.003`, `TB2.007`, `TB2.013`, `TB2.016`, `TB2.024`, `TB2.027`, `TB2.030`, `TB2.031`, `TB2.063`, `TB2.069`, `TB2.070`, `TB2.075`, `TB2.081`, `TB3.009`, `TB3.014`, `TB3.032`, `TB3.036`, `TB3.037`, `TB3.043`, `TB3.049`, `TB4.011`, `TB4.012`, `TB4.013`, `TB4.014`, `TB4.016`, `TB4.017`, `TB4.026`, `TB4.053`, `TB4.054`, `TB4.056`, `TB4.057`, `TB4.059`, `TB4.062`, `TB4.064`, `TB4.068`, `TB4.069`, `TB4.075`, `TB4.076`, `TB4.077`, `TB4.081`, `TB4.098`, `TB4.102`, `TB4.103`, `TB4.123`, `TB4.124`, `TB4.138`, `TB4.139`, `TB4.140`, `TB4.146`, `TB4.147`.

### Dates and timezones

70 pass-2 blocks, 202 retained cases after within-block cuts. Blocks: `TB0.004`, `TB0.005`, `TB0.006`, `TB0.010`, `TB0.013`, `TB0.027`, `TB0.037`, `TB0.068`, `TB0.069`, `TB0.070`, `TB0.071`, `TB0.072`, `TB0.073`, `TB0.074`, `TB0.084`, `TB0.085`, `TB0.106`, `TB0.110`, `TB0.111`, `TB0.114`, `TB0.115`, `TB0.116`, `TB1.030`, `TB1.039`, `TB1.040`, `TB1.075`, `TB2.074`, `TB2.076`, `TB2.077`, `TB2.080`, `TB2.083`, `TB2.084`, `TB2.095`, `TB2.096`, `TB3.020`, `TB3.021`, `TB3.022`, `TB3.023`, `TB3.024`, `TB3.025`, `TB3.026`, `TB3.028`, `TB3.029`, `TB3.030`, `TB3.031`, `TB3.035`, `TB3.073`, `TB4.015`, `TB4.018`, `TB4.019`, `TB4.021`, `TB4.042`, `TB4.046`, `TB4.047`, `TB4.052`, `TB4.055`, `TB4.060`, `TB4.061`, `TB4.065`, `TB4.070`, `TB4.073`, `TB4.094`, `TB4.127`, `TB4.136`, `TB4.137`, `TB4.141`, `TB4.142`, `TB4.143`, `TB4.144`, `TB4.145`.

### Isolation and scoped data

13 pass-2 blocks, 62 retained cases after within-block cuts. Blocks: `TB0.103`, `TB0.104`, `TB0.105`, `TB0.107`, `TB1.028`, `TB1.041`, `TB1.045`, `TB2.049`, `TB3.017`, `TB3.019`, `TB3.040`, `TB4.022`, `TB4.023`.

### Tokens and passwords

36 pass-2 blocks, 222 retained cases after within-block cuts. Blocks: `TB0.029`, `TB0.030`, `TB0.061`, `TB0.089`, `TB0.090`, `TB0.091`, `TB0.092`, `TB0.093`, `TB0.095`, `TB1.008`, `TB1.014`, `TB1.017`, `TB1.018`, `TB1.019`, `TB1.020`, `TB1.021`, `TB1.061`, `TB1.073`, `TB1.076`, `TB2.004`, `TB2.067`, `TB2.071`, `TB2.088`, `TB2.091`, `TB2.092`, `TB2.094`, `TB3.015`, `TB3.041`, `TB3.064`, `TB3.065`, `TB3.066`, `TB3.067`, `TB3.068`, `TB3.069`, `TB3.070`, `TB4.066`.

### Trust-boundary validation

60 pass-2 blocks, 334 retained cases after within-block cuts. Blocks: `TB0.007`, `TB0.014`, `TB0.015`, `TB0.018`, `TB0.019`, `TB0.021`, `TB0.022`, `TB0.023`, `TB0.024`, `TB0.055`, `TB0.076`, `TB0.081`, `TB0.101`, `TB0.108`, `TB0.109`, `TB0.113`, `TB1.038`, `TB1.051`, `TB1.052`, `TB1.054`, `TB1.055`, `TB1.056`, `TB1.057`, `TB1.058`, `TB1.060`, `TB1.077`, `TB2.021`, `TB2.026`, `TB2.038`, `TB2.043`, `TB2.044`, `TB2.048`, `TB2.051`, `TB2.058`, `TB2.059`, `TB2.060`, `TB2.061`, `TB2.062`, `TB2.086`, `TB3.027`, `TB3.033`, `TB3.038`, `TB3.039`, `TB3.042`, `TB3.045`, `TB3.046`, `TB3.047`, `TB3.048`, `TB3.050`, `TB3.052`, `TB3.053`, `TB3.058`, `TB3.060`, `TB3.061`, `TB4.020`, `TB4.074`, `TB4.095`, `TB4.101`, `TB4.104`, `TB4.105`.

The flow table adds 16 token/password GUARD cases, of which 6 reset cases are unproven in the browser. The 3 e2e support files contain no tests and remain only as execution support.

For mixed CUT-AT-REPLACE integration suites, PR-05 must preserve the independently useful tests for CAS and stale writes, pinned immutable versions, exact-one-winner races, rollback on audit failure, date boundaries, canonical tokens and tenant isolation. Replace role-specific fixtures and assertions with the decided matrix. The replacement PR must show these invariants passing before deleting the old mixed block. They are not included in the permanent GUARD total until that split exists.

## Delayed replacement and rewiring

| Replacement PR | Original pass-2 blocks | Whole files outside pass 2 | Required event |
|---|---:|---:|---|
| PR-05 | 76 | 1, client-setup-rbac | Owner-approved ROLES matrix, real new server enforcement and its one table-driven role/capability test. Extract the independent guards from mixed blocks before deletion. |
| PR-04, amendment required | 29 | 1, consent | Explicit D12 gate-removal or bypass scope added to the plan and approved. Do not infer that the current PR-04 already does this. |
| PR-W4 | 3 | 0 | Replacement or removal of the tracker cycle/health projections. |

Conditional AUTH cases are `TB0.093`, `TB1.020`, `TB1.021` and `TB3.070`. They stay GUARD on the recorded Auth.js default. If AUTH selects Better Auth, PR-05 replaces their library-specific setup/callback assertions in the same PR and preserves session revocation, inactive-account rejection, malformed-claim rejection and fail-closed lookup behavior.

GUARD blocks needing old-scope or session setup rewired are below. These are not a reason to delete a valid transaction, validation or isolation test. No new role grant may be guessed from its old fixture.

- `tests/unit/checkin-review-queue.test.ts`: REWIRE in PR-05. Blocks TB2.048, TB2.049, TB2.051.
- `tests/unit/client-setup-actions.test.ts`: REWIRE in PR-05. Blocks TB2.058, TB2.059.
- `tests/unit/client-setup-transition-actions.test.ts`: REWIRE in PR-05. Blocks TB2.060.
- `tests/unit/clients-service.test.ts`: REWIRE in PR-05. Blocks TB1.028, TB1.029, TB1.030, TB1.033, TB1.034.
- `tests/unit/coach-assignments-actions.test.ts`: REWIRE in PR-05. Blocks TB2.063.
- `tests/unit/coaching-actions.test.ts`: REWIRE in PR-05. Blocks TB3.032.
- `tests/unit/coaching-boundary.test.ts`: REWIRE in PR-05. Blocks TB1.038.
- `tests/unit/invitations.test.ts`: REWIRE in PR-05. Blocks TB1.048, TB1.049.
- `tests/unit/onboarding-actions.test.ts`: REWIRE in PR-05. Blocks TB3.041, TB3.042, TB3.043.
- `tests/unit/onboarding-assignments-actions.test.ts`: REWIRE in PR-05. Blocks TB3.045.
- `tests/unit/onboarding-assignments-boundary.test.ts`: REWIRE in PR-05. Blocks TB3.046, TB3.047, TB3.048.
- `tests/unit/onboarding-forms-boundary.test.ts`: REWIRE in PR-05. Blocks TB3.052, TB3.053.
- `tests/unit/route-guard.test.ts`: REWIRE in PR-05. Blocks TB1.068.
- `tests/unit/session-version.test.ts`: REWIRE in PR-05 if AUTH replaces Auth.js. Blocks TB3.070.
- `tests/unit/transition-review.test.ts`: REWIRE in PR-05. Blocks TB1.076, TB1.077.
- `tests/integration/p013-onboarding-assignments.test.ts`: REWIRE in PR-05. Blocks TB2.016, TB2.021.
- `tests/integration/p014-coaching-templates.test.ts`: REWIRE in PR-05. Blocks TB0.037, TB0.038, TB0.039, TB0.041, TB0.042.
- `tests/integration/p020b-template-transitions.test.ts`: REWIRE in PR-05. Blocks TB3.008, TB3.009.
- `tests/integration/p021-daily-entry.test.ts`: REWIRE in PR-05. Blocks TB1.011.
- `tests/integration/p023-onboarding-submission.test.ts`: REWIRE in PR-05. Blocks TB0.050, TB0.053, TB0.055.
- `tests/integration/p025d2-checkin-calendar.test.ts`: REWIRE in PR-05. Blocks TB2.024.
- `tests/integration/phase-3-1-invite-acceptance.test.ts`: REWIRE in PR-05. Blocks TB1.014.
- `tests/integration/s1-e-audit.test.ts`: REWIRE in PR-05. Blocks TB1.016.
- `tests/integration/s1-f2b-account-audit.test.ts`: REWIRE in PR-05. Blocks TB3.017.
- `tests/integration/s1-f2b-session-runtime.test.ts`: REWIRE in PR-05 if AUTH replaces Auth.js. Blocks TB1.020.
- `tests/integration/s1-f2b-session.test.ts`: REWIRE in PR-05 if AUTH replaces Auth.js. Blocks TB1.021.
- `tests/e2e/invite-acceptance.spec.ts`: REWIRE in PR-05. Retained GUARD flow cases only.
- `tests/e2e/password-reset.spec.ts`: REWIRE in PR-05 if AUTH changes the session implementation. Retained GUARD flow cases only.
- `tests/integration/s1-f2d-password-reset.test.ts`: REWIRE in PR-05 if AUTH replaces Auth.js. Block TB0.093 retains the password-reset and session-revocation contracts; replace only library-specific session setup/assertions.


## Pass-2 block decisions

IDs are stable references assigned in the original producer-table order. Source locations are the actual AST-derived spans at `58eb6ed`, not producer estimates. Tests and lines in these rows are gross block counts before the separately enumerated within-block exclusions. Final summary counts subtract those exclusions. Each row has exactly one final tag.

### `frontend/scripts/agent-context.test.mjs`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB4.001: context check rejects a missing required entrypoint | 114-124 | 1 | 11 | CUT pass 2 | none |
| TB4.002: context check requires ... | 131-143 | 3 | 13 | CUT pass 2 | none |
| TB4.003: context check rejects a Node engine mismatch with the npm lock | 146-159 | 1 | 14 | CUT pass 2 | none |
| TB4.004: context check rejects a changed pinned Conductor snapshot | 161-174 | 1 | 14 | CUT pass 2 | none |
| TB4.005: context check rejects a broken local reference link | 176-189 | 1 | 14 | CUT pass 2 | none |
| TB4.006: context check validates links throughout workflow context docs | 191-211 | 1 | 21 | CUT pass 2 | none |
| TB4.007: context check accepts a local link that resolves exactly to repo root | 213-229 | 1 | 17 | CUT pass 2 | none |
| TB4.008: context check rejects machine-specific path ... | 238-255 | 5 | 18 | CUT pass 2 | none |
| TB4.009: context check rejects an incomplete stage contract | 258-272 | 1 | 15 | CUT pass 2 | none |
| TB4.010: valid scoped handoff stays portable and contains no credentials | 274-311 | 1 | 38 | CUT pass 2 | none |

### `frontend/scripts/mealplan-model.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB4.011: scales mixed 100 g, one-item, and 100 mL bases without replacing database calories | 84-108 | 1 | 25 | GUARD | none |
| TB4.012: food swaps are alternatives and do not contribute to meal totals | 110-127 | 1 | 18 | GUARD | none |
| TB4.013: variant clones have fresh nested ids and independent mutable data | 129-151 | 1 | 23 | GUARD | none |
| TB4.014: archived plan snapshots retain schedule and stay independent from later edits | 153-182 | 1 | 30 | GUARD | none |
| TB4.015: manual and weekly selection honor the plan start date and ISO weekdays | 184-202 | 1 | 19 | GUARD | none |
| TB4.016: repeating rhythms honor anchors, block boundaries, month/year rollover, and browsing assignment | 204-224 | 1 | 21 | GUARD | none |
| TB4.017: repeating rhythm day arithmetic stays aligned across daylight-saving changes | 226-241 | 1 | 16 | GUARD | none |
| TB4.018: cycle schedules are archived, structurally guarded, and domain-validated | 243-285 | 1 | 43 | GUARD | none |
| TB4.019: initial plans use the selected local calendar date | 287-294 | 1 | 8 | GUARD | none |
| TB4.020: target validation rejects negative values and reversed ranges | 296-325 | 1 | 30 | GUARD | none |
| TB4.021: plan validation rejects invalid dates/times, incomplete weekly schedules, and unknown foods | 327-346 | 1 | 20 | GUARD | none |
| TB4.022: storage shape guard allows structurally sound drafts with invalid domain values | 348-361 | 1 | 14 | GUARD | none |
| TB4.023: storage shape guard rejects malformed nested portions, targets, schedules, archives, and reusable meals | 363-405 | 1 | 43 | GUARD | none |

### `frontend/scripts/mealplan-overview.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB4.024: macro energy shares use 4/4/9 and are independent of source calories | 10-23 | 1 | 14 | GUARD | none |
| TB4.025: macro energy shares return zeros when there is no macro energy | 25-30 | 1 | 6 | GUARD | none |
| TB4.026: legacy target drafts do not block saving static meal plans | 32-59 | 1 | 28 | GUARD | none |

### `frontend/src/components/coach/accent-contrast.test.mjs`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB4.027: the screenshot pink prefers white with a minimal accessible action fill | 15-25 | 1 | 11 | VISIBLE | none |
| TB4.028: pastels and bright accents retain their exact fill and dark labels | 27-39 | 1 | 13 | VISIBLE | none |
| TB4.029: dark accents use white without changing a fill that already passes | 41-49 | 1 | 9 | VISIBLE | none |
| TB4.030: white preference never requires excessive darkening or lowers text contrast | 51-90 | 1 | 40 | GUARD | none |
| TB4.031: hex normalization and fallback remain deterministic | 92-102 | 1 | 11 | GUARD | none |

### `frontend/src/components/coach/client-tracker-preview/example-client.checks.mjs`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB4.032: projects the canonical 56-day history into a cloned dashboard client | 104-155 | 1 | 52 | VISIBLE | none |

### `frontend/src/components/coach/client-tracker-preview/example-history.checks.mjs`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB4.033: creates deterministic, consecutive 56-day history ending on asOf | 108-126 | 1 | 19 | VISIBLE | none |
| TB4.034: fills each configured input type using its canonical and structured format | 128-184 | 1 | 57 | VISIBLE | none |
| TB4.035: respects custom bounds, decimals, valid configured choices, and zero | 186-244 | 1 | 59 | VISIBLE | none |
| TB4.036: uses only active fields and leaves the caller's config untouched | 246-263 | 1 | 18 | VISIBLE | none |
| TB4.037: derives every cycle day when cycle-day is configured without period-start | 265-292 | 1 | 28 | CUT-AT-REPLACE | PR-W4 |
| TB4.038: does not fabricate a choice when the configured option list is empty | 294-321 | 1 | 28 | VISIBLE | none |

### `frontend/src/components/coach/client-tracker-preview/preview-model.test.mjs`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB4.039: calorie readings, headers, means, trends and edits all use the selected energy unit | 49-78 | 1 | 30 | GUARD | none |
| TB4.040: per-field ratings do not inherit another field's word-label setting | 80-89 | 1 | 10 | VISIBLE | none |
| TB4.041: existing weight conversions remain delegated to the original tracker helpers | 91-104 | 1 | 14 | GUARD | none |

### `frontend/src/components/coach/client-tracker-preview/view-model.test.mjs`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB4.042: UTC week navigation remains Monday-first across year, leap day, and DST boundaries | 100-121 | 1 | 22 | GUARD | none |
| TB4.043: configured custom definitions retain their metadata and group order without fixed IDs | 123-167 | 1 | 45 | VISIBLE | none |
| TB4.044: disabled cycle fields are removed while ordinary and custom health fields remain | 169-197 | 1 | 29 | CUT-AT-REPLACE | PR-W4 |
| TB4.045: pinned daily summaries preserve configured order and ignore removed and duplicate IDs | 199-221 | 1 | 23 | VISIBLE | none |
| TB4.046: zero is recorded, missing values are not, and numeric weekly summaries average observed values | 223-251 | 1 | 29 | GUARD | none |
| TB4.047: weekly numeric aggregation follows each parameter's configured summary metadata | 253-355 | 1 | 103 | GUARD | none |
| TB4.048: binary choices summarize recorded yes/no answers and other structured text stays unsummarized | 357-394 | 1 | 38 | GUARD | none |
| TB4.049: cycle day derives from the latest period start on or before the selected date | 396-414 | 1 | 19 | CUT-AT-REPLACE | PR-W4 |
| TB4.050: structured text summaries format configured time, choices, context, and malformed values safely | 416-450 | 1 | 35 | VISIBLE | none |
| TB4.051: custom field units affect labels while generic custom values remain unconverted | 452-482 | 1 | 31 | VISIBLE | none |

### `frontend/src/components/coach/model.test.mjs`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB4.052: complete seed envelope validates and is independently cloned | 59-73 | 1 | 15 | GUARD | none |
| TB4.053: assignment takes an isolated configuration snapshot | 74-83 | 1 | 10 | GUARD | none |
| TB4.054: variant switches retain athlete identity, entries, plans and submissions | 84-92 | 1 | 9 | GUARD | none |
| TB4.055: Monday-first date arithmetic stays stable across month, year and DST | 93-98 | 1 | 6 | GUARD | none |
| TB4.056: recurrence merges additional requests by explicit association without duplicate IDs | 99-123 | 1 | 25 | GUARD | none |
| TB4.057: schedule changes preserve submitted history | 124-132 | 1 | 9 | GUARD | none |
| TB4.058: opening a conversation changes only unread state for that athlete | 133-142 | 1 | 10 | VISIBLE | none |
| TB4.059: feedback is atomic, linked, preserves private notes and cannot be submitted twice | 143-159 | 1 | 17 | GUARD | none |
| TB4.060: week-based instructions carry forward without rewriting earlier weeks | 160-165 | 1 | 6 | GUARD | none |
| TB4.061: optional raster logo validates, survives round-trip and preserves all collections | 166-189 | 1 | 24 | GUARD | none |
| TB4.062: invalid logo values are rejected without affecting other preferences | 190-221 | 1 | 32 | GUARD | none |
| TB4.063: optional sidebarCollapsed persists with logo/accent and all collections intact | 222-254 | 1 | 33 | VISIBLE | none |
| TB4.064: invalid sidebarCollapsed values are rejected | 255-266 | 1 | 12 | GUARD | none |

### `frontend/src/components/coach/muscle-volume.test.mjs`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB4.065: the existing sample schedule counts working sets by primary muscle per week | 31-47 | 1 | 17 | GUARD | none |
| TB4.066: different weeks and scheduled sessions remain isolated, with empty intensity safe | 49-64 | 1 | 16 | GUARD | none |
| TB4.067: unmapped sets are reported rather than assigned a fabricated muscle or silently lost | 66-84 | 1 | 19 | GUARD | none |

### `frontend/src/components/coach/plans/nutrition/model.checks.mjs`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB4.068: <whole-file> | 1-161 | 1 | 161 | GUARD | none |

### `frontend/src/components/coach/plans/training/training-model.checks.mjs`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB4.069: <whole-file> | 1-257 | 1 | 257 | GUARD | none |

### `frontend/src/components/coach/roadmap-preview.test.mjs`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB4.070: roadmap uses separate observed weeks rather than repeating a synthetic average | 95-114 | 1 | 20 | GUARD | none |
| TB4.071: adherence requires recorded values and an actual client target | 116-125 | 1 | 10 | GUARD | none |
| TB4.072: configured physical units convert actual observations and targets consistently | 127-135 | 1 | 9 | GUARD | none |
| TB4.073: nutrition targets are absent before an active plan's start date | 137-150 | 1 | 14 | GUARD | none |

### `frontend/src/components/coach/template-setup.test.mjs`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB4.074: one active configuration retains legacy configurations without mutating the source | 45-57 | 1 | 13 | GUARD | none |
| TB4.075: a client keeps the configuration actually assigned, including archived legacy selections | 59-71 | 1 | 13 | GUARD | none |
| TB4.076: workspace normalization preserves history, plans, messages, preferences and independent drafts | 73-122 | 1 | 50 | GUARD | none |
| TB4.077: explicit phase and habit choices survive normalization and serialization | 124-134 | 1 | 11 | GUARD | none |

### `frontend/src/components/coach/tracker-setup.checks.mjs`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB4.078: nutrition and body measurement fields are selectable once under meaningful categories | 67-85 | 1 | 19 | CUT pass 2 | none |
| TB4.079: daily overview preserves legacy summaries without changing check-in configuration | 87-100 | 1 | 14 | GUARD | none |
| TB4.080: explicit overview supports empty, ordering, ratings and sanitizes removed, hidden, duplicate fields | 102-133 | 1 | 32 | VISIBLE | none |
| TB4.081: overview settings survive persistence and isolated assignment snapshots | 135-160 | 1 | 26 | GUARD | none |

### `frontend/src/components/ethereal/builder/coaching-refinement.test.mjs`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB4.082: phase progress remains readable at all five widget sizes | 57-73 | 1 | 17 | VISIBLE | none |
| TB4.083: expanded phase details use published facts and cap milestones | 75-95 | 1 | 21 | VISIBLE | none |
| TB4.084: week glance uses all selected metrics and adds published context when it fits | 97-116 | 1 | 20 | VISIBLE | none |
| TB4.085: check-in status focuses on scheduled dates and client submissions | 118-126 | 1 | 9 | VISIBLE | none |
| TB4.086: habit summaries keep short cards useful without a single-row tease | 128-138 | 1 | 11 | VISIBLE | none |
| TB4.087: phase milestone card includes focus and the published milestone at four rows | 140-144 | 1 | 5 | VISIBLE | none |
| TB4.088: habit consistency keeps a centered compact summary and uses a Monday-aligned weekly graph when wide | 146-243 | 1 | 98 | VISIBLE | none |
| TB4.089: compact canvas span keeps summary; four columns show an unlabeled weekly graph | 245-274 | 1 | 30 | VISIBLE | none |
| TB4.090: Today's habits contribution presentation keeps its six-week calendar | 276-284 | 1 | 9 | VISIBLE | none |
| TB4.091: Today's habits contribution graph uses its selected history window | 286-298 | 1 | 13 | VISIBLE | none |
| TB4.092: check-in date emblem has no rounded rectangle | 300-311 | 1 | 12 | CUT pass 2 | none |
| TB4.093: habit and task completion marks match the Foundation checkbox | 313-322 | 1 | 10 | CUT pass 2 | none |

### `frontend/src/components/ethereal/builder/expansion.test.mjs`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB4.094: weekly source averages include zero, count unique logged days and stay coherent | 50-72 | 1 | 23 | GUARD | none |
| TB4.095: upgrading saved records preserves intentional empty sources and completions | 74-87 | 1 | 14 | GUARD | none |
| TB4.096: sleep settings change the instance summary, period and display unit | 89-109 | 1 | 21 | VISIBLE | none |
| TB4.097: single-nutrient comparison follows the active option and keeps missing distinct | 111-159 | 1 | 49 | VISIBLE | none |
| TB4.098: habit consistency changes when the shared schedule completion changes | 161-172 | 1 | 12 | GUARD | none |
| TB4.099: phase progress presents phase, week and published context without a percentage headline | 174-187 | 1 | 14 | VISIBLE | none |

### `frontend/src/components/ethereal/builder/fixture-history.test.mjs`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB4.100: the fictional fixture has a full year of scheduled habit and macro history | 11-55 | 1 | 45 | CUT pass 2 | none |
| TB4.101: version two saved samples gain history without losing edits or intentional empty sources | 57-130 | 1 | 74 | GUARD | none |
| TB4.102: edited historical plans survive sample upgrades unchanged | 132-148 | 1 | 17 | GUARD | none |
| TB4.103: version three records missing the selected option's current-day nutrition are repaired | 150-172 | 1 | 23 | GUARD | none |
| TB4.104: unmarked edited nutrition sources gain older and current keys while existing gaps and values stay intact | 174-213 | 1 | 40 | GUARD | none |

### `frontend/src/components/ethereal/builder/refinement.test.mjs`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB4.105: denser histories retain gaps, zero and latest values without replacing edited sources | 49-71 | 1 | 23 | GUARD | none |
| TB4.106: all line-chart families expose per-instance ranges and year changes data coverage | 72-86 | 1 | 15 | VISIBLE | none |
| TB4.107: daily macros share one format and history supports both graphs for every nutrient | 87-107 | 1 | 21 | VISIBLE | none |
| TB4.108: steps include the source-record target while missing stays distinct from zero | 108-113 | 1 | 6 | VISIBLE | none |

### `frontend/src/components/ethereal/builder/smooth-trend.test.mjs`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB4.109: bridges unlogged dates, exposes them to inspection, and keeps markers hover-only | 32-66 | 1 | 35 | VISIBLE | none |
| TB4.110: renders a dated target range when every intake entry is missing | 68-86 | 1 | 19 | VISIBLE | none |
| TB4.111: target bands close with a valid line into the lower edge | 88-109 | 1 | 22 | VISIBLE | none |

### `frontend/src/components/ethereal/builder/widgets.test.mjs`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB4.112: every widget's title opens its corresponding local source record detail | 84-124 | 1 | 41 | VISIBLE | none |
| TB4.113: all twenty catalogue entries render all five measured content states | 126-160 | 1 | 35 | VISIBLE | none |
| TB4.114: unassigned and empty fixture sources render missing states without fabricated values | 162-182 | 1 | 21 | CUT pass 2 | none |
| TB4.115: instance periods filter data without changing another instance | 184-209 | 1 | 26 | VISIBLE | none |
| TB4.116: custom dimensions preserve source meaning, setting, and eligible units | 211-225 | 1 | 15 | VISIBLE | none |
| TB4.117: habit consistency preserves source statuses in its summary, strip, and calendar | 227-265 | 1 | 39 | VISIBLE | none |
| TB4.118: habit consistency matches the 3×2 summary and 4×2/4×3 strip layouts | 267-301 | 1 | 35 | VISIBLE | none |
| TB4.119: weekly focus, selected measures, and phase progress use dated source facts | 303-351 | 1 | 49 | VISIBLE | none |
| TB4.120: missing observations remain distinct from recorded zero | 353-364 | 1 | 12 | VISIBLE | none |
| TB4.121: shared habit updates reach duplicate renderings and do not erase assignments | 366-386 | 1 | 21 | VISIBLE | none |
| TB4.122: habit completion controls mutate data only in client preview | 388-410 | 1 | 23 | VISIBLE | none |
| TB4.123: habit contribution graph uses scheduled history and keeps today unlogged distinct | 412-503 | 1 | 92 | GUARD | none |
| TB4.124: habit fixture upgrades leave current and already recorded completions intact | 505-532 | 1 | 28 | GUARD | none |
| TB4.125: nutrition preserves missing amounts and fixed, range and minimum targets | 534-561 | 1 | 28 | VISIBLE | none |
| TB4.126: metric summaries remain eligible and presentation titles retain source units | 563-578 | 1 | 16 | VISIBLE | none |
| TB4.127: weight conversion and named exercise metrics preserve dated observations | 580-608 | 1 | 29 | GUARD | none |
| TB4.128: tall workout cards pair applicable prescriptions with the next scheduled session | 610-620 | 1 | 11 | VISIBLE | none |
| TB4.129: workout sizes keep one compact prescription and match expanded logbook evidence | 622-631 | 1 | 10 | VISIBLE | none |
| TB4.130: step cards use dated columns and retain recorded zero values | 633-644 | 1 | 12 | VISIBLE | none |
| TB4.131: smooth plots use dated x positions, bridge display gaps and retain missing observations | 646-689 | 1 | 44 | VISIBLE | none |
| TB4.132: nutrition compares one selected day with explicit logged and target values | 691-734 | 1 | 44 | VISIBLE | none |
| TB4.133: recovery scales, drafts, due windows, and published feedback retain their semantics | 736-817 | 1 | 82 | VISIBLE | none |
| TB4.134: client task completion updates the shared assigned task record | 819-885 | 1 | 67 | VISIBLE | none |
| TB4.135: scheduled habit fields and custom link labels preserve source identity | 887-926 | 1 | 40 | VISIBLE | none |

### `frontend/src/components/ethereal/client-tracker/model.test.mjs`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB4.136: weekly averages ignore missing readings and include a real zero | 15-32 | 1 | 18 | GUARD | none |
| TB4.137: weekly averages and totals use only the week's recorded values | 34-57 | 1 | 24 | GUARD | none |
| TB4.138: unit preferences convert canonical weight, length, and fluid values for display | 59-80 | 1 | 22 | GUARD | none |
| TB4.139: rating display and distributions follow the selected numeric scale | 82-98 | 1 | 17 | GUARD | none |
| TB4.140: word ratings retain their meaning and use a labelled distribution | 100-124 | 1 | 25 | GUARD | none |
| TB4.141: latest summaries select the most recent date regardless of input order | 126-135 | 1 | 10 | GUARD | none |
| TB4.142: week ledger means override latest, total, and distribution preferences | 137-174 | 1 | 38 | GUARD | none |
| TB4.143: week ledger means convert units and exclude invalid readings | 176-194 | 1 | 19 | GUARD | none |
| TB4.144: weekly deltas compare observed means in displayed units and omit unavailable comparisons | 196-239 | 1 | 44 | GUARD | none |
| TB4.145: weight deltas use the closest earlier recorded reading across missing days and week boundaries | 241-274 | 1 | 34 | GUARD | none |

### `frontend/src/components/ethereal/clients/model.test.mjs`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB4.146: each client collection is a deep independent copy of the fixtures | 40-55 | 1 | 16 | GUARD | none |
| TB4.147: overdue task totals match each client's actual task statuses | 57-65 | 1 | 9 | GUARD | none |
| TB4.148: open and overdue client tasks need attention even with clear roster counters | 67-83 | 1 | 17 | VISIBLE | none |
| TB4.149: awaiting check-in history is the source of truth instead of a stale status label | 85-115 | 1 | 31 | VISIBLE | none |
| TB4.150: completed client tasks and incomplete coach tasks do not create attention | 117-131 | 1 | 15 | VISIBLE | none |
| TB4.151: client dates format consistently and malformed dates remain unchanged | 133-138 | 1 | 6 | VISIBLE | none |

### `tests/integration/checkin-feedback-i1.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB2.022: CHECK-IN-FEEDBACK-I1 (real PG) | 42-1052 | 21 | 1011 | CUT-AT-REPLACE | PR-05 |

### `tests/integration/checkin-overview-i1.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB1.001: CHECK-IN-OVERVIEW-I1 review queue (real PG) | 45-685 | 18 | 641 | CUT-AT-REPLACE | PR-05 |

### `tests/integration/checkin-recurrence-i1.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB3.001: CHECK-IN-RECURRENCE-I1 (real PG) | 61-1193 | 18 | 1133 | CUT-AT-REPLACE | PR-05 |

### `tests/integration/client-tasks.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB3.002: CLIENT-TASKS-I1 (real PG) | 23-795 | 14 | 773 | CUT-AT-REPLACE | PR-05 |

### `tests/integration/dashboard-layout.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB3.003: DASHBOARD-I1 layout persistence (real PG) | 26-446 | 7 | 421 | CUT-AT-REPLACE | PR-05 |
| TB3.004: DASHBOARD-I1 hardening (I1-R2) | 448-662 | 3 | 215 | CUT-AT-REPLACE | PR-05 |

### `tests/integration/habits-schema.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB0.001: HABITS-I1 schema (real PG) | 14-272 | 5 | 259 | GUARD | none |

### `tests/integration/habits.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB1.002: HABITS-I1 (real PG) | 28-1919 | 35 | 1892 | CUT-AT-REPLACE | PR-05 |

### `tests/integration/i4-next-checkin.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB0.002: FI-I4 next-Check-In selection (real PG) | 32-375 | 8 | 344 | CUT-AT-REPLACE | PR-05 |

### `tests/integration/mealplan-i1.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB3.005: MEAL-PLAN-I1 (real PG) | 44-1108 | 19 | 1065 | CUT-AT-REPLACE | PR-05 |

### `tests/integration/p008-onboarding-actions.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB2.025: P-008 onboarding actions (real PG) | 28-338 | 12 | 311 | CUT-AT-REPLACE | PR-05 |

### `tests/integration/p008-onboarding-forms.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB0.003: P-008 onboarding forms (real PG) | 33-2623 | 46 | 2591 | CUT-AT-REPLACE | PR-05 |

### `tests/integration/p010-client-roster.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB2.002: P-010 client roster (real PG) | 33-359 | 9 | 327 | CUT-AT-REPLACE | PR-05 |

### `tests/integration/p013-onboarding-assignments.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB2.013: schema constraints | 136-239 | 3 | 104 | GUARD | none |
| TB2.014: authorization | 241-434 | 7 | 194 | CUT-AT-REPLACE | PR-05 |
| TB2.015: eligibility | 436-485 | 2 | 50 | CUT-AT-REPLACE | PR-05 |
| TB2.016: create / replace / cancel lifecycle | 487-858 | 12 | 372 | GUARD | none |
| TB2.017: authorization order and non-disclosure (P2-1) | 860-1044 | 2 | 185 | CUT-AT-REPLACE | PR-05 |
| TB2.018: form-picker authorization (P2-3) | 1046-1096 | 1 | 51 | CUT-AT-REPLACE | PR-05 |
| TB2.019: platform-admin dual role (P3) | 1098-1117 | 1 | 20 | CUT-AT-REPLACE | PR-05 |
| TB2.020: assistant assigned read scope (P3) | 1119-1157 | 1 | 39 | CUT-AT-REPLACE | PR-05 |
| TB2.021: feature gate | 1159-1184 | 1 | 26 | GUARD | none |

### `tests/integration/p014-coaching-templates.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB0.035: schema constraints | 114-246 | 4 | 133 | GUARD | none |
| TB0.036: authorization | 248-335 | 6 | 88 | CUT-AT-REPLACE | PR-05 |
| TB0.037: parameter lifecycle | 337-392 | 3 | 56 | GUARD | none |
| TB0.038: template lifecycle and publish protocol | 394-720 | 8 | 327 | GUARD | none |
| TB0.039: concurrency | 722-863 | 3 | 142 | GUARD | none |
| TB0.040: audit integrity | 865-908 | 1 | 44 | CUT pass 2 | none |
| TB0.041: parameter list pagination | 910-962 | 2 | 53 | GUARD | none |
| TB0.042: option tombstones | 964-1009 | 1 | 46 | GUARD | none |

### `tests/integration/p016-client-setup.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB2.007: schema constraints | 172-351 | 3 | 180 | GUARD | none |
| TB2.008: authorization | 353-543 | 7 | 191 | CUT-AT-REPLACE | PR-05 |
| TB2.009: eligibility | 545-592 | 2 | 48 | CUT-AT-REPLACE | PR-05 |
| TB2.010: create / cancel lifecycle | 594-1106 | 17 | 513 | CUT-AT-REPLACE | PR-05 |
| TB2.011: P-016-R2 positional selection + fingerprint resolution | 1108-1608 | 13 | 501 | CUT-AT-REPLACE | PR-05 |

### `tests/integration/p020a-parameter-classification.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB1.003: schema + migration | 122-131 | 1 | 10 | CUT-AT-REPLACE | PR-04 |
| TB1.004: classifyParameter authority + transitions | 133-328 | 11 | 196 | CUT-AT-REPLACE | PR-04 |
| TB1.005: classify vs archive ,  genuine overlap | 445-565 | 2 | 121 | CUT-AT-REPLACE | PR-04 |
| TB1.006: classify vs publish race + snapshot persistence | 567-876 | 4 | 310 | CUT-AT-REPLACE | PR-04 |
| TB1.007: universal duplicate-parameter publish rejection (#64) | 878-941 | 1 | 64 | GUARD | none |
| TB1.008: positional selection + fingerprint (in-transaction) | 943-1018 | 2 | 76 | GUARD | none |

### `tests/integration/p020b-template-transitions.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB3.006: migration + lineage invariants | 308-546 | 5 | 239 | GUARD | none |
| TB3.007: review + execute | 550-1073 | 10 | 524 | CUT-AT-REPLACE | PR-05 |
| TB3.008: synthetic provider behavior | 1077-1261 | 2 | 185 | GUARD | none |
| TB3.009: concurrency + atomicity | 1363-1479 | 2 | 117 | GUARD | none |
| TB3.010: feature gate | 1483-1528 | 1 | 46 | CUT pass 2 | none |

### `tests/integration/p021-daily-entry.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB1.009: schema constraints | 237-437 | 5 | 201 | GUARD | none |
| TB1.010: save lifecycle | 454-1006 | 13 | 553 | CUT-AT-REPLACE | PR-05 |
| TB1.011: daily-entry C2 impact provider | 1010-1069 | 1 | 60 | GUARD | none |

### `tests/integration/p022-staff-daily-review.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB0.043: list authorization | 340-467 | 11 | 128 | CUT-AT-REPLACE | PR-05 |
| TB0.044: list consent and paging | 471-572 | 4 | 102 | CUT-AT-REPLACE | PR-04 |
| TB0.045: detail authorization and minimization | 576-764 | 8 | 189 | CUT-AT-REPLACE | PR-05 |
| TB0.046: detail audit atomicity | 768-840 | 3 | 73 | GUARD | none |
| TB0.047: serialization races | 846-1029 | 5 | 184 | CUT-AT-REPLACE | PR-05 |
| TB0.048: query bounds | 1033-1064 | 1 | 32 | GUARD | none |

### `tests/integration/p023-onboarding-submission.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB0.049: migration contract | 242-354 | 3 | 113 | GUARD | none |
| TB0.050: submit transaction | 356-547 | 5 | 192 | GUARD | none |
| TB0.051: authorization + non-disclosure | 549-645 | 3 | 97 | CUT-AT-REPLACE | PR-05 |
| TB0.052: consent boundary | 647-700 | 3 | 54 | CUT-AT-REPLACE | PR-04 |
| TB0.053: pinned-version integrity | 702-745 | 1 | 44 | GUARD | none |
| TB0.054: own reads | 747-807 | 2 | 61 | VISIBLE | none |
| TB0.055: boundary gate | 809-841 | 1 | 33 | GUARD | none |
| TB0.056: repair A ,  trusted dev/test consent boundary (real path) | 960-1032 | 4 | 73 | CUT-AT-REPLACE | PR-04 |
| TB0.057: repair B ,  consent precedes answer materialization | 1034-1083 | 2 | 50 | CUT-AT-REPLACE | PR-04 |
| TB0.058: repair C ,  P2002 fully-authorized replay | 1085-1252 | 7 | 168 | CUT-AT-REPLACE | PR-05 |

### `tests/integration/p024-onboarding-review.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB3.011: P-024 staff onboarding review (real PG) | 120-1061 | 23 | 942 | CUT-AT-REPLACE | PR-05 |

### `tests/integration/p025a-checkin-actions.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB3.012: P-025-A checkin actions (real PG) | 29-288 | 8 | 260 | CUT-AT-REPLACE | PR-05 |

### `tests/integration/p025a-checkin-forms.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB3.013: P-025-A check-in form service (real PG) | 26-712 | 15 | 687 | CUT-AT-REPLACE | PR-05 |

### `tests/integration/p025a-checkin-schema.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB3.014: P-025-A schema ,  tables/columns/constraints | 15-266 | 8 | 252 | GUARD | none |

### `tests/integration/p025b-checkin-instances.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB1.012: P-025-B check-in instances (real PG) | 41-1301 | 27 | 1261 | CUT-AT-REPLACE | PR-05 |

### `tests/integration/p025c-checkin-review.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB1.013: P-025-C check-in staff review (real PG) | 38-1155 | 19 | 1118 | CUT-AT-REPLACE | PR-05 |

### `tests/integration/p025d2-checkin-calendar.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB2.023: P-025-D2 calendar list (real PG) | 42-539 | 10 | 498 | CUT-AT-REPLACE | PR-05 |
| TB2.024: P-025-D2 R2 truncation signal (real PG) | 543-763 | 4 | 221 | GUARD | none |

### `tests/integration/p025d6-checkin-tracker-context.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB2.006: P-025-D6 tracker context (real PG) | 55-1106 | 35 | 1052 | CUT-AT-REPLACE | PR-05 |

### `tests/integration/phase-1-1-daily-tracker-guard.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB0.059: Phase 1.1 Daily Tracker route guard (real PG) | 21-133 | 2 | 113 | CUT-AT-REPLACE | PR-05 |

### `tests/integration/phase-2-1-nutrition-import.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB3.015: Phase 2.1 Nutrition catalog import (real PG) | 76-352 | 7 | 277 | GUARD | none |

### `tests/integration/phase-2-2-exercise-import.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB0.060: Phase 2.2 Exercise catalog import (real PG) | 80-417 | 8 | 338 | GUARD | none |

### `tests/integration/phase-3-1-invite-acceptance.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB1.014: Phase 3.1 invite acceptance boundary (real PG) | 16-328 | 6 | 313 | GUARD | none |

### `tests/integration/phase-3-2-password-reset.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB0.061: Phase 3.2 password-reset boundary (real PG) | 28-332 | 6 | 305 | GUARD | none |

### `tests/integration/s1-a-identity.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB2.003: S1-A identity & tenancy (real PostgreSQL) | 38-391 | 11 | 354 | GUARD | none |
| TB2.004: S1-A migration preserves existing User and authentication | 393-493 | 2 | 101 | GUARD | none |

### `tests/integration/s1-b-authorization.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB3.016: S1-B authorization (real PostgreSQL) | 20-454 | 13 | 435 | CUT-AT-REPLACE | PR-05 |

### `tests/integration/s1-c-client-assignments.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB1.015: S1-C client ownership & assignments | 26-619 | 9 | 594 | CUT-AT-REPLACE | PR-05 |

### `tests/integration/s1-d-consent.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB2.005: S1-D versioned consent | 38-680 | 13 | 643 | CUT-AT-REPLACE | PR-04 |

### `tests/integration/s1-e-audit.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB1.016: S1-E metadata-only audit | 34-751 | 14 | 718 | GUARD | none |

### `tests/integration/s1-f1-token-schema.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB1.017: S1-F1 access_token + session_version (real PostgreSQL) | 51-426 | 24 | 376 | GUARD | none |
| TB1.018: S1-F1 migration applies on top of existing data | 428-504 | 2 | 77 | GUARD | none |

### `tests/integration/s1-f2a-token-store.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB1.019: S1-F2A token store (real PostgreSQL) | 41-546 | 14 | 506 | GUARD | none |

### `tests/integration/s1-f2b-account-audit.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB3.017: S1-F2B account-scoped audit (real PostgreSQL) | 32-373 | 11 | 342 | GUARD | none |

### `tests/integration/s1-f2b-session-runtime.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB1.020: S1-F2B session revocation through the real Auth.js pipeline | 65-203 | 7 | 139 | GUARD | none |

### `tests/integration/s1-f2b-session.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB1.021: S1-F2B session version (real PostgreSQL) | 45-185 | 6 | 141 | GUARD | none |

### `tests/integration/s1-f2b-token-cleanup.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB0.092: S1-F2B token cleanup (real PostgreSQL) | 31-240 | 5 | 210 | GUARD | none |

### `tests/integration/s1-f2c-invitations.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB3.018: S1-F2C invitation orchestration (real PG) | 26-1462 | 32 | 1437 | CUT-AT-REPLACE | PR-05 |

### `tests/integration/s1-f2d-password-reset.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB0.093: S1-F2D password-reset orchestration (real PG) | 33-682 | 18 | 650 | GUARD | none |

### `tests/integration/s1-g-export.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB1.022: S1-G export | 18-356 | 9 | 339 | CUT-AT-REPLACE | PR-05 |

### `tests/integration/s1-h-route-guard.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB0.094: S1-H route guard (real PG) | 27-216 | 6 | 190 | CUT-AT-REPLACE | PR-05 |

### `tests/integration/solo-coach-i1.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB2.001: SOLO-COACH-I1 owner-as-coach (real PG) | 28-299 | 6 | 272 | CUT-AT-REPLACE | PR-05 |

### `tests/integration/teardown-sweep.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB3.019: fixture sweep (real PG) | 15-167 | 1 | 153 | GUARD | none |

### `tests/integration/training-i1a.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB2.012: TRAINING-I1A (real PG) | 94-1441 | 20 | 1348 | CUT-AT-REPLACE | PR-05 |

### `tests/unit/audit.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB2.026: sanitizeAuditMeta | 30-211 | 43 | 182 | GUARD | none |
| TB2.027: buildAuditEvent | 213-270 | 5 | 58 | GUARD | none |
| TB2.028: writeAuditEvent | 272-306 | 2 | 35 | CUT pass 2 | none |
| TB2.029: listAuditEvents | 308-374 | 2 | 67 | CUT-AT-REPLACE | PR-05 |
| TB2.030: listAccountAuditEvents (S1-F2B internal primitive) | 376-416 | 1 | 41 | GUARD | none |
| TB2.031: buildAccountAuditEvent (S1-F2B) | 418-696 | 21 | 279 | GUARD | none |

### `tests/unit/catalog.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB2.032: searchFoods | 101-120 | 3 | 20 | VISIBLE | none |
| TB2.033: foodCategories | 122-130 | 1 | 9 | VISIBLE | none |
| TB2.034: searchExercises | 132-149 | 2 | 18 | VISIBLE | none |
| TB2.035: exerciseFacets | 151-158 | 1 | 8 | VISIBLE | none |
| TB2.036: toSparseGrid | 172-220 | 4 | 49 | CUT-AT-REPLACE | PR-04 |
| TB2.037: sheetDisplayName | 222-229 | 1 | 8 | VISIBLE | none |

### `tests/unit/checkin-calendar.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB0.004: parseCheckInCalendarRange | 18-78 | 5 | 61 | GUARD | none |
| TB0.005: checkInCalendarDayKey | 80-100 | 2 | 21 | GUARD | none |
| TB0.006: checkInCalendarMonthCells | 102-125 | 2 | 24 | GUARD | none |

### `tests/unit/checkin-feedback.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB1.023: CHECK-IN-FEEDBACK-I1 RBAC ,  checkinFeedback | 23-56 | 4 | 34 | CUT-AT-REPLACE | PR-05 |
| TB1.024: CHECK-IN-FEEDBACK-I1 deny-set + audit registry | 58-66 | 1 | 9 | CUT pass 2 | none |
| TB1.025: CHECK-IN-FEEDBACK-I1 dual-role PLATFORM_ADMIN denial | 68-188 | 5 | 121 | CUT-AT-REPLACE | PR-05 |
| TB1.026: CHECK-IN-FEEDBACK-I1 boundary exports | 190-195 | 1 | 6 | CUT pass 2 | none |

### `tests/unit/checkin-forms-boundary.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB2.038: P-025-A boundary ,  raw payload bound before parse | 25-101 | 3 | 77 | GUARD | none |
| TB2.039: P-025-A boundary ,  closed error vocabulary maps to safe copy | 103-153 | 1 | 51 | VISIBLE | none |

### `tests/unit/checkin-forms.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB0.007: P-025-A shared server-only check-in feature resolver | 27-89 | 4 | 63 | GUARD | none |
| TB0.008: P-025-A RBAC ,  checkinFormDefinitions | 91-125 | 3 | 35 | CUT-AT-REPLACE | PR-05 |
| TB0.009: P-025-A dual-role PLATFORM_ADMIN denial | 132-228 | 5 | 97 | CUT-AT-REPLACE | PR-05 |
| TB0.010: P-025-A validateCheckInDefinition | 261-597 | 12 | 337 | GUARD | none |
| TB0.011: P-025-A seam ,  app never imports the service directly | 599-617 | 1 | 19 | CUT pass 2 | none |

### `tests/unit/checkin-instances.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB2.040: P-025-B ,  checkinInstances RBAC matrix | 22-44 | 2 | 23 | CUT-AT-REPLACE | PR-05 |
| TB2.041: P-025-B ,  platform-admin deny-set completeness | 46-112 | 2 | 67 | CUT-AT-REPLACE | PR-05 |
| TB2.042: P-025-B ,  derived lifecycle projector | 116-222 | 2 | 107 | VISIBLE | none |
| TB2.043: P-025-B ,  dueAt and payload bounds | 226-249 | 2 | 24 | GUARD | none |
| TB2.044: P-025-B ,  answer canonicalization (typed, definition-bound) | 309-464 | 14 | 156 | GUARD | none |
| TB2.045: P-025-B ,  consent policy resolver | 468-501 | 1 | 34 | CUT-AT-REPLACE | PR-04 |
| TB2.046: P-025-B ,  closed error vocabulary | 505-515 | 1 | 11 | CUT pass 2 | none |
| TB2.047: P-025-B ,  boundary seam exists for app-facing calls | 519-528 | 1 | 10 | CUT pass 2 | none |

### `tests/unit/checkin-review-queue.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB2.048: CHECK-IN-OVERVIEW-I1 ,  review-queue cursor codec | 17-45 | 9 | 29 | GUARD | none |
| TB2.049: CHECK-IN-OVERVIEW-I1 ,  queue WHERE builder | 49-104 | 3 | 56 | GUARD | none |
| TB2.050: CHECK-IN-OVERVIEW-I1 ,  derived canReview | 108-126 | 8 | 19 | CUT-AT-REPLACE | PR-05 |
| TB2.051: CHECK-IN-OVERVIEW-I1 ,  deep-link param parser | 130-167 | 6 | 38 | GUARD | none |
| TB2.052: CHECK-IN-OVERVIEW-I1 ,  exports | 171-183 | 2 | 13 | CUT pass 2 | none |

### `tests/unit/checkin-review.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB2.053: P-025-C ,  REVIEWED in the derived projector | 13-68 | 2 | 56 | VISIBLE | none |
| TB2.054: P-025-C ,  audit resource union | 72-82 | 1 | 11 | CUT pass 2 | none |
| TB2.055: P-025-C ,  service exports | 86-93 | 1 | 8 | CUT pass 2 | none |
| TB2.056: P-025-C ,  boundary exports | 97-104 | 1 | 8 | CUT pass 2 | none |
| TB2.057: P-025-C ,  checkinsCoachReviews capability split | 108-135 | 1 | 28 | CUT-AT-REPLACE | PR-05 |

### `tests/unit/checkin-schedule-timezone.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB3.020: CHECK-IN-RECURRENCE-I1 ,  isValidIanaTimeZone | 21-49 | 2 | 29 | GUARD | none |
| TB3.021: CHECK-IN-RECURRENCE-I1 ,  localDateInZone | 53-65 | 2 | 13 | GUARD | none |
| TB3.022: CHECK-IN-RECURRENCE-I1 ,  resolveLocalInstant normal cases | 69-104 | 3 | 36 | GUARD | none |
| TB3.023: CHECK-IN-RECURRENCE-I1 ,  fold chooses the earlier instant | 108-124 | 2 | 17 | GUARD | none |
| TB3.024: CHECK-IN-RECURRENCE-I1 ,  gap  to  first valid minute (crossing detection) | 128-175 | 5 | 48 | GUARD | none |
| TB3.025: CHECK-IN-RECURRENCE-I1 ,  whole-day skips are unrepresentable | 179-188 | 1 | 10 | GUARD | none |
| TB3.026: CHECK-IN-RECURRENCE-I1 ,  deterministic rejection | 192-221 | 3 | 30 | GUARD | none |

### `tests/unit/checkin-schedules.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB3.027: CHECK-IN-RECURRENCE-I1 ,  field validators | 18-58 | 3 | 41 | GUARD | none |
| TB3.028: CHECK-IN-RECURRENCE-I1 ,  enumerateRuleOccurrenceDates | 62-141 | 5 | 80 | GUARD | none |

### `tests/unit/checkin-tracker-context.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB0.012: reconcileTrackerContextScopes | 12-45 | 18 | 34 | CUT-AT-REPLACE | PR-05 |
| TB0.013: declared-date contract (shared parser) | 47-78 | 5 | 32 | GUARD | none |

### `tests/unit/client-roster.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB0.014: parseRosterQuery ,  cursor `c` | 24-56 | 6 | 33 | GUARD | none |
| TB0.015: parseRosterQuery ,  history `p` | 58-95 | 7 | 38 | GUARD | none |
| TB0.016: roster pagination hrefs | 97-145 | 7 | 49 | VISIBLE | none |
| TB0.017: fixed page size | 147-153 | 1 | 7 | CUT pass 2 | none |

### `tests/unit/client-setup-actions.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB2.058: P-016 server actions ,  flag-off ordering | 49-102 | 3 | 54 | GUARD | none |
| TB2.059: P-016 server actions ,  flag-on validation | 104-189 | 9 | 86 | GUARD | none |

### `tests/unit/client-setup-boundary.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB0.018: P-016 boundary ,  flag-off fails before any input work | 73-124 | 4 | 52 | GUARD | none |
| TB0.019: P-016 boundary ,  input binding | 126-171 | 1 | 46 | GUARD | none |
| TB0.020: P-016 boundary ,  error mapping | 173-225 | 2 | 53 | VISIBLE | none |

### `tests/unit/client-setup-nav.dom.test.tsx`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB1.027: P-016 workspace nav ,  Client Setup entry | 31-66 | 8 | 36 | VISIBLE | none |

### `tests/unit/client-setup-selection.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB0.021: P-016-R2 boundary ,  serialized choices carry no internal ids | 82-150 | 2 | 69 | GUARD | none |
| TB0.022: P-016-R2 boundary ,  positional assign resolution | 152-247 | 7 | 96 | GUARD | none |
| TB0.023: P-016-R2 boundary ,  positional cancel resolution | 249-321 | 6 | 73 | GUARD | none |

### `tests/unit/client-setup-transition-actions.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB2.060: P-020B transition actions ,  flag ordering | 71-126 | 24 | 56 | GUARD | none |

### `tests/unit/client-setup.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB0.024: P-016 client-setup dev gate | 15-26 | 11 | 12 | GUARD | none |
| TB0.025: P-016 client-setup contract constants | 28-41 | 2 | 14 | CUT pass 2 | none |

### `tests/unit/client-tasks-boundary.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB2.061: client-tasks boundary ,  gate first | 62-71 | 1 | 10 | GUARD | none |
| TB2.062: client-tasks boundary ,  error vocabulary | 73-146 | 11 | 74 | GUARD | none |

### `tests/unit/client-tasks-date.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB3.029: parseTaskDueDate | 17-57 | 4 | 41 | GUARD | none |
| TB3.030: server-UTC today + due-state (P3-D) | 59-75 | 2 | 17 | GUARD | none |
| TB3.031: timezone-independent display | 77-101 | 2 | 25 | GUARD | none |

### `tests/unit/clients-service.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB1.028: buildClientProfileWhere | 84-101 | 1 | 18 | GUARD | none |
| TB1.029: normalizeLimit | 103-116 | 2 | 14 | GUARD | none |
| TB1.030: validateName | 118-125 | 1 | 8 | GUARD | none |
| TB1.031: coachTargetRoleIsEligible | 127-142 | 1 | 16 | CUT-AT-REPLACE | PR-05 |
| TB1.032: authorizeCollection | 144-184 | 2 | 41 | CUT-AT-REPLACE | PR-05 |
| TB1.033: listAccessibleClientProfiles | 186-213 | 1 | 28 | GUARD | none |
| TB1.034: createClientProfile | 215-231 | 1 | 17 | GUARD | none |
| TB1.035: updateClientProfileName | 233-277 | 2 | 45 | CUT-AT-REPLACE | PR-05 |
| TB1.036: assignCoach | 279-350 | 2 | 72 | CUT-AT-REPLACE | PR-05 |
| TB1.037: structural errors | 352-361 | 1 | 10 | CUT pass 2 | none |

### `tests/unit/coach-assignments-actions.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB2.063: SOLO-COACH-I1 coach-assignment actions | 60-172 | 9 | 113 | GUARD | none |

### `tests/unit/coaching-actions.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB3.032: P-014 server actions ,  flag-off ordering | 61-132 | 8 | 72 | GUARD | none |

### `tests/unit/coaching-boundary.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB1.038: P-014 boundaries ,  flag-off zero side effects | 69-231 | 17 | 163 | GUARD | none |

### `tests/unit/coaching-classification-actions.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB2.064: P-020A classifyParameter action ,  flag-off ordering | 40-94 | 6 | 55 | CUT-AT-REPLACE | PR-04 |

### `tests/unit/coaching-classification.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB2.065: parameter-classification gate | 18-36 | 1 | 19 | CUT-AT-REPLACE | PR-04 |
| TB2.066: classification boundary gate ordering | 38-63 | 1 | 26 | CUT-AT-REPLACE | PR-04 |
| TB2.067: computeSelectionFingerprint | 65-79 | 2 | 15 | GUARD | none |
| TB2.068: evaluateDailyEntryVersionEligibility | 134-377 | 14 | 244 | CUT-AT-REPLACE | PR-04 |

### `tests/unit/coaching-gate.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB3.033: P-014 coaching feature gate | 12-23 | 10 | 12 | GUARD | none |
| TB3.034: P-014 engineering safety limits | 25-38 | 1 | 14 | CUT pass 2 | none |

### `tests/unit/coaching-nav.dom.test.tsx`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB0.026: P-014 workspace nav ,  Parameters and Templates entries | 31-70 | 7 | 40 | VISIBLE | none |

### `tests/unit/coaching-parameters.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB0.027: validateParameterCreate | 36-186 | 9 | 151 | GUARD | none |
| TB0.028: applyParameterEdits (revision + semantic lock) | 188-257 | 5 | 70 | GUARD | none |

### `tests/unit/coaching-templates.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB3.035: validateTemplateDraft | 42-219 | 7 | 178 | GUARD | none |

### `tests/unit/credentials.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB0.029: authorizeCredentials | 24-109 | 6 | 86 | GUARD | none |
| TB0.030: normalizeEmail | 111-117 | 1 | 7 | GUARD | none |

### `tests/unit/crosssheet.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB0.031: buildCrossSheetData | 43-75 | 4 | 33 | CUT-AT-REPLACE | PR-04 |

### `tests/unit/daily-entry-canonical.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB2.069: canonicalizeDecimal ,  grammar and normalization | 16-75 | 49 | 60 | GUARD | none |
| TB2.070: computeRevisionCanonicalHash | 97-208 | 5 | 112 | GUARD | none |
| TB2.071: computeDailyEntryFormToken ,  actor-bound stale token | 210-277 | 11 | 68 | GUARD | none |

### `tests/unit/daily-entry-impact.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB2.072: P-021 daily-entry impact provider ordering | 35-123 | 2 | 89 | GUARD | none |

### `tests/unit/daily-entry-validate.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB1.039: resolveDailyEntryValues ,  ordinal binding | 81-112 | 5 | 32 | GUARD | none |
| TB1.040: validateDailyEntryValues ,  per-kind rules | 114-235 | 14 | 122 | GUARD | none |

### `tests/unit/daily-prototype.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB2.073: Phase B0 field schema | 15-61 | 4 | 47 | CUT pass 2 | none |
| TB2.074: validateDailyEntry | 63-100 | 4 | 38 | GUARD | none |
| TB2.075: isDailyPrototypeEnabled | 102-110 | 1 | 9 | GUARD | none |

### `tests/unit/daily-tracker.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB3.036: Phase 1.1 Daily Tracker section/field contract | 21-125 | 9 | 105 | GUARD | none |

### `tests/unit/daily-week-groups.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB2.076: groupDailyHistoryByWeek ,  declared-date grouping, no tz shifts | 19-62 | 4 | 44 | GUARD | none |

### `tests/unit/dashboard-autosave-ssr.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB1.041: SSR isolation (I1-R6) | 32-56 | 3 | 25 | GUARD | none |

### `tests/unit/dashboard-autosave.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB0.032: autosave coordinator (I1-R5) | 57-246 | 13 | 190 | GUARD | none |
| TB0.033: purge while in-flight (I1-R6 P3-3) | 248-314 | 2 | 67 | GUARD | none |
| TB0.034: bounded clean-slot retention (I1-R6 P3-4) | 316-339 | 2 | 24 | GUARD | none |

### `tests/unit/dashboard-config-habits.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB3.037: TL21/TL22 connected kinds | 37-100 | 6 | 64 | GUARD | none |

### `tests/unit/dashboard-config.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB2.077: dashboard config validation | 43-165 | 6 | 123 | GUARD | none |
| TB2.078: client subset projection | 167-194 | 1 | 28 | VISIBLE | none |
| TB2.079: canonical form | 196-204 | 1 | 9 | CUT pass 2 | none |
| TB2.080: hardened bounds (I1-R2) | 206-272 | 4 | 67 | GUARD | none |

### `tests/unit/databases.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB1.042: extractFoods | 29-68 | 5 | 40 | GUARD | none |
| TB1.043: extractExercises | 70-102 | 3 | 33 | GUARD | none |
| TB1.044: header handling | 104-140 | 3 | 37 | GUARD | none |

### `tests/unit/exercise-source.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB1.045: extractExerciseSource | 40-174 | 4 | 135 | GUARD | none |

### `tests/unit/extraction-contract.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB2.081: sheet slug mapping | 10-44 | 3 | 35 | GUARD | none |
| TB2.082: redaction placeholder | 46-53 | 1 | 8 | CUT-AT-REPLACE | PR-04 |

### `tests/unit/gdpr-export.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB1.046: S1-G export document | 19-106 | 6 | 88 | CUT-AT-REPLACE | PR-04 |

### `tests/unit/guard.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB0.062: authorize ,  default deny | 63-205 | 7 | 143 | CUT-AT-REPLACE | PR-05 |
| TB0.063: authorize ,  scopes | 207-449 | 7 | 243 | CUT-AT-REPLACE | PR-05 |
| TB0.064: authorize ,  PD29 platform-admin dual-role on onboardingFormTemplates | 455-583 | 8 | 129 | CUT-AT-REPLACE | PR-05 |
| TB0.065: CLIENT-TASKS-I1 (decision 109) ,  platform-admin deny-set | 585-626 | 5 | 42 | CUT-AT-REPLACE | PR-05 |
| TB0.066: HABITS-I1 (decision 110) ,  platform-admin deny-set | 628-669 | 5 | 42 | CUT-AT-REPLACE | PR-05 |
| TB0.067: SOLO-COACH-I1 (decision 111) ,  platform-admin deny-set: clientAssignments | 671-741 | 6 | 71 | CUT-AT-REPLACE | PR-05 |

### `tests/unit/habits-boundary.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB3.038: habits boundary ,  gate first | 69-91 | 2 | 23 | GUARD | none |
| TB3.039: habits boundary ,  closed vocabulary | 93-173 | 4 | 81 | GUARD | none |

### `tests/unit/habits-date.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB0.068: parseHabitStartDate | 23-66 | 4 | 44 | GUARD | none |
| TB0.069: parseHabitEndDate | 68-91 | 2 | 24 | GUARD | none |
| TB0.070: parseWeekdayMask ,  caller zero-mask rejection | 93-106 | 3 | 14 | GUARD | none |
| TB0.071: weekday bits (Mon=bit0 … Sun=bit6) | 108-120 | 2 | 13 | GUARD | none |
| TB0.072: shiftDateUtc + serverTodayUtc (UTC-pinned) | 122-148 | 2 | 27 | GUARD | none |
| TB0.073: habitPeriodDays | 150-165 | 2 | 16 | GUARD | none |
| TB0.074: formatHabitDate ,  timezone-independent display | 167-172 | 1 | 6 | GUARD | none |

### `tests/unit/invitations.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB1.047: S1-F2C invitation helpers | 14-87 | 6 | 74 | CUT-AT-REPLACE | PR-05 |
| TB1.048: P2002 race classification | 106-144 | 2 | 39 | GUARD | none |
| TB1.049: list query bound | 151-206 | 1 | 56 | GUARD | none |
| TB1.050: post-lock re-authorization | 215-264 | 1 | 50 | CUT-AT-REPLACE | PR-05 |

### `tests/unit/invite-acceptance.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB0.075: getInviteLinkState (non-consuming peek) | 29-90 | 3 | 62 | GUARD | none |
| TB0.076: acceptInvitationMessage (safe error mapping) | 92-146 | 3 | 55 | GUARD | none |

### `tests/unit/mealplan-gate.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB1.051: MEAL-PLAN-I1 gate ,  runtime classification | 17-37 | 2 | 21 | GUARD | none |
| TB1.052: MEAL-PLAN-I1 gate ,  enablement decision | 39-58 | 1 | 20 | GUARD | none |
| TB1.053: MEAL-PLAN-I1 consent resolver | 60-87 | 2 | 28 | CUT-AT-REPLACE | PR-04 |

### `tests/unit/mealplan-payload.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB1.054: MEAL-PLAN-I1 payload ,  happy path normalization | 47-115 | 4 | 69 | GUARD | none |
| TB1.055: MEAL-PLAN-I1 payload ,  unknown-key rejection at every level | 117-139 | 1 | 23 | GUARD | none |
| TB1.056: MEAL-PLAN-I1 payload ,  numeric bounds and precision | 141-170 | 2 | 30 | GUARD | none |
| TB1.057: MEAL-PLAN-I1 payload ,  per-variant target modes | 172-225 | 3 | 54 | GUARD | none |
| TB1.058: MEAL-PLAN-I1 payload ,  counts, strings, and byte limits | 227-314 | 3 | 88 | GUARD | none |

### `tests/unit/mealplan-timezone.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB2.083: MEAL-PLAN-I1 ,  resolveMealPlanActivation (local midnight) | 17-76 | 5 | 60 | GUARD | none |
| TB2.084: MEAL-PLAN-I1 ,  parseEffectiveDate bounds | 78-107 | 3 | 30 | GUARD | none |

### `tests/unit/normalize.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB2.085: normalizeNumeric | 5-42 | 6 | 38 | GUARD | none |

### `tests/unit/nutrition-source.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB3.040: extractNutritionSource | 40-186 | 4 | 147 | GUARD | none |

### `tests/unit/onboarding-actions.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB3.041: P-008 actions ,  session gate before any service call | 39-62 | 5 | 24 | GUARD | none |
| TB3.042: P-008 actions ,  strict FormData handling | 64-110 | 2 | 47 | GUARD | none |
| TB3.043: P-008 actions ,  delegation contract | 112-316 | 8 | 205 | GUARD | none |
| TB3.044: P-008 actions ,  independent delegation per action | 318-500 | 10 | 183 | CUT pass 2 | none |

### `tests/unit/onboarding-assignments-actions.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB3.045: P-013 server actions ,  flag-off ordering | 52-118 | 8 | 67 | GUARD | none |

### `tests/unit/onboarding-assignments-boundary.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB3.046: P-013 boundary ,  flag-off fails before any input work | 63-138 | 7 | 76 | GUARD | none |
| TB3.047: P-013 boundary ,  input binding (flag on) | 140-195 | 6 | 56 | GUARD | none |
| TB3.048: P-013 boundary ,  error mapping (flag on) | 197-244 | 9 | 48 | GUARD | none |

### `tests/unit/onboarding-assignments.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB2.086: P-013 assignments dev gate | 15-26 | 11 | 12 | GUARD | none |
| TB2.087: P-013 assignments contract constants | 28-41 | 2 | 14 | CUT pass 2 | none |

### `tests/unit/onboarding-draft-editor.dom.test.tsx`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB0.077: DraftEditor ,  mount surface + client-local edit contract | 166-187 | 2 | 22 | VISIBLE | none |
| TB0.078: DraftEditor ,  props reseed through the real component | 189-245 | 3 | 57 | GUARD | none |
| TB0.079: DraftEditor ,  save wiring (intentionally RED until ES-3) | 247-567 | 10 | 321 | GUARD | none |
| TB0.080: DraftEditor ,  field structure ops (DOM-visible, separable from save) | 620-741 | 12 | 122 | VISIBLE | none |
| TB0.081: DraftEditor ,  structure-ops payload subset (deferred to ES-3) | 747-859 | 4 | 113 | GUARD | none |
| TB0.082: DraftEditor ,  lifecycle controls (intentionally RED until ES-4a) | 868-1057 | 7 | 190 | VISIBLE | none |
| TB0.083: OpenDraftButton ,  reopen surface (intentionally RED until ES-4a) | 1071-1115 | 2 | 45 | VISIBLE | none |

### `tests/unit/onboarding-draft-editor.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB3.049: ES-1a initial mount seed + monotonic props reseed | 48-180 | 7 | 133 | GUARD | none |
| TB3.050: ES-1b adoptSavedResult ,  server-normalized save adoption | 182-239 | 2 | 58 | GUARD | none |
| TB3.051: ES-1c addDraftField ,  kind metadata + blank option seed | 241-291 | 8 | 51 | VISIBLE | none |

### `tests/unit/onboarding-forms-boundary.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB3.052: P-008 boundary ,  raw payload bound before parse | 29-155 | 4 | 127 | GUARD | none |
| TB3.053: P-008 boundary ,  delegation + error mapping | 157-395 | 14 | 239 | GUARD | none |

### `tests/unit/onboarding-forms.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB0.084: P-008 validation ,  definition bounds | 37-204 | 6 | 168 | GUARD | none |
| TB0.085: P-008 validation ,  field ID trust | 206-310 | 2 | 105 | GUARD | none |
| TB0.086: P-008 boundary ,  raw payload bound before parse | 312-338 | 1 | 27 | CUT pass 2 | none |
| TB0.087: P-008 RBAC ,  onboardingFormTemplates | 340-372 | 2 | 33 | CUT-AT-REPLACE | PR-05 |
| TB0.088: P-008 seam ,  app never imports the service | 374-393 | 1 | 20 | CUT pass 2 | none |

### `tests/unit/onboarding-review.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB3.054: onboardingSubmissionReviews ,  resource and matrix (P-024) | 17-45 | 2 | 29 | CUT-AT-REPLACE | PR-05 |
| TB3.055: onboardingSubmissionReviews ,  dual-role platform-admin denial | 47-94 | 1 | 48 | CUT-AT-REPLACE | PR-05 |
| TB3.056: onboardingSubmissionReviews ,  consent mapping (P-024) | 96-104 | 1 | 9 | CUT-AT-REPLACE | PR-04 |
| TB3.057: audit resource ,  onboarding_submission_review (P-024) | 106-116 | 1 | 11 | CUT pass 2 | none |

### `tests/unit/onboarding-submission.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB3.058: P-023 gate | 106-112 | 1 | 7 | GUARD | none |
| TB3.059: P-023-I1-R2 trusted consent-policy resolver (Repair A) | 114-186 | 5 | 73 | CUT-AT-REPLACE | PR-04 |
| TB3.060: P-023 parseAnswersJson | 188-264 | 8 | 77 | GUARD | none |
| TB3.061: P-023 canonicalizeAnswers | 266-500 | 10 | 235 | GUARD | none |
| TB3.062: P-023 RBAC | 502-520 | 1 | 19 | CUT-AT-REPLACE | PR-05 |
| TB3.063: P-023 route-leaf uniqueness | 522-545 | 1 | 24 | CUT pass 2 | none |

### `tests/unit/parameter-classification-dom.test.tsx`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB1.059: P-020A classification serialization ,  no raw ids | 46-129 | 3 | 84 | CUT-AT-REPLACE | PR-04 |

### `tests/unit/parse.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB1.060: parseSheetHtml | 51-112 | 9 | 62 | GUARD | none |

### `tests/unit/password-policy.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB0.089: S1-F2B password policy | 12-113 | 10 | 102 | GUARD | none |
| TB0.090: P3.1+P3.2 setup password policy (min 10 + at least one ASCII digit) | 123-164 | 5 | 42 | GUARD | none |
| TB0.091: hash boundary normalization | 174-183 | 1 | 10 | GUARD | none |

### `tests/unit/password-reset-boundary.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB3.064: getResetLinkState (non-consuming peek) | 30-90 | 3 | 61 | GUARD | none |
| TB3.065: requestPasswordResetFromForm (non-enumerating) | 92-171 | 3 | 80 | GUARD | none |
| TB3.066: passwordResetMessage (safe error mapping) | 173-216 | 3 | 44 | GUARD | none |
| TB3.067: completePasswordReset | 218-258 | 2 | 41 | GUARD | none |
| TB3.068: delivery-capability gate (fail closed until a real adapter) | 260-323 | 3 | 64 | GUARD | none |

### `tests/unit/password-reset-delivery.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB1.061: passwordResetDeliveryAvailable | 14-37 | 3 | 24 | GUARD | none |

### `tests/unit/password-reset-token-failure.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB0.095: safeTokenHash classification | 21-60 | 1 | 40 | GUARD | none |

### `tests/unit/password-reset.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB2.088: S1-F2D password-reset ,  unit surface | 31-480 | 12 | 450 | GUARD | none |
| TB2.089: route boundary | 482-505 | 1 | 24 | CUT pass 2 | none |

### `tests/unit/password.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB3.069: password hashing | 5-48 | 6 | 44 | GUARD | none |

### `tests/unit/rbac.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB1.062: RBAC matrix | 325-434 | 5 | 110 | CUT-AT-REPLACE | PR-05 |

### `tests/unit/redact.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB0.096: redactSheet | 35-103 | 6 | 69 | CUT-AT-REPLACE | PR-04 |
| TB0.097: MENSES cycle-phase guide (source-aware region) | 105-132 | 2 | 28 | CUT-AT-REPLACE | PR-04 |
| TB0.098: isSafeCellText | 134-160 | 3 | 27 | CUT-AT-REPLACE | PR-04 |
| TB0.099: sortRedactions | 162-195 | 1 | 34 | CUT-AT-REPLACE | PR-04 |

### `tests/unit/retention.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB1.063: S1-G retention policy | 16-125 | 14 | 110 | CUT-AT-REPLACE | PR-04 |

### `tests/unit/route-guard.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB1.064: resolveWorkspaceAccess | 94-166 | 3 | 73 | CUT-AT-REPLACE | PR-05 |
| TB1.065: requireWorkspaceAccess | 168-192 | 2 | 25 | CUT-AT-REPLACE | PR-05 |
| TB1.066: requireSessionUser | 194-213 | 3 | 20 | CUT-AT-REPLACE | PR-05 |
| TB1.067: listSessionWorkspaces | 215-251 | 1 | 37 | CUT-AT-REPLACE | PR-05 |
| TB1.068: getAuthorizedWorkspaceSummary | 253-273 | 2 | 21 | GUARD | none |

### `tests/unit/session-version.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB3.070: S1-F2B session-version gate | 26-184 | 7 | 159 | GUARD | none |

### `tests/unit/sheet-viewer-gate.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB0.100: isSheetViewerEnabled | 8-16 | 1 | 9 | GUARD | none |
| TB0.101: requireSheetViewer (fail-closed gate used by the pages) | 18-27 | 2 | 10 | GUARD | none |

### `tests/unit/source-config.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB0.102: resolveSheetsSourceDir | 20-30 | 2 | 11 | CUT pass 2 | none |
| TB0.103: isInsideRepo | 32-38 | 1 | 7 | GUARD | none |
| TB0.104: isPathGitIgnored | 40-45 | 1 | 6 | GUARD | none |
| TB0.105: assertRawDirIsIgnored | 47-57 | 2 | 11 | GUARD | none |
| TB0.106: validateSheetsSourceDir | 59-119 | 5 | 61 | GUARD | none |

### `tests/unit/source-data-policy.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB1.069: source-data policy: committed catalog artifacts are synthetic fixtures | 26-74 | 4 | 49 | CUT-AT-REPLACE | PR-04 |

### `tests/unit/spec-artifacts.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB3.071: committed reference artifacts | 15-48 | 3 | 34 | CUT pass 2 | none |
| TB3.072: committed sheet artifacts | 50-71 | 3 | 22 | CUT-AT-REPLACE | PR-04 |

### `tests/unit/staff-daily-review.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB3.073: P-022 staff entry cursor | 13-45 | 3 | 33 | GUARD | none |

### `tests/unit/storage.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB0.107: S1-G storage port | 17-106 | 30 | 90 | GUARD | none |

### `tests/unit/summaries.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB2.090: buildSheetSummary | 23-72 | 5 | 50 | GUARD | none |

### `tests/unit/theme-artifact.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB3.074: buildThemeArtifact | 37-61 | 3 | 25 | GUARD | none |

### `tests/unit/theme.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB1.070: pro-dark theme | 52-70 | 2 | 19 | CUT pass 2 | none |
| TB1.071: pro-white theme | 72-99 | 3 | 28 | GUARD | none |
| TB1.072: theme application | 101-118 | 2 | 18 | CUT pass 2 | none |

### `tests/unit/token-crypto.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB2.091: generateAccessToken | 25-77 | 5 | 53 | GUARD | none |
| TB2.092: hashAccessToken | 79-214 | 16 | 136 | GUARD | none |
| TB2.093: module boundary | 216-236 | 3 | 21 | CUT pass 2 | none |

### `tests/unit/token-exposure.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB1.073: S1-F1 external-exposure boundary | 10-42 | 3 | 33 | GUARD | none |

### `tests/unit/token-store.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB2.094: S1-F2A token store (unit) | 32-216 | 10 | 185 | GUARD | none |

### `tests/unit/training-payload.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB0.108: normalizeTrainingDraft ,  strictness | 63-122 | 2 | 60 | GUARD | none |
| TB0.109: normalizeFieldConfig | 124-144 | 1 | 21 | GUARD | none |
| TB0.110: materializeWeeks ,  override-boundary resolution (P4 §3) | 146-216 | 7 | 71 | GUARD | none |
| TB0.111: validatePublishCompleteness | 218-278 | 1 | 61 | GUARD | none |
| TB0.112: projectForClient ,  hidden fields never serialize (P4 §6) | 280-303 | 1 | 24 | VISIBLE | none |
| TB0.113: canonicalDraftContent ,  `changed` marker identity (G) | 305-326 | 1 | 22 | GUARD | none |
| TB0.114: week math under the immutable anchor | 343-366 | 3 | 24 | GUARD | none |
| TB0.115: gvAt / governed spans (P8 §5) | 368-432 | 3 | 65 | GUARD | none |
| TB0.116: versionForWeek + marker (P8 §5.2/§5.4) | 434-499 | 2 | 66 | GUARD | none |

### `tests/unit/transition-diff.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB1.074: P-020B computeTransitionDiff | 65-367 | 10 | 303 | GUARD | none |
| TB1.075: P-020B transition summary validation | 369-414 | 2 | 46 | GUARD | none |

### `tests/unit/transition-impact.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB2.095: P-020B canonical count + date validation | 46-104 | 3 | 59 | GUARD | none |
| TB2.096: P-020B provider declaration/set equality | 106-165 | 5 | 60 | GUARD | none |
| TB2.097: P-020B provider-set identity vectors | 167-184 | 2 | 18 | GUARD | none |
| TB2.098: P-020B provider execution + output validation | 186-313 | 6 | 128 | GUARD | none |
| TB2.099: P-020B closed vocabularies | 315-331 | 1 | 17 | CUT pass 2 | none |

### `tests/unit/transition-review.test.ts`

| Block | Source lines | Tests | Block lines | Final tag | Replacement PR |
|---|---:|---:|---:|---|---|
| TB1.076: P-020B reviewFingerprint | 30-62 | 11 | 33 | GUARD | none |
| TB1.077: P-020B serializeTransitionReview ,  sole browser boundary | 64-172 | 1 | 109 | GUARD | none |


## Within-block cuts in otherwise GUARD blocks

These exact cases do not become valuable merely because a sibling case bites. Remove them in PR-03. Their tests and physical lines move from GUARD to CUT pass 2 in the summary. The enclosing pass-2 block keeps its GUARD tag and the rest of its cases.

| Parent block | Exact source test to remove | Source lines | Cases |
|---|---|---:|---:|
| TB0.089 | bounds are the approved values | 13-16 | 1 |
| TB0.106 | finds all 11 sheets in the supplied folder | 95-118 | 1 |
| TB1.017 | deploys all migrations including the access-token migration | 139-147 | 1 |
| TB1.017 | has the purpose-shape CHECK constraints, unique hash, and indexes | 370-405 | 1 |
| TB1.017 | keeps every prior raw constraint and index | 407-424 | 1 |
| TB1.041 | this test file runs without a window ,  the SSR condition | 33-35 | 1 |
| TB1.071 | defines the same token set as pro-dark | 73-75 | 1 |
| TB1.073 | is a pure structural boundary (no parameters, no side effects) | 20-31 | 1 |
| TB2.003 | applied both migrations | 77-88 | 1 |
| TB2.003 | has the composite same-workspace FKs and the active-primary partial index | 161-177 | 1 |
| TB2.003 | introduces no health/audit/token/product tables | 273-390 | 1 |
| TB2.081 | covers exactly the 11 expected sheets with unique slugs | 11-15 | 1 |
| TB2.094 | exposes the founder-decided 12-hour lifetime as one constant | 33-35 | 1 |
| TB3.014 | checkin_form exists with the reviewed columns | 35-54 | 1 |
| TB3.014 | checkin_form_version exists with the reviewed columns | 56-72 | 1 |
| TB3.014 | CheckIn enums exist and the onboarding-named kinds are not reused | 74-94 | 1 |
| TB3.014 | version uniqueness: (form_id, version_seq) AND (form_id, publish_origin_revision) | 96-119 | 1 |
| TB3.014 | composite coherence targets exist | 121-145 | 1 |
| TB3.014 | every form/version FK is ON DELETE RESTRICT (history anchored) | 147-177 | 1 |
| TB3.014 | no Check-In review table exists in this slice (P-025-C deferred) | 179-203 | 1 |
| TB3.036 | exposes exactly the nine verified PRGRSS sections in source order | 22-40 | 1 |
| TB3.036 | uses only source labels and printed units from the blueprint | 42-71 | 1 |
| TB3.036 | defines the eight biofeedback fields with the printed 1-10 scale | 73-78 | 1 |
| TB3.036 | marks the source CALORIES column as a computed TODO(product) field only | 80-86 | 1 |
| TB3.036 | excludes PED/HRT, coach notes, targets and averages | 88-96 | 1 |
| TB3.036 | flags MENSES as requiring cycle-data consent | 98-100 | 1 |
| TB3.043 | success forwards validated inputs + injected-free call; revalidates only on ok | 113-129 | 1 |
| TB3.043 | forged workspaceId argument is forwarded to the guarded boundary | 146-160 | 1 |
| TB3.043 | optional name: absent forwards undefined; blank forwards to service policy | 256-280 | 1 |
| TB3.053 | forwards the parsed draft + injected db and returns normalized output | 158-201 | 1 |
| TB3.053 | mutation wrappers delegate to the guarded service with the injected db | 289-352 | 1 |
| TB3.053 | list wrapper delegates to the guarded service with the injected db | 354-372 | 1 |
| TB3.053 | get wrapper delegates to the guarded service with the injected db | 374-394 | 1 |
| TB3.070 | auth.config.ts stays edge-safe ,  no Prisma/db imports | 172-183 | 1 |

Total: 34 cases and 718 physical source lines. The source file is identified by the parent block. These are not extra pass-2 blocks.

## E2e flow decisions

The 41 old-UI files are CUT-FILE in PR-03, not CUT-AT-PORT. The three support files stay while retained flows use them. `tests/integration/teardown-sweep.test.ts` proves fixture-scoped deletion order and preservation of an unrelated workspace. That is data-integrity coverage, not a claim that the support files themselves contain tests.

| Flow file | Test | Source lines | Final tag | Browser evidence |
|---|---|---:|---|---|
| `auth.spec.ts` | login page renders the sign-in form | 3-8 | VISIBLE | Ran on baseline and restored builds |
| `auth.spec.ts` | invalid credentials show a generic error | 10-18 | VISIBLE | Ran on baseline and restored builds |
| `invite-acceptance.spec.ts` | valid invite creates the account and hands off to sign-in | 95-127 | GUARD | Ran on baseline and restored builds |
| `invite-acceptance.spec.ts` | policy rejections render accessible errors and leave the token usable | 129-158 | GUARD | Ran on baseline and restored builds |
| `invite-acceptance.spec.ts` | a consumed link fails safely on revisit | 160-183 | GUARD | Ran on baseline and restored builds |
| `invite-acceptance.spec.ts` | /invite responses send Referrer-Policy: no-referrer | 187-197 | GUARD | Ran on baseline and restored builds |
| `invite-acceptance.spec.ts` | malformed and unknown tokens show the same safe state | 199-213 | GUARD | Ran on baseline and restored builds |
| `invite-acceptance.spec.ts` | revoked and expired invites fail safely | 215-246 | GUARD | Ran on baseline and restored builds |
| `invite-acceptance.spec.ts` | an existing user accepts without a password prompt | 250-279 | GUARD | Ran on baseline and restored builds |
| `invite-acceptance.spec.ts` | a different signed-in account gets the safe mismatch state | 281-292 | GUARD | Ran on baseline and restored builds |
| `invite-acceptance.spec.ts` | invite form usable at 1440px | 297-317 | VISIBLE | Ran on baseline and restored builds |
| `invite-acceptance.spec.ts` | invite form usable at 834px | 297-317 | VISIBLE | Ran on baseline and restored builds |
| `invite-acceptance.spec.ts` | invite form usable at 390px | 297-317 | VISIBLE | Ran on baseline and restored builds |
| `invite-acceptance.spec.ts` | keyboard-only flow submits and reaches the sign-in handoff | 320-336 | VISIBLE | Ran on baseline and restored builds |
| `password-reset.spec.ts` | generic success for existing AND missing accounts ,  non-enumerating | 138-153 | GUARD | UNPROVEN, skipped with the empty delivery registry |
| `password-reset.spec.ts` | malformed email is rejected accessibly ,  native constraint first | 155-170 | VISIBLE | Skipped, visible case is cut |
| `password-reset.spec.ts` | request page is reachable from the sign-in form | 172-177 | VISIBLE | Skipped, visible case is cut |
| `password-reset.spec.ts` | valid link sets a compliant password; old fails, new signs in | 182-227 | GUARD | UNPROVEN, skipped with the empty delivery registry |
| `password-reset.spec.ts` | a consumed link fails safely on revisit | 229-246 | GUARD | UNPROVEN, skipped with the empty delivery registry |
| `password-reset.spec.ts` | revoked (superseded) and expired links fail safely | 248-274 | GUARD | UNPROVEN, skipped with the empty delivery registry |
| `password-reset.spec.ts` | malformed, unknown, and wrong-purpose links get the same safe state | 276-300 | GUARD | UNPROVEN, skipped with the empty delivery registry |
| `password-reset.spec.ts` | an existing session is signed out by the reset | 305-324 | GUARD | UNPROVEN, skipped with the empty delivery registry |
| `password-reset.spec.ts` | desktop: reset forms usable at 1440px | 334-355 | VISIBLE | Skipped, visible case is cut |
| `password-reset.spec.ts` | tablet: reset forms usable at 834px | 334-355 | VISIBLE | Skipped, visible case is cut |
| `password-reset.spec.ts` | mobile: reset forms usable at 390px | 334-355 | VISIBLE | Skipped, visible case is cut |
| `password-reset.spec.ts` | keyboard-only flow submits the request form | 358-366 | VISIBLE | Skipped, visible case is cut |
| `password-reset.spec.ts` | /reset-request returns 404 | 370-373 | GUARD | Ran on baseline and restored builds |
| `password-reset.spec.ts` | /reset returns 404 ,  including token-bearing URLs | 375-388 | GUARD | Ran on baseline and restored builds |
| `password-reset.spec.ts` | login shows no reset link while delivery is unavailable | 390-397 | VISIBLE | Ran on baseline and restored builds |

The invite file retains only its 8 GUARD cases. Cut its 3 viewport-only cases and keyboard-only handoff case. The reset file retains 8 GUARD cases. Cut native browser validation, reset-link navigation, the 3 responsive cases, keyboard-only submission and the hidden-login-link assertion. Native accessibility and keyboard checks remain mandatory in the live lane even when their automated rendered-output cases are cut.

Mutated-build evidence: `app/login/actions.ts` changed the generic error to "Unknown account."; its invalid-credential case failed. `getInviteLinkState` required PASSWORD_RESET instead of WORKSPACE_INVITE; 9 invite cases failed. The server-side `passwordResetDeliveryConfigured()` wrapper returned true without a provider while the test-side capability registry stayed empty; its 3 gated-off cases failed. These breaks prove that the running cases bite. They do not turn the label-only auth cases or the 12 reset skips into GUARD proof.

## Independent spot checks

All listed producer reproductions failed their own claimed block's tests. Each mutation had a green focused baseline and a green rerun after byte-for-byte restoration. Failure counts below are whole-file counts; the failure names in raw JSON identify the owning block. A failed build or import is not counted as a bite.

The commands are `npx vitest run TEST_FILE` for unit files, `INTEGRATION_DATABASE_URL=... npx vitest run --config vitest.integration.config.ts TEST_FILE` for integration files, and `node --experimental-strip-types --loader ./src/components/coach/plans/test-loader.mjs --test TEST_FILE` from `frontend/` for canvas files. The exact source replacement, command inputs, log path and failing case names are in `mutations.jsonl` and `mutate.py`.

| Lane | Block | Check | Result |
|---|---|---|---|
| TB0 | TB0.068 | Producer reproduction: `if (canonical < today) return null;` changed to `if (canonical <= today) return null;` in `lib/habits/date.ts` | exit 1, 2 failed; baseline 0, restored 0 |
| TB0 | TB0.089 | Producer reproduction: `PASSWORD_MIN_CODE_POINTS = 10;` changed to `PASSWORD_MIN_CODE_POINTS = 11;` in `lib/password-policy.ts` | exit 1, 8 failed; baseline 0, restored 0 |
| TB0 | TB0.107 | Harder GUARD mutation: `if (!key.startsWith(prefix))` changed to `if (!key.startsWith(`workspace/${workspaceId}/`))` in `lib/storage.ts` | exit 1, 1 failed; baseline 0, restored 0 |
| TB1 | TB1.040 | Producer reproduction: `v > bounds.max)` changed to `v > bounds.max + 1)` in `lib/daily-entry/validate.ts` | exit 1, 1 failed; baseline 0, restored 0 |
| TB1 | TB1.019 | Producer reproduction: `userId: input.userId,       consumedAt: null,` changed to `userId: input.userId,` in `lib/tokens/store.ts` | exit 1, 2 failed; baseline 0, restored 0 |
| TB1 | TB1.015 | Additional mixed-suite scope probe: `const base: Prisma.ClientProfileWhereInput = { workspaceId: ctx.workspaceId };` changed to `const base: Prisma.ClientProfileWhereInput = {};` in `lib/workspace/clients.ts` | exit 1, 2 failed; baseline 0, restored 0 |
| TB2 | TB2.069 | Producer reproduction: `t.length - sep - 1 > MAX_FRACTION_DIGITS` changed to `t.length - sep - 1 >= MAX_FRACTION_DIGITS` in `lib/daily-entry/canonical.ts` | exit 1, 4 failed; baseline 0, restored 0 |
| TB2 | TB2.038 | Producer reproduction: `byteLength(draftJson) > MAX_DRAFT_JSON_BYTES` changed to `draftJson.length > MAX_DRAFT_JSON_BYTES` in `lib/checkin/forms-boundary.ts` | exit 1, 1 failed; baseline 0, restored 0 |
| TB2 | TB2.092 | Harder GUARD mutation: `/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/` changed to `/^[A-Za-z0-9_-]{43}$/` in `lib/tokens/crypto.ts` | exit 1, 1 failed; baseline 0, restored 0 |
| TB3 | TB3.023 | Producer reproduction: `Math.min(earliest, candidate)` changed to `Math.max(earliest, candidate)` in `lib/checkin/timezone.ts` | exit 1, 1 failed; baseline 0, restored 0 |
| TB3 | TB3.028 | Producer reproduction: `horizonDays: 56,` changed to `horizonDays: 55,` in `lib/checkin/schedules.ts` | exit 1, 1 failed; baseline 0, restored 0 |
| TB3 | TB3.024 | Rejected equivalent candidate: `if (wallMinute >= requestedMinute)` changed to `if (wallMinute > requestedMinute)` in `lib/checkin/timezone.ts` | exit 0, 0 failed; not counted as a useful bite; baseline 0, restored 0 |
| TB4 | TB4.039 | Producer reproduction: `return value * 4.184;` changed to `return value * 4;` in `frontend/src/components/coach/client-tracker-preview/preview-model.ts` | exit 1, 1 failed; baseline 0, restored 0 |
| TB4 | TB4.055 | Producer reproduction: `return addDays(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));` changed to `return addDays(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 5) % 7));` in `frontend/src/components/coach/model.ts` | exit 1, 1 failed; baseline 0, restored 0 |
| TB4 | TB4.136 | Harder GUARD mutation: `typeof value === "number" && Number.isFinite(value),` changed to `typeof value === "number" && Number.isFinite(value) && Boolean(value),` in `frontend/src/components/ethereal/client-tracker/model.ts` | exit 1, 4 failed; baseline 0, restored 0 |
| TB3 | TB3.024 | Harder GUARD mutation: `for (let k = 0; k <= steps; k++)` changed to `for (let k = 0; k <= steps; k += 30)` in `lib/checkin/timezone.ts` | exit 1, 5 failed; baseline 0, restored 0 |
| TB1 | TB1.028 | Harder GUARD mutation: `const base: Prisma.ClientProfileWhereInput = { workspaceId: ctx.workspaceId };` changed to `const base: Prisma.ClientProfileWhereInput = {};` in `lib/workspace/clients.ts` | exit 1, 2 failed; baseline 0, restored 0 |
| TB0 | TB0.011 | Re-read the entire CUT block in source | A static import-source scan; no application behavior runs. CUT holds. |
| TB0 | TB0.025 | Re-read the entire CUT block in source | Limit and error-name constants only. CUT holds. |
| TB1 | TB1.026 | Re-read the entire CUT block in source | Only typeof checks for two exports. CUT holds. |
| TB1 | TB1.070 | Re-read the entire CUT block in source | Exact CSS hex and font literals. CUT holds. |
| TB2 | TB2.079 | Re-read the entire CUT block in source | Compares canonicalize(c) with the same call on c. Undefined output would still pass. CUT holds. |
| TB2 | TB2.093 | Re-read the entire CUT block in source | Export/arity pins plus duplicate hash-determinism coverage. CUT holds. |
| TB3 | TB3.034 | Re-read the entire CUT block in source | Restates all COACHING_LIMITS values, no mechanism. CUT holds. |
| TB3 | TB3.059 | Re-read the entire CUT block in source | Entire consent resolver is parked. Producer immediate CUT is amended to CUT-AT-REPLACE in PR-04 by D14. |
| TB4 | TB4.092 | Re-read the entire CUT block in source | CSS border/radius/background regex. CUT holds. |
| TB4 | TB4.093 | Re-read the entire CUT block in source | CSS checkbox dimensions/radius regex. CUT holds. |

The TB1 harder requirement is proved by **TB1.028**, not by reclassifying the broader TB1.015 permission suite as GUARD. Dropping the shared workspace base predicate failed its own literal scoped-filter case and its sibling pagination case. The same change also leaked foreign rows in the additional real-DB probe.

The first TB3 harder candidate changed the final gap comparison from >= to >. It passed all 18 cases because these gap examples already encounter a minute later than the nonexistent requested minute; that result is not a coverage failure. The distinct optimization bug, sampling every 30 minutes instead of every minute, failed all 5 first-valid-minute gap cases, including Lord Howe, Chatham and Troll. No surviving mutant was represented as a successful mutation check.

## Local gate per PR, D13

PR-03 must provide one local entrypoint, proposed `scripts/verify-local.sh`, with the sequence below. This is the required implementation contract, not a claim that the script or the post-PR-03 package scripts already exist. Today's `npm run verify` omits format, integration, build and live verification, so it is insufficient. Its format and lint scripts must also move to the approved shared Biome policy; Markdown and YAML stay on Prettier. No check uses a write flag.

Run in the verifier's isolated worktree at the exact PR head, with the preceding stack PR's exact head as BASE_SHA. Do not compare every stacked PR to TRACKER and thereby rerun integration for unrelated earlier changes. VERIFY_DB must name a fresh disposable database, never app_dev or another lane's database.

```bash
set -euo pipefail
: "${BASE_SHA:?Set the exact parent PR head or TRACKER base SHA}"
: "${VERIFY_DB:?Set a unique app_verify_ database name}"
[[ "$VERIFY_DB" =~ ^app_verify_[a-z0-9_]+$ ]]
git rev-parse --verify "${BASE_SHA}^{commit}"
git rev-parse HEAD
git diff --quiet
git diff --cached --quiet
node -e 'if (process.versions.node.split(".")[0] !== "24") process.exit(1)'

# Setup, not a substitute for any gate.
npm ci
npx prisma generate
npm --prefix frontend ci

# 1. Format checks. PR-03 makes this cover Biome code plus Prettier MD/YAML.
npm run format:check
# 2. Typecheck both still-present applications.
npm run typecheck
npm --prefix frontend run typecheck
# 3. Lint, with the one approved Biome policy.
npm run lint
npm --prefix frontend run lint
# 4. Behavior tests retained by this audit.
npm run test
npm --prefix frontend run test

# Disposable real DB for optional integration and mandatory live verification.
docker exec vari8-db-1 createdb -U app "$VERIFY_DB"
cleanup() {
  docker exec vari8-db-1 dropdb -U app --if-exists "$VERIFY_DB"
}
trap cleanup EXIT
export DATABASE_URL="postgresql://app:app_dev_password@127.0.0.1:5433/${VERIFY_DB}"
export INTEGRATION_DATABASE_URL="$DATABASE_URL"

# 5. Integration ONLY for a change under these three prefixes.
if test -n "$(git diff --name-only "$BASE_SHA" HEAD -- db/ lib/ app/api/)"; then
  npm run test:integration
fi
# Live verification still needs the migrated DB when integration was skipped.
npx prisma migrate deploy

# 6. Production builds, not dev-only compilation.
npm run build
npm --prefix frontend run build

# 7. Actual browser flow checks. The old 41 specs have been deleted in PR-03.
# CI here controls Playwright's server reuse only. It does not run GitHub CI.
CI=1 npm run test:e2e -- \
  tests/e2e/invite-acceptance.spec.ts \
  tests/e2e/password-reset.spec.ts --workers=1
```

Before PR-03, include `tests/e2e/auth.spec.ts` in the final command because the approved deletion has not landed. After PR-05, update the selected AUTH-specific flow setup in that same PR. The current Playwright config runs its own production-build command again; PR-03 should reuse the already built output, without permitting attachment to an unrelated running server. Until ports become lane-selectable, serialize these verifier browser runs because the existing config reserves 3000, 3101 and 3102. A port collision is not permission to reuse somebody else's app.

The local script must not report the PR verified merely because this command sequence returns 0. A separate live-lane receipt is required before its final PASS. The verifier must exercise every changed canvas flow against the real synthetic DB at desktop width 1440 and mobile width 390, compare it to the canvas, check keyboard interaction and focus, and exercise the owner-approved ROLES matrix, including unauthorized direct requests, unassigned-coach scope and foreign-workspace substitutions. Save the exact head SHA, command exit codes, screenshots and role-matrix results with the PR. A changed head invalidates the receipt. Consent and health-policy checks are not additional gates while D12 parks them.

The shown shell's trap cleans up after its automated portion. The manual live lane needs its own disposable seeded DB and local server if the Playwright server has stopped. Use the plan's boot recipe in a separate isolated verifier lane; never fall back to app_dev. PR-03's single-script implementation must own that live-lane lifecycle and refuse final PASS until its evidence is supplied. There is currently no existing command that can honestly substitute for that screen-and-role check.

Reset-flow skips must appear in the receipt. Until a real delivery adapter exists, the six skipped GUARD cases are UNPROVEN, not passing acceptance evidence. Unit and integration guards are still required. No synthetic provider response or test-only gate bypass may be presented as a delivered password reset.

Both `.github/workflows/ci.yml` and `.github/workflows/frontend.yml` become `workflow_dispatch` only in PR-03. No push, pull_request or other automatic Actions trigger remains. The verifier pastes the local output and live receipt into the PR; no GitHub Actions minutes are spent automatically.

## Self-check

PASS for the audit's enumeration, required sampling and cleanup. This is not owner approval, target-Node certification or a claim that the skipped reset flow works.

| Required check | Verdict | Evidence |
|---|---|---|
| (a) Every pass-2 block has one tag | PASS | The report parser found 517 distinct block IDs with source spans and final tags, exactly matching the parsed five producer tables. The per-lane reconciliation is below. The 34 named within-block cuts change test/line allocations, not the original block count. |
| (b) Every accepted pass-1 file has a final action | PASS | Parsed 232 distinct action-list paths and compared their set with all six accepted inventories and the source census. No missing, duplicate or extra file. The action partition is 67 KEEP-ALL, 67 TRIM, 61 CUT-FILE and 37 whole-file CUT-AT-REPLACE. |
| (c) Required spot checks per lane | PASS | Each of TB0 through TB4 has exactly 2 reproduced producer KEEP mutations, 2 source re-reads of original CUT calls, and 1 independent harder mutation on a final GUARD block. Every counted mutant failed its own block; every focused baseline and restored run exited 0. The broader TB1 mixed-suite probe and the first equivalent TB3 candidate are extra and not used to satisfy the quota. |
| (d) Worktree and database removed | PASS | `git worktree remove --force /home/nexuslink/.hermes/cache/scratch/vari8-jta` exited 0. The exact path is absent from disk and from `git worktree list`. `dropdb -U app app_jta` exited 0. Fresh PostgreSQL queries returned 0 matching databases and 0 matching connections. Port 3217 has no listener. The owned Node/test process check returned 0. Other worktrees and databases were left alone. |
| (e) Only the named report written in the repository by this audit | PASS | This lane's root-checkout write calls target only `icm/03-plan/output/TEST-AUDIT.md`. Tracked application source was never edited. Scratch `git diff --exit-code` and cached diff were clean immediately before removal; its only untracked file was the isolated Playwright config, copied into external evidence before cleanup. No commit, push, formatter write or root install/test was run by this lane. |
| Totals, report syntax and evidence | PASS | Automated checks reconcile 85,820 physical lines and 2,758 declared cases, check the first status line, match all block/file sets, validate sample quotas, and reject long dash characters. The final report has no pending-section placeholders. The stored JSON and raw outputs remain outside the repo. |

| Lane | GUARD | VISIBLE | CUT-AT-REPLACE | CUT pass 2 | Reconciled original blocks |
|---|---:|---:|---:|---:|---:|
| TB0 | 71 | 9 | 29 | 7 | 116 |
| TB1 | 42 | 1 | 29 | 5 | 77 |
| TB2 | 47 | 9 | 30 | 13 | 99 |
| TB3 | 50 | 1 | 17 | 6 | 74 |
| TB4 | 73 | 60 | 3 | 15 | 151 |
| Total | 283 | 80 | 108 | 46 | 517 |

The shared root checkout changed concurrently. It began at `656b0d8a4a5ffbd87d9390349091f2a9c133e66d` and later reached `b74f5ba52788b70a0967e1156bab3fd4a385d4b8`, an unrelated gap-matrix visualization commit. The initial three dirty tracked issue-generator paths remain the three dirty tracked paths. The status comparison also found five new visualization fixture/screenshot outputs outside this lane, plus this report. This audit did not write, commit, remove or restore those other changes. Its application evidence stays pinned to `58eb6ed` regardless of that movement.

Remaining approval dependencies are explicit: accept or revise the auth-spec VISIBLE adjudication, approve the PR-04 D12 replacement scope instead of pretending the old plan already specifies it, supply ROLES, and resolve AUTH. The six skipped reset GUARD cases stay UNPROVEN until a real delivery capability exists. None of these is hidden behind the audit's mechanical PASS.
