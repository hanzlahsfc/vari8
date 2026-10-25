# COMPONENTS.md - exported React components (canvas)

Generated file. Do not edit by hand: changes are overwritten by `npm run index`.
Verify the committed copy is current with `npm run index:check` (exit 1 = drift).

Source: TypeScript compiler API over `frontend/src/**`. A component is an exported
function, or a const whose initializer is a function, whose body contains JSX.
`Imported by` lists the canvas route entries that reach the component through imports;
a layout's imports count for every route beneath it.
Counts: 168 components in 88 files.

Rows are grouped by canvas surface: the coach workspace at `/coach`, the ethereal
canvas at `/ethereal` and `/`. A screen element shared by both surfaces is listed in
both sections. To name the canvas file behind a screen element, find the component in
its surface section and open the file in the second column. Canvas screens: see
`ROUTES.md`.

## Coach surface (`/coach`)

| Component | File | Imported by |
|---|---|---|
| `ActiveClientNutrition` | `frontend/src/components/coach/plans/workspace.tsx` | /client, /coach |
| `ActiveClientTraining` | `frontend/src/components/coach/plans/workspace.tsx` | /client, /coach |
| `ActivityTargetEditor` | `frontend/src/components/coach/targets/editor.tsx` | /client, /coach |
| `AdditionalDetailContent` | `frontend/src/components/coach/builder/additional-widget-content.tsx` | /client, /coach |
| `AppearanceControls` | `frontend/src/components/coach/appearance-controls.tsx` | /coach |
| `AppearanceProvider` | `frontend/src/lib/ethereal-appearance.tsx` | /, /client, /coach, /ethereal |
| `AssignDialog` | `frontend/src/components/coach/templates.tsx` | /coach |
| `AthleteOverview` | `frontend/src/components/coach/athlete/overview.tsx` | /coach |
| `AthleteProfileHeader` | `frontend/src/components/coach/athlete/overview.tsx` | /coach |
| `AthleteTimelineTab` | `frontend/src/components/coach/athlete/timeline-tab.tsx` | /coach |
| `Avatar` | `frontend/src/components/coach/ui.tsx` | /client, /coach |
| `BuilderGallery` | `frontend/src/components/coach/builder/gallery.tsx` | /client, /coach |
| `Button` | `frontend/src/components/coach/ui.tsx` | /client, /coach |
| `Button` | `frontend/src/components/vari8/components.tsx` | /, /client, /coach, /ethereal |
| `Card` | `frontend/src/components/vari8/components.tsx` | /, /client, /coach, /ethereal |
| `ChartPeriodControl` | `frontend/src/components/coach/builder/chart-period-control.tsx` | /client, /coach |
| `CheckInForm` | `frontend/src/components/client-app/check-in.tsx` | /client, /coach |
| `CheckInTab` | `frontend/src/components/client-app/views.tsx` | /client, /coach |
| `CheckInsWorkspace` | `frontend/src/components/coach/check-ins.tsx` | /coach |
| `Checkbox` | `frontend/src/components/vari8/components.tsx` | /, /client, /coach, /ethereal |
| `ClientApp` | `frontend/src/components/client-app/client-app.tsx` | /client, /coach |
| `ClientGoalsEditor` | `frontend/src/components/coach/plans/setup-ui.tsx` | /client, /coach |
| `ClientHabitsEditor` | `frontend/src/components/coach/plans/setup-ui.tsx` | /client, /coach |
| `ClientPhasePlanEditor` | `frontend/src/components/coach/plans/setup-ui.tsx` | /client, /coach |
| `ClientPlanPreview` | `frontend/src/components/coach/client-plan-preview.tsx` | /client, /coach |
| `ClientPlansSummary` | `frontend/src/components/coach/plans/setup-ui.tsx` | /client, /coach |
| `ClientPreview` | `frontend/src/components/coach/client-preview.tsx` | /coach |
| `ClientsWorkspace` | `frontend/src/components/coach/clients.tsx` | /coach |
| `CoachApp` | `frontend/src/components/coach/coach-app.tsx` | /coach |
| `CoachDashboardEditor` | `frontend/src/components/coach/builder/coach-dashboard.tsx` | /client, /coach |
| `CoachDashboardPreview` | `frontend/src/components/coach/builder/coach-dashboard.tsx` | /client, /coach |
| `CoachPlanDatePicker` | `frontend/src/components/coach/plans/nutrition/editor.tsx` | /client, /coach |
| `CoachProvider` | `frontend/src/components/coach/store.tsx` | /client, /coach |
| `CoachingWidgetContent` | `frontend/src/components/coach/builder/coaching-content.tsx` | /client, /coach |
| `DashboardBuilder` | `frontend/src/components/coach/builder/dashboard-builder.tsx` | /client, /coach |
| `DashboardTab` | `frontend/src/components/client-app/views.tsx` | /client, /coach |
| `DateField` | `frontend/src/components/coach/ui.tsx` | /client, /coach |
| `DatePicker` | `frontend/src/components/vari8/inputs.tsx` | /, /client, /coach, /ethereal |
| `DateRangePicker` | `frontend/src/components/vari8/inputs.tsx` | /, /client, /coach, /ethereal |
| `DateTimeField` | `frontend/src/components/coach/ui.tsx` | /client, /coach |
| `DateTimePicker` | `frontend/src/components/vari8/inputs.tsx` | /, /client, /coach, /ethereal |
| `DemoRecorder` | `frontend/src/components/coach/media.tsx` | /coach |
| `DetailContent` | `frontend/src/components/coach/builder/widget-content.tsx` | /client, /coach |
| `Dialog` | `frontend/src/components/coach/ui.tsx` | /client, /coach |
| `DropdownMenu` | `frontend/src/components/vari8/components.tsx` | /, /client, /coach, /ethereal |
| `EditorHeader` | `frontend/src/components/vari8/layouts.tsx` | /, /client, /coach, /ethereal |
| `Empty` | `frontend/src/components/coach/ui.tsx` | /client, /coach |
| `ExerciseLibraryDialog` | `frontend/src/components/coach/plans/training/library-dialog.tsx` | /client, /coach |
| `ExtraDateDialog` | `frontend/src/components/coach/clients.tsx` | /coach |
| `FormGrid` | `frontend/src/components/vari8/layouts.tsx` | /, /client, /coach, /ethereal |
| `FormPreview` | `frontend/src/components/coach/templates.tsx` | /coach |
| `HabitsTab` | `frontend/src/components/coach/habits-tab.tsx` | /client, /coach |
| `IconButton` | `frontend/src/components/coach/ui.tsx` | /client, /coach |
| `IconButton` | `frontend/src/components/vari8/components.tsx` | /, /client, /coach, /ethereal |
| `IifymEditor` | `frontend/src/components/coach/plans/nutrition/editor.tsx` | /client, /coach |
| `IifymPlanPreview` | `frontend/src/components/coach/plans/nutrition/editor.tsx` | /client, /coach |
| `IllustrativeTrainingTab` | `frontend/src/components/client-app/views.tsx` | /client, /coach |
| `IndividualPlanWorkspace` | `frontend/src/components/coach/plans/workspace.tsx` | /client, /coach |
| `Input` | `frontend/src/components/vari8/components.tsx` | /, /client, /coach, /ethereal |
| `MediaCard` | `frontend/src/components/coach/media.tsx` | /coach |
| `MessagesWorkspace` | `frontend/src/components/coach/messages.tsx` | /coach |
| `Modal` | `frontend/src/components/vari8/components.tsx` | /, /client, /coach, /ethereal |
| `MonthPicker` | `frontend/src/components/vari8/inputs.tsx` | /, /client, /coach, /ethereal |
| `MotionProvider` | `frontend/src/components/motion-provider.tsx` | /, /client, /coach, /dev/design-system, /ethereal |
| `MultiSelect` | `frontend/src/components/vari8/inputs.tsx` | /, /client, /coach, /ethereal |
| `MuscleHeatmap` | `frontend/src/components/coach/muscle-heatmap.tsx` | /client, /coach |
| `Navigation` | `frontend/src/components/vari8/components.tsx` | /, /client, /coach, /ethereal |
| `NotesWorkspace` | `frontend/src/components/coach/notes.tsx` | /coach |
| `NutritionEditor` | `frontend/src/components/coach/plans/nutrition/editor.tsx` | /client, /coach |
| `NutritionHistory` | `frontend/src/components/coach/builder/nutrition-history.tsx` | /client, /coach |
| `NutritionPlanPreview` | `frontend/src/components/coach/plans/nutrition/editor.tsx` | /client, /coach |
| `NutritionTab` | `frontend/src/components/client-app/views.tsx` | /client, /coach |
| `NutritionWidgetContent` | `frontend/src/components/coach/builder/nutrition-content.tsx` | /client, /coach |
| `OtherTargetDialog` | `frontend/src/components/coach/plans/plan-cards-support.tsx` | /client, /coach |
| `PageHeader` | `frontend/src/components/vari8/layouts.tsx` | /, /client, /coach, /ethereal |
| `PageTitle` | `frontend/src/components/coach/ui.tsx` | /client, /coach |
| `ParameterValue` | `frontend/src/components/coach/ui.tsx` | /client, /coach |
| `PreviewDialog` | `frontend/src/components/coach/templates.tsx` | /coach |
| `ProductPageLink` | `frontend/src/components/coach/supplements/product-page-link.tsx` | /client, /coach |
| `ProgressWidgetContent` | `frontend/src/components/coach/builder/progress-content.tsx` | /client, /coach |
| `RoadmapTab` | `frontend/src/components/client-app/views.tsx` | /client, /coach |
| `SearchBox` | `frontend/src/components/coach/ui.tsx` | /client, /coach |
| `SearchableSelect` | `frontend/src/components/vari8/inputs.tsx` | /, /client, /coach, /ethereal |
| `Section` | `frontend/src/components/vari8/layouts.tsx` | /, /client, /coach, /ethereal |
| `SegmentedControl` | `frontend/src/components/vari8/components.tsx` | /, /client, /coach, /ethereal |
| `Select` | `frontend/src/components/coach/ui.tsx` | /client, /coach |
| `Select` | `frontend/src/components/vari8/components.tsx` | /, /client, /coach, /ethereal |
| `SessionLogger` | `frontend/src/components/client-app/training-log/session-logger.tsx` | /client, /coach |
| `SmoothTrend` | `frontend/src/components/coach/builder/smooth-trend.tsx` | /client, /coach |
| `Status` | `frontend/src/components/coach/ui.tsx` | /client, /coach |
| `Status` | `frontend/src/components/vari8/components.tsx` | /, /client, /coach, /ethereal |
| `SupplementEditor` | `frontend/src/components/coach/supplements/editor.tsx` | /client, /coach |
| `SupplementPlanView` | `frontend/src/components/coach/supplements/plan-view.tsx` | /client, /coach |
| `Surface` | `frontend/src/components/coach/ui.tsx` | /client, /coach |
| `Table` | `frontend/src/components/vari8/components.tsx` | /, /client, /coach, /ethereal |
| `Tabs` | `frontend/src/components/vari8/components.tsx` | /, /client, /coach, /ethereal |
| `TargetSummary` | `frontend/src/components/coach/targets/target-summary.tsx` | /client, /coach |
| `TemplateEditor` | `frontend/src/components/coach/templates.tsx` | /coach |
| `TemplateLibrary` | `frontend/src/components/coach/templates.tsx` | /coach |
| `TemplatePreview` | `frontend/src/components/coach/ui.tsx` | /client, /coach |
| `TemporaryPlanDialog` | `frontend/src/components/coach/plans/temporary-plan-dialog.tsx` | /client, /coach |
| `TextArea` | `frontend/src/components/vari8/inputs.tsx` | /, /client, /coach, /ethereal |
| `TextTrackerCell` | `frontend/src/components/coach/client-tracker-preview/tracker-cell.tsx` | /, /client, /coach, /ethereal |
| `ThemeScope` | `frontend/src/components/vari8/theme.tsx` | /, /client, /coach, /ethereal |
| `TimeInput` | `frontend/src/components/coach/client-tracker-preview/time-input.tsx` | /, /client, /coach, /ethereal |
| `TimePicker` | `frontend/src/components/vari8/inputs.tsx` | /, /client, /coach, /ethereal |
| `TodayView` | `frontend/src/components/coach/client-tracker-preview/today-view.tsx` | /, /client, /coach, /ethereal |
| `Toggle` | `frontend/src/components/coach/ui.tsx` | /client, /coach |
| `Toggle` | `frontend/src/components/vari8/components.tsx` | /, /client, /coach, /ethereal |
| `Toolbar` | `frontend/src/components/vari8/layouts.tsx` | /, /client, /coach, /ethereal |
| `Tooltip` | `frontend/src/components/vari8/components.tsx` | /, /client, /coach, /ethereal |
| `TrackerCell` | `frontend/src/components/coach/client-tracker-preview/tracker-cell.tsx` | /, /client, /coach, /ethereal |
| `TrackerTab` | `frontend/src/components/client-app/views.tsx` | /client, /coach |
| `TrackingView` | `frontend/src/components/coach/client-tracker-preview/tracking-view.tsx` | /, /client, /coach, /ethereal |
| `TrainingEditor` | `frontend/src/components/coach/plans/training/editor.tsx` | /client, /coach |
| `TrainingLogbook` | `frontend/src/components/client-app/training-log/training-logbook.tsx` | /client, /coach |
| `TrainingPrescription` | `frontend/src/components/coach/plans/training/editor.tsx` | /client, /coach |
| `TrainingTab` | `frontend/src/components/client-app/views.tsx` | /client, /coach |
| `Transition` | `frontend/src/components/coach/ui.tsx` | /client, /coach |
| `TrendsView` | `frontend/src/components/coach/client-tracker-preview/trends-view.tsx` | /, /client, /coach, /ethereal |
| `WeekPicker` | `frontend/src/components/vari8/inputs.tsx` | /, /client, /coach, /ethereal |
| `WeekView` | `frontend/src/components/coach/client-tracker-preview/week-view.tsx` | /, /client, /coach, /ethereal |
| `WidgetContent` | `frontend/src/components/coach/builder/widget-content.tsx` | /client, /coach |
| `WidgetPreview` | `frontend/src/components/coach/ui.tsx` | /client, /coach |

