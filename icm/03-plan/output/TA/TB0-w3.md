# TB0-w3 pass-2 per-describe-block bite check

Worktree: `/home/nexuslink/.hermes/cache/scratch/vari8-tb/TB0-w3` @ 58eb6ed.
Integration DB: `app_tb_tb0_w3` on 127.0.0.1:5433 (always set for integration runs).
All mutations applied via `lever.sh` and auto-restored; every run was the full
test file, and a block is KEEP only where at least one of its own tests failed.

## Baselines (all clean, no baseline failures)

| file | baseline |
| --- | --- |
| tests/integration/phase-1-1-daily-tracker-guard.test.ts | 2 passed / 2, exit 0 |
| tests/integration/phase-2-2-exercise-import.test.ts | 8 passed / 8, exit 0 |
| tests/integration/phase-3-2-password-reset.test.ts | 6 passed / 6, exit 0 |
| tests/unit/guard.test.ts | 38 passed / 38, exit 0 |
| tests/unit/habits-date.test.ts | 16 passed / 16, exit 0 |
| tests/unit/invite-acceptance.test.ts | 6 passed / 6, exit 0 |
| tests/unit/onboarding-draft-editor.dom.test.tsx | 40 passed / 40, exit 0 |
| tests/unit/onboarding-forms.test.ts | 12 passed / 12, exit 0 |
| tests/unit/password-policy.test.ts | 16 passed / 16, exit 0 |

## Summary

- 33 top-level describe blocks in 9 files. KEEP 32, CUT 1, could-not-check 0.
- Tests: 144 total; CUT 1 -> CUT share by tests = 1/144 (~0.7%).
- Lines: 3066 total inside blocks; CUT 27 -> CUT share by lines = 27/3066 (~0.9%).
- Every KEEP verdict is backed by a lever-run mutation that failed at least
  one of that block's own tests; failed test names listed per row.

## Block table

