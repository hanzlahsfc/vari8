import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, expect, it } from "vitest";
import {
  CONTRACT,
  assertContract,
  validateRun,
  snapshotSource,
} from "../../tools/parity/reference/reference.mjs";
import {
  comparePixels,
  compareGeometry,
} from "../../tools/parity/reference/compare.mjs";
import { applyRuled, geomDiff } from "../../tools/parity/compare.mjs";
import { createRequire } from "node:module";
type FixturePng = { data: Buffer };
const { PNG } = createRequire(
  new URL("../../tools/parity/reference/reference.mjs", import.meta.url),
)("pngjs") as {
  PNG: {
    new (options: { width: number; height: number }): FixturePng;
    sync: { write(p: FixturePng): Buffer };
  };
};
type FixtureScreen = {
  id: string;
  stem: string;
  vp: string;
  png: string;
  finalUrl: string;
  captureEvidence: {
    url: string;
    text: string;
    state: string[];
    scrollers: {
      name: string;
      maxX: number;
      maxY: number;
      cw: number;
      ch: number;
    }[];
  };
  size: { width: number; height: number };
  sha256: string;
  elements: number;
  scrolls: never[];
};
const dirs: string[] = [];
afterEach(() =>
  dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })),
);
const pixel = (value: number) => {
  const p = new PNG({ width: 100, height: 100 });
  p.data.fill(255);
  if (value) p.data.set([0, 0, 0, 255], 0);
  return PNG.sync.write(p);
};
it("pins the explicit owner D32 contract instead of accepting implemented defaults", () => {
  expect(CONTRACT.clock).toBe("2026-10-19T09:00:00+02:00");
  expect(CONTRACT.geometryPx).toBe(1);
  expect(CONTRACT.pixelmatchThreshold).toBe(0.1);
  expect(CONTRACT.maxChangedFraction).toBe(0.001);
  expect(() =>
    assertContract({ ...CONTRACT, clock: "2026-10-19T10:00:00+02:00" }),
  ).toThrow(/contract/);
});
it("enforces geometry and exact text/role/name independently of the pixel budget", () => {
  const row = [
    "body[1]>h1[0]",
    "h1",
    0,
    0,
    100,
    20,
    "Title",
    "heading",
    "Title",
  ];
  expect(
    compareGeometry([row], [[...row.slice(0, 2), 1, ...row.slice(3)]]).moved,
  ).toHaveLength(0);
  expect(
    compareGeometry([row], [[...row.slice(0, 2), 1.5, ...row.slice(3)]]).moved,
  ).toHaveLength(1);
  expect(
    compareGeometry([row], [[...row.slice(0, 8), "Other name"]]).semantics,
  ).toHaveLength(1);
});
it("uses pixelmatch and a per-image fraction without converting it to a channel waiver", () => {
  const result = comparePixels(pixel(0), pixel(1));
  expect(result.changed).toBe(1);
  expect(result.budget).toBe(10);
  expect(result.pass).toBe(true);
  expect(comparePixels(pixel(0), pixel(1), [], true).pass).toBe(false);
});
it("refuses a dirty source rather than blessing a snapshot with hidden changes", () => {
  expect(() =>
    snapshotSource(process.cwd(), { expectedSha: "0".repeat(40) }),
  ).toThrow(/source/);
});
it("refuses missing provenance and incomplete capture sets before considering images", () => {
  expect(() =>
    validateRun({
      directory: "/no-such-run",
      manifest: { screens: [], failures: [] },
      shots: [],
      provenance: null,
    }),
  ).toThrow(/provenance/);
  expect(() =>
    validateRun({
      directory: "/no-such-run",
      manifest: { screens: [], failures: [] },
      shots: [{ file: "test.png" }],
      provenance: {
        source: {
          sha: CONTRACT.referenceSource,
          dirtyTracked: "x",
          untracked: "",
        },
        contract: CONTRACT,
      },
    }),
  ).toThrow(/source/);
});
it("rejects inconsistent clocks, failed captures and nonexistent artifacts", () => {
  const d = mkdtempSync(path.join(tmpdir(), "visual-reference-"));
  dirs.push(d);
  mkdirSync(path.join(d, "390"));
  writeFileSync(path.join(d, "390/test.png"), pixel(0));
  writeFileSync(path.join(d, "390/test.geom.json.gz"), gzipSync("[]"));
  const provenance = {
    role: "historical",
    source: {
      sha: CONTRACT.referenceSource,
      tree: CONTRACT.referenceRootTree,
      frontendTree: CONTRACT.referenceFrontendTree,
      dirtyTracked: "",
      untracked: "",
    },
    contract: CONTRACT,
  };
  expect(() =>
    validateRun({
      directory: d,
      manifest: { fixedNow: "wrong", screens: [], failures: [] },
      shots: [],
      provenance,
    }),
  ).toThrow(/clock/);
  expect(() =>
    validateRun({
      directory: d,
      manifest: {
        fixedNow: CONTRACT.clock,
        screens: [],
        failures: [{ error: "bad state" }],
      },
      shots: [],
      provenance,
    }),
  ).toThrow(/capture/);
});

