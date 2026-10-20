# PR-M2 build report

Card `pr-m2-preferences` (issue #107), PR #108, branch `beta/pr-m2-preferences`, lane DB `app_wb_m2` on 127.0.0.1:5433, lane port 3905.
Gate head `ce7db700a711db139742bb86f09b1dc20798dfac` (merge of `origin/Vari8-Beta` at `fb5c38780b729679b11b4d2a32d7ce14d3f65ab9`). The report commit follows it and changes only this file.
Matrix rows closed: none (foundation PR, per the card).
Parity (D32): none, this card gates no screens.

## What changed

| Path                                                               | What                                                                                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `lib/workspace/preferences.ts`                                     | Read/write workspace appearance and preferences, member sidebar state, Zod schemas at the boundary.                             |
| `app/api/v1/workspaces/[workspaceId]/preferences/route.ts`         | `GET`/`PATCH` preferences, gated `appearance.write` (D15: owner and coach only).                                                |
| `app/api/v1/workspaces/[workspaceId]/preferences/sidebar/route.ts` | `GET`/`PATCH` the caller's own sidebar flag, gated `own.read`/`own.write`.                                                      |
| `scripts/seed/21-appearance.seed.ts`                               | Canvas demo appearance on the `canvas-demo` workspace, values copied from the canvas demo state.                                |
| `tests/unit/workspace-preferences.test.ts`                         | Boundary validation, exact Prisma write shape, workspace isolation, sidebar member scoping.                                     |
| `tests/integration/api-v1-preferences.test.ts`                     | Real route handlers, real bearer sign-in, real PostgreSQL: contract, persistence, two-workspace acceptance, roles, 401/403/400. |

No `db/` changes (`git diff --name-only fb5c387 HEAD -- db/` printed nothing), so the D34 schema guard has nothing to check.

`tests/integration/seed-credentials.test.ts` is the base version, untouched by this lane.

## Commands and exit codes

| Command                                                                                                                            | Exit                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `git fetch origin && git merge --ff-only origin/beta/pr-m2-preferences`                                                            | 0 (already up to date)                                                |
| `git merge origin/Vari8-Beta`                                                                                                      | 0 (conflicts in `docs/index/ROUTES.md`, `docs/index/SYMBOLS.md` only) |
| `npm run index` (regenerates the two conflicted generated docs)                                                                    | 0                                                                     |
| `npm run index:check`                                                                                                              | 0                                                                     |
| `npm run format:check`                                                                                                             | 0                                                                     |
| `npx vitest run tests/unit/workspace-preferences.test.ts`                                                                          | 0 (27 tests)                                                          |
| `npx vitest run --config vitest.integration.config.ts tests/integration/api-v1-preferences.test.ts`                                | 0 (15 tests)                                                          |
| `BASE_SHA=$(git merge-base HEAD origin/Vari8-Beta) LANE_DB=app_wb_m2 LANE_PORT=3905 CARD=PR-M2 icm/05-build/tools/verify-local.sh` | 1 (parity only)                                                       |

Gate summary, verbatim from `/Users/marcelspatz/NEXUS_AI_CENTER/04_PROJECTS/Vari8-evidence/WAVEB-LEAD/pr-m2-preferences.check.log`:

```
head=ce7db700a711db139742bb86f09b1dc20798dfac base=fb5c38780b729679b11b4d2a32d7ce14d3f65ab9 node=v26.12.0 card=PR-M2 db=app_wb_m2 port=3905
PASS clean tree (0s)
WARN node: target 24 (D5), running v26.12.0; recorded, not certified
PASS schema guard (D34) (0s)
PASS program generator check (1s)
PASS npm ci (12s)
PASS prisma generate (1s)
PASS frontend npm ci (6s)
PASS format check (11s)
PASS typecheck (22s)
PASS frontend typecheck (4s)
PASS lint (16s)
PASS frontend lint (2s)
PASS unit tests (14s)
PASS frontend tests (1s)
PASS integration tests (138s)
PASS migrate deploy (0s)
PASS build (40s)
PASS frontend build (9s)
PASS e2e flow specs (serialized) (20s)
FAIL parity regression (D32) exit=1 (230s)
VERIFY-LOCAL FAIL
```

The gate script on this branch, and the one on `origin/Vari8-Beta` at `fb5c387`, has no `SKIP_PARITY` switch (`git show origin/Vari8-Beta:icm/05-build/tools/verify-local.sh | grep -c SKIP_PARITY` printed `0`), so the documented escape hatch for cards that gate no screens is not available yet. The parity step is therefore the only failing step.

### Parity failure, classified

`parity FAIL: 70 problem(s), retried=0; report tools/parity/out/report.html`. Of the 70 screen failures, 68 are pixel-only with identical geometry and identical text (`geom=0/0/<n> text=0`), which is the baseline captured on Linux compared against this Mac's font rasterization. The remaining two are `s03-checkin-review@390` and `s03-checkin-review@1440` with `text=1`, on the check-in review screen, which comes from `origin/Vari8-Beta` (PR-M8) and is not touched by this lane. Example lines:

```
FAIL s10-appearance@1440 px=1734522 geom=0/0/138 text=0
FAIL s11-preferences@1440 px=788646 geom=0/0/98 text=0 ruled=3
FAIL s03-checkin-review@390 px=210510 geom=0/0/132 text=1
```

This is the known harness defect tracked as PR #137 ("verify-local: SKIP_PARITY=1 for cards whose contract gates no screens"). Parity is not this card's contract and was not modified.

## Acceptance: accent and mode persist per workspace and differ between two workspaces

Proven against a running server, not client state. `npx next start -p 3905` on `app_wb_m2`, seeded with `npm run seed:dev` (two workspaces: `canvas-demo` with an owner, `seed-second-workspace` with a coach), then real HTTP with bearer tokens from real sign-ins. Script: `/Users/marcelspatz/NEXUS_AI_CENTER/04_PROJECTS/Vari8-evidence/WAVEB-LEAD/pr-m2-acceptance.sh`, output: `pr-m2-acceptance.log`.

```
workspace A (canvas-demo)      id=cmvh0hfmm00008oi5zgdi3w9r
workspace B (seed-second-ws)   id=cmvh0hfq5000i8oi5m0x3xcva

== PATCH A {mode:light, accent:#2b7157}
{"mode":"light","accent":"#2B7157",...}   HTTP 200
== PATCH B {accent:#3565b7} (mode left untouched)
{"mode":"dark","accent":"#3565B7",...}    HTTP 200

== GET A (server read-back)
{"mode":"light","accent":"#2B7157","font":"sans","density":"comfortable","logoMediaId":null,"availability":"Weekdays · 09:00-18:00","notifications":true,"priorityNotifications":true}   HTTP 200
== GET B (server read-back)
{"mode":"dark","accent":"#3565B7","font":"sans","density":"comfortable","logoMediaId":null,"availability":"","notifications":true,"priorityNotifications":true}   HTTP 200

== cross-workspace isolation: A's token reading B
{"error":{"code":"forbidden"}}   HTTP 403
```

Database rows behind those two reads:

```
 slug                  | appearance_mode | appearance_accent | appearance_font | appearance_density
-----------------------+-----------------+-------------------+-----------------+--------------------
 canvas-demo           | LIGHT           | #2B7157           | SANS            | COMFORTABLE
 seed-second-workspace | DARK            | #3565B7           | SANS            | COMFORTABLE
(2 rows)
```

Both rows differ in mode and in accent, each read back through the API by its own workspace member, and a member of A gets 403 on B. The same assertion runs in the integration suite as `acceptance: accent and mode persist per workspace and differ`.

Boundary behaviour proven in the same integration file: client role 403 on read and write, outsider 403 with `{"error":{"code":"forbidden"}}`, signed-out 401, bad accent, bad font enum, bad mode enum, non-boolean toggle and malformed JSON all 400 `invalid_input` with the stored accent unchanged, sidebar flag isolated per member (a client may toggle their own).

## What I could not do

1. Gate exit 0. Every step passes except parity, which fails for the reason above and cannot be skipped by this branch's or the base's `verify-local.sh`. Fixing it belongs to PR #137, not to this card.
2. Browser screenshots of the preferences screen at 1440 and 390. Owner ruling O3: the client settings screen is blocked on Lilly's canvas design, and no canvas screen is wired to these routes yet (that is PR-W10). There is no UI surface for this card to photograph, so the live proof is HTTP against the running server. The canvas screens that do exist are unchanged and covered by the parity capture.
3. A full `npm run seed:dev`. `scripts/seed/40-media.seed.ts` aborts with `StorageError: storage_not_configured` because no storage adapter is configured on this machine. Modules `00`, `21` and `33` had already run, so `21-appearance.seed.ts` did write the canvas demo appearance, which is what the acceptance needed. That seed belongs to PR-MEDIA.
4. Node 24 certification. This machine runs v26.12.0; the gate records the D5 warning and does not certify it.
