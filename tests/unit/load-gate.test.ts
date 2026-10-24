// K6-GATE (issue #178) — the workload contract, response classification
// and the dual-verdict report. Every false-PASS probe from all three
// reviews is a regression here: unclassified points, concealed/state
// refusals, HTML/login 200s, wrong identity, auth-only and one-point
// runs, hold500 forgery, unexplained http surplus, sparse/gapped/
// single-sample resources, disabled remote, shared/forged DB lanes.

import { describe, expect, it } from "vitest";

import {
  buildManifest,
  classifyResponse,
  configError,
  durationToSec,
  memToMb,
  scenariosWithBounds,
  verifyIdentity,
} from "../../tools/load/config.mjs";
import {
  ACCEPTANCE,
  counterAgreement,
  manifestFailures,
  parseJsonOut,
  parseResources,
  percentile,
  rowsFromPoints,
  verdict,
} from "../../tools/load/report.mjs";

const FIXTURES = {
  workspaceId: "ws1",
  targetId: "loadgate-x",
  coaches: [{ email: "c@loadgate.invalid", password: "x", userId: "u1" }],
  clients: [{ email: "k@loadgate.invalid", password: "x", userId: "u2" }],
};

const T0 = Date.parse("2026-10-24T04:24:00Z");

function point(
  endpoint: string,
  cls: string,
  ms: number,
  scenario = "smoke",
  t = 0,
) {
  return {
    type: "Point",
    metric: "load_latency",
    data: {
      tags: { endpoint, class: cls, scenario },
      value: ms,
      time: new Date(T0 + t * 1000).toISOString(),
    },
  };
}

function counterPoint(metric: string, cls: string, n: number) {
  return {
    type: "Point",
    metric,
    data: {
      tags: { class: cls },
      value: n,
      time: new Date(T0).toISOString(),
    },
  };
}

function row(over = {}) {
  return {
    scenario: "smoke",
    endpoint: "session",
    count: 100,
    refused: 0,
    httpErrors: 0,
    transport: 0,
    concealed: 0,
    redirected: 0,
    unexpectedHtml: 0,
    loginPages: 0,
    identityMismatches: 0,
    unclassified: 0,
    p50: 10,
    p95: 100,
    p99: 200,
    ...over,
  };
}

function fullResources(over = {}) {
  return {
    samples: 8,
    malformed: 0,
    intervalSec: 5,
    tsMeasured: true,
    coversWindow: true,
    hasGap: false,
    enoughSamples: true,
    expectedMinSamples: 6,
    appCpuMeasured: true,
    dbCpuMeasured: true,
    cpuMeasured: true,
    cpuPeakPct: 50,
    hostCpus: 8,
    cpuHostSharePct: 6.25,
    ramMeasured: true,
    ramPeakMb: 500,
    pgMeasured: true,
    pgConnPeak: 10,
    pgLimitKnown: true,
    pgConnLimit: 100,
    appRestartsMeasured: true,
    dbRestartsMeasured: true,
    restartsMeasured: true,
    appRestarts: 0,
    dbRestarts: 0,
    ...over,
  };
}

function cleanManifest(over = {}) {
  return {
    tool: "k6-gate",
    profile: "smoke",
    targetUrl: "https://127.0.0.1:3870",
    workspaceId: "ws1",
    scenarios: ["smoke"],
    planned: { smoke: { vus: 5, durationSec: 30 } },
    expectedWorkloadEndpoints: ["session", "clients"],
    authEndpoints: ["sign_in", "session_verify", "reauth"],
    setupReqs: 1,
    iterations: 10,
    vusMax: 5,
    httpReqs: 101,
    loadRequests: 100,
    testRunDurationMs: 30000,
    ...over,
  };
}

