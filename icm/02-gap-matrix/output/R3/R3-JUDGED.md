# Round 3 independent judgment

## Scope and method

Source is `/home/nexuslink/vari8-worktrees/merge-proto`, verified HEAD `58eb6edc33e73dc1f6d3a0919bc71739683e247d`. Canvas authority and D10/D12 govern the verdicts. Only this report is an allowed write. No application server, browser or persistent process was started. One terminating Node check read the pure validator in memory.

Plan: collect the six canonical new-row tables, reconcile every id, compare against F1 and V, deduplicate semantic elements, open all CONFLICT citations and disagreement cases, use reproducible random samples for the rest, expand any lane above the correction/rejection threshold, then independently re-read 40 G4 dismissals and validate the accounting. Python stdlib parsing and checks run in memory.

## Intake inventory

| Lane | Canonical rows |
|---|---:|
| G1 | 12 |
| G2 | 3 |
| G3 | 17 |
| G4 | 58 |
| G5 | 7 |
| G6 | 15 |

Rows in: 112. G4-rows-final.md repeats the 58 rows in G4.md. G6 parts repeat the 15 rows in the G6.md New rows section; its census-id mapping table is not another set of rows.

Final verdicts and the mandatory self-check follow below.

## Verified review milestones

- All 35 submitted CONFLICT rows have had their canvas rule opened. Backend counterpart definitions, absence searches, and the cited product decisions were read independently, including the exact limits of decisions 108, 110, 115 and 116. The training-program follow-on restriction is not a global prohibition on calendar arithmetic.
- Random sample seed is 20261018, Python random.Random. Initial non-CONFLICT samples are recorded in the final reliability section. Review expanded to all 112 input rows, so no retained row will be labelled UNSAMPLED.
- The original G4 first-pass files contain the requested 1,328 dismissals; the second pass leaves 1,317 manual dismissals. Forty original and forty final dismissals were opened, with two overlapping units. The final census also has 172 automatic dismissals.
- G5's ui.tsx stack frames were resolved to actual callers: today-view.tsx:103-113, setup-ui.tsx:641-647, check-ins.tsx:128-140 and media.tsx:263-265.

## Final summary

All 112 submitted new rows were reviewed from source. No retained row is UNSAMPLED. A file/symbol outside an earlier citation range is not automatically a new canvas element. Exact arithmetic in the canvas is evidence, not an invented unknown formula. Existing widget rows own the same feed gaps even when a lane cites a different renderer. New validation/rule mismatches remain separate when the earlier row did not state that rule.

| Lane | Rows in |
|---|---:|
| G1 | 12 |
| G2 | 3 |
| G3 | 17 |
| G4 | 58 |
| G5 | 7 |
| G6 | 15 |

- Input arithmetic: 12 + 3 + 17 + 58 + 7 + 15 = 112.
- Semantic deduplication: 112 - 23 repeated claims = 89 unique claim groups. The merge ledger below retains every original id and all contributing lanes.
- Novelty arithmetic: 89 = 61 DUP-EXISTING + 3 REJECTED + 25 surviving rows.
- Unique-group checks: 56 CONFIRMED + 30 CORRECTED + 3 REJECTED = 89. A group is CORRECTED if any constituent claim required a correction. DUP-EXISTING is a novelty disposition, not a claim-accuracy verdict.
- Original-row reliability: 68 CONFIRMED + 41 CORRECTED + 3 REJECTED = 112. These are the per-lane denominators below. Corrections include unsupported requirements, factual claims and citations even when the status stays the same.
- Surviving checks: 19 CONFIRMED + 6 CORRECTED = 25.
- Surviving status arithmetic: 7 CONFLICT + 1 MISSING + 6 ORPHAN + 7 PARTIAL + 3 ROLES + 1 UNWIRED = 25. ROLES = 3 of these rows, not extra gaps.
- PARKED-D12 = 2 unique groups, G6-102 and G6-504. Both also duplicate existing capability rows and are included in the 61 DUP-EXISTING groups, not in the 25 active survivors. The appendix preserves them without inventing new work. Consent-only subclaims inside G6-201/G6-401 are also parked, but do not add rows.

## Surviving rows

Source-code paths in this report resolve under the read-only merge-proto root above. `icm/` paths resolve under the Vari8 workspace. D10/D12 refer to `icm/03-plan/DECISIONS.md:62-68`, not the historical source-tree policy. CONFLICT identifies an explicit current contract mismatch to reconcile; it is not permission to delete a canvas element. ORPHAN does not authorize adding a new canvas screen.

| id | lanes | surface | element | status | canvas path:line | backend path:line or none (searched: ...) | judge check |
|---|---|---|---|---|---|---|---|
| G1-01 | G1 | Shared shell | Global user reduced-motion policy | MISSING | frontend/src/components/motion-provider.tsx:6-8; frontend/src/app/layout.tsx:20 | none for MotionConfig, searched root app/, components/, lib/; app/layout.tsx:10-29 has no provider; app/globals.css:1439-1443,1512-1515 only covers selected CSS transitions | CONFIRMED |
| G4-03 | G4 | Dashboard periods | Coaching/detail widget period and history-week vocabulary | PARTIAL | frontend/src/components/coach/builder/coaching-content.tsx:29-32; frontend/src/components/coach/builder/additional-widget-content.tsx:109-124; frontend/src/components/ethereal/builder/coaching-content.tsx:393 | lib/habits/date.ts:136-147; lib/dashboard/config-schema.ts:174-182 | CONFIRMED |
| G4-07 | G4 | Nutrition history | Nutrition rolling window and declared as-of date | PARTIAL | frontend/src/components/coach/builder/nutrition-content.tsx:80-97; frontend/src/components/coach/builder/nutrition-history.tsx:23-31 | lib/habits/date.ts:136-147; lib/habits/service.ts:1059-1063; no nutrition feed, searched lib/mealplan/, lib/nutrition/, db/schema.prisma for macroIntake/calorieIntake | CORRECTED |
| G4-08 | G4 | Nutrition widgets | Computed attainment and below/above/minimum status | CONFLICT | frontend/src/components/coach/builder/nutrition-content.tsx:109-129; frontend/src/components/ethereal/builder/nutrition-content.tsx:109 | lib/mealplan/payload.ts:16-17,40-51; docs/product-decisions.md:1653-1657 | CONFIRMED |
| G4-09 | G4 | Nutrition widgets | Fixed-target percent and ring fill | CONFLICT | frontend/src/components/coach/builder/nutrition-content.tsx:202-222,643; frontend/src/components/ethereal/builder/nutrition-content.tsx:217-222 | lib/mealplan/payload.ts:16-17; docs/product-decisions.md:1653-1657 | CONFIRMED |
| G4-10 | G4 | Nutrition widgets | Configured TD/NTD/active source mapping | PARTIAL | frontend/src/components/coach/builder/nutrition-content.tsx:30-32; frontend/src/components/ethereal/builder/nutrition-content.tsx:30-32 | lib/dashboard/config-schema.ts:104-105; lib/mealplan/payload.ts:40-73 | CORRECTED |
| G4-11 | G4 | Widget gallery | Non-empty title and required visible-field validation | PARTIAL | frontend/src/components/coach/builder/gallery.tsx:235-257 | lib/dashboard/config-schema.ts:331-355,369-376 | CONFIRMED |
| G4-12 | G4 | Widget gallery | Per-kind and per-source unit allowlist | PARTIAL | frontend/src/components/coach/builder/gallery.tsx:1169-1179 | lib/dashboard/config-schema.ts:354-355,616-641 | CONFIRMED |
| G4-14 | G4 | Nutrition history | Weekly/monthly means of intake and target bounds | CONFLICT | frontend/src/components/coach/builder/nutrition-history.tsx:126-164; frontend/src/components/ethereal/builder/nutrition-history.tsx:126-164 | lib/mealplan/payload.ts:16-17,148-172; docs/product-decisions.md:1653-1656 | CONFIRMED |
| G4-15 | G4 | Progress widgets | Progress inclusive period-window selection | PARTIAL | frontend/src/components/coach/builder/progress-content.tsx:22-40; frontend/src/components/ethereal/builder/progress-content.tsx:22-40 | lib/habits/date.ts:136-147; lib/daily-entry/week-groups.ts:43-58; lib/dashboard/config-schema.ts:177-182 | CORRECTED |
| G4-18 | G4 | Nutrition targets | Collapsing a range target to one midpoint | CONFLICT | frontend/src/components/coach/client-preview.tsx:408-411; frontend/src/components/coach/plans/domain.ts:195-200 | lib/mealplan/payload.ts:43-44,148-172; docs/product-decisions.md:1653-1656 | CONFIRMED |
| G4-27 | G4 | Habit consistency | Percent fill derived from done/scheduled counts | CONFLICT | frontend/src/components/ethereal/builder/coaching-content.tsx:517-524,572 | lib/habits/service.ts:93-108,1073; docs/product-decisions.md:1450-1454 | CONFIRMED |
| G4-45 | G4 | Tracker library | Calories as an ordinary entered parameter | CONFLICT | frontend/src/components/ethereal/client-tracker/model.ts:83-91 | lib/daily-tracker.ts:192-195; db/schema.prisma:781-790; docs/product-decisions.md:299-300,655-659 | CONFIRMED |
| G4-53 | G4 | Meal-plan setup | Automatic starter meals, food picks and quantities | CONFLICT | frontend/src/components/ethereal/mealplan/model.ts:353-420,431-438; frontend/src/components/ethereal/mealplan/mealplan-workspace.tsx:176 | lib/mealplan/payload.ts:53-78; docs/product-decisions.md:1653-1657; none for scaffold/recommendation, searched lib/mealplan/, lib/nutrition/, db/schema.prisma | CONFIRMED |
| G6-201 | G6 | Check-in/onboarding errors | Map ordinary server rejection and stale/conflict states to canvas messages | UNWIRED | frontend/src/components/coach/templates.tsx:499-502,600-602; frontend/src/components/coach/check-ins.tsx:753 | lib/checkin/forms.ts:33-41; lib/checkin/instances.ts:57-66; lib/onboarding/forms.ts:21-29 | CONFIRMED |
| G6-301 | G6 | Backend orphan | Template-version upgrade/rollback discovery, review and execute | ORPHAN | none, searched frontend/src for upgrade, rollback and versionSeq; frontend/src/components/coach/model.ts:704-715 has assignment/storage ids, not a transition UI | lib/coaching/client-setup-transition.ts:484,534,591; app/workspace/[workspaceId]/client-setups/transition-panel.tsx:14-30 | CONFIRMED |
| G6-302 | G6 | Backend orphan | Parameter-definition create/edit/archive manager | ORPHAN | frontend/src/components/coach/templates.tsx:1173-1186 is a picker only; none for manager, searched frontend/src for createParameter/archiveParameter | app/workspace/[workspaceId]/parameters/parameter-manager.tsx:53-62; lib/coaching/parameters.ts:650,904 | CONFIRMED |
| G6-303 | G6 | Backend orphan | Client-task title/date editing and cancellation | ORPHAN | frontend/src/components/coach/clients.tsx:673-727 draws add/toggle only; none for edit/cancel, searched clientTasks handlers | lib/tasks/service.ts:311,391; app/workspace/[workspaceId]/clients/[clientProfileId]/dashboard/actions.ts:52-84 | CONFIRMED |
| G6-401 | G6 | Plan errors | Render server/CAS/timezone/publish errors, not just local validation | PARTIAL | frontend/src/components/coach/plans/workspace.tsx:325-336,498-507 | lib/mealplan/boundary.ts:28-55; lib/trainingprogram/boundary.ts:39-67 | CONFIRMED |
| G6-402 | G6 | Backend orphan | Dead duplicate sheetDisplayName helper | ORPHAN | none, searched frontend/src for sheetDisplayName | lib/catalog.ts:172-174; live duplicate lib/spec-artifacts.ts:32-34; no production caller for catalog copy, searched app/, lib/, components/, scripts/ | CONFIRMED |
| G6-403 | G6 | Backend orphan | Public synthetic fixture library pages, not canvas catalog editors | ORPHAN | frontend/src/components/coach/plans/training/editor.tsx:974-977 uses editable coach-store library; not these pages | app/library/foods/page.tsx:1-26; app/library/exercises/page.tsx:1-27; app/layout.tsx:10-29 | CONFIRMED |
| G6-404 | G6 | Backend orphan | Uncalled versionForWeek helper | ORPHAN | none, searched frontend/src for versionForWeek | lib/trainingprogram/weeks.ts:185-211; no production caller, searched lib/, app/, components/, scripts/ | CONFIRMED |
| G6-501 | G6 | ROLES decision | Platform-admin administrative/catalog/audit capability cells | ROLES | none, searched frontend/src for PLATFORM_ADMIN and admin-console controls | lib/auth/rbac.ts:87,95,237,253; docs/security/authorization-model.md:27-28,43,45 | CORRECTED |
| G6-502 | G6 | ROLES decision | Assistant read-only/assigned capability cells | ROLES | none, searched frontend/src for ASSISTANT_COACH and assistant persona | lib/auth/rbac.ts:90,127,135,150,240; docs/security/authorization-model.md:27,31-46 | CORRECTED |
| G6-503 | G6 | ROLES decision | Workspace-wide canvas roster versus assigned-scope actor view | ROLES | frontend/src/components/coach/clients.tsx:65-91 | lib/auth/rbac.ts:126-135; lib/workspace/clients.ts:103-120; docs/security/authorization-model.md:31-36 | CORRECTED |

