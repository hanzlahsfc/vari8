# VISUAL-REFERENCE — historical canvas reference proposal (#205 / PR #206)

Status: **OWNER-ADOPTED PROPOSAL, NOT ACTIVATED**. This is a builder handoff for independent review.
Base/dependency: PR #203 `90c16bee63e2609ebc4f09e91459332390562464` (unmerged).
Issue #202 remains open; no merge, deployment, Actions, waiver or visual acceptance is claimed.

## Authority and contract

`tools/parity/reference/contract.json` records the owner-overriding D32 contract:

- Historical frontend source: `c78311042edcc2f96350a132c682782d8da1b6a7`
  (frontend tree `36ceaf8eadc010369ed48ab5158682f2bf9d55de`).
- Fixed clock `2026-10-19T09:00:00+02:00`, timezone `Europe/Vienna`.
- Geometry: every visible element's role/accessible name/text and bounding box within 1 CSS pixel.
- Pixelmatch 7.1.0 threshold 0.1, `includeAA=false`; changed fraction <= 0.001 for the main image and
  each scroll image; size differences always fail.
- Existing allowances S11-03, D18 and S11-04 are unchanged; Prompt 417 adds exact S03-18 only.
- Implemented 10:00/.5px/zero-pixel-budget settings are retained only as a separately named strict
  diagnostic; they do not amend D32. The contract was committed before captures.

Reference source and candidate were isolated clean checkouts. The candidate is the current root app;
historical captures are never replaced by current-root screenshots. Later FRONTEND publications are
not imported.

## Historical reference runs

Two independent reference server/browser runs:

- `reference-run-1`: base URL `https://127.0.0.1:55940`, 70 screens, 0 failures, 0 retries.
- `reference-run-2`: base URL `https://127.0.0.1:55942`, 70 screens, 0 failures, 0 retries.
- `stability.json`: reference canonical 70/70; strict 70/70; `hashMismatches: []`.
- Image/geometry/scroll artifacts are byte-identical across the two runs.
- All 70 screens pass route/query/hash/content/selected-state validation and full scroller coverage.
- Original baselines are preserved; `originalsUnchanged: true`; `preserved-original-artifacts.json`
  records all old hashes. No old baseline file was overwritten.

Proposed artifacts are under `tools/parity/reference/proposed/`: reference images and geometry,
manifest, provenance, stability, comparison results, old hash list and the old→proposed map. The
mapping retains 272 entries; the proposal contains 245 files: 244 mapped proposed artifacts plus
`old-proposed-artifact-map.json` itself. The 28 unpaired map paths are old-only scroll/capture
artifacts whose historical replacement offsets/artifacts are intentionally absent. The old
`tools/parity/baseline/` remains byte-identical.

## Provenance/environment

From `provenance.json`:

- Source `c783110...`; root tree `5a654716...`; frontend tree `36ceaf8...`.
- Exact historical root/app lock hashes and installed dependency tree hash recorded.
- macOS Darwin 27.0.0 arm64, Node `v24.22.1`, Playwright `1.63.0`,
  Chromium headless-shell `153.0.8010.12` (build 1243), executable hash recorded.
- Screenshot settings: deviceScaleFactor 1; 1440x900/390x844; `Europe/Vienna`; fixed clock;
  font readiness; animation/transition freeze; service workers blocked; fixed seed.
- Actual CDP font/GPU/launch records are in the provenance receipt.

This is reproducibility for the recorded macOS host, not a Linux/hosted-CI portability claim. No
Actions ran.

## Contract self-validation

The retained reference/candidate provenance still contains the pre-adoption v1 contract. Compatibility is a closed, named `retained-v1-to-approved-v2` transition:

- version 2 is the exact owner-adopted contract; retained v1 (absent version) is the exact historical shape;
- every required field must match the applicable schema exactly; missing or unknown fields fail;
- authority, `implementedAlternative`, source/tree identities, clock, timezone, geometry budget, pixelmatch threshold/AA, device scale factor, viewports, expected screens, s04 state, root trees and portability are all checked exactly;
- allowances are the exact approved sets, never a caller-selected subset; empty or missing sets fail;
- the comparer's exact allowance rule identities and labels are checked independently;
- no administrative field is normalized; original provenance is never rewritten.

