// AUD-REDUCTION-FIX: reproducible facts for icm/05-build/BACKEND-REDUCTION.md.
// Uses the TypeScript compiler API (no regex parsing). Run from the repo root:
//   node icm/05-build/evidence/AUD-REDUCTION-FIX/ts-facts.cjs
// TypeScript: TS_PATH, else the worktree install, else the parity-harness install.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const tsCandidates = [
  process.env.TS_PATH,
  path.join(process.cwd(), "node_modules/typescript"),
  "/home/nexuslink/vari8-worktrees/parity-harness/node_modules/typescript",
].filter(Boolean);
const tsDir = tsCandidates.find((p) => {
  try {
    return fs.existsSync(path.join(p, "lib/typescript.js"));
  } catch {
    return false;
  }
});
if (!tsDir) {
  console.error("no typescript install found; set TS_PATH or run npm ci");
  process.exit(1);
}
const ts = require(tsDir);
const crypto = require("crypto");

const root = process.cwd();
const tracked = execSync("git ls-files", { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);
const tsFiles = tracked.filter((f) => /\.(ts|tsx)$/.test(f));
const tsSet = new Set(tsFiles);
// Prod scope per audit section 6: app, lib, components, scripts, root auth.ts (.ts/.tsx/.js/.mjs/.cjs).
const prodRe =
  /^(app|lib|components|scripts)\/.*\.(ts|tsx|js|mjs|cjs)$|^auth\.ts$/;
const prodFiles = tracked.filter((f) => prodRe.test(f));

const nonblank = (s) => s.split("\n").filter((l) => l.trim() !== "").length;
const readText = (f) => fs.readFileSync(path.join(root, f), "utf8");
const sfCache = new Map();
function parse(f) {
  if (!sfCache.has(f)) {
    const kind = f.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    sfCache.set(
      f,
      ts.createSourceFile(f, readText(f), ts.ScriptTarget.Latest, true, kind),
    );
  }
  return sfCache.get(f);
}
const printer = ts.createPrinter({ removeComments: true });
const normalize = (node, sf) =>
  printer
    .printNode(ts.EmitHint.Unspecified, node, sf)
    .replace(/\s+/g, " ")
    .trim();
const sha = (s) =>
  crypto.createHash("sha1").update(s).digest("hex").slice(0, 8);

// Resolve a local module specifier to a tracked TS file, or null for packages.
function resolveLocal(from, spec) {
  let base;
  if (spec.startsWith("."))
    base = path.posix.normalize(
      path.posix.join(path.posix.dirname(from), spec),
    );
  else if (spec.startsWith("@/")) base = spec.slice(2);
  else return null;
  for (const c of [
    base,
    base + ".ts",
    base + ".tsx",
    base + "/index.ts",
    base + "/index.tsx",
  ]) {
    if (tsSet.has(c)) return c;
  }
  return null;
}

// Every module specifier in a file: static import/export-from, import type, import(), require().
function specifiers(f) {
  const sf = parse(f);
  const out = [];
  (function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier
    ) {
      out.push({
        spec: node.moduleSpecifier.text,
        line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
      });
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require")) &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      out.push({
        spec: node.arguments[0].text,
        line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
      });
    }
    ts.forEachChild(node, visit);
  })(sf);
  return out;
}

const graph = new Map();
for (const f of tsFiles) {
  const edges = [];
  for (const { spec, line } of specifiers(f)) {
    const r = resolveLocal(f, spec);
    if (r) edges.push({ to: r, line, spec });
  }
  graph.set(f, edges);
}

