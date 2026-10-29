import { Plus, X } from "lucide-react";
import {
  Button,
  IconButton,
  Input,
  SegmentedControl,
  Select,
} from "@/components/vari8/components";
import { DatePicker } from "@/components/vari8/inputs";
import type { MealPlan, VariantSchedule as Schedule } from "./model";
import { MAX_CYCLE_DAYS } from "./model";
import "./variant-schedule.css";

const WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
type ScheduleMode = Schedule["mode"];

function formatCalendarDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(date);
}

function formatCycleRange(anchorDate: string, offset: number, days: number) {
  const start = new Date(`${anchorDate}T12:00:00`);
  if (Number.isNaN(start.getTime()))
    return `${days} ${days === 1 ? "day" : "days"}`;
  start.setDate(start.getDate() + offset);
  const end = new Date(start);
  end.setDate(end.getDate() + days - 1);
  const format = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return days === 1
    ? format.format(start)
    : `${format.format(start)} – ${format.format(end)}`;
}

function stepKey(
  steps: { variantId: string; days: number }[],
  step: { variantId: string; days: number },
) {
  const precedingSameVariant = steps
    .slice(0, steps.indexOf(step))
    .filter((candidate) => candidate.variantId === step.variantId).length;
  return `${step.variantId}-${precedingSameVariant}`;
}

