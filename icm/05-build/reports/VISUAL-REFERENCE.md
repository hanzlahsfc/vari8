# VISUAL-REFERENCE — historical canvas reference proposal (#205 / PR #206)

Status: **PROPOSED, NOT ACCEPTED**. This is a builder handoff for independent review.
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
- Existing allowances only: S11-03, D18, S11-04, with their unchanged 14px masks.
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
mapping has 272 entries; the proposal contains 244 files (including manifest/provenance). The old
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

## Current root comparison

`candidate-run` against the proposed historical reference:

- **68/70 pass** under canonical and strict diagnostics.
- Only `s03-checkin-review@390` and `s03-checkin-review@1440` fail.
- Both failures are geometry/text/role/name: the historical button reads
  **“Record demo video feedback”**; the current root reads **“Record video feedback”**.
  Button width changes `244.5 → 205.5` px (**39px**) at both widths. Pixel counts remain within the
  canonical budget (`624`/`625` changed), but the geometry contract fails independently.
- Current root screenshots are never used as expected output.

### s03 copy disposition

Historical `frontend/src/components/coach/media.tsx:264-265` (source `c783110`) uses the demo copy.
The real recorder added by PR-MEDIA commit `21d8fc0` introduced “Record video feedback” at
`components/canvas/coach/demo-recorder.tsx:203`; `e355c59` wired the real recorder into the root
canvas chain. PR-MEDIA/S02-25 describes dropping demo-only copy, but the owner D32 truth-text table
does not include this button and issue #205 authorizes only the existing S11-03/D18/S11-04 allowances.
No explicit owner approval for this exact copy/geometry change was found.

Therefore both s03 failures remain explicit. I did **not** add a mask, widen tolerance, or baseline
the current app. An owner decision is required for this exact copy change; if rejected, the current
app or reference must change in a separately reviewed repair, not by a parity waiver.

## Verification

Task-local runs on Node `v24.22.1`:

- Unit/validation: **106 files / 1280 tests**, exit 0 (fresh final run).
- Focused reference tests: **10/10**, exit 0 (fresh final run).
- Typecheck: exit 0. Lint: exit 0, **0 errors / 81 warnings** (pre-existing warnings).
- Format source-policy check: pass; generated proposed artifacts are intentionally Prettier-ignored.
- Index generation/check: exit 0; historical/candidate source trees remain exact.
- Build: exit 0; historical and candidate builds were also 0 under their lockfiles.
- `git diff --check`: 0; old baseline diff: 0.
- Reference runs: 2 x 70/70, zero failures/retries, bit-identical.
- No full 70-screen rerun was performed for this packaging; the two valid reference runs and current
  root comparison are the task evidence. No full E2E suite was rerun for this evidence-only packaging.

## Remaining blockers

1. Independent review of the proposed reference replacement and its provenance/host limitations.
2. Explicit owner decision on the s03 “Record demo video feedback” → “Record video feedback” copy
   and its 39px geometry consequence; existing allowances are unchanged.
3. PR #203 must be accepted/merged or otherwise handled before this stacked PR can be retargeted;
   issue #202 remains unresolved.
4. No parity PASS or visual acceptance is claimed; the current root comparison is 68/70.

No self-approval, merge, deployment, Actions, Slack/Hermes, website or shared-infrastructure changes.
