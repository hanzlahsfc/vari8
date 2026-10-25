import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { gunzipSync } from "node:zlib";
import { PNG } from "pngjs";
import { captureProblem } from "../capture.mjs";
export const CONTRACT = JSON.parse(
  fs.readFileSync(new URL("./contract.json", import.meta.url), "utf8"),
);
export const sha256 = (data) => createHash("sha256").update(data).digest("hex");
export const fileHash = (p) => sha256(fs.readFileSync(p));
const git = (root, ...args) =>
  execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
// Compatibility is deliberately closed: version 1 is the exact retained
// provenance shape; version 2 is the exact owner-approved adoption shape.
// There is no field subsetting, defaulting or administrative normalization.
export const RETAINED_V1_CONTRACT = Object.freeze({
  id: CONTRACT.id,
  authority: CONTRACT.authority,
  status: "proposed-for-independent-review",
  referenceSource: CONTRACT.referenceSource,
  referenceFrontendTree: CONTRACT.referenceFrontendTree,
  candidateSource: CONTRACT.candidateSource,
  harnessDependency: CONTRACT.harnessDependency,
  clock: CONTRACT.clock,
  timezone: CONTRACT.timezone,
  geometryPx: CONTRACT.geometryPx,
  maxChangedFraction: CONTRACT.maxChangedFraction,
  pixelmatchThreshold: CONTRACT.pixelmatchThreshold,
  pixelmatchIncludeAA: CONTRACT.pixelmatchIncludeAA,
  deviceScaleFactor: CONTRACT.deviceScaleFactor,
  viewports: CONTRACT.viewports,
  expectedScreens: CONTRACT.expectedScreens,
  s04State: CONTRACT.s04State,
  allowances: Object.freeze(["S11-03", "D18", "S11-04"]),
  implementedAlternative: Object.freeze({
    clock: "2026-10-19T10:00:00+02:00",
    geometryPx: 0.5,
    channelTolerance: 0,
    maxDiffPixels: 0,
  }),
  portability: CONTRACT.portability,
  referenceRootTree: CONTRACT.referenceRootTree,
  candidateRootTree: CONTRACT.candidateRootTree,
});

export const CONTRACT_SCHEMAS = Object.freeze({
  1: Object.freeze({
    version: 1,
    fields: Object.freeze(Object.keys(RETAINED_V1_CONTRACT)),
    value: RETAINED_V1_CONTRACT,
  }),
  2: Object.freeze({
    version: 2,
    fields: Object.freeze(Object.keys(CONTRACT)),
    value: CONTRACT,
  }),
});

export const CONTRACT_COMPATIBILITY = Object.freeze({
  "retained-v1-to-approved-v2": Object.freeze({
    from: 1,
    to: 2,
    policy:
      "Exact retained v1 provenance or exact approved v2 contract only; all fields are required, unknown fields are rejected, and administrative/material/allowance changes outside the named transition are rejected.",
  }),
});