// Top-level functions and consts, with normalized text and non-blank line counts.
function topLevel(f) {
  const sf = parse(f);
  const items = [];
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  for (const st of sf.statements) {
    const startLine = lineOf(st.getStart(sf));
    const endLine = lineOf(st.end);
    const lines = readText(f)
      .split("\n")
      .slice(startLine - 1, endLine);
    const nb = nonblank(lines.join("\n"));
    if (ts.isFunctionDeclaration(st) && st.name) {
      items.push({
        kind: "fn",
        name: st.name.text,
        file: f,
        startLine,
        endLine,
        nonblank: nb,
        norm: normalize(st, sf),
      });
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) continue;
        const init = d.initializer;
        const isFn =
          init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init));
        items.push({
          kind: isFn ? "fn" : "const",
          name: d.name.text,
          file: f,
          startLine,
          endLine,
          nonblank: nb,
          value: init ? normalize(init, sf) : "",
          norm: normalize(st, sf),
        });
      }
    }
  }
  return items;
}
const defs = new Map();
for (const f of tsFiles) defs.set(f, topLevel(f));
const allDefs = [...defs.values()].flat();

const out = [];
const log = (s = "") => out.push(s);

// ---------- F5: import closure of the catalog importers ----------
log(
  "## F5 import closure (TypeScript compiler API, type-only imports included)",
);
const catalogRoots = [
  "lib/nutrition/import.ts",
  "lib/exercise/import.ts",
  "lib/nutrition/source.ts",
  "lib/exercise/source.ts",
];
const seen = new Set(catalogRoots);
const queue = [...catalogRoots];
while (queue.length) {
  const f = queue.shift();
  for (const e of graph.get(f) || [])
    if (!seen.has(e.to)) {
      seen.add(e.to);
      queue.push(e.to);
    }
}
const extr = [...seen].filter((f) => f.startsWith("lib/extraction/")).sort();
log(
  "closure from catalog importers, lib/extraction modules: " + extr.join(", "),
);
const f5Delete = [
  "lib/extraction/crosssheet.ts",
  "lib/extraction/databases.ts",
  "lib/extraction/redact.ts",
  "lib/extraction/source.ts",
  "lib/extraction/summaries.ts",
  "lib/extraction/theme.ts",
  "lib/extraction/css.ts",
];
for (const f of f5Delete) {
  const importers = tsFiles
    .filter((g) => (graph.get(g) || []).some((e) => e.to === f))
    .map((g) => `${g}:${graph.get(g).find((e) => e.to === f).line}`);
  log(
    `  ${f}: in closure=${seen.has(f)}; importers=${importers.join(" ") || "none"}`,
  );
}
log("");

// ---------- F8: withSerializedRetry copies ----------
log("## F8 withSerializedRetry copies");
const retryFns = allDefs.filter(
  (d) => d.kind === "fn" && d.name === "withSerializedRetry",
);
const retryFiles = [...new Set(retryFns.map((d) => d.file))].sort();
const constsFor = (file, names) =>
  allDefs.filter(
    (d) => d.kind === "const" && d.file === file && names.includes(d.name),
  );
const groups = new Map();
let fnLines = 0,
  constLines = 0,
  maxVals = {},
  backVals = {};
