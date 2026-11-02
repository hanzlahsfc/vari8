// K6-GATE (issue #178) — trial load gate for 500 concurrent sessions.
//
// Contract (the issue's acceptance):
//   ramp 0→750 VUs over 10 min (1.5× the 500 target), then a 2 h soak
//   at 250 VUs. Measured pass: p95 < 400 ms, p99 < 1000 ms, errors <
//   0.5 %, CPU < 70 %, DB connections under the Postgres limit, no
//   restart — judged by report.mjs, not by k6 itself.
//
//   The specified profile never HOLDS 500 VUs: the only 500-concurrent
//   moment is the transient ramp crossover. `hold500` is REQUIRED for
//   the gate — LOAD_HOLD500_MIN is the recorded unresolved acceptance
//   decision; the profile refuses to run without it, and report.mjs
//   fails "500-session hold phase" when the phase never executed.
//
// Workload: READ traffic only — session/roster APIs and page GETs under
// verified sessions. Issue #178's acceptance names latency/error/
// resource bounds, not a write mix; nothing here is called a
// "submission".
//
// Safety:
//   - TARGET_URL required; remote execution is DISABLED (no approved
//     staging identity mechanism exists yet — see README).
//   - setup() aborts when the target redirects to another host.
//   - LOAD_MAX_VUS (default 750) must be a finite positive integer and
//     caps every scenario — malformed values abort at init.
//   - Fixture users only (@loadgate.invalid), one recorded workspace.
//
// Classification (shared contract — config.mjs::classifyResponse; every
// `load_latency` point carries `endpoint`, `class` and `scenario` tags
// so report.mjs can never treat an unclassified response as success):
//   success | refusal | concealed_refusal (2xx + refusal body)
//   | redirect | http_error | transport | unexpected_html
//   | login_page | identity_mismatch
//
// Run:  k6 run -e TARGET_URL=… -e FIXTURES=fixtures.json \
//         -e LOAD_PROFILE=smoke tools/load/trial-gate.js

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";

