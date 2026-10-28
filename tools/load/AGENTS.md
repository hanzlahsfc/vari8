# AGENTS.md - tools/load/

<!-- Hand-written notes go below this line. Everything outside the two markers
     is preserved verbatim by `npm run index`; only the generated block is rewritten. -->

K6-GATE (issue #178): executable load-test tooling. `trial-gate.js` is
the k6 script (smoke + gate profiles, loopback-only unless
`LOAD_ALLOW_REMOTE=1`), `provision.ts` creates/cleans the task-owned
`loadgate-*` fixture workspace, `resources.mjs` samples CPU/RAM/PG
connections, `report.mjs` emits the acceptance table + verdict. See
`README.md` for the run contract. `tools/load/out/` is uncommitted.