for (const d of retryFns) {
  const cs = constsFor(d.file, [
    "MAX_ATTEMPTS",
    "BACKOFF_BASE_MS",
    "BACKOFF_CAP_MS",
  ]);
  const ma = cs.find((c) => c.name === "MAX_ATTEMPTS");
  const bb = cs.find((c) => c.name === "BACKOFF_BASE_MS");
  const bc = cs.find((c) => c.name === "BACKOFF_CAP_MS");
  const cLines = cs
    .filter((c) => c.name !== "BACKOFF_CAP_MS")
    .reduce((s, c) => s + c.nonblank, 0);
  fnLines += d.nonblank;
  constLines += cLines;
  maxVals[ma ? ma.value : "none"] = (maxVals[ma ? ma.value : "none"] || 0) + 1;
  backVals[bb ? bb.value : "none"] =
    (backVals[bb ? bb.value : "none"] || 0) + 1;
  const key = sha(
    d.norm +
      "|" +
      (ma ? ma.value : "") +
      "|" +
      (bb ? bb.value : "") +
      "|" +
      (bc ? bc.value : ""),
  );
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push({
    file: d.file,
    line: d.startLine,
    nonblank: d.nonblank + cLines,
    max: ma ? ma.value : "-",
    backoff: bb ? bb.value : "-",
    cap: bc ? bc.value : "-",
    norm: d.norm,
  });
}
log(`files with withSerializedRetry: ${retryFiles.length}`);
log(
  `function nonblank lines: ${fnLines}; MAX_ATTEMPTS+BACKOFF_BASE_MS const lines: ${constLines}; source total: ${fnLines + constLines}`,
);
log(
  `MAX_ATTEMPTS values: ${JSON.stringify(maxVals)}; BACKOFF_BASE_MS values: ${JSON.stringify(backVals)}`,
);
log(`distinct behaviour groups (body + constants + cap): ${groups.size}`);
let identicalBeyondFirst = 0;
for (const [k, members] of [...groups.entries()].sort(
  (a, b) => b[1].length - a[1].length,
)) {
  const beyond = members.slice(1).reduce((s, m) => s + m.nonblank, 0);
  identicalBeyondFirst += beyond;
  log(
    `  group ${k} x${members.length} max=${members[0].max} backoff=${members[0].backoff} cap=${members[0].cap}: ${members.map((m) => m.file + ":" + m.line).join(" ")}`,
  );
}
log(
  `lines in identical copies beyond the first, per group (upper bound on removable lines before any helper is added): ${identicalBeyondFirst}`,
);
const isRetryNames = allDefs
  .filter((d) => d.name === "isRetryableSerialization")
  .map((d) => d.file);
log(`files defining isRetryableSerialization: ${isRetryNames.length}`);
log("");

// ---------- F9: boundary helpers ----------
log("## F9 boundary helpers");
const boundaryFiles = tracked.filter((f) => /^lib\/.*boundary.*\.ts$/.test(f));
log(`boundary files (lib/*boundary*.ts): ${boundaryFiles.length}`);
const helperNames = ["mapError", "fail", "guard", "CLOSED_MESSAGES"];
let f9Total = 0,
  f9Beyond = 0;
for (const name of helperNames) {
  const hits = allDefs.filter(
    (d) => d.name === name && boundaryFiles.includes(d.file),
  );
  const lines = hits.reduce((s, d) => s + d.nonblank, 0);
  const groupsN = new Map();
  for (const d of hits) {
    const k = sha(d.norm);
    if (!groupsN.has(k)) groupsN.set(k, []);
    groupsN.get(k).push(d);
  }
  const beyond = [...groupsN.values()].reduce(
    (s, g) => s + g.slice(1).reduce((t, d) => t + d.nonblank, 0),
    0,
  );
  f9Total += lines;
  f9Beyond += beyond;
  log(
    `  ${name}: files=${hits.length} nonblank=${lines} distinct bodies=${groupsN.size} identical-copy lines beyond first=${beyond}`,
  );
}
log(
  `  helper lines total: ${f9Total}; identical-copy lines beyond first (upper bound before helper): ${f9Beyond}`,
);
log("");

// ---------- F3: action layer ----------
log("## F3 action files");
const actionFiles = tracked.filter((f) =>
  /^app\/(workspace|\(tracker\))\/.*\.ts$/.test(f),
);
const actionLines = actionFiles.reduce((s, f) => s + nonblank(readText(f)), 0);
const withBoundary = actionFiles.filter((f) =>
  (graph.get(f) || []).some((e) => /boundary/.test(e.spec)),
);
const direct = actionFiles.filter(
  (f) => !(graph.get(f) || []).some((e) => /boundary/.test(e.spec)),
);
log(
  `action files: ${actionFiles.length}; gross nonblank: ${actionLines}; import a boundary: ${withBoundary.length}`,
);
log(`  without a boundary import: ${direct.join(", ")}`);
log("");

