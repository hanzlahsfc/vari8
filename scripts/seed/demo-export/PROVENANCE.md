# Provenance — demo-export fixture

Copied byte-verbatim into this seed fixture directory for Stage 11
(`fp/stage-11`). The snapshot is Lilly's deterministic demo coaching export,
read only by the opt-in demo seed (`VARI8_SEED_DEMO=1`).

- Source ref: `trackc/merge-frontend-9491897` (local ref, no fetch)
- Source commit: `9491897b9dbd1a13855854ae2a2d5fa8d8ae8230`
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
