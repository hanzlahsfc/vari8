import assert from "node:assert/strict";
import { test } from "node:test";
import { accentControlColors, contrastRatio } from "./accent-contrast.ts";

// The named presets offered in Settings → Branding must all clear the same
// action-contrast floor as any custom accent.
const PRESET_ACCENTS = [
  "#C9CCD3",
  "#E5484D",
  "#F76B15",
  "#D4AF37",
  "#BDEE63",
  "#12A594",
  "#3E63DD",
  "#8E4EC6",
];

test("accent action foreground remains readable for pale and saturated accents", () => {
  for (const accent of [
    "#EB91B8",
    "#F6E05E",
    "#7C3AED",
    "#16A34A",
    ...PRESET_ACCENTS,
  ]) {
    const colors = accentControlColors(accent);
    assert.ok(
      contrastRatio(colors.background, colors.foreground) >= 4.5,
      `${accent} action contrast was ${contrastRatio(colors.background, colors.foreground)}`,
    );
    assert.ok(
      contrastRatio(colors.hoverBackground, colors.foreground) >= 4.5,
      `${accent} hover contrast was ${contrastRatio(colors.hoverBackground, colors.foreground)}`,
    );
  }
});

test("accent is normalized and malformed values fall back safely", () => {
  assert.equal(accentControlColors("#abc").background, "#AABBCC");
  // The coach default (Platinum) takes over when a stored accent is malformed.
  assert.equal(accentControlColors("not-a-color").background, "#C9CCD3");
});

test("action fills and labels stay distinct and readable on light and dark surfaces", () => {
  const surfaces = ["#080808", "#0F0F0F", "#F4F4F4", "#FFFFFF"];
  for (const accent of [
    "#050505",
    "#1D1935",
    "#FFFFEE",
    "#EB91B8",
    ...PRESET_ACCENTS,
  ]) {
    const colors = accentControlColors(accent, surfaces);
    for (const background of [colors.background, colors.hoverBackground]) {
      assert.ok(
        contrastRatio(colors.foreground, background) >= 4.5,
        `${accent} label contrast was ${contrastRatio(colors.foreground, background)}`,
      );
      for (const surface of surfaces) {
        assert.ok(
          contrastRatio(background, surface) >= 3,
          `${accent} control contrast on ${surface} was ${contrastRatio(background, surface)}`,
        );
      }
    }
  }
});
