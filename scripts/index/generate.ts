#!/usr/bin/env node
/**
 * System index generator (issue #62).
 *
 * Writes, deterministically:
 *   docs/index/ROUTES.md       every Next route in `app/` and `frontend/src/app`
 *   docs/index/SYMBOLS.md      exported symbols per module in `lib/` and `frontend/src/lib`
 *   docs/index/DATA-MODEL.md   Prisma models, fields and relations from `db/schema.prisma`
 *   docs/index/GLOSSARY.md     seed domain terms + live feature flags
 *   <top-dir>/AGENTS.md        short router for top-level directories that lack one
 *
 * Usage:
 *   npm run index            write the index in place
 *   npm run index:check      generate into a temp dir and exit 1 on any drift
 *
 * Determinism rules: no timestamps, no absolute paths, no locale collation
 * (plain code-point `<`), every list sorted, and the emitted keys of each
 * section are asserted monotonic before the file is written. Two consecutive
 * runs are byte-identical; that is what `index:check` enforces.
 */
import { createHash as nodeCreateHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import ts from "typescript";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const DOCS_INDEX = "docs/index";
const MARK_BEGIN =
  "<!-- BEGIN GENERATED: scripts/index/generate.ts (npm run index) -->";
const MARK_END = "<!-- END GENERATED -->";
const ROUTER_HINT =
  "<!-- Hand-written notes go below this line. Everything outside the two markers\n" +
  "     is preserved verbatim by `npm run index`; only the generated block is rewritten. -->";

/** Directories never given a router and never scanned. */
const SKIP_DIRS = new Set([
  ".git",
  ".next",
  ".vscode",
  ".hermes",
  "node_modules",
  "out",
  "build",
  "coverage",
  "test-results",
  "playwright-report",
  "sources",
  "exports",
  "sheets",
  "local-sources",
  "raw",
  ".raw-extraction",
  ".local-raw",
]);

/** One-line purpose per top-level directory. Curated: update when a directory's role changes. */
const DIR_PURPOSE: Record<string, string> = {
  app: "Next.js App Router surface for the backend app (pages, layouts, server actions, API routes).",
  components:
    "Shared React components for the backend app. Server components unless marked `use client`.",
  db: "Prisma schema and migrations. One migration per model change; never edit an applied migration.",
  docs: "Product, security and task documents. `docs/STATUS.md` is the implementation state of record.",
  frontend:
    "Lilly's canvas app (Ethereal/coach UI). Authoritative for screens, elements and look (AGENTS.md source authority 0).",
  icm: "ICM workspace stages: recon, gap matrix, plan, briefing, build, verify. Read `icm/CONTEXT.md` first.",
  lib: "Server-side domain services, authorization, consent and feature gates. No UI, no React.",
  scripts:
    "Runnable maintenance and import scripts (`tsx scripts/<name>.ts`). Includes the system index generator.",
  spec: "Committed source layouts, redacted sheet extracts and extraction contracts.",
  tests:
    "Vitest unit tests (`tests/unit`), DB integration tests (`tests/integration`), Playwright e2e (`tests/e2e`).",
  themes: "Backend app theme CSS token sets (`pro-dark.css`, `pro-white.css`).",
};

const MARKDOWN_HEADER = (title: string, extra: string[] = []): string =>
  [
    `# ${title}`,
    "",
    "Generated file. Do not edit by hand: changes are overwritten by `npm run index`.",
    "Verify the committed copy is current with `npm run index:check` (exit 1 = drift).",
    ...extra,
    "",
  ].join("\n");

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const collapse = (s: string): string => s.replace(/\s+/g, " ").trim();
/** Drop comments from a source slice so a signature stays a signature. */
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|\s)\/\/[^\n]*/g, "$1");
/** Comment-free, whitespace-collapsed source text. */
const rawText = (s: string): string => collapse(stripComments(s));
const rel = (p: string): string =>
  path.relative(ROOT, p).split(path.sep).join("/");
const cut = (s: string, max: number): string =>
  s.length > max ? `${s.slice(0, max - 3)}...` : s;

function assertSorted(where: string, keys: string[]): void {
  // Deliberately independent of `cmp`: asserting order with the same
  // comparator that produced it would be tautological.
  for (let i = 1; i < keys.length; i += 1) {
    if (keys[i - 1] > keys[i]) {
      throw new Error(
        `${where}: output is not stable-sorted at index ${i}: ${keys[i - 1]} > ${keys[i]}`,
      );
    }
  }
}

function walkFiles(dirAbs: string, keep: (name: string) => boolean): string[] {
  const out: string[] = [];
  const visit = (d: string): void => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile() && keep(entry.name)) out.push(full);
    }
  };
  if (fs.existsSync(dirAbs)) visit(dirAbs);
  return out.sort(cmp);
}

function dirsIn(dirAbs: string): string[] {
  if (!fs.existsSync(dirAbs)) return [];
  return fs
    .readdirSync(dirAbs, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name))
    .map((e) => e.name)
    .sort(cmp);
}

function countFiles(dirAbs: string): number {
  // The router itself never counts toward its own inventory, so the numbers do
  // not depend on whether the router has been generated yet.
  return walkFiles(dirAbs, (n) => n !== "AGENTS.md").length;
}

function splitRegion(
  text: string,
): { before: string; region: string; after: string } | null {
  const start = text.indexOf(MARK_BEGIN);
  const end = text.indexOf(MARK_END);
  if (start < 0 || end < 0 || end < start) return null;
  return {
    before: text.slice(0, start),
    region: text.slice(start, end + MARK_END.length),
    after: text.slice(end + MARK_END.length),
  };
}

