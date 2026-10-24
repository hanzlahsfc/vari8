#!/usr/bin/env node
// K6-GATE resource sampler — writes one NDJSON sample per interval while
// a load run is in flight:
//
//   node tools/load/resources.mjs > tools/load/out/resources.ndjson
//
// On this dev host it samples the local docker containers; on a staging
// host run it where the app+db run (same command, env-configured names).
//   LOAD_INTERVAL_S=5   sample period (default 5s)
//   LOAD_APP_CONTAINER  container name for the app (docker stats), or
//   LOAD_APP_PID        host PID when the app runs uncontainerized
//   LOAD_DB_CONTAINER   container name for Postgres (docker stats + conn count)
//   LOAD_SAMPLES=N      stop after N samples (default: run until SIGINT/TERM)
//
// Each line: {ts, appCpuPct, appRamMb, dbCpuPct, pgConnections, pgConnLimit}

import { execFileSync } from "node:child_process";

const intervalS = Number(process.env.LOAD_INTERVAL_S ?? "5");
const maxSamples = Number(process.env.LOAD_SAMPLES ?? "0"); // 0 = until signal
const appC = process.env.LOAD_APP_CONTAINER ?? "";
const dbC = process.env.LOAD_DB_CONTAINER ?? "";

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
      ramMb: Math.round(
        parseFloat(
          String(d.MemUsage)
            .split("/")[0]
            .replace(/[^\d.]/g, ""),
        ) || 0,
      ),
    };
  } catch {
    return null;
  }
}

// Host-process fallback: when the app runs uncontainerized (`next start`
// directly), sample it by PID via `ps`.
const appPid = process.env.LOAD_APP_PID ?? "";
function appStat() {
  if (appC) return dockerStat(appC);
  if (!appPid) return null;
  try {
    const out = execFileSync("ps", ["-p", appPid, "-o", "%cpu=,rss="], {
      encoding: "utf8",
      timeout: 5000,
    }).trim();
    const [cpu, rss] = out.split(/\s+/).filter(Boolean).map(Number);
    if (!Number.isFinite(cpu)) return null;
    return { cpuPct: cpu, ramMb: Math.round((rss || 0) / 1024) };
  } catch {
    return null;
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

let n = 0;
while (running && (maxSamples === 0 || n < maxSamples)) {
  const app = appStat();
  const dbStats = dockerStat(dbC);
  const pg = pgConnections();
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      appCpuPct: app?.cpuPct ?? null,
      appRamMb: app?.ramMb ?? null,
      dbCpuPct: dbStats?.cpuPct ?? null,
      pgConnections: pg.connections,
      pgConnLimit: pg.limit,
    }),
  );
  n++;
  await new Promise((r) => setTimeout(r, intervalS * 1000));
}
