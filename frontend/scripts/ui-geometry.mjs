// VARI8 geometry snapshot. Drives an installed browser over CDP against the
// local preview and records the geometry of every Vari8 cell so later diffs
// read as a ripple report.
//
//   node scripts/ui-geometry.mjs --update   rewrite the snapshot
//   node scripts/ui-geometry.mjs            compare and fail on movement
//
// Not part of npm run check: CI normally has no running preview or browser.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapshotPath = path.join(root, "scripts", "ui-geometry.snapshot.json");
const update = process.argv.includes("--update");
const requireBrowser = Boolean(
  process.env.CI || process.env.V8_REQUIRE_GEOMETRY,
);

const previewBase = `http://127.0.0.1:${
  process.env.LOCAL_PREVIEW_APP_PORT ?? 3000
}`;
const viewportWidths = [1440, 390];

const routes = [
  {
    id: "gallery",
    path: "/gallery",
    waitFor: "[data-v8-cell]",
    interactionCheck: "menu-clip",
  },
  { id: "coach/default", path: "/coach", waitFor: ".coach-root" },
  {
    id: "coach/client-preview",
    path: "/coach",
    waitFor: ".coach-root",
    beforeMeasure: "document.querySelector('.cb-db-client-switch')?.click()",
    settleAfter: 600,
  },
  { id: "ethereal", path: "/ethereal", waitFor: "body" },
  { id: "client/default", path: "/client", waitFor: ".client-root" },
];

const controlSelector = [
  ".v8-button",
  ".v8-icon-button",
  ".v8-input",
  ".v8-select",
  ".v8-searchable-input",
  ".v8-segmented",
  ".v8-toggle__input",
  ".v8-checkbox__input",
  ".v8-tabs__tab",
  ".v8-navigation__item",
  ".v8-dropdown__trigger",
  ".v8-card",
  ".v8-status",
  ".v8-table",
].join(",");
const labelSelector = [
  ".v8-field__label",
  ".v8-choice__label",
  ".v8-matrix-cell__label",
  "legend",
].join(",");

const measureSource = `(() => {
  const readRect = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      x: Math.round(r.x * 100) / 100,
      y: Math.round(r.y * 100) / 100,
      width: Math.round(r.width * 100) / 100,
      height: Math.round(r.height * 100) / 100,
      borderRadius: cs.borderTopLeftRadius,
      paddingInline: cs.paddingInlineStart + " / " + cs.paddingInlineEnd,
      fontSize: cs.fontSize,
      lineHeight: cs.lineHeight,
    };
  };
  const centre = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  };
  const out = {};
  const cells = [...document.querySelectorAll("[data-v8-cell]")];
  const roots = cells.length
    ? cells.map((el) => ({ id: el.dataset.v8Cell, el }))
    : [{ id: "page", el: document.body }];
  for (const { id, el } of roots) {
    const elements = {};
    const v8 = [...el.querySelectorAll('[class*="v8-"]')];
    if (el !== document.body && el.className?.includes?.("v8-")) v8.unshift(el);
    v8.forEach((node, index) => {
      const key = node.tagName.toLowerCase() + "." +
        [...node.classList].filter((c) => c.startsWith("v8-")).join(".") +
        "[" + index + "]";
      elements[key] = readRect(node);
    });
    const label = el.querySelector(${JSON.stringify(labelSelector)});
    const control =
      el.querySelector(${JSON.stringify(controlSelector)}) ?? el;
    const labelOffset = label
      ? (() => {
          const l = centre(label);
          const c = centre(control);
          return {
            x: Math.round((l.x - c.x) * 100) / 100,
            y: Math.round((l.y - c.y) * 100) / 100,
          };
        })()
      : { x: 0, y: 0 };
    out[id] = { ...readRect(control), labelOffset, elements };
  }
  return out;
})()`;

