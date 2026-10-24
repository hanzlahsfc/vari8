#!/usr/bin/env node
// K6-GATE report — parses `k6` JSON output (`--out json` NDJSON, or the
// handleSummary file this repo's trial-gate.js writes) plus an optional
// resource-sample NDJSON into the issue-178 acceptance table:
//   per-endpoint p50/p95/p99, error rate, requests/sec, and — when a
//   resources file is supplied — CPU %, RAM and Postgres connections.
// Prints the pass/fail verdict, the slowest endpoint and the first
// saturated resource. Pure I/O + math; no network access.

import fs from "node:fs";

const ACCEPTANCE = {
  p95ms: 400,
  p99ms: 1000,
  errorRate: 0.005, // 0.5 %
  cpuPct: 70,
};

export function percentile(sorted, p) {
  if (sorted.length === 0) return NaN;
  const i = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(i, sorted.length - 1))];
}

/** Classify one parsed request sample the same way the k6 script tags it. */
export function sampleClass(point) {
  // --out json point: { type:"Point", metric:"load_latency"|…, data:{ tags, value } }
  const cls = point?.data?.tags?.class;
  if (cls) return cls;
  return "unknown";
}

/**
 * Parse a k6 `--out json` NDJSON stream into per-endpoint rows.
 * Only `load_latency` points (tagged endpoint+class) are consumed; the
 * summary object ignores every other metric.
 */
export function parseJsonOut(text) {
  const points = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    let p;
    try {
      p = JSON.parse(t);
    } catch {
      continue;
    }
    if (p.type === "Point" && p.metric === "load_latency") points.push(p);
  }
  return points;
}

/**
 * Parse the handleSummary JSON (summary object) — used when the run wrote
 * summary.json instead of an --out json stream. Expects the metrics keyed
 * `load_latency{endpoint:X,class:Y}` … shape; falls back to per-point
 * reconstruction when the summary carries `values` aggregates only.
 */
export function parseSummary(text) {
  const data = JSON.parse(text);
  const rows = {};
  for (const [key, m] of Object.entries(data.metrics ?? {})) {
    if (!key.startsWith("load_latency")) continue;
    const tags = key.match(/\{(.+)\}/)?.[1] ?? "";
    const endpoint = tags.match(/endpoint:([^,}]+)/)?.[1] ?? "unknown";
    const cls = tags.match(/class:([^,}]+)/)?.[1] ?? "unknown";
    const r = (rows[endpoint] ??= {
      endpoint,
      count: 0,
      refused: 0,
      httpErrors: 0,
      transport: 0,
      concealed: 0,
      p50: NaN,
      p95: NaN,
      p99: NaN,
    });
    const v = m.values ?? {};
    r.count += v.count ?? 0;
    if (cls === "refusal") r.refused += v.count ?? 0;
    else if (cls === "http_error") r.httpErrors += v.count ?? 0;
    else if (cls === "transport") r.transport += v.count ?? 0;
    else if (cls === "concealed_refusal") r.concealed += v.count ?? 0;
    // p50/p95/p99 only exist on the untagged aggregate; per-class lines
    // carry them too — take the max-line values when present.
    for (const [k, pk] of [
      ["p(50)", "p50"],
      ["p(95)", "p95"],
      ["p(99)", "p99"],
    ])
      if (Number.isFinite(v[k])) r[pk] = Math.max(r[pk] || -1, v[k]);
  }
  return Object.values(rows);
}

/** Rebuild per-endpoint rows from raw --out json points. */
export function rowsFromPoints(points) {
  const byEp = new Map();
  for (const p of points) {
    const ep = p.data?.tags?.endpoint ?? "unknown";
    const cls = sampleClass(p);
    const r =
      byEp.get(ep) ??
      byEp
        .set(ep, {
          endpoint: ep,
          count: 0,
          refused: 0,
          httpErrors: 0,
          transport: 0,
          concealed: 0,
          latencies: [],
        })
        .get(ep);
    r.count++;
    if (cls === "refusal") r.refused++;
    else if (cls === "http_error") r.httpErrors++;
    else if (cls === "transport") r.transport++;
    else if (cls === "concealed_refusal") r.concealed++;
    const v = Number(p.data?.value);
    if (Number.isFinite(v)) r.latencies.push(v);
  }
  for (const r of byEp.values()) {
    r.latencies.sort((a, b) => a - b);
    r.p50 = percentile(r.latencies, 50);
    r.p95 = percentile(r.latencies, 95);
    r.p99 = percentile(r.latencies, 99);
    delete r.latencies;
  }
  return [...byEp.values()];
}