describe("K6-GATE classifyResponse — the shared contract", () => {
  it("2xx with a refusal body is concealed, never success", () => {
    expect(classifyResponse(200, null, { error: { code: "forbidden" } })).toBe(
      "concealed_refusal",
    );
    expect(classifyResponse(200, null, { ok: false })).toBe(
      "concealed_refusal",
    );
    expect(classifyResponse(200, null, { state: "DENIED" })).toBe(
      "concealed_refusal",
    );
    expect(classifyResponse(200, null, { state: "consent_missing" })).toBe(
      "concealed_refusal",
    );
  });
  it("non-2xx structured/state denial is a refusal", () => {
    expect(classifyResponse(403, null, { error: { code: "forbidden" } })).toBe(
      "refusal",
    );
    expect(classifyResponse(409, null, { state: "not_available" })).toBe(
      "refusal",
    );
    expect(classifyResponse(403, null, { state: "consent_missing" })).toBe(
      "refusal",
    );
  });
  it("redirects are their own class — never success or error", () => {
    expect(classifyResponse(307, null, null)).toBe("redirect");
    expect(classifyResponse(302, null, { error: {} })).toBe("redirect");
  });
  it("JSON-expected endpoints reject HTML/non-JSON 200s", () => {
    expect(classifyResponse(200, null, null, { expectJson: true })).toBe(
      "unexpected_html",
    );
    expect(
      classifyResponse(200, null, { user: {} }, { expectJson: true }),
    ).toBe("success");
  });
  it("a served login page is never a page success", () => {
    expect(classifyResponse(200, null, null, { looksLikeLogin: true })).toBe(
      "login_page",
    );
  });
  it("clean page 2xx (html, not login) is success; transport is status-0", () => {
    expect(classifyResponse(200, null, null)).toBe("success");
    expect(classifyResponse(0, null, null)).toBe("transport");
    expect(classifyResponse(0, "conn refused", null)).toBe("transport");
    expect(classifyResponse(500, null, {})).toBe("http_error");
  });
  it("ongoing identity: a 200 naming the wrong user is failure", () => {
    expect(
      classifyResponse(
        200,
        null,
        { user: { id: "other" } },
        { expectJson: true, expectUserId: "u1" },
      ),
    ).toBe("identity_mismatch");
    expect(
      classifyResponse(
        200,
        null,
        {},
        {
          expectJson: true,
          expectUserId: "u1",
        },
      ),
    ).toBe("identity_mismatch");
    expect(
      classifyResponse(
        200,
        null,
        { user: { id: "u1" } },
        {
          expectJson: true,
          expectUserId: "u1",
        },
      ),
    ).toBe("success");
    expect(verifyIdentity(200, { user: { id: "other" } }, "u1")).toBe(
      "identity_mismatch",
    );
  });
});

describe("K6-GATE config — target + bounds safety", () => {
  const env = (o = {}) => ({
    TARGET_URL: "https://127.0.0.1:3870",
    LOAD_PROFILE: "smoke",
    ...o,
  });

  it("refuses missing/relative targets", () => {
    expect(configError(env({ TARGET_URL: "" }), FIXTURES)).toMatch(/required/);
    expect(configError(env({ TARGET_URL: "notaurl" }), FIXTURES)).toMatch(
      /absolute/,
    );
  });
  it("remote is DISABLED — no flag can re-enable it", () => {
    expect(
      configError(env({ TARGET_URL: "https://vari8.example.com" }), FIXTURES),
    ).toMatch(/disabled/);
    expect(
      configError(
        env({
          TARGET_URL: "https://production.example.com",
          LOAD_ALLOW_REMOTE: "1",
          LOAD_TARGET_ID: "loadgate-x",
        }),
        FIXTURES,
      ),
    ).toMatch(/disabled/);
  });
  it("NaN / malformed LOAD_MAX_VUS aborts — it cannot bypass the cap", () => {
    expect(configError(env({ LOAD_MAX_VUS: "NaN" }), FIXTURES)).toMatch(
      /finite/,
    );
    expect(configError(env({ LOAD_MAX_VUS: "abc" }), FIXTURES)).toMatch(
      /finite/,
    );
    expect(configError(env({ LOAD_MAX_VUS: "0" }), FIXTURES)).toMatch(/finite/);
    expect(configError(env({ LOAD_MAX_VUS: "3.7" }), FIXTURES)).toMatch(
      /finite/,
    );
  });
  it("the gate REQUIRES LOAD_HOLD500_MIN — unresolved decision exposed", () => {
    expect(configError(env({ LOAD_PROFILE: "gate" }), FIXTURES)).toMatch(
      /LOAD_HOLD500_MIN/,
    );
    expect(
      configError(
        env({ LOAD_PROFILE: "gate", LOAD_HOLD500_MIN: "0" }),
        FIXTURES,
      ),
    ).toMatch(/LOAD_HOLD500_MIN/);
    expect(
      configError(
        env({ LOAD_PROFILE: "gate", LOAD_HOLD500_MIN: "30" }),
        FIXTURES,
      ),
    ).toBeNull();
  });
  it("durationToSec parses and rejects malformed", () => {
    expect(durationToSec("10m")).toBe(600);
    expect(durationToSec("30s")).toBe(30);
    expect(durationToSec("1h30m")).toBe(5400);
    expect(() => durationToSec("abc")).toThrow();
    expect(() => durationToSec("")).toThrow();
  });
  it("buildManifest derives planned specs from the configured profile", () => {
    const m = buildManifest({
      profile: "gate",
      targetUrl: "https://127.0.0.1:1",
      workspaceId: "w",
      scenarios: scenariosWithBounds({
        LOAD_PROFILE: "gate",
        LOAD_HOLD500_MIN: "30",
      }),
      metrics: {},
      setupReqs: 1,
    });
    const planned = m.planned as Record<
      string,
      { vus: number; durationSec: number }
    >;
    expect(m.scenarios).toEqual(["ramp", "hold500", "soak"]);
    expect(planned.hold500).toEqual({ vus: 500, durationSec: 1800 });
    expect(planned.ramp.durationSec).toBe(600);
    expect(planned.soak.vus).toBe(250);
  });
});

