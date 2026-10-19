// npm run parity: builds the canvas for production (next build), serves it with next start on :3630 (unless
// PARITY_URL points at a running one), captures every screen at 1440x900 and 390x844, compares with
// tools/parity/baseline, writes tools/parity/out/report.html, then stops the server. Exit code is the comparison's.
// PARITY_DEV=1 uses next dev instead (debugging only; dev timing noise makes the gate flaky).
// npm run parity -- --update-baseline   recaptures the baseline instead of comparing.
import { spawn, spawnSync } from "node:child_process";
import { openSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { captureAll, INDEX_PATH } from "./capture.mjs";
import { compareRuns } from "./compare.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const FE = path.join(ROOT, "frontend");
const OUT = path.join(HERE, "out");
const CUR = path.join(OUT, "current");
const BASE = path.join(HERE, "baseline");
const PORT = process.env.PARITY_PORT ?? "3630";
const update = process.argv.includes("--update-baseline");
const DEV = process.env.PARITY_DEV === "1";

async function waitForHttp(url, ms = 180000) {
  const t0 = Date.now();
  for (;;) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    if (Date.now() - t0 > ms)
      throw new Error(`dev server did not answer at ${url}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

await mkdir(OUT, { recursive: true });
let baseUrl = process.env.PARITY_URL;
let server = null;
// Next dev appends to frontend/AGENTS.md on start. Snapshot and restore so the canvas tree stays untouched.
const agentsPath = path.join(FE, "AGENTS.md");
const agentsBefore = await readFile(agentsPath, "utf8");
let code = 1;
try {
  if (!baseUrl) {
    baseUrl = `http://127.0.0.1:${PORT}`;
    // Production build by default: dev mode (HMR, overlay, on-demand compile) adds timing noise.
    // PARITY_DEV=1 falls back to next dev for debugging only.
    const logFd = openSync(path.join(OUT, "server.log"), "w");
    const stdio = ["ignore", logFd, logFd];
    if (DEV) {
      server = spawn(
        "npx",
        ["next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", PORT],
        { cwd: FE, detached: true, stdio },
      );
    } else {
      const build = spawnSync("npx", ["next", "build", "--webpack"], {
        cwd: FE,
        stdio,
      });
      if (build.status !== 0)
        throw new Error(
          `next build failed (exit ${build.status}); see ${path.join(OUT, "server.log")}`,
        );
      server = spawn(
        "npx",
        ["next", "start", "--hostname", "127.0.0.1", "--port", PORT],
        { cwd: FE, detached: true, stdio },
      );
    }
    await waitForHttp(`${baseUrl}/coach`);
  }
  if (update) {
    // Capture into a temp dir; the committed baseline is replaced only when every shot captured.
    const tmp = path.join(OUT, "baseline.tmp");
    await rm(tmp, { recursive: true, force: true });
    const m = await captureAll({ baseUrl, outDir: tmp });
    const expected =
      JSON.parse(await readFile(INDEX_PATH, "utf8")).shots.length * 2;
    if (m.failures.length || m.screens.length !== expected) {
      console.log(
        `baseline NOT updated: ${m.failures.length} failure(s), ${m.screens.length}/${expected} screens. Kept ${BASE}; partial capture in ${tmp}`,
      );
      code = 1;
    } else {
      await rm(BASE, { recursive: true, force: true });
      await rename(tmp, BASE);
      console.log(`baseline: ${m.screens.length} screens -> ${BASE}`);
      code = 0;
    }
  } else {
    await rm(CUR, { recursive: true, force: true });
    const m = await captureAll({ baseUrl, outDir: CUR });
    if (m.failures.length) {
      console.log(
        `capture: ${m.failures.length} failure(s); see ${path.join(CUR, "manifest.json")}`,
      );
      code = 1;
    } else {
      const r = await compareRuns({
        baseline: BASE,
        current: CUR,
        report: path.join(OUT, "report.html"),
      });
      console.log(
        `parity ${r.failed ? "FAIL" : "PASS"}: ${r.failed} problem(s); report ${r.report}`,
      );
      code = r.failed ? 1 : 0;
    }
  }
} finally {
  if (server) process.kill(-server.pid, "SIGTERM");
  const now = await readFile(agentsPath, "utf8").catch(() => null);
  if (now !== null && now !== agentsBefore)
    await writeFile(agentsPath, agentsBefore);
}
process.exit(code);
