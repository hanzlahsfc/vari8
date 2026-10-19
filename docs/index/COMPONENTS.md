# COMPONENTS.md - exported React components (canvas)

Generated file. Do not edit by hand: changes are overwritten by `npm run index`.
Verify the committed copy is current with `npm run index:check` (exit 1 = drift).

Source: TypeScript compiler API over `frontend/src/**`. A component is an exported
function, or a const whose initializer is a function, whose body contains JSX.
`Imported by` lists the canvas route entries that reach the component through imports;
a layout's imports count for every route beneath it.
Counts: 112 components in 67 files.

Rows are grouped by canvas surface: the coach workspace at `/coach`, the ethereal
canvas at `/ethereal` and `/`. A screen element shared by both surfaces is listed in
both sections. To name the canvas file behind a screen element, find the component in
its surface section and open the file in the second column. Canvas screens: see
`ROUTES.md`.

## Coach surface (`/coach`)

| Component | File | Imported by |
|---|---|---|
| `ActiveClientNutrition` | `frontend/src/components/coach/plans/workspace.tsx` | /coach |
| `ActiveClientTraining` | `frontend/src/components/coach/plans/workspace.tsx` | /coach |
| `AdditionalDetailContent` | `frontend/src/components/coach/builder/additional-widget-content.tsx` | /coach |
| `AppearanceControls` | `frontend/src/components/coach/appearance-controls.tsx` | /coach |
| `AppearanceProvider` | `frontend/src/lib/ethereal-appearance.tsx` | /, /coach, /ethereal |
| `AssignDialog` | `frontend/src/components/coach/templates.tsx` | /coach |
| `Avatar` | `frontend/src/components/coach/ui.tsx` | /coach |
| `BuilderGallery` | `frontend/src/components/coach/builder/gallery.tsx` | /coach |
| `Button` | `frontend/src/components/coach/ui.tsx` | /coach |
| `ChartPeriodControl` | `frontend/src/components/coach/builder/chart-period-control.tsx` | /coach |
| `CheckInsWorkspace` | `frontend/src/components/coach/check-ins.tsx` | /coach |
| `ClientGoalsEditor` | `frontend/src/components/coach/plans/setup-ui.tsx` | /coach |
| `ClientHabitsEditor` | `frontend/src/components/coach/plans/setup-ui.tsx` | /coach |
| `ClientPlanPreview` | `frontend/src/components/coach/client-plan-preview.tsx` | /coach |
| `ClientPlansSummary` | `frontend/src/components/coach/plans/setup-ui.tsx` | /coach |
| `ClientPreview` | `frontend/src/components/coach/client-preview.tsx` | /coach |
| `ClientsWorkspace` | `frontend/src/components/coach/clients.tsx` | /coach |
| `CoachApp` | `frontend/src/components/coach/coach-app.tsx` | /coach |
| `CoachDashboardEditor` | `frontend/src/components/coach/builder/coach-dashboard.tsx` | /coach |
| `CoachDashboardPreview` | `frontend/src/components/coach/builder/coach-dashboard.tsx` | /coach |
| `CoachPlanDatePicker` | `frontend/src/components/coach/plans/nutrition/editor.tsx` | /coach |
| `CoachProvider` | `frontend/src/components/coach/store.tsx` | /coach |
| `CoachingWidgetContent` | `frontend/src/components/coach/builder/coaching-content.tsx` | /coach |
| `DashboardBuilder` | `frontend/src/components/coach/builder/dashboard-builder.tsx` | /coach |
| `DatePicker` | `frontend/src/components/coach/plans/nutrition/date-time-fields.tsx` | /coach |
| `DemoRecorder` | `frontend/src/components/coach/media.tsx` | /coach |
| `DetailContent` | `frontend/src/components/coach/builder/widget-content.tsx` | /coach |
| `Dialog` | `frontend/src/components/coach/ui.tsx` | /coach |
| `Empty` | `frontend/src/components/coach/ui.tsx` | /coach |
| `ExtraDateDialog` | `frontend/src/components/coach/clients.tsx` | /coach |
| `FormPreview` | `frontend/src/components/coach/templates.tsx` | /coach |
| `HabitsTab` | `frontend/src/components/coach/habits-tab.tsx` | /coach |
| `IconButton` | `frontend/src/components/coach/ui.tsx` | /coach |
| `IifymEditor` | `frontend/src/components/coach/plans/nutrition/editor.tsx` | /coach |
| `IifymPlanPreview` | `frontend/src/components/coach/plans/nutrition/editor.tsx` | /coach |
| `IndividualPlanWorkspace` | `frontend/src/components/coach/plans/workspace.tsx` | /coach |
| `MediaCard` | `frontend/src/components/coach/media.tsx` | /coach |
| `MessagesWorkspace` | `frontend/src/components/coach/messages.tsx` | /coach |
| `MotionProvider` | `frontend/src/components/motion-provider.tsx` | /, /coach, /ethereal |
| `NotesWorkspace` | `frontend/src/components/coach/notes.tsx` | /coach |
| `NutritionEditor` | `frontend/src/components/coach/plans/nutrition/editor.tsx` | /coach |
| `NutritionHistory` | `frontend/src/components/coach/builder/nutrition-history.tsx` | /coach |
| `NutritionPlanPreview` | `frontend/src/components/coach/plans/nutrition/editor.tsx` | /coach |
| `NutritionWidgetContent` | `frontend/src/components/coach/builder/nutrition-content.tsx` | /coach |
| `PageTitle` | `frontend/src/components/coach/ui.tsx` | /coach |
| `ParameterValue` | `frontend/src/components/coach/ui.tsx` | /coach |
| `PreviewDialog` | `frontend/src/components/coach/templates.tsx` | /coach |
| `ProgressWidgetContent` | `frontend/src/components/coach/builder/progress-content.tsx` | /coach |
| `SearchBox` | `frontend/src/components/coach/ui.tsx` | /coach |
| `Select` | `frontend/src/components/coach/ui.tsx` | /coach |
| `SmoothTrend` | `frontend/src/components/coach/builder/smooth-trend.tsx` | /coach |
| `Status` | `frontend/src/components/coach/ui.tsx` | /coach |
| `Surface` | `frontend/src/components/coach/ui.tsx` | /coach |
| `TemplateEditor` | `frontend/src/components/coach/templates.tsx` | /coach |
| `TemplateLibrary` | `frontend/src/components/coach/templates.tsx` | /coach |
| `TemplatePreview` | `frontend/src/components/coach/ui.tsx` | /coach |
| `TextTrackerCell` | `frontend/src/components/coach/client-tracker-preview/tracker-cell.tsx` | /, /coach, /ethereal |
| `TimeInput` | `frontend/src/components/coach/client-tracker-preview/time-input.tsx` | /, /coach, /ethereal |
| `TimePicker` | `frontend/src/components/coach/plans/nutrition/date-time-fields.tsx` | /coach |
| `TodayView` | `frontend/src/components/coach/client-tracker-preview/today-view.tsx` | /, /coach, /ethereal |
| `Toggle` | `frontend/src/components/coach/ui.tsx` | /coach |
| `TrackerCell` | `frontend/src/components/coach/client-tracker-preview/tracker-cell.tsx` | /, /coach, /ethereal |
| `TrackingView` | `frontend/src/components/coach/client-tracker-preview/tracking-view.tsx` | /, /coach, /ethereal |
| `TrainingEditor` | `frontend/src/components/coach/plans/training/editor.tsx` | /coach |
| `TrainingPrescription` | `frontend/src/components/coach/plans/training/editor.tsx` | /coach |
| `Transition` | `frontend/src/components/coach/ui.tsx` | /coach |
| `TrendsView` | `frontend/src/components/coach/client-tracker-preview/trends-view.tsx` | /, /coach, /ethereal |
| `WeekView` | `frontend/src/components/coach/client-tracker-preview/week-view.tsx` | /, /coach, /ethereal |
| `WidgetContent` | `frontend/src/components/coach/builder/widget-content.tsx` | /coach |
| `WidgetPreview` | `frontend/src/components/coach/ui.tsx` | /coach |

