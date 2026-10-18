# Vari8 briefing story (lane DB-STORY)

Sources are cited as `path:line`, relative to `04_PROJECTS/Vari8/`. Status as of 2026-10-18. Plan status: PLAN.md:2 says "Awaiting owner approval".

## 1. Next moves

1. **PR-01, land the merged tree on TRACKER.** Needs two decisions first (Q9, Q15, section 4). You see: TRACKER contains the merge at `58eb6ed` and both apps build from it. Today `58eb6ed` exists only on the local branch `proto/merge-frontend`, 11 commits ahead of TRACKER, and TRACKER is not on origin. Unblocks PR-02 and therefore every other PR. (`icm/03-plan/output/PLAN.md:60-109`, `icm/01-recon/output/D1-merge-prototype.md:117`)
2. **PR-02, move the backend app to Next 16.3.8 and React 19.3.0.** You see: root typecheck, build and tests pass on the new versions. The prototype `proto/next16` at `b603c35` already passed typecheck, build and unit tests; the runtime is not yet verified. Unblocks PR-03. (`PLAN.md:111-160`, `icm/03-plan/output/PLAN.md:1650`)
3. **PR-03, one lint and format policy, TypeScript 7, Turbopack, and the test cuts.** Needs your approval of the test audit (section 4). You see: one lint and format command passes, `tsc` exits 0, canvas scripts no longer pass `--webpack`, and the 10 React hook errors are fixed rather than suppressed. CI moves to manual runs only (D13). Unblocks PR-04 and PR-05. (`PLAN.md:162-212`, `icm/03-plan/DECISIONS.md:44-46,70-72`)
4. **PR-04, make the flagged backend features reachable in dev.** Needs Q1 and the consent-gate amendment (section 4). You see: a fresh local database signs in and opens the existing flagged pages. Unblocks all nine data-model PRs (PR-M1 to PR-M9) and PR-SV4. PR-04 and PR-05 both depend only on PR-03, so they can run in parallel. (`PLAN.md:213-263`)
5. **PR-05, one versioned API and token auth under every screen.** Needs the ROLES matrix, the AUTH choice and the mobile token design (section 4). You see: a cookie session and a bearer token resolve to the same authorized user. Unblocks PR-W1, the first screen to wire (identity and client home), and the eight wiring PRs that depend on it. (`PLAN.md:264-314`, `icm/03-plan/DECISIONS.md:34`)

## 2. The merge in three states

### Before

Two separate apps in two folders, with no link between them.

Boxes:
- **Canvas (`frontend/`)**: Lilly's screens, Next 16.3.8, React 19.3.0. All state lives in browser localStorage. No login. (`icm/01-recon/output/L2-stack-merge.md:11,23`)
- **Backend app (repo root)**: Next.js 15.5.25, React 19.1.0, Prisma, PostgreSQL, Auth.js v5 login, role checks (RBAC), consent records, feature flags. (`L2-stack-merge.md:11,23`)

Arrows: none.

Mechanism: the canvas keeps everything in the browser and the backend keeps the real data behind a login, and no code path connects the two.

### Now

One repository tree at `58eb6ed` (branch `proto/merge-frontend`). Both apps are in it and both build, and they still share nothing at runtime.

Boxes:
- **Root app (backend)**: still on Next.js 15.5 until PR-02. Its build compiles no canvas routes. (`D1-merge-prototype.md:41`)
- **`frontend/` canvas**: Next 16.3.8, still reads and writes only browser localStorage. (`L2-stack-merge.md:23`)
- **Repo checks**: the root CI (Node 22) and a path-gated canvas workflow sit side by side. (`D1-merge-prototype.md:73-74`)

Arrows: none between the two apps. A dashed "same repo" line only.

Mechanism: both apps now live in one repository and both build, but they share no route, no data and no login, and the canvas still stores its data in the browser.

Verified at this commit: root typecheck, lint, build and 1,306 unit tests; 845 integration tests against PostgreSQL; 157 canvas tests. The verifier ran them on Node 26, not the target Node 24, so this is not target-runtime proof. (`icm/05-verify` source: `TEST-AUDIT.md:44-50`)

### After

The canvas screens run inside the one backend app and read and write through the server, behind one login with the new roles.

Boxes:
- **Browser**: the canvas screens, served by the root app, one login.
- **Web forms**: a thin server-action wrapper that calls the same service function. (`DECISIONS.md:34`)
- **Mobile apps (later)**: Capacitor 8 wrapping the same UI, with the PWA as the interim. They call only the HTTP routes. (`DECISIONS.md:34`, PR-31)
- **`app/api/v1/**` routes**: versioned JSON, one per operation. (`DECISIONS.md:34`)
- **Service functions**: one per operation, each validated with Zod at the boundary. (`DECISIONS.md:34`)
- **Auth check**: Auth.js cookie session or bearer token, and the ROLES matrix enforced on the server. (`DECISIONS.md:34,64`)
- **Prisma to PostgreSQL 16**: the data layer. (`DECISIONS.md:28`)

