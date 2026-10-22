"use client";

import type { ReactNode } from "react";
import {
  Button,
  Card,
  Checkbox,
  type ControlSize,
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
} from "./components";
import { InputShowcase } from "./input-showcase";
import {
  DatePicker,
  DateRangePicker,
  DateTimePicker,
  MonthPicker,
  MultiSelect,
  SearchableSelect,
  TextArea,
  TimePicker,
  WeekPicker,
} from "./inputs";
import {
  EditorHeader,
  FormGrid,
  PageHeader,
  Section,
  Toolbar,
} from "./layouts";
import { Vari8Playground } from "./playground";
import {
  CoachingWorkspaceSample,
  LayoutShowcase,
} from "./playground-compositions";
import { ThemeScope } from "./theme";
import "./matrix.css";

export type MatrixSection =
  | "buttons"
  | "fields"
  | "choices"
  | "feedback"
  | "overlays"
  | "navigation"
  | "data";

export const matrixSections: MatrixSection[] = [
  "buttons",
  "fields",
  "choices",
  "feedback",
  "overlays",
  "navigation",
  "data",
];

export type MatrixState = "default" | "focus" | "disabled" | "error";
export type MatrixMode = "light" | "dark";
export const matrixModes: MatrixMode[] = ["light", "dark"];

type CellRenderContext = { size: ControlSize; state: MatrixState };

type MatrixSpec = {
  /** Stable cell id prefix, also used in the geometry snapshot. */
  id: string;
  /** Exported symbol from src/components/vari8/ mounted by this cell. */
  exportName: string;
  section: MatrixSection;
  /** Sizes the component API supports; defaults to a single md cell. */
  sizes?: ControlSize[];
  /** States the component API supports; defaults to a single default cell. */
  states?: MatrixState[];
  render: (context: CellRenderContext) => ReactNode;
};

const controlSizes: ControlSize[] = ["sm", "md", "lg"];
const fieldStates: MatrixState[] = ["default", "focus", "disabled", "error"];
const buttonStates: MatrixState[] = ["default", "focus", "disabled"];

const noop = () => {};
const selectOptions = [
  { value: "alpha", label: "Alpha" },
  { value: "beta", label: "Beta" },
];

const fieldProps = (state: MatrixState) => ({
  error: state === "error" ? "Enter a valid value" : undefined,
  hint: "Sample hint",
  disabled: state === "disabled",
});

