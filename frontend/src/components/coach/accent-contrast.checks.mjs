import assert from "node:assert/strict";
import { test } from "node:test";
import {
  accentControlColors,
  accentForeground,
  contrastRatio,
} from "./accent-contrast.ts";

test("accent action foreground remains readable for pale and saturated accents", () => {
  for (const accent of ["#EB91B8", "#F6E05E", "#7C3AED", "#16A34A"]) {
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
  assert.ok(accentControlColors("not-a-color").background.startsWith("#"));
});

test("checkbox glyph picks the readable pole of the accent fill", () => {
  assert.equal(accentForeground("#EB91B8"), "#000000");
  assert.equal(accentForeground("#1D1935"), "#FFFFFF");
  assert.equal(accentForeground("#D93A7F"), "#000000");
  for (const accent of ["#EB91B8", "#1D1935", "#D93A7F", "#777777", "#0B5FFF"])
    assert.ok(
      contrastRatio(accentForeground(accent), accent) >= 4.5,
      `${accent} glyph contrast was ${contrastRatio(accentForeground(accent), accent)}`,
    );
});

test("action fills and labels stay distinct and readable on light and dark surfaces", () => {
  const surfaces = ["#080808", "#0F0F0F", "#F4F4F4", "#FFFFFF"];
  for (const accent of ["#050505", "#1D1935", "#FFFFEE", "#EB91B8"]) {
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
