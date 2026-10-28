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
import { existsSync } from "node:fs";

let ROOT = path.dirname(fileURLToPath(import.meta.url));
while (!existsSync(path.join(ROOT, "package.json")) && path.dirname(ROOT) !== ROOT) ROOT = path.dirname(ROOT);
if (!existsSync(path.join(ROOT, "package.json"))) throw new Error("package.json not found above adapter");
export const INDEX_PATH = path.join(ROOT, "icm/04-briefing/shots/index.json");
export const VIEWPORTS = {
  1440: { width: 1440, height: 900 },
  390: { width: 390, height: 844 },
};
export const FIXED_NOW = "2026-10-19T09:00:00+02:00";
export const TIMEZONE = "Europe/Vienna";
// Same storage seed for every capture. Empty on purpose: the canvas seeds its demo state from code.
export const STORAGE_SEED = {};

const { inspectPage } = await import(pathToFileURL(path.join(ROOT, "tools/parity/reference/capture-metadata.mjs")).href);
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
const REQUIRED_QUERY_VALUE = "*";
const COACH_QUERY_KEYS = [
  "section",
  "client",
  "tab",
  "plan",
  "review",
  "editor",
];
const STEP_ALIASES = {
  "s04-template-habits": { "Training Program": "Training" },
};

export const CAPTURE_EXPECTATIONS = {
  "s01-roster": {
    query: { section: "clients" },
    marker: "Filter athletes",
  },
  "s01-profile-overview": {
    query: { section: "clients", client: "client-013" },
    marker: "Chloe Park",
    state: "Overview",
  },
  "s01-profile-plans": {
    query: { section: "clients", client: "client-013", tab: "Plans" },
    marker: "Plans & targets",
    state: "Plans",
  },
  "s01-profile-checkins": {
    query: { section: "clients", client: "client-013", tab: "Check-ins" },
    marker: "Check-in calendar",
    state: "Check-ins",
  },
  "s01-profile-notes": {
    query: {
      section: "clients",
      client: "client-013",
      tab: "Notes & tasks",
    },
    marker: "Notes & tasks",
    state: "Notes & tasks",
  },
  "s01-profile-onboarding": {
    query: {
      section: "clients",
      client: "client-013",
      tab: "Onboarding",
    },
    marker: "Onboarding",
    state: "Onboarding",
  },
  "s02-messages": {
    query: { section: "messages" },
    marker: "Conversations",
  },
  "s02-thread": {
    query: { section: "messages", client: "client-013" },
    marker: "Your coaching conversation",
  },
  "s02-thread-attachments": {
    query: { section: "messages", client: "client-013" },
    marker: "Choose photo, video or file",
  },
  "s02-notes-todos": {
    query: { section: "notes" },
    marker: "Notes & to-dos",
  },
  "s03-checkins-board": {
    query: { section: "check-ins" },
    marker: "Awaiting feedback",
  },
  "s03-add-extra": {
    query: { section: "check-ins" },
    marker: "Add an extra check-in date",
    state: "Add an extra check-in date",
  },
  "s03-checkin-review": {
    query: {
      section: "check-ins",
      client: "client-001",
      review: "submission-emma",
    },
    marker: "Tracker & progress",
  },
  "s04-habit-editor": {
    query: {
      section: "clients",
      client: "client-010",
      plan: "habits",
      tab: "Plans",
    },
    marker: "Client habit definitions",
  },
  "s04-template-habits": {
    query: { section: "templates", editor: REQUIRED_QUERY_VALUE },
    marker: "Include Habit Tracker",
    state: "Habits",
  },
  "s05-templates": {
    forbiddenQuery: COACH_QUERY_KEYS,
    marker: "A thoughtful starting point for every athlete",
  },
  "s05-template-editor": {
    query: { section: "templates", editor: REQUIRED_QUERY_VALUE },
    marker: "Tabs",
    state: "Tabs",
  },
  "s05-tracker-setup": {
    query: { section: "templates", editor: REQUIRED_QUERY_VALUE },
    marker: "Daily log",
    state: "Tracker",
  },
  "s05-client-setup": {
    query: { section: "clients", client: "client-015" },
    marker: "Assign a setup to Eva Fischer",
    state: "Assign a setup to Eva Fischer",
  },
  "s06-mealplan-editor": {
    query: {
      section: "clients",
      client: "client-013",
      plan: "nutrition",
      tab: "Plans",
    },
    marker: "Meal plan",
  },
  "s06-template-nutrition": {
    query: { section: "templates", editor: REQUIRED_QUERY_VALUE },
    marker: "Nutrition",
    state: "Nutrition",
  },
  "s07-training-editor": {
    query: { section: "clients", client: "client-001", plan: "training" },
    marker: "Training program",
  },
  "s07-exercise-library": {
    query: { section: "clients", client: "client-001", plan: "training" },
    marker: "Add an exercise",
  },
  "s08-builder": {
    hash: "#dashboard",
    marker: "A canvas for your coaching",
    state: "Dashboard",
  },
  "s08-widget-gallery": {
    hash: "#dashboard",
    marker: "Choose widgets to add",
    state: "Add widgets",
  },
  "s08-template-dashboard": {
    query: { section: "templates", editor: REQUIRED_QUERY_VALUE },
    marker: "Dashboard",
    state: "Dashboard",
  },
  "s09-tracker-today": {
    forbiddenQuery: COACH_QUERY_KEYS,
    marker: "Today",
    state: "Client preview",
  },
  "s09-tracker-week": {
    forbiddenQuery: COACH_QUERY_KEYS,
    marker: "Week",
    state: "Client preview",
  },
  "s09-tracker-trends": {
    forbiddenQuery: COACH_QUERY_KEYS,
    marker: "Trends",
    state: "Client preview",
  },
  "s09-tracker-config": {
    hash: "#tracker",
    marker: "Client tracker",
    state: "Tracker",
  },
  "s10-appearance": {
    hash: "#appearance",
    marker: "Make it yours",
    state: "Appearance",
  },
  "s10-clients-studio": {
    hash: "#clients",
    marker: "active clients",
    state: "Clients",
  },
  "s10-mealplan-studio": {
    hash: "#mealplan",
    marker: "Demo workspace",
    state: "Meal plans",
  },
  "s11-preferences": {
    forbiddenQuery: COACH_QUERY_KEYS,
    marker: "Workspace preferences",
    state: "Workspace preferences",
  },
  "s11-client-preview": {
    query: { section: "clients", client: "client-001" },
    marker: "Client preview",
    state: "Client preview",
  },
};

