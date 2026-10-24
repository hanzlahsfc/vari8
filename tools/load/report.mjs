#!/usr/bin/env node
// K6-GATE report — parses the k6 `--out json` NDJSON stream, the run
// manifest and the resource-sample NDJSON, and reports TWO independent
// verdicts:
//
//   TOOL EXECUTION — complete / incomplete / failed.
//     The planned run is verified against OBSERVED evidence: per-
//     scenario `vus_max` and time extents from the raw stream, exact
//     HTTP accounting (http_reqs == load_requests + setup), counter
//     agreement, endpoint coverage. Manifest assertions alone never
//     prove execution — a one-VU/one-iteration hold500 forgery fails
//     here even when its totals agree.
//
//   CAPACITY ACCEPTANCE — pass / fail / inconclusive.
//     The issue-178 thresholds plus mandatory resource coverage and
//     the 500-session hold phase. Missing acceptance configuration
//     (hold500 never planned/collected) is INCONCLUSIVE — never PASS.
//
// Exit 0 only when execution is COMPLETE and capacity is PASS.

import fs from "node:fs";

import { CLASSES } from "./config.mjs";

export const ACCEPTANCE = {
  p95ms: 400,
  p99ms: 1000,
  errorRate: 0.005, // 0.5 %
  cpuPct: 70, // of whole-host share — see cpuHostSharePct
};

// Phase-execution tolerances (documented, not hidden):
//   - measured scenario duration >= planned * DURATION_TOLERANCE
//   - observed vus_max >= planned VUs * VUS_TOLERANCE
export const DURATION_TOLERANCE = 0.8;
export const VUS_TOLERANCE = 0.9;
// Resource coverage: samples must bracket the run window within
// 2× the declared interval and carry no gap > 3× it; at least
// floor(window/interval) samples, minimum 2.
export const GAP_FACTOR = 3;
export const EDGE_LAG_FACTOR = 2;

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
 * window, scenarioObs}: latency points, per-class counter sums,
 * malformed lines, run window, and per-scenario OBSERVED evidence
 * (point count, time extent, max vus_max).
 */
