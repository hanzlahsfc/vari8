# P491 — #206 integration decision record

## Identities (revalidated, unmoved)

- `Vari8-Beta` tip `a90eaf283f35` — unchanged since P482.
- #206 head `569485149ec8…`, tree `febf60b0a9…` — merge commit parent
  `ecb798b` (parents `43b63ed` + `a90eaf28`); Beta is ancestor → the
  merge result IS `febf60b`. No retarget needed further.

## Actual merge result — standard gates (Node 24.22.1, clean worktree)

| gate | result |
|---|---|
| format:check / index:check / typecheck | PASS |
| lint | 0 errors / **82 warnings** |
| unit | **1340/1340** (112 files) |
| build | compiled |
| `diff --check a90eaf28..5694851` | 0 |

Logs: `/tmp/p491-206/state/*.log` (each header = `v24.22.1` + exec path).

## Composite vs merge tree — complete delta

`febf60b..899b72e` = 749 paths total:

- `.prettierignore` +3 lines — the bundle's documented
  `reference/combined/` exclusion (formatting tooling only).
- `tools/parity` subtree: **740 packaged-evidence/artifact files**
  (`reference/{proposed,evidence,combined}` — #207's captured runs,
  receipts, manifests — data, not executed code) + **8 executed-tooling
  files**: `run.mjs`, `safe-paths.mjs`, `reference/{reference,
  combined-pins,combined-run,package-combined,source-identity,
  verify-combined}.mjs` — the reviewed combined-runner/verifier.
- **Application, auth, database, theme and asset inputs: identical** —
  no diff outside `tools/parity` and `.prettierignore`.

## What the composite capture proves (existing overlay model)

The successful `f4527ae` capture proves: the #206 app code (every route,
component, auth flow, db schema, theme, asset — byte-identical to
`5694851`'s tree) produces a clean 70-screen HTTPS capture whose pixels/
geometry match the proposed references 70/70 canonical and 68 strict —
under the *#207* runner/verifier. It does NOT prove `5694851` can run
that gate itself (it lacks the combined runner — the graft is the only
executed-tooling difference). Gate function = tooling identity, not
product behavior.

## Decision assessment for #206 (`5694851`)

| check | verdict |
|---|---|
| passing standard gates | YES — all green on the unmodified tree |
| product inputs == captured composite | YES — identical outside gate tooling |
| baseline `640f4375` / default selection | UNCHANGED |
| remaining technical gap requiring execution | **NONE for the merge itself** — the only executed difference is the gate-runner subtree (#207's), already the authorized bundle the gate requires |

## Authorization — proposed manifest amendment

Current `mergeAuthorization` holds `pendingInput` (manually-posted
comment requirement). Proposed narrow replacement — records TRUE origin,
keeps approved heads + revalidation + activation prohibition:

```json
"mergeAuthorization": {
  "source": "owner instruction delivered in task chat, transmitted by the orchestrator",
  "commentUrl": "https://github.com/hanzlahsfc/vari8/pull/209#issuecomment-6453235842",
  "author": "hanzlahsfc (orchestrator-recorded; not manually human-posted)",
  "contains": "I authorize task-specific integration of #203, #206 and #207, in that order, using the disclosed cross-review arrangement and reviewed supervised procedure. Approved starting heads are #203 90c16bee63e2609ebc4f09e91459332390562464, #206 43b63ed0f41e6e92e93ecf72065c0190c9ef3dea, and #207 04902f1dc3d317e0959ae533f2f4c479a8fc55f9. Execution requires fresh gates against each actual integration result and prescribed revalidation of changed heads. Baseline activation and deployment are not authorized.",
  "verification": "comment verified via gh api — author hanzlahsfc, body contains the quoted decision verbatim",
  "changedHeadRevalidation": "approved starting heads are stale after the P482 merge; each step's derived head must be re-derived live before merge",
  "activationProhibited": true
}
```

This is a PROPOSAL — the manifest is unchanged pending owner sign-off
(or the owner posts the comment manually, which also satisfies the
original requirement).
