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

// Phase-execution rules (documented; NOT tolerances for PASS):
//   - a scenario's measured points must cover its PLANNED window
//     [startTime, startTime+duration] within PHASE_EDGE_SEC of both
//     edges, with no interior point gap > PHASE_POINT_GAP_SEC
//   - constant-vus phases (hold500): every `vus` gauge sample strictly
//     inside the window (excluding EDGE drain) must be >= planned VUs —
//     constant-vus guarantees exactly N, so a deficit is a real miss
//   - ramping phases carry no VU-level requirement (concurrency varies
//     by design); insufficient telemetry → INCONCLUSIVE, never PASS
export const PHASE_EDGE_SEC = 10;
export const PHASE_POINT_GAP_SEC = 30;
export const VUS_EDGE_SEC = 5;
// Resource coverage: the sampler's declared interval must equal the
// expected cadence supplied by the RUN CONFIG (never the file's own
// word); samples bracket the window within 2× interval, no gap > 3×,
// count >= floor(window/interval) (min 2), timestamps strictly
// increasing, and every mandatory metric present in a MAJORITY (>50%)
// of samples — transient collection errors are tolerated, sustained
// absence is not.
export const GAP_FACTOR = 3;
export const EDGE_LAG_FACTOR = 2;
export const METRIC_COVERAGE = 0.5;
// Non-measured requests the contract permits: the /login origin probe
// in setup() plus at most one retry. Anything more is unexplained.
export const MAX_SETUP_REQS = 2;

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
  let httpReqsObserved = 0; // raw request evidence, independent of tags
  const httpReqUrls = new Set();
  let malformed = 0;
  let tMin = Infinity;
  let tMax = -Infinity;
  const obs = (sc, ts) => {
    if (!sc) return null;
    const o =
      scenarioObs[sc] ??
      (scenarioObs[sc] = {
        points: 0,
        pointTimes: [],
        tMin: Infinity,
        tMax: -Infinity,
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
    if (p.metric === "http_reqs") {
      // Raw request evidence — every real request, tagged by URL.
      httpReqsObserved += Number(p.data?.value) || 0;
      httpReqUrls.add(p.data?.tags?.url ?? p.data?.tags?.name ?? "?");
    } else if (p.metric === "load_latency") {
      const o = obs(sc, ts);
      if (o) {
        o.points++;
        if (Number.isFinite(ts)) o.pointTimes.push(ts);
      }
      points.push({
        endpoint: p.data?.tags?.endpoint ?? null,
        cls: p.data?.tags?.class ?? null,
        scenario: sc,
        ms: Number(p.data?.value),
        ts,
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
  for (const o of Object.values(scenarioObs))
    o.durationSec = o.tMax > o.tMin ? (o.tMax - o.tMin) / 1000 : 0;
  return {
    points,
    counters,
    malformed,
    scenarioObs,
    vusPoints,
    httpReqsObserved,
    httpReqUrls,
    window: tMin <= tMax ? [tMin, tMax] : null,
  };
}

/**
 * Verify a planned scenario against OBSERVED stream evidence.
 * `planned` = {vus, durationSec, startTimeSec, executor} and
 * `obs` = {points, pointTimes[]} plus the global vus series and the
 * run's first point time (window origin). Returns failure strings.
 */
export function phaseFailures(name, planned, obs, vusPoints, runStartMs) {
  const fails = [];
  if (!obs || obs.pointTimes.length === 0) {
    return [`planned scenario ${name} emitted no measured points`];
  }
  const startMs = runStartMs + planned.startTimeSec * 1000;
  const endMs = startMs + planned.durationSec * 1000;
  const edge = PHASE_EDGE_SEC * 1000;
  const times = obs.pointTimes.slice().sort((a, b) => a - b);
  const first = times[0];
  const last = times.at(-1);
  // Coverage of the PLANNED window — point extent, not assertions.
  if (first > startMs + edge)
    fails.push(
      `scenario ${name}: first point ${((first - startMs) / 1000).toFixed(0)}s after planned start`,
    );
  if (last < endMs - edge)
    fails.push(
      `scenario ${name}: last point ${((endMs - last) / 1000).toFixed(0)}s before planned end`,
    );
  // Continuity: no unaccounted silence inside the window.
  for (let i = 1; i < times.length; i++) {
    if (times[i] - times[i - 1] > PHASE_POINT_GAP_SEC * 1000) {
      fails.push(
        `scenario ${name}: ${((times[i] - times[i - 1]) / 1000).toFixed(0)}s gap in measured points`,
      );
      break;
    }
  }
  // Concurrency: constant-vus phases guarantee exactly N VUs — every
  // gauge sample strictly inside the window must agree. A single peak
  // never proves a sustained hold.
  if (planned.executor === "constant-vus" && planned.vus > 0) {
    const inner = vusPoints.filter(
      (x) =>
        x.t >= startMs + VUS_EDGE_SEC * 1000 &&
        x.t <= endMs - VUS_EDGE_SEC * 1000,
    );
    if (inner.length === 0)
      fails.push(
        `scenario ${name}: no concurrency samples inside the hold window`,
      );
    else {
      const below = inner.filter((x) => x.v < planned.vus).length;
      if (below > 0)
        fails.push(
          `scenario ${name}: ${below}/${inner.length} concurrency samples below planned ${planned.vus} — no sustained hold`,
        );
    }
  }
  return fails;
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
/**
 * @param {string} text
 * @param {[number, number] | null} runWindow
 * @param {number | null} [expectedIntervalSec] — cadence from run config
 */
export function parseResources(text, runWindow, expectedIntervalSec = null) {
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
  // Per-metric coverage: present in a majority (>50%) of samples —
  // transient collection errors tolerated, first-sample-only refused.
  const metricCovered = (f) =>
    samples.length > 0 &&
    samples.filter((s) => f(s) != null).length >
      samples.length * METRIC_COVERAGE;

  const times = samples
    .map((s) => Date.parse(s.ts ?? ""))
    .filter((t) => Number.isFinite(t));
  const ordered =
    times.length === samples.length &&
    times.every((t, i) => i === 0 || t > times[i - 1]);
  const deltas = times.slice(1).map((t, i) => t - times[i]);
  // The declared cadence must equal the run config's expected cadence —
  // the file cannot authorize its own sampling standard.
  const intervalValid =
    expectedIntervalSec != null &&
    intervalSec != null &&
    intervalSec === expectedIntervalSec;
  const hasGap =
    intervalValid && deltas.some((d) => d > GAP_FACTOR * intervalSec * 1000);
  const windowSec = runWindow ? (runWindow[1] - runWindow[0]) / 1000 : 0;
  const expectedMin = intervalValid
    ? Math.max(2, Math.floor(windowSec / intervalSec))
    : 2;
  const coversWindow =
    !!runWindow &&
    intervalValid &&
    times.length > 0 &&
    times[0] <= runWindow[0] + EDGE_LAG_FACTOR * intervalSec * 1000 &&
    times.at(-1) >= runWindow[1] - EDGE_LAG_FACTOR * intervalSec * 1000;
  const enoughSamples = intervalValid && times.length >= expectedMin;
  const tsMeasured = times.length === samples.length && samples.length > 0;

  const rawCpuPeak = peak((s) => s.appCpuPct) + peak((s) => s.dbCpuPct);
  const hostCpus = samples.find((s) => s.hostCpus != null)?.hostCpus ?? null;
  return {
    samples: samples.length,
    malformed,
    intervalSec,
    intervalValid,
    ordered,
    tsMeasured,
    coversWindow,
    hasGap,
    enoughSamples,
    expectedMinSamples: expectedMin,
    appCpuMeasured: metricCovered((s) => s.appCpuPct),
    dbCpuMeasured: metricCovered((s) => s.dbCpuPct),
    cpuMeasured:
      metricCovered((s) => s.appCpuPct) && metricCovered((s) => s.dbCpuPct),
    cpuPeakPct: rawCpuPeak,
    hostCpus,
    // CPU denominator: docker CPUPerc / cputime-delta units where
    // 100% == one host core; hostSharePct normalizes to whole-host %.
    cpuHostSharePct: hostCpus ? rawCpuPeak / hostCpus : null,
    ramMeasured: metricCovered((s) => s.appRamMb),
    ramPeakMb: peak((s) => s.appRamMb),
    pgMeasured: metricCovered((s) => s.pgConnections),
    pgConnPeak: peak((s) => s.pgConnections),
    pgLimitKnown: metricCovered((s) => s.pgConnLimit),
    pgConnLimit:
      samples.find((s) => s.pgConnLimit != null)?.pgConnLimit ?? null,
    appRestartsMeasured: metricCovered((s) => s.appRestarts),
    dbRestartsMeasured: metricCovered((s) => s.dbRestarts),
    restartsMeasured:
      metricCovered((s) => s.appRestarts) && metricCovered((s) => s.dbRestarts),
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
/**
 * @param {object | null} manifest
 * @param {Array<object>} points — parsed load_latency points (with ts)
 * @param {Record<string, number>} counters
 * @param {Record<string, object>} [scenarioObs] — observed per-scenario evidence
 * @param {Array<{t: number, v: number}>} [vusPoints] — global vus stream
 * @param {number | null} [observedHttpReqs] — raw http_reqs point count
 */
export function manifestFailures(
  manifest,
  points,
  counters,
  scenarioObs = {},
  vusPoints = [],
  observedHttpReqs = null,
) {
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
  // Exact HTTP accounting against the RAW stream — the manifest's own
  // http_reqs field is a claim, not evidence. `httpReqsObserved` counts
  // real `http_reqs` points; `setupReqs` is the manifest's declared
  // setup traffic and is itself bounded (the /login probe only).
  const setupReqs = manifest.setupReqs ?? 0;
  if (!(setupReqs >= 0 && setupReqs <= MAX_SETUP_REQS))
    fails.push(
      `declared setupReqs=${setupReqs} exceeds the bounded setup (${MAX_SETUP_REQS}) — it cannot absorb unexplained requests`,
    );
  if (
    observedHttpReqs != null &&
    manifest.httpReqs != null &&
    manifest.httpReqs !== observedHttpReqs
  )
    fails.push(
      `manifest http_reqs=${manifest.httpReqs} != raw http_reqs points=${observedHttpReqs}`,
    );
  if (
    observedHttpReqs != null &&
    observedHttpReqs !== points.length + setupReqs
  )
    fails.push(
      `http accounting: raw http_reqs=${observedHttpReqs} != measured=${points.length} + setup=${setupReqs} — unexplained requests`,
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
  // Each planned scenario verified against OBSERVED window coverage,
  // continuity and sustained concurrency — not manifest assertions.
  const runStart = points.length
    ? Math.min(...points.map((p) => p.ts ?? Infinity))
    : NaN;
  for (const [name, spec] of Object.entries(manifest.planned ?? {})) {
    const o = scenarioObs[name];
    if (!Number.isFinite(runStart)) {
      fails.push(`planned scenario ${name}: no measured run window`);
      continue;
    }
    fails.push(
      ...phaseFailures(name, spec, o, vusPoints, runStart).map(
        (f) => `phase ${f}`,
      ),
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
      name: "sampling cadence authorized by run config",
      pass: !!res && res.intervalValid === true,
    },
    {
      name: "sample timestamps strictly increasing",
      pass: !!res && res.ordered === true,
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
      /sampled|cadence|cover|gaps|sufficient|measured|hold phase|malformed resource|timestamps|increasing/.test(
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
  const {
    points,
    counters,
    malformed,
    window,
    scenarioObs,
    vusPoints,
    httpReqsObserved,
  } = parseJsonOut(fs.readFileSync(resultsFile, "utf8"));
  const rows = rowsFromPoints(points);
  // The expected collector cadence comes from the RUN CONFIG — the
  // resource file's own meta line cannot authorize its own standard.
  const expectedInterval = Number(process.env.LOAD_RESOURCE_INTERVAL_S) || null;
  const res = resourcesFile
    ? parseResources(
        fs.readFileSync(resourcesFile, "utf8"),
        window,
        expectedInterval,
      )
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
    ? manifestFailures(
        manifest,
        points,
        counters,
        scenarioObs,
        vusPoints,
        httpReqsObserved,
      )
    : ["run manifest not supplied"];
  // The hold phase is "collected" only when the planned constant-vus
  // scenario passed the window/continuity/concurrency checks — a single
  // tagged point or brief spike is not a sustained hold.
  const holdPlan = manifest?.planned?.hold500;
  const hold500Collected =
    !!holdPlan &&
    points.length > 0 &&
    phaseFailures(
      "hold500",
      holdPlan,
      scenarioObs.hold500 ?? { points: 0, pointTimes: [] },
      vusPoints,
      Math.min(...points.map((p) => p.ts ?? Infinity)),
    ).length === 0;
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
  console.log(
    `CAPACITY ACCEPTANCE: ${v.capacity.toUpperCase()} (local instrumentation — not staging certification)`,
  );
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