Arrows: Browser to `api/v1` (JSON). Web forms to the server-action wrapper to the service. Mobile to `api/v1` (bearer token). `api/v1` to the service. Service to the auth check first, then to Prisma, then to PostgreSQL.

Mechanism: every screen calls one validated service function per operation, the function checks the session and role on the server before anything is read or written, and only then does Prisma touch PostgreSQL.

## 3. Roadmap

31 PRs in six lanes. "Depends on" comes straight from each PR section (`icm/03-plan/output/PLAN.md`). "Blocked by" lists the owner decisions that gate the PR, from the PLAN.md decision list (Q1 to Q15), DECISIONS.md, and PLAN.md Appendix C.

Lanes: Foundation (PR-01 to PR-05), Data model (PR-M1 to PR-M9), Services (PR-SV1 to PR-SV4), Wire screens (PR-W1 to PR-W10), Messaging and media (PR-MSG, PR-MEDIA), Mobile (PR-31).

| PR | Name | Lane | Depends on | Blocked by decision |
|---|---|---|---|---|
| PR-01 | Merge FRONTEND into TRACKER | Foundation | none | Q9, Q15 |
| PR-02 | Root to Next 16.3.8 and React 19.3.0 | Foundation | PR-01 | none |
| PR-03 | One Biome policy, TypeScript 7, Turbopack, test cuts | Foundation | PR-02 | test audit approval |
| PR-04 | Flagged features reachable in dev | Foundation | PR-03 | Q1, consent-gate amendment (D12) |
| PR-05 | Versioned API and token auth | Foundation | PR-03 | ROLES, AUTH, mobile token design (D6) |
| PR-M1 | Client profile and lifecycle | Data model | PR-04 | Q3, Q10 |
| PR-M2 | Workspace and coach preferences | Data model | PR-04 | Q6 |
| PR-M3 | Notes and coach task model | Data model | PR-04 | Q4 |
| PR-M4 | Template definitions | Data model | PR-04, PR-M1 | Q5, Q12 |
| PR-M5 | Meal-plan payload | Data model | PR-04 | Q7 |
| PR-M6 | Training payload | Data model | PR-04 | Q11 |
| PR-M7 | Habit fields | Data model | PR-04 | none |
| PR-M8 | Check-in fields | Data model | PR-04 | Q13 |
| PR-M9 | Dashboard configuration | Data model | PR-04 | Q8 |
| PR-SV1 | Scoped roster read model | Services | PR-M1, PR-M4, PR-M8 | Q14 |
| PR-SV2 | Daily-entry numeric series | Services | PR-M1 | none |
| PR-SV3 | Dashboard widget feeds | Services | PR-SV2, PR-M5, PR-M6, PR-M7 | none |
| PR-SV4 | Client invitations | Services | PR-04 | none |
| PR-W1 | Identity and client home | Wire screens | PR-01, PR-05 | ROLES (D10) |
| PR-W2 | Roster and profile | Wire screens | PR-M1, PR-SV1, PR-SV4, PR-W1 | Q3, Q14, Q15, ROLES |
| PR-W3 | Templates and setup | Wire screens | PR-M4, PR-SV1 | Q5, Q12, ROLES |
| PR-W4 | Client tracker | Wire screens | PR-SV2, PR-W3, PR-W1 | Q10, ROLES |
| PR-W5 | Habits | Wire screens | PR-M7, PR-W1 | ROLES |
| PR-W6 | Check-ins | Wire screens | PR-M8, PR-W3, PR-W1 | Q13, Q14, ROLES |
| PR-W7 | Nutrition | Wire screens | PR-M5, PR-W1 | Q7, ROLES |
| PR-W8 | Training | Wire screens | PR-M6, PR-W1 | Q11, ROLES |
| PR-W9 | Dashboard builder | Wire screens | PR-M9, PR-SV3, PR-W1 | Q8, ROLES |
| PR-W10 | Notes and appearance | Wire screens | PR-M2, PR-M3, PR-W1 | Q4, Q6, ROLES |
| PR-MSG | Approved messaging (text only, if approved) | Messaging and media | PR-05, PR-M3 | Q2 |
| PR-MEDIA | Approved media storage | Messaging and media | PR-05, PR-M2 | Q2, storage vendor (D8), photo consent and retention (Appendix C) |
| PR-31 | PWA-first mobile and Capacitor 8 scope | Mobile | PR-05, PR-W1 to PR-W10 | ROLES, AUTH, mobile token design (via PR-05) |

