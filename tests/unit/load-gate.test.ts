// K6-GATE (issue #178) — the workload contract, response classification
// and the report verdict. Covers every false-PASS path both reviews
// found: missing class tags, concealed/state refusals, HTML/logins
// served as 200s, wrong-identity sessions, counter/manifest drift,
// auth-only and truncated runs, missing/gapped/stale resources, bad
// bounds, disabled remote targets and tampered-input handling.

import { describe, expect, it } from "vitest";

import {
  classifyResponse,
  configError,
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
    data: { tags: { class: cls }, value: n, time: new Date(T0).toISOString() },
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
    samples: 5,
    malformed: 0,
    tsMeasured: true,
    coversWindow: true,
    hasGap: false,
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
    expectedWorkloadEndpoints: [],
    authEndpoints: ["sign_in", "session_verify", "reauth"],
    iterations: 10,
    vusMax: 5,
    httpReqs: 150,
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
    // A 200 serving an HTML page where JSON is expected is a failure —
    // the earlier build counted it as success.
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
    expect(classifyResponse(200, null, null)).toBe("success"); // page HTML
    expect(classifyResponse(0, null, null)).toBe("transport");
    expect(classifyResponse(0, "conn refused", null)).toBe("transport");
    expect(classifyResponse(500, null, {})).toBe("http_error");
  });
  it("session identity: a 200 naming the wrong user is a failure", () => {
    expect(verifyIdentity(200, { user: { id: "u1" } }, "u1")).toBe("success");
    expect(verifyIdentity(200, { user: { id: "other" } }, "u1")).toBe(
      "identity_mismatch",
    );
    expect(verifyIdentity(200, {}, "u1")).toBe("identity_mismatch");
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
  it("remote is DISABLED — flag + targetId cannot re-enable it", () => {
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
});

describe("K6-GATE scenarios — the acceptance shape", () => {
  type Scenario = {
    executor: string;
    vus?: number;
    duration?: string;
    startTime?: string;
    stages?: { duration: string; target: number }[];
  };
  it("gate is ramp 0→750/10m + hold500 + 250-VU 2h HOLD — not a ramp-down", () => {
    const sc = scenariosWithBounds({
      LOAD_PROFILE: "gate",
      LOAD_HOLD500_MIN: "30",
    }) as Record<string, Scenario>;
    expect(sc.ramp.stages).toEqual([{ duration: "10m", target: 750 }]);
    expect(sc.hold500.vus).toBe(500);
    expect(sc.hold500.duration).toBe("30m");
    expect(sc.soak.executor).toBe("constant-vus");
    expect(sc.soak.vus).toBe(250);
    expect(sc.soak.duration).toBe("120m");
    expect(sc.soak.startTime).toBe("40m"); // shifted past the hold
  });
  it("hold500 is absent without the required duration", () => {
    const sc = scenariosWithBounds({ LOAD_PROFILE: "gate" }) as Record<
      string,
      Scenario
    >;
    expect(sc.hold500).toBeUndefined();
  });
  it("LOAD_MAX_VUS caps every scenario", () => {
    expect(() =>
      scenariosWithBounds({ LOAD_PROFILE: "gate", LOAD_MAX_VUS: "100" }),
    ).toThrow(/LOAD_MAX_VUS/);
  });
});

describe("K6-GATE report — fail-closed parsing + verdict", () => {
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

  it("a clean complete run passes and names the slowest endpoint", () => {
    const v = vOk([row()]);
    expect(v.pass).toBe(true);
    expect(v.slowestEndpoint).toBe("session");
    expect(v.firstSaturated).toBe("none");
  });

  it("auth-only / one-point / truncated runs cannot pass", () => {
    // Reviewer's probes: only auth traffic, a single point, or a
    // manifest-less truncated file — all inconclusive.
    const authOnly = vOk(
      [row({ endpoint: "sign_in" }), row({ endpoint: "session_verify" })],
      fullResources(),
      { manifestFailures: ["expected workload endpoint session absent"] },
    );
    expect(authOnly.pass).toBe(false);
    const onePoint = vOk([row({ count: 1 })], fullResources(), {
      manifestFailures: ["expected workload endpoint session absent"],
    });
    expect(onePoint.pass).toBe(false);
    const noManifest = vOk([row()], fullResources(), {
      manifestFailures: ["run manifest not supplied"],
    });
    expect(noManifest.pass).toBe(false);
  });

  it("manifest cross-checks measured totals against the planned run", () => {
    const pts = [
      { endpoint: "session", cls: "success", scenario: "smoke", ms: 5 },
      { endpoint: "session", cls: "success", scenario: "smoke", ms: 5 },
    ];
    const okCounters = { "load_requests|success": 2 };
    expect(
      manifestFailures(cleanManifest({ loadRequests: 2 }), pts, okCounters),
    ).toEqual([]);
    // Points ≠ manifest's claimed total.
    expect(
      manifestFailures(cleanManifest({ loadRequests: 50 }), pts, {}),
    ).toEqual(
      expect.arrayContaining([expect.stringMatching(/measured points/)]),
    );
    // No iterations = run never executed.
    expect(manifestFailures(cleanManifest({ iterations: 0 }), pts, {})).toEqual(
      expect.arrayContaining([expect.stringMatching(/no iterations/)]),
    );
    // Missing expected endpoint + missing planned scenario.
    expect(
      manifestFailures(
        cleanManifest({
          expectedWorkloadEndpoints: ["session", "clients"],
          scenarios: ["smoke", "hold500"],
        }),
        pts,
        {},
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/clients absent/),
        expect.stringMatching(/hold500/),
      ]),
    );
    // load_requests counter must equal measured points.
    expect(
      manifestFailures(cleanManifest({ loadRequests: 2 }), pts, {
        "load_requests|success": 1,
      }),
    ).toEqual(expect.arrayContaining([expect.stringMatching(/counter/)]));
  });

  it("the reviewer's failing run shape fails with correct totals", () => {
    // Sanitized replica of the preserved raw run: 40×401 + 70×307 +
    // 25×200 — under the repaired tag contract.
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
    const v = vOk(rows);
    expect(v.pass).toBe(false);
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
    expect(
      vOk(rowsFromPoints(pts), fullResources(), { counterCheck: false }).pass,
    ).toBe(false);
  });

  it("partial resources fail: app CPU, RAM, pg limit, db restarts", () => {
    const v = vOk(
      [row()],
      fullResources({
        appCpuMeasured: false,
        cpuMeasured: false,
        ramMeasured: false,
        pgLimitKnown: false,
        dbRestartsMeasured: false,
        restartsMeasured: false,
      }),
    );
    expect(v.pass).toBe(false);
    const failed = v.checks.filter((c) => !c.pass).map((c) => c.name);
    expect(failed).toEqual(
      expect.arrayContaining([
        "app CPU measured",
        "RAM measured",
        "pg connections under limit",
        "restart signals measured + none observed",
      ]),
    );
  });

  it("suspended/gapped/stale resource coverage fails", () => {
    // The preserved smoke had a 9m39s sample gap mid-run — must fail.
    const gapped = vOk([row()], fullResources({ hasGap: true }));
    expect(gapped.pass).toBe(false);
    const stale = vOk([row()], fullResources({ coversWindow: false }));
    expect(stale.pass).toBe(false);
    const noRes = vOk([row()], null);
    expect(noRes.pass).toBe(false);
    expect(noRes.firstSaturated).toBe("unavailable");
  });

  it("a restart during the window fails the gate", () => {
    const v = vOk([row()], fullResources({ appRestarts: 1 }));
    expect(v.pass).toBe(false);
    expect(v.firstSaturated).toBe("restart signals measured + none observed");
  });

  it("threshold boundary: p95 exactly 400ms fails, 399 passes", () => {
    expect(vOk([row({ p95: 400 })]).pass).toBe(false);
    expect(vOk([row({ p95: ACCEPTANCE.p95ms - 1 })]).pass).toBe(true);
  });

  it("memToMb converts docker units — 1.2GiB is not 1 MB", () => {
    expect(memToMb("1.2GiB")).toBeCloseTo(1228.8);
    expect(memToMb("512MiB")).toBe(512);
    expect(memToMb("2048KiB")).toBe(2);
    expect(memToMb("100")).toBe(100);
    expect(memToMb("garbage")).toBeNull();
  });

  it("parseResources: peaks, window coverage and gap detection", () => {
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
    const runWindow: [number, number] = [T0 + 5_000, T0 + 35_000];
    // Samples bracketing the window at even intervals: covers.
    const ok = [mk(0), mk(10), mk(20), mk(30), mk(40)].join("\n");
    const r = parseResources(ok, runWindow);
    expect(r.coversWindow).toBe(true);
    expect(r.hasGap).toBe(false);
    expect(r.cpuHostSharePct).toBeCloseTo(15 / 8);
    // A 10-minute suspension gap: must fail coverage.
    const gapped = [mk(0), mk(10), mk(10 + 600), mk(10 + 610)].join("\n");
    expect(parseResources(gapped, runWindow).hasGap).toBe(true);
    // Samples entirely outside the window: not covered.
    const stale = [mk(6000), mk(6010)].join("\n");
    expect(parseResources(stale, runWindow).coversWindow).toBe(false);
    // Missing fields stay unmeasured — never silently zero.
    const partial = [mk(0, { appCpuPct: null, dbRestarts: null })].join("\n");
    const p = parseResources(partial, runWindow);
    expect(p.appCpuMeasured).toBe(false);
    expect(p.dbRestartsMeasured).toBe(false);
    expect(p.restartsMeasured).toBe(false);
  });
});
