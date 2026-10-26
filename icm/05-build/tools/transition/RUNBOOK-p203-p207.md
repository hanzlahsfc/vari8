# Supervised transition runbook — PR #203 → #206 → #207

Status: preparation + no-merge verification only. PR #209 executor is NOT approved for
execution (parked; not repaired further). This runbook is the concrete supervised procedure
for the already-authorized transition — exact commands and checkpoints, no reusable framework.

Owner authorization (recorded in task P447/P450, 2026-10-26): integrate #203, #206, #207 in
order under the disclosed cross-review arrangement, conditional on reviewed tooling and real
gates. Baseline activation and deployment are prohibited. Authorization came in the task —
no human GitHub comment record exists yet; until one is posted, this runbook's merge step
requires that pending input.

## Pinned state (verified live, 2026-10-26)

| step | PR | head | branch | current base | draft |
|------|-----|------|--------|--------------|-------|
| 1 | #203 | 90c16bee63e2609ebc4f09e91459332390562464 | beta/parity-https | Vari8-Beta | yes |
| 2 | #206 | 43b63ed0f41e6e92e93ecf72065c0190c9ef3dea | beta/visual-reference-establishment | beta/parity-https | yes |
| 3 | #207 | 04902f1dc3d317e0959ae533f2f4c479a8fc55f9 | beta/p203-p206-combined-verification | beta/visual-reference-establishment | yes |

Permitted deviation from canonical `integrate.sh`: merge #203 first under the owner-authorized
stacked sequence, then retarget #206/#207 after their bases are merged. Everything else is
preserved: real shared lock, isolated test merge, fast gate, combined gate, head-pinned merge,
post-merge parent/tree/audit checks, baseline boundary.

## #203 preparation (proven — see receipts)

```
# 0. prereqs: approved Node 24.22.1; running DB (postgres@5434 here; executor env uses
#    docker container app-db-1 when daemon is up); flock; gh; jq
mkdir -p "$WT/.locks"; exec 9>"$WT/.locks/Vari8-Beta.lock"; flock 9   # REAL lock

git fetch -q origin
gh pr view 203 --json headRefOid,baseRefName,state,isDraft        # revalidate → match table
git worktree add /tmp/p450-wt --detach origin/Vari8-Beta
cd /tmp/p450-wt
git checkout -q --detach 90c16bee… && git merge -q --no-ff --no-edit -m "test merge p203" origin/Vari8-Beta
# record: merge tree 6fd7353e4734632c49c6d9e28427dd2c5c8a1556, base tip d1c4081…

# disposable DB (unique name, refuse existing):
psql -lqt | grep -qw app_p450 && exit 2 || createdb app_p450

npm ci --no-audit --no-fund --prefer-offline
npx prisma generate && npx prisma migrate deploy
npm run typecheck && npm run lint && npm run test && npm run build    # UNMASKED exits

# combined gate — runner executes from this complete app checkout. The #203 merge tree
# lacks the proposed reference; a reviewed tooling overlay grafts the pinned #207 bundle
# (commit 04902f1d:tools/parity, tree f457065f61753245b6853ac3ddb3236deb00c8bd) as a temp
# task-owned commit — recorded separately; no app/product/auth file is touched by it.
PARITY_OUT_DIR=out/p450-run PARITY_COMPARER=reference \
PARITY_REFERENCE_DIR=tools/parity/reference/proposed PARITY_PORT=58150 \
APP_ENV=development DATABASE_URL=postgresql://app:***@127.0.0.1:5434/app_p450 \
node tools/parity/run.mjs
```

## Baseline boundary
Before/after preparation, record `git rev-parse HEAD:tools/parity/baseline` (tree sha) and the
default reference selection; must be byte-identical. No file/symlink/config may activate
proposed references.

## Remaining steps (exact)
1. **#203 merge:** revalidate head/base seconds before `gh pr ready 203` (if still draft,
   owner-authorized) then `gh pr merge 203 --merge --match-head-commit 90c16bee…`; verify
   mergeCommit parents = [base tip, head] and tree == tested `6fd7353e…`; audit record.
2. **#206 retarget:** after #203 merges, retarget #206 to Vari8-Beta (`gh pr edit 206 -B
   Vari8-Beta`), pull/rebase onto new base, force-push, re-review changed head, revalidate.
3. **#206 integration:** repeat the full preparation sequence for its updated head.
4. **#207:** equivalent retarget/update/integration; its runner/evidence enters the final tree.
5. **Baseline activation:** SEPARATE later approval; this runbook does not authorize it.

## Stop conditions
Failed gate · moved head/base (fresh authorization required) · merge parent/tree mismatch ·
unresolved FIX finding · docker/DB unavailable · activation-boundary change. Residual remote
race: `--match-head-commit` pins the head, NOT the base — re-fetch base tip before merge and
verify parents/tree after.

## Failure/recovery
Disposable `app_p450` DB; refuse existing names; drop only invocation-created resources.
Interrupted attempts leave `_transition/` state for inspection — no blind repeats.