// Opens the dropdown inside the matrix cell wrapped in `overflow: hidden` and
// a border, then asserts the portalled popup lands inside the viewport and is
// not a DOM descendant of the clipping wrapper.
const menuClipCheckSource = `(async () => {
  const wrapper = document.querySelector(".v8-matrix-clip");
  if (!wrapper) return { ok: false, detail: "no .v8-matrix-clip cell found" };
  const trigger = wrapper.querySelector(".v8-dropdown__trigger");
  if (!trigger)
    return { ok: false, detail: "no .v8-dropdown__trigger in clip cell" };
  wrapper.scrollIntoView({ block: "center" });
  trigger.click();
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await new Promise((resolve) => setTimeout(resolve, 120));
  const popupId = trigger.getAttribute("aria-controls");
  const popup =
    (popupId && document.getElementById(popupId)) ||
    document.querySelector(
      ".v8-dropdown__positioner:not([hidden]) .v8-dropdown__menu",
    );
  if (!popup) return { ok: false, detail: "menu popup did not open" };
  const r = popup.getBoundingClientRect();
  const insideViewport =
    r.width > 0 &&
    r.height > 0 &&
    r.left >= -0.5 &&
    r.top >= -0.5 &&
    r.right <= window.innerWidth + 0.5 &&
    r.bottom <= window.innerHeight + 0.5;
  const outsideWrapper = !wrapper.contains(popup);
  return {
    ok: insideViewport && outsideWrapper,
    insideViewport,
    outsideWrapper,
    detail:
      "popup " + Math.round(r.width) + "x" + Math.round(r.height) +
      " at (" + Math.round(r.x) + "," + Math.round(r.y) + ")" +
      " viewport " + window.innerWidth + "x" + window.innerHeight +
      (insideViewport ? " inside viewport" : " OUTSIDE viewport") +
      (outsideWrapper
        ? ", outside clipping wrapper"
        : ", STILL INSIDE clipping wrapper"),
  };
})()`;

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "google-chrome",
    "chromium",
    "chromium-browser",
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate.includes(path.sep) || candidate.startsWith("/")) {
      if (existsSync(candidate)) return candidate;
      continue;
    }
    for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
      const full = path.join(dir, candidate);
      if (existsSync(full)) return full;
    }
  }
  return null;
}

async function waitForFile(file, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(file)) {
      const text = await readFile(file, "utf8");
      const [port, wsPath] = text.trim().split("\n");
      if (port && wsPath) return { port, wsPath };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${file}`);
}

class Cdp {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
  }
  connect() {
    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(this.url);
      this.socket.onopen = () => resolve();
      this.socket.onerror = (error) => reject(error);
      this.socket.onmessage = (message) => {
        const data = JSON.parse(message.data);
        if (data.id && this.pending.has(data.id)) {
          const { resolve: ok, reject: fail } = this.pending.get(data.id);
          this.pending.delete(data.id);
          if (data.error) fail(new Error(data.error.message));
          else ok(data.result);
        } else if (data.method) {
          this.events.push(data);
        }
      };
    });
  }
  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(
        JSON.stringify(
          sessionId
            ? { id, method, params, sessionId }
            : { id, method, params },
        ),
      );
    });
  }
  async evaluate(sessionId, expression) {
    const result = await this.send(
      "Runtime.evaluate",
      { expression, returnByValue: true, awaitPromise: true },
      sessionId,
    );
    if (result.exceptionDetails)
      throw new Error(
        result.exceptionDetails.exception?.description ??
          "Runtime.evaluate failed",
      );
    return result.result.value;
  }
  close() {
    try {
      this.socket?.close();
    } catch {}
  }
}

async function waitForReady(cdp, sessionId, waitFor, extraSettle = 0) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const ready = await cdp.evaluate(
      sessionId,
      `document.readyState === "complete" && !!document.querySelector(${JSON.stringify(waitFor)})`,
    );
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  await new Promise((resolve) => setTimeout(resolve, 500 + extraSettle));
}

async function measure() {
  const browser = findBrowser();
  if (!browser) {
    console.log("NOT VERIFIED");
    process.exit(requireBrowser ? 1 : 0);
  }
  const profile = await mkdtemp(path.join(tmpdir(), "v8-geometry-"));
  const chrome = spawn(
    browser,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--disable-extensions",
      "--mute-audio",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  const cleanup = async () => {
    chrome.kill("SIGKILL");
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  };
  let cdp;
  try {
    const { port, wsPath } = await waitForFile(
      path.join(profile, "DevToolsActivePort"),
      15000,
    );
    cdp = new Cdp(`ws://127.0.0.1:${port}${wsPath}`);
    await cdp.connect();
    const { targetId } = await cdp.send("Target.createTarget", {
      url: "about:blank",
    });
    const { sessionId } = await cdp.send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("Runtime.enable", {}, sessionId);

    const snapshot = {};
    const checkResults = [];
    for (const width of viewportWidths) {
      await cdp.send(
        "Emulation.setDeviceMetricsOverride",
        {
          width,
          height: 900,
          deviceScaleFactor: 1,
          mobile: width < 500,
        },
        sessionId,
      );
      for (const route of routes) {
        await cdp.send(
          "Page.navigate",
          { url: `${previewBase}${route.path}` },
          sessionId,
        );
        await waitForReady(cdp, sessionId, route.waitFor);
        if (route.beforeMeasure) {
          await cdp.evaluate(sessionId, route.beforeMeasure);
          await new Promise((resolve) =>
            setTimeout(resolve, route.settleAfter ?? 400),
          );
        }
        await cdp.evaluate(
          sessionId,
          `(() => {
            const style = document.createElement("style");
            style.textContent =
              "*,*::before,*::after{animation:none !important;transition:none !important}";
            document.head.appendChild(style);
            return new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)));
          })()`,
        );
        const cells = await cdp.evaluate(sessionId, measureSource);
        for (const [cellId, entry] of Object.entries(cells)) {
          snapshot[`${route.id}/${cellId}@${width}`] = entry;
        }
        if (route.interactionCheck === "menu-clip") {
          const result = await cdp.evaluate(sessionId, menuClipCheckSource);
          checkResults.push({
            id: `menu-clip@${width}`,
            ...(result ?? { ok: false, detail: "check produced no result" }),
          });
        }
      }
    }
    return { snapshot, checkResults };
  } finally {
    cdp?.close();
    await cleanup();
  }
}

