"use client";

import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTrackerEditor } from "./editor-context";
import {
  canonicalValue,
  configuredDecimals,
  displayedValue,
  fieldTrackerConfig,
  formatValue,
  type TrackerConfig,
  type TrackerParameter,
} from "./preview-model";
import { TimeInput } from "./time-input";
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
  emptyLabel?: string;
  onUpdateValue: (
    date: string,
    parameterId: string,
    value: number | null,
  ) => void;
  onSaveComment: (date: string, parameterId: string, text: string) => void;
};

type PanelPoint = { left: number; top: number };

function unitFor(parameter: TrackerParameter, config: TrackerConfig) {
  if (parameter.id === "calories") return config.energyUnit ?? parameter.unit;
  if (parameter.id === "weight") return config.weightUnit;
  if (parameter.id === "waist") return config.lengthUnit;
  if (parameter.id === "water") return config.waterUnit;
  return config.fieldUnits?.[parameter.id] ?? parameter.unit;
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
    minimumFractionDigits: 0,
    maximumFractionDigits: configuredDecimals(parameter, config),
    useGrouping: false,
  });
}

function toCanonical(
  parameter: TrackerParameter,
  shown: number,
  config: TrackerConfig,
) {
  return canonicalValue(parameter, shown, config);
}

function inputRangeLabel(parameter: TrackerParameter, config: TrackerConfig) {
  const minimum = displayedValue(parameter, parameter.min, config);
  const maximum = displayedValue(parameter, parameter.max, config);
  const format = (number: number) =>
    number.toLocaleString("en-GB", {
      minimumFractionDigits: 0,
      maximumFractionDigits: configuredDecimals(parameter, config),
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
  const positiveWhenHigh = new Set(["sleep-quality", "energy"]).has(
    parameter.id,
  );
  const negativeWhenHigh = new Set([
    "stress",
    "muscle-soreness",
    "pain-discomfort",
    "pms-severity",
  ]).has(parameter.id);
  if (positiveWhenHigh && score >= 8) return "good";
  if (positiveWhenHigh && score <= 3) return "poor";
  if (negativeWhenHigh && score <= 3) return "good";
  if (negativeWhenHigh && score >= 8) return "poor";
  return "middle";
}

function placePanel(
  anchor: HTMLElement | null,
  width = 280,
  estimatedHeight = 190,
): PanelPoint {
  if (!anchor || typeof window === "undefined") return { left: 0, top: 0 };
  const rect = anchor.getBoundingClientRect();
  const container = anchor.closest(".cd-dialog")?.getBoundingClientRect();
  const safeLeft = Math.max(12, (container?.left ?? 0) + 12);
  const safeRight =
    Math.min(window.innerWidth, container?.right ?? window.innerWidth) - 12;
  const panelWidth = Math.min(width, window.innerWidth - 64);
  const left = Math.min(
    Math.max(safeLeft, rect.left),
    Math.max(safeLeft, safeRight - panelWidth),
  );
  const top =
    rect.bottom + estimatedHeight > window.innerHeight - 12
      ? Math.max(12, rect.top - estimatedHeight - 8)
      : rect.bottom + 8;
  return { left, top };
}

export function TrackerCell({
  parameter,
  config: suppliedConfig,
  value,
  date,
  mode,
  comment = "",
  disabled = false,
  trend = null,
  emptyLabel = "—",
  onUpdateValue,
  onSaveComment,
}: TrackerCellProps) {
  const config = fieldTrackerConfig(parameter, suppliedConfig);
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
      : `${roundedTrend > 0 ? "Up" : roundedTrend < 0 ? "Down" : "No change"} ${Math.abs(roundedTrend).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: configuredDecimals(parameter, config) })} ${unitFor(parameter, config)} compared with the previous recorded weight`;
  const [editingValue, setEditingValue] = useState(false);
  const [numberDraft, setNumberDraft] = useState("");
  const [valueError, setValueError] = useState("");
  const [commentOpen, setCommentOpen] = useState(false);
  useTrackerEditor(`${date}:${parameter.id}`, editingValue || commentOpen);
  const [commentDraft, setCommentDraft] = useState(comment);
  const [panelPoint, setPanelPoint] = useState<PanelPoint>({ left: 0, top: 0 });
  const anchorRef = useRef<HTMLButtonElement>(null);
  const numberRef = useRef<HTMLInputElement>(null);
  const ratingRef = useRef<HTMLSelectElement>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const cancelledRef = useRef(false);
  const returnFocusRef = useRef(true);
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
      if (returnFocusRef.current) anchorRef.current?.focus();
      returnFocusRef.current = true;
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
    returnFocusRef.current = true;
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
      requestAnimationFrame(() => {
        returnFocusRef.current = true;
        numberRef.current?.focus();
      });
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
      (configuredDecimals(parameter, config) === 0 &&
        !Number.isInteger(entered))
    ) {
      setValueError(inputRangeLabel(parameter, config));
      requestAnimationFrame(() => {
        returnFocusRef.current = true;
        numberRef.current?.focus();
      });
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
    returnFocusRef.current = true;
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
            if (event.key === "Tab") returnFocusRef.current = false;
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
            step={configuredDecimals(parameter, config) === 0 ? "1" : "any"}
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
            onBlur={(event) => {
              const nextTarget = event.relatedTarget;
              if (
                nextTarget instanceof HTMLElement &&
                nextTarget.classList.contains("tc-number-done")
              )
                return;
              commitNumber();
            }}
            onKeyDown={(event) => {
              if (event.key === "Tab") returnFocusRef.current = false;
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
          <button
            type="button"
            className="tc-number-done"
            aria-label={`Save ${parameter.label}`}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              returnFocusRef.current = true;
              commitNumber();
            }}
            onBlur={(event) => {
              if (event.relatedTarget === numberRef.current) return;
              commitNumber();
            }}
            onKeyDown={(event) => {
              if (event.key === "Tab") returnFocusRef.current = false;
              if (event.key === "Escape") {
                event.preventDefault();
                cancelValueEdit();
              }
            }}
            disabled={disabled}
          >
            <Check size={13} strokeWidth={2} aria-hidden="true" />
            <span>Done</span>
          </button>
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
          aria-label={`${parameter.label} for ${date}, ${recorded ? formatValue(parameter, value, config) : "not entered"}.${trendText ? ` ${trendText}.` : ""}${comment ? " Comment added." : ""} ${disabled ? "Unavailable" : "Click to enter a value."}`}
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
                <span className="tc-value-copy">
                  {displayNumber(parameter, value, config)}
                </span>
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
            emptyLabel
          )}
          {comment && <span className="tc-comment-mark" aria-hidden="true" />}
        </button>
      ) : (
        <>
          <button
            ref={anchorRef}
            className={`tc-value-trigger tc-coach-trigger${recorded ? "" : " tc-missing"}${isRating && recorded ? ` tc-tone-${ratingTone(parameter, value)}` : ""}`}
            type="button"
            aria-label={`${parameter.label} for ${date}, ${recorded ? formatValue(parameter, value, config) : "not entered"}${trendText ? `. ${trendText}` : ""}${recorded && !disabled ? ". Click to add a comment." : ""}${comment ? ". Comment added." : ""}`}
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
                  <span className="tc-value-copy">
                    {displayNumber(parameter, value, config)}
                  </span>
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
              emptyLabel
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
              anchorRef.current?.closest(
                ".cd-full-client-preview, .ct-shared-tracker",
              ) ?? document.body,
            )}
        </>
      )}
    </div>
  );
}

