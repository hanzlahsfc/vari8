/**
 * PR-M9 (D31): adapter between the canvas DashboardDraft and the persisted
 * client_dashboard_layout DashboardConfig.
 *
 * Guards what a browser cannot see (D14): the conversion contract at the
 * trust boundary — every canvas demo layout must convert and convert back
 * unchanged, and the 24-widget cap rejects a 25-widget draft.
 */
import { describe, expect, it } from "vitest";
import { draftToConfig, configToDraft } from "../../lib/dashboard/adapter";
import {
  CANVAS_CLIENT_DASHBOARD_DRAFT,
  CANVAS_STUDIO_DASHBOARD_DRAFT,
} from "../../scripts/seed/36-dashboard.seed";

describe("canvas draft -> persisted config", () => {
  it("every canvas demo layout converts and converts back unchanged", () => {
    for (const draft of [
      CANVAS_CLIENT_DASHBOARD_DRAFT,
      CANVAS_STUDIO_DASHBOARD_DRAFT,
    ]) {
      const toConfig = draftToConfig(draft);
      expect(toConfig.ok, draft.name).toBe(true);
      if (!toConfig.ok) continue;
      const back = configToDraft(toConfig.config);
      expect(back.ok).toBe(true);
      if (!back.ok) continue;
      expect(back.draft).toStrictEqual(draft);
    }
  });

  it("injects client visibility on the way in and strips it on the way out", () => {
    const toConfig = draftToConfig(CANVAS_CLIENT_DASHBOARD_DRAFT);
    if (!toConfig.ok) throw new Error(`conversion failed: ${toConfig.reason}`);
    for (const widget of toConfig.config.widgets)
      expect(widget.settings.visibility).toBe("client");
    const back = configToDraft(toConfig.config);
    if (!back.ok) throw new Error(`back-conversion failed: ${back.reason}`);
    for (const widget of back.draft.widgets)
      expect("visibility" in widget.settings).toBe(false);
  });

  it("rejects a draft at 25 widgets (cap is 24)", () => {
    const widgets = Array.from({ length: 25 }, (_, i) => ({
      id: `w${i}`,
      kind: "CU04" as const,
      settings: {
        title: "Check-in",
        source: "checkins",
        summary: "status",
        period: "30d",
        target: false,
        size: "Compact" as const,
        fields: [] as string[],
        option: "default",
        unit: "",
      },
    }));
    const layouts = Object.fromEntries(
      widgets.map((w, i) => [
        w.id,
        { x: 0, y: i * 3, w: 4, h: 3, size: "Compact" as const },
      ]),
    );
    const r = draftToConfig({
      version: 1,
      name: "over cap",
      widgets,
      layouts: { desktop: layouts },
      widths: { desktop: 1040 },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("widgets_count");
  });

  it("keeps optional settings verbatim: absent stays absent, present is kept", () => {
    const toConfig = draftToConfig(CANVAS_CLIENT_DASHBOARD_DRAFT);
    if (!toConfig.ok) throw new Error(`conversion failed: ${toConfig.reason}`);
    for (const widget of toConfig.config.widgets) {
      expect("labels" in widget.settings).toBe(false);
      expect("historyPeriod" in widget.settings).toBe(false);
    }
    const withOptionals = draftToConfig({
      ...CANVAS_CLIENT_DASHBOARD_DRAFT,
      widgets: CANVAS_CLIENT_DASHBOARD_DRAFT.widgets.map((w) => ({
        ...w,
        settings: { ...w.settings, historyPeriod: "6m", labels: {} },
      })),
      layouts: CANVAS_CLIENT_DASHBOARD_DRAFT.layouts,
    });
    if (!withOptionals.ok)
      throw new Error(`conversion failed: ${withOptionals.reason}`);
    for (const widget of withOptionals.config.widgets) {
      expect(widget.settings.historyPeriod).toBe("6m");
      expect(widget.settings.labels).toEqual({});
    }
  });
});
