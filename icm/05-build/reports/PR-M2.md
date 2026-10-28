# PR-M2 build report

Card `pr-m2-preferences` (issue #107), PR #108, branch `beta/pr-m2-preferences`, lane DB `app_wb_m2` on 127.0.0.1:5433, lane port 3905.

This report is regenerated on head `fcf4c4a47efc0244408e1a2e5c3c033f4158e7e4` (merge of `origin/Vari8-Beta` at `6d06cf828d1165139959bf1720b217dac790182f`, short `6d06cf8`). The report commit follows that head and changes only this file.

Gate: **pending on PR #145, not green**. `origin/Vari8-Beta` at `6d06cf8` fails `tests/unit/system-index.test.ts:127` on its own (`expect(routes).toContain("Counts: 52 backend pages")`, generator now emits 55 after #140). `verify-local.sh` aborts at the unit step, so no card in this wave can produce a gate receipt on this base. No gate was run for this report; a missing receipt here is not a pass.

Matrix rows closed: none (foundation PR, per the card). Parity (D32): none, this card gates no screens.

## What changed

| Path                                                               | What                                                                                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `lib/workspace/preferences.ts`                                     | Read/write workspace appearance and preferences, member sidebar state, Zod schemas at the boundary.                             |
| `app/api/v1/workspaces/[workspaceId]/preferences/route.ts`         | `GET`/`PATCH` preferences, gated `appearance.write` (D15: owner and coach only).                                                |
| `app/api/v1/workspaces/[workspaceId]/preferences/sidebar/route.ts` | `GET`/`PATCH` the caller's own sidebar flag, gated `own.read`/`own.write`.                                                      |
| `scripts/seed/21-appearance.seed.ts`                               | Canvas demo appearance on the `canvas-demo` workspace, values copied from the canvas demo state.                                |
| `tests/unit/workspace-preferences.test.ts`                         | Boundary validation, exact Prisma write shape, workspace isolation, sidebar member scoping.                                     |
| `tests/integration/api-v1-preferences.test.ts`                     | Real route handlers, real bearer sign-in, real PostgreSQL: contract, persistence, two-workspace acceptance, roles, 401/403/400. |

No `db/` changes (`git diff --name-only 6d06cf8 HEAD -- db/` printed nothing), so the D34 schema guard has nothing to check.

## Commands and exit codes (this head)

| Command                                                                                                                                                                     | Exit                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `psql ... postgres -c "create database app_wb_m2"`                                                                                                                          | 0                                    |
| `npx prisma migrate deploy` (against `app_wb_m2`)                                                                                                                           | 0 (all applied)                      |
| `npx tsx scripts/seed/index.ts` (4 modules: 00, 21, 33, 40)                                                                                                                 | 0                                    |
| `npm run build`                                                                                                                                                             | 0                                    |
| `env -u AUTH_URL -u AUTH_SECRET npx vitest run tests/unit/workspace-preferences.test.ts`                                                                                    | 0 (27 tests)                         |
| `INTEGRATION_DATABASE_URL=...app_wb_m2_it env -u AUTH_URL -u AUTH_SECRET npx vitest run --config vitest.integration.config.ts tests/integration/api-v1-preferences.test.ts` | 0 (15 tests)                         |
| `npx next start -p 3905`                                                                                                                                                    | served the runs below, stopped after |
| `./pr-m2-acceptance2.sh` (HTTP acceptance, output `pr-m2-acceptance2.log`)                                                                                                  | 0                                    |
| `node pr-m2-browser.cjs` (Chromium, workspace A, 1440 and 390, output `pr-m2-browser.log`)                                                                                  | 0                                    |
| `node pr-m2-browser-b.cjs` (Chromium, workspace B, 1440 and 390, output `pr-m2-browser-b.log`)                                                                              | 0                                    |
| `icm/05-build/tools/verify-local.sh`                                                                                                                                        | not run: blocked by PR #145          |

Two environment notes for whoever re-runs this on the Mac. The shell here exports `AUTH_URL` and `AUTH_SECRET`, and `lib/auth/server.ts` refuses to start when both the `BETTER_AUTH_*` and the legacy names are set to different values (`Refusing to start: BETTER_AUTH_URL and AUTH_URL are both set to different values`), so every test and server command above runs with `env -u AUTH_URL -u AUTH_SECRET`. The server also needs `BETTER_AUTH_SECRET` from the repo `.env` in production mode. This is harness configuration, not card code, and it is why the commands are written out literally.

## Acceptance: accent and mode persist per workspace and differ between two workspaces

Measured on this head against the production server on 3905 and `app_wb_m2`. Values are new for this run, nothing is copied from the earlier report. Workspace A is `canvas-demo` (`cmvimim5400008ox3qnseuau0`), workspace B is `seed-second-workspace` (`cmvimim8k000i8ox3dfp0nmv3`). Both start from the seed state (DARK, `#EB91B8`), so the difference below is produced by the writes, not by the seed.

HTTP, from `pr-m2-acceptance2.log` (each workspace written and read by a member of that workspace, session cookie from a real sign-in, token never printed):

```
== 1. write A {mode:light, accent:#0E5A7A, font:serif}
{"mode":"light","accent":"#0E5A7A","font":"serif","density":"comfortable",...}   HTTP 200
== 2. write B {mode:dark, accent:#C2410C, font:mono}
{"mode":"dark","accent":"#C2410C","font":"mono","density":"comfortable",...}     HTTP 200

== 3. read-back through the server, B then A (B's session)
B: {"mode":"dark","accent":"#C2410C","font":"mono",...}    HTTP 200
A: {"mode":"light","accent":"#0E5A7A","font":"serif",...}  HTTP 200

== 5. workspace isolation: A's session against B
GET B    -> {"error":{"code":"forbidden"}}  HTTP 403
PATCH B  -> {"error":{"code":"forbidden"}}  HTTP 403

== 6. unsigned request
GET A without a session -> {"error":{"code":"unauthenticated"}}  HTTP 401
```

Database rows after the browser sessions (server-side truth, `select slug, appearance_mode, appearance_accent, appearance_font, appearance_density from workspace`):

```
 slug                  | appearance_mode | appearance_accent | appearance_font | appearance_density
-----------------------+-----------------+-------------------+-----------------+--------------------
 canvas-demo           | LIGHT           | #0E5A7A           | SERIF           | COMPACT
 seed-second-workspace | DARK            | #C2410C           | MONO            | COMFORTABLE
(2 rows)
```

Mode differs (`LIGHT` vs `DARK`), accent differs (`#0E5A7A` vs `#C2410C`), font differs (`SERIF` vs `MONO`). Each row is read back through the API by its own member, and each member gets 403 on the other workspace. `COMPACT` on A is the density write issued from the 390 browser session below, which also shows a write from the narrow width persists.

### Browser, 1440 and 390

Real Chromium, session cookies from a real sign-in, page served by `next start`:

```
[1440] GET /coach -> HTTP 200, title=Coach
[1440] GET A -> HTTP 200 {"mode":"light","accent":"#0E5A7A","font":"serif",...}
[1440] GET B -> HTTP 403 {"error":{"code":"forbidden"}}
[390]  GET /coach -> HTTP 200, title=Coach
[390]  GET A -> HTTP 200 {"mode":"light","accent":"#0E5A7A","font":"serif",...}
[390]  GET B -> HTTP 403 {"error":{"code":"forbidden"}}
[390]  PATCH A {density:compact} -> HTTP 200
[390]  GET A again -> HTTP 200 {"mode":"light","accent":"#0E5A7A",...,"density":"compact"}

[1440/B] GET /coach -> HTTP 200
[1440/B] GET B -> HTTP 200 {"mode":"dark","accent":"#C2410C","font":"mono",...}
[1440/B] GET A -> HTTP 403 {"error":{"code":"forbidden"}}
[390/B]  GET /coach -> HTTP 200
[390/B]  GET B -> HTTP 200 {"mode":"dark","accent":"#C2410C","font":"mono",...}
[390/B]  GET A -> HTTP 403 {"error":{"code":"forbidden"}}
```

Screenshots (absolute paths):

- `/Users/marcelspatz/NEXUS_AI_CENTER/04_PROJECTS/Vari8/.worktrees/pr-m2-preferences/_evidence/PR-M2/build/PR-M2-coach-1440.png`
- `/Users/marcelspatz/NEXUS_AI_CENTER/04_PROJECTS/Vari8/.worktrees/pr-m2-preferences/_evidence/PR-M2/build/PR-M2-coach-390.png`
- `/Users/marcelspatz/NEXUS_AI_CENTER/04_PROJECTS/Vari8/.worktrees/pr-m2-preferences/_evidence/PR-M2/build/PR-M2-coach-B-1440.png`
- `/Users/marcelspatz/NEXUS_AI_CENTER/04_PROJECTS/Vari8/.worktrees/pr-m2-preferences/_evidence/PR-M2/build/PR-M2-coach-B-390.png`

What the screenshots show and do not show: they are the signed-in coach surface at each width, not a rendered accent. No screen in this app reads the stored workspace appearance on this head (`grep -rln appearanceAccent app lib frontend/src` matches only `lib/workspace/preferences.ts`), because owner ruling O3 parks the client settings screen and PR-W10 does the wiring. The visual surface for this contract does not exist yet; the live proof is the HTTP contract from a real baked-in browser session at both widths.

The B session is a synthetic coach `prm2.browser@example.test` created on the lane DB only (`pr-m2-browser-fixture.ts`), because the seeded staff2 credential belongs to a different dataset and its password was not available to this run.

## Unit line: trust-boundary validation and workspace isolation

`npx vitest run tests/unit/workspace-preferences.test.ts` exit 0, 27 tests. The cases that carry the card's unit line:

- `rejects accent missing hash / short hex / non-hex / word before any write` (`EB91B8`, `#EB91B`, `#ZZZZZZ`, `rose`): throws before `workspace.update`, write count 0.
- `rejects {"font":"comic-sans"} / {"mode":"auto"} / {"density":"roomy"} / {"notifications":"yes"} / {"theme":"x"} / availability over 500 chars before any write`: same, write count 0.
- `rejects a non-object body null, "rose", 42, ["mode","dark"] before any write`.
- `reads only the caller's workspace`: the Prisma call is keyed on the context workspace id, never a body id.
- `maps a full canvas patch to the exact Prisma write, normalizing accent`: `#c5457c` lands as `#C5457C`, the DB enum and the wire vocabulary stay one to one.

Same boundary over the wire, measured live (`pr-m2-acceptance2.log`, section 4): `#12345` and `red` return 400 `invalid_format` on `accent`, `comic` returns 400 `invalid_value` on `font`, `dim` returns 400 `invalid_value` on `mode`, and the read after all four rejections still returns `{"mode":"light","accent":"#0E5A7A","font":"serif"}` HTTP 200, so a rejected patch writes nothing.

Integration suite on the real routes and real PostgreSQL (`app_wb_m2_it`), 15 tests, exit 0, including `acceptance: accent and mode persist per workspace and differ`, `a member of another workspace gets 403, not the data`, `signed-out requests get 401 on both routes`, `client role is denied read and write (D15)`, `sidebar flag persists per member inside one workspace`.

## What I could not do

1. A gate receipt on this base. PR #145 fixes `tests/unit/system-index.test.ts` (canary 52 to 55, `_evidence` skip); until it lands no card can produce `EXIT=0`. One gate run per card after it lands closes this.
2. A screenshot of an accent rendering. No screen consumes the stored appearance on this head (O3 parks the client settings screen, PR-W10 wires it). Changing that is outside this card.
3. Node 24 certification. This host runs v26.12.1, which the gate records as a D5 warning.
4. `npm run db:fresh` as written. It drives the Docker container `vari8-db-1`; this host runs native PG17 with no Docker daemon, so the lane database was created with `psql -c "create database app_wb_m2"` and then migrated and seeded directly, both exit 0.
