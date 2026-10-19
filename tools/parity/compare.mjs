// Compares a capture run with the baseline, screen by screen:
//   1. pixel diff: a pixel counts as changed when any channel moves more than AA_TOLERANCE
//      (default 0, bit-exact on the reference host; env PARITY_AA_TOLERANCE for other hosts);
//      a screen fails above MAX_DIFF_PIXELS changed pixels (env PARITY_MAX_DIFF_PIXELS) or on any size change.
//   2. DOM-geometry diff: visible elements added, removed, or moved by more than 0.5 px, or whose own text changed
//      (text covers scroll-clipped content that pixels cannot show).
// Pixel work runs in Chromium (canvas getImageData), so there is no PNG dependency.
// Usage: node tools/parity/compare.mjs [--baseline tools/parity/baseline] [--current tools/parity/out/current]
//        [--report tools/parity/out/report.html]
// Exit 0 when every screen matches, 1 on any real change, a missing screen, or a failed capture.
import { gunzipSync } from "node:zlib";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const MOVE_PX = 0.5;

// Bad input is a refusal (exit 2), never a silent fallback: Number("abc") is NaN and `d > NaN` is always false,
// which would switch the pixel check off.
export class ConfigError extends Error {}
export function envThresholds(env = process.env) {
  const int = (name, max) => {
    const raw = env[name];
    if (raw === undefined) return 0;
    if (!/^\d+$/.test(raw) || Number(raw) > max)
      throw new ConfigError(
        `${name}="${raw}" must be a whole number from 0 to ${max === Infinity ? "any size" : max}`,
      );
    return Number(raw);
  };
  return {
    tol: int("PARITY_AA_TOLERANCE", 255),
    maxDiff: int("PARITY_MAX_DIFF_PIXELS", Infinity),
  };
}

async function pixelDiff(page, aBuf, bBuf, tol) {
  return page.evaluate(
    async ({ a, b, tol }) => {
      const load = (src) =>
        new Promise((ok, no) => {
          const img = new Image();
          img.onload = () => ok(img);
          img.onerror = () => no(new Error("png decode failed"));
          img.src = `data:image/png;base64,${src}`;
        });
      const [A, B] = await Promise.all([load(a), load(b)]);
      const w = Math.max(A.width, B.width);
      const h = Math.max(A.height, B.height);
      const pixels = (img) => {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const x = c.getContext("2d");
        x.drawImage(img, 0, 0);
        return x.getImageData(0, 0, w, h).data;
      };
      const da = pixels(A);
      const db = pixels(B);
      const co = document.createElement("canvas");
      co.width = w;
      co.height = h;
      const cx = co.getContext("2d");
      const out = cx.createImageData(w, h);
      const o = out.data;
      let diff = 0;
      let minX = w;
      let minY = h;
      let maxX = -1;
      let maxY = -1;
      for (let i = 0, p = 0; i < da.length; i += 4, p++) {
        const d = Math.max(
          Math.abs(da[i] - db[i]),
          Math.abs(da[i + 1] - db[i + 1]),
          Math.abs(da[i + 2] - db[i + 2]),
          Math.abs(da[i + 3] - db[i + 3]),
        );
        if (d > tol) {
          diff++;
          const x = p % w;
          const y = (p - x) / w;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          o[i] = 255;
          o[i + 1] = 0;
          o[i + 2] = 0;
          o[i + 3] = 255;
        } else {
          const g = 0.3 * da[i] + 0.59 * da[i + 1] + 0.11 * da[i + 2];
          o[i] = o[i + 1] = o[i + 2] = 128 + g / 2;
          o[i + 3] = 255;
        }
      }
      let png = null;
      if (diff) {
        cx.putImageData(out, 0, 0);
        png = co.toDataURL("image/png").split(",")[1];
      }
      return {
        sizes: [
          [A.width, A.height],
          [B.width, B.height],
        ],
        total: w * h,
        diff,
        bbox: diff ? [minX, minY, maxX, maxY] : null,
        png,
      };
    },
    { a: aBuf.toString("base64"), b: bBuf.toString("base64"), tol },
  );
}

export function geomDiff(baseRows, curRows) {
  const B = new Map(baseRows.map((r) => [r[0], r]));
  const C = new Map(curRows.map((r) => [r[0], r]));
  const added = [];
  const removed = [];
  const moved = [];
  const texts = [];
  for (const [k, c] of C) {
    const b = B.get(k);
    if (!b) {
      added.push(c);
      continue;
    }
    if (
      b[1] !== c[1] ||
      [2, 3, 4, 5].some((i) => Math.abs(b[i] - c[i]) > MOVE_PX)
    )
      moved.push({
        key: k,
        tag: c[1],
        base: b.slice(2, 6),
        now: c.slice(2, 6),
      });
    if (b[6] !== c[6]) texts.push({ key: k, tag: c[1], base: b[6], now: c[6] });
  }
  for (const [k, b] of B) if (!C.has(k)) removed.push(b);
  return { added, removed, moved, texts };
}