const AUTH_OR_ERROR_CONTENT =
  /(sign in|forbidden|unauthorized|not authorized|access denied|page could not be found)/i;

const shotStem = (shot) => shot.file.replace(/\.(png|webp)$/, "");

export function expectedCaptureMarker(shot) {
  const stem = shotStem(shot);
  return (
    CAPTURE_EXPECTATIONS[stem]?.marker ??
    shot.clicks[shot.clicks.length - 1] ??
    shot.screen
  );
}

const includesText = (haystack, needle) =>
  haystack
    .replace(/\s+/g, " ")
    .toLowerCase()
    .includes(needle.replace(/\s+/g, " ").toLowerCase());

/**
 * @param {{file:string,route:string,screen:string,clicks:string[]}} shot
 * @param {{url:string,text:string,state?:string[]}} page
 * @param {{requireMarker?:boolean,expectedScreen?:boolean}} [options]
 */
export function captureProblem(
  shot,
  { url, text, state = [] },
  { requireMarker = true, expectedScreen = true } = {},
) {
  const stem = shotStem(shot);
  const contract = CAPTURE_EXPECTATIONS[stem] ?? {};
  const expected = new URL(`https://capture.invalid${shot.route}`);
  const actual = new URL(url);
  if (expectedScreen) {
    const expectedHash = contract.hash ?? expected.hash;
    if (actual.pathname !== expected.pathname || actual.hash !== expectedHash)
      return `expected capture route ${expected.pathname}${expectedHash}, got ${actual.pathname}${actual.hash}`;
    for (const key of contract.forbiddenQuery ?? [])
      if (actual.searchParams.has(key))
        return `unexpected capture query parameter "${key}"`;
    for (const [key, expectedValue] of Object.entries(contract.query ?? {})) {
      const actualValue = actual.searchParams.get(key);
      if (
        expectedValue === REQUIRED_QUERY_VALUE
          ? !actual.searchParams.has(key)
          : actualValue !== expectedValue
      )
        return `expected capture query ${key}=${expectedValue}, got ${actualValue ?? "missing"}`;
    }
  } else if (actual.pathname !== expected.pathname) {
    return `expected capture route ${expected.pathname}, got ${actual.pathname}${actual.hash}`;
  }
  if (AUTH_OR_ERROR_CONTENT.test(text))
    return "capture reached an authentication, authorization, or error page";
  const marker = expectedCaptureMarker(shot);
  if (requireMarker && marker && !includesText(text, marker))
    return `expected capture content marker "${marker}"`;
  const stateText = state.join("\n");
  if (
    requireMarker &&
    contract.state &&
    !includesText(stateText, contract.state)
  )
    return `expected selected capture state "${contract.state}"`;
  return null;
}

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
    ].map((label) => [label, TEMPLATE_NAV]),
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