function* diffs(before, after, prefix = "") {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of [...keys].sort()) {
    const a = before[key];
    const b = after[key];
    const name = prefix ? `${prefix} ${key}` : key;
    if (a === undefined) {
      yield `${name}: added (was absent)`;
    } else if (b === undefined) {
      yield `${name}: removed`;
    } else if (typeof a === "object" && a !== null && typeof b === "object") {
      yield* diffs(a, b, name);
    } else if (a !== b) {
      yield `${name}: ${a} -> ${b}`;
    }
  }
}

async function previewUp() {
  try {
    const response = await fetch(`${previewBase}/`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.status > 0;
  } catch {
    return false;
  }
}

const main = async () => {
  if (!(await previewUp())) {
    console.error("PREVIEW DOWN, run npm run preview:up");
    process.exit(1);
  }
  const { snapshot, checkResults } = await measure();
  const cellCount = Object.keys(snapshot).length;
  for (const check of checkResults) {
    console.log(`menu-clip: ${check.id} ${check.detail}`);
  }
  const checkFailures = checkResults.filter((check) => !check.ok);
  if (update) {
    await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
    console.log(`ui-geometry: wrote ${cellCount} cell(s) to ${snapshotPath}`);
    if (checkFailures.length > 0) {
      console.error(`ui-geometry: ${checkFailures.length} check(s) failed.`);
      process.exit(1);
    }
    return;
  }
  let before;
  try {
    before = JSON.parse(await readFile(snapshotPath, "utf8"));
  } catch {
    console.error(
      "No snapshot found; run: node scripts/ui-geometry.mjs --update",
    );
    process.exit(1);
  }
  const problems = [...diffs(before, snapshot)];
  if (problems.length === 0 && checkFailures.length === 0) {
    console.log(`ui-geometry: ${cellCount} cell(s) match the snapshot.`);
    return;
  }
  for (const problem of problems.slice(0, 200)) console.error(problem);
  for (const failure of checkFailures) {
    console.error(`menu-clip ${failure.id}: ${failure.detail}`);
  }
  console.error(
    `ui-geometry: ${problems.length + checkFailures.length} difference(s) across ${cellCount} cell(s).`,
  );
  process.exit(1);
};

main().catch(async (error) => {
  console.error(error?.message ?? error);
  process.exit(1);
});
