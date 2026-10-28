# Supplements planner: execution brief

Status: frontend demo implemented and available for owner review, including the compact two-row layout revision. Stop here for layout/behavior feedback.

## Goal and placement

Add a separate Supplements plan under each client's Plans tab, alongside Nutrition, Training and Activity targets.

The coach configures the plan. The client sees a read-only version. No taken checkboxes, supplement adherence logging or backend connection are part of this feature.

Use `supplement.xlsx` as the catalogue and behavior reference. Preserve its useful fields and relationships, not its spreadsheet layout, helper columns or formula errors.

## Confirmed requirements

- A Supplements card/entry in individual client Plans.
- Brand selection followed by a product selection filtered to that brand.
- The catalogue's manufacturer portion appears by default when a product is selected.
- The coach can change the prescribed quantity/dosage.
- Quantity defaults from the catalogue and remains editable. Dosage is a separate calculated readout that updates from Quantity, followed by the fixed database unit. Unit is never an input.
- Do not show the extra reference-portion/declared-content footer.
- Show the resulting declared active-ingredient amount where the source provides enough information.
- Coach-entered time/timing, status and additional notes.
- Read-only client presentation.
- Both coaches and clients open the product page through a compact, labeled link icon rather than a large button. Open in a new tab without losing the planner.
- A working frontend demonstration is the delivery goal. Keep necessary internal checks focused; do not delay the demo with broad production verification.

## Fields and behavior from the workbook

| Information | Source | App behavior |
| --- | --- | --- |
| Brand | Supplement Datenbank, column B | Searchable brand selector, derived from the actual catalogue rather than a hardcoded dropdown list. |
| Product | Database column C, filtered by brand | Searchable product selector, unavailable until the coach chooses a brand. |
| Manufacturer portion quantity | Database column E | Fill the initial prescribed quantity and keep the reference portion visible after an override. |
| Declared amount per reference portion | Database column D | Source value for the calculated ingredient total, when present. This is reference data, not an app-generated dosing recommendation. |
| Amount per quantity unit | Database column F, derived from D/E | Optional supporting readout. Calculate from the underlying reference amount/portion instead of repeatedly rounding a cached spreadsheet value. |
| Ingredient/content unit | Database column G | Preserve the source unit, including mg, g, micrograms or international units. Keep it separate from the product's administration unit. |
| Timing | Planner column H, EINNAHME | Coach can enter a time or instructions such as with breakfast or before bed. |
| Status | Planner column I | Preserve the sheet's choices: Must have, Optional, No status. This describes the coach's instruction/priority, not whether the client took the product. |
| Product link | Database column H, planner LINK column K | Show a product-page link when supplied. Do not fetch websites or verify manufacturer claims automatically. |
| Notes | Planner column L, NOTIZEN | Editable coach notes. A blank database note must not overwrite what the coach enters. |

The workbook's unlabeled checkbox column is not carried into the client view because the owner selected view-only behavior.

## Coach workflow

1. Open Clients -> selected fictional client -> Plans -> Supplements.
2. Add a supplement.
3. Select a brand, then one of that brand's products.
4. Show the reference portion and prefill the prescribed quantity.
5. Allow the coach to adjust that quantity. Recalculate the declared ingredient amount if known.
6. Enter timing, status and optional notes; show the product link if available.
7. Save the plan, or cancel unsaved edits.
8. Preview the read-only client plan.

Changing the brand clears the selected product and its dosage/derived metadata. Selecting another product starts from that product's reference portion, rather than carrying an unrelated previous dosage across.

The plan supports multiple rows, including the same product at different times. Each row has a stable identity. The coach can edit, reorder or remove rows; removal has an explicit confirmation or undo. Do not impose a fixed number of empty spreadsheet rows.

## Dosage and ingredient arithmetic

Keep these concepts distinct:

- Reference portion quantity from the catalogue.
- Coach-prescribed product quantity.
- Product quantity unit, such as capsules, grams or sprays, only when established.
- Declared ingredient amount and its separate unit.

When source information is complete:

`declared ingredient total = declared amount per reference portion x prescribed quantity / reference portion quantity`

Use original reference values for the calculation and round only the display. Do not multiply a previously rounded per-unit number repeatedly.

Missing composition data is not zero. When composition is unavailable but the database establishes a product unit, show dosage in that product unit; otherwise show `Not provided`. If the reference portion is missing/invalid, the quantity starts blank rather than using an invented default.