## Ethereal surface (`/`, `/ethereal`)

| Component | File | Imported by |
|---|---|---|
| `AdditionalDetailContent` | `frontend/src/components/ethereal/builder/additional-widget-content.tsx` | /, /ethereal |
| `AppearanceProvider` | `frontend/src/lib/ethereal-appearance.tsx` | /, /coach, /ethereal |
| `AppearanceScreen` | `frontend/src/components/ethereal/appearance-views.tsx` | /, /ethereal |
| `Avatar` | `frontend/src/components/ethereal/ui.tsx` | /, /ethereal |
| `BodyweightTrend` | `frontend/src/components/ethereal/tracker-components.tsx` | /, /ethereal |
| `BuilderGallery` | `frontend/src/components/ethereal/builder/gallery.tsx` | /, /ethereal |
| `Button` | `frontend/src/components/ui/button.tsx` | /, /ethereal |
| `ChartPeriodControl` | `frontend/src/components/ethereal/builder/chart-period-control.tsx` | /, /ethereal |
| `CheckboxControl` | `frontend/src/components/ethereal/ui.tsx` | /, /ethereal |
| `ClientPlanPreview` | `frontend/src/components/ethereal/mealplan/client-plan-preview.tsx` | /, /ethereal |
| `ClientProfile` | `frontend/src/components/ethereal/clients/client-profile.tsx` | /, /ethereal |
| `ClientRoster` | `frontend/src/components/ethereal/clients/client-roster.tsx` | /, /ethereal |
| `ClientTracker` | `frontend/src/components/ethereal/client-tracker/client-tracker.tsx` | /, /ethereal |
| `ClientsWorkspace` | `frontend/src/components/ethereal/clients/clients-workspace.tsx` | /, /ethereal |
| `CoachingWidgetContent` | `frontend/src/components/ethereal/builder/coaching-content.tsx` | /, /ethereal |
| `DashboardBuilder` | `frontend/src/components/ethereal/builder/dashboard-builder.tsx` | /, /ethereal |
| `DatePicker` | `frontend/src/components/ethereal/mealplan/date-time-fields.tsx` | /, /ethereal |
| `DetailContent` | `frontend/src/components/ethereal/builder/widget-content.tsx` | /, /ethereal |
| `EtherealApp` | `frontend/src/components/ethereal/coaching-app.tsx` | /, /ethereal |
| `FoundationComponents` | `frontend/src/components/ethereal/foundation-components.tsx` | /, /ethereal |
| `LabelTag` | `frontend/src/components/ethereal/ui.tsx` | /, /ethereal |
| `MealplanWorkspace` | `frontend/src/components/ethereal/mealplan/mealplan-workspace.tsx` | /, /ethereal |
| `MotionProvider` | `frontend/src/components/motion-provider.tsx` | /, /coach, /ethereal |
| `NutritionHistory` | `frontend/src/components/ethereal/builder/nutrition-history.tsx` | /, /ethereal |
| `NutritionTargets` | `frontend/src/components/ethereal/tracker-components.tsx` | /, /ethereal |
| `NutritionWidgetContent` | `frontend/src/components/ethereal/builder/nutrition-content.tsx` | /, /ethereal |
| `PlanOverview` | `frontend/src/components/ethereal/mealplan/plan-overview.tsx` | /, /ethereal |
| `ProgressWidgetContent` | `frontend/src/components/ethereal/builder/progress-content.tsx` | /, /ethereal |
| `SavedMealLibrary` | `frontend/src/components/ethereal/mealplan/saved-meal-library.tsx` | /, /ethereal |
| `Segmented` | `frontend/src/components/ethereal/ui.tsx` | /, /ethereal |
| `SelectControl` | `frontend/src/components/ethereal/ui.tsx` | /, /ethereal |
| `SmoothTrend` | `frontend/src/components/ethereal/builder/smooth-trend.tsx` | /, /ethereal |
| `StatusLabel` | `frontend/src/components/ethereal/ui.tsx` | /, /ethereal |
| `SwapFoodPicker` | `frontend/src/components/ethereal/mealplan/swap-food-picker.tsx` | /, /ethereal |
| `SwitchControl` | `frontend/src/components/ethereal/ui.tsx` | /, /ethereal |
| `Tabs` | `frontend/src/components/ethereal/ui.tsx` | /, /ethereal |
| `TextInput` | `frontend/src/components/ethereal/ui.tsx` | /, /ethereal |
| `TextTrackerCell` | `frontend/src/components/coach/client-tracker-preview/tracker-cell.tsx` | /, /coach, /ethereal |
| `TimeInput` | `frontend/src/components/coach/client-tracker-preview/time-input.tsx` | /, /coach, /ethereal |
| `TimePicker` | `frontend/src/components/ethereal/mealplan/date-time-fields.tsx` | /, /ethereal |
| `TodayView` | `frontend/src/components/coach/client-tracker-preview/today-view.tsx` | /, /coach, /ethereal |
| `TrackerCell` | `frontend/src/components/coach/client-tracker-preview/tracker-cell.tsx` | /, /coach, /ethereal |
| `TrackerConfigurator` | `frontend/src/components/ethereal/client-tracker/tracker-configurator.tsx` | /, /ethereal |
| `TrackingView` | `frontend/src/components/coach/client-tracker-preview/tracking-view.tsx` | /, /coach, /ethereal |
| `TrackingView` | `frontend/src/components/ethereal/client-tracker/tracking-view.tsx` | /, /ethereal |
| `TrendsView` | `frontend/src/components/coach/client-tracker-preview/trends-view.tsx` | /, /coach, /ethereal |
| `VariantSchedule` | `frontend/src/components/ethereal/mealplan/variant-schedule.tsx` | /, /ethereal |
| `WeekView` | `frontend/src/components/coach/client-tracker-preview/week-view.tsx` | /, /coach, /ethereal |
| `Widget` | `frontend/src/components/ethereal/ui.tsx` | /, /ethereal |
| `WidgetContent` | `frontend/src/components/ethereal/builder/widget-content.tsx` | /, /ethereal |

## No canvas route

| Component | File | Imported by |
|---|---|---|
| `TrackerCell` | `frontend/src/components/ethereal/client-tracker/tracker-cell.tsx` | - |
