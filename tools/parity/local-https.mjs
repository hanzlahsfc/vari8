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

export function processIdentity(pid) {
  const info = spawnSync(
    "ps",
    ["-o", "pid=,ppid=,pgid=,lstart=", "-p", String(pid)],
    { encoding: "utf8" },
  );
  if (info.error || info.status !== 0) return null;
  const fields = info.stdout.trim().split(/\s+/);
  if (fields.length < 8) return null;
  return {
    pid: Number(fields[0]),
    ppid: Number(fields[1]),
    pgid: Number(fields[2]),
    start: fields.slice(3).join(" "),
  };
}

const liveInspector = () => ({
  group: (pgid) => processGroupMembers(pgid).map((pid) => processIdentity(pid)),
  listeners: (port) => listenerPids(port).map((pid) => processIdentity(pid)),
  process: (pid) => processIdentity(pid),
});

const identityKey = (entry) => `${entry?.pid}:${entry?.start}`;
const validIdentity = (entry) =>
  entry !== null &&
  typeof entry === "object" &&
  Number.isInteger(Number(entry.pid)) &&
  Number.isInteger(Number(entry.pgid)) &&
  typeof entry.start === "string" &&
  entry.start.length > 0;

const ownedIdentity = (ownership, entry) =>
  validIdentity(entry) &&
  String(entry.pgid) === String(ownership.pgid) &&
  ownership.processes.some(
    (owned) => owned.pid === Number(entry.pid) && owned.start === entry.start,
  );

// A live port occupant must match a registered process identity.
export function ownsPort(
  port,
  ownership,
  { inspector = liveInspector() } = {},
) {
  if (!ownership || !Array.isArray(ownership.processes)) return false;
  try {
    const listeners = inspector.listeners(port);
    return (
      Array.isArray(listeners) &&
      listeners.length > 0 &&
      listeners.every((identity) => ownedIdentity(ownership, identity))
    );
  } catch {
    return false;
  }
}

export async function createOwnedProcessGroup(
  child,
  { inspector = liveInspector(), timeoutMs = 2000 } = {},
) {
  const deadline = Date.now() + timeoutMs;
  let leader = null;
  do {
    leader = inspector.process(child.pid);
    if (validIdentity(leader)) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  } while (Date.now() < deadline);
  if (!validIdentity(leader))
    throw new Error(`could not establish process identity for ${child.pid}`);
  if (String(leader.pgid) !== String(child.pid))
    throw new Error(`process ${child.pid} is not a process-group leader`);
  return {
    pgid: String(child.pid),
    processes: [
      {
        pid: Number(leader.pid),
        pgid: Number(leader.pgid),
        start: leader.start,
      },
    ],
  };
}

