// K6-GATE (issue #178) — trial load gate for 500 concurrent sessions.
//
// Contract (the issue's acceptance):
//   ramp 0→750 VUs over 10 min (1.5× the 500 target), then a 2 h soak
//   at 250 VUs. Measured pass: p95 < 400 ms, p99 < 1000 ms, errors <
//   0.5 %, CPU < 70 %, DB connections under the Postgres limit, no
//   restart — judged by report.mjs, not by k6 itself.
//
//   The specified profile never HOLDS 500 VUs: the only 500-concurrent
//   moment is the transient ramp crossover. `ramp` and `soak` run as
//   specified as named scenarios; `hold500` (LOAD_HOLD500_MIN, off by
//   default) inserts the sustained-500 window the pass measurement
//   actually needs — without it report.mjs marks 500-session evidence
//   "not collected": inconclusive, not PASS. This is the recorded
//   acceptance-choice gap.
//
// Workload: READ traffic only — session/roster APIs and page GETs under
// real sessions. Issue #178's acceptance names latency/error/resource
// bounds, not a write mix; nothing here is called a "submission".
//
// Safety:
//   - TARGET_URL required; non-loopback additionally requires
//     LOAD_ALLOW_REMOTE=1 AND LOAD_TARGET_ID matching the fixture file's
//     targetId. setup() aborts when the target redirects to another host.
//   - LOAD_MAX_VUS (default 750) must be a finite positive integer and
//     caps every scenario — malformed values abort at init.
//   - Fixture users only (@loadgate.invalid), one recorded workspace.
//
// Classification (shared contract — config.mjs::classifyResponse, and
// every `load_latency` point carries BOTH `endpoint` and `class` tags
// so report.mjs never sees an unclassified success):
//   success | refusal | concealed_refusal (2xx + error body — counted
//   and fails the run) | redirect | http_error | transport
//
// Run:  k6 run -e TARGET_URL=… -e FIXTURES=fixtures.json \
//         -e LOAD_PROFILE=smoke tools/load/trial-gate.js

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";

import {
  classifyResponse,
  configError,
  scenariosWithBounds,
} from "./config.mjs";

const reqCount = new Counter("load_requests");
const refused = new Counter("load_refusals");
const httpErrors = new Counter("load_http_errors");
const transportErr = new Counter("load_transport_errors");
const concealed = new Counter("load_concealed_refusals");
const redirects = new Counter("load_redirects");
const reauths = new Counter("load_reauths");
const latency = new Trend("load_latency", true);

// --- fixtures + config ---------------------------------------------------------

// The fixture file must be readable in init context — load it before
// the config check so the remote guard can consult it.
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
for (const a of [...COACHES, ...CLIENTS])
  if (!a.userId)
    throw new Error("k6-gate fixtures: every account must carry userId");

const cfgError = configError(__ENV, fixtures);
if (cfgError) throw new Error(`k6-gate config: ${cfgError}`);

const BASE = __ENV.TARGET_URL.replace(/\/$/, "");

export const options = {
  scenarios: scenariosWithBounds(__ENV),
  thresholds: {
    // A 2xx concealing an application refusal is the one thing k6 flags
    // itself — the full verdict lives in report.mjs.
    load_concealed_refusals: ["count==0"],
  },
  systemTags: [
    "status",
    "method",
    "url",
    "name",
    "class",
    "endpoint",
    "scenario",
  ],
};

// --- response classification -------------------------------------------------

function classify(res) {
  let body = null;
  try {
    body = res.json();
  } catch {
    /* non-JSON body — pages are HTML, that's expected */
  }
  return classifyResponse(res.status, res.error, body);
}

function record(endpoint, res) {
  const cls = classify(res);
  const tags = { endpoint, class: cls };
  reqCount.add(1, tags);
  if (cls === "refusal") refused.add(1, tags);
  else if (cls === "concealed_refusal") concealed.add(1, tags);
  else if (cls === "http_error") httpErrors.add(1, tags);
  else if (cls === "transport") transportErr.add(1, tags);
  else if (cls === "redirect") redirects.add(1, tags);
  latency.add(res.timings.duration, tags);
  check(res, { "not a concealed refusal": () => cls !== "concealed_refusal" });
  return cls;
}

function hit(endpoint, method, path, opts) {
  const res = http.request(method, BASE + path, opts?.body ?? null, {
    headers: opts?.headers,
    cookies: opts?.cookies,
    redirects: 0, // measure the real response; redirects are classified
    timeout: "30s",
  });
  return { res, cls: record(endpoint, res) };
}

// --- sessions ------------------------------------------------------------------

