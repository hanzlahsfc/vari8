# First targets feature: execution brief

Status: accepted by the product owner for the frontend demo. Layout and behavior are approved. This feature is complete within the frontend scope; the historical technical-check record is not a release-certification claim.

## 1. Goal

Let a coach prescribe steps and weekly cardio, then inspect that prescription in the fictional client's tracker and weekly timeline.

Finish this one connected frontend feature before starting supplements, the training logbook, nutrition logging or a wider client-workspace redesign.

Frontend-complete means the screens, interactions, states and local demonstration work. It does not require real client data, a backend, authentication or synchronization.

## 2. Confirmed requirements

- Cardio uses frequency and duration: sessions per week x minutes per session.
- The period is always one week. Example: `5 x 20 min per week`.
- Preserve both numbers. A weekly total alone is not an equivalent prescription.
- The client view and weekly timeline show the same prescription.
- Do not add a cardio period selector or force the coach to assign specific weekdays.
- Include steps in this first coach-to-client targets feature.
- Use a separate `Activity targets` planning destination, not the Goals screen.
- Steps supports minimum, maximum, range and fixed prescriptions.
- Additions, changes and stops take effect from the day they are saved, including midweek changes.
- The remainder of the brief is approved, with the date/history rules revised to respect day-effective changes.
- Use fictional data and the existing frontend state.
- Session identity and completion timing belong in the later training logbook. Do not introduce duplicate session-entry questions in the daily tracker.
- Keep supplements and unrelated redesigns out of scope.

## 3. Approved behavior

| Decision | Approved behavior | Why it matters |
| --- | --- | --- |
| Planning destination | A separate `Activity targets` planning field/section in individual client setup. Do not place the new feature under Goals. | Activity prescriptions have their own planning workflow and state, distinct from general goals. |
| Steps prescription | Select `Minimum`, `Maximum`, `Range` or `Fixed`, in steps/day. The prescription applies each day until changed or stopped. Show its type and daily unit in the weekly timeline, not an unlabeled weekly sum. | A weekly timeline does not turn a daily steps instruction into a weekly total. |
| When changes take effect | Save from today's date, including any day within a week. No effective-week, future-start or backdating picker in this first slice. | A change must apply on the day it is made, not wait until Monday or rewrite earlier days. |
| Timeline visibility | Separate coach-selectable planning fields for `Steps target` and `Cardio target` in the template's Timeline / Roadmap configuration. Daily cardio-session entry is not required to display a cardio prescription. | Roadmap content remains coach-selected, without forcing new daily inputs into the tracker. |

Examples: `Minimum 8,000 steps/day`, `Maximum 10,000 steps/day`, `8,000-10,000 steps/day`, and `Fixed 9,000 steps/day`. These are fictional labels, not coaching recommendations or new adherence formulas.

Use one local-calendar "today" value in the activity editor, client readout and timeline. Tests may inject a fictional clock, but the visible preview must identify its current date consistently. Do not silently save using the app's old fixed sample date while labeling the action as today.

No additional decision about cardio intensity, exercise type, assigned weekdays, wearable data or completion scoring is needed for this slice. Those controls are excluded.

## 4. Screens and interactions

### A. Coach: client plans and targets

Entry point: Clients -> selected fictional client -> Plans -> Activity targets.

- Add a separate planning destination and link in individual client setup. Keep the existing Goals destination for unrelated goals.
- Group Steps and Cardio inside Activity targets.
- Steps has a type selector: Minimum, Maximum, Range or Fixed. Minimum/maximum/fixed use one value; range uses separate lower and upper bounds.
- Cardio has two labeled fields: `Sessions per week` and `Minutes per session`.
- Show a live text preview such as `5 x 20 min per week`.
- Show `Applies from today` with the actual displayed date before saving. Do not provide a scheduling picker.
- Provide explicit Save and Cancel actions. Cancel leaves the saved prescription unchanged.
- Saving a changed prescription creates a day-effective version. Earlier days retain their earlier prescription.
- Show active and previous prescriptions with their dates. There is no new future-target scheduling workflow in this slice.
- A stop action applies from today and shows `No target prescribed` from today onward. It does not erase earlier days' prescriptions.
- Replacing a prescription already saved today requires an explicit confirmation. The latest confirmed change is today's displayed prescription; intraday target analysis is out of scope.
- Preserve existing non-activity numeric goals. This is not a redesign of weight, sleep or health goal configuration.

