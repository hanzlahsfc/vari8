# Reproducible visual-reference evidence

This directory packages the **candidate captures and recomparison receipts** so canonical 70/70 and
strict 68/70 can be recomputed without any `outputs/p414` or other untracked task directory.

## Contents

- `candidate/` — candidate current-root captures: 233 screen artifacts plus `manifest.json`,
  `provenance.json`, `validated-artifacts.json` and `server-ownership.json` (237 files). The captures
  use synthetic application data, but the package also retains local runtime provenance (absolute
  paths, process IDs/start times, browser command lines). It is **not a purely synthetic package**.
- `receipts/canonical.json`, `receipts/strict.json` — new recomparisons of the packaged historical
  reference against the packaged candidate captures. These are **not** original receipts and **not**
  new captures.
- `receipts/metadata.json` — receipt schema/toolchain version, comparer-manifest hash, component
  closure, lock/dependency pins, contract hash, input hashes, package counts and result counts.
- `artifact-hashes.json` — SHA-256 for every packaged reference/candidate artifact, relative to
  `tools/parity/reference/`. Verification requires the exact indexed set under `proposed/` and
  `evidence/candidate/`; unindexed files fail.
- `comparer.json` — reviewed execution-pin manifest: exact hashes for the reference/compare/capture
  sources, recompare/verifier/library, root and reference lockfiles, direct dependency versions and
  integrities, the contract and the reproduction commands.
- `recompare.mjs` — recomputes canonical and strict from the packaged inputs only. It uses
  `fileURLToPath`, not `URL.pathname`, so checkout paths containing spaces or non-ASCII characters
  are supported.
- `verify-evidence.mjs` / `evidence-lib.mjs` — verifies the exact toolchain pins, contract
  compatibility, allowance identities, artifact set, run validity and receipt provenance; fails on
  missing, tampered or unindexed artifacts.

The historical reference package remains at `tools/parity/reference/proposed/`;
`proposed/all-70-comparison.json` remains the pre-decision 68/70 receipt. Candidate screenshots are
evidence only and are never expected output. The reference package is 245 files (244
mapped/package artifacts + map), the candidate package is 237 files, this evidence directory is 246
files, and the artifact index contains 482 entries; the old baseline is 242 files and remains
unchanged.

## Contract compatibility

`contract.json` is exactly version 2. The exact retained v1 provenance shape is also accepted by the
named `retained-v1-to-approved-v2` compatibility transition. There is no field defaulting or
administrative normalization:

- every required field must be present; unknown fields fail;
- authority, `implementedAlternative`, material capture/comparison settings and all other fields must
  match the applicable schema exactly;
- allowances must be the exact approved set (`S11-03`, `D18`, `S11-04`, `S03-18` for v2; without
  `S03-18` for retained v1), not a caller-selected subset;
- the comparer's exact allowance rule identities and labels are also checked;
- original `proposed/` and `candidate/` provenance bytes are never rewritten.

## Reproduction from a clean checkout

Use Node 24.22.1 and install the root plus pinned reference dependencies from their lockfiles (no
browsers are launched):

```sh
npm ci --ignore-scripts
npm ci --prefix tools/parity/reference --ignore-scripts
node tools/parity/reference/evidence/verify-evidence.mjs
node tools/parity/reference/evidence/recompare.mjs
```

Expected recomparison: canonical **70/70**, strict **68/70** (s03 pixels only). The strict result is a
diagnostic, not the canonical gate. No capture is rerun. Repeat recomparison must produce identical
receipt bytes and leave the worktree clean.

## Receipt provenance and hash policy

`comparer.json` is the reviewed pin manifest. It pins the execution closure: `reference.mjs`,
`reference/compare.mjs`, the legacy `compare.mjs`, `capture.mjs`, `capture-metadata.mjs`,
`recompare.mjs`, `verify-evidence.mjs`, `evidence-lib.mjs`, both dependency lockfiles, the direct
`pixelmatch`/`pngjs`/`@playwright/test` pins and `contract.json`.

`receipts/metadata.json` has `receiptVersion: 2`, hashes the comparer manifest, and copies its
component/lock/dependency/contract pins. Verification checks both the pins and the current files, so
changing any pinned component fails until the pin manifest is explicitly reviewed and updated.
`recompare.mjs` refuses to generate receipts when the pins do not match.

There is no self-hash loop: `comparer.json` does not hash itself; `metadata.json` hashes the comparer
manifest but not itself; receipt result files are generated and not hashed by the toolchain. The
artifact index is hashed as an input and its entries are verified separately. Regenerating receipts is
explicit and reviewable; it does not rewrite historical `proposed/` artifacts or provenance.

The historical `proposed/` receipts predate this provenance recording. They are preserved unchanged;
the new `receipts/` are explicitly labelled recomparisons.

No credentials, tokens, keys, database URLs or auth secrets were found in the committed evidence.
The retained local paths, process IDs/start times and browser launch command lines are private/local
runtime metadata, not secrets; they are retained because they are part of capture provenance. Any
redaction would require a separate owner-authorized change and must not rewrite historical artifacts
or Git history.

Portability remains limited to the recorded macOS arm64 environment. No remote-accessibility claim is
made until the committed package is verified from the remote branch.
