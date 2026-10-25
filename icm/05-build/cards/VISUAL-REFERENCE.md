# VISUAL-REFERENCE — reproducible reference establishment

Owner request: Prompt 414 (2026-10-25). Status: packaged proposal, not accepted; stop for independent review.

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
- Proposed artifacts/provenance/mapping are under `tools/parity/reference/proposed/`; the old baseline is unchanged and every old hash is preserved.
- Current root comparison is 68/70. Only s03 `Record demo video feedback` → `Record video feedback` fails geometry/text/role/name at both widths (39px narrower). No allowance/mask/tolerance/baseline change was made; the exact copy decision remains with the owner.
- Full evidence and gate results are in `icm/05-build/reports/VISUAL-REFERENCE.md`.
