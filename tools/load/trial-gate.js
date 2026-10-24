// K6-GATE (issue #178) — trial load gate for 500 concurrent sessions.
//
// Contract (the issue's acceptance):
//   gate profile: ramp 0→750 VUs over 10 min (1.5× the 500 target), then
//   a 2 h soak at 250 VUs. Pass at 500 concurrent sessions is measured
//   by report.mjs: p95 < 400 ms, p99 < 1000 ms, errors < 0.5 %, CPU <
//   70 %, DB connections under the configured Postgres limit, no
//   restart. The 100-user local run stays the baseline only.
//
// Safety:
//   - TARGET_URL must be supplied explicitly; a non-loopback target is
//     refused unless LOAD_ALLOW_REMOTE=1 is set deliberately.
//   - All traffic runs under task-owned fixture users created by
//     provision.ts (workspace `loadgate-*`); no real client data is
//     read or written.
//   - LOAD_MAX_VUS bounds every profile — an accidental huge run aborts
//     at init.
//
// Classification: every response lands in exactly one class —
//   success    : 2xx with no `error` object in a JSON body
//   refusal    : a JSON body carrying `error.code` at ANY status —
//                a 200 must never conceal an application refusal
//   http_error : non-2xx without a structured error body
//   transport  : k6-level failure (connection, TLS, timeout)
// Refusals and errors are counted separately in the report — a denial
// is investigated, not silently treated as capacity failure.
//
// Run:  k6 run -e TARGET_URL=… -e FIXTURES=fixtures.json \
//         -e LOAD_PROFILE=smoke tools/load/trial-gate.js

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";

const reqCount = new Counter("load_requests");
const refused = new Counter("load_refusals");
const httpErrors = new Counter("load_http_errors");
const transportErr = new Counter("load_transport_errors");
const concealed = new Counter("load_concealed_refusals");
const latency = new Trend("load_latency", true);

// --- configuration ---------------------------------------------------------

const PROFILE = __ENV.LOAD_PROFILE || "smoke";

const PROFILES = {
  // Bounded local check — never more than a handful of sessions and a
  // few seconds; exists to prove the script end to end, not to measure.
  smoke: {
    stages: [
      { duration: "15s", target: 5 },
      { duration: "15s", target: 5 },
      { duration: "5s", target: 0 },
    ],
  },
  // The issue's acceptance workload: 0→750 over 10 min, then a 2 h soak
  // at 250 concurrent sessions.
  gate: {
    stages: [
      { duration: "10m", target: 750 },
      { duration: "120m", target: 250 },
      { duration: "1m", target: 0 },
    ],
  },
};

const LOOPBACK = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/;

