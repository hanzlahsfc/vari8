import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildDataModel,
  buildRoutes,
  buildSymbols,
  renderRouter,
  routePath,
  splitRegion,
} from "../../scripts/index/generate";

const ROOT = path.resolve(import.meta.dirname, "../..");
const MARK =
  "<!-- BEGIN GENERATED: scripts/index/generate.ts (npm run index) -->";
const END = "<!-- END GENERATED -->";

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
});
