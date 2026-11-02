## Prompt 425 contract/provenance repair

- Exact v1/v2 contract schemas with no field subsetting or administrative normalization; exact allowance sets and comparer rule identities; positive v1→v2 compatibility and all SWE-2 negative probes covered.
- Reviewed execution-pin manifest covers reference, both comparers, capture, capture metadata, recompare, verifier, evidence library, lockfiles, direct dependency pins and contract. Receipt metadata v2 detects omitted/tampered components; no self-hash claims.
- `recompare.mjs` uses `fileURLToPath`; clean checkout under spaces/non-ASCII: 482 artifacts, canonical 70/70, strict 68/70, byte-stable repeat, clean worktree.
- No capture/reference/threshold/S03-18 change; no merge, retarget, baseline activation or self-SHIP.

# VISUAL-REFERENCE — reproducible reference establishment

Owner request: Prompt 414 (2026-10-25). Prompt 417 owner decisions are recorded below; proposal remains unactivated and stops for independent review.

Base and dependency: PR #203 `90c16bee63e2609ebc4f09e91459332390562464`; stacked branch `beta/visual-reference-establishment`, draft PR base `beta/parity-https`. No ownership/HTTPS/cookie repairs are copied or independently changed. Retarget only after that dependency is accepted and merged. Issue #202 remains open.

## Written plan before code

1. Verify source/old evidence; fetch current refs into this isolated clone. Search issues/PRs before creation. Record the macOS FRONTEND/frontend ref collision and explicit case-safe fetch.
2. Add `tools/parity/reference/contract.json`, provenance/capture validation and candidate-reference generation tooling; add behavioral regression tests in `tests/unit/visual-reference.test.ts`. Extend `tools/parity/capture.mjs` only with explicit optional clock/source/index/hooks needed by the new lane; preserve its defaults and accepted repairs.
3. Canonical proposal uses owner-overriding D32: 09:00 clock; 1px geometry; pixelmatch threshold 0.1 and changed area fraction <=0.001. Record alternative implemented 10:00/.5px/zero-channel/pixel budgets and strict diagnostics, without a pass-dependent choice. D18/S11-03/S11-04 masks remain byte-identical. Pin historical frontend `c78311042edcc2f96350a132c682782d8da1b6a7`; no newer canvas publication is included in reference repair.
4. Regression tests first: reject dirty/incorrect source, inconsistent clock/contract, dependency mismatch, incomplete/missing/invalid captures and scrolls; prove comparison budgets and source-reference boundaries.
5. Build historical frontend and candidate on Node24.22.1 in isolated sources with unchanged source lockfiles. Record installed dependency integrity, browser executable/version/hash, OS/rendering config and actual CDP fonts. Capture twice from independent browser/server runs into separate directories; validate every screen URL/content/selected state and full scroller coverage. Preserve original baseline and record old/proposed mapping and reason.
6. Compare all 70 root outputs to historical references under canonical and strict diagnostics. Unexplained differences remain failures/findings; never rewrite expected images from root screenshots.
7. Run Node24 focused/full units, format/index/type/lint/build and appropriate E2E gates. Record exact exit codes and runtime; no Actions. Commit explicit task paths only. Publish draft and stop for independent DeepSeek review without self-approval.

Evidence: `icm/05-build/reports/VISUAL-REFERENCE.md`, reference provenance/manifest/artifact mapping under `tools/parity/reference/proposed/`; bulky run logs/captures are outside the code tree in task outputs. Old `tools/parity/baseline/` is preserved.

No product UI, fonts, old baselines, mask expansion, waiver, merge, deployment or external messaging.

## Packaging result

- Two historical reference runs captured 70/70 with zero failures/retries and byte-identical image/geometry/scroll artifacts (`stability.json`: 70/70 canonical and strict, `hashMismatches: []`).
- Proposed artifacts/provenance/mapping are under `tools/parity/reference/proposed/`; the old baseline is unchanged and every old hash is preserved. Package count is 245 files: 244 mapped proposed artifacts plus `old-proposed-artifact-map.json`; the 272-entry map retains 28 old-only paths.
- Historical comparison evidence remains 68/70: only s03 `Record demo video feedback` → `Record video feedback` failed geometry/text/role/name at both widths (39px narrower). Prompt 417 accepts that exact copy/geometry change through S03-18; no broad mask, tolerance change, baseline activation or current-root expected output was added.
- Full evidence and gate results are in `icm/05-build/reports/VISUAL-REFERENCE.md`.

## Prompt 417 owner decisions (2026-10-25)

- Keep `Record video feedback` instead of `Record demo video feedback`; the demonstrated 39px button-width reduction is accepted as S03-18.
- Adopt `D32-owner-written-v1`: 09:00 Europe/Vienna, 1 CSS-pixel geometry, pixelmatch threshold 0.1 and changed-pixel fraction <=0.001. The legacy strict settings remain diagnostic only.
- The proposed reference package is authorized as a proposal only. Baseline activation, merge, deployment and independent acceptance remain blocked on the normal workflow and unmerged PR #203.

## Prompt 423 evidence package

- Contract v2 compatibility accepts retained v1 only when all material capture/comparison fields match; adoption-only metadata differences are accepted, unknown versions/allowances and material changes fail. Original provenance unchanged.
- Candidate 237-file evidence and reference 245-file package are committed under `tools/parity/reference/evidence/`; artifact index 482; verifier/recompare are self-contained. New recomparisons: canonical 70/70, strict 68/70; historical 68/70 preserved.
- No capture/tolerance/mask/S03-18 change. Clean checkout at `c93f33b` verified 482 artifacts, canonical 70/70, strict 68/70 and byte-stable recomparison. No merge, retarget or baseline activation; stop for SWE-2 validation.

## Prompt 427 combined gate preparation

- Owner authorized combined #203+#206 result verification and disclosed cross-review. Prep branch `beta/p203-p206-combined-verification` preserves both PR branches and adds only explicit proposed-reference/capture/output/comparer env paths.
- Fresh combined-app capture on synthetic `app_p427`: canonical 70/70, strict 68/70; active old baseline diagnostic remains 70 failures. No merge, retarget or baseline activation.

## Prompt 429 combined-gate repair

- The labelled prep branch now forbids arbitrary capture modules and unsafe output paths, validates the proposed package and real combined captures, and records exact source/tool/environment provenance.
- Draft PR #207 is stacked on `beta/visual-reference-establishment` at head `2bee45a`. Durable `tools/parity/reference/combined/p429-run` evidence verifies canonical 70/70 and strict 68/70; old active baseline diagnostic is separately red at 70 failures. Historical 482-artifact evidence remains separate.

## Prompt 431 provenance repair

- Combined verification now binds capture source commit/tree, material-input hash, recorded tool/dependency pins and an exact post-capture path list; later docs/package changes are checked explicitly rather than assumed docs-only.
- Portable adapter `fd6a9a99…` and durable `p431-run` package verify canonical 70/70, strict 68/70; old baseline remains a separate 70-failure diagnostic. Transition order is #203, then #206, then #207, with reruns after material/retarget changes and separately approved activation.
