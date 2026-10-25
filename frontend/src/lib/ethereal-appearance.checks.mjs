import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: true,
  alias: {
    "@/components/vari8/theme": fileURLToPath(
      new URL("../components/vari8/theme.tsx", import.meta.url),
    ),
  },
});
const { themeVariables } = await jiti.import("./ethereal-appearance.tsx");

function luminance(hex) {
  const channels = [1, 3, 5].map(
    (index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255,
  );
  const [r, g, b] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("theme variables adapt effective accents and labels while preserving the selected hex", () => {
  const cases = [
    {
      mode: "dark",
      raw: "#050505",
      backgrounds: ["#050505", "#090909", "#101010", "#141414", "#191919"],
    },
    {
      mode: "light",
      raw: "#FFFFEE",
      backgrounds: ["#F4F4F4", "#FFFFFF", "#E8E8E8", "#E9E9E9"],
    },
  ];

  for (const { mode, raw, backgrounds } of cases) {
    const variables = themeVariables({ mode, accent: raw, font: "sans" });
    const effective = variables["--accent"];
    const contrastText = variables["--accent-contrast"];

    assert.equal(variables["--accent-raw"], raw);
    assert.notEqual(effective, raw);
    for (const background of backgrounds)
      assert.ok(
        contrast(effective, background) >= 3,
        `${effective} on ${background} must meet 3:1`,
      );
    assert.ok(
      contrast(effective, contrastText) >= 4.5,
      `${contrastText} on ${effective} must meet 4.5:1`,
    );
    for (const token of [
      "--accent-border",
      "--accent-ring",
      "--chart-line",
      "--chart-fill",
    ]) {
      for (const background of backgrounds)
        assert.ok(
          contrast(variables[token], background) >= 3,
          `${token} on ${background} must meet 3:1`,
        );
    }
    for (const background of backgrounds)
      assert.ok(
        contrast(variables["--accent-ink"], background) >= 4.5,
        `--accent-ink on ${background} must meet 4.5:1`,
      );
  }
});

test("nutrition macro chart colors retain separated contrast for extreme accents", () => {
  const accents = ["#050505", "#FFFFEE", "#F8F5FF", "#222222", "#EB91B8"];
  const surfaces = { dark: "#171717", light: "#FFFFFF" };

  for (const mode of ["dark", "light"]) {
    for (const accent of accents) {
      const variables = themeVariables({ mode, accent, font: "sans" });
      const colors = [
        variables["--nutrition-macro-protein"],
        variables["--nutrition-macro-carbs"],
        variables["--nutrition-macro-fat"],
      ];
      assert.equal(variables["--accent-raw"], accent);
      for (const color of colors)
        assert.ok(
          contrast(color, surfaces[mode]) >= 3,
          `${mode} ${color} on ${surfaces[mode]} must meet 3:1 for ${accent}`,
        );
      for (let index = 1; index < colors.length; index += 1)
        assert.ok(
          contrast(colors[index - 1], colors[index]) >= 2,
          `${mode} adjacent macro tones must meet 2:1 for ${accent}`,
        );
    }
  }
});