const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );

function renderReport(results, extra, meta, { tol, maxDiff }) {
  const failed = results.filter((r) => r.problems.length);
  const rows = results
    .map(
      (
        r,
      ) => `<tr class="${r.problems.length ? "fail" : "pass"}"><td>${esc(r.id)}</td><td>${esc(r.route)}</td>
<td>${r.pixels ? r.pixels.diff : "-"}</td><td>${r.geom ? `${r.geom.added.length}/${r.geom.removed.length}/${r.geom.moved.length}` : "-"}</td>
<td>${r.problems.length ? esc(r.problems.join("; ")) : "PASS"}</td></tr>`,
    )
    .join("\n");
  const details = failed
    .map((r) => {
      const moved = (r.geom?.moved ?? [])
        .slice(0, 30)
        .map(
          (m) =>
            `<li><code>${esc(m.tag)}</code> base ${esc(m.base)} now ${esc(m.now)}</li>`,
        )
        .join("");
      const texts = (r.geom?.texts ?? [])
        .slice(0, 30)
        .map(
          (t) =>
            `<li><code>${esc(t.tag)}</code> text "${esc(t.base)}" now "${esc(t.now)}"</li>`,
        )
        .join("");
      const img = (src, label) =>
        src
          ? `<figure><figcaption>${label}</figcaption><img src="${src}"></figure>`
          : "";
      return `<section><h2>${esc(r.id)} <small>${esc(r.screen ?? "")}</small></h2>
<div class="imgs">${img(r.images?.base, "baseline")}${img(r.images?.now, "current")}${img(r.images?.diff, "diff (red = changed)")}</div>
${r.pixels?.bbox ? `<p>changed bbox x ${r.pixels.bbox[0]}-${r.pixels.bbox[2]}, y ${r.pixels.bbox[1]}-${r.pixels.bbox[3]}</p>` : ""}
${moved ? `<p>First moved elements (up to 30):</p><ul>${moved}</ul>` : ""}${texts ? `<p>Changed text (up to 30, includes scroll-clipped content):</p><ul>${texts}</ul>` : ""}</section>`;
    })
    .join("\n");
  return `<!doctype html><meta charset="utf-8"><title>Vari8 canvas parity report</title>
<style>body{font:14px system-ui;margin:24px;color:#111}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px;text-align:left}
tr.fail{background:#fde2e2}tr.pass td:last-child{color:#166534}.imgs{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start}
.imgs img{max-width:520px;border:1px solid #bbb}figure{margin:0}code{font-size:12px}</style>
<h1>Canvas visual parity</h1>
<p>${esc(meta)}</p>
<p><b>${failed.length + extra.length ? "FAIL" : "PASS"}</b>: ${failed.length} of ${results.length} screens changed${extra.length ? `, ${extra.length} capture problems` : ""}.
Pixel tolerance ${tol}/255 per channel, max ${maxDiff} changed pixels. Geometry: added/removed/moved elements.</p>
${extra.length ? `<ul>${extra.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>` : ""}
<table><tr><th>screen</th><th>route</th><th>changed px</th><th>geom +/-/moved</th><th>result</th></tr>
${rows}</table>
${details}`;
}

export async function compareRuns({
  baseline,
  current,
  report,
  log = console.log,
  th = envThresholds(),
}) {
  const { tol, maxDiff } = th;
  const base = JSON.parse(
    await readFile(path.join(baseline, "manifest.json"), "utf8"),
  );
  const cur = JSON.parse(
    await readFile(path.join(current, "manifest.json"), "utf8"),
  );
  const curById = new Map(cur.screens.map((s) => [s.id, s]));
  const baseIds = new Set(base.screens.map((s) => s.id));
  const extra = [
    ...cur.failures.map((f) => `capture failed ${f.id}: ${f.error}`),
    ...cur.screens
      .filter((s) => !baseIds.has(s.id))
      .map((s) => `screen not in baseline: ${s.id}`),
  ];
  const browser = await chromium.launch();
  const results = [];
  try {
    const page = await browser.newPage();
    await page.setContent("<html></html>");
    for (const b of base.screens) {
      const c = curById.get(b.id);
      const r = { id: b.id, route: b.route, screen: b.screen, problems: [] };
      results.push(r);
      if (!c) {
        r.problems.push("missing in current capture");
        continue;
      }
      const [aBuf, bBuf] = await Promise.all([
        readFile(path.join(baseline, b.png)),
        readFile(path.join(current, c.png)),
      ]);
      const px = await pixelDiff(page, aBuf, bBuf, tol);
      r.pixels = { diff: px.diff, bbox: px.bbox, sizes: px.sizes };
      const sizeChanged = px.sizes[0].join() !== px.sizes[1].join();
      if (sizeChanged)
        r.problems.push(`page size ${px.sizes[0]} -> ${px.sizes[1]}`);
      if (px.diff > maxDiff) r.problems.push(`${px.diff} changed pixels`);
      // Inner scroll containers: one PNG per scroll step (see capture.mjs). A paint change on a clipped row shows here.
      const bs = b.scrolls ?? [];
      const cs = c.scrolls ?? [];
      if (bs.length !== cs.length) {
        r.problems.push(`scroll captures ${bs.length} -> ${cs.length}`);
      } else {
        for (const [i, sb] of bs.entries()) {
          const sc = cs[i];
          const where = `scroll ${sb.scroller} at ${sb.x},${sb.y}`;
          if (sb.scroller !== sc.scroller || sb.x !== sc.x || sb.y !== sc.y) {
            r.problems.push(`${where}: now ${sc.scroller} at ${sc.x},${sc.y}`);
            continue;
          }
          const [s1, s2] = await Promise.all([
            readFile(path.join(baseline, sb.png)),
            readFile(path.join(current, sc.png)),
          ]);
          const sp = await pixelDiff(page, s1, s2, tol);
          if (sp.sizes[0].join() !== sp.sizes[1].join())
            r.problems.push(`${where}: size ${sp.sizes[0]} -> ${sp.sizes[1]}`);
          if (sp.diff > maxDiff)
            r.problems.push(`${where}: ${sp.diff} changed pixels`);
        }
      }
      const bg = JSON.parse(
        gunzipSync(
          await readFile(path.join(baseline, b.vp, `${b.stem}.geom.json.gz`)),
        ),
      );
      const cg = JSON.parse(
        gunzipSync(
          await readFile(path.join(current, c.vp, `${c.stem}.geom.json.gz`)),
        ),
      );
      r.geom = geomDiff(bg, cg);
      const g = r.geom;
      if (g.added.length || g.removed.length || g.moved.length) {
        r.problems.push(
          `geometry: ${g.added.length} added, ${g.removed.length} removed, ${g.moved.length} moved`,
        );
      }
      if (g.texts.length) r.problems.push(`text: ${g.texts.length} changed`);
      if (r.problems.length) {
        r.images = {
          base: `data:image/png;base64,${aBuf.toString("base64")}`,
          now: `data:image/png;base64,${bBuf.toString("base64")}`,
          diff: px.png ? `data:image/png;base64,${px.png}` : null,
        };
      }
      log(
        `${r.problems.length ? "FAIL" : "ok  "} ${b.id} px=${px.diff} geom=${g.added.length}/${g.removed.length}/${g.moved.length} text=${g.texts.length}`,
      );
    }
  } finally {
    await browser.close();
  }
  const failed = results.filter((r) => r.problems.length).length + extra.length;
  const meta = `baseline ${base.baseUrl} (${base.screens.length} screens), current ${cur.baseUrl} (${cur.screens.length} screens), retried ${cur.retried ?? 0} capture(s), ${new Date().toISOString()}`;
  await writeFile(report, renderReport(results, extra, meta, th));
  extra.forEach((e) => log(`FAIL ${e}`));
  return { failed, results, extra, report };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const arg = (name, dflt) => {
    const i = process.argv.indexOf(name);
    return i > -1 ? path.resolve(process.argv[i + 1]) : dflt;
  };
  let r;
  try {
    r = await compareRuns({
      baseline: arg("--baseline", path.join(HERE, "baseline")),
      current: arg("--current", path.join(HERE, "out/current")),
      report: arg("--report", path.join(HERE, "out/report.html")),
    });
  } catch (e) {
    if (!(e instanceof ConfigError)) throw e;
    console.error(`parity: ${e.message}`);
    process.exit(2);
  }
  console.log(
    `parity ${r.failed ? "FAIL" : "PASS"}: ${r.failed} problem(s); report ${r.report}`,
  );
  process.exit(r.failed ? 1 : 0);
}