function validateTarget(url) {
  if (typeof url !== "string" || url.length === 0)
    return "TARGET_URL is required — the load target is never implied";
  if (!/^https?:\/\//.test(url)) return "TARGET_URL must be absolute http(s)";
  if (!LOOPBACK.test(url) && __ENV.LOAD_ALLOW_REMOTE !== "1")
    return "non-loopback TARGET_URL requires LOAD_ALLOW_REMOTE=1";
  return null;
}

function stages() {
  const p = PROFILES[PROFILE];
  if (!p) return `unknown LOAD_PROFILE ${JSON.stringify(PROFILE)}`;
  const maxVus = Number(__ENV.LOAD_MAX_VUS || "750");
  for (const s of p.stages)
    if (s.target > maxVus)
      return `profile ${PROFILE} exceeds LOAD_MAX_VUS=${maxVus}`;
  return p.stages;
}

const cfgError =
  validateTarget(__ENV.TARGET_URL) ||
  (typeof stages() === "string" ? stages() : null);
if (cfgError) throw new Error(`k6-gate config: ${cfgError}`);

const BASE = __ENV.TARGET_URL.replace(/\/$/, "");

// Task-owned fixtures — provision.ts writes this file; the run refuses
// without it so no real account is ever touched.
const fixturePath = __ENV.FIXTURES;
if (!fixturePath)
  throw new Error("k6-gate config: FIXTURES=<provision.json> is required");
const fixtures = JSON.parse(open(fixturePath));
const COACHES = fixtures.coaches || [];
const CLIENTS = fixtures.clients || [];
const WORKSPACE_ID = fixtures.workspaceId;
if (!WORKSPACE_ID || COACHES.length === 0 || CLIENTS.length === 0)
  throw new Error(
    "k6-gate fixtures: expected workspaceId + non-empty coaches/clients",
  );

export const options = {
  stages: stages(),
  thresholds: {
    // A 2xx concealing an application refusal is the one thing k6 must
    // flag itself — per-endpoint latency bounds live in report.mjs.
    load_concealed_refusals: ["count==0"],
  },
  // Keep every per-endpoint tag in the summary for the report.
  systemTags: ["status", "method", "url", "name", "class", "endpoint"],
};

// --- response classification ------------------------------------------------

function classify(res) {
  if (res.status === 0 || res.error) return "transport";
  let refusal = false;
  try {
    const body = res.json();
    if (body && typeof body === "object" && body.error) refusal = true;
  } catch {
    // Non-JSON 2xx/4xx — a page or binary body; not a structured refusal.
  }
  if (refusal) return res.status < 300 ? "concealed_refusal" : "refusal";
  return res.status < 300 ? "success" : "http_error";
}

function hit(endpoint, method, path, opts) {
  const res = http.request(method, BASE + path, opts?.body ?? null, {
    headers: opts?.headers,
    tags: { endpoint },
    redirects: 0,
    timeout: "30s",
  });
  const cls = classify(res);
  reqCount.add(1, { endpoint, class: cls });
  if (cls === "refusal") refused.add(1, { endpoint });
  else if (cls === "concealed_refusal") concealed.add(1, { endpoint });
  else if (cls === "http_error") httpErrors.add(1, { endpoint });
  else transportErr.add(1, { endpoint });
  latency.add(res.timings.duration, { endpoint });
  check(res, { "not a concealed refusal": () => cls !== "concealed_refusal" });
  return { res, cls };
}

// --- sessions ---------------------------------------------------------------

// k6 keeps a per-VU cookie jar automatically — one sign-in per VU, then
// the jar replays the session cookie on every following request.
const signedIn = new Set();

function signIn(account) {
  const res = http.post(
    `${BASE}/api/auth/sign-in/email`,
    JSON.stringify({ email: account.email, password: account.password }),
    {
      headers: { "content-type": "application/json" },
      tags: { endpoint: "sign_in" },
    },
  );
  latency.add(res.timings.duration, { endpoint: "sign_in" });
  const cls = classify(res);
  reqCount.add(1, { endpoint: "sign_in", class: cls });
  return cls === "success";
}

export default function virtualUser() {
  // Every third VU acts as a coach; the rest act as clients — a stand-in
  // mix for the trial's coach-heavy read traffic + client submissions.
  const isCoach = __VU % 3 === 0;
  const pool = isCoach ? COACHES : CLIENTS;
  const account = pool[__VU % pool.length];

  if (!signedIn.has(__VU)) {
    if (!signIn(account)) {
      sleep(2);
      return;
    }
    signedIn.add(__VU);
  }

  if (isCoach) {
    hit("session", "GET", `/api/v1/workspaces/${WORKSPACE_ID}/session`);
    sleep(0.5);
    hit("clients", "GET", `/api/v1/workspaces/${WORKSPACE_ID}/clients`);
    sleep(1);
    hit("workspace_page", "GET", `/workspace/${WORKSPACE_ID}`);
  } else {
    // Client-scoped reads only — staff routes correctly refuse CLIENT
    // sessions at the layout (403); a denial is evidence, not load.
    hit("session", "GET", `/api/v1/workspaces/${WORKSPACE_ID}/session`);
    sleep(0.5);
    hit("client_home", "GET", `/workspace/${WORKSPACE_ID}/home`);
    sleep(1);
    hit("checkins_page", "GET", `/workspace/${WORKSPACE_ID}/check-ins`);
    sleep(0.5);
    hit("client_daily", "GET", `/workspace/${WORKSPACE_ID}/daily`);
  }
  sleep(1 + Math.random() * 2); // think time — users are not request bots
}

export function handleSummary(data) {
  const out = __ENV.LOAD_SUMMARY_OUT ?? "tools/load/out/summary.json";
  return {
    [out]: JSON.stringify(data, null, 2),
    stdout: `\nload run complete — results in ${out}\n`,
  };
}
