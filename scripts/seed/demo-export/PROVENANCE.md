# Provenance - demo-export fixture

Copied byte-verbatim into this seed fixture directory for Stage 11
(`fp/stage-11`). The snapshot is Lilly's deterministic demo coaching export,
read only by the opt-in demo seed (`VARI8_SEED_DEMO=1`).

Re-pointed for w2/fe1 (PR 210, demo export revision 9): `README.md`,
`workspace.json` and `clients/client-007.json` refreshed from the merged
FRONTEND tip; the other files were byte-identical at both refs.

Re-pointed for w2/fe3 (PR 211, demo export revision 11): `README.md`,
`workspace.json` and `clients/client-007.json` refreshed from the merged
FRONTEND tip; the other files were byte-identical at both refs.

- Source ref: `origin/FRONTEND`
- Source commit: `8e6503f6c0c7112fbf867f1af4353ab271d2418d`
- Source path: `frontend/src/data/demo-export/` on that ref
- Upstream generator: `frontend/scripts/export-demo.mjs`
  (`npm run export:demo` on the frontend tree)
- Snapshot anchor: `index.json` `generatedAt` = `2026-10-25`; every
  `day <n>` / `day <n>T<time>` token resolves against that anchor (see
  `README.md` in this directory for the encoding contract).
- Physique media payloads referenced by `photos[].src` are NOT part of this
  snapshot; the seed resolves them against the in-tree
  `frontend/public/demo/physique/` assets from the same pinned source.

No other file was taken from the source ref. Nothing under `frontend/` was
modified or added by this card.