// ---------- F1/F2: parameter shell kept by Q-R3-17 ----------
log("## F1/F2 parameter shell (kept by PLAN Q-R3-17)");
const paramFiles = tracked.filter((f) =>
  /^app\/workspace\/\[workspaceId\]\/(parameters\/|layout\.tsx$)/.test(f),
);
for (const f of paramFiles) log(`  ${f}: nonblank=${nonblank(readText(f))}`);
const layoutDeps = (
  graph.get("app/workspace/[workspaceId]/layout.tsx") || []
).map((e) => e.to);
log(
  `  app/workspace/[workspaceId]/layout.tsx imports: ${layoutDeps.join(", ")}`,
);
const shellParts = [
  "components/theme-toggle.tsx",
  "components/workspace-nav.tsx",
  "components/sign-out-button.tsx",
];
for (const f of shellParts)
  log(
    `  ${f}: nonblank=${nonblank(readText(f))}; in layout closure=${layoutDeps.includes(f)}`,
  );
const compAll = tracked.filter((f) => /^components\/.*\.(ts|tsx)$/.test(f));
log(
  `  components/ .ts/.tsx files: ${compAll.length}; nonblank: ${compAll.reduce((s, f) => s + nonblank(readText(f)), 0)}`,
);
log("");

// ---------- prod totals ----------
log("## Prod totals (app, lib, components, scripts, auth.ts; non-blank)");
const byTop = {};
for (const f of prodFiles) {
  const top = f.split("/")[0];
  byTop[top] = (byTop[top] || 0) + nonblank(readText(f));
}
log(
  JSON.stringify(byTop) +
    ` total=${Object.values(byTop).reduce((a, b) => a + b, 0)} files=${prodFiles.length}`,
);
const testFiles = tracked.filter((f) =>
  /^tests\/.*\.(ts|tsx|js|mjs|cjs)$/.test(f),
);
const testSub = {};
for (const f of testFiles) {
  const k = f.split("/").slice(0, 2).join("/");
  testSub[k] = testSub[k] || { files: 0, lines: 0 };
  testSub[k].files++;
  testSub[k].lines += nonblank(readText(f));
}
log("tests: " + JSON.stringify(testSub) + ` total files=${testFiles.length}`);

// ---------- F8 classifier variants (isRetryableSerialization) ----------
log("## F8 isRetryableSerialization variants");
const isrDefs = allDefs.filter(
  (d) => d.kind === "fn" && d.name === "isRetryableSerialization",
);
const isrGroups = new Map();
for (const d of isrDefs) {
  const k = sha(d.norm);
  if (!isrGroups.has(k)) isrGroups.set(k, []);
  isrGroups.get(k).push(d.file);
}
log(
  `isRetryableSerialization definitions: ${isrDefs.length}; distinct printer bodies: ${isrGroups.size}`,
);
for (const [k, files] of isrGroups)
  log(`  body ${k} x${files.length}: ${files.join(" ")}`);
const dbClassifier = allDefs.find(
  (d) => d.name === "isSerializationConflict" && d.file === "lib/db.ts",
);
log(
  `lib/db.ts isSerializationConflict at line ${dbClassifier ? dbClassifier.startLine : "missing"}`,
);
log("");

// ---------- F3 transition-actions overlap (counted in F3 and F4) ----------
const ta = "app/workspace/[workspaceId]/client-setups/transition-actions.ts";
log(
  `## overlap: ${ta} nonblank=${
    readText(ta)
      .split("\n")
      .filter((l) => l.trim()).length
  } (in F3 gross and F4)`,
);
log("");

