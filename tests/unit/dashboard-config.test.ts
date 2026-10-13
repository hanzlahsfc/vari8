/**
 * DASHBOARD-I1 (decision 108): bounded allowlisted validation for the
 * persisted layout config — untrusted-input contract, not Lily's
 * structural isValidDraft.
 */
import { describe, expect, it } from "vitest";
import {
  validateDashboardConfig,
  projectClientDashboardConfig,
  canonicalizeDashboardConfig,
} from "../../lib/dashboard/config-schema";

const validWidget = (over: Record<string, unknown> = {}) => ({
  id: "w1",
  kind: "CU04",
  settings: {
    title: "Check-in",
    source: "checkins",
    summary: "status",
    period: "30d",
    historyPeriod: "auto",
    target: false,
    size: "Compact",
    fields: [],
    labels: {},
    option: "default",
    unit: "",
    visibility: "client",
    ...(over.settings as Record<string, unknown> | undefined),
  },
  ...Object.fromEntries(Object.entries(over).filter(([k]) => k !== "settings")),
});

const validConfig = () => ({
  name: "Maya",
  widgets: [validWidget()],
  layouts: {
    desktop: { w1: { x: 0, y: 0, w: 4, h: 3, size: "Compact" } },
  },
  widths: { desktop: 1040 },
});

describe("dashboard config validation", () => {
  it("accepts a well-formed config", () => {
    const r = validateDashboardConfig(validConfig());
    expect(r.ok).toBe(true);
  });

  it("rejects unknown widget kinds and keys", () => {
    expect(
      validateDashboardConfig({
        ...validConfig(),
        widgets: [validWidget({ kind: "XX99" })],
      }).ok,
    ).toBe(false);
    expect(
      validateDashboardConfig({
        ...validConfig(),
        widgets: [
          {
            ...validWidget(),
            settings: { ...validWidget().settings, inject: "<script>" },
          },
        ],
      }).ok,
    ).toBe(false);
  });

  it("rejects source/option/period outside the kind's allowlist", () => {
    const w = validWidget({
      settings: { source: "arbitrary:query" },
    });
    expect(validateDashboardConfig({ ...validConfig(), widgets: [w] }).ok).toBe(
      false,
    );
    const p = validWidget({ settings: { period: "99y" } });
    expect(validateDashboardConfig({ ...validConfig(), widgets: [p] }).ok).toBe(
      false,
    );
    const o = validWidget({ settings: { option: "bogus" } });
    expect(validateDashboardConfig({ ...validConfig(), widgets: [o] }).ok).toBe(
      false,
    );
  });

  it("enforces visibility enum and closed CU16 fields", () => {
    const v = validWidget({ settings: { visibility: "public" } });
    expect(validateDashboardConfig({ ...validConfig(), widgets: [v] }).ok).toBe(
      false,
    );
    const cu16 = validWidget({
      kind: "CU16" as const,
      settings: {
        source: "links",
        summary: "enabled",
        period: "",
        option: "default",
        fields: ["https://evil.example"] as string[],
      },
    });
    expect(
      validateDashboardConfig({ ...validConfig(), widgets: [cu16] }).ok,
    ).toBe(false);
    (cu16.settings as { fields: string[] }).fields = ["Tracker", "Check-in"];
    expect(
      validateDashboardConfig({ ...validConfig(), widgets: [cu16] }).ok,
    ).toBe(true);
  });

  it("enforces bounds: widgets, strings, arrays, geometry, rect coherence", () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      validWidget({ id: `w${i}` }),
    );
    expect(
      validateDashboardConfig({ ...validConfig(), widgets: many }).ok,
    ).toBe(false);
    const long = validWidget({ settings: { title: "x".repeat(81) } });
    expect(
      validateDashboardConfig({ ...validConfig(), widgets: [long] }).ok,
    ).toBe(false);
    // orphan rect (rect without matching widget)
    expect(
      validateDashboardConfig({
        ...validConfig(),
        layouts: {
          desktop: {
            ...validConfig().layouts.desktop,
            ghost: { x: 0, y: 0, w: 1, h: 3, size: "Compact" },
          },
        },
      }).ok,
    ).toBe(false);
    // widget missing a rect in a present breakpoint
    expect(
      validateDashboardConfig({
        ...validConfig(),
        widgets: [validWidget(), validWidget({ id: "w2" })],
      }).ok,
    ).toBe(false);
    // mobile rect must be full-width
    expect(
      validateDashboardConfig({
        ...validConfig(),
        layouts: {
          mobile: { w1: { x: 0, y: 0, w: 1, h: 3, size: "Compact" } },
        },
      }).ok,
    ).toBe(false);
  });

  it("rejects duplicate widget ids and oversized fields/labels", () => {
    expect(
      validateDashboardConfig({
        ...validConfig(),
        widgets: [validWidget(), validWidget()],
      }).ok,
    ).toBe(false);
    const f = validWidget({
      settings: { fields: Array(9).fill("a") },
    });
    expect(validateDashboardConfig({ ...validConfig(), widgets: [f] }).ok).toBe(
      false,
    );
  });
});

