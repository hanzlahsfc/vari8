"use client";

import { Card } from "@/components/vari8/components";
import type { ParsedDemo } from "./demo/state";
import { useDemoSlice } from "./demo/store";
import { ClientScreen, DemoGate } from "./shell";

export function NutritionScreen({ demo }: { demo: ParsedDemo }) {
  const [nutrition] = useDemoSlice("nutrition");
  const targets = nutrition.targets;
  const derived = targets
    ? 4 * targets.protein + 4 * targets.carbs + 9 * targets.fat
    : null;
  const delta = targets && derived !== null ? derived - targets.calories : null;
  return (
    <ClientScreen title="Nutrition" description="Targets set by your coach.">
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
              <p className="client-hint">
                Macro total: {derived} kcal
                {delta !== null && delta !== 0
                  ? ` (${delta > 0 ? "+" : ""}${delta} vs target)`
                  : " (matches target)"}
              </p>
            </div>
          </Card>
        )}
      </DemoGate>
    </ClientScreen>
  );
}
