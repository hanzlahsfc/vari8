import { spawnSync } from "node:child_process";
import http from "node:http";
import https from "node:https";

import { ConfigError } from "./compare.mjs";

export class ParityRefuse extends Error {}

export function parityPortPair(raw) {
  if (!/^\d+$/.test(raw ?? "") || Number(raw) < 1 || Number(raw) > 65534)
    throw new ConfigError(
      `PARITY_PORT="${raw}" must name the public HTTPS port and leave <port+1> free for the backend (1-65534)`,
    );
  const publicPort = Number(raw);
  return { publicPort, backendPort: publicPort + 1 };
}

// bind() probes then closes immediately: this checks availability only and
// intentionally does not reserve the pair. Startup must fail closed if a port
// is taken in the selection-to-listen race.
export async function selectPortPair(pinned, bind) {
  if (pinned !== null) {
    const pair = parityPortPair(String(pinned));
    for (const port of [pair.publicPort, pair.backendPort])
      if (
        !(await bind(port).then(
          () => true,
          () => false,
        ))
      )
        throw new ParityRefuse(
          `port ${port} is in use; PARITY_PORT must leave the HTTPS port and <port+1> backend free. Nothing was compared.`,
        );
    return pair;
  }
  for (let i = 0; i < 100; i++) {
    const publicPort = await bind(0);
    const backendPort = await bind(0);
    if (publicPort !== backendPort) return { publicPort, backendPort };
  }
  throw new ParityRefuse(
    "could not select a distinct local HTTPS/backend port pair",
  );
}

export function parityUrl(raw, rootApp) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigError(`PARITY_URL="${raw}" is not a valid URL`);
  }
  if (rootApp && url.protocol !== "https:")
    throw new ConfigError(
      `PARITY_URL="${raw}" must use an https: origin for the production root app`,
    );
  return url.origin;
}

/**
 * @param {string} rawUrl
 * @param {{ca?: Buffer | string | null, method?: string, headers?: Record<string, string>, body?: string | null}} [options]
 */
export function httpsRequest(
  rawUrl,
  { ca = null, method = "GET", headers = {}, body = null } = {},
) {
  const url = new URL(rawUrl);
  const transport = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = transport.request(
      url,
      {
        ca: ca ?? undefined,
        method,
        headers,
        rejectUnauthorized: Boolean(ca) || undefined,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            setCookie: res.headers["set-cookie"] ?? [],
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    req.on("error", reject);
    if (body !== null) req.write(body);
    req.end();
  });
}

function processGroup(pid) {
  return spawnSync("ps", ["-o", "pgid=", "-p", String(pid)], {
    encoding: "utf8",
  }).stdout.trim();
}

export function listenerPids(port) {
  return spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
    encoding: "utf8",
  })
    .stdout.trim()
    .split(/\s+/)
    .filter(Boolean);
}

function processGroupMembers(pgid) {
  return spawnSync("ps", ["-axo", "pid=,pgid="], { encoding: "utf8" })
    .stdout.split("\n")
    .map((line) => line.trim().split(/\s+/))
    .filter(([, group]) => group === String(pgid))
    .map(([pid]) => pid)
    .filter(Boolean);
}

function portOwnedByGroup(port, pgid) {
  const pids = listenerPids(port);
  return (
    pids.length > 0 && pids.every((pid) => processGroup(pid) === String(pgid))
  );
}

function waitForProcessExit(child, ms) {
  if (child.exitCode !== null || child.signalCode !== null)
    return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

async function waitForNoListeners(port, ms = 2000) {
  const t0 = Date.now();
  while (Date.now() - t0 <= ms) {
    if (listenerPids(port).length === 0) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return listenerPids(port).length === 0;
}

async function waitForNoGroupMembers(pgid, ms = 2000) {
  const t0 = Date.now();
  while (Date.now() - t0 <= ms) {
    if (processGroupMembers(pgid).length === 0) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return processGroupMembers(pgid).length === 0;
}

export async function stopOwnedProcessGroup(
  child,
  port,
  { terminateMs = 10000, killMs = 5000 } = {},
) {
  const problems = [];
  const pgid = String(child.pid);
  const signalOwnedGroup = (signal) => {
    // A group survives leader exit while descendants remain. Only signal the
    // original PGID when it still has members or exactly owns this listener;
    // this avoids PID reuse and never targets a foreign listener.
    if (processGroupMembers(pgid).length === 0 && !portOwnedByGroup(port, pgid))
      return;
    try {
      process.kill(-Number(pgid), signal);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  };

  signalOwnedGroup("SIGTERM");
  let exited = await waitForProcessExit(child, terminateMs);
  await waitForNoListeners(port);
  await waitForNoGroupMembers(pgid);

  if (processGroupMembers(pgid).length > 0 || portOwnedByGroup(port, pgid)) {
    signalOwnedGroup("SIGKILL");
    await waitForProcessExit(child, killMs);
    await waitForNoListeners(port);
    await waitForNoGroupMembers(pgid, killMs);
  }

  const pids = listenerPids(port);
  const members = processGroupMembers(pgid);
  if (pids.length) {
    if (pids.every((pid) => processGroup(pid) === pgid))
      problems.push(`process group ${pgid} still owns listener ${port}`);
    else
      problems.push(
        `listener ${port} is owned by process(es) ${pids.join(", ")} outside this run`,
      );
  }
  if (members.length)
    problems.push(
      `process group ${pgid} still has process(es) ${members.join(", ")}`,
    );
  if (!exited) problems.push(`process ${child.pid} did not exit`);
  return problems;
}

export function browserCookies(setCookieLines, baseUrl, nowMs = Date.now()) {
  const defaultDomain = new URL(baseUrl).hostname;
  return setCookieLines.map((line) => {
    const [pair, ...attrs] = line.split(";");
    const i = pair.indexOf("=");
    const values = Object.fromEntries(
      attrs.map((attr) => {
        const j = attr.indexOf("=");
        return j === -1
          ? [attr.trim().toLowerCase(), true]
          : [attr.slice(0, j).trim().toLowerCase(), attr.slice(j + 1).trim()];
      }),
    );
    const cookie = {
      name: pair.slice(0, i).trim(),
      value: pair.slice(i + 1).trim(),
      domain: values.domain ?? defaultDomain,
      path: values.path ?? "/",
      httpOnly: values.httponly === true,
      secure: values.secure === true,
      sameSite: values.samesite ?? "Lax",
    };
    if (/^-?\d+$/.test(values["max-age"] ?? "")) {
      cookie.expires = Math.floor(nowMs / 1000) + Number(values["max-age"]);
    } else if (values.expires) {
      const expires = Date.parse(values.expires);
      if (Number.isFinite(expires)) cookie.expires = Math.floor(expires / 1000);
    }
    return cookie;
  });
}
