// K6-GATE (issue #178) — the workload contract, response classification
// and the report verdict. These tests cover the false-green paths the
// first build hid: missing class tags, concealed refusals, counter
// drift, missing/partial resources, bad VU bounds, remote targets.

import { describe, expect, it } from "vitest";

import {
  classifyResponse,
  configError,
  memToMb,
  scenariosWithBounds,
} from "../../tools/load/config.mjs";

type Scenario = {
  executor: string;
  vus?: number;
  duration?: string;
  startTime?: string;
  stages?: { duration: string; target: number }[];
};
import {
  ACCEPTANCE,
  counterAgreement,
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

function point(endpoint: string, cls: string, ms: number, scenario = "smoke") {
  return {
    type: "Point",
    metric: "load_latency",
    data: { tags: { endpoint, class: cls, scenario }, value: ms },
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
    cpuMeasured: true,
    cpuPeakPct: 50,
    ramMeasured: true,
    ramPeakMb: 500,
    pgMeasured: true,
    pgConnPeak: 10,
    pgLimitKnown: true,
    pgConnLimit: 100,
    restartsMeasured: true,
    appRestarts: 0,
    dbRestarts: 0,
    ...over,
  };
}

describe("K6-GATE classifyResponse — the shared contract", () => {
  it("2xx with a JSON error body is a concealed refusal, never success", () => {
    expect(classifyResponse(200, null, { error: { code: "forbidden" } })).toBe(
      "concealed_refusal",
    );
    expect(classifyResponse(200, null, { ok: false })).toBe(
      "concealed_refusal",
    );
  });
  it("non-2xx structured denial is a refusal", () => {
    expect(classifyResponse(403, null, { error: { code: "forbidden" } })).toBe(
      "refusal",
    );
    expect(
      classifyResponse(401, null, { error: { code: "unauthenticated" } }),
    ).toBe("refusal");
  });
  it("state-based refusals classify without an error key", () => {
    expect(classifyResponse(200, null, { state: "DENIED" })).toBe(
      "concealed_refusal",
    );
    expect(classifyResponse(409, null, { state: "not_available" })).toBe(
      "refusal",
    );
  });
  it("redirects are their own class — never success or error", () => {
    expect(classifyResponse(307, null, null)).toBe("redirect");
    expect(classifyResponse(302, null, { error: {} })).toBe("redirect");
  });
  it("clean 2xx (json or html) is success; transport is status-0", () => {
    expect(classifyResponse(200, null, { user: {} })).toBe("success");
    expect(classifyResponse(200, null, null)).toBe("success"); // HTML page
    expect(classifyResponse(0, null, null)).toBe("transport");
    expect(classifyResponse(0, "conn refused", null)).toBe("transport");
    expect(classifyResponse(500, null, { html: true })).toBe("http_error");
  });
});

describe("K6-GATE config — target + bounds safety", () => {
  const env = (o = {}) => ({
    TARGET_URL: "https://127.0.0.1:3870",
    LOAD_PROFILE: "smoke",
    ...o,
  });

  it("refuses missing/relative/foreign targets", () => {
    expect(configError(env({ TARGET_URL: "" }), FIXTURES)).toMatch(/required/);
    expect(configError(env({ TARGET_URL: "notaurl" }), FIXTURES)).toMatch(
      /absolute/,
    );
    expect(
      configError(env({ TARGET_URL: "https://vari8.example.com" }), FIXTURES),
    ).toMatch(/LOAD_ALLOW_REMOTE/);
  });
  it("remote still refuses without the fixture targetId match", () => {
    expect(
      configError(
        env({
          TARGET_URL: "https://staging.example.com",
          LOAD_ALLOW_REMOTE: "1",
        }),
        FIXTURES,
      ),
    ).toMatch(/LOAD_TARGET_ID/);
    expect(
      configError(
        env({
          TARGET_URL: "https://staging.example.com",
          LOAD_ALLOW_REMOTE: "1",
          LOAD_TARGET_ID: "loadgate-x",
        }),
        FIXTURES,
      ),
    ).toBeNull();
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
  it("rejects unknown profiles and malformed hold durations", () => {
    expect(configError(env({ LOAD_PROFILE: "nuke" }), FIXTURES)).toMatch(
      /unknown/,
    );
    expect(configError(env({ LOAD_HOLD500_MIN: "1.5" }), FIXTURES)).toMatch(
      /LOAD_HOLD500_MIN/,
    );
  });
});

describe("K6-GATE scenarios — the acceptance shape", () => {
  it("gate is ramp 0→750/10m then a 250-VU 2h HOLD — not a ramp-down", () => {
    const sc = scenariosWithBounds({ LOAD_PROFILE: "gate" }) as Record<
      string,
      Scenario
    >;
    expect(sc.ramp.stages).toEqual([{ duration: "10m", target: 750 }]);
    expect(sc.soak.executor).toBe("constant-vus");
    expect(sc.soak.vus).toBe(250);
    expect(sc.soak.duration).toBe("120m");
    expect(sc.soak.startTime).toBe("10m");
    expect(sc.hold500).toBeUndefined(); // off unless explicitly enabled
  });
  it("LOAD_HOLD500_MIN inserts the 500 hold and shifts the soak", () => {
    const sc = scenariosWithBounds({
      LOAD_PROFILE: "gate",
      LOAD_HOLD500_MIN: "30",
    }) as Record<string, Scenario>;
    expect(sc.hold500.vus).toBe(500);
    expect(sc.hold500.duration).toBe("30m");
    expect(sc.soak.startTime).toBe("40m");
  });
  it("LOAD_MAX_VUS caps every scenario; malformed targets throw", () => {
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

  it("points missing class/endpoint tags are unclassified — and FAIL", () => {
    const rows = rowsFromPoints([
      { endpoint: "session", cls: null, scenario: "smoke", ms: 5 },
      { endpoint: "session", cls: "success", scenario: "smoke", ms: 5 },
    ]);
    expect(rows[0].unclassified).toBe(1);
    const v = verdict(rows, fullResources(), 10, {
      malformed: 0,
      counterCheck: true,
      hold500Collected: true,
    });
    expect(v.pass).toBe(false);
  });

  it("the reviewer's failing run shape must FAIL with correct totals", () => {
    // Sanitized replica of the preserved raw run: 30×401 session,
    // 10×401 clients, 70×307 pages, 5×200 sign_in, 25×200 others.
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
    const v = verdict(rows, fullResources(), 35, {
      malformed: 0,
      counterCheck: true,
      hold500Collected: true,
    });
    expect(v.pass).toBe(false);
    expect(v.errorRate).toBeCloseTo(110 / 134);
    expect(v.slowestEndpoint).toBe("sign_in");
  });

  it("counter disagreement makes the run inconclusive", () => {
    const raw = [
      JSON.stringify(point("session", "refusal", 10)),
      JSON.stringify(point("session", "success", 5)),
      // The counter stream claims ZERO refusals — drift from latency.
      JSON.stringify({
        type: "Point",
        metric: "load_refusals",
        data: { tags: { endpoint: "session", class: "refusal" }, value: 0 },
      }),
    ].join("\n");
    const { points: pts, counters } = parseJsonOut(raw);
    expect(counterAgreement(pts, counters)).toBe(false);
    const rows = rowsFromPoints(pts);
    const v = verdict(rows, fullResources(), 10, {
      malformed: 0,
      counterCheck: false,
      hold500Collected: true,
    });
    expect(v.pass).toBe(false);
  });

  it("empty input, malformed lines and missing resources all fail", () => {
    const empty = verdict([], null, 10, {
      malformed: 0,
      counterCheck: true,
      hold500Collected: true,
    });
    expect(empty.pass).toBe(false);
    const malformedV = verdict([row()], fullResources(), 10, {
      malformed: 3,
      counterCheck: true,
      hold500Collected: true,
    });
    expect(malformedV.pass).toBe(false);
    const noRes = verdict([row()], null, 10, {
      malformed: 0,
      counterCheck: true,
      hold500Collected: true,
    });
    expect(noRes.pass).toBe(false);
    expect(noRes.firstSaturated).toBe("unavailable");
  });

  it("partial resources (null limit, unmeasured RAM/restart) block PASS", () => {
    const v = verdict(
      [row()],
      fullResources({
        pgLimitKnown: false,
        pgConnLimit: null,
        ramMeasured: false,
        restartsMeasured: false,
      }),
      10,
      { malformed: 0, counterCheck: true, hold500Collected: true },
    );
    expect(v.pass).toBe(false);
    const failed = v.checks.filter((c) => !c.pass).map((c) => c.name);
    expect(failed).toEqual(
      expect.arrayContaining([
        "RAM measured",
        "pg connections under limit",
        "restart signal measured + none observed",
      ]),
    );
  });

  it("a restart during the window fails the gate", () => {
    const v = verdict([row()], fullResources({ appRestarts: 1 }), 10, {
      malformed: 0,
      counterCheck: true,
      hold500Collected: true,
    });
    expect(v.pass).toBe(false);
    expect(v.firstSaturated).toBe("restart signal measured + none observed");
  });

  it("threshold boundary: p95 exactly 400ms fails, 399 passes", () => {
    const atLimit = verdict([row({ p95: 400 })], fullResources(), 10, {
      malformed: 0,
      counterCheck: true,
      hold500Collected: true,
    });
    expect(atLimit.pass).toBe(false);
    const under = verdict(
      [row({ p95: ACCEPTANCE.p95ms - 1 })],
      fullResources(),
      10,
      { malformed: 0, counterCheck: true, hold500Collected: true },
    );
    expect(under.pass).toBe(true);
  });

  it("memToMb converts docker units — 1.2GiB is not 1 MB", () => {
    expect(memToMb("1.2GiB")).toBeCloseTo(1228.8);
    expect(memToMb("512MiB")).toBe(512);
    expect(memToMb("2048KiB")).toBe(2);
    expect(memToMb("100")).toBe(100); // unitless is already MB
    expect(memToMb("garbage")).toBeNull();
  });

  it("parseResources computes peaks and unit-correct MB", () => {
    const nd = [
      JSON.stringify({
        ts: "t1",
        appCpuPct: 10,
        appRamMb: 512,
        dbCpuPct: 5,
        appRestarts: 0,
        dbRestarts: 0,
        pgConnections: 20,
        pgConnLimit: 100,
      }),
      JSON.stringify({
        ts: "t2",
        appCpuPct: 66,
        appRamMb: 900,
        dbCpuPct: 8,
        appRestarts: 0,
        dbRestarts: 0,
        pgConnections: 95,
        pgConnLimit: 100,
      }),
    ].join("\n");
    const r = parseResources(nd);
    expect(r.cpuPeakPct).toBe(74);
    expect(r.ramPeakMb).toBe(900);
    expect(r.pgConnPeak).toBe(95);
    expect(r.restartsMeasured).toBe(true);
  });
});