export function assertContract(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("contract is missing or malformed");
  const version = Object.prototype.hasOwnProperty.call(value, "contractVersion")
    ? value.contractVersion
    : 1;
  if (version !== 1 && version !== 2)
    throw new Error(`contract version ${version} is unknown/incompatible`);
  const expected = version === 1 ? RETAINED_V1_CONTRACT : CONTRACT;
  const actualFields = Object.keys(value).sort();
  const expectedFields = Object.keys(expected).sort();
  const missing = expectedFields.filter((f) => !actualFields.includes(f));
  const unknown = actualFields.filter((f) => !expectedFields.includes(f));
  if (missing.length)
    throw new Error(`contract schema missing fields: ${missing.join(",")}`);
  if (unknown.length)
    throw new Error(`contract schema unknown fields: ${unknown.join(",")}`);
  for (const field of expectedFields)
    if (!isDeepStrictEqual(value[field], expected[field]))
      throw new Error(`contract field differs: ${field}`);
  return true;
}
/** @param {string} root @param {{expectedSha?: string, frontend?: boolean}} [options] */
export function snapshotSource(root, { expectedSha, frontend = false } = {}) {
  const source = {
    sha: git(root, "rev-parse", "HEAD"),
    tree: git(root, "rev-parse", "HEAD^{tree}"),
    frontendTree: git(root, "rev-parse", "HEAD:frontend"),
    dirtyTracked: git(root, "diff", "--name-only", "HEAD"),
    untracked: git(root, "ls-files", "--others", "--exclude-standard"),
  };
  if (source.sha !== expectedSha || source.dirtyTracked || source.untracked)
    throw new Error("source must be the exact clean recorded commit");
  if (frontend && source.frontendTree !== CONTRACT.referenceFrontendTree)
    throw new Error("reference frontend tree differs");
  const app = frontend ? path.join(root, "frontend") : root;
  source.rootLock = fileHash(path.join(root, "package-lock.json"));
  source.appLock = fileHash(path.join(app, "package-lock.json"));
  return source;
}
export function installedDependencies(app) {
  const lock = JSON.parse(
    fs.readFileSync(path.join(app, "package-lock.json"), "utf8"),
  );
  const installed = JSON.parse(
    fs.readFileSync(path.join(app, "node_modules/.package-lock.json"), "utf8"),
  );
  const mismatches = [];
  for (const [key, value] of Object.entries(lock.packages)) {
    if (!key) continue;
    const got = installed.packages[key];
    if (!got && value.optional) continue;
    if (
      !got ||
      got.version !== value.version ||
      got.integrity !== value.integrity
    )
      mismatches.push(key);
  }
  if (mismatches.length)
    throw new Error(
      `installed dependency integrity differs: ${mismatches.join(",")}`,
    );
  const digest = createHash("sha256");
  let files = 0;
  const walk = (dir) => {
    for (const entry of fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, entry.name);
      const rel = path.relative(app, p);
      if (entry.isDirectory()) walk(p);
      else if (entry.isFile()) {
        digest.update(rel + "\0" + fileHash(p) + "\n");
        files++;
      } else if (entry.isSymbolicLink())
        digest.update(rel + "\0link:" + fs.readlinkSync(p) + "\n");
    }
  };
  walk(path.join(app, "node_modules"));
  return {
    lockSha256: fileHash(path.join(app, "package-lock.json")),
    installedLockSha256: fileHash(
      path.join(app, "node_modules/.package-lock.json"),
    ),
    mismatches,
    installedTreeSha256: digest.digest("hex"),
    hashedFiles: files,
  };
}
const steps = (max, size) => {
  if (max < 1) return [0];
  const a = [];
  for (let x = 0; x < max; x += Math.max(1, size)) a.push(x);
  a.push(max);
  return a;
};
function artifact(directory, relative) {
  const p = path.resolve(directory, relative);
  if (!p.startsWith(path.resolve(directory) + path.sep))
    throw new Error("capture artifact escapes run directory");
  if (!fs.existsSync(p))
    throw new Error(`missing capture artifact ${relative}`);
  return p;
}
export function validateRun({ directory, manifest, shots, provenance }) {
  if (!provenance?.source || !provenance?.contract)
    throw new Error("missing reference provenance");
  const s = provenance.source;
  if (
    ![CONTRACT.referenceSource, CONTRACT.candidateSource].includes(s.sha) ||
    s.dirtyTracked ||
    s.untracked
  )
    throw new Error("invalid or dirty capture source");
  if (provenance.role !== "historical" && provenance.role !== "candidate")
    throw new Error("missing source role provenance");
  const reference = provenance.role === "historical";
  if (
    s.sha !==
      (reference ? CONTRACT.referenceSource : CONTRACT.candidateSource) ||
    s.tree !==
      (reference ? CONTRACT.referenceRootTree : CONTRACT.candidateRootTree) ||
    (reference && s.frontendTree !== CONTRACT.referenceFrontendTree)
  )
    throw new Error("source is not its authorized reference/candidate tree");
  assertContract(provenance.contract);
  if (
    manifest.fixedNow !== CONTRACT.clock ||
    manifest.timezone !== CONTRACT.timezone
  )
    throw new Error("capture clock/timezone inconsistent with contract");
  if (manifest.failures?.length)
    throw new Error("capture failures cannot establish references");
  if (
    !provenance.environment?.browser?.sha256 ||
    !provenance.environment.nodeSha256 ||
    !provenance.dependencies?.installedTreeSha256 ||
    provenance.dependencies.mismatches?.length ||
    !provenance.adapter?.adapterSha256 ||
    !provenance.source.tree ||
    !provenance.source.appLock
  )
    throw new Error("incomplete environment/dependency/source provenance");
  if (shots.length !== 35 || manifest.screens.length !== 70)
    throw new Error(
      "incomplete capture set; expected 35 recipes and 70 screens",
    );
  const expected = new Set(
    shots.flatMap((s) =>
      Object.keys(CONTRACT.viewports).map((v) =>
        s.file.replace(/\.(png|webp)$/, "@" + v),
      ),
    ),
  );
  const seen = new Set();
  const artifacts = [];
  for (const screen of manifest.screens) {
    if (!expected.has(screen.id) || seen.has(screen.id))
      throw new Error(`unexpected/duplicate capture ${screen.id}`);
    seen.add(screen.id);
    const shot = shots.find(
      (s) => s.file.replace(/\.(png|webp)$/, "") === screen.stem,
    );
    if (
      !screen.captureEvidence ||
      screen.finalUrl !== screen.captureEvidence.url ||
      captureProblem(shot, screen.captureEvidence)
    )
      throw new Error(`invalid URL/content/selected state ${screen.id}`);
    const image = artifact(directory, screen.png);
    const imageBuffer = fs.readFileSync(image);
    const png = PNG.sync.read(imageBuffer);
    if (
      sha256(imageBuffer) !== screen.sha256 ||
      png.width !== screen.size.width ||
      png.height !== screen.size.height
    )
      throw new Error(`capture hash/size mismatch ${screen.id}`);
    const geom = artifact(
      directory,
      `${screen.vp}/${screen.stem}.geom.json.gz`,
    );
    const rows = JSON.parse(gunzipSync(fs.readFileSync(geom)));
    if (
      png.width < CONTRACT.viewports[screen.vp].width ||
      png.height < CONTRACT.viewports[screen.vp].height ||
      rows.length !== screen.elements ||
      !rows.length ||
      rows.some((r) => r.length !== 9)
    )
      throw new Error(`incomplete geometry/role/name ${screen.id}`);
    const expectedScrolls = screen.captureEvidence.scrollers
      .flatMap((s) =>
        steps(s.maxY, s.ch).flatMap((y) =>
          steps(s.maxX, s.cw).map((x) => `${s.name}:${x}:${y}`),
        ),
      )
      .sort();
    const actualScrolls = screen.scrolls
      .map((s) => `${s.scroller}:${s.x}:${s.y}`)
      .sort();
    if (JSON.stringify(expectedScrolls) !== JSON.stringify(actualScrolls))
      throw new Error(`incomplete scroll captures ${screen.id}`);
    for (const f of [
      screen.png,
      `${screen.vp}/${screen.stem}.geom.json.gz`,
      ...screen.scrolls.map((s) => s.png),
    ]) {
      const p = artifact(directory, f);
      if (f.endsWith(".png")) {
        const x = PNG.sync.read(fs.readFileSync(p));
        const scroll = screen.scrolls.find((s) => s.png === f);
        if (scroll && (x.width !== scroll.box[2] || x.height !== scroll.box[3]))
          throw new Error(`scroll size mismatch ${f}`);
      }
      artifacts.push({ path: f, sha256: fileHash(p) });
    }
  }
  if (seen.size !== expected.size) throw new Error("incomplete captures");
  return artifacts;
}
export function createAdapter({ harnessRoot, outputFile }) {
  const pinned = execFileSync(
    "git",
    [
      "-C",
      harnessRoot,
      "show",
      `${CONTRACT.candidateSource}:tools/parity/capture.mjs`,
    ],
    { encoding: "utf8" },
  );
  if (
    pinned !==
    fs.readFileSync(path.join(harnessRoot, "tools/parity/capture.mjs"), "utf8")
  )
    throw new Error("unmerged PR #203 harness dependency changed");
  const replace = (s, from, to) => {
    if (s.split(from).length !== 2)
      throw new Error(`adapter anchor changed: ${from}`);
    return s.replace(from, to);
  };
  let code = replace(
    pinned,
    'const ROOT = path.resolve(HERE, "../..");',
    'let ROOT = path.dirname(fileURLToPath(import.meta.url));\nwhile (!existsSync(path.join(ROOT, "package.json")) && path.dirname(ROOT) !== ROOT) ROOT = path.dirname(ROOT);\nif (!existsSync(path.join(ROOT, "package.json"))) throw new Error("package.json not found above adapter");',
  );
  code = replace(
    code,
    'export const FIXED_NOW = "2026-10-19T10:00:00+02:00";',
    `export const FIXED_NOW = ${JSON.stringify(CONTRACT.clock)};`,
  );
  code = replace(
    code,
    'import { chromium } from "@playwright/test";',
    'import { chromium } from "@playwright/test";\nimport { existsSync } from "node:fs";',
  );
  code = replace(
    code,
    "const FREEZE_CSS = `",
    `const { inspectPage } = await import(pathToFileURL(path.join(ROOT, "tools/parity/reference/capture-metadata.mjs")).href);\nconst FREEZE_CSS = `,
  );
  code = replace(
    code,
    "const geom = await page.evaluate(geometry);",
    'const geom = await page.evaluate(geometry);\n            const captureEvidence = await inspectPage(page);\n            captureEvidence.scrollers = await page.evaluate(scrollers);\n            for (const row of geom) row.push(...(captureEvidence.semantics[row[0]] ?? ["", ""]));',
  );
  code = replace(
    code,
    "marker: expectedCaptureMarker(shot),",
    "marker: expectedCaptureMarker(shot),\n              captureEvidence,",
  );
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, code);
  return {
    dependency: CONTRACT.candidateSource,
    originalCaptureSha256: sha256(pinned),
    adapterSha256: sha256(code),
    transformations: [
      "portable checkout root discovery",
      "D32 09:00 clock",
      "post-image semantic/font/state/scroller metadata; role/name append to geometry; no screenshot selectors/settings change",
    ],
  };
}