Validation:

- Assigned cardio frequency is a positive whole number. Do not cap it at seven, because more than one session per day is possible.
- Assigned duration is a positive number of minutes. Fractional minutes may be entered; no new interval or time-picker workflow is needed.
- Assigned step values and range bounds are positive whole numbers. A range requires both bounds and a lower bound no greater than the upper bound.
- Blank, negative, non-finite or incomplete values cannot be saved.
- Zero does not mean "no prescription"; use the explicit stop/no-target state.
- A midweek save is valid. Do not shift its effective date to Monday or to the next week.

### B. Coach: template timeline configuration

- Reuse the existing Timeline / Roadmap configuration.
- Add `Steps target` and `Cardio target` under planning information, separate from actual-data calculations.
- Preserve the existing selected-metric calculations and their order.
- A cardio planning field can be enabled without a daily `Cardio sessions` input.
- Existing saved templates remain readable. New planning fields start unselected; only the dedicated fictional walkthrough setup is explicitly enabled.
- Turning off a planning field hides that presentation, not the saved client prescription.

### C. Client: tracker target readout

Entry point: selected client's existing assigned-tool preview -> Tracker.

- In Today, show both prescriptions applicable to the selected date. Cardio retains its weekly frequency/duration unit even when changed midweek.
- In Week, show the applicable dated prescription segments if a target changed within the selected week.
- Label the units and period explicitly: `steps/day` versus `sessions/week` and `min/session`.
- Use read-only prescriptions. The client does not edit coach targets.
- Changing the selected date/week changes the prescription readout.
- Show distinct `No target prescribed`, stopped and active-target states.
- Keep existing actual-entry controls. Do not add a session selector or completion-time field.
- Do not change Trends or add progress rings, "sessions remaining" or adherence scores in this slice.

The first version shows the prescription, not a new target-attainment system. It must not infer five completed sessions from a total of 100 minutes.

### D. Client/coach: weekly timeline

Entry point: the same assigned-tool preview -> Timeline / Roadmap.

- Show only the activity planning fields selected in the template.
- Show steps as a daily prescription within the weekly row.
- Show cardio as the frequency/duration pair, for example `5 x 20 min/week`.
- Resolve prescriptions by date within each week. Do not repeat the newest target across earlier days or historical rows.
- If a Wednesday change occurs, the row shows two labeled segments, for example `Mon-Tue: 3 x 20 min/week` and `Wed-Sun: 5 x 20 min/week`. The steps planning cell likewise preserves each segment's target type and values.
- These segments show prescription history. Do not prorate, sum or average the cardio pairs, or present each segment as an additional weekly quota. Completion/accounting rules remain out of scope.
- Include planning weeks needed to show current, recorded and historical target-change context even if that week has no actual entries.
- Leave missing actuals blank or labeled `Not recorded`. Do not invent zeros or completed sessions.
- Preserve existing weight, nutrition, phase and observed-data displays.
- A hidden planning field remains hidden after the coach changes a target.

No new dashboard widget is required. If an existing assigned-client widget already displays an activity target, it must use the same prescription resolver or show an unavailable target state, not contradictory illustrative data. Do not expand this into a widget-gallery project.

## 5. Minimal shared demo work

Use the existing `CoachProvider` and selected client's plan state. Do not introduce a second store, a new account system or an application-wide data-adapter framework.

The necessary shared work is limited to:

1. A separate day-effective activity-prescription representation that retains the cardio pair and four steps target types, supports changes/stops and does not repurpose the general goals array.
2. One pure prescription resolver and one formatter reused by the editor preview, client target readout and timeline.
3. A date-aware readout connection inside the existing tracker composition.
4. Fictional examples for earlier prescriptions, an active prescription, a midweek change, all four steps types and no target.

