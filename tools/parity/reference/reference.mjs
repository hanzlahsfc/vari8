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
function scrollerNameTag(name) {
  const i = name.lastIndexOf("#");
  if (i <= 0) return null;
  const tag = name.slice(0, i);
  const suffix = name.slice(i + 1);
  if (!/^\d+$/.test(suffix) || String(Number(suffix)) !== suffix) return null;
  if (!/^[\p{L}:_][\p{L}\p{N}\p{M}:_.\-\u00B7\u203F\u2040]*$/u.test(tag))
    return null;
  return { tag, idx: Number(suffix) };
}
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
  // expected set derives from the pinned contract — never a magic
  // number the recipe list could silently drift past
  const expectedRecipes =
    CONTRACT.expectedScreens / Object.keys(CONTRACT.viewports).length;
  if (
    shots.length !== expectedRecipes ||
    manifest.screens.length !== CONTRACT.expectedScreens
  )
    throw new Error(
      `incomplete capture set; expected ${expectedRecipes} recipes and ${CONTRACT.expectedScreens} screens`,
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
    // the ID must be exactly stem@viewport — a mismatched tuple that
    // happens to share an expected id or a real viewport is a forgery,
    // not a valid capture
    if (
      !CONTRACT.viewports[screen.vp] ||
      screen.id !== `${screen.stem}@${screen.vp}`
    )
      throw new Error(
        `id/stem/viewport mismatch: id ${JSON.stringify(screen.id)} vs stem ${JSON.stringify(screen.stem)} vp ${JSON.stringify(screen.vp)}`,
      );
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
    // the screen's PNG is its own identity — exactly vp/stem.png,
    // never another screen's valid artifact
    if (screen.png !== `${screen.vp}/${screen.stem}.png`)
      throw new Error(
        `artifact identity mismatch ${screen.id}: png ${JSON.stringify(screen.png)} != ${screen.vp}/${screen.stem}.png`,
      );
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
    // scroll captures are tuple-bound: vp/stem.s<scrollerIdx>-<x>-<y>.png
    // — the filename encodes the scroller's index in the recorded
    // inventory AND the capture coordinates; a same-screen swap
    // between coordinates or a wrong scroller is a forgery
    for (const scroll of screen.scrolls) {
      // coordinates are numbers from the writer's steps() — strings,
      // nulls and non-finite values are malformed, never coerced
      if (
        typeof scroll.x !== "number" ||
        typeof scroll.y !== "number" ||
        !Number.isFinite(scroll.x) ||
        !Number.isFinite(scroll.y)
      )
        throw new Error(
          `malformed scroll coordinates ${screen.id}: ${JSON.stringify({ x: scroll.x, y: scroll.y })}`,
        );
      const matches = screen.captureEvidence.scrollers.filter(
        (s) => s.name === scroll.scroller,
      );
      if (matches.length !== 1)
        throw new Error(
          `${matches.length ? "ambiguous" : "unknown"} scroller ${JSON.stringify(scroll.scroller)} on ${screen.id}`,
        );
      const scroller = matches[0];
      // the writer emits exactly tag#idx — one separator, lowercase
      // tag name, non-negative integer index agreeing with the idx
      // field. Extra separators, junk affixes and non-integer indices
      // cannot be emitted by the writer — they are forged identities
      if (
        typeof scroller.name !== "string" ||
        !Number.isInteger(scroller.idx) ||
        scroller.idx < 0 ||
        // writer emits `${tagName.toLowerCase()}#${idx}` — tag is whatever
        // the DOM produces (Unicode included), `#` splits exactly once,
        // the integer suffix must equal idx verbatim (no leading zeros)
        scroller.name !== scroller.name.toLowerCase() ||
        // DOM qualified-name contract (createElement's validation):
        // letters/underscores/colons start, NameChars (digits, dots,
        // hyphens, middle dot, combining marks, joiners) continue —
        // all writer-reachable. # is never a NameChar so the FINAL #
        // is the recorded index separator, and its integer must equal
        // the recorded idx field verbatim
        !scrollerNameTag(scroller.name) ||
        scrollerNameTag(scroller.name).idx !== scroller.idx
      )
        throw new Error(
          `forged scroller identity on ${screen.id}: name ${JSON.stringify(scroller.name)} vs idx ${JSON.stringify(scroller.idx)}`,
        );
      // s.idx is the DOM element index — the capture writer's identity,
      // not an array position; tag#idx in the name agrees with it
      const expectedPng = `${screen.vp}/${screen.stem}.s${scroller.idx}-${scroll.x}-${scroll.y}.png`;
      if (scroll.png !== expectedPng)
        throw new Error(
          `scroll artifact identity mismatch ${screen.id}: ${JSON.stringify(scroll.png)} != ${expectedPng}`,
        );
    }
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
  // unique ownership — one artifact path belongs to exactly one screen
  const owners = new Map();
  for (const a of artifacts) owners.set(a.path, (owners.get(a.path) ?? 0) + 1);
  const shared = [...owners.entries()].filter(([, n]) => n > 1);
  if (shared.length)
    throw new Error(
      `artifact shared across screens: ${shared.map(([p]) => p).join(", ")}`,
    );
  return artifacts;
}
export function createAdapter({ harnessRoot, outputFile }) {
  // The adapter transforms the harness's capture.mjs only when the file
  // is EXACTLY the reviewed component pinned in the comparer manifest —
  // byte-identity binds every semantic surface (auth, recipe selection,
  // viewports, output paths, screenshot settings); anchors below only
  // validate transformation structure, they never approve a mutated
  // source. CONTRACT.candidateSource stays provenance for the
  // historical reference capture — unmodified.
  const pinned = fs.readFileSync(
    path.join(harnessRoot, "tools/parity/capture.mjs"),
    "utf8",
  );
  const manifest = JSON.parse(
    fs.readFileSync(
      new URL("./evidence/comparer.json", import.meta.url),
      "utf8",
    ),
  );
  const reviewedSha = manifest.components?.capture?.sha256;
  if (!reviewedSha)
    throw new Error("comparer manifest lacks capture component pin");
  if (sha256(pinned) !== reviewedSha)
    throw new Error(
      "capture.mjs differs from the reviewed component pin — unapproved change; adapter refuses",
    );
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
    "const HERE = path.dirname(fileURLToPath(import.meta.url));\n",
    "",
  );
  code = replace(
    code,
    'import { chromium } from "@playwright/test";',
    'import { chromium } from "@playwright/test";\nimport { existsSync } from "node:fs";',
  );
  code = replace(
    code,
    "const FREEZE_CSS = `",
    `const { inspectPage } = await import(pathToFileURL(path.join(ROOT, "tools/parity/reference/capture-metadata.mjs")).href);\nconst FREEZE_CSS = \``,
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
