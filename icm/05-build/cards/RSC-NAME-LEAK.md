# RSC-NAME-LEAK: training-program page leaks a foreign client's name

Issue #71, branch `beta/rsc-name-leak-fix`, worktree `/home/nexuslink/vari8-worktrees/rsc-name-leak-fix`. Read issue #71.

`app/workspace/[workspaceId]/clients/[clientProfileId]/training-program/page.tsx:47-50` reads `clientProfile.name` by URL ids before authorization and renders it at :64. The response is 403 but the RSC payload carries the foreign client's name. Only reachable with `ENABLE_TRAINING_PLANS=1` outside production.

Fix: authorization runs before any lookup that returns tenant data. Then grep every sibling page under `app/workspace/` for the same pattern (data read by URL ids before the authorization call) and fix the class, not only this page. List every page you checked in the report.

Acceptance: an integration or live probe with two workspaces: a user of workspace A requesting workspace B's client page gets 403 and the response body (including the RSC payload) contains no B name; the same probe fails on the current code. Own DB `app_rsc_leak`.

Follow `icm/05-build/cards/PIPELINE-FOOTER.md` in your worktree completely (it is in this branch). node_modules: run `npm ci` in your worktree root (and `cd frontend && npm ci` if you build frontend) in the background with a log; never symlink node_modules (Turbopack rejects it). Long commands run in the background writing logs; never block one tool call longer than 4 minutes. Never write docs/STATUS.md.
