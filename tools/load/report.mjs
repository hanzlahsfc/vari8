#!/usr/bin/env node
// K6-GATE report — parses the k6 `--out json` NDJSON stream, the run
// manifest and the resource-sample NDJSON into the issue-178
// acceptance table (per-scenario per-endpoint p50/p95/p99, error rate,
// rps, CPU/RAM, connections, restarts) and the verdict.
//
// Fail-closed contract (paired with trial-gate.js + config.mjs):
//   - every `load_latency` point MUST carry `class`/`endpoint`/`scenario`
//   - `load_*` counters must agree with the latency-derived classes
//   - the run manifest must prove the PLANNED run: expected workload
//     endpoints present, iterations > 0, load_requests total == the
//     measured point count, http_reqs >= load_requests (auth/setup
//     traffic is accounted, never laundered as workload)
//   - resource coverage must bracket the measured run window with no
//     >3×-median-interval gaps; every required metric (app CPU, app
//     RAM, pg conns+limit, app AND db restart signals) separately
//     measured — partial coverage is inconclusive, never zero
//   - the official verdict requires the 500-session hold phase —
//     `scenario:hold500` rows; absent → "not collected", not PASS

import fs from "node:fs";

import { CLASSES, JSON_ENDPOINTS } from "./config.mjs";

export const ACCEPTANCE = {
  p95ms: 400,
  p99ms: 1000,
  errorRate: 0.005, // 0.5 %
  cpuPct: 70, // of host capacity — see cpuHostSharePct normalization
};

export const FAILURE_CLASSES = new Set([
  "refusal",
  "concealed_refusal",
  "http_error",
  "transport",
  "redirect",
  "unexpected_html",
  "login_page",
  "identity_mismatch",
]);

const CLASS_COUNTERS = {
  refusal: "load_refusals",
  http_error: "load_http_errors",
  transport: "load_transport_errors",
  concealed_refusal: "load_concealed_refusals",
  redirect: "load_redirects",
  unexpected_html: "load_unexpected_html",
  login_page: "load_login_pages",
  identity_mismatch: "load_identity_mismatches",
};

export function percentile(sorted, p) {
  if (sorted.length === 0) return NaN;
  const i = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(i, sorted.length - 1))];
}

/**
 * Parse the k6 `--out json` stream → {points, counters, malformed,
 * window}: latency points, per-class counter sums, malformed line
 * count and the measured run window [startMs,endMs] from point times.
 */
export function parseJsonOut(text) {
  const points = [];
  const counters = {};
  let malformed = 0;
  let tMin = Infinity;
  let tMax = -Infinity;
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
    const ts = Date.parse(p.data?.time ?? "");
    if (Number.isFinite(ts)) {
      tMin = Math.min(tMin, ts);
      tMax = Math.max(tMax, ts);
    }
    if (p.metric === "load_latency") {
      points.push({
        endpoint: p.data?.tags?.endpoint ?? null,
        cls: p.data?.tags?.class ?? null,
        scenario: p.data?.tags?.scenario ?? "default",
        ms: Number(p.data?.value),
      });
    } else if (
      /^load_(requests|refusals|http_errors|transport_errors|concealed_refusals|redirects|unexpected_html|login_pages|identity_mismatches|reauths)$/.test(
        p.metric,
      )
    ) {
      const cls = p.data?.tags?.class;
      const key = `${p.metric}|${cls ?? ""}`;
      counters[key] = (counters[key] ?? 0) + (Number(p.data?.value) || 0);
    }
  }
  return {
    points,
    counters,
    malformed,
    window: tMin <= tMax ? [tMin, tMax] : null,
  };
}

/** Per-endpoint rows. Unclassified stays its own (failing) bucket. */
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
          unexpectedHtml: 0,
          loginPages: 0,
          identityMismatches: 0,
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
    else if (cls === "unexpected_html") r.unexpectedHtml++;
    else if (cls === "login_page") r.loginPages++;
    else if (cls === "identity_mismatch") r.identityMismatches++;
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
 * `*Measured`-flagged separately. `ts` coverage is checked against the
 * measured run window: samples must bracket it and carry no
 * >3×-median-interval gaps (suspension/stale data is not coverage).
 */
