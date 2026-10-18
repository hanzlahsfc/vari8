# TB4 group B (w2) block audit

Bite check per top-level test block for 6 frontend canvas test files. Owner rules D11 (keep behavior tests, cut compile/shape tests) and D12.

## Summary

- Files: 6
- Blocks: 43 (KEEP 43 / CUT 0)
- Tests: 49 (KEEP 49 / CUT 0)
- Lines: 823 (KEEP 823 / CUT 0)
- CUT share by tests: 0/49 = 0%
- CUT share by lines: 0/823 = 0%
- Every block failed at least one of its own tests under a targeting mutation, so every block is KEEP. No block met a cut-on-sight shape (no type-only, snapshot, framework, mock-only, or duplicate blocks here; these are formula, validation, date, and render-output tests).

## Blocks

| file | block | lines | tests | target | verdict | reason or mutation | failed tests |
|---|---|---|---|---|---|---|---|
| scripts/agent-context.test.mjs | context check rejects a missing required entrypoint | 11 | 1 | scripts/agent-context.mjs | KEEP | required-files check message changed from 'Missing required file: <f>' to 'Missing file: <f>' | context check rejects a missing required entrypoint |
| scripts/agent-context.test.mjs | context check requires ... | 13 | 3 | scripts/agent-context.mjs | KEEP | required-files check message changed from 'Missing required file: <f>' to 'Missing file: <f>' | context check requires .nvmrc; context check requires package.json; context check requires package-lock.json |
| scripts/agent-context.test.mjs | context check rejects a Node engine mismatch with the npm lock | 14 | 1 | scripts/agent-context.mjs | KEEP | package-lock engine-mismatch message changed so /package-lock\.json engine does not match/ no longer matches | context check rejects a Node engine mismatch with the npm lock |
| scripts/agent-context.test.mjs | context check rejects a changed pinned Conductor snapshot | 14 | 1 | scripts/agent-context.mjs | KEEP | workflow checksum message changed from 'Workflow checksum mismatch:' to 'Workflow hash mismatch:' | context check rejects a changed pinned Conductor snapshot |
| scripts/agent-context.test.mjs | context check rejects a broken local reference link | 14 | 1 | scripts/agent-context.mjs | KEEP | broken-link message changed from '<file> has a broken or non-local link' to '<file> links to a missing file' | context check rejects a broken local reference link |
| scripts/agent-context.test.mjs | context check validates links throughout workflow context docs | 21 | 1 | scripts/agent-context.mjs | KEEP | broken-link message changed from '<file> has a broken or non-local link' to '<file> links to a missing file' | context check validates links throughout workflow context docs |
| scripts/agent-context.test.mjs | context check accepts a local link that resolves exactly to repo root | 17 | 1 | scripts/agent-context.mjs | KEEP | isInsideRoot condition changed from 'resolvedTarget === root ||' to 'resolvedTarget !== root &&' | context check accepts a local link that resolves exactly to repo root |
| scripts/agent-context.test.mjs | context check rejects machine-specific path ... | 18 | 5 | scripts/agent-context.mjs | KEEP | machine-path regex alternative '\/home\/' removed | context check rejects machine-specific path /home/person/project |
| scripts/agent-context.test.mjs | context check rejects an incomplete stage contract | 15 | 1 | scripts/agent-context.mjs | KEEP | stage-contract message changed from '<stage> stage contract is missing <section>' to '<stage> contract lacks <section>' | context check rejects an incomplete stage contract |
| scripts/agent-context.test.mjs | valid scoped handoff stays portable and contains no credentials | 38 | 1 | scripts/agent-context.mjs | KEEP | handoff stage line changed so the stage context path is not emitted ('Stage: <stage> (<path>).' -> 'Stage: <stage>.') | valid scoped handoff stays portable and contains no credentials |
| scripts/mealplan-overview.test.ts | macro energy shares use 4/4/9 and are independent of source calories | 14 | 1 | src/components/ethereal/mealplan/overview-model.ts | KEEP | fat energy factor changed from '* 9' to '* 4' in macroEnergyShares | macro energy shares use 4/4/9 and are independent of source calories |
| scripts/mealplan-overview.test.ts | macro energy shares return zeros when there is no macro energy | 6 | 1 | src/components/ethereal/mealplan/overview-model.ts | KEEP | zero-energy early-return condition changed from 'totalEnergy === 0' to 'totalEnergy === -1' | macro energy shares return zeros when there is no macro energy |
| scripts/mealplan-overview.test.ts | legacy target drafts do not block saving static meal plans | 28 | 1 | src/components/ethereal/mealplan/model.ts | KEEP | validateMealPlan time check inverted ('if (!isValidTime(meal.time))') | legacy target drafts do not block saving static meal plans |
| src/components/coach/model.test.mjs | complete seed envelope validates and is independently cloned | 15 | 1 | src/components/coach/model.ts | KEEP | templateGuard no longer requires a non-empty variants array matching defaultVariant | complete seed envelope validates and is independently cloned |
| src/components/coach/model.test.mjs | assignment takes an isolated configuration snapshot | 10 | 1 | src/components/coach/model.ts | KEEP | assignTemplate snapshot changed from 'clone(template)' to an aliased 'template' | assignment takes an isolated configuration snapshot |
| src/components/coach/model.test.mjs | variant switches retain athlete identity, entries, plans and submissions | 9 | 1 | src/components/coach/model.ts | KEEP | switchVariant write dropped ('? { ...c, assignment: { ...c.assignment, variantId } }' -> '? c') | variant switches retain athlete identity, entries, plans and submissions |
| src/components/coach/model.test.mjs | Monday-first date arithmetic stays stable across month, year and DST | 6 | 1 | src/components/coach/model.ts | KEEP | monday weekday offset changed ('getUTCDay() + 6' -> '+ 5') | Monday-first date arithmetic stays stable across month, year and DST |
| src/components/coach/model.test.mjs | recurrence merges additional requests by explicit association without duplicate IDs | 25 | 1 | src/components/coach/model.ts | KEEP | addExtra duplicate guard changed to '() => false' (dedupe disabled) | recurrence merges additional requests by explicit association without duplicate IDs |
| src/components/coach/model.test.mjs | schedule changes preserve submitted history | 9 | 1 | src/components/coach/model.ts | KEEP | eventsBetween submitted-history backfill disabled ('if (!events.has(s.eventId))' -> 'if (false)') | schedule changes preserve submitted history |
| src/components/coach/model.test.mjs | opening a conversation changes only unread state for that athlete | 10 | 1 | src/components/coach/model.ts | KEEP | unreadCount filter changed to ignore the read flag ('!m.read' -> 'true') | opening a conversation changes only unread state for that athlete |
| src/components/coach/model.test.mjs | feedback is atomic, linked, preserves private notes and cannot be submitted twice | 17 | 1 | src/components/coach/model.ts | KEEP | submitFeedback guard no longer rejects an already-answered submission (dropped 'sub.response') | feedback is atomic, linked, preserves private notes and cannot be submitted twice |
| src/components/coach/model.test.mjs | week-based instructions carry forward without rewriting earlier weeks | 6 | 1 | src/components/coach/model.ts | KEEP | trainingSets boundary moved ('week < 4' -> 'week < 5') | week-based instructions carry forward without rewriting earlier weeks |
| src/components/coach/model.test.mjs | optional raster logo validates, survives round-trip and preserves all collections | 24 | 1 | src/components/coach/model.ts | KEEP | logoGuard dataUrl regex no longer accepts image/png | optional raster logo validates, survives round-trip and preserves all collections |
| src/components/coach/model.test.mjs | invalid logo values are rejected without affecting other preferences | 32 | 1 | src/components/coach/model.ts | KEEP | logoGuard name lower bound removed ('v.length > 0' dropped, empty name accepted) | invalid logo values are rejected without affecting other preferences |
| src/components/coach/model.test.mjs | optional sidebarCollapsed persists with logo/accent and all collections intact | 33 | 1 | src/components/coach/model.ts | KEEP | logoGuard dataUrl regex no longer accepts image/png (the persisted png logo is rejected) | optional sidebarCollapsed persists with logo/accent and all collections intact |
| src/components/coach/model.test.mjs | invalid sidebarCollapsed values are rejected | 12 | 1 | src/components/coach/model.ts | KEEP | preferences.sidebarCollapsed guard changed from 'opt(bool)' to 'opt((v) => v != null)' | invalid sidebarCollapsed values are rejected |
| src/components/ethereal/client-tracker/model.test.mjs | weekly averages ignore missing readings and include a real zero | 18 | 1 | src/components/ethereal/client-tracker/model.ts | KEEP | validValues filter now drops the value 0 ('&& value !== 0') | weekly averages ignore missing readings and include a real zero |
| src/components/ethereal/client-tracker/model.test.mjs | weekly averages and totals use only the week's recorded values | 24 | 1 | src/components/ethereal/client-tracker/model.ts | KEEP | summarize total/average branch inverted | weekly averages and totals use only the week's recorded values |
| src/components/ethereal/client-tracker/model.test.mjs | unit preferences convert canonical weight, length, and fluid values for display | 22 | 1 | src/components/ethereal/client-tracker/model.ts | KEEP | weight lb conversion constant changed from 2.20462 to 2.5 | unit preferences convert canonical weight, length, and fluid values for display |
| src/components/ethereal/client-tracker/model.test.mjs | rating display and distributions follow the selected numeric scale | 17 | 1 | src/components/ethereal/client-tracker/model.ts | KEEP | rating 1-5 conversion formula changed ('/ 9' -> '/ 8') in convert() | rating display and distributions follow the selected numeric scale |
| src/components/ethereal/client-tracker/model.test.mjs | word ratings retain their meaning and use a labelled distribution | 25 | 1 | src/components/ethereal/client-tracker/model.ts | KEEP | sleep-quality word boundary moved ('value <= 7' -> 'value <= 5') | word ratings retain their meaning and use a labelled distribution |
| src/components/ethereal/client-tracker/model.test.mjs | latest summaries select the most recent date regardless of input order | 10 | 1 | src/components/ethereal/client-tracker/model.ts | KEEP | latest branch sort order reversed ('second.date.localeCompare(first.date)' -> 'first...') | latest summaries select the most recent date regardless of input order |
| src/components/ethereal/client-tracker/model.test.mjs | week ledger means override latest, total, and distribution preferences | 38 | 1 | src/components/ethereal/client-tracker/model.ts | KEEP | weeklyAverage divides by 'values.length + 1' | week ledger means override latest, total, and distribution preferences |
| src/components/ethereal/client-tracker/model.test.mjs | week ledger means convert units and exclude invalid readings | 19 | 1 | src/components/ethereal/client-tracker/model.ts | KEEP | validValues no longer excludes non-finite readings (isFinite dropped) | week ledger means convert units and exclude invalid readings |
| src/components/ethereal/client-tracker/model.test.mjs | weekly deltas compare observed means in displayed units and omit unavailable comparisons | 44 | 1 | src/components/ethereal/client-tracker/model.ts | KEEP | weeklyDifference sign flipped ('current - previous' -> 'previous - current') | weekly deltas compare observed means in displayed units and omit unavailable comparisons |
| src/components/ethereal/client-tracker/model.test.mjs | weight deltas use the closest earlier recorded reading across missing days and week boundaries | 34 | 1 | src/components/ethereal/client-tracker/model.ts | KEEP | 'closest earlier reading' boundary moved ('entry.date < date' -> '<= date') | weight deltas use the closest earlier recorded reading across missing days and week boundaries |
| src/components/ethereal/builder/smooth-trend.test.mjs | bridges unlogged dates, exposes them to inspection, and keeps markers hover-only | 35 | 1 | src/components/ethereal/builder/smooth-trend.tsx | KEEP | slider aria-label keyboard hint removed ('...with Left and Right arrows' -> 'inspect dated entries') | bridges unlogged dates, exposes them to inspection, and keeps markers hover-only |
| src/components/ethereal/builder/smooth-trend.test.mjs | renders a dated target range when every intake entry is missing | 19 | 1 | src/components/ethereal/builder/smooth-trend.tsx | KEEP | empty-intake fallback changed from target-band dates to '[]' (renders pc-plot-empty) | renders a dated target range when every intake entry is missing |
| src/components/ethereal/builder/smooth-trend.test.mjs | target bands close with a valid line into the lower edge | 22 | 1 | src/components/ethereal/builder/smooth-trend.tsx | KEEP | target-band close changed from a line join to a curve join (reverseLowPath '^M' replaced with 'C') | target bands close with a valid line into the lower edge |
| src/components/ethereal/builder/refinement.test.mjs | denser histories retain gaps, zero and latest values without replacing edited sources | 23 | 1 | src/components/ethereal/builder/model.ts | KEEP | sameSeed comparison in upgradeSampleHistory changed to always true | denser histories retain gaps, zero and latest values without replacing edited sources |
| src/components/ethereal/builder/refinement.test.mjs | all line-chart families expose per-instance ranges and year changes data coverage | 15 | 1 | src/components/ethereal/builder/progress-content.tsx | KEEP | year period day-count changed from 365 to 7 in dateInPeriod | all line-chart families expose per-instance ranges and year changes data coverage |
| src/components/ethereal/builder/refinement.test.mjs | daily macros share one format and history supports both graphs for every nutrient | 21 | 1 | src/components/ethereal/builder/model.ts | KEEP | active TD carbs target high changed 230 -> 240 | daily macros share one format and history supports both graphs for every nutrient |
| src/components/ethereal/builder/refinement.test.mjs | steps include the source-record target while missing stays distinct from zero | 6 | 1 | src/components/ethereal/builder/progress-content.tsx | KEEP | DatedPlot bar title treats a value of 0 as missing ('fmt(row.value)' -> 'row.value ? fmt(row.value) : "—"') | steps include the source-record target while missing stays distinct from zero |