const BP_PATTERN = /^\s*(\d{2,3})\s*\/\s*(\d{2,3})\s*$/;

type LocationRatingValue = { location: string; rating: string };
type ContextValue = { answer: string; context: string };
type MultiChoiceValue = { choices: string[]; note: string };

function parseJson<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function displayTextValue(
  parameter: TrackerParameter,
  value: string,
  config: TrackerConfig,
) {
  if (parameter.inputType === "time") {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value);
    if (!match) return value;
    if (config.fieldUnits?.[parameter.id] !== "12-hour") return value;
    const hour = Number(match[1]);
    const period = hour >= 12 ? "PM" : "AM";
    const shown = hour % 12 === 0 ? 12 : hour % 12;
    return `${shown}:${match[2]} ${period}`;
  }
  return value;
}

function toCanonicalText(parameter: TrackerParameter, raw: string) {
  const text = raw.trim();
  if (parameter.inputType === "blood-pressure") {
    const match = BP_PATTERN.exec(text);
    return match ? `${match[1]}/${match[2]}` : null;
  }
  return /^\d{1,2}:\d{2}$/.test(text) ? text : null;
}

export function TextTrackerCell({
  parameter,
  config,
  value,
  date,
  disabled = false,
  onUpdateText,
  emptyLabel = "—",
}: {
  parameter: TrackerParameter;
  config: TrackerConfig;
  value: string | undefined;
  date: string;
  disabled?: boolean;
  onUpdateText: (date: string, parameterId: string, value: string) => void;
  emptyLabel?: string;
}) {
  const inputType = parameter.inputType ?? "text";
  const isCycleDay = inputType === "cycle-day";
  const recorded = value !== undefined && value !== "";
  const [editing, setEditing] = useState(false);
  const protectDraft = useTrackerEditor(`${date}:${parameter.id}`, editing);
  const [draft, setDraft] = useState("");
  const [secondaryDraft, setSecondaryDraft] = useState("");
  const [error, setError] = useState("");
  const [panelPoint, setPanelPoint] = useState<PanelPoint>({ left: 0, top: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const periodRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLFieldSetElement>(null);
  const portalTargetRef = useRef<HTMLElement | null>(null);
  const wasEditingRef = useRef(false);
  const cancelledRef = useRef(false);
  const label = inputType === "time" ? "time" : inputType.replaceAll("-", " ");
  const timeMode =
    config.fieldUnits?.[parameter.id] === "12-hour" ? "12" : "24";
  const choices =
    config.fieldOptions?.[parameter.id] ?? parameter.options ?? [];
  const locationRating = parseJson<LocationRatingValue>(value, {
    location: "",
    rating: "",
  });
  const contextValue = parseJson<ContextValue>(value, {
    answer: "",
    context: "",
  });
  const multiChoiceValue = (() => {
    const parsed = parseJson<MultiChoiceValue | string[]>(value, {
      choices: [],
      note: "",
    });
    return Array.isArray(parsed) ? { choices: parsed, note: "" } : parsed;
  })();

  useEffect(() => {
    if (editing) {
      wasEditingRef.current = true;
      setPanelPoint(placePanel(anchorRef.current, 320, 360));
      (
        inputRef.current ??
        textAreaRef.current ??
        editorRef.current?.querySelector<HTMLElement>(
          "button, input, select, textarea",
        )
      )?.focus();
    } else if (wasEditingRef.current) {
      wasEditingRef.current = false;
      anchorRef.current?.focus();
    }
  }, [editing]);

  useEffect(() => {
    if (!editing) return;
    const reposition = () =>
      setPanelPoint(placePanel(anchorRef.current, 320, 360));
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    const dismissOutside = (event: PointerEvent) => {
      if (protectDraft) return;
      if (
        event.target instanceof Node &&
        !editorRef.current?.contains(event.target) &&
        !anchorRef.current?.contains(event.target)
      ) {
        setEditing(false);
        setError("");
      }
    };
    document.addEventListener("pointerdown", dismissOutside);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      document.removeEventListener("pointerdown", dismissOutside);
    };
  }, [editing, protectDraft]);

  const commit = () => {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      return;
    }
    const text = draft.trim();
    const isBlankValue =
      inputType === "location-rating"
        ? !text && !secondaryDraft
        : inputType === "context"
          ? !text && !secondaryDraft.trim()
          : inputType === "multi-choice"
            ? parseJson<string[]>(text, []).length === 0 &&
              !secondaryDraft.trim()
            : !text;
    if (isBlankValue) {
      if (recorded) onUpdateText(date, parameter.id, "");
      setError("");
      setEditing(false);
      return;
    }
    let canonical: string | null = draft.trim();
    if (inputType === "time") {
      canonical = /^\d{2}:\d{2}$/.test(draft) ? draft : null;
    } else if (inputType === "blood-pressure") {
      canonical = toCanonicalText(parameter, draft);
    } else if (inputType === "multi-choice") {
      const choices = parseJson<string[]>(draft, []);
      canonical = JSON.stringify({ choices, note: secondaryDraft.trim() });
    } else if (inputType === "location-rating") {
      if (!text || !secondaryDraft) {
        setError("Enter a location and choose a rating, or clear both fields.");
        return;
      }
      canonical = JSON.stringify({
        location: draft.trim(),
        rating: secondaryDraft,
      });
    } else if (inputType === "context") {
      if (!text && secondaryDraft.trim()) {
        setError("Choose Yes or No before adding context.");
        return;
      }
      canonical = JSON.stringify({
        answer: draft,
        context: secondaryDraft.trim(),
      });
    }
    if (canonical === null) {
      setError(
        inputType === "time"
          ? "Enter a time."
          : inputType === "blood-pressure"
            ? "Enter two numbers separated by a slash, e.g. 118/76."
            : "Choose a valid value.",
      );
      return;
    }
    if (canonical !== (value ?? ""))
      onUpdateText(date, parameter.id, canonical);
    setError("");
    setEditing(false);
  };

  const startEditing = () => {
    if (disabled || isCycleDay) return;
    cancelledRef.current = false;
    portalTargetRef.current =
      anchorRef.current?.closest<HTMLElement>(
        ".cd-full-client-preview, .ct-shared-tracker",
      ) ?? document.body;
    setError("");
    if (inputType === "location-rating") {
      setDraft(locationRating.location);
      setSecondaryDraft(locationRating.rating);
    } else if (inputType === "context") {
      setDraft(contextValue.answer);
      setSecondaryDraft(contextValue.context);
    } else if (inputType === "multi-choice") {
      setDraft(JSON.stringify(multiChoiceValue.choices));
      setSecondaryDraft(multiChoiceValue.note);
    } else if (inputType === "time") {
      setDraft(value ?? "00:00");
      setSecondaryDraft("");
    } else {
      setDraft(value ?? "");
      setSecondaryDraft("");
    }
    setEditing(true);
  };

  const cycleLabel = isCycleDay && value ? `Day ${value}` : (value ?? "—");
  const isPeriodStart = inputType === "period-start";
  const periodChecked = value?.toLowerCase() === "yes";
  const summary = (() => {
    if (!recorded) return "—";
    if (inputType === "time")
      return displayTextValue(parameter, value ?? "", config);
    if (inputType === "multi-choice") {
      return (
        [multiChoiceValue.choices.join(", "), multiChoiceValue.note]
          .filter(Boolean)
          .join(" · ") || "—"
      );
    }
    if (inputType === "location-rating") {
      return (
        [
          locationRating.location,
          locationRating.rating ? `${locationRating.rating}/10` : "",
        ]
          .filter(Boolean)
          .join(" · ") || "—"
      );
    }
    if (inputType === "context") {
      return (
        [contextValue.answer, contextValue.context]
          .filter(Boolean)
          .join(contextValue.answer && contextValue.context ? " · " : "") || "—"
      );
    }
    if (inputType === "period-start")
      return value?.toLowerCase() === "yes" ? "Yes" : "No";
    return value;
  })();

  const editorContent = () => {
    if (inputType === "time") {
      return (
        <TimeInput
          value={draft}
          mode={timeMode}
          ariaLabel={`${parameter.label} for ${date}`}
          onChange={(next) => {
            setDraft(next);
            if (error) setError("");
          }}
        />
      );
    }
    if (inputType === "choice") {
      const options = choices;
      return (
        <select
          className="tc-text-select"
          aria-label={`${parameter.label} for ${date}`}
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
        >
          <option value="">Choose…</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option === "yes" ? "Yes" : option === "no" ? "No" : option}
            </option>
          ))}
        </select>
      );
    }
    if (inputType === "multi-choice") {
      const selected = parseJson<string[]>(draft, []);
      return (
        <fieldset className="tc-choice-list">
          <legend className="tc-visually-hidden">
            {parameter.label} for {date}
          </legend>
          {(choices.length ? choices : []).map((option) => (
            <label key={option}>
              <input
                type="checkbox"
                checked={selected.includes(option)}
                onChange={(event) => {
                  const next = event.currentTarget.checked
                    ? [...selected, option]
                    : selected.filter((item) => item !== option);
                  setDraft(JSON.stringify(next));
                }}
              />
              {option}
            </label>
          ))}
          {!choices.length && <span>Add options in the tracker setup.</span>}
          <label className="tc-choice-note-label">
            Note
            <textarea
              className="tc-text-area"
              aria-label={`${parameter.label} note for ${date}`}
              placeholder="Optional note"
              value={secondaryDraft}
              onChange={(event) => setSecondaryDraft(event.currentTarget.value)}
            />
          </label>
        </fieldset>
      );
    }
    if (inputType === "location-rating" || inputType === "context") {
      return (
        <div className="tc-structured-fields">
          {inputType === "context" ? (
            <label className="tc-field-label">
              Response
              <select
                className="tc-text-select"
                aria-label={`${parameter.label} response for ${date}`}
                value={draft}
                onChange={(event) => setDraft(event.currentTarget.value)}
              >
                <option value="">Choose…</option>
                {(choices.length ? choices : ["No", "Yes"]).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="tc-field-label">
              Location
              <input
                className="tc-text-input"
                aria-label={`${parameter.label} location for ${date}`}
                placeholder="Location"
                value={draft}
                onChange={(event) => setDraft(event.currentTarget.value)}
              />
            </label>
          )}
          {inputType === "context" ? (
            <label className="tc-field-label">
              Context
              <textarea
                className="tc-text-area"
                aria-label={`${parameter.label} context for ${date}`}
                placeholder="Add context"
                value={secondaryDraft}
                onChange={(event) =>
                  setSecondaryDraft(event.currentTarget.value)
                }
              />
            </label>
          ) : (
            <label className="tc-field-label">
              Rating
              <select
                className="tc-text-select"
                aria-label={`${parameter.label} rating for ${date}`}
                value={secondaryDraft}
                onChange={(event) =>
                  setSecondaryDraft(event.currentTarget.value)
                }
              >
                <option value="">None</option>
                {Array.from({ length: 10 }, (_, index) => index + 1).map(
                  (rating) => (
                    <option key={rating} value={rating}>
                      {rating} / 10
                    </option>
                  ),
                )}
              </select>
            </label>
          )}
        </div>
      );
    }
    const commonProps = {
      className: "tc-text-input",
      placeholder: inputType === "blood-pressure" ? "118 / 76" : "Enter value",
      "aria-label": `${parameter.label} (${label}) for ${date}`,
      value: draft,
      onChange: (
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) => {
        setDraft(event.currentTarget.value);
        if (error) setError("");
      },
    };
    if (inputType === "text") {
      return (
        <textarea
          ref={textAreaRef}
          className="tc-text-area"
          placeholder="Add a note"
          aria-label={`${parameter.label} note for ${date}`}
          value={draft}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
            if (error) setError("");
          }}
        />
      );
    }
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode={inputType === "blood-pressure" ? "text" : undefined}
        {...commonProps}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
      />
    );
  };

  return (
    <div className={`tc-cell${disabled ? " tc-disabled" : ""}`}>
      {isPeriodStart ? (
        <label className="tc-period-start">
          <input
            ref={periodRef}
            type="checkbox"
            checked={periodChecked}
            disabled={disabled}
            aria-label={`${parameter.label} for ${date}`}
            onChange={(event) =>
              onUpdateText(
                date,
                parameter.id,
                event.currentTarget.checked ? "yes" : "",
              )
            }
          />
          <span className="tc-visually-hidden">
            {parameter.label} for {date}
          </span>
        </label>
      ) : (
        <>
          {editing &&
            typeof document !== "undefined" &&
            createPortal(
              <fieldset
                className={`tc-text-editor tc-text-popover${inputType === "time" ? " tc-time-popover" : ""}`}
                ref={editorRef}
                style={{ left: panelPoint.left, top: panelPoint.top }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    setEditing(false);
                    setError("");
                  }
                }}
              >
                <legend className="tc-visually-hidden">
                  {parameter.label} value for {date}
                </legend>
                {editorContent()}
                <div className="tc-text-editor-actions tc-popover-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setError("");
                    }}
                  >
                    Cancel
                  </button>
                  <button type="button" onClick={commit}>
                    Save
                  </button>
                </div>
                {error && (
                  <span
                    className="tc-value-error"
                    id={`tc-error-${date}-${parameter.id}`}
                    role="alert"
                  >
                    {error}
                  </span>
                )}
              </fieldset>,
              portalTargetRef.current ?? document.body,
            )}
          <button
            ref={anchorRef}
            className={`tc-value-trigger${recorded ? "" : " tc-missing"}${isCycleDay ? " tc-derived" : ""}`}
            type="button"
            aria-label={`${parameter.label} for ${date}, ${recorded ? (isCycleDay ? cycleLabel : summary) : "not entered"}. ${disabled || isCycleDay ? "Unavailable" : "Click to enter a value."}`}
            title={recorded ? (isCycleDay ? cycleLabel : summary) : undefined}
            onClick={() => {
              startEditing();
            }}
            disabled={disabled || isCycleDay}
          >
            <span className="tc-summary-value">
              {isCycleDay ? cycleLabel : recorded ? summary : emptyLabel}
            </span>
          </button>
        </>
      )}
    </div>
  );
}
