#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";
import ts from "typescript";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const scanRoot = "src";
const excludedScanPrefixes = ["src/components/vari8/", "src/styles/"];
const cssTargets = new Set([
  ".v8-button",
  ".v8-icon-button",
  ".v8-input",
  ".v8-select",
  ".v8-textarea",
  ".v8-picker-trigger",
  ".v8-tabs",
  ".v8-tabs__list",
  ".v8-tabs__tab",
  ".v8-tabs__panel",
  ".v8-segmented",
  ".v8-segmented__option",
  ".v8-field",
  ".v8-field__label",
  ".v8-field__hint",
  ".v8-field__error",
  ".v8-card",
  ".v8-table",
  ".v8-table-scroll",
  ".v8-select-popup",
  ".v8-select-option",
  ".v8-select__icon",
  ".v8-date-popup",
  ".v8-time-popup",
  ".v8-picker-popup",
  ".v8-picker-trigger",
  ".v8-dropdown__item",
  ".v8-modal",
  ".v8-modal__header",
  ".v8-modal__body",
  ".v8-modal__footer",
  ".v8-toggle",
  ".v8-checkbox",
  ".v8-navigation__item",
  ".v8-status",
  ".v8-radio-choice",
  ".v8-range",
]);
const visualProperties = [
  /^height$/,
  /^(?:min|max)-height$/,
  /^(?:min|max)-block-size$/,
  /^block-size$/,
  /^(?:min|max)-inline-size$/,
  /^padding(?:-.+)?$/,
  /^border(?:-.+)?$/,
  /^border-radius$/,
  /^background(?:-.+)?$/,
  /^font(?:-.+)?$/,
  /^color$/,
  /^(?:box|text)-shadow$/,
  /^outline(?:-.+)?$/,
  /^(?:line-height|letter-spacing)$/,
];
const duplicatePickerBasenames = new Set([
  "date-fields",
  "date-picker",
  "time-picker",
  "date-time-fields",
  "date-time-picker",
]);

const rawControlTags = new Set(["button", "input", "select", "textarea"]);
const rawLengthPattern =
  /-?\d*\.?\d+(?:px|pt|pc|em|rem|ch|ex|cap|ic|lh|rlh|vw|vh|vi|vb|vmin|vmax|svw|svh|lvw|lvh|dvw|dvh|cqw|cqh|cqi|cqb|cqmin|cqmax)\b/gi;
const rawColorPattern =
  /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\s*\(/i;
const emailPattern = /\b[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g;
const datePattern =
  /\b\d{4}[-/.]\d{2}[-/.]\d{2}\b|\b\d{2}[-/.]\d{2}[-/.]\d{4}\b/g;
const phonePattern =
  /\+?\(?\d{1,4}\)?[ .-]\d{2,4}[ .-]\d{3,4}(?:[ .-]\d{3,5})?/g;
const hostPattern = /\b(?:https?|wss?):\/\/([A-Za-z0-9.-]+)(?::\d+)?/g;
const allowedHostPattern = /(^|\.)example\.[a-z]{2,}$/i;
const personFieldPattern =
  /["']?([A-Za-z_$][\w$]*)["']?\s*[:=]\s*(["'`])([^"'`]+)\2/g;
const personFieldNamePattern =
  /name|client|member|sender|author|coach|athlete|person|staff|owner|by/i;
const capitalizedWordPattern = /[A-Z][a-z]{2,}/;
const binaryExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".woff",
  ".woff2",
  ".mp4",
]);
const reconFilePattern = /^R[1-4]-/;
const baselineRules = new Set([
  "shared-override",
  "raw-control",
  "raw-value",
  "layout-prop",
]);
const baselineRefCandidates = ["origin/FRONTEND", "great-tracker/FRONTEND"];
const piiFilePrefixes = ["src/components/client/demo/"];
const piiFixturePattern = /^src\/components\/client\/legacy-sheet\/fixture/;
const binaryScopePrefixes = ["public/", "src/components/client/"];
const namesAllowlistPath = path.join(
  root,
  "src/components/client/demo/names.allow.json",
);
const baselineFilePath = path.join(root, "scripts/ui-baseline.json");
const baselineRaiseReason = process.env.V8_BASELINE_RAISE;
const designRulesPath = path.join(root, "docs/DESIGN-RULES.md");
const designRuleStatuses = new Set([
  "live in check",
  "live manual (reviewer runs)",
  "planned",
]);

function filesUnder(directory, extensions) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(absolute, extensions);
    return extensions.has(path.extname(entry.name)) ? [absolute] : [];
  });
}

function toRepoPath(filename) {
  return path.relative(root, filename).split(path.sep).join("/");
}

function isScannedPath(repoPath) {
  return (
    repoPath.startsWith(`${scanRoot}/`) &&
    !excludedScanPrefixes.some((prefix) => repoPath.startsWith(prefix))
  );
}

function matchingCssSelectors(selector, additionalTargets = new Set()) {
  const matched = new Set();
  selectorParser((selectors) => {
    selectors.each((selectorNode) => {
      selectorNode.walkClasses((classNode) => {
        let ancestor = classNode.parent;
        while (ancestor && ancestor !== selectorNode) {
          if (ancestor.type === "pseudo" && ancestor.value === ":not") return;
          ancestor = ancestor.parent;
        }
        const siblings = classNode.parent?.nodes ?? [];
        const classIndex = siblings.indexOf(classNode);
        if (
          siblings
            .slice(classIndex + 1)
            .some((node) => node.type === "combinator")
        )
          return;
        if (
          cssTargets.has(`.${classNode.value}`) ||
          additionalTargets.has(`.${classNode.value}`)
        ) {
          matched.add(selectorNode.toString());
        }
      });
    });
  }).processSync(selector);
  return [...matched];
}

