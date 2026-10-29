import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, expect, it } from "vitest";
import {
  CONTRACT,
  CONTRACT_COMPATIBILITY,
  CONTRACT_SCHEMAS,
  RETAINED_V1_CONTRACT,
  assertContract,
  validateRun,
  snapshotSource,
} from "../../tools/parity/reference/reference.mjs";
import {
  comparePixels,
  compareGeometry,
} from "../../tools/parity/reference/compare.mjs";
import { RULED, applyRuled, geomDiff } from "../../tools/parity/compare.mjs";
import { createHash } from "node:crypto";
import {
  COMPONENT_PATHS,
  assertComparerManifest,
  assertReceiptToolchain,
  fileHash,
  verifyAllowanceRules,
  verifyArtifactIndex,
  verifyComponentPins,
  verifyPinnedToolchain,
} from "../../tools/parity/reference/evidence/evidence-lib.mjs";
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
      idx: number;
      maxX: number;
      maxY: number;
      cw: number;
      ch: number;
    }[];
  };
  size: { width: number; height: number };
  sha256: string;
  elements: number;
  scrolls: {
    scroller: string;
    x: number;
    y: number;
    png: string;
    box: [number, number, number, number];
  }[];
};
const dirs: string[] = [];
afterEach(() =>
  dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })),
);
type ContractProbe = Record<string, unknown> & {
  allowances: string[];
  implementedAlternative: Record<string, unknown>;
};
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
it("rejects every contract normalization and reviewer probe", () => {
  expect(assertContract(CONTRACT)).toBe(true);
  const probes: [string, (value: ContractProbe) => void][] = [
    ["authority", (value) => (value.authority = "unapproved authority")],
    [
      "implementedAlternative",
      (value) => (value.implementedAlternative.channelTolerance = 1),
    ],
    ["unknown field", (value) => (value.unexpected = true)],
    ["empty allowances", (value) => (value.allowances = [])],
    ["S03-only subset", (value) => (value.allowances = ["S03-18"])],
    [
      "pre-S03 subset",
      (value) => (value.allowances = ["S11-03", "D18", "S11-04"]),
    ],
    [
      "missing allowances",
      (value) => delete (value as { allowances?: string[] }).allowances,
    ],
    ["unknown allowance", (value) => value.allowances.push("UNKNOWN")],
    ["administrative status", (value) => (value.status = "adoption-only")],
    [
      "administrative ownerDecision",
      (value) => (value.ownerDecision = "adoption-only"),
    ],
    ["clock", (value) => (value.clock = "2026-10-19T10:00:00+02:00")],
    ["referenceSource", (value) => (value.referenceSource = "0".repeat(40))],
    ["deviceScaleFactor", (value) => (value.deviceScaleFactor = 2)],
  ];
  for (const [label, mutate] of probes) {
    const probe = structuredClone(CONTRACT) as ContractProbe;
    mutate(probe);
    expect(() => assertContract(probe), label).toThrow();
  }
  expect(() =>
    assertContract({ ...structuredClone(CONTRACT), contractVersion: 999 }),
  ).toThrow(/unknown\/incompatible/);
});

it("accepts only the exact retained v1 provenance or exact approved v2 contract", () => {
  const v1 = structuredClone(RETAINED_V1_CONTRACT) as unknown as ContractProbe;
  const historical = JSON.parse(
    readFileSync("tools/parity/reference/proposed/provenance.json", "utf8"),
  ).contract;
  expect(assertContract(v1)).toBe(true);
  expect(assertContract(historical)).toBe(true);
  expect(assertContract(CONTRACT)).toBe(true);
  expect(v1.contractVersion).toBeUndefined();
  expect(CONTRACT_SCHEMAS[1].fields).toEqual(Object.keys(v1));
  expect(CONTRACT_SCHEMAS[2].fields).toEqual(Object.keys(CONTRACT));
  expect(CONTRACT_COMPATIBILITY["retained-v1-to-approved-v2"]).toMatchObject({
    from: 1,
    to: 2,
  });
  expect(v1.allowances).toEqual(["S11-03", "D18", "S11-04"]);
  expect(CONTRACT.allowances).toEqual(["S11-03", "D18", "S11-04", "S03-18"]);

  for (const mutate of [
    (value: ContractProbe) =>
      (value.status = "owner-adopted proposal; not activated"),
    (value: ContractProbe) => (value.ownerDecision = "adoption-only"),
    (value: ContractProbe) => (value.authority = "unapproved authority"),
    (value: ContractProbe) => (value.implementedAlternative.geometryPx = 1),
    (value: ContractProbe) => (value.extra = true),
  ]) {
    const probe = structuredClone(v1) as ContractProbe;
    mutate(probe);
    expect(() => assertContract(probe)).toThrow();
  }
});

