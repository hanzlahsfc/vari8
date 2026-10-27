// npm run parity: builds the root app for production (next build), serves it with next start on a free port this run
// picks, signs in as the dev user, captures every screen at 1440x900 and 390x844, compares with tools/parity/baseline
// (captured from frontend/), writes tools/parity/out/report.html, then stops the server. Exit code: 0 match, 1 change or capture failure,
// 2 refused (bad env, port taken, or the listener is not the server this run started). Nothing is compared on 2.
// PARITY_PORT pins the port (refused if taken). PARITY_URL compares a server you run yourself (not checked).
// Production auth refuses an http: auth origin (lib/auth/server.ts BOOT-CHECKS), so a spawned root-app
// production server is served through an in-process TLS front: next stays plain http on a private inner
// port, the front answers https://localhost:<port> with a self-signed certificate and that is the
// BETTER_AUTH_URL the server gets. PARITY_TLS_CERT/PARITY_TLS_KEY name a PEM pair to use instead of the
// generated one. A self-signed PARITY_URL front on a loopback host is trusted the same way (port
// ownership is enforced separately, certificate verification is not the gate).
// PARITY_DEV=1 uses next dev instead (debugging only; dev timing noise makes the gate flaky).
// npm run parity -- --update-baseline   recaptures the baseline instead of comparing (needs PARITY_APP=frontend).
// PARITY_APP=frontend serves frontend/ (no session) instead of the root app; the baseline comes from there.
// Sign-in (root app): PARITY_USER_EMAIL and PARITY_USER_PASSWORD name an existing account. Without a password the
// run upserts the dev user (icm/05-build/tools/dev-user.ts) with a fresh password on DATABASE_URL, a lane database.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { openSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { createServer as createTlsServer } from "node:https";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  captureAll,
  INDEX_PATH,
  insecureLoopbackDispatcher,
} from "./capture.mjs";
import { compareRuns, ConfigError, envThresholds } from "./compare.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const FE = path.join(ROOT, "frontend");
const ROOT_APP = process.env.PARITY_APP !== "frontend";
const APP = ROOT_APP ? ROOT : FE;
const OUT = path.join(HERE, "out");
const CUR = path.join(OUT, "current");
const BASE = path.join(HERE, "baseline");
const LOG = path.join(OUT, "server.log");
const update = process.argv.includes("--update-baseline");
const DEV = process.env.PARITY_DEV === "1";

class Refuse extends Error {}

// Signs in to the root app through Better Auth and returns the session cookies for the capture contexts.
async function signInCookies(baseUrl, init = {}) {
  const email = process.env.PARITY_USER_EMAIL ?? "owner@vari8.test";
  let password = process.env.PARITY_USER_PASSWORD;
  if (!password) {
    password = `Parity${randomBytes(12).toString("hex")}7`;
    const seed = spawnSync(
      "npx",
      ["tsx", path.join(ROOT, "icm/05-build/tools/dev-user.ts")],
      {
        cwd: ROOT,
        env: {
          ...process.env,
          DEV_USER_EMAIL: email,
          DEV_USER_PASSWORD: password,
        },
        encoding: "utf8",
      },
    );
    if (seed.status !== 0)
      throw new Refuse(
        `dev user upsert failed (exit ${seed.status}): ${(seed.stderr || seed.stdout).trim().split("\n").pop()}`,
      );
  }
  const res = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl },
    body: JSON.stringify({ email, password }),
    ...init,
  });
  const set = res.headers.getSetCookie();
  if (!res.ok || set.length === 0)
    throw new Refuse(`sign-in as ${email} failed (HTTP ${res.status})`);
  const domain = new URL(baseUrl).hostname;
  return set.map((line) => {
    const [pair] = line.split(";");
    const i = pair.indexOf("=");
    const name = pair.slice(0, i).trim();
    return {
      name,
      value: pair.slice(i + 1).trim(),
      domain,
      path: "/",
      httpOnly: true,
      // Better Auth mints __Secure- names in production; Playwright refuses
      // that prefix without the secure flag (localhost still accepts it).
      secure: name.startsWith("__Secure-"),
      sameSite: "Lax",
    };
  });
}

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

// PEM pair for the TLS front: PARITY_TLS_CERT/PARITY_TLS_KEY when both are set, else a
// self-signed localhost certificate generated into out/ for this run.
async function tlsMaterial() {
  const certPath = process.env.PARITY_TLS_CERT;
  const keyPath = process.env.PARITY_TLS_KEY;
  if (certPath && keyPath)
    return { cert: await readFile(certPath), key: await readFile(keyPath) };
  if (certPath || keyPath)
    throw new Refuse("PARITY_TLS_CERT and PARITY_TLS_KEY must be set together");
  const cert = path.join(OUT, "parity-cert.pem");
  const key = path.join(OUT, "parity-key.pem");
  const gen = spawnSync(
    "openssl",
    [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2",
      "-subj", "/CN=localhost",
      "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1",
      "-keyout", key, "-out", cert,
    ],
    { encoding: "utf8" },
  );
  if (gen.status !== 0)
    throw new Refuse(
      `self-signed certificate generation failed: ${(gen.stderr || "").trim().split("\n").pop()}`,
    );
  return { cert: await readFile(cert), key: await readFile(key) };
}

