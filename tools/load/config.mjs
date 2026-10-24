// K6-GATE shared configuration + classification — the pure half of
// trial-gate.js. No k6 imports here: this module is loaded both by the
// k6 script (which supplies TARGET_URL/etc. via env) and by the unit
// tests, so the workload contract and response classification are
// tested directly instead of being re-derived from a live run.

export const LOOPBACK =
  /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/;

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
  // ramp crossover. `hold500` (LOAD_HOLD500_MIN, off by default) adds
  // the sustained-500 window the pass criterion is measured at; without
  // it the report marks 500-session evidence "not collected".
  gate: {
    scenarios: {
      ramp: {
        executor: "ramping-vus",
        stages: [{ duration: "10m", target: 750 }],
      },
      hold500: {
        executor: "constant-vus",
        vus: 500,
        // duration + startTime resolved at config time from LOAD_HOLD500_MIN
        duration: "0s",
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

export function nonNegInt(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0;
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

/**
 * Validate the run configuration. Returns an error string or null.
 * `env` is the k6 `__ENV` map (plain object in tests).
 */
export function configError(env, fixtures) {
  const url = env.TARGET_URL;
  if (typeof url !== "string" || url.length === 0)
    return "TARGET_URL is required — the load target is never implied";
  if (!/^https?:\/\//.test(url)) return "TARGET_URL must be absolute http(s)";

  const maxVus = env.LOAD_MAX_VUS ?? "750";
  if (!nonNegInt(maxVus) || Number(maxVus) < 1)
    return `LOAD_MAX_VUS must be a finite positive integer, got ${JSON.stringify(env.LOAD_MAX_VUS)}`;

  if (!PROFILES[env.LOAD_PROFILE ?? "smoke"])
    return `unknown LOAD_PROFILE ${JSON.stringify(env.LOAD_PROFILE)}`;

  if (env.LOAD_HOLD500_MIN !== undefined && !nonNegInt(env.LOAD_HOLD500_MIN))
    return `LOAD_HOLD500_MIN must be a non-negative integer, got ${JSON.stringify(env.LOAD_HOLD500_MIN)}`;

  if (!LOOPBACK.test(url)) {
    // Remote load needs BOTH the explicit opt-in AND the fixture-recorded
    // target identity — a bare flag is not production protection.
    if (env.LOAD_ALLOW_REMOTE !== "1")
      return "non-loopback TARGET_URL requires LOAD_ALLOW_REMOTE=1";
    if (!fixtures?.targetId)
      return "remote TARGET_URL requires fixtures carrying targetId";
    if (env.LOAD_TARGET_ID !== fixtures.targetId)
      return `remote TARGET_URL requires LOAD_TARGET_ID=${JSON.stringify(fixtures.targetId)}`;
  }
  return null;
}

/**
 * Resolve a profile's scenarios with stage/VU bounds enforced.
 * Throws on malformed shapes or bounds violations. LOAD_HOLD500_MIN>0
 * materializes the hold500 scenario and shifts the soak start time.
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
 *   success            2xx, no refusal signal in a JSON body
 *   refusal            non-2xx carrying a structured refusal
 *   concealed_refusal  2xx carrying a refusal body — never success
 *   redirect           3xx (redirects are disabled; auth loss shows here)
 *   http_error         other non-2xx
 *   transport          k6-level failure (status 0 / res.error)
 */
export function classifyResponse(status, transportError, body) {
  if (status === 0 || transportError) return "transport";
  let refusal = false;
  if (body && typeof body === "object") {
    if (body.error || body.ok === false) refusal = true;
    else if (
      typeof body.state === "string" &&
      /^(denied|forbidden|not_available|refused|unauthorized)/i.test(body.state)
    )
      refusal = true;
  }
  if (status >= 300 && status < 400) return "redirect";
  if (refusal) return status < 300 ? "concealed_refusal" : "refusal";
  return status < 300 ? "success" : "http_error";
}
