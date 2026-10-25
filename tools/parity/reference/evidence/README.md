# Reproducible visual-reference evidence

This directory packages the **candidate captures and recomparison receipts** so canonical 70/70 and strict 68/70 can be recomputed without any `outputs/p414` or other untracked task directory.

## Contents

- `candidate/` — synthetic current-root candidate captures: 233 screen artifacts plus `manifest.json`, `provenance.json`, `validated-artifacts.json` and `server-ownership.json` (237 files).
- `receipts/canonical.json`, `receipts/strict.json` — new recomparisons of the packaged historical reference against the packaged candidate captures. These are **not** original receipts and **not** new captures.
- `receipts/metadata.json` — comparer hashes/version, contract hash, reference/candidate manifest+provenance hashes, artifact-index hash, and result counts.
- `artifact-hashes.json` — SHA-256 for every packaged reference/candidate artifact, relative to `tools/parity/reference/`.
- `comparer.json` — pinned comparer source hashes, contract hash, dependency versions/integrities and commands.
- `recompare.mjs` — recomputes canonical and strict from the packaged inputs only.
- `verify-evidence.mjs` / `evidence-lib.mjs` — verifies required files, contract compatibility, artifact hashes, run validity and receipt provenance; fails on missing/tampered artifacts.

The historical reference package remains at `tools/parity/reference/proposed/`; `proposed/all-70-comparison.json` remains the pre-decision 68/70 receipt. Candidate screenshots are evidence only and are never expected output. The reference package is 245 files (244 mapped/package artifacts + map), the candidate package is 237 files, this evidence directory is 246 files, and the artifact index contains 482 entries; the old baseline is 242 files and remains unchanged.

## Reproduction from a clean checkout

Use Node 24.22.1 and install the root plus pinned reference dependencies from their lockfiles (no browsers are launched):

```sh
npm ci --ignore-scripts
npm ci --prefix tools/parity/reference --ignore-scripts
node tools/parity/reference/evidence/verify-evidence.mjs
node tools/parity/reference/evidence/recompare.mjs
```

Expected recomparison: canonical **70/70**, strict **68/70** (s03 pixels only). The strict result is a diagnostic, not the canonical gate. No capture is rerun.

## Receipt provenance

The historical `proposed/` receipts predate comparer-provenance recording. The new `receipts/` are explicitly labelled recomparisons and record the comparer source hashes, contract hash, dependency lock/integrities and input hashes. Historical receipts are preserved unchanged.

Portability remains limited to the recorded macOS arm64 environment. No remote-accessibility claim is made until the committed package is verified from the remote branch.