Existing tracker actuals can remain in their current preview state. Moving every measurement, comment, habit, message and media record into shared state is explicitly outside this feature.

Use the current selected fictional client, not a new independent sample client inside each component. Closing/reopening the preview and reloading should retain saved prescriptions through the existing browser-local workspace behavior. This is demo persistence, not a real data connection.

Do not overwrite another client's targets or seed into an already-customized saved client. Prefer an isolated fictional browser scenario for verification.

## 6. Implementation structure

This is the approved change boundary. Exact interfaces and test commands will be locked in a short technical task plan before implementation begins.

| Responsibility | Existing starting point | Planned change |
| --- | --- | --- |
| Activity planning and client-setup navigation | `src/components/coach/plans/setup-ui.tsx`; `src/components/coach/plans/workspace.tsx`; proposed `src/components/coach/targets/editor.tsx` | Add the separate `Activity targets` planning destination, proposed route `plan=activity-targets`. Reuse shared controls and existing client navigation, not the Goals screen. |
| Target representation and saved-state validation | `src/components/coach/plans/types.ts`; `src/components/coach/plans/domain.ts` | Add separate activity-planning state to client plans. Model four steps types, weekly cardio pairs and explicit stops. Preserve the general goals array and validate old saved states compatibly; do not invent structured prescriptions from ambiguous legacy scalar goals. |
| Single activity-prescription rule owner | Proposed `src/components/coach/targets/model.ts` | Own date resolution, per-week history segments, version/stop resolution, validation and formatting. Keep this pure and independent of React and storage. |
| Shared presentation | Proposed `src/components/coach/targets/target-summary.tsx` and small feature stylesheet | Render the same prescription meaning in coach/client views with existing shared controls and tokens. |
| Tracker composition | `src/components/coach/client-preview.tsx`; `src/components/coach/client-tracker-preview/tracking-view.tsx` | Pass the selected tracker date to the readout through a small optional rendering interface. Do not create a new client app shell. |
| Timeline configuration and display | `src/components/coach/templates.tsx`; `src/components/coach/roadmap-preview.ts`; `src/components/coach/client-preview.tsx` | Add explicit activity planning selection and dated target projections without treating a cardio pair as an ordinary numeric average. |
| Existing summary compatibility | `src/components/coach/model.ts:summaryPreview`; `src/components/coach/builder/coach-dashboard.tsx` where an activity target is exposed | Remove competing activity-target lookups or sample fallback in the touched readouts. Preserve unrelated summary behavior. |

Two shapes were considered:

- Separate local target samples for each screen would be quick to draw, but would not demonstrate the same coach prescription across views.
- One shared dated prescription in the existing client state, with a reused resolver, is the recommended shape. It adds only the shared work this feature needs.

Do not store only `frequency x duration` as a scalar weekly total, and do not infer a cardio schedule by combining unrelated legacy scalar goals.

## 7. Acceptance cases

All examples are fictional demonstration values, not coaching recommendations.

1. A coach saves `5 sessions/week` and `20 min/session`. The editor preview, client readout and selected timeline planning cell show the same pair and weekly period.
2. A coach can save each steps type: minimum, maximum, range and fixed. The client and weekly timeline retain the type, values and daily unit.
3. A save on Wednesday applies on Wednesday without an effective-date picker. Monday/Tuesday retain their earlier prescription; a date before the first prescription shows no target.
4. A fictional Wednesday change from `3 x 20 min/week` to `5 x 20 min/week` appears as labeled Mon-Tue and Wed-Sun segments in that week's timeline. Navigation and reload preserve the history without prorating or summing weekly prescriptions.
5. A stop today shows no target from today onward while retaining earlier days. It does not accidentally reactivate an older target.
6. Replacing today's prescription requires confirmation. Canceling that confirmation preserves the saved value. An unsaved form left open across midnight resolves the effective day again when saved.
7. Blank, negative, fractional frequency, non-finite and incomplete assigned prescriptions are rejected. Valid fractional duration and frequency greater than seven are not rejected solely for those reasons.
8. No target, no recorded actual and an actual zero are not collapsed into the same display state.
9. Timeline planning remains visible when selected even in a week without actual data. Hiding planning fields does not delete prescriptions or change recorded metrics. Reversed or incomplete steps ranges cannot be saved.
10. Another fictional client's state remains unchanged. Existing general goals and saved templates remain readable. Activity targets are edited only through their separate planning destination and do not write into the goals array.
11. Existing tracking controls, nutrition, training, phase labels and check-in previews still render. No daily session-entry requirement is added.
12. Keyboard operation, labeled errors, unsaved/cancel behavior and open date/selector popups work at desktop and narrow widths. Shared colors remain legible in both modes with pale and dark accents.

