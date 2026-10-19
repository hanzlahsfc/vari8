import fs from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  buildComponents,
  buildDataModel,
  buildRoutes,
  buildSymbols,
  countFiles,
  frontendCompilerOptions,
  renderRouter,
  routePath,
  splitRegion,
} from "../../scripts/index/generate";

const ROOT = path.resolve(import.meta.dirname, "../..");
const MARK =
  "<!-- BEGIN GENERATED: scripts/index/generate.ts (npm run index) -->";
const END = "<!-- END GENERATED -->";

/** Every file under a directory, for the independent counts below. */
function walkAll(dirAbs: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dirAbs, entry.name);
    if (entry.isDirectory()) walkAll(full, out);
    else out.push(full);
  }
  return out;
}

describe("system index generator", () => {
  it("derives route paths the way the App Router does", () => {
    expect(
      routePath(
        "app",
        path.join(ROOT, "app/(tracker)/workspace/[workspaceId]/daily/page.tsx"),
      ),
    ).toBe("/workspace/[workspaceId]/daily");
    expect(routePath("app", path.join(ROOT, "app/page.tsx"))).toBe("/");
    expect(
      routePath(
        "frontend/src/app",
        path.join(ROOT, "frontend/src/app/coach/page.tsx"),
      ),
    ).toBe("/coach");
  });

  it("lists a route group page under its real path with the guard it calls", () => {
    const routes = buildRoutes();
    const row = routes
      .split("\n")
      .find((line) =>
        line.includes("`app/(tracker)/workspace/[workspaceId]/daily/page.tsx`"),
      );
    expect(row).toBe(
      "| `/workspace/[workspaceId]/daily` | `app/(tracker)/workspace/[workspaceId]/daily/page.tsx` | server | requireDailyTrackerAccess + requireSessionUser (some via layout) |",
    );
    expect(routes).toContain("## Backend API routes (`app/api/`)");
    expect(routes).toContain(
      "| `/api/auth/[...nextauth]` | `app/api/auth/[...nextauth]/route.ts` | GET, POST |",
    );
  });

  it("lists models from the real Prisma schema", () => {
    const model = buildDataModel();
    expect(model).toContain("### Workspace");
    expect(model).toContain("| `slug` | `String` | scalar | `@unique` |");
    expect(model).toContain(
      "| `members` | `WorkspaceMember[]` | relation | - |",
    );
  });

  it("prints one-line signatures from the compiler and never an absolute path", () => {
    const symbols = buildSymbols();
    expect(symbols).toContain(
      "`export type AuditAction = (typeof AUDIT_ACTIONS)[number]`",
    );
    expect(symbols).toContain(
      "`export function isSerializationConflict(error: unknown): boolean`",
    );
    expect(symbols).not.toContain(ROOT);
  });

  it("rewrites only the marked block and keeps hand-written router text", () => {
    const existing = `# AGENTS.md - lib/\n\n${MARK}\nold generated line\n${END}\n\nHand notes stay.\n`;
    const rendered = renderRouter(
      "lib",
      `${MARK}\nnew generated line\n${END}`,
      existing,
    );
    expect(rendered).toBe(
      `# AGENTS.md - lib/\n\n${MARK}\nnew generated line\n${END}\n\nHand notes stay.\n`,
    );
  });

  it("refuses to touch an AGENTS.md that has no markers", () => {
    expect(splitRegion("# AGENTS.md\n\nhand written only\n")).toBeNull();
    expect(() =>
      renderRouter("lib", `${MARK}\nx\n${END}`, "hand written only\n"),
    ).toThrow(/markers/);
  });

  it("leaves a real generated router inside the line budget", () => {
    for (const dir of ["app", "lib", "docs", "tests"]) {
      const file = path.join(ROOT, dir, "AGENTS.md");
      if (!fs.existsSync(file)) continue;
      const lines = fs.readFileSync(file, "utf8").trimEnd().split("\n");
      expect(
        lines.length,
        `${dir}/AGENTS.md is ${lines.length} lines`,
      ).toBeLessThanOrEqual(25);
    }
  });

  it("F1: indexes a route-segment directory such as app/sheets", () => {
    const routes = buildRoutes();
    expect(routes).toContain("| `/sheets` | `app/sheets/page.tsx` |");
    expect(routes).toContain(
      "| `/sheets/[slug]` | `app/sheets/[slug]/page.tsx` |",
    );
    expect(routes).toContain("Counts: 48 backend pages");
    // The same name collides inside spec/, which must be inventoried too.
    expect(
      fs.readFileSync(path.join(ROOT, "spec/AGENTS.md"), "utf8"),
    ).toContain("sheets/ (");
  });

  it("F2: indexes re-exports and matches an independent compiler count", () => {
    const symbols = buildSymbols();
    expect(symbols).toContain("## `frontend/src/lib/utils.ts`");
    expect(symbols).toContain('- `export { cn } from "cn"`');
    expect(symbols).toContain(
      '- `export type { WorkspaceRole } from "./rbac"`',
    );

    const files = ["lib", "frontend/src/lib"]
      .flatMap((dir) =>
        walkAll(path.join(ROOT, dir)).filter(
          (f) => /\.(ts|tsx)$/.test(f) && !/\.d\.ts$/.test(f),
        ),
      )
      .filter((f) => !/(^|\/)[^/]+\.(test|spec)\.tsx?$/.test(f));
    const program = ts.createProgram(files, {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.Preserve,
      skipLibCheck: true,
      noEmit: true,
      allowJs: false,
    });
    const checker = program.getTypeChecker();
    let modules = 0;
    let names = 0;
    for (const file of files) {
      const sf = program.getSourceFile(file);
      const symbol = sf ? checker.getSymbolAtLocation(sf) : undefined;
      if (!symbol) continue;
      const exported = checker.getExportsOfModule(symbol);
      if (exported.length > 0) modules += 1;
      names += exported.length;
    }
    expect(symbols).toContain(
      `Counts: ${modules} modules with exports, ${names} exported symbols.`,
    );
  });

  it("F3: resolves @/ in the canvas tree against frontend/src", () => {
    const resolved = ts.resolveModuleName(
      "@/data/mock-data.json",
      path.join(ROOT, "frontend/src/lib/coaching-data.ts"),
      frontendCompilerOptions(),
      ts.sys,
    );
    expect(resolved.resolvedModule?.resolvedFileName).toBe(
      path.join(ROOT, "frontend/src/data/mock-data.json"),
    );
  });

  it("F4: points the icm router at a file that exists", () => {
    const router = fs.readFileSync(path.join(ROOT, "icm/AGENTS.md"), "utf8");
    expect(router).not.toContain("icm/CONTEXT.md");
    expect(router).toContain("repo-root `CONTEXT.md`");
    expect(fs.existsSync(path.join(ROOT, "CONTEXT.md"))).toBe(true);
  });

  it("F5: keeps generated docs out of the docs/ router count", () => {
    const docsAbs = path.join(ROOT, "docs");
    const all = walkAll(docsAbs).filter(
      (f) => path.basename(f) !== "AGENTS.md",
    );
    const generated = all.filter((f) =>
      /\/docs\/index\/(ROUTES|SYMBOLS|DATA-MODEL|GLOSSARY|COMPONENTS)\.md$/.test(
        f,
      ),
    );
    expect(generated.length).toBe(5);
    expect(countFiles(docsAbs)).toBe(all.length - generated.length);
  });

  it("F7: treats auth() and getSession() as a session read", () => {
    const row = buildRoutes()
      .split("\n")
      .find((line) => line.startsWith("| `/invite` |"));
    expect(row).toContain("| auth |");
  });

  it("F9: names the canvas component behind a screen element", () => {
    const row =
      "| `ClientRoster` | `frontend/src/components/ethereal/clients/client-roster.tsx` |";
    expect(buildComponents()).toContain(row);
    expect(
      fs.readFileSync(path.join(ROOT, "docs/index/COMPONENTS.md"), "utf8"),
    ).toContain(row);
  });
});