export function parseJsonOut(text) {
  const points = [];
  const counters = {};
  const scenarioObs = {};
  const vusPoints = []; // {t, v} — k6's global `vus` gauge stream
  let malformed = 0;
  let tMin = Infinity;
  let tMax = -Infinity;
  const obs = (sc, ts) => {
    if (!sc) return null;
    const o =
      scenarioObs[sc] ??
      (scenarioObs[sc] = {
        points: 0,
        tMin: Infinity,
        tMax: -Infinity,
        vusMax: 0,
      });
    if (Number.isFinite(ts)) {
      o.tMin = Math.min(o.tMin, ts);
      o.tMax = Math.max(o.tMax, ts);
    }
    return o;
  };
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
    const sc = p.data?.tags?.scenario ?? "default";
    if (p.metric === "load_latency") {
      const o = obs(sc, ts);
      if (o) o.points++;
      points.push({
        endpoint: p.data?.tags?.endpoint ?? null,
        cls: p.data?.tags?.class ?? null,
        scenario: sc,
        ms: Number(p.data?.value),
      });
    } else if (p.metric === "vus" || p.metric === "vus_max") {
      // k6's built-in concurrency gauges arrive untagged — attribute
      // them to scenarios by time window below.
      if (p.metric === "vus" && Number.isFinite(ts))
        vusPoints.push({ t: ts, v: Number(p.data?.value) || 0 });
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
  for (const o of Object.values(scenarioObs)) {
    o.durationSec = o.tMax > o.tMin ? (o.tMax - o.tMin) / 1000 : 0;
    // Observed concurrency: the maximum `vus` gauge value emitted while
    // this scenario's measured points span. A one-point forgery has a
    // near-zero window and cannot inherit a peak.
    o.vusMax = vusPoints
      .filter((x) => x.t >= o.tMin - 1000 && x.t <= o.tMax + 1000)
      .reduce((m, x) => Math.max(m, x.v), 0);
  }
  return {
    points,
    counters,
    malformed,
    scenarioObs,
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
 * Parse the resource sampler NDJSON. The first line may carry
 * `{type:"meta",intervalSec}` — the DECLARED cadence. Coverage checks
 * use the declared interval (never the observed median): samples must
 * bracket the run window within EDGE_LAG_FACTOR×interval, carry no
 * >GAP_FACTOR×interval gap, and number at least floor(window/interval)
 * (minimum 2). Every required metric is separately *Measured.
 */
export function parseResources(text, runWindow) {
  const samples = [];
  let intervalSec = null;
  let malformed = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const o = JSON.parse(line);
      if (o?.type === "meta") {
        if (typeof o.intervalSec === "number" && o.intervalSec > 0)
          intervalSec = o.intervalSec;
        continue;
      }
      samples.push(o);
    } catch {
      malformed++;
    }
  }
  const peak = (f) => samples.reduce((m, s) => Math.max(m, f(s) ?? 0), 0);
  const measured = (f) =>
    samples.length > 0 && samples.some((s) => f(s) != null);

  const times = samples
    .map((s) => Date.parse(s.ts ?? ""))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  const deltas = times.slice(1).map((t, i) => t - times[i]);
  const hasInterval = intervalSec != null && intervalSec > 0;
  const hasGap =
    hasInterval && deltas.some((d) => d > GAP_FACTOR * intervalSec * 1000);
  const windowSec = runWindow ? (runWindow[1] - runWindow[0]) / 1000 : 0;
  const expectedMin = hasInterval
    ? Math.max(2, Math.floor(windowSec / intervalSec))
    : 2;
  const coversWindow =
    !!runWindow &&
    hasInterval &&
    times.length > 0 &&
    times[0] <= runWindow[0] + EDGE_LAG_FACTOR * intervalSec * 1000 &&
    times.at(-1) >= runWindow[1] - EDGE_LAG_FACTOR * intervalSec * 1000;
  const enoughSamples = hasInterval && times.length >= expectedMin;
  const tsMeasured = times.length === samples.length && samples.length > 0;

  const rawCpuPeak = peak((s) => s.appCpuPct) + peak((s) => s.dbCpuPct);
  const hostCpus = samples.find((s) => s.hostCpus != null)?.hostCpus ?? null;
  return {
    samples: samples.length,
    malformed,
    intervalSec,
    tsMeasured,
    coversWindow,
    hasGap,
    enoughSamples,
    expectedMinSamples: expectedMin,
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
 * Validate the run manifest against the measured points and observed
 * scenario evidence — proves the PLANNED run, not arbitrary points.
 */
export function manifestFailures(manifest, points, counters, scenarioObs = {}) {
  const fails = [];
  if (!manifest || typeof manifest !== "object")
    return ["run manifest missing"];
  if (manifest.tool !== "k6-gate") fails.push("manifest tool mismatch");
  // The manifest must enumerate the planned scenarios AND their specs.
  if (!Array.isArray(manifest.scenarios) || manifest.scenarios.length === 0)
    fails.push("manifest declares no planned scenarios");
  if (!manifest.planned || Object.keys(manifest.planned).length === 0)
    fails.push("manifest carries no planned scenario specs");
  if (!(manifest.iterations > 0)) fails.push("manifest reports no iterations");
  if (!(manifest.loadRequests > 0))
    fails.push("manifest reports no measured requests");
  if (manifest.loadRequests != null && manifest.loadRequests !== points.length)
    fails.push(
      `manifest load_requests=${manifest.loadRequests} != measured points=${points.length}`,
    );
  // Exact HTTP accounting: setup probes + sign-in + session checks +
  // workload + reauth are ALL measured requests; any unexplained
  // surplus/deficit in http_reqs is an unaccounted request.
  const setupReqs = manifest.setupReqs ?? 0;
  if (
    manifest.httpReqs != null &&
    manifest.loadRequests != null &&
    manifest.httpReqs !== manifest.loadRequests + setupReqs
  )
    fails.push(
      `http accounting: http_reqs=${manifest.httpReqs} != load_requests=${manifest.loadRequests} + setup=${setupReqs}`,
    );
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
  // Each planned scenario must be OBSERVED with the planned duration
  // and concurrency — presence of a single tagged point is not proof.
  for (const [name, spec] of Object.entries(manifest.planned ?? {})) {
    const o = scenarioObs[name];
    if (!o || o.points === 0) {
      fails.push(`planned scenario ${name} emitted no measured points`);
      continue;
    }
    if (
      spec.durationSec > 0 &&
      o.durationSec < spec.durationSec * DURATION_TOLERANCE
    )
      fails.push(
        `scenario ${name} ran ${o.durationSec.toFixed(0)}s < planned ${spec.durationSec}s`,
      );
    if (spec.vus > 0 && o.vusMax < spec.vus * VUS_TOLERANCE)
      fails.push(
        `scenario ${name} observed vus_max=${o.vusMax} < planned ${spec.vus}`,
      );
  }
  return fails;
}

/**
 * Two independent verdicts.
 *   execution: "complete" | "incomplete" | "failed"
 *   capacity:  "pass" | "fail" | "inconclusive"
 * Overall PASS requires complete execution AND capacity pass.
 */
export function verdict(rows, res, durationSec, opts = {}) {
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

  const execChecks = [
    { name: "requests measured", pass: total > 0 },
    {
      name: "run manifest + observed phases prove the planned run",
      pass: (opts.manifestFailures ?? ["missing"]).length === 0,
    },
    {
      name: "every request classified",
      pass: rows.every((r) => r.unclassified === 0) && total > 0,
    },
    {
      name: "counters agree with latency points",
      pass: opts.counterCheck ?? false,
    },
    { name: "no malformed output lines", pass: (opts.malformed ?? 1) === 0 },
  ];
  const execution = execChecks.every((c) => c.pass)
    ? "complete"
    : opts.manifestFailures?.length ||
        (opts.malformed ?? 0) > 0 ||
        opts.counterCheck === false
      ? "failed"
      : "incomplete";

  const capChecks = [
    {
      name: "p95 < 400ms per endpoint worst",
      pass: Number.isFinite(worst95) && worst95 < ACCEPTANCE.p95ms,
    },
    {
      name: "p99 < 1000ms per endpoint worst",
      pass: Number.isFinite(worst99) && worst99 < ACCEPTANCE.p99ms,
    },
    {
      name: "error rate < 0.5%",
      pass: total > 0 && errorRate < ACCEPTANCE.errorRate,
    },
    {
      name: "concealed refusals = 0",
      pass: total > 0 && rows.every((r) => r.concealed === 0),
    },
    { name: "resources sampled", pass: !!res && res.samples > 0 },
    {
      name: "no malformed resource samples",
      pass: !!res && res.malformed === 0,
    },
    {
      name: "sampling cadence declared",
      pass: !!res && res.intervalSec != null,
    },
    {
      name: "resource samples cover the run window",
      pass: !!res && res.coversWindow === true,
    },
    { name: "no resource sample gaps", pass: !!res && res.hasGap === false },
    {
      name: "sufficient samples for the window",
      pass: !!res && res.enoughSamples === true,
    },
    { name: "app CPU measured", pass: !!res && res.appCpuMeasured },
    {
      name: "CPU < 70% (host share)",
      pass:
        !!res &&
        res.cpuMeasured &&
        res.cpuHostSharePct != null &&
        res.cpuHostSharePct < ACCEPTANCE.cpuPct,
    },
    { name: "RAM measured", pass: !!res && res.ramMeasured },
    { name: "pg connections measured", pass: !!res && res.pgMeasured },
    {
      name: "pg connections under limit",
      pass:
        !!res &&
        res.pgMeasured &&
        res.pgLimitKnown &&
        res.pgConnPeak < res.pgConnLimit,
    },
    {
      name: "restart signals measured + none observed",
      pass:
        !!res &&
        res.restartsMeasured &&
        res.appRestarts === 0 &&
        res.dbRestarts === 0,
    },
    { name: "500-session hold phase collected", pass: !!opts.hold500Collected },
  ];
  // Measured-failure checks (thresholds/errors/restarts) → fail;
  // missing evidence (resources absent, hold500 uncollected, cadence
  // unknown) → inconclusive. A measured breach beats inconclusive.
  const missingEvidence = capChecks.some(
    (c) =>
      !c.pass &&
      /sampled|cadence|cover|gaps|sufficient|measured|hold phase|malformed resource/.test(
        c.name,
      ),
  );
  const measuredBreach = capChecks.some(
    (c) =>
      !c.pass &&
      /p95|p99|error rate|concealed|CPU <70|under limit|restart signals/.test(
        c.name,
      ),
  );
  const capacity = measuredBreach
    ? "fail"
    : missingEvidence
      ? "inconclusive"
      : capChecks.every((c) => c.pass)
        ? "pass"
        : "inconclusive";

  const checks = [...execChecks, ...capChecks];
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
    execution,
    capacity,
    pass: execution === "complete" && capacity === "pass",
    execChecks,
    capChecks,
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
  const { points, counters, malformed, window, scenarioObs } = parseJsonOut(
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
    ? manifestFailures(manifest, points, counters, scenarioObs)
    : ["run manifest not supplied"];
  // The hold phase counts as collected only when the planned scenario
  // was OBSERVED at its planned concurrency+duration — one tagged point
  // is not a hold.
  const holdObs = scenarioObs.hold500;
  const holdPlan = manifest?.planned?.hold500;
  const hold500Collected =
    !!holdPlan &&
    !!holdObs &&
    holdObs.points > 0 &&
    (!holdPlan.vus || holdObs.vusMax >= holdPlan.vus * VUS_TOLERANCE) &&
    (!holdPlan.durationSec ||
      holdObs.durationSec >= holdPlan.durationSec * DURATION_TOLERANCE);
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
      `cpuPeak=${res.cpuPeakPct.toFixed(1)}% (host share ${res.cpuHostSharePct?.toFixed(1) ?? "?"}/100) ramPeak=${res.ramPeakMb}MB pgConn=${res.pgConnPeak}/${res.pgConnLimit ?? "?"} restarts=app:${res.appRestarts}/db:${res.dbRestarts} interval=${res.intervalSec ?? "?"}s`,
    );
  else console.log("resources: not supplied — capacity inconclusive");
  if (manFails.length)
    for (const f_ of manFails) console.log(`manifest: ${f_}`);
  console.log(
    `slowest: ${v.slowestEndpoint} · first saturated: ${v.firstSaturated}`,
  );
  console.log(`\nTOOL EXECUTION: ${v.execution.toUpperCase()}`);
  for (const c of v.execChecks)
    console.log(`  ${c.pass ? "PASS" : "FAIL"} ${c.name}`);
  console.log(`CAPACITY ACCEPTANCE: ${v.capacity.toUpperCase()}`);
  for (const c of v.capChecks)
    console.log(`  ${c.pass ? "PASS" : "FAIL"} ${c.name}`);
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