The spreadsheet does not consistently separate administration units from ingredient units. The owner's latest clarification replaces manual unit confirmation: keep Quantity as the product-quantity basis, and show the calculated Dosage with the database's corresponding unit. Never relabel a quantity of one as one IU when its calculated dosage is 5,600 IU. Preserve legacy quantity-basis metadata internally without requiring a unit input.

The catalogue sometimes provides a single declared amount without an ingredient breakdown. Show it as the declared amount; do not invent named sub-ingredients, claim it represents every ingredient in a blend, or total unrelated ingredients across products just because they share a unit.

Preserve source data as supplied. Do not silently correct suspected catalogue mistakes, convert international units without a defined ingredient-specific basis, or generate recommended doses or interaction advice.

## Proposed app presentation

The owner approved this compact layout revision after inspecting the first demo:

- Coach/add-edit view: brand, product, Quantity, calculated Dosage, fixed Unit and the product-page icon share the first desktop row, with the icon aligned at the far right. Timing, status and notes share the second row.
- Use shared compact controls. Dosage and Unit are read-only outputs. There is no unit-confirmation input or reference/declared-content footer.
- Client view: readable supplement rows/cards, ordered as the coach arranged them, with brand/product, dosage and unit, timing, status and notes. Ingredient amount and product link remain available without showing database/formula internals.
- Use the existing app controls and VARI8 appearance. Preserve both modes; do not copy the rose document style into the planner.
- Show an empty/not-yet-set-up state. Missing ingredient information is an informative state, not a broken plan.

No active/paused/taken meanings are added to the workbook's Status field. Those would need a separate product decision if wanted later.

## Save and preview boundaries

Proposed first-version behavior: explicit Save plan, Cancel and Preview client plan. The client demo shows the saved plan, never an unsaved coach draft.

Use the existing client workspace's local state and storage. Keep supplement plans separate from nutrition, training, activity prescriptions and general goals. Retain the catalogue details used by a saved row so a later catalogue change does not silently change a saved prescription.

No live Google Sheets connection, real upload, server/database integration, catalogue management screen, custom-product editor, cycling protocol, automatic dosing, daily adherence or new timeline analytics is included in this slice.

## Completion examples

The feature is frontend-complete when the owner can:

1. Open Supplements as a distinct plan from the Plans tab.
2. Choose a brand and see only that brand's products.
3. Select a product, see the reference portion prefilled and change the quantity.
4. See the declared ingredient amount update from the known reference, or a clear not-provided state.
5. Enter timing/status/notes, save and reload the local plan.
6. Inspect the same saved information in the read-only client view.
7. Change a brand/product without leaving the previous product's dosage or calculated content attached.
8. Cancel edits without altering the saved plan and use the editor on a narrow screen.

I will handle the focused arithmetic and connected demo checks internally, then hand over the browser link. The owner does not need to run checks or manage technical verification.

## Source and integration notes

Workbook inspection established:

- `Supplement Datenbank`: B-G contains the catalogue's brand/product/reference fields; H contains product links. Its I column has no populated catalogue notes.
- `Kopie von Supplements`, row 8: manufacturer, supplement, per-unit content, quantity, total, unit, intake/timing, status, link and notes.
- The planner uses brand/product lookup, quantity from database E, and a row total based on per-unit amount x quantity.
- Status validation contains `must have`, `optional` and `-`. The app will label the last choice as No status.
- Google Sheets FILTER/TRANSPOSE formulas and export wrappers establish intended relationships. They are not a runtime implementation or proof that cached values are current.

Existing frontend seams checked:

- `src/components/coach/plans/setup-ui.tsx`: sibling plan cards and navigation.
- `src/components/coach/plans/workspace.tsx`: individual plan routes.
- `src/components/coach/plans/types.ts` and `domain.ts`: compatible client-local plan state.
- `src/components/coach/client-preview.tsx`: saved client-plan presentation.
- `src/components/vari8/components.tsx`: shared input and searchable selection controls.

No product files have been changed while preparing this brief.

## Next instruction

Read the proposed product-quantity unit field and Save/Preview behavior above. If this matches the intended planner, reply:

`Approve the supplement brief.`

If you also want implementation to start, reply:

`Approve the supplement brief and implement it. Stop when the demo is ready for review.`
