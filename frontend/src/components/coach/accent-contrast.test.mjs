import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const source = await readFile(new URL("./accent-contrast.ts", import.meta.url), "utf8");
const executable = stripTypeScriptTypes(source, { mode: "strip" });
const { accentControlColors, contrastRatio } = await import(
  `data:text/javascript;base64,${Buffer.from(executable).toString("base64")}`
);

test("the screenshot pink prefers white with a minimal accessible action fill", () => {
  assert.ok(contrastRatio("#D93A7F", "#FFFFFF") < 4.5);
  const colors = accentControlColors("#D93A7F");
  assert.deepEqual(colors, {
    background: "#D3397C",
    hoverBackground: "#C63675",
    foreground: "#FFFFFF",
  });
  assert.ok(contrastRatio(colors.background, colors.foreground) >= 4.5);
  assert.ok(contrastRatio(colors.hoverBackground, colors.foreground) >= 4.5);
});

test("pastels and bright accents retain their exact fill and dark labels", () => {
  for (const accent of ["#EB91B8", "#FFFFFF", "#FFFF00", "#00FF00", "#00FFFF"]) {
    const colors = accentControlColors(accent);
    assert.equal(colors.background, accent);
    assert.equal(colors.foreground, "#000000");
  }
});

test("dark accents use white without changing a fill that already passes", () => {
  for (const accent of ["#000000", "#123ABC", "#333333"]) {
    const colors = accentControlColors(accent);
    assert.equal(colors.background, accent);
    assert.equal(colors.foreground, "#FFFFFF");
  }
  assert.equal(accentControlColors("#777777").background, "#767676");
  assert.equal(accentControlColors("#777777").foreground, "#FFFFFF");
});

test("white preference never requires excessive darkening or lowers text contrast", () => {
  for (const accent of ["#FF0000", "#0088FF", "#888888"]) {
    const colors = accentControlColors(accent);
    assert.equal(colors.background, accent);
    assert.equal(colors.foreground, "#000000");
  }
  const samples = [0, 17, 51, 102, 153, 204, 238, 255];
  for (const red of samples) {
    for (const green of samples) {
      for (const blue of samples) {
        const original = [red, green, blue];
        const accent = `#${original.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
        const colors = accentControlColors(accent);
        assert.ok(contrastRatio(colors.background, colors.foreground) >= 4.5, accent);
        assert.ok(contrastRatio(colors.hoverBackground, colors.foreground) >= 4.5, `${accent} hover`);
        if (colors.background !== accent) {
          assert.equal(colors.foreground, "#FFFFFF", accent);
          for (const [index, offset] of [1, 3, 5].entries()) {
            const channel = Number.parseInt(colors.background.slice(offset, offset + 2), 16);
            assert.ok(channel <= original[index], accent);
            assert.ok(original[index] - channel <= Math.ceil(original[index] * 0.06), accent);
          }
        }
      }
    }
  }
});

test("hex normalization and fallback remain deterministic", () => {
  assert.deepEqual(accentControlColors(" d93a7f "), accentControlColors("#D93A7F"));
  assert.deepEqual(accentControlColors("#abc"), accentControlColors("#AABBCC"));
  assert.deepEqual(accentControlColors("invalid"), accentControlColors("#EB91B8"));
});
