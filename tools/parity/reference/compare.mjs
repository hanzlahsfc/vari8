import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { geomDiff, applyRuled } from "../compare.mjs";
import { CONTRACT } from "./reference.mjs";
export function compareGeometry(
  base,
  now,
  strict = false,
  ignored = new Set(),
) {
  const raw = geomDiff(base, now);
  const px = strict ? 0.5 : CONTRACT.geometryPx;
  const B = new Map(base.map((r) => [r[0], r]));
  const semantics = [];
  for (const row of now) {
    const b = B.get(row[0]);
    if (b && !ignored.has(row[0]) && (b[7] !== row[7] || b[8] !== row[8]))
      semantics.push({
        key: row[0],
        base: b.slice(7, 9),
        now: row.slice(7, 9),
      });
  }
  return {
    ...raw,
    moved: raw.moved.filter((r) =>
      r.base.some((v, i) => Math.abs(v - r.now[i]) > px),
    ),
    semantics,
  };
}
export function comparePixels(aBuffer, bBuffer, masks = [], strict = false) {
  const a = PNG.sync.read(aBuffer),
    b = PNG.sync.read(bBuffer);
  const sizeEqual = a.width === b.width && a.height === b.height;
  if (!sizeEqual)
    return {
      pass: false,
      changed: null,
      budget: 0,
      sizes: [
        [a.width, a.height],
        [b.width, b.height],
      ],
      sizeEqual: false,
    };
  const A = Buffer.from(a.data),
    B = Buffer.from(b.data);
  let raw = 0;
  for (let y = 0; y < a.height; y++)
    for (let x = 0; x < a.width; x++) {
      const i = (y * a.width + x) * 4;
      const masked = masks.some(
        ([mx, my, mw, mh]) => x >= mx && x < mx + mw && y >= my && y < my + mh,
      );
      if (masked) {
        A.fill(0, i, i + 3);
        B.fill(0, i, i + 3);
        A[i + 3] = B[i + 3] = 255;
      } else if (
        A[i] !== B[i] ||
        A[i + 1] !== B[i + 1] ||
        A[i + 2] !== B[i + 2] ||
        A[i + 3] !== B[i + 3]
      )
        raw++;
    }
  const changed = strict
    ? raw
    : pixelmatch(A, B, null, a.width, a.height, {
        threshold: CONTRACT.pixelmatchThreshold,
        includeAA: CONTRACT.pixelmatchIncludeAA,
      });
  const budget = strict
    ? 0
    : Math.floor(a.width * a.height * CONTRACT.maxChangedFraction);
  return {
    pass: changed <= budget,
    changed,
    raw,
    budget,
    sizes: [
      [a.width, a.height],
      [b.width, b.height],
    ],
    sizeEqual,
  };
}
const scrollMasks = (masks, box, sx, sy) =>
  masks.flatMap(([x, y, w, h]) => [
    [x - box[0], y - box[1], w, h],
    [x - box[0] - sx, y - box[1] - sy, w, h],
  ]);
export function compareRuns(baseDir, currentDir, { strict = false } = {}) {
  const authority = JSON.parse(
    fs.readFileSync(path.join(baseDir, "provenance.json"), "utf8"),
  );
  if (
    authority.role !== "historical" ||
    authority.source.sha !== CONTRACT.referenceSource
  )
    throw new Error(
      "expected output must come from the authorized historical source, never the root app",
    );
  const base = JSON.parse(
    fs.readFileSync(path.join(baseDir, "manifest.json"), "utf8"),
  );
  const now = JSON.parse(
    fs.readFileSync(path.join(currentDir, "manifest.json"), "utf8"),
  );
  const results = [];
  for (const a of base.screens) {
    const b = now.screens.find((x) => x.id === a.id);
    const problems = [];
    if (!b) {
      results.push({ id: a.id, pass: false, problems: ["missing capture"] });
      continue;
    }
    const read = (dir, s) =>
      JSON.parse(
        gunzipSync(
          fs.readFileSync(path.join(dir, s.vp, `${s.stem}.geom.json.gz`)),
        ),
      );
    const ag = read(baseDir, a),
      bg = read(currentDir, b);
    const raw = geomDiff(ag, bg);
    const ruled = applyRuled(a.stem, raw, ag, bg);
    const remainingText = new Set(ruled.geom.texts.map((x) => x.key)),
      remainingAdded = new Set(ruled.geom.added.map((x) => x[0]));
    const ignored = new Set([
      ...raw.texts.filter((x) => !remainingText.has(x.key)).map((x) => x.key),
      ...raw.added.filter((x) => !remainingAdded.has(x[0])).map((x) => x[0]),
    ]);
    const geometry = compareGeometry(ag, bg, strict, ignored);
    geometry.added = ruled.geom.added;
    geometry.removed = ruled.geom.removed;
    geometry.texts = ruled.geom.texts;
    geometry.moved = geometry.moved.filter((x) => !ignored.has(x.key));
    const pixels = comparePixels(
      fs.readFileSync(path.join(baseDir, a.png)),
      fs.readFileSync(path.join(currentDir, b.png)),
      ruled.masks,
      strict,
    );
    if (!pixels.pass)
      problems.push(pixels.sizeEqual ? "pixels exceed budget" : "page size");
    if (
      geometry.added.length ||
      geometry.removed.length ||
      geometry.moved.length ||
      geometry.texts.length ||
      geometry.semantics.length
    )
      problems.push("geometry/text/role/name");
    const scrolls = [];
    if (a.scrolls.length !== b.scrolls.length) problems.push("scroll count");
    for (let i = 0; i < Math.min(a.scrolls.length, b.scrolls.length); i++) {
      const x = a.scrolls[i],
        y = b.scrolls[i];
      if (x.scroller !== y.scroller || x.x !== y.x || x.y !== y.y) {
        scrolls.push({
          pass: false,
          reason: "scroll position",
          base: x,
          now: y,
        });
        problems.push("scroll position");
        continue;
      }
      const p = comparePixels(
        fs.readFileSync(path.join(baseDir, x.png)),
        fs.readFileSync(path.join(currentDir, y.png)),
        scrollMasks(ruled.masks, y.box, y.x, y.y),
        strict,
      );
      scrolls.push(p);
      if (!p.pass) problems.push("scroll pixels/size");
    }
    results.push({
      id: a.id,
      pass: problems.length === 0,
      problems: [...new Set(problems)],
      pixels,
      geometry,
      scrolls,
      ruled: ruled.rules,
    });
  }
  return {
    strict,
    total: results.length,
    passed: results.filter((x) => x.pass).length,
    failed: results.filter((x) => !x.pass).length,
    results,
  };
}