The range-midpoint, attainment, percentage, habit-percent and ordinary-CALORIES conflicts have explicit source rules. Do not extend them to every date calculation, typed Json payload or synthetic sample generator. The period rows are separate contracts: coaching/detail windows, nutrition rolling windows and progress windows have different vocabularies and fallbacks. Share implementation where equivalent, but do not erase their differences during deduplication.

## Merge ledger

Only genuinely repeated data/rule claims merge. Renderers, actions, and data fields are not merged merely because they share a file basename. G4 coach/ethereal copies merge where they implement the same computation. Every member still has its own verdict in the input ledger.

| Group | Input ids | Lanes | Final disposition |
|---|---|---|---|
| G1-01 | G1-01 | G1 | SURVIVES |
| G1-02 | G1-02 | G1 | DUP-EXISTING |
| G1-03 | G1-03 | G1 | DUP-EXISTING |
| G1-04 | G1-04 | G1 | DUP-EXISTING |
| G1-05 | G1-05 | G1 | DUP-EXISTING |
| G1-06 | G1-06 | G1 | DUP-EXISTING |
| G1-07 | G1-07 | G1 | DUP-EXISTING |
| G1-08 | G1-08 | G1 | DUP-EXISTING |
| G1-09 | G1-09 | G1 | DUP-EXISTING |
| G1-10 | G1-10 | G1 | DUP-EXISTING |
| G1-11 | G1-11 | G1 | DUP-EXISTING |
| G1-12 | G1-12 | G1 | DUP-EXISTING |
| G2-01 | G2-01 | G2 | DUP-EXISTING |
| G2-02 | G2-02 | G2 | DUP-EXISTING |
| G2-03 | G2-03 | G2 | DUP-EXISTING |
| G3-01 | G3-01 | G3 | DUP-EXISTING |
| G3-02 | G3-02 | G3 | DUP-EXISTING |
| G3-03 | G3-03 | G3 | DUP-EXISTING |
| G3-04 | G3-04 | G3 | DUP-EXISTING |
| G3-05 | G3-05 | G3 | DUP-EXISTING |
| G3-06 | G3-06, G4-51 | G3,G4 | DUP-EXISTING |
| G3-07 | G3-07 | G3 | DUP-EXISTING |
| G3-08 | G3-08 | G3 | DUP-EXISTING |
| G3-09 | G3-09 | G3 | DUP-EXISTING |
| G3-10 | G3-10 | G3 | DUP-EXISTING |
| G3-12 | G3-12 | G3 | DUP-EXISTING |
| G3-13 | G3-13 | G3 | DUP-EXISTING |
| G3-14 | G3-14 | G3 | DUP-EXISTING |
| G3-15 | G3-15 | G3 | DUP-EXISTING |
| G3-16 | G3-16 | G3 | DUP-EXISTING |
| G3-17 | G3-17 | G3 | DUP-EXISTING |
| G4-01 | G4-01, G4-25, G4-56 | G4 | DUP-EXISTING |
| G4-02 | G4-02, G4-26, G3-11 | G3,G4 | DUP-EXISTING |
| G4-03 | G4-03, G4-29 | G4 | SURVIVES |
| G4-04 | G4-04 | G4 | DUP-EXISTING |
| G4-05 | G4-05, G4-19, G4-34, G4-40 | G4 | DUP-EXISTING |
| G4-06 | G4-06, G4-13 | G4 | DUP-EXISTING |
| G4-07 | G4-07, G4-35 | G4 | SURVIVES |
| G4-08 | G4-08, G4-36 | G4 | SURVIVES |
| G4-09 | G4-09, G4-38 | G4 | SURVIVES |
| G4-10 | G4-10, G4-58 | G4 | SURVIVES |
| G4-11 | G4-11 | G4 | SURVIVES |
| G4-12 | G4-12 | G4 | SURVIVES |
| G4-14 | G4-14, G4-39 | G4 | SURVIVES |
| G4-15 | G4-15, G4-41 | G4 | SURVIVES |
| G4-16 | G4-16, G4-42, G4-44 | G4 | DUP-EXISTING |
| G4-17 | G4-17, G4-23 | G4 | DUP-EXISTING |
| G4-18 | G4-18, G4-22 | G4 | SURVIVES |
| G4-20 | G4-20, G4-46, G4-47 | G4 | DUP-EXISTING |
| G4-21 | G4-21 | G4 | DUP-EXISTING |
| G4-24 | G4-24 | G4 | DUP-EXISTING |
| G4-27 | G4-27 | G4 | SURVIVES |
| G4-28 | G4-28, G4-55 | G4 | DUP-EXISTING |
| G4-30 | G4-30 | G4 | DUP-EXISTING |
| G4-31 | G4-31 | G4 | DUP-EXISTING |
| G4-32 | G4-32 | G4 | DUP-EXISTING |
| G4-33 | G4-33 | G4 | DUP-EXISTING |
| G4-37 | G4-37 | G4 | REJECTED |
| G4-43 | G4-43 | G4 | DUP-EXISTING |
| G4-45 | G4-45 | G4 | SURVIVES |
| G4-48 | G4-48 | G4 | DUP-EXISTING |
| G4-49 | G4-49 | G4 | DUP-EXISTING |
| G4-50 | G4-50 | G4 | DUP-EXISTING |
| G4-52 | G4-52 | G4 | DUP-EXISTING |
| G4-53 | G4-53 | G4 | SURVIVES |
| G4-54 | G4-54 | G4 | DUP-EXISTING |
| G4-57 | G4-57 | G4 | REJECTED |
| G5-01 | G5-01 | G5 | DUP-EXISTING |
| G5-02 | G5-02 | G5 | REJECTED |
| G5-03 | G5-03 | G5 | DUP-EXISTING |
| G5-04 | G5-04 | G5 | DUP-EXISTING |
| G5-05 | G5-05 | G5 | DUP-EXISTING |
| G5-06 | G5-06 | G5 | DUP-EXISTING |
| G5-07 | G5-07 | G5 | DUP-EXISTING |
| G6-101 | G6-101 | G6 | DUP-EXISTING |
| G6-102 | G6-102 | G6 | DUP-EXISTING |
| G6-103 | G6-103 | G6 | DUP-EXISTING |
| G6-201 | G6-201 | G6 | SURVIVES |
| G6-301 | G6-301 | G6 | SURVIVES |
| G6-302 | G6-302 | G6 | SURVIVES |
| G6-303 | G6-303 | G6 | SURVIVES |
| G6-401 | G6-401 | G6 | SURVIVES |
| G6-402 | G6-402 | G6 | SURVIVES |
| G6-403 | G6-403 | G6 | SURVIVES |
| G6-404 | G6-404 | G6 | SURVIVES |
| G6-501 | G6-501 | G6 | SURVIVES |
| G6-502 | G6-502 | G6 | SURVIVES |
| G6-503 | G6-503 | G6 | SURVIVES |
| G6-504 | G6-504 | G6 | DUP-EXISTING |

## DUP-EXISTING

These are 61 unique groups, not 61 original inputs. The input ids in the merge ledger prevent double counting. An existing row may be broad, but it must actually name the same element, operation, value or state. An uncited implementation helper alone does not invalidate that coverage.

