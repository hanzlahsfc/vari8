import { describe, expect, it } from "vitest";

import {
  mergeWorkspaceAppearance,
  toWorkspaceAppearance,
  type Appearance,
} from "@/lib/canvas/workspace-appearance";

const localAppearance: Appearance = {
  mode: "dark",
  accent: "#EB91B8",
  font: "sans",
  density: "comfortable",
  logoMediaId: null,
};

describe("toWorkspaceAppearance", () => {
  it("maps a full workspace row to the wire shape", () => {
    expect(
      toWorkspaceAppearance({
        appearanceMode: "LIGHT",
        appearanceAccent: "#12aB34",
        appearanceFont: "SERIF",
        appearanceDensity: "COMPACT",
        logoMediaId: "media-1",
      }),
    ).toEqual({
      mode: "light",
      accent: "#12aB34",
      font: "serif",
      density: "compact",
      logoMediaId: "media-1",
    });
  });

  it("omits fields the row does not carry valid values for", () => {
    expect(
      toWorkspaceAppearance({
        appearanceMode: "PURPLE",
        appearanceAccent: "not-a-color",
        appearanceFont: "CURSIVE",
        appearanceDensity: "SPARSE",
        logoMediaId: null,
      }),
    ).toEqual({});
  });

  it("normalizes shorthand hex accents", () => {
    expect(
      toWorkspaceAppearance({
        appearanceMode: "DARK",
        appearanceAccent: "#abc",
        appearanceFont: "SANS",
        appearanceDensity: "COMFORTABLE",
        logoMediaId: null,
      }),
    ).toEqual({
      mode: "dark",
      accent: "#aabbcc",
      font: "sans",
      density: "comfortable",
    });
  });
});

describe("mergeWorkspaceAppearance", () => {
  it("lets each set workspace field win over the local store", () => {
    expect(
      mergeWorkspaceAppearance(localAppearance, {
        mode: "light",
        accent: "#004422",
        font: "mono",
        density: "compact",
        logoMediaId: "media-9",
      }),
    ).toEqual({
      mode: "light",
      accent: "#004422",
      font: "mono",
      density: "compact",
      logoMediaId: "media-9",
    });
  });

  it("keeps the local value for every field the workspace leaves unset", () => {
    const local: Appearance = {
      ...localAppearance,
      accent: "#112233",
      logoMediaId: "local-logo",
    };
    expect(mergeWorkspaceAppearance(local, { mode: "light" })).toEqual({
      mode: "light",
      accent: "#112233",
      font: "sans",
      density: "comfortable",
      logoMediaId: "local-logo",
    });
  });

  it("returns the local appearance when the read produced nothing", () => {
    expect(mergeWorkspaceAppearance(localAppearance, null)).toEqual(
      localAppearance,
    );
    expect(mergeWorkspaceAppearance(localAppearance, {})).toEqual(
      localAppearance,
    );
  });
});
