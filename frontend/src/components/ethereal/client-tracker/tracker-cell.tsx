"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  displayedValue,
  formatValue,
  type TrackerConfig,
  type TrackerParameter,
} from "@/components/ethereal/client-tracker/model";
import "./tracker-cell.css";

type TrackerCellProps = {
  parameter: TrackerParameter;
  config: TrackerConfig;
  value: number | null | undefined;
  date: string;
  mode: "coach" | "client";
  comment?: string;
  disabled?: boolean;
  trend?: number | null;
  onUpdateValue: (
    date: string,
    parameterId: string,
    value: number | null,
  ) => void;
  onSaveComment: (date: string, parameterId: string, text: string) => void;
};

type PanelPoint = { left: number; top: number };

function unitFor(parameter: TrackerParameter, config: TrackerConfig) {
  if (parameter.id === "weight") return config.weightUnit;
  if (parameter.id === "waist") return config.lengthUnit;
  if (parameter.id === "water") return config.waterUnit;
  return parameter.unit;
}

function shownNumber(
  parameter: TrackerParameter,
  canonical: number,
  config: TrackerConfig,
) {
  return displayedValue(parameter, canonical, config);
}

function displayNumber(
  parameter: TrackerParameter,
  canonical: number,
  config: TrackerConfig,
) {
  return shownNumber(parameter, canonical, config).toLocaleString("en-GB", {
    minimumFractionDigits: parameter.decimals,
    maximumFractionDigits: parameter.decimals,
    useGrouping: false,
  });
}

function toCanonical(
  parameter: TrackerParameter,
  shown: number,
  config: TrackerConfig,
) {
  if (parameter.id === "weight" && config.weightUnit === "lb")
    return shown / 2.20462;
  if (parameter.id === "waist" && config.lengthUnit === "in")
    return shown * 2.54;
  if (parameter.id === "water" && config.waterUnit === "fl oz")
    return shown / 33.814;
  return shown;
}

function inputRangeLabel(parameter: TrackerParameter, config: TrackerConfig) {
  const minimum = displayedValue(parameter, parameter.min, config);
  const maximum = displayedValue(parameter, parameter.max, config);
  const format = (number: number) =>
    number.toLocaleString("en-GB", {
      minimumFractionDigits: parameter.decimals,
      maximumFractionDigits: parameter.decimals,
    });
  return `Enter a value between ${format(minimum)} and ${format(maximum)} ${unitFor(parameter, config)}.`;
}

function ratingOptions(parameter: TrackerParameter, config: TrackerConfig) {
  if (config.ratingScale === "words") {
    const words =
      parameter.id === "sleep-quality"
        ? ["Poor", "Okay", "Good"]
        : ["Low", "Moderate", "High"];
    return words.map((label, index) => ({
      label,
      value: [2, 5, 9][index],
    }));
  }

  const size = config.ratingScale === "1-5" ? 5 : 10;
  return Array.from({ length: size }, (_, index) => {
    const shown = index + 1;
    return {
      label: String(shown),
      value: size === 5 ? 1 + ((shown - 1) * 9) / 4 : shown,
    };
  });
}

function ratingDisplay(
  parameter: TrackerParameter,
  canonical: number,
  config: TrackerConfig,
) {
  if (config.ratingScale === "words") {
    if (parameter.id === "sleep-quality")
      return canonical <= 3 ? "Poor" : canonical <= 7 ? "Okay" : "Good";
    return canonical <= 3 ? "Low" : canonical <= 7 ? "Moderate" : "High";
  }
  return shownNumber(parameter, canonical, config);
}

function ratingTone(parameter: TrackerParameter, canonical: number) {
  const score = shownNumber(parameter, canonical, {
    parameterIds: [],
    weightUnit: "kg",
    lengthUnit: "cm",
    waterUnit: "L",
    ratingScale: "1-10",
  });
  const positiveWhenHigh = parameter.id === "sleep-quality";
  if ((positiveWhenHigh && score >= 8) || (!positiveWhenHigh && score <= 3))
    return "good";
  if ((positiveWhenHigh && score <= 3) || (!positiveWhenHigh && score >= 8))
    return "poor";
  return "middle";
}