function isVisualOverride(property) {
  const normalized = property.toLowerCase();
  return visualProperties.some((pattern) => pattern.test(normalized));
}

function isRawValue(value) {
  if (rawColorPattern.test(value)) return true;
  for (const match of value.matchAll(rawLengthPattern)) {
    if (Number.parseFloat(match[0]) !== 0) return true;
  }
  return false;
}

export function scanCssSource(
  source,
  filename = "fixture.css",
  additionalTargets = new Set(),
) {
  const findings = [];
  const ast = postcss.parse(source, { from: filename });
  ast.walkRules((rule) => {
    const matchedSelectors = matchingCssSelectors(
      rule.selector,
      additionalTargets,
    );
    if (!matchedSelectors.length) return;
    for (const matchedSelector of matchedSelectors) {
      rule.walkDecls((decl) => {
        if (!isVisualOverride(decl.prop)) return;
        findings.push({
          rule: "shared-override",
          file: filename,
          line: decl.source?.start?.line ?? rule.source?.start?.line ?? 1,
          property: decl.prop,
          selector: matchedSelector,
          value: decl.value,
        });
      });
    }
  });
  return findings;
}

export function scanRawValues(source, filename = "fixture.css") {
  const findings = [];
  const ast = postcss.parse(source, { from: filename });
  ast.walkRules((rule) => {
    rule.walkDecls((decl) => {
      if (!isVisualOverride(decl.prop) || !isRawValue(decl.value)) return;
      findings.push({
        rule: "raw-value",
        file: filename,
        line: decl.source?.start?.line ?? rule.source?.start?.line ?? 1,
        property: decl.prop,
        selector: rule.selector,
        value: decl.value,
      });
    });
  });
  return findings;
}

const directSharedTargets = new Map([
  ["Button", [".v8-button"]],
  ["IconButton", [".v8-icon-button"]],
  ["Input", [".v8-input"]],
  ["Select", [".v8-select"]],
  ["Card", [".v8-card"]],
  ["Tabs", [".v8-tabs"]],
  ["SegmentedControl", [".v8-segmented"]],
  ["Toggle", [".v8-toggle"]],
  ["Checkbox", [".v8-checkbox"]],
  ["Status", [".v8-status"]],
  ["Table", [".v8-table"]],
  ["TextArea", [".v8-textarea"]],
  ["SearchableSelect", [".v8-searchable-input"]],
  ["MultiSelect", [".v8-searchable-input"]],
  ["DatePicker", [".v8-picker-trigger"]],
  ["TimePicker", [".v8-picker-trigger"]],
  ["DateTimePicker", [".v8-picker-trigger"]],
  ["DateRangePicker", [".v8-picker-trigger"]],
  ["MonthPicker", [".v8-picker-trigger"]],
  ["WeekPicker", [".v8-picker-trigger"]],
]);

const adapterTargets = new Map([
  ["Button", [".v8-button"]],
  ["IconButton", [".v8-icon-button"]],
  ["SearchBox", [".v8-input"]],
  ["Select", [".v8-select"]],
  ["Toggle", [".v8-toggle"]],
  ["Card", [".v8-card"]],
  ["Surface", [".v8-card"]],
  ["Segmented", [".v8-segmented"]],
  ["SelectControl", [".v8-select"]],
  ["TextInput", [".v8-input"]],
  ["CheckboxControl", [".v8-checkbox"]],
  ["SwitchControl", [".v8-toggle"]],
  ["Tabs", [".v8-segmented"]],
  ["Widget", [".v8-card"]],
]);

function moduleKindFor(moduleName, filename) {
  const normalized = moduleName.replaceAll("\\", "/");
  if (/(?:^|\/)vari8\/components(?:\.tsx?)?$/.test(normalized))
    return "shared-components";
  if (/(?:^|\/)vari8\/inputs(?:\.tsx?)?$/.test(normalized))
    return "shared-inputs";
  if (/(?:^|\/)coach\/ui(?:\.tsx?)?$/.test(normalized)) return "coach-adapter";
  if (/(?:^|\/)ethereal\/ui(?:\.tsx?)?$/.test(normalized))
    return "ethereal-adapter";
  if (normalized.startsWith(".")) {
    const resolved = path
      .relative(root, path.resolve(root, path.dirname(filename), normalized))
      .split(path.sep)
      .join("/")
      .replace(/\.tsx?$/, "");
    if (resolved === "src/components/coach/ui") return "coach-adapter";
    if (resolved === "src/components/ethereal/ui") return "ethereal-adapter";
  }
  return undefined;
}