## Ethereal surface (`/`, `/ethereal`)

| Component | File | Imported by |
|---|---|---|
| `AdditionalDetailContent` | `frontend/src/components/ethereal/builder/additional-widget-content.tsx` | /, /ethereal |
| `AppearanceProvider` | `frontend/src/lib/ethereal-appearance.tsx` | /, /client, /coach, /ethereal |
| `AppearanceScreen` | `frontend/src/components/ethereal/appearance-views.tsx` | /, /ethereal |
| `Avatar` | `frontend/src/components/ethereal/ui.tsx` | /, /ethereal |
| `BodyweightTrend` | `frontend/src/components/ethereal/tracker-components.tsx` | /, /ethereal |
| `BuilderGallery` | `frontend/src/components/ethereal/builder/gallery.tsx` | /, /ethereal |
| `Button` | `frontend/src/components/vari8/components.tsx` | /, /client, /coach, /ethereal |
| `Card` | `frontend/src/components/vari8/components.tsx` | /, /client, /coach, /ethereal |
| `ChartPeriodControl` | `frontend/src/components/ethereal/builder/chart-period-control.tsx` | /, /ethereal |
| `Checkbox` | `frontend/src/components/vari8/components.tsx` | /, /client, /coach, /ethereal |
| `CheckboxControl` | `frontend/src/components/ethereal/ui.tsx` | /, /ethereal |
| `ClientPlanPreview` | `frontend/src/components/ethereal/mealplan/client-plan-preview.tsx` | /, /ethereal |
| `ClientProfile` | `frontend/src/components/ethereal/clients/client-profile.tsx` | /, /ethereal |
| `ClientRoster` | `frontend/src/components/ethereal/clients/client-roster.tsx` | /, /ethereal |
| `ClientTracker` | `frontend/src/components/ethereal/client-tracker/client-tracker.tsx` | /, /ethereal |
| `ClientsWorkspace` | `frontend/src/components/ethereal/clients/clients-workspace.tsx` | /, /ethereal |
| `CoachingWidgetContent` | `frontend/src/components/ethereal/builder/coaching-content.tsx` | /, /ethereal |
| `DashboardBuilder` | `frontend/src/components/ethereal/builder/dashboard-builder.tsx` | /, /ethereal |
| `DatePicker` | `frontend/src/components/vari8/inputs.tsx` | /, /client, /coach, /ethereal |
| `DateRangePicker` | `frontend/src/components/vari8/inputs.tsx` | /, /client, /coach, /ethereal |
| `DateTimePicker` | `frontend/src/components/vari8/inputs.tsx` | /, /client, /coach, /ethereal |
| `DetailContent` | `frontend/src/components/ethereal/builder/widget-content.tsx` | /, /ethereal |
| `DropdownMenu` | `frontend/src/components/vari8/components.tsx` | /, /client, /coach, /ethereal |
| `EditorHeader` | `frontend/src/components/vari8/layouts.tsx` | /, /client, /coach, /ethereal |
| `EtherealApp` | `frontend/src/components/ethereal/coaching-app.tsx` | /, /ethereal |
| `FormGrid` | `frontend/src/components/vari8/layouts.tsx` | /, /client, /coach, /ethereal |
| `FoundationComponents` | `frontend/src/components/ethereal/foundation-components.tsx` | /, /ethereal |
| `IconButton` | `frontend/src/components/vari8/components.tsx` | /, /client, /coach, /ethereal |
| `Input` | `frontend/src/components/vari8/components.tsx` | /, /client, /coach, /ethereal |
| `LabelTag` | `frontend/src/components/ethereal/ui.tsx` | /, /ethereal |
| `MealplanWorkspace` | `frontend/src/components/ethereal/mealplan/mealplan-workspace.tsx` | /, /ethereal |
| `Modal` | `frontend/src/components/vari8/components.tsx` | /, /client, /coach, /ethereal |
| `MonthPicker` | `frontend/src/components/vari8/inputs.tsx` | /, /client, /coach, /ethereal |
| `MotionProvider` | `frontend/src/components/motion-provider.tsx` | /, /client, /coach, /dev/design-system, /ethereal |
| `MultiSelect` | `frontend/src/components/vari8/inputs.tsx` | /, /client, /coach, /ethereal |
| `Navigation` | `frontend/src/components/vari8/components.tsx` | /, /client, /coach, /ethereal |
| `NutritionHistory` | `frontend/src/components/ethereal/builder/nutrition-history.tsx` | /, /ethereal |
| `NutritionTargets` | `frontend/src/components/ethereal/tracker-components.tsx` | /, /ethereal |
| `NutritionWidgetContent` | `frontend/src/components/ethereal/builder/nutrition-content.tsx` | /, /ethereal |
| `PageHeader` | `frontend/src/components/vari8/layouts.tsx` | /, /client, /coach, /ethereal |
| `PlanOverview` | `frontend/src/components/ethereal/mealplan/plan-overview.tsx` | /, /ethereal |
| `ProgressWidgetContent` | `frontend/src/components/ethereal/builder/progress-content.tsx` | /, /ethereal |
| `SavedMealLibrary` | `frontend/src/components/ethereal/mealplan/saved-meal-library.tsx` | /, /ethereal |
| `SearchableSelect` | `frontend/src/components/vari8/inputs.tsx` | /, /client, /coach, /ethereal |
| `Section` | `frontend/src/components/vari8/layouts.tsx` | /, /client, /coach, /ethereal |
| `Segmented` | `frontend/src/components/ethereal/ui.tsx` | /, /ethereal |
| `SegmentedControl` | `frontend/src/components/vari8/components.tsx` | /, /client, /coach, /ethereal |
| `Select` | `frontend/src/components/vari8/components.tsx` | /, /client, /coach, /ethereal |
| `SelectControl` | `frontend/src/components/ethereal/ui.tsx` | /, /ethereal |
| `SmoothTrend` | `frontend/src/components/ethereal/builder/smooth-trend.tsx` | /, /ethereal |
| `Status` | `frontend/src/components/vari8/components.tsx` | /, /client, /coach, /ethereal |
| `StatusLabel` | `frontend/src/components/ethereal/ui.tsx` | /, /ethereal |
| `SwapFoodPicker` | `frontend/src/components/ethereal/mealplan/swap-food-picker.tsx` | /, /ethereal |
| `SwitchControl` | `frontend/src/components/ethereal/ui.tsx` | /, /ethereal |
| `Table` | `frontend/src/components/vari8/components.tsx` | /, /client, /coach, /ethereal |
| `Tabs` | `frontend/src/components/ethereal/ui.tsx` | /, /ethereal |
| `Tabs` | `frontend/src/components/vari8/components.tsx` | /, /client, /coach, /ethereal |
| `TextArea` | `frontend/src/components/vari8/inputs.tsx` | /, /client, /coach, /ethereal |
| `TextInput` | `frontend/src/components/ethereal/ui.tsx` | /, /ethereal |
| `TextTrackerCell` | `frontend/src/components/coach/client-tracker-preview/tracker-cell.tsx` | /, /client, /coach, /ethereal |
| `ThemeScope` | `frontend/src/components/vari8/theme.tsx` | /, /client, /coach, /ethereal |
| `TimeInput` | `frontend/src/components/coach/client-tracker-preview/time-input.tsx` | /, /client, /coach, /ethereal |
| `TimePicker` | `frontend/src/components/vari8/inputs.tsx` | /, /client, /coach, /ethereal |
| `TodayView` | `frontend/src/components/coach/client-tracker-preview/today-view.tsx` | /, /client, /coach, /ethereal |
| `Toggle` | `frontend/src/components/vari8/components.tsx` | /, /client, /coach, /ethereal |
| `Toolbar` | `frontend/src/components/vari8/layouts.tsx` | /, /client, /coach, /ethereal |
| `Tooltip` | `frontend/src/components/vari8/components.tsx` | /, /client, /coach, /ethereal |
| `TrackerCell` | `frontend/src/components/coach/client-tracker-preview/tracker-cell.tsx` | /, /client, /coach, /ethereal |
| `TrackerConfigurator` | `frontend/src/components/ethereal/client-tracker/tracker-configurator.tsx` | /, /ethereal |
| `TrackingView` | `frontend/src/components/coach/client-tracker-preview/tracking-view.tsx` | /, /client, /coach, /ethereal |
| `TrackingView` | `frontend/src/components/ethereal/client-tracker/tracking-view.tsx` | /, /ethereal |
| `TrendsView` | `frontend/src/components/coach/client-tracker-preview/trends-view.tsx` | /, /client, /coach, /ethereal |
| `VariantSchedule` | `frontend/src/components/ethereal/mealplan/variant-schedule.tsx` | /, /ethereal |
| `WeekPicker` | `frontend/src/components/vari8/inputs.tsx` | /, /client, /coach, /ethereal |
| `WeekView` | `frontend/src/components/coach/client-tracker-preview/week-view.tsx` | /, /client, /coach, /ethereal |
| `Widget` | `frontend/src/components/ethereal/ui.tsx` | /, /ethereal |
| `WidgetContent` | `frontend/src/components/ethereal/builder/widget-content.tsx` | /, /ethereal |

## No canvas route

| Component | File | Imported by |
|---|---|---|
| `Button` | `frontend/src/components/ui/button.tsx` | - |
| `ClientRoute` | `frontend/src/components/client-app/client-route.tsx` | /client |
| `CoachingWorkspaceSample` | `frontend/src/components/vari8/playground-compositions.tsx` | - |
| `InputShowcase` | `frontend/src/components/vari8/input-showcase.tsx` | - |
| `LayoutShowcase` | `frontend/src/components/vari8/playground-compositions.tsx` | - |
| `Vari8Playground` | `frontend/src/components/vari8/playground.tsx` | - |