## Per file

- `scripts/agent-context.test.mjs`: KEEP-ALL (10 blocks, 16 tests)
- `scripts/mealplan-overview.test.ts`: KEEP-ALL (3 blocks, 3 tests)
- `src/components/coach/model.test.mjs`: KEEP-ALL (13 blocks, 13 tests)
- `src/components/ethereal/client-tracker/model.test.mjs`: KEEP-ALL (10 blocks, 10 tests)
- `src/components/ethereal/builder/smooth-trend.test.mjs`: KEEP-ALL (3 blocks, 3 tests)
- `src/components/ethereal/builder/refinement.test.mjs`: KEEP-ALL (4 blocks, 4 tests)

## Could not check

None. All 6 files baselined green (16/3/13/10/3/4 tests) and every block was mutated and re-run.

## Self-check

- PASS (a) every file in the list has its blocks listed: 6 files, 43 top-level blocks.
- PASS (b) every KEEP block has a mutation that failed one of its own tests (see table column 'failed tests').
- PASS (c) `git -C $TB_ROOT status --short` is empty after all mutation runs; no database used (canvas lane); no long-running process started.
- PASS (d) no tracked repo file edited; mutation targets restored by mutate.py after each run. Only `icm/03-plan/output/TA/TB4-w2.jsonl` and `TB4-w2.md` written (plus scratch driver/results under the designated scratch dir).

Mutation lever: `/home/nexuslink/.hermes/cache/scratch/vari8-tb/mutate.py` (restores target with `git checkout --`). Each `--old` string was required to occur exactly once. No run returned `crash:true` or `pass:null`.
