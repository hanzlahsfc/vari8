// K6-GATE shared configuration + classification — the pure half of
// trial-gate.js. No k6 imports here: this module is loaded by the k6
// script, by report.mjs and by the unit tests, so the workload
// contract and response classification are tested directly instead of
// being re-derived from a live run.

export const LOOPBACK =
  /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/;

// Every class a measured point may carry — the single source of truth
// for trial-gate.js, report.mjs and the tests.
export const CLASSES = [
  "success",
  "refusal", // non-2xx/3xx with a structured or state-based denial
  "concealed_refusal", // 2xx carrying a refusal body
  "redirect", // 3xx — redirects are disabled on measured requests
  "http_error", // other non-2xx
  "transport", // k6-level failure (status 0 / res.error)
  "unexpected_html", // non-JSON body on a JSON-expecting endpoint
  "login_page", // HTML page that looks like the login form
  "identity_mismatch", // session body names a different/unknown user
];

// Refusal states seen in structured `state` fields — extended for
// consent/availability denials; anything not a denial stays success.
const STATE_DENIAL =
  /^(denied|forbidden|not_available|refused|unauthorized|consent|missing|revoked|expired)/i;

export const PROFILES = {
  // Bounded local check — proves the harness, measures nothing official.
  smoke: {
    scenarios: {
      smoke: {
        executor: "ramping-vus",
        stages: [
          { duration: "10s", target: 5 },
          { duration: "15s", target: 5 },
          { duration: "5s", target: 0 },
        ],
      },
    },
  },
  // The issue's acceptance workload: ramp 0→750 over 10 min (1.5× the
  // 500 target), then a 2 h soak at 250. The profile as specified never
  // HOLDS 500 VUs — the only 500-concurrent moment is the transient
  // ramp crossover. `hold500` is REQUIRED for the gate: LOAD_HOLD500_MIN
  // must be supplied and is the recorded unresolved owner decision —
  // without it the gate refuses to run rather than certify nothing.
  gate: {
    scenarios: {
      ramp: {
        executor: "ramping-vus",
        stages: [{ duration: "10m", target: 750 }],
      },
      hold500: {
        executor: "constant-vus",
        vus: 500,
        duration: "0s", // replaced at config time by LOAD_HOLD500_MIN
        startTime: "10m",
      },
      soak: {
        executor: "constant-vus",
        vus: 250,
        duration: "120m",
        startTime: "10m",
      },
    },
  },
};

// Endpoint roles — which measured endpoints must appear in a complete
// run, and whether each expects a JSON body. Auth/setup traffic
// (sign_in, session_verify, reauth) is accounted separately and can
// never satisfy workload coverage.
export const WORKLOAD_ENDPOINTS = {
  coach: ["session", "clients", "workspace_page"],
  client: ["session", "client_home", "checkins_page", "client_daily"],
};
export const JSON_ENDPOINTS = new Set([
  "session",
  "clients",
  "session_verify",
  "sign_in",
  "reauth",
]);
export const AUTH_ENDPOINTS = new Set(["sign_in", "session_verify", "reauth"]);
// Endpoints whose success body MUST name the authenticated fixture
// user — a wrong/missing user id is identity_mismatch, never success.
export const IDENTITY_ENDPOINTS = new Set(["session", "session_verify"]);

export function nonNegInt(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0;
}

/**
 * Validate the run configuration. Returns an error string or null.
 * `env` is the k6 `__ENV` map (plain object in tests).
 *
 * Remote execution is DISABLED in this lane: no accepted remote-target
 * mechanism exists yet (an approved staging identity/attestation is a
 * prerequisite the issue records separately). LOAD_ALLOW_REMOTE alone
 * never authorizes a non-loopback target.
 */