describe("K6-GATE report — execution + capacity dual verdicts", () => {
  it("percentile picks the nearest-rank element", () => {
    const xs = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(xs, 50)).toBe(50);
    expect(percentile(xs, 95)).toBe(100);
    expect(percentile([], 95)).toBeNaN();
  });

  const vOk = (
    rows: ReturnType<typeof row>[],
    res: ReturnType<typeof fullResources> | null = fullResources(),
    over = {},
  ) =>
    verdict(rows, res ?? undefined, 10, {
      malformed: 0,
      counterCheck: true,
      manifestFailures: [],
      hold500Collected: true,
      ...over,
    });

  it("a clean complete run: execution COMPLETE + capacity PASS → PASS", () => {
    const v = vOk([row()]);
    expect(v.execution).toBe("complete");
    expect(v.capacity).toBe("pass");
    expect(v.pass).toBe(true);
    expect(v.slowestEndpoint).toBe("session");
  });

  it("bounded smoke: execution complete + capacity INCONCLUSIVE (no hold500)", () => {
    const v = vOk([row()], fullResources(), { hold500Collected: false });
    expect(v.execution).toBe("complete");
    expect(v.capacity).toBe("inconclusive");
    expect(v.pass).toBe(false);
  });

  it("measured breaches are capacity FAIL, not inconclusive", () => {
    const v = vOk([row({ p95: 500 })], fullResources(), {
      hold500Collected: false,
    });
    expect(v.capacity).toBe("fail");
    expect(v.pass).toBe(false);
  });

  it("manifest problems are execution FAILED — never capacity pass", () => {
    const v = vOk([row()], fullResources(), {
      manifestFailures: ["http accounting"],
    });
    expect(v.execution).toBe("failed");
    expect(v.pass).toBe(false);
  });

  it("the reviewer's failing run shape fails with correct totals", () => {
    const raw = [
      ...Array(30).fill(point("session", "refusal", 40)),
      ...Array(10).fill(point("clients", "refusal", 45)),
      ...Array(20).fill(point("client_home", "redirect", 8)),
      ...Array(20).fill(point("client_daily", "redirect", 8)),
      ...Array(20).fill(point("checkins_page", "redirect", 8)),
      ...Array(10).fill(point("workspace_page", "redirect", 8)),
      ...Array(5).fill(point("sign_in", "success", 60)),
      ...Array(5).fill(point("session", "success", 5)),
      ...Array(4).fill(point("client_home", "success", 9)),
      ...Array(4).fill(point("client_daily", "success", 9)),
      ...Array(4).fill(point("checkins_page", "success", 9)),
      ...Array(1).fill(point("workspace_page", "success", 9)),
      ...Array(1).fill(point("clients", "success", 9)),
    ]
      .map((p) => JSON.stringify(p))
      .join("\n");
    const { points: pts } = parseJsonOut(raw);
    const rows = rowsFromPoints(pts);
    const totals = rows.reduce(
      (a, r) => ({
        count: a.count + r.count,
        refused: a.refused + r.refused,
        redirected: a.redirected + r.redirected,
      }),
      { count: 0, refused: 0, redirected: 0 },
    );
    expect(totals).toEqual({ count: 134, refused: 40, redirected: 70 });
    const v = vOk(rows, fullResources(), { hold500Collected: false });
    expect(v.pass).toBe(false);
    expect(v.capacity).toBe("fail");
    expect(v.errorRate).toBeCloseTo(110 / 134);
  });

  it("unknown/missing class tags are unclassified — and FAIL", () => {
    const rows = rowsFromPoints([
      { endpoint: "session", cls: null, scenario: "smoke", ms: 5 },
      { endpoint: "session", cls: "success", scenario: "smoke", ms: 5 },
    ]);
    expect(rows[0].unclassified).toBe(1);
    expect(vOk(rows).pass).toBe(false);
  });

  it("counter disagreement makes the run inconclusive", () => {
    const raw = [
      JSON.stringify(point("session", "refusal", 10)),
      JSON.stringify(point("session", "success", 5)),
      JSON.stringify(counterPoint("load_refusals", "refusal", 0)),
    ].join("\n");
    const { points: pts, counters } = parseJsonOut(raw);
    expect(counterAgreement(pts, counters)).toBe(false);
  });

  it("threshold boundary: p95 exactly 400ms fails, 399 passes", () => {
    expect(vOk([row({ p95: 400 })]).capacity).not.toBe("pass");
    expect(vOk([row({ p95: ACCEPTANCE.p95ms - 1 })]).capacity).toBe("pass");
  });
});