Tests cover every SWE-2 probe (authority, `implementedAlternative`, unknown fields, empty/subset/missing/unknown allowances, administrative changes), the positive retained-v1-to-approved-v2 case, the historical v1 provenance, and allowance-rule contents.

## Durable comparison evidence

`tools/parity/reference/evidence/` is a committed, reviewer-accessible package independent of the local p414 outputs:

- candidate: 237 files (233 referenced screen artifacts + manifest/provenance/validated-artifacts/server-ownership);
- reference: 245 files (244 mapped/package artifacts + mapping file);
- evidence directory: 246 files; artifact index: 482 entries; old baseline: 242 files unchanged; old→proposed map: 272 entries.
- `artifact-hashes.json`, `comparer.json`, `recompare.mjs`, `verify-evidence.mjs`, `evidence-lib.mjs`.
- `receipts/canonical.json`, `receipts/strict.json`, `receipts/metadata.json` are **new recomparisons**, not original receipts or new captures. The metadata is `receiptVersion: 2` and pins the reviewed execution closure: `reference.mjs`, `reference/compare.mjs`, legacy `compare.mjs`, `capture.mjs`, `capture-metadata.mjs`, `recompare.mjs`, `verify-evidence.mjs`, `evidence-lib.mjs`, both lockfiles, direct dependency pins, contract and comparer manifest.
- `comparer.json` is the reviewed pin manifest (`visual-reference-comparer-v2`); its current SHA is `8bc293554f2d31d11beaf009efa18cfcff09371feafb2c60e0fb50a0bf6d080d`. Changing a pinned component or lock fails verification and `recompare` refuses to generate receipts until the pins are explicitly reviewed/updated.
- No self-hash loop: the manifest does not hash itself; metadata hashes the manifest but not itself; generated receipt result files are excluded. Artifact-index and shot-index hashes are inputs; the 482 artifacts are verified separately. Historical receipts have no comparer provenance; that limitation is preserved and disclosed.
- Candidate captures contain synthetic application data, but provenance also retains local absolute paths, browser command lines, process IDs/start times and ownership metadata. The package is therefore **not purely synthetic**. No credentials/tokens/keys/database URLs/auth secrets were found; local runtime metadata is retained for reproducibility and any redaction needs separate owner authorization.

Allowances actually applied: D18 and S11-04 on s03-checkin-review@1440 and other 1440 screens; S11-03 on s11-preferences; S03-18 on both s03-checkin-review widths. No allowance/mask was added beyond the owner-approved S03-18 exact rule.

## Current root comparison

`candidate-run` against the proposed historical reference:

- Historical pre-decision receipt: **68/70** under canonical and strict diagnostics; preserved unchanged.
- Both pre-decision failures were geometry/text/role/name for `s03-checkin-review@390` and `@1440`: the
  historical button reads **“Record demo video feedback”**; the current root reads **“Record video
  feedback”**. Button width changes `244.5 → 205.5` px (**39px**) at both widths. Pixels remain within
  the canonical budget (`624`/`625` changed); geometry failed independently.
- Post-decision recomputation from the existing reference/candidate artifacts: **canonical 70/70 pass**,
  **strict diagnostic 68/70**. The strict diagnostic still fails s03 pixels only; it remains separate and
  non-canonical. No capture was rerun.
- Current root screenshots are never used as expected output.
- Evidence: `tools/parity/reference/evidence/receipts/{canonical,strict}.json`; historical `all-70-comparison.json` remains 68/70. New receipts are recomparisons, not original captures.

### s03 copy disposition — Prompt 417

Historical `frontend/src/components/coach/media.tsx:264-265` (source `c783110`) uses the demo copy.
The real recorder added by PR-MEDIA commit `21d8fc0` introduced “Record video feedback” at
`components/canvas/coach/demo-recorder.tsx:203`; `e355c59` wired the real recorder into the root
canvas chain. Prompt 417 keeps the real-recorder copy and accepts the demonstrated 39px narrower
button as exact rule S03-18.

The disposition uses the existing stem-scoped ruled-change mechanism: exact tag, historical text,
current text, screen, and exact `244.5×44 → 205.5×44` button geometry must match. Only that exact text
and geometry consequence is disposed; no pixel mask, global tolerance, current-root expectation,
unrelated text/width or whole-screen mask is allowed. Canonical pixels remain within the ordinary budget;
strict pixel comparison remains the separate 68/70 diagnostic.