function staticClassTokens(expression) {
  if (!expression) return [];
  if (
    ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression)
  )
    return expression.text.split(/\s+/).filter(Boolean);
  if (!ts.isTemplateExpression(expression)) {
    const tokens = [];
    const visit = (node) => {
      if (
        ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node)
      ) {
        tokens.push(...node.text.split(/\s+/).filter(Boolean));
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(expression);
    return tokens;
  }
  const parts = [expression.head.text];
  const tokens = [];
  for (const span of expression.templateSpans) {
    const visit = (node) => {
      if (
        ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node)
      ) {
        tokens.push(...node.text.split(/\s+/).filter(Boolean));
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(span.expression);
    parts.push(span.literal.text);
  }
  return [...parts.join(" ").split(/\s+/).filter(Boolean), ...tokens];
}

function importedSharedClassAliases(source, filename) {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const tagTargets = new Map();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    )
      continue;
    const kind = moduleKindFor(statement.moduleSpecifier.text, filename);
    if (!kind) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const imported = element.propertyName?.text ?? element.name.text;
      const targets =
        kind === "shared-components" || kind === "shared-inputs"
          ? directSharedTargets.get(imported)
          : adapterTargets.get(imported);
      if (targets) tagTargets.set(element.name.text, targets);
    }
  }

  const aliases = new Set();
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const name = ts.isIdentifier(node.tagName)
        ? node.tagName.text
        : undefined;
      const targets = name ? tagTargets.get(name) : undefined;
      if (targets) {
        for (const attribute of node.attributes.properties) {
          if (
            !ts.isJsxAttribute(attribute) ||
            attribute.name.getText(sourceFile) !== "className"
          )
            continue;
          const initializer = attribute.initializer;
          const expression =
            initializer && ts.isJsxExpression(initializer)
              ? initializer.expression
              : initializer;
          for (const token of staticClassTokens(expression)) {
            aliases.add(`.${token}`);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return aliases;
}

function importedStylesheets(source, filename, repoRoot = root) {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const stylesheets = [];
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !statement.moduleSpecifier.text.endsWith(".css")
    )
      continue;
    const importPath = statement.moduleSpecifier.text;
    if (!importPath.startsWith(".")) continue;
    stylesheets.push(
      path.resolve(repoRoot, path.dirname(filename), importPath),
    );
  }
  return stylesheets;
}

function importedSharedActionNames(sourceFile) {
  const names = new Set();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const moduleName = statement.moduleSpecifier.text;
    if (!/(?:^|\/|\.)vari8\/components(?:\.tsx?)?$/.test(moduleName)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      if (
        ["Button", "IconButton"].includes(
          element.propertyName?.text ?? element.name.text,
        )
      ) {
        names.add(element.name.text);
      }
    }
  }
  return names;
}

function isSharedActionTag(name, names) {
  if (ts.isIdentifier(name)) return names.has(name.text);
  return (
    ts.isPropertyAccessExpression(name) &&
    ts.isIdentifier(name.expression) &&
    ts.isIdentifier(name.name) &&
    name.name.text === "Button"
  );
}

function duplicatePickerBasenameFor(moduleName) {
  const normalized = moduleName
    .replaceAll("\\", "/")
    .replace(/\.(?:tsx?|jsx?)$/, "");
  const basename = normalized.split("/").at(-1);
  return duplicatePickerBasenames.has(basename ?? "");
}

