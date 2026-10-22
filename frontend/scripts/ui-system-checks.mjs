#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";
import ts from "typescript";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const featureRoots = ["src/components/coach", "src/components/ethereal"];
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

export function scanFeatureFiles(repoRoot = root) {
  const findings = [];
  for (const featureRoot of featureRoots) {
    const absoluteRoot = path.join(repoRoot, featureRoot);
    const featureFiles = filesUnder(absoluteRoot, new Set([".tsx"]));
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
    for (const filename of filesUnder(absoluteRoot, new Set([".css"]))) {
      const aliasTargets = new Set(adapterAliases);
      for (const alias of styleAliases.get(filename) ?? [])
        aliasTargets.add(alias);
      findings.push(
        ...scanCssSource(
          readFileSync(filename, "utf8"),
          toRepoPath(filename),
          aliasTargets,
        ),
      );
    }
    for (const filename of filesUnder(absoluteRoot, new Set([".tsx"]))) {
      findings.push(
        ...scanTsxSource(readFileSync(filename, "utf8"), toRepoPath(filename)),
      );
    }
  }
  return findings;
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
  console.log("UI system drift checks: self-tests passed.");
}

if (process.argv.includes("--self-test")) {
  runSelfTests();
} else {
  const exceptions = loadExceptions();
  const allFindings = scanFeatureFiles();
  const { findings, matched } = filterExceptions(allFindings, exceptions);
  for (const finding of findings) {
    console.error(
      `${finding.file}:${finding.line} ${finding.selector} { ${finding.property}: ${finding.value} }`,
    );
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
  if (findings.length || exceptions.length !== matched.length) {
    console.error(
      `UI system drift check found ${findings.length} unapproved violation(s).`,
    );
    process.exitCode = 1;
  } else {
    console.log(
      `UI system drift check passed (${allFindings.length} reviewed exception(s)).`,
    );
  }
}
