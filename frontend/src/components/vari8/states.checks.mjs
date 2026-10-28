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
    /(["'])@\/components\/vari8\/(components|date-utils|states)\1/g,
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

const {
  EmptyState,
  LoadingState,
  Skeleton,
  ErrorState,
} = require("./states.tsx");
const { Button, IconButton } = require("./components.tsx");

const render = (element) => renderToStaticMarkup(element);

const assertNamedInteractives = (html, scope) => {
  const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
  assert.ok(buttons.length > 0, `${scope}: expected at least one button`);
  for (const button of buttons) {
    const tag = button.match(/<button\b[^>]*>/)[0];
    const inner = button.replace(/<[^>]+>/g, "").trim();
    assert.ok(
      /aria-label=/.test(tag) || inner.length > 0,
      `${scope}: every button needs a visible label or aria-label`,
    );
  }
};

const assertDomFocusOrder = (html, scope) => {
  const tabindexes = html.match(/tabindex="(\d+)"/g) ?? [];
  for (const tab of tabindexes) {
    const value = Number(tab.match(/\d+/)[0]);
    assert.ok(
      value <= 0,
      `${scope}: tabindex ${value} breaks DOM focus order; contract requires DOM order`,
    );
  }
};

// R12: the three shared states exist and carry the right semantics.

const empty = render(
  React.createElement(EmptyState, {
    title: "No check-ins yet",
    description: "New check-ins will land here.",
    action: React.createElement(Button, null, "Create check-in"),
  }),
);
assert.match(
  empty,
  /role="region"|aria-labelledby=/,
  "EmptyState renders a named region",
);
assert.match(
  empty,
  /aria-labelledby="[^"]+"/,
  "EmptyState region is labelled by its title",
);
assert.match(empty, /No check-ins yet/, "EmptyState renders its title");
assert.match(
  empty,
  /New check-ins will land here\./,
  "EmptyState renders its description",
);
assertNamedInteractives(empty, "EmptyState");
assertDomFocusOrder(empty, "EmptyState");

const loading = render(
  React.createElement(LoadingState, { label: "Loading check-ins" }),
);
assert.match(
  loading,
  /role="status"/,
  "LoadingState announces politely via role=status",
);
assert.match(loading, /Loading check-ins/, "LoadingState renders its label");
assertDomFocusOrder(loading, "LoadingState");

const skeleton = render(React.createElement(Skeleton, { lines: 4 }));
assert.match(
  skeleton,
  /aria-hidden="true"/,
  "Skeleton is hidden from assistive tech",
);
assertDomFocusOrder(skeleton, "Skeleton");

const error = render(
  React.createElement(ErrorState, {
    title: "Check-ins could not be loaded",
    description: "Try again in a moment.",
    action: React.createElement(Button, null, "Retry"),
  }),
);
assert.match(
  error,
  /role="alert"/,
  "ErrorState announces assertively via role=alert",
);
assert.match(
  error,
  /Check-ins could not be loaded/,
  "ErrorState renders its title",
);
assertNamedInteractives(error, "ErrorState");
assertDomFocusOrder(error, "ErrorState");

// R13: the input contract. Interactive controls the primitives compose must
// keep accessible names and DOM focus order.

const contract = render(
  React.createElement(
    "div",
    null,
    React.createElement(Button, null, "Save"),
    React.createElement(IconButton, { label: "Open menu" }, "M"),
    React.createElement(Button, { variant: "soft" }, "Cancel"),
  ),
);
assertNamedInteractives(contract, "input contract");
assertDomFocusOrder(contract, "input contract");
assert.match(
  contract,
  /aria-label="Open menu"/,
  "IconButton exposes its required label",
);

// Reduced motion: the state styles must gate all animation behind
// prefers-reduced-motion. The token layer collapses durations to 1ms.

const css = readFileSync(path.join(root, "states.css"), "utf8");
assert.match(
  css,
  /@media \(prefers-reduced-motion: reduce\)/,
  "states.css must carry a prefers-reduced-motion block",
);
assert.ok(
  !/transition[^;]*\b\d{3,}ms/.test(css.replace(/var\(--v8-[^)]+\)/g, "TOKEN")),
  "states.css must not hardcode long transitions outside motion tokens",
);

console.log("states checks passed.");