export function configError(env, fixtures) {
  const url = env.TARGET_URL;
  if (typeof url !== "string" || url.length === 0)
    return "TARGET_URL is required — the load target is never implied";
  if (!/^https?:\/\//.test(url)) return "TARGET_URL must be absolute http(s)";

  const maxVus = env.LOAD_MAX_VUS ?? "750";
  if (!nonNegInt(maxVus) || Number(maxVus) < 1)
    return `LOAD_MAX_VUS must be a finite positive integer, got ${JSON.stringify(env.LOAD_MAX_VUS)}`;

  const profile = env.LOAD_PROFILE ?? "smoke";
  if (!PROFILES[profile])
    return `unknown LOAD_PROFILE ${JSON.stringify(env.LOAD_PROFILE)}`;

  if (env.LOAD_HOLD500_MIN !== undefined && !nonNegInt(env.LOAD_HOLD500_MIN))
    return `LOAD_HOLD500_MIN must be a non-negative integer, got ${JSON.stringify(env.LOAD_HOLD500_MIN)}`;
  if (profile === "gate" && !(Number(env.LOAD_HOLD500_MIN ?? "0") > 0))
    return "LOAD_PROFILE=gate requires LOAD_HOLD500_MIN — the 500-session hold duration is an unresolved acceptance decision";

  if (!LOOPBACK.test(url))
    return "non-loopback TARGET_URL is disabled in this lane — remote execution requires a separately approved target mechanism (see README)";
  if (!fixtures?.workspaceId) return "fixtures must carry workspaceId";
  return null;
}

/**
 * Resolve a profile's scenarios with stage/VU bounds enforced.
 * Throws on malformed shapes or bounds violations. LOAD_HOLD500_MIN
 * materializes the hold500 scenario and shifts the soak start.
 */
export function scenariosWithBounds(env) {
  const maxVus = Number(env.LOAD_MAX_VUS ?? "750");
  const profile = env.LOAD_PROFILE ?? "smoke";
  const def = PROFILES[profile];
  const sc = {};
  const holdMin = Number(env.LOAD_HOLD500_MIN ?? "0");
  for (const [name, s] of Object.entries(def.scenarios)) {
    const spec = { ...s };
    if (name === "hold500") {
      if (!(holdMin > 0)) continue;
      spec.duration = `${holdMin}m`;
      spec.startTime = "10m";
    }
    if (name === "soak" && holdMin > 0) spec.startTime = `${10 + holdMin}m`;
    const peak =
      spec.executor === "constant-vus"
        ? spec.vus
        : Math.max(...spec.stages.map((st) => st.target));
    if (!(peak > 0) || peak > maxVus)
      throw new Error(
        `scenario ${name} peak ${peak} is outside 1..LOAD_MAX_VUS=${maxVus}`,
      );
    for (const st of spec.stages ?? [])
      if (
        typeof st.duration !== "string" ||
        st.duration.length === 0 ||
        !nonNegInt(st.target)
      )
        throw new Error(`malformed stage in scenario ${name}`);
    if (spec.executor === "constant-vus" && !nonNegInt(spec.vus))
      throw new Error(`malformed vus in scenario ${name}`);
    sc[name] = spec;
  }
  return sc;
}

/**
 * The shared response contract — trial-gate.js calls this with the raw
 * k6 response fields so the same logic is unit-tested outside k6.
 *   status           http status (0 = transport failure)
 *   transportError   k6 res.error string, if any
 *   body             parsed JSON body, or null for non-JSON
 *   ctx.expectJson   the endpoint expects JSON (API routes)
 *   ctx.looksLikeLogin  caller-detected login-form HTML body
 */
export function classifyResponse(status, transportError, body, ctx = {}) {
  if (status === 0 || transportError) return "transport";
  let refusal = false;
  if (body && typeof body === "object") {
    if (body.error || body.ok === false) refusal = true;
    else if (typeof body.state === "string" && STATE_DENIAL.test(body.state))
      refusal = true;
  }
  if (status >= 300 && status < 400) return "redirect";
  if (refusal) return status < 300 ? "concealed_refusal" : "refusal";
  if (status >= 300) return "http_error";
  // 2xx from here.
  if (ctx.looksLikeLogin) return "login_page";
  if (ctx.expectJson && !body) return "unexpected_html";
  // Endpoints that answer with the authenticated identity must answer
  // with THE fixture identity — a 200 naming another/unknown user is
  // measured failure.
  if (ctx.expectUserId && body?.user?.id !== ctx.expectUserId)
    return "identity_mismatch";
  return "success";
}

/**
 * Identity verification — a 200 session body is only "verified" when it
 * names the expected fixture user. The caller records the response with
 * the returned class (never success on a mismatch).
 */
export function verifyIdentity(status, body, expectedUserId) {
  if (status === 200 && body?.user?.id === expectedUserId) return "success";
  return "identity_mismatch";
}

/** "10m" → 600, "90s" → 90, "1h30m" → 5400. Throws on malformed. */
export function durationToSec(s) {
  if (typeof s !== "string" || s.length === 0)
    throw new Error(`malformed duration ${JSON.stringify(s)}`);
  let rest = s;
  let total = 0;
  const re = /(\d+)(h|m|s)/g;
  let m;
  let matched = 0;
  while ((m = re.exec(rest))) {
    matched++;
    total += Number(m[1]) * (m[2] === "h" ? 3600 : m[2] === "m" ? 60 : 1);
  }
  const consumed = rest.replace(/\d+(h|m|s)/g, "");
  if (consumed.length > 0 || matched === 0)
    throw new Error(`malformed duration ${JSON.stringify(s)}`);
  return total;
}

/**
 * The run manifest — built from the CONFIGURED profile (not observed
 * results) plus measured counters, so report.mjs can verify the run
 * against the plan instead of trusting summary assertions.
 * `scenarios` = the configured map; `planned` records each phase's
 * expected VU count and duration in seconds.
 */
export function buildManifest({
  profile,
  targetUrl,
  workspaceId,
  scenarios,
  metrics,
  setupReqs,
}) {
  const planned = {};
  for (const [name, s] of Object.entries(scenarios)) {
    if (s.executor === "constant-vus") {
      planned[name] = {
        vus: s.vus,
        durationSec: durationToSec(s.duration),
      };
    } else {
      planned[name] = {
        vus: Math.max(...s.stages.map((st) => st.target)),
        durationSec: s.stages.reduce(
          (n, st) => n + durationToSec(st.duration),
          0,
        ),
      };
    }
  }
  return {
    tool: "k6-gate",
    profile,
    targetUrl,
    workspaceId,
    scenarios: Object.keys(scenarios),
    planned,
    expectedWorkloadEndpoints: [
      ...WORKLOAD_ENDPOINTS.coach,
      ...WORKLOAD_ENDPOINTS.client,
    ],
    authEndpoints: [...AUTH_ENDPOINTS],
    setupReqs: setupReqs ?? 1,
    iterations: metrics?.iterations?.values?.count ?? null,
    vusMax: metrics?.vus_max?.values?.value ?? null,
    httpReqs: metrics?.http_reqs?.values?.count ?? null,
    loadRequests: metrics?.load_requests?.values?.count ?? null,
    testRunDurationMs: metrics?.testRunDurationMs ?? null,
  };
}

/** Parse a docker-size string ("1.2GiB", "512MiB", "700KiB") → MB. */
export function memToMb(s) {
  const m = /^([\d.]+)\s*(B|KiB|MiB|GiB|KB|MB|GB)?/i.exec(String(s).trim());
  if (!m) return null;
  const n = parseFloat(m[1]);
  switch ((m[2] ?? "MB").toUpperCase()) {
    case "B":
      return n / 1048576;
    case "KIB":
    case "KB":
      return n / 1024;
    case "MIB":
    case "MB":
      return n;
    case "GIB":
    case "GB":
      return n * 1024;
    default:
      return null;
  }
}
