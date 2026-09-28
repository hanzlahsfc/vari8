import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const PRO_DARK = readFileSync(join(ROOT, "themes/pro-dark.css"), "utf8");
const PRO_WHITE = readFileSync(join(ROOT, "themes/pro-white.css"), "utf8");

const HEX = /#[0-9a-fA-F]{3,8}\b/g;

function tokenValue(css: string, token: string): string {
  const match = css.match(new RegExp(`--${token}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!match) throw new Error(`token --${token} not found`);
  return match[1].toLowerCase();
}

function tokenNames(css: string): string[] {
  return [...css.matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1]).sort();
}

function channelLuminance(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  );
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function filesUnder(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? filesUnder(join(dir, entry.name))
      : [join(dir, entry.name)],
  );
}

describe("pro-dark theme", () => {
  it("uses the exact source colors", () => {
    expect(tokenValue(PRO_DARK, "color-base")).toBe("#191919");
    expect(tokenValue(PRO_DARK, "color-surface")).toBe("#282828");
    expect(tokenValue(PRO_DARK, "color-surface-2")).toBe("#2d2d2d");
    expect(tokenValue(PRO_DARK, "color-text-primary")).toBe("#ffffff");
    expect(tokenValue(PRO_DARK, "color-text-secondary")).toBe("#b7b7b7");
    expect(tokenValue(PRO_DARK, "color-accent")).toBe("#e34332");
    expect(tokenValue(PRO_DARK, "color-success")).toBe("#3e9465");
    expect(tokenValue(PRO_DARK, "color-phase-1")).toBe("#5270a7");
    expect(tokenValue(PRO_DARK, "color-phase-2")).toBe("#a75252");
    expect(tokenValue(PRO_DARK, "color-phase-3")).toBe("#8652a7");
    expect(tokenValue(PRO_DARK, "color-phase-4")).toBe("#a79952");
  });

  it("declares the Golos Text font token", () => {
    expect(PRO_DARK).toContain('"Golos Text"');
  });
});

describe("pro-white theme", () => {
  it("defines the same token set as pro-dark", () => {
    expect(tokenNames(PRO_WHITE)).toEqual(tokenNames(PRO_DARK));
  });

  it("is a distinct light theme", () => {
    expect(tokenValue(PRO_WHITE, "color-base")).not.toBe(tokenValue(PRO_DARK, "color-base"));
    expect(luminance(tokenValue(PRO_WHITE, "color-base"))).toBeGreaterThan(0.7);
    expect(luminance(tokenValue(PRO_DARK, "color-base"))).toBeLessThan(0.1);
  });

  it("meets WCAG AA contrast for body text and success", () => {
    for (const css of [PRO_DARK, PRO_WHITE]) {
      const base = tokenValue(css, "color-base");
      expect(contrast(tokenValue(css, "color-text-primary"), base)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(tokenValue(css, "color-text-secondary"), base)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(tokenValue(css, "color-success"), base)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("theme application", () => {
  it("selects pro-dark on the html element", () => {
    const layout = readFileSync(join(ROOT, "app/layout.tsx"), "utf8");
    expect(layout).toMatch(/data-theme="pro-dark"/);
  });

  it("keeps hex colors out of application styles and components", () => {
    const appFiles = filesUnder("app");
    expect(appFiles.length).toBeGreaterThan(0);
    for (const file of appFiles) {
      const content = readFileSync(join(ROOT, file), "utf8");
      expect(HEX.test(content), `${file} contains a hard-coded hex color`).toBe(false);
      HEX.lastIndex = 0;
    }
  });
});