export function scanTsxSource(source, filename = "fixture.tsx") {
  const findings = [];
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const sharedActions = importedSharedActionNames(sourceFile);
  const visit = (node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      if (duplicatePickerBasenameFor(node.moduleSpecifier.text)) {
        findings.push({
          rule: "picker-module-import",
          file: filename,
          line:
            sourceFile.getLineAndCharacterOfPosition(
              node.moduleSpecifier.getStart(sourceFile),
            ).line + 1,
          property: "picker-module-import",
          selector: node.moduleSpecifier.text,
          value:
            "Use the shared VARI8 picker module or keep domain adaptation local.",
        });
      }
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (isSharedActionTag(node.tagName, sharedActions)) {
        for (const attribute of node.attributes.properties) {
          if (!ts.isJsxAttribute(attribute)) continue;
          if (attribute.name.getText(sourceFile) !== "unstyled") continue;
          findings.push({
            rule: "unstyled",
            file: filename,
            line:
              sourceFile.getLineAndCharacterOfPosition(
                attribute.getStart(sourceFile),
              ).line + 1,
            property: "unstyled",
            selector: `<${node.tagName.getText(sourceFile)}>`,
            value: attribute.initializer?.getText(sourceFile) ?? "true",
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return findings;
}

export function scanFeatureMarkup(source, filename = "fixture.tsx") {
  const findings = [];
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile);
      const line =
        sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
          .line + 1;
      if (ts.isIdentifier(node.tagName) && rawControlTags.has(tagName)) {
        findings.push({
          rule: "raw-control",
          file: filename,
          line,
          property: "raw-control",
          selector: `<${tagName}>`,
          value: tagName,
        });
      }
      for (const attribute of node.attributes.properties) {
        if (
          !ts.isJsxAttribute(attribute) ||
          attribute.name.getText(sourceFile) !== "style"
        )
          continue;
        const initializer = attribute.initializer;
        if (
          initializer &&
          ts.isJsxExpression(initializer) &&
          initializer.expression &&
          ts.isObjectLiteralExpression(initializer.expression)
        ) {
          findings.push({
            rule: "layout-prop",
            file: filename,
            line,
            property: "layout-prop",
            selector: `<${tagName}>`,
            value: "style={{...}}",
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return findings;
}

function loadNamesAllowlist() {
  try {
    const parsed = JSON.parse(readFileSync(namesAllowlistPath, "utf8"));
    const names = Array.isArray(parsed) ? parsed : parsed?.names;
    if (Array.isArray(names)) return new Set(names);
  } catch {
    return new Set();
  }
  return new Set();
}

function isPiiPath(repoPath) {
  return (
    piiFilePrefixes.some((prefix) => repoPath.startsWith(prefix)) ||
    piiFixturePattern.test(repoPath)
  );
}

export function scanPiiSource(
  source,
  filename = "fixture.ts",
  allowedNames = new Set(),
) {
  const findings = [];
  const push = (property, value, index) => {
    findings.push({
      rule: "pii",
      file: filename,
      line: source.slice(0, index).split("\n").length,
      property,
      selector: property,
      value,
    });
  };
  const dateRanges = [...source.matchAll(datePattern)].map((match) => [
    match.index,
    match.index + match[0].length,
  ]);
  for (const match of source.matchAll(emailPattern)) {
    if (!allowedHostPattern.test(match[1]))
      push("pii-email", match[0], match.index);
  }
  for (const match of source.matchAll(phonePattern)) {
    if (
      dateRanges.some(
        ([start, end]) => match.index >= start && match.index < end,
      )
    )
      continue;
    push("pii-phone", match[0].trim(), match.index);
  }
  for (const match of source.matchAll(hostPattern)) {
    if (!allowedHostPattern.test(match[1]))
      push("pii-host", match[1], match.index);
  }
  for (const match of source.matchAll(personFieldPattern)) {
    const [, key, , value] = match;
    if (
      !personFieldNamePattern.test(key) ||
      allowedNames.has(value) ||
      !capitalizedWordPattern.test(value)
    )
      continue;
    push("pii-name", `${key}: ${value}`, match.index);
  }
  return findings;
}

export function scanDesignRules(
  source,
  scriptNames,
  filename = "docs/DESIGN-RULES.md",
) {
  const findings = [];
  const push = (line, ruleId, property, value) =>
    findings.push({
      rule: "design-rules",
      file: filename,
      line,
      property,
      selector: ruleId,
      value,
    });
  const lines = source.split("\n");
  const headings = [];
  lines.forEach((text, index) => {
    const match = /^###\s+(R\d+)\./.exec(text);
    if (match) headings.push({ id: match[1], line: index + 1 });
  });
  if (headings.length === 0) {
    push(1, "DESIGN-RULES", "design-rules", "no rules found");
    return findings;
  }
  const fieldValue = (text, label) => {
    const backticked = /`([^`]+)`/.exec(text);
    if (backticked) return backticked[1].trim();
    return text.replace(new RegExp(`^.*?${label}:\\s*`), "").trim();
  };
  headings.forEach((heading, index) => {
    const end =
      index + 1 < headings.length ? headings[index + 1].line - 1 : lines.length;
    const checkLines = [];
    const statusLines = [];
    lines.slice(heading.line, end).forEach((text, offset) => {
      const lineNo = heading.line + offset + 1;
      if (/^\s*-?\s*Check:/.test(text)) checkLines.push({ text, line: lineNo });
      if (/^\s*-?\s*Status:/.test(text))
        statusLines.push({ text, line: lineNo });
    });
    if (checkLines.length !== 1) {
      push(
        heading.line,
        heading.id,
        "check",
        checkLines.length === 0
          ? "no Check line"
          : `${checkLines.length} Check lines`,
      );
    } else {
      const named = fieldValue(checkLines[0].text, "Check")
        .replace(/^npm\s+(?:run\s+)?/, "")
        .split(/\s/, 1)[0];
      if (!scriptNames.has(named)) {
        push(
          checkLines[0].line,
          heading.id,
          "check",
          `unknown script ${named || "(none)"}`,
        );
      }
    }
    if (statusLines.length !== 1) {
      push(
        heading.line,
        heading.id,
        "status",
        statusLines.length === 0
          ? "no Status line"
          : `${statusLines.length} Status lines`,
      );
    } else {
      const status = fieldValue(statusLines[0].text, "Status");
      if (!designRuleStatuses.has(status)) {
        push(statusLines[0].line, heading.id, "status", `invalid ${status}`);
      }
    }
  });
  return findings;
}

function loadPackageScriptNames() {
  const manifest = JSON.parse(
    readFileSync(path.join(root, "package.json"), "utf8"),
  );
  return new Set(Object.keys(manifest.scripts ?? {}));
}

function checkDesignRules() {
  if (!existsSync(designRulesPath)) {
    return [
      {
        rule: "design-rules",
        file: "docs/DESIGN-RULES.md",
        line: 1,
        property: "design-rules",
        selector: "DESIGN-RULES.md",
        value: "file missing",
      },
    ];
  }
  return scanDesignRules(
    readFileSync(designRulesPath, "utf8"),
    loadPackageScriptNames(),
  );
}

export function reconFileFindings(stagedPathsList) {
  return stagedPathsList
    .filter((stagedPath) => reconFilePattern.test(stagedPath.split("/").pop()))
    .map((stagedPath) => ({
      rule: "recon-file",
      file: stagedPath,
      line: 1,
      property: "recon-file",
      selector: stagedPath.split("/").pop(),
      value: "staged recon-named file",
    }));
}

export function binaryAssetFindings(currentPaths, allowedPaths) {
  return currentPaths
    .filter(
      (repoPath) =>
        binaryExtensions.has(path.posix.extname(repoPath)) &&
        !allowedPaths.has(repoPath),
    )
    .map((repoPath) => ({
      rule: "binary-asset",
      file: repoPath,
      line: 1,
      property: "binary-asset",
      selector: repoPath,
      value: "new binary asset",
    }));
}

function exceptionKey(finding) {
  return [finding.file, finding.selector, finding.property].join("\u0000");
}

function loadExceptions() {
  const filename = path.join(root, "scripts/ui-system-exceptions.json");
  if (!existsSync(filename)) return [];
  const data = JSON.parse(readFileSync(filename, "utf8"));
  if (!Array.isArray(data.exceptions)) {
    throw new Error(
      "scripts/ui-system-exceptions.json must contain an exceptions array.",
    );
  }
  for (const exception of data.exceptions) {
    if (
      !exception.file ||
      !exception.selector ||
      !exception.property ||
      !exception.reason
    ) {
      throw new Error(
        "Each UI system exception needs file, selector, property, and reason.",
      );
    }
  }
  return data.exceptions;
}

function exceptionEntries(parsed) {
  return Array.isArray(parsed) ? parsed : (parsed?.exceptions ?? []);
}

function loadBaseline() {
  if (!existsSync(baselineFilePath)) {
    throw new Error(
      "scripts/ui-baseline.json is missing; run ui-system-checks.mjs --write-baseline.",
    );
  }
  const parsed = JSON.parse(readFileSync(baselineFilePath, "utf8"));
  if (!parsed || typeof parsed.rules !== "object" || parsed.rules === null) {
    throw new Error("scripts/ui-baseline.json must contain a rules object.");
  }
  return parsed;
}

function filterExceptions(findings, exceptions) {
  const keys = new Set(exceptions.map(exceptionKey));
  return {
    findings: findings.filter((finding) => !keys.has(exceptionKey(finding))),
    matched: exceptions.filter((exception) =>
      findings.some(
        (finding) => exceptionKey(finding) === exceptionKey(exception),
      ),
    ),
  };
}

function collectBaselineCounts(findings) {
  const counts = {};
  for (const finding of findings) {
    const rule = finding.rule ?? finding.property;
    if (!baselineRules.has(rule)) continue;
    counts[rule] = counts[rule] ?? {};
    counts[rule][finding.file] = (counts[rule][finding.file] ?? 0) + 1;
  }
  return counts;
}

export function compareBaseline(counts, baseline) {
  const violations = [];
  const slack = [];
  const allowedRules = baseline.rules ?? {};
  for (const [rule, files] of Object.entries(counts)) {
    for (const [file, count] of Object.entries(files)) {
      const allowed = allowedRules[rule]?.[file] ?? 0;
      if (count > allowed) violations.push({ rule, file, count, allowed });
    }
  }
  for (const [rule, files] of Object.entries(allowedRules)) {
    for (const [file, allowed] of Object.entries(files)) {
      const count = counts[rule]?.[file] ?? 0;
      if (allowed > count) slack.push({ rule, file, count, allowed });
    }
  }
  return { violations, slack };
}

export function baselineRaises(before, after) {
  const raises = [];
  const beforeRules = before?.rules ?? {};
  for (const [rule, files] of Object.entries(after?.rules ?? {})) {
    for (const [file, count] of Object.entries(files)) {
      const previous = beforeRules[rule]?.[file] ?? 0;
      if (count > previous) raises.push({ rule, file, count, previous });
    }
  }
  return raises;
}

export function exceptionsAdded(before, after) {
  const beforeKeys = new Set(exceptionEntries(before).map(exceptionKey));
  return exceptionEntries(after).filter(
    (entry) => !beforeKeys.has(exceptionKey(entry)),
  );
}

function writeBaselineFile(counts) {
  const rules = {};
  for (const rule of [...baselineRules].sort()) {
    const files = counts[rule] ?? {};
    rules[rule] = Object.fromEntries(
      Object.entries(files).sort(([a], [b]) => a.localeCompare(b)),
    );
  }
  writeFileSync(
    baselineFilePath,
    `${JSON.stringify({ version: 1, rules }, null, 2)}\n`,
  );
}

function git(args) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trimEnd();
  } catch {
    return null;
  }
}

function insideGitWorkTree() {
  return git(["rev-parse", "--is-inside-work-tree"]) === "true";
}

function resolveBaselineRef() {
  for (const candidate of baselineRefCandidates) {
    const sha = git(["rev-parse", "--verify", "--quiet", candidate]);
    if (!sha) continue;
    const mergeBase = git(["merge-base", "HEAD", sha]);
    if (mergeBase) return { ref: candidate, mergeBase };
  }
  return null;
}

function repoRelativePath(repoPath) {
  const prefix = git(["rev-parse", "--show-prefix"]);
  return `${prefix ?? ""}${repoPath}`;
}

function gitFileAt(ref, repoPath) {
  return git(["show", `${ref}:${repoRelativePath(repoPath)}`]);
}

function stagedPaths() {
  const output = git(["diff", "--cached", "--name-only", "-z"]);
  if (output === null) return [];
  return output.split("\u0000").filter(Boolean);
}

export function scanFeatureFiles(repoRoot = root) {
  const findings = [];
  const srcDir = path.join(repoRoot, scanRoot);
  const featureFiles = filesUnder(srcDir, new Set([".tsx"])).filter(
    (filename) => isScannedPath(toRepoPath(filename)),
  );
  const styleAliases = new Map();
  const adapterAliases = new Set();
  for (const filename of featureFiles) {
    const source = readFileSync(filename, "utf8");
    const repoFilename = toRepoPath(filename);
    const aliases = importedSharedClassAliases(source, repoFilename);
    const isAdapter =
      repoFilename.endsWith("/coach/ui.tsx") ||
      repoFilename.endsWith("/ethereal/ui.tsx");
    if (isAdapter) {
      for (const alias of aliases) adapterAliases.add(alias);
    } else {
      for (const stylesheet of importedStylesheets(
        source,
        repoFilename,
        repoRoot,
      )) {
        const targets = styleAliases.get(stylesheet) ?? new Set();
        for (const alias of aliases) targets.add(alias);
        styleAliases.set(stylesheet, targets);
      }
    }
  }
  const cssFiles = filesUnder(srcDir, new Set([".css"])).filter((filename) =>
    isScannedPath(toRepoPath(filename)),
  );
  for (const filename of cssFiles) {
    const aliasTargets = new Set(adapterAliases);
    for (const alias of styleAliases.get(filename) ?? [])
      aliasTargets.add(alias);
    const source = readFileSync(filename, "utf8");
    const repoFilename = toRepoPath(filename);
    findings.push(...scanCssSource(source, repoFilename, aliasTargets));
    findings.push(...scanRawValues(source, repoFilename));
  }
  for (const filename of featureFiles) {
    const source = readFileSync(filename, "utf8");
    const repoFilename = toRepoPath(filename);
    findings.push(...scanTsxSource(source, repoFilename));
    findings.push(...scanFeatureMarkup(source, repoFilename));
  }

  const allowedNames = loadNamesAllowlist();
  const piiTargets = new Set();
  for (const extension of [
    ".ts",
    ".tsx",
    ".js",
    ".mjs",
    ".json",
    ".md",
    ".css",
  ]) {
    for (const filename of filesUnder(srcDir, new Set([extension]))) {
      const repoPath = toRepoPath(filename);
      if (isPiiPath(repoPath)) piiTargets.add(repoPath);
    }
  }
  for (const repoPath of [...piiTargets].sort()) {
    findings.push(
      ...scanPiiSource(
        readFileSync(path.join(repoRoot, repoPath), "utf8"),
        repoPath,
        allowedNames,
      ),
    );
  }
  return findings;
}

function checkBinaryAssets(ancestry) {
  const current = [];
  for (const prefix of binaryScopePrefixes) {
    for (const filename of filesUnder(
      path.join(root, prefix),
      binaryExtensions,
    )) {
      current.push(toRepoPath(filename));
    }
  }
  if (!ancestry) {
    const clientOnly = current.filter((repoPath) =>
      repoPath.startsWith("src/components/client/"),
    );
    return binaryAssetFindings(clientOnly, new Set());
  }
  const allowed = new Set();
  for (const scope of binaryScopePrefixes) {
    const listing = git([
      "ls-tree",
      "-r",
      "--name-only",
      ancestry.mergeBase,
      "--",
      scope,
    ]);
    if (!listing) continue;
    for (const entry of listing.split("\n").filter(Boolean)) allowed.add(entry);
  }
  return binaryAssetFindings(current, allowed);
}

function runSelfTests() {
  const unsafeCss = scanCssSource(
    ".coach-root .v8-button { padding-inline: 8px; color: red; width: 100%; margin-top: 4px; }",
  );
  assert.deepEqual(
    unsafeCss.map(({ property }) => property),
    ["padding-inline", "color"],
  );
  assert.deepEqual(
    scanCssSource(".coach-root .cd-actions { padding: 8px; }").length,
    0,
  );
  assert.deepEqual(
    scanCssSource(
      ".v8-tabs__tab { border-radius: 2px; }\n.v8-button-adapter { color: red; }\n:not(.v8-button) .cd-label { color: red; }\n.v8-select-popup .v8-select-option[data-highlighted] { background: red; }",
    ).map(({ property }) => property),
    ["border-radius", "background"],
    "The scanner flags shared internal geometry, ignores class-name prefixes, and skips :not exclusions.",
  );
  const sharedAlias = importedSharedClassAliases(
    `import { Card, Input as SharedInput } from "@/components/vari8/components";\n<SharedInput label="Name" className={\`db-name-input db-compact\`} />;\n<Card className="db-card"><h2>Title</h2></Card>;`,
    "fixture.tsx",
  );
  assert.deepEqual(
    scanCssSource(
      ".db-name-input { font-size: 34px; width: 100%; }\n.db-compact:hover { padding-inline: 4px; }\n.db-card .db-name-input { background: red; }\n.db-card > h2 { font-size: 32px; }\n.db-name-input-adapter { color: red; }\n:not(.db-name-input) .copy { color: red; }\n.db-name-input, .db-heading h2 { padding: 0; }",
      "fixture.css",
      sharedAlias,
    ).map(({ property }) => property),
    ["font-size", "padding-inline", "background", "padding"],
    "Static className aliases on imported shared controls are scanned without class-prefix or :not false positives.",
  );
  const coachAdapterAlias = importedSharedClassAliases(
    'import { IconButton } from "@/components/coach/ui";\n<IconButton label="Move" className="mp-button" />;',
    "src/components/coach/fixture.tsx",
  );
  assert.deepEqual(
    scanCssSource(
      ".mp-button { border-radius: 999px; width: 100%; }",
      "fixture.css",
      coachAdapterAlias,
    ).map(({ property }) => property),
    ["border-radius"],
    "Known Coach adapters map their static className aliases to the shared control they wrap.",
  );
  assert.deepEqual(
    scanCssSource(
      ".coach-root .v8-tabs__list { position: relative; inset-block-start: 0; margin-inline: auto; gap: 8px; width: 100%; max-width: 100%; }",
    ).length,
    0,
    "Layout placement rules remain allowed on shared controls.",
  );
  const unsafeTsx = scanTsxSource(
    'import { Button as V8Button } from "@/components/vari8/components";\n<V8Button unstyled />;\nimport { DatePicker } from "./date-time-fields";',
  );
  assert.deepEqual(
    unsafeTsx.map(({ property }) => property),
    ["unstyled", "picker-module-import"],
  );
  assert.equal(
    scanTsxSource(
      'import { Button } from "@/components/vari8/components";\n<Button variant="primary" />;',
    ).length,
    0,
  );

  assert.deepEqual(
    scanRawValues(".cd-card { border-radius: 7px; padding: 0 4px; }").map(
      ({ property }) => property,
    ),
    ["border-radius", "padding"],
    "Raw lengths on visual properties are flagged.",
  );
  assert.equal(
    scanRawValues(
      ".cd-card { border-radius: var(--v8-radius-md); padding: 0; height: 0px; }",
    ).length,
    0,
    "Token references and zero values are not raw values.",
  );
  assert.equal(
    scanRawValues(".cd-card { margin-top: 8px; width: 120px; }").length,
    0,
    "Layout properties stay outside the raw-value rule.",
  );
  assert.deepEqual(
    scanRawValues(".v8-button { border-radius: 7px; }").map(({ rule }) => rule),
    ["raw-value"],
    "Raw values on shared selectors are flagged as raw values too.",
  );

  assert.deepEqual(
    scanFeatureMarkup(
      `const view = () => <section><button type="button">go</button><input type="text" /><Button /></section>;`,
    ).map(({ rule }) => rule),
    ["raw-control", "raw-control"],
    "Raw interactive elements are flagged; shared controls are not.",
  );
  assert.deepEqual(
    scanFeatureMarkup(
      `const view = () => <div style={{ marginTop: 8 }} />;`,
    ).map(({ rule }) => rule),
    ["layout-prop"],
    "Inline style objects are flagged.",
  );
  assert.equal(
    scanFeatureMarkup(`const view = () => <div style={style} />;`).length,
    0,
    "Style bindings that are not object literals are ignored.",
  );

  const piiFindings = scanPiiSource(
    `export const fixture = { clientName: "Maya Stone", contact: "maya@realmail.com", site: "https://tracker.realmail.com", phone: "+44 7700 900000" };`,
    "src/components/client/demo/demo.ts",
    new Set(["Maya Stone"]),
  );
  const piiKinds = new Set(piiFindings.map((finding) => finding.property));
  assert.ok(piiKinds.has("pii-email"), "email outside example.* is flagged");
  assert.ok(piiKinds.has("pii-phone"), "phone number is flagged");
  assert.ok(piiKinds.has("pii-host"), "host outside example.* is flagged");
  assert.equal(
    scanPiiSource(
      `export const fixture = { clientName: "Amara", site: "https://demo.example.com", date: "2026-10-22" };`,
      "src/components/client/demo/demo.ts",
      new Set(["Amara"]),
    ).length,
    0,
    "Allowlisted names and example.* hosts pass; dates are not phones.",
  );
  assert.equal(
    scanPiiSource(
      `export const fixture = { clientName: "Jane Roe" };`,
      "src/components/client/demo/demo.ts",
      new Set(),
    ).filter((finding) => finding.property === "pii-name").length,
    1,
    "A person name outside the allowlist is flagged.",
  );

  assert.equal(
    reconFileFindings([
      "frontend/src/R1-audit.md",
      "frontend/src/app/page.tsx",
      "R2-notes.md",
    ]).length,
    2,
    "Staged R[1-4]-* files are flagged by basename.",
  );

  assert.equal(
    binaryAssetFindings(
      ["public/grain.png", "src/components/client/demo/photo.png"],
      new Set(["public/grain.png"]),
    ).length,
    1,
    "Only binary assets new to the ref are flagged.",
  );

  const baselineFixture = {
    version: 1,
    rules: { "raw-control": { "a.tsx": 2 } },
  };
  const equalCompare = compareBaseline(
    { "raw-control": { "a.tsx": 2 } },
    baselineFixture,
  );
  assert.equal(equalCompare.violations.length, 0);
  assert.equal(equalCompare.slack.length, 0);
  assert.equal(
    compareBaseline({ "raw-control": { "a.tsx": 3 } }, baselineFixture)
      .violations.length,
    1,
    "A count above the baseline is a violation.",
  );
  assert.equal(
    compareBaseline({ "raw-control": { "a.tsx": 1 } }, baselineFixture).slack
      .length,
    1,
    "A count below the baseline is slack to shrink.",
  );
  assert.equal(
    compareBaseline({ "raw-control": { "new.tsx": 1 } }, baselineFixture)
      .violations[0].allowed,
    0,
    "A file with no baseline key gets zero allowance.",
  );
  assert.equal(
    baselineRaises(baselineFixture, {
      version: 1,
      rules: { "raw-control": { "a.tsx": 3, "b.tsx": 1 } },
    }).length,
    2,
    "Raises against the merge-base baseline are detected per file.",
  );
  assert.equal(
    exceptionsAdded(
      { exceptions: [{ file: "a.css", selector: ".x", property: "height" }] },
      {
        exceptions: [
          { file: "a.css", selector: ".x", property: "height" },
          { file: "b.css", selector: ".y", property: "padding" },
        ],
      },
    ).length,
    1,
    "Additions to the exceptions file are detected.",
  );

  const knownScripts = new Set(["ui:check", "ui:geometry", "test"]);
  const ruleDoc = [
    "### R1. Keep colours on tokens.",
    "- Check: `ui:check`",
    "- Status: `live in check`",
    "### R2. Measure every control.",
    "- Check: `ui:geometry`",
    "- Status: `live manual (reviewer runs)`",
  ].join("\n");
  assert.equal(
    scanDesignRules(ruleDoc, knownScripts).length,
    0,
    "A valid rule sheet passes.",
  );
  assert.deepEqual(
    scanDesignRules(
      ruleDoc.replace("`ui:geometry`", "`ui:geometr`"),
      knownScripts,
    ).map((finding) => finding.selector),
    ["R2"],
    "A Check naming a missing script fails and names the rule.",
  );
  assert.equal(
    scanDesignRules("### R3. No check.\n- Status: `planned`\n", knownScripts)
      .length,
    1,
    "A rule with no Check line is a violation.",
  );
  assert.equal(
    scanDesignRules(
      "### R3. Bad status.\n- Check: `test`\n- Status: `maybe`\n",
      knownScripts,
    ).length,
    1,
    "A Status outside the three values is a violation.",
  );
  assert.equal(
    scanDesignRules(
      "### R3. Two checks.\n- Check: `test`\n- Check: `ui:check`\n- Status: `planned`\n",
      knownScripts,
    ).length,
    1,
    "A rule with two Check lines is a violation.",
  );
  assert.equal(
    scanDesignRules("no rules here\n", knownScripts).length,
    1,
    "A sheet with no rules fails.",
  );
  console.log("UI system drift checks: self-tests passed.");
}

if (process.argv.includes("--self-test")) {
  runSelfTests();
} else if (process.argv.includes("--write-baseline")) {
  const exceptions = loadExceptions();
  const allFindings = scanFeatureFiles();
  const { findings } = filterExceptions(allFindings, exceptions);
  const counts = collectBaselineCounts(findings);
  writeBaselineFile(counts);
  for (const rule of [...baselineRules].sort()) {
    const total = Object.values(counts[rule] ?? {}).reduce(
      (sum, value) => sum + value,
      0,
    );
    console.log(`baseline ${rule}: ${total}`);
  }
} else {
  const exceptions = loadExceptions();
  const baseline = loadBaseline();
  const allFindings = scanFeatureFiles();
  const { findings, matched } = filterExceptions(allFindings, exceptions);
  const counts = collectBaselineCounts(findings);
  const { violations, slack } = compareBaseline(counts, baseline);

  const hardFindings = findings.filter((finding) => {
    const rule = finding.rule ?? finding.property;
    return !baselineRules.has(rule);
  });

  const violationKeys = new Set(
    violations.map((violation) => `${violation.rule}\u0000${violation.file}`),
  );
  const overAllowance = findings.filter(
    (finding) =>
      baselineRules.has(finding.rule ?? finding.property) &&
      violationKeys.has(
        `${finding.rule ?? finding.property}\u0000${finding.file}`,
      ),
  );

  const ancestry = insideGitWorkTree() ? resolveBaselineRef() : null;
  const ancestryFindings = [];
  if (!ancestry) {
    console.error("baseline ancestry NOT VERIFIED");
  } else {
    const mergeBaseBaseline = gitFileAt(
      ancestry.mergeBase,
      "scripts/ui-baseline.json",
    );
    if (mergeBaseBaseline === null) {
      console.log(
        `no ui-baseline.json at merge base ${ancestry.mergeBase.slice(0, 12)} (first introduction)`,
      );
    } else {
      const raises = baselineRaises(JSON.parse(mergeBaseBaseline), baseline);
      if (raises.length > 0) {
        if (baselineRaiseReason) {
          console.log(`BASELINE RAISED: ${baselineRaiseReason}`);
        } else {
          for (const raise of raises) {
            console.error(
              `baseline raised vs merge base: ${raise.rule} ${raise.file} ${raise.previous} -> ${raise.count}`,
            );
          }
          ancestryFindings.push({ rule: "baseline-raise" });
        }
      }
    }
    const mergeBaseExceptions = gitFileAt(
      ancestry.mergeBase,
      "scripts/ui-system-exceptions.json",
    );
    if (mergeBaseExceptions === null) {
      console.log(
        `no ui-system-exceptions.json at merge base ${ancestry.mergeBase.slice(0, 12)} (first introduction)`,
      );
    } else {
      const added = exceptionsAdded(JSON.parse(mergeBaseExceptions), {
        exceptions,
      });
      if (added.length > 0) {
        if (baselineRaiseReason) {
          console.log(`BASELINE RAISED: ${baselineRaiseReason}`);
        } else {
          for (const entry of added) {
            console.error(
              `exception added vs merge base: ${entry.file} ${entry.selector} ${entry.property}`,
            );
          }
          ancestryFindings.push({ rule: "exception-added" });
        }
      }
    }
  }

  const binaryFindings = checkBinaryAssets(ancestry);
  const stagedFindings = reconFileFindings(stagedPaths());
  const designRuleFindings = checkDesignRules();

  for (const finding of overAllowance) {
    console.error(
      `${finding.file}:${finding.line} ${finding.selector} { ${finding.property}: ${finding.value} }`,
    );
  }
  for (const finding of hardFindings) {
    console.error(
      `${finding.file}:${finding.line} ${finding.selector} { ${finding.property}: ${finding.value} }`,
    );
  }
  for (const finding of binaryFindings) {
    console.error(`${finding.file}: new binary asset`);
  }
  for (const finding of stagedFindings) {
    console.error(`${finding.file}: staged recon-named file`);
  }
  for (const finding of designRuleFindings) {
    console.error(
      `${finding.file}:${finding.line} ${finding.selector} { ${finding.property}: ${finding.value} }`,
    );
  }
  for (const entry of slack) {
    if (baselineRaiseReason) continue;
    console.error(
      `baseline slack: ${entry.rule} ${entry.file} allows ${entry.allowed}, measured ${entry.count}; shrink scripts/ui-baseline.json`,
    );
  }
  if (slack.length > 0 && baselineRaiseReason) {
    console.log(`BASELINE RAISED: ${baselineRaiseReason}`);
  }
  for (const exception of matched) {
    console.log(
      `Reviewed exception ${exception.file} ${exception.selector} ${exception.property}: ${exception.reason}`,
    );
  }
  for (const exception of exceptions) {
    if (!matched.includes(exception)) {
      console.error(
        `Stale UI system exception: ${exception.file} ${exception.selector} ${exception.property}`,
      );
    }
  }

  const failureCount =
    overAllowance.length +
    hardFindings.length +
    binaryFindings.length +
    stagedFindings.length +
    designRuleFindings.length +
    ancestryFindings.length +
    (baselineRaiseReason ? 0 : slack.length) +
    (exceptions.length !== matched.length ? 1 : 0);
  if (failureCount > 0) {
    console.error(`UI system drift check found ${failureCount} violation(s).`);
    process.exitCode = 1;
  } else {
    const debt = Object.values(counts).reduce(
      (sum, files) => sum + Object.values(files).reduce((a, b) => a + b, 0),
      0,
    );
    console.log(
      `UI system drift check passed (${matched.length} reviewed exception(s), ${debt} baseline finding(s)).`,
    );
  }
}
