export type DemoMode = "empty" | "loading" | "error" | "full";

export type ParsedDemo = {
  mode: DemoMode;
  value: string;
};

const demoModes = new Set<DemoMode>(["empty", "loading", "error", "full"]);

// Parses the ?demo= value once per request. Unknown values render the full
// state while keeping the raw value so a typo stays visible in the state line.
export function parseDemo(raw: string | string[] | undefined): ParsedDemo {
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim() || "full";
  const mode = demoModes.has(value as DemoMode) ? (value as DemoMode) : "full";
  return { mode, value };
}
