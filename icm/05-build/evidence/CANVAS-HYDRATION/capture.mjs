// CANVAS-HYDRATION capture harness. Run from the worktree root:
//   node icm/05-build/evidence/CANVAS-HYDRATION/capture.mjs --phase before --port 3973
// Phases: before | before-b (determinism control) | after
// Captures per route (/coach, /, /ethereal) x env (reduce, normal) x width
// (1440x900, 390x844): viewport screenshot, full console log, and the Tab
// focus sequence (reduce env only for tabs).
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const require = createRequire(join(root, "package.json"));
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? dflt : args[i + 1];
};
const phase = arg("phase", "before");
const port = arg("port", "3973");
// Hide the nextjs dev overlay issue badge so only the canvas is compared.
const hidePortal = args.includes("--hideportal");
const only = arg("only", ""); // "tabs" to skip screenshots/console passes
const base = `http://127.0.0.1:${port}`;
const outDir = join(root, "icm/05-build/evidence/CANVAS-HYDRATION", phase);
mkdirSync(outDir, { recursive: true });

const routes = [
  ["coach", "/coach"],
  ["root", "/"],
  ["ethereal", "/ethereal"],
];
const envs = [
  ["reduce", { reducedMotion: "reduce" }],
  ["normal", { reducedMotion: "no-preference" }],
];
const widths = [
  [1440, 900],
  [390, 844],
];
const TABS = 28;

function describe(el) {
  if (!el) return "(none)";
  const attrs = [];
  for (const name of [
    "id",
    "class",
    "role",
    "aria-label",
    "aria-pressed",
    "tabindex",
    "href",
    "type",
    "data-active",
  ])
    if (el.hasAttribute && el.hasAttribute(name))
      attrs.push(`${name}=${JSON.stringify(el.getAttribute(name))}`);
  const text = (el.innerText || el.value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 60);
  return `<${el.tagName.toLowerCase()}${attrs.length ? " " + attrs.join(" ") : ""}>${text ? ` "${text}"` : ""}`;
}

async function settle(page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page
    .waitForFunction(
      () =>
        document
          .getAnimations({ subtree: true })
          .every((a) => a.playState === "finished" || a.playState === "idle"),
      null,
      { timeout: 8000 },
    )
    .catch(() => {});
  await page.waitForTimeout(1800);
}

async function hideDevOverlay(page) {
  await page.addStyleTag({
    content: "nextjs-portal{display:none!important}",
  });
  await page.evaluate(() => document.fonts.ready);
}

const browser = await chromium.launch({ headless: true });
try {
  for (const [envName, ctxOpts] of envs) {
    for (const [name, route] of routes) {
      // Console capture + screenshots
      const lines = [];
      for (const [w, h] of only === "tabs" ? [] : widths) {
        const context = await browser.newContext({
          viewport: { width: w, height: h },
          deviceScaleFactor: 1,
          ...ctxOpts,
        });
        const page = await context.newPage();
        page.on("console", (msg) =>
          lines.push(
            `[${msg.type()}] ${msg.text()}` +
              (msg.location()?.url
                ? ` @ ${msg.location().url}:${msg.location().lineNumber}`
                : ""),
          ),
        );
        page.on("pageerror", (err) => lines.push(`[pageerror] ${err.message}`));
        await page.goto(base + route, { waitUntil: "domcontentloaded" });
        await settle(page);
        if (hidePortal) await hideDevOverlay(page);
        await page.screenshot({
          path: join(outDir, `${envName}-${name}-${w}.png`),
        });
        await context.close();
      }
      if (only !== "tabs")
        writeFileSync(
          join(outDir, `console-${envName}-${name}.log`),
          lines.join("\n") + "\n",
        );

      // Tab order (reduce env only; identical DOM outcome is what matters)
      if (envName === "reduce") {
        const context = await browser.newContext({
          viewport: { width: 1440, height: 900 },
          ...ctxOpts,
        });
        const page = await context.newPage();
        await page.goto(base + route, { waitUntil: "domcontentloaded" });
        await settle(page);
        if (hidePortal) await hideDevOverlay(page);
        await page.addScriptTag({
          content: `window.__describeEl = ${describe.toString()};`,
        });
        const seq = [];
        for (let i = 0; i < TABS; i++) {
          await page.keyboard.press("Tab");
          await page.waitForTimeout(120);
          seq.push(
            `${String(i + 1).padStart(2, "0")} ${await page.evaluate(() => window.__describeEl(document.activeElement))}`,
          );
        }
        writeFileSync(join(outDir, `tabs-${name}.log`), seq.join("\n") + "\n");
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}
console.log(`captured -> ${outDir}`);