function placePanel(anchor: HTMLElement | null): PanelPoint {
  if (!anchor || typeof window === "undefined") return { left: 0, top: 0 };
  const rect = anchor.getBoundingClientRect();
  const width = 280;
  const left = Math.min(
    Math.max(12, rect.left),
    Math.max(12, window.innerWidth - width - 12),
  );
  const estimatedHeight = 190;
  const top =
    rect.bottom + estimatedHeight > window.innerHeight - 12
      ? Math.max(12, rect.top - estimatedHeight - 8)
      : rect.bottom + 8;
  return { left, top };
}

export function TrackerCell({
  parameter,
  config,
  value,
  date,
  mode,
  comment = "",
  disabled = false,
  trend = null,
  onUpdateValue,
  onSaveComment,
}: TrackerCellProps) {
  const recorded = value !== null && value !== undefined;
  const isRating = parameter.kind === "rating";
  const roundedTrend =
    trend === null ? null : Number(trend.toFixed(parameter.decimals));
  const trendDirection =
    roundedTrend === null
      ? null
      : roundedTrend > 0
        ? "up"
        : roundedTrend < 0
          ? "down"
          : "flat";
  const trendText =
    roundedTrend === null || parameter.id !== "weight"
      ? ""
      : `${roundedTrend > 0 ? "Up" : roundedTrend < 0 ? "Down" : "No change"} ${Math.abs(roundedTrend).toLocaleString("en-GB", { minimumFractionDigits: parameter.decimals, maximumFractionDigits: parameter.decimals })} ${unitFor(parameter, config)} compared with the previous recorded weight`;
  const [editingValue, setEditingValue] = useState(false);
  const [numberDraft, setNumberDraft] = useState("");
  const [valueError, setValueError] = useState("");
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState(comment);
  const [panelPoint, setPanelPoint] = useState<PanelPoint>({ left: 0, top: 0 });
  const anchorRef = useRef<HTMLButtonElement>(null);
  const numberRef = useRef<HTMLInputElement>(null);
  const ratingRef = useRef<HTMLSelectElement>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const cancelledRef = useRef(false);
  const editingScopeRef = useRef("");
  const scopeRef = useRef("");
  scopeRef.current = `${mode}:${date}:${parameter.id}`;
  const wasEditingRef = useRef(false);

  // Reset editors when the parent changes weeks, mode, or parameter in place.
  // biome-ignore lint/correctness/useExhaustiveDependencies: prop changes must cancel an open cell editor.
  useEffect(() => {
    setEditingValue(false);
    setCommentOpen(false);
    setValueError("");
  }, [mode, date, parameter.id]);

  useEffect(() => {
    if (editingValue && mode === "client") {
      wasEditingRef.current = true;
      (isRating ? ratingRef.current : numberRef.current)?.focus();
    } else if (wasEditingRef.current) {
      wasEditingRef.current = false;
      anchorRef.current?.focus();
    }
  }, [editingValue, isRating, mode]);

  useEffect(() => {
    if (!commentOpen) return;
    setCommentDraft(comment);
    setPanelPoint(placePanel(anchorRef.current));
    commentRef.current?.focus();

    const reposition = () => setPanelPoint(placePanel(anchorRef.current));
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    const dismissOutside = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !commentRef.current?.closest(".tc-comment-popover")?.contains(target) &&
        !anchorRef.current?.contains(target)
      ) {
        setCommentOpen(false);
      }
    };
    document.addEventListener("pointerdown", dismissOutside);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      document.removeEventListener("pointerdown", dismissOutside);
    };
  }, [commentOpen, comment]);

  const openValueEditor = () => {
    if (disabled || mode !== "client") return;
    cancelledRef.current = false;
    editingScopeRef.current = scopeRef.current;
    setValueError("");
    setNumberDraft(recorded ? displayNumber(parameter, value, config) : "");
    setEditingValue(true);
  };

  const commitNumber = () => {
    if (scopeRef.current !== editingScopeRef.current || mode !== "client") {
      cancelledRef.current = false;
      setEditingValue(false);
      setValueError("");
      return;
    }
    if (cancelledRef.current) {
      cancelledRef.current = false;
      return;
    }
    const text = numberDraft.trim();
    if (text === "") {
      if (recorded) onUpdateValue(date, parameter.id, null);
      setEditingValue(false);
      setValueError("");
      return;
    }
    const entered = Number(text);
    if (!Number.isFinite(entered)) {
      setValueError("Enter a valid number.");
      return;
    }
    const displayedMinimum = Number(
      displayNumber(parameter, parameter.min, config),
    );
    const displayedMaximum = Number(
      displayNumber(parameter, parameter.max, config),
    );
    const converted = toCanonical(parameter, entered, config);
    if (
      !Number.isFinite(converted) ||
      entered < displayedMinimum ||
      entered > displayedMaximum ||
      (parameter.decimals === 0 && !Number.isInteger(entered))
    ) {
      setValueError(inputRangeLabel(parameter, config));
      return;
    }

    // Displayed bounds are rounded to the same precision as the field. Clamp
    // their small conversion remainder so an advertised endpoint is accepted.
    const canonical = Math.min(
      parameter.max,
      Math.max(parameter.min, converted),
    );

    // A rounded unit conversion should never alter the stored source value
    // when the user opens and confirms the value without changing it.
    if (
      !recorded ||
      entered !== Number(displayNumber(parameter, value, config))
    ) {
      onUpdateValue(date, parameter.id, canonical);
    }
    setEditingValue(false);
    setValueError("");
  };

  const cancelValueEdit = () => {
    cancelledRef.current = true;
    setEditingValue(false);
    setValueError("");
  };

  const handleRatingChange = (next: string) => {
    if (next === "") {
      if (recorded) onUpdateValue(date, parameter.id, null);
    } else {
      const canonical = Number(next);
      if (
        Number.isFinite(canonical) &&
        canonical >= parameter.min &&
        canonical <= parameter.max
      ) {
        if (
          !recorded ||
          ratingDisplay(parameter, canonical, config) !==
            ratingDisplay(parameter, value, config)
        ) {
          onUpdateValue(date, parameter.id, canonical);
        }
      }
    }
    setEditingValue(false);
  };

  const openComment = () => {
    if (disabled || mode !== "coach" || (!recorded && !comment)) return;
    setCommentOpen(true);
  };

  const saveComment = () => {
    onSaveComment(date, parameter.id, commentDraft.trim());
    setCommentOpen(false);
    anchorRef.current?.focus();
  };

  const currentRating =
    recorded && isRating
      ? ratingOptions(parameter, config).find(
          (option) =>
            (config.ratingScale === "words"
              ? formatValue(parameter, value, config)
              : ratingDisplay(parameter, value, config)) ===
            (config.ratingScale === "words"
              ? option.label
              : ratingDisplay(parameter, option.value, config)),
        )?.value
      : undefined;

  return (
    <div className={`tc-cell${disabled ? " tc-disabled" : ""}`}>
      {editingValue && mode === "client" && isRating ? (
        <select
          ref={ratingRef}
          className="tc-rating-select"
          aria-label={`${parameter.label} for ${date}`}
          value={currentRating ?? ""}
          onChange={(event) => handleRatingChange(event.currentTarget.value)}
          onBlur={() => setEditingValue(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setEditingValue(false);
            }
          }}
          disabled={disabled}
        >
          <option value="">—</option>
          {ratingOptions(parameter, config).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : editingValue && mode === "client" ? (
        <div className="tc-number-edit-wrap">
          <input
            ref={numberRef}
            className="tc-number-input"
            type="number"
            inputMode="decimal"
            step={parameter.decimals === 0 ? "1" : "any"}
            min={Number(displayNumber(parameter, parameter.min, config))}
            max={Number(displayNumber(parameter, parameter.max, config))}
            aria-label={`${parameter.label} (${unitFor(parameter, config)}) for ${date}`}
            aria-invalid={Boolean(valueError)}
            aria-describedby={
              valueError ? `tc-error-${date}-${parameter.id}` : undefined
            }
            value={numberDraft}
            onChange={(event) => {
              setNumberDraft(event.currentTarget.value);
              if (valueError) setValueError("");
            }}
            onBlur={commitNumber}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitNumber();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                cancelValueEdit();
              }
            }}
            disabled={disabled}
          />
          {valueError && (
            <span
              className="tc-value-error"
              id={`tc-error-${date}-${parameter.id}`}
              role="alert"
            >
              {valueError}
            </span>
          )}
        </div>
      ) : mode === "client" ? (
        <button
          ref={anchorRef}
          className={`tc-value-trigger${recorded ? "" : " tc-missing"}${isRating && recorded ? ` tc-tone-${ratingTone(parameter, value)}` : ""}`}
          type="button"
          aria-label={`${parameter.label}, ${recorded ? formatValue(parameter, value, config) : "not entered"}.${trendText ? ` ${trendText}.` : ""}${comment ? " Comment added." : ""} ${disabled ? "Unavailable" : "Click to enter a value."}`}
          onClick={openValueEditor}
          disabled={disabled}
        >
          {recorded ? (
            isRating ? (
              <span className="tc-rating-value" aria-hidden="true">
                {config.ratingScale === "words"
                  ? formatValue(parameter, value, config)
                  : shownNumber(parameter, value, config)}
              </span>
            ) : (
              <>
                {displayNumber(parameter, value, config)}
                {trendDirection && (
                  <span
                    className="tc-trend"
                    data-direction={trendDirection}
                    title={trendText}
                    aria-hidden="true"
                  >
                    {trendDirection === "up"
                      ? "↗"
                      : trendDirection === "down"
                        ? "↘"
                        : "→"}
                  </span>
                )}
              </>
            )
          ) : (
            "—"
          )}
          {comment && <span className="tc-comment-mark" aria-hidden="true" />}
        </button>
      ) : (
        <>
          <button
            ref={anchorRef}
            className={`tc-value-trigger tc-coach-trigger${recorded ? "" : " tc-missing"}${isRating && recorded ? ` tc-tone-${ratingTone(parameter, value)}` : ""}`}
            type="button"
            aria-label={`${parameter.label}, ${recorded ? formatValue(parameter, value, config) : "not entered"}${trendText ? `. ${trendText}` : ""}${recorded && !disabled ? ". Click to add a comment." : ""}${comment ? ". Comment added." : ""}`}
            onClick={openComment}
            disabled={disabled || (!recorded && !comment)}
          >
            {recorded ? (
              isRating ? (
                <span className="tc-rating-value" aria-hidden="true">
                  {config.ratingScale === "words"
                    ? formatValue(parameter, value, config)
                    : shownNumber(parameter, value, config)}
                </span>
              ) : (
                <>
                  {displayNumber(parameter, value, config)}
                  {trendDirection && (
                    <span
                      className="tc-trend"
                      data-direction={trendDirection}
                      title={trendText}
                      aria-hidden="true"
                    >
                      {trendDirection === "up"
                        ? "↗"
                        : trendDirection === "down"
                          ? "↘"
                          : "→"}
                    </span>
                  )}
                </>
              )
            ) : (
              "—"
            )}
            {comment && <span className="tc-comment-mark" aria-hidden="true" />}
          </button>
          {commentOpen &&
            typeof document !== "undefined" &&
            createPortal(
              <div
                className="tc-comment-popover"
                style={{ left: panelPoint.left, top: panelPoint.top }}
                role="dialog"
                aria-label={`Comment on ${parameter.label} for ${date}`}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setCommentOpen(false);
                    anchorRef.current?.focus();
                  }
                }}
              >
                <label htmlFor={`tc-comment-${date}-${parameter.id}`}>
                  Coach note
                </label>
                <textarea
                  ref={commentRef}
                  id={`tc-comment-${date}-${parameter.id}`}
                  value={commentDraft}
                  maxLength={500}
                  placeholder="Add context to this value…"
                  onChange={(event) =>
                    setCommentDraft(event.currentTarget.value)
                  }
                />
                <div className="tc-comment-actions">
                  <button
                    type="button"
                    className="tc-comment-cancel"
                    onClick={() => {
                      setCommentOpen(false);
                      anchorRef.current?.focus();
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="tc-comment-save"
                    onClick={saveComment}
                  >
                    Save note
                  </button>
                </div>
              </div>,
              anchorRef.current?.closest(".eg-root") ?? document.body,
            )}
        </>
      )}
    </div>
  );
}
