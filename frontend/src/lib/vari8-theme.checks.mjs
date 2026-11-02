import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  contrastRatio,
  normalizeAccent,
  VARI8_SURFACES,
  vari8Theme,
} from "./vari8-theme.ts";

const requiredRoles = [
  "canvas",
  "surface",
  "surface-subtle",
  "surface-raised",
  "surface-navigation",
  "surface-inset",
  "surface-interactive",
  "surface-selected",
  "surface-featured",
  "surface-overlay",
  "field",
  "text",
  "text-secondary",
  "text-tertiary",
  "border",
  "border-control",
  "action",
  "action-hover",
  "action-active",
  "action-border",
  "on-action",
  "accent",
  "accent-raw",
  "accent-text",
  "accent-soft",
  "accent-spotlight",
  "accent-primary",
  "accent-hover",
  "accent-pressed",
  "accent-subtle",
  "accent-surface",
  "accent-border",
  "accent-highlight",
  "accent-glow",
  "accent-gradient-start",
  "accent-gradient-end",
  "accent-chart-line",
  "accent-chart-fill",
  "accent-focus",
  "on-accent",
  "on-accent-soft",
  "on-danger",
  "focus",
  "chart",
  "positive",
  "warning",
  "danger",
  "info",
];

const accents = [
  "#000000",
  "#FFFFFF",
  "#FF0000",
  "#00FF00",
  "#0000FF",
  "#FFFF00",
  "#00FFFF",
  "#FF00FF",
  "#808080",
  "#BEB2FC",
  "#EB91B8",
  "#FF2D8D",
  "#20D9CF",
  "#FF8A3D",
  "#B6F23D",
  "#F4F4EF",
  "#101C54",
  "#123456",
  "#FEDCBA",
];

function role(theme, name) {
  return theme[`--v8-${name}`];
}

function isAchromatic(hex) {
  const channels = [1, 3, 5].map((index) =>
    Number.parseInt(hex.slice(index, index + 2), 16),
  );
  // Cool-neutral roles (e.g. #A1A1A8) may tint a few points without color.
  return Math.max(...channels) - Math.min(...channels) <= 8;
}

function mixHex(first, second, amount) {
  return `#${[1, 3, 5]
    .map((index) =>
      Math.round(
        Number.parseInt(first.slice(index, index + 2), 16) +
          (Number.parseInt(second.slice(index, index + 2), 16) -
            Number.parseInt(first.slice(index, index + 2), 16)) *
            amount,
      )
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`.toUpperCase();
}

const tokensCss = readFileSync(
  new URL("../styles/vari8-tokens.css", import.meta.url),
  "utf8",
);
const componentsCss = readFileSync(
  new URL("../components/vari8/components.css", import.meta.url),
  "utf8",
);

function chartAreaOpacity() {
  const themeRule = tokensCss.match(/\.v8-theme\s*\{([^}]+)\}/)?.[1];
  const value = themeRule?.match(
    /--v8-chart-area-opacity:\s*(\d+(?:\.\d+)?);/,
  )?.[1];
  assert.ok(value, "theme tokens must define the chart area opacity");
  return Number(value);
}

