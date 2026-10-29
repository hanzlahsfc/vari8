"use client";

import { type CSSProperties, useMemo, useRef, useState } from "react";
import { buildGroups, type Col } from "../../coach/athlete/tracker-columns";
import {
  ALL_PARAMETERS,
  type CoachClient,
  formatDate,
} from "../../coach/model";
import { useCoach } from "../../coach/store";
import { addLocalDays } from "../../coach/targets/model";
import { useLocalToday } from "../../coach/targets/use-local-today";
import {
  clientTracking,
  clientTrackingText,
  withTrackingText,
  withTrackingValue,
} from "../../coach/tracking/data";
import {
  dayTypeNutrients,
  dayTypeOptions,
  loggedDayType,
  planFollowed,
  prescribedDayType,
  withDayType,
  withPlanFollowed,
} from "../../coach/tracking/nutrition-day";

const MACRO_KEYS = new Set(["calories", "protein", "carbs", "fat"]);
const WDAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
const mondayOf = (dstr: string) => {
  const d = new Date(`${dstr}T00:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return isoLocal(d);
};
const fmtNum = (v: number, decimals: number) =>
  new Intl.NumberFormat("en", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v);

function RatingSlider({
  label,
  max,
  value,
  onCommit,
}: {
  label: string;
  max: number;
  value: number | undefined;
  onCommit: (v: number | null) => void;
}) {
  const mid = Math.ceil(max / 2);
  const [draft, setDraft] = useState<number | undefined>(undefined);
  const shown = draft ?? value;
  const fill = shown !== undefined ? ((shown - 1) / (max - 1)) * 100 : 0;
  const commit = () => {
    if (draft !== undefined) {
      onCommit(draft);
      setDraft(undefined);
    }
  };
  return (
    <div className="cm-rating" style={{ padding: "5px 0" }}>
      <div className="cm-row" style={{ justifyContent: "space-between" }}>
        <span style={{ fontSize: 13 }}>{label}</span>
        <span className="cm-row" style={{ gap: 6 }}>
          <b style={{ fontSize: 13 }}>{shown ?? "—"}</b>
          {value !== undefined && (
            <button
              type="button"
              className="cm-mut"
              style={{
                background: "none",
                border: 0,
                padding: "0 2px",
                fontSize: 14,
                cursor: "pointer",
                lineHeight: 1,
              }}
              aria-label={`Clear ${label}`}
              onClick={() => {
                setDraft(undefined);
                onCommit(null);
              }}
            >
              ×
            </button>
          )}
        </span>
      </div>
      <input
        type="range"
        className={`cm-slider${shown === undefined ? " cm-slider-empty" : ""}`}
        min={1}
        max={max}
        step={1}
        value={shown ?? mid}
        aria-label={label}
        style={{ "--cm-slider-fill": `${fill}%` } as CSSProperties}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
      <div className="cm-slider-marks" aria-hidden="true">
        {Array.from({ length: max }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static tick marks
          <i key={`tick-${i + 1}`} />
        ))}
      </div>
      <div className="cm-slider-ends">
        <span>1</span>
        <span className="cm-mut" style={{ flex: 1, textAlign: "center" }}>
          {shown === undefined ? "Slide to rate" : ""}
        </span>
        <span>{max}</span>
      </div>
    </div>
  );
}

export function MobileTracker({ client }: { client: CoachClient }) {
  const { state, setState } = useCoach();
  const today = useLocalToday();
  const [date, setDate] = useState(today);
  const [saved, setSaved] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(null);
  const groups = useMemo(() => buildGroups(state, client), [state, client]);
  const tracking = useMemo(() => clientTracking(client), [client]);
  const texts = useMemo(() => clientTrackingText(client), [client]);
  const entry = tracking.find((e) => e.date === date);
  const hasLogged = (dstr: string) => {
    const e = tracking.find((x) => x.date === dstr);
    return cols.some((c) => {
      if (c.kind === "num" || c.kind === "rating")
        return e?.values?.[c.key] != null;
      const t = texts?.[`${dstr}:${c.key}`];
      return typeof t === "string" && t.trim().length > 0;
    });
  };

  const cols = groups
    .flatMap((g) => g.cols)
    .filter((c) => !c.key.startsWith("@"));
  const logged = cols.filter((col) => {
    if (col.kind === "num" || col.kind === "rating")
      return entry?.values?.[col.key] != null;
    const t = texts?.[`${date}:${col.key}`];
    return typeof t === "string" && t.trim().length > 0;
  }).length;

  const write = (updated: CoachClient) => {
    setState((s) => ({
      ...s,
      clients: s.clients.map((c) => (c.id === client.id ? updated : c)),
    }));
    setSaved((v) => v + 1);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(0), 1600);
  };
  const writeNum = (col: Col, raw: string, el: HTMLInputElement) => {
    const value = raw.trim() === "" ? null : Number(raw.replace(/,/g, ""));
    if (value !== null && !Number.isFinite(value)) {
      const cur = entry?.values?.[col.key];
      el.value = cur == null ? "" : fmtNum(cur, col.decimals);
      return;
    }
    write(withTrackingValue(client, date, col.key, value));
  };
  const writeText = (col: Col, value: string) =>
    write(withTrackingText(client, date, col.key, value));
  const textFor = (col: Col) => texts?.[`${date}:${col.key}`] ?? "";
  const paramFor = (col: Col) => ALL_PARAMETERS.find((p) => p.id === col.key);

  const numField = (col: Col) => {
    const cur = entry?.values?.[col.key];
    return (
      <div className="cm-field" key={col.key}>
        <input
          className="cm-num"
          inputMode="decimal"
          defaultValue={cur == null ? "" : fmtNum(cur, col.decimals)}
          key={`${date}:${col.key}:${cur ?? ""}`}
          onBlur={(e) => writeNum(col, e.target.value, e.target)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          aria-label={col.label}
        />
        {col.unit && <span className="cm-unit">{col.unit}</span>}
      </div>
    );
  };

  const renderCol = (col: Col) => {
    if (col.kind === "rating") {
      const cur = entry?.values?.[col.key];
      return (
        <RatingSlider
          key={col.key}
          label={col.label}
          max={col.max}
          value={cur ?? undefined}
          onCommit={(v) => write(withTrackingValue(client, date, col.key, v))}
        />
      );
    }
    const param = paramFor(col);
    const inputType = param?.inputType ?? "";
    if (col.kind === "flow" || inputType === "choice") {
      const cur = textFor(col);
      return (
        <div key={col.key} style={{ padding: "5px 0" }}>
          <div className="cm-mut" style={{ fontSize: 12, marginBottom: 5 }}>
            {col.label}
          </div>
          <div className="cm-row" style={{ gap: 6, flexWrap: "wrap" }}>
            {(param?.options ?? []).map((opt) => (
              <button
                key={`${col.key}-${opt}`}
                type="button"
                className={`cm-optchip${cur === opt ? " on" : ""}`}
                onClick={() => writeText(col, cur === opt ? "" : opt)}
                aria-pressed={cur === opt}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      );
    }
    if (inputType === "multi-choice") {
      const cur = new Set(
        textFor(col)
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
      );
      return (
        <div key={col.key} style={{ padding: "5px 0" }}>
          <div className="cm-mut" style={{ fontSize: 12, marginBottom: 5 }}>
            {col.label}
          </div>
          <div className="cm-row" style={{ gap: 6, flexWrap: "wrap" }}>
            {(param?.options ?? []).map((opt) => (
              <button
                key={`${col.key}-${opt}`}
                type="button"
                className={`cm-optchip${cur.has(opt) ? " on" : ""}`}
                onClick={() => {
                  const next = new Set(cur);
                  if (next.has(opt)) next.delete(opt);
                  else next.add(opt);
                  writeText(col, [...next].join(", "));
                }}
                aria-pressed={cur.has(opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      );
    }
    if (col.kind === "text") {
      return (
        <div key={col.key} style={{ padding: "5px 0" }}>
          <div className="cm-mut" style={{ fontSize: 12, marginBottom: 5 }}>
            {col.label}
          </div>
          <textarea
            className="cm-area"
            rows={2}
            placeholder="Anything worth noting today…"
            defaultValue={textFor(col)}
            key={`${date}:${col.key}`}
            onBlur={(e) => writeText(col, e.target.value)}
            aria-label={col.label}
          />
        </div>
      );
    }
    if (inputType === "time") {
      return (
        <div
          key={col.key}
          className="cm-row"
          style={{
            justifyContent: "space-between",
            fontSize: 13,
            padding: "3px 0",
          }}
        >
          <span>{col.label}</span>
          <input
            type="time"
            className="cm-field"
            defaultValue={textFor(col)}
            key={`${date}:${col.key}`}
            onBlur={(e) => writeText(col, e.target.value)}
            aria-label={col.label}
          />
        </div>
      );
    }
    if (inputType === "blood-pressure") {
      return (
        <div
          key={col.key}
          className="cm-row"
          style={{
            justifyContent: "space-between",
            fontSize: 13,
            padding: "3px 0",
          }}
        >
          <span>{col.label}</span>
          <input
            className="cm-field"
            style={{ width: 110 }}
            placeholder="118 / 76"
            defaultValue={textFor(col)}
            key={`${date}:${col.key}`}
            onBlur={(e) => writeText(col, e.target.value)}
            aria-label={col.label}
          />
        </div>
      );
    }
    // num
    return (
      <div
        key={col.key}
        className="cm-row"
        style={{
          justifyContent: "space-between",
          fontSize: 13,
          padding: "3px 0",
        }}
      >
        <span>{col.label}</span>
        {numField(col)}
      </div>
    );
  };

  const renderGroup = (id: string, cols: Col[]) => {
    const fields = cols.filter((c) => !c.key.startsWith("@"));
    if (!fields.length) return null;
    if (id === "Nutrition") {
      const macros = fields.filter((c) => MACRO_KEYS.has(c.key));
      const nums = fields.filter(
        (c) => !MACRO_KEYS.has(c.key) && c.kind === "num",
      );
      const rest = fields.filter(
        (c) => !MACRO_KEYS.has(c.key) && c.kind !== "num",
      );
      const dayOptions = dayTypeOptions(client, date);
      const dayPrescribed = prescribedDayType(client, date);
      const dayLogged = loggedDayType(client, date);
      const followed = planFollowed(client, date);
      const followedNutrients = dayTypeNutrients(client, date, dayLogged ?? "");
      return (
        <div className="cm-card" key={id}>
          <div className="cm-sh" style={{ marginBottom: 5 }}>
            {id}
          </div>
          {dayOptions.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div
                className="cm-row"
                style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}
              >
                <span
                  className="cm-mut"
                  style={{ fontSize: 12, marginRight: 2 }}
                >
                  Day type
                </span>
                {dayOptions.map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    className={`cm-optchip${o.label === dayLogged ? " on" : ""}`}
                    onClick={() => write(withDayType(client, date, o.label))}
                    aria-pressed={o.label === dayLogged}
                  >
                    {o.label}
                  </button>
                ))}
                {dayPrescribed && dayLogged !== dayPrescribed && (
                  <span className="cm-mut" style={{ fontSize: 11 }}>
                    Prescribed: {dayPrescribed}
                  </span>
                )}
              </div>
              <label className="cm-follow">
                <input
                  type="checkbox"
                  checked={followed}
                  onChange={(e) =>
                    write(withPlanFollowed(client, date, e.target.checked))
                  }
                />
                <span>
                  Followed my plan
                  {followedNutrients && (
                    <span
                      className="cm-mut"
                      style={{ fontSize: 11.5, display: "block" }}
                    >
                      Fills in {fmtNum(followedNutrients.kcal, 0)} kcal · P{" "}
                      {fmtNum(followedNutrients.protein, 0)} · C{" "}
                      {fmtNum(followedNutrients.carbs, 0)} · F{" "}
                      {fmtNum(followedNutrients.fat, 0)} from {dayLogged}
                    </span>
                  )}
                </span>
              </label>
            </div>
          )}
          {macros.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "4px 10px",
                marginBottom: 6,
              }}
            >
              {macros.map((col) => (
                <div key={col.key}>
                  <div
                    className="cm-mut"
                    style={{ fontSize: 11, marginBottom: 3 }}
                  >
                    {col.label}
                  </div>
                  {numField(col)}
                </div>
              ))}
            </div>
          )}
          {nums.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${Math.min(nums.length, 3)}, 1fr)`,
                gap: 6,
              }}
            >
              {nums.map((col) => (
                <div key={col.key}>
                  <div
                    className="cm-mut"
                    style={{ fontSize: 11, marginBottom: 3 }}
                  >
                    {col.label}
                  </div>
                  {numField(col)}
                </div>
              ))}
            </div>
          )}
          {rest.map(renderCol)}
        </div>
      );
    }
    return (
      <div className="cm-card" key={id}>
        <div className="cm-sh" style={{ marginBottom: 5 }}>
          {id}
        </div>
        {fields.map(renderCol)}
      </div>
    );
  };

  const isToday = date === today;
  const future = date > today;
  const weekStart = mondayOf(date);
  const weekDays = Array.from({ length: 7 }, (_, i) =>
    addLocalDays(weekStart, i),
  );
  const canGoNext = addLocalDays(weekStart, 7) <= today;
  return (
    <>
      <div
        className="cm-row"
        style={{ justifyContent: "space-between", marginBottom: 6 }}
      >
        <button
          type="button"
          className="cm-btn cm-btnG"
          style={{ padding: "5px 9px" }}
          onClick={() => setDate(addLocalDays(date, -7))}
          aria-label="Previous week"
        >
          <svg
            aria-hidden="true"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <div style={{ position: "relative", fontSize: 15, fontWeight: 600 }}>
          {formatDate(weekStart, {
            month: "long",
            year: "numeric",
            day: undefined,
          })}
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            aria-label="Jump to date"
            style={{
              position: "absolute",
              inset: 0,
              opacity: 0,
              cursor: "pointer",
              width: "100%",
            }}
          />
        </div>
        <div className="cm-row" style={{ gap: 6 }}>
          {!isToday && (
            <button
              type="button"
              className="cm-chip cm-chipA"
              style={{ fontSize: 11.5, cursor: "pointer" }}
              onClick={() => setDate(today)}
            >
              Today
            </button>
          )}
          <button
            type="button"
            className="cm-btn cm-btnG"
            style={{ padding: "5px 9px", opacity: canGoNext ? 1 : 0.4 }}
            onClick={() => canGoNext && setDate(addLocalDays(date, 7))}
            disabled={!canGoNext}
            aria-label="Next week"
          >
            <svg
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 4,
          marginBottom: 8,
        }}
      >
        {weekDays.map((d, i) => (
          <button
            key={d}
            type="button"
            className={`cm-day${d === date ? " on" : ""}${
              d === today ? " today" : ""
            }`}
            disabled={d > today}
            onClick={() => setDate(d)}
            aria-label={formatDate(d, {
              weekday: "short",
              day: "numeric",
              month: "short",
            })}
          >
            {WDAY_LETTERS[i]}
            <b>{Number(d.slice(8))}</b>
            <span
              className="cm-daydot"
              style={{ visibility: hasLogged(d) ? "visible" : "hidden" }}
            />
          </button>
        ))}
      </div>
      <div
        className="cm-row"
        style={{
          justifyContent: "space-between",
          fontSize: 12.5,
          marginBottom: 4,
        }}
      >
        <span className="cm-mut">
          {logged} of {cols.length} logged
        </span>
        {saved > 0 && (
          <span className="cm-mut" style={{ fontSize: 11.5 }}>
            Saved
          </span>
        )}
      </div>
      <div className="cm-bar" style={{ marginBottom: 10 }}>
        <i
          style={{
            width: `${cols.length ? (logged / cols.length) * 100 : 0}%`,
          }}
        />
      </div>
      {groups.map((g) => renderGroup(g.id, g.cols))}
      {future && null}
    </>
  );
}