No cardio completion/adherence formula is part of these acceptance cases.

## 8. Build and review sequence

After an explicit request to implement:

1. Use this approved scope to prepare the exact technical tasks, interfaces and test assertions.
2. Add failing tests for prescription resolution and saved-state compatibility, then implement the smallest target model/resolver change.
3. Extend the coach editor and template planning selection.
4. Add the client readout and weekly timeline projection using the same resolver.
5. Run targeted tests and static checks, then exercise the connected fictional walkthrough in the persistent browser preview.
6. Review the complete diff and visual evidence in the main session.
7. Stop for the product owner's UI review. Do not start supplements automatically.

Verification during implementation:

- Test the real resolver, not a copy of its logic.
- Extend the existing plan-domain and roadmap tests; add dedicated target tests.
- Check current/historical dates, midweek segments, same-day replacement, all four steps types, range validation, stop behavior, date rollover, unsorted legacy data and untouched-client isolation.
- Run relevant lint/type/drift checks and one final production-build gate for the finished feature, rather than rebuilding after every small edit.
- Before browser checks, run `npm run preview:up` and confirm `npm run preview:status` reports both servers healthy. Keep the managed preview running afterward.
- Inspect the feature on desktop and mobile, both modes and pale/dark accents, including keyboard selection and open popups.
- Report any baseline failures separately. No test has been run or claimed passing for this unimplemented feature.
- Do not commit, publish or connect services without separate authorization.

## 9. Not included

Supplements; nutrition targets/logging; a training logbook; session scheduling; exercise intensity/type prescriptions; image comparison; wearable connections; real client data or backend services; full custom-metric target rules beyond steps/cardio; future scheduling/backdating controls; adherence scoring; a broad dashboard rebuild; a new state framework; or a new client navigation design.

Other suitable tracker metrics can be added as a later extension once this steps/cardio slice establishes the pattern. Existing numeric goals are preserved. Minimum/maximum/range/fixed controls for steps are included now, not deferred.

## 10. Current source findings

Checked in the current working tree while preparing this brief:

- `ClientGoalsEditor` already creates/edits/removes dated scalar goals for eligible numeric fields in the assigned setup. Its current destination is `plan=goals`; it is not the approved destination or state owner for the new activity-planning feature.
- `ClientGoal` currently stores one numeric `value`; it cannot retain a cardio pair or typed step ranges. Keep this legacy model separate from the new activity-prescription model.
- `weeklyRoadmapRows` currently emits only observed weeks. Its scalar target lookup uses the first matching eligible goal, while `summaryPreview` uses the last matching array item. The target slice needs one deliberate date-resolution rule, not two incidental array-order rules.
- `TrackingView` owns its selected date; `TrackerTab` owns isolated preview actuals. Only the target readout needs a small date-aware connection here.
- Timeline configuration currently chooses calculations from selected tracker fields. A weekly prescription is planning information and must not be represented as a fabricated average or a required daily session field.

These findings support the change boundary. The scope is approved; product implementation still requires an explicit request.

## 11. Instructions for the product owner

You do not need to run commands or review the code.

1. Your revisions are implemented for this frontend slice. No further implementation instruction is needed to inspect it.
2. You can inspect sections 3-4 for the separate planning destination, four steps types and day-effective changes, including the midweek display clarification.
3. Open the local coach preview and select Plans -> Activity targets, or use the direct browser link supplied in the handoff.
4. Report any visual or interaction changes you want. Work stops here for your review, without starting the next feature.

This approval does not authorize starting supplements, backend work, commits or publication.
