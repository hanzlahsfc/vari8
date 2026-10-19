// Renders every canvas screen in icm/04-briefing/shots/index.json at 1440x900 and 390x844.
// Usage: node tools/parity/capture.mjs [--url http://127.0.0.1:3630] [--out tools/parity/out/current]
// Each shot replays its click path from a fresh browser context with a frozen clock, seeded
// Math.random/randomUUID, empty origin storage, and animations and caret disabled.
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
export const INDEX_PATH = path.join(ROOT, "icm/04-briefing/shots/index.json");
export const VIEWPORTS = {
  1440: { width: 1440, height: 900 },
  390: { width: 390, height: 844 },
};
export const FIXED_NOW = "2026-10-19T10:00:00+02:00";
export const TIMEZONE = "Europe/Vienna";
// Same storage seed for every capture. Empty on purpose: the canvas seeds its demo state from code.
export const STORAGE_SEED = {};

const FREEZE_CSS = `
*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}
input,textarea,[contenteditable]{caret-color:transparent!important}
nextjs-portal,[data-nextjs-toast],[data-next-badge-root],#__next-build-watcher{display:none!important}`;

const initScript = (seed) => `(() => {
  let s = 0x2545f491;
  const rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  Math.random = rnd;
  Object.defineProperty(crypto, "randomUUID", { value: () =>
    "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => Math.floor(rnd() * 16).toString(16)) });
  localStorage.clear();
  for (const [k, v] of Object.entries(${JSON.stringify(seed)})) localStorage.setItem(k, v);
})();`;

// Waits for network idle, fonts, and a 400 ms quiet window with no DOM mutations (3 s cap).
// ponytail: quiet-window settle with a 3 s cap; a DOM loop that never settles can still land one frame early.
export async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        let timer = setTimeout(done, 400);
        const mo = new MutationObserver(() => {
          clearTimeout(timer);
          timer = setTimeout(done, 400);
        });
        function done() {
          mo.disconnect();
          resolve();
        }
        mo.observe(document.body, {
          subtree: true,
          childList: true,
          attributes: true,
          characterData: true,
        });
        setTimeout(done, 3000);
      }),
  );
}

// Clicks the innermost visible element whose text (or aria-label/title) matches the label.
// The 390 px layout shows shorter tab names (numbers hidden, "Training" for "Training Program") and
// icon-only controls with other aria-labels. Used only when the desktop recipe label is not found.
const MOBILE_LABEL = {
  "Training Program": "Training",
  "Workspace preferences for Liliana Mansfeld": "Workspace preferences",
};
export const mobileFallback = (label) =>
  MOBILE_LABEL[label] ?? label.replace(/^\d{2}\s+/, "");

// Recipe steps that match more than one element at a viewport. Keyed by shot stem, then recipe label.
//   within:     selector of the container(s) to search (all matches count)
//   containing: keep only containers whose text includes this (picks one card or plan module)
//   target:     selector for the candidate elements inside the container (default: any element)
// A step must resolve to exactly one element after its scope, or the capture throws. Keep this
// table next to the recipes: a new ambiguous step fails the run until it gets a scope here.
const TEMPLATE_NAV = { within: 'nav[aria-label="Template configuration"]' };
const TEMPLATE_CARD = {
  within: "article.cd-template-card",
  containing: "Strength & balance",
};
const VIEW_TOGGLE = { within: ".cd-view-settings", target: "[role=switch]" };
export const STEP_SCOPES = {
  "s01-profile-checkins": { "Check-ins": { within: ".cd-profile-tabs" } },
  "s04-template-habits": Object.fromEntries(
    [
      "Dashboard",
      "Tracker",
      "Timeline / Roadmap",
      "Nutrition",
      "Training Program",
      "Check-In",
      "Habits",
    ].map((label) => [label, VIEW_TOGGLE]),
  ),
  "s05-tracker-setup": { "02 Dashboard": TEMPLATE_NAV },
  "s06-mealplan-editor": {
    Create: { within: ".cd-plan-module", containing: "Nutrition" },
  },
  "s06-template-nutrition": { "02 Dashboard": TEMPLATE_NAV },
  "s08-template-dashboard": { "02 Dashboard": TEMPLATE_NAV },
  "s09-tracker-today": { Preview: TEMPLATE_CARD },
  "s09-tracker-week": { Preview: TEMPLATE_CARD },
  "s09-tracker-trends": { Preview: TEMPLATE_CARD },
};

