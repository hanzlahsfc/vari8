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

| step | PR   | head                                       | branch                               | current base                        | draft |
| ---- | ---- | ------------------------------------------ | ------------------------------------ | ----------------------------------- | ----- |
| 1    | #203 | `90c16bee63e2609ebc4f09e91459332390562464` | beta/parity-https                    | Vari8-Beta                          | yes   |
| 2    | #206 | `43b63ed0f41e6e92e93ecf72065c0190c9ef3dea` | beta/visual-reference-establishment  | beta/parity-https                   | yes   |
| 3    | #207 | `04902f1dc3d317e0959ae533f2f4c479a8fc55f9` | beta/p203-p206-combined-verification | beta/visual-reference-establishment | yes   |

Permitted deviation from canonical `integrate.sh`: the stacked sequence — #203 lands on
Vari8-Beta first, then #206 and #207 are explicitly retargeted and re-integrated. Everything
else is preserved: real shared lock, isolated test merge, fast gate, combined gate,
head-pinned merge, post-merge parent/tree/audit checks, baseline boundary.

## #203 preparation — exact commands (already executed; transcript `p452/prep.log`)

```bash
# variables — all defined; secrets from env only (POSTGRES_PASSWORD, BETTER_AUTH_SECRET)
REPO=hanzlahsfc/vari8
HEADSHA=90c16bee63e2609ebc4f09e91459332390562464   # pinned #203 head
BASE=Vari8-Beta
HEAD="$HEADSHA"
WT=/tmp/p452-wt; STATE=/tmp/p452/state; DB=app_p452; PORT=58152
BUNDLE_COMMIT=04902f1dc3d317e0959ae533f2f4c479a8fc55f9
BUNDLE_PATH=tools/parity
BUNDLE_TREE=f457065f61753245b6853ac3ddb3236deb00c8bd
NODE="npx -y node@24.22.1"

# lock (real shared flock, held continuously through this step's
# revalidation, gates and merge — a later step acquires a fresh lock; prior
# invocations' locks/receipts never carry over)
mkdir -p "$STATE"; exec 9>"$STATE/Vari8-Beta.lock"; flock -x 9
trap 'flock -u 9 2>/dev/null; exec 9>&-; dropdb -h 127.0.0.1 -p 5434 -U app --if-exists "$DB" 2>/dev/null' EXIT

# isolated worktree FIRST — no `git -C $WT` reads before this line
git worktree add "$WT" --detach "origin/$BASE"

# revalidate refs (live, under the lock)
gh pr view 203 -R "$REPO" --json headRefOid,baseRefName,state,isDraft
git -C "$WT" rev-parse "origin/$BASE"     # record base tip
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

# dirty-state refusal probe — task-owned backup + byte-identical restore
cp "$WT/$BUNDLE_PATH/run.mjs" "$STATE/run.mjs.bak"
echo dirty >> "$WT/$BUNDLE_PATH/run.mjs"
(cd "$WT" && $NODE $BUNDLE_PATH/run.mjs)      # must refuse
cmp -s "$STATE/run.mjs.bak" "$WT/$BUNDLE_PATH/run.mjs" || cp "$STATE/run.mjs.bak" "$WT/$BUNDLE_PATH/run.mjs"
shasum -a 256 "$STATE/run.mjs.bak" "$WT/$BUNDLE_PATH/run.mjs"   # byte-identical proof

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
mkdir -p /tmp/p452-overlay "$WT/tools"; rm -rf /tmp/p452-overlay/tools
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

# cleanup — handled by the EXIT trap (drops only the DB this step created,
# releases this step's lock); a later step repeats acquisition/validation
```

## Single-invocation execution block (merge — NOT run in this task)

The preparation above releases its lock and resources when it ends. A merge
invocation is a NEW lock-held block that reacquires the lock, revalidates refs
and repeats required preparation/gates; stale preparation is never permission.

```bash
mkdir -p "$STATE"; exec 9>"$STATE/Vari8-Beta.lock"; flock -x 9   # REACQUIRE
trap 'flock -u 9 2>/dev/null; exec 9>&-' EXIT
git fetch -q origin
# live revalidation under the fresh lock
gh pr view 203 -R "$REPO" --json headRefOid,baseRefName,state,isDraft
[[ "$(git rev-parse origin/Vari8-Beta)" == "$(<"$STATE/base-tip")" ]] || exit 4
# re-run the test merge + fast + combined gates (as the preparation block),
# then, with the owner comment recorded and verified:
gh pr ready 203 -R "$REPO"    # only if still draft and owner-authorized
gh pr merge 203 -R "$REPO" --merge --match-head-commit "$HEADSHA"
MERGE_SHA=$(gh pr view 203 -R "$REPO" --json mergeCommit --jq .mergeCommit.oid)
git fetch -q origin "$MERGE_SHA"          # fetch BEFORE checking parents/tree
P1=$(git rev-parse "$MERGE_SHA^1"); P2=$(git rev-parse "$MERGE_SHA^2")
MT=$(git rev-parse "$MERGE_SHA^{tree}")
[[ "$P1" == "$BASETIP" && "$P2" == "$HEADSHA" && "$MT" == "$MERGETREE" ]]   || { echo "merge tree/parent mismatch — investigate"; exit 4; }
git rev-parse "origin/$BASE:$BUNDLE_PATH/baseline"   # must equal the BEFORE hash
```

## Remaining steps

2. **#206 — concrete procedure** (fresh lock, no force-push):

```bash
exec 9>"$STATE/Vari8-Beta.lock"; flock -x 9            # reacquire — fresh lock
MERGED_203=$(gh pr view 203 -R "$REPO" --json state,mergeCommit --jq 'select(.state=="MERGED").mergeCommit.oid')
[[ -n "$MERGED_203" ]] || { echo "#203 not merged — stop"; exit 4; }
git fetch -q origin; git rev-parse "origin/Vari8-Beta"  # new base tip (contains 203)
gh pr edit 206 -R "$REPO" -B Vari8-Beta                 # explicit authorized retarget
# normal forward update of the PR branch — merge the new base INTO it (no force-push):
git checkout -q beta/visual-reference-establishment && git pull --ff-only
git merge --no-edit origin/Vari8-Beta || { echo "conflict — manual review"; exit 3; }
git push origin beta/visual-reference-establishment
H206=$(gh pr view 206 -R "$REPO" --json headRefOid --jq .headRefOid)   # DERIVED new head
echo "changed head $H206 — fresh review/revalidation REQUIRED before proceeding"
# then the full locked preparation sequence repeats for $H206
# merge (only after reviewed head): gh pr merge 206 --merge --match-head-commit "$H206"
# parents must be [new base tip, $H206]; tree must equal the #206 test-merge tree.
```

3. **#207 — concrete procedure**: derive `MERGED_206` (required non-empty),
   `gh pr edit 207 -R "$REPO" -B Vari8-Beta`, forward-update
   `beta/p203-p206-combined-verification` by merging the new base into it (no force-push),
   push, review/revalidate the new head, run the full locked preparation. Its tools live
   in the branch, so the combined capture runs without the overlay graft.
4. **Baseline activation:** separately approved later step; not authorized here.

## Stop conditions / residual race

Failed gate · moved head/base · merge parent/tree mismatch · unresolved FIX · infra missing ·
activation-boundary change. `--match-head-commit` pins the head only; the base can still move
between merge and verification — recheck immediately and investigate any mismatch.

## Evidence

`RECEIPTS-p203-prep.md`, `p452/` — complete logged transcript + capture receipts + hashes.
