// Read-only reuse of the existing collision, resizing and placement engine.
export * from "../../ethereal/builder/grid";

import type { Breakpoint } from "../../ethereal/builder/grid";
// The Coach editor has persistent navigation. Use its canvas width for breakpoints.
export function getBreakpoint(width: number): Breakpoint {
  if (width >= 760) return "desktop";
  if (width >= 640) return "tablet";
  return "mobile";
}