export function registerOwnedProcess(
  ownership,
  pid,
  { inspector = liveInspector() } = {},
) {
  if (!ownership || !Array.isArray(ownership.processes)) return false;
  const candidate = inspector.process(pid);
  if (!validIdentity(candidate)) return false;
  if (String(candidate.pgid) !== String(ownership.pgid)) return false;
  const key = identityKey(candidate);
  if (ownership.processes.some((entry) => identityKey(entry) === key))
    return true;

  const seen = new Set();
  let cursor = candidate;
  while (cursor && !seen.has(cursor.pid)) {
    if (
      ownership.processes.some(
        (entry) => entry.pid === cursor.pid && entry.start === cursor.start,
      )
    ) {
      ownership.processes.push({
        pid: Number(candidate.pid),
        pgid: Number(candidate.pgid),
        start: candidate.start,
      });
      return true;
    }
    seen.add(cursor.pid);
    const parent = inspector.process(cursor.ppid);
    if (
      !validIdentity(parent) ||
      String(parent.pgid) !== String(ownership.pgid)
    )
      return false;
    cursor = parent;
  }
  return false;
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

/**
 * @typedef {{pid:number,ppid?:number,pgid:number|string,start:string}} ProcessIdentity
 * @typedef {{pgid:string,processes:ProcessIdentity[]}} ProcessOwnership
 * @typedef {{group:(pgid:string)=>Array<ProcessIdentity|null>,listeners:(port:number)=>Array<ProcessIdentity|null>,process:(pid:number)=>ProcessIdentity|null}} ProcessInspector
 * @param {import('node:child_process').ChildProcess | {pid:number,exitCode:number|null,signalCode:string|null,once?:(event:string,cb:()=>void)=>unknown}} child
 * @param {number} port
 * @param {{ownership?:ProcessOwnership,terminateMs?:number,killMs?:number,inspector?:ProcessInspector,signal?:(pid:number,name:string)=>void}} options
 */
export async function stopOwnedProcessGroup(
  child,
  port,
  {
    ownership,
    terminateMs = 10000,
    killMs = 5000,
    inspector = liveInspector(),
    signal = (pid, name) => process.kill(pid, name),
  } = {},
) {
  const problems = [];
  const pgid = String(child?.pid);
  if (
    !ownership ||
    String(ownership.pgid) !== pgid ||
    !Array.isArray(ownership.processes) ||
    ownership.processes.length === 0 ||
    !ownership.processes.every(
      (entry) => validIdentity(entry) && String(entry.pgid) === pgid,
    )
  )
    return ["process ownership is unavailable; cleanup refused"];
  const owned = (entry) => ownedIdentity(ownership, entry);
  const inspect = (kind) => {
    const result =
      kind === "group" ? inspector.group(pgid) : inspector.listeners(port);
    return Array.isArray(result) ? result : [null];
  };
  const identityLabel = (entry) => entry?.pid ?? "malformed-record";
  const group = () => inspect("group");
  const listeners = () => inspect("listeners");
  const ownedGroup = () => group().filter(owned);
  const ownedListeners = () => listeners().filter(owned);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitForNoOwned = async (kind, ms) => {
    const t0 = Date.now();
    const read = kind === "group" ? ownedGroup : ownedListeners;
    while (Date.now() - t0 <= ms) {
      if (read().length === 0) return true;
      await sleep(50);
    }
    return read().length === 0;
  };
  const signalVerified = (candidates, name) => {
    const unique = [...new Map(candidates.map((c) => [c.pid, c])).values()];
    for (const candidate of unique) {
      let current = null;
      try {
        current = inspector.process(candidate.pid);
      } catch {}
      if (
        !owned(current) ||
        current.start !== candidate.start ||
        current.pid !== candidate.pid
      ) {
        problems.push(
          `${name} skipped for process ${candidate.pid}: ownership no longer verifies`,
        );
        continue;
      }
      try {
        signal(candidate.pid, name);
      } catch (error) {
        if (error.code !== "ESRCH")
          problems.push(
            `${name} failed for process ${candidate.pid}: ${error.message}`,
          );
      }
    }
  };

  let initialGroup;
  let initialListeners;
  try {
    initialGroup = group();
    initialListeners = listeners();
  } catch (error) {
    return [`process inspection failed: ${error.message}`];
  }
  signalVerified(
    [...initialGroup.filter(owned), ...initialListeners.filter(owned)],
    "SIGTERM",
  );
  let exited = await waitForProcessExit(child, terminateMs);
  let inspectionFailed = false;
  try {
    await waitForNoOwned("group", terminateMs);
    await waitForNoOwned("listeners", terminateMs);
  } catch (error) {
    inspectionFailed = true;
    problems.push(`process inspection failed: ${error.message}`);
  }

  if (!inspectionFailed) {
    try {
      const remaining = [...ownedGroup(), ...ownedListeners()];
      if (remaining.length) {
        signalVerified(remaining, "SIGKILL");
        exited = (await waitForProcessExit(child, killMs)) || exited;
        await waitForNoOwned("group", killMs);
        await waitForNoOwned("listeners", killMs);
      }
    } catch (error) {
      problems.push(`process inspection failed: ${error.message}`);
    }
  }

  let finalGroup = [];
  let finalListeners = [];
  try {
    finalGroup = group();
    finalListeners = listeners();
  } catch (error) {
    problems.push(`process inspection failed: ${error.message}`);
  }
  const remainingOwned = finalGroup.filter(owned);
  const remainingOwnedListeners = finalListeners.filter(owned);
  const unverifiedGroup = finalGroup.filter((entry) => !owned(entry));
  const foreignListeners = finalListeners.filter((entry) => !owned(entry));
  if (remainingOwnedListeners.length)
    problems.push(
      `owned process(es) ${remainingOwnedListeners.map(identityLabel).join(", ")} still own listener ${port}`,
    );
  if (remainingOwned.length)
    problems.push(
      `owned process(es) ${remainingOwned.map(identityLabel).join(", ")} remain in group ${pgid}`,
    );
  if (unverifiedGroup.length)
    problems.push(
      `unverified process(es) ${unverifiedGroup.map(identityLabel).join(", ")} remain in group ${pgid}`,
    );
  if (foreignListeners.length)
    problems.push(
      `listener ${port} is owned by unverified process(es) ${foreignListeners.map(identityLabel).join(", ")}`,
    );
  if (!exited) problems.push(`process ${child.pid} did not exit`);
  return [...new Set(problems)];
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