| Group | Lanes | Existing row ids | Evidence in existing coverage | Same element |
|---|---|---|---|---|
| G1-02 | G1 | S10-11, S01-41 | icm/02-gap-matrix/output/F1/S10-appearance-ethereal.md:77; icm/02-gap-matrix/output/F1/S01-shell-roster.md:65 | Shared `Button` primitive and `buttonVariants` (base-ui plus cva), consumer `ethereal/foundation-components.tsx:13` |
| G1-03 | G1 | S01-13, V3:78 | icm/02-gap-matrix/output/F1/S01-shell-roster.md:37; icm/02-gap-matrix/output/V/V3-views.md:78 | Coach store `Context`, `useCoach` hook and `CoachProvider` |
| G1-04 | G1 | S10-04 | icm/02-gap-matrix/output/F1/S10-appearance-ethereal.md:70 | Ethereal root component `CoachingApp` |
| G1-05 | G1 | S06-13, S07-16, V3:55-60 | icm/02-gap-matrix/output/F1/S06-nutrition.md:39; icm/02-gap-matrix/output/F1/S07-training.md:73; icm/02-gap-matrix/output/V/V3-views.md:55-60 | Client preview tab bodies `NutritionTab` and `TrainingTab`, including the `illustrative` sample-versus-assigned branch |
| G1-06 | G1 | S08-14..33, V3:49 | icm/02-gap-matrix/output/F1/S08-dashboard-builder.md:81-100; icm/02-gap-matrix/output/V/V3-views.md:49 | Exported widget content dispatchers `CoachingWidgetContent` and `ProgressWidgetContent` |
| G1-07 | G1 | S08-04 | icm/02-gap-matrix/output/F1/S08-dashboard-builder.md:71 | `GalleryWidgetPreview` live widget preview inside the builder gallery |
| G1-08 | G1 | S08-11, S08-13 | icm/02-gap-matrix/output/F1/S08-dashboard-builder.md:78-80 | `LocalDialog` in-surface dialog primitive used by the builder |
| G1-09 | G1 | S05-11, S05-22 | icm/02-gap-matrix/output/F1/S05-templates-setup.md:29-40 | `OrderButtons` reorder control for template rows |
| G1-10 | G1 | S08-13, S01-41 | icm/02-gap-matrix/output/F1/S08-dashboard-builder.md:80; icm/02-gap-matrix/output/F1/S01-shell-roster.md:65 | Shared widget content primitives used by every widget kind: `Empty`, `usePlotWidth`, `LinePlot`, `TaskRow`, `DetailRows` |
| G1-11 | G1 | S08-15, S08-28 | icm/02-gap-matrix/output/F1/S08-dashboard-builder.md:82-95 | Chart and toggle renderers `DatedPlot`, `BodyweightPlot`, `TaskToggle` |
| G1-12 | G1 | S08-18, S08-13 | icm/02-gap-matrix/output/F1/S08-dashboard-builder.md:80-85 | Nutrition history chart panel `LinePanel` and widget detail table `DetailTable` |
| G2-01 | G2 | S06-10 | icm/02-gap-matrix/output/F1/S06-nutrition.md:36 | Saved meals library: rename form. Label "Meal name", text input with `maxLength=120` and `aria-invalid`/`aria-describedby`, submit "Save name", "Cancel", Escape cancels the rename, and the validation error state "Enter a meal name." rendered in `role="alert"` |
| G2-02 | G2 | S06-10 | icm/02-gap-matrix/output/F1/S06-nutrition.md:36 | Saved meals library: search and empty states. Search input "Search meals or foods…" matching meal name or any food or swap name, count line "{n} of {m} saved meals", empty states "No matching meals." and "No saved meals yet.", "Clear search" button, the mobile select disabled with the "No meals available" fallback option, and the detail pane state "This saved meal has no foods." |
| G2-03 | G2 | S06-10 | icm/02-gap-matrix/output/F1/S06-nutrition.md:36 | Saved meals library: delete with Undo. Delete removes the meal, a `role="status"` notice shows "…deleted from saved meals." with an "Undo delete" button that restores the meal at its original index, a dismiss control, and "…restored." on undo. Rename and duplicate reuse the same notice |
| G3-01 | G3 | S09-22, S09-23 | icm/02-gap-matrix/output/F1/S09-client-tracker.md:63-64 | Fixture unit preferences (4 keys) |
| G3-02 | G3 | S11-06 | icm/02-gap-matrix/output/F1/S11-identity-access.md:93 | Fixture client height (1 key) |
| G3-03 | G3 | S09-19 | icm/02-gap-matrix/output/F1/S09-client-tracker.md:60 | Fixture bodyweight series (2 keys) |
| G3-04 | G3 | S11-06 | icm/02-gap-matrix/output/F1/S11-identity-access.md:93 | Fixture coaching-since date (1 key) |
| G3-05 | G3 | S01-22, S11-06 | icm/02-gap-matrix/output/F1/S01-shell-roster.md:46; icm/02-gap-matrix/output/F1/S11-identity-access.md:93 | Fixture profile identity block (4 keys) |
| G3-06 | G3,G4 | S01-33 | icm/02-gap-matrix/output/F1/S01-shell-roster.md:57 | Fixture profile tasks (3 keys) |
| G3-07 | G3 | S01-34, S03-24 | icm/02-gap-matrix/output/F1/S01-shell-roster.md:58; icm/02-gap-matrix/output/F1/S03-check-ins.md:68 | Fixture check-in history (3 keys) |
| G3-08 | G3 | S01-31, S11-10 | icm/02-gap-matrix/output/F1/S01-shell-roster.md:55; icm/02-gap-matrix/output/F1/S11-identity-access.md:97 | Fixture general notes (1 key) |
| G3-09 | G3 | S08-34 | icm/02-gap-matrix/output/F1/S08-dashboard-builder.md:101 | Fixture dashboard envelope (5 keys) |
| G3-10 | G3 | S08-15, S08-16 | icm/02-gap-matrix/output/F1/S08-dashboard-builder.md:82-83 | Fixture dashboard bodyweight widget (8 keys) |
| G3-12 | G3 | S07-21, S08-19 | icm/02-gap-matrix/output/F1/S07-training.md:78; icm/02-gap-matrix/output/F1/S08-dashboard-builder.md:86 | Fixture dashboard training widget (4 keys) |
| G3-13 | G3 | S08-22, S08-23 | icm/02-gap-matrix/output/F1/S08-dashboard-builder.md:89-90 | Fixture dashboard recovery widget (4 keys) |
| G3-14 | G3 | S04-13, S08-24 | icm/02-gap-matrix/output/F1/S04-habits.md:55; icm/02-gap-matrix/output/F1/S08-dashboard-builder.md:91 | Fixture dashboard habits widget (4 keys) |
| G3-15 | G3 | S08-29, S08-30 | icm/02-gap-matrix/output/F1/S08-dashboard-builder.md:96-97 | Fixture dashboard check-in and feedback widgets (5 keys) |
| G3-16 | G3 | S01-26, S06-01 | icm/02-gap-matrix/output/F1/S01-shell-roster.md:50; icm/02-gap-matrix/output/F1/S06-nutrition.md:27 | Fixture meal plan header (3 keys) |
| G3-17 | G3 | S06-03..07, S06-13 | icm/02-gap-matrix/output/F1/S06-nutrition.md:29-39 | Fixture meal plan variants and meals (17 keys) |
| G4-01 | G4 | S08-15, S08-16 | icm/02-gap-matrix/output/F1/S08-dashboard-builder.md:82-83 | BN08 weekly bodyweight average and week-over-week change detail |
| G4-02 | G3,G4 | S08-17, S08-18 | icm/02-gap-matrix/output/F1/S08-dashboard-builder.md:84-85 | BN19 nutrition target and intake resolution for one nutrient and day type |
| G4-04 | G4 | S04-13, S08-24 | icm/02-gap-matrix/output/F1/S04-habits.md:55; icm/02-gap-matrix/output/F1/S08-dashboard-builder.md:91 | Habit status vocabulary for a scheduled day |
| G4-05 | G4 | S08-17, S08-18 | icm/02-gap-matrix/output/F1/S08-dashboard-builder.md:84-85 | Nutrition dated target applicability (which fixed, range or minimum target applies per macro and per training-day or rest-day option) |
| G4-06 | G4 | S08-18 | icm/02-gap-matrix/output/F1/S08-dashboard-builder.md:85 | Nutrition logged intake lookup by date and option |
| G4-16 | G4 | S08-14..33 | icm/02-gap-matrix/output/F1/S08-dashboard-builder.md:81-100 | Progress widget value computations in ProgressBody (latest, average, total, trailing 7-day and weekly averages, week-over-week and percent change, unit conversion, current and next workout with Evergreen, task due window, roadmap weekly trends) |
| G4-17 | G4 | S06-08, S06-15, V3:56 | icm/02-gap-matrix/output/F1/S06-nutrition.md:34-41; icm/02-gap-matrix/output/V/V3-views.md:56 | IIFYM preview automatic energy total and macro percentage |
| G4-20 | G4 | S09-18, S09-19 | icm/02-gap-matrix/output/F1/S09-client-tracker.md:59-60 | weekly average of a tracker parameter (week view summary) |
| G4-21 | G4 | S09-08 | icm/02-gap-matrix/output/F1/S09-client-tracker.md:49 | Rating tone thresholds: score >= 8 reads good, <= 3 reads poor, polarity set per parameter (sleep-quality and energy positive-when-high; stress, muscle-soreness, pain-discomfort, pms-severity negative-when-high) |
| G4-24 | G4 | S05-20, S07-13 | icm/02-gap-matrix/output/F1/S05-templates-setup.md:38; icm/02-gap-matrix/output/F1/S07-training.md:70 | new training set and exercise defaults |
| G4-28 | G4 | S08-32 | icm/02-gap-matrix/output/F1/S08-dashboard-builder.md:99 | Phase progress (length in days, elapsed days, week N of M, elapsed percentage) and days remaining to a milestone |
| G4-30 | G4 | S07-17, S08-27, S08-31 | icm/02-gap-matrix/output/F1/S07-training.md:74; icm/02-gap-matrix/output/F1/S08-dashboard-builder.md:94-98 | Roadmap weekly metric recompute: weekly averages of bodyweight/steps/protein, logged-day coverage, current-week pick |
| G4-31 | G4 | S08-32, S07-17 | icm/02-gap-matrix/output/F1/S08-dashboard-builder.md:99; icm/02-gap-matrix/output/F1/S07-training.md:74 | Roadmap counters: inclusive day count between two declared dates plus unit-based value rounding |
| G4-32 | G4 | S08-26 | icm/02-gap-matrix/output/F1/S08-dashboard-builder.md:93 | Published weekly focus selection against the plan's current week |
| G4-33 | G4 | S08-32 | icm/02-gap-matrix/output/F1/S08-dashboard-builder.md:99 | Coach-published milestone filter (CU10 phase progress) |
| G4-43 | G4 | S09-22, S08-14 | icm/02-gap-matrix/output/F1/S09-client-tracker.md:63; icm/02-gap-matrix/output/F1/S08-dashboard-builder.md:81 | Unit conversion for displayed readings (kg to lb, cm to in) |
| G4-48 | G4 | S09-27 | icm/02-gap-matrix/output/F1/S09-client-tracker.md:68 | Previous-reading delta and the weight trend arrow (previousReadingDifference, current and previous reading lookups) |
| G4-49 | G4 | S09-07, S09-22 | icm/02-gap-matrix/output/F1/S09-client-tracker.md:48-63 | Tracker cell numeric and rating write path: display-unit to canonical conversion, bounds check, clamp and store |
| G4-50 | G4 | S01-28, S01-29, S03-10, S03-11 | icm/02-gap-matrix/output/F1/S01-shell-roster.md:52-53; icm/02-gap-matrix/output/F1/S03-check-ins.md:54-55 | Next check-in date derived from the recurring weekday plus additional dates |
| G4-52 | G4 | S01-16, S01-17 | icm/02-gap-matrix/output/F1/S01-shell-roster.md:40-41 | Coach roster attention rules: check-in attention test, needs-attention rule, attention count |
| G4-54 | G4 | S06-01, S06-09 | icm/02-gap-matrix/output/F1/S06-nutrition.md:27-35 | Plan applicability from browser-local dates: start-date gate, cycle day number, active variant resolution |
| G5-01 | G5 | S05-03, S05-05 | icm/02-gap-matrix/output/F1/S05-templates-setup.md:21-23 | Template card "More actions for <template>" menu with Duplicate and Delete (G5-019, 021, 025, 027, 072, 145, 182) |
| G5-03 | G5 | S10-18, S09-23 | icm/02-gap-matrix/output/F1/S10-appearance-ethereal.md:84; icm/02-gap-matrix/output/F1/S09-client-tracker.md:64 | Tracker configurator per-measure toggles, for example "Energy intake kcal Weekly average" and "Active minutes min Weekly total" (G5-126, G5-305) |
| G5-04 | G5 | S04-13, S08-24 | icm/02-gap-matrix/output/F1/S04-habits.md:55; icm/02-gap-matrix/output/F1/S08-dashboard-builder.md:91 | Habit complete and undo buttons in ethereal dashboard widget content, "Complete <habit>" and "Undo <habit>" (G5-209, 320, 400, 466, 510, 541) |
| G5-05 | G5 | S04-08 | icm/02-gap-matrix/output/F1/S04-habits.md:50 | Coach habit editor "Remove <habit>" in Edit habits (G5-336) |
| G5-06 | G5 | S03-07, S03-17 | icm/02-gap-matrix/output/F1/S03-check-ins.md:51-61 | "Open feedback" button on the coach check-in review (G5-239, 372) |
| G5-07 | G5 | S02-12, S02-25, S03-18 | icm/02-gap-matrix/output/F1/S02-messages-notes-media.md:52-65; icm/02-gap-matrix/output/F1/S03-check-ins.md:62 | Demo-only recording buttons "Record demo video feedback" and "Record demo voice note" (G5-276, 351) |
| G6-101 | G6 | S12-17..21, S12-12, S11-26 | icm/02-gap-matrix/output/F1/S12-backend-orphans.md:44-53; icm/02-gap-matrix/output/F1/S11-identity-access.md:113 | Identity/tenancy role and lifecycle enums: PlatformRole, UserStatus, WorkspaceStatus, MemberRole, MemberStatus, AssignmentRole, AssignmentStatus |
| G6-102 | G6 | S12-22, S12-41 | icm/02-gap-matrix/output/F1/S12-backend-orphans.md:54-73 | Sensitive consent kinds and grant sources: ConsentKind.PHOTOS/BLOODWORK/PED_HRT, ConsentSource.CLIENT_SELF/COACH_ATTESTED |
| G6-103 | G6 | S12-23, S12-33 | icm/02-gap-matrix/output/F1/S12-backend-orphans.md:55-65 | Audit vocabulary: AuditAction enum + 12 values, AuditScope/ACCOUNT, AuditResult/ALLOW/DENY, AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES entries, ACCOUNT_AUDIT_ACTIONS/RESOURCES |
| G6-504 | G6 | S12-54..56, S12-33, S12-35 | icm/02-gap-matrix/output/F1/S12-backend-orphans.md:65-88 | Exports/erasure and audit-log resources have granted cells but no canvas surface of any kind: client own export/erasure, owner workspace management, coach assigned read, owner+admin audit reads |

## Rejected rows

| Input id | Evidence and reason |
|---|---|
| G4-37 | This is upgradeSampleHistory, explicitly synthetic fixture history, frontend/src/components/ethereal/builder/model.ts:1537-1544 and :1692-1734. It does not make a server recommendation or alter an actual client program. The product energy-ring conflict is already S06-08/S06-15; do not create a backend feature for fixture generation. |
| G4-57 | summaryPreview has no canvas importer, independently searched frontend/src. It is not a runtime screen/backend gap. frontend/src/components/coach/model.ts:791 defines it; :853-854 returns Not recorded for an empty series, disproving the claimed displayed zero fallback. Remove/defer dead code, not a new product CONFLICT. |
| G5-02 | The jump is working local focus/navigation, not a missing server operation. frontend/src/components/coach/client-tracker-preview/today-view.tsx:88-113 and :147-154. Daily-value wiring is already S09-05/S09-21. Searching the backend for the aria-label proves nothing. |

## Cross-lane and existing-status disagreements

- G3-11 and G4-02/G4-26 describe the same nutrition target/progress projection. The fixture says the numbers are illustrative, not food-derived, `frontend/src/data/mock-data.json:9,553-569`. `frontend/src/components/coach/builder/additional-widget-content.tsx:139-200` selects and labels entered values, not attainment. `lib/mealplan/payload.ts:40-73` supplies related but differently shaped targets. Correct result is PARTIAL, DUP-EXISTING S08-17/S08-18. The separate attainment/ring rules remain CONFLICT as G4-08/G4-09.
- G3-06 and G4-51 describe the same task-status mapping. The schema and service derive overdue, `db/schema.prisma:1562-1565`, `lib/tasks/date.ts:72-79`. The canvas writer really stores overdue, `frontend/src/components/ethereal/clients/client-profile.tsx:218-224`, so that write-rule collision is real. The broader read projection is PARTIAL and a client read already exists, `lib/tasks/service.ts:612`. Both belong to S01-33, which explicitly names this shape mismatch. Preserve the write-rule warning there rather than making another task domain.
- G4-15 PARTIAL versus G4-41 MISSING is one progress-window claim. `lib/habits/date.ts:136-147` supplies a related window capability, but no universal progress feed exists. PARTIAL is the correct shared status.
- G5-01 cannot replace S05-05 with MISSING. The terminal-archive decision at `docs/product-decisions.md:275-278` and `lib/coaching/templates.ts:928` make delete/restore a contract mismatch; duplicate remains the separate MISSING S05-03.
- G4 phase/day-count CONFLICT claims misuse `docs/product-decisions.md:1678-1686`, which is a training-program slice. The generic phase feed is MISSING S08-32. Likewise the authoritative canvas specifies weekly means and previous-reading deltas; the old unknown-workbook-formula rule does not turn every explicit canvas arithmetic operation into an unknown formula.

