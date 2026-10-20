"use client";

import type { CSSProperties, ReactNode } from "react";
import { dateLabel, type MacroTarget, type SourceRecords } from "./model";
import { NutritionHistory } from "./nutrition-history";
import type { AdaptiveWidgetProps } from "./widget-geometry";
import "./nutrition-content.css";

type Macro = "protein" | "carbs" | "fat";
type Nutrient = Macro | "calories";
type Target =
  | MacroTarget
  | NonNullable<SourceRecords["calorieTargets"]>[number];

const macroOrder: Macro[] = ["protein", "carbs", "fat"];

function amount(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat("en", { maximumFractionDigits: digits }).format(
    value,
  );
}

function nutrientName(nutrient: Nutrient) {
  if (nutrient === "carbs") return "Carbs";
  if (nutrient === "calories") return "Energy";
  return nutrient[0].toUpperCase() + nutrient.slice(1);
}

function selectedOption(source: string, active: "TD" | "NTD") {
  if (source === "nutrition:active") return active;
  return source.endsWith(":NTD") ? "NTD" : "TD";
}

function targetOn(
  records: SourceRecords,
  nutrient: Nutrient,
  option: "TD" | "NTD",
  date: string,
): Target | undefined {
  const matchesDate = (target: {
    effectiveFrom: string;
    effectiveTo?: string;
  }) =>
    target.effectiveFrom <= date &&
    (!target.effectiveTo || target.effectiveTo >= date);
  if (nutrient === "calories") {
    return records.calorieTargets?.find(
      (target) => target.option === option && matchesDate(target),
    );
  }
  return records.macroTargets.find(
    (target) =>
      target.macro === nutrient &&
      target.option === option &&
      matchesDate(target),
  );
}

