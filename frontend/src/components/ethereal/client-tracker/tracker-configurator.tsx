"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  categories,
  parameters,
  type TrackerConfig,
  type TrackerParameter,
} from "./model";
import "./tracker-configurator.css";

export function TrackerConfigurator({
  initialConfig,
  onSave,
  onCancel,
}: {
  initialConfig: TrackerConfig;
  onSave: (config: TrackerConfig) => void;
  onCancel?: () => void;
}) {
  const [config, setConfig] = useState<TrackerConfig>(() => ({
    ...initialConfig,
    parameterIds: [...initialConfig.parameterIds],
    ...(initialConfig.summaryParameterIds === undefined
      ? {}
      : { summaryParameterIds: [...initialConfig.summaryParameterIds] }),
  }));
  const [measureQuery, setMeasureQuery] = useState("");
  const reducedMotion = useReducedMotion();
  const id = useId();
  const isFirstUse = !onCancel;
  const selected = useMemo(
    () =>
      parameters.filter((parameter) =>
        config.parameterIds.includes(parameter.id),
      ),
    [config.parameterIds],
  );
  const selectedSet = useMemo(
    () => new Set(config.parameterIds),
    [config.parameterIds],
  );
  const eligibleSelected = useMemo(
    () =>
      selected.filter(
        (parameter) =>
          parameter.kind === "number" || parameter.kind === "rating",
      ),
    [selected],
  );
  const overview = useMemo(() => {
    if (config.summaryParameterIds !== undefined) {
      return config.summaryParameterIds
        .map((parameterId) =>
          eligibleSelected.find((parameter) => parameter.id === parameterId),
        )
        .filter((parameter): parameter is TrackerParameter =>
          Boolean(parameter),
        )
        .slice(0, 4);
    }
    return categories
      .map((category) =>
        eligibleSelected.find(
          (parameter) => parameter.categoryId === category.id,
        ),
      )
      .filter((parameter): parameter is TrackerParameter => Boolean(parameter))
      .slice(0, 4);
  }, [config.summaryParameterIds, eligibleSelected]);
  const filteredCategories = useMemo(() => {
    const query = measureQuery.trim().toLocaleLowerCase();
    return categories
      .map((category) => ({
        ...category,
        parameters: parameters.filter((parameter) => {
          if (parameter.categoryId !== category.id) return false;
          if (!query) return true;
          return `${parameter.label} ${parameterUnit(parameter, config)} ${category.label}`
            .toLocaleLowerCase()
            .includes(query);
        }),
      }))
      .filter((category) => category.parameters.length > 0);
  }, [config, measureQuery]);

  const toggleParameter = (parameterId: string) => {
    setConfig((current) => {
      const next = new Set(current.parameterIds);
      const removing = next.has(parameterId);
      if (removing) next.delete(parameterId);
      else next.add(parameterId);
      return {
        ...current,
        parameterIds: parameters
          .filter((parameter) => next.has(parameter.id))
          .map(({ id: parameterKey }) => parameterKey),
        ...(removing && current.summaryParameterIds !== undefined
          ? {
              summaryParameterIds: current.summaryParameterIds.filter(
                (id) => id !== parameterId,
              ),
            }
          : {}),
      };
    });
  };

  const toggleCategory = (checked: boolean, visibleIds: string[]) => {
    setConfig((current) => {
      const next = new Set(current.parameterIds);
      for (const parameterId of visibleIds) {
        if (checked) next.add(parameterId);
        else next.delete(parameterId);
      }
      const removedIds = checked ? new Set<string>() : new Set(visibleIds);
      return {
        ...current,
        parameterIds: parameters
          .filter((parameter) => next.has(parameter.id))
          .map(({ id: parameterKey }) => parameterKey),
        ...(current.summaryParameterIds !== undefined
          ? {
              summaryParameterIds: current.summaryParameterIds.filter(
                (id) => !removedIds.has(id),
              ),
            }
          : {}),
      };
    });
  };

  const setOverview = (ids: string[]) => {
    setConfig((current) => ({
      ...current,
      summaryParameterIds: ids.slice(0, 4),
    }));
  };

  const moveOverview = (index: number, direction: -1 | 1) => {
    const next = overview.map((parameter) => parameter.id);
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= next.length) return;
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    setOverview(next);
  };

  const addOverviewParameter = (parameterId: string) => {
    if (!parameterId || overview.some((item) => item.id === parameterId))
      return;
    setOverview([...overview.map((item) => item.id), parameterId]);
  };

  return (
    <motion.section
      className="ct-configurator"
      aria-labelledby={`${id}-title`}
      initial={reducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", duration: 0.36, bounce: 0 }}
    >
      <header className="ct-heading">
        <div>
          <p className="ct-kicker">Client tracker</p>
          <h1 id={`${id}-title`}>
            {isFirstUse ? "Choose what to track" : "Tracker settings"}
          </h1>
          <p className="ct-intro">
            {isFirstUse
              ? "Select the measures that fit your coaching approach. You can change these any time."
              : "Choose the measures and display units for this client."}
          </p>
        </div>
        <span className="ct-count" aria-live="polite">
          <strong>{selected.length}</strong> selected
        </span>
      </header>

      <div className="ct-layout">
        <fieldset className="ct-choices">
          <legend className="ct-visually-hidden">Add tracker measures</legend>
          <div className="ct-library-heading">
            <div>
              <h2>Add measures</h2>
              <p>Search by measure, category or unit.</p>
            </div>
            <label className="ct-measure-search">
              <span className="ct-visually-hidden">Search measures</span>
              <input
                type="search"
                value={measureQuery}
                onChange={(event) => setMeasureQuery(event.currentTarget.value)}
                placeholder="Search measures…"
              />
            </label>
          </div>
          {filteredCategories.length > 0 ? (
            filteredCategories.map((category) => (
              <CategoryGroup
                key={category.id}
                label={category.label}
                description={category.description}
                config={config}
                parameters={category.parameters}
                selected={selectedSet}
                onToggleCategory={toggleCategory}
                onToggleParameter={toggleParameter}
                inputPrefix={id}
              />
            ))
          ) : (
            <p className="ct-no-results">No measures match “{measureQuery}”.</p>
          )}
        </fieldset>

        <aside className="ct-settings" aria-label="Tracker settings">
          <div className="ct-selected-head">
            <div>
              <h2>Selected measures</h2>
              <p>Active in this client tracker.</p>
            </div>
            <span>{selected.length}</span>
          </div>
          {selected.length > 0 ? (
            <ul className="ct-selected-list">
              {selected.map((parameter) => (
                <li key={parameter.id}>
                  <span className="ct-selected-name">{parameter.label}</span>
                  <small>{parameterUnit(parameter, config)}</small>
                  <button
                    type="button"
                    className="ct-remove-measure"
                    aria-label={`Remove ${parameter.label}`}
                    onClick={() => toggleParameter(parameter.id)}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ct-empty">
              Add measures from the library to create this tracker.
            </p>
          )}

          <section
            className="ct-overview-settings"
            aria-labelledby={`${id}-overview-title`}
          >
            <div className="ct-overview-heading">
              <div>
                <h3 id={`${id}-overview-title`}>Daily overview</h3>
                <p>
                  Choose up to four measures to surface above the daily log.
                </p>
              </div>
              <span>{overview.length}/4</span>
            </div>
            {overview.length ? (
              <ol className="ct-overview-list">
                {overview.map((parameter, index) => (
                  <li key={parameter.id}>
                    <span className="ct-overview-order">{index + 1}</span>
                    <span className="ct-overview-name">{parameter.label}</span>
                    <small>{parameterUnit(parameter, config)}</small>
                    <span className="ct-overview-actions">
                      <button
                        type="button"
                        aria-label={`Move ${parameter.label} earlier in daily overview`}
                        disabled={index === 0}
                        onClick={() => moveOverview(index, -1)}
                      >
                        <span aria-hidden="true">↑</span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${parameter.label} later in daily overview`}
                        disabled={index === overview.length - 1}
                        onClick={() => moveOverview(index, 1)}
                      >
                        <span aria-hidden="true">↓</span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${parameter.label} from daily overview`}
                        onClick={() =>
                          setOverview(
                            overview
                              .filter((item) => item.id !== parameter.id)
                              .map((item) => item.id),
                          )
                        }
                      >
                        <span aria-hidden="true">×</span>
                      </button>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="ct-overview-empty">
                No measures in the daily overview.
              </p>
            )}
            <label className="ct-overview-add">
              <span className="ct-visually-hidden">
                Add a measure to daily overview
              </span>
              <select
                value=""
                disabled={
                  overview.length >= 4 ||
                  eligibleSelected.length <= overview.length
                }
                onChange={(event) =>
                  addOverviewParameter(event.currentTarget.value)
                }
              >
                <option value="">
                  {overview.length >= 4
                    ? "Overview is full"
                    : "Add overview measure…"}
                </option>
                {eligibleSelected
                  .filter(
                    (parameter) =>
                      !overview.some((item) => item.id === parameter.id),
                  )
                  .map((parameter) => (
                    <option key={parameter.id} value={parameter.id}>
                      {parameter.label} · {parameterUnit(parameter, config)}
                    </option>
                  ))}
              </select>
            </label>
          </section>

          <div className="ct-unit-controls">
            <p className="ct-control-title">Display units</p>
            <UnitControl
              label="Bodyweight"
              value={config.weightUnit}
              options={["kg", "lb"]}
              onChange={(value) =>
                setConfig((current) => ({
                  ...current,
                  weightUnit: value as TrackerConfig["weightUnit"],
                }))
              }
            />
            <UnitControl
              label="Measurements"
              value={config.lengthUnit}
              options={["cm", "in"]}
              onChange={(value) =>
                setConfig((current) => ({
                  ...current,
                  lengthUnit: value as TrackerConfig["lengthUnit"],
                }))
              }
            />
            <UnitControl
              label="Water"
              value={config.waterUnit}
              options={["L", "fl oz"]}
              onChange={(value) =>
                setConfig((current) => ({
                  ...current,
                  waterUnit: value as TrackerConfig["waterUnit"],
                }))
              }
            />
            <UnitControl
              label="Ratings"
              value={config.ratingScale}
              options={["1–10", "1–5", "Words"]}
              onChange={(value) =>
                setConfig((current) => ({
                  ...current,
                  ratingScale:
                    value === "1–10"
                      ? "1-10"
                      : value === "1–5"
                        ? "1-5"
                        : "words",
                }))
              }
            />
          </div>

          <div className="ct-actions">
            {!isFirstUse && onCancel ? (
              <button className="ct-cancel" type="button" onClick={onCancel}>
                Cancel changes
              </button>
            ) : null}
            <button
              className="ct-save"
              type="button"
              disabled={selected.length === 0}
              onClick={() =>
                onSave({ ...config, parameterIds: [...config.parameterIds] })
              }
            >
              {isFirstUse ? "Create tracker" : "Save configuration"}
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </aside>
      </div>
    </motion.section>
  );
}

function CategoryGroup({
  label,
  description,
  config,
  parameters: categoryParameters,
  selected,
  onToggleCategory,
  onToggleParameter,
  inputPrefix,
}: {
  label: string;
  description: string;
  config: TrackerConfig;
  parameters: TrackerParameter[];
  selected: Set<string>;
  onToggleCategory: (checked: boolean, visibleIds: string[]) => void;
  onToggleParameter: (parameterId: string) => void;
  inputPrefix: string;
}) {
  const categoryCheckbox = useRef<HTMLInputElement>(null);
  const checkedCount = categoryParameters.filter((parameter) =>
    selected.has(parameter.id),
  ).length;
  const checked = checkedCount === categoryParameters.length;
  const indeterminate = checkedCount > 0 && !checked;

  useEffect(() => {
    if (categoryCheckbox.current)
      categoryCheckbox.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <section className="ct-category">
      <label className="ct-category-heading">
        <span className="ct-category-check">
          <input
            ref={categoryCheckbox}
            type="checkbox"
            checked={checked}
            aria-checked={indeterminate ? "mixed" : checked}
            aria-label={`Select all ${label.toLowerCase()} measures shown`}
            onChange={(event) =>
              onToggleCategory(
                event.currentTarget.checked,
                categoryParameters.map((parameter) => parameter.id),
              )
            }
          />
          <span className="ct-checkmark" aria-hidden="true" />
        </span>
        <div className="ct-category-copy">
          <h2>{label}</h2>
          <p>{description}</p>
        </div>
        <span className="ct-category-count">
          {checkedCount}/{categoryParameters.length}
        </span>
      </label>
      <div className="ct-parameter-list">
        {categoryParameters.map((parameter) => (
          <label className="ct-parameter" key={parameter.id}>
            <span className="ct-individual-check">
              <input
                id={`${inputPrefix}-${parameter.id}`}
                type="checkbox"
                checked={selected.has(parameter.id)}
                onChange={() => onToggleParameter(parameter.id)}
              />
              <span className="ct-checkmark" aria-hidden="true" />
            </span>
            <span className="ct-parameter-copy">
              <span>{parameter.label}</span>
              <small>{parameterUnit(parameter, config)}</small>
            </span>
            <span className="ct-summary-kind">{summaryLabel(parameter)}</span>
          </label>
        ))}
      </div>
    </section>
  );
}

function UnitControl({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const optionsValue =
    value === "1-10"
      ? "1–10"
      : value === "1-5"
        ? "1–5"
        : value === "words"
          ? "Words"
          : value;
  return (
    <label className="ct-unit-control">
      <span>{label}</span>
      <select
        value={optionsValue}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function parameterUnit(parameter: TrackerParameter, config: TrackerConfig) {
  if (parameter.id === "weight") return config.weightUnit;
  if (parameter.id === "waist") return config.lengthUnit;
  if (parameter.id === "water") return config.waterUnit;
  if (parameter.kind === "rating") {
    return config.ratingScale === "words"
      ? "Words"
      : `${config.ratingScale.replace("-", "–")} scale`;
  }
  return parameter.unit;
}

function summaryLabel(parameter: TrackerParameter) {
  if (parameter.summary === "latest") return "Latest";
  if (parameter.summary === "distribution") return "Distribution";
  if (parameter.summary === "total") return "Weekly total";
  return "Weekly average";
}