export function parseResources(text, runWindow) {
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

  // Time coverage: sort samples, median interval, gap > 3× median → gap.
  const times = samples
    .map((s) => Date.parse(s.ts ?? ""))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  const deltas = times.slice(1).map((t, i) => t - times[i]);
  const medianDelta = deltas.length
    ? deltas.slice().sort((a, b) => a - b)[Math.floor(deltas.length / 2)]
    : 0;
  const maxGap = deltas.length ? Math.max(...deltas) : 0;
  const hasGap =
    deltas.length > 0 && medianDelta > 0 && maxGap > 3 * medianDelta;
  const coversWindow =
    !!runWindow &&
    times.length > 0 &&
    times[0] <= runWindow[0] + 15_000 &&
    times.at(-1) >= runWindow[1] - 15_000;
  const tsMeasured = times.length === samples.length && samples.length > 0;

  const rawCpuPeak = peak((s) => s.appCpuPct) + peak((s) => s.dbCpuPct);
  const hostCpus = samples.find((s) => s.hostCpus != null)?.hostCpus ?? null;
  return {
    samples: samples.length,
    malformed,
    tsMeasured,
    coversWindow,
    hasGap,
    appCpuMeasured: measured((s) => s.appCpuPct),
    dbCpuMeasured: measured((s) => s.dbCpuPct),
    cpuMeasured: measured((s) => s.appCpuPct) && measured((s) => s.dbCpuPct),
    cpuPeakPct: rawCpuPeak,
    hostCpus,
    // CPU denominator: docker CPUPerc / cputime-delta units where
    // 100% == one host core; hostSharePct normalizes to whole-host %.
    cpuHostSharePct: hostCpus ? rawCpuPeak / hostCpus : null,
    ramMeasured: measured((s) => s.appRamMb),
    ramPeakMb: peak((s) => s.appRamMb),
    pgMeasured: measured((s) => s.pgConnections),
    pgConnPeak: peak((s) => s.pgConnections),
    pgLimitKnown: measured((s) => s.pgConnLimit),
    pgConnLimit:
      samples.find((s) => s.pgConnLimit != null)?.pgConnLimit ?? null,
    appRestartsMeasured: measured((s) => s.appRestarts),
    dbRestartsMeasured: measured((s) => s.dbRestarts),
    restartsMeasured:
      measured((s) => s.appRestarts) && measured((s) => s.dbRestarts),
    appRestarts: peak((s) => s.appRestarts),
    dbRestarts: peak((s) => s.dbRestarts),
  };
}

/** Counter cross-check: counter sums must equal latency-derived counts. */
export function counterAgreement(points, counters) {
  const derived = {};
  for (const cls of Object.keys(CLASS_COUNTERS)) derived[cls] = 0;
  for (const p of points) if (derived[p.cls] !== undefined) derived[p.cls]++;
  for (const [cls, metric] of Object.entries(CLASS_COUNTERS)) {
    const sum = Object.entries(counters)
      .filter(([k]) => k.startsWith(`${metric}|`))
      .reduce((n, [, v]) => n + v, 0);
    if (sum !== derived[cls]) return false;
  }
  return true;
}

/**
 * Validate the run manifest against the measured points — proves the
 * PLANNED run happened, not that arbitrary points exist.
 * Returns a list of failure strings (empty = manifest sound).
 */
export function manifestFailures(manifest, points, counters) {
  const fails = [];
  if (!manifest || typeof manifest !== "object")
    return ["run manifest missing"];
  if (manifest.tool !== "k6-gate") fails.push("manifest tool mismatch");
  if (!(manifest.iterations > 0)) fails.push("manifest reports no iterations");
  if (!(manifest.loadRequests > 0))
    fails.push("manifest reports no measured requests");
  if (manifest.loadRequests != null && manifest.loadRequests !== points.length)
    fails.push(
      `manifest load_requests=${manifest.loadRequests} != measured points=${points.length}`,
    );
  if (
    manifest.httpReqs != null &&
    manifest.loadRequests != null &&
    manifest.httpReqs < manifest.loadRequests
  )
    fails.push("manifest http_reqs < load_requests — accounting impossible");
  const loadReqCounter = Object.entries(counters)
    .filter(([k]) => k.startsWith("load_requests|"))
    .reduce((n, [, v]) => n + v, 0);
  if (loadReqCounter !== points.length)
    fails.push(
      `load_requests counter=${loadReqCounter} != measured points=${points.length}`,
    );
  // Expected workload endpoints must appear — auth/setup traffic can
  // never satisfy workload coverage.
  const measuredEps = new Set(points.map((p) => p.endpoint));
  for (const ep of manifest.expectedWorkloadEndpoints ?? [])
    if (!measuredEps.has(ep))
      fails.push(`expected workload endpoint ${ep} absent`);
  // Expected scenarios must have emitted points.
  const measuredScenarios = new Set(points.map((p) => p.scenario));
  for (const sc of manifest.scenarios ?? [])
    if (!measuredScenarios.has(sc))
      fails.push(`planned scenario ${sc} emitted no points`);
  return fails;
}