function primaryGradientRoles() {
  const primaryRule = componentsCss.match(
    /\.v8-theme\s*:where\(\.v8-button\[data-variant=["']primary["']\]\)\s*\{([^}]+)\}/,
  )?.[1];
  assert.ok(primaryRule, "primary button CSS must define its gradient");
  const roles = [
    "accent-gradient-start",
    "accent-primary",
    "accent-gradient-end",
  ];
  for (const name of roles)
    assert.ok(
      primaryRule.includes(`var(--v8-${name})`),
      `primary gradient must consume --v8-${name}`,
    );
  return roles;
}

function assertPrimaryGradientReadable(theme, context) {
  for (const name of primaryGradientRoles())
    assert.ok(
      contrastRatio(role(theme, "on-accent"), role(theme, name)) >= 5,
      `${context}: on-accent needs 5:1 on rendered primary gradient stop ${name}`,
    );
}

function darken(hex, factor) {
  return `#${[1, 3, 5]
    .map((index) =>
      Math.round(Number.parseInt(hex.slice(index, index + 2), 16) * factor)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`.toUpperCase();
}

test("normalizeAccent accepts valid short and full hex colors only", () => {
  assert.equal(normalizeAccent("  #abc "), "#AABBCC");
  assert.equal(normalizeAccent("a1B2c3"), "#A1B2C3");
  for (const invalid of ["", "red", "#12", "#1234", "#1234567", "#ggg"])
    assert.equal(normalizeAccent(invalid), null, invalid);
});

test("theme resolver exposes all named semantic roles as concrete hex values", () => {
  for (const mode of ["light", "dark"]) {
    const theme = vari8Theme({ mode, accent: "#6E55D8" });
    for (const name of requiredRoles) {
      const value = role(theme, name);
      assert.match(value, /^#[\dA-F]{6}$/, `${name} should be a concrete hex`);
    }
  }
});

test("theme resolver preserves each selected accent separately from derived roles", () => {
  for (const mode of ["light", "dark"]) {
    for (const accent of accents) {
      const theme = vari8Theme({ mode, accent });
      assert.equal(role(theme, "accent-raw"), normalizeAccent(accent));
      assert.equal(role(theme, "accent-raw"), role(theme, "accent"));
    }
  }
});

test("fixed neutral surface, text, and border roles stay achromatic in both modes", () => {
  const neutralRoles = [
    ...VARI8_SURFACES.filter(
      (name) => name !== "accent-soft" && name !== "accent-spotlight",
    ),
    "text",
    "text-secondary",
    "text-tertiary",
    "text-muted",
    "border",
    "border-control",
  ];
  for (const mode of ["light", "dark"]) {
    const theme = vari8Theme({ mode, accent: "#EB91B8" });
    for (const name of neutralRoles)
      assert.ok(
        isAchromatic(role(theme, name)),
        `${mode} ${name} must be a neutral gray, got ${role(theme, name)}`,
      );
  }
});

test("accent spotlight is an opaque accent-derived surface in both modes", () => {
  for (const mode of ["light", "dark"]) {
    const amount = mode === "dark" ? 0.28 : 0.1;
    const first = vari8Theme({ mode, accent: "#663399" });
    const second = vari8Theme({ mode, accent: "#00AACC" });
    assert.match(role(first, "accent-spotlight"), /^#[\dA-F]{6}$/);
    assert.equal(
      role(first, "accent-spotlight"),
      mixHex(role(first, "surface-subtle"), role(first, "accent-raw"), amount),
    );
    assert.notEqual(
      role(first, "accent-spotlight"),
      role(second, "accent-spotlight"),
      `${mode} spotlight should follow the selected raw accent`,
    );
    for (const surfaceName of VARI8_SURFACES) {
      const surface = role(first, surfaceName);
      for (const textName of [
        "text",
        "text-secondary",
        "text-tertiary",
        "accent-text",
        "on-accent-soft",
      ])
        assert.ok(
          contrastRatio(role(first, textName), surface) >= 4.5,
          `${mode} ${textName} on ${surfaceName} needs 4.5:1`,
        );
      for (const boundaryName of [
        "action-border",
        "border-control",
        "focus",
        "chart",
      ])
        assert.ok(
          contrastRatio(role(first, boundaryName), surface) >= 3,
          `${mode} ${boundaryName} on ${surfaceName} needs 3:1`,
        );
    }
  }
});

test("fixed material surfaces do not change when the accent changes", () => {
  const fixedSurfaces = [
    "canvas",
    "surface-navigation",
    "surface",
    "surface-subtle",
    "surface-raised",
    "surface-inset",
    "surface-interactive",
    "surface-selected",
    "surface-featured",
    "surface-overlay",
    "field",
  ];
  for (const mode of ["light", "dark"]) {
    const baseline = vari8Theme({ mode, accent: "#BEB2FC" });
    for (const accent of [
      "#FF2D8D",
      "#20D9CF",
      "#FF8A3D",
      "#B6F23D",
      "#F4F4EF",
      "#101C54",
    ]) {
      const theme = vari8Theme({ mode, accent });
      for (const surfaceName of fixedSurfaces) {
        assert.equal(
          role(theme, surfaceName),
          role(baseline, surfaceName),
          `${mode} ${surfaceName} must be independent of ${accent}`,
        );
        assert.ok(
          isAchromatic(role(theme, surfaceName)),
          `${mode} ${surfaceName} must remain achromatic`,
        );
      }
    }
  }
});

test("new accent roles preserve aliases and lighting contrast", () => {
  for (const mode of ["light", "dark"]) {
    for (const accent of accents) {
      const theme = vari8Theme({ mode, accent });
      assert.equal(role(theme, "accent-primary"), role(theme, "action"));
      assert.equal(role(theme, "accent-hover"), role(theme, "action-hover"));
      assert.equal(role(theme, "accent-pressed"), role(theme, "action-active"));
      assert.equal(role(theme, "on-accent"), role(theme, "on-action"));
      assert.equal(role(theme, "accent-border"), role(theme, "action-border"));
      assert.equal(role(theme, "accent-focus"), role(theme, "focus"));
      assert.equal(role(theme, "accent-chart-line"), role(theme, "chart"));
      for (const state of ["accent-primary", "accent-hover", "accent-pressed"])
        assert.ok(
          contrastRatio(role(theme, "on-accent"), role(theme, state)) >= 5,
          `${mode} ${accent}: on-accent needs 5:1 on ${state}`,
        );
      for (const endpoint of ["accent-glow", "accent-chart-fill"])
        assert.ok(
          contrastRatio(
            role(theme, "accent-chart-line"),
            role(theme, endpoint),
          ) >= 3,
          `${mode} ${accent}: chart line needs 3:1 over ${endpoint}`,
        );
      for (const textName of [
        "text",
        "text-secondary",
        "text-tertiary",
        "accent-text",
      ])
        assert.ok(
          contrastRatio(role(theme, textName), role(theme, "accent-glow")) >=
            4.5,
          `${mode} ${accent}: ${textName} needs 4.5:1 on accent glow`,
        );
      for (const surfaceName of VARI8_SURFACES)
        assert.ok(
          contrastRatio(
            role(theme, "accent-border"),
            role(theme, surfaceName),
          ) >= 3,
          `${mode} ${accent}: accent border needs 3:1 on ${surfaceName}`,
        );
    }
  }
});

test("dark purple accents remain the action fill with white readable labels", () => {
  for (const accent of ["#663399", "#5B21B6", "#6750A4", "#806FAA"]) {
    for (const mode of ["light", "dark"]) {
      const theme = vari8Theme({ mode, accent });
      assert.equal(role(theme, "accent-raw"), normalizeAccent(accent));
      if (accent !== "#806FAA")
        assert.equal(role(theme, "action"), normalizeAccent(accent));
      assert.equal(role(theme, "on-action"), "#FFFFFF");
      assertPrimaryGradientReadable(theme, `${mode} ${accent}`);
      for (const state of ["action-hover", "action-active"])
        assert.ok(
          contrastRatio(role(theme, "on-action"), role(theme, state)) >= 5,
          `${mode} ${accent}: on-action needs a 5:1 margin on ${state}`,
        );
    }
  }
});

test("bright and pale action accents use black labels and keep the raw preference", () => {
  for (const accent of ["#BEB2FC", "#FFFFFF", "#00FF00"]) {
    for (const mode of ["light", "dark"]) {
      const theme = vari8Theme({ mode, accent });
      assert.equal(role(theme, "accent-raw"), normalizeAccent(accent));
      assert.equal(role(theme, "on-action"), "#000000");
      for (const state of ["action", "action-hover", "action-active"])
        assert.ok(
          contrastRatio(role(theme, "on-action"), role(theme, state)) >= 5,
          `${mode} ${accent}: on-action needs a 5:1 margin on ${state}`,
        );
    }
  }
});

test("action boundary stays visible without forcing every fill to contrast with surfaces", () => {
  const theme = vari8Theme({ mode: "light", accent: "#BEB2FC" });
  assert.equal(role(theme, "action"), normalizeAccent("#BEB2FC"));
  for (const surfaceName of VARI8_SURFACES)
    assert.ok(
      contrastRatio(role(theme, "action-border"), role(theme, surfaceName)) >=
        3,
      `action-border on ${surfaceName} needs 3:1`,
    );
});

test("material and elevation CSS tokens use achromatic values in each mode", () => {
  for (const mode of ["light", "dark"]) {
    const selector = new RegExp(
      `\\.v8-theme\\[data-mode=["']${mode}["']\\]\\s*\\{([^}]+)\\}`,
    );
    const block = tokensCss.match(selector)?.[1];
    assert.ok(block, `expected a mode-scoped ${mode} material token block`);
    for (const name of [
      "material-highlight",
      "material-shade",
      "material-edge-highlight",
      "material-neutral-gloss",
      "elevation-card",
      "elevation-control",
      "elevation-overlay",
    ]) {
      const value = block.match(new RegExp(`--v8-${name}:\\s*([^;]+);`))?.[1];
      assert.ok(value, `${mode} must define --v8-${name}`);
      const colors = [...value.matchAll(/rgb\(\s*(\d+)\s+(\d+)\s+(\d+)/g)];
      assert.ok(
        colors.length > 0,
        `${mode} --v8-${name} must include an explicit neutral shadow/highlight`,
      );
      for (const [, red, green, blue] of colors) {
        assert.equal(
          red,
          green,
          `${mode} --v8-${name} red/green channels must match`,
        );
        assert.equal(
          green,
          blue,
          `${mode} --v8-${name} green/blue channels must match`,
        );
      }
    }
  }
});

test("semantic typography tokens retain distinct role-based sizes", () => {
  const themeRule = tokensCss.match(/\.v8-theme\s*\{([^}]+)\}/)?.[1];
  assert.ok(themeRule, "theme tokens must define the role-based type scale");
  for (const [name, value] of [
    ["font-size-card-heading", "0.9375rem"],
    ["font-size-body", "0.9375rem"],
    ["font-size-label", "0.8125rem"],
    ["font-size-supporting", "0.75rem"],
    ["font-size-table", "0.875rem"],
    ["font-size-metric-large", "2.5rem"],
  ])
    assert.match(
      themeRule,
      new RegExp(`--v8-${name}:\\s*${value.replace(".", "\\.")};`),
    );
});

test("app material background is the flat neutral canvas", () => {
  const themeRule = tokensCss.match(/\.v8-theme\s*\{([^}]+)\}/)?.[1];
  const recipe = themeRule?.match(/--v8-material-app:\s*([\s\S]*?);/)?.[1];
  assert.ok(recipe, "theme tokens must define the reusable app background");
  assert.match(recipe, /^var\(--v8-canvas\)$/);
  assert.doesNotMatch(
    recipe,
    /radial-gradient|linear-gradient|accent|surface-raised|text-muted/,
  );
});

test("all accent and text roles meet contrast against every rendered same-mode surface", () => {
  for (const mode of ["light", "dark"]) {
    for (const accent of accents) {
      const theme = vari8Theme({ mode, accent });
      for (const surfaceName of VARI8_SURFACES) {
        const surface = role(theme, surfaceName);
        assert.ok(
          contrastRatio(
            role(theme, "chart"),
            mixHex(surface, role(theme, "chart"), chartAreaOpacity()),
          ) >= 3,
          `${mode} ${accent}: chart stroke over its ${surfaceName} fill needs 3:1`,
        );
        for (const textName of [
          "text",
          "text-secondary",
          "text-tertiary",
          "accent-text",
          "on-accent-soft",
        ])
          assert.ok(
            contrastRatio(role(theme, textName), surface) >= 4.5,
            `${mode} ${accent}: ${textName} on ${surfaceName} needs 4.5:1`,
          );
        for (const boundaryName of [
          "action-border",
          "border-control",
          "focus",
          "chart",
        ])
          assert.ok(
            contrastRatio(role(theme, boundaryName), surface) >= 3,
            `${mode} ${accent}: ${boundaryName} on ${surfaceName} needs 3:1`,
          );
      }
      for (const actionName of ["action", "action-hover", "action-active"])
        assert.ok(
          contrastRatio(role(theme, "on-action"), role(theme, actionName)) >= 5,
          `${mode} ${accent}: on-action needs a 5:1 margin on ${actionName}`,
        );
      assertPrimaryGradientReadable(theme, `${mode} ${accent}`);
    }
  }
});

test("semantic status roles retain readable identity on every same-mode surface", () => {
  for (const mode of ["light", "dark"]) {
    const theme = vari8Theme({ mode, accent: "#C744D4" });
    for (const surfaceName of VARI8_SURFACES) {
      for (const tone of ["positive", "warning", "danger", "info"])
        assert.ok(
          contrastRatio(role(theme, tone), role(theme, surfaceName)) >= 4.5,
          `${mode}: ${tone} on ${surfaceName} needs 4.5:1`,
        );
    }
  }
});

test("destructive label stays readable on fill and its brightness hover", () => {
  for (const mode of ["light", "dark"]) {
    for (const accent of accents) {
      const theme = vari8Theme({ mode, accent });
      const label = role(theme, "on-danger");
      const fill = role(theme, "danger");
      assert.ok(
        contrastRatio(label, fill) >= 4.5,
        `${mode} ${accent}: destructive label on fill`,
      );
      assert.ok(
        contrastRatio(label, darken(fill, 0.96)) >= 4.5,
        `${mode} ${accent}: destructive label on brightness(.96) hover`,
      );
    }
  }
});

test("an RGB color grid and generated accents keep every derived role in bounds", () => {
  const accents = new Set();
  for (const red of [0, 51, 102, 153, 204, 255])
    for (const green of [0, 51, 102, 153, 204, 255])
      for (const blue of [0, 51, 102, 153, 204, 255])
        accents.add(
          `#${[red, green, blue]
            .map((channel) => channel.toString(16).padStart(2, "0"))
            .join("")}`,
        );
  for (let index = 0; index < 128; index += 1) {
    const channels = [
      (index * 37 + 11) % 256,
      (index * 83 + 53) % 256,
      (index * 149 + 97) % 256,
    ];
    accents.add(
      `#${channels
        .map((channel) => channel.toString(16).padStart(2, "0"))
        .join("")}`,
    );
  }
  assert.equal(accents.size, 344);

  for (const mode of ["light", "dark"]) {
    for (const accent of accents) {
      const theme = vari8Theme({ mode, accent });
      assert.equal(
        normalizeAccent(role(theme, "accent-raw")),
        role(theme, "accent-raw"),
      );
      for (const state of ["action", "action-hover", "action-active"])
        assert.ok(
          contrastRatio(role(theme, "on-action"), role(theme, state)) >= 5,
          `${mode} ${accent}: on-action needs a 5:1 margin on ${state}`,
        );
      assertPrimaryGradientReadable(theme, `${mode} ${accent}`);
      assert.ok(
        contrastRatio(role(theme, "on-danger"), role(theme, "danger")) >= 4.5,
        `${mode} ${accent}: destructive label on fill`,
      );
      assert.ok(
        contrastRatio(
          role(theme, "on-danger"),
          darken(role(theme, "danger"), 0.96),
        ) >= 4.5,
        `${mode} ${accent}: destructive label on brightness(.96) hover`,
      );
      for (const surfaceName of VARI8_SURFACES) {
        const surface = role(theme, surfaceName);
        assert.ok(
          contrastRatio(
            role(theme, "chart"),
            mixHex(surface, role(theme, "chart"), chartAreaOpacity()),
          ) >= 3,
          `${mode} ${accent}: chart stroke over its ${surfaceName} fill needs 3:1`,
        );
        for (const textName of [
          "text",
          "text-secondary",
          "text-tertiary",
          "accent-text",
          "positive-text",
          "warning-text",
          "danger-text",
          "info-text",
        ])
          assert.ok(
            contrastRatio(role(theme, textName), surface) >= 4.5,
            `${mode} ${accent}: ${textName} on ${surfaceName} needs 4.5:1`,
          );
        for (const boundaryName of [
          "action-border",
          "border-control",
          "focus",
          "chart",
        ])
          assert.ok(
            contrastRatio(role(theme, boundaryName), surface) >= 3,
            `${mode} ${accent}: ${boundaryName} on ${surfaceName} needs 3:1`,
          );
      }
    }
  }
});
