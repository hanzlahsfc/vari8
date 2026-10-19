# PR-03A verify: Apply the TEST-AUDIT cuts

Card slug `pr-03-test-audit-verify`. Independent verifier on a different model than the builder (swe-2-max). You never edit product code and never push. Worktree `/home/nexuslink/vari8-worktrees/pr-03-test-audit-verify` (local branch `beta/pr-03-test-audit-verify`, never pushed). Evidence goes outside git to `/home/nexuslink/vari8-worktrees/_evidence/PR-03A/` and into the PR as a comment.

## Steps

1. Find the PR: `gh pr list -R hanzlahsfc/The-great-tracker- --head beta/pr-03-test-audit --state open --json number,headRefOid`. Then `cd /home/nexuslink/vari8-worktrees/pr-03-test-audit-verify && git fetch origin && git checkout --detach origin/beta/pr-03-test-audit`; record the head SHA. Test-merge the current trunk the way GitHub will: `git merge --no-ff --no-edit origin/Vari8-Beta`. On a conflict: `git merge --abort`, comment `FIX: conflict with Vari8-Beta in <paths>` on the PR, block this card, stop.
2. Export `POSTGRES_PASSWORD` (RUNBOOK 'Local check'), then `mkdir -p /home/nexuslink/vari8-worktrees/_evidence/PR-03A && BASE_SHA=$(git rev-parse origin/Vari8-Beta) LANE_DB=app_verify_pr03a LANE_PORT=3708 CARD=PR-03A icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/_evidence/PR-03A/verify-local.log 2>&1; echo EXIT=$?`.
3. Live receipt at that head: start the app on port 3708 with a fresh `app_verify_pr03a` (`npm run db:fresh`, or RUNBOOK 'Dev user before PR-04' while `db:fresh` does not exist yet), drive every acceptance item below in a real browser at 1440x900 and 390x844, as each of: owner, coach, client of the same workspace, staff of a foreign workspace, signed out. Unauthorized direct requests to the PR's routes must fail closed. Save screenshots as `/home/nexuslink/vari8-worktrees/_evidence/PR-03A/<role>-<width>.png`.
4. Parity (D32) on none: run the harness against your server; keep the report and diff images in `/home/nexuslink/vari8-worktrees/_evidence/PR-03A/parity/`.
5. Check every matrix row listed below is visibly closed (or, for model and service rows, exercised by the wiring flow or a keep-category test). List each row with PASS or FAIL.
6. Verdict: `gh pr comment <n> -R hanzlahsfc/The-great-tracker- --body-file /home/nexuslink/vari8-worktrees/_evidence/PR-03A/verdict.md`, where the first line is `SHIP PR-03A <head sha>` or `FIX PR-03A <head sha>`, followed by the gate summary, the live receipt table, the parity table and the matrix-row list. Attach the evidence folder listing to this card. Complete the card on SHIP; block it with the findings on FIX (the builder repairs, pushes, and this card runs again on the new head).
7. Stop your servers, drop `app_verify_pr03a`, leave the worktree clean.

## Acceptance to check