## Corrections, claim by claim

The effective status is shown even when only evidence or a proposed requirement changed. No source, old matrix or decision file was edited.

| Input id | Effective status | Correction and source |
|---|---|---|
| G1-02 | PARTIAL | The Base UI Button is real, but a primitive implementation is not a new backend capability. Its foundation actions are already S10-11 and the presentation layer is S01-41. frontend/src/components/ethereal/foundation-components.tsx:13 imports it. |
| G1-04 | MISSING | CoachingApp at frontend/src/components/ethereal/coaching-app.tsx:182 is only an alias of EtherealApp, not another root. S10-04 already covers the studio shell. A citation-range boundary is not an uncovered element. |
| G1-08 | UNWIRED | LocalDialog only opens/closes a native dialog and restores focus. frontend/src/components/coach/builder/dashboard-builder.tsx:88-104. Reset/detail dialogs already have S08-11/S08-13; no dialog backend model is needed. |
| G1-10 | PARTIAL | These are render/measure helpers, not missing server entities. Existing per-widget feed and detail rows own the data. frontend/src/components/ethereal/builder/widget-content.tsx:85-106; db/schema.prisma:1529-1532 stores config, not chart data. |
| G2-01 | MISSING | Rename and empty-name validation are real. Do not add name uniqueness: frontend/src/components/ethereal/mealplan/saved-meal-library.tsx:264-278 checks trim/non-empty only, and duplicate names are not rejected. |
| G3-06 | PARTIAL | The status mismatch is real, but a client read already exists at lib/tasks/service.ts:612 and app/(tracker)/workspace/[workspaceId]/dashboard/actions.ts:14-19. Overdue remains computed, db/schema.prisma:1562-1565. |
| G3-11 | PARTIAL | The fixture explicitly says its nutrition values are illustrative, not calculated from food amounts, frontend/src/data/mock-data.json:9. Do not infer a missing food-intake summation from progress numbers. Macro target payloads are strictly typed at lib/mealplan/payload.ts:40-73. |
| G3-14 | UNCONFIGURED | Client habit reads already serve TL21/TL22, app/(tracker)/workspace/[workspaceId]/dashboard/page.tsx:103-122. The normal-run gate is lib/dashboard/gate.ts:17-21. Canvas mounting remains work; the categorical no-client-read claim is false. |
| G3-17 | PARTIAL | Prisma Json does not mean untyped payload. lib/mealplan/payload.ts:53-78 validates variants and flat meal fields. The real mismatch is food/portion/swap structure and computed totals, not missing normalized meal tables. Fixture totals are illustrative, frontend/src/data/mock-data.json:9. |
| G4-01 | MISSING | Weekly means and Monday buckets exist in the authoritative canvas. Missing widget data is the gap already S08-15/S08-16. The old unknown-PRGRSS-formula rule is not evidence that this explicit canvas formula is unknown. lib/daily-entry/week-groups.ts:24-27 even implements Monday bucketing for history. |
| G4-02 | PARTIAL | targetAt/nutrientActual pair entered values with dates and options; targetText displays a range verbatim. This is not attainment, percentage or a calorie conversion. frontend/src/components/coach/builder/additional-widget-content.tsx:139-200; lib/mealplan/payload.ts:40-73. BN19 is config-schema.ts:570-573, not BN15 at :566. |
| G4-04 | UNWIRED | DONE/SKIPPED/NONE and scheduled state already express this contract. It needs a vocabulary adapter, not a new persisted state. frontend/src/components/coach/builder/additional-widget-content.tsx:203-210; lib/habits/service.ts:90 and lib/habits/boundary.ts:155-162. |
| G4-07 | PARTIAL | A nutrition-specific source feed is absent, but date/window capability is not wholly missing. lib/habits/date.ts:136-147 and lib/habits/service.ts:1059-1063 already resolve rolling windows; align period vocabulary and the as-of date. Do not impose meal-plan activation timezone rules on every history display window. |
| G4-10 | PARTIAL | selectedOption reads the explicitly configured source or an existing active option; it does not infer whether today is a training day. frontend/src/components/coach/builder/nutrition-content.tsx:30-32 and lib/dashboard/config-schema.ts:104-105. The weekday inference at ethereal/builder/model.ts:1697-1701 is synthetic history generation, not a live scheduling operation. |
| G4-16 | PARTIAL | This bundles existing widget families, connected task operations and missing data feeds. Decision 116 defers training-program follow-ons only, docs/product-decisions.md:1678-1686, not every progress computation. Existing S08-14..33 own the element-specific gaps; preserve genuine nutrition/training contract conflicts there, not a blanket ban. |
| G4-20 | PARTIAL | The canvas specifies the weekly summary formula; DailyEntry storage exists but the tracker projection lacks the numeric summary contract. S09-18/S09-19 already cover it. A client-Home implementation-slice restriction is not a global ban on the separate tracker. |
| G4-21 | PARTIAL | The thresholds and polarity are actual canvas display rules, frontend/src/components/coach/client-tracker-preview/tracker-cell.tsx:121-142. CSS tone is not a diagnosis or an automatic program change. Backend rating bounds exist at lib/daily-entry/validate.ts:130-139; presentation semantics belong to S09-08. |
| G4-25 | MISSING | Weekly means and Monday buckets exist in the authoritative canvas. Missing widget data is the gap already S08-15/S08-16. The old unknown-PRGRSS-formula rule is not evidence that this explicit canvas formula is unknown. lib/daily-entry/week-groups.ts:24-27 even implements Monday bucketing for history. |
| G4-26 | PARTIAL | targetAt/nutrientActual pair entered values with dates and options; targetText displays a range verbatim. This is not attainment, percentage or a calorie conversion. frontend/src/components/coach/builder/additional-widget-content.tsx:139-200; lib/mealplan/payload.ts:40-73. BN19 is config-schema.ts:570-573, not BN15 at :566. |
| G4-28 | MISSING | The generic coaching-phase countdown lacks a domain feed, S08-32. Decision 116 is scoped to training-program follow-ons, not every calendar subtraction. Explicit phase date arithmetic is not an unknown PRGRSS T-minus formula. frontend/src/components/ethereal/builder/coaching-content.tsx:1047-1058; lib/dashboard/config-schema.ts:604-607. |
| G4-30 | MISSING | The missing roadmap feed is already S07-17/S08-27/S08-31. Decision 108 is config-only scope for DASHBOARD-I1, not authority to remove future canvas roadmap calculations. frontend/src/components/ethereal/builder/model.ts:1891-1898; docs/product-decisions.md:1404-1421. |
| G4-35 | PARTIAL | A nutrition-specific source feed is absent, but date/window capability is not wholly missing. lib/habits/date.ts:136-147 and lib/habits/service.ts:1059-1063 already resolve rolling windows; align period vocabulary and the as-of date. Do not impose meal-plan activation timezone rules on every history display window. |
| G4-41 | PARTIAL | Same rule as G4-15. The backend already has habit period/window support, lib/habits/date.ts:136-147. Missing cross-widget mapping/feed does not mean no date capability exists. |
| G4-42 | PARTIAL | This bundles existing widget families, connected task operations and missing data feeds. Decision 116 defers training-program follow-ons only, docs/product-decisions.md:1678-1686, not every progress computation. Existing S08-14..33 own the element-specific gaps; preserve genuine nutrition/training contract conflicts there, not a blanket ban. |
| G4-44 | PARTIAL | This bundles existing widget families, connected task operations and missing data feeds. Decision 116 defers training-program follow-ons only, docs/product-decisions.md:1678-1686, not every progress computation. Existing S08-14..33 own the element-specific gaps; preserve genuine nutrition/training contract conflicts there, not a blanket ban. |
| G4-46 | PARTIAL | The canvas specifies the weekly summary formula; DailyEntry storage exists but the tracker projection lacks the numeric summary contract. S09-18/S09-19 already cover it. A client-Home implementation-slice restriction is not a global ban on the separate tracker. |
| G4-47 | PARTIAL | The canvas specifies the weekly summary formula; DailyEntry storage exists but the tracker projection lacks the numeric summary contract. S09-18/S09-19 already cover it. A client-Home implementation-slice restriction is not a global ban on the separate tracker. |
| G4-48 | MISSING | A previous-reading lookup and delta are explicit canvas behavior, not an unknown inferred formula. Existing S09-27 already identifies the same feed/lookup gap. frontend/src/components/ethereal/client-tracker/model.ts:663-684. |
| G4-55 | MISSING | The generic coaching-phase countdown lacks a domain feed, S08-32. Decision 116 is scoped to training-program follow-ons, not every calendar subtraction. Explicit phase date arithmetic is not an unknown PRGRSS T-minus formula. frontend/src/components/ethereal/builder/coaching-content.tsx:1047-1058; lib/dashboard/config-schema.ts:604-607. |
| G4-56 | MISSING | Weekly means and Monday buckets exist in the authoritative canvas. Missing widget data is the gap already S08-15/S08-16. The old unknown-PRGRSS-formula rule is not evidence that this explicit canvas formula is unknown. lib/daily-entry/week-groups.ts:24-27 even implements Monday bucketing for history. |
| G4-58 | PARTIAL | selectedOption reads the explicitly configured source or an existing active option; it does not infer whether today is a training day. frontend/src/components/coach/builder/nutrition-content.tsx:30-32 and lib/dashboard/config-schema.ts:104-105. The weekday inference at ethereal/builder/model.ts:1697-1701 is synthetic history generation, not a live scheduling operation. |
| G5-01 | CONFLICT | Duplicate is MISSING, S05-03. Delete-with-undo conflicts with terminal archive, S05-05 and docs/product-decisions.md:275-278; lib/coaching/templates.ts:928 already implements archive. Do not call both operations MISSING. |
| G5-03 | PARTIAL | The controls are real and already S10-18/S09-23. Cite frontend/src/components/ethereal/client-tracker/tracker-configurator.tsx:227-235, not the summary-label return at :551. ParameterDefinition has label, not name, db/schema.prisma:777. |
| G5-04 | UNCONFIGURED | Habit log writes and client actions already exist, lib/habits/service.ts:714-730 and app/(tracker)/workspace/[workspaceId]/dashboard/actions.ts:64-72; normal-run feature gating is lib/dashboard/gate.ts:17-21. Existing S04-13 covers this toggle. |
| G5-05 | PARTIAL | The caller is frontend/src/components/coach/plans/setup-ui.tsx:641-647, not ui.tsx. It explicitly says archived and retains history. Backend archive uses tomorrow and CAS, lib/habits/service.ts:629-641; this is the existing S04-08 shape/rule mismatch. |
| G5-06 | PARTIAL | The caller is frontend/src/components/coach/check-ins.tsx:128-140, a calendar-event action opening the review route with sent feedback, not an untraced ui.tsx control. Already S03-07/S03-17; feedback storage db/schema.prisma:1428-1434. |
| G6-102 | PARKED-D12 | This is consent or data-protection work only. D12 parks it. Existing S12-22/S12-41 or S12-54..56/S12-33 already record the capability; no canvas gate or new screen follows from it. |
| G6-501 | ROLES | D10 makes role grants and assigned/workspace scope inputs to the owner decision, not a binding product restriction. Compare docs/security/authorization-model.md:25-45 with lib/auth/rbac.ts:85-101,123-150,236-258 and lib/workspace/clients.ts:103-120. Retain capability cells in the ROLES decision; no new console or filtering policy is approved here. |
| G6-502 | ROLES | D10 makes role grants and assigned/workspace scope inputs to the owner decision, not a binding product restriction. Compare docs/security/authorization-model.md:25-45 with lib/auth/rbac.ts:85-101,123-150,236-258 and lib/workspace/clients.ts:103-120. Retain capability cells in the ROLES decision; no new console or filtering policy is approved here. |
| G6-503 | ROLES | D10 makes role grants and assigned/workspace scope inputs to the owner decision, not a binding product restriction. Compare docs/security/authorization-model.md:25-45 with lib/auth/rbac.ts:85-101,123-150,236-258 and lib/workspace/clients.ts:103-120. Retain capability cells in the ROLES decision; no new console or filtering policy is approved here. |
| G6-504 | PARKED-D12 | This is consent or data-protection work only. D12 parks it. Existing S12-22/S12-41 or S12-54..56/S12-33 already record the capability; no canvas gate or new screen follows from it. |