describe("K6-GATE manifestFailures — proving the planned run", () => {
  const pts = [
    { endpoint: "session", cls: "success", scenario: "smoke", ms: 5 },
    { endpoint: "clients", cls: "success", scenario: "smoke", ms: 5 },
  ];
  const counters = { "load_requests|success": 2 };
  const obs = {
    smoke: { points: 2, durationSec: 30, vusMax: 5 },
  };

  it("sound manifest + observed phases → no failures", () => {
    expect(
      manifestFailures(
        cleanManifest({ loadRequests: 2, httpReqs: 3 }),
        pts,
        counters,
        obs,
      ),
    ).toEqual([]);
  });
  it("one-VU one-point hold500 forgery fails — vus/duration observed", () => {
    const m = cleanManifest({
      scenarios: ["hold500"],
      planned: { hold500: { vus: 500, durationSec: 1800 } },
      expectedWorkloadEndpoints: ["session"],
      loadRequests: 2,
      httpReqs: 3,
    });
    const forgedObs = { hold500: { points: 2, durationSec: 2, vusMax: 1 } };
    const fails = manifestFailures(m, pts, counters, forgedObs);
    expect(fails).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/hold500.*vus_max/),
        expect.stringMatching(/hold500.*ran .*s < planned/),
      ]),
    );
  });
  it("unexplained http surplus (999 vs measured) fails accounting", () => {
    const fails = manifestFailures(
      cleanManifest({ loadRequests: 2, httpReqs: 999 }),
      pts,
      counters,
      obs,
    );
    expect(fails).toEqual(
      expect.arrayContaining([expect.stringMatching(/http accounting/)]),
    );
  });
  it("empty scenarios field fails — presence is not a plan", () => {
    const fails = manifestFailures(
      cleanManifest({ scenarios: [], planned: {} }),
      pts,
      counters,
      obs,
    );
    expect(fails).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/no planned scenarios/),
        expect.stringMatching(/no planned scenario specs/),
      ]),
    );
  });
  it("absent planned scenario / endpoint / iterations fail", () => {
    const noObs = manifestFailures(cleanManifest(), pts, counters, {});
    expect(noObs).toEqual(
      expect.arrayContaining([expect.stringMatching(/smoke.*no measured/)]),
    );
    const noEp = manifestFailures(
      cleanManifest({ expectedWorkloadEndpoints: ["session", "daily"] }),
      pts,
      counters,
      obs,
    );
    expect(noEp).toEqual(
      expect.arrayContaining([expect.stringMatching(/daily absent/)]),
    );
    expect(
      manifestFailures(cleanManifest({ iterations: 0 }), pts, counters, obs),
    ).toEqual(expect.arrayContaining([expect.stringMatching(/no iterations/)]));
    expect(manifestFailures(null, pts, counters, obs)).toEqual([
      "run manifest missing",
    ]);
  });
});

