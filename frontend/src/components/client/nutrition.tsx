"use client";

import { useState } from "react";
import {
  Button,
  Card,
  Input,
  Status,
  Toggle,
} from "@/components/vari8/components";
import type { NutritionDay } from "./demo/fixtures";
import type { ParsedDemo } from "./demo/state";
import { useDemoSlice } from "./demo/store";
import type { Macro } from "./nutrition-model";
import { macroKcal } from "./nutrition-model";
import { ClientScreen, DemoGate } from "./shell";

const num = (raw: string) => (raw === "" ? null : Number(raw));

function DayRow({ day, target }: { day: NutritionDay; target: number | null }) {
  const derived = macroKcal(day.macros);
  const over =
    derived.value !== null && target !== null && derived.value > target;
  const macroText = (value: number | null) =>
    value === null ? "Not recorded" : `${value} g`;
  return (
    <div className="client-day" data-over={over || undefined}>
      <div className="client-kv">
        <span>{day.date}</span>
        <span className="client-set-row">
          {day.calorieOnly && <Status tone="info">kcal target only</Status>}
          {!derived.complete && derived.value !== null && (
            <Status tone="warning">partial</Status>
          )}
          {derived.value !== null && (
            <Status tone={over ? "danger" : "positive"}>
              {over ? "over target" : "under target"}
            </Status>
          )}
        </span>
      </div>
      <div className="client-set-row">
        <span>Protein {macroText(day.macros.protein)}</span>
        <span>Carbs {macroText(day.macros.carbs)}</span>
        <span>Fat {macroText(day.macros.fat)}</span>
      </div>
      <div className="client-kv">
        <span>Derived calories</span>
        <span>
          {derived.value === null
            ? "Not recorded"
            : `${derived.value} kcal${target !== null ? ` / ${target} kcal` : ""}`}
        </span>
      </div>
    </div>
  );
}

export function NutritionScreen({ demo }: { demo: ParsedDemo }) {
  const [nutrition, setNutrition] = useDemoSlice("nutrition");
  const today = nutrition.days[0] ?? null;
  const [draft, setDraft] = useState<Macro>({
    protein: null,
    carbs: null,
    fat: null,
  });
  const [draftStarted, setDraftStarted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [failNext, setFailNext] = useState(false);
  const targets = nutrition.targets;
  const current: Macro = draftStarted
    ? draft
    : (today?.macros ?? { protein: null, carbs: null, fat: null });
  const derived = macroKcal(current);
  const calorieTarget = targets?.calories ?? null;

  const update = (patch: Partial<Macro>) => {
    setDraft({ ...current, ...patch });
    setDraftStarted(true);
    setSaveFailed(false);
  };

  const save = () => {
    if (failNext) {
      setSaveFailed(true);
      setFailNext(false);
      return;
    }
    setSaving(true);
    setSaveFailed(false);
    setTimeout(() => {
      setNutrition((c) => {
        const days = [...c.days];
        if (days.length) days[0] = { ...days[0], macros: draft };
        else
          days.unshift({
            date: "today",
            macros: draft,
            calorieOnly: false,
          });
        return { ...c, days };
      });
      setSaving(false);
      setDraftStarted(false);
    }, 400);
  };

  return (
    <ClientScreen
      title="Nutrition"
      description="Log today's macros against the coach targets."
    >
      <DemoGate demo={demo} empty="No nutrition targets are published yet.">
        {targets && (
          <Card>
            <div className="client-card-stack">
              <strong>Daily targets</strong>
              <dl className="client-card-stack">
                <div className="client-kv">
                  <dt>Calories</dt>
                  <dd>{targets.calories} kcal</dd>
                </div>
                <div className="client-kv">
                  <dt>Protein</dt>
                  <dd>{targets.protein} g</dd>
                </div>
                <div className="client-kv">
                  <dt>Carbs</dt>
                  <dd>{targets.carbs} g</dd>
                </div>
                <div className="client-kv">
                  <dt>Fat</dt>
                  <dd>{targets.fat} g</dd>
                </div>
              </dl>
            </div>
          </Card>
        )}
        <Card>
          <div className="client-card-stack">
            <div className="client-kv">
              <span>Today</span>
              <span className="client-set-row">
                {!derived.complete && derived.value !== null && (
                  <Status tone="warning">partial</Status>
                )}
                {derived.value !== null && calorieTarget !== null && (
                  <Status
                    tone={derived.value > calorieTarget ? "danger" : "positive"}
                  >
                    {derived.value > calorieTarget ? "over" : "under"} target
                  </Status>
                )}
              </span>
            </div>
            <div className="client-set-fields">
              <Input
                label="Protein grams"
                type="number"
                inputMode="decimal"
                hint="g"
                value={current.protein ?? ""}
                onChange={(e) => update({ protein: num(e.target.value) })}
              />
              <Input
                label="Carbs grams"
                type="number"
                inputMode="decimal"
                hint="g"
                value={current.carbs ?? ""}
                onChange={(e) => update({ carbs: num(e.target.value) })}
              />
              <Input
                label="Fat grams"
                type="number"
                inputMode="decimal"
                hint="g"
                value={current.fat ?? ""}
                onChange={(e) => update({ fat: num(e.target.value) })}
              />
            </div>
            <div className="client-kv">
              <span>Derived calories</span>
              <span>
                {derived.value === null
                  ? "Not recorded"
                  : `${derived.value} kcal${calorieTarget !== null ? ` / ${calorieTarget} kcal target` : ""}`}
              </span>
            </div>
            {saveFailed && (
              <Status tone="danger">
                Save failed - typed values kept. Press Retry.
              </Status>
            )}
            <div className="client-set-row">
              <Button
                variant="primary"
                loading={saving}
                onClick={save}
                disabled={!draftStarted && !saveFailed}
              >
                {saveFailed ? "Retry save" : saving ? "Saving" : "Save day"}
              </Button>
              <Toggle
                label="Simulate failed save"
                checked={failNext}
                onCheckedChange={setFailNext}
              />
            </div>
          </div>
        </Card>
        <Card>
          <div className="client-card-stack">
            <strong>Recent days</strong>
            {nutrition.days.slice(1).map((day) => (
              <DayRow
                key={day.date}
                day={day}
                target={
                  day.calorieOnly ? (targets?.calories ?? null) : calorieTarget
                }
              />
            ))}
          </div>
        </Card>
      </DemoGate>
    </ClientScreen>
  );
}
