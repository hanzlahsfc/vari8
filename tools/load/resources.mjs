#!/usr/bin/env node
// K6-GATE resource sampler — writes one NDJSON sample per interval while
// a load run is in flight:
//
//   node tools/load/resources.mjs > tools/load/out/resources.ndjson
//
// Runs where the app+db run. Sources:
//   LOAD_APP_CONTAINER  docker container for the app (docker stats +
//                       docker inspect RestartCount), or
//   LOAD_APP_PID        host PID when the app runs uncontainerized —
//                       restarts detected via `ps -o lstart` changing
//   LOAD_DB_CONTAINER   docker container for Postgres (stats + restart
//                       count + pg_stat_activity vs max_connections)
//   LOAD_PG_DB          database name for the connection query
//   LOAD_INTERVAL_S     sample period (default 5s)
//   LOAD_SAMPLES=N      stop after N samples (0 = until SIGINT/TERM)
//
// Each line: {ts, appCpuPct, appRamMb, appRestarts, dbCpuPct, dbRamMb,
//             dbRestarts, pgConnections, pgConnLimit, hostCpus}
// CPU semantics: docker CPUPerc units — 100% == one host core saturated;
// `hostCpus` records the host core count for multicore normalization.
// Restart counts are docker RestartCount (or PID lstart flips) — a
// positive delta means the process restarted during the window.

import { execFileSync } from "node:child_process";
import os from "node:os";

import { memToMb } from "./config.mjs";

const intervalS = Number(process.env.LOAD_INTERVAL_S ?? "5");
const maxSamples = Number(process.env.LOAD_SAMPLES ?? "0");
const appC = process.env.LOAD_APP_CONTAINER ?? "";
const appPid = process.env.LOAD_APP_PID ?? "";
const dbC = process.env.LOAD_DB_CONTAINER ?? "";
const hostCpus = os.cpus().length;

function dockerStat(name) {
  if (!name) return null;
  try {
    const out = execFileSync(
      "docker",
      ["stats", "--no-stream", "--format", "{{json .}}", name],
      { encoding: "utf8", timeout: 8000 },
    ).trim();
    const d = JSON.parse(out);
    return {
      cpuPct: parseFloat(String(d.CPUPerc).replace("%", "")) || 0,
      ramMb: memToMb(String(d.MemUsage).split("/")[0]),
    };
  } catch {
    return null;
  }
}

function dockerRestarts(name) {
  if (!name) return null;
  try {
    const out = execFileSync(
      "docker",
      ["inspect", "-f", "{{.RestartCount}}", name],
      { encoding: "utf8", timeout: 8000 },
    ).trim();
    const n = Number(out);
    return Number.isInteger(n) ? n : null;
  } catch {
    return null;
  }
}

// Host-PID mode: CPU% is a lifetime average under `ps`, so we derive
// per-interval CPU from the cumulative cputime delta — summed across
// the whole process tree (`pgrep -P` descendants, so a `npx`/`next`
// wrapper's child workers count). A restart shows up as the root
// process's start time (`lstart`) changing between samples.
function procTree(rootPid) {
  const seen = new Set([rootPid]);
  const queue = [rootPid];
  while (queue.length) {
    const p = queue.shift();
    try {
      const out = execFileSync("pgrep", ["-P", p], {
        encoding: "utf8",
        timeout: 3000,
      }).trim();
      for (const c of out.split("\n").filter(Boolean))
        if (!seen.has(c)) {
          seen.add(c);
          queue.push(c);
        }
    } catch {
      /* no children */
    }
  }
  return [...seen];
}

let pidBase = null; // { cputimeSec, startTime, seenAt }
function pidStat(pid) {
  if (!pid) return { cpuPct: null, ramMb: null, restarted: null };
  try {
    const pids = procTree(pid).join(",");
    const out = execFileSync(
      "ps",
      ["-p", pids, "-o", "pid=,time=,rss=,lstart="],
      { encoding: "utf8", timeout: 5000 },
    ).trim();
    // One line per process: "pid time rss lstart". Sum cputime + rss
    // across the tree; the restart signal is the root's lstart.
    let cputimeSec = 0;
    let rssMb = 0;
    let lstart = "";
    for (const line of out.split("\n")) {
      const m = /^\s*(\d+)\s+([\d:.]+)\s+(\d+)\s+(.+)$/.exec(line);
      if (!m) continue;
      const parts = m[2].split(":").map(parseFloat);
      cputimeSec +=
        parts.length === 3
          ? parts[0] * 3600 + parts[1] * 60 + parts[2]
          : parts.length === 2
            ? parts[0] * 60 + parts[1]
            : parts[0] || 0;
      rssMb += +m[3] / 1024;
      if (m[1] === String(pid)) lstart = m[4].trim();
    }
    rssMb = Math.round(rssMb);
    const now = Date.now();
    let cpuPct = null;
    let restarted = 0;
    if (pidBase) {
      const dCpu = cputimeSec - pidBase.cputimeSec;
      const dWall = (now - pidBase.seenAt) / 1000;
      cpuPct = dWall > 0 ? (dCpu / dWall) * 100 : 0;
      if (lstart !== pidBase.startTime) restarted = 1;
    }
    pidBase = { cputimeSec, startTime: lstart, seenAt: now };
    return { cpuPct, ramMb: rssMb, restarted };
  } catch {
    return { cpuPct: null, ramMb: null, restarted: null };
  }
}

function pgConnections() {
  if (!dbC) return { connections: null, limit: null };
  try {
    const out = execFileSync(
      "docker",
      [
        "exec",
        dbC,
        "psql",
        "-U",
        process.env.PGUSER ?? "app",
        "-d",
        process.env.LOAD_PG_DB ?? "postgres",
        "-tAc",
        "select count(*), current_setting('max_connections')::int from pg_stat_activity group by 2",
      ],
      { encoding: "utf8", timeout: 8000 },
    ).trim();
    const [conn, limit] = out.split("|").map(Number);
    return { connections: conn, limit };
  } catch {
    return { connections: null, limit: null };
  }
}

let running = true;
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => (running = false));

// PID-mode restart count accumulates lstart flips across samples.
let pidRestarts = 0;

let n = 0;
while (running && (maxSamples === 0 || n < maxSamples)) {
  // First line declares the configured cadence — the report validates
  // coverage against this declared interval, not the observed median.
  if (n === 0)
    console.log(
      JSON.stringify({
        type: "meta",
        intervalSec: intervalS,
        startedAt: new Date().toISOString(),
      }),
    );
  const app = appC ? dockerStat(appC) : { cpuPct: null, ramMb: null };
  const pidS = !appC && appPid ? pidStat(appPid) : null;
  const dbStats = dockerStat(dbC);
  const appRestarts = appC
    ? dockerRestarts(appC)
    : ((pidRestarts += pidS?.restarted ?? 0), appPid ? pidRestarts : null);
  const dbRestarts = dockerRestarts(dbC);
  const pg = pgConnections();
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      appCpuPct: app.cpuPct ?? pidS?.cpuPct ?? null,
      appRamMb: app.ramMb ?? pidS?.ramMb ?? null,
      appRestarts,
      dbCpuPct: dbStats?.cpuPct ?? null,
      dbRamMb: dbStats?.ramMb ?? null,
      dbRestarts,
      pgConnections: pg.connections,
      pgConnLimit: pg.limit,
      hostCpus,
    }),
  );
  n++;
  await new Promise((r) => setTimeout(r, intervalS * 1000));
}
