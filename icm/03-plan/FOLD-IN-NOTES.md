# Notes for the round-3 fold-in pass (PLAN.md and GAP-MATRIX.md)

Collected from reviews so the fold-in brief includes them.

1. `## Owner decisions needed`: one bullet per question (today some bullets hold two). Format each as `- Q<n>. <short title>. The evidence is ... Options ... This blocks <PR ids>.`
2. Add the auth-library choice as its own decision `AUTH` (Auth.js plus own tokens vs Better Auth) that blocks PR-05. Today it lives only inside PR-05 (`PLAN.md:276`, `:1665`), so the generator emits no decision issue for it.
3. Keep plan ids stable. New sections from round 3 get new ids that follow the prefixes the generator knows (`PR-0n` foundation is limited to 01 to 05 and throws on others, `PR-M*`, `PR-SV*`, `PR-W*`, `PR-MSG`, `PR-MEDIA`, `PR-31`). A new foundation PR needs a generator label rule update.
4. After the fold-in, rerun `node icm/03-plan/tools/plan-to-issues.check.mjs` and update its expected counts (31 build, 15 decision today).
5. D10: add the `ROLES` decision (role by capability matrix built from the canvas surfaces, doc rule vs code rule per cell, blocks PR-05 and every PR-W). Re-label every CONFLICT row whose only basis is `docs/security/authorization-model.md` or an RBAC grant as a ROLES decision row; keep CONFLICT only for legal requirements (health-data consent, data protection). Include G6's finding: doc `authorization-model.md:32-34` vs `lib/auth/rbac.ts:148` on owner edits. The generator needs `ROLES` and `AUTH` accepted as decision keys.
