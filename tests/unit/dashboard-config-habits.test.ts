/**
 * HABITS-I1 (decision 110): TL21/TL22 become connected widget kinds.
 * `fields` carries habit IDs — bounded (≤8) opaque strings at the config
 * layer; habit-ID resolution lives in the habit boundary, not here.
 * RED: TL21/TL22 are not yet in CONNECTED_KINDS / connected catalogue.
 */
import { describe, expect, it } from "vitest";
import {
  CONNECTED_KINDS,
  WIDGET_CATALOGUE,
  validateDashboardConfig,
  defaultWidgetSettings,
} from "../../lib/dashboard/config-schema";

const habitWidget = (
  kind: "TL21" | "TL22",
  over: Record<string, unknown> = {},
) => ({
  id: "wh1",
  kind,
  settings: {
    ...defaultWidgetSettings(kind),
    visibility: "client" as const,
    ...over,
  },
});

const validConfig = (widget: unknown) => ({
  name: "Maya",
  widgets: [widget],
  layouts: {
    desktop: { wh1: { x: 0, y: 0, w: 4, h: 3, size: "Regular" } },
  },
  widths: { desktop: 1040 },
});

describe("TL21/TL22 connected kinds", () => {
  it("TL21 and TL22 are connected + catalogue-flagged", () => {
    expect(CONNECTED_KINDS.has("TL21")).toBe(true);
    expect(CONNECTED_KINDS.has("TL22")).toBe(true);
    expect(WIDGET_CATALOGUE.TL21.connected).toBe(true);
    expect(WIDGET_CATALOGUE.TL22.connected).toBe(true);
  });

  it("TL21/TL22 defaults validate: source habits, frozen allowlists", () => {
    for (const kind of ["TL21", "TL22"] as const) {
      const r = validateDashboardConfig(validConfig(habitWidget(kind)));
      expect(r.ok, kind).toBe(true);
    }
  });

  it("fields accepts ≤8 habit-id-shaped opaque strings", () => {
    const ids = Array.from({ length: 8 }, (_, i) => `habit-${i}`);
    const r = validateDashboardConfig(
      validConfig(habitWidget("TL22", { fields: ids })),
    );
    expect(r.ok).toBe(true);
  });

  it("fields rejects a 9th selection (existing cap preserved)", () => {
    const ids = Array.from({ length: 9 }, (_, i) => `habit-${i}`);
    const r = validateDashboardConfig(
      validConfig(habitWidget("TL22", { fields: ids })),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("fields");
  });

  it("empty fields is a valid all-cohort selection", () => {
    const r = validateDashboardConfig(
      validConfig(habitWidget("TL21", { fields: [] })),
    );
    expect(r.ok).toBe(true);
  });

  it("TL22 honours the frozen period/summary/option allowlists", () => {
    for (const period of ["today", "7d", "14d", "4w", "6w", "8w", "12w"])
      expect(
        validateDashboardConfig(
          validConfig(habitWidget("TL22", { period })),
        ).ok,
        period,
      ).toBe(true);
    for (const summary of ["scheduled-statuses", "completion-count"])
      expect(
        validateDashboardConfig(
          validConfig(habitWidget("TL22", { summary })),
        ).ok,
        summary,
      ).toBe(true);
    expect(
      validateDashboardConfig(
        validConfig(habitWidget("TL22", { period: "30d" })),
      ).ok,
    ).toBe(false);
    expect(
      validateDashboardConfig(
        validConfig(habitWidget("TL22", { summary: "percentage" })),
      ).ok,
    ).toBe(false);
  });
});