it("validates exact allowance identities and their comparer contents", () => {
  expect(verifyAllowanceRules(CONTRACT.allowances, RULED)).toBe(true);
  expect(() => verifyAllowanceRules([], RULED)).toThrow(/empty/);
  expect(() =>
    verifyAllowanceRules(CONTRACT.allowances, RULED.slice(0, -1)),
  ).toThrow(/differ/);
  const changed = structuredClone(RULED) as { rule: string }[];
  changed[0].rule = "D18 arbitrary content";
  expect(() => verifyAllowanceRules(CONTRACT.allowances, changed)).toThrow(
    /content differs/,
  );
});

it("pins all material execution components and detects omissions and tampering", () => {
  const comparerFile = "tools/parity/reference/evidence/comparer.json";
  const manifest = JSON.parse(readFileSync(comparerFile, "utf8"));
  expect(assertComparerManifest(manifest)).toBe(true);
  expect(verifyPinnedToolchain(process.cwd(), manifest)).toBe(true);
  for (const name of Object.keys(COMPONENT_PATHS)) {
    const omitted = structuredClone(manifest);
    delete omitted.components[name];
    expect(() => assertComparerManifest(omitted), name).toThrow(/missing/);
  }

  const d = mkdtempSync(path.join(tmpdir(), "visual-reference-toolchain-"));
  dirs.push(d);
  const components: Record<string, { path: string; sha256: string }> = {};
  for (const [name, relative] of Object.entries(COMPONENT_PATHS)) {
    const file = path.join(d, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${name} original\n`);
    components[name] = { path: relative, sha256: fileHash(file) };
  }
  expect(verifyComponentPins(d, components)).toBe(true);
  for (const [name, relative] of Object.entries(COMPONENT_PATHS)) {
    const file = path.join(d, relative);
    writeFileSync(file, `${name} tampered\n`);
    expect(() => verifyComponentPins(d, components), name).toThrow(
      new RegExp(`component ${name} hash differs`),
    );
    writeFileSync(file, `${name} original\n`);
  }

  const metadata = JSON.parse(
    readFileSync(
      "tools/parity/reference/evidence/receipts/metadata.json",
      "utf8",
    ),
  );
  const manifestSha = fileHash(comparerFile);
  expect(assertReceiptToolchain(metadata, manifest, manifestSha)).toBe(true);
  const omitted = structuredClone(metadata);
  delete omitted.toolchain.components.reference;
  expect(() => assertReceiptToolchain(omitted, manifest, manifestSha)).toThrow(
    /missing/,
  );
  const version = structuredClone(metadata);
  version.receiptVersion = 1;
  expect(() => assertReceiptToolchain(version, manifest, manifestSha)).toThrow(
    /version differs/,
  );
  const dependency = structuredClone(manifest);
  dependency.dependencies.reference.pixelmatch.version = "0.0.0";
  expect(() => verifyPinnedToolchain(process.cwd(), dependency)).toThrow(
    /pin differs/,
  );
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
  // the contract pins the reference recipe set — the live index may
  // grow new shots, but a run must cover exactly the pinned set
  const indexShots = JSON.parse(
    fs.readFileSync("icm/04-briefing/shots/index.json", "utf8"),
  ).shots;
  const receiptStems = new Set(
    JSON.parse(
      fs.readFileSync(
        "tools/parity/reference/evidence/receipts/canonical.json",
        "utf8",
      ),
    ).results.map((r: { id: string }) => r.id.split("@")[0]),
  );
  const shots = indexShots.filter((s: { file: string }) =>
    receiptStems.has(s.file.replace(/\.(png|webp)$/, "")),
  );
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
      // one real scroll artifact on the first screen for coordinate binding
      if (vp === "390" && stem === "s01-roster") {
        const scrollPng = `390/${stem}.s0-0-0.png`;
        const sp = new PNG({ width: 10, height: 10 });
        sp.data.fill(255);
        writeFileSync(path.join(d, scrollPng), PNG.sync.write(sp));
        const last = screens[screens.length - 1];
        last.captureEvidence.scrollers = [
          { name: "div#0", idx: 0, maxX: 0, maxY: 0, cw: 10, ch: 10 },
        ];
        last.scrolls = [
          {
            scroller: "div#0",
            x: 0,
            y: 0,
            png: scrollPng,
            box: [0, 0, 10, 10],
          },
        ];
      }
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
  ).toHaveLength(141); // 70 screens + 70 geoms + 1 scroll
  const saved = screens[0].sha256;
  screens[0].sha256 = "0".repeat(64);
  expect(() =>
    validateRun({ directory: d, manifest, shots, provenance }),
  ).toThrow(/hash/);
  screens[0].sha256 = saved;
  screens[0].captureEvidence.scrollers = [
    { name: "div#0", idx: 0, maxX: 1, maxY: 0, cw: 390, ch: 10 },
  ];
  expect(() =>
    validateRun({ directory: d, manifest, shots, provenance }),
  ).toThrow(/scroll/);
  screens[0].captureEvidence.scrollers = [
    { name: "div#0", idx: 0, maxX: 0, maxY: 0, cw: 10, ch: 10 },
  ];
  const oldUrl = screens[0].finalUrl;
  screens[0].finalUrl = "https://127.0.0.1:55940/login";
  expect(() =>
    validateRun({ directory: d, manifest, shots, provenance }),
  ).toThrow(/state/);
  screens[0].finalUrl = oldUrl;
  // wrong-viewport tuple: a @1440 screen claiming vp 390 must refuse
  const vpScreen = screens.find((s) => s.vp === "1440")!;
  const savedVp = vpScreen.vp;
  vpScreen.vp = "390";
  expect(() =>
    validateRun({ directory: d, manifest, shots, provenance }),
  ).toThrow(/id\/stem\/viewport mismatch/);
  vpScreen.vp = savedVp;
  // an unknown viewport key with a valid expected id must refuse too
  vpScreen.vp = "720" as unknown as typeof savedVp;
  expect(() =>
    validateRun({ directory: d, manifest, shots, provenance }),
  ).toThrow(/id\/stem\/viewport mismatch/);
  vpScreen.vp = savedVp;
  // artifact-identity: a screen referencing another screen's PNG refuses
  const otherVp = screens.find((s) => s !== vpScreen && s.vp === "1440")!;
  const savedPng = vpScreen.png;
  vpScreen.png = otherVp.png;
  expect(() =>
    validateRun({ directory: d, manifest, shots, provenance }),
  ).toThrow(/artifact identity mismatch/);
  vpScreen.png = savedPng;
  // swapped scroll artifact (same weakness class) refuses
  const scrollScreen = screens.find((s) => s.scrolls?.length)!;
  if (scrollScreen) {
    const otherStem = screens.find(
      (s) => s !== scrollScreen && s.vp === scrollScreen.vp,
    )!.stem;
    const savedScroll = scrollScreen.scrolls[0].png;
    scrollScreen.scrolls[0].png = `${scrollScreen.vp}/${otherStem}.s0-0-0.png`;
    expect(() =>
      validateRun({ directory: d, manifest, shots, provenance }),
    ).toThrow(/scroll|identity/);
    scrollScreen.scrolls[0].png = savedScroll;
    // same-screen coordinate swap — the right stem, wrong coordinate
    scrollScreen.scrolls[0].png = `${scrollScreen.vp}/${scrollScreen.stem}.s0-1-0.png`;
    expect(() =>
      validateRun({ directory: d, manifest, shots, provenance }),
    ).toThrow(/scroll artifact identity/);
    scrollScreen.scrolls[0].png = savedScroll;
    // a valid filename assigned to a coordinate it doesn't encode
    scrollScreen.scrolls[0].x = 1;
    expect(() =>
      validateRun({ directory: d, manifest, shots, provenance }),
    ).toThrow(/scroll|incomplete/);
    scrollScreen.scrolls[0].x = 0;
    // an unrecorded scroller name refuses
    scrollScreen.scrolls[0].scroller = "div#ghost";
    expect(() =>
      validateRun({ directory: d, manifest, shots, provenance }),
    ).toThrow(/unknown scroller|scroll/);
    scrollScreen.scrolls[0].scroller = "div#0";
    // forged name/idx pair — name says #0, idx field says 7
    scrollScreen.captureEvidence.scrollers = [
      { name: "div#0", idx: 7, maxX: 0, maxY: 0, cw: 10, ch: 10 },
    ];
    expect(() =>
      validateRun({ directory: d, manifest, shots, provenance }),
    ).toThrow(/forged scroller identity/);
    // ambiguous duplicate scroller names refuse
    scrollScreen.captureEvidence.scrollers = [
      { name: "div#0", idx: 0, maxX: 0, maxY: 0, cw: 10, ch: 10 },
      { name: "div#0", idx: 0, maxX: 0, maxY: 0, cw: 10, ch: 10 },
    ];
    expect(() =>
      validateRun({ directory: d, manifest, shots, provenance }),
    ).toThrow(/ambiguous scroller|scroll/);
    scrollScreen.captureEvidence.scrollers = [
      { name: "div#0", idx: 0, maxX: 0, maxY: 0, cw: 10, ch: 10 },
    ];
    // malformed scroller names/indices refuse — full grammar, not suffix
    for (const bad of [
      { name: "div#bad#143", idx: 143 },
      { name: "div#0x", idx: 0 },
      { name: "#0", idx: 0 },
      { name: "div#0#", idx: 0 },
      { name: "div", idx: 0 },
      { name: "Div#0", idx: 0 },
      { name: "div#0", idx: -1 },
      { name: "div#0", idx: 0.5 },
      { name: "div#00", idx: 0 },
    ]) {
      scrollScreen.captureEvidence.scrollers = [
        { name: bad.name, idx: bad.idx, maxX: 0, maxY: 0, cw: 10, ch: 10 },
      ];
      expect(() =>
        validateRun({ directory: d, manifest, shots, provenance }),
      ).toThrow(/forged scroller identity|scroll/);
    }
    scrollScreen.captureEvidence.scrollers = [
      { name: "div#0", idx: 0, maxX: 0, maxY: 0, cw: 10, ch: 10 },
    ];
    // legitimate writer output — ordinary + custom-element tag names
    for (const good of [
      { name: "div#0", idx: 0 },
      { name: "section#143", idx: 143 },
      { name: "my-scroll#143", idx: 143 },
      { name: "my-app#1", idx: 1 },
      { name: "h1#22", idx: 22 },
    ]) {
      // the scroll png must encode this scroller's actual idx
      const goodPng = `${scrollScreen.vp}/${scrollScreen.stem}.s${good.idx}-0-0.png`;
      const sp = new PNG({ width: 10, height: 10 });
      sp.data.fill(255);
      writeFileSync(path.join(d, goodPng), PNG.sync.write(sp));
      scrollScreen.captureEvidence.scrollers = [
        { name: good.name, idx: good.idx, maxX: 0, maxY: 0, cw: 10, ch: 10 },
      ];
      const savedP = scrollScreen.scrolls[0].png;
      const savedName = scrollScreen.scrolls[0].scroller;
      scrollScreen.scrolls[0].png = goodPng;
      scrollScreen.scrolls[0].scroller = good.name;
      expect(
        validateRun({ directory: d, manifest, shots, provenance }).length,
        good.name,
      ).toBeGreaterThan(0);
      scrollScreen.scrolls[0].png = savedP;
      scrollScreen.scrolls[0].scroller = savedName;
    }
    scrollScreen.captureEvidence.scrollers = [
      { name: "div#0", idx: 0, maxX: 0, maxY: 0, cw: 10, ch: 10 },
    ];
    // malformed coordinate types refuse — never coerced
    for (const [x, y] of [
      ["0" as unknown as number, 0],
      [0, null as unknown as number],
      [Number.NaN, 0],
      [0, Number.POSITIVE_INFINITY],
    ]) {
      scrollScreen.scrolls[0].x = x;
      scrollScreen.scrolls[0].y = y;
      expect(() =>
        validateRun({ directory: d, manifest, shots, provenance }),
      ).toThrow(/malformed scroll coordinates|scroll/);
    }
    scrollScreen.scrolls[0].x = 0;
    scrollScreen.scrolls[0].y = 0;
  }
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

it("accepts only the owner-approved s03 copy and exact width consequence", () => {
  const key = "body[1]>button[1]";
  const base = [
    key,
    "button",
    964,
    661,
    244.5,
    44,
    "Record demo video feedback",
    "button",
    "Record demo video feedback",
  ];
  const current = [
    key,
    "button",
    964,
    661,
    205.5,
    44,
    "Record video feedback",
    "button",
    "Record video feedback",
  ];
  const diff = geomDiff([base], [current]);
  const approved = applyRuled("s03-checkin-review", diff, [base], [current]);
  expect(approved.rules).toContain(
    "S03-18 real video feedback copy and width (Prompt 417)",
  );
  expect(approved.geom.moved).toEqual([]);
  expect(approved.geom.texts).toEqual([]);
  expect(approved.masks).toEqual([]);

  const unrelatedWidth = [...current];
  unrelatedWidth[4] = 210;
  const widthDiff = geomDiff([base], [unrelatedWidth]);
  const rejectedWidth = applyRuled(
    "s03-checkin-review",
    widthDiff,
    [base],
    [unrelatedWidth],
  );
  expect(rejectedWidth.rules).toEqual([]);
  expect(rejectedWidth.geom.moved).toHaveLength(1);
  expect(rejectedWidth.geom.texts).toHaveLength(1);

  const otherScreen = applyRuled(
    "s04-template-habits",
    diff,
    [base],
    [current],
  );
  expect(otherScreen.rules).toEqual([]);
  expect(otherScreen.geom.moved).toHaveLength(1);
  expect(otherScreen.geom.texts).toHaveLength(1);

  const otherText = [...current];
  otherText[6] = "Record video note";
  otherText[8] = "Record video note";
  const textDiff = geomDiff([base], [otherText]);
  const rejectedText = applyRuled(
    "s03-checkin-review",
    textDiff,
    [base],
    [otherText],
  );
  expect(rejectedText.rules).toEqual([]);
  expect(rejectedText.geom.texts).toHaveLength(1);
});

it("verifies artifact hashes and fails on missing, tampered or escaping files", () => {
  const d = mkdtempSync(path.join(tmpdir(), "visual-reference-evidence-"));
  dirs.push(d);
  writeFileSync(path.join(d, "a.png"), "synthetic");
  const entries = [
    {
      path: "a.png",
      sha256: createHash("sha256").update("synthetic").digest("hex"),
    },
  ];
  expect(verifyArtifactIndex(d, entries)).toBe(1);
  expect(() =>
    verifyArtifactIndex(d, [
      ...entries,
      { path: "missing.png", sha256: "0".repeat(64) },
    ]),
  ).toThrow(/missing artifact/);
  writeFileSync(path.join(d, "a.png"), "tampered");
  expect(() => verifyArtifactIndex(d, entries)).toThrow(/tampered artifact/);
  writeFileSync(path.join(d, "a.png"), "synthetic");
  expect(() =>
    verifyArtifactIndex(d, [{ path: "../escape", sha256: "0".repeat(64) }]),
  ).toThrow(/escapes/);
  mkdirSync(path.join(d, "art"));
  writeFileSync(path.join(d, "art/known.png"), "known");
  const exact: { path: string; sha256: string }[] = [
    {
      path: "art/known.png",
      sha256: createHash("sha256").update("known").digest("hex"),
    },
  ];
  expect(
    verifyArtifactIndex(d, exact, { exactRoots: ["art"] as string[] }),
  ).toBe(1);
  writeFileSync(path.join(d, "art/unindexed.png"), "extra");
  expect(() =>
    verifyArtifactIndex(d, exact, { exactRoots: ["art"] as string[] }),
  ).toThrow(/unindexed artifact/);
});