// ---------- Section 1 rows (audit method: prod = app/workspace, app/(tracker), app other, lib, components, scripts) ----------
log(
  "## Section 1 rows (non-blank, .ts/.tsx/.js/.mjs/.cjs; auth.ts excluded as in the audit)",
);
const rowFiles = prodFiles.filter((f) => !f.startsWith("auth.ts"));
const rowStat = (pred) => {
  const fs_ = rowFiles.filter(pred);
  return `${fs_.length} files, ${fs_.reduce((s, f) => s + nonblank(readText(f)), 0)} lines`;
};
log("app/workspace/**: " + rowStat((f) => f.startsWith("app/workspace/")));
log("app/(tracker)/**: " + rowStat((f) => f.startsWith("app/(tracker)/")));
log(
  "app other: " +
    rowStat(
      (f) =>
        f.startsWith("app/") &&
        !f.startsWith("app/workspace/") &&
        !f.startsWith("app/(tracker)/"),
    ),
);
log("lib/**: " + rowStat((f) => f.startsWith("lib/")));
log("components/**: " + rowStat((f) => f.startsWith("components/")));
log("scripts/**: " + rowStat((f) => f.startsWith("scripts/")));
log(
  "scripts/index/** (generator, added after the audit): " +
    rowStat((f) => f.startsWith("scripts/index/")),
);
log("prod total: " + rowStat(() => true));
const tgt = (names) =>
  names.map((n) => `${n}=${nonblank(readText(n))}`).join(" ");
log(
  "F5 delete list: " +
    tgt([
      "lib/extraction/crosssheet.ts",
      "lib/extraction/redact.ts",
      "lib/extraction/source.ts",
      "lib/extraction/summaries.ts",
      "lib/extraction/theme.ts",
      "scripts/extract-sheets.ts",
    ]),
);
log(
  "F5 databases (closure, must stay): " + tgt(["lib/extraction/databases.ts"]),
);
log(
  "F1 parameter kept set: " +
    tgt([
      "app/workspace/[workspaceId]/parameters/page.tsx",
      "app/workspace/[workspaceId]/parameters/parameter-manager.tsx",
      "app/workspace/[workspaceId]/parameters/actions.ts",
      "app/workspace/[workspaceId]/layout.tsx",
    ]),
);
log("");

// ---------- F8 detail: distinct bodies, identical copies, removable lines ----------
log("## F8 detail: distinct bodies, identical copies, removable lines");
const errOf = (normText) =>
  [...new Set(normText.match(/\b[A-Z][A-Za-z]*Error\b/g) || [])].join(",");
const byBody = new Map();
for (const d of retryFns) {
  const cs = constsFor(d.file, [
    "MAX_ATTEMPTS",
    "BACKOFF_BASE_MS",
    "BACKOFF_CAP_MS",
  ]);
  const n2 = (name) => {
    const c = cs.find((x) => x.name === name);
    return c ? c.value : "-";
  };
  const h = sha(d.norm);
  if (!byBody.has(h)) byBody.set(h, []);
  byBody
    .get(h)
    .push(
      `${d.file}:${d.startLine} max=${n2("MAX_ATTEMPTS")} backoff=${n2("BACKOFF_BASE_MS")} cap=${n2("BACKOFF_CAP_MS")} errors=${errOf(d.norm) || "none"}${/retryPublishUniques|mapTimeoutPoolError|P2002/.test(d.norm) ? " (publish or timeout mapping)" : ""}`,
    );
}
log(
  `distinct withSerializedRetry bodies (AST printer, comments removed): ${byBody.size} of ${retryFns.length} copies`,
);
for (const [h, members] of [...byBody.entries()].sort(
  (a, b) => b[1].length - a[1].length,
))
  log(`  body ${h} x${members.length}: ${members.join(" | ")}`);
const isrLineOf = new Map(isrDefs.map((d) => [d.file, d.nonblank]));
const isrByBody = new Map();
for (const d of isrDefs) {
  const k = sha(d.norm);
  if (!isrByBody.has(k)) isrByBody.set(k, []);
  isrByBody.get(k).push(d.file);
}
const isrLineTotal = isrDefs.reduce((s, d) => s + d.nonblank, 0);
const isrKept = [...isrByBody.values()].reduce(
  (s, f) => s + isrLineOf.get(f[0]),
  0,
);
log(
  `isRetryableSerialization: ${isrDefs.length} copies, ${isrByBody.size} distinct bodies, ${isrLineTotal} non-blank lines; one copy kept per body = ${isrKept}; removable by dedupe = ${isrLineTotal - isrKept}`,
);
log(
  `F8 removable lines: identical retry copies beyond the first ${identicalBeyondFirst} + redundant classifier copies ${isrLineTotal - isrKept} = ${identicalBeyondFirst + isrLineTotal - isrKept} (upper bound; every call site keeps its attempts, backoff, cap and thrown error)`,
);
log("");