export function assertD32Text(text) {
  const section = text.split("## D32.")[1]?.split("\n## D33.")[0] ?? "";
  for (const clause of [
    "Owner overriding rule",
    CONTRACT.clock,
    "within 1 CSS pixel",
    "at most 0.1 percent of pixels",
    "pixelmatch threshold 0.1",
  ])
    if (!section.includes(clause))
      throw new Error(
        "D32 document/contract inconsistency; owner decision required",
      );
}

export function artifactMapping({
  oldArtifacts,
  proposedDirectory,
  artifacts,
}) {
  const old = new Map(oldArtifacts.map((x) => [x.path, x.sha256]));
  const proposed = new Map(artifacts.map((x) => [x.path, x.sha256]));
  for (const name of ["manifest.json", "provenance.json"])
    proposed.set(name, fileHash(path.join(proposedDirectory, name)));
  return [...new Set([...old.keys(), ...proposed.keys()])]
    .sort()
    .map((file) => ({
      path: file,
      oldSha256: old.get(file) ?? null,
      proposedSha256: proposed.get(file) ?? null,
      reason: ["manifest.json", "provenance.json"].includes(file)
        ? "New validated historical-source capture/provenance receipt, including full contract and source/environment hashes."
        : file.includes("s04-template-habits")
          ? "Intended Habits replaces faulty Tabs; historical authority, D32 clock, recorded environment and semantic metadata. No current-app expected pixels."
          : file.endsWith(".geom.json.gz")
            ? "Historical authority; D32 clock/recorded environment; role/name metadata added. No application evolution baselined."
            : "Historical authority recaptured with D32 clock and recorded environment; original-host residual is not attributed to a specific cause. No current-app expected pixels.",
    }));
}
