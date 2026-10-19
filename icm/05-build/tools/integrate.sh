#!/usr/bin/env bash
# Integrate one verified PR into Vari8-Beta on GitHub (D35, orchestrator rules of 02:25 and 02:35).
# Usage: integrate.sh <PLAN-id> <head-branch>      e.g. integrate.sh PR-01 beta/pr-01-canvas-takeover
# Run from the merge card's own worktree. One lock serializes every merge. The merge only happens
# after a verifier comment on the PR says "SHIP <PLAN-id> <head sha>" for the current head, no
# "FIX" verdict exists for that head, and the fast gate passes on the exact merge result GitHub
# will produce. Then it cleans up (ship-all rule). INTEGRATE_DRY_RUN=1 stops before the merge.
# Exit codes: 0 merged, 2 usage or state, 3 conflict with trunk, 4 no SHIP verdict for this head, 5 fast gate red.
set -euo pipefail
PR_ID="${1:?plan id, e.g. PR-01}"
HEAD_BRANCH="${2:?head branch, e.g. beta/pr-01-canvas-takeover}"
REPO="${INTEGRATE_REPO:-hanzlahsfc/The-great-tracker-}"
BASE="${INTEGRATE_BASE:-Vari8-Beta}"
BETA="${INTEGRATE_BETA:-/home/nexuslink/vari8-worktrees/beta}"
WT="/home/nexuslink/vari8-worktrees"
LOCKS="$WT/.locks"
LIVE="$WT/_live"
SLUG="${HEAD_BRANCH#beta/}"
HERE="$(git rev-parse --show-toplevel)"
[[ "$(realpath "$HERE")" != "$(realpath "$BETA")" ]] || { echo "run from the merge card worktree, not $BETA" >&2; exit 2; }
mkdir -p "$LOCKS" "$LIVE"
exec 9>"$LOCKS/${BASE//\//_}.lock"
echo "waiting for the integration lock"
flock 9
echo "lock held"

git fetch -q origin
PR_JSON="$(gh pr list -R "$REPO" --head "$HEAD_BRANCH" --base "$BASE" --state open --json number,headRefOid,body --limit 1)"
PR_NUM="$(jq -r '.[0].number // empty' <<<"$PR_JSON")"
[[ -n "$PR_NUM" ]] || { echo "no open PR from $HEAD_BRANCH into $BASE" >&2; exit 2; }
HEAD_SHA="$(jq -r '.[0].headRefOid' <<<"$PR_JSON")"
ISSUE="$(jq -r '.[0].body // ""' <<<"$PR_JSON" | grep -oiE 'closes #[0-9]+' | head -1 | grep -oE '[0-9]+' || true)"

COMMENTS="$(gh pr view "$PR_NUM" -R "$REPO" --json comments --jq '.comments[].body')"
if ! grep -q "^SHIP $PR_ID $HEAD_SHA" <<<"$COMMENTS"; then
  echo "no 'SHIP $PR_ID $HEAD_SHA' verdict on PR #$PR_NUM" >&2
  exit 4
fi
if grep -q "^FIX $PR_ID $HEAD_SHA" <<<"$COMMENTS"; then
  echo "a verifier said FIX for $HEAD_SHA on PR #$PR_NUM" >&2
  exit 4
fi

git checkout -q --detach "$HEAD_SHA"
if ! git merge -q --no-ff --no-edit -m "test merge $PR_ID" "origin/$BASE"; then
  git merge --abort || true
  gh pr comment "$PR_NUM" -R "$REPO" --body "FIX $PR_ID $HEAD_SHA: conflict with $BASE at integration; update the branch and re-verify."
  exit 3
fi

NORM="$(echo "$PR_ID" | tr 'A-Z' 'a-z' | tr -cd 'a-z0-9')"
DB="app_merge_${NORM}"
PGPASS="${POSTGRES_PASSWORD:-app_dev_password}"
export DATABASE_URL="postgresql://app:${PGPASS}@127.0.0.1:5433/${DB}?schema=public"
export AUTH_SECRET="${AUTH_SECRET:-$(openssl rand -base64 32)}"
docker exec vari8-db-1 dropdb -U app --if-exists "$DB" >/dev/null
docker exec vari8-db-1 createdb -U app "$DB"
trap 'docker exec vari8-db-1 dropdb -U app --if-exists "$DB" >/dev/null 2>&1 || true' EXIT

gate() {
  npm ci --no-audit --no-fund --prefer-offline &&
    npx prisma generate &&
    npx prisma migrate deploy &&
    npm run typecheck &&
    npm run lint &&
    npm run test &&
    npm run build
}
if ! gate > "$LIVE/$SLUG.merge-gate.log" 2>&1; then
  tail -40 "$LIVE/$SLUG.merge-gate.log" >&2
  gh pr comment "$PR_NUM" -R "$REPO" --body "FIX $PR_ID $HEAD_SHA: fast gate red on the merge result at integration. Log: $LIVE/$SLUG.merge-gate.log"
  exit 5
fi
if [[ "${INTEGRATE_DRY_RUN:-0}" == 1 ]]; then
  echo "DRY RUN: would merge PR #$PR_NUM at $HEAD_SHA, close issue ${ISSUE:-none}, clean $SLUG"
  exit 0
fi

gh pr ready "$PR_NUM" -R "$REPO" >/dev/null 2>&1 || true
gh pr merge "$PR_NUM" -R "$REPO" --merge --match-head-commit "$HEAD_SHA"
MERGE_SHA="$(gh pr view "$PR_NUM" -R "$REPO" --json mergeCommit --jq '.mergeCommit.oid')"
if [[ -n "$ISSUE" ]]; then
  gh issue close "$ISSUE" -R "$REPO" --comment "Shipped in #$PR_NUM ($MERGE_SHA)." || true
fi
printf '| %s | %s | #%s | %s | head %s |\n' "$(date '+%Y-%m-%d %H:%M')" "$PR_ID" "$PR_NUM" "${MERGE_SHA:0:8}" "${HEAD_SHA:0:8}" >> "$LIVE/merge-log.md"

git -C "$BETA" fetch -q origin
git -C "$BETA" merge --ff-only "origin/$BASE"

git push -q origin --delete "$HEAD_BRANCH" 2>/dev/null || true
for wt in "$WT/$SLUG" "$WT/$SLUG-verify" "$WT/$SLUG-secverify"; do
  if [[ -d "$wt" ]]; then
    if [[ -z "$(git -C "$wt" status --porcelain 2>/dev/null)" ]]; then
      git -C "$BETA" worktree remove --force "$wt"
    else
      echo "left $wt in place: it has uncommitted changes" >&2
    fi
  fi
done
for br in "$HEAD_BRANCH" "$HEAD_BRANCH-verify" "$HEAD_BRANCH-secverify"; do
  git -C "$BETA" branch -D "$br" 2>/dev/null || true
done
git -C "$BETA" worktree prune
echo "INTEGRATED $PR_ID as #$PR_NUM merge $MERGE_SHA; beta at $(git -C "$BETA" rev-parse --short HEAD)"