export const matrixSpecs: MatrixSpec[] = [
  {
    id: "button",
    exportName: "Button",
    section: "buttons",
    sizes: controlSizes,
    states: buttonStates,
    render: ({ size, state }) => (
      <Button size={size} variant="primary" disabled={state === "disabled"}>
        Save changes
      </Button>
    ),
  },
  {
    id: "icon-button",
    exportName: "IconButton",
    section: "buttons",
    sizes: controlSizes,
    states: buttonStates,
    render: ({ size, state }) => (
      <IconButton label="Add entry" size={size} disabled={state === "disabled"}>
        +
      </IconButton>
    ),
  },
  {
    id: "input",
    exportName: "Input",
    section: "fields",
    sizes: controlSizes,
    states: fieldStates,
    render: ({ size, state }) => (
      <Input
        label="Display name"
        size={size}
        defaultValue="Sample value"
        {...fieldProps(state)}
      />
    ),
  },
  {
    id: "text-area",
    exportName: "TextArea",
    section: "fields",
    sizes: controlSizes,
    states: fieldStates,
    render: ({ size, state }) => (
      <TextArea
        label="Session notes"
        size={size}
        defaultValue="Sample notes"
        {...fieldProps(state)}
      />
    ),
  },
  {
    id: "select",
    exportName: "Select",
    section: "fields",
    sizes: controlSizes,
    states: fieldStates,
    render: ({ size, state }) => (
      <Select
        label="Plan"
        size={size}
        options={selectOptions}
        value="alpha"
        onValueChange={noop}
        {...fieldProps(state)}
      />
    ),
  },
  {
    id: "searchable-select",
    exportName: "SearchableSelect",
    section: "fields",
    sizes: controlSizes,
    states: fieldStates,
    render: ({ size, state }) => (
      <SearchableSelect
        label="Exercise"
        size={size}
        options={selectOptions}
        value="alpha"
        onValueChange={noop}
        {...fieldProps(state)}
      />
    ),
  },
  {
    id: "multi-select",
    exportName: "MultiSelect",
    section: "fields",
    sizes: controlSizes,
    states: fieldStates,
    render: ({ size, state }) => (
      <MultiSelect
        label="Tags"
        size={size}
        options={selectOptions}
        value={["alpha"]}
        onValueChange={noop}
        {...fieldProps(state)}
      />
    ),
  },
  {
    id: "date-picker",
    exportName: "DatePicker",
    section: "fields",
    sizes: controlSizes,
    states: fieldStates,
    render: ({ size, state }) => (
      <DatePicker
        label="Start date"
        size={size}
        value="2026-01-15"
        onValueChange={noop}
        {...fieldProps(state)}
      />
    ),
  },
  {
    id: "time-picker",
    exportName: "TimePicker",
    section: "fields",
    sizes: controlSizes,
    states: fieldStates,
    render: ({ size, state }) => (
      <TimePicker
        label="Start time"
        size={size}
        value="09:30"
        onValueChange={noop}
        {...fieldProps(state)}
      />
    ),
  },
  {
    id: "date-range-picker",
    exportName: "DateRangePicker",
    section: "fields",
    sizes: controlSizes,
    states: fieldStates,
    render: ({ size, state }) => (
      <DateRangePicker
        label="Block"
        size={size}
        start="2026-01-05"
        end="2026-01-19"
        onStartChange={noop}
        onEndChange={noop}
        {...fieldProps(state)}
      />
    ),
  },
  {
    id: "date-time-picker",
    exportName: "DateTimePicker",
    section: "fields",
    sizes: controlSizes,
    states: fieldStates,
    render: ({ size, state }) => (
      <DateTimePicker
        label="Check in"
        size={size}
        date="2026-01-15"
        time="09:30"
        onDateChange={noop}
        onTimeChange={noop}
        {...fieldProps(state)}
      />
    ),
  },
  {
    id: "month-picker",
    exportName: "MonthPicker",
    section: "fields",
    sizes: controlSizes,
    states: fieldStates,
    render: ({ size, state }) => (
      <MonthPicker
        label="Block month"
        size={size}
        value="2026-01"
        onValueChange={noop}
        {...fieldProps(state)}
      />
    ),
  },
  {
    id: "week-picker",
    exportName: "WeekPicker",
    section: "fields",
    sizes: controlSizes,
    states: fieldStates,
    render: ({ size, state }) => (
      <WeekPicker
        label="Block week"
        size={size}
        value="2026-W03"
        onValueChange={noop}
        {...fieldProps(state)}
      />
    ),
  },
  {
    id: "tabs",
    exportName: "Tabs",
    section: "choices",
    render: () => (
      <Tabs
        label="Sample tabs"
        value="one"
        onValueChange={noop}
        items={[
          { value: "one", label: "First", content: "First panel" },
          { value: "two", label: "Second", content: "Second panel" },
          {
            value: "three",
            label: "Disabled",
            content: "Disabled panel",
            disabled: true,
          },
        ]}
      />
    ),
  },
  {
    id: "segmented-control",
    exportName: "SegmentedControl",
    section: "choices",
    render: () => (
      <SegmentedControl
        label="View"
        value="week"
        onValueChange={noop}
        options={[
          { value: "day", label: "Day" },
          { value: "week", label: "Week" },
          { value: "month", label: "Month", disabled: true },
        ]}
      />
    ),
  },
  {
    id: "toggle",
    exportName: "Toggle",
    section: "choices",
    states: ["default", "focus", "disabled"],
    render: ({ state }) => (
      <Toggle
        label="Email updates"
        description="Sample description"
        checked
        onCheckedChange={noop}
        disabled={state === "disabled"}
      />
    ),
  },
  {
    id: "checkbox",
    exportName: "Checkbox",
    section: "choices",
    states: ["default", "focus", "disabled"],
    render: ({ state }) => (
      <Checkbox
        label="Include warm up"
        checked
        onCheckedChange={noop}
        disabled={state === "disabled"}
      />
    ),
  },
  {
    id: "status",
    exportName: "Status",
    section: "feedback",
    render: () => (
      <span className="v8-matrix-inline">
        <Status tone="neutral">Neutral</Status>
        <Status tone="positive">Positive</Status>
        <Status tone="warning">Warning</Status>
        <Status tone="danger">Danger</Status>
        <Status tone="info">Info</Status>
      </span>
    ),
  },
  {
    id: "card",
    exportName: "Card",
    section: "feedback",
    sizes: controlSizes,
    render: ({ size }) => (
      <Card size={size} variant="default">
        Card content
      </Card>
    ),
  },
  {
    id: "tooltip",
    exportName: "Tooltip",
    section: "overlays",
    render: () => (
      <Tooltip label="Sample tooltip">
        <Button>Hover for tooltip</Button>
      </Tooltip>
    ),
  },
  {
    id: "modal",
    exportName: "Modal",
    section: "overlays",
    render: () => (
      <Modal open={false} onOpenChange={noop} title="Sample modal">
        Modal body
      </Modal>
    ),
  },
  {
    id: "dropdown-menu",
    exportName: "DropdownMenu",
    section: "overlays",
    render: () => (
      <DropdownMenu
        label="Actions"
        items={[
          { id: "edit", label: "Edit", onSelect: noop },
          { id: "archive", label: "Archive", onSelect: noop },
          { id: "delete", label: "Delete", disabled: true },
        ]}
      />
    ),
  },
  {
    id: "dropdown-menu-clip",
    exportName: "DropdownMenu",
    section: "overlays",
    render: () => (
      <div className="v8-matrix-clip">
        <DropdownMenu
          label="Clipped actions"
          items={[
            { id: "edit", label: "Edit", onSelect: noop },
            { id: "archive", label: "Archive", onSelect: noop },
            { id: "delete", label: "Delete", disabled: true },
          ]}
        />
      </div>
    ),
  },
  {
    id: "navigation",
    exportName: "Navigation",
    section: "navigation",
    render: () => (
      <Navigation
        label="Sections"
        activeId="overview"
        onNavigate={noop}
        items={[
          { id: "overview", label: "Overview" },
          { id: "sessions", label: "Sessions" },
          { id: "reports", label: "Reports", disabled: true },
        ]}
      />
    ),
  },
  {
    id: "editor-header",
    exportName: "EditorHeader",
    section: "navigation",
    render: () => (
      <EditorHeader
        title="Sample editor"
        context="Editor"
        onBack={noop}
        status="Draft"
      />
    ),
  },
  {
    id: "table",
    exportName: "Table",
    section: "data",
    render: () => (
      <Table caption="Sample table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Alpha</td>
            <td>1</td>
          </tr>
          <tr>
            <td>Beta</td>
            <td>2</td>
          </tr>
        </tbody>
      </Table>
    ),
  },
  {
    id: "page-header",
    exportName: "PageHeader",
    section: "data",
    render: () => (
      <PageHeader title="Sample page" description="Sample description" />
    ),
  },
  {
    id: "toolbar",
    exportName: "Toolbar",
    section: "data",
    render: () => (
      <Toolbar>
        <Button size="sm">First</Button>
        <Button size="sm" variant="ghost">
          Second
        </Button>
      </Toolbar>
    ),
  },
  {
    id: "form-grid",
    exportName: "FormGrid",
    section: "data",
    render: () => (
      <FormGrid columns={2}>
        <Input label="First" defaultValue="A" />
        <Input label="Second" defaultValue="B" />
      </FormGrid>
    ),
  },
  {
    id: "section",
    exportName: "Section",
    section: "data",
    render: () => (
      <Section title="Sample section" description="Sample description">
        Section body
      </Section>
    ),
  },
  {
    id: "theme-scope",
    exportName: "ThemeScope",
    section: "data",
    render: () => (
      <ThemeScope mode="light" accent="#2f6f4f">
        Scoped sample
      </ThemeScope>
    ),
  },
  {
    id: "input-showcase",
    exportName: "InputShowcase",
    section: "fields",
    render: () => <InputShowcase />,
  },
  {
    id: "coaching-workspace-sample",
    exportName: "CoachingWorkspaceSample",
    section: "data",
    render: () => <CoachingWorkspaceSample />,
  },
  {
    id: "layout-showcase",
    exportName: "LayoutShowcase",
    section: "data",
    render: () => <LayoutShowcase />,
  },
  {
    id: "vari8-playground",
    exportName: "Vari8Playground",
    section: "data",
    render: () => <Vari8Playground />,
  },
];