// The session cookie's Expires parses to a past instant inside k6's
// cookie jar (measured: expires=-6795364578871 — the jar drops it
// mid-run, which is how the first smoke decayed into 401s/307s). We pin
// the Set-Cookie value captured at sign-in and send it explicitly on
// every measured request, plus the bearer token the API routes accept.
const AUTH_COOKIE = "__Secure-better-auth.session_token";
const sessionByVu = {};

function signIn(account, tag) {
  const res = http.post(
    `${BASE}/api/auth/sign-in/email`,
    JSON.stringify({ email: account.email, password: account.password }),
    {
      headers: { "content-type": "application/json" },
      redirects: 0,
    },
  );
  const cls = record(tag ?? "sign_in", res);
  if (cls !== "success") return null;
  const cookie = res.cookies[AUTH_COOKIE]?.[0]?.value;
  let token = null;
  try {
    token = res.json().token ?? null;
  } catch {
    /* no token body — cookie may still exist */
  }
  if (!cookie && !token) return null;
  return { cookie, token };
}

function authParams(sess) {
  const headers = {};
  if (sess.token) headers["authorization"] = `Bearer ${sess.token}`;
  return {
    headers,
    cookies: sess.cookie ? { [AUTH_COOKIE]: sess.cookie } : {},
  };
}

// A 200 is not enough — the session body must name the fixture user.
function verifySession(sess, expectedUserId) {
  const r = http.get(`${BASE}/api/v1/workspaces/${WORKSPACE_ID}/session`, {
    ...authParams(sess),
    redirects: 0,
  });
  let ok = false;
  try {
    ok = r.status === 200 && r.json()?.user?.id === expectedUserId;
  } catch {}
  record("session_verify", r);
  return ok;
}

// Before any VU traffic: the target must answer on its own origin — a
// redirect to another host (a front door bouncing to production, a
// parked domain) aborts the run rather than loading the wrong site.
export function setup() {
  const res = http.get(`${BASE}/login`, { redirects: 0 });
  const loc = res.headers.Location ?? res.headers.location ?? "";
  if (loc && /^https?:\/\//.test(loc)) {
    let foreign = false;
    try {
      foreign = new URL(loc).host !== new URL(BASE).host;
    } catch {
      foreign = true;
    }
    if (foreign) throw new Error(`k6-gate: target redirects to foreign host`);
  }
  return {};
}

export default function virtualUser() {
  const isCoach = __VU % 3 === 0;
  const pool = isCoach ? COACHES : CLIENTS;
  const account = pool[__VU % pool.length];

  if (!sessionByVu[__VU]) {
    const sess = signIn(account, "sign_in");
    if (!sess || !verifySession(sess, account.userId)) {
      sessionByVu[__VU] = null;
      sleep(2);
      return;
    }
    sessionByVu[__VU] = sess;
  }

  const opts = authParams(sessionByVu[__VU]);
  let sessionCls;
  if (isCoach) {
    sessionCls = hit(
      "session",
      "GET",
      `/api/v1/workspaces/${WORKSPACE_ID}/session`,
      opts,
    ).cls;
    sleep(0.5);
    hit("clients", "GET", `/api/v1/workspaces/${WORKSPACE_ID}/clients`, opts);
    sleep(1);
    hit("workspace_page", "GET", `/workspace/${WORKSPACE_ID}`, opts);
  } else {
    // Client-scoped reads only — staff routes correctly refuse CLIENT
    // sessions at the layout (403); a denial is evidence, not load.
    sessionCls = hit(
      "session",
      "GET",
      `/api/v1/workspaces/${WORKSPACE_ID}/session`,
      opts,
    ).cls;
    sleep(0.5);
    hit("client_home", "GET", `/workspace/${WORKSPACE_ID}/home`, opts);
    sleep(1);
    hit("checkins_page", "GET", `/workspace/${WORKSPACE_ID}/check-ins`, opts);
    sleep(0.5);
    hit("client_daily", "GET", `/workspace/${WORKSPACE_ID}/daily`, opts);
  }
  // Auth decay is real evidence: the failed request stays a refusal/
  // redirect; re-authentication is a separate, separately-tagged op —
  // never a silent retry that launders the failure.
  if (sessionCls === "refusal" || sessionCls === "redirect") {
    const re = signIn(account, "reauth");
    if (re) {
      sessionByVu[__VU] = re;
      reauths.add(1);
    } else sessionByVu[__VU] = null;
  }
  sleep(1 + Math.random() * 2); // think time — users are not request bots
}

export function handleSummary(data) {
  const out = __ENV.LOAD_SUMMARY_OUT ?? "tools/load/out/summary.json";
  return {
    [out]: JSON.stringify(data, null, 2),
    stdout: `\nload run complete — summary ${out}\n`,
  };
}