// Exact matches win over substring matches. Throws when nothing matches, or when more than one element matches.
export async function clickByText(
  page,
  label,
  { fallback = false, scope = null } = {},
) {
  const tried = [label];
  if (fallback && mobileFallback(label) !== label)
    tried.push(mobileFallback(label));
  for (const target of tried) {
    const hit = await findAndCenter(page, target, scope);
    if (hit) {
      await page.mouse.click(hit.x, hit.y);
      await settle(page);
      return {
        label: target,
        matches: hit.matches,
        tag: hit.tag,
        seen: hit.seen,
        scoped: Boolean(scope),
        recipe: label,
      };
    }
  }
  throw new Error(
    `click target not found: "${label}" (tried ${tried.map((t) => `"${t}"`).join(", ")})`,
  );
}

async function findAndCenter(page, target, scope) {
  return page.evaluate(
    ({ target, scope }) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
      const want = norm(target);
      // innerText, not textContent: roster rows concatenate "CP" and "Chloe Park" without a space in textContent
      const txt = (el) => norm(el.innerText ?? el.textContent);
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return false;
        const cs = getComputedStyle(el);
        return cs.visibility !== "hidden" && cs.display !== "none";
      };
      let roots;
      if (scope) {
        roots = [...document.querySelectorAll(scope.within)];
        if (scope.containing)
          roots = roots.filter((r) =>
            norm(r.innerText).includes(norm(scope.containing)),
          );
      } else {
        const dialogs = [...document.querySelectorAll("dialog[open]")];
        roots = [dialogs.length ? dialogs[dialogs.length - 1] : document.body];
      }
      const els = roots
        .flatMap((r) => [...r.querySelectorAll(scope?.target ?? "*")])
        .filter(visible);
      const labelled = (el) =>
        norm(el.getAttribute("aria-label")) === want ||
        norm(el.getAttribute("title")) === want;
      const innermost = (list) =>
        list.filter((el) => !list.some((o) => o !== el && el.contains(o)));
      let pool = innermost(
        els.filter((el) => txt(el) === want || labelled(el)),
      );
      if (!pool.length)
        pool = innermost(els.filter((el) => txt(el).includes(want)));
      if (!pool.length) return null;
      if (pool.length > 1)
        throw new Error(
          `ambiguous click "${target}": ${pool.length} matches${scope ? " inside its scope" : ""}`,
        );
      const el = pool[0];
      el.scrollIntoView({ block: "center", inline: "center" });
      const r = el.getBoundingClientRect();
      return {
        x: r.x + r.width / 2,
        y: r.y + r.height / 2,
        matches: pool.length,
        tag: el.tagName.toLowerCase(),
        seen: txt(el).slice(0, 60),
      };
    },
    { target, scope },
  );
}

// Every visible element as [documentPath, tag, x, y, w, h], coordinates in document space, 0.5 px grid.
// ponytail: keys are DOM paths, so one inserted sibling reports every later element as moved. Upgrade: match by tag and text if that noise hurts.
export const geometry = () => {
  const q = (n) => Math.round(n * 2) / 2;
  const key = (el) => {
    const parts = [];
    for (
      let n = el;
      n && n.nodeType === 1 && n !== document.documentElement;
      n = n.parentElement
    ) {
      parts.unshift(
        `${n.tagName.toLowerCase()}[${[...n.parentElement.children].indexOf(n)}]`,
      );
    }
    return parts.join(">");
  };
  const out = [];
  for (const el of document.body.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (
      cs.visibility === "hidden" ||
      cs.display === "none" ||
      cs.opacity === "0"
    )
      continue;
    if (el.closest("[hidden],[inert]")) continue;
    // Own text nodes, so text inside clipped scroll regions (the 390 px roster) is compared too.
    const own = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
    out.push([
      key(el),
      el.tagName.toLowerCase(),
      q(r.x + scrollX),
      q(r.y + scrollY),
      q(r.width),
      q(r.height),
      own,
    ]);
  }
  return out;
};

