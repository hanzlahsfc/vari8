import fs from "node:fs";
import path from "node:path";

import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";

import {
  buildComponents,
  buildDataModel,
  buildRoutes,
  buildSymbols,
  countFiles,
  frontendCompilerOptions,
  generatedRegion,
  indexProblems,
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
  // buildSymbols runs the full TypeScript-program scan (~seconds each
  // call); the output is deterministic within a test file, so compute it
  // once in beforeAll (10s hook budget) instead of inside each test
  // (5s budget the parallel suite kept blowing past).
  let symbols: string;
  beforeAll(() => {
    symbols = buildSymbols();
  });

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
      "| `/api/auth/[...all]` | `app/api/auth/[...all]/route.ts` | GET, POST |",
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
    // Canary on the page count: update the literal deliberately when a PR adds or
    // removes a page route, never by regenerating. 56 = 55 + the
    // app/(canvas)/client page landed with the frontend 9383578 port.
    expect(routes).toContain("Counts: 56 backend pages");
    // The same name collides inside spec/, which must be inventoried too: a
    // managed router exists for spec/ and its region carries no file counts.
    expect(
      fs.readFileSync(path.join(ROOT, "spec/AGENTS.md"), "utf8"),
    ).toContain("<!-- BEGIN GENERATED: scripts/index/generate.ts");
    expect(generatedRegion("spec")).toContain("Committed source layouts");
  });

  it("F2: indexes re-exports and matches an independent compiler count", () => {
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

  it("F5: keeps generated docs out of the directory's own file count", () => {
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
      "| `ClientRoster` | `frontend/src/components/ethereal/clients/client-roster.tsx` | /, /ethereal |";
    expect(buildComponents()).toContain(row);
    expect(
      fs.readFileSync(path.join(ROOT, "docs/index/COMPONENTS.md"), "utf8"),
    ).toContain(row);
  });

  it("pass 2: a router carries no file count and no subdirectory list", () => {
    const dirs = [
      "app",
      "components",
      "db",
      "docs",
      "icm",
      "lib",
      "scripts",
      "spec",
      "tests",
      "themes",
    ];
    for (const dir of dirs) {
      // The generator's own output must not carry either line...
      const region = generatedRegion(dir);
      expect(region, `${dir}/AGENTS.md`).not.toMatch(/Contents:/);
      expect(region, `${dir}/AGENTS.md`).not.toMatch(/Subdirectories:/);
      // ...and the committed router must be exactly that region.
      expect(
        fs.readFileSync(path.join(ROOT, dir, "AGENTS.md"), "utf8"),
      ).toContain(region);
    }
    // A lane committing a report under icm/ must not change the icm router, or
    // every such commit breaks `index:check`.
    const before = generatedRegion("icm");
    const probe = path.join(ROOT, "icm/05-build/reports/route-probe.md");
    expect(fs.existsSync(probe)).toBe(false);
    fs.writeFileSync(probe, "# probe\n");
    try {
      expect(generatedRegion("icm")).toBe(before);
    } finally {
      fs.rmSync(probe);
    }
    expect(generatedRegion("icm")).toBe(before);
  });

  it("pass 2: a layout's imports apply to every route beneath it", () => {
    const rows = buildComponents()
      .split("\n")
      .filter((line) =>
        line.includes("`frontend/src/components/motion-provider.tsx`"),
      );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      // Imported by the root layout, which wraps /, /client, /coach,
      // /dev/design-system (the frontend design system playground, dev only)
      // and /ethereal.
      expect(row).toBe(
        "| `MotionProvider` | `frontend/src/components/motion-provider.tsx` | /, /client, /coach, /dev/design-system, /ethereal |",
      );
    }
  });

  it("pass 2: COMPONENTS.md groups rows by canvas surface", () => {
    const md = buildComponents();
    const coachAt = md.indexOf("## Coach surface (`/coach`)");
    const etherealAt = md.indexOf("## Ethereal surface (`/`, `/ethereal`)");
    expect(coachAt).toBeGreaterThan(-1);
    expect(etherealAt).toBeGreaterThan(coachAt);
    const coach = md.slice(coachAt, etherealAt);
    const ethereal = md.slice(etherealAt);
    // "coach roster" resolves to the coach ClientsWorkspace in one read, and the
    // ethereal one is not in the coach section.
    expect(coach).toContain(
      "| `ClientsWorkspace` | `frontend/src/components/coach/clients.tsx` | /coach |",
    );
    expect(coach).not.toContain(
      "`frontend/src/components/ethereal/clients/clients-workspace.tsx`",
    );
    // "meal plan editor" shows both, each under its surface; the client app
    // reuses the coach NutritionEditor, so it maps to /client and /coach.
    expect(coach).toContain(
      "| `NutritionEditor` | `frontend/src/components/coach/plans/nutrition/editor.tsx` | /client, /coach |",
    );
    expect(ethereal).toContain(
      "| `MealplanWorkspace` | `frontend/src/components/ethereal/mealplan/mealplan-workspace.tsx` | /, /ethereal |",
    );
  });

  it("pass 2: index:check reports a missing hand-written index doc", () => {
    const readme = path.join(ROOT, "docs/index/README.md");
    const stash = `${readme}.n1-probe`;
    expect(fs.existsSync(readme)).toBe(true);
    expect(indexProblems()).toEqual([]);
    fs.renameSync(readme, stash);
    try {
      // The generator never writes this file, so a deletion is otherwise
      // invisible to the byte comparison.
      expect(indexProblems()).toContain("missing: docs/index/README.md");
    } finally {
      fs.renameSync(stash, readme);
    }
  }, 30_000);
});
