#!/usr/bin/env node
// K6-GATE report — parses the k6 `--out json` NDJSON stream plus the
// resource-sample NDJSON into the issue-178 acceptance table
// (per-scenario per-endpoint p50/p95/p99, error rate, rps, CPU/RAM,
// connections, restarts) and the verdict.
//
// Fail-closed contract (paired with trial-gate.js):
//   - every `load_latency` point MUST carry `class` and `endpoint` tags;
//     missing/unknown → the run is inconclusive, never PASS
//   - the `load_*` counter metrics must agree with the latency-derived
//     class totals — disagreement means instrumentation drift → FAIL
//   - zero measured requests, malformed lines, or a missing/incomplete
//     resources file (CPU/RAM/pg-limit/restart coverage) all block PASS
//   - the official verdict requires the 500-session hold phase —
//     `scenario:hold500` rows; absent → "not collected", not pass

import fs from "node:fs";

export const ACCEPTANCE = {
  p95ms: 400,
  p99ms: 1000,
  errorRate: 0.005, // 0.5 %
  cpuPct: 70,
};

export const CLASSES = [
  "success",
  "refusal",
  "concealed_refusal",
  "http_error",
  "transport",
  "redirect",
];

export function percentile(sorted, p) {
  if (sorted.length === 0) return NaN;
  const i = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(i, sorted.length - 1))];
}

/**
 * Parse the k6 `--out json` stream. Returns {points, counters, malformed}:
 *  - points: `load_latency` samples {endpoint, class, scenario, ms}
 *  - counters: per-class totals summed from the `load_*` counter points
 *  - malformed: lines that were neither valid JSON nor empty — any
 *    nonzero count makes the run inconclusive
 */
export function parseJsonOut(text) {
  const points = [];
  const counters = {};
  let malformed = 0;
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    let p;
    try {
      p = JSON.parse(t);
    } catch {
      malformed++;
      continue;
    }
    if (p.type !== "Point") continue;
    if (p.metric === "load_latency") {
      points.push({
        endpoint: p.data?.tags?.endpoint ?? null,
        cls: p.data?.tags?.class ?? null,
        scenario: p.data?.tags?.scenario ?? "default",
        ms: Number(p.data?.value),
      });
    } else if (
      /^load_(requests|refusals|http_errors|transport_errors|concealed_refusals|redirects|reauths)$/.test(
        p.metric,
      )
    ) {
      const cls = p.data?.tags?.class;
      const key = `${p.metric}|${cls ?? ""}`;
      counters[key] = (counters[key] ?? 0) + (Number(p.data?.value) || 0);
    }
  }
  return { points, counters, malformed };
}

/** Per-endpoint rows from parsed points. Unclassified stays its own row. */
export function rowsFromPoints(points) {
  const byEp = new Map();
  for (const p of points) {
    const ep = p.endpoint ?? "unknown";
    const cls = p.cls && CLASSES.includes(p.cls) ? p.cls : "unclassified";
    const key = `${p.scenario}:${ep}`;
    const r =
      byEp.get(key) ??
      byEp
        .set(key, {
          scenario: p.scenario,
          endpoint: ep,
          count: 0,
          refused: 0,
          httpErrors: 0,
          transport: 0,
          concealed: 0,
          redirected: 0,
          unclassified: 0,
          latencies: [],
        })
        .get(key);
    r.count++;
    if (cls === "refusal") r.refused++;
    else if (cls === "http_error") r.httpErrors++;
    else if (cls === "transport") r.transport++;
    else if (cls === "concealed_refusal") r.concealed++;
    else if (cls === "redirect") r.redirected++;
    else if (cls === "unclassified") r.unclassified++;
    if (Number.isFinite(p.ms)) r.latencies.push(p.ms);
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

/**
 * Parse the resource sampler NDJSON. Every field the verdict needs is
 * `*Measured`-flagged separately — partial data is inconclusive, never
 * silently green.
 */
export function parseResources(text) {
  const samples = [];
  let malformed = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      samples.push(JSON.parse(line));
    } catch {
      malformed++;
    }
  }
  const peak = (f) => samples.reduce((m, s) => Math.max(m, f(s) ?? 0), 0);
  const measured = (f) =>
    samples.length > 0 && samples.some((s) => f(s) != null);
  return {
    samples: samples.length,
    malformed,
    cpuMeasured: measured((s) => s.appCpuPct) || measured((s) => s.dbCpuPct),
    appCpuMeasured: measured((s) => s.appCpuPct),
    cpuPeakPct: peak((s) => s.appCpuPct) + peak((s) => s.dbCpuPct),
    ramMeasured: measured((s) => s.appRamMb),
    ramPeakMb: peak((s) => s.appRamMb),
    pgMeasured: measured((s) => s.pgConnections),
    pgConnPeak: peak((s) => s.pgConnections),
    pgLimitKnown: measured((s) => s.pgConnLimit),
    pgConnLimit:
      samples.find((s) => s.pgConnLimit != null)?.pgConnLimit ?? null,
    // Restarts: the sampler emits a monotonic restart counter per sample.
    restartsMeasured: measured((s) => s.appRestarts),
    appRestarts: peak((s) => s.appRestarts),
    dbRestarts: peak((s) => s.dbRestarts),
  };
}

