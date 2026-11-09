"use client";

/**
 * Reusable setup configuration surface.
 *
 * The editor owns the section nav, section bodies and the live preview. The
 * host owns persistence: `onChange` receives an updater, so both the template
 * editor draft and a future client-setup mode can reuse the same UI. Nothing
 * here depends on the template library; `mode` only changes wording and hides
 * the name/description fields.
 */

import {
  Check,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  Checkbox,
  SegmentedControl,
  Input as Vari8Input,
  Select as Vari8Select,
} from "../vari8/components";
import { TextArea } from "../vari8/inputs";
import { Section } from "../vari8/layouts";
import { TIMELINE_COLUMNS } from "./athlete/timeline-columns";
import { normalizeTimelineSetup } from "./athlete/timeline-config";
import { bindDashboardUnits } from "./builder/coach-dashboard";
import {
  defaultDecimals,
  defaultSummary,
  defaultTimelineAggregation,
} from "./client-tracker-preview/preview-model";
import { CustomParameterDialog } from "./custom-parameter-dialog";
import {
  allParameters,
  archiveCustomParameter,
  CORE_VIEWS,
  type CoachClient,
  customParameterUsage,
  deleteCustomParameter,
  type FieldConfig,
  type Parameter,
  setCustomParameters,
  type Template,
  type TimelineColumnSetting,
  TRAINING_FIELDS,
  updateCustomParameterDefinition,
  type Variant,
} from "./model";
import {
  DEFAULT_TRAINING_DEFAULTS,
  DEFAULT_TRAINING_OPTIONS,
  type TrainingOptionKey,
  type TrainingOptions,
} from "./plans/training-options";
import { EXERCISE_INFO_FIELDS, exerciseInfoFields } from "./plans/types";
import { QuestionnaireEditor } from "./questionnaire-editor";
import {
  addItemToGroup,
  hiddenItems,
  resetLayout,
  timelineColumnMeta,
  timelineLayoutDefaults,
  timelineLayoutFrom,
  toggleVisibility,
  toTimelineGroups,
  toTrackerLayout,
  trackerLayoutDefaults,
  trackerLayoutFrom,
} from "./setup-layout";
import type { SetupSection } from "./setup-preview";
import { useCoach } from "./store";
import { StructureBoard, type StructureBoardItem } from "./structure-board";
import {
  DEFAULT_PHASE_OPTIONS,
  templateSetup,
  WEEKLY_VOLUME_BREAKDOWN,
} from "./template-setup";
import "./tracker-config.css";
import "./plans/training-options.css";
import {
  Button,
  Dialog,
  Empty,
  ParameterValue,
  Select,
  Surface,
  Toggle,
} from "./ui";
import "./setup-editor.css";

export type SetupEditorProps = {
  template: Template;
  variantId: string;
  onChange: (fn: (template: Template) => Template) => void;
  mode: "template" | "client";
  sampleClient?: CoachClient;
  headerSlot?: ReactNode;
  /** Client mode: sections that differ from the current library template. */
  customizedSections?: SetupSection[];
  /** Client mode: open the host's reset confirmation for one section. */
  onResetSection?: (section: SetupSection) => void;
  /** Controlled section, so the host's Preview button can open the same tab. */
  section?: SetupSection;
  onSectionChange?: (section: SetupSection) => void;
};

const EDITOR_SECTIONS: SetupSection[] = [
  "Tabs",
  "Tracker",
  "Timeline",
  "Nutrition",
  "Training",
  "Check-In",
  "Habits",
];