const matrixExportCount = new Set(matrixSpecs.map((spec) => spec.exportName))
  .size;

function matrixCellId(
  spec: MatrixSpec,
  size: ControlSize,
  state: MatrixState,
  mode: MatrixMode,
) {
  return `${spec.id}/${size}/${state}/${mode}`;
}

function MatrixCell({
  spec,
  size,
  state,
  mode,
}: CellRenderContext & { spec: MatrixSpec; mode: MatrixMode }) {
  return (
    <div
      className="v8-matrix-cell"
      data-v8-cell={matrixCellId(spec, size, state, mode)}
      data-v8-state={state}
      data-preview-state={state === "focus" ? "focus" : undefined}
    >
      <span className="v8-matrix-cell__label">
        {spec.exportName} {size} {state}
      </span>
      <div className="v8-matrix-cell__body">{spec.render({ size, state })}</div>
    </div>
  );
}

function SectionCells({ spec, mode }: { spec: MatrixSpec; mode: MatrixMode }) {
  const sizes = spec.sizes ?? ["md"];
  const states = spec.states ?? ["default"];
  return states.flatMap((state) =>
    sizes.map((size) => (
      <MatrixCell
        key={matrixCellId(spec, size, state, mode)}
        spec={spec}
        size={size}
        state={state}
        mode={mode}
      />
    )),
  );
}

export function Vari8Matrix({
  accent = "#BEB2FC",
  exportTotal,
}: {
  accent?: string;
  exportTotal: number;
}) {
  const coverage =
    exportTotal === 0 ? 0 : Math.round((matrixExportCount / exportTotal) * 100);
  return (
    <div className="v8-matrix">
      <p className="v8-matrix-coverage">
        Vari8 exports mounted: {matrixExportCount} of {exportTotal} ({coverage}
        %)
      </p>
      {matrixSections.map((section) => {
        const specs = matrixSpecs.filter((spec) => spec.section === section);
        if (specs.length === 0) return null;
        return (
          <section className="v8-matrix-section" key={section}>
            <h2 className="v8-matrix-section__title">{section}</h2>
            <div className="v8-matrix-modes">
              {matrixModes.map((mode) => (
                <ThemeScope
                  key={mode}
                  mode={mode}
                  accent={accent}
                  className="v8-matrix-mode"
                >
                  <h3 className="v8-matrix-mode__title">{mode}</h3>
                  {specs.map((spec) => (
                    <SectionCells
                      key={`${mode}:${spec.id}`}
                      spec={spec}
                      mode={mode}
                    />
                  ))}
                </ThemeScope>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
