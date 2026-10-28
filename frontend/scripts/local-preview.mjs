import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { closeSync, constants, createReadStream, openSync } from "node:fs";
import {
  mkdir,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, relative, resolve, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const scriptPath = fileURLToPath(import.meta.url);
const defaultStateDir = join(projectRoot, ".agent-runs", "local-preview");
const host = "127.0.0.1";
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
]);

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function settings() {
  return {
    appPort: Number(process.env.LOCAL_PREVIEW_APP_PORT ?? 3000),
    reportsPort: Number(process.env.LOCAL_PREVIEW_REPORTS_PORT ?? 3001),
    stateDir: resolve(process.env.LOCAL_PREVIEW_STATE_DIR ?? defaultStateDir),
  };
}

function validatePorts({ appPort, reportsPort }) {
  for (const port of [appPort, reportsPort]) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid local preview port: ${port}`);
    }
  }
  if (appPort === reportsPort)
    throw new Error("App and reports ports must differ.");
}

function processCommand(pid) {
  const result = spawnSync("ps", ["-p", String(pid), "-o", "command="], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

function isOwnedProcess(pid, mode, owner) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  const command = processCommand(pid);
  return command.includes(scriptPath) && command.includes(`${mode} ${owner}`);
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

export async function assertPortAvailable(port, address = host) {
  await new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.once("error", (error) => {
      if (error?.code === "EADDRINUSE") {
        reject(
          new Error(
            `Port ${port} on ${address} is already in use; no process was stopped.`,
          ),
        );
      } else {
        reject(error);
      }
    });
    server.listen(port, address, () =>
      server.close((error) => (error ? reject(error) : resolvePromise())),
    );
  });
}

async function reportHealthy(port) {
  try {
    const response = await fetch(`http://${host}:${port}/__health`, {
      signal: AbortSignal.timeout(1200),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function appHealthy(port) {
  try {
    const response = await fetch(`http://${host}:${port}/coach`, {
      signal: AbortSignal.timeout(8000),
    });
    return response.status === 200;
  } catch {
    return false;
  }
}

export async function createReportServer({
  root,
  host: bindHost = host,
  port,
}) {
  const reportRoot = await realpath(root);
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", `http://${bindHost}:${port}`)
      .pathname;
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" }).end("Method not allowed");
      return;
    }
    if (pathname === "/__health") {
      response.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end(request.method === "HEAD" ? undefined : "ok");
      return;
    }
    if (pathname === "/") {
      const reports = (await readdir(reportRoot, { withFileTypes: true }))
        .filter(
          (entry) =>
            entry.isFile() && extname(entry.name).toLowerCase() === ".html",
        )
        .map((entry) => entry.name)
        .sort();
      const links = reports
        .map(
          (name) =>
            `<li><a href="/${encodeURIComponent(name)}">${escapeHtml(name)}</a></li>`,
        )
        .join("");
      const page = `<!doctype html><html><head><meta charset="utf-8"><title>Local reports</title></head><body><h1>Local reports</h1><ul>${links || "<li>No HTML reports yet.</li>"}</ul></body></html>`;
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(request.method === "HEAD" ? undefined : page);
      return;
    }

    let decodedPath;
    try {
      decodedPath = decodeURIComponent(pathname);
    } catch {
      response.writeHead(400).end("Bad path");
      return;
    }
    const requested = resolve(reportRoot, `.${decodedPath}`);
    const relativePath = relative(reportRoot, requested);
    if (
      relativePath.startsWith(`..${sep}`) ||
      relativePath === ".." ||
      resolve(requested) === reportRoot
    ) {
      response.writeHead(403).end("Forbidden");
      return;
    }

    try {
      const filePath = await realpath(requested);
      const actualRelative = relative(reportRoot, filePath);
      if (actualRelative.startsWith(`..${sep}`) || actualRelative === "..") {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const info = await stat(filePath);
      if (!info.isFile()) {
        response.writeHead(404).end("Not found");
        return;
      }
      response.writeHead(200, {
        "Content-Length": info.size,
        "Content-Type":
          contentTypes.get(extname(filePath).toLowerCase()) ??
          "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      });
      if (request.method === "HEAD") response.end();
      else createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(port, bindHost, resolvePromise);
  });
  return server;
}

async function readState(stateDir) {
  try {
    return JSON.parse(await readFile(join(stateDir, "servers.json"), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

async function writeState(stateDir, state) {
  await mkdir(stateDir, { recursive: true });
  const path = join(stateDir, "servers.json");
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(temporaryPath, path);
}

async function acquireLock(stateDir) {
  await mkdir(stateDir, { recursive: true });
  const path = join(stateDir, "operation.lock");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const lock = await open(
        path,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        0o600,
      );
      await lock.writeFile(`${process.pid}\n`);
      return async () => {
        await lock.close();
        await rm(path, { force: true });
      };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const existingPid = Number.parseInt(
        await readFile(path, "utf8").catch(() => ""),
        10,
      );
      if (isProcessAlive(existingPid))
        throw new Error("Another local preview command is in progress.");
      await rm(path, { force: true });
    }
  }
  throw new Error("Could not acquire the local preview operation lock.");
}

async function waitFor(predicate, timeoutMs, message) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) return;
    await delay(250);
  }
  throw new Error(message);
}

async function isHealthyState(state, expected) {
  if (
    !state ||
    state.appPort !== expected.appPort ||
    state.reportsPort !== expected.reportsPort
  )
    return false;
  if (!isOwnedProcess(state.supervisorPid, "supervisor", state.owner))
    return false;
  const appOwn = isOwnedProcess(state.appPid, "app-worker", state.owner);
  const reportsOwn = isOwnedProcess(
    state.reportsPid,
    "reports-worker",
    state.owner,
  );
  return (
    appOwn &&
    reportsOwn &&
    (await appHealthy(state.appPort)) &&
    (await reportHealthy(state.reportsPort))
  );
}

async function startPreview() {
  const config = settings();
  validatePorts(config);
  const releaseLock = await acquireLock(config.stateDir);
  try {
    let current = await readState(config.stateDir);
    if (current) {
      if (await isHealthyState(current, config)) {
        console.log(
          `Local preview already running: http://${host}:${config.appPort} and http://${host}:${config.reportsPort}`,
        );
        return;
      }
      if (isOwnedProcess(current.supervisorPid, "supervisor", current.owner)) {
        console.log(
          "Local preview supervisor is starting or recovering; waiting for both services.",
        );
        await waitFor(
          async () => isHealthyState(await readState(config.stateDir), config),
          90000,
          "The owned preview did not become healthy; inspect .agent-runs/local-preview/*.log.",
        );
        return printStatus(config, await readState(config.stateDir));
      }
      const portsFree = await Promise.all(
        [config.appPort, config.reportsPort].map((port) =>
          assertPortAvailable(port).then(
            () => true,
            () => false,
          ),
        ),
      );
      if (portsFree.some((free) => !free))
        throw new Error(
          "A stale preview record exists and one or more ports are occupied. Nothing was stopped; inspect the recorded PIDs and listeners before retrying.",
        );
      await rm(join(config.stateDir, "servers.json"), { force: true });
      current = undefined;
    }

    await assertPortAvailable(config.appPort);
    await assertPortAvailable(config.reportsPort);
    const owner = randomUUID();
    const child = spawn(
      process.execPath,
      [
        scriptPath,
        "supervisor",
        owner,
        String(config.appPort),
        String(config.reportsPort),
        config.stateDir,
      ],
      {
        cwd: projectRoot,
        detached: true,
        stdio: "ignore",
      },
    );
    child.unref();
    await waitFor(
      async () => {
        const state = await readState(config.stateDir);
        return state?.owner === owner && state.supervisorPid === child.pid;
      },
      5000,
      "Local preview supervisor did not record its identity.",
    );
    await waitFor(
      async () => isHealthyState(await readState(config.stateDir), config),
      90000,
      "Local preview did not become healthy. Inspect .agent-runs/local-preview/*.log.",
    );
    await printStatus(config, await readState(config.stateDir));
  } finally {
    await releaseLock();
  }
}

async function printStatus(config, state) {
  const [appReady, reportsReady] = await Promise.all([
    appHealthy(state.appPort),
    reportHealthy(state.reportsPort),
  ]);
  console.log(
    `App:     ${appReady ? "healthy" : "starting/unavailable"} http://${host}:${state.appPort} (pid ${state.appPid})`,
  );
  console.log(
    `Reports: ${reportsReady ? "healthy" : "starting/unavailable"} http://${host}:${state.reportsPort} (pid ${state.reportsPid})`,
  );
  console.log(
    `Supervisor pid ${state.supervisorPid}; logs: ${config.stateDir}`,
  );
}

async function showStatus() {
  const config = settings();
  const state = await readState(config.stateDir);
  if (!state) {
    console.log("Local preview is not managed by this project runner.");
    return;
  }
  if (!isOwnedProcess(state.supervisorPid, "supervisor", state.owner)) {
    console.log(
      `Local preview state is stale; recorded supervisor pid ${state.supervisorPid} is not the matching runner. No process was stopped.`,
    );
    return;
  }
  await printStatus(config, state);
}

async function stopPreview() {
  const config = settings();
  const releaseLock = await acquireLock(config.stateDir);
  try {
    const state = await readState(config.stateDir);
    if (!state) {
      console.log("Local preview is not running.");
      return;
    }
    if (!isOwnedProcess(state.supervisorPid, "supervisor", state.owner)) {
      console.log(
        `Refusing to stop unverified supervisor pid ${state.supervisorPid}. No process was stopped.`,
      );
      return;
    }
    process.kill(state.supervisorPid, "SIGTERM");
    await waitFor(
      async () => !isProcessAlive(state.supervisorPid),
      10000,
      "Supervisor did not exit; no other processes were signaled.",
    );
    console.log("Local preview stopped.");
  } finally {
    await releaseLock();
  }
}

async function supervisorMain(owner, appPort, reportsPort, stateDir) {
  const config = {
    appPort: Number(appPort),
    reportsPort: Number(reportsPort),
    stateDir: resolve(stateDir),
  };
  validatePorts(config);
  await mkdir(config.stateDir, { recursive: true });
  const state = {
    owner,
    appPort: config.appPort,
    reportsPort: config.reportsPort,
    supervisorPid: process.pid,
  };
  const children = new Map();
  let shuttingDown = false;
  let restartRequested = false;
  let retryDelay = 1000;

  const cleanup = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const child of children.values()) {
      if (child.pid) child.kill("SIGTERM");
    }
    await Promise.all(
      [...children.values()].map(
        (child) =>
          new Promise((resolvePromise) => {
            if (child.exitCode !== null || child.signalCode !== null)
              return resolvePromise();
            const timeout = setTimeout(() => {
              if (child.pid && isProcessAlive(child.pid)) child.kill("SIGKILL");
              resolvePromise();
            }, 5000).unref();
            child.once("exit", () => {
              clearTimeout(timeout);
              resolvePromise();
            });
          }),
      ),
    );
    await rm(join(config.stateDir, "servers.json"), { force: true });
  };
  process.once("SIGTERM", () => void cleanup().then(() => process.exit(0)));
  process.once("SIGINT", () => void cleanup().then(() => process.exit(0)));

  const launchWorker = (mode, port) => {
    const logFile = join(
      config.stateDir,
      mode === "app-worker" ? "app.log" : "reports.log",
    );
    const descriptor = openSync(logFile, "a");
    const child = spawn(
      process.execPath,
      [scriptPath, mode, owner, String(port)],
      {
        cwd: projectRoot,
        stdio: ["ignore", descriptor, descriptor],
      },
    );
    closeSync(descriptor);
    child.once("exit", () => {
      children.delete(mode);
      if (!shuttingDown) restartRequested = true;
    });
    children.set(mode, child);
    if (mode === "app-worker") state.appPid = child.pid;
    else state.reportsPid = child.pid;
  };

  launchWorker("app-worker", config.appPort);
  launchWorker("reports-worker", config.reportsPort);
  await writeState(config.stateDir, state);
  while (!shuttingDown) {
    if (restartRequested) {
      restartRequested = false;
      await delay(retryDelay);
      if (shuttingDown) break;
      retryDelay = Math.min(retryDelay * 2, 30000);
      if (!children.has("app-worker"))
        launchWorker("app-worker", config.appPort);
      if (!children.has("reports-worker"))
        launchWorker("reports-worker", config.reportsPort);
      await writeState(config.stateDir, state);
    } else {
      if (
        (await appHealthy(config.appPort)) &&
        (await reportHealthy(config.reportsPort))
      )
        retryDelay = 1000;
      await delay(2000);
    }
  }
}