/** Parse the resource sampler's NDJSON into peak/average figures. */
export function parseResources(text) {
  const samples = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      samples.push(JSON.parse(line));
    } catch {
      /* skip malformed */
    }
  }
  const peak = (f) => samples.reduce((m, s) => Math.max(m, f(s) ?? 0), 0);
  const cpuMeasured = samples.some(
    (s) => s.appCpuPct != null || s.dbCpuPct != null,
  );
  return {
    samples: samples.length,
    cpuMeasured,
    cpuPeakPct: peak((s) => s.appCpuPct) + peak((s) => s.dbCpuPct),
    ramPeakMb: peak((s) => s.appRamMb),
    pgConnPeak: peak((s) => s.pgConnections),
    pgConnLimit: samples.at(-1)?.pgConnLimit ?? null,
  };
}

/** The verdict block: per-endpoint table + named slowest + saturation. */
export function verdict(rows, res, durationSec) {
  const total = rows.reduce((n, r) => n + r.count, 0);
  const fails = rows.reduce(
    (n, r) => n + r.refused + r.httpErrors + r.transport + r.concealed,
    0,
  );
  const errorRate = total === 0 ? 0 : fails / total;
  const worst95 = Math.max(...rows.map((r) => r.p95));
  const slowest =
    rows.find((r) => r.p95 === worst95)?.endpoint ?? "(no samples)";
  const checks = [
    {
      name: "p95 < 400ms per endpoint worst",
      pass: worst95 < ACCEPTANCE.p95ms,
    },
    {
      name: "p99 < 1000ms per endpoint worst",
      pass: Math.max(...rows.map((r) => r.p99)) < ACCEPTANCE.p99ms,
    },
    { name: "error rate < 0.5%", pass: errorRate < ACCEPTANCE.errorRate },
    {
      name: "concealed refusals = 0",
      pass: rows.every((r) => r.concealed === 0),
    },
  ];
  if (res) {
    // An unmeasured CPU cannot pass the gate — inconclusive is not green.
    checks.push({ name: "CPU measured", pass: res.cpuMeasured });
    checks.push({
      name: "CPU < 70%",
      pass: res.cpuMeasured && res.cpuPeakPct < ACCEPTANCE.cpuPct,
    });
    if (res.pgConnLimit !== null)
      checks.push({
        name: "pg connections under limit",
        pass: res.pgConnPeak < res.pgConnLimit,
      });
  }
  // First saturated resource = the first check that failed.
  const firstFail = checks.find((c) => !c.pass)?.name ?? "none";
  return {
    total,
    fails,
    errorRate,
    rps: durationSec > 0 ? total / durationSec : NaN,
    slowestEndpoint: slowest,
    firstSaturated: firstFail,
    pass: checks.every((c) => c.pass),
    checks,
  };
}

function main() {
  const [summaryFile, resourcesFile, durationArg] = process.argv.slice(2);
  if (!summaryFile) {
    console.error(
      "usage: report.mjs <k6 summary.json|--out-json> [resources.ndjson] [durationSec]",
    );
    process.exit(2);
  }
  const text = fs.readFileSync(summaryFile, "utf8");
  const rows = text.includes('"metrics"')
    ? parseSummary(text)
    : rowsFromPoints(parseJsonOut(text));
  const res = resourcesFile
    ? parseResources(fs.readFileSync(resourcesFile, "utf8"))
    : null;
  const v = verdict(rows, res, Number(durationArg) || 0);

  console.log("endpoint           count  p50    p95    p99    err%");
  for (const r of rows.sort((a, b) => b.p95 - a.p95))
    console.log(
      `${r.endpoint.padEnd(18)} ${String(r.count).padStart(5)}  ${f(r.p50)} ${f(r.p95)} ${f(r.p99)} ${pct(r)}`,
    );
  console.log(
    `\ntotal=${v.total} refused+err=${v.fails} rate=${(v.errorRate * 100).toFixed(2)}% rps=${v.rps.toFixed(1)}`,
  );
  if (res)
    console.log(
      `cpuPeak=${res.cpuPeakPct.toFixed(1)}% ramPeak=${res.ramPeakMb}MB pgConn=${res.pgConnPeak}/${res.pgConnLimit ?? "?"}`,
    );
  console.log(
    `slowest: ${v.slowestEndpoint} · first saturated: ${v.firstSaturated}`,
  );
  for (const c of v.checks)
    console.log(`${c.pass ? "PASS" : "FAIL"} ${c.name}`);
  console.log(`\nVERDICT: ${v.pass ? "PASS" : "FAIL"}`);
  process.exit(v.pass ? 0 : 1);

  function f(n) {
    return Number.isFinite(n) ? n.toFixed(0).padStart(6) : "     -";
  }
  function pct(r) {
    const bad = r.refused + r.httpErrors + r.transport + r.concealed;
    return `${((bad / Math.max(1, r.count)) * 100).toFixed(2)}%`;
  }
}

// CLI entry — skipped under unit tests (import only).
if (process.argv[1] && process.argv[1].endsWith("report.mjs")) main();
