# K6-GATE — issue #178 trial load gate (test implementation)

Head: see `git log` on `beta/k6-gate`. Base: `Vari8-Beta` @
`2214105` (post-#193 merge).

## Scope delivered — the executable test, not the staging run

`tools/load/` — four components, all wired:

- **`trial-gate.js`** — the k6 script.
  - `LOAD_PROFILE=gate`: ramp 0→750 VUs over 10 min (1.5× target), then
    a 2 h soak at 250 — the issue's acceptance workload verbatim.
  - `LOAD_PROFILE=smoke`: 5 VUs / 35 s — the bounded local check.
  - Workload mix: every third VU is a fixture coach (session API →
    clients API → workspace home page); other VUs are fixture clients
    (session API → `/home` → `/check-ins` → `/daily`) — all routes
    verified to return 200 for the matching fixture role on the real
    stack before being admitted to the mix. Per-VU sign-in once, then
    k6's cookie jar replays the session; 1–3 s think times.
  - Classification per request: `success` | `refusal` (structured
    `{error.code}` body) | `concealed_refusal` (2xx carrying `error` —
    counted and fails the run) | `http_error` | `transport`.
- **`provision.ts`** — `create` builds a `loadgate-<ts>-<rand>`
  workspace with N sign-in clients + coaches (Better Auth credential
  rows via `hashPassword`, ACTIVE memberships, PRIMARY assignments);
  `cleanup --file` deletes exactly the recorded ids in FK order.
- **`resources.mjs`** — NDJSON sampler: app CPU/RAM (docker container
  or host PID via `ps`), DB CPU, `pg_stat_activity` count vs
  `max_connections`. Runs wherever the app+DB run.
- **`report.mjs`** — parses the k6 `--out json` stream (or summary) +
  resources file into the acceptance table: per-endpoint p50/p95/p99,
  error rate, rps, CPU/RAM/connection peaks; names the slowest endpoint
  and the first saturated resource; prints the verdict and exits
  nonzero on FAIL.

## Safety properties (all live-verified)

- Refuses to run without `TARGET_URL`; a non-loopback target aborts at
  init unless `LOAD_ALLOW_REMOTE=1` — verified:
  `k6 run -e TARGET_URL=https://vari8.example.com …` →
  `k6-gate config: non-loopback TARGET_URL requires LOAD_ALLOW_REMOTE=1`,
  zero requests sent.
- `LOAD_MAX_VUS` (default 750) bounds every profile at init.
- Fixture isolation: only `@loadgate.invalid` users in a `loadgate-*`
  workspace. Cleanup verified against real PG: after `cleanup`, zero
  `loadgate.invalid` users and zero `loadgate-*` workspaces remain;
  `canvas-demo` and `seed-second-workspace` untouched (2 workspaces
  before and after).
- `tools/load/out/` is gitignored; fixture files (which contain the
  random fixture passwords) are deleted by cleanup.

## Acceptance semantics established

- "500 concurrent" = active VUs; the gate's pass row is judged at the
  issue's numbers (p95<400ms, p99<1000ms, err<0.5%, CPU<70%, pg conns
  under limit) — thresholds come from the issue text; no invented
  values.
- `refusal` vs `http_error` are distinct classes — a structured
  `{error.code}` denial is investigated, not merged into "errors".
- An unmeasured resource cannot pass: `CPU measured` is itself a check
  — inconclusive is not green.

## Local demonstration (bounded — NOT the gate)

Target: production `next start` build of the merged head, flag on, real
seeded lane DB (`app_chkenable_live`), behind the e2e TLS proxy
(`https://127.0.0.1:3870` configured origin — the app's production
https requirement stays enforced).

`k6 run -e LOAD_PROFILE=smoke … --out json=k6.ndjson` — 5 VUs, 35 s:

| endpoint       | count | p50  | p95   | p99   |
| -------------- | ----- | ---- | ----- | ----- |
| session        | 35    | 3ms  | 11ms  | 21ms  |
| clients        | 11    | 2ms  | 17ms  | 17ms  |
| checkins_page  | 24    | 6ms  | 36ms  | 43ms  |
| client_daily   | 24    | 5ms  | 46ms  | 49ms  |
| client_home    | 24    | 5ms  | 66ms  | 119ms |
| workspace_page | 11    | 6ms  | 65ms  | 65ms  |
| sign_in        | 5     | 57ms | 158ms | 158ms |

134 requests, 0 refusals, 0 errors, 3.7 rps; resources sampled (app PID
CPU ~0%, DB CPU <1%, pg connections 11/100). Verdict PASS at smoke
scale. **Slowest endpoint: sign_in** (real scrypt password hashing —
expected; it is once per session, not per request).

These numbers describe one laptop, not capacity — they prove the
harness works end to end, nothing more.

## Gates

- `npm run test` — 104 files / 1212 tests, 0 failures (incl. the new
  `load-gate.test.ts`, 8 tests: percentiles, per-endpoint/class
  aggregation, concealed-refusal fails the verdict, clean-run pass +
  slowest naming, CPU>70% fails with `firstSaturated`, unmeasured CPU
  fails, malformed-line skipping, resource peaks).
- `npm run typecheck` — 0. `npm run lint` — 0 errors, 0 warnings in
  the lane's files (81 pre-existing elsewhere). `format:check` 0.
  `npm run index` + `index:check` — regenerated, clean.
- Mutation note: the concealed-refusal assertion in the unit suite
  fails if `concealed` is excluded from the failure count — the
  "200 must not hide a refusal" requirement is tested, not just coded.

## Not done — the blocked half

- **Staging execution is not authorized or performed**: no deployed
  stack (issue #5 dependency), no separate load-generator host, no
  2 h soak run. The `gate` profile is implemented and config-validated
  but has never run; `LOAD_ALLOW_REMOTE` exists for that step.
- The "500 concurrent sessions" decision is recorded in the issue as a
  decision-needed with a recommendation — the issue's numbers are used
  as the gate; if the owner rules otherwise the thresholds constant
  sits at the top of `report.mjs`.
- Resource sampling needs the app container/PID and DB container names
  for the staging host; `resources.mjs` is host-agnostic but must run
  _on_ the staging host (or against its docker daemon).