export function VariantSchedule({
  plan,
  preview,
  onChange,
}: {
  plan: MealPlan;
  preview: boolean;
  onChange: (schedule: Schedule) => void;
}) {
  const schedule = plan.schedule;
  const everydayId =
    schedule.mode === "manual"
      ? schedule.selectedVariantId
      : schedule.mode === "cycle"
        ? (schedule.steps[0]?.variantId ?? plan.activeVariantId)
        : schedule.mode === "weekly"
          ? (schedule.days[1] ?? plan.activeVariantId)
          : plan.activeVariantId;
  const label = (id?: string) =>
    plan.variants.find((variant) => variant.id === id)?.label || "Not assigned";
  const cycleSummary =
    schedule.mode === "cycle"
      ? schedule.steps
          .map(
            (step) =>
              `${label(step.variantId)} for ${step.days} ${step.days === 1 ? "day" : "days"}`,
          )
          .join(" → ")
      : "";
  const cycleLength =
    schedule.mode === "cycle"
      ? schedule.steps.reduce((total, step) => total + step.days, 0)
      : 0;

  const setMode = (mode: ScheduleMode) => {
    if (mode === schedule.mode) return;
    if (mode === "manual") {
      onChange({ mode, selectedVariantId: everydayId });
      return;
    }
    if (mode === "weekly") {
      onChange(
        schedule.mode === "weekly"
          ? schedule
          : {
              mode,
              days: Object.fromEntries(
                WEEK.map((_, index) => [index + 1, everydayId]),
              ) as Record<Weekday, string>,
            },
      );
      return;
    }
    const firstId = plan.variants[0]?.id ?? everydayId;
    const secondId = plan.variants[1]?.id ?? firstId;
    onChange({
      mode: "cycle",
      anchorDate: plan.startDate,
      steps: [
        { variantId: firstId, days: 1 },
        { variantId: secondId, days: 1 },
      ],
    });
  };

  const updateCycleStep = (
    index: number,
    update: Partial<{ variantId: string; days: number }>,
  ) => {
    if (schedule.mode !== "cycle") return;
    onChange({
      ...schedule,
      steps: schedule.steps.map((step, stepIndex) =>
        stepIndex === index ? { ...step, ...update } : step,
      ),
    });
  };

  return (
    <section className="mp-schedule-panel" aria-label="Variant schedule">
      <div className="mp-schedule-core">
        <div className="mp-schedule">
          <div className="mp-section-heading">
            <h2>Variant schedule</h2>
            {!preview && (
              <SegmentedControl
                label="Schedule mode"
                className="mp-schedule-modes"
                value={schedule.mode}
                onValueChange={(mode) => setMode(mode as ScheduleMode)}
                options={[
                  { value: "manual", label: "Everyday" },
                  { value: "weekly", label: "Weekdays" },
                  { value: "cycle", label: "Repeating rhythm" },
                ]}
              />
            )}
          </div>
          <p>
            {preview
              ? "Follow the plan assigned by your coach for each day."
              : "Choose how your client moves between plan variants."}
          </p>
          {schedule.mode === "cycle" ? (
            <div className="mp-cycle-editor">
              {preview ? (
                <div className="mp-cycle-instructions">
                  <p>
                    Starts {formatCalendarDate(schedule.anchorDate)}; then{" "}
                    {cycleSummary || "no steps assigned"}.
                    {cycleLength > 0 &&
                      ` Repeat every ${cycleLength} ${cycleLength === 1 ? "day" : "days"}.`}
                  </p>
                  <ol>
                    {schedule.steps.map((step) => {
                      const index = schedule.steps.indexOf(step);
                      const offset = schedule.steps
                        .slice(0, index)
                        .reduce((total, prior) => total + prior.days, 0);
                      return (
                        <li key={stepKey(schedule.steps, step)}>
                          <span>Step {index + 1}</span>
                          <strong>{label(step.variantId)}</strong>
                          <span>
                            {formatCycleRange(
                              schedule.anchorDate,
                              offset,
                              step.days,
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ) : (
                <>
                  <div className="mp-cycle-toolbar">
                    <div className="mp-cycle-anchor">
                      <DatePicker
                        label="Starts on"
                        value={schedule.anchorDate}
                        onValueChange={(anchorDate) =>
                          onChange({ ...schedule, anchorDate })
                        }
                      />
                    </div>
                    <div className="mp-cycle-toolbar-actions">
                      <span>
                        Repeats every {cycleLength}{" "}
                        {cycleLength === 1 ? "day" : "days"}
                      </span>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="mp-cycle-add"
                        disabled={
                          schedule.steps.length >= MAX_CYCLE_DAYS ||
                          cycleLength >= MAX_CYCLE_DAYS
                        }
                        onClick={() =>
                          onChange({
                            ...schedule,
                            steps: [
                              ...schedule.steps,
                              { variantId: everydayId, days: 1 },
                            ],
                          })
                        }
                      >
                        <Plus size={14} aria-hidden="true" />
                        Add step
                      </Button>
                    </div>
                  </div>
                  <ol
                    className="mp-cycle-steps"
                    aria-label="Repeating rhythm steps"
                  >
                    {schedule.steps.map((step, index) => (
                      <li key={stepKey(schedule.steps, step)}>
                        <div className="mp-cycle-step-heading">
                          <span className="mp-cycle-step-number">
                            Step {String(index + 1).padStart(2, "0")}
                          </span>
                          <IconButton
                            type="button"
                            label={`Remove step ${index + 1}`}
                            size="sm"
                            aria-label={`Remove step ${index + 1}`}
                            title={`Remove step ${index + 1}`}
                            disabled={schedule.steps.length <= 1}
                            onClick={() =>
                              onChange({
                                ...schedule,
                                steps: schedule.steps.filter(
                                  (_, stepIndex) => stepIndex !== index,
                                ),
                              })
                            }
                          >
                            <X size={14} aria-hidden="true" />
                          </IconButton>
                        </div>
                        <Select
                          label={`Step ${index + 1} plan`}
                          size="sm"
                          value={step.variantId}
                          onValueChange={(variantId) =>
                            updateCycleStep(index, { variantId })
                          }
                          options={plan.variants.map((variant) => ({
                            value: variant.id,
                            label: variant.label || "Untitled",
                          }))}
                        />
                        <div className="mp-cycle-duration-control">
                          <Input
                            label={`Step ${index + 1} duration in days`}
                            className="mp-cycle-duration-input"
                            size="sm"
                            type="number"
                            min={1}
                            max={28}
                            step={1}
                            value={step.days}
                            onChange={(event) =>
                              updateCycleStep(index, {
                                days: Number(event.target.value),
                              })
                            }
                          />
                          <span>{step.days === 1 ? "day" : "days"}</span>
                        </div>
                      </li>
                    ))}
                  </ol>
                  <div className="mp-cycle-summary" aria-live="polite">
                    <strong>
                      {cycleSummary || "Add a step to define the rhythm."}
                    </strong>
                    <span>Then repeat in the same order.</span>
                  </div>
                </>
              )}
            </div>
          ) : schedule.mode === "weekly" ? (
            <div className="mp-week-days">
              {WEEK.map((day, index) => {
                const weekday = (index + 1) as Weekday;
                return preview ? (
                  <div className="mp-schedule-instruction" key={day}>
                    <span>{day}</span>
                    <strong>{label(schedule.days[weekday])}</strong>
                  </div>
                ) : (
                  <Select
                    key={day}
                    label={day}
                    size="sm"
                    value={schedule.days[weekday] ?? ""}
                    onValueChange={(variantId) =>
                      onChange({
                        mode: "weekly",
                        days: { ...schedule.days, [weekday]: variantId },
                      })
                    }
                    options={[
                      { value: "", label: "Choose plan", disabled: true },
                      ...plan.variants.map((variant) => ({
                        value: variant.id,
                        label: variant.label || "Untitled",
                      })),
                    ]}
                  />
                );
              })}
            </div>
          ) : preview ? (
            <div className="mp-schedule-instruction mp-schedule-everyday">
              <span>Every day</span>
              <strong>{label(everydayId)}</strong>
            </div>
          ) : (
            <div className="mp-schedule-everyday mp-schedule-assignment">
              <Select
                label="Plan for every day"
                size="sm"
                value={everydayId}
                onValueChange={(selectedVariantId) =>
                  onChange({ mode: "manual", selectedVariantId })
                }
                options={plan.variants.map((variant) => ({
                  value: variant.id,
                  label: variant.label || "Untitled",
                }))}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