// ---------------------------------------------------------------------------
// ROUTES.md
// ---------------------------------------------------------------------------

type RouteRow = {
  app: "backend" | "canvas";
  path: string;
  kind: "page" | "layout" | "api";
  file: string;
  render: string;
  auth: string;
  note: string;
};

const APP_ROOTS: { dir: string; label: "backend" | "canvas" }[] = [
  { dir: "app", label: "backend" },
  { dir: "frontend/src/app", label: "canvas" },
];

const GUARD_RE =
  /\b(require[A-Za-z]*Access|requireSessionUser|requireSheetViewer)\s*\(/g;

function guardsIn(fileAbs: string): string[] {
  const text = fs.readFileSync(fileAbs, "utf8");
  const found = new Set<string>();
  for (const m of text.matchAll(GUARD_RE)) found.add(m[1]);
  return [...found].sort(cmp);
}

/** Local guard calls plus every ancestor `layout.tsx` guard, nearest first. */
function authFor(appDir: string, fileRel: string): string {
  const guards = new Set(guardsIn(path.join(ROOT, fileRel)));
  let viaLayout = false;
  let dir = path.dirname(path.join(ROOT, fileRel));
  const stop = path.join(ROOT, appDir);
  while (dir.startsWith(stop) && dir !== path.dirname(stop)) {
    const layout = path.join(dir, "layout.tsx");
    const relLayout = rel(layout);
    if (
      layout !== path.join(ROOT, fileRel) &&
      fs.existsSync(layout) &&
      relLayout !== fileRel
    ) {
      const g = guardsIn(layout);
      if (g.length > 0) {
        viaLayout = true;
        for (const name of g) guards.add(name);
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  if (guards.size === 0) {
    return "none detected";
  }
  const list = [...guards].sort(cmp).join(" + ");
  return viaLayout ? `${list} (some via layout)` : list;
}

function routePath(appDir: string, fileAbs: string): string {
  const dirRel = path.relative(path.join(ROOT, appDir), path.dirname(fileAbs));
  const segments = dirRel
    .split(path.sep)
    .filter((s) => s.length > 0 && !/^\(.*\)$/.test(s) && !s.startsWith("@"));
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

function methodsOf(fileAbs: string): string[] {
  const text = fs.readFileSync(fileAbs, "utf8");
  const methods = new Set<string>();
  const verb =
    /\bexport\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;
  for (const m of text.matchAll(verb)) methods.add(m[1]);
  const destructured = /\bexport\s+const\s*\{([^}]+)\}/g;
  for (const m of text.matchAll(destructured)) {
    for (const part of m[1].split(",")) {
      const name = part.split(":")[0].trim();
      if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(name))
        methods.add(name);
    }
  }
  return [...methods].sort(cmp);
}

function titleOf(fileAbs: string): string {
  const text = fs.readFileSync(fileAbs, "utf8");
  const m = /\btitle:\s*"([^"]+)"/.exec(text);
  return m ? `title: ${m[1]}` : "";
}

function isClient(fileAbs: string): boolean {
  const head = fs.readFileSync(fileAbs, "utf8").slice(0, 400);
  return /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(
    head,
  );
}

function buildRoutes(): string {
  const rows: RouteRow[] = [];
  const groups = new Set<string>();

  for (const app of APP_ROOTS) {
    const appAbs = path.join(ROOT, app.dir);
    for (const fileAbs of walkFiles(appAbs, (n) =>
      /^(page|layout|route)\.(tsx|ts|jsx|js)$/.test(n),
    )) {
      const base = path.basename(fileAbs);
      const kind: RouteRow["kind"] = base.startsWith("route.")
        ? "api"
        : base.startsWith("layout.")
          ? "layout"
          : "page";
      const fileRel = rel(fileAbs);
      const routeDir = path.dirname(fileAbs);
      for (const seg of path.relative(appAbs, routeDir).split(path.sep)) {
        if (/^\(.+\)$/.test(seg)) groups.add(seg);
      }
      rows.push({
        app: app.label,
        path: routePath(app.dir, fileAbs),
        kind,
        file: fileRel,
        render: isClient(fileAbs) ? "client" : "server",
        auth: authFor(app.dir, fileRel),
        note:
          kind === "api"
            ? methodsOf(fileAbs).join(", ") || "-"
            : titleOf(fileAbs) || "-",
      });
    }
  }
  rows.sort(
    (a, b) =>
      cmp(a.app, b.app) ||
      cmp(a.path, b.path) ||
      cmp(a.kind, b.kind) ||
      cmp(a.file, b.file),
  );
  assertSorted(
    "ROUTES.md",
    rows.map((r) => `${r.app}\u0000${r.path}\u0000${r.kind}\u0000${r.file}`),
  );

  const apiSection = (): string[] => {
    const picked = rows.filter((r) => r.app === "backend" && r.kind === "api");
    if (picked.length === 0) return [];
    return [
      "## Backend API routes (`app/api/`)",
      "",
      "| Path | File | Methods | Auth (detected) |",
      "|---|---|---|---|",
      ...picked.map(
        (r) => `| \`${r.path}\` | \`${r.file}\` | ${r.note} | ${r.auth} |`,
      ),
      "",
    ];
  };

  const groupList = [...groups].sort(cmp);
  const canvasRoots =
    rows
      .filter((r) => r.app === "canvas" && r.kind === "layout")
      .map((r) => `\`${r.file}\``)
      .join(", ") || "none found";
  const counts = {
    backendPages: rows.filter((r) => r.app === "backend" && r.kind === "page")
      .length,
    api: rows.filter((r) => r.app === "backend" && r.kind === "api").length,
    layouts: rows.filter((r) => r.app === "backend" && r.kind === "layout")
      .length,
    canvas: rows.filter((r) => r.app === "canvas" && r.kind === "page").length,
  };

  return [
    MARKDOWN_HEADER("ROUTES.md - Next route index", [
      "",
      "Source: page/layout/route files under `app/` (backend) and `frontend/src/app/` (canvas).",
      `Counts: ${counts.backendPages} backend pages, ${counts.api} API routes, ${counts.layouts} layouts, ${counts.canvas} canvas pages.`,
      "",
      "Columns: `server`/`client` comes from the `use client` directive; `Auth (detected)` lists the",
      "guard helpers called by the route file or one of its ancestor layouts. Detection is textual:",
      "treat a missing guard as unverified, and read `lib/auth/route-guard.ts` for real enforcement.",
      "",
      `Route groups (do not add a path segment): ${groupList.length === 0 ? "none" : groupList.map((g) => `\`${g}\``).join(", ")}.`,
    ]),
    "## Backend pages (`app/`)",
    "",
    "| Path | File | Rendered | Auth (detected) |",
    "|---|---|---|---|",
    ...rows
      .filter((r) => r.app === "backend" && r.kind === "page")
      .map(
        (r) => `| \`${r.path}\` | \`${r.file}\` | ${r.render} | ${r.auth} |`,
      ),
    "",
    ...apiSection(),
    "## Backend layouts (`app/`)",
    "",
    "Layouts enforce the guards below for every route beneath them.",
    "",
    "| Path | File | Rendered | Auth (detected) |",
    "|---|---|---|---|",
    ...rows
      .filter((r) => r.app === "backend" && r.kind === "layout")
      .map(
        (r) => `| \`${r.path}\` | \`${r.file}\` | ${r.render} | ${r.auth} |`,
      ),
    "",
    "## Canvas pages (`frontend/src/app/`)",
    "",
    "Lilly's canvas app. It is authoritative for screens and appearance; the backend is built to serve it.",
    "",
    "| Path | File | Rendered | Auth (detected) |",
    "|---|---|---|---|",
    ...rows
      .filter((r) => r.app === "canvas" && r.kind === "page")
      .map(
        (r) => `| \`${r.path}\` | \`${r.file}\` | ${r.render} | ${r.auth} |`,
      ),
    "",
    `Canvas root layout (wraps every canvas page, no guard): ${canvasRoots}`,
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// SYMBOLS.md
// ---------------------------------------------------------------------------

type Sym = { name: string; kind: string; sig: string };

const SYMBOL_ROOTS = ["lib", "frontend/src/lib"];
const MAX_SIG = 200;

function sanitizeType(s: string): string | null {
  if (!s) return null;
  if (s.includes(ROOT)) return null;
  if (/\bany\b/.test(s)) return null;
  // `import("/abs/or/relative/path").Name` -> `Name`
  const cleaned = collapse(
    s
      .replace(/import\("[^"]*"\)\./g, "")
      .replace(/\btypeof\s+import\("[^"]*"\)/g, "typeof"),
  );
  if (cleaned.length === 0 || cleaned.length > MAX_SIG) return null;
  return cut(cleaned, MAX_SIG);
}

function returnTypeOf(
  node: ts.SignatureDeclaration,
  checker: ts.TypeChecker,
): string | null {
  const sig = checker.getSignatureFromDeclaration(node);
  if (!sig) return null;
  return sanitizeType(
    checker.typeToString(
      sig.getReturnType(),
      node,
      ts.TypeFormatFlags.NoTruncation,
    ),
  );
}

function sliceText(node: ts.Node, stop: number, sf: ts.SourceFile): string {
  return rawText(sf.text.slice(node.getStart(sf), stop));
}

function callableSignature(
  node: ts.Node,
  sf: ts.SourceFile,
  checker: ts.TypeChecker,
): string {
  const fn = node as ts.FunctionLikeDeclaration;
  const arrow = ts.isArrowFunction(node) || ts.isFunctionExpression(node);
  let head = sliceText(
    node,
    fn.body ? fn.body.getStart(sf) : node.getEnd(),
    sf,
  );
  if (arrow) head = head.replace(/=>$/, "").trimEnd();
  if (!fn.type) {
    const rt = returnTypeOf(fn as ts.SignatureDeclaration, checker);
    if (rt) head += `: ${rt}`;
  }
  if (arrow) head += " =>";
  return cut(head, MAX_SIG);
}

function variableSym(
  decl: ts.VariableDeclaration,
  sf: ts.SourceFile,
  checker: ts.TypeChecker,
): Sym {
  const name = decl.name.getText(sf);
  const list = decl.parent as ts.VariableDeclarationList;
  const kw = (list.flags & ts.NodeFlags.Const) !== 0 ? "const" : "let";
  const kind = "value";
  if (decl.type) {
    return {
      name,
      kind,
      sig: `export ${kw} ${name}: ${cut(rawText(decl.type.getText(sf)), MAX_SIG)}`,
    };
  }
  const init = decl.initializer;
  if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
    return {
      name,
      kind,
      sig: cut(
        `export ${kw} ${name} = ${callableSignature(init, sf, checker)}`,
        MAX_SIG,
      ),
    };
  }
  const inferred = sanitizeType(
    checker.typeToString(
      checker.getTypeAtLocation(decl.name),
      decl,
      ts.TypeFormatFlags.NoTruncation,
    ),
  );
  if (inferred) return { name, kind, sig: `export ${kw} ${name}: ${inferred}` };
  if (init)
    return {
      name,
      kind,
      sig: cut(`export ${kw} ${name} = ${rawText(init.getText(sf))}`, MAX_SIG),
    };
  return { name, kind, sig: `export ${kw} ${name}` };
}

function symbolsOf(sf: ts.SourceFile, checker: ts.TypeChecker): Sym[] {
  const out: Sym[] = [];
  for (const stmt of sf.statements) {
    const mods = ts.canHaveModifiers(stmt) ? ts.getModifiers(stmt) : undefined;
    const exported = (mods ?? []).some(
      (m) => m.kind === ts.SyntaxKind.ExportKeyword,
    );
    if (!exported) continue;
    if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      out.push({
        name: stmt.name.text,
        kind: "function",
        sig: callableSignature(stmt, sf, checker),
      });
    } else if (ts.isClassDeclaration(stmt) && stmt.name) {
      const heritage = (stmt.heritageClauses ?? [])
        .map((h) => collapse(h.getText(sf)))
        .join(" ");
      const head = [`export class ${stmt.name.text}`, heritage]
        .filter(Boolean)
        .join(" ");
      out.push({
        name: stmt.name.text,
        kind: "class",
        sig: cut(`${head} (${stmt.members.length} members)`, MAX_SIG),
      });
    } else if (ts.isInterfaceDeclaration(stmt)) {
      const heritage = (stmt.heritageClauses ?? [])
        .map((h) => collapse(h.getText(sf)))
        .join(" ");
      const head = [`export interface ${stmt.name.text}`, heritage]
        .filter(Boolean)
        .join(" ");
      out.push({
        name: stmt.name.text,
        kind: "interface",
        sig: cut(`${head} (${stmt.members.length} members)`, MAX_SIG),
      });
    } else if (ts.isTypeAliasDeclaration(stmt)) {
      out.push({
        name: stmt.name.text,
        kind: "type",
        sig: cut(
          `export type ${stmt.name.text}${collapse(
            stmt.typeParameters
              ? `<${stmt.typeParameters.map((t) => t.getText(sf)).join(", ")}>`
              : "",
          )} = ${rawText(stmt.type.getText(sf))}`,
          MAX_SIG,
        ),
      });
    } else if (ts.isEnumDeclaration(stmt)) {
      const members = stmt.members.map((m) => m.name.getText(sf));
      const shown = members.slice(0, 8).join(", ");
      const suffix = members.length > 8 ? `, +${members.length - 8} more` : "";
      out.push({
        name: stmt.name.text,
        kind: "enum",
        sig: cut(
          `export enum ${stmt.name.text} { ${shown}${suffix} }`,
          MAX_SIG,
        ),
      });
    } else if (ts.isModuleDeclaration(stmt)) {
      out.push({
        name: stmt.name.getText(sf),
        kind: "namespace",
        sig: `export namespace ${stmt.name.getText(sf)}`,
      });
    } else if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) ||
          ts.isObjectBindingPattern(decl.name) ||
          ts.isArrayBindingPattern(decl.name)
        ) {
          out.push(variableSym(decl, sf, checker));
        }
      }
    }
  }
  out.sort(
    (a, b) => cmp(a.name, b.name) || cmp(a.kind, b.kind) || cmp(a.sig, b.sig),
  );
  return out;
}