it("validates complete real-format receipts and rejects corrupt images, state and scroll omissions", async () => {
  const fs = await import("node:fs");
  const { createHash } = await import("node:crypto");
  const { CAPTURE_EXPECTATIONS, expectedCaptureMarker } =
    await import("../../tools/parity/capture.mjs");
  const d = mkdtempSync(path.join(tmpdir(), "visual-reference-full-"));
  dirs.push(d);
  const shots = JSON.parse(
    fs.readFileSync("icm/04-briefing/shots/index.json", "utf8"),
  ).shots;
  const provenance = {
    role: "historical",
    source: {
      sha: CONTRACT.referenceSource,
      tree: CONTRACT.referenceRootTree,
      frontendTree: CONTRACT.referenceFrontendTree,
      appLock: "b".repeat(64),
      dirtyTracked: "",
      untracked: "",
    },
    contract: CONTRACT,
    environment: {
      browser: { sha256: "c".repeat(64) },
      nodeSha256: "d".repeat(64),
    },
    dependencies: { installedTreeSha256: "e".repeat(64), mismatches: [] },
    adapter: { adapterSha256: "f".repeat(64) },
  };
  const screens: FixtureScreen[] = [];
  for (const vp of ["390", "1440"]) {
    mkdirSync(path.join(d, vp));
    const size = CONTRACT.viewports[vp];
    const p = new PNG(size);
    p.data.fill(255);
    const bytes = PNG.sync.write(p);
    for (const shot of shots) {
      const stem = shot.file.replace(/\.(png|webp)$/, "");
      const expectation = (CAPTURE_EXPECTATIONS[
        stem as keyof typeof CAPTURE_EXPECTATIONS
      ] ?? {}) as {
        query?: Record<string, string>;
        hash?: string;
        state?: string;
      };
      const url = new URL(shot.route, "https://127.0.0.1:55940");
      if (expectation.hash) url.hash = expectation.hash;
      for (const [key, value] of Object.entries(expectation.query ?? {}))
        url.searchParams.set(key, value === "*" ? "fixture" : String(value));
      const marker = expectedCaptureMarker(shot);
      const png = `${vp}/${stem}.png`;
      writeFileSync(path.join(d, png), bytes);
      writeFileSync(
        path.join(d, vp, `${stem}.geom.json.gz`),
        gzipSync(
          JSON.stringify([
            ["body[1]>h1[0]", "h1", 0, 0, 100, 20, marker, "heading", marker],
          ]),
        ),
      );
      screens.push({
        id: `${stem}@${vp}`,
        stem,
        vp,
        png,
        finalUrl: url.href,
        captureEvidence: {
          url: url.href,
          text: marker,
          state: expectation.state ? [expectation.state] : [],
          scrollers: [],
        },
        size,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        elements: 1,
        scrolls: [],
      });
    }
  }
  const manifest = {
    fixedNow: CONTRACT.clock,
    timezone: CONTRACT.timezone,
    failures: [],
    screens,
  };
  expect(
    validateRun({ directory: d, manifest, shots, provenance }),
  ).toHaveLength(140);
  const saved = screens[0].sha256;
  screens[0].sha256 = "0".repeat(64);
  expect(() =>
    validateRun({ directory: d, manifest, shots, provenance }),
  ).toThrow(/hash/);
  screens[0].sha256 = saved;
  screens[0].captureEvidence.scrollers = [
    { name: "div#0", maxX: 1, maxY: 0, cw: 390, ch: 10 },
  ];
  expect(() =>
    validateRun({ directory: d, manifest, shots, provenance }),
  ).toThrow(/scroll/);
  screens[0].captureEvidence.scrollers = [];
  const oldUrl = screens[0].finalUrl;
  screens[0].finalUrl = "https://127.0.0.1:55940/login";
  expect(() =>
    validateRun({ directory: d, manifest, shots, provenance }),
  ).toThrow(/state/);
  screens[0].finalUrl = oldUrl;
  expect(() =>
    validateRun({
      directory: d,
      manifest: { ...manifest, screens: screens.slice(1) },
      shots,
      provenance,
    }),
  ).toThrow(/incomplete/);
  provenance.dependencies.mismatches.push("bad-package" as never);
  expect(() =>
    validateRun({ directory: d, manifest, shots, provenance }),
  ).toThrow(/provenance/);
}, 15000);