/**
 * The verdict. `rows` is the certification scope (caller picks the
 * scenario set); `res` may be null (no resources file → fail closed).
 * `opts.counterCheck` carries the parsed counter cross-check result.
 */
export function verdict(rows, res, durationSec, opts = {}) {
  const checks = [];
  const total = rows.reduce((n, r) => n + r.count, 0);
  const fails = rows.reduce(
    (n, r) =>
      n +
      r.refused +
      r.httpErrors +
      r.transport +
      r.concealed +
      r.redirected +
      r.unclassified,
    0,
  );
  const errorRate = total === 0 ? 0 : fails / total;
  const finite = rows.filter((r) => Number.isFinite(r.p95));
  const worst95 = finite.length ? Math.max(...finite.map((r) => r.p95)) : NaN;
  const worst99 = finite.length ? Math.max(...finite.map((r) => r.p99)) : NaN;
  const slowest = finite.length
    ? finite.find((r) => r.p95 === worst95)?.endpoint
    : "(no measured endpoints)";

  checks.push({ name: "requests measured", pass: total > 0 });
  checks.push({
    name: "every request classified",
    pass: rows.every((r) => r.unclassified === 0) && total > 0,
  });
  checks.push({
    name: "counters agree with latency points",
    pass: opts.counterCheck ?? false,
  });
  checks.push({
    name: "no malformed output lines",
    pass: (opts.malformed ?? 1) === 0,
  });
  checks.push({
    name: "p95 < 400ms per endpoint worst",
    pass: Number.isFinite(worst95) && worst95 < ACCEPTANCE.p95ms,
  });
  checks.push({
    name: "p99 < 1000ms per endpoint worst",
    pass: Number.isFinite(worst99) && worst99 < ACCEPTANCE.p99ms,
  });
  checks.push({
    name: "error rate < 0.5%",
    pass: total > 0 && errorRate < ACCEPTANCE.errorRate,
  });
  checks.push({
    name: "concealed refusals = 0",
    pass: total > 0 && rows.every((r) => r.concealed === 0),
  });

  // Resource coverage — every required measurement or the verdict is inconclusive.
  checks.push({ name: "resources sampled", pass: !!res && res.samples > 0 });
  checks.push({
    name: "no malformed resource samples",
    pass: !!res && res.malformed === 0,
  });
  checks.push({ name: "CPU measured", pass: !!res && res.cpuMeasured });
  checks.push({
    name: "CPU < 70%",
    pass: !!res && res.cpuMeasured && res.cpuPeakPct < ACCEPTANCE.cpuPct,
  });
  checks.push({ name: "RAM measured", pass: !!res && res.ramMeasured });
  checks.push({
    name: "pg connections measured",
    pass: !!res && res.pgMeasured,
  });
  checks.push({
    name: "pg connections under limit",
    pass:
      !!res &&
      res.pgMeasured &&
      res.pgLimitKnown &&
      res.pgConnPeak < res.pgConnLimit,
  });
  checks.push({
    name: "restart signal measured + none observed",
    pass:
      !!res &&
      res.restartsMeasured &&
      res.appRestarts === 0 &&
      res.dbRestarts === 0,
  });
  checks.push({
    name: "500-session hold phase collected",
    pass: !!opts.hold500Collected,
  });

  // First saturated resource: only from measured evidence — the first
  // failing resource check, or "unavailable" when resources are absent.
  const resourceChecks = checks.filter((c) =>
    /CPU|RAM|pg conn|restart/.test(c.name),
  );
  const firstSat =
    res && res.samples > 0
      ? (resourceChecks.find((c) => !c.pass)?.name ?? "none")
      : "unavailable";

  return {
    total,
    fails,
    errorRate,
    rps: durationSec > 0 ? total / durationSec : NaN,
    slowestEndpoint: slowest,
    firstSaturated: firstSat,
    pass: checks.every((c) => c.pass),
    checks,
  };
}