### Other citation and policy findings

- G3's reported S02-02 fixture citation correction is real. `icm/02-gap-matrix/output/F1/S02-messages-notes-media.md:42,90` names label/phase/week but points to mock-data.json:22-24. Actual label/phase/week are `frontend/src/data/mock-data.json:25-27`. This changes evidence, not the status.
- G1's basename collision warning is valid. Coach and ethereal copies must not inherit each other's proof through a basename fallback. Conversely, `frontend/src/components/ethereal/coaching-app.tsx:182` is only an alias, so being outside S10-04's old range is not a new screen.
- D10 is the binding source for who will be allowed to do what. The old doc's meal-plan owner-write denial, `docs/security/authorization-model.md:33`, differs from `lib/auth/rbac.ts:148` assigned write. Do not extrapolate that particular amendment to dailyTracking, whose current cell at `lib/auth/rbac.ts:133` is still denied. This report does not decide the future role matrix.
- G6-403 corrects the reconciliation bullets in `icm/02-gap-matrix/output/F1/S12-backend-orphans.md:118-119`: synthetic public fixture libraries do not serve the coach-editable canvas library. They are an ORPHAN, not proof that those canvas editors are wired. Synthetic fixture exposure is not evidence of raw health-data exposure.

## Source-check ledger for every input row

Each entry was opened or directly searched. This ledger is claim accuracy; novelty is in the merge ledger. For a combined row, the corrections above distinguish its facets. Backend searches covered app/, lib/, components/ and db/ TypeScript/Prisma files, with scripts/ also searched for dead-export callers. Canvas searches covered frontend/src TypeScript/TSX/JSON. CSS reduced-motion rules were opened separately.

| Input id | Claim check | Effective status | Group | Opened canvas / absence | Opened backend / absence |
|---|---|---|---|---|---|
| G1-01 | CONFIRMED | MISSING | G1-01 | frontend/src/components/motion-provider.tsx:6 | none for named capability, searched app/, lib/, components/, db/schema.prisma; related services listed above |
| G1-02 | CORRECTED | PARTIAL | G1-02 | frontend/src/components/ui/button.tsx:5 | none for named capability, searched app/, lib/, components/, db/schema.prisma; related services listed above |
| G1-03 | CONFIRMED | PARTIAL | G1-03 | frontend/src/components/coach/store.tsx:39 | none for named capability, searched app/, lib/, components/, db/schema.prisma; related services listed above |
| G1-04 | CORRECTED | MISSING | G1-04 | frontend/src/components/ethereal/coaching-app.tsx:182 | none for named capability, searched app/, lib/, components/, db/schema.prisma; related services listed above |
| G1-05 | CONFIRMED | PARTIAL | G1-05 | frontend/src/components/coach/client-preview.tsx:358 | none for named capability, searched app/, lib/, components/, db/schema.prisma; related services listed above |
| G1-06 | CONFIRMED | PARTIAL | G1-06 | frontend/src/components/coach/builder/coaching-content.tsx:1142 | db/schema.prisma:1525 |
| G1-07 | CONFIRMED | PARTIAL | G1-07 | frontend/src/components/coach/builder/gallery.tsx:1265 | db/schema.prisma:1525 |
| G1-08 | CORRECTED | UNWIRED | G1-08 | frontend/src/components/coach/builder/dashboard-builder.tsx:79 | none for named capability, searched app/, lib/, components/, db/schema.prisma; related services listed above |
| G1-09 | CONFIRMED | PARTIAL | G1-09 | frontend/src/components/coach/templates.tsx:836 | none for named capability, searched app/, lib/, components/, db/schema.prisma; related services listed above |
| G1-10 | CORRECTED | PARTIAL | G1-10 | frontend/src/components/ethereal/builder/widget-content.tsx:85 | db/schema.prisma:1525 |
| G1-11 | CONFIRMED | PARTIAL | G1-11 | frontend/src/components/ethereal/builder/progress-content.tsx:94 | none for named capability, searched app/, lib/, components/, db/schema.prisma; related services listed above |
| G1-12 | CONFIRMED | PARTIAL | G1-12 | frontend/src/components/ethereal/builder/nutrition-history.tsx:190 | db/schema.prisma:1525 |
| G2-01 | CORRECTED | MISSING | G2-01 | frontend/src/components/ethereal/mealplan/saved-meal-library.tsx:260 | db/schema.prisma:772 |
| G2-02 | CONFIRMED | MISSING | G2-02 | frontend/src/components/ethereal/mealplan/saved-meal-library.tsx:193 | app/workspace/[workspaceId]/clients/[clientProfileId]/meal-plan/actions.ts:60 |
| G2-03 | CONFIRMED | MISSING | G2-03 | frontend/src/components/ethereal/mealplan/saved-meal-library.tsx:94 | none for named capability, searched app/, lib/, components/, db/schema.prisma; related services listed above |
| G3-01 | CONFIRMED | PARTIAL | G3-01 | frontend/src/data/mock-data.json:4 | db/schema.prisma:781 |
| G3-02 | CONFIRMED | MISSING | G3-02 | frontend/src/data/mock-data.json:33 | none for named capability, searched app/, lib/, components/, db/schema.prisma; related services listed above |
| G3-03 | CONFIRMED | PARTIAL | G3-03 | frontend/src/data/mock-data.json:38 | db/schema.prisma:997 |
| G3-04 | CONFIRMED | PARTIAL | G3-04 | frontend/src/data/mock-data.json:68 | db/schema.prisma:295 |
| G3-05 | CONFIRMED | PARTIAL | G3-05 | frontend/src/data/mock-data.json:492 | db/schema.prisma:291 |
| G3-06 | CORRECTED | PARTIAL | G3-06 | frontend/src/data/mock-data.json:499 | db/schema.prisma:1556 |
| G3-07 | CONFIRMED | PARTIAL | G3-07 | frontend/src/data/mock-data.json:522 | db/schema.prisma:1281 |
| G3-08 | CONFIRMED | MISSING | G3-08 | frontend/src/data/mock-data.json:521 | none for named capability, searched app/, lib/, components/, db/schema.prisma; related services listed above |
| G3-09 | CONFIRMED | MISSING | G3-09 | frontend/src/data/mock-data.json:537 | db/schema.prisma:1525 |
| G3-10 | CONFIRMED | PARTIAL | G3-10 | frontend/src/data/mock-data.json:544 | db/schema.prisma:997 |
| G3-11 | CORRECTED | PARTIAL | G4-02 | frontend/src/data/mock-data.json:553 | db/schema.prisma:1715 |
| G3-12 | CONFIRMED | MISSING | G3-12 | frontend/src/data/mock-data.json:571 | db/schema.prisma:1813 |
| G3-13 | CONFIRMED | PARTIAL | G3-13 | frontend/src/data/mock-data.json:576 | db/schema.prisma:997 |
| G3-14 | CORRECTED | UNCONFIGURED | G3-14 | frontend/src/data/mock-data.json:581 | db/schema.prisma:1599 |
| G3-15 | CONFIRMED | PARTIAL | G3-15 | frontend/src/data/mock-data.json:595 | db/schema.prisma:1333 |
| G3-16 | CONFIRMED | PARTIAL | G3-16 | frontend/src/data/mock-data.json:604 | db/schema.prisma:1671 |
| G3-17 | CORRECTED | PARTIAL | G3-17 | frontend/src/data/mock-data.json:609 | db/schema.prisma:1715 |
| G4-01 | CORRECTED | MISSING | G4-01 | frontend/src/components/coach/builder/additional-widget-content.tsx:52 | lib/dashboard/config-schema.ts:561 |
| G4-02 | CORRECTED | PARTIAL | G4-02 | frontend/src/components/coach/builder/additional-widget-content.tsx:139 | lib/dashboard/config-schema.ts:566 |
| G4-03 | CONFIRMED | PARTIAL | G4-03 | frontend/src/components/coach/builder/coaching-content.tsx:29 | lib/habits/date.ts:146 |
| G4-04 | CORRECTED | UNWIRED | G4-04 | frontend/src/components/coach/builder/additional-widget-content.tsx:203 | lib/habits/service.ts:90 |
| G4-05 | CONFIRMED | PARTIAL | G4-05 | frontend/src/components/coach/builder/nutrition-content.tsx:35 | lib/mealplan/payload.ts:40 |
| G4-06 | CONFIRMED | MISSING | G4-06 | frontend/src/components/coach/builder/nutrition-content.tsx:60 | none for named capability, searched app/, lib/, components/, db/schema.prisma; related services listed above |
| G4-07 | CORRECTED | PARTIAL | G4-07 | frontend/src/components/coach/builder/nutrition-content.tsx:80 | none for named capability, searched app/, lib/, components/, db/schema.prisma; related services listed above |
| G4-08 | CONFIRMED | CONFLICT | G4-08 | frontend/src/components/coach/builder/nutrition-content.tsx:109 | none for named capability, searched app/, lib/, components/, db/schema.prisma; related services listed above |
| G4-09 | CONFIRMED | CONFLICT | G4-09 | frontend/src/components/coach/builder/nutrition-content.tsx:202 | none for named capability, searched app/, lib/, components/, db/schema.prisma; related services listed above |
| G4-10 | CORRECTED | PARTIAL | G4-10 | frontend/src/components/coach/builder/nutrition-content.tsx:30 | none for named capability, searched app/, lib/, components/, db/schema.prisma; related services listed above |
| G4-11 | CONFIRMED | PARTIAL | G4-11 | frontend/src/components/coach/builder/gallery.tsx:235 | lib/dashboard/config-schema.ts:359 |
| G4-12 | CONFIRMED | PARTIAL | G4-12 | frontend/src/components/coach/builder/gallery.tsx:1169 | lib/dashboard/config-schema.ts:354 |
| G4-13 | CONFIRMED | MISSING | G4-06 | frontend/src/components/coach/builder/nutrition-history.tsx:57 | none for named capability, searched app/, lib/, components/, db/schema.prisma; related services listed above |
| G4-14 | CONFIRMED | CONFLICT | G4-14 | frontend/src/components/coach/builder/nutrition-history.tsx:126 | none for named capability, searched app/, lib/, components/, db/schema.prisma; related services listed above |
| G4-15 | CONFIRMED | PARTIAL | G4-15 | frontend/src/components/coach/builder/progress-content.tsx:22 | lib/habits/date.ts:136 |
| G4-16 | CORRECTED | PARTIAL | G4-16 | frontend/src/components/coach/builder/progress-content.tsx:44 | lib/dashboard/config-schema.ts:550 |
| G4-17 | CONFIRMED | CONFLICT | G4-17 | frontend/src/components/coach/client-preview.tsx:369 | lib/mealplan/payload.ts:16 |
| G4-18 | CONFIRMED | CONFLICT | G4-18 | frontend/src/components/coach/client-preview.tsx:408 | lib/mealplan/payload.ts:43 |
| G4-19 | CONFIRMED | PARTIAL | G4-05 | frontend/src/components/coach/client-preview.tsx:386 | lib/mealplan/payload.ts:40 |
| G4-20 | CORRECTED | PARTIAL | G4-20 | frontend/src/components/coach/client-tracker-preview/preview-model.ts:234 | none for named capability, searched app/, lib/, components/, db/schema.prisma; related services listed above |
| G4-21 | CORRECTED | PARTIAL | G4-21 | frontend/src/components/coach/client-tracker-preview/tracker-cell.tsx:121 | none for named capability, searched app/, lib/, components/, db/schema.prisma; related services listed above |
| G4-22 | CONFIRMED | CONFLICT | G4-18 | frontend/src/components/coach/plans/domain.ts:195 | lib/mealplan/payload.ts:43 |
| G4-23 | CONFIRMED | CONFLICT | G4-17 | frontend/src/components/coach/plans/workspace.tsx:62 | none for named capability, searched app/, lib/, components/, db/schema.prisma; related services listed above |
| G4-24 | CONFIRMED | MISSING | G4-24 | frontend/src/components/coach/plans/training/training-model.ts:61 | none for named capability, searched app/, lib/, components/, db/schema.prisma; related services listed above |
| G4-25 | CORRECTED | MISSING | G4-01 | frontend/src/components/ethereal/builder/additional-widget-content.tsx:44 | lib/dashboard/config-schema.ts:130 |
| G4-26 | CORRECTED | PARTIAL | G4-02 | frontend/src/components/ethereal/builder/additional-widget-content.tsx:139 | db/schema.prisma:482 |
| G4-27 | CONFIRMED | CONFLICT | G4-27 | frontend/src/components/ethereal/builder/coaching-content.tsx:517 | lib/habits/service.ts:1073 |
| G4-28 | CORRECTED | MISSING | G4-28 | frontend/src/components/ethereal/builder/additional-widget-content.tsx:38 | lib/dashboard/config-schema.ts:164 |
| G4-29 | CONFIRMED | PARTIAL | G4-03 | frontend/src/components/ethereal/builder/additional-widget-content.tsx:109 | lib/dashboard/config-schema.ts:174 |
| G4-30 | CORRECTED | MISSING | G4-30 | frontend/src/components/ethereal/builder/model.ts:1891 | none for named capability, searched app/, lib/, components/, db/schema.prisma; related services listed above |
| G4-31 | CONFIRMED | PARTIAL | G4-31 | frontend/src/components/ethereal/builder/model.ts:1853 | lib/trainingprogram/weeks.ts:17 |
| G4-32 | CONFIRMED | MISSING | G4-32 | frontend/src/components/ethereal/builder/model.ts:1839 | none for named capability, searched app/, lib/, components/, db/schema.prisma; related services listed above |
| G4-33 | CONFIRMED | MISSING | G4-33 | frontend/src/components/ethereal/builder/model.ts:2006 | lib/dashboard/config-schema.ts:119 |
| G4-34 | CONFIRMED | PARTIAL | G4-05 | frontend/src/components/ethereal/builder/nutrition-content.tsx:35 | lib/mealplan/payload.ts:46 |
| G4-35 | CORRECTED | PARTIAL | G4-07 | frontend/src/components/ethereal/builder/nutrition-content.tsx:80 | none for named capability, searched app/, lib/, components/, db/schema.prisma; related services listed above |
| G4-36 | CONFIRMED | CONFLICT | G4-08 | frontend/src/components/ethereal/builder/nutrition-content.tsx:109 | none for named capability, searched app/, lib/, components/, db/schema.prisma; related services listed above |
| G4-37 | REJECTED | REJECTED | G4-37 | frontend/src/components/ethereal/builder/model.ts:1537 | none for named capability, searched app/, lib/, components/, db/schema.prisma; related services listed above |
| G4-38 | CONFIRMED | CONFLICT | G4-09 | frontend/src/components/ethereal/builder/nutrition-content.tsx:142 | lib/mealplan/payload.ts:40 |
| G4-39 | CONFIRMED | CONFLICT | G4-14 | frontend/src/components/ethereal/builder/nutrition-history.tsx:23 | lib/daily-entry/week-groups.ts:43 |
| G4-40 | CONFIRMED | PARTIAL | G4-05 | frontend/src/components/ethereal/builder/nutrition-history.tsx:36 | lib/mealplan/payload.ts:40 |
| G4-41 | CORRECTED | PARTIAL | G4-15 | frontend/src/components/ethereal/builder/progress-content.tsx:22 | lib/daily-entry/week-groups.ts:43 |
| G4-42 | CORRECTED | PARTIAL | G4-16 | frontend/src/components/ethereal/builder/progress-content.tsx:43 | lib/daily-prototype.ts:6 |
| G4-43 | CONFIRMED | MISSING | G4-43 | frontend/src/components/ethereal/builder/progress-content.tsx:60 | lib/daily-tracker.ts:113 |
| G4-44 | CORRECTED | PARTIAL | G4-16 | frontend/src/components/ethereal/builder/progress-content.tsx:477 | lib/tasks/date.ts:74 |
| G4-45 | CONFIRMED | CONFLICT | G4-45 | frontend/src/components/ethereal/client-tracker/model.ts:59 | db/schema.prisma:786 |
| G4-46 | CORRECTED | PARTIAL | G4-20 | frontend/src/components/ethereal/client-tracker/model.ts:569 | lib/daily-entry/week-groups.ts:43 |
| G4-47 | CORRECTED | PARTIAL | G4-20 | frontend/src/components/ethereal/client-tracker/model.ts:636 | lib/daily-entry/week-groups.ts:43 |
| G4-48 | CORRECTED | MISSING | G4-48 | frontend/src/components/ethereal/client-tracker/model.ts:663 | none for named capability, searched app/, lib/, components/, db/schema.prisma; related services listed above |
| G4-49 | CONFIRMED | PARTIAL | G4-49 | frontend/src/components/ethereal/client-tracker/tracker-cell.tsx:59 | lib/daily-entry/validate.ts:113 |
| G4-50 | CONFIRMED | PARTIAL | G4-50 | frontend/src/components/ethereal/clients/client-profile.tsx:69 | lib/checkin/schedules.ts:83 |
| G4-51 | CONFIRMED | CONFLICT | G3-06 | frontend/src/components/ethereal/clients/client-profile.tsx:210 | lib/tasks/service.ts:253 |
| G4-52 | CONFIRMED | PARTIAL | G4-52 | frontend/src/components/ethereal/clients/model.ts:1089 | lib/tasks/date.ts:70 |
| G4-53 | CONFIRMED | CONFLICT | G4-53 | frontend/src/components/ethereal/mealplan/model.ts:353 | lib/nutrition/search.ts:30 |
| G4-54 | CONFIRMED | CONFLICT | G4-54 | frontend/src/components/ethereal/mealplan/model.ts:424 | lib/mealplan/service.ts:79 |
| G4-55 | CORRECTED | MISSING | G4-28 | frontend/src/components/coach/builder/additional-widget-content.tsx:38 | lib/dashboard/config-schema.ts:164 |
| G4-56 | CORRECTED | MISSING | G4-01 | frontend/src/components/coach/builder/additional-widget-content.tsx:44 | lib/dashboard/config-schema.ts:560 |
| G4-57 | REJECTED | REJECTED | G4-57 | frontend/src/components/coach/model.ts:791 | lib/daily-prototype.ts:84 |
| G4-58 | CORRECTED | PARTIAL | G4-10 | frontend/src/components/ethereal/builder/nutrition-content.tsx:30 | lib/dashboard/config-schema.ts:104 |
| G5-01 | CORRECTED | CONFLICT | G5-01 | frontend/src/components/coach/templates.tsx:306 | db/schema.prisma:814 |
| G5-02 | REJECTED | REJECTED | G5-02 | frontend/src/components/coach/client-tracker-preview/today-view.tsx:151 | db/schema.prisma:997 |
| G5-03 | CORRECTED | PARTIAL | G5-03 | frontend/src/components/ethereal/client-tracker/tracker-configurator.tsx:227 | db/schema.prisma:769 |
| G5-04 | CORRECTED | UNCONFIGURED | G5-04 | frontend/src/components/ethereal/builder/widget-content.tsx:566 | lib/habits/service.ts:714 |
| G5-05 | CORRECTED | PARTIAL | G5-05 | frontend/src/components/coach/plans/setup-ui.tsx:641 | lib/habits/service.ts:629 |
| G5-06 | CORRECTED | PARTIAL | G5-06 | frontend/src/components/coach/check-ins.tsx:128 | db/schema.prisma:1428 |
| G5-07 | CONFIRMED | MISSING | G5-07 | frontend/src/components/coach/media.tsx:263 | none for named capability, searched app/, lib/, components/, db/schema.prisma; related services listed above |
| G6-101 | CONFIRMED | ORPHAN | G6-101 | none, named-capability search in frontend/src; see G6 evidence | db/schema.prisma:13 |
| G6-102 | CORRECTED | PARKED-D12 | G6-102 | none, named-capability search in frontend/src; see G6 evidence | db/schema.prisma:69 |
| G6-103 | CONFIRMED | ORPHAN | G6-103 | none, named-capability search in frontend/src; see G6 evidence | db/schema.prisma:82 |
| G6-201 | CONFIRMED | UNWIRED | G6-201 | frontend/src/components/coach/templates.tsx:600 | lib/checkin/forms.ts:33 |
| G6-301 | CONFIRMED | ORPHAN | G6-301 | none, named-capability search in frontend/src; see G6 evidence | lib/coaching/client-setup-transition.ts:484 |
| G6-302 | CONFIRMED | ORPHAN | G6-302 | none, named-capability search in frontend/src; see G6 evidence | app/workspace/[workspaceId]/parameters/parameter-manager.tsx:53 |
| G6-303 | CONFIRMED | ORPHAN | G6-303 | frontend/src/components/coach/clients.tsx:673 | app/workspace/[workspaceId]/clients/[clientProfileId]/dashboard/actions.ts:52 |
| G6-401 | CONFIRMED | PARTIAL | G6-401 | frontend/src/components/coach/plans/workspace.tsx:498 | lib/mealplan/boundary.ts:28 |
| G6-402 | CONFIRMED | ORPHAN | G6-402 | none, named-capability search in frontend/src; see G6 evidence | lib/catalog.ts:172 |
| G6-404 | CONFIRMED | ORPHAN | G6-404 | none, named-capability search in frontend/src; see G6 evidence | lib/trainingprogram/weeks.ts:191 |
| G6-403 | CONFIRMED | ORPHAN | G6-403 | frontend/src/components/coach/plans/training/editor.tsx:974 | app/library/foods/page.tsx:9 |
| G6-501 | CORRECTED | ROLES | G6-501 | none, named-capability search in frontend/src; see G6 evidence | lib/auth/rbac.ts:87 |
| G6-502 | CORRECTED | ROLES | G6-502 | none, named-capability search in frontend/src; see G6 evidence | lib/auth/rbac.ts:90 |
| G6-503 | CORRECTED | ROLES | G6-503 | frontend/src/components/coach/clients.tsx:65 | lib/auth/rbac.ts:126 |
| G6-504 | CORRECTED | PARKED-D12 | G6-504 | none, named-capability search in frontend/src; see G6 evidence | lib/auth/rbac.ts:244 |

