# Supervised transition runbook — PR #203 → #206 → #207

Status: preparation + no-merge verification only. PR #209's executor is NOT approved for
execution (parked, unmodified). This runbook is the concrete supervised procedure — exact
commands and checkpoints, no reusable framework.

Owner authorization (task P447/P450, 2026-10-26): integrate #203, #206, #207 in order under
the disclosed cross-review arrangement, conditional on reviewed tooling and real gates.
Baseline activation and deployment are prohibited.
**Pending authorization input:** a human-posted GitHub comment recording this decision. It
must name author, approved heads and activation prohibition. No merge step may run before it
is supplied and verified; nothing agent-authored substitutes for it.

## Pinned state (verified live 2026-10-26)

| step | PR | head | branch | current base | draft |
|------|-----|------|--------|--------------|-------|
| 1 | #203 | `90c16bee63e2609ebc4f09e91459332390562464` | beta/parity-https | Vari8-Beta | yes |
| 2 | #206 | `43b63ed0f41e6e92e93ecf72065c0190c9ef3dea` | beta/visual-reference-establishment | beta/parity-https | yes |
| 3 | #207 | `04902f1dc3d317e0959ae533f2f4c479a8fc55f9` | beta/p203-p206-combined-verification | beta/visual-reference-establishment | yes |

Permitted deviation from canonical `integrate.sh`: the stacked sequence — #203 lands on
Vari8-Beta first, then #206 and #207 are explicitly retargeted and re-integrated. Everything
else is preserved: real shared lock, isolated test merge, fast gate, combined gate,
head-pinned merge, post-merge parent/tree/audit checks, baseline boundary.

## #203 preparation — exact commands (already executed; transcript `p452/prep.log`)

```bash
# variables — all defined; secrets from env only (POSTGRES_PASSWORD, BETTER_AUTH_SECRET)
REPO=hanzlahsfc/vari8
HEAD=90c16bee63e2609ebc4f09e91459332390562464
BASE=Vari8-Beta
WT=/tmp/p452-wt; STATE=/tmp/p452/state; DB=app_p452; PORT=58152
BUNDLE_COMMIT=04902f1dc3d317e0959ae533f2f4c479a8fc55f9
BUNDLE_PATH=tools/parity
BUNDLE_TREE=f457065f61753245b6853ac3ddb3236deb00c8bd
NODE="npx -y node@24.22.1"

# lock (real shared flock, held for the duration)
mkdir -p "$STATE"; exec 9>"$STATE/Vari8-Beta.lock"; flock -x 9

# revalidate refs
gh pr view 203 -R "$REPO" --json headRefOid,baseRefName,state,isDraft
git -C "$WT" rev-parse "origin/$BASE"     # record base tip

# isolated test merge
git worktree add "$WT" --detach "origin/$BASE"
git -C "$WT" checkout -q --detach "$HEAD"
git -C "$WT" merge -q --no-ff --no-edit -m "test merge transition p203" "origin/$BASE"
git -C "$WT" rev-parse 'HEAD^{tree}'      # record merge tree

# baseline boundary — BEFORE
git -C "$WT" rev-parse "origin/$BASE:$BUNDLE_PATH/baseline"
git -C "$WT" rev-parse -q --verify "origin/$BASE:$BUNDLE_PATH/reference/active" \
  || echo "no active reference on base"

# disposable DB (refuse existing, task-owned)
psql -h 127.0.0.1 -p 5434 -U app -d postgres -lqt | grep -qw "$DB" && exit 2
createdb -h 127.0.0.1 -p 5434 -U app "$DB"
export DATABASE_URL="postgresql://app:${POSTGRES_PASSWORD}@127.0.0.1:5434/$DB?schema=public"

# dirty-state refusal probe
echo dirty >> "$WT/$BUNDLE_PATH/run.mjs"
(cd "$WT" && $NODE $BUNDLE_PATH/run.mjs)      # must refuse
git -C "$WT" checkout -- "$BUNDLE_PATH/run.mjs"

# fast gate — unmasked exits
cd "$WT"; npm ci --no-audit --no-fund --prefer-offline
$NODE ./node_modules/.bin/prisma generate
$NODE ./node_modules/.bin/prisma migrate deploy
$NODE ./node_modules/.bin/tsc --noEmit
$NODE ./node_modules/.bin/eslint .
npm run test
$NODE ./node_modules/.bin/next build

# reviewed tooling overlay — pinned bundle grafted as a temp task-owned commit.
# The #203 merge tree lacks tools/parity/reference; the overlay supplies gate tools only.
# Verify: git diff HEAD~1 HEAD -- ':!tools/parity' must be EMPTY (no app/product/auth change).
git rev-parse "$BUNDLE_COMMIT:$BUNDLE_PATH"     # must equal $BUNDLE_TREE
git archive "$BUNDLE_COMMIT" "$BUNDLE_PATH" | tar -x -C /tmp/p452-overlay
rm -rf "$WT/$BUNDLE_PATH"; cp -R "/tmp/p452-overlay/$BUNDLE_PATH" "$WT/tools/"
git -C "$WT" add -f "$BUNDLE_PATH"
git -C "$WT" commit -qm "overlay graft $BUNDLE_TREE"

# combined capture — proposed-reference
(cd "$WT/$BUNDLE_PATH/reference" && npm ci --no-audit --no-fund)
cd "$WT" && env -u NODE_ENV APP_ENV=development DATABASE_URL="$DATABASE_URL" \
  MEDIA_STORAGE_ADAPTER=local MEDIA_STORAGE_DIR=/tmp/p452-media \
  NEXT_TELEMETRY_DISABLED=1 PARITY_COMPARER=reference \
  PARITY_REFERENCE_DIR=$BUNDLE_PATH/reference/proposed \
  PARITY_OUT_DIR=$BUNDLE_PATH/out/p452-run PARITY_PORT=$PORT \
  $NODE $BUNDLE_PATH/run.mjs            # require: canonical 70/70; strict diagnostics reported

# baseline boundary — AFTER (must equal BEFORE)
git rev-parse "HEAD:$BUNDLE_PATH/baseline"

# cleanup — task-owned only
dropdb -h 127.0.0.1 -p 5434 -U app --if-exists "$DB"
flock -u 9; exec 9>&-
```

