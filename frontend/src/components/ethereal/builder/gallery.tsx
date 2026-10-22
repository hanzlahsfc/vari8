"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  type FormEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Button,
  Checkbox,
  IconButton,
  Input,
  Select,
  Toggle,
} from "@/components/vari8/components";
import { TextArea } from "@/components/vari8/inputs";
import { supportedSizes } from "./grid";
import {
  catalogue,
  type DashboardContentSettings,
  defaultSettings,
  type SizeName,
  type SourceRecords,
  safeResourceUrl,
  sourceOptions,
  summaryOptions,
  type WidgetInstance,
  type WidgetKind,
  type WidgetSettings,
} from "./model";
import { WidgetContent } from "./widget-content";
import "./gallery.css";

type GalleryMode = "add" | "configure" | "replace";

export type BuilderGalleryProps = {
  mode: GalleryMode;
  existing?: WidgetInstance;
  placedDimensions?: { width: number; height: number; columnSpan?: number };
  records: SourceRecords;
  onClose: () => void;
  onCommit: (widgets: WidgetInstance[]) => void;
};

const sizeMeasures: Record<
  SizeName,
  { width: number; height: number; label: string }
> = {
  Compact: { width: 248, height: 144, label: "248 × 144 px" },
  Regular: { width: 336, height: 224, label: "336 × 224 px" },
  Wide: { width: 512, height: 224, label: "512 × 224 px" },
  Tall: { width: 248, height: 384, label: "248 × 384 px" },
  Expanded: { width: 512, height: 384, label: "512 × 384 px" },
};

function newInstance(kind: WidgetKind): WidgetInstance {
  return {
    id: crypto.randomUUID(),
    kind,
    settings: defaultSettings(kind),
  };
}

const categoryOrder = [
  "Coaching",
  "Roadmap",
  "Nutrition",
  "Training",
  "Data/Progress",
  "Activity",
  "Recovery",
  "Habits",
  "Shortcuts",
];

function optionsFromValues(
  values: readonly string[],
  labelFor: (value: string) => string = (value) => value,
) {
  return values.map((value) => ({ value, label: labelFor(value) }));
}

const browseDescriptions: Record<WidgetKind, string> = {
  BN21: "Track weight, waist, or steps.",
  BN01: "Follow bodyweight readings over time.",
  BN15: "Compare nutrition intake with targets.",
  TL26: "See the current and next workouts.",
  TL28: "Track performance for a chosen exercise.",
  TL06: "Review daily steps and weekly averages.",
  TL14: "Review recent recovery ratings.",
  TL21: "Check off habits or view consistency.",
  CU03: "Keep assigned tasks and due dates visible.",
  CU04: "See the next check-in and latest response.",
  CU06: "Review recent coach feedback and links.",
  CU16: "Open frequently used coaching sections.",
  BN08: "Compare observed weekly bodyweight averages.",
  BN19: "Compare consumed nutrition with dated targets.",
  TL11: "Review recorded sleep duration.",
  TL22: "See completions against scheduled habits.",
  CU01: "Keep the current phase and weekly focus visible.",
  CU02: "Review your coaching week and selected indicators.",
  CU09: "Compare separately labelled weekly trends.",
  CU10: "See the current phase and coaching week.",
  CU17: "Add a clear divider between dashboard sections.",
  CU18: "Share an update with an optional resource link.",
};

function contentDefaults(kind: "CU17" | "CU18"): DashboardContentSettings {
  return (
    defaultSettings(kind).content ?? {
      body: "",
      tone: "neutral",
      actionLabel: "",
      actionUrl: "",
    }
  );
}