// ---------- F10: classifier definitions and their lines ----------
log("## F10 classifiers");
const classifyDefs = allDefs.filter(
  (d) => d.kind === "fn" && /^classify[A-Za-z]*Runtime$/.test(d.name),
);
const classifyLines = classifyDefs.reduce((s, d) => s + d.nonblank, 0);
const classifyKept = Math.min(...classifyDefs.map((d) => d.nonblank));
log(
  `classifyXRuntime definitions: ${classifyDefs.length}; non-blank lines ${classifyLines}; keep one = ${classifyKept}; removable = ${classifyLines - classifyKept}`,
);
log(
  `F10 removable lines: strict flag lines 112 (census.sh) + redundant classifiers ${classifyLines - classifyKept} = ${112 + classifyLines - classifyKept}`,
);
log("");

// ---------- Corrected ledger (AUD-REDUCTION-FIX) ----------
log("## Corrected ledger (AUD-REDUCTION-FIX)");
const nb = (f) => nonblank(readText(f));
const keptParam =
  nb("app/workspace/[workspaceId]/parameters/page.tsx") +
  nb("app/workspace/[workspaceId]/parameters/parameter-manager.tsx") +
  nb("app/workspace/[workspaceId]/layout.tsx");
const keptParamActions = nb(
  "app/workspace/[workspaceId]/parameters/actions.ts",
);
const keptComponents =
  nb("components/theme-toggle.tsx") + nb("components/workspace-nav.tsx");
const transitionActions = nb(
  "app/workspace/[workspaceId]/client-setups/transition-actions.ts",
);
const f5Sum = [
  "lib/extraction/crosssheet.ts",
  "lib/extraction/redact.ts",
  "lib/extraction/source.ts",
  "lib/extraction/summaries.ts",
  "lib/extraction/theme.ts",
  "scripts/extract-sheets.ts",
].reduce((s, f) => s + nb(f), 0);
const f1Out = 11400 - keptParam,
  f2Out = 6023 - keptComponents;
const f3Net = Math.round((3908 - keptParamActions - transitionActions) / 2);
const f8Out = identicalBeyondFirst + isrLineTotal - isrKept;
const f10Out = 112 + classifyLines - classifyKept;
log(
  `F1 kept parameter shell (page + manager + layout): ${keptParam}; 11400 - ${keptParam} = ${f1Out}`,
);
log(
  `F2 kept with the parameter shell (theme-toggle + workspace-nav): ${keptComponents}; 6023 - ${keptComponents} = ${f2Out}`,
);
log(
  `F3 kept parameters/actions.ts: ${keptParamActions}; 3908 - ${keptParamActions} = ${3908 - keptParamActions} gross; minus transition-actions overlap ${transitionActions} = ${3908 - keptParamActions - transitionActions} unique; half of that = ${f3Net}`,
);
log(`F5 corrected delete list total: ${f5Sum}`);
log(
  `F8 corrected cut: ${f8Out}; F9 corrected cut (identical copies beyond the first): ${f9Beyond}; F10 corrected cut: ${f10Out}`,
);
const certain = f1Out + f2Out + f5Sum + 532 + 120 + 60;
const conditional = 2370 + f3Net + f8Out + f10Out + 200 + f9Beyond + 15;
const total = certain + conditional;
log(
  `ledger: certain ${certain}; conditional or estimate ${conditional}; total ${total}; percent of 60588 = ${((total / 60588) * 100).toFixed(1)}; remaining prod ${60588 - total}`,
);
log("");

console.log(out.join("\n"));
