"use client";

import { useEffect, useMemo, useState } from "react";
import { nutritionForDate } from "../../coach/athlete/timeline";
import type { CoachClient } from "../../coach/model";
import { planFoodMap } from "../../coach/plans/domain";
import { splitTemporaryNutrition } from "../../coach/plans/temporary-nutrition";
import type { IifymPlan } from "../../coach/plans/types";
import { useDisplay } from "../../coach/store";
import { useLocalToday } from "../../coach/targets/use-local-today";
import {
  calculateMealNutrients,
  calculateVariantNutrients,
  type Meal,
  type MealPlan,
  type MealPlanVariant,
} from "../../ethereal/mealplan/model";
import { upcomingTemporary } from "./data";

const NUM = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const QTY = (v: number) => (v < 10 ? Math.round(v * 10) / 10 : Math.round(v));

export function MobileMealPlan({
  client,
  selectedVariant,
  embedded,
  plan: planOverride,
  title,
  onOpenOlder,
}: {
  client: CoachClient;
  selectedVariant?: string;
  embedded?: boolean;
  /** Coach preview: render this plan instead of the client's current one. */
  plan?: MealPlan | IifymPlan;
  /** Coach preview: heading text for the plan being previewed. */
  title?: string;
  /** Older-plans link at the bottom (hidden for plan previews). */
  onOpenOlder?: () => void;
}) {
  const { formatDate } = useDisplay();
  const today = useLocalToday();
  const resolved = useMemo(
    () => nutritionForDate(client, today),
    [client, today],
  );
  const temp = useMemo(
    () => (planOverride ? undefined : upcomingTemporary(client, today)),
    [client, today, planOverride],
  );
  const plan = planOverride ?? resolved.plan;
  const olderCount =
    (planOverride
      ? 0
      : resolved.source === "mealPlan"
        ? (client.plans?.nutrition.mealPlan.history.length ?? 0)
        : (client.plans?.nutrition.iifym.history.length ?? 0)) +
    splitTemporaryNutrition(client.plans?.nutrition.temporary ?? [], today).past
      .length;
  const isMeal = resolved.source === "mealPlan";
  const variants: MealPlanVariant[] =
    isMeal && plan && "variants" in plan ? (plan.variants ?? []) : [];
  const options =
    !isMeal && plan && "options" in plan
      ? (plan.options as unknown as {
          id: string;
          label: string;
          calories: number;
          protein: number;
          carbs: number;
          fat: number;
        }[])
      : [];
  const [selected, setSelected] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!selectedVariant || selected !== undefined) return;
    const tempMatch =
      temp && (temp.label ?? "Temporary plan") === selectedVariant;
    if (tempMatch) {
      setSelected("__temp__");
      return;
    }
    const v =
      variants.find((v) => v.label === selectedVariant) ??
      options.find((o) => o.label === selectedVariant);
    if (v) setSelected(v.id);
  }, [selectedVariant, selected, temp, variants, options]);
  const tempVariant =
    selected === "__temp__" && temp && "variants" in temp.plan
      ? temp.plan.variants[0]
      : undefined;
  const activeVariant =
    tempVariant ??
    variants.find((v) => v.id === (selected ?? resolved.optionId)) ??
    variants[0];
  const nutrients = activeVariant
    ? calculateVariantNutrients(activeVariant, planFoodMap)
    : undefined;
  const iifymOption = options.find(
    (o) => o.id === (selected ?? resolved.optionId),
  );
  if (!variants.length && !options.length)
    return <div className="cm-note">No meal plan.</div>;
  const macros = nutrients
    ? [
        { name: "Protein", g: nutrients.protein, kcal: nutrients.protein * 4 },
        { name: "Carbs", g: nutrients.carbs, kcal: nutrients.carbs * 4 },
        { name: "Fat", g: nutrients.fat, kcal: nutrients.fat * 9 },
      ]
    : [];
  const macroTotal = macros.reduce((n, m) => n + m.kcal, 0) || 1;
  return (
    <>
      {!embedded && (
        <div className="cm-h1" style={{ marginBottom: 10 }}>
          {title ?? "Meal plan"}
        </div>
      )}
      {(variants.length > 1 || options.length > 1 || temp) && (
        <div className="cm-segwrap" style={{ marginBottom: 10 }}>
          {(isMeal ? variants : options).map((v) => (
            <button
              key={v.id}
              type="button"
              className={`cm-segopt${(selected ?? resolved.optionId) === v.id || (!selected && !resolved.optionId && (isMeal ? variants[0]?.id === v.id : options[0]?.id === v.id)) ? " on" : ""}`}
              onClick={() => setSelected(v.id)}
            >
              {v.label}
            </button>
          ))}
          {temp && (
            <button
              type="button"
              className={`cm-segopt${selected === "__temp__" ? " on" : ""}`}
              onClick={() => setSelected("__temp__")}
            >
              {temp.label ?? "Temporary plan"}
            </button>
          )}
        </div>
      )}
      {selected === "__temp__" && temp && (
        <div className="cm-mut" style={{ fontSize: 12, marginBottom: 10 }}>
          Temporary plan ·{" "}
          {formatDate(temp.startDate, {
            weekday: "short",
            day: "numeric",
            month: "short",
          })}
          {temp.endDate
            ? ` – ${formatDate(temp.endDate, { weekday: "short", day: "numeric", month: "short" })}`
            : ""}
        </div>
      )}
      {isMeal && nutrients && (
        <>
          <div className="cm-card" style={{ marginBottom: 10 }}>
            <div className="cm-mut" style={{ fontSize: 11.5, marginBottom: 8 }}>
              {activeVariant?.meals.length ?? 0} meals
            </div>
            <MacroRing
              calories={nutrients.calories}
              macros={macros}
              total={macroTotal}
            />
          </div>
          {activeVariant?.meals.map((meal: Meal) => {
            const n = calculateMealNutrients(meal, planFoodMap);
            return (
              <div
                key={meal.id}
                className="cm-card"
                style={{ padding: "10px 14px" }}
              >
                <div
                  className="cm-row"
                  style={{ justifyContent: "space-between", marginBottom: 4 }}
                >
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {meal.label}
                    {meal.time ? (
                      <span className="cm-mut" style={{ fontWeight: 400 }}>
                        {" "}
                        · {meal.time}
                      </span>
                    ) : null}
                  </div>
                  <span className="cm-mut" style={{ fontSize: 12 }}>
                    {NUM.format(n.calories)} kcal
                  </span>
                </div>
                {meal.portions.map((p) => {
                  const food = planFoodMap.get(p.foodId);
                  return (
                    <div
                      key={p.foodId}
                      className="cm-row"
                      style={{
                        justifyContent: "space-between",
                        fontSize: 12.5,
                        padding: "2px 0",
                      }}
                    >
                      <span>{food?.name ?? p.foodId}</span>
                      <span className="cm-mut">
                        {QTY(p.quantity)} {food?.unit ?? ""}
                      </span>
                    </div>
                  );
                })}
                <div
                  className="cm-mut"
                  style={{ fontSize: 11.5, marginTop: 4 }}
                >
                  P {NUM.format(n.protein)} · C {NUM.format(n.carbs)} · F{" "}
                  {NUM.format(n.fat)}
                </div>
              </div>
            );
          })}
        </>
      )}
      {!isMeal && iifymOption && (
        <div className="cm-card">
          <div
            className="cm-row"
            style={{ justifyContent: "space-between", marginBottom: 8 }}
          >
            <span style={{ fontSize: 14.5, fontWeight: 600 }}>
              {iifymOption.label}
            </span>
            <span style={{ fontSize: 22, fontWeight: 600 }}>
              {NUM.format(iifymOption.calories)}{" "}
              <span
                className="cm-mut"
                style={{ fontSize: 12, fontWeight: 400 }}
              >
                kcal
              </span>
            </span>
          </div>
          <MacroRing
            calories={iifymOption.calories}
            macros={[
              {
                name: "Protein",
                g: iifymOption.protein,
                kcal: iifymOption.protein * 4,
              },
              {
                name: "Carbs",
                g: iifymOption.carbs,
                kcal: iifymOption.carbs * 4,
              },
              { name: "Fat", g: iifymOption.fat, kcal: iifymOption.fat * 9 },
            ]}
            total={
              iifymOption.protein * 4 +
              iifymOption.carbs * 4 +
              iifymOption.fat * 9
            }
          />
        </div>
      )}
      {onOpenOlder && olderCount > 0 && (
        <button
          type="button"
          className="cm-mut"
          style={{
            display: "block",
            width: "100%",
            textAlign: "center",
            background: "none",
            border: 0,
            padding: "12px 0 4px",
            fontSize: 12.5,
            cursor: "pointer",
          }}
          onClick={onOpenOlder}
        >
          Show older plans
        </button>
      )}
    </>
  );
}