/** Counter cross-check: counter sums must equal latency-derived counts. */
export function counterAgreement(points, counters) {
  const derived = {
    refusal: 0,
    http_error: 0,
    transport: 0,
    concealed_refusal: 0,
    redirect: 0,
  };
  for (const p of points) if (derived[p.cls] !== undefined) derived[p.cls]++;
  const expected = {
    refusal: "load_refusals|",
    http_error: "load_http_errors|",
    transport: "load_transport_errors|",
    concealed_refusal: "load_concealed_refusals|",
    redirect: "load_redirects|",
  };
  for (const [cls, prefix] of Object.entries(expected)) {
    const sum = Object.entries(counters)
      .filter(([k]) => k.startsWith(prefix))
      .reduce((n, [, v]) => n + v, 0);
    if (sum !== derived[cls]) return false;
  }
  return true;
}

function main() {
  const [resultsFile, resourcesFile, durationArg] = process.argv.slice(2);
  if (!resultsFile) {
    console.error(
      "usage: report.mjs <k6 --out-json file> [resources.ndjson] [durationSec]",
    );
    process.exit(2);
  }
  const { points, counters, malformed } = parseJsonOut(
    fs.readFileSync(resultsFile, "utf8"),
  );
  const rows = rowsFromPoints(points);
  const res = resourcesFile
    ? parseResources(fs.readFileSync(resourcesFile, "utf8"))
    : null;
  const durationSec = Number(durationArg) || 0;

  // Per-scenario tables — ramp/hold/soak are reported separately.
  const scenarios = [...new Set(rows.map((r) => r.scenario))];
  for (const sc of scenarios) {
    console.log(`\n[scenario: ${sc}]`);
    console.log("endpoint           count  p50    p95    p99    err%");
    for (const r of rows
      .filter((x) => x.scenario === sc)
      .sort((a, b) => b.p95 - a.p95))
      console.log(
        `${r.endpoint.padEnd(18)} ${String(r.count).padStart(5)}  ${f(r.p50)} ${f(r.p95)} ${f(r.p99)} ${pct(r)}`,
      );
  }

  const hold500Collected = scenarios.includes("hold500");
  const v = verdict(rows, res, durationSec, {
    malformed,
    counterCheck: counterAgreement(points, counters),
    hold500Collected,
  });

  console.log(
    `\ntotal=${v.total} non-success=${v.fails} rate=${(v.errorRate * 100).toFixed(2)}% rps=${Number.isFinite(v.rps) ? v.rps.toFixed(1) : "-"}`,
  );
  if (res)
    console.log(
      `cpuPeak=${res.cpuPeakPct.toFixed(1)}% ramPeak=${res.ramPeakMb}MB pgConn=${res.pgConnPeak}/${res.pgConnLimit ?? "?"} restarts=app:${res.appRestarts}/db:${res.dbRestarts}`,
    );
  else console.log("resources: not supplied — verdict cannot pass");
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
    const bad =
      r.refused +
      r.httpErrors +
      r.transport +
      r.concealed +
      r.redirected +
      r.unclassified;
    return `${((bad / Math.max(1, r.count)) * 100).toFixed(2)}%`;
  }
}

// CLI entry — skipped under unit tests (import only).
if (process.argv[1] && process.argv[1].endsWith("report.mjs")) main();