## Verification

Task-local runs on Node `v24.22.1`:

- Unit/validation: **106 files / 1286 tests**, exit 0 (fresh final run).
- Focused reference tests: **16/16**, exit 0 (fresh Prompt 425 run).
- Typecheck: exit 0. Lint: exit 0, 0 errors / 81 warnings. Format: exit 0.
- Index generation/check: exit 0; historical/candidate source trees remain exact.
- Build: exit 0; historical and candidate builds were also 0 under their lockfiles.
- `git diff --check`: 0; old baseline diff: 0.
- Reference runs: 2 x 70/70, zero failures/retries, bit-identical.
- No full 70-screen rerun was performed for this comparison-only change; the two valid reference runs and
  existing current-root capture are the task evidence. No full E2E suite was rerun for this evidence-only
  packaging.
- Canonical comparison recomputed: **70/70**; strict diagnostic recomputed: **68/70**. Historical 68/70 is
  preserved. The proposed reference remains unactivated; no baseline was refreshed.
- Clean detached checkout at code/evidence commit `11bfe70` under a path containing spaces and
  non-ASCII characters (`.../PR 425 – référence/clean checkout`), Node v24.22.1; lockfile installs at
  root and `tools/parity/reference`; no `outputs/p414` input:
  `verify-evidence.mjs` exit 0 with 482 artifacts, canonical 70/70 and strict 68/70;
  two `recompare.mjs` runs had identical stdout and receipt bytes (canonical
  `f92a5d30…`, strict `cef4510d…`, metadata `3ed5354b…`) and left `git status` clean.
  This directly exercises the `fileURLToPath` fix; the earlier `URL.pathname` implementation failed
  under the same space-containing path.
- Receipt JSON is generated and Prettier-ignored so clean recomparison remains byte-stable.

## Integration sequence (documented, not executed)

1. PR #203 (`beta/parity-https`, head `90c16be`, base `Vari8-Beta`) lands under its own independent gates; it is currently draft/unmerged.
2. PR #206 stays temporarily stacked on `90c16be` for review so the harness repairs remain separate.
3. After #203 lands, retarget #206 to `Vari8-Beta` and assess the canonical gate on the combined result.
4. Baseline activation/replacement remains a separately reviewed step; this task does not activate it.

Explicit transition decisions still required: #203 landing/merge authorization, then #206 retarget and
separate baseline activation approval. This task does not merge #203 against an unresolved old reference
or waive any gate.

## Remaining blockers

1. Independent review of the proposed reference replacement, adopted contract, S03-18 exact rule
   and provenance/host limitations.
2. PR #203 must be accepted/merged or otherwise handled before this stacked PR can be retargeted;
   issue #202 remains unresolved.
3. No baseline activation, parity waiver, merge or visual acceptance is claimed; the preserved
   pre-decision comparison remains 68/70 and the post-decision comparison is reported separately.

No self-approval, merge, deployment, Actions, Slack/Hermes, website or shared-infrastructure changes.

## Prompt 427 combined-result preparation

The owner authorized combined verification of #203 `90c16bee63e2609ebc4f09e91459332390562464` with #206 `43b63ed0f41e6e92e93ecf72065c0190c9ef3dea`, including the disclosed SWE-2/DeepSeek cross-review arrangement. `Vari8-Beta` `d1c4081022f2ac21070b28f284248fad2ef04839` is already an ancestor, so the combined result is conflict-free and no app/product files changed relative to #203.

Preparation branch `beta/p203-p206-combined-verification` adds only explicit `PARITY_REFERENCE_DIR`, `PARITY_OUT_DIR`, `PARITY_CAPTURE_MODULE` and `PARITY_COMPARER=reference` plumbing; it cannot update a custom reference directory and leaves `tools/parity/baseline` unchanged. Fresh combined-app evidence: synthetic `app_p427`, Node 24.22.1, D32 adapter `74e3b932fecf3953460aad1510b2fc6073c454bbb36955ea301d6c085f729690`, 70 screens/0 failures, manifest `f1e337a7314dae28751cf207affd1f074dbcb5e2c9e03163111d73d099d4ff3e`; canonical `70/70`, strict `68/70`; packaged evidence `482` verified; old baseline diagnostic `70` failures. This does not claim old-reference parity and does not activate the proposed baseline.