export function BuilderGallery({
  mode,
  existing,
  placedDimensions,
  records,
  onClose,
  onCommit,
}: BuilderGalleryProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All categories");
  const [staged, setStaged] = useState<WidgetInstance[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editing, setEditing] = useState<WidgetInstance | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setSearch("");
    setCategory("All categories");
    setError("");
    if (mode === "configure" && existing) {
      setStaged([existing]);
      setActiveId(existing.id);
      setEditing(
        existing.kind === "TL21" && !existing.settings.fields.length
          ? {
              ...existing,
              settings: {
                ...existing.settings,
                fields: records.habits.map((habit) => habit.id),
              },
            }
          : existing,
      );
    } else {
      setStaged([]);
      setActiveId(null);
      setEditing(null);
    }
  }, [existing, mode, records.habits]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focused = document.activeElement as HTMLElement | null;
    const previous =
      focused?.closest("details")?.querySelector("summary") ?? focused;
    if (!dialog.open) dialog.showModal();
    if (mode === "add" || mode === "replace") searchRef.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
      if (previous?.isConnected) previous.focus();
    };
  }, [mode]);

  const editingId = editing?.id;
  useEffect(() => {
    if (editingId) titleInputRef.current?.focus();
    else searchRef.current?.focus();
  }, [editingId]);

  const categories = useMemo(
    () => [
      "All categories",
      ...categoryOrder.filter((name) =>
        catalogue.some((item) => item.category === name),
      ),
    ],
    [],
  );
  const activeItem = catalogue.find((item) => item.id === editing?.kind);
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return catalogue.filter((item) => {
      if (category !== "All categories" && item.category !== category)
        return false;
      if (!needle) return true;
      const sources = sourceOptions(item.id).map(
        ({ label, value }) => `${label} ${value}`,
      );
      const summaries = sourceOptions(item.id).flatMap(({ value }) =>
        summaryOptions(item.id, value),
      );
      const haystack = [
        item.name,
        item.description,
        item.category,
        item.aliases,
        ...fieldChoices(item.id, records),
        ...sources,
        ...summaries,
      ]
        .join(" ")
        .toLocaleLowerCase();
      return haystack.includes(needle);
    });
  }, [category, search, records]);

  const dismiss = () => {
    setError("");
    if (dialogRef.current?.open) dialogRef.current.close();
    onClose();
  };

  const changeSettings = (updates: Partial<WidgetSettings>) => {
    setEditing((current) =>
      current
        ? { ...current, settings: { ...current.settings, ...updates } }
        : current,
    );
  };

  const openConfiguration = (instance: WidgetInstance) => {
    setActiveId(instance.id);
    setEditing(instance);
    setError("");
  };

  const stageWidget = (kind: WidgetKind) => {
    if (mode === "replace") {
      const replacement = newInstance(kind);
      if (existing) replacement.settings.size = existing.settings.size;
      openConfiguration(replacement);
      return;
    }
  };

  const toggleWidget = (kind: WidgetKind) => {
    const selected = [...staged].reverse().find((item) => item.kind === kind);
    if (selected) {
      removeStaged(selected.id);
      return;
    }
    const instance = newInstance(kind);
    setStaged((current) => [...current, instance]);
    setActiveId(null);
    setEditing(null);
    setError("");
  };

  const saveConfiguration = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    if (!editing.settings.title.trim()) {
      setError("Add a title before saving this widget.");
      return;
    }
    if (editing.kind === "CU18") {
      const content = editing.settings.content;
      if (!content?.body.trim()) {
        setError("Add announcement text before saving this widget.");
        return;
      }
      if (
        (content.actionLabel.trim() !== "") !==
        (content.actionUrl.trim() !== "")
      ) {
        setError("Add both a link label and URL, or leave both empty.");
        return;
      }
      if (content.actionUrl && !safeResourceUrl(content.actionUrl)) {
        setError("Use a valid http or https link for this resource.");
        return;
      }
    }
    if (
      [
        "BN15",
        "BN19",
        "TL14",
        "TL21",
        "TL22",
        "CU01",
        "CU02",
        "CU09",
        "CU16",
      ].includes(editing.kind) &&
      editing.settings.fields.length === 0
    ) {
      setError("Choose at least one visible field or destination.");
      return;
    }
    setError("");
    if (mode === "configure" || mode === "replace") {
      onCommit([editing]);
      if (dialogRef.current?.open) dialogRef.current.close();
      onClose();
      return;
    }
    setStaged((current) => {
      return current.some((item) => item.id === editing.id)
        ? current.map((item) => (item.id === editing.id ? editing : item))
        : [...current, editing];
    });
    setEditing(null);
    setActiveId(null);
  };

  const removeStaged = (id: string) => {
    const remaining = staged.filter((item) => item.id !== id);
    setStaged(remaining);
    if (activeId === id) {
      setActiveId(null);
      setEditing(null);
    }
  };

  const commitStaged = () => {
    if (!staged.length) {
      setError("Choose a widget to add first.");
      return;
    }
    onCommit(staged);
    if (dialogRef.current?.open) dialogRef.current.close();
    onClose();
  };

  const headerTitle =
    mode === "configure"
      ? "Configure widget"
      : mode === "replace"
        ? "Replace widget"
        : "Add widgets";
  const currentSourceOptions = editing ? sourceOptions(editing.kind) : [];
  const configurableSources = currentSourceOptions;
  const currentSummaries = editing
    ? summaryOptions(editing.kind, editing.settings.source)
    : [];
  const currentPeriods = editing
    ? periodChoices(
        editing.kind,
        editing.settings.period,
        editing.settings.option,
      )
    : [];
  const isEditingForm = Boolean(editing && mode !== "add");
  const previewDimensions =
    editing &&
    placedDimensions &&
    (mode === "replace" || editing.settings.size === existing?.settings.size)
      ? placedDimensions
      : editing
        ? sizeMeasures[editing.settings.size]
        : undefined;

  return (
    <dialog
      className={`eg-builder-gallery${mode !== "add" && isEditingForm ? " is-configuring" : ""}${mode === "replace" ? " is-replacing" : ""}`}
      ref={dialogRef}
      aria-labelledby="eg-gallery-title"
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      onClose={() => undefined}
    >
      <div className="eg-gallery-frame">
        <header className="eg-gallery-header">
          <div className="eg-gallery-title-block">
            <h2 id="eg-gallery-title">{headerTitle}</h2>
            <p>
              {mode === "configure"
                ? "Adjust this widget and save its settings."
                : mode === "replace"
                  ? "Choose a widget, then confirm its settings before replacing the current one."
                  : "Choose widgets to add. Each starts with its desktop default layout and settings."}
            </p>
          </div>
          <IconButton
            size="lg"
            className="eg-gallery-close"
            label="Close widget gallery"
            onClick={dismiss}
          >
            <CloseIcon />
          </IconButton>
        </header>

        <div className="eg-gallery-main">
          <section className="eg-gallery-library" aria-label="Widget library">
            <div className="eg-gallery-filters">
              <div className="eg-gallery-filter-row">
                <div className="eg-gallery-search">
                  <SearchIcon />
                  <Input
                    label="Search widgets"
                    ref={searchRef}
                    className="eg-gallery-search-input"
                    size="sm"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search by name, source or measure"
                  />
                  {search && (
                    <IconButton
                      size="sm"
                      label="Clear search"
                      className="eg-gallery-clear"
                      onClick={() => setSearch("")}
                    >
                      ×
                    </IconButton>
                  )}
                </div>
                <Select
                  label="Category"
                  size="sm"
                  value={category}
                  options={optionsFromValues(categories)}
                  onValueChange={setCategory}
                />
              </div>
            </div>

            <div className="eg-gallery-results-heading">
              <span>
                {filtered.length} {filtered.length === 1 ? "widget" : "widgets"}
              </span>
              {category !== "All categories" && <span>in {category}</span>}
            </div>
            {filtered.length ? (
              <div className="eg-gallery-groups">
                {categoryOrder
                  .filter((name) =>
                    filtered.some((item) => item.category === name),
                  )
                  .map((group) => (
                    <section
                      className="eg-gallery-category-section"
                      key={group}
                      aria-label={`${group} widgets`}
                    >
                      <h3 className="eg-gallery-category-title">{group}</h3>
                      <div className="eg-gallery-results">
                        {filtered
                          .filter((item) => item.category === group)
                          .map((item) => {
                            const stagedInstance = [...staged]
                              .reverse()
                              .find((instance) => instance.kind === item.id);
                            const selected = Boolean(stagedInstance);
                            const preview = stagedInstance ?? {
                              id: `preview-${item.id}`,
                              kind: item.id,
                              settings: defaultSettings(item.id),
                            };
                            return (
                              <article
                                className={`eg-gallery-item${selected ? " is-staged" : ""}`}
                                key={item.id}
                              >
                                <div
                                  className="eg-gallery-select"
                                  aria-hidden="true"
                                  inert
                                >
                                  <div
                                    className={`eg-gallery-item-preview is-${preview.settings.size.toLowerCase()}`}
                                    aria-hidden="true"
                                    inert
                                  >
                                    <GalleryWidgetPreview
                                      widget={preview}
                                      records={records}
                                    />
                                  </div>
                                  <div className="eg-gallery-item-copy">
                                    <div className="eg-gallery-item-heading">
                                      <div>
                                        <h3>{item.name}</h3>
                                        <span>
                                          {browseDescriptions[item.id]}
                                        </span>
                                        <span className="eg-gallery-specimen-meta">
                                          {item.category} ·{" "}
                                          {preview.settings.size}
                                        </span>
                                      </div>
                                    </div>
                                    {selected && mode !== "replace" && (
                                      <span className="eg-gallery-selection-label">
                                        Selected
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="lg"
                                  type="button"
                                  className="eg-gallery-tile-action"
                                  aria-label={`${mode === "replace" ? "Choose" : selected ? "Remove" : "Select"} ${item.name}. ${item.category}. ${browseDescriptions[item.id]}`}
                                  aria-pressed={
                                    mode === "replace" ? undefined : selected
                                  }
                                  onClick={() =>
                                    mode === "replace"
                                      ? stageWidget(item.id)
                                      : toggleWidget(item.id)
                                  }
                                />
                              </article>
                            );
                          })}
                      </div>
                    </section>
                  ))}
              </div>
            ) : (
              <div className="eg-gallery-empty">
                <p>No widgets match your search.</p>
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setCategory("All categories");
                  }}
                >
                  Reset filters
                </Button>
              </div>
            )}
          </section>

          <AnimatePresence mode="wait" initial={false}>
            {isEditingForm && editing && activeItem && (
              <motion.aside
                className="eg-gallery-config"
                key={`${editing.id}-config`}
                initial={reduceMotion ? false : { opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, x: 8 }}
                transition={{
                  duration: reduceMotion ? 0 : 0.18,
                  ease: "easeOut",
                }}
                aria-label={`Configure ${activeItem.name}`}
              >
                <div className="eg-gallery-config-heading">
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    className="eg-gallery-back"
                    onClick={() => {
                      setEditing(null);
                      setActiveId(null);
                      setError("");
                    }}
                  >
                    <BackIcon /> Widget library
                  </Button>
                  <h3>
                    {mode === "replace"
                      ? "Confirm replacement"
                      : activeItem.name}
                  </h3>
                  <p>{activeItem.description}</p>
                </div>
                <form className="eg-gallery-form" onSubmit={saveConfiguration}>
                  <Input
                    label={
                      editing.kind === "CU17" ? "Section heading" : "Title"
                    }
                    ref={titleInputRef}
                    required
                    maxLength={48}
                    value={editing.settings.title}
                    onChange={(event) =>
                      changeSettings({ title: event.target.value })
                    }
                  />
                  {editing.kind === "CU17" && (
                    <TextArea
                      label="Supporting line · optional"
                      size="sm"
                      rows={2}
                      maxLength={180}
                      value={editing.settings.content?.body ?? ""}
                      onChange={(event) =>
                        changeSettings({
                          content: {
                            ...contentDefaults("CU17"),
                            ...editing.settings.content,
                            body: event.target.value,
                          },
                        })
                      }
                    />
                  )}
                  {editing.kind === "CU18" && (
                    <>
                      <TextArea
                        label="Announcement"
                        rows={4}
                        maxLength={2000}
                        required
                        value={editing.settings.content?.body ?? ""}
                        onChange={(event) =>
                          changeSettings({
                            content: {
                              ...contentDefaults("CU18"),
                              ...editing.settings.content,
                              body: event.target.value,
                            },
                          })
                        }
                      />
                      <Select
                        label="Emphasis"
                        value={editing.settings.content?.tone ?? "accent"}
                        options={[
                          { value: "neutral", label: "Quiet" },
                          { value: "accent", label: "Accent" },
                          { value: "important", label: "Important" },
                        ]}
                        onValueChange={(tone) =>
                          changeSettings({
                            content: {
                              ...contentDefaults("CU18"),
                              ...editing.settings.content,
                              tone:
                                tone === "neutral" || tone === "important"
                                  ? tone
                                  : "accent",
                            },
                          })
                        }
                      />
                      <Input
                        label="Resource link label"
                        maxLength={64}
                        value={editing.settings.content?.actionLabel ?? ""}
                        onChange={(event) =>
                          changeSettings({
                            content: {
                              ...contentDefaults("CU18"),
                              ...editing.settings.content,
                              actionLabel: event.target.value,
                            },
                          })
                        }
                        placeholder="Open the guide"
                      />
                      <Input
                        label="Resource URL"
                        type="url"
                        maxLength={2048}
                        value={editing.settings.content?.actionUrl ?? ""}
                        onChange={(event) =>
                          changeSettings({
                            content: {
                              ...contentDefaults("CU18"),
                              ...editing.settings.content,
                              actionUrl: event.target.value,
                            },
                          })
                        }
                        placeholder="https://…"
                      />
                    </>
                  )}
                  <Select
                    label="Source"
                    value={editing.settings.source}
                    options={configurableSources}
                    onValueChange={(next) => {
                      const available = summaryOptions(editing.kind, next);
                      changeSettings({
                        source: next,
                        summary: available.includes(editing.settings.summary)
                          ? editing.settings.summary
                          : (available[0] ?? ""),
                        ...(editing.kind === "BN21"
                          ? {
                              unit:
                                next === "steps"
                                  ? "steps"
                                  : next === "bodyweight"
                                    ? "kg"
                                    : "cm",
                            }
                          : {}),
                      });
                    }}
                  />
                  {["BN15", "BN19"].includes(editing.kind) && (
                    <Select
                      label="Graph format"
                      options={
                        editing.kind === "BN15"
                          ? [
                              { value: "circles", label: "Three circles" },
                              {
                                value: "lines",
                                label: "Three target lines",
                              },
                            ]
                          : [
                              {
                                value: "line",
                                label: "Consumed and target lines",
                              },
                              {
                                value: "stacked",
                                label: "Stacked daily columns",
                              },
                              {
                                value: "single",
                                label: "Single-day target card",
                              },
                            ]
                      }
                      value={
                        editing.settings.option === "active"
                          ? editing.kind === "BN15"
                            ? "circles"
                            : "single"
                          : editing.settings.option
                      }
                      onValueChange={(option) =>
                        changeSettings({
                          option,
                          ...(editing.kind === "BN19" &&
                          ["line", "stacked"].includes(option)
                            ? {
                                target: true,
                                summary: "actual-target",
                                period: [
                                  "week",
                                  "month",
                                  "6month",
                                  "year",
                                ].includes(editing.settings.period)
                                  ? editing.settings.period
                                  : "month",
                              }
                            : editing.kind === "BN19"
                              ? { period: "today" }
                              : {}),
                        })
                      }
                    />
                  )}
                  {editing.kind === "BN19" && (
                    <Select
                      label="Nutrient"
                      value={editing.settings.fields[0] ?? "protein"}
                      options={[
                        { value: "protein", label: "Protein" },
                        { value: "carbs", label: "Carbohydrate" },
                        { value: "fat", label: "Fat" },
                        { value: "calories", label: "Energy" },
                      ]}
                      onValueChange={(field) =>
                        changeSettings({
                          fields: [field],
                          unit: field === "calories" ? "kcal" : "g",
                        })
                      }
                    />
                  )}
                  {editing.kind === "BN08" && (
                    <Select
                      label="Change display"
                      value={editing.settings.option}
                      options={[
                        {
                          value: "absolute",
                          label: `Change in ${editing.settings.unit}`,
                        },
                        { value: "percentage", label: "Percentage change" },
                      ]}
                      onValueChange={(option) => changeSettings({ option })}
                    />
                  )}
                  {editing.kind === "TL21" && (
                    <Select
                      label="Presentation"
                      value={
                        editing.settings.option === "contributions"
                          ? "contributions"
                          : "list"
                      }
                      options={[
                        { value: "list", label: "List" },
                        {
                          value: "contributions",
                          label: "Contribution graph",
                        },
                      ]}
                      onValueChange={(presentation) => {
                        changeSettings({
                          option: presentation,
                          period:
                            presentation === "contributions"
                              ? ["4w", "6w"].includes(editing.settings.period)
                                ? editing.settings.period
                                : "4w"
                              : editing.kind === "TL21"
                                ? "today"
                                : editing.settings.period,
                        });
                      }}
                    />
                  )}
                  <div className="eg-gallery-config-preview">
                    <div className="eg-gallery-config-preview-heading">
                      <span>Live preview</span>
                      <span>
                        {Math.round(previewDimensions?.width ?? 0)} ×{" "}
                        {Math.round(previewDimensions?.height ?? 0)} px
                      </span>
                    </div>
                    <div
                      className="eg-gallery-config-preview-stage"
                      style={{
                        height: (previewDimensions?.height ?? 224) + 20,
                      }}
                      aria-hidden="true"
                      inert
                    >
                      <GalleryWidgetPreview
                        widget={editing}
                        records={records}
                        placedDimensions={previewDimensions}
                      />
                    </div>
                  </div>
                  <details className="eg-gallery-advanced-settings">
                    <summary>More settings</summary>
                    <div>
                      {["TL21", "TL22"].includes(editing.kind) &&
                        (editing.kind === "TL22" ||
                          editing.settings.option === "contributions") && (
                          <Select
                            label="Contribution history"
                            value={editing.settings.historyPeriod ?? "auto"}
                            options={[
                              {
                                value: "auto",
                                label: "Automatic · fits card width",
                              },
                              { value: "3m", label: "3 months" },
                              { value: "6m", label: "6 months" },
                              {
                                value: "1y",
                                label:
                                  (previewDimensions?.width ?? 512) - 34 < 413
                                    ? "1 year · widen the card first"
                                    : "1 year",
                                disabled:
                                  (previewDimensions?.width ?? 512) - 34 < 413,
                              },
                            ]}
                            onValueChange={(historyPeriod) =>
                              changeSettings({
                                historyPeriod:
                                  historyPeriod as WidgetSettings["historyPeriod"],
                              })
                            }
                          />
                        )}
                      {currentSummaries.length > 1 &&
                        !(
                          editing.kind === "BN19" &&
                          ["line", "stacked"].includes(editing.settings.option)
                        ) && (
                          <Select
                            label="Summary"
                            value={editing.settings.summary}
                            options={optionsFromValues(
                              currentSummaries,
                              (value) =>
                                editing.kind === "CU03" && value === "both"
                                  ? "Open and completed"
                                  : settingLabel(value),
                            )}
                            onValueChange={(summary) =>
                              changeSettings({ summary })
                            }
                          />
                        )}
                      <div className="eg-gallery-field-pair">
                        {currentPeriods.length > 0 && (
                          <Select
                            label={
                              ["TL21", "TL22"].includes(editing.kind)
                                ? "Summary period"
                                : "Period"
                            }
                            value={editing.settings.period}
                            options={currentPeriods}
                            onValueChange={(period) =>
                              changeSettings({ period })
                            }
                          />
                        )}
                        <Select
                          label="Card size"
                          value={editing.settings.size}
                          disabled={mode === "replace"}
                          options={supportedSizes(
                            activeItem.id,
                            activeItem.sizes,
                          ).map((value) => ({
                            value,
                            label: `${value} · ${sizeMeasures[value].label}`,
                          }))}
                          onValueChange={(size) =>
                            changeSettings({
                              size: size as SizeName,
                            })
                          }
                        />
                      </div>
                      {mode === "replace" && (
                        <p className="eg-gallery-config-note">
                          The replacement will keep the current card’s canvas
                          position and footprint.
                        </p>
                      )}
                      {mode === "configure" && placedDimensions && (
                        <p className="eg-gallery-config-note">
                          Settings retain the placed dimensions. Use Resize on
                          the canvas to adjust width and height independently.
                        </p>
                      )}
                      <div className="eg-gallery-field-pair">
                        {unitChoices(editing.kind, editing.settings.source)
                          .length > 1 && (
                          <Select
                            label="Unit"
                            value={editing.settings.unit}
                            options={optionsFromValues(
                              unitChoices(
                                editing.kind,
                                editing.settings.source,
                              ),
                            )}
                            onValueChange={(unit) => changeSettings({ unit })}
                          />
                        )}
                      </div>
                      {editing.kind !== "BN19" &&
                        fieldChoices(editing.kind, records).length > 0 && (
                          <fieldset className="eg-gallery-fields-list">
                            <legend>Visible fields</legend>
                            <div className="eg-gallery-checkboxes">
                              {fieldChoices(editing.kind, records).map(
                                (field) => (
                                  <Checkbox
                                    key={field}
                                    label={
                                      ["TL21", "TL22"].includes(editing.kind)
                                        ? (records.habits.find(
                                            (habit) => habit.id === field,
                                          )?.name ?? field)
                                        : field
                                    }
                                    checked={editing.settings.fields.includes(
                                      field,
                                    )}
                                    onCheckedChange={(checked) => {
                                      const next = checked
                                        ? [...editing.settings.fields, field]
                                        : editing.settings.fields.filter(
                                            (value) => value !== field,
                                          );
                                      changeSettings({ fields: next });
                                    }}
                                  />
                                ),
                              )}
                            </div>
                            {editing.settings.fields.length > 1 && (
                              <ol
                                className="eg-field-order"
                                aria-label="Field reading order"
                              >
                                {editing.settings.fields.map((field, index) => (
                                  <li key={field}>
                                    <span>
                                      {["TL21", "TL22"].includes(editing.kind)
                                        ? (records.habits.find(
                                            (habit) => habit.id === field,
                                          )?.name ?? field)
                                        : field}
                                    </span>
                                    <IconButton
                                      size="sm"
                                      type="button"
                                      label={`Move ${field} earlier`}
                                      disabled={index === 0}
                                      onClick={() => {
                                        const fields = [
                                          ...editing.settings.fields,
                                        ];
                                        [fields[index - 1], fields[index]] = [
                                          fields[index],
                                          fields[index - 1],
                                        ];
                                        changeSettings({ fields });
                                      }}
                                    >
                                      ↑
                                    </IconButton>
                                    <IconButton
                                      size="sm"
                                      type="button"
                                      label={`Move ${field} later`}
                                      disabled={
                                        index ===
                                        editing.settings.fields.length - 1
                                      }
                                      onClick={() => {
                                        const fields = [
                                          ...editing.settings.fields,
                                        ];
                                        [fields[index + 1], fields[index]] = [
                                          fields[index],
                                          fields[index + 1],
                                        ];
                                        changeSettings({ fields });
                                      }}
                                    >
                                      ↓
                                    </IconButton>
                                  </li>
                                ))}
                              </ol>
                            )}
                          </fieldset>
                        )}
                      {["TL21", "CU16"].includes(editing.kind) &&
                        editing.settings.fields.map((field) => (
                          <Input
                            key={`label-${field}`}
                            label={`Display label · ${
                              ["TL21", "TL22"].includes(editing.kind)
                                ? (records.habits.find(
                                    (habit) => habit.id === field,
                                  )?.name ?? field)
                                : field
                            }`}
                            maxLength={64}
                            value={editing.settings.labels?.[field] ?? ""}
                            placeholder="Use source label"
                            onChange={(event) =>
                              changeSettings({
                                labels: {
                                  ...editing.settings.labels,
                                  [field]: event.target.value,
                                },
                              })
                            }
                          />
                        ))}
                      {editing.kind === "CU04" && (
                        <Toggle
                          label="Include additional scheduled check-ins"
                          checked={editing.settings.option !== "recurring"}
                          onCheckedChange={(checked) =>
                            changeSettings({
                              option: checked ? "all" : "recurring",
                            })
                          }
                        />
                      )}
                      {targetAvailable(editing.kind) &&
                        !(
                          editing.kind === "BN19" &&
                          ["line", "stacked"].includes(editing.settings.option)
                        ) && (
                          <Toggle
                            label="Show target"
                            checked={
                              ["BN15", "BN19", "CU02", "CU09"].includes(
                                editing.kind,
                              ) && editing.settings.target
                            }
                            disabled={
                              !["BN15", "BN19", "CU02", "CU09"].includes(
                                editing.kind,
                              )
                            }
                            description={
                              ["BN15", "BN19"].includes(editing.kind)
                                ? "Keep fixed, range and minimum plan targets visible."
                                : ["CU02", "CU09"].includes(editing.kind)
                                  ? "Show each source metric’s own applicable target."
                                  : "This fixture has no numeric target assigned to this source."
                            }
                            onCheckedChange={(target) =>
                              changeSettings({ target })
                            }
                          />
                        )}
                    </div>
                  </details>
                  {error && (
                    <p className="eg-gallery-error" role="alert">
                      {error}
                    </p>
                  )}
                  <div className="eg-gallery-form-actions">
                    <Button type="submit" variant="primary">
                      {mode === "replace" ? "Replace widget" : "Save changes"}
                    </Button>
                  </div>
                </form>
              </motion.aside>
            )}
          </AnimatePresence>
        </div>

        {error && !isEditingForm && (
          <p className="eg-gallery-footer-error" role="alert">
            {error}
          </p>
        )}
        <footer className="eg-gallery-footer">
          <div
            className="eg-gallery-staged"
            aria-live="polite"
            hidden={mode !== "add"}
          >
            <div className="eg-gallery-staged-count">
              <strong>{staged.length}</strong>{" "}
              {staged.length === 1 ? "widget selected" : "widgets selected"}
            </div>
            {staged.length > 0 && (
              <div className="eg-gallery-staged-items">
                {staged.map((widget) => (
                  <div className="eg-gallery-staged-item" key={widget.id}>
                    <span>
                      {widget.settings.title ||
                        catalogue.find((item) => item.id === widget.kind)?.name}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => removeStaged(widget.id)}
                      aria-label={`Remove ${widget.settings.title}`}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="eg-gallery-footer-actions">
            <Button
              variant="secondary"
              size="sm"
              type="button"
              onClick={dismiss}
            >
              Cancel
            </Button>
            {mode === "add" && (
              <Button
                variant="primary"
                size="sm"
                type="button"
                onClick={commitStaged}
                disabled={!staged.length}
              >
                Add{" "}
                {staged.length
                  ? `${staged.length} widget${staged.length === 1 ? "" : "s"}`
                  : "widgets"}
              </Button>
            )}
          </div>
        </footer>
      </div>
    </dialog>
  );
}

function periodChoices(
  kind: WidgetKind,
  current: string,
  presentation: string,
): { value: string; label: string }[] {
  if (kind === "BN15") return [{ value: "today", label: "Active day" }];
  if (
    ["BN01", "BN21", "BN08", "TL28", "TL11", "BN19"].includes(kind) &&
    !(kind === "BN19" && ["single", "active"].includes(presentation))
  ) {
    const ranges = ["week", "month", "6month", "year"].map((value) => ({
      value,
      label: settingLabel(value),
    }));
    if (!ranges.some((item) => item.value === current))
      ranges.unshift({ value: current, label: settingLabel(current) });
    return ranges;
  }
  if (kind === "TL21" && presentation !== "contributions")
    return [{ value: "today", label: "Today" }];
  const values = [
    "BN01",
    "BN21",
    "BN15",
    "BN19",
    "TL11",
    "TL06",
    "TL14",
    "CU03",
    "CU04",
    "CU06",
  ].includes(kind)
    ? ["today", "7d", "14d", "30d", "90d"]
    : ["TL28", "BN08", "CU09"].includes(kind)
      ? ["4w", "8w", "12w"]
      : kind === "TL26"
        ? ["week"]
        : ["TL21", "TL22"].includes(kind)
          ? ["today", "7d", "14d", "4w", "6w", "8w", "12w"]
          : [];
  if (values.length === 0) return [];
  const options = values.map((value) => ({
    value,
    label:
      kind === "CU03"
        ? value === "today"
          ? "Due today"
          : `Next ${value.replace("d", "")} days`
        : settingLabel(value),
  }));
  if (!options.some(({ value }) => value === current))
    options.unshift({ value: current, label: settingLabel(current) });
  return options;
}

function unitChoices(kind: WidgetKind, source: string): string[] {
  if (kind === "BN21") {
    if (source === "bodyweight") return ["kg"];
    if (source === "waist") return ["cm"];
    return ["steps"];
  }
  if (["BN01", "BN08", "TL28"].includes(kind)) return ["kg", "lb"];
  if (kind === "TL11") return ["h", "min"];
  if (kind === "TL06") return ["steps"];
  if (kind === "BN15") return ["g"];
  return ["default"];
}

function fieldChoices(kind: WidgetKind, records: SourceRecords): string[] {
  if (kind === "BN15") return ["protein", "carbs", "fat"];
  if (kind === "TL26")
    return ["exercise", "sets", "reps", "coach instructions"];
  if (["TL21", "TL22"].includes(kind))
    return records.habits.map((habit) => habit.id);
  if (kind === "CU01") return ["phase", "focus", "successCue"];
  if (["CU02", "CU09"].includes(kind))
    return [
      ...new Set(
        (records.roadmapWeeks ?? []).flatMap((week) =>
          week.metrics.map((metric) => metric.key),
        ),
      ),
    ];
  if (kind === "TL14") return ["energy", "stress", "readiness"];
  if (kind === "CU16")
    return ["Tracker", "Mealplan", "Training", "Check-in", "Habit Tracker"];
  return [];
}

function targetAvailable(kind: WidgetKind): boolean {
  return ["BN21", "TL06", "BN15", "BN19", "CU02", "CU09"].includes(kind);
}

function settingLabel(value: string): string {
  const labels: Record<string, string> = {
    today: "Today",
    "7d": "Past 7 days",
    "14d": "Past 14 days",
    "30d": "Past 30 days",
    "90d": "Past 90 days",
    "4w": "Past 4 weeks",
    "6w": "Past 6 weeks",
    "8w": "Past 8 weeks",
    "12w": "Past 12 weeks",
    "per-meal": "Per meal",
    daily: "Daily",
    "weekly-average": "Weekly average",
    week: "Week",
    month: "Month",
    "6month": "6 months",
    year: "Year",
    current: "Current",
    next: "Next",
    both: "Current and next",
    latest: "Latest value",
    average: "Average",
    total: "Total",
    change: "Change",
    distribution: "Rating distribution",
    history: "Dated history",
    load: "Load",
    reps: "Reps",
    sets: "Completed sets",
    open: "Open items",
    completed: "Completed items",
    status: "Submission status",
    schedule: "Schedule",
    submission: "Latest submission",
    unread: "Unread response",
    enabled: "Enabled links",
    scheduled: "Scheduled habits",
    default: "Default",
    "current-week": "Current coaching week",
    "current-phase": "Current phase",
    "weekly-average-change": "Weekly average and change",
    "weekly-history": "Weekly averages",
    "actual-target": "Logged amount vs target",
    "scheduled-statuses": "Completed / scheduled",
    "completion-count": "Completion counts",
    "phase-focus": "Phase and weekly focus",
    focus: "Weekly focus",
    "selected-metrics": "Selected weekly summaries",
    "weekly-trends": "Selected weekly trends",
    "latest-values": "Latest weekly values",
    "days-remaining": "Days remaining",
    "phase-progress": "Time elapsed in phase",
    actual: "Logged amount",
  };
  return labels[value] ?? value;
}

function GalleryWidgetPreview({
  widget,
  records,
  placedDimensions,
}: {
  widget: WidgetInstance;
  records: SourceRecords;
  placedDimensions?: { width: number; height: number; columnSpan?: number };
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

  useLayoutEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const measure = () => {
      const box = element.getBoundingClientRect();
      setDimensions({
        width: Math.max(1, box.width),
        height: Math.max(1, box.height),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const logical = placedDimensions ?? sizeMeasures[widget.settings.size];
  const outerWidth = Math.min(
    logical.width,
    dimensions?.width ?? logical.width,
  );
  const outerHeight = Math.min(
    logical.height,
    dimensions?.height ?? logical.height,
  );
  return (
    <div className="eg-gallery-preview-stage" ref={stageRef}>
      {dimensions && (
        <div
          className={`eg-gallery-preview-content${placedDimensions ? "" : ` is-library-preview is-${widget.settings.size.toLowerCase()}`}`}
          style={{ width: outerWidth, height: outerHeight }}
        >
          <h4>{widget.settings.title}</h4>
          <WidgetContent
            widget={widget}
            records={records}
            width={outerWidth}
            height={outerHeight}
            columnSpan={
              placedDimensions?.columnSpan ??
              { Compact: 3, Regular: 4, Wide: 6, Tall: 3, Expanded: 6 }[
                widget.settings.size
              ]
            }
            clientPreview={false}
            onRecordsChange={() => undefined}
            onDetail={() => undefined}
          />
        </div>
      )}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <circle cx="8.5" cy="8.5" r="5.75" />
      <path d="m13 13 4 4" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="m5 5 10 10M15 5 5 15" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M12.5 4.5 7 10l5.5 5.5M7.5 10h9" />
    </svg>
  );
}
