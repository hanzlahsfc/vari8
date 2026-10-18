# Notes for the round-3 fold-in pass (PLAN.md and GAP-MATRIX.md)

Collected from reviews so the fold-in brief includes them.

1. `## Owner decisions needed`: one bullet per question (today some bullets hold two). Format each as `- Q<n>. <short title>. The evidence is ... Options ... This blocks <PR ids>.`
2. Add the auth-library choice as its own decision `AUTH` (Auth.js plus own tokens vs Better Auth) that blocks PR-05. Today it lives only inside PR-05 (`PLAN.md:276`, `:1665`), so the generator emits no decision issue for it.
3. Keep plan ids stable. New sections from round 3 get new ids that follow the prefixes the generator knows (`PR-0n` foundation is limited to 01 to 05 and throws on others, `PR-M*`, `PR-SV*`, `PR-W*`, `PR-MSG`, `PR-MEDIA`, `PR-31`). A new foundation PR needs a generator label rule update.
4. After the fold-in, rerun `node icm/03-plan/tools/plan-to-issues.check.mjs` and update its expected counts (31 build, 15 decision today).
5. D10: add the `ROLES` decision (role by capability matrix built from the canvas surfaces, doc rule vs code rule per cell, blocks PR-05 and every PR-W). Re-label every CONFLICT row whose only basis is `docs/security/authorization-model.md` or an RBAC grant as a ROLES decision row; consent and health-data rows are parked per item 9 (D12). Include G6's finding: doc `authorization-model.md:32-34` vs `lib/auth/rbac.ts:148` on owner edits. The generator needs `ROLES` and `AUTH` accepted as decision keys.
6. Apply judged decisions: D4a (one Biome policy, enable noNextAsyncClientComponent and nursery useReactCompiler, fix the 10 hook findings in PR-03), D6 (one boundary per operation; mobile auth design is its own reviewed item before PR-05 builds tokens; offline health-data rules), D7/D8 corrections. Sources: icm/05-verify/output/RV-A.md, RV-B2.md.
7. D11 (corrected: reduce, not remove): PR-03 deletes only the test files TEST-AUDIT.md marks CUT; KEEP files stay; the per-PR "Verify, unit" box lists only tests meeting the D11 keep rule, never compile-proof suites; every builder card states the keep rule.
8. check-plan.mjs requires a "Verify, unit." block per PR: it names the kept or new behavior tests for that PR (with their bite check), or states "None needed, proven live" when the live lanes cover it.
9. D12: consent, health-data storage and data-protection rules are parked. Move their CONFLICT rows and any PR work driven only by them into a `## Parked: consent and health data` appendix; where a consent gate blocks a canvas flow, the PR routes around it behind a flag and names it in that appendix.