- `npm run test` and `npm --prefix frontend test` exit 0; the remaining counts reconcile with TEST-AUDIT GUARD plus CUT-AT-REPLACE totals, table in the report.

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-03A` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- none (foundation or tooling PR)

## TEST-AUDIT actions this PR executes

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
- `tests/integration/habits-schema.test.ts`: KEEP-ALL.
- `tests/integration/p008-onboarding-schema.test.ts`: CUT-FILE in PR-03.
- `tests/integration/p013-onboarding-assignments.test.ts`: TRIM (keep blocks TB2.013, TB2.016, TB2.021); CUT-AT-REPLACE in PR-05 blocks TB2.014, TB2.015, TB2.017, TB2.018, TB2.019, TB2.020; REWIRE in PR-05.
- `tests/integration/p014-coaching-templates.test.ts`: TRIM (keep blocks TB0.035, TB0.037, TB0.038, TB0.039, TB0.041, TB0.042); cut CUT pass 2 in PR-03; CUT-AT-REPLACE in PR-05 blocks TB0.036; REWIRE in PR-05.
- `tests/integration/p016-client-setup.test.ts`: TRIM (keep blocks TB2.007); CUT-AT-REPLACE in PR-05 blocks TB2.008, TB2.009, TB2.010, TB2.011.
- `tests/integration/p020a-parameter-classification.test.ts`: TRIM (keep blocks TB1.007, TB1.008); CUT-AT-REPLACE in PR-04 blocks TB1.003, TB1.004, TB1.005, TB1.006.
- `tests/integration/p020b-template-transitions.test.ts`: TRIM (keep blocks TB3.006, TB3.008, TB3.009); cut CUT pass 2 in PR-03; CUT-AT-REPLACE in PR-05 blocks TB3.007; REWIRE in PR-05.
- `tests/integration/p021-daily-entry.test.ts`: TRIM (keep blocks TB1.009, TB1.011); CUT-AT-REPLACE in PR-05 blocks TB1.010; REWIRE in PR-05.
- `tests/integration/p022-staff-daily-review.test.ts`: TRIM (keep blocks TB0.046, TB0.048); CUT-AT-REPLACE in PR-05 blocks TB0.043, TB0.045, TB0.047; CUT-AT-REPLACE in PR-04 blocks TB0.044.
- `tests/integration/p023-onboarding-submission.test.ts`: TRIM (keep blocks TB0.049, TB0.050, TB0.053, TB0.055); cut VISIBLE in PR-03; CUT-AT-REPLACE in PR-05 blocks TB0.051, TB0.058; CUT-AT-REPLACE in PR-04 blocks TB0
- `tests/integration/p025a-checkin-schema.test.ts`: TRIM (keep blocks TB3.014); cut CUT pass 2 in PR-03; cut the named within-block exceptions below in PR-03.
- `tests/integration/p025d2-checkin-calendar.test.ts`: TRIM (keep blocks TB2.024); CUT-AT-REPLACE in PR-05 blocks TB2.023; REWIRE in PR-05.
- `tests/integration/phase-2-1-nutrition-import.test.ts`: KEEP-ALL.
- `tests/integration/phase-2-2-exercise-import.test.ts`: KEEP-ALL.
- `tests/integration/phase-3-1-invite-acceptance.test.ts`: KEEP-ALL; REWIRE in PR-05.
- `tests/integration/phase-3-2-password-reset.test.ts`: KEEP-ALL.
- `tests/integration/s1-a-identity.test.ts`: TRIM (keep blocks TB2.003, TB2.004); cut CUT pass 2 in PR-03; cut the named within-block exceptions below in PR-03.
- `tests/integration/s1-e-audit.test.ts`: KEEP-ALL; REWIRE in PR-05.
- `tests/integration/s1-f1-token-schema.test.ts`: TRIM (keep blocks TB1.017, TB1.018); cut CUT pass 2 in PR-03; cut the named within-block exceptions below in PR-03.
- `tests/integration/s1-f2a-token-store.test.ts`: KEEP-ALL.
- `tests/integration/s1-f2b-account-audit.test.ts`: KEEP-ALL; REWIRE in PR-05.
- `tests/integration/s1-f2b-session-runtime.test.ts`: KEEP-ALL; REWIRE in PR-05 if AUTH replaces Auth.js; if AUTH replaces Auth.js, CUT-AT-REPLACE in PR-05 instead.
- `tests/integration/s1-f2b-session.test.ts`: KEEP-ALL; REWIRE in PR-05 if AUTH replaces Auth.js; if AUTH replaces Auth.js, CUT-AT-REPLACE in PR-05 instead.
- `tests/integration/s1-f2b-token-cleanup.test.ts`: KEEP-ALL.
- `tests/integration/s1-f2d-password-reset.test.ts`: KEEP-ALL; REWIRE in PR-05 if AUTH replaces Auth.js; if AUTH replaces Auth.js, CUT-AT-REPLACE in PR-05 instead.
- `tests/integration/s1-g-retention.test.ts`: CUT-FILE in PR-03.
- `tests/integration/teardown-sweep.test.ts`: KEEP-ALL.
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
- `tests/unit/client-setup-selection.test.ts`: KEEP-ALL.
- `tests/unit/client-setup-transition-actions.test.ts`: KEEP-ALL; REWIRE in PR-05.
- `tests/unit/client-setup.test.ts`: TRIM (keep blocks TB0.024); cut CUT pass 2 in PR-03.
- `tests/unit/client-tasks-boundary.test.ts`: KEEP-ALL.
- `tests/unit/client-tasks-date.test.ts`: KEEP-ALL.
- `tests/unit/clients-service.test.ts`: TRIM (keep blocks TB1.028, TB1.029, TB1.030, TB1.033, TB1.034); cut CUT pass 2 in PR-03; CUT-AT-REPLACE in PR-05 blocks TB1.031, TB1.032, TB1.035, TB1.036; REWI
- `tests/unit/coach-assignments-actions.test.ts`: KEEP-ALL; REWIRE in PR-05.
- `tests/unit/coaching-actions.test.ts`: KEEP-ALL; REWIRE in PR-05.
- `tests/unit/coaching-boundary-imports.test.ts`: CUT-FILE in PR-03.
- `tests/unit/coaching-boundary.test.ts`: KEEP-ALL; REWIRE in PR-05.
- `tests/unit/coaching-classification.test.ts`: TRIM (keep blocks TB2.067); CUT-AT-REPLACE in PR-04 blocks TB2.065, TB2.066, TB2.068.
- `tests/unit/coaching-gate.test.ts`: TRIM (keep blocks TB3.033); cut CUT pass 2 in PR-03.
- `tests/unit/coaching-nav.dom.test.tsx`: CUT-FILE in PR-03.
- `tests/unit/coaching-parameters.test.ts`: KEEP-ALL.
- `tests/unit/coaching-templates.test.ts`: KEEP-ALL.
- `tests/unit/credentials.test.ts`: KEEP-ALL.
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
- `tests/unit/parse-real-sheets.test.ts`: CUT-FILE in PR-03.
- `tests/unit/parse.test.ts`: KEEP-ALL.
- `tests/unit/password-policy.test.ts`: TRIM (keep blocks TB0.089, TB0.090, TB0.091); cut CUT pass 2 in PR-03; cut the named within-block exceptions below in PR-03.
- `tests/unit/password-reset-boundary.test.ts`: KEEP-ALL.
- `tests/unit/password-reset-delivery.test.ts`: KEEP-ALL.
- `tests/unit/password-reset-token-failure.test.ts`: KEEP-ALL.
- `tests/unit/password-reset.test.ts`: TRIM (keep blocks TB2.088); cut CUT pass 2 in PR-03.
- `tests/unit/password.test.ts`: KEEP-ALL.
- `tests/unit/playwright-config.test.ts`: CUT-FILE in PR-03.
- `tests/unit/redact-real.test.ts`: CUT-FILE in PR-03.
- `tests/unit/route-guard.test.ts`: TRIM (keep blocks TB1.068); CUT-AT-REPLACE in PR-05 blocks TB1.064, TB1.065, TB1.066, TB1.067; REWIRE in PR-05.
- `tests/unit/session-version.test.ts`: TRIM (keep blocks TB3.070); cut CUT pass 2 in PR-03; cut the named within-block exceptions below in PR-03; REWIRE in PR-05 if AUTH replaces Auth.js; if AUTH rep
- `tests/unit/sheet-viewer-gate.test.ts`: KEEP-ALL.
- `tests/unit/source-config.test.ts`: TRIM (keep blocks TB0.103, TB0.104, TB0.105, TB0.106); cut CUT pass 2 in PR-03; cut the named within-block exceptions below in PR-03.
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