export async function captureAll({ baseUrl, outDir, log = console.log }) {
  const index = JSON.parse(await readFile(INDEX_PATH, "utf8"));
  const browser = await chromium.launch();
  const manifest = {
    baseUrl,
    fixedNow: FIXED_NOW,
    timezone: TIMEZONE,
    screens: [],
    failures: [],
  };
  try {
    for (const vp of Object.keys(VIEWPORTS)) {
      await mkdir(path.join(outDir, vp), { recursive: true });
      for (const shot of index.shots) {
        const stem = shot.file.replace(/\.(png|webp)$/, "");
        const ctx = await browser.newContext({
          viewport: VIEWPORTS[vp],
          deviceScaleFactor: 1,
          timezoneId: TIMEZONE,
          locale: "en-US",
          colorScheme: "light",
          reducedMotion: "reduce",
          serviceWorkers: "block",
        });
        await ctx.addInitScript(initScript(STORAGE_SEED));
        const page = await ctx.newPage();
        const pageErrors = [];
        page.on("pageerror", (e) => pageErrors.push(e.message));
        try {
          await page.clock.setFixedTime(new Date(FIXED_NOW));
          await page.goto(baseUrl + shot.route, {
            waitUntil: "domcontentloaded",
            timeout: 120000,
          });
          await page.addStyleTag({ content: FREEZE_CSS });
          await settle(page);
          const clickLog = [];
          for (const label of shot.clicks)
            clickLog.push(
              await clickByText(page, label, {
                fallback: vp === "390",
                scope: STEP_SCOPES[stem]?.[label] ?? null,
              }),
            );
          await page.evaluate(() => window.scrollTo(0, 0));
          await settle(page);
          const png = await page.screenshot({
            fullPage: true,
            animations: "disabled",
            caret: "hide",
          });
          const geom = await page.evaluate(geometry);
          const rel = path.join(vp, `${stem}.png`);
          await writeFile(path.join(outDir, rel), png);
          await writeFile(
            path.join(outDir, vp, `${stem}.geom.json.gz`),
            gzipSync(JSON.stringify(geom)),
          );
          const size = await page.evaluate(() => [
            document.documentElement.scrollWidth,
            document.documentElement.scrollHeight,
          ]);
          manifest.screens.push({
            id: `${stem}@${vp}`,
            vp,
            stem,
            route: shot.route,
            screen: shot.screen,
            clicks: clickLog,
            png: rel.split(path.sep).join("/"),
            sha256: createHash("sha256").update(png).digest("hex"),
            size: { width: size[0], height: size[1] },
            elements: geom.length,
            pageErrors,
          });
          if (pageErrors.length)
            manifest.failures.push({
              id: `${stem}@${vp}`,
              error: `pageerror: ${pageErrors[0]}`,
            });
          log(`OK ${stem}@${vp} ${size[0]}x${size[1]} elements=${geom.length}`);
        } catch (err) {
          manifest.failures.push({
            id: `${stem}@${vp}`,
            error: String(err.message || err).split("\n")[0],
          });
          log(
            `FAIL ${stem}@${vp}: ${String(err.message || err).split("\n")[0]}`,
          );
        } finally {
          await ctx.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
  await writeFile(
    path.join(outDir, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  return manifest;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const arg = (name, dflt) => {
    const i = process.argv.indexOf(name);
    return i > -1 ? process.argv[i + 1] : dflt;
  };
  const baseUrl = arg("--url", "http://127.0.0.1:3630");
  const outDir = path.resolve(ROOT, arg("--out", "tools/parity/out/current"));
  const m = await captureAll({ baseUrl, outDir });
  console.log(
    `captured ${m.screens.length} screens, ${m.failures.length} failures`,
  );
  process.exit(m.failures.length ? 1 : 0);
}