## Authorized merge commands (NOT run — separate approval + pending owner comment)

```bash
# immediately before merge: re-fetch + revalidate head AND base tip; abort on movement
git fetch -q origin; git rev-parse "origin/$BASE"   # must equal recorded tip
gh pr view 203 -R "$REPO" --json headRefOid,baseRefName,state,isDraft
gh pr ready 203 -R "$REPO"            # only if still draft, owner-authorized
gh pr merge 203 -R "$REPO" --merge --match-head-commit "$HEAD"
# derive — never invent — the resulting merge SHA, parents and tree:
MERGE_SHA=$(gh pr view 203 -R "$REPO" --json mergeCommit --jq .mergeCommit.oid)
git cat-file -p "$MERGE_SHA" | awk '/^parent/{print $2}'    # must be [base tip, head]
git rev-parse "$MERGE_SHA^{tree}"                            # must equal recorded test tree
git rev-parse "origin/$BASE:$BUNDLE_PATH/baseline"           # must equal BEFORE hash
```

## Remaining steps

2. **#206 retarget (explicit):** after #203 merges, `gh pr edit 206 -B Vari8-Beta`, then a
   normal forward update of `beta/visual-reference-establishment` onto the new base — no
   rebase/force-push — changed head requires fresh review/revalidation, then the full
   preparation sequence repeats for the updated head.
3. **#207:** identical retarget + update + prepare + merge once #206 lands; its tools enter
   the final tree so no overlay graft is needed there.
4. **Baseline activation:** separately approved later step; not authorized here.

## Stop conditions / residual race
Failed gate · moved head/base · merge parent/tree mismatch · unresolved FIX · infra missing ·
activation-boundary change. `--match-head-commit` pins the head only; the base can still move
between merge and verification — recheck immediately and investigate any mismatch.

## Evidence
`RECEIPTS-p203-prep.md`, `p452/` — complete logged transcript + capture receipts + hashes.