it("rejects current-app expected output even before reading capture artifacts", async () => {
  const { compareRuns } =
    await import("../../tools/parity/reference/compare.mjs");
  const d = mkdtempSync(path.join(tmpdir(), "visual-reference-authority-"));
  dirs.push(d);
  writeFileSync(
    path.join(d, "provenance.json"),
    JSON.stringify({
      role: "candidate",
      source: { sha: CONTRACT.candidateSource },
    }),
  );
  expect(() => compareRuns(d, d)).toThrow(/never the root app/);
});

it("fails closed when the written owner D32 contract drifts", async () => {
  const { assertD32Text } =
    await import("../../tools/parity/reference/reference.mjs");
  const { readFileSync } = await import("node:fs");
  const text = readFileSync("icm/03-plan/DECISIONS.md", "utf8");
  expect(() => assertD32Text(text)).not.toThrow();
  expect(() =>
    assertD32Text(text.replace(CONTRACT.clock, "2026-10-19T10:00:00+02:00")),
  ).toThrow(/owner decision/);
});

it("maps replacement manifest hashes as well as image hashes", async () => {
  const { artifactMapping } =
    await import("../../tools/parity/reference/reference.mjs");
  const d = mkdtempSync(path.join(tmpdir(), "visual-reference-map-"));
  dirs.push(d);
  writeFileSync(path.join(d, "manifest.json"), "new manifest");
  writeFileSync(path.join(d, "provenance.json"), "new provenance");
  const mapped = artifactMapping({
    oldArtifacts: [{ path: "manifest.json", sha256: "old" }],
    proposedDirectory: d,
    artifacts: [{ path: "390/example.png", sha256: "new" }],
  });
  expect(
    mapped.find((x) => x.path === "manifest.json")?.proposedSha256,
  ).toMatch(/^[a-f0-9]{64}$/);
  expect(mapped.find((x) => x.path === "manifest.json")?.oldSha256).toBe("old");
  expect(
    mapped.find((x) => x.path === "provenance.json")?.oldSha256,
  ).toBeNull();
});

it("disposes only the exact S03-18 recorder copy/geometry decision", () => {
  const buttonKey = "main>section[0]>button[2]";
  const otherKey = "main>section[0]>div[3]";
  const baseRows = [
    [
      buttonKey,
      "button",
      100,
      200,
      244.5,
      44,
      "Record demo video feedback",
      "button",
      "Record demo video feedback",
    ],
    [otherKey, "div", 0, 0, 100, 20, "Old label", "text", "Old label"],
  ];
  const currentRows = [
    [
      buttonKey,
      "button",
      100,
      200,
      205.5,
      44,
      "Record video feedback",
      "button",
      "Record video feedback",
    ],
    [otherKey, "div", 0, 0, 120, 20, "New label", "text", "New label"],
  ];

  const diff = geomDiff(baseRows, currentRows);
  const ruled = applyRuled("s03-checkin-review", diff, baseRows, currentRows);

  expect(ruled.rules).toEqual([
    "S03-18 real video feedback copy and width (Prompt 417)",
  ]);
  expect(ruled.geom.texts.map((x: { key: string }) => x.key)).toEqual([
    otherKey,
  ]);
  expect(ruled.geom.moved.map((x: { key: string }) => x.key)).toEqual([
    otherKey,
  ]);
  expect(ruled.masks).toHaveLength(2);

  const wrongCopy = [
    [
      buttonKey,
      "button",
      100,
      200,
      205.5,
      44,
      "Record demo video",
      "button",
      "Record demo video",
    ],
    currentRows[1],
  ];
  const wrongDiff = geomDiff(baseRows, wrongCopy);
  const wrong = applyRuled(
    "s03-checkin-review",
    wrongDiff,
    baseRows,
    wrongCopy,
  );
  expect(wrong.rules).not.toContain(
    "S03-18 real video feedback copy and width (Prompt 417)",
  );
  expect(wrong.geom.texts.map((x: { key: string }) => x.key)).toEqual([
    buttonKey,
    otherKey,
  ]);
  expect(wrong.geom.moved.map((x: { key: string }) => x.key)).toEqual([
    buttonKey,
    otherKey,
  ]);

  const foreignScreen = applyRuled(
    "s03-add-extra",
    diff,
    baseRows,
    currentRows,
  );
  expect(foreignScreen.rules).not.toContain(
    "S03-18 real video feedback copy and width (Prompt 417)",
  );
  expect(foreignScreen.geom.texts.map((x: { key: string }) => x.key)).toEqual([
    buttonKey,
    otherKey,
  ]);
  expect(foreignScreen.geom.moved.map((x: { key: string }) => x.key)).toEqual([
    buttonKey,
    otherKey,
  ]);
});
