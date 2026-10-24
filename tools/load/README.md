# K6-GATE — trial load gate (issue #178)

Executable load-test tooling for the 500-concurrent-session gate. The
100-user local run (`messages.md`, external) stays the baseline only.

## Components

| File            | Purpose                                                                                                                                                   |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trial-gate.js` | k6 script — `smoke` profile (bounded local check) and `gate` profile (the acceptance workload: ramp 0→750 VUs/10 min, then 2 h soak at 250).              |
| `provision.ts`  | Creates a `loadgate-<ts>` workspace with sign-in coaches/clients + assignments; `cleanup` deletes exactly the recorded ids.                               |
| `resources.mjs` | NDJSON sampler: app/DB CPU %, app RAM, `pg_stat_activity` connection count vs `max_connections`. Runs on the target host.                                 |
| `report.mjs`    | Parses the k6 summary/stream + resources file into the acceptance table (p50/p95/p99 per endpoint, error rate, rps, CPU/RAM/connections) and the verdict. |

## Safety contract

- `TARGET_URL` must be supplied explicitly. Non-loopback targets are
  refused unless `LOAD_ALLOW_REMOTE=1` is set — the script cannot aim
  at production by accident.
- `LOAD_MAX_VUS` caps every profile (default 750).
- Every session is a `@loadgate.invalid` fixture user in its own
  workspace — no real account, workspace or client data is touched, and
  cleanup only deletes ids it recorded.
- A response is a **success** only when 2xx _and_ its JSON body carries
  no `error` object — a 200 concealing an application refusal is counted
  as `concealed_refusal` and fails the verdict.

## Local bounded smoke run

```bash
tsx tools/load/provision.ts create --clients 9 --coaches 3 \
  --out tools/load/out/fixtures.json          # DATABASE_URL env
k6 run -e TARGET_URL=http://127.0.0.1:3000 \
  -e FIXTURES=tools/load/out/fixtures.json \
  -e LOAD_PROFILE=smoke tools/load/trial-gate.js
node tools/load/report.mjs tools/load/out/summary.json \
  tools/load/out/resources.ndjson <durationSec>
tsx tools/load/provision.ts cleanup --file tools/load/out/fixtures.json
```

## Staging gate (separate, authorized step)

`LOAD_PROFILE=gate`, `LOAD_ALLOW_REMOTE=1`, a generator host separate
from the app host, `resources.mjs` running on the app/DB host, and the
500-session acceptance row judged by `report.mjs`. Staging deployment
and remote targeting are **not** part of this lane.
