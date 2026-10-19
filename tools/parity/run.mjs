// npm run parity: builds the canvas for production (next build), serves it with next start on a free port this run
// picks, captures every screen at 1440x900 and 390x844, compares with tools/parity/baseline, writes
// tools/parity/out/report.html, then stops the server. Exit code: 0 match, 1 change or capture failure,
// 2 refused (bad env, port taken, or the listener is not the server this run started). Nothing is compared on 2.
// PARITY_PORT pins the port (refused if taken). PARITY_URL compares a server you run yourself (not checked).
// PARITY_DEV=1 uses next dev instead (debugging only; dev timing noise makes the gate flaky).
// npm run parity -- --update-baseline   recaptures the baseline instead of comparing.
import { spawn, spawnSync } from "node:child_process";
import { openSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { captureAll, INDEX_PATH } from "./capture.mjs";
import { compareRuns, ConfigError, envThresholds } from "./compare.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const FE = path.join(ROOT, "frontend");
const OUT = path.join(HERE, "out");
const CUR = path.join(OUT, "current");
const BASE = path.join(HERE, "baseline");
const LOG = path.join(OUT, "server.log");
const update = process.argv.includes("--update-baseline");
const DEV = process.env.PARITY_DEV === "1";

class Refuse extends Error {}

// Binds 127.0.0.1:port (0 = any free port) and reports the port, or rejects if it is taken.
const bind = (port) =>
  new Promise((ok, no) => {
    const s = createServer();
    s.once("error", no);
    s.listen(port, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => ok(p));
    });
  });

async function waitForHttp(url, server, ms = 180000) {
  const t0 = Date.now();
  for (;;) {
    if (server.exitCode !== null || server.signalCode !== null)
      throw new Refuse(`server exited before answering; see ${LOG}`);
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    if (Date.now() - t0 > ms)
      throw new Refuse(`server did not answer at ${url} within ${ms / 1000} s`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

// Every process listening on the port must be in the server's process group (it was spawned detached, so its pid is
// the group id). Fails closed: if lsof or ps cannot answer, the server is not trusted.
function ownsPort(port, pgid) {
  const pids = spawnSync(
    "lsof",
    ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"],
    { encoding: "utf8" },
  )
    .stdout.trim()
    .split(/\s+/)
    .filter(Boolean);
  return (
    pids.length > 0 &&
    pids.every(
      (pid) =>
        spawnSync("ps", ["-o", "pgid=", "-p", pid], {
          encoding: "utf8",
        }).stdout.trim() === String(pgid),
    )
  );
}

function pinnedPort() {
  const raw = process.env.PARITY_PORT;
  if (raw === undefined) return null;
  if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 65535)
    throw new ConfigError(
      `PARITY_PORT="${raw}" must be a port from 1 to 65535`,
    );
  return Number(raw);
}

let th;
let pinned;
try {
  th = envThresholds();
  pinned = pinnedPort();
} catch (e) {
  if (!(e instanceof ConfigError)) throw e;
  console.error(`parity: ${e.message}`);
  process.exit(2);
}

await mkdir(OUT, { recursive: true });
let baseUrl = process.env.PARITY_URL;
let server = null;
let port = null;
// Next dev and build append to frontend/AGENTS.md. Snapshot and restore so the canvas tree stays untouched.
const agentsPath = path.join(FE, "AGENTS.md");
const agentsBefore = await readFile(agentsPath, "utf8");
let code = 1;
try {
  if (!baseUrl) {
    if (
      pinned !== null &&
      !(await bind(pinned).then(
        () => true,
        () => false,
      ))
    )
      throw new Refuse(
        `port ${pinned} is in use; PARITY_PORT must name a free port. Nothing was compared.`,
      );
    port = pinned ?? (await bind(0));
    baseUrl = `http://127.0.0.1:${port}`;
    // Production build by default: dev mode (HMR, overlay, on-demand compile) adds timing noise.
    // PARITY_DEV=1 falls back to next dev for debugging only.
    const logFd = openSync(LOG, "w");
    const stdio = ["ignore", logFd, logFd];
    if (DEV) {
      server = spawn(
        "npx",
        [
          "next",
          "dev",
          "--webpack",
          "--hostname",
          "127.0.0.1",
          "--port",
          String(port),
        ],
        { cwd: FE, detached: true, stdio },
      );
    } else {
      const build = spawnSync("npx", ["next", "build", "--webpack"], {
        cwd: FE,
        stdio,
      });
      if (build.status !== 0)
        throw new Refuse(
          `next build failed (exit ${build.status}); see ${LOG}`,
        );
      server = spawn(
        "npx",
        ["next", "start", "--hostname", "127.0.0.1", "--port", String(port)],
        { cwd: FE, detached: true, stdio },
      );
    }
    await waitForHttp(`${baseUrl}/coach`, server);
    if (!ownsPort(port, server.pid))
      throw new Refuse(
        `port ${port} answers from a process this run did not start. Refusing to compare it.`,
      );
  }
  // Re-checked by captureAll before every capture retry: a port that answers again means nothing
  // if this run's server died and another process took the port. null for PARITY_URL runs, where
  // no spawned server exists to own the port.
  const serverMine = server ? () => ownsPort(port, server.pid) : null;
  if (update) {
    // Capture into a temp dir; the committed baseline is replaced only when every shot captured.
    const tmp = path.join(OUT, "baseline.tmp");
    await rm(tmp, { recursive: true, force: true });
    const m = await captureAll({ baseUrl, outDir: tmp, serverMine });
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
    const m = await captureAll({ baseUrl, outDir: CUR, serverMine });
    if (m.failures.length) {
      console.log(
        `capture: ${m.failures.length} failure(s), retried=${m.retried ?? 0}; see ${path.join(CUR, "manifest.json")}`,
      );
      code = 1;
    } else {
      const r = await compareRuns({
        baseline: BASE,
        current: CUR,
        report: path.join(OUT, "report.html"),
        th,
      });
      console.log(
        `parity ${r.failed ? "FAIL" : "PASS"}: ${r.failed} problem(s), retried=${m.retried ?? 0}; report ${r.report}`,
      );
      code = r.failed ? 1 : 0;
    }
  }
} catch (e) {
  if (!(e instanceof Refuse)) throw e;
  console.error(`parity: ${e.message}`);
  code = 2;
} finally {
  // A server that already exited makes kill throw ESRCH; that must not skip the AGENTS.md restore below.
  if (server) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {}
  }
  const now = await readFile(agentsPath, "utf8").catch(() => null);
  if (now !== null && now !== agentsBefore)
    await writeFile(agentsPath, agentsBefore);
}
process.exit(code);