## Every submitted CONFLICT opened

All 35 incoming CONFLICT rows are G4 rows. They were compulsory checks even when later DUP-EXISTING or REJECTED. Each anchor below was opened with the relevant function body. Backend definitions, applicable product clauses and absence searches were checked independently. The current canvas-first authority and D1 distinguish explicit canvas arithmetic from an invented unknown workbook formula. Specific contract prohibitions still identify mismatches.

| Input id | Opened canvas rule | Backend or policy evidence opened | Judge result |
|---|---|---|---|
| G4-01 | frontend/src/components/coach/builder/additional-widget-content.tsx:52 | lib/dashboard/config-schema.ts:561; docs/product-decisions.md:35-42,1404-1421,1678-1686; lib/daily-entry/week-groups.ts:24-58 | CORRECTED -> MISSING |
| G4-02 | frontend/src/components/coach/builder/additional-widget-content.tsx:139 | lib/dashboard/config-schema.ts:566; docs/product-decisions.md:35-42,1404-1421,1678-1686; lib/daily-entry/week-groups.ts:24-58 | CORRECTED -> PARTIAL |
| G4-08 | frontend/src/components/coach/builder/nutrition-content.tsx:109 | named-rule search of backend corpus; lib/mealplan/payload.ts:16-17,40-78; docs/product-decisions.md:1653-1669 | CONFIRMED -> CONFLICT |
| G4-09 | frontend/src/components/coach/builder/nutrition-content.tsx:202 | named-rule search of backend corpus; lib/mealplan/payload.ts:16-17,40-78; docs/product-decisions.md:1653-1669 | CONFIRMED -> CONFLICT |
| G4-10 | frontend/src/components/coach/builder/nutrition-content.tsx:30 | named-rule search of backend corpus; docs/product-decisions.md:35-42,1404-1421,1678-1686; lib/daily-entry/week-groups.ts:24-58 | CORRECTED -> PARTIAL |
| G4-14 | frontend/src/components/coach/builder/nutrition-history.tsx:126 | named-rule search of backend corpus; lib/mealplan/payload.ts:16-17,40-78; docs/product-decisions.md:1653-1669 | CONFIRMED -> CONFLICT |
| G4-16 | frontend/src/components/coach/builder/progress-content.tsx:44 | lib/dashboard/config-schema.ts:550; docs/product-decisions.md:35-42,1404-1421,1678-1686; lib/daily-entry/week-groups.ts:24-58 | CORRECTED -> PARTIAL |
| G4-17 | frontend/src/components/coach/client-preview.tsx:369 | lib/mealplan/payload.ts:16; lib/mealplan/payload.ts:16-17,40-78; docs/product-decisions.md:1653-1669 | CONFIRMED -> CONFLICT |
| G4-18 | frontend/src/components/coach/client-preview.tsx:408 | lib/mealplan/payload.ts:43; lib/mealplan/payload.ts:16-17,40-78; docs/product-decisions.md:1653-1669 | CONFIRMED -> CONFLICT |
| G4-20 | frontend/src/components/coach/client-tracker-preview/preview-model.ts:234 | named-rule search of backend corpus; docs/product-decisions.md:35-42,1404-1421,1678-1686; lib/daily-entry/week-groups.ts:24-58 | CORRECTED -> PARTIAL |
| G4-21 | frontend/src/components/coach/client-tracker-preview/tracker-cell.tsx:121 | named-rule search of backend corpus; docs/product-decisions.md:35-42,1404-1421,1678-1686; lib/daily-entry/week-groups.ts:24-58 | CORRECTED -> PARTIAL |
| G4-22 | frontend/src/components/coach/plans/domain.ts:195 | lib/mealplan/payload.ts:43; lib/mealplan/payload.ts:16-17,40-78; docs/product-decisions.md:1653-1669 | CONFIRMED -> CONFLICT |
| G4-23 | frontend/src/components/coach/plans/workspace.tsx:62 | named-rule search of backend corpus; lib/mealplan/payload.ts:16-17,40-78; docs/product-decisions.md:1653-1669 | CONFIRMED -> CONFLICT |
| G4-25 | frontend/src/components/ethereal/builder/additional-widget-content.tsx:44 | lib/dashboard/config-schema.ts:130; docs/product-decisions.md:35-42,1404-1421,1678-1686; lib/daily-entry/week-groups.ts:24-58 | CORRECTED -> MISSING |
| G4-26 | frontend/src/components/ethereal/builder/additional-widget-content.tsx:139 | db/schema.prisma:482; docs/product-decisions.md:35-42,1404-1421,1678-1686; lib/daily-entry/week-groups.ts:24-58 | CORRECTED -> PARTIAL |
| G4-27 | frontend/src/components/ethereal/builder/coaching-content.tsx:517 | lib/habits/service.ts:1073; lib/habits/service.ts:93-108,1073; docs/product-decisions.md:1450-1454 | CONFIRMED -> CONFLICT |
| G4-28 | frontend/src/components/ethereal/builder/additional-widget-content.tsx:38 | lib/dashboard/config-schema.ts:164; docs/product-decisions.md:35-42,1404-1421,1678-1686; lib/daily-entry/week-groups.ts:24-58 | CORRECTED -> MISSING |
| G4-30 | frontend/src/components/ethereal/builder/model.ts:1891 | named-rule search of backend corpus; docs/product-decisions.md:35-42,1404-1421,1678-1686; lib/daily-entry/week-groups.ts:24-58 | CORRECTED -> MISSING |
| G4-36 | frontend/src/components/ethereal/builder/nutrition-content.tsx:109 | named-rule search of backend corpus; lib/mealplan/payload.ts:16-17,40-78; docs/product-decisions.md:1653-1669 | CONFIRMED -> CONFLICT |
| G4-37 | frontend/src/components/ethereal/builder/model.ts:1537 | named-rule search of backend corpus; docs/product-decisions.md:35-42,1404-1421,1678-1686; lib/daily-entry/week-groups.ts:24-58 | REJECTED -> REJECTED |
| G4-38 | frontend/src/components/ethereal/builder/nutrition-content.tsx:142 | lib/mealplan/payload.ts:40; lib/mealplan/payload.ts:16-17,40-78; docs/product-decisions.md:1653-1669 | CONFIRMED -> CONFLICT |
| G4-39 | frontend/src/components/ethereal/builder/nutrition-history.tsx:23 | lib/daily-entry/week-groups.ts:43; lib/mealplan/payload.ts:16-17,40-78; docs/product-decisions.md:1653-1669 | CONFIRMED -> CONFLICT |
| G4-42 | frontend/src/components/ethereal/builder/progress-content.tsx:43 | lib/daily-prototype.ts:6; docs/product-decisions.md:35-42,1404-1421,1678-1686; lib/daily-entry/week-groups.ts:24-58 | CORRECTED -> PARTIAL |
| G4-44 | frontend/src/components/ethereal/builder/progress-content.tsx:477 | lib/tasks/date.ts:74; docs/product-decisions.md:35-42,1404-1421,1678-1686; lib/daily-entry/week-groups.ts:24-58 | CORRECTED -> PARTIAL |
| G4-45 | frontend/src/components/ethereal/client-tracker/model.ts:59 | db/schema.prisma:786; lib/daily-tracker.ts:192-195; docs/product-decisions.md:299-300,655-659 | CONFIRMED -> CONFLICT |
| G4-46 | frontend/src/components/ethereal/client-tracker/model.ts:569 | lib/daily-entry/week-groups.ts:43; docs/product-decisions.md:35-42,1404-1421,1678-1686; lib/daily-entry/week-groups.ts:24-58 | CORRECTED -> PARTIAL |
| G4-47 | frontend/src/components/ethereal/client-tracker/model.ts:636 | lib/daily-entry/week-groups.ts:43; docs/product-decisions.md:35-42,1404-1421,1678-1686; lib/daily-entry/week-groups.ts:24-58 | CORRECTED -> PARTIAL |
| G4-48 | frontend/src/components/ethereal/client-tracker/model.ts:663 | named-rule search of backend corpus; docs/product-decisions.md:35-42,1404-1421,1678-1686; lib/daily-entry/week-groups.ts:24-58 | CORRECTED -> MISSING |
| G4-51 | frontend/src/components/ethereal/clients/client-profile.tsx:210 | lib/tasks/service.ts:253; lib/tasks/date.ts:72-79; docs/product-decisions.md:1431-1432 | CONFIRMED -> CONFLICT |
| G4-53 | frontend/src/components/ethereal/mealplan/model.ts:353 | lib/nutrition/search.ts:30; lib/mealplan/payload.ts:16-17,40-78; docs/product-decisions.md:1653-1669 | CONFIRMED -> CONFLICT |
| G4-54 | frontend/src/components/ethereal/mealplan/model.ts:424 | lib/mealplan/service.ts:79; lib/mealplan/payload.ts:16-17,40-78; docs/product-decisions.md:1653-1669 | CONFIRMED -> CONFLICT |
| G4-55 | frontend/src/components/coach/builder/additional-widget-content.tsx:38 | lib/dashboard/config-schema.ts:164; docs/product-decisions.md:35-42,1404-1421,1678-1686; lib/daily-entry/week-groups.ts:24-58 | CORRECTED -> MISSING |
| G4-56 | frontend/src/components/coach/builder/additional-widget-content.tsx:44 | lib/dashboard/config-schema.ts:560; docs/product-decisions.md:35-42,1404-1421,1678-1686; lib/daily-entry/week-groups.ts:24-58 | CORRECTED -> MISSING |
| G4-57 | frontend/src/components/coach/model.ts:791 | lib/daily-prototype.ts:84; docs/product-decisions.md:35-42,1404-1421,1678-1686; lib/daily-entry/week-groups.ts:24-58 | REJECTED -> REJECTED |
| G4-58 | frontend/src/components/ethereal/builder/nutrition-content.tsx:30 | lib/dashboard/config-schema.ts:104; docs/product-decisions.md:35-42,1404-1421,1678-1686; lib/daily-entry/week-groups.ts:24-58 | CORRECTED -> PARTIAL |