// https :tlsPort -> http :innerPort. Preserves the Host header (a rewritten Host made
// Next abort server actions in w2-t5) and marks the forwarded scheme for the app.
async function startTlsFront(tlsPort, innerPort) {
  const { cert, key } = await tlsMaterial();
  const front = createTlsServer({ cert, key }, (req, res) => {
    const headers = { ...req.headers, "x-forwarded-proto": "https" };
    const up = httpRequest(
      {
        host: "127.0.0.1",
        port: innerPort,
        method: req.method,
        path: req.url,
        headers,
      },
      (ur) => {
        res.writeHead(ur.statusCode ?? 502, ur.headers);
        ur.pipe(res);
      },
    );
    up.on("error", (e) => {
      res.writeHead(502);
      res.end(`upstream ${e.code ?? "error"}`);
    });
    req.pipe(up);
  });
  await new Promise((ok, no) => {
    front.once("error", no);
    front.listen(tlsPort, "127.0.0.1", ok);
  });
  return front;
}

async function waitForHttp(url, server, ms = 180000, init = {}) {
  const t0 = Date.now();
  for (;;) {
    if (server.exitCode !== null || server.signalCode !== null)
      throw new Refuse(`server exited before answering; see ${LOG}`);
    try {
      if ((await fetch(url, init)).ok) return;
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
let tls = null;
let port = null;
let innerPort = null;
// Next dev and build append to AGENTS.md in the app they run in. Snapshot and restore so the tree stays untouched.
const agentsPath = path.join(APP, "AGENTS.md");
const agentsBefore = await readFile(agentsPath, "utf8");
let code = 1;
try {
  if (update && ROOT_APP)
    throw new Refuse(
      "--update-baseline captures the frontend/ canvas; set PARITY_APP=frontend",
    );
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
    // Production build by default: dev mode (HMR, overlay, on-demand compile) adds timing noise.
    // PARITY_DEV=1 falls back to next dev for debugging only.
    // The root app's production server needs an https auth origin: next keeps plain http on
    // a private inner port and a TLS front answers https on the port this run picked.
    const tlsFront = ROOT_APP && !DEV;
    innerPort = tlsFront ? await bind(0) : null;
    baseUrl = tlsFront
      ? `https://localhost:${port}`
      : `http://127.0.0.1:${port}`;
    const logFd = openSync(LOG, "w");
    const stdio = ["ignore", logFd, logFd];
    // Better Auth trusts its own base URL only, so the root app must be told the address this run serves.
    // NODE_ENV is forced so a sourced lane env (NODE_ENV=development) cannot poison the production build.
    const env = {
      ...process.env,
      NODE_ENV: DEV ? "development" : "production",
      ...(ROOT_APP ? { BETTER_AUTH_URL: baseUrl, AUTH_URL: baseUrl } : {}),
    };
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
        { cwd: APP, env, detached: true, stdio },
      );
    } else {
      const build = spawnSync("npx", ["next", "build", "--webpack"], {
        cwd: APP,
        env,
        stdio,
      });
      if (build.status !== 0)
        throw new Refuse(
          `next build failed (exit ${build.status}); see ${LOG}`,
        );
      server = spawn(
        "npx",
        [
          "next",
          "start",
          "--hostname",
          "127.0.0.1",
          "--port",
          String(innerPort ?? port),
        ],
        { cwd: APP, env, detached: true, stdio },
      );
      if (tlsFront) tls = await startTlsFront(port, innerPort);
    }
    const dispatcher = await insecureLoopbackDispatcher(baseUrl);
    const init = dispatcher ? { dispatcher } : {};
    await waitForHttp(`${baseUrl}/coach`, server, 180000, init);
    // The spawned server must own its port; the TLS front is this process, checked by pgid.
    const myPgid = spawnSync(
      "ps",
      ["-o", "pgid=", "-p", String(process.pid)],
      { encoding: "utf8" },
    ).stdout.trim();
    if (
      !ownsPort(innerPort ?? port, server.pid) ||
      (tls && !ownsPort(port, myPgid))
    )
      throw new Refuse(
        `port ${port} answers from a process this run did not start. Refusing to compare it.`,
      );
  }
  // Re-checked by captureAll before every capture, before a retry, and once after the last
  // capture: a port that answers means nothing if this run's server died and another process
  // took it. null for PARITY_URL runs, where no spawned server exists to own the port.
  const serverMine = server
    ? () =>
        ownsPort(innerPort ?? port, server.pid) &&
        (!tls ||
          ownsPort(
            port,
            spawnSync("ps", ["-o", "pgid=", "-p", String(process.pid)], {
              encoding: "utf8",
            }).stdout.trim(),
          ))
    : null;
  const dispatcher = baseUrl ? await insecureLoopbackDispatcher(baseUrl) : null;
  const fetchInit = dispatcher ? { dispatcher } : {};
  const cookies = ROOT_APP ? await signInCookies(baseUrl, fetchInit) : [];
  if (update) {
    // Capture into a temp dir; the committed baseline is replaced only when every shot captured.
    const tmp = path.join(OUT, "baseline.tmp");
    await rm(tmp, { recursive: true, force: true });
    const m = await captureAll({ baseUrl, outDir: tmp, serverMine, cookies });
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
    const m = await captureAll({ baseUrl, outDir: CUR, serverMine, cookies });
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
  tls?.close();
  const now = await readFile(agentsPath, "utf8").catch(() => null);
  if (now !== null && now !== agentsBefore)
    await writeFile(agentsPath, agentsBefore);
}
process.exit(code);