Critical path to the first wired screen: PR-01, PR-02, PR-03, PR-05, PR-W1. The roster (PR-W2) waits on the most decisions: Q3, Q14, Q15, ROLES, plus PR-04 (Q1) through PR-M1, and PR-M4 and PR-M8 through PR-SV1.

## 4. Your decisions

Most blocking first. "Default" is what happens if you say nothing. Where the plan writes no default, it says so.

1. **Approve the plan, and whether GitHub issues get created.** Options: approve as written, approve after the fold-in, or hold. Default: nothing starts, nothing is pushed, no issues are created. Blocks all 31 PRs. Issues are created only after approval and after TRACKER is pushed (D9). The fold-in is not yet in PLAN.md: the AUTH and ROLES entries are not in its decision list, the consent appendix is missing, and one bullet still holds two questions (`icm/03-plan/FOLD-IN-NOTES.md:1-9`, `PLAN.md:6-12`). (`PLAN.md:2,26`, `DECISIONS.md:58-60`)

2. **Q15 and Q9, the PR-01 gate.** Q15: show the real role (owner and coach are separate in the backend), or keep the word "Coach" for solo workspaces with owner-only actions. Default: none written. Q9: keep a dev-only route for the Ethereal studio pages, or drop them except the imported parts. Default: port only the imported Ethereal parts (PR-01 build text). Blocks PR-01, which blocks everything; Q15 also blocks PR-W2. (`PLAN.md:11,12`, `PLAN.md:72`)

3. **ROLES, who may see, edit and do what.** Options: fill in the role by capability matrix cell by cell (owner, coach, assistant coach, support, client). Each cell shows the doc rule and the code rule side by side. Example: the doc denies the owner editing a client training plan (`docs/security/authorization-model.md:34`), while the code allows it for assigned clients (`lib/auth/rbac.ts:148`). Default: none written in the plan. Suggested fallback, which is my suggestion and not in the plan: deny wherever the doc and the code disagree until you decide. Blocks PR-05 and every screen-wiring PR (PR-W1 to PR-W10), and through them PR-MSG, PR-MEDIA and PR-31. Seven matrix rows are ROLES rows. (`DECISIONS.md:64`, `icm/02-gap-matrix/output/GAP-MATRIX.md:485-497`)

4. **AUTH, the sign-in library.** Options: Auth.js v5 with our own tokens, or Better Auth. Default: Auth.js with our own tokens (PLAN PR-05 text). If you pick Better Auth, four test blocks get rewritten in PR-05 and the session-revocation, inactive-account and malformed-claim guarantees must survive. Blocks PR-05. Also needed before PR-05's token part can start: a reviewed mobile token design (access and refresh token separation, key separation, audience binding, secure device storage, rotation, replay detection, revocation). I found no such design file under `icm/`; the R1 recipe is not one. (`PLAN.md:276`, `TEST-AUDIT.md:12,333`, `DECISIONS.md:34`)