// Inner scroll containers that overflow (overflow auto or scroll). Index = position in document.body.querySelectorAll("*"),
// stable while the DOM shape is stable (a shape change already shows as moved or added geometry).
// ponytail: overflow hidden is not swept (text-overflow ellipsis would add many tiny containers). Upgrade: include it if a clipped hidden box needs gating.
export const scrollers = () => {
  const out = [];
  [...document.body.querySelectorAll("*")].forEach((el, idx) => {
    const cs = getComputedStyle(el);
    const scrolls = (v) => v === "auto" || v === "scroll";
    if (!scrolls(cs.overflowX) && !scrolls(cs.overflowY)) return;
    const maxX = el.scrollWidth - el.clientWidth;
    const maxY = el.scrollHeight - el.clientHeight;
    if (maxX < 1 && maxY < 1) return;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    out.push({
      idx,
      name: `${el.tagName.toLowerCase()}#${idx}`,
      box: [r.x + scrollX, r.y + scrollY, r.width, r.height],
      cw: el.clientWidth,
      ch: el.clientHeight,
      maxX,
      maxY,
    });
  });
  return out;
};

// Scroll offsets that show the whole range: 0, one client box per step, and the exact end.
const steps = (max, size) => {
  if (max < 1) return [0];
  const out = [];
  for (let o = 0; o < max; o += Math.max(1, size)) out.push(o);
  out.push(max);
  return out;
};

// Two animation frames plus a short pause: a scroll step needs a paint, not the full 400 ms DOM-quiet window.
const frames = (page) =>
  page.evaluate(
    () =>
      new Promise((r) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => setTimeout(r, 100)),
        ),
      ),
  );

// Scrolls each inner scroller through its full range and screenshots its box at every step, so clipped paint
// (a colour on a row below the fold) is compared, not only its geometry. Restores scroll to 0 afterwards.
async function captureScrollers(page, outDir, vp, stem) {
  const shots = [];
  for (const s of await page.evaluate(scrollers)) {
    const at = (x, y) =>
      page.evaluate(
        ([idx, x, y]) => {
          const el = document.body.querySelectorAll("*")[idx];
          el.scrollLeft = x;
          el.scrollTop = y;
        },
        [s.idx, x, y],
      );
    for (const y of steps(s.maxY, s.ch))
      for (const x of steps(s.maxX, s.cw)) {
        await at(x, y);
        await frames(page);
        const file = `${vp}/${stem}.s${s.idx}-${x}-${y}.png`;
        // fullPage + clip in page coordinates, so a scroller box below the viewport still resolves. Bounds are
        // integers inside the page box so no step clips outside it. (One renderer crash in 171 shots at
        // s05-templates@1440; the capture retry in captureAll covers a repeat.)
        const [bx, by, bw, bh] = s.box;
        const [pw, ph] = await page.evaluate(() => [
          document.documentElement.scrollWidth,
          document.documentElement.scrollHeight,
        ]);
        const cx = Math.max(0, Math.min(Math.round(bx), pw - 1));
        const cy = Math.max(0, Math.min(Math.round(by), ph - 1));
        const cw = Math.min(Math.round(bw), pw - cx);
        const ch = Math.min(Math.round(bh), ph - cy);
        if (cw < 1 || ch < 1) continue;
        const box = [cx, cy, cw, ch];
        await writeFile(
          path.join(outDir, file),
          await page.screenshot({
            fullPage: true,
            clip: { x: cx, y: cy, width: cw, height: ch },
            animations: "disabled",
            caret: "hide",
          }),
        );
        shots.push({ scroller: s.name, x, y, png: file, box });
      }
    await at(0, 0);
  }
  return shots;
}

