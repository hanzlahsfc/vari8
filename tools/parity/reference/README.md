# Reproducible visual reference proposal — issue #205 / draft PR #206

Status: owner-adopted proposal, still requiring independent review and PR #203 before activation. No parity waiver, baseline activation or merge.

This tooling is stacked on unmerged PR #203 at `90c16bee63e2609ebc4f09e91459332390562464`. It imports that code's process/TLS/cookie helpers and derives a hash-recorded capture adapter from its exact committed capture module. Existing `capture.mjs` and `baseline/` are unchanged; `compare.mjs` gains only the exact owner-ruled S03-18 recorder-copy/geometry disposition. This PR must not be independently landed without its dependency.

## Authority and contract

`contract.json` records the explicit owner-overriding D32 contract adopted by Prompt 417 from `icm/03-plan/DECISIONS.md`: 09:00 Vienna fixed clock, bounding-box differences <=1 CSS pixel, exact text/role/accessible name, pixelmatch 7.1.0 threshold 0.1/default `includeAA=false`, changed fraction <=0.001 independently for the main screenshot and every scroll image. Size and scroll-coverage differences always fail. The three pre-existing allowance rules and their 14px masks remain unchanged; Prompt 417 adds only the exact S03-18 text/geometry rule. No environment budget overrides are accepted by this lane.

The legacy implementation uses 10:00/.5px/zero channel and pixel budgets. Its verifier receipts explain the zero-tolerance change, but do not amend the higher-priority owner D32 document. The contract was chosen and committed before captures, not selected by results. Strict .5px/zero-pixel diagnostics are also reported on the 09:00 images; they are not a fresh run of the legacy 10:00 gate. Any owner change to D32 requires a corresponding separately reviewed contract update; document drift fails closed.

Reference authority is the historical frontend at `c78311042edcc2f96350a132c682782d8da1b6a7`, with its exact locks. `17352b0`/`55a0f08`/`706fe2f` share the predecessor frontend tree; only 15 test/check files differ through c783110. Recoverable production capture source does not require unavailable merge-proto 58eb6ed. Later FRONTEND publications, including #151/#204 and open CANVAS-PORT #188, are separate product evolution and are not silently imported here.

s04 uses the accepted template-navigation Habits state, not historical right-panel switches/Tabs. Other recipes remain unchanged. Root-app screenshots are prohibited as expected output. Existing S11-03 sign-out/D18 role/S11-04 workspace allowances are preserved without expansion, plus the exact Prompt-417 S03-18 recorder rule. Unrelated root differences remain findings.

## Procedure

1. Create isolated exact historical/candidate checkouts, initially clean. Use Node 24.22.1. Provision the historical frontend and root app from their exact lockfiles. Install this tool's separately pinned dependencies with `npm ci --prefix tools/parity/reference --ignore-scripts`. Do not change either source lockfile. `installedDependencies` checks installed package version/integrity and hashes all installed files/symlinks, including generated files, for the receipt.
2. Create a task-owned disposable loopback PostgreSQL database `app_<lane>`. Supply `DATABASE_URL`, eight synthetic `SEED_*` credentials, matching `BETTER_AUTH_SECRET`/`AUTH_SECRET`, real loopback HTTPS auth origin, `APP_ENV=development`, `NEXT_TELEMETRY_DISABLED=1`. Run Prisma generate/migrate and the full `scripts/seed/index.ts`. Do not use shared databases. Secrets stay outside git/evidence.
3. Build `historical/frontend` and the candidate with their local `next build --webpack`, using Node24. Record command/exits/build IDs. On this lane both use Next16.3.8.
4. Commit tooling before capture so its SHA is pinned. Run:

   ```sh
   node tools/parity/reference/establish.mjs \
     --reference-source /absolute/isolated/historical \
     --candidate-source /absolute/isolated/candidate \
     --out /absolute/new/evidence-directory
   ```

   Ports 55940–55945 must be free. The runner refuses wrong/dirty sources, uses two independent historical servers/browsers and one current server, validates all 70 screen contracts and every scroll offset/file, and cleans only its registered servers/proxies. Every run records source/tree/locks/dependency bytes, Node/PW/browser executable hashes, OS/GPU/launch/color settings, CDP roles/names and actual font resolution. The adapter changes only source path, D32 clock and post-image metadata. All screenshot settings and accepted ownership/cookie/HTTPS/capture validation remain inherited from #203.

5. Inspect `results.json`, `stability.json`, `all-70-comparison.json`, full manifests and `old-proposed-artifact-map.json`. Distinguish reference capture validity, repeated byte stability, canonical root parity and strict diagnostics. Stop on incomplete/invalid/unstable reference evidence; never replace expected pixels with root images. Publish a proposed copy under `proposed/` only after two valid bit-identical runs. `tools/parity/baseline/` remains untouched.

## Portability

The measured environment is macOS 27.0 build26A428/Darwin27 arm64, Node24.22.1, Playwright1.63.0, Chromium headless-shell build1243/153.0.8010.12. Actual hashes/GPU/launch/font records live with the proposal. This is a repeatable procedure for the recorded macOS host, not a promise of bit portability to Linux, macOS hosted-runner images or a changing browser/GPU stack. Intended reference-host access or an owner-approved pinned host/VM image is required before asserting portability. No Actions are started.