## Per-lane reliability and sampling

The initial random sample used one `random.Random(20261018)` instance across G1 through G6, sampling non-CONFLICT rows in canonical report order. Size was `min(rest, max(3, ceil(rest * 0.25)))`. Every CONFLICT and both cross-lane disagreement groups had separate compulsory checks. Strictly more than one fifth corrected or rejected triggers a full-lane recheck.

| Lane | Initial random ids | Initial checked / rest | Initial confirmed / corrected / rejected | Trigger | Final sampled | Confirmed | Corrected | Rejected |
|---|---|---|---|---|---:|---:|---:|---:|
| G1 | G1-02, G1-04, G1-06 | 3 / 12 | 1 / 2 / 0 | full-lane recheck required | 12 | 8 | 4 | 0 |
| G2 | G2-01, G2-02, G2-03 | 3 / 3 | 2 / 1 / 0 | full-lane recheck required | 3 | 2 | 1 | 0 |
| G3 | G3-02, G3-03, G3-05, G3-09, G3-10 | 5 / 17 | 5 / 0 / 0 | not triggered, full lane checked voluntarily | 17 | 13 | 4 | 0 |
| G4 | G4-04, G4-06, G4-07, G4-13, G4-35, G4-40 | 6 / 23 | 3 / 3 / 0 | full-lane recheck required | 58 | 34 | 22 | 2 |
| G5 | G5-01, G5-02, G5-05 | 3 / 7 | 0 / 2 / 1 | full-lane recheck required | 7 | 1 | 5 | 1 |
| G6 | G6-201, G6-402, G6-404, G6-502 | 4 / 15 | 3 / 1 / 0 | full-lane recheck required | 15 | 10 | 5 | 0 |

G1, G2, G4, G5 and G6 exceeded the trigger. G3 did not in its initial random sample, but all 17 rows were checked anyway to resolve the cross-lane claims and fixture/Json assumptions. Final source-check coverage is 100 percent for every lane. Duplicates may be factually confirmed; novelty and reliability are separate counts.

## G4 40-dismissal recheck

The brief's 1,328 count is real: it is the first-pass DISMISSED population in the twelve G4-firstpass-NN.tsv files. G4.md:48-49 explains the second-pass arithmetic: 1,328 = 1,309 confirmed + 8 reason corrections + 11 promoted to NEW. Therefore final manual dismissals are 1,317, and 1,317 + 172 automatic dismissals = 1,489. I sampled the original 1,328 as requested, not only the surviving dismissals.

Selection: concatenate DISMISSED records from sorted G4-firstpass-01.tsv through G4-firstpass-12.tsv, retaining file order, then `random.Random(20261018).sample(records, 40)`. All 40 anchors and their relevant bodies were opened. Result: 0 of 40 require a new matrix row. One dismissal reason needs correction, item 25, but its element is already covered. This is evidence about the sample, not proof that the full population is complete.

An additional 40-record sample from the final 1,317 manual dismissals was also read, with the same seed and sorted final G4-disp-NN.tsv order. It found 0 additional rows. The samples overlap at 2 source units, so 78 distinct dismissed units were independently opened. The mandatory original-population sample is recorded below.