/**
 * The verdict. `rows` is the full measured scope; `res` may be null;
 * `opts` carries malformed count, counter agreement, manifest failures
 * and whether the 500-hold phase was collected.
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
      r.unexpectedHtml +
      r.loginPages +
      r.identityMismatches +
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
    name: "run manifest proves the planned run",
    pass: (opts.manifestFailures ?? ["missing"]).length === 0,
  });
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

  // Resource coverage — every required measurement or inconclusive.
  checks.push({ name: "resources sampled", pass: !!res && res.samples > 0 });
  checks.push({
    name: "no malformed resource samples",
    pass: !!res && res.malformed === 0,
  });
  checks.push({
    name: "resource samples cover the run window",
    pass: !!res && res.coversWindow === true,
  });
  checks.push({
    name: "no resource sample gaps",
    pass: !!res && res.hasGap === false,
  });
  checks.push({ name: "app CPU measured", pass: !!res && res.appCpuMeasured });
  checks.push({
    name: "CPU < 70% (host share)",
    pass:
      !!res &&
      res.cpuMeasured &&
      res.cpuHostSharePct != null &&
      res.cpuHostSharePct < ACCEPTANCE.cpuPct,
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
    name: "restart signals measured + none observed",
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

function main() {
  const [resultsFile, resourcesFile, manifestFile, durationArg] =
    process.argv.slice(2);
  if (!resultsFile) {
    console.error(
      "usage: report.mjs <k6 --out-json file> [resources.ndjson] [manifest.json] [durationSec]",
    );
    process.exit(2);
  }
  const { points, counters, malformed, window } = parseJsonOut(
    fs.readFileSync(resultsFile, "utf8"),
  );
  const rows = rowsFromPoints(points);
  const res = resourcesFile
    ? parseResources(fs.readFileSync(resourcesFile, "utf8"), window)
    : null;
  const manifest = manifestFile
    ? JSON.parse(fs.readFileSync(manifestFile, "utf8"))
    : null;
  const durationSec = Number(durationArg) || 0;

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

  const manFails = manifest
    ? manifestFailures(manifest, points, counters)
    : ["run manifest not supplied"];
  const hold500Collected = scenarios.includes("hold500");
  const v = verdict(rows, res, durationSec, {
    malformed,
    counterCheck: counterAgreement(points, counters),
    manifestFailures: manFails,
    hold500Collected,
  });

  console.log(
    `\ntotal=${v.total} non-success=${v.fails} rate=${(v.errorRate * 100).toFixed(2)}% rps=${Number.isFinite(v.rps) ? v.rps.toFixed(1) : "-"}`,
  );
  if (res)
    console.log(
      `cpuPeak=${res.cpuPeakPct.toFixed(1)}% (host share ${res.cpuHostSharePct?.toFixed(1) ?? "?"}/100) ramPeak=${res.ramPeakMb}MB pgConn=${res.pgConnPeak}/${res.pgConnLimit ?? "?"} restarts=app:${res.appRestarts}/db:${res.dbRestarts}`,
    );
  else console.log("resources: not supplied — verdict cannot pass");
  if (manFails.length)
    for (const f_ of manFails) console.log(`manifest: ${f_}`);
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
      r.unexpectedHtml +
      r.loginPages +
      r.identityMismatches +
      r.unclassified;
    return `${((bad / Math.max(1, r.count)) * 100).toFixed(2)}%`;
  }
}

if (process.argv[1] && process.argv[1].endsWith("report.mjs")) main();