function compilerOptions(): ts.CompilerOptions {
  return {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.Preserve,
    strict: true,
    skipLibCheck: true,
    esModuleInterop: true,
    resolveJsonModule: true,
    allowJs: false,
    noEmit: true,
    baseUrl: ROOT,
    paths: { "@/*": ["./*"] },
  };
}

function buildSymbols(): string {
  const files = SYMBOL_ROOTS.flatMap((dir) =>
    walkFiles(
      path.join(ROOT, dir),
      (n) => /\.(ts|tsx)$/.test(n) && !/\.d\.ts$/.test(n),
    ),
  ).filter((f) => !/(^|\/)[^/]+\.(test|spec)\.tsx?$/.test(rel(f)));

  const program = ts.createProgram(files, compilerOptions());
  const checker = program.getTypeChecker();

  const modules: { file: string; symbols: Sym[] }[] = [];
  for (const fileAbs of files) {
    const sf = program.getSourceFile(fileAbs);
    if (!sf) continue;
    const symbols = symbolsOf(sf, checker);
    if (symbols.length > 0) modules.push({ file: rel(fileAbs), symbols });
  }
  modules.sort((a, b) => cmp(a.file, b.file));
  assertSorted(
    "SYMBOLS.md",
    modules.map((m) => m.file),
  );

  const total = modules.reduce((n, m) => n + m.symbols.length, 0);
  const body: string[] = [];
  for (const mod of modules) {
    body.push(`## \`${mod.file}\``, "");
    for (const s of mod.symbols) {
      body.push(`- \`${s.sig}\``);
    }
    body.push("");
  }

  return [
    MARKDOWN_HEADER("SYMBOLS.md - exported symbol index", [
      "",
      "Source: TypeScript compiler API over `lib/**` and `frontend/src/lib/**`.",
      `Counts: ${modules.length} modules with exports, ${total} exported symbols.`,
      "",
      `Signatures are one line, collapsed from source and cut at ${MAX_SIG} characters with a trailing \`...\`.`,
      "Inferred types are omitted when the compiler cannot state them self-containedly (unresolved imports,",
      "`any`, absolute paths, or an inferred type longer than the cap), so a line is never checkout-specific.",
      'Imported type names are shown without their `import("...")` prefix.',
    ]),
    ...body,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// DATA-MODEL.md
// ---------------------------------------------------------------------------

type PrismaField = {
  name: string;
  type: string;
  kind: "scalar" | "enum" | "relation" | "unsupported";
  attrs: string;
};

type PrismaModel = {
  name: string;
  line: number;
  fields: PrismaField[];
  constraints: string[];
};

const SCALARS = new Set([
  "String",
  "Int",
  "BigInt",
  "Float",
  "Decimal",
  "Boolean",
  "DateTime",
  "Json",
  "Bytes",
]);

function parsePrisma(): {
  models: PrismaModel[];
  enums: { name: string; line: number; values: string[] }[];
} {
  const file = path.join(ROOT, "db/schema.prisma");
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const models: PrismaModel[] = [];
  const enums: { name: string; line: number; values: string[] }[] = [];

  let current: PrismaModel | null = null;
  let currentEnum: { name: string; line: number; values: string[] } | null =
    null;

  for (const [i, raw] of lines.entries()) {
    const line = raw.trim();
    const lineNo = i + 1;
    const modelStart = /^model\s+(\w+)\s*\{/.exec(line);
    const enumStart = /^enum\s+(\w+)\s*\{/.exec(line);
    if (modelStart) {
      current = {
        name: modelStart[1],
        line: lineNo,
        fields: [],
        constraints: [],
      };
      continue;
    }
    if (enumStart) {
      currentEnum = { name: enumStart[1], line: lineNo, values: [] };
      continue;
    }
    if (line === "}") {
      if (current) models.push(current);
      if (currentEnum) enums.push(currentEnum);
      current = null;
      currentEnum = null;
      continue;
    }
    if (currentEnum && /^[A-Za-z_]\w*$/.test(line)) {
      currentEnum.values.push(line);
      continue;
    }
    if (!current || line.length === 0 || line.startsWith("//")) continue;
    if (line.startsWith("@@")) {
      current.constraints.push(collapse(line));
      continue;
    }
    const field = /^(\w+)\s+([A-Za-z_][\w.]*)(\[\])?(\?)?\s*(.*)$/.exec(line);
    if (!field) continue;
    const [, name, baseType, listFlag, optFlag, attrs] = field;
    const type = `${baseType}${listFlag ?? ""}${optFlag ?? ""}`;
    current.fields.push({
      name,
      type,
      kind: "unsupported",
      attrs: collapse(attrs),
    });
  }

  const modelNames = new Set(models.map((m) => m.name));
  const enumNames = new Set(enums.map((e) => e.name));
  for (const model of models) {
    for (const field of model.fields) {
      const base = field.type.replace(/\[\]|\?/g, "");
      if (SCALARS.has(base)) field.kind = "scalar";
      else if (enumNames.has(base)) field.kind = "enum";
      else if (modelNames.has(base)) field.kind = "relation";
    }
  }
  models.sort((a, b) => cmp(a.name, b.name));
  enums.sort((a, b) => cmp(a.name, b.name));
  return { models, enums };
}

function buildDataModel(): string {
  const { models, enums } = parsePrisma();
  assertSorted(
    "DATA-MODEL.md",
    models.map((m) => m.name),
  );

  const summary = [
    "## Models",
    "",
    "| Model | Fields | Relations | Source |",
    "|---|---|---|---|",
    ...models.map((m) => {
      const links = m.fields.filter((f) => f.kind === "relation").length;
      return `| [\`${m.name}\`](#${m.name.toLowerCase()}) | ${m.fields.length} | ${links} | \`db/schema.prisma:${m.line}\` |`;
    }),
    "",
    "## Enums",
    "",
    ...enums.map(
      (e) =>
        `- \`${e.name}\` (\`db/schema.prisma:${e.line}\`): ${e.values.join(", ")}`,
    ),
    "",
    "## Model detail",
    "",
  ];

  const detail: string[] = [];
  for (const model of models) {
    detail.push(
      `### ${model.name}`,
      "",
      `\`db/schema.prisma:${model.line}\` - ${model.fields.length} fields, ` +
        `${model.fields.filter((f) => f.kind === "relation").length} relations.` +
        (model.constraints.length > 0
          ? ` Constraints: ${model.constraints.map((c) => `\`${c}\``).join(", ")}.`
          : ""),
      "",
      "| Field | Type | Kind | Attributes |",
      "|---|---|---|---|",
    );
    for (const field of model.fields) {
      detail.push(
        `| \`${field.name}\` | \`${field.type}\` | ${field.kind} | ${field.attrs ? `\`${field.attrs}\`` : "-"} |`,
      );
    }
    detail.push("");
  }

  const scalarCount = models.reduce(
    (n, m) => n + m.fields.filter((f) => f.kind === "scalar").length,
    0,
  );
  const relationCount = models.reduce(
    (n, m) => n + m.fields.filter((f) => f.kind === "relation").length,
    0,
  );
  return [
    MARKDOWN_HEADER("DATA-MODEL.md - Prisma data dictionary", [
      "",
      "Source: `db/schema.prisma`.",
      `Counts: ${models.length} models, ${enums.length} enums, ${scalarCount} scalar fields, ${relationCount} relation fields.`,
      "",
      "`Kind` is derived from the field type: `scalar` (Prisma scalar), `enum` (schema enum), `relation`",
      "(another model's name; a field carrying `@relation(fields: ...)` is the foreign-key side, one",
      "without it is the back-relation). Migrations live in `db/migrations/`; never edit an applied one.",
    ]),
    ...summary,
    ...detail,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// GLOSSARY.md
// ---------------------------------------------------------------------------

type GlossarySeed = {
  note?: string;
  specPath?: string;
  specSha256?: string;
  slices: { id: string; title: string; definition: string }[];
  terms: { term: string; definition: string; ref: string }[];
};

const SEED_PATH = "scripts/index/glossary-seed.json";
const SEED_SPEC_REF = "icm/02-gap-matrix/output/F1/WIRING-SPEC.md";
/** Hand-written files inside docs/index that the stale check must not flag. */
const HAND_WRITTEN_INDEX = new Set([`${DOCS_INDEX}/README.md`]);
const FLAG_RE = /\bENABLE_[A-Z0-9_]+\b/g;

function seededGlossary(): GlossarySeed {
  return JSON.parse(
    fs.readFileSync(path.join(ROOT, SEED_PATH), "utf8"),
  ) as GlossarySeed;
}

/** Feature flags read by code, with the first file that reads each one. */
function liveFlags(): { flag: string; where: string; mode: string }[] {
  const out = new Map<string, { flag: string; where: string; mode: string }>();
  const files = [
    ...walkFiles(path.join(ROOT, "app"), (n) => /\.(ts|tsx)$/.test(n)),
    ...walkFiles(path.join(ROOT, "lib"), (n) => /\.(ts|tsx)$/.test(n)),
  ].sort(cmp);
  for (const fileAbs of files) {
    const text = fs.readFileSync(fileAbs, "utf8");
    for (const m of text.matchAll(FLAG_RE)) {
      if (out.has(m[0])) continue;
      const runtimeGated =
        /classify\w*Runtime|APP_ENV/.test(text) && /production/i.test(text);
      out.set(m[0], {
        flag: m[0],
        where: rel(fileAbs),
        mode: runtimeGated
          ? "flag + trusted APP_ENV, fails closed"
          : "flag only, read the resolver",
      });
    }
  }
  return [...out.values()].sort((a, b) => cmp(a.flag, b.flag));
}

function buildGlossary(): string {
  const seed = seededGlossary();
  const slices = [...seed.slices].sort((a, b) => cmp(a.id, b.id));
  const terms = [...seed.terms].sort((a, b) =>
    cmp(a.term.toLowerCase(), b.term.toLowerCase()),
  );
  const flags = liveFlags();
  assertSorted(
    "GLOSSARY.md slices",
    slices.map((s) => s.id),
  );
  assertSorted(
    "GLOSSARY.md terms",
    terms.map((t) => t.term.toLowerCase()),
  );
  assertSorted(
    "GLOSSARY.md flags",
    flags.map((f) => f.flag),
  );

  const provenance = seed.specPath
    ? [
        "",
        `Slice vocabulary is seeded from \`${seed.specPath}\` (that file is kept outside this`,
        `repository; recorded sha256 \`${seed.specSha256 ?? "unknown"}\`).`,
        "Re-extract it with `npx tsx scripts/index/generate.ts --refresh-glossary --spec <file> --ref <repo path label>`.",
        `Curated terms live in \`${SEED_PATH}\`; edit there, then run \`npm run index\`.`,
      ]
    : [];

  return [
    MARKDOWN_HEADER("GLOSSARY.md - program and domain vocabulary", [
      "Terms an agent meets in this repo, each with where the authoritative definition lives.",
      ...provenance,
    ]),
    "## Domain terms",
    "",
    ...terms.map((t) => `- **${t.term}** - ${t.definition} (\`${t.ref}\`)`),
    "",
    "## Program slices",
    "",
    "Slice ids from the F1 wiring spec, as used in `icm/` cards and plans.",
    "",
    "| Id | Slice | What it delivers |",
    "|---|---|---|",
    ...slices.map((s) => `| \`${s.id}\` | ${s.title} | ${s.definition} |`),
    "",
    "## Feature flags",
    "",
    "Generated from `ENABLE_*` reads in `app/**` and `lib/**`. Every gate is flag AND trusted runtime;",
    "see `icm/03-plan/DECISIONS.md` and the `gate.ts` file in each domain.",
    "",
    "| Flag | First read in | Enforcement |",
    "|---|---|---|",
    ...flags.map((f) => `| \`${f.flag}\` | \`${f.where}\` | ${f.mode} |`),
    "",
    "## Where more detail lives",
    "",
    "- Routes and guards: `docs/index/ROUTES.md`.",
    "- Exported symbols per module: `docs/index/SYMBOLS.md`.",
    "- Prisma models and fields: `docs/index/DATA-MODEL.md`.",
    "- Locked product decisions: `docs/product-decisions.md`; program decisions: `icm/03-plan/DECISIONS.md`.",
    "- Product state of record: `docs/STATUS.md`.",
    "",
  ].join("\n");
}

/** Re-extract slice terms from the F1 wiring spec and rewrite the seed's `slices` array. */
function refreshGlossary(specFile: string, specRef: string): void {
  const text = fs.readFileSync(specFile, "utf8");
  const lines = text.split("\n");
  const slices: GlossarySeed["slices"] = [];
  let section = "";
  for (let i = 0; i < lines.length; i += 1) {
    const heading = /^##\s+\d+\.\s+(.+)$/.exec(lines[i]);
    if (heading) {
      section = heading[1].trim().replace(/\.$/, "");
      continue;
    }
    const item =
      /^\*\*([A-Z]+[0-9]+(?:\.[a-z])?)\.\s+([^*]+?)\.\*\*\s*(.*)$/.exec(
        lines[i],
      );
    const tableRow = /^\|\s*((?:W|B)[0-9]+)\s*\|(.+)\|\s*$/.exec(lines[i]);
    if (tableRow) {
      const cells = tableRow[2]
        .split("|")
        .map((c) => collapse(c.replace(/^-+$/, "")));
      slices.push({
        id: tableRow[1],
        title: cells[0] || tableRow[1],
        definition: cut(
          cells
            .slice(1)
            .filter((c) => c.length > 0)
            .join("; "),
          180,
        ),
      });
      continue;
    }
    if (!item) continue;
    // A bullet in the spec wraps across physical lines; join its continuation
    // lines so the definition is a whole sentence, not its first line.
    let definition = "";
    for (let j = i + 1; j < lines.length && definition.length === 0; j += 1) {
      const line = lines[j].trim();
      if (/^\*\*|^#{2,3}\s/.test(line)) break;
      if (line.startsWith("- ")) {
        const parts = [line.slice(2)];
        for (let k = j + 1; k < lines.length; k += 1) {
          const next = lines[k];
          if (
            next.trim().length === 0 ||
            /^\s*[-*#|]/.test(next) ||
            /^\S/.test(next)
          )
            break;
          parts.push(next.trim());
        }
        definition = collapse(parts.join(" "));
      }
    }
    if (definition.length === 0) {
      definition = collapse(
        item[3]
          .replace(/^Effort\s+\w+\.\s*/, "")
          .replace(/^Depends on[^.]*\.\s*/, ""),
      );
    }
    slices.push({
      id: item[1],
      title: collapse(item[2]),
      definition: cut(
        definition.length > 0
          ? definition
          : `${section}: no summary line in the spec.`,
        180,
      ),
    });
  }
  const file = path.join(ROOT, SEED_PATH);
  const seed = JSON.parse(fs.readFileSync(file, "utf8")) as GlossarySeed;
  seed.specPath = specRef;
  seed.specSha256 = createHash(text);
  seed.slices = slices.sort((a, b) => cmp(a.id, b.id));
  fs.writeFileSync(file, `${JSON.stringify(seed, null, 2)}\n`);
}

function createHash(text: string): string {
  // Node stdlib only; no dependency added for one hash.
  return nodeCreateHash("sha256").update(text).digest("hex");
}

// ---------------------------------------------------------------------------
// AGENTS.md routers
// ---------------------------------------------------------------------------

const ROUTER_MAX_LINES = 25;

function packList(items: string[], width = 96): string[] {
  const lines: string[] = [];
  let line = "";
  for (const item of items) {
    if (line.length === 0) line = item;
    else if (line.length + 2 + item.length <= width) line += `, ${item}`;
    else {
      lines.push(`${line},`);
      line = item;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

function routerTargets(): string[] {
  return fs
    .readdirSync(ROOT, { withFileTypes: true })
    .filter(
      (e) =>
        e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith("."),
    )
    .map((e) => e.name)
    .filter((name) => {
      const file = path.join(ROOT, name, "AGENTS.md");
      if (!fs.existsSync(file)) return true;
      // A router this generator created stays managed; a hand-written AGENTS.md is left alone.
      return fs.readFileSync(file, "utf8").includes(MARK_BEGIN);
    })
    .filter((name) => countFiles(path.join(ROOT, name)) > 0)
    .sort(cmp);
}

function generatedRegion(dir: string): string {
  const dirAbs = path.join(ROOT, dir);
  const files = walkFiles(dirAbs, (n) => n !== "AGENTS.md");
  const subdirs = dirsIn(dirAbs).map(
    (d) => `${d}/ (${countFiles(path.join(dirAbs, d))})`,
  );
  const rootFiles = fs
    .readdirSync(dirAbs, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name !== "AGENTS.md")
    .map((e) => e.name)
    .sort(cmp);
  const purpose =
    DIR_PURPOSE[dir] ?? "No curated purpose yet; inspect the listing below.";
  const packed = packList(subdirs);
  const pointers = indexPointers(dir);

  const body: string[] = [
    MARK_BEGIN,
    `Purpose: ${purpose}`,
    `Contents: ${files.length} files${subdirs.length > 0 ? ` in ${subdirs.length} subdirectories` : ""}.`,
    ...(packed.length === 0
      ? []
      : [
          `Subdirectories: ${packed[0]}`,
          ...packed.slice(1).map((line) => `  ${line}`),
        ]),
    `Top-level files: ${packList(rootFiles).join("\n  ")}`,
    pointers.length > 0
      ? `Read next: ${pointers} while working in here. Repo-wide index: docs/index/README.md.`
      : "Read next: docs/index/README.md while working in here.",
    "Rules: see the repo-root AGENTS.md and CONTEXT.md.",
    MARK_END,
  ];
  return body.join("\n");
}

function indexPointers(dir: string): string {
  const base = "docs/index/";
  if (dir === "app" || dir === "frontend") return `${base}ROUTES.md`;
  if (dir === "lib") return `${base}SYMBOLS.md`;
  if (dir === "db") return `${base}DATA-MODEL.md`;
  if (dir === "docs" || dir === "icm") return `${base}GLOSSARY.md`;
  return "";
}

function renderRouter(
  dir: string,
  region: string,
  existing: string | null,
): string {
  if (existing === null) {
    return `# AGENTS.md - ${dir}/\n\n${region}\n\n${ROUTER_HINT}\n`;
  }
  const parts = splitRegion(existing);
  if (parts === null) {
    throw new Error(
      `${dir}/AGENTS.md exists without the generated markers; add them or delete the file`,
    );
  }
  return `${parts.before}${region}${parts.after}`;
}

function assertRouterFits(dir: string, content: string): void {
  const lines = content.split("\n");
  const count =
    lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
  if (count > ROUTER_MAX_LINES) {
    throw new Error(
      `${dir}/AGENTS.md would be ${count} lines (max ${ROUTER_MAX_LINES}); shrink the generated inventory`,
    );
  }
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

type Output = { relPath: string; content: string; router: boolean };

function buildAll(): Output[] {
  const out: Output[] = [
    {
      relPath: `${DOCS_INDEX}/ROUTES.md`,
      content: buildRoutes(),
      router: false,
    },
    {
      relPath: `${DOCS_INDEX}/SYMBOLS.md`,
      content: buildSymbols(),
      router: false,
    },
    {
      relPath: `${DOCS_INDEX}/DATA-MODEL.md`,
      content: buildDataModel(),
      router: false,
    },
    {
      relPath: `${DOCS_INDEX}/GLOSSARY.md`,
      content: buildGlossary(),
      router: false,
    },
  ];
  for (const dir of routerTargets()) {
    const region = generatedRegion(dir);
    out.push({ relPath: `${dir}/AGENTS.md`, content: region, router: true });
  }
  out.sort((a, b) => cmp(a.relPath, b.relPath));
  assertSorted(
    "output paths",
    out.map((o) => o.relPath),
  );
  return out;
}

function writeOut(baseDir: string, outputs: Output[]): void {
  for (const output of outputs) {
    const target = path.join(baseDir, output.relPath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (!output.router) {
      fs.writeFileSync(target, output.content);
      continue;
    }
    const dir = output.relPath.split("/")[0];
    // Hand-written text always comes from the repo copy, so a temp-dir run
    // reproduces exactly what an in-place run would leave on disk.
    const source = path.join(ROOT, output.relPath);
    const existing = fs.existsSync(source)
      ? fs.readFileSync(source, "utf8")
      : null;
    const content = renderRouter(dir, output.content, existing);
    assertRouterFits(dir, content);
    fs.writeFileSync(target, content);
  }
}

function listIndexFiles(): string[] {
  const dirAbs = path.join(ROOT, DOCS_INDEX);
  if (!fs.existsSync(dirAbs)) return [];
  return fs
    .readdirSync(dirAbs)
    .filter((n) => n.endsWith(".md"))
    .map((n) => `${DOCS_INDEX}/${n}`)
    .sort(cmp);
}

function check(): number {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vari8-index-"));
  const problems: string[] = [];
  try {
    const outputs = buildAll();
    writeOut(tmp, outputs);
    for (const output of outputs) {
      const expected = fs.readFileSync(path.join(tmp, output.relPath), "utf8");
      const onDiskPath = path.join(ROOT, output.relPath);
      if (!fs.existsSync(onDiskPath)) {
        problems.push(`missing: ${output.relPath}`);
        continue;
      }
      const onDisk = fs.readFileSync(onDiskPath, "utf8");
      if (onDisk !== expected) {
        problems.push(
          `drifted: ${output.relPath}${firstDiffLine(onDisk, expected)}`,
        );
      }
    }
    const generatedDocs = new Set(
      outputs.filter((o) => !o.router).map((o) => o.relPath),
    );
    for (const file of listIndexFiles()) {
      if (generatedDocs.has(file) || HAND_WRITTEN_INDEX.has(file)) continue;
      problems.push(`stale: ${file} is not produced by the generator`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  if (problems.length > 0) {
    process.stderr.write(
      `index:check FAILED (${problems.length} problem${problems.length === 1 ? "" : "s"})\n`,
    );
    for (const p of problems) process.stderr.write(`  ${p}\n`);
    process.stderr.write(
      "Fix: npm run index (then commit docs/index/ and the routers).\n",
    );
    return 1;
  }
  const docs = listIndexFiles().length;
  process.stdout.write(
    `index:check OK: ${docs} index docs and all AGENTS.md routers match the generator output.\n`,
  );
  return 0;
}

function firstDiffLine(a: string, b: string): string {
  const left = a.split("\n");
  const right = b.split("\n");
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    if (left[i] !== right[i])
      return ` at line ${i + 1}\n    on disk: ${left[i] ?? "<eof>"}\n    generated: ${right[i] ?? "<eof>"}`;
  }
  return "";
}

function main(argv: string[]): number {
  const args = argv.slice(2);
  const flagValue = (name: string): string | undefined => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  if (args.includes("--refresh-glossary")) {
    const specRef = flagValue("--ref") ?? SEED_SPEC_REF;
    const specFile = path.resolve(ROOT, flagValue("--spec") ?? specRef);
    refreshGlossary(specFile, specRef);
    process.stdout.write(`rewrote ${SEED_PATH} slices from ${specFile}\n`);
    return 0;
  }
  if (args.includes("--check")) return check();

  const outputs = buildAll();
  writeOut(ROOT, outputs);
  const docs = outputs.filter((o) => !o.router).length;
  const routers = outputs.length - docs;
  process.stdout.write(
    `index: wrote ${docs} docs and ${routers} AGENTS.md routers\n`,
  );
  return 0;
}

if (process.argv[1] && /generate\.ts$/.test(process.argv[1])) {
  process.exit(main(process.argv));
}

export {
  buildAll,
  buildDataModel,
  buildGlossary,
  buildRoutes,
  buildSymbols,
  check,
  generatedRegion,
  renderRouter,
  routePath,
  splitRegion,
};