function actualOn(
  records: SourceRecords,
  nutrient: Nutrient,
  option: "TD" | "NTD",
  date: string,
): number | null {
  if (nutrient === "calories") {
    return (
      records.calorieIntake?.find(
        (entry) => entry.date === date && entry.option === option,
      )?.value ?? null
    );
  }
  const entry = records.macroIntake.find(
    (row) => row.date === date && row.option === option,
  );
  const value = entry?.[nutrient];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function startOfPeriod(period: string, asOf: string) {
  const length: Record<string, number> = {
    today: 1,
    "7d": 7,
    "14d": 14,
    "30d": 30,
    "90d": 90,
    "4w": 28,
    "6w": 42,
    "8w": 56,
    "12w": 84,
    week: 7,
  };
  const days = length[period];
  if (!days) return "0000-01-01";
  const date = new Date(`${asOf}T12:00:00`);
  date.setDate(date.getDate() - days + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function targetCopy(target: Target | undefined) {
  if (!target) return "No target";
  if (target.kind === "range")
    return `${amount(target.low)}–${amount(target.high ?? target.low)} ${target.unit}`;
  if (target.kind === "minimum")
    return `At least ${amount(target.low)} ${target.unit}`;
  return `Fixed ${amount(target.low)} ${target.unit}`;
}

function statusCopy(actual: number | null, target: Target | undefined) {
  if (!target)
    return actual == null ? "No target · not logged" : "No target defined";
  if (actual == null) return "Not logged";
  if (target.kind === "range") {
    if (actual < target.low)
      return `${amount(target.low - actual)} ${target.unit} below range`;
    if (actual > (target.high ?? target.low))
      return `${amount(actual - (target.high ?? target.low))} ${target.unit} above range`;
    return "Within range";
  }
  if (target.kind === "minimum") {
    return actual >= target.low
      ? "Minimum reached"
      : `${amount(target.low - actual)} ${target.unit} to minimum`;
  }
  return actual < target.low
    ? `${amount(target.low - actual)} ${target.unit} remaining`
    : actual > target.low
      ? `${amount(actual - target.low)} ${target.unit} over target`
      : "At target";
}

function compactTargetCopy(target: Target | undefined, ringCell = false) {
  if (!target) return "No target";
  if (target.kind === "range")
    return `${amount(target.low)}–${amount(target.high ?? target.low)} ${target.unit}`;
  if (target.kind === "minimum") return `≥${amount(target.low)} ${target.unit}`;
  if (ringCell)
    return `/${amount(target.low)}${target.unit === "g" ? "g" : ` ${target.unit}`}`;
  return `${amount(target.low)} ${target.unit} fixed`;
}

function compactStatusCopy(actual: number | null, target: Target | undefined) {
  if (actual == null) return "";
  if (!target) return "No target";
  if (target.kind === "range")
    return actual < target.low
      ? "Below range"
      : actual > (target.high ?? target.low)
        ? "Above range"
        : "Within range";
  if (target.kind === "minimum")
    return actual >= target.low ? "Minimum met" : "Below minimum";
  return actual < target.low
    ? `${amount(target.low - actual)} ${target.unit} left`
    : actual > target.low
      ? `${amount(actual - target.low)} ${target.unit} over`
      : "At target";
}

function sourceLabel(option: "TD" | "NTD") {
  return option === "TD" ? "Training day" : "Rest day";
}

function ContextLine({
  option,
  date,
  targets,
  period = "today",
  compact = false,
  nutrient,
}: {
  option: "TD" | "NTD";
  date: string;
  targets: (Target | undefined)[];
  period?: string;
  compact?: boolean;
  nutrient?: Nutrient;
}) {
  const effective = [
    ...new Set(
      targets.flatMap((target) => (target ? [target.effectiveFrom] : [])),
    ),
  ];
  return (
    <div className={`nc-context${compact ? " is-compact" : ""}`}>
      <span>
        {nutrient ? `${nutrientName(nutrient)} · ` : ""}
        {sourceLabel(option)} ·{" "}
        {dateLabel(
          date,
          compact
            ? { month: "short", day: "numeric" }
            : { weekday: "short", month: "short", day: "numeric" },
        )}
        {period !== "today" ? ` · ${period}` : ""}
        {effective.length === 1 ? ` · Target ${dateLabel(effective[0])}` : ""}
      </span>
    </div>
  );
}

function FixedRing({
  actual,
  target,
  diameter,
  showReading = true,
  showTarget = true,
  label,
}: {
  actual: number | null;
  target?: Target;
  diameter: number;
  showReading?: boolean;
  showTarget?: boolean;
  label?: string;
}) {
  const denominator =
    target?.kind === "range" ? (target.high ?? target.low) : target?.low;
  const ratio =
    actual == null || !denominator
      ? 0
      : Math.max(0, Math.min(actual / denominator, 1));
  const circumference = 2 * Math.PI * 43;
  return (
    <div
      className="nc-fixed-ring"
      style={{ "--nc-ring-size": `${diameter}px` } as CSSProperties}
      aria-hidden={!label}
      role="img"
      aria-label={label}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="nc-ring-track" cx="50" cy="50" r="43" />
        {actual != null && (
          <circle
            className="nc-ring-progress"
            cx="50"
            cy="50"
            r="43"
            strokeDasharray={`${ratio * circumference} ${circumference}`}
          />
        )}
      </svg>
      {showReading && (
        <span className="nc-ring-copy">
          <strong
            className={`nc-ring-value${actual == null ? " is-missing" : ""}`}
          >
            {actual == null
              ? "Not logged"
              : `${amount(actual)}${target?.unit === "g" ? "g" : target ? ` ${target.unit}` : ""}`}
          </strong>
          {showTarget && (
            <small className="nc-ring-target">
              {target
                ? `${target.kind === "minimum" ? "≥" : target.kind === "range" ? "" : "/ "}${target.kind === "range" ? `${amount(target.low)}–${amount(target.high ?? target.low)}` : amount(target.low)}${target.unit === "g" ? "g" : ` ${target.unit}`}`
                : "No target"}
            </small>
          )}
        </span>
      )}
    </div>
  );
}

function TargetMark({
  actual,
  target,
  label,
}: {
  actual: number | null;
  target: Target;
  label: string;
}) {
  const domain =
    Math.max(target.high ?? target.low, target.low, actual ?? 0, 1) * 1.15;
  const targetStart = (target.low / domain) * 100;
  const targetEnd = ((target.high ?? target.low) / domain) * 100;
  const actualAt =
    actual == null ? null : Math.max(0, Math.min(100, (actual / domain) * 100));
  const kind = target.kind;
  return (
    <div
      className={`nc-mark nc-mark-${kind}${actual == null ? " is-missing" : ""}`}
      role="img"
      aria-label={`${label}: ${actual == null ? "not logged" : `${amount(actual)} ${target.unit}`}; ${targetCopy(target)}`}
    >
      <span
        className="nc-mark-target"
        style={{
          left: `${targetStart}%`,
          width:
            kind === "range"
              ? `${Math.max(2, targetEnd - targetStart)}%`
              : undefined,
        }}
      />
      {actualAt != null && (
        <span className="nc-mark-actual" style={{ left: `${actualAt}%` }} />
      )}
    </div>
  );
}

function MacroSummary({
  macro,
  actual,
  target,
  compact = false,
  instrument = false,
  ringDiameter = 58,
  showEffectiveDate = false,
  comparisonEnabled = true,
  mode = "circles",
}: {
  macro: Macro;
  actual: number | null;
  target: Target | undefined;
  compact?: boolean;
  instrument?: boolean;
  ringDiameter?: number;
  showEffectiveDate?: boolean;
  comparisonEnabled?: boolean;
  mode?: "circles" | "lines";
}) {
  const unit = target?.unit ?? "g";
  const visibleActual =
    actual == null ? "Not logged" : `${amount(actual)} ${unit}`;
  return (
    <article
      className={`nc-macro${compact ? " is-compact" : ""}${instrument && mode === "circles" ? " has-ring" : ""}`}
      data-macro={macro}
      data-missing={actual == null ? "true" : "false"}
      data-ring-reading={
        mode === "circles" && ringDiameter >= 56 ? "true" : "false"
      }
    >
      <div className="nc-macro-heading">
        <strong>{nutrientName(macro)}</strong>
        <span>
          {visibleActual}
          {compact && mode === "lines" && comparisonEnabled
            ? ` · ${compactTargetCopy(target, true)}`
            : ""}
        </span>
      </div>
      {instrument && mode === "circles" && (
        <FixedRing
          actual={actual}
          target={target}
          diameter={ringDiameter}
          showReading={ringDiameter >= 56}
          showTarget={false}
          label={
            ringDiameter >= 56
              ? `${nutrientName(macro)}: ${visibleActual}`
              : undefined
          }
        />
      )}
      {comparisonEnabled && (
        <div className="nc-macro-target">
          <span>
            {compact ? compactTargetCopy(target, true) : targetCopy(target)}
          </span>
          {!compact && actual != null && (
            <span>{statusCopy(actual, target)}</span>
          )}
        </div>
      )}
      {target &&
        (actual != null || target.kind === "range" || mode === "lines") &&
        !(instrument && mode === "circles") && (
          <TargetMark
            actual={actual}
            target={target}
            label={nutrientName(macro)}
          />
        )}
      {comparisonEnabled && target && showEffectiveDate && (
        <small>Target effective {dateLabel(target.effectiveFrom)}</small>
      )}
    </article>
  );
}

function History({
  records,
  nutrient,
  option,
  dates,
  currentTarget,
  showTargets = true,
}: {
  records: SourceRecords;
  nutrient: Nutrient;
  option: "TD" | "NTD";
  dates: string[];
  currentTarget?: Target;
  showTargets?: boolean;
}) {
  if (!dates.length)
    return (
      <p className="nc-empty-history">No recorded intake in this period.</p>
    );
  return (
    <ol
      className={`nc-history${showTargets ? " has-targets" : ""}`}
      aria-label={`${nutrientName(nutrient)} history`}
    >
      {dates.map((date) => {
        const value = actualOn(records, nutrient, option, date);
        const target = targetOn(records, nutrient, option, date);
        return (
          <li className="nc-history-row" key={date}>
            <time dateTime={date}>
              {dateLabel(date, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </time>
            <strong>
              {value == null
                ? "Not logged"
                : `${amount(value)} ${target?.unit ?? (nutrient === "calories" ? "kcal" : "g")}`}
            </strong>
            {showTargets && <span>{targetCopy(target)}</span>}
            {showTargets &&
              target &&
              target.effectiveFrom !== currentTarget?.effectiveFrom && (
                <small>Effective {dateLabel(target.effectiveFrom)}</small>
              )}
          </li>
        );
      })}
    </ol>
  );
}

function MacroSummaryWidget({ props }: { props: AdaptiveWidgetProps }) {
  const { widget, records, bodyWidth, bodyHeight } = props;
  const option = selectedOption(
    widget.settings.source,
    records.activeNutritionOption,
  );
  const date = records.client.asOf;
  const displayMode = widget.settings.option === "lines" ? "lines" : "circles";
  const selected = widget.settings.fields.length
    ? widget.settings.fields.filter((field): field is Macro =>
        macroOrder.includes(field as Macro),
      )
    : macroOrder;
  const macros = selected.length ? selected : macroOrder;
  const models = macros.map((macro) => ({
    macro,
    actual: actualOn(records, macro, option, date),
    target: widget.settings.target
      ? targetOn(records, macro, option, date)
      : undefined,
  }));
  const spacious = bodyHeight >= 260 && bodyWidth >= 420;
  const sharedDates = [
    ...new Set(
      models.flatMap(({ target }) => (target ? [target.effectiveFrom] : [])),
    ),
  ];
  const period = widget.settings.period || "today";
  const from = startOfPeriod(period === "today" ? "7d" : period, date);
  const dates = [
    ...new Set(
      records.macroIntake
        .filter(
          (entry) =>
            entry.option === option &&
            entry.date >= from &&
            entry.date < date &&
            entry.date <= date,
        )
        .map((entry) => entry.date),
    ),
  ].sort((a, b) => b.localeCompare(a));
  const historyDepth = bodyHeight >= 300 ? 1 : 0;
  const historyDates = historyDepth === 0 ? [] : dates.slice(0, historyDepth);
  const composition =
    bodyHeight < 132 || (bodyWidth < 280 && bodyHeight < 220)
      ? "compact"
      : bodyWidth < 420 && bodyHeight >= 220
        ? "vertical"
        : spacious
          ? "expanded"
          : "wide";
  const ringDiameter =
    composition === "compact"
      ? 20
      : composition === "vertical"
        ? 48
        : Math.max(
            40,
            Math.min(84, Math.floor(bodyWidth / 3 - 24), bodyHeight - 100),
          );

  return (
    <section
      className="nc-widget nf-summary"
      data-composition={composition}
      data-display={displayMode}
      data-has-history={historyDates.length > 0}
      data-shallow={bodyHeight < 180}
      style={
        {
          "--nc-body-width": `${bodyWidth}px`,
          "--nc-body-height": `${bodyHeight}px`,
        } as CSSProperties
      }
    >
      <ContextLine
        option={option}
        date={date}
        targets={models.map(({ target }) => target)}
        period={period}
        compact={composition === "compact"}
      />
      <div className="nc-summary-list">
        {models.map(({ macro, actual, target }) => (
          <MacroSummary
            key={macro}
            macro={macro}
            actual={actual}
            target={target}
            compact={composition === "compact"}
            instrument={
              displayMode === "circles" ||
              (displayMode === "lines" && composition !== "compact")
            }
            mode={displayMode}
            ringDiameter={ringDiameter}
            showEffectiveDate={sharedDates.length > 1}
            comparisonEnabled={widget.settings.target}
          />
        ))}
      </div>
      {historyDates.length > 0 && (
        <div className="nf-history">
          <span className="nf-history-heading">
            Previous logged day · {dateLabel(historyDates[0])}
          </span>
          {macros.map((macro) => (
            <div key={macro} className="nf-history-row">
              <strong>{nutrientName(macro)}</strong>
              <span>
                {amount(actualOn(records, macro, option, historyDates[0])) ??
                  "Not logged"}
                {actualOn(records, macro, option, historyDates[0]) == null
                  ? ""
                  : " g"}
              </span>
              {widget.settings.target && (
                <small>
                  {targetCopy(
                    targetOn(records, macro, option, historyDates[0]),
                  )}
                </small>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function SingleNutrientWidget({ props }: { props: AdaptiveWidgetProps }) {
  const { widget, records, bodyWidth, bodyHeight } = props;
  const source = widget.settings.source.startsWith("nutrition:")
    ? widget.settings.source
    : "nutrition:active";
  const rawNutrient =
    widget.settings.fields[0] ??
    (source.includes("calories") ? "calories" : "protein");
  const nutrient = (
    rawNutrient === "calories"
      ? "calories"
      : macroOrder.includes(rawNutrient as Macro)
        ? (rawNutrient as Macro)
        : "protein"
  ) as Nutrient;
  const option = selectedOption(source, records.activeNutritionOption);
  const date = records.client.asOf;
  const period = widget.settings.period || "today";
  const showTargets =
    widget.settings.target && widget.settings.summary !== "actual";
  const target = showTargets
    ? targetOn(records, nutrient, option, date)
    : undefined;
  const actual = actualOn(records, nutrient, option, date);
  const unit = target?.unit ?? (nutrient === "calories" ? "kcal" : "g");
  const isToday = period === "today";
  const periodStart = startOfPeriod(period, date);
  const recordedDates =
    nutrient === "calories"
      ? (records.calorieIntake ?? [])
          .filter(
            (entry) =>
              entry.option === option &&
              entry.date >= periodStart &&
              entry.date <= date,
          )
          .map((entry) => entry.date)
      : records.macroIntake
          .filter(
            (entry) =>
              entry.option === option &&
              entry.date >= periodStart &&
              entry.date <= date &&
              entry[nutrient] != null,
          )
          .map((entry) => entry.date);
  const historyDates = [
    ...new Set(recordedDates.filter((day) => day < date)),
  ].sort((a, b) => b.localeCompare(a));
  const centered =
    isToday && bodyHeight > bodyWidth * 0.88 && bodyHeight >= 180;
  const compact = bodyHeight < 112 || (bodyWidth < 240 && bodyHeight < 180);
  const sideBySide = bodyWidth >= 390 && bodyHeight < 250;
  const roomy = bodyWidth >= 360 && bodyHeight >= 260;
  const historyCap =
    bodyWidth >= 300 && bodyHeight >= 260
      ? Math.min(2, Math.max(0, Math.floor((bodyHeight - 230) / 70)))
      : 0;
  const visibleHistory = !isToday ? historyDates.slice(0, historyCap) : [];
  const hasHistory = visibleHistory.length > 0;
  const ringDiameter = Math.round(
    Math.max(
      44,
      Math.min(
        144,
        bodyWidth * (centered ? 0.66 : 0.34),
        bodyHeight * (centered ? 0.4 : 0.58),
      ),
    ),
  );
  const fixedPercent =
    target?.kind === "fixed" && actual != null
      ? Math.round((actual / target.low) * 100)
      : null;
  const hasFixedRing = fixedPercent != null && ringDiameter >= 44;
  const status = statusCopy(actual, target);

  const layout = compact
    ? "compact"
    : centered
      ? "centered"
      : sideBySide
        ? "wide"
        : roomy
          ? "roomy"
          : bodyWidth >= 280 && bodyHeight >= 120
            ? "intermediate"
            : hasHistory
              ? "history"
              : "compact";
  return (
    <section
      className="nc-widget nc-single"
      data-layout={layout}
      style={
        {
          "--nc-body-width": `${bodyWidth}px`,
          "--nc-body-height": `${bodyHeight}px`,
          "--nc-ring-size": `${ringDiameter}px`,
        } as CSSProperties
      }
    >
      <div className="nc-single-context">
        <span>
          {nutrientName(nutrient)} · {sourceLabel(option)} ·{" "}
          {dateLabel(date, { month: "short", day: "numeric" })}
          {period !== "today" ? ` · ${period}` : ""}
        </span>
        {!compact && isToday && <span>Today</span>}
        {!compact && target && (
          <span>Target effective {dateLabel(target.effectiveFrom)}</span>
        )}
      </div>
      <div
        className={`nc-single-instrument${centered ? " is-centered" : ""}${sideBySide ? " is-wide" : ""}`}
      >
        {compact ? (
          <>
            {target?.kind === "fixed" &&
              actual != null &&
              ringDiameter >= 44 && (
                <FixedRing
                  actual={actual}
                  target={target}
                  diameter={ringDiameter}
                />
              )}
            {hasFixedRing && target?.kind === "fixed" ? (
              <div className="nc-compact-reading nc-ring-summary">
                <strong>{status}</strong>
                <span>
                  {fixedPercent}% of fixed target ·{" "}
                  {dateLabel(target.effectiveFrom)}
                </span>
              </div>
            ) : (
              <div className="nc-compact-reading">
                <strong>
                  {actual == null ? "Not logged" : `${amount(actual)} ${unit}`}
                </strong>
                {target && (
                  <span>
                    {compactTargetCopy(target)} · from{" "}
                    {dateLabel(target.effectiveFrom)}
                  </span>
                )}
                {actual != null && target && (
                  <span>{compactStatusCopy(actual, target)}</span>
                )}
                {!target && showTargets && <span>No applicable target</span>}
              </div>
            )}
          </>
        ) : (
          <>
            {target?.kind === "fixed" &&
              actual != null &&
              ringDiameter >= 44 && (
                <FixedRing
                  actual={actual}
                  target={target}
                  diameter={ringDiameter}
                />
              )}
            {hasFixedRing && target?.kind === "fixed" ? (
              <div className="nc-single-reading nc-ring-summary">
                <span className="nc-reading-label">Progress</span>
                <strong>{status}</strong>
                <span className="nc-reading-status">
                  {fixedPercent}% of fixed target
                </span>
              </div>
            ) : (
              <div className="nc-single-reading">
                <span className="nc-reading-label">Actual</span>
                <strong>
                  {actual == null ? "Not logged" : `${amount(actual)} ${unit}`}
                </strong>
                {target && <span className="nc-reading-status">{status}</span>}
              </div>
            )}
            {showTargets && !hasFixedRing && (
              <div className="nc-single-target">
                <span className="nc-reading-label">
                  {target?.kind === "minimum"
                    ? "Minimum"
                    : target?.kind === "range"
                      ? "Target range"
                      : "Target"}
                </span>
                <strong>{targetCopy(target)}</strong>
                {target?.kind === "fixed" && actual != null && (
                  <span>
                    {Math.round((actual / target.low) * 100)}% of fixed target
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>
      {!compact &&
        target?.kind !== "fixed" &&
        target &&
        (actual != null || target.kind === "range") && (
          <div className="nc-scale-block">
            <TargetMark
              actual={actual}
              target={target}
              label={nutrientName(nutrient)}
            />
            <div className="nc-scale-captions">
              {target.kind === "range" ? (
                <>
                  <span>
                    {amount(target.low)} {unit}
                  </span>
                  <span>
                    {amount(target.high ?? target.low)} {unit}
                  </span>
                </>
              ) : (
                <>
                  <span>0 {unit}</span>
                  <span>
                    ≥{amount(target.low)} {unit}
                  </span>
                </>
              )}
            </div>
          </div>
        )}
      {!target && showTargets && (
        <p className="nc-no-target">
          {actual == null
            ? "Not logged · no applicable target"
            : "No applicable target for this date"}
        </p>
      )}
      {hasHistory && (
        <div className="nc-history-zone nc-single-history">
          <span className="nc-history-heading">
            {period} · {historyDates.length} earlier dates
          </span>
          <History
            records={records}
            nutrient={nutrient}
            option={option}
            dates={visibleHistory}
            currentTarget={target}
            showTargets={showTargets}
          />
        </div>
      )}
    </section>
  );
}

export function NutritionWidgetContent(props: AdaptiveWidgetProps): ReactNode {
  if (props.widget.kind === "BN15") return <MacroSummaryWidget props={props} />;
  if (
    props.widget.kind === "BN19" &&
    ["line", "stacked"].includes(props.widget.settings.option)
  ) {
    const source = props.widget.settings.source.startsWith("nutrition:")
      ? props.widget.settings.source
      : "nutrition:active";
    const rawNutrient = props.widget.settings.fields[0] || "calories";
    const nutrient: Nutrient = ["calories", ...macroOrder].includes(rawNutrient)
      ? (rawNutrient as Nutrient)
      : "calories";
    const period = (
      ["week", "month", "6month", "year"].includes(props.widget.settings.period)
        ? props.widget.settings.period
        : "month"
    ) as "week" | "month" | "6month" | "year";
    return (
      <NutritionHistory
        records={props.records}
        option={selectedOption(source, props.records.activeNutritionOption)}
        period={period}
        mode={props.widget.settings.option as "line" | "stacked"}
        nutrient={nutrient}
        onPeriodChange={props.onPeriodChange}
        bodyWidth={props.bodyWidth}
        bodyHeight={props.bodyHeight}
      />
    );
  }
  if (props.widget.kind === "BN19")
    return <SingleNutrientWidget props={props} />;
  return null;
}
