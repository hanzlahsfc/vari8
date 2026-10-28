"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronRight,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  DropdownMenu,
  IconButton,
  Input,
  Modal,
  Navigation,
  SegmentedControl,
  Select,
  Status,
  Table,
  Tabs,
  Toggle,
  Tooltip,
} from "@/components/vari8/components";
import { InputShowcase } from "@/components/vari8/input-showcase";
import { DatePicker, TimePicker } from "@/components/vari8/inputs";
import {
  CoachingWorkspaceSample,
  LayoutShowcase,
} from "@/components/vari8/playground-compositions";
import { ThemeScope } from "@/components/vari8/theme";
import { normalizeAccent, type Vari8Mode } from "@/lib/vari8-theme";
import "./playground.css";

const STORAGE_KEY = "vari8-playground:appearance:v1";
const INITIAL_ACCENT = "#BEB2FC";
const componentLinks = [
  { id: "overview", label: "In context" },
  { id: "layouts", label: "Layouts" },
  { id: "buttons", label: "Buttons" },
  { id: "fields", label: "Fields" },
  { id: "inputs", label: "Inputs" },
  { id: "choices", label: "Choices" },
  { id: "feedback", label: "Feedback" },
  { id: "overlays", label: "Overlays" },
  { id: "navigation", label: "Navigation" },
  { id: "data", label: "Data display" },
];

type SavedAppearance = { mode: Vari8Mode; accent: string };

function readPlaygroundAppearance(): SavedAppearance | null {
  try {
    const saved: unknown = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "null",
    );
    if (typeof saved !== "object" || saved === null) return null;
    if (!("mode" in saved) || !("accent" in saved)) return null;
    if (saved.mode !== "light" && saved.mode !== "dark") return null;
    if (typeof saved.accent !== "string") return null;
    const accent = normalizeAccent(saved.accent);
    return accent ? { mode: saved.mode, accent } : null;
  } catch {
    return null;
  }
}

function Example({
  title,
  note,
  children,
  className = "",
}: {
  title: string;
  note?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`v8-example ${className}`}>
      <div className="v8-example-heading">
        <h3>{title}</h3>
        {note ? <p>{note}</p> : null}
      </div>
      {children}
    </div>
  );
}

