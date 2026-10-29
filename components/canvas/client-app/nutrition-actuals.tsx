// FULL-PACKAGE SLICE of #173
"use client";

/**
 * Card 09 (#173): the client's daily macro actuals on the Nutrition
 * screen. Reads and writes the own nutrition-logs routes; each macro is
 * independently recorded or "Not recorded" (never zero). Calories are
 * derived here at render as 4 kcal/g protein, 4 kcal/g carbohydrate and
 * 9 kcal/g fat over the macros present - matching
 * `caloriesFromMacros` in lib/nutrition/math.ts, duplicated because the
 * canvas never imports server modules. There is no calories input.
 */

import { useCallback, useEffect, useState } from "react";

import {
  fetchNutritionLogSurface,
  saveNutritionLogRemote,
  type NutritionLogDayWire,
  type NutritionLogMacrosWire,
} from "../data/nutrition";
import { ApiClientError } from "../data/http";
import { Button, Empty } from "../coach/ui";
import { Input } from "../vari8/components";

const MACRO_FIELDS = [
  { id: "protein", label: "Protein" },
  { id: "carbohydrate", label: "Carbohydrate" },
  { id: "fat", label: "Fat" },
] as const;

type MacroId = (typeof MACRO_FIELDS)[number]["id"];

const NOT_RECORDED = "Not recorded";

/** 4/4/9 over the macros present; a missing macro contributes nothing. */
function derivedKcal(macros: NutritionLogMacrosWire): number {
  return (
    (macros.protein ?? 0) * 4 +
    (macros.carbohydrate ?? 0) * 4 +
    (macros.fat ?? 0) * 9
  );
}

function formatMacro(value: number | null): string {
  return value === null ? NOT_RECORDED : `${value} g`;
}

function parseInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

export function NutritionActuals({
  workspaceId,
  date,
}: {
  workspaceId: string;
  date: string;
}) {
  const [loaded, setLoaded] = useState<{
    date: string;
    log: NutritionLogMacrosWire | null;
    history: NutritionLogDayWire[];
    error: boolean;
  } | null>(null);
  const [drafts, setDrafts] = useState<Record<MacroId, string>>({
    protein: "",
    carbohydrate: "",
    fat: "",
  });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    fetchNutritionLogSurface(workspaceId, date)
      .then((surface) => {
        if (cancelled) return;
        if (surface.state !== "ready") {
          setLoaded({ date, log: null, history: [], error: true });
          return;
        }
        setLoaded({
          date,
          log: surface.log,
          history: surface.history,
          error: false,
        });
        setDrafts({
          protein: surface.log?.protein?.toString() ?? "",
          carbohydrate: surface.log?.carbohydrate?.toString() ?? "",
          fat: surface.log?.fat?.toString() ?? "",
        });
      })
      .catch(() => {
        if (!cancelled)
          setLoaded({ date, log: null, history: [], error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, date]);

  useEffect(() => load(), [load]);

  const current = loaded !== null && loaded.date === date ? loaded : null;
  const phase =
    current === null ? "loading" : current.error ? "error" : "ready";
  const surfaceLog = current !== null && !current.error ? current.log : null;
  const history = current !== null && !current.error ? current.history : [];

  const draftMacros: NutritionLogMacrosWire = {
    protein: parseInput(drafts.protein),
    carbohydrate: parseInput(drafts.carbohydrate),
    fat: parseInput(drafts.fat),
  };
  const draftKcal = derivedKcal(draftMacros);

  const save = () => {
    setSaving(true);
    setNotice(null);
    saveNutritionLogRemote(workspaceId, date, draftMacros)
      .then(() => {
        // Refetch so the saved summary and recent-days list read the
        // server's persisted row, not the local echo.
        load();
        setNotice("Saved.");
      })
      .catch((error) => {
        setNotice(
          error instanceof ApiClientError
            ? "Could not save. Check the values and try again."
            : "Could not save. Try again in a moment.",
        );
      })
      .finally(() => setSaving(false));
  };

  if (phase === "loading")
    return (
      <section className="cd-preview-section" aria-label="Recorded macros">
        <h2>Recorded macros</h2>
        <div className="client-app-loading" role="status">
          Loading your macros…
        </div>
      </section>
    );

  if (phase === "error")
    return (
      <section className="cd-preview-section" aria-label="Recorded macros">
        <h2>Recorded macros</h2>
        <Empty title="Your macro log could not be loaded">
          Check your connection and reload the page.
        </Empty>
      </section>
    );

  return (
    <section className="cd-preview-section" aria-label="Recorded macros">
      <h2>Recorded macros</h2>
      <p className="cd-muted">
        Enter the grams you ate for {date}. Leave a field blank when you did
        not record it - a blank stays {NOT_RECORDED.toLowerCase()}, never
        zero.
      </p>
      {surfaceLog === null ? (
        <p className="cd-muted ca-nutrition-empty" role="status">
          No macros recorded for this date.
        </p>
      ) : (
        <dl className="ca-nutrition-summary" aria-label="Saved macros">
          {MACRO_FIELDS.map((field) => (
            <div key={field.id}>
              <dt>{field.label}</dt>
              <dd
                data-missing={
                  surfaceLog[field.id] === null ? true : undefined
                }
              >
                {formatMacro(surfaceLog[field.id])}
              </dd>
            </div>
          ))}
          <div>
            <dt>Calories</dt>
            <dd>{derivedKcal(surfaceLog)} kcal</dd>
          </div>
        </dl>
      )}
      <div className="ca-checkin-form ca-nutrition-form">
        {MACRO_FIELDS.map((field) => (
          <div className="ca-checkin-field" key={field.id}>
            <Input
              label={`${field.label} · g`}
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              placeholder={NOT_RECORDED}
              value={drafts[field.id]}
              onChange={(event) =>
                setDrafts((current) => ({
                  ...current,
                  [field.id]: event.target.value,
                }))
              }
            />
          </div>
        ))}
        <div className="ca-nutrition-kcal" role="status">
          <span>Calories</span>
          <strong>{draftKcal} kcal</strong>
        </div>
        <Button
          primary
          className="ca-checkin-submit"
          onClick={save}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save macros"}
        </Button>
        {notice && <p className="ca-photo-error">{notice}</p>}
      </div>
      {history.length > 0 && (
        <div className="ca-checkin-history">
          <h3>Recent days</h3>
          {history.map((day) => (
            <div className="ca-checkin-item" key={day.entryDate}>
              <div className="ca-checkin-item-head">
                <strong>{day.entryDate}</strong>
                <span className="ca-checkin-status">
                  {derivedKcal(day)} kcal
                </span>
              </div>
              <p className="cd-muted">
                {MACRO_FIELDS.map(
                  (field) =>
                    `${field.label} ${formatMacro(day[field.id])}`,
                ).join(" · ")}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
