import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { PNG } from "pngjs";
import { captureProblem } from "../capture.mjs";
import {
  CONTRACT,
  assertContract,
  fileHash,
  sha256,
  validateRun,
} from "./reference.mjs";

const artifact = (directory, relative) => {
  const p = path.resolve(directory, relative);
  if (!p.startsWith(path.resolve(directory) + path.sep))
    throw new Error("capture artifact escapes run directory");
  if (!fs.existsSync(p))
    throw new Error(`missing capture artifact ${relative}`);
  return p;
};

const steps = (max, size) => {
  if (max < 1) return [0];
  const a = [];
  for (let x = 0; x < max; x += Math.max(1, size)) a.push(x);
  a.push(max);
  return a;
};

export function assertProposedReference({ directory, shots }) {
  const readJson = (name) =>
    JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"));
  const provenance = readJson("provenance.json");
  assertContract(provenance.contract);
  return validateRun({
    directory,
    manifest: readJson("manifest.json"),
    shots,
    provenance,
  });
}

export function validateCombinedRun({
  directory,
  manifest,
  shots,
  provenance,
}) {
  if (!provenance?.source || !provenance?.contract)
    throw new Error("missing combined-run provenance");
  const source = provenance.source;
  if (
    provenance.role !== "combined" ||
    !source.sha ||
    !source.tree ||
    source.dirtyTracked ||
    source.untracked
  )
    throw new Error("combined run source must be the exact clean prep commit");
  if (source.sha !== provenance.inputs.prep.head)
    throw new Error("combined run source is not the recorded prep head");
  assertContract(provenance.contract);
  if (
    manifest.fixedNow !== CONTRACT.clock ||
    manifest.timezone !== CONTRACT.timezone
  )
    throw new Error("capture clock/timezone inconsistent with contract");
  if (manifest.failures?.length)
    throw new Error("capture failures cannot establish combined evidence");
  if (
    !provenance.environment?.browser?.sha256 ||
    !provenance.environment.nodeSha256 ||
    !provenance.dependencies?.installedTreeSha256 ||
    provenance.dependencies.mismatches?.length ||
    !provenance.adapter?.adapterSha256 ||
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
    // scroll captures are tuple-bound too: vp/stem.s* — another
    // screen's scroll png is a forgery, not shared evidence
    for (const scroll of screen.scrolls)
      if (!scroll.png.startsWith(`${screen.vp}/${screen.stem}.s`))
        throw new Error(
          `scroll artifact identity mismatch ${screen.id}: ${JSON.stringify(scroll.png)}`,
        );
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