async function runAppWorker(owner, port) {
  const nextCli = join(
    projectRoot,
    "node_modules",
    "next",
    "dist",
    "bin",
    "next",
  );
  const next = spawn(
    process.execPath,
    [nextCli, "dev", "--webpack", "--hostname", host, "--port", String(port)],
    {
      cwd: projectRoot,
      env: { ...process.env, LOCAL_PREVIEW_OWNER: owner },
      stdio: "inherit",
    },
  );
  let forceKill;
  const stopNext = (signal) => {
    next.kill(signal);
    forceKill = setTimeout(() => next.kill("SIGKILL"), 4500);
    forceKill.unref();
  };
  process.once("SIGTERM", () => stopNext("SIGTERM"));
  process.once("SIGINT", () => stopNext("SIGINT"));
  const [code, signal] = await new Promise((resolvePromise) =>
    next.once("exit", (exitCode, exitSignal) =>
      resolvePromise([exitCode, exitSignal]),
    ),
  );
  if (forceKill) clearTimeout(forceKill);
  process.exitCode = code ?? (signal ? 1 : 0);
}

async function runReportsWorker(owner, port) {
  const server = await createReportServer({
    root: join(projectRoot, "reports"),
    port,
  });
  process.once("SIGTERM", () => server.close(() => process.exit(0)));
  process.once("SIGINT", () => server.close(() => process.exit(0)));
  console.log(`reports worker ${owner} listening on ${host}:${port}`);
}

async function main(args) {
  const [command, ...rest] = args;
  if (command === "up") await startPreview();
  else if (command === "status") await showStatus();
  else if (command === "down") await stopPreview();
  else if (command === "supervisor") await supervisorMain(...rest);
  else if (command === "app-worker") await runAppWorker(...rest);
  else if (command === "reports-worker") await runReportsWorker(...rest);
  else
    throw new Error("Usage: node scripts/local-preview.mjs <up|status|down>");
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
