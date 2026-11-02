import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const transpile = (module, filename) => {
  const source = readFileSync(filename, "utf8").replace(
    /(["'])@\/components\/vari8\/(components|date-utils)\1/g,
    (_, quote, name) => `${quote}./${name}${quote}`,
  );
  const output = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};
require.extensions[".tsx"] = transpile;
require.extensions[".ts"] = transpile;

const ui = require(path.join(root, "components.tsx"));
const layouts = require(path.join(root, "layouts.tsx"));
const html = (element) => renderToStaticMarkup(element);
const element = (name, props) => React.createElement(ui[name], props);
const componentSource = readFileSync(path.join(root, "components.tsx"), "utf8");
const styles = readFileSync(path.join(root, "components.css"), "utf8");
const inputStyles = readFileSync(path.join(root, "inputs.css"), "utf8");
const inputComponents = readFileSync(path.join(root, "inputs.tsx"), "utf8");
const layoutStyles = readFileSync(path.join(root, "layouts.css"), "utf8");

function cssRule(selector) {
  const start = styles.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `expected CSS rule for ${selector}`);
  const end = styles.indexOf("}", start);
  return styles.slice(start, end);
}

function transitionProperties(selector) {
  const rule = cssRule(selector);
  const transition = rule.match(/transition:\s*([\s\S]*?);/)?.[1] ?? "";
  return [...transition.matchAll(/(?:^|,)\s*([a-z-]+)\s+var\(/g)].map(
    ([, property]) => property,
  );
}

{
  for (const name of [
    "PageHeader",
    "Toolbar",
    "FormGrid",
    "Section",
    "EditorHeader",
  ]) {
    assert.equal(typeof layouts[name], "function", `${name} is exported`);
  }
  const page = html(
    React.createElement(
      layouts.PageHeader,
      {
        title: "Clients",
        description: "Review your roster",
        actions: React.createElement(
          "button",
          { type: "button" },
          "Add client",
        ),
      },
      React.createElement(
        layouts.Toolbar,
        null,
        React.createElement("input", { "aria-label": "Search" }),
      ),
    ),
  );
  assert.match(page, /v8-page-header/);
  assert.match(page, /Clients/);
  assert.match(page, /Add client/);
  assert.match(page, /v8-toolbar/);
  assert.match(layoutStyles, /\.v8-form-grid/);
  assert.match(layoutStyles, /\.v8-editor-header/);
  assert.match(layoutStyles, /container-type: inline-size/);
  assert.match(
    layoutStyles,
    /data-columns="3"\]\s*\{\s*grid-template-columns: repeat\(3,/,
  );
  assert.match(layoutStyles, /@container \(max-width: 631px\)/);
  assert.match(layoutStyles, /@container \(max-width: 495px\)/);
  assert.match(
    layoutStyles,
    /grid-template-areas:[\s\S]*?"back back"[\s\S]*?"main status"/,
  );
  assert.match(
    layoutStyles,
    /@media \(max-width: 480px\)[\s\S]*?"back"[\s\S]*?"main"[\s\S]*?"status"/,
  );
}

assert.match(componentSource, /size\?: ControlSize/);
assert.match(componentSource, /nativeSize\?: number/);
assert.match(componentSource, /data-size=\{size\}/);
assert.match(
  componentSource,
  /size\?: "compact" \| "standard" \| "wide" \| "full"/,
);
assert.match(styles, /--v8-modal-width-compact/);
assert.match(styles, /--v8-modal-width-standard/);
assert.match(styles, /--v8-modal-width-wide/);
assert.doesNotMatch(cssRule(".v8-theme :where(.v8-modal)"), /display:\s*flex/);
assert.match(styles, /dialog\.v8-modal\[open\]\s*\{\s*display: flex/);
assert.match(
  styles,
  /data-size="compact"[\s\S]*?width: min\(var\(--v8-modal-width-compact\)/,
);
assert.match(
  styles,
  /data-size="standard"[\s\S]*?width: min\(var\(--v8-modal-width-standard\)/,
);
assert.match(
  styles,
  /data-size="wide"[\s\S]*?width: min\(var\(--v8-modal-width-wide\)/,
);
assert.match(
  styles,
  /\.v8-modal\[data-size="full"\][\s\S]*?width: calc\(100vw - 2rem\)/,
);
assert.match(inputComponents, /hourFormat\?: "12" \| "24"/);
assert.match(inputComponents, /const parsedValue = parseTimeValue\(value\)/);
assert.match(
  inputComponents,
  /\$\{formatHour\(parsedValue\.hour\)\}:\$\{parsedValue\.minute\}.*PM/,
);
assert.match(inputComponents, /value=\{hourDraft\}/);
assert.match(
  inputComponents,
  /aria-label=\{`\$\{label\}, \$\{formattedValue\}`\}/,
);
assert.match(inputComponents, /if \(readOnly && nextOpen\) return;/g);
assert.doesNotMatch(inputComponents, /disabled=\{disabled \|\| readOnly\}/);
assert.match(
  inputComponents,
  /<Select[\s\S]*?label="Period"[\s\S]*?options=\{/,
);
assert.match(inputComponents, /data-size=\{size\}/);
assert.match(inputStyles, /\(pointer: coarse\)/);
assert.match(
  inputStyles,
  /\.v8-theme :is\(\.v8-picker-trigger, \.v8-select\)\[data-size="lg"\][\s\S]*?--v8-field-control-height: var\(--v8-control-height-lg\)/,
);
assert.match(
  inputStyles,
  /@media \(max-width: 760px\), \(pointer: coarse\)[\s\S]*?height: 48px/,
);

{
  const buttonTransitions = transitionProperties(
    ".v8-theme :where(.v8-button)",
  );
  assert.ok(buttonTransitions.includes("border-color"));
  assert.ok(buttonTransitions.includes("box-shadow"));
  assert.ok(buttonTransitions.includes("transform"));
  assert.ok(!buttonTransitions.includes("background-color"));
  assert.ok(!buttonTransitions.includes("color"));
  assert.deepEqual(
    transitionProperties(".v8-theme :where(.v8-toggle__track > span)"),
    ["transform"],
  );
  assert.deepEqual(
    transitionProperties(".v8-theme :where(.v8-toggle__track)"),
    [],
  );
  assert.match(
    cssRule(".v8-theme :where(.v8-toggle__track > span)"),
    /background:\s*var\(--v8-border-control\)/,
  );
  assert.match(cssRule(".v8-theme :where(.v8-table)"), /width:\s*100%/);
  assert.match(
    cssRule('.v8-theme :where(.v8-card[data-treatment="spotlight"])'),
    /var\(--v8-accent-spotlight\)/,
  );
  assert.match(
    cssRule('.v8-theme :where(.v8-card[data-treatment="spotlight"])'),
    /var\(--v8-surface\)/,
  );
  assert.match(
    cssRule(".v8-theme :where(.v8-card)"),
    /background:\s*var\(--v8-surface\)/,
  );
  assert.match(
    cssRule('.v8-theme :where(.v8-card[data-treatment="spotlight"])'),
    /radial-gradient/,
  );
  assert.doesNotMatch(styles, /\.v8-card\[data-treatment="spotlight"\]::after/);
  assert.match(
    cssRule(".v8-theme :where(.v8-input, .v8-select)"),
    /background:\s*var\(--v8-field\)/,
  );
  assert.match(
    cssRule(".v8-theme :where(.v8-input, .v8-select)"),
    /border:\s*1px solid var\(--v8-field-border\)/,
  );
  assert.match(
    cssRule(".v8-theme :where(.v8-input, .v8-select)"),
    /block-size:\s*var\(--v8-field-height\)/,
  );
  assert.match(
    styles,
    /\.v8-theme\s+:where\(\.v8-input:hover[^}]*background:\s*var\(--v8-surface-interactive\)/s,
  );
  assert.match(styles, /\.v8-theme\s*\{[^}]*--v8-field-border:\s*transparent/s);
  assert.match(styles, /--v8-field-height:\s*var\(--v8-control-height-md\)/);
  const inputFieldRule = inputStyles.slice(
    inputStyles.indexOf(
      ".v8-theme .v8-picker-trigger,\n.v8-theme .v8-select {",
    ),
    inputStyles.indexOf(
      "}",
      inputStyles.indexOf(
        ".v8-theme .v8-picker-trigger,\n.v8-theme .v8-select {",
      ),
    ),
  );
  assert.match(inputFieldRule, /block-size:\s*var\(--v8-field-height/);
  assert.match(inputFieldRule, /border:\s*1px solid var\(--v8-field-border/);
  assert.match(
    inputStyles,
    /\.v8-theme \.v8-textarea \{[^}]*border:\s*1px solid var\(--v8-field-border/s,
  );
  assert.match(inputComponents, /alignItemWithTrigger=\{false\}/);
  assert.match(
    inputComponents,
    /collisionAvoidance=\{\{ side: "flip", align: "shift" \}\}/,
  );
  assert.match(componentSource, /alignItemWithTrigger=\{false\}/);
  assert.match(
    componentSource,
    /collisionAvoidance=\{\{ side: "flip", align: "shift" \}\}/,
  );
  assert.match(
    inputStyles,
    /max-height:\s*min\(320px, var\(--available-height, 55vh\)\)/,
  );
  assert.match(
    inputStyles,
    /@media \(max-width: 760px\)[\s\S]*?--v8-field-height:\s*var\(--v8-size-touch-min\)/,
  );
  assert.match(
    cssRule(".v8-theme :where(.v8-toggle__track > span)"),
    /var\(--v8-border-control\)/,
  );
  const navigationRule = cssRule(".v8-theme :where(.v8-navigation)");
  assert.match(navigationRule, /background:\s*var\(--v8-surface-navigation\)/);
  assert.doesNotMatch(navigationRule, /border:/);
  assert.match(
    cssRule('.v8-theme :where(.v8-navigation__item[aria-current="page"])'),
    /background:\s*var\(--v8-accent-subtle\)/,
  );
  assert.match(
    cssRule(".v8-theme :where(.v8-navigation__icon)"),
    /background:\s*transparent/,
  );
  assert.match(
    cssRule(".v8-theme :where(.v8-navigation__icon)"),
    /border:\s*0/,
  );
  assert.match(styles, /\.v8-theme\s+:where\(\.v8-table thead th\)/);
  assert.doesNotMatch(styles, /\.v8-table th\s*\{/);
}

{
  const markup = html(
    element("Button", {
      type: "submit",
      loading: true,
      "aria-pressed": true,
      children: "Save",
    }),
  );
  assert.match(markup, /type="submit"/);
  assert.match(markup, /disabled=""/);
  assert.match(markup, /aria-busy="true"/);
  assert.match(markup, /aria-pressed="true"/);
}

{
  const button = html(
    element("Button", {
      unstyled: true,
      variant: "primary",
      size: "lg",
      className: "legacy-button",
      children: "Legacy action",
    }),
  );
  assert.match(button, /class="legacy-button"/);
  assert.doesNotMatch(button, /data-variant|data-size|v8-button/);

  const iconButton = html(
    element("IconButton", {
      label: "Close",
      unstyled: true,
      size: "lg",
      className: "legacy-icon-button",
      children: "×",
    }),
  );
  assert.match(iconButton, /class="legacy-icon-button"/);
  assert.doesNotMatch(iconButton, /data-size|v8-icon-button/);
}

{
  const markup = html(
    element("IconButton", { label: "Close panel", children: "x" }),
  );
  assert.match(markup, /aria-label="Close panel"/);
}

{
  const plain = html(element("Card", { children: "Neutral content" }));
  const spotlight = html(
    element("Card", { treatment: "spotlight", children: "Featured content" }),
  );
  assert.match(plain, /data-treatment="plain"/);
  assert.match(spotlight, /data-treatment="spotlight"/);
}

{
  const markup = html(
    element("Input", {
      label: "Email",
      hint: "Work address",
      error: "Enter a valid email",
      id: "email",
      type: "email",
    }),
  );
  assert.match(markup, /<label[^>]*for="email"[^>]*>Email<\/label>/);
  assert.match(markup, /id="email"[^>]*aria-invalid="true"/);
  assert.match(markup, /aria-describedby="[^"]*"/);
  assert.match(markup, /id="email-error"/);
}

{
  const markup = html(
    element("Select", {
      label: "Plan",
      hint: "Choose plan",
      error: "Unavailable",
      id: "plan",
      name: "plan_choice",
      size: "lg",
      value: "b",
      onOpenChange: () => {},
      onValueChange: () => {},
      options: [
        { value: "a", label: "Starter", disabled: true },
        { value: "b", label: "Pro" },
      ],
      disabled: true,
    }),
  );
  assert.match(markup, /<label[^>]*for="plan"[^>]*>Plan<\/label>/);
  assert.match(
    markup,
    /<button[^>]*disabled=""[^>]*id="plan"[^>]*role="combobox"/,
  );
  assert.match(markup, /aria-describedby="plan-hint plan-error"/);
  assert.match(markup, /aria-invalid="true"/);
  assert.match(markup, /data-size="lg"/);
  assert.match(markup, /id="plan-hint">Choose plan<\/span>/);
  assert.match(markup, /id="plan-error" role="alert">Unavailable<\/span>/);
  assert.match(markup, /<span>Pro<\/span>/);
  assert.match(
    markup,
    /<input disabled=""[^>]*aria-hidden="true" name="plan_choice" value="b"/,
  );
  assert.doesNotMatch(markup, /<option(?:\s|>)/);
}

{
  const markup = html(
    element("Tabs", {
      label: "Account sections",
      value: "profile",
      onValueChange: () => {},
      items: [
        { value: "profile", label: "Profile", content: "Profile content" },
        {
          value: "billing",
          label: "Billing",
          disabled: true,
          content: "Billing content",
        },
      ],
    }),
  );
  assert.match(markup, /role="tablist"[^>]*aria-label="Account sections"/);
  assert.match(
    markup,
    /role="tab"[^>]*aria-selected="true"[^>]*aria-controls="[^"]+"/,
  );
  assert.match(markup, /role="tab"[^>]*disabled=""/);
  assert.match(markup, /role="tabpanel"[^>]*aria-labelledby="[^"]+"/);
}

{
  const markup = html(
    element("SegmentedControl", {
      label: "Time range",
      value: "week",
      onValueChange: () => {},
      options: [
        { value: "week", label: "Week" },
        { value: "month", label: "Month", disabled: true },
      ],
    }),
  );
  assert.match(markup, /role="radiogroup"[^>]*aria-label="Time range"/);
  assert.match(markup, /type="radio"[^>]*checked=""/);
  assert.match(markup, /type="radio"[^>]*disabled=""/);
}

{
  const markup = html(
    element("Toggle", {
      label: "Email updates",
      checked: true,
      onCheckedChange: () => {},
      description: "Weekly summary",
      disabled: true,
    }),
  );
  assert.match(markup, /role="switch"[^>]*disabled=""[^>]*aria-checked="true"/);
  assert.match(markup, /Weekly summary/);
  assert.match(markup, /aria-describedby="[^"]+"/);
}

{
  const markup = html(
    element("Checkbox", {
      label: "Remember me",
      checked: true,
      onCheckedChange: () => {},
      description: "On this device",
    }),
  );
  assert.match(markup, /type="checkbox"[^>]*checked=""/);
  assert.match(markup, /Remember me/);
  assert.match(markup, /aria-describedby="[^"]+"/);
}

{
  const markup = html(
    element("Checkbox", {
      id: "activity-category",
      label: "Activity",
      checked: false,
      indeterminate: true,
      onCheckedChange: () => {},
      ariaLabel: "Select all activity measures shown",
    }),
  );
  assert.match(markup, /id="activity-category"/);
  assert.match(markup, /aria-checked="mixed"/);
  assert.match(markup, /aria-label="Select all activity measures shown"/);
  assert.match(
    componentSource,
    /controlRef\.current\.indeterminate = indeterminate/,
  );
}

{
  const markup = html(
    element("Modal", {
      open: true,
      onOpenChange: () => {},
      title: "Confirm changes",
      description: "Review before saving",
      children: "Dialog body",
      footer: "Actions",
      size: "wide",
    }),
  );
  assert.match(markup, /<dialog[^>]*aria-labelledby="[^"]+"/);
  assert.match(markup, /data-size="wide"/);
  assert.match(markup, /aria-describedby="[^"]+"/);
  assert.match(markup, /Confirm changes/);
  assert.match(markup, /Actions/);
}

{
  const markup = html(
    element("Tooltip", {
      label: "More details",
      children: React.createElement("button", { type: "button" }, "Details"),
    }),
  );
  const tooltipId = markup.match(/id="([^"]+)"[^>]*role="tooltip"/)?.[1];
  assert.ok(tooltipId, "tooltip exposes a role=tooltip description");
  assert.ok(
    markup.includes(`aria-describedby="${tooltipId}"`),
    "focusable trigger references its tooltip",
  );
}

{
  const markup = html(
    element("Navigation", {
      label: "Workspace",
      activeId: "clients",
      onNavigate: () => {},
      items: [
        {
          id: "clients",
          label: "Clients",
          icon: React.createElement("svg", { "data-icon": "clients" }),
        },
        { id: "reports", label: "Reports", disabled: true },
      ],
    }),
  );
  assert.match(markup, /<nav[^>]*aria-label="Workspace"/);
  assert.match(markup, /aria-current="page"/);
  assert.match(markup, /<span class="v8-navigation__icon" aria-hidden="true">/);
  assert.match(markup, /<span class="v8-navigation__label">Clients<\/span>/);
  assert.match(markup, /disabled=""/);
}

{
  const markup = html(
    element("Table", {
      caption: "Recent activity",
      children: React.createElement(
        "thead",
        null,
        React.createElement(
          "tr",
          null,
          React.createElement("th", { scope: "col" }, "Date"),
        ),
      ),
    }),
  );
  assert.match(markup, /<caption>Recent activity<\/caption>/);
  assert.match(markup, /<th scope="col">Date<\/th>/);
}

{
  const markup = html(
    element("Status", { tone: "warning", children: "Needs review" }),
  );
  assert.match(markup, /role="status"/);
  assert.match(markup, /data-tone="warning"/);
}

{
  const markup = html(
    element("DropdownMenu", {
      label: "Account actions",
      items: [
        { id: "edit", label: "Edit" },
        { id: "delete", label: "Delete", disabled: true },
      ],
    }),
  );
  assert.match(markup, /aria-haspopup="menu"/);
  assert.match(markup, /aria-controls="[^"]+"/);
  assert.match(markup, /role="menuitem"/);
  assert.match(markup, /role="menuitem"[^>]*disabled=""/);
}

{
  const inputs = require(path.join(root, "inputs.tsx"));
  const searchableOptions = [
    { value: "strength", label: "Strength training" },
    { value: "mobility", label: "Mobility" },
  ];
  const renderSearchable = (props) =>
    html(React.createElement(inputs.SearchableSelect, props));
  const inputTags = (markup) =>
    [...markup.matchAll(/<input[^>]*>/g)].map((match) => match[0]);

  const named = renderSearchable({
    label: "Session",
    name: "qa-search",
    value: "strength",
    onValueChange: () => {},
    options: searchableOptions,
  });
  const serialized = inputTags(named).find((tag) =>
    tag.includes('name="qa-search"'),
  );
  assert.ok(
    serialized,
    "named SearchableSelect renders a serialized hidden input",
  );
  assert.match(serialized, /aria-hidden="true"/);
  assert.match(
    serialized,
    /value="strength"/,
    "serialized input carries the option value, not the visible label",
  );
  const visible = inputTags(named).find((tag) =>
    tag.includes("v8-searchable-input"),
  );
  assert.ok(visible, "renders the visible combobox input");
  assert.doesNotMatch(
    visible,
    /\sname=/,
    "visible input must not submit the label/query text",
  );

  const disabledNamed = renderSearchable({
    label: "Session",
    name: "qa-search",
    value: "strength",
    onValueChange: () => {},
    options: searchableOptions,
    disabled: true,
  });
  const disabledSerialized = inputTags(disabledNamed).find((tag) =>
    tag.includes('name="qa-search"'),
  );
  assert.ok(
    disabledSerialized,
    "disabled named control still renders its serialized input",
  );
  assert.match(
    disabledSerialized,
    /disabled=""/,
    "disabled named control disables the serialized input",
  );

  const readOnlyNamed = renderSearchable({
    label: "Session",
    name: "qa-search",
    value: "strength",
    onValueChange: () => {},
    options: searchableOptions,
    readOnly: true,
  });
  const readOnlySerialized = inputTags(readOnlyNamed).find((tag) =>
    tag.includes('name="qa-search"'),
  );
  assert.ok(
    readOnlySerialized,
    "readOnly named control keeps its serialized input",
  );
  assert.match(readOnlySerialized, /value="strength"/);
  assert.doesNotMatch(readOnlySerialized, /disabled=/);

  const requiredEmpty = renderSearchable({
    label: "Session",
    name: "qa-search",
    value: "",
    onValueChange: () => {},
    options: searchableOptions,
    required: true,
  });
  const requiredSerialized = inputTags(requiredEmpty).find((tag) =>
    tag.includes('name="qa-search"'),
  );
  assert.ok(
    requiredSerialized,
    "required empty named control renders its serialized input",
  );
  assert.match(
    requiredSerialized,
    /required=""/,
    "required named control keeps required validation on the serialized input",
  );
}

console.log("VARI8 component semantic checks passed.");