import {
  IDENTITY_ENDPOINTS,
  JSON_ENDPOINTS,
  buildManifest,
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
const unexpectedHtml = new Counter("load_unexpected_html");
const loginPages = new Counter("load_login_pages");
const identityMismatches = new Counter("load_identity_mismatches");
const reauths = new Counter("load_reauths");
const latency = new Trend("load_latency", true);

// --- fixtures + config ---------------------------------------------------------

// The fixture file must be readable in init context — load it before
// the config check.
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

// The raw planned scenario map — captured in init context because k6
// normalizes `options` before handleSummary (fields like `stages` are
// no longer present in the resolved shape).
const PLANNED_SCENARIOS = scenariosWithBounds(__ENV);

export const options = {
  scenarios: PLANNED_SCENARIOS,
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

function classify(res, expectJson, expectUserId) {
  let body = null;
  try {
    body = res.json();
  } catch {
    /* non-JSON body — pages are HTML, that's expected */
  }
  // A served login page is evidence of broken auth, not a page success:
  // detect it before the generic 2xx path.
  const looksLikeLogin =
    !body &&
    typeof res.body === "string" &&
    /type="password"|name="password"|sign-?in/i.test(res.body) &&
    /<html|<!doctype/i.test(res.body);
  return classifyResponse(res.status, res.error, body, {
    expectJson: expectJson ?? false,
    looksLikeLogin,
    expectUserId: expectUserId ?? null,
  });
}

function record(endpoint, res, forcedClass, expectUserId) {
  const cls =
    forcedClass ??
    classify(
      res,
      JSON_ENDPOINTS.has(endpoint),
      IDENTITY_ENDPOINTS.has(endpoint) ? expectUserId : null,
    );
  const tags = { endpoint, class: cls };
  reqCount.add(1, tags);
  if (cls === "refusal") refused.add(1, tags);
  else if (cls === "concealed_refusal") concealed.add(1, tags);
  else if (cls === "http_error") httpErrors.add(1, tags);
  else if (cls === "transport") transportErr.add(1, tags);
  else if (cls === "redirect") redirects.add(1, tags);
  else if (cls === "unexpected_html") unexpectedHtml.add(1, tags);
  else if (cls === "login_page") loginPages.add(1, tags);
  else if (cls === "identity_mismatch") identityMismatches.add(1, tags);
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
  return { res, cls: record(endpoint, res, null, opts?.expectUserId) };
}

// --- sessions ------------------------------------------------------------------

// WORKAROUND: k6's cookie jar appears to drop the session cookie mid-run
// (the first smoke decayed into 401s/307s after iteration 1; the exact
// jar-side expiry behavior is unverified — we do not claim a diagnosis).
// We pin the Set-Cookie value captured at sign-in and send it explicitly
// on every measured request, plus the bearer token the API routes
// accept. Two-hour session behavior is unproven either way.
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
  // Classify first — a 200 is not auth success until credentials and a
  // usable session artifact (cookie and/or bearer token) both check out.
  let cls = classify(res, true);
  const cookie = res.cookies[AUTH_COOKIE]?.[0]?.value;
  let token = null;
  try {
    token = res.json().token ?? null;
  } catch {
    /* non-JSON — already classified by classify() */
  }
  if (cls === "success" && !cookie && !token) cls = "identity_mismatch";
  record(tag ?? "sign_in", res, cls);
  if (cls !== "success") return null;
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
// A mismatch is recorded as `identity_mismatch` (a measured failure),
// never as success.
function verifySession(sess, expectedUserId) {
  const r = http.get(`${BASE}/api/v1/workspaces/${WORKSPACE_ID}/session`, {
    ...authParams(sess),
    redirects: 0,
  });
  const cls = classify(r, true, expectedUserId);
  record("session_verify", r, cls);
  return cls === "success";
}

// Before any VU traffic: the target must answer on its own origin — a
// redirect to another host (a front door bouncing elsewhere, a parked
// domain) aborts the run rather than loading the wrong site.
export function setup() {
  // The one planned setup operation — tagged so raw http_reqs points
  // identify it by operation, not by URL shape. Any other /login hit
  // is an unexplained request, not setup.
  const res = http.get(`${BASE}/login`, {
    redirects: 0,
    tags: { setup_op: "origin_probe" },
  });
  const loc = res.headers.Location ?? res.headers.location ?? "";
  if (loc && /^https?:\/\//.test(loc)) {
    let foreign = false;
    try {
      foreign = new URL(loc).host !== new URL(BASE).host;
    } catch {
      foreign = true;
    }
    if (foreign) throw new Error("k6-gate: target redirects to foreign host");
  }
  return {};
}

// Establish or re-establish a verified session for this VU. `tag` keeps
// re-auth visible as its own measured operation — never a silent retry.
function ensureSession(account, tag) {
  const sess = signIn(account, tag);
  if (!sess) return null;
  if (!verifySession(sess, account.userId)) return null;
  if (tag === "reauth") reauths.add(1);
  return sess;
}

export default function virtualUser() {
  const isCoach = __VU % 3 === 0;
  const pool = isCoach ? COACHES : CLIENTS;
  const account = pool[__VU % pool.length];

  if (!sessionByVu[__VU]) {
    sessionByVu[__VU] = ensureSession(account, "sign_in");
    if (!sessionByVu[__VU]) {
      sleep(2);
      return;
    }
  }

  const opts = {
    ...authParams(sessionByVu[__VU]),
    expectUserId: account.userId, // ongoing identity — every session probe
  };
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
  // Auth decay is real evidence: the failed request stays counted; the
  // re-auth is a separately-tagged operation, and ITS session must also
  // pass identity verification before it can serve measured traffic.
  if (sessionCls === "refusal" || sessionCls === "redirect") {
    sessionByVu[__VU] = ensureSession(account, "reauth");
  }
  sleep(1 + Math.random() * 2); // think time — users are not request bots
}

export function handleSummary(data) {
  const out = __ENV.LOAD_SUMMARY_OUT ?? "tools/load/out/summary.json";
  // The run manifest — built from the CONFIGURED profile plus measured
  // counters so report.mjs verifies the plan, not the assertions.
  const manifest = buildManifest({
    profile: __ENV.LOAD_PROFILE ?? "smoke",
    targetUrl: BASE,
    workspaceId: WORKSPACE_ID,
    scenarios: PLANNED_SCENARIOS,
    metrics: {
      iterations: data?.metrics?.iterations,
      vus_max: data?.metrics?.vus_max,
      http_reqs: data?.metrics?.http_reqs,
      load_requests: data?.metrics?.load_requests,
      testRunDurationMs: data?.state?.testRunDurationMs,
    },
    setupOps: ["origin_probe"], // the one planned setup operation
  });
  return {
    [out]: JSON.stringify(data, null, 2),
    [out.replace(/\.json$/, "-manifest.json")]: JSON.stringify(
      manifest,
      null,
      2,
    ),
    stdout: `\nload run complete — summary ${out}\n`,
  };
}