| file | block | lines | tests | target | verdict | reason or mutation | failed tests |
| --- | --- | --- | --- | --- | --- | --- | --- |
| phase-1-1-daily-tracker-guard.test.ts | Phase 1.1 Daily Tracker route guard (real PG) | 113 | 2 | lib/auth/route-guard.ts `requireDailyTrackerAccess` | KEEP | `session` -> `null` in the authorizeCollection call, route-guard.ts:94 | allows every role with a granted dailyTracking read scope |
| phase-2-2-exercise-import.test.ts | Phase 2.2 Exercise catalog import (real PG) | 338 | 8 | lib/exercise/import.ts `importExerciseCatalog`, lib/exercise/search.ts | KEEP | `previous !== record.rowFingerprint` -> `previous === record.rowFingerprint`, import.ts:107 | is idempotent: an identical re-run changes and inserts nothing; updates only rows whose content fingerprint changed |
| phase-3-2-password-reset.test.ts | Phase 3.2 password-reset boundary (real PG) | 305 | 6 | lib/auth/password-reset.ts `resetPasswordWithToken`, lib/auth/password-reset-boundary.ts | KEEP | `sessionVersion: { increment: 1 }` -> `increment: 0`, password-reset.ts:365 | successful reset: password changed, token consumed, sv +1, audit written — all atomic; reused, expired, revoked, malformed, and wrong-purpose tokens fail identically with no mutation |
| guard.test.ts | authorize — default deny | 143 | 7 | lib/auth/guard.ts `authorize` | KEEP | `if (user.status !== "ACTIVE")` -> `if (false)` (authorize leg), guard.ts:251 | denies INVITED/DEACTIVATED users |
| guard.test.ts | authorize — scopes | 243 | 7 | lib/auth/guard.ts `authorize` (own/assigned/client checks) | KEEP | `client.userId !== userId` -> `client.userId === userId`, guard.ts:311 | own scope requires matching ClientProfile.userId and workspace |
| guard.test.ts | authorize — PD29 platform-admin dual-role on onboardingFormTemplates | 129 | 8 | lib/auth/guard.ts `PLATFORM_ADMIN_DENIED_RESOURCES` | KEEP | removed `"onboardingFormTemplates",` from the deny-set, guard.ts:133 | dual-role PLATFORM_ADMIN + ACTIVE WORKSPACE_OWNER is role_denied read AND write; dual-role PLATFORM_ADMIN + ACTIVE COACH is role_denied read AND write; both collection-path cases |
| guard.test.ts | CLIENT-TASKS-I1 (decision 109) — platform-admin deny-set | 42 | 5 | lib/auth/guard.ts `PLATFORM_ADMIN_DENIED_RESOURCES` | KEEP | removed `"clientTasks",` from the deny-set, guard.ts:158 | denies a PLATFORM_ADMIN with an ACTIVE workspace-owner / assigned-coach / assistant / client member on clientTasks (4 of 5; SUPPORT stays matrix-denied) |
| guard.test.ts | HABITS-I1 (decision 110) — platform-admin deny-set | 42 | 5 | lib/auth/guard.ts `PLATFORM_ADMIN_DENIED_RESOURCES` | KEEP | removed `"habits",` from the deny-set, guard.ts:162 | denies a PLATFORM_ADMIN with an ACTIVE workspace-owner / assigned-coach / assistant / client member on habits (4 of 5) |
| guard.test.ts | SOLO-COACH-I1 (decision 111) — platform-admin deny-set: clientAssignments | 71 | 6 | lib/auth/guard.ts `PLATFORM_ADMIN_DENIED_RESOURCES` | KEEP | removed `"clientAssignments",` from the deny-set, guard.ts:167 | denies a PLATFORM_ADMIN with an ACTIVE workspace-owner member on clientAssignments (read + write + collection) |
| habits-date.test.ts | parseHabitStartDate | 44 | 4 | lib/habits/date.ts `parseHabitStartDate` | KEEP | `canonical < today` -> `canonical <= today`, date.ts:89 | accepts today and future dates up to today+5y; leap-day today normalizes the horizon deterministically to Mar-01 |
| habits-date.test.ts | parseHabitEndDate | 24 | 2 | lib/habits/date.ts `parseHabitEndDate` | KEEP | `canonical < opts.startDate` -> `canonical <= opts.startDate`, date.ts:105 | accepts null (no end) and dates >= startDate within the horizon |
| habits-date.test.ts | parseWeekdayMask — caller zero-mask rejection | 14 | 3 | lib/habits/date.ts `parseWeekdayMask` | KEEP | `input < WEEKDAY_MASK_MIN` -> `input <= WEEKDAY_MASK_MIN`, date.ts:116 | accepts integers 1..127 |
| habits-date.test.ts | weekday bits (Mon=bit0 … Sun=bit6) | 13 | 2 | lib/habits/date.ts `weekdayBit`, `maskCoversDate` | KEEP | `dow === 0 ? 6 : dow - 1` -> `dow === 0 ? 5 : dow - 1`, date.ts:126 | maps known dates to ISO weekday bits; maskCoversDate applies the mask |
| habits-date.test.ts | shiftDateUtc + serverTodayUtc (UTC-pinned) | 27 | 2 | lib/habits/date.ts `shiftDateUtc` | KEEP | `d + days` -> `d - days`, date.ts:57 | shifts across month/year and leap boundaries |
| habits-date.test.ts | habitPeriodDays | 16 | 2 | lib/habits/date.ts `habitPeriodDays` | KEEP | `PERIOD_DAYS[period] ?? null` -> `?? 0`, date.ts:147 | rejects unknown periods |
| habits-date.test.ts | formatHabitDate — timezone-independent display | 6 | 1 | lib/habits/date.ts `formatHabitDate` | KEEP | `timeZone: "UTC"` -> `timeZone: "America/New_York"`, date.ts:159 | formats the declared date pinned to UTC |
| invite-acceptance.test.ts | getInviteLinkState (non-consuming peek) | 62 | 3 | lib/workspace/invite-acceptance.ts `getInviteLinkState` | KEEP | `!peek.valid \|\| peek.purpose !== "WORKSPACE_INVITE"` -> `!peek.valid`, invite-acceptance.ts:52 | returns invalid for every non-active or foreign shape |
| invite-acceptance.test.ts | acceptInvitationMessage (safe error mapping) | 55 | 3 | lib/workspace/invite-acceptance.ts `acceptInvitationMessage` | KEEP | `if (error instanceof InvitationError)` -> `if (!(error instanceof InvitationError))`, invite-acceptance.ts:125 | maps token failures to one generic invalid-link message; explains identity and policy failures accessibly; never echoes input or internals for remaining codes |
| onboarding-draft-editor.dom.test.tsx | DraftEditor — mount surface + client-local edit contract | 23 | 2 | components/onboarding/draft-editor.tsx `updateName` | KEEP | `({ ...prev, name, dirty: true })` -> `dirty: false`, draft-editor.tsx:116 | a metadata edit arms dirty and enables save (mutation also failed 6 tests in other blocks) |
| onboarding-draft-editor.dom.test.tsx | DraftEditor — props reseed through the real component | 58 | 3 | components/onboarding/state.ts `reseedDraftState` | KEEP | `local.dirty \|\| incoming.revision < local.revision` -> `incoming.revision < local.revision`, state.ts:73 | preserves dirty local edits when NEWER server props arrive |
| onboarding-draft-editor.dom.test.tsx | DraftEditor — save wiring | 321 | 10 | components/onboarding/draft-editor.tsx `save` + state.ts `adoptSavedResult` | KEEP | `state.fields.map(toPayloadField)` -> `state.fields`, draft-editor.tsx:212 | cleared helpText saves as a normalized omission — the emptied input is not persisted |
| onboarding-draft-editor.dom.test.tsx | DraftEditor — field structure ops (DOM-visible) | 122 | 12 | components/onboarding/state.ts `addDraftField`, draft-editor.tsx structure ops | KEEP | `{ options: [{ label: "" }] }` -> `{ options: [{ label: "pre-filled" }] }`, state.ts:117 | adding a singleChoice field via the real control renders exactly one blank option row; adding a singleChoice field renders a new row; adding a multiChoice field renders a new row |
| onboarding-draft-editor.dom.test.tsx | DraftEditor — structure-ops payload subset (deferred to ES-3) | 113 | 4 | components/onboarding/draft-editor.tsx `removeField`/`moveFieldUp` reindex | KEEP | `order: i` -> `order: i + 10` in the removeField reindex, draft-editor.tsx:127 | remove+add payload: contiguous orders, surviving field/option ids, no retired-id resurrection; move+remove payload: surviving choice field keeps option values AND optionIds |
| onboarding-draft-editor.dom.test.tsx | DraftEditor — lifecycle controls | 190 | 7 | components/onboarding/draft-editor.tsx `publish`/`archive` | KEEP | `disabled={pending \|\| state.dirty}` -> `disabled={pending}` on publish, draft-editor.tsx:435 | publish is enabled on a clean mount, disabled while dirty, re-enabled after save |
| onboarding-draft-editor.dom.test.tsx | OpenDraftButton — reopen surface | 45 | 2 | components/onboarding/open-draft-button.tsx `reopen` | KEEP | `openDraft(workspaceId, formData)` -> `openDraft(workspaceId, new FormData())`, open-draft-button.tsx:51 | issues openDraft exactly once with formId |
| onboarding-forms.test.ts | P-008 validation — definition bounds | 168 | 6 | lib/onboarding/forms.ts `validateDefinition` | KEEP | `labelMax: 200` -> `labelMax: 201`, forms.ts:51 | rejects over-limit fields, labels, help text, options, names |
| onboarding-forms.test.ts | P-008 validation — field ID trust | 105 | 2 | lib/onboarding/forms.ts `validateDefinition` (forged-id rule) | KEEP | `if (knownKind === undefined \|\| knownKind !== kind)` -> `if (false)`, forms.ts:167 | round-trips server-issued IDs and rejects forged/removed ones |
| onboarding-forms.test.ts | P-008 boundary — raw payload bound before parse | 27 | 1 | lib/onboarding/forms-boundary.ts `saveDraftFromAction` | CUT | duplicates another block's coverage: onboarding-forms-boundary.test.ts has the same-named block asserting the identical oversized-draftJson rejection plus stronger spy assertions (JSON.parse not called, service not called) | none (cut on sight) |
| onboarding-forms.test.ts | P-008 RBAC — onboardingFormTemplates | 33 | 2 | lib/auth/rbac.ts `resolveScope` matrix row | KEEP | `COACH: c("workspace", "workspace")` -> `COACH: D` in the onboardingFormTemplates row, rbac.ts:275 | owner and coach have workspace read/write; others denied (note: the block's second test, FIELD_KINDS length 6, is a constant pin; block kept on the matrix-row test) |
| onboarding-forms.test.ts | P-008 seam — app never imports the service | 20 | 1 | repo invariant: no app/** file imports lib/onboarding/forms | KEEP | injected `import "@/lib/onboarding/forms";` into app/.../onboarding/actions.ts:3 | no app/route file imports lib/onboarding/forms directly |
| password-policy.test.ts | S1-F2B password policy | 102 | 10 | lib/password-policy.ts `validatePasswordPolicy`, lib/password.ts | KEEP | `PASSWORD_MIN_CODE_POINTS = 10` -> `= 11`, password-policy.ts:23 | bounds are the approved values; accepts exactly 10 and exactly 128 code points; counts code points not UTF-16 units; NFC-normalizes canonically equivalent input; imposes no composition rules (plus 3 failures in the next block). Note: "bounds are the approved values" is a constant pin; block kept on the 9 behavioral tests |
| password-policy.test.ts | P3.1+P3.2 setup password policy | 42 | 5 | lib/password-policy.ts `validatePasswordSetup` | KEEP | `/[0-9]/` -> `/[0-9]{2}/` in the digit check, password-policy.ts:63 | accepts a ≥10-code-point password containing a digit; still NFC-normalizes before the digit check and return |
| password-policy.test.ts | hash boundary normalization | 10 | 1 | lib/password.ts `hashPassword` | KEEP | `derive(password.normalize("NFC"), salt, KEY_LENGTH, ...)` -> `derive(password, salt, KEY_LENGTH, ...)`, password.ts:47 | hashPassword canonicalizes even when called without the policy |

## Per-file verdict

- tests/integration/phase-1-1-daily-tracker-guard.test.ts: KEEP-ALL
- tests/integration/phase-2-2-exercise-import.test.ts: KEEP-ALL
- tests/integration/phase-3-2-password-reset.test.ts: KEEP-ALL
- tests/unit/guard.test.ts: KEEP-ALL
- tests/unit/habits-date.test.ts: KEEP-ALL
- tests/unit/invite-acceptance.test.ts: KEEP-ALL
- tests/unit/onboarding-draft-editor.dom.test.tsx: KEEP-ALL
- tests/unit/onboarding-forms.test.ts: TRIM (keep blocks: definition bounds, field ID trust, RBAC, seam; cut: raw payload bound before parse)
- tests/unit/password-policy.test.ts: KEEP-ALL

## Could not check

None. All 9 files ran; all 33 blocks judged.

## Self-check

- (a) Every assigned file has its blocks listed: PASS — 9 files, 33 blocks
  (1+1+1+6+7+2+7+5+3), matching `grep -n "^describe\|describe("` output.
- (b) Every KEEP block has a lever mutation that failed one of its own tests:
  PASS — 32 mutation runs, each logged `LEVER: mutated ... restored`, each
  produced failures in the target block (names in table).
- (c) `git status` in worktree clean: PASS — `git status --porcelain` shows
  only `?? npm-ci.log` (pre-existing untracked file, present before any work);
  all lever restores confirmed in logs.
- (d) Wrote nothing in the main repo outside this output file: PASS — the
  only main-repo write is this file; the dirty entries in the main repo
  `git status` predate this session (other fleet lanes working there).