describe("K6-GATE parseResources — declared cadence coverage", () => {
  const meta = (intervalSec = 5) =>
    JSON.stringify({ type: "meta", intervalSec });
  const mk = (sec: number, over = {}) =>
    JSON.stringify({
      ts: new Date(T0 + sec * 1000).toISOString(),
      appCpuPct: 10,
      appRamMb: 500,
      appRestarts: 0,
      dbCpuPct: 5,
      dbRestarts: 0,
      pgConnections: 20,
      pgConnLimit: 100,
      hostCpus: 8,
      ...over,
    });
  const win: [number, number] = [T0, T0 + 30_000];

  it("declared-interval coverage: enough samples bracketing the window", () => {
    const text = [
      meta(5),
      ...[0, 5, 10, 15, 20, 25, 30].map((s) => mk(s)),
    ].join("\n");
    const r = parseResources(text, win);
    expect(r.intervalSec).toBe(5);
    expect(r.coversWindow).toBe(true);
    expect(r.hasGap).toBe(false);
    expect(r.enoughSamples).toBe(true);
    expect(r.cpuHostSharePct).toBeCloseTo(15 / 8);
  });
  it("one/two sparse samples cannot satisfy a window", () => {
    const one = [meta(5), mk(15)].join("\n");
    const r1 = parseResources(one, win);
    expect(r1.enoughSamples).toBe(false);
    expect(r1.coversWindow).toBe(false);
    const two = [meta(5), mk(0), mk(30)].join("\n");
    const r2 = parseResources(two, win);
    expect(r2.enoughSamples).toBe(false); // 2 < floor(30/5)
    expect(r2.hasGap).toBe(true); // 30s > 3×5s
  });
  it("the preserved 9m39s suspension gap fails coverage", () => {
    const text = [
      meta(5),
      mk(0),
      mk(5),
      mk(5 + 600), // suspended
      mk(5 + 605),
      mk(5 + 610),
      mk(5 + 615),
      mk(5 + 620),
      mk(5 + 625),
      mk(5 + 630),
    ].join("\n");
    const r = parseResources(text, win);
    expect(r.hasGap).toBe(true);
  });
  it("missing cadence declaration fails — cadence is not inferred", () => {
    const r = parseResources([mk(0), mk(5), mk(10)].join("\n"), win);
    expect(r.intervalSec).toBeNull();
    expect(r.coversWindow).toBe(false);
  });
  it("missing metrics stay unmeasured — never silently zero", () => {
    const r = parseResources(
      [meta(5), mk(0, { appCpuPct: null, dbRestarts: null })].join("\n"),
      win,
    );
    expect(r.appCpuMeasured).toBe(false);
    expect(r.dbRestartsMeasured).toBe(false);
    expect(r.restartsMeasured).toBe(false);
  });
});

describe("K6-GATE units", () => {
  it("memToMb converts docker units — 1.2GiB is not 1 MB", () => {
    expect(memToMb("1.2GiB")).toBeCloseTo(1228.8);
    expect(memToMb("512MiB")).toBe(512);
    expect(memToMb("2048KiB")).toBe(2);
    expect(memToMb("100")).toBe(100);
    expect(memToMb("garbage")).toBeNull();
  });
});