// Under CPU load Chromium can drop a navigation or a screenshot mid-run. One retry of the capture is allowed
// (never of a comparison): relaunch the browser, wait for the server to answer again, then replay the same shot.
async function waitForServer(baseUrl, checkUrl, ms = 60000) {
  const t0 = Date.now();
  for (;;) {
    try {
      if (await checkUrl(`${baseUrl}/coach`)) return true;
    } catch {}
    if (Date.now() - t0 > ms) return false;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

export async function captureAll({
  baseUrl,
  outDir,
  log = console.log,
  serverMine = null,
  // Session cookies for every capture context (run.mjs signs in to the root app); none for the frontend/ baseline.
  cookies = [],
  checkUrl = async (url) =>
    (await fetch(url, { signal: AbortSignal.timeout(5000) })).ok,
  ignoreHTTPSErrors = false,
}) {
  const index = JSON.parse(await readFile(INDEX_PATH, "utf8"));
  // --disable-partial-raster: partial raster re-rasters only the invalidated part of a tile, so the anti-aliased
  // border of a sub-pixel-positioned swatch rasterizes differently under CPU load (verify-2 section 5). Full raster
  // is deterministic. It changes no baseline pixel.
  const launch = () => chromium.launch({ args: ["--disable-partial-raster"] });
  let browser = await launch();
  const manifest = {
    baseUrl,
    fixedNow: FIXED_NOW,
    timezone: TIMEZONE,
    screens: [],
    failures: [],
    retried: 0,
  };
  // Ownership is re-checked before every capture and once after the last: a port that still
  // answers means nothing when the server this run started died and another process took it.
  // serverMine is null for PARITY_URL runs and standalone capture.mjs.
  let serverLost = false;
  try {
    for (const vp of Object.keys(VIEWPORTS)) {
      await mkdir(path.join(outDir, vp), { recursive: true });
      for (const shot of index.shots) {
        const stem = shot.file.replace(/\.(png|webp)$/, "");
        if (serverMine && !serverMine()) {
          serverLost = true;
          const msg = `server died or was replaced on ${baseUrl}`;
          manifest.failures.push({ id: `${stem}@${vp}`, error: msg });
          log(`FAIL ${stem}@${vp}: ${msg}`);
          break;
        }
        let entry = null;
        let lastErr = null;
        for (let attempt = 0; attempt < 2 && !entry; attempt++) {
          if (attempt > 0) {
            manifest.retried++;
            // The same port-ownership check run.mjs applies at startup: a URL that answers is
            // not enough when the server this run started could have died and been replaced by
            // a different build on the same port. serverMine is null for PARITY_URL runs.
            if (serverMine && !serverMine()) {
              lastErr = new Error(
                `server died or was replaced on ${baseUrl}; retry not attempted`,
              );
              break;
            }
            await browser.close().catch(() => {});
            browser = await launch();
            if (!(await waitForServer(baseUrl, checkUrl))) {
              lastErr = new Error(
                `server at ${baseUrl} stopped answering; retry not attempted`,
              );
              break;
            }
          }
          const ctx = await browser.newContext({
            viewport: VIEWPORTS[vp],
            deviceScaleFactor: 1,
            timezoneId: TIMEZONE,
            locale: "en-US",
            colorScheme: "light",
            reducedMotion: "reduce",
            serviceWorkers: "block",
            ignoreHTTPSErrors,
          });
          if (cookies?.length) await ctx.addCookies(cookies);
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
            const pageState = async () => ({
              url: page.url(),
              text: await page.locator("body").innerText(),
              state: await page.evaluate(() => {
                const label = (el) =>
                  (
                    el.innerText ||
                    el.getAttribute("aria-label") ||
                    el.getAttribute("title") ||
                    ""
                  )
                    .replace(/\s+/g, " ")
                    .trim();
                const selected = [
                  ...document.querySelectorAll(
                    '[data-active="true"], [data-state="active"], [aria-current], [aria-selected="true"], [aria-pressed="true"], dialog[open], details[open] > summary, [data-page]',
                  ),
                ]
                  .map((el) => el.getAttribute("aria-label") || label(el))
                  .filter(Boolean);
                return [...new Set(selected)];
              }),
            });
            const initialProblem = captureProblem(shot, await pageState(), {
              requireMarker: false,
              expectedScreen: false,
            });
            if (initialProblem) throw new Error(initialProblem);
            const clickLog = [];
            for (const label of shot.clicks) {
              const result = await clickByText(
                page,
                STEP_ALIASES[stem]?.[label] ?? label,
                {
                  fallback: vp === "390",
                  scope: STEP_SCOPES[stem]?.[label] ?? null,
                },
              );
              clickLog.push({ ...result, recipe: label });
            }
            await page.evaluate(() => window.scrollTo(0, 0));
            await settle(page);
            const started = Date.now();
            let finalProblem = null;
            do {
              finalProblem = captureProblem(shot, await pageState());
              if (!finalProblem) break;
              await page.waitForTimeout(50);
            } while (Date.now() - started < 3000);
            if (finalProblem) throw new Error(finalProblem);
            const png = await page.screenshot({
              fullPage: true,
              animations: "disabled",
              caret: "hide",
            });
            const geom = await page.evaluate(geometry);
            const captureEvidence = await inspectPage(page);
            captureEvidence.scrollers = await page.evaluate(scrollers);
            for (const row of geom) row.push(...(captureEvidence.semantics[row[0]] ?? ["", ""]));
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
            // Sweep inner scrollers last: scrolling one can fire a scroll handler that changes the page, and that must
            // not leak into the main capture or its geometry (it did: 10 screens re-baselined when this ran first).
            const scrolls = await captureScrollers(page, outDir, vp, stem);
            entry = {
              id: `${stem}@${vp}`,
              vp,
              stem,
              route: shot.route,
              screen: shot.screen,
              finalUrl: page.url(),
              marker: expectedCaptureMarker(shot),
              captureEvidence,
              clicks: clickLog,
              png: rel.split(path.sep).join("/"),
              scrolls,
              sha256: createHash("sha256").update(png).digest("hex"),
              size: { width: size[0], height: size[1] },
              elements: geom.length,
              pageErrors,
            };
          } catch (err) {
            lastErr = err;
          } finally {
            await ctx.close().catch(() => {});
          }
        }
        if (entry) {
          manifest.screens.push(entry);
          if (entry.pageErrors.length)
            manifest.failures.push({
              id: entry.id,
              error: `pageerror: ${entry.pageErrors[0]}`,
            });
          log(
            `OK ${stem}@${vp} ${entry.size.width}x${entry.size.height} elements=${entry.elements}`,
          );
        } else {
          const msg = String(lastErr?.message || lastErr).split("\n")[0];
          manifest.failures.push({ id: `${stem}@${vp}`, error: msg });
          log(`FAIL ${stem}@${vp}: ${msg}`);
        }
      }
      if (serverLost) break;
    }
    // And once after the last capture: a swap in the final window loses the same server.
    if (!serverLost && serverMine && !serverMine())
      manifest.failures.push({
        id: "post-capture",
        error: `server died or was replaced on ${baseUrl}`,
      });
  } finally {
    await browser.close().catch(() => {});
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