| n | Original dismissal record | Source opened | Judge finding | New row needed |
|---|---|---|---|---|
| 1 | icm/02-gap-matrix/output/R3/G4-firstpass-04.tsv:81 | frontend/src/components/coach/client-preview.tsx:46 | Already S09-23 config projection. The cycle flag is a D12-parked aspect, not a new active row. | no |
| 2 | icm/02-gap-matrix/output/R3/G4-firstpass-06.tsv:118 | frontend/src/components/coach/roadmap-preview.ts:19 | Already S07-17 roadmap unit conversion and S09-22 unit preferences. | no |
| 3 | icm/02-gap-matrix/output/R3/G4-firstpass-01.tsv:151 | frontend/src/components/coach/builder/coaching-content.tsx:1060 | Already S08-32 phase progress. No new backend capability. | no |
| 4 | icm/02-gap-matrix/output/R3/G4-firstpass-09.tsv:20 | frontend/src/components/ethereal/builder/nutrition-content.tsx:449 | Visible macro field selection, already S08-05/S08-17. Local rendering. | no |
| 5 | icm/02-gap-matrix/output/R3/G4-firstpass-10.tsv:13 | frontend/src/components/ethereal/builder/progress-content.tsx:687 | Summary label text only. Existing S08-14 owns the selected summary computation. | no |
| 6 | icm/02-gap-matrix/output/R3/G4-firstpass-11.tsv:25 | frontend/src/components/ethereal/client-tracker/tracker-cell.tsx:98 | Rating scale conversion is already S09-08/S09-22. Not an untracked parameter kind. | no |
| 7 | icm/02-gap-matrix/output/R3/G4-firstpass-02.tsv:108 | frontend/src/components/coach/builder/nutrition-content.tsx:619 | Ordering logged dates for already-covered S08-18 history. No new store. | no |
| 8 | icm/02-gap-matrix/output/R3/G4-firstpass-04.tsv:129 | frontend/src/components/coach/client-tracker-preview/today-view.tsx:67 | Already S09-04 recorded-count heading. | no |
| 9 | icm/02-gap-matrix/output/R3/G4-firstpass-01.tsv:135 | frontend/src/components/coach/builder/coaching-content.tsx:879 | Already S08-27 prior roadmap week and S08-26 published focus. | no |
| 10 | icm/02-gap-matrix/output/R3/G4-firstpass-12.tsv:92 | frontend/src/components/ethereal/mealplan/model.ts:677 | Validation field label and target-style condition, already S06-16. | no |
| 11 | icm/02-gap-matrix/output/R3/G4-firstpass-05.tsv:104 | frontend/src/components/coach/habits-tab.tsx:27 | Already S04-01 through S04-07 habit screen and toggles. | no |
| 12 | icm/02-gap-matrix/output/R3/G4-firstpass-05.tsv:70 | frontend/src/components/coach/client-tracker-preview/view-model.ts:26 | Already S09-02 declared-date navigation; backend week math lib/daily-entry/week-groups.ts:24-27. | no |
| 13 | icm/02-gap-matrix/output/R3/G4-firstpass-11.tsv:103 | frontend/src/components/ethereal/clients/client-roster.tsx:144 | Open-task attention reason is already S01-16. It is not a new persisted status. | no |
| 14 | icm/02-gap-matrix/output/R3/G4-firstpass-04.tsv:50 | frontend/src/components/coach/builder/widget-content.tsx:102 | ResizeObserver plot-width state. No server data or product rule. | no |
| 15 | icm/02-gap-matrix/output/R3/G4-firstpass-11.tsv:3 | frontend/src/components/ethereal/client-tracker/model.ts:534 | Unit label from config, already S09-22/S09-23. | no |
| 16 | icm/02-gap-matrix/output/R3/G4-firstpass-10.tsv:25 | frontend/src/components/ethereal/builder/smooth-trend.tsx:58 | Number formatting only. Source values are unchanged. | no |
| 17 | icm/02-gap-matrix/output/R3/G4-firstpass-01.tsv:121 | frontend/src/components/coach/builder/coaching-content.tsx:593 | Calendar arrow-key navigation inside S08-25 consistency widget. | no |
| 18 | icm/02-gap-matrix/output/R3/G4-firstpass-05.tsv:36 | frontend/src/components/coach/client-tracker-preview/tracker-cell.tsx:715 | Editor wording and per-field time mode, already S09-10/S09-23. | no |
| 19 | icm/02-gap-matrix/output/R3/G4-firstpass-03.tsv:20 | frontend/src/components/coach/builder/nutrition-history.tsx:285 | Chart y-domain scaling, not a new measured or computed nutrition value. | no |
| 20 | icm/02-gap-matrix/output/R3/G4-firstpass-12.tsv:139 | frontend/src/components/ethereal/tracker-components.tsx:446 | Signed string formatting only. It does not create a new delta. | no |
| 21 | icm/02-gap-matrix/output/R3/G4-firstpass-02.tsv:99 | frontend/src/components/coach/builder/nutrition-content.tsx:484 | Pixel-budgeted history slice, existing S08-17/S08-18 display. | no |
| 22 | icm/02-gap-matrix/output/R3/G4-firstpass-02.tsv:13 | frontend/src/components/coach/builder/dashboard-builder.tsx:407 | Cancels a drag when document visibility changes. UI lifecycle only. | no |
| 23 | icm/02-gap-matrix/output/R3/G4-firstpass-12.tsv:23 | frontend/src/components/ethereal/mealplan/client-plan-preview.tsx:59 | Already S06-13 client meal-plan read view; portion/totals gaps remain S06-05/S06-07. | no |
| 24 | icm/02-gap-matrix/output/R3/G4-firstpass-04.tsv:132 | frontend/src/components/coach/client-tracker-preview/today-view.tsx:80 | Already S09-06 grouping and focus navigation. | no |
| 25 | icm/02-gap-matrix/output/R3/G4-firstpass-12.tsv:60 | frontend/src/components/ethereal/mealplan/model.ts:199 | Dismissal remains, but correct its reason: this is local archived-plan hydration, not proof that lib/mealplan/payload.ts validates that whole shape. Existing S06-01 covers lifecycle/version translation. | no |
| 26 | icm/02-gap-matrix/output/R3/G4-firstpass-04.tsv:109 | frontend/src/components/coach/client-tracker-preview/preview-model.ts:129 | Rating word/unit label only, already S09-08/S09-22. | no |
| 27 | icm/02-gap-matrix/output/R3/G4-firstpass-11.tsv:30 | frontend/src/components/ethereal/client-tracker/tracker-cell.tsx:138 | Comment-panel position/width in pixels. Comment storage gap already S09-20. | no |
| 28 | icm/02-gap-matrix/output/R3/G4-firstpass-10.tsv:11 | frontend/src/components/ethereal/builder/progress-content.tsx:682 | Pixel-based history row capacity. No data mutation or new feed. | no |
| 29 | icm/02-gap-matrix/output/R3/G4-firstpass-01.tsv:149 | frontend/src/components/coach/builder/coaching-content.tsx:1051 | Already S08-32 phase elapsed days. | no |
| 30 | icm/02-gap-matrix/output/R3/G4-firstpass-02.tsv:56 | frontend/src/components/coach/builder/gallery.tsx:1155 | Period option label text only; vocabulary contracts are in G4-03/G4-15. | no |
| 31 | icm/02-gap-matrix/output/R3/G4-firstpass-09.tsv:100 | frontend/src/components/ethereal/builder/progress-content.tsx:69 | Generic button renderer, not a new operation or entity. | no |
| 32 | icm/02-gap-matrix/output/R3/G4-firstpass-01.tsv:2 | frontend/src/components/coach/accent-contrast.ts:2 | Accessibility contrast constant, covered by S10-02/theme tokens; port the existing value, no backend service. | no |
| 33 | icm/02-gap-matrix/output/R3/G4-firstpass-02.tsv:16 | frontend/src/components/coach/builder/dashboard-builder.tsx:436 | Viewport-edge scrolling speed during drag, already S08-08. | no |
| 34 | icm/02-gap-matrix/output/R3/G4-firstpass-11.tsv:53 | frontend/src/components/ethereal/client-tracker/tracker-configurator.tsx:141 | Overview reordering already S09-05 and tracker config S09-23. | no |
| 35 | icm/02-gap-matrix/output/R3/G4-firstpass-02.tsv:78 | frontend/src/components/coach/builder/nutrition-content.tsx:160 | TD/NTD human-readable label, not automatic day inference. | no |
| 36 | icm/02-gap-matrix/output/R3/G4-firstpass-04.tsv:20 | frontend/src/components/coach/builder/smooth-trend.tsx:146 | Plot inner width and x coordinates, rendering geometry only. | no |
| 37 | icm/02-gap-matrix/output/R3/G4-firstpass-02.tsv:43 | frontend/src/components/coach/builder/gallery.tsx:166 | Already S08-04 gallery search/category filter. | no |
| 38 | icm/02-gap-matrix/output/R3/G4-firstpass-12.tsv:109 | frontend/src/components/ethereal/mealplan/swap-food-picker.tsx:25 | Already S06-06 food swap picker filtering. | no |
| 39 | icm/02-gap-matrix/output/R3/G4-firstpass-12.tsv:11 | frontend/src/components/ethereal/clients/model.ts:1129 | UTC date formatting and invalid-date fallback, already S01-22/S10-19. | no |
| 40 | icm/02-gap-matrix/output/R3/G4-firstpass-01.tsv:108 | frontend/src/components/coach/builder/coaching-content.tsx:384 | Consistency graph layout budget and history selector, already S08-25. | no |

## Parked: consent and health data

- G6-102, PARKED-D12, duplicates S12-22/S12-41. Source `db/schema.prisma:69-80`, `lib/consent.ts:322-326`; the canvas has no consent/privacy UI. D12 in `icm/03-plan/DECISIONS.md:66-68` means no new grant screen or policy gate is commissioned by this report.
- G6-504, PARKED-D12, duplicates S12-54..56 and S12-33/S12-35. Export/erasure and its protection rationale live at `lib/auth/rbac.ts:244-258`; canvas searches for audit/erasure/gdpr found no screen. Do not require a new GDPR flow for the canvas merge now. Audit role cells, if later needed, belong to D10 instead.
- In G6-201 and G6-401, `consent_missing` and `policy_not_configured` caused only by the parked consent registry are excluded from the active wiring requirement. Generic denial, stale selection/CAS, timezone, validation and service-unavailable handling still need truthful states. Sources `lib/checkin/instances.ts:57-66`, `lib/mealplan/boundary.ts:28-55`, `lib/trainingprogram/boundary.ts:39-67`. D12 permits routing around or flag-disabling the parked gate; it does not permit bypassing the owner-decided server authorization.
- Health-classification-only controls within G6-302 are parked; parameter create/edit/archive itself remains a real ORPHAN. Account/security audit vocabulary in G6-103 is not a new active health-data requirement; it is already S12-23/S12-33.

## Executed read-only validation check

A single terminating Node process transpiled the actual `lib/dashboard/config-schema.ts` in memory and called its real exported validator. It wrote no source or cache artifact. Exit 0. Baseline TL21, empty title, empty fields and an arbitrary unit all returned `ok: true`, confirming G4-11/G4-12. This was not a server, browser session or full app test.

Run from `/home/nexuslink/vari8-worktrees/merge-proto`:

```sh
node -e 'const fs=require('"'"'node:fs'"'"'),vm=require('"'"'node:vm'"'"'),ts=require('"'"'./frontend/node_modules/typescript'"'"');
const file='"'"'lib/dashboard/config-schema.ts'"'"';
const text=fs.readFileSync(file,'"'"'utf8'"'"');
const js=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const sandbox={exports:{},require,Buffer,console};vm.runInNewContext(js,sandbox,{filename:file});
const m=sandbox.exports;
const widget={id:'"'"'judge-probe'"'"',kind:'"'"'TL21'"'"',settings:m.defaultWidgetSettings('"'"'TL21'"'"')};
const base={version:1,name:'"'"'Judge probe'"'"',widgets:[widget],layouts:{},widths:{}};
const result={};
for(const [name,mutate] of Object.entries({baseline:()=>{},empty_title:()=>{widget.settings.title='"'"''"'"'},empty_fields:()=>{widget.settings.fields=[]},arbitrary_unit:()=>{widget.settings.unit='"'"'bananas'"'"'}})){
 widget.settings=m.defaultWidgetSettings('"'"'TL21'"'"');mutate();const v=m.validateDashboardConfig(base);result[name]={ok:v.ok,...(!v.ok?{reason:v.reason}:{})};
}
console.log(JSON.stringify(result));
if(Object.values(result).some(x=>!x.ok))process.exitCode=1;'
```

Actual stdout:

```json
{"baseline":{"ok":true},"empty_title":{"ok":true},"empty_fields":{"ok":true},"arbitrary_unit":{"ok":true}}
```

## Self-check

PASS. The report was parsed and checked after writing.

- (a) Every lane row accounted for: PASS. Canonical inputs contain G1 12, G2 3, G3 17, G4 58, G5 7, G6 15, totaling 112 distinct ids. The written 89-group merge ledger expands to exactly those 112 ids, once each. Written disposition counts are 61 DUP-EXISTING + 3 REJECTED + 25 SURVIVES = 89. The written 112-row source ledger agrees with 68 CONFIRMED / 41 CORRECTED / 3 REJECTED. G4's canonical reports match exactly; G6 part-file new ids equal the canonical 15, not another 15 inputs.
- (b) Every CONFLICT opened from source: PASS. All 35 incoming CONFLICT ids appear once in the written compulsory-check table and have an opened canvas anchor, backend counterpart or direct absence search, and relevant policy evidence. The 7 retained CONFLICT rows have source and backend-policy citations in the surviving table. G3/G4 cross-lane disagreements and G4-15/G4-41 were opened on both sides and resolved explicitly.
- (c) Sample size and expansion: PASS. Initial random samples are G1 3, G2 3, G3 5, G4 6, G5 3, G6 4 non-CONFLICT rows. Each meets at least one quarter of remaining rows and at least 3 per lane. Triggered lanes G1/G2/G4/G5/G6 were checked in full; G3 was checked in full voluntarily. Final lane denominators are 12/3/17/58/7/15. The required dismissal sample is 40 unique original first-pass dismissals selected from 1,328; all have written source findings. The separate final-population sample was additional, not a substitute.
- (d) Only this file written, nothing started: PASS for the read-only judgment scope. The only intentional artifact write was `icm/02-gap-matrix/output/R3/R3-JUDGED.md`, built incrementally. No source, existing matrix, census script, status file or other profile was edited. No app/server/browser/background job was launched. A terminating pure-validator Node check exited 0 twice, including the exact command embedded in this report. Source HEAD remained `58eb6edc33e73dc1f6d3a0919bc71739683e247d`; final `git status --short` in merge-proto returned an empty string. Unrelated main-workspace changes were not touched. No commit, push, install or network write occurred.

Mechanical report check: table counts matched 25 survivors, 89 merge groups, 61 duplicate groups, 3 rejected rows, 41 corrections, 112 input checks, 35 compulsory CONFLICT checks, 6 reliability rows and 40 mandatory dismissal checks. Full path:line citation occurrences were resolved against the correct tree and checked within file bounds. No long dashes remain.

Citation validation before this self-check: 658 full path:line occurrences checked, 0 invalid. The final verification checks the self-check and report tables again.