describe("client subset projection", () => {
  it("drops staff widgets + rects server-side; keeps client geometry coherent", () => {
    const cfg = {
      ...validConfig(),
      widgets: [
        validWidget({ id: "a", settings: { visibility: "client" } }),
        validWidget({
          id: "b",
          settings: { visibility: "staff" },
        }),
      ],
      layouts: {
        desktop: {
          a: { x: 0, y: 0, w: 4, h: 3, size: "Compact" },
          b: { x: 4, y: 0, w: 4, h: 3, size: "Compact" },
        },
      },
    };
    const r = validateDashboardConfig(cfg);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const proj = projectClientDashboardConfig(r.config);
    expect(proj.widgets.map((w) => w.id)).toEqual(["a"]);
    expect(Object.keys(proj.layouts.desktop ?? {})).toEqual(["a"]);
    // no staff settings survive — the object is the client shape only
    expect(JSON.stringify(proj)).not.toContain('"staff"');
  });
});

describe("canonical form", () => {
  it("canonicalize produces a stable string for equality", () => {
    const r = validateDashboardConfig(validConfig());
    if (!r.ok) throw new Error("invalid");
    expect(canonicalizeDashboardConfig(r.config)).toBe(
      canonicalizeDashboardConfig(r.config),
    );
  });
});

describe("hardened bounds (I1-R2)", () => {
  it("rejects input nested deeper than depth 6", () => {
    const r = validateDashboardConfig({ name: [[[[[["x"]]]]]] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("depth");
  });

  it("requires label keys ⊆ fields", () => {
    const w = validWidget({
      settings: { fields: [], labels: { ghost: "x" } },
    });
    expect(validateDashboardConfig({ ...validConfig(), widgets: [w] }).ok).toBe(
      false,
    );
  });

  it("isolates the 24-widget cap with otherwise coherent geometry", () => {
    const widgets = Array.from({ length: 25 }, (_, i) =>
      validWidget({ id: `w${i}` }),
    );
    const rects = Object.fromEntries(
      widgets.map((w, i) => [
        w.id,
        { x: 0, y: i * 3, w: 4, h: 3, size: "Compact" as const },
      ]),
    );
    expect(
      validateDashboardConfig({
        ...validConfig(),
        widgets,
        layouts: { desktop: rects },
      }).ok,
    ).toBe(false);
    // control: 24 passes
    const ok24 = widgets.slice(0, 24);
    expect(
      validateDashboardConfig({
        ...validConfig(),
        widgets: ok24,
        layouts: {
          desktop: Object.fromEntries(Object.entries(rects).slice(0, 24)),
        },
      }).ok,
    ).toBe(true);
  });

  it("client projection re-packs: removing staff widgets compacts the grid", () => {
    const cfg = {
      ...validConfig(),
      widgets: [
        validWidget({ id: "top", settings: { visibility: "staff" } }),
        validWidget({ id: "low", settings: { visibility: "client" } }),
      ],
      layouts: {
        desktop: {
          top: { x: 0, y: 0, w: 4, h: 3, size: "Compact" as const },
          low: { x: 0, y: 6, w: 4, h: 3, size: "Compact" as const },
        },
      },
    };
    const r = validateDashboardConfig(cfg);
    if (!r.ok) throw new Error("fixture invalid");
    const proj = projectClientDashboardConfig(r.config);
    // the surviving client widget is re-packed upward — no orphan gap
    expect(proj.layouts.desktop!.low.y).toBe(0);
  });
});
