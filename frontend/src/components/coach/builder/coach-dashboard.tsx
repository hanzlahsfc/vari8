"use client";
import { useEffect, useMemo, useState } from "react";
import {
  addDays,
  type CoachClient,
  type CoachState,
  eventsBetween,
  TODAY,
  type Variant,
} from "../model";
import { applicablePlan, planTargets, trainingWeek } from "../plans/domain";
import { resolveTrainingWeek } from "../plans/types";
import { useCoach } from "../store";
import { DashboardBuilder } from "./dashboard-builder";
import { initialRecords, type SourceRecords } from "./model";
import { createDashboardDraft, type DashboardDraft } from "./schema";
import { WidgetContent } from "./widget-content";
import "./coach-dashboard.css";

export function recordsForCoach(
  variant: Variant,
  client?: CoachClient,
  state?: CoachState,
): SourceRecords {
  const source = structuredClone(initialRecords);
  const offset = Math.round(
    (Date.parse(TODAY) - Date.parse(source.client.asOf.slice(0, 10))) /
      86400000,
  );
  const shift = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(shift)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v).map(([k, value]) => [k, shift(value)]),
          )
        : typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)
          ? addDays(v.slice(0, 10), offset) + v.slice(10)
          : v;
  const r = shift(source) as SourceRecords;
  r.client = { name: client?.name ?? "Emma Anders", asOf: TODAY };
  if (client) {
    r.bodyweight = client.entries.map((e) => ({
      date: e.date,
      value: e.weight,
      unit: "kg",
    }));
    r.steps = client.entries.map((e) => ({
      date: e.date,
      value: e.steps,
      unit: "steps",
    }));
    r.sleep = client.entries.map((e) => ({
      date: e.date,
      value: e.sleep,
      unit: "hours",
    }));
    r.calorieIntake = client.entries.map((e) => ({
      date: e.date,
      value: e.calories,
      unit: "kcal",
      option: "TD",
    }));
    const dates = [
      ...new Set([...client.entries.map((e) => e.date), TODAY]),
    ].sort();
    r.calorieTargets = dates.flatMap((date) => {
      const t = planTargets(client, date);
      return t
        ? [
            {
              option: "TD" as const,
              kind: "fixed" as const,
              low: t.calories,
              unit: "kcal" as const,
              effectiveFrom: date,
              effectiveTo: date,
            },
          ]
        : [];
    });
    r.macroTargets = dates.flatMap((date) => {
      const t = planTargets(client, date);
      return t
        ? (["protein", "carbs", "fat"] as const).map((macro) => ({
            option: "TD" as const,
            macro,
            kind: "fixed" as const,
            low: t[macro],
            unit: "g" as const,
            effectiveFrom: date,
            effectiveTo: date,
          }))
        : [];
    });
    r.activeNutritionOption = "TD";
    r.macroIntake = [];
    r.waist = [];
    r.recovery = [];
    r.prescriptions = [];
    r.workoutSchedule = [];
    const program = client.plans
      ? applicablePlan(client.plans.training, TODAY)
      : undefined;
    if (program && variant.views.includes("Training Program")) {
      const week = trainingWeek(program, TODAY);
      r.workoutSchedule = resolveTrainingWeek(program, week).map((session) => ({
        date: TODAY,
        week,
        name: session.name,
        exercises: session.exercises.map((exercise) => ({
          id: exercise.id,
          name: exercise.name,
          sets: exercise.sets.length,
          reps: String(exercise.sets[0]?.reps ?? "—"),
        })),
      }));
    }
    if (state) {
      r.checkInSchedule = eventsBetween(state, TODAY, addDays(TODAY, 28))
        .filter((e) => e.clientId === client.id && !e.submission)
        .map((e) => ({
          date: e.date,
          kind: e.origin === "Recurring" ? "recurring" : "additional",
        }));
      r.checkIns = state.submissions
        .filter((s) => s.clientId === client.id)
        .map((s) => ({
          id: s.id,
          date: s.date,
          status: s.response ? "feedback received" : "submitted",
          summary: s.note || s.answers[0]?.answer || "",
          visualCount: s.visuals.length,
        }));
      r.feedback = state.submissions
        .filter((s) => s.clientId === client.id && s.response)
        .map((s) => ({
          id: s.id,
          sentAt: s.response?.date ?? s.date,
          excerpt: s.response?.text ?? "",
          read: false,
          video: !!s.response?.video,
          links: s.response?.changes.length
            ? [{ label: "Updated client plan", destination: "Mealplan" }]
            : [],
        }));
      r.messages = state.messages
        .filter((m) => m.clientId === client.id)
        .map((m) => ({
          id: m.id,
          date: m.date,
          sender: m.from === "coach" ? "Coach" : "Maya",
          excerpt: m.text,
          unread: !m.read,
        }));
    }
    r.tasks = client.clientTasks.map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate,
      completed: t.status === "complete",
    }));
    r.habits = client.habits.map((h) => ({
      id: h.id ?? h.name,
      name: h.name,
      target: h.goal,
      scheduledDates: Array.from({ length: 7 }, (_, i) =>
        addDays(TODAY, -6 + i),
      ),
      completions: Array.from({ length: h.completed }, (_, i) => ({
        date: addDays(TODAY, -6 + i),
        status: "done" as const,
      })),
    }));
  }
  if (!variant.habits) r.habits = [];
  const enabled = new Set(variant.fields.map((f) => f.id));
  if (!enabled.has("weight")) r.bodyweight = [];
  if (!enabled.has("waist")) r.waist = [];
  if (!enabled.has("steps")) r.steps = [];
  if (!enabled.has("sleep")) r.sleep = [];
  r.recovery = r.recovery.filter(
    (f) => enabled.has(f.field) || enabled.has(f.label.toLowerCase()),
  );
  return r;
}
export function bindDashboardUnits(
  dashboard: DashboardDraft,
  variant: Variant,
): DashboardDraft {
  const sourceToField: Record<string, string> = {
    bodyweight: "weight",
    waist: "waist",
    sleep: "sleep",
    steps: "steps",
  };
  return {
    ...dashboard,
    widgets: dashboard.widgets.map((w) => {
      const unit = variant.fields.find(
        (f) => f.id === sourceToField[w.settings.source],
      )?.unit;
      return unit
        ? {
            ...w,
            settings: { ...w.settings, unit: unit === "hours" ? "h" : unit },
          }
        : w;
    }),
  };
}
export function CoachDashboardEditor({
  variant,
  onChange,
}: {
  variant: Variant;
  onChange: (draft: DashboardDraft) => void;
}) {
  const { state } = useCoach();
  const sample = state.clients[0];
  const records = useMemo(
    () => recordsForCoach(variant, sample, state),
    [variant, sample, state],
  );
  const fallback = useMemo(createDashboardDraft, []);
  return (
    <DashboardBuilder
      key={variant.id}
      value={variant.dashboard ?? fallback}
      onChange={(draft) => onChange(bindDashboardUnits(draft, variant))}
      sourceRecords={records}
    />
  );
}
export function CoachDashboardPreview({
  variant,
  client,
}: {
  variant: Variant;
  client?: CoachClient;
}) {
  const [detail, setDetail] = useState("");
  const { state } = useCoach();
  const athlete = client ?? state.clients[0];
  const [records, setRecords] = useState(() =>
    recordsForCoach(variant, athlete, state),
  );
  useEffect(() => {
    setRecords(recordsForCoach(variant, athlete, state));
  }, [variant, athlete, state]);
  const dashboard = bindDashboardUnits(
    variant.dashboard ?? createDashboardDraft(),
    variant,
  );
  return (
    <div className="cd-original-dashboard-preview">
      <div className="cd-original-preview-widgets">
        {dashboard.widgets.map((w) => (
          <div className="cb-db-card" data-size="Compact" key={w.id}>
            <header className="cb-db-card-header">
              <strong>{w.settings.title}</strong>
            </header>
            <WidgetContent
              widget={{ ...w, settings: { ...w.settings, size: "Compact" } }}
              records={records}
              width={290}
              height={180}
              clientPreview
              onRecordsChange={setRecords}
              onDetail={setDetail}
            />
          </div>
        ))}
      </div>
      {detail && (
        <p className="cd-caption">
          Selected source: {detail.replaceAll(":", " · ")}
        </p>
      )}
    </div>
  );
}