function SectionHeading({
  id,
  title,
  description,
}: {
  id: string;
  title: string;
  description: string;
}) {
  return (
    <div className="v8-section-heading">
      <h2 id={id}>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

export function Vari8Playground() {
  const [mode, setMode] = useState<Vari8Mode>("dark");
  const [accent, setAccent] = useState(INITIAL_ACCENT);
  const [accentDraft, setAccentDraft] = useState(INITIAL_ACCENT);
  const [activeNavigation, setActiveNavigation] = useState("clients");
  const [activePeriod, setActivePeriod] = useState("week");
  const [activeTab, setActiveTab] = useState("summary");
  const [checked, setChecked] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalSize, setModalSize] = useState<
    "compact" | "standard" | "wide" | "full"
  >("standard");
  const [reviewDate, setReviewDate] = useState("2026-10-19");
  const [reviewTime, setReviewTime] = useState("08:30");
  const [menuMessage, setMenuMessage] = useState("");
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    const saved = readPlaygroundAppearance();
    if (saved) {
      setMode(saved.mode);
      setAccent(saved.accent);
      setAccentDraft(saved.accent);
    }
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ mode, accent }),
      );
    } catch {
      // The playground stays usable when storage is unavailable or full.
    }
  }, [accent, mode, storageReady]);

  const validDraft = normalizeAccent(accentDraft);
  const setDraft = (value: string) => {
    const normalized = normalizeAccent(value);
    setAccentDraft(value);
    if (normalized) setAccent(normalized);
  };

  return (
    <ThemeScope mode={mode} accent={accent} className="v8-playground-theme">
      <div className="v8-playground">
        <main className="v8-playground-main" id="top">
          <header className="v8-dev-toolbar">
            <div className="v8-dev-toolbar__title">
              <span className="v8-mark" aria-hidden="true">
                v8
              </span>
              <div>
                <h1>
                  VARI8 <span>Design system</span>
                </h1>
                <p>Shared controls · Development preview</p>
              </div>
            </div>
            <div className="v8-dev-toolbar__controls">
              <SegmentedControl
                label="Preview mode"
                value={mode}
                onValueChange={(value) =>
                  setMode(value === "light" ? "light" : "dark")
                }
                options={[
                  { value: "light", label: "Light" },
                  { value: "dark", label: "Dark" },
                ]}
              />
              <label className="v8-accent-picker">
                <span>Accent</span>
                <input
                  type="color"
                  aria-label="Choose any accent color"
                  value={accent}
                  onChange={(event) => setDraft(event.currentTarget.value)}
                />
              </label>
              <label
                className={`v8-hex-input${validDraft ? "" : " is-invalid"}`}
              >
                <span>Hex</span>
                <input
                  value={accentDraft}
                  onChange={(event) => setDraft(event.currentTarget.value)}
                  onBlur={() => validDraft && setAccentDraft(validDraft)}
                  aria-label="Accent hex value"
                  aria-invalid={!validDraft}
                  aria-describedby="v8-hex-help"
                  spellCheck={false}
                  autoComplete="off"
                  maxLength={7}
                />
                <span
                  id="v8-hex-help"
                  className="v8-field-help"
                  aria-live="polite"
                >
                  {validDraft
                    ? "Updates as you type"
                    : "Enter a six-digit hex color"}
                </span>
              </label>
              <details className="v8-accent-role-details">
                <summary aria-label="Show resolved accent roles">Roles</summary>
                <div className="v8-accent-role-popover">
                  <span className="v8-accent-role-popover__heading">
                    Selected accent{" "}
                    <strong className="v8-accent-role-value">{accent}</strong>
                  </span>
                  <span className="v8-role-chip" title="Raw selected accent">
                    <i className="v8-role-raw" />
                    Raw
                  </span>
                  <span className="v8-role-chip" title="Derived action fill">
                    <i className="v8-role-action" />
                    Action
                  </span>
                  <span
                    className="v8-role-chip"
                    title="Derived readable accent text"
                  >
                    <i className="v8-role-text" />
                    Accent text
                  </span>
                  <span className="v8-role-chip" title="Derived selection fill">
                    <i className="v8-role-soft" />
                    Selection
                  </span>
                </div>
              </details>
            </div>
          </header>
          <nav className="v8-catalog-index" aria-label="Component catalog">
            <span className="v8-catalog-index__label">COMPONENTS</span>
            {componentLinks.map((link) => (
              <a key={link.id} href={`#${link.id}`}>
                {link.label}
              </a>
            ))}
          </nav>

          <section className="v8-catalog-section" aria-labelledby="overview">
            <SectionHeading
              id="overview"
              title="In context"
              description="An illustrative coaching workspace built from shared controls."
            />
            <CoachingWorkspaceSample />
          </section>

          <section className="v8-catalog-section" aria-labelledby="layouts">
            <SectionHeading
              id="layouts"
              title="Layouts"
              description="Roster filters, form fields, and editor actions share responsive page structures."
            />
            <LayoutShowcase />
          </section>

          <section className="v8-catalog-section" aria-labelledby="buttons">
            <SectionHeading
              id="buttons"
              title="Buttons"
              description="Priority, size, loading, and interaction states."
            />
            <Example
              title="Variants and sizes"
              note="Each priority uses the same sm, md, and lg size contract."
            >
              <div className="v8-button-variants">
                {(
                  [
                    ["primary", "Primary"],
                    ["secondary", "Secondary"],
                    ["ghost", "Ghost"],
                    ["destructive", "Destructive"],
                    ["link", "Link"],
                  ] as const
                ).map(([variant, label]) => (
                  <div className="v8-variant-row" key={variant}>
                    <span>{label}</span>
                    <Button variant={variant} size="sm">
                      Save changes
                    </Button>
                    <Button variant={variant} size="md">
                      Save changes
                    </Button>
                    <Button variant={variant} size="lg">
                      Save changes
                    </Button>
                    <Button variant={variant} size="md" loading>
                      Saving
                    </Button>
                  </div>
                ))}
              </div>
            </Example>
            <Example
              title="State reference"
              note="Frozen specimens show the named visual state. The controls above remain live."
            >
              <div className="v8-state-matrix">
                <table aria-label="Button state matrix">
                  <thead>
                    <tr className="v8-state-row v8-state-head">
                      <th scope="col">State</th>
                      <th scope="col">Primary</th>
                      <th scope="col">Secondary</th>
                      <th scope="col">Ghost</th>
                      <th scope="col">Destructive</th>
                      <th scope="col">Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        "rest",
                        "hover",
                        "focus",
                        "active",
                        "selected",
                        "disabled",
                      ] as const
                    ).map((state) => (
                      <tr className="v8-state-row" key={state}>
                        <th scope="row">{state}</th>
                        {(
                          [
                            "primary",
                            "secondary",
                            "ghost",
                            "destructive",
                            "link",
                          ] as const
                        ).map((variant) => (
                          <td key={variant} data-preview-state={state}>
                            <Button
                              variant={variant}
                              size="sm"
                              disabled={state === "disabled"}
                              aria-pressed={
                                state === "selected" ? true : undefined
                              }
                              tabIndex={-1}
                            >
                              {state === "selected" ? "Selected" : "Continue"}
                            </Button>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Example>
            <Example
              title="Icon button"
              note="An accessible name is required for icon-only actions."
            >
              <div className="v8-inline-controls">
                <IconButton size="sm" label="Open compact actions">
                  <ChevronRight size={14} />
                </IconButton>
                <IconButton size="md" label="Open check-in actions">
                  <ChevronRight size={16} />
                </IconButton>
                <IconButton size="lg" label="Mark complete">
                  <Check size={19} />
                </IconButton>
                <IconButton size="md" label="Unavailable action" disabled>
                  <Check size={16} />
                </IconButton>
              </div>
            </Example>
          </section>

          <section className="v8-catalog-section" aria-labelledby="fields">
            <SectionHeading
              id="fields"
              title="Fields"
              description="Labels, hints, errors, and disabled states remain visible together."
            />
            <div className="v8-example-grid">
              <Example title="Text input">
                <Input
                  label="Session note"
                  defaultValue="Energy felt steady throughout."
                  hint="Visible to Maya in her check-in."
                />
                <Input
                  label="Follow-up date"
                  placeholder="Choose a date"
                  error="Choose a date after today."
                />
                <Input
                  label="Read-only field"
                  value="Strength plan · 3 days"
                  readOnly
                />
              </Example>
              <Example title="Select">
                <Select
                  label="Plan focus"
                  defaultValue="strength"
                  options={[
                    { value: "strength", label: "Strength" },
                    { value: "mobility", label: "Mobility" },
                    { value: "recovery", label: "Recovery" },
                  ]}
                  hint="Used to group the next review."
                />
                <Select
                  label="Unavailable plan"
                  defaultValue="paused"
                  disabled
                  options={[
                    { value: "paused", label: "Plan paused", disabled: true },
                    { value: "active", label: "Active plan" },
                  ]}
                />
                <Select
                  label="Plan focus with error"
                  defaultValue="strength"
                  options={[
                    { value: "strength", label: "Strength" },
                    { value: "mobility", label: "Mobility" },
                  ]}
                  error="Choose a focus before assigning this plan."
                />
              </Example>
            </div>
            <InputShowcase />
            <Example
              title="Field states"
              note="A compact visual comparison of the states used in forms."
            >
              <div className="v8-field-state-grid">
                {(
                  [
                    "rest",
                    "hover",
                    "focus",
                    "active",
                    "selected",
                    "disabled",
                  ] as const
                ).map((state) => (
                  <div
                    className="v8-frozen-field"
                    data-preview-state={state}
                    key={state}
                  >
                    <span className="v8-frozen-field-state">{state}</span>
                    <Input
                      label="Session note"
                      className="v8-state-input"
                      defaultValue={
                        state === "selected" ? "Completed" : "Check-in note"
                      }
                      readOnly={state !== "rest"}
                      disabled={state === "disabled"}
                      tabIndex={-1}
                    />
                  </div>
                ))}
              </div>
            </Example>
          </section>

          <section className="v8-catalog-section" aria-labelledby="choices">
            <SectionHeading
              id="choices"
              title="Choices"
              description="Tabs move between views; segmented controls choose a compact value."
            />
            <div className="v8-example-grid">
              <Example title="Tabs">
                <Tabs
                  label="Check-in views"
                  value={activeTab}
                  onValueChange={setActiveTab}
                  items={[
                    {
                      value: "summary",
                      label: "Summary",
                      content: (
                        <p>
                          Three sessions, one note, and a steady recovery trend.
                        </p>
                      ),
                    },
                    {
                      value: "activity",
                      label: "Activity",
                      content: (
                        <p>Strength on Monday, Wednesday, and Saturday.</p>
                      ),
                    },
                    {
                      value: "notes",
                      label: "Notes",
                      content: (
                        <p>
                          Evening walks helped make bedtime more consistent.
                        </p>
                      ),
                    },
                    {
                      value: "history",
                      label: "History",
                      content: (
                        <p>
                          Previous check-ins are available in the client record.
                        </p>
                      ),
                      disabled: true,
                    },
                  ]}
                />
              </Example>
              <Example title="Segmented control">
                <SegmentedControl
                  label="Check-in period"
                  value={activePeriod}
                  onValueChange={setActivePeriod}
                  options={[
                    { value: "week", label: "This week" },
                    { value: "month", label: "Month" },
                    { value: "quarter", label: "Quarter" },
                    { value: "year", label: "Year", disabled: true },
                  ]}
                />
                <div className="v8-live-value">
                  Showing: <strong>{activePeriod}</strong>
                </div>
              </Example>
              <Example title="Toggle and checkbox">
                <Toggle
                  label="Send a reminder"
                  checked={enabled}
                  onCheckedChange={setEnabled}
                  description="Remind Maya the morning before her review."
                />
                <Checkbox
                  label="Include coach note"
                  checked={checked}
                  onCheckedChange={setChecked}
                  description="Adds the note to the shared summary."
                />
                <Checkbox
                  label="Include progress chart"
                  checked={false}
                  onCheckedChange={() => undefined}
                />
                <Checkbox
                  label="Unavailable option"
                  checked={false}
                  onCheckedChange={() => undefined}
                  disabled
                />
                <Toggle
                  label="Automatic reminder off"
                  checked={false}
                  onCheckedChange={() => undefined}
                />
                <Toggle
                  label="Unavailable setting"
                  checked={false}
                  onCheckedChange={() => undefined}
                  disabled
                />
              </Example>
            </div>
          </section>

          <section className="v8-catalog-section" aria-labelledby="feedback">
            <SectionHeading
              id="feedback"
              title="Feedback"
              description="Status keeps meaning separate from the selected accent color."
            />
            <Example title="Status tones">
              <div className="v8-status-row">
                {(
                  ["neutral", "positive", "warning", "danger", "info"] as const
                ).map((tone) => (
                  <Status key={tone} tone={tone}>
                    {
                      {
                        neutral: "Scheduled",
                        positive: "Completed",
                        warning: "Needs review",
                        danger: "Missed",
                        info: "New note",
                      }[tone]
                    }
                  </Status>
                ))}
              </div>
            </Example>
            {menuMessage ? (
              <p className="v8-action-feedback" role="status">
                {menuMessage}
              </p>
            ) : null}
          </section>

          <section className="v8-catalog-section" aria-labelledby="overlays">
            <SectionHeading
              id="overlays"
              title="Overlays"
              description="Popover, tooltip, and modal examples stay within the active theme."
            />
            <Example title="Tooltip, menu, and dialog">
              <div className="v8-inline-controls">
                <Tooltip label="The weekly summary is ready to share.">
                  <Button variant="secondary">Hover or focus for detail</Button>
                </Tooltip>
                <DropdownMenu
                  label="More check-in actions"
                  items={[
                    {
                      id: "duplicate",
                      label: "Duplicate check-in",
                      onSelect: () =>
                        setMenuMessage("Check-in duplicated for Maya."),
                    },
                    {
                      id: "archive",
                      label: "Archive check-in",
                      onSelect: () => setMenuMessage("Check-in archived."),
                    },
                    { id: "delete", label: "Delete check-in", disabled: true },
                  ]}
                />
                <Button variant="primary" onClick={() => setModalOpen(true)}>
                  Open review dialog
                </Button>
                <Select
                  label="Review dialog size"
                  value={modalSize}
                  onValueChange={(size) =>
                    setModalSize(size as typeof modalSize)
                  }
                  options={[
                    { value: "compact", label: "Compact · 480px" },
                    { value: "standard", label: "Standard · 640px" },
                    { value: "wide", label: "Wide · 960px" },
                    { value: "full", label: "Full preview" },
                  ]}
                />
              </div>
            </Example>
            <Modal
              open={modalOpen}
              onOpenChange={setModalOpen}
              size={modalSize}
              title="Share weekly summary"
              description="Maya will see the completed sessions and your note."
              footer={
                <>
                  <Button
                    variant="secondary"
                    onClick={() => setModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => {
                      setModalOpen(false);
                      setMenuMessage("Weekly summary shared with Maya.");
                    }}
                  >
                    Share summary
                  </Button>
                </>
              }
            >
              <p className="v8-modal-copy">
                You can update the note later from the check-in history.
              </p>
              <div className="v8-modal-input-grid">
                <DatePicker
                  label="Dialog review date"
                  value={reviewDate}
                  onValueChange={setReviewDate}
                />
                <TimePicker
                  label="Dialog review time"
                  value={reviewTime}
                  onValueChange={setReviewTime}
                />
                <Select
                  label="Summary period"
                  defaultValue="week"
                  options={[
                    { value: "week", label: "This week" },
                    { value: "month", label: "This month" },
                    { value: "quarter", label: "This quarter" },
                  ]}
                />
              </div>
            </Modal>
          </section>

          <section className="v8-catalog-section" aria-labelledby="navigation">
            <SectionHeading
              id="navigation"
              title="Navigation"
              description="The selected destination remains clear without depending on color alone."
            />
            <div className="v8-example-grid">
              <Example title="Workspace navigation">
                <Navigation
                  label="Coaching workspace"
                  items={[
                    { id: "clients", label: "Clients" },
                    { id: "plans", label: "Plans" },
                    { id: "check-ins", label: "Check-ins" },
                    { id: "messages", label: "Messages" },
                    { id: "reports", label: "Reports", disabled: true },
                  ]}
                  activeId={activeNavigation}
                  onNavigate={setActiveNavigation}
                />
                <p className="v8-live-value">
                  Current section:{" "}
                  <strong>{activeNavigation.replace("-", " ")}</strong>
                </p>
              </Example>
              <Example
                title="Card surfaces"
                note="All card treatments and compact, default, and spacious padding."
              >
                <div className="v8-card-variants">
                  {(["default", "subtle", "raised"] as const).map((variant) => (
                    <div className="v8-card-variant" key={variant}>
                      <span>{variant}</span>
                      {(["sm", "md", "lg"] as const).map((size) => (
                        <Card variant={variant} size={size} key={size}>
                          <span>{size} padding</span>
                          <strong>Maya's next review</strong>
                        </Card>
                      ))}
                    </div>
                  ))}
                </div>
              </Example>
            </div>
          </section>

          <section className="v8-catalog-section" aria-labelledby="data">
            <SectionHeading
              id="data"
              title="Data display"
              description="Tables keep dense records readable and contained on narrow screens."
            />
            <Table
              caption="Maya Chen · recent check-ins"
              className="v8-checkin-table"
              regionLabel="Maya Chen recent check-ins table; scroll horizontally for additional columns"
            >
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Focus</th>
                  <th scope="col">Sessions</th>
                  <th scope="col">Status</th>
                  <th scope="col">Change</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">17 Oct 2026</th>
                  <td>Strength</td>
                  <td>3 of 3</td>
                  <td>
                    <Status tone="positive">Complete</Status>
                  </td>
                  <td>
                    <span className="v8-change-up">
                      <ArrowUpRight size={14} aria-hidden="true" /> 1 session
                    </span>
                  </td>
                </tr>
                <tr>
                  <th scope="row">10 Oct 2026</th>
                  <td>Strength</td>
                  <td>2 of 3</td>
                  <td>
                    <Status tone="warning">Reviewed</Status>
                  </td>
                  <td>
                    <span className="v8-change-down">
                      <ArrowDownRight size={14} aria-hidden="true" /> 35 min
                    </span>
                  </td>
                </tr>
              </tbody>
            </Table>
          </section>
          <footer className="v8-page-footer">
            VARI8 · Shared interface reference
          </footer>
        </main>
      </div>
    </ThemeScope>
  );
}