5. **Q1, how the first coach account exists.** Today sign-up is invite-only and the dev seed is missing (`auth.ts:10-12`, cited in PLAN.md:8). Options: platform-operator provisioning with a dev seed, or coach self-signup (this amends decision #13). Default: PR-04 fails closed and adds no default credential (`PLAN.md:1664`). Blocks PR-04 and every live check, so no PR can be fully verified until it is answered. (`PLAN.md:8`)

6. **Approve the test audit, including the auth-spec cut.** Options: approve as is, or change individual files. Default: nothing is deleted, and PR-03 waits. The audit's explicit cut of `tests/e2e/auth.spec.ts` overrides an earlier keep and needs your sign-off (`TEST-AUDIT.md:15`). Blocks PR-03, which deletes about 24,330 lines. (`TEST-AUDIT.md:1,14-15`)

7. **Consent gates, for PR-04.** Parked (D12): consent and health-data rules do not shape or block any plan PR. But PR-04 is where the blocked consent gates have to go, and that needs a plan amendment. Options: approve the amendment that disables or routes around the parked gates behind a flag and lists each one in a parked appendix, or keep PR-04's "no consent bypass" wording. Default: the wording stays and the 29 consent-blocked test blocks stay in place. Blocks PR-04. Also a contradiction to resolve: Appendix C lists "PHOTOS consent and retention" as a blocker of PR-MSG and PR-MEDIA, while D12 says parked consent rules gate no PR. Tell me which applies. (`DECISIONS.md:78`, `TEST-AUDIT.md:13,330`, `PLAN.md:1667`, `PLAN.md:1551`)

8. **Q2, messaging and media.** Options: text-only messaging now, or defer both and hide the messages nav. Default: hold PR-MSG and PR-MEDIA, and keep messaging hidden (PR-W10 text). Blocks PR-MSG and PR-MEDIA, and the messages, notes and media screen (conflict rows S02-08 and S02-12). Storage vendor is still open (D8). (`PLAN.md:8,1449,1500`, `DECISIONS.md:41`)

9. **Q14, workspace calendar reads.** Options: approve scoped reads and attention rules across the workspace, or keep per-client calendars and pending counts. Default: none written. Blocks PR-SV1, PR-W2 and PR-W6. (`PLAN.md:12`)

10. **Q5 and Q12, the template library and undo.** Q5: seed the catalog after a source-fidelity review, or ship an empty library. Default: none written; an empty library is the lower-risk choice, my reading. Q12: replace Undo with a confirmation, or amend the rule to allow a timed restore. Default: none written. Blocks PR-M4 (and so PR-SV1) and PR-W3. (`PLAN.md:10,12,468`)

11. **Q6, where appearance settings are saved.** Options: on the server, scoped to the workspace, or in the browser only. Default: none written. Blocks PR-M2 and PR-W10. (`PLAN.md:10,366`)

12. **Q4, coach-only tasks.** Options: add a separate private, audited entity, or drop private tasks. Default: not built (PR-M3 builds them only if Q4 approves). Blocks PR-M3 and PR-W10. (`PLAN.md:9,417`)

13. **Q3, what a client archive means.** Options: a soft archive with phase and week derived from the plan, or membership end with a coach-entered phase and week. Default: soft archive with phase and week derived (PR-M1 text). Blocks PR-M1 and PR-W2. (`PLAN.md:9,315`)

14. **Q10, time and duration fields.** Options: amend the rule with a display format, or hide those fields. Default: hide (PR-W4 text). Blocks PR-M1 and PR-W4. (`PLAN.md:11,1131`)

15. **Q7, nutrition totals.** Options: amend the rule to allow labeled estimates, or use entered values only. Default: entered values only (PR-M5 text). Blocks PR-M5 and PR-W7. (`PLAN.md:10,519`)

16. **Q11, training volume.** Options: amend for plain set counts, or hide the volume panel. Default: no volume output (PR-M6 text). Blocks PR-M6 and PR-W8. (`PLAN.md:12,570`)

17. **Q13, check-in generation.** Options: explicit generation only, or scheduled replenishment. Default: explicit generation (PR-M8 text). Blocks PR-M8 and PR-W6. (`PLAN.md:12,672`)

18. **Q8, dashboard layout.** Options: copied template defaults, or a per-client layout only. Default: none written. Blocks PR-M9 and PR-W9. (`PLAN.md:11,723`)

**Parked, no decision needed now.** Consent and health-data rules (D12). Six matrix rows are parked (`GAP-MATRIX.md:499-516`). These are listed for later and do not block a PR. Their appendix is not yet in PLAN.md.

## 5. Tests in one line

Of 232 test files, 67 keep as they are, 67 are trimmed, 61 are cut in PR-03 (about 24,330 lines), and 37 wait for their replacement: 28 in PR-05 (today's permission model) and 9 in PR-04 (consent); the 398 cases in the 41 old-UI browser specs were inventoried, not run. (`icm/03-plan/output/TEST-AUDIT.md:24-36,329-330`)

## Self-check

| Check | Result | Evidence |
|---|---|---|
| Every PR id in this file exists in PLAN.md | PASS | 31 of 31 PR ids used; the 31 PLAN.md PR sections all appear in the roadmap table. |
| Every decision exists in DECISIONS.md or PLAN.md | PASS | D1, D6, D8, D9, D10, D12, D13 are DECISIONS.md headings; Q1 to Q15 are the PLAN.md owner list (lines 8 to 12); ROLES and AUTH are in DECISIONS.md (D10, D14); PHOTOS consent and storage vendor are in PLAN.md Appendix C and line 1551. |
| Every number traces to a source | PASS | 31 PRs, 338-row matrix (not quoted here), 232 test files, 67 / 67 / 61 / 37 file split, 24,330 and 32,251 lines, 1,306 / 845 / 157 test runs all checked against the cited files. |
| Line citations point at the cited text | PASS | Spot-checked each citation against its file. Wrong line refs found in the pass were fixed. |
| No invented facts | PASS with two labelled suggestions | Two items are my suggestions, not plan text, and are labelled as such: the ROLES fallback (deny where doc and code disagree) and "an empty library is the lower-risk choice" (Q5). |
| Plan state | Stated as found | PLAN.md has not had the FOLD-IN-NOTES.md changes applied: no AUTH or ROLES entry in its decision list, no parked appendix. Stated in decision 1. |
| Contradiction surfaced, not resolved | Flagged | PHOTOS consent blocks PR-MSG and PR-MEDIA in PLAN.md Appendix C, but D12 says parked consent gates no PR. Raised in decision 7. |
| Internal ids | PASS | PR ids appear only where the brief asks for them (next moves, roadmap, decision blocks). No matrix status codes or row ids are used. |
| Long dashes | PASS | 0 em or en dashes in the file. |
