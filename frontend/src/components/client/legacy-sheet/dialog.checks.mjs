import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(root, "../../..");
const require = createRequire(import.meta.url);
// CSS side-effect imports are dropped here, not registered as a require
// extension: a registered .css handler would shadow components.tsx when the
// import has no extension (vari8/components.css sits next to it).
const transpile = (module, filename) => {
  const source = readFileSync(filename, "utf8")
    .replace(/^import\s+["'][^"']+\.css["'];?\s*$/gm, "")
    .replace(/(["'])@\//g, (_, quote) => `${quote}${srcRoot}/`);
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

const { LegacySheetDialog } = require(path.join(root, "dialog.tsx"));

test("the legacy sheets dialog names the client it was opened for", () => {
  const markup = renderToStaticMarkup(
    React.createElement(LegacySheetDialog, {
      open: true,
      onOpenChange: () => {},
      clientName: "Amara Lewis",
    }),
  );
  assert.match(markup, /PRGRSS 2\.0 for Amara Lewis/);
});