const RING_COLORS = [
  "var(--cd-accent)",
  "color-mix(in srgb, var(--cd-accent) 68%, var(--cd-surface))",
  "color-mix(in srgb, var(--cd-accent) 38%, var(--cd-surface))",
];

function MacroRing({
  calories,
  macros,
  total,
}: {
  calories: number;
  macros: { name: string; g: number; kcal: number }[];
  total: number;
}) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div
      className="cm-row"
      style={{ gap: 14, alignItems: "center", justifyContent: "flex-start" }}
    >
      <svg
        width="120"
        height="120"
        viewBox="0 0 120 120"
        aria-hidden="true"
        style={{ flexShrink: 0 }}
      >
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="color-mix(in srgb, var(--cd-text) 10%, transparent)"
          strokeWidth="10"
        />
        {macros.map((m, i) => {
          const frac = m.kcal / total;
          const len = frac * circ;
          const el = (
            <circle
              key={m.name}
              cx="60"
              cy="60"
              r={r}
              fill="none"
              stroke={RING_COLORS[i]}
              strokeWidth="10"
              strokeDasharray={`${len} ${circ - len}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 60 60)"
            />
          );
          offset += len;
          return el;
        })}
        <text
          x="60"
          y="58"
          textAnchor="middle"
          fill="var(--cd-text)"
          fontSize="20"
          fontWeight="600"
        >
          {NUM.format(calories)}
        </text>
        <text
          x="60"
          y="74"
          textAnchor="middle"
          fill="var(--cd-muted)"
          fontSize="11"
        >
          kcal
        </text>
      </svg>
      <div style={{ display: "grid", gap: 7 }}>
        {macros.map((m, i) => (
          <div key={m.name} className="cm-row" style={{ gap: 8 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 99,
                background: RING_COLORS[i],
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 12.5 }}>{m.name}</span>
            <span className="cm-mut" style={{ fontSize: 12 }}>
              {NUM.format(Math.round(m.g))} g ·{" "}
              {Math.round((m.kcal / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const variantMacroLine = (v: MealPlanVariant): string => {
  const n = calculateVariantNutrients(v, planFoodMap);
  return `${v.label} · ${NUM.format(Math.round(n.calories))} kcal · P ${NUM.format(Math.round(n.protein))} · C ${NUM.format(Math.round(n.carbs))} · F ${NUM.format(Math.round(n.fat))}`;
};

function VersionPlanRow({
  ver,
  onOpen,
}: {
  ver: {
    id: string;
    content: MealPlan | IifymPlan;
    activatedAt: string;
    archivedOn?: string;
  };
  onOpen: (version: {
    content: MealPlan | IifymPlan;
    activatedAt: string;
    archivedOn?: string;
  }) => void;
}) {
  const { formatDate } = useDisplay();
  return (
    <button
      type="button"
      className="cm-card"
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        marginBottom: 8,
        cursor: "pointer",
      }}
      onClick={() => onOpen(ver)}
    >
      <div style={{ fontSize: 14, fontWeight: 600 }}>{ver.content.name}</div>
      <div className="cm-mut" style={{ fontSize: 12, marginTop: 2 }}>
        {formatDate(ver.activatedAt.slice(0, 10), {
          day: "numeric",
          month: "short",
        })}
        {ver.archivedOn &&
          ` – ${formatDate(ver.archivedOn.slice(0, 10), { day: "numeric", month: "short" })}`}
      </div>
      {"variants" in ver.content &&
        ver.content.variants.map((v) => (
          <div
            key={v.id}
            className="cm-mut"
            style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}
          >
            {variantMacroLine(v)}
          </div>
        ))}
    </button>
  );
}

function TempPlanRow({
  temp,
  onOpen,
}: {
  temp: import("../../coach/plans/types").TemporaryNutrition;
  onOpen: (version: {
    content: MealPlan | IifymPlan;
    activatedAt: string;
    archivedOn?: string;
  }) => void;
}) {
  const { formatDate } = useDisplay();
  return (
    <button
      type="button"
      className="cm-card"
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        marginBottom: 8,
        cursor: "pointer",
      }}
      onClick={() =>
        onOpen({
          content: temp.plan as MealPlan | IifymPlan,
          activatedAt: temp.startDate,
          archivedOn: temp.endDate,
        })
      }
    >
      <div style={{ fontSize: 14, fontWeight: 600 }}>
        {temp.label}{" "}
        <span className="cm-mut" style={{ fontSize: 11 }}>
          · Temporary
        </span>
      </div>
      <div className="cm-mut" style={{ fontSize: 12, marginTop: 2 }}>
        {formatDate(temp.startDate, { day: "numeric", month: "short" })} –{" "}
        {formatDate(temp.endDate, { day: "numeric", month: "short" })}
      </div>
      {"variants" in temp.plan &&
        temp.plan.variants.map((v) => (
          <div
            key={v.id}
            className="cm-mut"
            style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}
          >
            {variantMacroLine(v)}
          </div>
        ))}
    </button>
  );
}

/** Older (history) nutrition plans: a read-only list + per-plan open. */
export function OlderPlansScreen({
  client,
  onOpen,
}: {
  client: CoachClient;
  onOpen: (version: {
    content: MealPlan | IifymPlan;
    activatedAt: string;
    archivedOn?: string;
  }) => void;
}) {
  const source = client.plans?.nutrition.mealPlan.history.length
    ? "mealPlan"
    : "iifym";
  const history =
    source === "mealPlan"
      ? (client.plans?.nutrition.mealPlan.history ?? [])
      : (client.plans?.nutrition.iifym.history ?? []);
  const today = useLocalToday();
  const pastTemps = splitTemporaryNutrition(
    client.plans?.nutrition.temporary ?? [],
    today,
  ).past;
  const rows = [
    ...history.map((ver) => ({
      kind: "version" as const,
      end: ver.archivedOn ?? ver.activatedAt,
      ver,
    })),
    ...pastTemps.map((temp) => ({
      kind: "temp" as const,
      end: temp.endDate,
      temp,
    })),
  ].sort((a, b) => b.end.localeCompare(a.end));
  return (
    <>
      <div className="cm-h1" style={{ marginBottom: 10 }}>
        Older plans
      </div>
      {rows.map((item) =>
        item.kind === "temp" ? (
          <TempPlanRow key={item.temp.id} temp={item.temp} onOpen={onOpen} />
        ) : (
          <VersionPlanRow key={item.ver.id} ver={item.ver} onOpen={onOpen} />
        ),
      )}
      {!rows.length && <div className="cm-note">No older plans.</div>}
    </>
  );
}

export function OlderPlanScreen({
  version,
}: {
  version: {
    content: MealPlan | IifymPlan;
    activatedAt: string;
    archivedOn?: string;
  };
}) {
  const { formatDate } = useDisplay();
  return (
    <>
      <div className="cm-h1" style={{ marginBottom: 4 }}>
        {version.content.name}
      </div>
      <div className="cm-mut" style={{ fontSize: 12, marginBottom: 12 }}>
        Previous plan ·{" "}
        {formatDate(version.activatedAt.slice(0, 10), {
          day: "numeric",
          month: "short",
        })}
        {version.archivedOn &&
          ` – ${formatDate(version.archivedOn.slice(0, 10), { day: "numeric", month: "short" })}`}
      </div>
      {/* Read-only preview of the older plan as it looked then. */}
      <OlderPlanBody plan={version.content} />
    </>
  );
}

function OlderPlanBody({ plan }: { plan: MealPlan | IifymPlan }) {
  const variants = "variants" in plan ? plan.variants : [];
  return (
    <>
      {variants.map((v) => (
        <div key={v.id} className="cm-card" style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
            {v.label}
          </div>
          <div className="cm-mut" style={{ fontSize: 12 }}>
            {variantMacroLine(v)}
          </div>
          {v.meals.map((meal) => (
            <div key={meal.id} style={{ marginTop: 8 }}>
              <div
                className="cm-row"
                style={{ justifyContent: "space-between" }}
              >
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  {meal.label}
                </span>
                <span className="cm-mut" style={{ fontSize: 12 }}>
                  {NUM.format(
                    calculateMealNutrients(meal, planFoodMap).calories,
                  )}{" "}
                  kcal
                </span>
              </div>
              {meal.portions.map((p) => (
                <div
                  key={p.foodId}
                  className="cm-row"
                  style={{ justifyContent: "space-between", fontSize: 12.5 }}
                >
                  <span>{planFoodMap.get(p.foodId)?.name ?? p.foodId}</span>
                  <span className="cm-mut">
                    {QTY(p.quantity)} {planFoodMap.get(p.foodId)?.unit ?? ""}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