export function SetupEditor({
  template,
  variantId,
  onChange,
  mode,
  sampleClient,
  headerSlot,
  customizedSections = [],
  onResetSection,
  section: controlledSection,
  onSectionChange,
}: SetupEditorProps) {
  const {
    state: workspaceState,
    setState: setWorkspaceState,
    toast,
  } = useCoach();
  const [customDialog, setCustomDialog] = useState<{
    group: string;
    parameter?: Parameter;
  } | null>(null);
  const [internalSection, setInternalSection] = useState<SetupSection>("Tabs");
  const section = controlledSection ?? internalSection;
  const chooseSection = (next: SetupSection) => {
    setInternalSection(next);
    onSectionChange?.(next);
  };
  const variant = templateSetup(template, variantId);
  const rawVariant = useMemo(
    () =>
      template.variants.find((item) => item.id === variant.id) ??
      template.legacyConfigurations?.find((item) => item.id === variant.id) ??
      template.variants[0],
    [template, variant.id],
  );
  const updateVariant = (fn: (current: Variant) => Variant) =>
    onChange((current) => ({
      ...current,
      variants: current.variants.map((item) =>
        item.id === variant.id
          ? (() => {
              const next = fn(item);
              return next.dashboard
                ? {
                    ...next,
                    dashboard: bindDashboardUnits(next.dashboard, next),
                  }
                : next;
            })()
          : item,
      ),
    }));
  const features = useMemo(() => {
    const plans = sampleClient?.plans;
    if (!plans) return { nutrition: true, training: true, activity: true };
    return {
      nutrition: Boolean(
        plans.nutrition.mealPlan.active ||
          plans.nutrition.mealPlan.draft ||
          plans.nutrition.mealPlan.history.length ||
          plans.nutrition.iifym.active ||
          plans.nutrition.iifym.draft ||
          plans.nutrition.iifym.history.length,
      ),
      training: Boolean(
        plans.training.active ||
          plans.training.draft ||
          plans.training.history.length,
      ),
      activity: (plans.activityTargets?.length ?? 0) > 0,
    };
  }, [sampleClient]);

  const sectionBody = (() => {
    switch (section) {
      case "Tabs":
        return (
          <>
            {mode === "template" && (
              <>
                <Vari8Input
                  label="Template name"
                  value={template.name}
                  maxLength={80}
                  onChange={(event) =>
                    onChange((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
                <TextArea
                  label="Description"
                  value={template.description}
                  rows={2}
                  onChange={(event) =>
                    onChange((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  placeholder="Who is this template for?"
                />
              </>
            )}
            <h3>Client tabs</h3>
            <div className="cd-view-settings">
              {CORE_VIEWS.map((view) => (
                <Toggle
                  key={view}
                  label={view}
                  checked={variant.views.includes(view)}
                  onChange={(checked) =>
                    updateVariant((current) => ({
                      ...current,
                      views: checked
                        ? [...current.views, view]
                        : current.views.filter((item) => item !== view),
                    }))
                  }
                />
              ))}
              <Toggle
                label="Habits"
                checked={variant.habits}
                onChange={(habits) =>
                  updateVariant((current) => ({ ...current, habits }))
                }
              />
            </div>
          </>
        );
      case "Tracker":
        return (
          <TrackerConfig
            variant={variant}
            rawVariant={rawVariant}
            update={updateVariant}
            mode={mode}
            onCreateParameter={(group) => setCustomDialog({ group })}
            onEditParameter={(parameter) =>
              setCustomDialog({ group: parameter.group, parameter })
            }
          />
        );
      case "Timeline":
        return (
          <TimelineConfig
            variant={variant}
            rawVariant={rawVariant}
            features={features}
            update={updateVariant}
          />
        );
      case "Nutrition":
        return (
          <>
            <p className="cd-muted">
              Choose the nutrition experience. Meal count, labels, times, foods,
              swaps, targets and training/rest-day schedules are personalized in
              each athlete’s client setup.
            </p>
            <SegmentedControl
              label="Nutrition mode"
              value={variant.nutrition}
              onValueChange={(nutrition) =>
                updateVariant((current) => ({
                  ...current,
                  nutrition: nutrition as typeof current.nutrition,
                }))
              }
              options={[
                { value: "Meal plan", label: "Meal plan" },
                { value: "IIFYM", label: "IIFYM · macro targets" },
              ]}
            />
            <div className="cd-info-line">
              Client setup owns the prescription. This template controls its
              presentation.
            </div>
          </>
        );
      case "Training":
        return <TrainingConfig variant={variant} update={updateVariant} />;
      case "Check-In":
        return (
          <QuestionnaireConfig
            variant={variant}
            update={updateVariant}
            mode={mode}
          />
        );
      case "Habits":
        return (
          <>
            <div className="cd-setup-rows">
              <Toggle
                label="Include Habit Tracker"
                checked={variant.habits}
                onChange={(habits) =>
                  updateVariant((current) => ({ ...current, habits }))
                }
              />
            </div>
            {variant.habits ? (
              <div className="cd-habit-preview">
                <span className="cd-check-circle">
                  <Check />
                </span>
                <div>
                  <strong>Evening walk</strong>
                  <small>Daily · 20 minutes · 5 / 7 completed</small>
                  <p>Create a calm transition into the evening.</p>
                </div>
              </div>
            ) : (
              <Empty title="Habit Tracker is hidden">
                Enable it to include separate habit logging.
              </Empty>
            )}
            <p className="cd-muted">
              Define each athlete’s actual habits, frequency, goals and reasons
              in client setup.
            </p>
            <div className="cd-setup-rows">
              <Toggle
                disabled={!variant.habits}
                label="Include habit status in check-ins"
                checked={variant.habits && variant.summaries.includes("habits")}
                onChange={(checked) =>
                  updateVariant((current) => ({
                    ...current,
                    summaries: checked
                      ? [...new Set([...current.summaries, "habits"])]
                      : current.summaries.filter((item) => item !== "habits"),
                  }))
                }
              />
            </div>
          </>
        );
    }
  })();

  return (
    <div className="cd-setup-editor cd-setup-workspace">
      {headerSlot}
      <div className="cd-editor-layout">
        <aside className="cd-editor-nav">
          <p className="cd-setup-eyebrow v8-overline">
            {mode === "template" ? "Template setup" : "Client setup"}
          </p>
          <nav
            aria-label={
              mode === "template" ? "Template configuration" : "Client setup"
            }
          >
            {EDITOR_SECTIONS.map((item, index) => (
              <button
                type="button"
                className={section === item ? "active" : ""}
                aria-current={section === item ? "page" : undefined}
                onClick={() => chooseSection(item)}
                key={item}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                {item}
                {customizedSections.includes(item) && (
                  <span
                    className="cd-setup-nav-dot"
                    role="img"
                    aria-label="Differs from template"
                    title="Differs from template"
                  />
                )}
              </button>
            ))}
          </nav>
        </aside>
        <SectionAsSurface
          section={section}
          customized={customizedSections.includes(section)}
          onReset={onResetSection ? () => onResetSection(section) : undefined}
        >
          {sectionBody}
        </SectionAsSurface>
      </div>
      {customDialog && (
        <CustomParameterDialog
          group={customDialog.group}
          parameter={customDialog.parameter}
          usage={
            customDialog.parameter
              ? customParameterUsage(workspaceState, customDialog.parameter.id)
              : { templates: 0, clients: 0, total: 0 }
          }
          onClose={() => setCustomDialog(null)}
          onSave={(next) => {
            setWorkspaceState((current) =>
              (current.customParameters ?? []).some(
                (item) => item.id === next.id,
              )
                ? updateCustomParameterDefinition(current, next)
                : setCustomParameters(current, [
                    ...(current.customParameters ?? []),
                    next,
                  ]),
            );
            setCustomDialog(null);
            toast(
              customDialog.parameter
                ? `${next.name} updated for every client`
                : `${next.name} created`,
            );
          }}
          onArchive={() => {
            const parameter = customDialog.parameter;
            if (!parameter) return;
            setWorkspaceState((current) =>
              archiveCustomParameter(current, parameter.id),
            );
            toast(`${parameter.name} archived`);
          }}
          onDelete={() => {
            const parameter = customDialog.parameter;
            if (!parameter) return;
            setWorkspaceState((current) =>
              deleteCustomParameter(current, parameter.id),
            );
            toast(`${parameter.name} deleted`);
          }}
        />
      )}
    </div>
  );
}

/** Section wrapper carrying the title and the reset action. */
function SectionAsSurface({
  section,
  customized,
  onReset,
  children,
}: {
  section: SetupSection;
  customized: boolean;
  onReset?: () => void;
  children: ReactNode;
}) {
  return (
    <Surface className="cd-config-surface">
      <Section
        className="cd-config-section"
        title={section}
        actions={
          <div className="cd-setup-section-actions">
            {customized && (
              <span className="cd-setup-diff-label">Differs from template</span>
            )}
            {customized && onReset && (
              <Button size="sm" onClick={onReset}>
                <RotateCcw size={14} />
                Reset to template
              </Button>
            )}
            <SlidersHorizontal size={19} aria-hidden="true" />
          </div>
        }
      >
        {children}
      </Section>
    </Surface>
  );
}

function TrackerConfig({
  variant,
  rawVariant,
  update,
  mode,
  onCreateParameter,
  onEditParameter,
}: {
  variant: Variant;
  rawVariant: Variant;
  update: (fn: (current: Variant) => Variant) => void;
  mode: "template" | "client";
  onCreateParameter: (group: string) => void;
  onEditParameter: (parameter: Parameter) => void;
}) {
  const [optionDrafts, setOptionDrafts] = useState<Record<string, string>>({});
  const removedFieldConfigs = useRef<Record<string, FieldConfig>>({});
  const cycleTrackingEnabled =
    variant.cycleTrackingEnabled ??
    variant.fields.some(
      (field) =>
        allParameters().find((parameter) => parameter.id === field.id)
          ?.group === "Cycle tracking",
    );
  const selectableParameters = allParameters().filter(
    (parameter) =>
      parameter.id !== "cycle-day" &&
      parameter.group.toLowerCase() !== "training" &&
      (cycleTrackingEnabled || parameter.group !== "Cycle tracking") &&
      (parameter.archived !== true ||
        variant.fields.some((field) => field.id === parameter.id)),
  );
  const visibleFields = variant.fields.filter((field) =>
    selectableParameters.some((parameter) => parameter.id === field.id),
  );
  const visibleFieldIds = new Set(visibleFields.map((field) => field.id));
  const visibleIds = new Set(visibleFields.map((field) => field.id));
  const layoutGroups = trackerLayoutFrom(rawVariant)
    .map((group) => ({
      ...group,
      items: group.items.filter((itemId) => visibleIds.has(itemId)),
    }))
    // The automatic layout keeps a Cycle group for saved cycle fields; when
    // cycle tracking is off those fields are hidden and the empty group would
    // only add noise to the board.
    .filter(
      (group) =>
        group.items.length > 0 || group.id !== "Cycle" || cycleTrackingEnabled,
    );
  const layoutItems: StructureBoardItem[] = visibleFields.map((field) => {
    const parameter = allParameters().find((item) => item.id === field.id);
    return {
      id: field.id,
      label: parameter?.name ?? field.id,
      unit: field.unit || undefined,
      hint: parameter?.group,
    };
  });
  const addableParameters: StructureBoardItem[] = selectableParameters
    .filter(
      (parameter) =>
        !visibleFieldIds.has(parameter.id) && parameter.archived !== true,
    )
    .map((parameter) => ({
      id: parameter.id,
      label: parameter.name,
      unit: parameter.units[0],
      hint: parameter.group,
      ...(parameter.custom ? { badge: "Custom" } : {}),
    }));
  const addParameter = (parameterId: string, groupId: string) => {
    const parameter = selectableParameters.find(
      (item) => item.id === parameterId,
    );
    if (!parameter || visibleFieldIds.has(parameterId)) return;
    const retained = removedFieldConfigs.current[parameterId];
    const field: FieldConfig = retained
      ? {
          ...retained,
          ...(retained.options ? { options: [...retained.options] } : {}),
        }
      : {
          id: parameter.id,
          unit: parameter.units[0] ?? "",
          ...(parameter.options ? { options: [...parameter.options] } : {}),
        };
    update((current) => {
      const fields = current.fields.some((item) => item.id === parameter.id)
        ? current.fields
        : [...current.fields, field];
      // Derive the existing layout before the field exists, otherwise the
      // normaliser appends it to its automatic group and the requested group
      // would never receive it.
      const groups = addItemToGroup(
        trackerLayoutFrom(current),
        parameter.id,
        groupId,
      );
      return {
        ...current,
        fields,
        trackerLayout: toTrackerLayout(
          groups,
          fields.map((item) => item.id),
        ),
      };
    });
    delete removedFieldConfigs.current[parameterId];
  };
  const removeParameter = (parameterId: string) => {
    const removed = variant.fields.find((field) => field.id === parameterId);
    if (removed) {
      removedFieldConfigs.current[parameterId] = {
        ...removed,
        ...(removed.options ? { options: [...removed.options] } : {}),
      };
    }
    update((current) => {
      const fields = current.fields.filter((field) => field.id !== parameterId);
      const groups = trackerLayoutFrom(current).map((group) => ({
        ...group,
        items: group.items.filter((item) => item !== parameterId),
      }));
      return {
        ...current,
        fields,
        trackerLayout: toTrackerLayout(
          groups,
          fields.map((field) => field.id),
        ),
        roadmap: current.roadmap.filter((row) => row.source !== parameterId),
        widgets: current.widgets.filter(
          (widget) => widget.source !== parameterId,
        ),
      };
    });
    setOptionDrafts((drafts) => {
      const next = { ...drafts };
      delete next[parameterId];
      return next;
    });
  };
  const setCycleTracking = (enabled: boolean) => {
    update((current) => {
      const hasCycleFields = current.fields.some(
        (field) =>
          allParameters().find((parameter) => parameter.id === field.id)
            ?.group === "Cycle tracking",
      );
      const bleeding = allParameters().find(
        (parameter) => parameter.id === "bleeding-level",
      );
      const periodStart = allParameters().find(
        (parameter) => parameter.id === "period-start",
      );
      if (!bleeding || !periodStart) return current;
      const fields =
        enabled && !hasCycleFields
          ? [
              ...current.fields,
              {
                id: bleeding.id,
                unit: bleeding.units[0] ?? "",
                options: [...(bleeding.options ?? [])],
              },
              { id: periodStart.id, unit: "date" },
            ]
          : current.fields;
      const groups =
        fields === current.fields
          ? undefined
          : trackerLayoutFrom({ ...current, fields });
      return {
        ...current,
        cycleTrackingEnabled: enabled,
        fields,
        ...(groups
          ? {
              trackerLayout: toTrackerLayout(
                groups,
                fields.map((field) => field.id),
              ),
            }
          : {}),
      };
    });
  };
  const renderSettings = (item: StructureBoardItem) => {
    const field =
      rawVariant.fields.find((candidate) => candidate.id === item.id) ??
      variant.fields.find((candidate) => candidate.id === item.id);
    const parameter = allParameters().find(
      (candidate) => candidate.id === item.id,
    );
    if (!field || !parameter) return null;
    if (parameter.custom) {
      return (
        <div className="cd-structure-settings">
          <p className="cd-structure-note">
            Custom parameter · Applies to every client using it.
          </p>
          {parameter.archived && (
            <p className="cd-structure-note">
              Archived. It stays visible where it is already used.
            </p>
          )}
          <Button size="sm" onClick={() => onEditParameter(parameter)}>
            Edit parameter
          </Button>
        </div>
      );
    }
    const canConfigureUnit =
      parameter.units.length > 0 &&
      ![
        "text",
        "context",
        "choice",
        "multi-choice",
        "location-rating",
        "period-start",
        "cycle-day",
      ].includes(parameter.inputType ?? "");
    const canConfigureChoices =
      parameter.inputType === "choice" ||
      parameter.inputType === "multi-choice";
    const canConfigureDecimals =
      !parameter.inputType &&
      !parameter.units.some((unit) =>
        ["1–10", "1–5", "Word labels"].includes(unit),
      );
    return (
      <div className="cd-structure-settings">
        {parameter.id === "period-start" && (
          <p className="cd-structure-note">
            Cycle day is calculated automatically from period starts.
          </p>
        )}
        {canConfigureUnit && (
          <Select
            label={`Unit for ${parameter.name}`}
            value={field.unit}
            options={parameter.units}
            onChange={(unit) =>
              update((current) => ({
                ...current,
                fields: current.fields.map((candidate) =>
                  candidate.id === field.id
                    ? { ...candidate, unit }
                    : candidate,
                ),
                roadmap:
                  unit === "Word labels"
                    ? current.roadmap.filter((row) => row.source !== field.id)
                    : current.roadmap,
              }))
            }
          />
        )}
        {canConfigureChoices && (
          <TextArea
            label="Choice labels"
            rows={2}
            value={
              optionDrafts[field.id] ??
              (field.options ?? parameter.options ?? []).join(", ")
            }
            onChange={(event) => {
              const draft = event.target.value;
              const options = [
                ...new Set(
                  draft
                    .split(/[\n,]/)
                    .map((option) => option.trim())
                    .filter(Boolean),
                ),
              ];
              setOptionDrafts((drafts) => ({ ...drafts, [field.id]: draft }));
              update((current) => ({
                ...current,
                fields: current.fields.map((candidate) =>
                  candidate.id === field.id
                    ? { ...candidate, options }
                    : candidate,
                ),
              }));
            }}
            onBlur={() =>
              setOptionDrafts((drafts) => {
                const next = { ...drafts };
                delete next[field.id];
                return next;
              })
            }
            aria-label={`Choice labels for ${parameter.name}`}
            placeholder="Separate labels with commas"
          />
        )}
        {canConfigureDecimals && (
          <div className="cd-structure-decimals">
            <span className="cd-structure-label">Decimals</span>
            <SegmentedControl
              label="Decimals"
              value={String(field.decimals ?? defaultDecimals(parameter))}
              onValueChange={(value) =>
                update((current) => ({
                  ...current,
                  fields: current.fields.map((candidate) =>
                    candidate.id === field.id
                      ? {
                          ...candidate,
                          decimals: Number(value) as 0 | 1 | 2,
                        }
                      : candidate,
                  ),
                }))
              }
              options={[
                { value: "0", label: "0" },
                { value: "1", label: "1" },
                { value: "2", label: "2" },
              ]}
            />
          </div>
        )}
        <Select
          label="Week summary"
          value={field.summary ?? defaultSummary(parameter)}
          options={[
            { value: "avg", label: "Average" },
            { value: "sum", label: "Total" },
            { value: "count", label: "Count" },
            { value: "none", label: "None" },
          ]}
          onChange={(value) =>
            update((current) => ({
              ...current,
              fields: current.fields.map((candidate) =>
                candidate.id === field.id
                  ? {
                      ...candidate,
                      summary: value as "avg" | "sum" | "count" | "none",
                    }
                  : candidate,
              ),
            }))
          }
        />
      </div>
    );
  };
  return (
    <div className="cd-tracker-config">
      <p className="cd-muted cd-tracker-intro">
        Set the daily log in the order athletes will use it. Their history stays
        available when a field is removed.
      </p>
      {mode === "client" && (
        <p className="cd-info-line">
          Removing a field only hides it here. Existing logged values stay with
          this client and return if you add the field back.
        </p>
      )}
      <section
        className="cd-tracker-section"
        aria-labelledby="cd-tracker-fields-title"
      >
        <div className="cd-tracker-section-heading">
          <div>
            <span className="cd-tracker-eyebrow">01 / TRACKER CONTENT</span>
            <h3 id="cd-tracker-fields-title">Daily fields</h3>
          </div>
          <span className="cd-tracker-count">
            {visibleFields.length} active
          </span>
        </div>
        <StructureBoard
          label="Tracker daily fields and groups"
          groups={layoutGroups}
          items={layoutItems}
          addable={addableParameters}
          addLabel="Add field"
          hideActionLabel="Remove"
          onChange={(next) =>
            update((current) => ({
              ...current,
              trackerLayout: toTrackerLayout(
                next,
                current.fields.map((field) => field.id),
              ),
            }))
          }
          onReset={() =>
            update((current) => ({
              ...current,
              trackerLayout: toTrackerLayout(
                resetLayout(
                  trackerLayoutDefaults(
                    current.fields.map((field) => field.id),
                  ),
                ),
                current.fields.map((field) => field.id),
              ),
            }))
          }
          onAddItem={addParameter}
          onHideItem={removeParameter}
          onCreateItem={onCreateParameter}
          renderSettings={renderSettings}
        />
        {allParameters().some((parameter) => parameter.custom) && (
          <div className="cd-custom-param-list">
            <div className="cd-custom-param-list-head">
              <span className="cd-structure-label">Custom parameters</span>
              <span className="cd-tracker-count">
                {allParameters().filter((parameter) => parameter.custom).length}
              </span>
            </div>
            {allParameters()
              .filter((parameter) => parameter.custom)
              .map((parameter) => (
                <div className="cd-custom-param-row" key={parameter.id}>
                  <span>
                    <strong>{parameter.name}</strong>
                    <small>
                      {parameter.kind ?? "number"} · {parameter.group}
                    </small>
                  </span>
                  {parameter.archived && (
                    <span className="cd-structure-badge">Archived</span>
                  )}
                  <Button size="sm" onClick={() => onEditParameter(parameter)}>
                    Edit
                  </Button>
                </div>
              ))}
          </div>
        )}
      </section>
      <section
        className="cd-tracker-section"
        aria-labelledby="cd-tracker-options-title"
      >
        <div className="cd-tracker-section-heading">
          <div>
            <span className="cd-tracker-eyebrow">02 / OPTIONS</span>
            <h3 id="cd-tracker-options-title">Tracker options</h3>
          </div>
        </div>
        <div className="cd-setup-rows">
          <Toggle
            label="Include cycle tracking"
            detail="Cycle day is calculated from period starts. Existing cycle settings stay saved while hidden."
            checked={cycleTrackingEnabled}
            onChange={setCycleTracking}
          />
        </div>
      </section>
    </div>
  );
}

function TimelineConfig({
  variant,
  rawVariant,
  features,
  update,
}: {
  variant: Variant;
  rawVariant: Variant;
  features: { nutrition: boolean; training: boolean; activity: boolean };
  update: (fn: (current: Variant) => Variant) => void;
}) {
  const timeline = normalizeTimelineSetup(rawVariant);
  const groups = timelineLayoutFrom(rawVariant);
  const phaseInputRef = useRef<HTMLInputElement>(null);
  const [phaseText, setPhaseText] = useState(() =>
    (variant.phaseOptions ?? DEFAULT_PHASE_OPTIONS).join(", "),
  );
  useEffect(() => {
    if (document.activeElement !== phaseInputRef.current)
      setPhaseText((variant.phaseOptions ?? DEFAULT_PHASE_OPTIONS).join(", "));
  }, [variant.phaseOptions]);
  const phaseReason = (requires?: "nutrition" | "training" | "activity") => {
    if (requires === "nutrition" && !features.nutrition)
      return "Nutrition is off for this client.";
    if (requires === "training" && !features.training)
      return "Training is off for this client.";
    if (requires === "activity" && !features.activity)
      return "No activity targets are set for this client.";
    return undefined;
  };
  const meta = timelineColumnMeta(rawVariant.timeline?.groups);
  const builtinItems: StructureBoardItem[] = TIMELINE_COLUMNS.map((column) => ({
    id: column.id,
    label: column.label,
    hint: column.defaultGroup,
    homeGroup: column.defaultGroup,
    disabledReason: phaseReason(column.requires),
  }));
  const fieldFor = (id: string) =>
    rawVariant.fields.find((field) => field.id === id);
  const paramLabel = (parameter: Parameter) => {
    const field = fieldFor(parameter.id);
    const unit = field?.unit ?? parameter.units[0] ?? "";
    return unit ? `${parameter.name} (${unit})` : parameter.name;
  };
  const parameterItems: StructureBoardItem[] = allParameters()
    .filter(
      (parameter) =>
        parameter.kind === "number" ||
        parameter.kind === "rating" ||
        (!parameter.custom && !parameter.inputType),
    )
    .map((parameter) => ({
      id: `param:${parameter.id}`,
      label: meta.get(`param:${parameter.id}`)?.label ?? paramLabel(parameter),
      hint: `Tracker parameter · ${parameter.group}`,
      badge: parameter.custom ? "Custom" : "Parameter",
      ...(parameter.archived ? { disabledReason: "Archived" } : {}),
    }));
  const items: StructureBoardItem[] = [...builtinItems, ...parameterItems];
  const hidden = hiddenItems(groups, builtinItems);
  const placed = new Set(groups.flatMap((group) => group.items));
  const addSections = [
    { label: "Hidden built-in columns", items: hidden },
    {
      label: "Tracker parameters",
      items: parameterItems.filter(
        (item) =>
          !placed.has(item.id) &&
          !allParameters().find(
            (parameter) => `param:${parameter.id}` === item.id,
          )?.archived,
      ),
    },
  ];
  const writeTimeline = (changes: Partial<NonNullable<Variant["timeline"]>>) =>
    update((current) => ({
      ...current,
      timeline: {
        ...normalizeTimelineSetup(current),
        ...(current.timeline ?? {}),
        ...changes,
      },
    }));
  const writeGroups = (next: ReturnType<typeof timelineLayoutFrom>) =>
    writeTimeline({ groups: toTimelineGroups(next, meta) });
  const writeColumnMeta = (
    columnId: string,
    patch: { label?: string; agg?: string; decimals?: string },
  ) =>
    update((current) => {
      const setup = normalizeTimelineSetup(current);
      const groups = setup.groups.map((group) => ({
        ...group,
        columns: group.columns.map((column) => {
          const id = typeof column === "string" ? column : column.id;
          if (id !== columnId) return column;
          const base: Record<string, unknown> & { id: string } =
            typeof column === "string"
              ? { id }
              : { ...(column as Record<string, unknown>), id };
          if ("label" in patch) {
            if (patch.label?.trim()) base.label = patch.label.trim();
            else delete base.label;
          }
          if ("agg" in patch) {
            if (patch.agg) base.agg = patch.agg;
            else delete base.agg;
          }
          if ("decimals" in patch) {
            if (patch.decimals != null && patch.decimals !== "")
              base.decimals = Number(patch.decimals);
            else delete base.decimals;
          }
          return Object.keys(base).length > 1
            ? (base as TimelineColumnSetting)
            : id;
        }),
      }));
      return {
        ...current,
        timeline: {
          ...setup,
          ...(current.timeline ?? {}),
          groups,
        },
      };
    });
  const renderColumnSettings = (item: StructureBoardItem) => {
    const columnMeta = meta.get(item.id);
    const isParam = item.id.startsWith("param:");
    const parameter = isParam
      ? allParameters().find((candidate) => `param:${candidate.id}` === item.id)
      : undefined;
    const field = parameter ? fieldFor(parameter.id) : undefined;
    return (
      <div className="cd-structure-settings">
        <Vari8Input
          label="Label override"
          value={columnMeta?.label ?? ""}
          placeholder={item.label}
          maxLength={40}
          onChange={(event) =>
            writeColumnMeta(item.id, { label: event.target.value })
          }
        />
        {isParam && (
          <>
            <Select
              label="Aggregation"
              value={
                columnMeta?.agg ??
                (parameter
                  ? defaultTimelineAggregation(parameter, field?.summary)
                  : "avg")
              }
              options={[
                { value: "avg", label: "Average" },
                { value: "sum", label: "Sum" },
                { value: "min", label: "Minimum" },
                { value: "max", label: "Maximum" },
                { value: "last", label: "Last logged" },
                { value: "count", label: "Days logged" },
              ]}
              onChange={(value) => writeColumnMeta(item.id, { agg: value })}
            />
            <div className="cd-structure-decimals">
              <span className="cd-structure-label">Decimals</span>
              <SegmentedControl
                label="Decimals"
                value={String(
                  columnMeta?.decimals ??
                    field?.decimals ??
                    (parameter ? defaultDecimals(parameter) : 1),
                )}
                onValueChange={(value) =>
                  writeColumnMeta(item.id, { decimals: value })
                }
                options={[
                  { value: "0", label: "0" },
                  { value: "1", label: "1" },
                  { value: "2", label: "2" },
                ]}
              />
            </div>
          </>
        )}
      </div>
    );
  };
  const addHidden = (itemId: string, groupId: string) => {
    const item = items.find((candidate) => candidate.id === itemId);
    if (item?.disabledReason) return;
    writeGroups(toggleVisibility(groups, itemId, true, groupId));
  };
  const restoreHidden = (itemId: string, homeGroup?: string) => {
    const item = items.find((candidate) => candidate.id === itemId);
    if (item?.disabledReason) return;
    const target = groups.find((group) => group.id === homeGroup) ?? groups[0];
    if (!target) return;
    writeGroups(toggleVisibility(groups, itemId, true, target.id));
  };
  const commitPhaseText = (raw: string) => {
    setPhaseText(raw);
    update((current) => ({
      ...current,
      phaseOptions: [
        ...new Set(
          raw
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
        ),
      ],
    }));
  };
  const normalizePhaseText = () =>
    setPhaseText(
      [
        ...new Set(
          phaseText
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
        ),
      ].join(", "),
    );
  return (
    <div className="cd-timeline-config">
      <p className="cd-muted">
        Choose the columns athletes see each week, how they are grouped, and the
        defaults the timeline opens with.
      </p>
      <section
        className="cd-setup-layout-section"
        aria-labelledby="cd-timeline-columns-title"
      >
        <div className="cd-tracker-section-heading">
          <div>
            <span className="cd-tracker-eyebrow">01 / COLUMNS & GROUPS</span>
            <h3 id="cd-timeline-columns-title">Weekly table</h3>
          </div>
          <span className="cd-tracker-count">{groups.length} groups</span>
        </div>
        <StructureBoard
          label="Timeline columns and groups"
          groups={groups}
          items={items}
          addSections={addSections}
          hidden={hidden}
          addLabel="Add column"
          hiddenLabel="Hidden columns"
          hideActionLabel="Hide"
          onChange={writeGroups}
          onReset={() => writeGroups(resetLayout(timelineLayoutDefaults()))}
          onAddItem={addHidden}
          onHideItem={(itemId) =>
            writeGroups(toggleVisibility(groups, itemId, false))
          }
          onRestoreItem={restoreHidden}
          renderSettings={renderColumnSettings}
        />
      </section>
      <section
        className="cd-setup-layout-section"
        aria-labelledby="cd-timeline-defaults-title"
      >
        <div className="cd-tracker-section-heading">
          <div>
            <span className="cd-tracker-eyebrow">02 / DEFAULTS</span>
            <h3 id="cd-timeline-defaults-title">Opening view</h3>
          </div>
        </div>
        <div className="cd-setup-rows">
          <Toggle
            label="Compare with logged"
            detail="Shows the athlete’s recorded value beside each weekly target."
            checked={timeline.compare ?? false}
            onChange={(compare) => writeTimeline({ compare })}
          />
        </div>
        <SegmentedControl
          label="Week order"
          value={timeline.order ?? "oldest"}
          onValueChange={(order) =>
            writeTimeline({ order: order === "newest" ? "newest" : "oldest" })
          }
          options={[
            { value: "oldest", label: "Oldest first" },
            { value: "newest", label: "Newest first" },
          ]}
        />
      </section>
      <section
        className="cd-setup-layout-section"
        aria-labelledby="cd-timeline-phases-title"
      >
        <div className="cd-tracker-section-heading">
          <div>
            <span className="cd-tracker-eyebrow">03 / PHASES</span>
            <h3 id="cd-timeline-phases-title">Phase headings</h3>
          </div>
        </div>
        <div className="cd-setup-rows">
          <Toggle
            label="Show phases"
            detail="Groups weeks under the athlete’s phases and adds the phase options below."
            checked={timeline.showPhases}
            onChange={(showPhases) => {
              update((current) => ({
                ...current,
                roadmapPhases: showPhases,
                timeline: {
                  ...normalizeTimelineSetup(current),
                  ...(current.timeline ?? {}),
                  showPhases,
                },
              }));
            }}
          />
        </div>
        {timeline.showPhases && (
          <Vari8Input
            label="Phase options · comma separated"
            ref={phaseInputRef}
            value={phaseText}
            maxLength={500}
            placeholder="Fat loss, Maintenance, Muscle gain, Recovery"
            onChange={(event) => commitPhaseText(event.target.value)}
            onBlur={normalizePhaseText}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                normalizePhaseText();
              }
            }}
          />
        )}
      </section>
      <section
        className="cd-setup-layout-section"
        aria-labelledby="cd-timeline-activity-title"
      >
        <div className="cd-tracker-section-heading">
          <div>
            <span className="cd-tracker-eyebrow">04 / ACTIVITY</span>
            <h3 id="cd-timeline-activity-title">Activity planning</h3>
          </div>
        </div>
        <p className="cd-caption">
          Prescription columns resolved from each client’s saved activity
          targets. They do not need a matching daily tracker field.
        </p>
        <div className="cd-setup-rows">
          {(
            [
              ["steps", "Steps target"],
              ["cardio", "Cardio target"],
            ] as const
          ).map(([metric, label]) => (
            <Toggle
              key={metric}
              label={label}
              detail={
                metric === "steps"
                  ? "Shows the dated steps/day prescription in each weekly row."
                  : "Shows the dated sessions/week × min/session prescription in each weekly row."
              }
              checked={(variant.roadmapActivityTargets ?? []).includes(metric)}
              onChange={(checked) =>
                update((current) => {
                  const selected = new Set(
                    current.roadmapActivityTargets ?? [],
                  );
                  if (checked) selected.add(metric);
                  else selected.delete(metric);
                  const ordered = (["steps", "cardio"] as const).filter(
                    (item) => selected.has(item),
                  );
                  return {
                    ...current,
                    roadmapActivityTargets: ordered.length
                      ? [...ordered]
                      : undefined,
                  };
                })
              }
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function TrainingConfig({
  variant,
  update,
}: {
  variant: Variant;
  update: (fn: (current: Variant) => Variant) => void;
}) {
  const training = variant.training;
  return (
    <>
      <p className="cd-muted">
        Configure prescription fields. Exercises, program type and week count
        belong to the athlete’s setup.
      </p>
      <div className="cd-setting-row" style={{ alignItems: "flex-start" }}>
        <div>
          <span>Exercise information</span>
          <div className="cd-muted" style={{ fontSize: 12, marginTop: 2 }}>
            Shown for each exercise in the plan. Values come from the exercise
            library.
          </div>
        </div>
      </div>
      <div className="cd-check-grid">
        {EXERCISE_INFO_FIELDS.map((field) => {
          const checked = exerciseInfoFields(training).includes(field.id);
          return (
            <Checkbox
              key={field.id}
              label={field.label}
              checked={checked}
              onCheckedChange={(on) =>
                update((current) => ({
                  ...current,
                  training: {
                    ...current.training,
                    exerciseInfo: on
                      ? [...exerciseInfoFields(current.training), field.id]
                      : exerciseInfoFields(current.training).filter(
                          (item) => item !== field.id,
                        ),
                  },
                }))
              }
            />
          );
        })}
      </div>
      <Select
        label="Intensity target"
        value={training.intensity ?? "off"}
        options={[
          { value: "off", label: "Off" },
          { value: "rir", label: "RIR" },
          { value: "rpe", label: "RPE" },
        ]}
        onChange={(value) =>
          update((current) => ({
            ...current,
            training: {
              ...current.training,
              intensity: value as "off" | "rir" | "rpe",
            },
          }))
        }
      />
      <div className="cd-muted" style={{ fontSize: 12, marginTop: -6 }}>
        Coaches set a target per set; clients log it with each set.
      </div>
      <div className="cd-check-grid">
        {TRAINING_FIELDS.map((field) => (
          <Checkbox
            key={field}
            label={field}
            checked={training.fields.includes(field)}
            onCheckedChange={(checked) =>
              update((current) => ({
                ...current,
                training: {
                  ...current.training,
                  fields: checked
                    ? [...current.training.fields, field]
                    : current.training.fields.filter((item) => item !== field),
                },
              }))
            }
          />
        ))}
      </div>
      <TrainingOptionsConfig variant={variant} update={update} />
      <div className="cd-setup-rows">
        <Toggle
          label="Display training volume"
          detail="Counts primary working sets per muscle group per week."
          checked={training.volume}
          onChange={(volume) =>
            update((current) => ({
              ...current,
              training: { ...current.training, volume },
            }))
          }
        />
      </div>
      {training.volume && (
        <>
          <div className="cd-setting-row">
            <span>Volume breakdown</span>
            <strong>{WEEKLY_VOLUME_BREAKDOWN}</strong>
          </div>
          <Select
            label="Volume presentation"
            value={training.presentation}
            options={["Table", "Heatmap"]}
            onChange={(presentation) =>
              update((current) => ({
                ...current,
                training: { ...current.training, presentation },
              }))
            }
          />
          <p className="cd-caption">
            Open Preview to see the full program and configured volume view.
          </p>
        </>
      )}
    </>
  );
}

const TRAINING_OPTION_FIELDS: {
  key: TrainingOptionKey;
  label: string;
  field: string;
  description: string;
}[] = [
  {
    key: "setType",
    label: "Set type",
    field: "Set type",
    description: "Labels coaches can choose for each set.",
  },
  {
    key: "progression",
    label: "Progression",
    field: "Progression notes",
    description: "Reusable guidance attached to an exercise.",
  },
  {
    key: "tempo",
    label: "Tempo",
    field: "Tempo",
    description: "Common tempo prescriptions for the program.",
  },
  {
    key: "rest",
    label: "Rest",
    field: "Rest / pause",
    description: "Rest intervals available in the set editor.",
  },
];

function cleanTrainingOptions(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function TrainingOptionsConfig({
  variant,
  update,
}: {
  variant: Variant;
  update: (fn: (current: Variant) => Variant) => void;
}) {
  const [draftValues, setDraftValues] = useState<
    Partial<Record<TrainingOptionKey, Record<number, string>>>
  >({});
  const [activeKey, setActiveKey] = useState<TrainingOptionKey | null>(null);
  const options: TrainingOptions = {
    ...DEFAULT_TRAINING_OPTIONS,
    ...variant.training.options,
  };
  const defaults = {
    ...DEFAULT_TRAINING_DEFAULTS,
    ...variant.training.defaults,
  };
  const writeOptions = (
    key: TrainingOptionKey,
    nextOptions: string[],
    preferredDefault?: string,
  ) => {
    const normalized = cleanTrainingOptions(nextOptions);
    update((current) => {
      const currentDefaults = {
        ...DEFAULT_TRAINING_DEFAULTS,
        ...current.training.defaults,
      };
      const nextDefault = normalized.includes(currentDefaults[key])
        ? currentDefaults[key]
        : (normalized[0] ?? "");
      return {
        ...current,
        training: {
          ...current.training,
          options: {
            ...DEFAULT_TRAINING_OPTIONS,
            ...current.training.options,
            [key]: normalized,
          },
          defaults: {
            ...currentDefaults,
            [key]: preferredDefault ?? nextDefault,
          },
        },
      };
    });
  };
  const enabledFields = TRAINING_OPTION_FIELDS.filter(({ field }) =>
    variant.training.fields.includes(field),
  );
  const active = TRAINING_OPTION_FIELDS.find(({ key }) => key === activeKey);
  const renderEditor = ({
    key,
    label,
    description,
  }: (typeof TRAINING_OPTION_FIELDS)[number]) => {
    const values = options[key];
    const currentValues = cleanTrainingOptions(
      values.map((value, index) => draftValues[key]?.[index] ?? value),
    );
    const selectedDefault = values.includes(defaults[key])
      ? defaults[key]
      : (values[0] ?? "");
    return (
      <section className="cd-training-option-group" key={key}>
        <header>
          <div>
            <h4>{label}</h4>
            <p>{description}</p>
          </div>
          {values.length > 0 && (
            <Vari8Select
              label={`${label} default`}
              value={selectedDefault}
              onValueChange={(nextValue) =>
                update((current) => ({
                  ...current,
                  training: {
                    ...current.training,
                    options: {
                      ...DEFAULT_TRAINING_OPTIONS,
                      ...current.training.options,
                    },
                    defaults: {
                      ...DEFAULT_TRAINING_DEFAULTS,
                      ...current.training.defaults,
                      [key]: nextValue,
                    },
                  },
                }))
              }
              options={values.map((value) => ({ value, label: value }))}
            />
          )}
        </header>
        <div className="cd-training-option-rows">
          {values.map((value, index) => (
            <div className="cd-training-option-row" key={`${key}-${value}`}>
              <Vari8Input
                label={`${label} option ${index + 1}`}
                className="cd-training-option-input"
                value={draftValues[key]?.[index] ?? value}
                maxLength={100}
                onChange={(event) =>
                  setDraftValues((current) => ({
                    ...current,
                    [key]: {
                      ...current[key],
                      [index]: event.target.value,
                    },
                  }))
                }
                onBlur={(event) => {
                  const next = [...values];
                  const typed = event.currentTarget.value.trim();
                  if (!typed && values.length > 1) next.splice(index, 1);
                  else next[index] = typed || value;
                  const normalized = cleanTrainingOptions(next);
                  writeOptions(key, normalized);
                  setDraftValues((current) => ({ ...current, [key]: {} }));
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
              />
              <button
                type="button"
                className="cd-training-option-remove"
                aria-label={`Remove ${label.toLowerCase()} option ${value}`}
                disabled={values.length === 1}
                onClick={() => {
                  writeOptions(
                    key,
                    currentValues.filter((option) => option !== value),
                  );
                  setDraftValues((current) => ({ ...current, [key]: {} }));
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          {values.length === 0 && (
            <p className="cd-training-option-empty">
              Add a choice to make this field available in the set editor.
            </p>
          )}
          <Button
            className="cd-training-option-add"
            onClick={() => {
              const base = "New option";
              let label = base;
              let index = 2;
              while (currentValues.includes(label))
                label = `${base} ${index++}`;
              writeOptions(
                key,
                [...currentValues, label],
                selectedDefault || label,
              );
              setDraftValues((current) => ({ ...current, [key]: {} }));
            }}
          >
            <Plus size={14} />
            Add choice
          </Button>
        </div>
      </section>
    );
  };
  return (
    <section
      className="cd-training-options"
      aria-label="Training field choices"
    >
      <div className="cd-training-option-compact-list">
        {enabledFields.map(({ key, label, description }) => (
          <div className="cd-training-option-compact-row" key={key}>
            <span>
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
            <Button onClick={() => setActiveKey(key)}>Configure</Button>
          </div>
        ))}
        {!enabledFields.length && (
          <p className="cd-caption">
            Enable a prescription field above to configure its choices.
          </p>
        )}
      </div>
      {active && (
        <Dialog
          title={`${active.label} choices`}
          onClose={() => setActiveKey(null)}
          wide
        >
          <p className="cd-muted">
            Saved with this template. Existing client assignments keep their
            current configuration until you assign an updated template.
          </p>
          {renderEditor(active)}
        </Dialog>
      )}
    </section>
  );
}

function QuestionnaireConfig({
  variant,
  update,
  mode,
}: {
  variant: Variant;
  update: (fn: (current: Variant) => Variant) => void;
  mode: "template" | "client";
}) {
  const [previewMode, setPreviewMode] = useState("Full form");
  return (
    <>
      <div className="cd-subheading">
        <p className="cd-muted">Build a clear weekly conversation.</p>
        <span className="cd-muted">{variant.questions.length} questions</span>
      </div>
      <QuestionnaireEditor variant={variant} update={update} mode={mode} />
      <h3>Included summaries</h3>
      <div className="cd-check-grid">
        {[
          ...variant.fields
            .filter((field) => {
              const parameter = allParameters().find(
                (item) => item.id === field.id,
              );
              return Boolean(parameter && !parameter.inputType);
            })
            .map((field) => ({
              id: field.id,
              label:
                allParameters().find((parameter) => parameter.id === field.id)
                  ?.name ?? field.id,
            })),
          ...(variant.habits ? [{ id: "habits", label: "Habit status" }] : []),
        ].map((summary) => (
          <Checkbox
            key={summary.id}
            label={summary.label}
            checked={variant.summaries.includes(summary.id)}
            onCheckedChange={(checked) =>
              update((current) => ({
                ...current,
                summaries: checked
                  ? [...current.summaries, summary.id]
                  : current.summaries.filter((item) => item !== summary.id),
              }))
            }
          />
        ))}
      </div>
      <div className="cd-subheading">
        <h3>Questionnaire preview</h3>
        <Select
          label="Preview form"
          value={previewMode}
          options={["Full form", "Custom update"]}
          onChange={setPreviewMode}
        />
      </div>
      <FormPreview variant={variant} custom={previewMode === "Custom update"} />
    </>
  );
}

export function FormPreview({
  variant,
  custom,
}: {
  variant: Variant;
  custom: boolean;
}) {
  const [metrics, setMetrics] = useState<string[]>(["weight"]);
  const [note, setNote] = useState(false);
  const [visual, setVisual] = useState(false);
  return (
    <div className="cd-form-preview">
      {custom ? (
        <>
          <ParameterValue
            field={
              variant.fields.find((field) => field.id === "weight") ?? {
                id: "weight",
                unit: "kg",
              }
            }
          />
          <div className="cd-check-grid">
            {variant.fields
              .filter((field) => field.id !== "weight")
              .map((field) => (
                <Checkbox
                  key={field.id}
                  label={
                    allParameters().find(
                      (parameter) => parameter.id === field.id,
                    )?.name ?? field.id
                  }
                  checked={metrics.includes(field.id)}
                  onCheckedChange={(checked) =>
                    setMetrics(
                      checked
                        ? [...metrics, field.id]
                        : metrics.filter((item) => item !== field.id),
                    )
                  }
                />
              ))}
          </div>
          {variant.fields
            .filter(
              (field) => field.id !== "weight" && metrics.includes(field.id),
            )
            .map((field) => (
              <ParameterValue field={field} key={field.id} />
            ))}
          <div className="cd-actions">
            <Button onClick={() => setVisual((value) => !value)}>
              {visual ? "Remove visuals" : "Add visuals"}
            </Button>
            <Button onClick={() => setNote((value) => !value)}>
              {note ? "Remove note" : "Add note"}
            </Button>
          </div>
          {visual && (
            <Vari8Input
              label="Progress visuals"
              type="file"
              accept="image/*"
              multiple
            />
          )}
          {note && (
            <TextArea
              label="Your note"
              rows={3}
              placeholder="Share a quick update…"
            />
          )}
        </>
      ) : (
        <>
          {variant.summaries
            .filter((id) => id !== "habits")
            .map((id) => (
              <ParameterValue
                key={id}
                field={
                  variant.fields.find((field) => field.id === id) ?? {
                    id,
                    unit:
                      allParameters().find((parameter) => parameter.id === id)
                        ?.units[0] ?? "",
                  }
                }
              />
            ))}
          {variant.habits && variant.summaries.includes("habits") && (
            <div className="cd-stat-row">
              <span>Habit consistency</span>
              <strong>5 / 7</strong>
            </div>
          )}
          {variant.questions.map((question) => (
            <div className="cd-field" key={question.id}>
              {question.type === "Long text" ? (
                <TextArea
                  label={`${question.label}${question.required ? " *" : " · optional"}`}
                  id={`preview-${question.id}`}
                  rows={3}
                  placeholder="Your answer…"
                  required={question.required}
                />
              ) : question.type === "Choice" || question.type === "Rating" ? (
                <Vari8Select
                  label={`${question.label}${question.required ? " *" : " · optional"}`}
                  id={`preview-${question.id}`}
                  defaultValue=""
                  required={question.required}
                  options={[
                    { value: "", label: "Choose an answer" },
                    ...(question.type === "Choice"
                      ? question.options
                          .split(",")
                          .map((value) => value.trim())
                          .filter(Boolean)
                          .map((option) => ({
                            value: option,
                            label: option,
                          }))
                      : question.options === "Word labels"
                        ? ["Low", "Okay", "Good", "Excellent"].map(
                            (option) => ({
                              value: option,
                              label: option,
                            }),
                          )
                        : Array.from(
                            { length: question.options === "1–5" ? 5 : 10 },
                            (_, index) => String(index + 1),
                          ).map((option) => ({
                            value: option,
                            label: option,
                          }))),
                  ]}
                />
              ) : (
                <Vari8Input
                  label={`${question.label}${question.required ? " *" : " · optional"}`}
                  id={`preview-${question.id}`}
                  type={
                    question.type === "Numeric"
                      ? "number"
                      : question.type === "Visual upload"
                        ? "file"
                        : "text"
                  }
                  accept={
                    question.type === "Visual upload" ? "image/*" : undefined
                  }
                  required={question.required}
                />
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
