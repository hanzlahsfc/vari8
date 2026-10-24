// K6-GATE (issue #178) — the result parser and the workload contract.
// The parser must distinguish successes, structured refusals, HTTP
// errors and transport failures — a 2xx body carrying `error.code` is a
// concealed refusal, never a success. The gate thresholds are the
// issue's: p95 < 400ms, p99 < 1000ms, errors < 0.5%, CPU < 70%.

import { describe, expect, it } from "vitest";

import {
  parseJsonOut,
  parseResources,
  percentile,
  rowsFromPoints,
  verdict,
} from "../../tools/load/report.mjs";

function point(endpoint: string, cls: string, ms: number) {
  return {
    type: "Point",
    metric: "load_latency",
    data: { tags: { endpoint, class: cls }, value: ms },
  };
}

describe("K6-GATE report parser", () => {
  it("percentile picks the nearest-rank element", () => {
    const xs = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(xs, 50)).toBe(50);
    expect(percentile(xs, 95)).toBe(100);
    expect(percentile(xs, 99)).toBe(100);
    expect(percentile([], 95)).toBeNaN();
  });

  it("aggregates per-endpoint latency and error classes", () => {
    const points = [
      point("session", "success", 100),
      point("session", "success", 200),
      point("session", "refusal", 50),
      point("clients", "success", 900),
      point("clients", "http_error", 1200),
      point("clients", "transport", 0),
    ];
    const rows = rowsFromPoints(points);
    const session = rows.find((r) => r.endpoint === "session")!;
    const clients = rows.find((r) => r.endpoint === "clients")!;
    expect(session.count).toBe(3);
    expect(session.refused).toBe(1);
    expect(session.httpErrors).toBe(0);
    expect(clients.count).toBe(3);
    expect(clients.httpErrors).toBe(1);
    expect(clients.transport).toBe(1);
    // session sorted [50,100,200]: p50=100, p95=200
    expect(session.p50).toBe(100);
    expect(session.p95).toBe(200);
  });

  it("a concealed refusal (2xx + error body) fails the verdict", () => {
    const rows = [
      {
        endpoint: "session",
        count: 1000,
        refused: 0,
        httpErrors: 0,
        transport: 0,
        concealed: 1, // a 200 the app body says was denied — 0.1% total, so error-rate passes and the concealed check is the one that fails
        p50: 10,
        p95: 20,
        p99: 30,
      },
    ];
    const v = verdict(rows, null, 60);
    expect(v.pass).toBe(false);
    expect(v.firstSaturated).toBe("concealed refusals = 0");
  });

  it("a fast clean run passes all checks and names the slowest endpoint", () => {
    const rows = [
      {
        endpoint: "session",
        count: 1000,
        refused: 0,
        httpErrors: 0,
        transport: 0,
        concealed: 0,
        p50: 40,
        p95: 120,
        p99: 200,
      },
      {
        endpoint: "clients",
        count: 500,
        refused: 2, // 0.13% of 1500 — under 0.5%
        httpErrors: 0,
        transport: 0,
        concealed: 0,
        p50: 80,
        p95: 350,
        p99: 800,
      },
    ];
    const res = {
      samples: 10,
      cpuMeasured: true,
      cpuPeakPct: 55,
      ramPeakMb: 2048,
      pgConnPeak: 60,
      pgConnLimit: 100,
    };
    const v = verdict(rows, res, 600);
    expect(v.pass).toBe(true);
    expect(v.slowestEndpoint).toBe("clients");
    expect(v.errorRate).toBeCloseTo(2 / 1500);
    expect(v.rps).toBeCloseTo(2.5);
    expect(v.firstSaturated).toBe("none");
  });

  it("CPU over 70% fails and is named as the saturated resource", () => {
    const rows = [
      {
        endpoint: "session",
        count: 100,
        refused: 0,
        httpErrors: 0,
        transport: 0,
        concealed: 0,
        p50: 10,
        p95: 100,
        p99: 200,
      },
    ];
    const res = {
      samples: 5,
      cpuMeasured: true,
      cpuPeakPct: 85,
      ramPeakMb: 1000,
      pgConnPeak: 10,
      pgConnLimit: 100,
    };
    const v = verdict(rows, res, 30);
    expect(v.pass).toBe(false);
    expect(v.firstSaturated).toBe("CPU < 70%");
  });

  it("unmeasured CPU cannot pass the gate", () => {
    const rows = [
      {
        endpoint: "session",
        count: 100,
        refused: 0,
        httpErrors: 0,
        transport: 0,
        concealed: 0,
        p50: 10,
        p95: 100,
        p99: 200,
      },
    ];
    const res = {
      samples: 5,
      cpuMeasured: false,
      cpuPeakPct: 0,
      ramPeakMb: 0,
      pgConnPeak: 10,
      pgConnLimit: 100,
    };
    const v = verdict(rows, res, 30);
    expect(v.pass).toBe(false);
    expect(v.firstSaturated).toBe("CPU measured");
  });

  it("parseJsonOut skips non-metric and malformed lines", () => {
    const text = [
      JSON.stringify({ type: "Metric", metric: "http_reqs" }),
      "not json at all",
      JSON.stringify(point("session", "success", 123)),
      "",
    ].join("\n");
    const pts = parseJsonOut(text);
    expect(pts).toHaveLength(1);
  });

  it("parseResources takes peaks, not averages", () => {
    const nd = [
      JSON.stringify({
        ts: "t1",
        appCpuPct: 10,
        appRamMb: 500,
        dbCpuPct: 5,
        pgConnections: 20,
        pgConnLimit: 100,
      }),
      JSON.stringify({
        ts: "t2",
        appCpuPct: 66,
        appRamMb: 900,
        dbCpuPct: 8,
        pgConnections: 95,
        pgConnLimit: 100,
      }),
      JSON.stringify({
        ts: "t3",
        appCpuPct: 20,
        appRamMb: 600,
        dbCpuPct: 6,
        pgConnections: 30,
        pgConnLimit: 100,
      }),
    ].join("\n");
    const r = parseResources(nd);
    expect(r.samples).toBe(3);
    expect(r.cpuPeakPct).toBe(74); // app 66 + db 8
    expect(r.ramPeakMb).toBe(900);
    expect(r.pgConnPeak).toBe(95);
    expect(r.pgConnLimit).toBe(100);
  });
});
